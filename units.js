// =============================================================================
// BY ANY MEANS — UNITS MODULE (Phase 5A)
// =============================================================================
// Owns all unit-centric display logic that spans across stations:
//   • Display-name helpers (DC prefix resolution + formatting)
//   • Unit List window (Operations Modal → Units tab)
//   • Unit Details modal (opens from anywhere a unit is shown)
// Depends on: config.js, stations.js (stations[]), esn.js (dispatchCenters[], esns[])
// =============================================================================

// ── STATE ────────────────────────────────────────────────────────────────────
let _activeUnitDetailsId = null;   // unit id currently open in details modal
let _renameUnitConfirm   = null;   // unused — reserved for two-click rename
let _unitListSort        = 'station';   // station | type | status | callsign
let _unitListFilterType  = '';     // '' = all types
let _unitListFilterStatus= '';     // '' = all statuses
let _unitListFilterStation = '';   // Phase 5D bug-fix — '' = all stations
let _unitListSearch      = '';     // free-text search

// =============================================================================
// PREFIX / DC RESOLUTION HELPERS
// =============================================================================

// Returns all DCs whose assigned ESNs include this station as a coverage assignment.
// Used both for prefix resolution AND for surfacing multi-DC conflicts in the UI.
function getCandidateDCs(stationId){
  if(typeof dispatchCenters === 'undefined' || !dispatchCenters.length) return [];
  return dispatchCenters.filter(dc =>
    (dc.assignedESNs || []).some(eid => {
      const esn = (esns || []).find(e => e.id === eid);
      if(!esn) return false;
      // A station "belongs" to an ESN if it's assigned in any service slot (fire/ems/police)
      const a = esn.assignments || {};
      return (a.fire   || []).includes(stationId)
          || (a.ems    || []).includes(stationId)
          || (a.police || []).includes(stationId);
    })
  );
}

// Returns the DC that should drive a station's unit prefix.
// Rule: if station.preferredDCId is set and that DC is in the candidate set, use it.
// Otherwise pick the first candidate DC. Returns null when no DC applies.
function getStationDC(stationOrId){
  const station = typeof stationOrId === 'string'
    ? stations.find(s => s.id === stationOrId)
    : stationOrId;
  if(!station) return null;
  const candidates = getCandidateDCs(station.id);
  if(!candidates.length) return null;
  if(station.preferredDCId){
    const pref = candidates.find(dc => dc.id === station.preferredDCId);
    if(pref) return pref;
  }
  return candidates[0];
}

// True when this station could draw a prefix from multiple DCs AND has no preferredDCId set.
// Surfaces a warning in the Manage Station modal and Unit List so the player can resolve.
function hasStationDCConflict(stationOrId){
  const station = typeof stationOrId === 'string'
    ? stations.find(s => s.id === stationOrId)
    : stationOrId;
  if(!station) return false;
  const candidates = getCandidateDCs(station.id);
  if(candidates.length <= 1) return false;
  // If the player has actively chosen one of the candidates, it's no longer a "conflict"
  if(station.preferredDCId && candidates.find(dc => dc.id === station.preferredDCId)) return false;
  return true;
}

// Applies a DC's prefix to a raw callsign using its prefix format.
// format: 'bracket' → "[SUSQ] E-52", 'dash' → "SUSQ-E-52", 'space' → "SUSQ E-52"
function formatPrefixedCallsign(prefix, format, callsign){
  if(!prefix) return callsign;
  switch(format){
    case 'dash':    return `${prefix}-${callsign}`;
    case 'space':   return `${prefix} ${callsign}`;
    case 'bracket':
    default:        return `[${prefix}] ${callsign}`;
  }
}

// PRIMARY DISPLAY HELPER — returns the prefixed callsign for a unit if its station's
// resolved DC has a non-empty unitPrefix. Otherwise returns the raw callsign.
// Accepts either a unit object alone (it'll look up the station) or {unit, station}.
function getUnitDisplayName(unit, stationHint){
  if(!unit) return '';
  let station = stationHint;
  if(!station){
    // Walk stations once — there's no reverse index, but this is cheap at game scale
    for(const s of (stations || [])){
      if(s.units?.some(u => u.id === unit.id)){ station = s; break; }
    }
  }
  if(!station) return unit.name;
  const dc = getStationDC(station);
  if(!dc || !dc.unitPrefix) return unit.name;
  return formatPrefixedCallsign(dc.unitPrefix, dc.prefixFormat || 'bracket', unit.name);
}

