// =============================================================================
// BY ANY MEANS — PRISONS MODULE
// =============================================================================
// Manages county jails, state correctional facilities, police station holding
// cells, prisoner intake/processing, cell purchase, and any-to-any transfers.
// Depends on: config.js (BAM_CONFIG), index.html globals (updateMoney,
//   logCashflow, gameSeconds, setStatus, map), criminals.js (releaseSuspect,
//   suspects[])
// Provides: jails[], placeJail(), intakePrisoner(), tickJailProcessing(),
//   findNearestJail(), openJailModal(), closeJailModal(),
//   installHoldingCells(), purchaseHoldingCells(),
//   getJailSaveData(), loadJailData()
// =============================================================================

// ── STATE ─────────────────────────────────────────────────────────────────────

let jails           = [];     // all placed jail / correctional facility objects
let _activeJailId   = null;   // id of the jail whose modal is open
let _jailRenameActive = false;

// ── ID GENERATOR ──────────────────────────────────────────────────────────────

function _jailId(){ return 'jail_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }

// ── MATH HELPER ───────────────────────────────────────────────────────────────

function _jailHaversineMi(lat1, lng1, lat2, lng2){
  const R    = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2
             + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── JAIL PLACEMENT ────────────────────────────────────────────────────────────

// Places a new jail or correctional facility on the map.
// type: 'county_jail' | 'state_correctional'
function placeJail(lat, lng, name, type){
  const typeCfg = BAM_CONFIG.facilityTypes[type];
  const cost    = BAM_CONFIG.facilityPlacementCost[type];
  if(!typeCfg || cost == null){
    setStatus(`⚠️ Unknown facility type: ${type}`);
    return;
  }
  if(money < cost){
    setStatus(`⚠️ Not enough funds. ${typeCfg.label} costs $${cost.toLocaleString()}.`);
    return;
  }

  const id     = _jailId();
  const marker = _buildJailMarker(id, lat, lng, name, typeCfg);

  const jail = {
    id, name, type, lat, lng, marker,
    inService: true,
    cells:     typeCfg.startingCells,
    occupied:  0,
    prisoners: [],     // suspect IDs currently held here
  };
  jails.push(jail);

  updateMoney(-cost);
  logCashflow(-cost, `${typeCfg.label} placed: ${name}`);
  setStatus(`${typeCfg.icon} ${name} placed. -$${cost.toLocaleString()}`);
  return jail;
}

// Builds and returns the Leaflet marker for a jail/prison.
function _buildJailMarker(id, lat, lng, name, typeCfg){
  const color = typeCfg?.color || '#94a3b8';
  const icon  = L.divIcon({
    className: '',
    html: `<div style="background:${color};width:24px;height:24px;border-radius:3px;
                       border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.6);
                       display:flex;align-items:center;justify-content:center;
                       font-size:13px;line-height:1;">${typeCfg?.icon || '🔒'}</div>`,
    iconSize:   [24, 24],
    iconAnchor: [12, 12],
  });
  const marker = L.marker([lat, lng], {icon}).addTo(map);
  marker.bindTooltip(`${typeCfg?.icon || '🔒'} <b>${name}</b>`, {
    permanent: false, className: 'station-tooltip', direction: 'top'
  });
  marker.on('click', () => openJailModal(id));
  return marker;
}

// Renames a jail and refreshes its map tooltip.
function renameJail(id, newName){
  newName = newName.trim();
  if(!newName) return;
  const j = jails.find(x => x.id === id);
  if(!j) return;
  j.name = newName;
  const typeCfg = BAM_CONFIG.facilityTypes[j.type] || {};
  j.marker.unbindTooltip();
  j.marker.bindTooltip(`${typeCfg.icon || '🔒'} <b>${newName}</b>`, {
    permanent: false, className: 'station-tooltip', direction: 'top'
  });
  if(_activeJailId === id) _renderJailModal();
  setStatus(`✅ Facility renamed to "${newName}".`);
}

// ── FACILITY SEARCH ───────────────────────────────────────────────────────────

// Returns the nearest in-service jail of the given type, or null if none exist.
function findNearestJail(lat, lng, type){
  const candidates = jails.filter(j => j.inService && j.type === type);
  if(!candidates.length) return null;
  let nearest = null, nearestDist = Infinity;
  candidates.forEach(j => {
    const d = _jailHaversineMi(lat, lng, j.lat, j.lng);
    if(d < nearestDist){ nearestDist = d; nearest = j; }
  });
  return nearest;
}

// ── CELL PURCHASE ─────────────────────────────────────────────────────────────

// Purchases additional cells for a jail/correctional facility.
// count = number of cells to add (player selects via dropdown in modal).
function purchaseCells(jailId, count){
  count = parseInt(count, 10);
  if(!count || count < 1) return;
  const j       = jails.find(x => x.id === jailId);
  const typeCfg = BAM_CONFIG.facilityTypes[j?.type];
  if(!j || !typeCfg) return;
  const cost = count * typeCfg.costPerCell;
  if(money < cost){
    setStatus(`⚠️ Not enough funds. ${count} cells cost $${cost.toLocaleString()}.`);
    return;
  }
  j.cells += count;
  updateMoney(-cost);
  logCashflow(-cost, `${count} cell(s) added to ${j.name}`);
  setStatus(`✅ ${count} cell(s) added to ${j.name}. -$${cost.toLocaleString()}`);
  if(_activeJailId === jailId) _renderJailModal();
}

// ── POLICE STATION HOLDING CELLS ─────────────────────────────────────────────

// Installs the initial holding cell upgrade on a police station.
// Called from stations.js purchaseUpgrade() when upgradeKey === 'holding_cells'.
function installHoldingCells(station){
  if(station._holdingCells?.installed) return;
  station._holdingCells = {
    installed: true,
    cells:     BAM_CONFIG.holdingCellUpgrade.startingCells,
    occupied:  0,
    suspects:  [],
  };
}

// Purchases additional holding cells for a police station.
function purchaseHoldingCells(stationId, count){
  count = parseInt(count, 10);
  if(!count || count < 1) return;
  const station = stations.find(s => s.id === stationId);
  if(!station?._holdingCells?.installed){
    setStatus('⚠️ Holding cells not installed at this station.');
    return;
  }
  const cost = count * BAM_CONFIG.holdingCellUpgrade.costPerCell;
  if(money < cost){
    setStatus(`⚠️ Not enough funds. ${count} cells cost $${cost.toLocaleString()}.`);
    return;
  }
  station._holdingCells.cells += count;
  updateMoney(-cost);
  logCashflow(-cost, `${count} holding cell(s) added to ${station.name}`);
  setStatus(`✅ ${count} holding cell(s) added to ${station.name}. -$${cost.toLocaleString()}`);
}

// ── PRISONER INTAKE ───────────────────────────────────────────────────────────

// Books a suspect into a jail or correctional facility. Starts the processing timer.
// Called when a transport unit arrives at the facility.
function intakePrisoner(jailId, suspectId){
  const jail    = jails.find(x => x.id === jailId);
  const suspect = suspects.find(x => x.id === suspectId);
  if(!jail || !suspect) return false;

  if(jail.occupied >= jail.cells){
    setStatus(`⚠️ ${jail.name} is at capacity (${jail.cells}/${jail.cells} cells).`);
    return false;
  }

  const typeCfg = BAM_CONFIG.facilityTypes[jail.type];
  const minSec  = typeCfg?.processingTimeMinSec || 1200;
  const maxSec  = typeCfg?.processingTimeMaxSec || 3600;

  suspect.status                = jail.type === 'state_correctional' ? 'at_prison' : 'at_jail';
  suspect.facilityId            = jailId;
  suspect.processingStartSec    = gameSeconds;
  suspect.processingDurationSec = Math.round(minSec + Math.random() * (maxSec - minSec));
  // Felony → stays until transferred to state correctional (unless this IS state correctional)
  // Violent felony → always stays until transferred to state (same)
  const needsState = ['felony','violent_felony'].includes(suspect.chargeTier)
                   && jail.type === 'county_jail';
  suspect._needsStateTransfer = needsState;

  jail.prisoners.push(suspectId);
  jail.occupied++;

  // Pay prisoner transport revenue (triggered by the transport unit completing its route)
  // This is called from index.html when the unit arrives — transport revenue already paid there.
  if(_activeJailId === jailId) _renderJailModal();
  return true;
}

// ── PRISONER RELEASE ─────────────────────────────────────────────────────────

// Releases a prisoner from a jail/prison. Pays processing revenue, frees the cell.
function releasePrisoner(jailId, suspectId){
  const jail    = jails.find(x => x.id === jailId);
  const suspect = suspects.find(x => x.id === suspectId);
  if(!jail || !suspect) return;

  jail.prisoners = jail.prisoners.filter(id => id !== suspectId);
  jail.occupied  = Math.max(0, jail.occupied - 1);

  const location = jail.type === 'state_correctional' ? 'prison' : 'jail';
  releaseSuspect(suspect, location);
  if(_activeJailId === jailId) _renderJailModal();
}

// ── PRISONER TRANSFER ─────────────────────────────────────────────────────────

// Player-initiated transfer of a prisoner from any facility to any other.
// Removes from source, marks suspect as awaiting transport to destination.
// index.html's dispatchPrisonerTransport() routes the transport unit.
function transferPrisoner(fromFacilityId, suspectId, toFacilityId){
  const fromJail = jails.find(x => x.id === fromFacilityId);
  const toJail   = jails.find(x => x.id === toFacilityId);
  const suspect  = suspects.find(x => x.id === suspectId);
  if(!fromJail || !toJail || !suspect){
    setStatus('⚠️ Transfer failed — facility or suspect not found.');
    return;
  }
  if(toJail.occupied >= toJail.cells){
    setStatus(`⚠️ ${toJail.name} is full.`);
    return;
  }

  // Remove from source
  fromJail.prisoners = fromJail.prisoners.filter(id => id !== suspectId);
  fromJail.occupied  = Math.max(0, fromJail.occupied - 1);

  // Reset processing timer — it will be restarted at intake
  suspect.processingStartSec    = null;
  suspect.processingDurationSec = null;

  // Queue for player-dispatched transport.
  // queuePrisonerTransport() is in index.html; adds to pendingTransports[].
  if(typeof queuePrisonerTransport === 'function'){
    queuePrisonerTransport(suspect, toJail);
  } else {
    suspect.status     = 'needs_transport';
    suspect.facilityId = toFacilityId;
  }
  if(_activeJailId === fromFacilityId) _renderJailModal();
  setStatus(`${suspect.id} flagged for transfer to ${toJail.name}.`);
}

// ── TICK — JAIL / PRISON PROCESSING ──────────────────────────────────────────

// Called every game clock tick from _tickGameClock() in index.html.
// Handles processing timers for suspects held in jail or prison facilities.
function tickJailProcessing(deltaGameSec){
  let modalNeedsUpdate = false;

  suspects.forEach(suspect => {
    const atJail   = suspect.status === 'at_jail';
    const atPrison = suspect.status === 'at_prison';
    if(!atJail && !atPrison) return;
    if(!suspect.processingStartSec || !suspect.processingDurationSec) return;

    const elapsed = gameSeconds - suspect.processingStartSec;
    if(elapsed < suspect.processingDurationSec) return;

    const jail = jails.find(x => x.id === suspect.facilityId);
    if(!jail) return;

    if(suspect._needsStateTransfer && atJail){
      // Needs to move to state correctional
      const stateFacility = findNearestJail(jail.lat, jail.lng, 'state_correctional');
      if(stateFacility){
        transferPrisoner(jail.id, suspect.id, stateFacility.id);
      } else {
        // No state facility — hold longer at county (retry next tick)
        // Extend the timer by the same duration to check again later
        suspect.processingStartSec    = gameSeconds;
        suspect.processingDurationSec = BAM_CONFIG.facilityTypes.county_jail.processingTimeMaxSec;
        setStatus(`⚠️ No state facility — ${suspect.id} held at ${jail.name} pending transfer.`);
      }
    } else {
      // Release the prisoner
      releasePrisoner(jail.id, suspect.id);
    }
    modalNeedsUpdate = true;
  });

  if(modalNeedsUpdate && _activeJailId) _renderJailModal();
}

// ── MODAL ─────────────────────────────────────────────────────────────────────

// Opens the jail management modal.
function openJailModal(id){
  _activeJailId     = id;
  _jailRenameActive = false;
  let modal = document.getElementById('jail-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id        = 'jail-modal';
    modal.className = 'modal-overlay';
    modal.addEventListener('click', e => { if(e.target === modal) closeJailModal(); });
    document.body.appendChild(modal);
  }
  _renderJailModal();
  modal.classList.add('open');
}

// Closes the jail modal.
function closeJailModal(){
  _activeJailId = null;
  const modal = document.getElementById('jail-modal');
  if(modal) modal.classList.remove('open');
}

// Rebuilds the jail modal HTML.
function _renderJailModal(){
  const modal = document.getElementById('jail-modal');
  if(!modal || !_activeJailId) return;

  const j       = jails.find(x => x.id === _activeJailId);
  if(!j){ closeJailModal(); return; }

  const typeCfg = BAM_CONFIG.facilityTypes[j.type] || {};
  const pct     = j.cells ? Math.round((j.occupied / j.cells) * 100) : 0;
  const capColor = pct >= 90 ? 'var(--accent)' : pct >= 70 ? 'var(--gold)' : 'var(--green)';

  // Rename section
  const renameSection = _jailRenameActive
    ? `<div style="display:flex;gap:6px;margin-top:8px;">
         <input id="jm-rename-input" value="${_escJailHtml(j.name)}"
                style="flex:1;padding:5px 8px;font-size:.88rem;"
                onkeydown="if(event.key==='Enter') _commitJailRename('${j.id}')"/>
         <button class="btn-sm" onclick="_commitJailRename('${j.id}')">Save</button>
         <button class="btn-sm" onclick="_cancelJailRename()">Cancel</button>
       </div>`
    : '';

  // Cell grid
  const cellBlocks = [];
  for(let i = 0; i < j.cells; i++){
    const occ = i < j.occupied;
    cellBlocks.push(`<div style="width:16px;height:16px;border-radius:2px;
                                 background:${occ ? '#64748b' : 'var(--green)'};
                                 opacity:${occ ? 1 : 0.35};
                                 border:1px solid rgba(255,255,255,.15);"
                          title="${occ ? 'Occupied' : 'Empty'}"></div>`);
  }

  // Prisoner rows
  const prisonerRows = j.prisoners.length === 0
    ? '<div class="empty-msg">No prisoners currently held.</div>'
    : j.prisoners.map(susId => {
        const sus     = suspects.find(x => x.id === susId);
        if(!sus) return '';
        const tierCfg = BAM_CONFIG.chargeTiers[sus.chargeTier] || {};
        const elapsed = sus.processingStartSec ? Math.max(0, gameSeconds - sus.processingStartSec) : 0;
        const pctDone = sus.processingDurationSec
                          ? Math.min(100, Math.round((elapsed / sus.processingDurationSec) * 100))
                          : 0;
        const remaining = sus.processingDurationSec
                            ? Math.max(0, sus.processingDurationSec - elapsed)
                            : 0;

        const tierColors = {
          summary_offense: 'var(--green)',
          misdemeanor:     'var(--gold)',
          felony:          'var(--accent)',
          violent_felony:  '#ff4444',
        };
        const tierColor = tierColors[sus.chargeTier] || 'var(--muted)';
        const barColor  = pctDone >= 90 ? 'var(--green)' : pctDone >= 50 ? 'var(--gold)' : 'var(--muted)';

        // Transfer options — build a select of other available facilities
        const otherFacilities = jails.filter(x => x.id !== j.id && x.inService && x.occupied < x.cells);
        const transferOptions = otherFacilities.length
          ? `<select id="xfer-dest-${susId}" style="font-size:.72rem;padding:3px 6px;">
               ${otherFacilities.map(f =>
                 `<option value="${f.id}">${_escJailHtml(f.name)}</option>`
               ).join('')}
             </select>
             <button class="btn-sm" onclick="_doTransfer('${j.id}','${susId}')">Transfer</button>`
          : '<span style="font-size:.8rem;color:var(--muted);">No facilities available</span>';

        return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:2px;
                            padding:9px 12px;margin-bottom:6px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
            <div>
              <span style="font-size:.78rem;font-weight:700;color:var(--text);">${_escJailHtml(susId.slice(-8))}</span>
              <span style="margin-left:8px;font-size:.72rem;border:1px solid ${tierColor};
                           color:${tierColor};border-radius:10px;padding:1px 6px;text-transform:uppercase;">
                ${tierCfg.label || sus.chargeTier}
              </span>
            </div>
            <div style="font-size:.8rem;color:var(--muted);">
              ${remaining > 0 ? formatETA(remaining) + ' left' : '⏳ processing'}
            </div>
          </div>
          <!-- Processing bar -->
          <div class="res-bar-track" style="margin-bottom:8px;">
            <div class="res-bar-fill" style="width:${pctDone}%;background:${barColor};transition:width 1s linear;"></div>
          </div>
          <!-- Transfer row -->
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-size:.8rem;color:var(--muted);">Transfer to:</span>
            ${transferOptions}
          </div>
        </div>`;
      }).join('');

  // Purchase cells section
  const cellCountOptions = [1,2,5,10].map(n =>
    `<option value="${n}">${n} cell${n>1?'s':''} — $${(n * typeCfg.costPerCell).toLocaleString()}</option>`
  ).join('');

  modal.innerHTML = `
    <div class="modal-box gold-top" style="width:620px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;">
      <div class="modal-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="flex:1;min-width:0;">
          <h2 class="gold" style="cursor:pointer;" onclick="_toggleJailRename('${j.id}')"
              title="Click to rename">${typeCfg.icon || '🔒'} ${_escJailHtml(j.name)}</h2>
          <div class="modal-sub">
            <span style="color:${capColor};">${j.occupied}/${j.cells} cells</span>
            &nbsp;·&nbsp;
            <span style="color:${j.inService ? 'var(--green)' : 'var(--muted)'};">
              ${j.inService ? '● IN SERVICE' : '● OUT OF SERVICE'}
            </span>
          </div>
          ${renameSection}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn-sm" onclick="_toggleJailService('${j.id}')">
            ${j.inService ? 'OOS' : 'In Svc'}
          </button>
          <button class="btn-sm danger" onclick="closeJailModal()">✕</button>
        </div>
      </div>

      <div class="modal-body" style="flex:1;overflow-y:auto;padding:14px 16px;">
        <!-- Cell grid -->
        <div class="section-title">Cells</div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:14px;">
          ${cellBlocks.join('')}
        </div>

        <!-- Prisoners -->
        <div class="section-title">Prisoners</div>
        ${prisonerRows}

        <!-- Purchase cells -->
        <div class="section-title" style="margin-top:16px;">Add Cells</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <select id="jm-cell-count" style="font-size:.82rem;padding:5px 8px;">
            ${cellCountOptions}
            <option value="custom">Custom…</option>
          </select>
          <button class="btn-sm"
                  onclick="_buyJailCells('${j.id}')">
            Purchase
          </button>
          <span style="font-size:.8rem;color:var(--muted);">
            $${typeCfg.costPerCell.toLocaleString()} per cell
          </span>
        </div>
        <div id="jm-custom-cell-row" style="display:none;margin-top:6px;">
          <input id="jm-custom-count" type="number" min="1" placeholder="Number of cells"
                 style="width:150px;padding:5px 8px;font-size:.82rem;"/>
          <button class="btn-sm" style="margin-left:6px;"
                  onclick="_buyJailCellsCustom('${j.id}')">Buy</button>
        </div>
      </div>
    </div>`;

  // Wire up the custom cell dropdown toggle
  setTimeout(() => {
    const sel = document.getElementById('jm-cell-count');
    if(sel) sel.addEventListener('change', () => {
      const row = document.getElementById('jm-custom-cell-row');
      if(row) row.style.display = sel.value === 'custom' ? 'flex' : 'none';
    });
  }, 0);
}

// ── JAIL MODAL HELPERS ────────────────────────────────────────────────────────

function _buyJailCells(jailId){
  const sel = document.getElementById('jm-cell-count');
  if(!sel || sel.value === 'custom') return;
  purchaseCells(jailId, parseInt(sel.value, 10));
}

function _buyJailCellsCustom(jailId){
  const input = document.getElementById('jm-custom-count');
  if(!input || !input.value) return;
  purchaseCells(jailId, parseInt(input.value, 10));
}

function _doTransfer(fromJailId, suspectId){
  const sel      = document.getElementById(`xfer-dest-${suspectId}`);
  const toJailId = sel?.value;
  if(!toJailId){ setStatus('⚠️ Select a destination facility first.'); return; }
  const fromJail = jails.find(x => x.id === fromJailId);
  const toJail   = jails.find(x => x.id === toJailId);
  const suspect  = suspects.find(x => x.id === suspectId);
  if(!fromJail || !toJail || !suspect){ setStatus('⚠️ Transfer failed.'); return; }
  if(toJail.occupied >= toJail.cells){ setStatus(`⚠️ ${toJail.name} is full.`); return; }

  // Remove from source facility immediately
  fromJail.prisoners = fromJail.prisoners.filter(id => id !== suspectId);
  fromJail.occupied  = Math.max(0, fromJail.occupied - 1);
  suspect.facilityId = toJailId;
  suspect.processingStartSec    = null;
  suspect.processingDurationSec = null;

  // Open unit-selection dispatch modal immediately (player-initiated transfer)
  if(typeof _openTransportDispatchModal === 'function'){
    _openTransportDispatchModal(suspect, toJail);
  } else {
    // Fallback: queue if modal function not available
    if(typeof queuePrisonerTransport === 'function') queuePrisonerTransport(suspect, toJail);
  }
  if(_activeJailId === fromJailId) _renderJailModal();
}

function _toggleJailService(id){
  const j = jails.find(x => x.id === id);
  if(!j) return;
  j.inService = !j.inService;
  j.marker.setOpacity(j.inService ? 1 : 0.4);
  _renderJailModal();
  setStatus(`${j.name} — ${j.inService ? 'IN SERVICE' : 'OUT OF SERVICE'}`);
}

function _toggleJailRename(id){
  _jailRenameActive = !_jailRenameActive;
  _renderJailModal();
  if(_jailRenameActive){
    setTimeout(() => document.getElementById('jm-rename-input')?.focus(), 50);
  }
}

function _commitJailRename(id){
  const input = document.getElementById('jm-rename-input');
  if(input) renameJail(id, input.value);
  _jailRenameActive = false;
}

function _cancelJailRename(){
  _jailRenameActive = false;
  _renderJailModal();
}

// ── HTML ESCAPE ───────────────────────────────────────────────────────────────

function _escJailHtml(str){
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── SAVE / LOAD ───────────────────────────────────────────────────────────────

// Returns serializable jail data for the save file.
// Prisoner processing state is preserved so timers resume on load.
function getJailSaveData(){
  return jails.map(j => ({
    id:        j.id,
    name:      j.name,
    type:      j.type,
    lat:       j.lat,
    lng:       j.lng,
    inService: j.inService,
    cells:     j.cells,
    occupied:  j.occupied,
    prisoners: [...j.prisoners],
  }));
}

// Rebuilds jails from saved data and reattaches map markers.
function loadJailData(savedJails){
  jails = [];
  if(!savedJails?.length) return;
  savedJails.forEach(data => {
    const typeCfg = BAM_CONFIG.facilityTypes[data.type] || {};
    const marker  = _buildJailMarker(data.id, data.lat, data.lng, data.name, typeCfg);
    if(!data.inService) marker.setOpacity(0.4);
    jails.push({
      id:        data.id,
      name:      data.name,
      type:      data.type,
      lat:       data.lat,
      lng:       data.lng,
      marker,
      inService: data.inService !== false,
      cells:     data.cells,
      occupied:  data.occupied || 0,
      prisoners: data.prisoners || [],
    });
  });
}
