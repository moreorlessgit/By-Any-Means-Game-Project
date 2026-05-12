// =============================================================================
// BY ANY MEANS — STATIONS MODULE
// =============================================================================
// Manages all station and unit state, placement, and rendering.
// Depends on: config.js (BAM_CONFIG)
// Provides globals used by index.html and esn.js:
//   stations[], getAllUnits(), renderStationList(), openManageStation(),
//   recreateStation(), seedTestData(), _buildStationTooltip(), setStationLabelsVisible()
// =============================================================================

// ── STATE ────────────────────────────────────────────────────────────────────
let stations             = [];
let _activeManageStation = null;  // station id currently open in manage modal
let _deleteStationConfirm= null;  // station id pending two-click delete confirm
let _deleteUnitConfirm   = null;  // unit id pending two-click delete confirm
let stationLabelsVisible = false; // persistent station name labels on map markers

// ── STATION COLOR + ICON ─────────────────────────────────────────────────────

// Returns the color for a station type.
// For fire/ems/police uses CSS vars; for helipad/airport uses hardcoded values.
function getStationColor(type){
  const overrides = {
    helipad_building: '#f59e0b',
    airport_building: '#0ea5e9',
  };
  if(overrides[type]) return overrides[type];
  return getComputedStyle(document.documentElement).getPropertyValue('--'+type).trim() || '#888888';
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

// Returns a flat array of {station, unit} objects for every unit across all stations.
// Used by dispatch modal, spawn logic, ESN assignments, and save/load.
function getAllUnits(){
  const out = [];
  stations.forEach(s => s.units.forEach(u => out.push({station:s, unit:u})));
  return out;
}

// Fills the cost spans in the sidebar buttons from config so they stay in sync.
function initSidebarCosts(){
  Object.entries(BAM_CONFIG.economy.stationCost || {}).forEach(([type, cost]) => {
    const el = document.getElementById('cost-'+type);
    if(el) el.textContent = '$' + Math.round(cost/1000) + 'k';
  });
  // Facility placement costs (hospital, jails)
  Object.entries(BAM_CONFIG.facilityPlacementCost || {}).forEach(([type, cost]) => {
    const el = document.getElementById('cost-'+type);
    if(el) el.textContent = '$' + Math.round(cost/1000) + 'k';
  });
}

// Returns the tooltip HTML string for a station map marker.
function _buildStationTooltip(name, type){
  const icon = BAM_CONFIG.stationTypeDefs[type]?.icon || '📍';
  return `${icon} <b>${name}</b>`;
}

// Toggles permanent vs hover-only station name labels on all placed station markers.
function setStationLabelsVisible(visible){
  stationLabelsVisible = visible;
  stations.forEach(s => {
    if(!s.marker) return;
    s.marker.unbindTooltip();
    s.marker.bindTooltip(_buildStationTooltip(s.name, s.type),
      {permanent: visible, className:'station-tooltip', direction:'top'});
  });
}

// Builds the Leaflet divIcon for a station marker.
function _buildStationMarkerIcon(type){
  const color = getStationColor(type);
  const typeIcon = BAM_CONFIG.stationTypeDefs[type]?.icon || '📍';
  return L.divIcon({
    className:'',
    html:`<div style="background:${color};width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.6);"></div>`,
    iconSize:[22,22], iconAnchor:[11,22]
  });
}

// ── STATION LIST ─────────────────────────────────────────────────────────────

// Renders the station list in the sidebar. Filters by search input if present.
function renderStationList(){
  const el = document.getElementById('station-scroll');
  if(!el) return;
  const q = document.getElementById('station-search')?.value.trim().toLowerCase() || '';
  const filtered = stations.filter(s => !q || s.name.toLowerCase().includes(q));

  if(!filtered.length){
    el.innerHTML = stations.length
      ? '<div class="empty-msg">No stations match search.</div>'
      : '<div class="empty-msg">No stations yet.<br>Select a type above and click the map.</div>';
    return;
  }

  el.innerHTML = filtered.map(s => {
    const oos = s.inService === false;
    const typeDef = BAM_CONFIG.stationTypeDefs[s.type];
    const typeLabel = typeDef?.label || s.type + ' station';
    const pills = s.units.map(u => {
      const uOOS = u.inService === false;
      const isRet  = u.status === 'returning' && u._returnRemSec > 0;
      const isTrans = u.status === 'transporting';
      const isOff  = u.status === 'offloading';
      // Pill text: show ETA on returning, destination on transporting/offloading
      let pillTxt = u.name;
      if(isRet)   pillTxt = `${u.name} ↩${formatETA(u._returnRemSec)}`;
      if(isTrans) pillTxt = `${u.name} 🚑→`;
      if(isOff){
        const remSec = u.offloadEndSec ? Math.max(0, u.offloadEndSec - gameSeconds) : 0;
        pillTxt = remSec > 0 ? `${u.name} 🏥 ${formatETA(remSec)}` : `${u.name} 🏥`;
      }
      const cls = uOOS ? 'oos' : (isTrans||isOff ? 'transporting' : u.status);
      // Tooltip text
      let ttip = uOOS ? 'Out of service' : u.status;
      if(isRet)   ttip = `Returning — ${formatETA(u._returnRemSec)} to ST`;
      if(isTrans){
        const destName = u.transportDestination?.id
          ? (hospitals.find(h => h.id === u.transportDestination.id)?.name || 'facility')
          : 'facility';
        ttip = `Transporting → ${destName}`;
      }
      if(isOff){
        const remSec = u.offloadEndSec ? Math.max(0, u.offloadEndSec - gameSeconds) : 0;
        ttip = remSec > 0 ? `Offloading — ${formatETA(remSec)} until clear` : 'Offloading at facility';
      }
      return `<span class="unit-pill ${cls}" title="${ttip}"
               onclick="toggleUnitService('${s.id}','${u.id}');event.stopPropagation();">${pillTxt}</span>`;
    }).join('');

    return `<div class="scard${oos?' oos':''}">
      <div class="sn">${s.name}${oos?' <span class="oos-badge">OOS</span>':''}</div>
      <div class="st">${typeLabel}</div>
      <div class="su">${pills}</div>
      <div class="scard-actions">
        <button class="btn-sm" onclick="focusStation('${s.id}')">Focus</button>
        <button class="btn-sm" onclick="openManageStation('${s.id}')">Manage</button>
        <button class="btn-sm" onclick="toggleStationService('${s.id}')">${oos?'In Svc':'OOS'}</button>
      </div>
    </div>`;
  }).join('');
}

// Pans the map to center on a station.
function focusStation(id){
  const s = stations.find(x => x.id === id);
  if(s) map.setView([s.lat, s.lng], 14);
}

// ── IN / OUT OF SERVICE ───────────────────────────────────────────────────────

// Toggles an entire station in/out of service.
function toggleStationService(stationId){
  const s = stations.find(x => x.id === stationId);
  if(!s) return;
  s.inService = s.inService === false ? true : false;
  s.marker?.setOpacity(s.inService ? 1 : .4);
  renderStationList();
  setStatus(`${s.name} — ${s.inService ? 'IN SERVICE' : 'OUT OF SERVICE'}`);
}

// Toggles a single unit in/out of service (click the unit pill).
function toggleUnitService(stationId, unitId){
  const s = stations.find(x => x.id === stationId);
  const u = s?.units.find(x => x.id === unitId);
  if(!u) return;
  u.inService = u.inService === false ? true : false;
  renderStationList();
  setStatus(`${u.name} — ${u.inService ? 'IN SERVICE' : 'OUT OF SERVICE'}`);
}

// ── STATION PLACEMENT MODAL ───────────────────────────────────────────────────

let _placingStationType = null;

// Opens the new station creation modal for the given station type.
function openStationModal(type){
  _placingStationType = type;
  const cost = BAM_CONFIG.economy.stationCost[type] || 0;
  if(money < cost){ setStatus(`⚠️ Not enough funds! Need $${cost.toLocaleString()}`); pendingLatLng=null; return; }

  const typeDef  = BAM_CONFIG.stationTypeDefs[type];
  const typeLabel = typeDef?.label || type;
  document.getElementById('sm-title').textContent = `New ${typeLabel}`;
  document.getElementById('sm-name').value = '';
  document.getElementById('sm-unitname').value = '';

  // Filter units to those compatible with this station's unitCategory
  const unitCategory = typeDef?.unitCategory || type;
  const sel = document.getElementById('sm-unittype');
  sel.innerHTML = Object.entries(BAM_CONFIG.unitTypes)
    .filter(([,u]) => u.stationType === unitCategory)
    .map(([k,u]) => `<option value="${k}">${u.label} ($${u.cost.toLocaleString()})</option>`)
    .join('');

  document.getElementById('station-modal').classList.add('open');
  setTimeout(() => document.getElementById('sm-name').focus(), 40);
}

function closeStationModal(){
  document.getElementById('station-modal').classList.remove('open');
  pendingLatLng = null;
}

// Confirms placement and creates the station with its first unit.
function confirmStation(){
  const name        = document.getElementById('sm-name').value.trim();
  const unitName    = document.getElementById('sm-unitname').value.trim();
  const unitTypeKey = document.getElementById('sm-unittype').value;
  if(!name || !unitName) return;

  const stCost   = BAM_CONFIG.economy.stationCost[_placingStationType] || 0;
  const unitCost = BAM_CONFIG.unitTypes[unitTypeKey]?.cost || 0;
  const total    = stCost + unitCost;
  if(money < total){ setStatus(`⚠️ Not enough funds ($${total.toLocaleString()} needed)`); return; }

  const id     = 'st_' + Date.now();
  const icon   = _buildStationMarkerIcon(_placingStationType);
  const marker = L.marker([pendingLatLng.lat, pendingLatLng.lng], {icon}).addTo(map);
  marker.bindTooltip(_buildStationTooltip(name, _placingStationType),
    {permanent: stationLabelsVisible, className:'station-tooltip', direction:'top'});
  marker.on('click', () => openManageStation(id));

  const firstUnit = {
    id:'u_'+Date.now(), name:unitName, typeKey:unitTypeKey,
    status:'available', inService:true, _animGen:0,
    incidentId:null, routeLine:null, returnLine:null, animMarker:null, routeCoords:[],
    _returnRemSec:0,
  };

  const station = {
    id, name, type:_placingStationType,
    lat:pendingLatLng.lat, lng:pendingLatLng.lng,
    units:[firstUnit], marker, upgrades:[], inService:true
  };

  stations.push(station);
  updateMoney(-total);
  closeStationModal();
  renderStationList();
  renderStats();
  setStatus(`✅ ${name} placed. Budget: $${money.toLocaleString()}`);
  logCashflow(-total, `Station: ${name}`);
  setPlacing(null);
}

// ── STATION MANAGEMENT MODAL ──────────────────────────────────────────────────

// Opens the Manage Station modal for a given station id.
function openManageStation(stationId){
  const s = stations.find(x => x.id === stationId);
  if(!s) return;
  _activeManageStation = stationId;
  document.getElementById('msm-title').textContent = s.name;
  _renderManageBody();
  document.getElementById('manage-station-modal').classList.add('open');
}

function closeManageStation(){
  document.getElementById('manage-station-modal').classList.remove('open');
  _activeManageStation = null;
  _deleteStationConfirm = null;
  _deleteUnitConfirm = null;
}

// Renders the content inside the manage station modal.
function _renderManageBody(){
  const s = stations.find(x => x.id === _activeManageStation);
  if(!s) return;

  // Determine which unit types are available for this station
  const typeDef = BAM_CONFIG.stationTypeDefs[s.type];
  const unitCategory = typeDef?.unitCategory || s.type;
  let availTypes = Object.entries(BAM_CONFIG.unitTypes)
    .filter(([,u]) => u.stationType === unitCategory)
    .map(([k,u]) => ({key:k, ...u}));

  // Also include types unlocked by installed upgrades
  (s.upgrades||[]).forEach(upgKey => {
    const upg = BAM_CONFIG.upgrades[upgKey];
    if(upg?.unlocks) {
      upg.unlocks.forEach(utKey => {
        if(!availTypes.find(u => u.key === utKey)) {
          const ut = BAM_CONFIG.unitTypes[utKey];
          if(ut) availTypes.push({key:utKey, ...ut});
        }
      });
    }
  });

  let html = `<label class="field-label">Station Name</label>
  <div style="display:flex;gap:8px;">
    <input type="text" id="msm-rename-input" value="${s.name.replace(/"/g,'&quot;')}" style="flex:1;"/>
    <button class="btn-sm" onclick="renameStation()">Rename</button>
  </div>
  <div class="section-title" style="margin-top:14px;">Units (${s.units.length})</div>`;

  if(!s.units.length){
    html += '<div class="empty-msg">No units. Add one below.</div>';
  }
  s.units.forEach(u => {
    const utCfg = BAM_CONFIG.unitTypes[u.typeKey];
    const statusBadge = u.status !== 'available'
      ? `<span style="font-size:.6rem;color:var(--gold);">${u.status.replace('_',' ').toUpperCase()}</span>` : '';
    html += `<div class="manage-unit-row" draggable="true" data-unit-id="${u.id}"
               ondragstart="_unitDragStart(event)"
               ondragover="_unitDragOver(event)"
               ondrop="_unitDrop(event,'${s.id}')"
               style="cursor:grab;">
      <span style="font-size:.9rem;color:var(--muted);margin-right:4px;cursor:grab;" title="Drag to reorder">⠿</span>
      <div class="manage-unit-name">
        <input type="text" id="msm-u-${u.id}" value="${u.name.replace(/"/g,'&quot;')}" style="width:100%;"/>
      </div>
      <span class="manage-unit-label">${utCfg?.label || u.typeKey}</span>
      ${statusBadge}
      <button class="btn-sm" onclick="renameUnit('${u.id}')">Save</button>
      ${_deleteUnitConfirm === u.id
        ? `<button class="btn-sm danger" onclick="deleteUnit('${u.id}')" style="border-color:var(--accent);color:var(--accent);background:rgba(232,67,26,.15);">Confirm?</button>`
        : `<button class="btn-sm danger" onclick="deleteUnit('${u.id}')">Delete</button>`}
    </div>`;
  });

  html += `<div class="section-title" style="margin-top:14px;">Add Unit</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;">
    <select id="msm-add-type" style="flex:2;min-width:140px;">
      ${availTypes.map(u=>`<option value="${u.key}">${u.label} — $${u.cost.toLocaleString()}</option>`).join('')}
    </select>
    <input type="text" id="msm-add-name" placeholder="Callsign (e.g. E-52)" style="flex:1;min-width:110px;"/>
  </div>
  <button class="btn-sm" style="margin-top:8px;width:100%;" onclick="addUnitToStation()">Purchase Unit</button>`;

  // Upgrades section — show applicable upgrades for this station type
  const applicableUpgrades = Object.entries(BAM_CONFIG.upgrades)
    .filter(([,upg]) => upg.requires === s.type);
  if(applicableUpgrades.length){
    html += `<div class="section-title" style="margin-top:14px;">Upgrades</div>`;
    applicableUpgrades.forEach(([key, upg]) => {
      const installed = (s.upgrades||[]).includes(key);
      const isHoldingCells = key === 'holding_cells';
      // Special case: holding cells have their own expanded UI in prisons.js
      if(isHoldingCells && installed){
        const cells = s._holdingCells?.cells || 0;
        const occupied = s._holdingCells?.occupied || 0;
        html += `<div class="upgrade-row installed">
          <div>
            <div style="font-weight:700;font-size:.82rem;">${upg.icon} ${upg.label}</div>
            <div style="font-size:.8rem;color:var(--muted);">${cells} cells — ${occupied} occupied</div>
          </div>
          <button class="btn-sm" onclick="openHoldingCellManage('${s.id}')">Manage Cells</button>
        </div>`;
      } else {
        html += `<div class="upgrade-row${installed?' installed':''}">
          <div>
            <div style="font-weight:700;font-size:.82rem;">${upg.icon} ${upg.label}</div>
            <div style="font-size:.8rem;color:var(--muted);">${upg.desc}</div>
          </div>
          ${installed
            ? '<span style="font-size:.8rem;color:var(--green);">✓ Installed</span>'
            : `<button class="btn-sm" onclick="purchaseUpgrade('${s.id}','${key}')">
                Purchase $${upg.cost.toLocaleString()}
              </button>`}
        </div>`;
      }
    });
  }

  // Delete station button
  const delBtn = document.getElementById('msm-delete-btn');
  if(delBtn){
    delBtn.disabled = false;
    if(_deleteStationConfirm === s.id){
      delBtn.textContent = 'Confirm Delete?';
      delBtn.style.background = 'var(--accent)';
    } else {
      delBtn.textContent = 'Delete Station';
      delBtn.style.background = '';
    }
  }

  document.getElementById('msm-body').innerHTML = html;
}

// Renames the active station.
function renameStation(){
  const s = stations.find(x => x.id === _activeManageStation);
  if(!s) return;
  const newName = document.getElementById('msm-rename-input').value.trim();
  if(!newName){ setStatus('⚠️ Enter a station name.'); return; }
  s.name = newName;
  s.marker?.setTooltipContent(_buildStationTooltip(newName, s.type));
  document.getElementById('msm-title').textContent = newName;
  renderStationList();
  setStatus(`Station renamed to "${newName}".`);
}

// Saves a new callsign for a unit in the active station.
function renameUnit(unitId){
  const s = stations.find(x => x.id === _activeManageStation);
  const u = s?.units.find(x => x.id === unitId);
  if(!u) return;
  const newName = document.getElementById('msm-u-'+unitId)?.value.trim();
  if(!newName){ setStatus('⚠️ Enter a unit callsign.'); return; }
  u.name = newName;
  renderStationList();
  setStatus(`Unit renamed to "${newName}".`);
}

// Deletes a unit from the active station (two-click confirm).
function deleteUnit(unitId){
  const s = stations.find(x => x.id === _activeManageStation);
  if(!s) return;
  const u = s.units.find(x => x.id === unitId);
  if(!u) return;

  if(_deleteUnitConfirm !== unitId){
    _deleteUnitConfirm = unitId;
    _renderManageBody();
    setTimeout(() => {
      if(_deleteUnitConfirm === unitId){
        _deleteUnitConfirm = null;
        if(stations.find(x => x.id === _activeManageStation)) _renderManageBody();
      }
    }, 4000);
    return;
  }
  _deleteUnitConfirm = null;

  // Stop active animation
  u._animGen = (u._animGen||0) + 1;
  u.animMarker?.remove();
  u.routeLine?.remove();
  u.returnLine?.remove();

  // Remove from any active incident
  incidents.forEach(inc => {
    inc.units = inc.units.filter(uid => uid !== unitId);
    if(inc.units.length === 0 && inc.status !== 'resolved'){
      inc.status = 'needs_dispatch';
      if(inc.marker) inc.marker.setIcon(incidentIcon(inc));
    }
  });

  s.units = s.units.filter(x => x.id !== unitId);
  const refund = Math.floor((BAM_CONFIG.unitTypes[u.typeKey]?.cost||0) * 0.5);
  updateMoney(refund);
  if(refund > 0) logCashflow(refund, `Unit sold: ${u.name}`);
  renderStationList(); renderStats(); renderIncidentList(); _renderManageBody();
  setStatus(`Deleted ${u.name}. Refund: +$${refund.toLocaleString()}`);
}

// Purchases and adds a new unit to the active station.
function addUnitToStation(){
  const s = stations.find(x => x.id === _activeManageStation);
  if(!s) return;
  const typeKey = document.getElementById('msm-add-type').value;
  const name    = document.getElementById('msm-add-name').value.trim();
  if(!name){ setStatus('⚠️ Enter a callsign for the new unit.'); return; }
  const cost = BAM_CONFIG.unitTypes[typeKey]?.cost || 0;
  if(money < cost){ setStatus(`⚠️ Not enough funds. Need $${cost.toLocaleString()}.`); return; }
  s.units.push({
    id:'u_'+Date.now(), name, typeKey, status:'available', inService:true, _animGen:0,
    incidentId:null, routeLine:null, returnLine:null, animMarker:null, routeCoords:[], _returnRemSec:0,
  });
  updateMoney(-cost);
  logCashflow(-cost, `Unit: ${name} (${BAM_CONFIG.unitTypes[typeKey]?.label})`);
  document.getElementById('msm-add-name').value = '';
  renderStationList(); renderStats(); _renderManageBody();
  setStatus(`✅ ${name} (${BAM_CONFIG.unitTypes[typeKey].label}) added. -$${cost.toLocaleString()}`);
}

// Deletes the active station (two-click confirm). Refunds the station base cost.
function deleteStation(){
  const s = stations.find(x => x.id === _activeManageStation);
  if(!s) return;
  const delBtn = document.getElementById('msm-delete-btn');

  if(_deleteStationConfirm !== s.id){
    _deleteStationConfirm = s.id;
    if(delBtn){ delBtn.textContent='Confirm Delete?'; delBtn.style.background='var(--accent)'; }
    setTimeout(() => {
      if(_deleteStationConfirm === s.id){
        _deleteStationConfirm = null;
        if(delBtn){ delBtn.textContent='Delete Station'; delBtn.style.background=''; }
      }
    }, 4000);
    return;
  }
  _deleteStationConfirm = null;

  s.units.forEach(u => {
    u._animGen = (u._animGen||0) + 1;
    u.animMarker?.remove();
    u.routeLine?.remove();
    u.returnLine?.remove();
    incidents.forEach(inc => {
      inc.units = inc.units.filter(uid => uid !== u.id);
      if(inc.units.length === 0 && inc.status !== 'resolved'){
        inc.status = 'needs_dispatch';
        if(inc.marker) inc.marker.setIcon(incidentIcon(inc));
      }
    });
  });
  s.marker?.remove();
  const refund = BAM_CONFIG.economy.stationCost[s.type] || 0;
  stations = stations.filter(x => x.id !== _activeManageStation);
  updateMoney(refund);
  if(refund > 0) logCashflow(refund, `Station sold: ${s.name}`);
  closeManageStation();
  renderStationList(); renderStats(); renderIncidentList();
  setStatus(`🗑 Station deleted. Refund: +$${refund.toLocaleString()}`);
}

// Purchases a station upgrade and installs it.
function purchaseUpgrade(stationId, upgradeKey){
  const s   = stations.find(x => x.id === stationId);
  const upg = BAM_CONFIG.upgrades[upgradeKey];
  if(!s || !upg) return;
  if((s.upgrades||[]).includes(upgradeKey)){
    setStatus(`⚠️ Upgrade already installed.`);
    return;
  }
  if(money < upg.cost){ setStatus(`⚠️ Not enough funds ($${upg.cost.toLocaleString()} needed).`); return; }
  if(!s.upgrades) s.upgrades = [];
  s.upgrades.push(upgradeKey);
  updateMoney(-upg.cost);
  logCashflow(-upg.cost, `Upgrade: ${upg.label} @ ${s.name}`);
  // If this is the holding cells upgrade, initialize the cell data
  if(upgradeKey === 'holding_cells'){
    installHoldingCells(s);
  }
  _renderManageBody();
  setStatus(`✅ ${upg.label} installed at ${s.name}. -$${upg.cost.toLocaleString()}`);
}

// ── STATION SAVE / LOAD HELPERS ───────────────────────────────────────────────

// Returns save-ready station data (strips non-serializable map objects).
function getStationSaveData(){
  return stations.map(s => ({
    id:s.id, name:s.name, type:s.type, lat:s.lat, lng:s.lng,
    upgrades:s.upgrades||[], inService:s.inService,
    _holdingCells: s._holdingCells ? {
      installed: true,
      cells: s._holdingCells.cells,
      occupied: s._holdingCells.occupied,
      suspects: s._holdingCells.suspects || [],
    } : undefined,
    units: s.units.map(u => ({
      id:u.id, name:u.name, typeKey:u.typeKey, inService:u.inService,
      // Normalize mid-call statuses — animation cannot survive a reload
      status: ['available','oos'].includes(u.status||'available') ? (u.status||'available') : 'available'
    }))
  }));
}

// Rebuilds a station from saved data and places its marker on the map.
function recreateStation(s){
  const icon   = _buildStationMarkerIcon(s.type);
  const marker = L.marker([s.lat, s.lng], {icon}).addTo(map);
  marker.bindTooltip(_buildStationTooltip(s.name, s.type),
    {permanent: stationLabelsVisible, className:'station-tooltip', direction:'top'});
  marker.on('click', () => openManageStation(s.id));
  if(s.inService === false) marker.setOpacity(.4);

  const station = {
    ...s, marker,
    inService: s.inService !== false,
    _holdingCells: s._holdingCells || undefined,
    units: s.units.map(u => ({
      ...u, inService: u.inService !== false,
      status: ['available','oos'].includes(u.status||'available') ? (u.status||'available') : 'available',
      _animGen:0, _returnRemSec:0,
      incidentId:null, routeLine:null, returnLine:null, animMarker:null, routeCoords:[]
    }))
  };
  stations.push(station);
}

// ── HOLDING CELL MANAGEMENT MODAL ────────────────────────────────────────────

let _activeHoldingCellStationId = null;  // station whose holding-cell modal is currently open

// Opens the holding cell management modal for a police station.
// Called from the "Manage Cells" button in _renderManageBody().
function openHoldingCellManage(stationId){
  const s = stations.find(x => x.id === stationId);
  if(!s || !s._holdingCells?.installed){
    setStatus('⚠️ No holding cells installed at this station.');
    return;
  }
  _activeHoldingCellStationId = stationId;
  let modal = document.getElementById('holding-cell-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'holding-cell-modal';
    modal.className = 'modal-overlay';
    modal.addEventListener('click', e => { if(e.target === modal) _closeHoldingCellModal(); });
    document.body.appendChild(modal);
  }
  _renderHoldingCellModal();
  modal.classList.add('open');
}

// Closes the holding cell modal.
function _closeHoldingCellModal(){
  _activeHoldingCellStationId = null;
  const modal = document.getElementById('holding-cell-modal');
  if(modal) modal.classList.remove('open');
}

// Rebuilds the holding cell modal HTML.
function _renderHoldingCellModal(){
  const modal = document.getElementById('holding-cell-modal');
  if(!modal || !_activeHoldingCellStationId) return;
  const s = stations.find(x => x.id === _activeHoldingCellStationId);
  if(!s || !s._holdingCells){ _closeHoldingCellModal(); return; }

  const hc = s._holdingCells;
  const pct = hc.cells ? Math.round((hc.occupied / hc.cells) * 100) : 0;
  const capColor = pct >= 90 ? 'var(--accent)' : pct >= 70 ? 'var(--gold)' : 'var(--green)';

  // Cell grid — green = empty, slate = occupied
  const cellBlocks = [];
  for(let i = 0; i < hc.cells; i++){
    const occ = i < hc.occupied;
    cellBlocks.push(`<div style="width:16px;height:16px;border-radius:2px;
                       background:${occ ? '#64748b' : 'var(--green)'};opacity:${occ ? 1 : 0.35};
                       border:1px solid rgba(255,255,255,.15);" title="${occ ? 'Occupied' : 'Empty'}"></div>`);
  }

  // Build suspect rows for all suspects currently held here
  const holdingSuspects = (hc.suspects || [])
    .map(id => suspects.find(x => x.id === id))
    .filter(Boolean);

  // Facility dropdowns — only in-service, non-full facilities
  const countyJails      = jails.filter(j => j.inService && j.type === 'county_jail'         && j.occupied < j.cells);
  const stateCorrectional = jails.filter(j => j.inService && j.type === 'state_correctional' && j.occupied < j.cells);

  const tierColors = {
    summary_offense: 'var(--muted)',
    misdemeanor:     'var(--gold)',
    felony:          'var(--accent)',
    violent_felony:  '#ff4444',
  };

  const suspectRows = holdingSuspects.length === 0
    ? '<div class="empty-msg">No suspects currently held.</div>'
    : holdingSuspects.map(sus => {
        const tierCfg   = BAM_CONFIG.chargeTiers[sus.chargeTier] || {};
        const tierColor = tierColors[sus.chargeTier] || 'var(--muted)';
        const elapsed   = sus.processingStartSec ? Math.max(0, gameSeconds - sus.processingStartSec) : 0;
        const pctDone   = sus.processingDurationSec
          ? Math.min(100, Math.round((elapsed / sus.processingDurationSec) * 100)) : 0;
        const remaining = sus.processingDurationSec
          ? Math.max(0, sus.processingDurationSec - elapsed) : 0;
        const barColor  = pctDone >= 90 ? 'var(--green)' : pctDone >= 50 ? 'var(--gold)' : 'var(--muted)';

        const jailOpts = countyJails.length
          ? countyJails.map(j =>
              `<option value="${_escHoldingHtml(j.id)}">${_escHoldingHtml(j.name)} (${j.occupied}/${j.cells})</option>`
            ).join('')
          : '<option value="">No jails available</option>';
        const prisonOpts = stateCorrectional.length
          ? stateCorrectional.map(j =>
              `<option value="${_escHoldingHtml(j.id)}">${_escHoldingHtml(j.name)} (${j.occupied}/${j.cells})</option>`
            ).join('')
          : '<option value="">No prisons available</option>';

        return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:10px 12px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
            <div>
              <span style="font-size:.82rem;font-weight:700;">${_escHoldingHtml(sus.id.slice(-8))}</span>
              <span style="margin-left:8px;font-size:.78rem;border:1px solid ${tierColor};color:${tierColor};
                           border-radius:10px;padding:1px 7px;text-transform:uppercase;">${tierCfg.label || sus.chargeTier}</span>
              ${sus.incidentLabel ? `<span style="margin-left:8px;font-size:.76rem;color:var(--muted);">${_escHoldingHtml(sus.incidentLabel)}</span>` : ''}
            </div>
            <span id="hcm-rem-${sus.id}" style="font-size:.8rem;color:var(--muted);">${remaining > 0 ? formatETA(remaining) + ' left' : '⏳ processing'}</span>
          </div>
          <div class="res-bar-track" style="margin-bottom:9px;">
            <div id="hcm-bar-${sus.id}" class="res-bar-fill" style="width:${pctDone}%;background:${barColor};transition:width 1s linear;"></div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <button class="btn-sm" onclick="_holdingRelease('${sus.id}')">Release</button>
            <button class="btn-sm" onclick="_holdingCitation('${sus.id}')">📋 Citation</button>
            <span style="font-size:.78rem;color:var(--muted);margin:0 2px;">Transfer →</span>
            <select id="hc-jail-${sus.id}" style="font-size:.8rem;padding:3px 6px;"
                    ${!countyJails.length ? 'disabled' : ''}>${jailOpts}</select>
            <button class="btn-sm" onclick="_holdingTransfer('${sus.id}','jail')"
                    ${!countyJails.length ? 'disabled' : ''}>Jail</button>
            <select id="hc-prison-${sus.id}" style="font-size:.8rem;padding:3px 6px;"
                    ${!stateCorrectional.length ? 'disabled' : ''}>${prisonOpts}</select>
            <button class="btn-sm" onclick="_holdingTransfer('${sus.id}','prison')"
                    ${!stateCorrectional.length ? 'disabled' : ''}>Prison</button>
          </div>
        </div>`;
      }).join('');

  // Add cells section
  const costPerCell = BAM_CONFIG.holdingCellUpgrade.costPerCell;
  const cellCountOpts = [1,2,5,10].map(n =>
    `<option value="${n}">${n} cell${n>1?'s':''} — $${(n * costPerCell).toLocaleString()}</option>`
  ).join('') + '<option value="custom">Custom…</option>';

  modal.innerHTML = `
    <div class="modal-box gold-top" style="width:620px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;">
      <div class="modal-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <h2 class="gold">🔒 ${_escHoldingHtml(s.name)}</h2>
          <div class="modal-sub">
            <span style="color:${capColor};">${hc.occupied}/${hc.cells} cells</span>
            &nbsp;·&nbsp; Holding Cells
          </div>
        </div>
        <button class="btn-sm danger" onclick="_closeHoldingCellModal()">✕</button>
      </div>
      <div class="modal-body" style="flex:1;overflow-y:auto;padding:14px 16px;">
        <div class="section-title">Cells</div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:14px;">${cellBlocks.join('')}</div>
        <div class="section-title">Suspects (${holdingSuspects.length} held)</div>
        ${suspectRows}
        <div class="section-title" style="margin-top:16px;">Add Cells</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <select id="hcm-cell-count" style="font-size:.82rem;padding:5px 8px;">${cellCountOpts}</select>
          <button class="btn-sm" onclick="_buyHoldingCellsFromModal('${s.id}')">Purchase</button>
          <span style="font-size:.8rem;color:var(--muted);">$${costPerCell.toLocaleString()} per cell</span>
        </div>
        <div id="hcm-custom-cell-row" style="display:none;margin-top:6px;align-items:center;gap:6px;">
          <input id="hcm-custom-count" type="number" min="1" placeholder="Number of cells"
                 style="width:150px;padding:5px 8px;font-size:.82rem;"/>
          <button class="btn-sm" onclick="_buyHoldingCellsCustom('${s.id}')">Buy</button>
        </div>
      </div>
    </div>`;

  // Wire custom-count toggle
  setTimeout(() => {
    const sel = document.getElementById('hcm-cell-count');
    if(sel) sel.addEventListener('change', () => {
      const row = document.getElementById('hcm-custom-cell-row');
      if(row) row.style.display = sel.value === 'custom' ? 'flex' : 'none';
    });
  }, 0);
}

// Releases a suspect from holding with no charges. Pays station processing revenue.
function _holdingRelease(suspectId){
  const sus = suspects.find(x => x.id === suspectId);
  const s   = stations.find(x => x.id === _activeHoldingCellStationId);
  if(!sus || !s) return;
  _freeStationCell(s, suspectId);
  releaseSuspect(sus, 'station');
  setStatus(`Released suspect from ${s.name}.`);
  _renderHoldingCellModal();
}

// Issues a citation to a suspect and releases them, marking disposition as 'cited'.
function _holdingCitation(suspectId){
  const sus = suspects.find(x => x.id === suspectId);
  const s   = stations.find(x => x.id === _activeHoldingCellStationId);
  if(!sus || !s) return;
  sus.disposition = 'cited';
  _freeStationCell(s, suspectId);
  releaseSuspect(sus, 'station');
  setStatus(`📋 Citation issued — suspect released from ${s.name}.`);
  _renderHoldingCellModal();
}

// Dispatches a transport unit to transfer a suspect from holding to a jail or prison.
// jailOrPrison: 'jail' (county_jail) | 'prison' (state_correctional)
function _holdingTransfer(suspectId, jailOrPrison){
  const sus = suspects.find(x => x.id === suspectId);
  const s   = stations.find(x => x.id === _activeHoldingCellStationId);
  if(!sus || !s) return;

  const selEl = jailOrPrison === 'jail'
    ? document.getElementById(`hc-jail-${suspectId}`)
    : document.getElementById(`hc-prison-${suspectId}`);
  const facility = jails.find(j => j.id === selEl?.value);
  if(!facility){
    setStatus('⚠️ Select a destination facility first.');
    return;
  }
  if(facility.occupied >= facility.cells){
    setStatus(`⚠️ ${facility.name} is at capacity.`);
    return;
  }

  // Free the holding cell, then open unit-selection modal for player to assign transport.
  _freeStationCell(s, suspectId);
  sus.status     = 'needs_transport';
  sus.facilityId = facility.id;
  if(typeof _openTransportDispatchModal === 'function'){
    _openTransportDispatchModal(sus, facility);
  } else if(typeof queuePrisonerTransport === 'function'){
    queuePrisonerTransport(sus, facility);
  }
  _renderHoldingCellModal();
}

// Purchases holding cells from the modal dropdown.
function _buyHoldingCellsFromModal(stationId){
  const sel = document.getElementById('hcm-cell-count');
  if(!sel || sel.value === 'custom') return;
  purchaseHoldingCells(stationId, parseInt(sel.value, 10));
  _renderHoldingCellModal();
}

// Purchases a custom number of holding cells.
function _buyHoldingCellsCustom(stationId){
  const input = document.getElementById('hcm-custom-count');
  if(!input || !input.value) return;
  purchaseHoldingCells(stationId, parseInt(input.value, 10));
  _renderHoldingCellModal();
}

// HTML escape helper for holding cell modal strings.
function _escHoldingHtml(str){
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── UNIT DRAG-AND-DROP REORDER ───────────────────────────────────────────────

let _dragUnitId = null;   // id of the unit being dragged

function _unitDragStart(event){
  _dragUnitId = event.currentTarget.dataset.unitId;
  event.dataTransfer.effectAllowed = 'move';
}

function _unitDragOver(event){
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  // Visual feedback: highlight target row
  document.querySelectorAll('.manage-unit-row').forEach(r => r.style.outline = '');
  event.currentTarget.style.outline = '1px dashed var(--gold)';
}

function _unitDrop(event, stationId){
  event.preventDefault();
  document.querySelectorAll('.manage-unit-row').forEach(r => r.style.outline = '');
  const targetId = event.currentTarget.dataset.unitId;
  if(!_dragUnitId || _dragUnitId === targetId) return;
  const s = stations.find(x => x.id === stationId);
  if(!s) return;
  const fromIdx = s.units.findIndex(u => u.id === _dragUnitId);
  const toIdx   = s.units.findIndex(u => u.id === targetId);
  if(fromIdx === -1 || toIdx === -1) return;
  // Reorder in-place
  const [moved] = s.units.splice(fromIdx, 1);
  s.units.splice(toIdx, 0, moved);
  _dragUnitId = null;
  _renderManageBody();
  renderStationList();
}

// ── SEED TEST STATIONS ────────────────────────────────────────────────────────

// Places the seed stations from config if no stations exist.
function seedTestData(){
  if(stations.length > 0) return;
  if(!BAM_CONFIG.seedStations?.length) return;
  BAM_CONFIG.seedStations.forEach(seed => {
    const icon = _buildStationMarkerIcon(seed.type);
    const id = 'st_seed_' + Date.now() + '_' + Math.random();
    const marker = L.marker([seed.lat, seed.lng], {icon}).addTo(map);
    marker.bindTooltip(_buildStationTooltip(seed.name, seed.type),
      {permanent: stationLabelsVisible, className:'station-tooltip', direction:'top'});
    marker.on('click', () => openManageStation(id));
    stations.push({
      id, name:seed.name, type:seed.type, lat:seed.lat, lng:seed.lng,
      upgrades:[], marker, inService:true,
      units: seed.units.map((u,i) => ({
        id:'u_seed_'+Date.now()+'_'+i, name:u.name, typeKey:u.typeKey,
        status:'available', inService:true, _animGen:0, _returnRemSec:0,
        incidentId:null, routeLine:null, returnLine:null, animMarker:null, routeCoords:[]
      }))
    });
  });
  renderStationList(); renderStats();
}