// Convenience: takes a unit id, returns the prefixed display name.
function getUnitDisplayNameById(unitId){
  for(const s of (stations || [])){
    const u = s.units?.find(u => u.id === unitId);
    if(u) return getUnitDisplayName(u, s);
  }
  return '';
}

// Refreshes all moving units' map dot icons so prefix changes appear on AVL labels.
// Called after DC prefix edits or station DC-override changes.
function refreshAllUnitMapLabels(){
  if(typeof getAllUnits !== 'function') return;
  getAllUnits().forEach(({unit}) => {
    if(!unit.animMarker) return;
    const dotColor = BAM_CONFIG.unitTypes[unit.typeKey]?.color || '#fff';
    if(typeof _buildUnitDotIcon === 'function'){
      unit.animMarker.setIcon(_buildUnitDotIcon(unit, dotColor));
    }
  });
}

// =============================================================================
// UNIT LIST — Operations Modal → Units tab
// =============================================================================

// Returns a flat list of {station, unit, dc} for rendering. Applies filters/sort/search.
function _getUnitListRows(){
  if(typeof getAllUnits !== 'function') return [];
  let rows = getAllUnits().map(({station, unit}) => ({
    station, unit,
    dc: getStationDC(station),
    displayName: getUnitDisplayName(unit, station),
    typeLabel: BAM_CONFIG.unitTypes[unit.typeKey]?.label || unit.typeKey,
    statusLabel: _humanStatus(unit),
  }));

  // Filters
  if(_unitListFilterStation){
    rows = rows.filter(r => r.station.id === _unitListFilterStation);
  }
  if(_unitListFilterType){
    rows = rows.filter(r => r.unit.typeKey === _unitListFilterType);
  }
  if(_unitListFilterStatus){
    rows = rows.filter(r => _statusKey(r.unit) === _unitListFilterStatus);
  }
  if(_unitListSearch){
    const q = _unitListSearch.toLowerCase();
    rows = rows.filter(r =>
      r.displayName.toLowerCase().includes(q)
      || r.station.name.toLowerCase().includes(q)
      || r.typeLabel.toLowerCase().includes(q)
      || (r.dc?.name || '').toLowerCase().includes(q)
    );
  }

  // Sort
  const cmp = (a, b) => {
    switch(_unitListSort){
      case 'type':     return a.typeLabel.localeCompare(b.typeLabel) || a.station.name.localeCompare(b.station.name);
      case 'status':   return a.statusLabel.localeCompare(b.statusLabel) || a.displayName.localeCompare(b.displayName);
      case 'callsign': return a.displayName.localeCompare(b.displayName);
      case 'dc': {
        // Group by DC name; units with no DC sink to the bottom.
        // Within a DC: station name, then display callsign.
        const aHas = a.dc ? 0 : 1, bHas = b.dc ? 0 : 1;
        if(aHas !== bHas) return aHas - bHas;
        const aName = a.dc?.name || '';
        const bName = b.dc?.name || '';
        return aName.localeCompare(bName)
            || a.station.name.localeCompare(b.station.name)
            || a.displayName.localeCompare(b.displayName);
      }
      case 'station':
      default:         return a.station.name.localeCompare(b.station.name) || a.displayName.localeCompare(b.displayName);
    }
  };
  rows.sort(cmp);
  return rows;
}

// Combined status key (collapses inService=false into 'oos').
function _statusKey(unit){
  if(unit.inService === false) return 'oos';
  return unit.status || 'available';
}

// Human-friendly status label for the Units list.
function _humanStatus(unit){
  if(unit.inService === false) return 'OUT OF SERVICE';
  switch(unit.status){
    case 'available':      return 'Available';
    case 'awaiting_crew':  return 'Crew Assembling';
    case 'dispatched':     return 'Enroute';
    case 'on_scene':       return 'On Scene';
    case 'transporting':   return 'Transporting';
    case 'offloading':     return 'Offloading';
    case 'returning':      return 'Returning';
    default:               return (unit.status || 'available');
  }
}

// Renders the Units tab in the Operations Modal.
function renderUnitList(){
  const el = document.getElementById('unit-list-scroll');
  if(!el) return;

  // Populate the type filter dropdown if it hasn't been already
  const typeSel = document.getElementById('unit-list-filter-type');
  if(typeSel && !typeSel.dataset.populated){
    typeSel.innerHTML = '<option value="">All types</option>'
      + Object.entries(BAM_CONFIG.unitTypes)
          .map(([k,u]) => `<option value="${k}">${u.label}</option>`).join('');
    typeSel.dataset.populated = '1';
  }
  const statusSel = document.getElementById('unit-list-filter-status');
  if(statusSel && !statusSel.dataset.populated){
    statusSel.innerHTML = `<option value="">All statuses</option>
      <option value="available">Available</option>
      <option value="dispatched">Enroute</option>
      <option value="on_scene">On Scene</option>
      <option value="transporting">Transporting</option>
      <option value="offloading">Offloading</option>
      <option value="returning">Returning</option>
      <option value="oos">Out of Service</option>`;
    statusSel.dataset.populated = '1';
  }
  // Phase 5D bug-fix — station filter, rebuilt every render so newly-placed
  // stations show up immediately (mirrors the personnel-tab dropdown fix).
  const stSel = document.getElementById('unit-list-filter-station');
  if(stSel){
    const desired = _unitListFilterStation || stSel.value || '';
    stSel.innerHTML = '<option value="">All stations</option>'
      + (typeof stations !== 'undefined' ? stations : [])
          .map(s => `<option value="${s.id}">${_escUnitHtml(s.name)}</option>`).join('');
    if(desired && (typeof stations !== 'undefined' ? stations : []).some(s => s.id === desired)){
      stSel.value = desired;
    }
  }

  const rows = _getUnitListRows();
  if(!rows.length){
    el.innerHTML = '<div class="empty-msg">No units match the current filters.</div>';
    return;
  }

  // Color-by-status pill for the right side of each row
  const statusColor = (u) => {
    if(u.inService === false) return 'var(--accent)';
    return {
      available:    'var(--green)',
      dispatched:   avlColors?.enroute      || 'var(--green)',
      on_scene:     avlColors?.on_scene     || '#3b82f6',
      transporting: avlColors?.transporting || '#f97316',
      offloading:   avlColors?.offloading   || '#a855f7',
      returning:    avlColors?.returning    || 'var(--gold)',
    }[u.status] || 'var(--muted)';
  };

  el.innerHTML = rows.map(r => {
    const u = r.unit;
    const ut = BAM_CONFIG.unitTypes[u.typeKey] || {};
    const conflict = hasStationDCConflict(r.station);
    const dcText = r.dc
      ? `${r.dc.unitPrefix ? '<span style="color:var(--gold);">' + _escUnitHtml(r.dc.unitPrefix) + '</span> · ' : ''}${_escUnitHtml(r.dc.name)}`
      : '<span style="color:var(--muted);">— no DC</span>';
    return `<div class="scard unit-list-row" style="cursor:pointer;"
              onclick="openUnitDetails('${u.id}')"
              title="Click for unit details">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="min-width:0;flex:1;">
          <div class="sn" style="display:flex;align-items:center;gap:6px;">
            <span>${ut.icon || ''} ${_escUnitHtml(r.displayName)}</span>
            ${conflict ? '<span class="oos-badge" style="background:var(--gold);color:#000;" title="Station ESNs are covered by multiple DCs — set a preferred DC in Manage Station">⚠ DC conflict</span>' : ''}
          </div>
          <div class="st" style="font-size:.78rem;">
            ${_escUnitHtml(r.typeLabel)} · ${_escUnitHtml(r.station.name)} · ${dcText}
          </div>
        </div>
        <span style="font-size:.72rem;font-weight:700;color:${statusColor(u)};white-space:nowrap;">
          ${r.statusLabel}
        </span>
      </div>
    </div>`;
  }).join('');
}

// Handlers for filter/sort/search inputs in the Units tab.
function _unitListSetSort(v){    _unitListSort           = v; renderUnitList(); }
function _unitListSetType(v){    _unitListFilterType     = v; renderUnitList(); }
function _unitListSetStatus(v){  _unitListFilterStatus   = v; renderUnitList(); }
function _unitListSetStation(v){ _unitListFilterStation  = v; renderUnitList(); }
function _unitListSetSearch(v){  _unitListSearch         = v; renderUnitList(); }

// =============================================================================
// UNIT DETAILS MODAL
// =============================================================================

// Opens the Unit Details modal for the given unit id. Builds the modal on first use.
function openUnitDetails(unitId){
  let modal = document.getElementById('unit-details-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'unit-details-modal';
    modal.className = 'modal-overlay';
    modal.addEventListener('click', e => { if(e.target === modal) closeUnitDetails(); });
    document.body.appendChild(modal);
  }
  _activeUnitDetailsId = unitId;
  _renderUnitDetails();
  modal.classList.add('open');
}

function closeUnitDetails(){
  _activeUnitDetailsId = null;
  const modal = document.getElementById('unit-details-modal');
  if(modal) modal.classList.remove('open');
}

// Looks up the active unit and renders the modal body.
function _renderUnitDetails(){
  const modal = document.getElementById('unit-details-modal');
  if(!modal || !_activeUnitDetailsId) return;

  let station = null, unit = null;
  for(const s of (stations || [])){
    const u = s.units?.find(u => u.id === _activeUnitDetailsId);
    if(u){ station = s; unit = u; break; }
  }
  if(!unit || !station){ closeUnitDetails(); return; }

  const ut       = BAM_CONFIG.unitTypes[unit.typeKey] || {};
  const dc       = getStationDC(station);
  const dispName = getUnitDisplayName(unit, station);
  const inc      = (typeof incidents !== 'undefined')
                    ? incidents.find(i => i.id === unit.incidentId) : null;

  // Status line — same lookup the map tooltip uses
  const statusText = (typeof _buildUnitTooltipText === 'function')
    ? _buildUnitTooltipText(unit) : (_humanStatus(unit));

  // ETA block: depends on status
  const etaRows = [];
  if(unit.status === 'dispatched' && unit._enrouteRemSec > 0){
    etaRows.push(['ETA to scene', formatETA(unit._enrouteRemSec)]);
  }
  if(unit.status === 'transporting' && unit._transportRemSec > 0){
    const destId = unit.transportDestination?.id;
    const destType = unit.transportDestination?.type;
    const destName = destId
      ? (destType === 'jail'    ? (jails.find(j => j.id === destId)?.name || 'jail')
        : destType === 'prison' ? (jails.find(j => j.id === destId)?.name || 'prison')
        : (hospitals.find(h => h.id === destId)?.name || 'facility'))
      : 'facility';
    etaRows.push(['ETA to ' + destName, formatETA(unit._transportRemSec)]);
  }
  if(unit.status === 'returning' && unit._returnRemSec > 0){
    etaRows.push(['ETA to station', formatETA(unit._returnRemSec)]);
  }
  if(unit.status === 'offloading' && unit.offloadEndSec){
    const remSec = Math.max(0, unit.offloadEndSec - gameSeconds);
    etaRows.push(['Offload complete in', formatETA(remSec)]);
  }

  // Capability / loadout snapshot
  const tags = (ut.tags || []).join(', ') || '—';
  const cap  = ut.maxTransportCapacity || 0;
  const loadCount = (unit.transportPatients?.length || unit.transportSuspects?.length || 0);
  const loadText  = cap > 0 ? `${loadCount} / ${cap} loaded` : 'No transport capacity';

  const conflict = hasStationDCConflict(station);

  modal.innerHTML = `
    <div class="modal-box gold-top" style="width:520px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;">
      <div class="modal-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <h2 class="gold">${ut.icon || ''} ${_escUnitHtml(dispName)}</h2>
          <div class="modal-sub">${_escUnitHtml(ut.label || unit.typeKey)} · ${_escUnitHtml(station.name)}</div>
        </div>
        <button class="btn-sm danger" onclick="closeUnitDetails()">✕</button>
      </div>
      <div class="modal-body" id="unit-details-body" style="flex:1;overflow-y:auto;padding:14px 16px;">

        <div class="section-title">Status</div>
        <div style="font-size:.85rem;margin-bottom:6px;">${_escUnitHtml(statusText)}</div>
        ${etaRows.length ? etaRows.map(([k,v]) =>
          `<div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--muted);">
             <span>${_escUnitHtml(k)}</span><span style="font-family:var(--mono);color:var(--text);">${_escUnitHtml(v)}</span>
           </div>`).join('') : ''}
        ${inc ? `<div style="font-size:.78rem;color:var(--muted);margin-top:6px;">
                   On call: <span style="color:var(--text);">${_escUnitHtml(inc.label)}</span>
                 </div>` : ''}

        <div class="section-title" style="margin-top:14px;">Callsign</div>
        <div style="display:flex;gap:8px;">
          <input type="text" id="udm-rename-input" value="${_escUnitHtml(unit.name)}" style="flex:1;"/>
          <button class="btn-sm" onclick="_unitDetailsRename()">Save</button>
        </div>
        <div style="font-size:.74rem;color:var(--muted);margin-top:4px;">
          Display: <span style="color:var(--text);">${_escUnitHtml(dispName)}</span>
          ${dc && dc.unitPrefix
            ? `<span> — prefix from <span style="color:var(--gold);">${_escUnitHtml(dc.name)}</span></span>`
            : '<span> — no DC prefix</span>'}
        </div>

        <div class="section-title" style="margin-top:14px;">Type &amp; Capability</div>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:4px 10px;font-size:.82rem;">
          <div style="color:var(--muted);">Type</div><div>${_escUnitHtml(ut.label || unit.typeKey)}</div>
          <div style="color:var(--muted);">Tags</div><div>${_escUnitHtml(tags)}</div>
          <div style="color:var(--muted);">Provider</div><div>${_escUnitHtml(ut.providerLevel ? ut.providerLevel.toUpperCase() : '—')}</div>
          <div style="color:var(--muted);">Transport</div><div>${_escUnitHtml(loadText)}</div>
        </div>

        ${_renderUnitSeatingSection(unit)}

        ${typeof renderUnitCrewRosterHTML === 'function' ? renderUnitCrewRosterHTML(unit.id) : ''}

        <div class="section-title" style="margin-top:14px;">Dispatch Center</div>
        <div style="font-size:.82rem;">
          ${dc
            ? `📡 ${_escUnitHtml(dc.name)}
               ${dc.unitPrefix
                 ? ` · prefix <span style="color:var(--gold);font-family:var(--mono);">${_escUnitHtml(dc.unitPrefix)}</span>`
                 : ' · <span style="color:var(--muted);">no prefix set</span>'}`
            : '<span style="color:var(--muted);">No DC covers this station\'s ESNs.</span>'}
          ${conflict ? `<div style="margin-top:6px;color:var(--gold);font-size:.78rem;">
              ⚠ This station's ESNs are covered by multiple DCs. Pick a preferred DC from Manage Station.
            </div>` : ''}
        </div>

        ${unit.status === 'awaiting_crew' ? _renderAwaitingCrewBlock(unit, station) : ''}

        <div class="section-title" style="margin-top:14px;">Actions</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-sm" onclick="_unitDetailsToggleService()">
            ${unit.inService === false ? 'Return to Service' : 'Place Out of Service'}
          </button>
          <button class="btn-sm" onclick="_unitDetailsOpenStation()">Open Manage Station</button>
          ${unit.animMarker ? `<button class="btn-sm" onclick="_unitDetailsFocusOnMap()">Focus on Map</button>` : ''}
        </div>
      </div>
    </div>`;
}

// Saves a renamed callsign for the active Unit Details unit.
function _unitDetailsRename(){
  const input = document.getElementById('udm-rename-input');
  if(!input || !_activeUnitDetailsId) return;
  const newName = input.value.trim();
  if(!newName){ setStatus('⚠️ Enter a unit callsign.'); return; }
  let station = null, unit = null;
  for(const s of (stations || [])){
    const u = s.units?.find(u => u.id === _activeUnitDetailsId);
    if(u){ station = s; unit = u; break; }
  }
  if(!unit) return;
  unit.name = newName;
  // Update map label/tooltip if unit is animating
  if(unit.animMarker){
    const dotColor = BAM_CONFIG.unitTypes[unit.typeKey]?.color || '#fff';
    if(typeof _buildUnitDotIcon === 'function')   unit.animMarker.setIcon(_buildUnitDotIcon(unit, dotColor));
    if(typeof _buildUnitTooltipText === 'function') unit.animMarker.setTooltipContent(_buildUnitTooltipText(unit));
  }
  if(typeof renderStationList === 'function') renderStationList();
  renderUnitList();
  _renderUnitDetails();
  setStatus(`Unit renamed to "${getUnitDisplayName(unit, station)}".`);
}

// Toggles in/out of service for the active unit, then refreshes views.
function _unitDetailsToggleService(){
  let station = null, unit = null;
  for(const s of (stations || [])){
    const u = s.units?.find(u => u.id === _activeUnitDetailsId);
    if(u){ station = s; unit = u; break; }
  }
  if(!unit) return;
  unit.inService = unit.inService === false ? true : false;
  if(typeof renderStationList === 'function') renderStationList();
  renderUnitList();
  _renderUnitDetails();
  setStatus(`${getUnitDisplayName(unit, station)} — ${unit.inService ? 'IN SERVICE' : 'OUT OF SERVICE'}`);
}

// Jumps to the Manage Station modal for the unit's station.
function _unitDetailsOpenStation(){
  let station = null;
  for(const s of (stations || [])){
    if(s.units?.some(u => u.id === _activeUnitDetailsId)){ station = s; break; }
  }
  if(!station) return;
  closeUnitDetails();
  if(typeof openManageStation === 'function') openManageStation(station.id);
}

// Pans/zooms the map to a unit currently animating.
function _unitDetailsFocusOnMap(){
  let unit = null;
  for(const s of (stations || [])){
    const u = s.units?.find(u => u.id === _activeUnitDetailsId);
    if(u){ unit = u; break; }
  }
  if(!unit?.animMarker) return;
  map.setView(unit.animMarker.getLatLng(), 14);
}

// Called from the game tick so ETA rows stay live while the modal is open.
function _updateUnitDetailsModal(){
  if(!_activeUnitDetailsId) return;
  const modal = document.getElementById('unit-details-modal');
  if(!modal?.classList.contains('open')) return;
  // Cheap: full re-render. Modal is short, no dropdown state to preserve in the body.
  // Avoid clobbering the rename input mid-edit.
  const renameEl = document.getElementById('udm-rename-input');
  if(renameEl && document.activeElement === renameEl) return;
  _renderUnitDetails();
}

// =============================================================================
// HTML escape helper (scoped to this file to avoid clobbering existing helpers)
// =============================================================================
function _escUnitHtml(str){
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// =============================================================================
// SEATING LAYOUT  (informational — Unit Details modal)
// =============================================================================
// Reads the seating layout from BAM_CONFIG.unitTypes[typeKey].seats and the
// dispatch crew minimums from crewDefaults. Read-only for now; the same data
// drives the Crew-Select Dispatch picker, and will eventually host assigned-
// seat persistence and per-seat equipment loadouts.
function _renderUnitSeatingSection(unit){
  if(!unit) return '';
  const layout = (typeof getSeatingLayoutForUnit === 'function')
    ? getSeatingLayoutForUnit(unit) : null;
  if(!layout || !Array.isArray(layout.seats) || !layout.seats.length) return '';

  const crewCfg    = BAM_CONFIG.crewDefaults?.[unit.typeKey] || {};
  const certDefs   = BAM_CONFIG.certifications || {};
  const driverCert = crewCfg.driverCert || null;

  // Format min/ideal crew as cert chips so the player can compare at a glance.
  const fmtReq = (reqMap) => {
    const entries = Object.entries(reqMap || {});
    if(!entries.length) return '<span style="color:var(--muted);">none</span>';
    return entries.map(([cert, n]) => {
      const lbl = certDefs[cert]?.label || cert;
      return `<span class="cs-cert-chip">${n}× ${_escUnitHtml(lbl)}</span>`;
    }).join('');
  };

  const seatsHtml = layout.seats.map((seat, idx) => {
    const isDriverSeat = !!seat.isDriver;
    const driverTag = isDriverSeat
      ? `<span style="color:var(--gold);font-size:.65rem;letter-spacing:1px;margin-left:6px;">★ DRIVER</span>`
      : '';
    const driverCertChip = (isDriverSeat && driverCert)
      ? `<span class="cs-cert-chip driver">${_escUnitHtml(certDefs[driverCert]?.label || driverCert)}</span>`
      : '';
    const prefChips = (seat.preferredCerts || []).map(c =>
      `<span class="cs-cert-chip">${_escUnitHtml(certDefs[c]?.label || c)}</span>`).join('');
    const noPrefHint = (!driverCertChip && !prefChips)
      ? '<span style="color:var(--muted);font-size:.72rem;font-style:italic;">No cert preference</span>'
      : '';
    return `<div class="cs-seat-row${isDriverSeat ? ' driver' : ''}" style="cursor:default;">
      <div style="flex:1;min-width:0;">
        <div class="cs-seat-label">
          ${idx + 1}. ${_escUnitHtml(seat.label)}${driverTag}
        </div>
        <div style="margin-top:3px;">${driverCertChip}${prefChips}${noPrefHint}</div>
      </div>
    </div>`;
  }).join('');

  // "Crew Standards" sub-card surfaces min/ideal alongside seats. The two
  // concepts are decoupled (seats = capacity; min/ideal = dispatch gate) but
  // the player thinks about them together, so render them side-by-side.
  return `<div class="section-title" style="margin-top:14px;">Seating Layout (${layout.seats.length} seats)</div>
    ${seatsHtml}
    <div style="margin-top:10px;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:3px;">
      <div style="font-size:.7rem;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">Dispatch Crew Standards</div>
      <div style="display:grid;grid-template-columns:90px 1fr;gap:6px 10px;font-size:.78rem;align-items:start;">
        <div style="color:var(--muted);">Driver</div>
        <div>${driverCert
          ? `<span class="cs-cert-chip driver">${_escUnitHtml(certDefs[driverCert]?.label || driverCert)}</span>`
          : '<span style="color:var(--muted);">No driver gate</span>'}</div>
        <div style="color:var(--muted);">Min crew</div>
        <div>${fmtReq(crewCfg.min)}</div>
        <div style="color:var(--muted);">Ideal crew</div>
        <div>${fmtReq(crewCfg.ideal)}</div>
      </div>
    </div>`;
}

// =============================================================================
// AWAITING-CREW BLOCK  (Phase 5 bugfix)
// =============================================================================
// Shown in the Unit Details modal when the apparatus is staged at-station
// waiting on volunteer responders to assemble. Surfaces:
//   • progress (arrived / total)
//   • a per-responder mini-list with their current state
//   • a "Send Anyway (driver only)" button that calls
//     forceVolunteerCrewDeparture. Disabled when no driver-cert-qualified
//     person is currently at the station.
function _renderAwaitingCrewBlock(unit, station){
  const responders = unit._awaitingResponders || [];
  const total = unit._awaitingCrewCount || responders.length || 0;
  // Volunteers who have made it to the station have status 'busy'.
  const arrived = responders.filter(p => p.status === 'busy').length;

  // Determine driver-gate status. We need at least one person at the station
  // with the apparatus's driver cert.
  const driverCert = BAM_CONFIG.crewDefaults?.[unit.typeKey]?.driverCert;
  let driverOk = true, driverLabel = '';
  if(driverCert){
    driverLabel = BAM_CONFIG.certifications?.[driverCert]?.label || driverCert;
    const STATION_RADIUS_KM = 0.05;
    const atStation = (typeof personnel !== 'undefined' ? personnel : []).filter(p => {
      if(p.stationId !== station.id) return false;
      if(typeof personHasCert !== 'function' || !personHasCert(p, driverCert)) return false;
      if(p.type !== 'volunteer') return (typeof isOnDutyNow === 'function') ? isOnDutyNow(p) : true;
      if(p.status !== 'busy') return false;
      const loc = p.currentLocation;
      if(!loc) return false;
      const dx = (typeof haversineKm === 'function')
        ? haversineKm(loc.lat, loc.lng, station.lat, station.lng)
        : 999;
      return dx <= STATION_RADIUS_KM;
    });
    driverOk = atStation.length > 0;
  }

  // Phase 5 bugfix v2 — show each responder's certs as small chips so the
  // player can read crew composition at a glance. Sorted by cert tier so the
  // most senior cert shows first.
  const certDefs = BAM_CONFIG.certifications || {};
  const _certPriority = (cId) => {
    // Higher number = displayed first. Keep this lightweight; sorting is per row.
    const order = { ccp:9, phrn:9, paramedic:8, aemt:7, emt:6, emr:5,
                    fire_officer_2:9, fire_officer_1:8, ff2:7, ff1:6,
                    pump_ops_1:5, evoc_large:4, evoc_small:3,
                    patrol_supervisor:9, patrol_officer:8, fire_police:5 };
    return order[cId] || 1;
  };
  const _certChips = (p) => {
    const certs = (p.certs || []).slice().sort((a,b) => _certPriority(b) - _certPriority(a));
    if(!certs.length) return '<span style="font-size:.66rem;color:var(--muted);">no certs</span>';
    return certs.map(c => {
      const label = certDefs[c]?.label || c;
      const cat = certDefs[c]?.category || 'shared';
      const bg = cat === 'fire'   ? 'rgba(224,92,26,.15)'
               : cat === 'ems'    ? 'rgba(46,168,255,.15)'
               : cat === 'police' ? 'rgba(88,101,242,.15)'
               : 'rgba(200,200,200,.12)';
      return `<span style="display:inline-block;font-size:.62rem;padding:0 5px;border-radius:8px;background:${bg};margin-right:3px;">${_escUnitHtml(label)}</span>`;
    }).join('');
  };
  const rosterList = responders.length ? responders.map(p => {
    const stateBadge = p.status === 'busy'
      ? '<span style="color:var(--green);font-weight:700;font-size:.66rem;">at station</span>'
      : p.status === 'responding'
        ? '<span style="color:var(--gold);font-size:.66rem;">responding</span>'
        : '<span style="color:var(--muted);font-size:.66rem;">' + _escUnitHtml(p.status||'pending') + '</span>';
    return `<div style="padding:4px 2px;border-bottom:1px solid rgba(255,255,255,0.04);">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:.78rem;">
        <span>${_escUnitHtml(p.name || p.id)}</span>${stateBadge}
      </div>
      <div style="margin-top:2px;">${_certChips(p)}</div>
    </div>`;
  }).join('') : '<div style="font-size:.78rem;color:var(--muted);">No responders tracked.</div>';

  const forceBtn = driverOk
    ? `<button class="btn-sm" style="background:var(--accent);color:#fff;" onclick="_unitDetailsForceOut()" title="Depart with whoever's at the station now. Responders en route will be released.">🚒 Send Anyway</button>`
    : `<button class="btn-sm" disabled title="No ${_escUnitHtml(driverLabel)}-certified driver at the station yet.">🚒 Send Anyway</button>`;

  return `<div class="section-title" style="margin-top:14px;">Crew Assembling</div>
    <div style="background:rgba(251,191,36,0.08);border:1px solid var(--gold);border-radius:4px;padding:8px 10px;font-size:.82rem;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span style="color:var(--gold);font-weight:700;">⏳ ${arrived} / ${total} at station</span>
        ${forceBtn}
      </div>
      <div style="max-height:140px;overflow-y:auto;border-top:1px solid rgba(255,255,255,0.06);padding-top:4px;">
        ${rosterList}
      </div>
      ${!driverOk ? `<div style="font-size:.72rem;color:var(--muted);margin-top:6px;">
        Need a ${_escUnitHtml(driverLabel)}-certified driver at the station to force-out.
      </div>` : ''}
    </div>`;
}

// Click handler for the awaiting-crew "Send Anyway" button.
function _unitDetailsForceOut(){
  if(!_activeUnitDetailsId) return;
  if(typeof forceVolunteerCrewDeparture !== 'function') return;
  const res = forceVolunteerCrewDeparture(_activeUnitDetailsId);
  if(!res?.ok){
    const reason = res?.reason || 'unknown';
    if(reason.startsWith('no_driver_at_station')){
      const label = reason.split(':')[1] || 'driver';
      setStatus(`⚠️ Cannot force-out: no ${label}-certified driver at the station yet.`);
    } else if(reason === 'not_awaiting_crew'){
      setStatus('⚠️ Unit is no longer awaiting crew.');
    } else {
      setStatus(`⚠️ Force-out failed: ${reason}`);
    }
    return;
  }
  // The dispatch .then() handler will flip to 'dispatched' and route.
  _renderUnitDetails();
}
