// =============================================================================
// BY ANY MEANS — HOSPITALS MODULE
// =============================================================================
// Manages hospital placement, department upgrades, patient flow, and revenue.
// Depends on: config.js (BAM_CONFIG), index.html globals (map, money,
//   updateMoney, logCashflow, gameSeconds, formatETA, setStatus)
// Provides: hospitals[], placeHospital(), admitPatient(), tickHospitalPatients(),
//   findNearestHospital(), getHospitalCompatibility(), openHospitalModal(),
//   getHospitalSaveData(), loadHospitalData()
// =============================================================================

// ── STATE ─────────────────────────────────────────────────────────────────────

let hospitals            = [];        // all placed hospital objects
let _activeHospitalId    = null;      // id of the hospital whose modal is open
let _activeHospitalTab   = null;      // department key currently shown in modal
let _hospRenameActive    = false;     // true while inline rename input is visible

// ── ID GENERATORS ─────────────────────────────────────────────────────────────

function _hospId(){ return 'hosp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }
function _ptId(){   return 'pt_'   + Date.now() + '_' + Math.random().toString(36).slice(2,6); }

// ── MATH HELPERS ──────────────────────────────────────────────────────────────

// Haversine great-circle distance in miles between two lat/lng points.
// Used for helicopter ETAs and nearest-facility lookups.
function _hospHaversineMi(lat1, lng1, lat2, lng2){
  const R    = 3958.8;   // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2
             + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Returns a random value in [min, max].
function _hospRandRange(min, max){ return min + Math.random() * (max - min); }

// ── STAGE QUEUE BUILDER ───────────────────────────────────────────────────────

// Builds the ordered list of department keys a patient will pass through.
// Tier determines the chain; available departments in the hospital gate what's reachable.
// Falls back gracefully if a department is not installed.
function _buildStageQueue(hospital, injuryType){
  const injCfg  = BAM_CONFIG.injuryTypes[injuryType];
  if(!injCfg) return ['emergency'];

  const tier    = injCfg.patientTier || 'minor';
  const reqDept = injCfg.requiredDept || 'emergency';
  const hasDept = key => Boolean(hospital.departments[key]);

  const stages = ['emergency'];   // every patient enters through ED

  if(tier === 'minor'){
    // ED only — no additional stages
  } else if(tier === 'serious'){
    // ED → specialty dept (if not ED and if installed) → Med/Surg (if installed)
    if(reqDept !== 'emergency' && hasDept(reqDept)) stages.push(reqDept);
    if(hasDept('medsurg') && !stages.includes('medsurg')) stages.push('medsurg');
  } else if(tier === 'critical'){
    // ED → specialty dept (if installed) → ICU (if installed) → Med/Surg (if installed)
    if(reqDept !== 'emergency' && hasDept(reqDept)) stages.push(reqDept);
    if(hasDept('icu')    && !stages.includes('icu'))    stages.push('icu');
    if(hasDept('medsurg') && !stages.includes('medsurg')) stages.push('medsurg');
  }
  return stages;
}

// ── HOSPITAL PLACEMENT ────────────────────────────────────────────────────────

// Places a new hospital on the map, charges the player, and adds it to hospitals[].
// name: player-entered name for this hospital instance.
function placeHospital(lat, lng, name){
  const typeCfg = BAM_CONFIG.hospitalTypes.hospital;
  const cost    = BAM_CONFIG.facilityPlacementCost.hospital;
  if(money < cost){
    setStatus(`⚠️ Not enough funds. Hospital costs $${cost.toLocaleString()}.`);
    return;
  }

  const id = _hospId();
  const marker = _buildHospitalMarker(id, lat, lng, name);

  // Build the starting departments (ED is always included at no extra cost)
  const departments = {};
  typeCfg.baseDepts.forEach(deptKey => {
    const deptCfg = BAM_CONFIG.hospitalDepartments[deptKey];
    departments[deptKey] = {
      beds:         deptCfg.baseBeds,
      occupiedBeds: 0,
      patients:     [],
    };
  });

  const hospital = {
    id, name, type:'hospital', lat, lng, marker,
    inService:   true,
    onDiversion: false,
    helipadInstalled: false,
    departments,
  };
  hospitals.push(hospital);

  updateMoney(-cost);
  logCashflow(-cost, `Hospital placed: ${name}`);
  setStatus(`🏥 ${name} placed. -$${cost.toLocaleString()}`);
  return hospital;
}

// Builds and returns the Leaflet marker for a hospital.
function _buildHospitalMarker(id, lat, lng, name){
  const icon = L.divIcon({
    className: '',
    html: `<div style="background:#22c55e;width:26px;height:26px;border-radius:3px;
                       border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.6);
                       display:flex;align-items:center;justify-content:center;
                       font-size:14px;line-height:1;">🏥</div>`,
    iconSize:   [26, 26],
    iconAnchor: [13, 13],
  });
  const marker = L.marker([lat, lng], {icon}).addTo(map);
  marker.bindTooltip(`🏥 <b>${name}</b>`, {
    permanent: false, className: 'station-tooltip', direction: 'top'
  });
  marker.on('click', () => openHospitalModal(id));
  return marker;
}

// Renames a hospital and refreshes its map tooltip.
function renameHospital(id, newName){
  newName = newName.trim();
  if(!newName) return;
  const h = hospitals.find(x => x.id === id);
  if(!h) return;
  h.name = newName;
  h.marker.unbindTooltip();
  h.marker.bindTooltip(`🏥 <b>${newName}</b>`, {
    permanent: false, className: 'station-tooltip', direction: 'top'
  });
  if(_activeHospitalId === id) _renderHospitalModal();
  setStatus(`✅ Hospital renamed to "${newName}".`);
}

// Toggles a hospital in or out of diversion (units won't be auto-routed here while on diversion).
function toggleHospitalDiversion(id){
  const h = hospitals.find(x => x.id === id);
  if(!h) return;
  h.onDiversion = !h.onDiversion;
  h.marker.setOpacity(h.onDiversion ? 0.5 : 1);
  if(_activeHospitalId === id) _renderHospitalModal();
  setStatus(`${h.name} — ${h.onDiversion ? '🔴 ON DIVERSION' : '✅ DIVERSION CLEARED'}`);
}

// Toggles a hospital in or out of service.
function toggleHospitalService(id){
  const h = hospitals.find(x => x.id === id);
  if(!h) return;
  h.inService = !h.inService;
  h.marker.setOpacity(h.inService ? 1 : 0.4);
  if(_activeHospitalId === id) _renderHospitalModal();
  setStatus(`${h.name} — ${h.inService ? 'IN SERVICE' : 'OUT OF SERVICE'}`);
}

// ── DEPARTMENT PURCHASE ───────────────────────────────────────────────────────

// Purchases and installs a department at the given hospital.
// Charges the player the cost from BAM_CONFIG.hospitalDepartments[deptKey].cost.
function purchaseDepartment(hospitalId, deptKey){
  const h       = hospitals.find(x => x.id === hospitalId);
  const deptCfg = BAM_CONFIG.hospitalDepartments[deptKey];
  if(!h || !deptCfg) return;
  if(h.departments[deptKey]){
    setStatus('⚠️ Department already installed.');
    return;
  }
  if(money < deptCfg.cost){
    setStatus(`⚠️ Not enough funds. ${deptCfg.label} costs $${deptCfg.cost.toLocaleString()}.`);
    return;
  }
  h.departments[deptKey] = {
    beds:         deptCfg.baseBeds,
    occupiedBeds: 0,
    patients:     [],
  };
  updateMoney(-deptCfg.cost);
  logCashflow(-deptCfg.cost, `Dept: ${deptCfg.label} @ ${h.name}`);
  setStatus(`✅ ${deptCfg.label} installed at ${h.name}. -$${deptCfg.cost.toLocaleString()}`);
  if(_activeHospitalId === hospitalId) _renderHospitalModal();
}

// ── HOSPITAL SEARCH ───────────────────────────────────────────────────────────

// Returns the nearest in-service, non-diverted hospital that has requiredDept installed.
// Falls back to nearest hospital with ED if no specialty match exists.
// Returns null if no hospitals are placed.
function findNearestHospital(lat, lng, requiredDept){
  const candidates = hospitals.filter(h => h.inService && !h.onDiversion);
  if(!candidates.length) return null;

  // Try to find one that has the required dept
  const withDept = candidates.filter(h => h.departments[requiredDept]);
  const pool     = withDept.length ? withDept : candidates;

  let nearest = null, nearestDist = Infinity;
  pool.forEach(h => {
    const d = _hospHaversineMi(lat, lng, h.lat, h.lng);
    if(d < nearestDist){ nearestDist = d; nearest = h; }
  });
  return nearest;
}

// Returns { compatible: bool, missingDept: string|null } for the Transport tab UI.
function getHospitalCompatibility(hospitalId, injuryType){
  const h      = hospitals.find(x => x.id === hospitalId);
  const injCfg = BAM_CONFIG.injuryTypes[injuryType];
  if(!h || !injCfg) return { compatible: false, missingDept: null };
  const req = injCfg.requiredDept;
  if(!req || req === 'emergency' || h.departments[req]){
    return { compatible: true, missingDept: null };
  }
  return { compatible: false, missingDept: req };
}

// ── PATIENT ADMISSION ─────────────────────────────────────────────────────────

// Admits a patient to the hospital. Pays EMS transport revenue based on the
// transport unit's provider level and distance. Starts the first stage timer.
//
// patient object must have: id, injuryType, tier, incidentId, stabilizeProgress
// transportUnit object must have: typeKey, transportDistanceMi (set in index.html startTransport)
function admitPatient(hospitalId, patient, transportUnit){
  const h = hospitals.find(x => x.id === hospitalId);
  if(!h) return;

  // Build the stage queue for this patient based on their injury and this hospital's depts
  const stageQueue = _buildStageQueue(h, patient.injuryType);
  const firstStage = stageQueue.shift();
  const firstDept  = h.departments[firstStage];

  if(!firstDept){
    // ED should always exist; this is a safety fallback
    setStatus(`⚠️ ${h.name} has no Emergency Department — cannot admit patient.`);
    return;
  }

  // Fill in patient state for hospital tracking
  patient.status            = 'admitted';
  patient.hospitalId        = hospitalId;
  patient.arrivalGameSec    = gameSeconds;
  patient.stage             = firstStage;
  patient.stageQueue        = stageQueue;
  patient.revenueEarned     = 0;

  // Roll a stage duration from config and start the timer
  _startPatientStage(h, firstDept, patient);

  // Place patient in the department
  firstDept.patients.push(patient);
  firstDept.occupiedBeds = Math.min(firstDept.beds, firstDept.occupiedBeds + 1);

  // Pay EMS transport revenue (base + per-mile), determined by unit's provider level
  if(transportUnit){
    const typeKey   = transportUnit.typeKey;
    const provLevel = BAM_CONFIG.unitTypes[typeKey]?.providerLevel || 'bls';
    // Helicopters and ALS units use ALS rates; BLS uses BLS rates
    const rateKey   = (provLevel === 'als' || provLevel === 'air_als') ? 'als' : 'bls';
    const rates     = BAM_CONFIG.transportRevenue[rateKey];
    const distMi    = transportUnit.transportDistanceMi || 0;
    const revenue   = Math.round(rates.baseFee + distMi * rates.perMileFee);
    updateMoney(revenue);
    logCashflow(revenue,
      `[EMS TRANSPORT] ${transportUnit.name} → ${h.name} (${distMi.toFixed(1)} mi, ${rateKey.toUpperCase()})`);
  }

  if(_activeHospitalId === hospitalId) _renderHospitalModal();
}

// Rolls a random stage duration from config and stamps the start time.
function _startPatientStage(hospital, dept, patient){
  const deptCfg             = BAM_CONFIG.hospitalDepartments[patient.stage];
  const minSec              = deptCfg?.stageDurationMinSec || 600;
  const maxSec              = deptCfg?.stageDurationMaxSec || 1800;
  patient.stageStartSec     = gameSeconds;
  patient.stageDurationSec  = Math.round(_hospRandRange(minSec, maxSec));
}

// ── HOSPITAL TICK ──────────────────────────────────────────────────────────────

// Called every game clock tick from _tickGameClock() in index.html.
// Advances stage timers and moves patients through their stage chain.
function tickHospitalPatients(deltaGameSec){
  let modalNeedsUpdate = false;

  hospitals.forEach(hospital => {
    Object.entries(hospital.departments).forEach(([deptKey, dept]) => {
      // Iterate a copy so we can splice safely during iteration
      [...dept.patients].forEach(patient => {
        if(patient.status !== 'admitted') return;

        const elapsed = gameSeconds - patient.stageStartSec;
        if(elapsed >= patient.stageDurationSec){
          // Stage complete — move to next or discharge
          _advancePatientStage(hospital, patient);
          modalNeedsUpdate = true;
        }
      });
    });
  });

  if(modalNeedsUpdate && _activeHospitalId) _renderHospitalModal();
}

// Moves a patient to their next stage, or discharges them if the queue is empty.
function _advancePatientStage(hospital, patient){
  // Remove from current department
  const currentDept = hospital.departments[patient.stage];
  if(currentDept){
    currentDept.patients    = currentDept.patients.filter(p => p.id !== patient.id);
    currentDept.occupiedBeds = Math.max(0, currentDept.occupiedBeds - 1);
  }

  if(patient.stageQueue.length === 0){
    // No more stages — discharge
    dischargePatient(hospital, patient);
    return;
  }

  // Advance to next stage
  const nextStageKey = patient.stageQueue.shift();
  const nextDept     = hospital.departments[nextStageKey];

  if(!nextDept){
    // Department was removed after admission (edge case) — skip to next or discharge
    _advancePatientStage(hospital, patient);
    return;
  }

  patient.stage = nextStageKey;
  _startPatientStage(hospital, nextDept, patient);
  nextDept.patients.push(patient);
  nextDept.occupiedBeds = Math.min(nextDept.beds, nextDept.occupiedBeds + 1);
}

// ── PATIENT DISCHARGE ─────────────────────────────────────────────────────────

// Discharges a patient and pays hospital revenue.
// Revenue = (basePerPatient × acuityMultiplier[tier]) + (minutesInHospital × revenuePerMinute)
function dischargePatient(hospital, patient){
  patient.status = 'discharged';

  const cfg         = BAM_CONFIG.hospitalRevenue;
  const tier        = patient.tier || 'minor';
  const multiplier  = cfg.acuityMultiplier[tier] || 1.0;
  const minutesHeld = Math.max(0, (gameSeconds - patient.arrivalGameSec) / 60);
  const revenue     = Math.round(cfg.basePerPatient * multiplier + minutesHeld * cfg.revenuePerMinute);

  patient.revenueEarned += revenue;
  updateMoney(revenue);
  logCashflow(revenue,
    `[HOSPITAL REVENUE] ${hospital.name} — ${BAM_CONFIG.injuryTypes[patient.injuryType]?.label || patient.injuryType} (${tier})`);
}

// ── MODAL ─────────────────────────────────────────────────────────────────────

// Opens the hospital management modal for the given hospital.
function openHospitalModal(id){
  _activeHospitalId  = id;
  _activeHospitalTab = null;   // auto-select first tab
  _hospRenameActive  = false;

  let modal = document.getElementById('hospital-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id        = 'hospital-modal';
    modal.className = 'modal-overlay';
    modal.addEventListener('click', e => { if(e.target === modal) closeHospitalModal(); });
    document.body.appendChild(modal);
  }
  _renderHospitalModal();
  modal.classList.add('open');
}

// Closes the hospital modal.
function closeHospitalModal(){
  _activeHospitalId = null;
  const modal = document.getElementById('hospital-modal');
  if(modal) modal.classList.remove('open');
}

// Switches the active tab within the hospital modal.
function switchHospitalTab(deptKey){
  _activeHospitalTab = deptKey;
  _renderHospitalModal();
}

// Rebuilds the entire hospital modal HTML.
function _renderHospitalModal(){
  const modal = document.getElementById('hospital-modal');
  if(!modal || !_activeHospitalId) return;

  const h = hospitals.find(x => x.id === _activeHospitalId);
  if(!h){ closeHospitalModal(); return; }

  // Determine active tab — default to first installed dept.
  // '__purchase__' and '__offloading__' are valid active tabs with no entry in h.departments.
  const installedDepts  = Object.keys(h.departments);
  const specialTabs = ['__purchase__','__offloading__'];
  if(!_activeHospitalTab
     || (!specialTabs.includes(_activeHospitalTab) && !h.departments[_activeHospitalTab])){
    _activeHospitalTab = installedDepts[0] || null;
  }

  // Count total beds / occupied and offloading units
  let totalBeds = 0, totalOccupied = 0;
  installedDepts.forEach(k => {
    totalBeds     += h.departments[k].beds;
    totalOccupied += h.departments[k].occupiedBeds;
  });
  const offloadingUnits = getAllUnits().filter(({unit}) =>
    unit.status === 'offloading' && unit.lastHospitalId === h.id
  );

  // Purchaseable departments (in config but not yet installed)
  const typeCfg    = BAM_CONFIG.hospitalTypes[h.type];
  const available  = (typeCfg?.availDepts || []).filter(k => !h.departments[k]);

  // ── Header ──────────────────────────────────────────────────────────────────
  const divStatus = h.onDiversion
    ? '<span style="color:var(--accent);font-weight:700;font-size:.8rem;letter-spacing:1px;">🔴 ON DIVERSION</span>'
    : (h.inService
        ? '<span style="color:var(--green);font-size:.8rem;">● IN SERVICE</span>'
        : '<span style="color:var(--muted);font-size:.8rem;">● OUT OF SERVICE</span>');

  const renameSection = _hospRenameActive
    ? `<div style="display:flex;gap:6px;margin-top:8px;">
         <input id="hm-rename-input" value="${_escHtml(h.name)}"
                style="flex:1;padding:5px 8px;font-size:.88rem;"
                onkeydown="if(event.key==='Enter') _commitHospitalRename('${h.id}')"/>
         <button class="btn-sm" onclick="_commitHospitalRename('${h.id}')">Save</button>
         <button class="btn-sm" onclick="_cancelHospitalRename()">Cancel</button>
       </div>`
    : '';

  // ── Offloading tab (leftmost) ────────────────────────────────────────────────
  const offloadTabActive = _activeHospitalTab === '__offloading__';
  const offloadTabHtml = `<div class="sb-tab ${offloadTabActive ? 'active' : ''}"
      onclick="switchHospitalTab('__offloading__')"
      style="font-size:.8rem;color:${offloadingUnits.length ? 'var(--ems)' : 'var(--muted)'};">
    🏥 Offloading<br>
    <span style="font-size:.72rem;color:${offloadingUnits.length ? 'var(--ems)' : 'var(--muted)'};">
      ${offloadingUnits.length} unit${offloadingUnits.length!==1?'s':''}
    </span>
  </div>`;

  // ── Department tab bar ───────────────────────────────────────────────────────
  const tabsHtml = installedDepts.map(k => {
    const dCfg  = BAM_CONFIG.hospitalDepartments[k];
    const dept  = h.departments[k];
    const pct   = dept.beds ? Math.round((dept.occupiedBeds / dept.beds) * 100) : 0;
    const active = k === _activeHospitalTab ? 'active' : '';
    return `<div class="sb-tab ${active}" onclick="switchHospitalTab('${k}')" style="font-size:.8rem;">
              ${dCfg?.label || k}<br>
              <span style="font-size:.58rem;color:${pct >= 100 ? 'var(--accent)' : 'var(--muted)'};">
                ${dept.occupiedBeds}/${dept.beds}
              </span>
            </div>`;
  }).join('');

  // Add "Purchase" tab if departments are available
  const purchaseTabHtml = available.length
    ? `<div class="sb-tab ${_activeHospitalTab === '__purchase__' ? 'active' : ''}"
            onclick="switchHospitalTab('__purchase__')"
            style="font-size:.8rem;color:var(--gold);">+ Purchase<br>&nbsp;</div>`
    : '';

  // ── Tab content ──────────────────────────────────────────────────────────────
  let tabContent = '';
  if(_activeHospitalTab === '__offloading__'){
    tabContent = _renderOffloadingTab(h, offloadingUnits);
  } else if(_activeHospitalTab === '__purchase__'){
    tabContent = _renderPurchaseTab(h, available);
  } else if(_activeHospitalTab && h.departments[_activeHospitalTab]){
    tabContent = _renderDeptTab(h, _activeHospitalTab);
  }

  modal.innerHTML = `
    <div class="modal-box gold-top" style="width:680px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;">
      <div class="modal-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="flex:1;min-width:0;">
          <h2 class="gold" style="cursor:pointer;" onclick="_toggleHospitalRename('${h.id}')"
              title="Click to rename">🏥 ${_escHtml(h.name)}</h2>
          <div class="modal-sub">
            ${divStatus} &nbsp;|&nbsp; ${totalOccupied}/${totalBeds} beds occupied
            ${offloadingUnits.length ? `&nbsp;|&nbsp; <span style="color:var(--ems);">🏥 ${offloadingUnits.length} unit${offloadingUnits.length>1?'s':''} offloading</span>` : ''}
          </div>
          ${renameSection}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn-sm" onclick="toggleHospitalDiversion('${h.id}')">
            ${h.onDiversion ? '✅ Clear Diversion' : '🔴 Go Diversion'}
          </button>
          <button class="btn-sm" onclick="toggleHospitalService('${h.id}')">
            ${h.inService ? 'OOS' : 'In Svc'}
          </button>
          <button class="btn-sm danger" onclick="closeHospitalModal()">✕</button>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="sb-tabs" style="flex-shrink:0;">
        ${offloadTabHtml}
        ${tabsHtml}
        ${purchaseTabHtml}
      </div>

      <!-- Tab body -->
      <div class="modal-body" style="flex:1;overflow-y:auto;padding:14px 16px;">
        ${tabContent}
      </div>
    </div>`;
}

// Renders the content of a single installed department tab.
function _renderDeptTab(hospital, deptKey){
  const deptCfg = BAM_CONFIG.hospitalDepartments[deptKey];
  const dept    = hospital.departments[deptKey];
  if(!dept) return '<div class="empty-msg">Department not found.</div>';

  // Bed grid — small colored blocks: green = empty, gold/orange = occupied
  const bedBlocks = [];
  for(let i = 0; i < dept.beds; i++){
    const occupied = i < dept.occupiedBeds;
    const color    = occupied ? '#f97316' : 'var(--green)';
    bedBlocks.push(`<div title="${occupied ? 'Occupied' : 'Available'}"
                         style="width:18px;height:18px;border-radius:2px;
                                background:${color};opacity:${occupied ? 1 : 0.35};
                                border:1px solid rgba(255,255,255,.15);"></div>`);
  }
  const bedGrid = `
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px;">
      ${bedBlocks.join('')}
      <span style="margin-left:8px;font-size:.8rem;color:var(--muted);align-self:center;">
        ${dept.occupiedBeds} / ${dept.beds} beds occupied
      </span>
    </div>`;

  // Patient rows
  let patientRows = '';
  if(!dept.patients.length){
    patientRows = '<div class="empty-msg">No patients in this department.</div>';
  } else {
    patientRows = dept.patients.map(pt => {
      const injCfg    = BAM_CONFIG.injuryTypes[pt.injuryType] || {};
      const dptLabel  = BAM_CONFIG.hospitalDepartments[pt.stage]?.label || pt.stage;
      const elapsed   = Math.max(0, gameSeconds - (pt.stageStartSec || gameSeconds));
      const pct       = pt.stageDurationSec
                          ? Math.min(100, Math.round((elapsed / pt.stageDurationSec) * 100))
                          : 0;
      const remaining = Math.max(0, (pt.stageDurationSec || 0) - elapsed);
      const timeInHosp = Math.max(0, gameSeconds - (pt.arrivalGameSec || gameSeconds));

      const tierColors = { minor:'var(--green)', serious:'var(--gold)', critical:'var(--accent)' };
      const tierColor  = tierColors[pt.tier] || 'var(--muted)';
      const stageColor = pct >= 90 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--ems)';

      return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:2px;
                          padding:10px 12px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <div>
            <span style="font-weight:700;font-size:.9rem;color:var(--text);">
              ${_escHtml(injCfg.label || pt.injuryType)}
            </span>
            <span style="margin-left:8px;font-size:.8rem;font-family:var(--mono);
                         border:1px solid ${tierColor};color:${tierColor};
                         border-radius:10px;padding:1px 6px;text-transform:uppercase;">
              ${pt.tier}
            </span>
          </div>
          <div style="font-size:.8rem;color:var(--muted);font-family:var(--mono);">
            In hospital: ${formatETA(timeInHosp)}
          </div>
        </div>
        <div style="font-size:.8rem;color:var(--muted);margin-bottom:5px;">
          Stage: <span style="color:var(--text);">${dptLabel}</span>
          ${pt.stageQueue.length ? `→ ${pt.stageQueue.map(k => BAM_CONFIG.hospitalDepartments[k]?.label || k).join(' → ')}` : ''}
        </div>
        <!-- Stage progress bar — IDs allow _updateHospitalProgressBars() to update in-place -->
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="res-bar-track" style="flex:1;">
            <div class="res-bar-fill" id="pt-stage-fill-${pt.id}"
                 style="width:${pct}%;background:${stageColor};"></div>
          </div>
          <span id="pt-stage-pct-${pt.id}"
                style="font-size:.8rem;font-family:var(--mono);color:${stageColor};min-width:40px;">
            ${pct}%
          </span>
          <span id="pt-stage-rem-${pt.id}"
                style="font-size:.8rem;color:var(--muted);font-family:var(--mono);">
            ${remaining > 0 ? formatETA(remaining) + ' left' : 'complete'}
          </span>
        </div>
      </div>`;
    }).join('');
  }

  // Add Beds section
  const costPerBed = deptCfg?.costPerBed || 2000;
  const bedCountOpts = [1,2,5,10].map(n =>
    `<option value="${n}">${n} bed${n>1?'s':''} — $${(n*costPerBed).toLocaleString()}</option>`
  ).join('');

  return `
    <div class="section-title">${deptCfg?.label || deptKey} — Bed Status</div>
    ${bedGrid}
    <div class="section-title">Patients</div>
    ${patientRows}
    <div class="section-title" style="margin-top:16px;">Add Beds</div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
      <select id="hm-bed-count-${deptKey}" style="font-size:.82rem;padding:5px 8px;"
              onchange="_onBedCountChange('${hospital.id}','${deptKey}')">
        ${bedCountOpts}
        <option value="custom">Custom…</option>
      </select>
      <button class="btn-sm" onclick="_buyHospitalBeds('${hospital.id}','${deptKey}')">Purchase</button>
      <span style="font-size:.8rem;color:var(--muted);">$${costPerBed.toLocaleString()} per bed</span>
    </div>
    <div id="hm-custom-bed-row-${deptKey}" style="display:none;margin-bottom:6px;">
      <input id="hm-custom-bed-count-${deptKey}" type="number" min="1" placeholder="Number of beds"
             style="width:160px;padding:5px 8px;font-size:.82rem;"/>
      <button class="btn-sm" style="margin-left:6px;"
              onclick="_buyHospitalBedsCustom('${hospital.id}','${deptKey}')">Buy</button>
    </div>`;
}

// Renders the Offloading tab — shows units currently offloading at this hospital.
function _renderOffloadingTab(hospital, offloadingUnits){
  if(!offloadingUnits.length){
    return '<div class="empty-msg">No units currently offloading.</div>';
  }
  const rows = offloadingUnits.map(({unit, station}) => {
    const remSec = unit.offloadEndSec ? Math.max(0, unit.offloadEndSec - gameSeconds) : 0;
    const uCfg = BAM_CONFIG.unitTypes[unit.typeKey] || {};
    // Find the patient this unit delivered (matched by transportUnitId)
    let patientDisplay = '—';
    for(const dept of Object.values(hospital.departments)){
      const pt = dept.patients.find(p => p.transportUnitId === unit.id);
      if(pt){
        const injCfg = BAM_CONFIG.injuryTypes[pt.injuryType] || {};
        const tierColors = { minor:'var(--green)', serious:'var(--gold)', critical:'var(--accent)' };
        const tierColor  = tierColors[pt.tier] || 'var(--muted)';
        patientDisplay = `<span style="color:var(--text);">${_escHtml(injCfg.label||pt.injuryType)}</span>
          <span style="font-size:.8rem;color:${tierColor};margin-left:4px;">${pt.tier}</span>`;
        break;
      }
    }
    return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:2px;
                        padding:10px 12px;margin-bottom:6px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div>
          <span style="font-weight:700;font-size:.9rem;color:var(--ems);">${_escHtml(unit.name)}</span>
          <span style="font-size:.8rem;color:var(--muted);margin-left:8px;">${uCfg.label||unit.typeKey}</span>
        </div>
        <span id="offload-rem-${unit.id}"
              style="font-size:.8rem;font-family:var(--mono);color:var(--ems);">
          ${formatETA(remSec)} until clear
        </span>
      </div>
      <div style="font-size:.8rem;color:var(--muted);">
        Patient: ${patientDisplay}
        &nbsp;·&nbsp; Returns to: <span style="color:var(--text);">${_escHtml(station.name)}</span>
      </div>
      <!-- Offload progress bar -->
      <div class="res-bar-track" style="margin-top:6px;">
        <div class="res-bar-fill" style="width:${
          (unit.offloadEndSec && unit.offloadStartSec && unit.offloadEndSec > unit.offloadStartSec)
            ? Math.min(100, Math.round(((gameSeconds - unit.offloadStartSec) / (unit.offloadEndSec - unit.offloadStartSec)) * 100))
            : 0
        }%;background:var(--ems);"></div>
      </div>
    </div>`;
  }).join('');
  return `<div class="section-title">Units Offloading</div>${rows}`;
}

// Renders the "Purchase Department" tab content.
function _renderPurchaseTab(hospital, availableDepts){
  if(!availableDepts.length){
    return '<div class="empty-msg">All available departments are installed.</div>';
  }
  const rows = availableDepts.map(deptKey => {
    const cfg      = BAM_CONFIG.hospitalDepartments[deptKey];
    const canAfford = money >= cfg.cost;
    return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:2px;
                        padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:12px;">
      <div style="flex:1;">
        <div style="font-weight:700;font-size:.9rem;color:var(--gold);">${cfg.label}</div>
        <div style="font-size:.8rem;color:var(--muted);margin-top:2px;">
          ${cfg.baseBeds} beds &nbsp;·&nbsp;
          Stage: ${formatETA(cfg.stageDurationMinSec)}–${formatETA(cfg.stageDurationMaxSec)}
        </div>
      </div>
      <button class="btn-sm${canAfford ? '' : ' danger'}"
              onclick="purchaseDepartment('${hospital.id}','${deptKey}')"
              ${canAfford ? '' : 'disabled'}>
        $${cfg.cost.toLocaleString()}
      </button>
    </div>`;
  }).join('');
  return `<div class="section-title">Available Departments</div>${rows}`;
}

// ── ADD BEDS HELPERS ──────────────────────────────────────────────────────────

// Toggles the custom bed count input visible when "Custom…" is selected.
function _onBedCountChange(hospitalId, deptKey){
  const sel = document.getElementById('hm-bed-count-'+deptKey);
  const row = document.getElementById('hm-custom-bed-row-'+deptKey);
  if(!sel||!row) return;
  row.style.display = sel.value === 'custom' ? 'block' : 'none';
}

// Purchases a preset number of beds for the given hospital department.
function _buyHospitalBeds(hospitalId, deptKey){
  const sel = document.getElementById('hm-bed-count-'+deptKey);
  if(!sel) return;
  if(sel.value === 'custom'){
    document.getElementById('hm-custom-bed-row-'+deptKey)?.style && (document.getElementById('hm-custom-bed-row-'+deptKey).style.display='block');
    return;
  }
  const count = parseInt(sel.value);
  if(!count || count < 1) return;
  _addBedsToHospital(hospitalId, deptKey, count);
}

// Purchases a custom number of beds entered in the text input.
function _buyHospitalBedsCustom(hospitalId, deptKey){
  const input = document.getElementById('hm-custom-bed-count-'+deptKey);
  if(!input) return;
  const count = parseInt(input.value);
  if(!count || count < 1){ setStatus('⚠️ Enter a valid number of beds.'); return; }
  _addBedsToHospital(hospitalId, deptKey, count);
}

// Core logic: deducts cost and adds beds to the department.
function _addBedsToHospital(hospitalId, deptKey, count){
  const h = hospitals.find(x => x.id === hospitalId);
  if(!h || !h.departments[deptKey]) return;
  const deptCfg = BAM_CONFIG.hospitalDepartments[deptKey];
  const costPerBed = deptCfg?.costPerBed || 2000;
  const totalCost = count * costPerBed;
  if(money < totalCost){ setStatus(`⚠️ Need $${totalCost.toLocaleString()} — only $${Math.floor(money).toLocaleString()} available.`); return; }
  updateMoney(-totalCost);
  logCashflow(-totalCost, `[HOSPITAL] Added ${count} bed${count>1?'s':''} to ${h.name} — ${deptCfg?.label||deptKey}`);
  h.departments[deptKey].beds += count;
  setStatus(`✅ Added ${count} bed${count>1?'s':''} to ${deptCfg?.label||deptKey}. ($${totalCost.toLocaleString()})`);
  _renderHospitalModal();
}

// ── RENAME HELPERS ─────────────────────────────────────────────────────────────

function _toggleHospitalRename(id){
  _hospRenameActive = !_hospRenameActive;
  _renderHospitalModal();
  if(_hospRenameActive){
    setTimeout(() => document.getElementById('hm-rename-input')?.focus(), 50);
  }
}

function _commitHospitalRename(id){
  const input = document.getElementById('hm-rename-input');
  if(input) renameHospital(id, input.value);
  _hospRenameActive = false;
}

function _cancelHospitalRename(){
  _hospRenameActive = false;
  _renderHospitalModal();
}

// ── PATIENT CREATION HELPER ───────────────────────────────────────────────────

// Creates a patient object ready to be attached to an incident.
// Called from index.html's spawnIncident() when building the patient list.
// status starts as 'stabilizing' — progresses via stabilization bars.
function createPatient(injuryType, incidentId){
  const injCfg = BAM_CONFIG.injuryTypes[injuryType] || {};
  return {
    id:                _ptId(),
    injuryType,
    tier:              injCfg.patientTier || 'minor',
    incidentId,
    stabilizeProgress: 0.0,
    status:            'stabilizing',   // stabilizing → stabilized → in_transport → admitted → discharged
    transportUnitId:   null,
    hospitalId:        null,
    arrivalGameSec:    null,
    stage:             null,
    stageQueue:        [],
    stageStartSec:     null,
    stageDurationSec:  null,
    revenueEarned:     0,
  };
}

// ── UTILITIES ─────────────────────────────────────────────────────────────────

// HTML-escapes a string to prevent injection in innerHTML.
function _escHtml(str){
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── SAVE / LOAD ───────────────────────────────────────────────────────────────

// Returns serializable hospital data for the save file.
// Strips Leaflet marker references which cannot be serialized.
function getHospitalSaveData(){
  return hospitals.map(h => ({
    id:               h.id,
    name:             h.name,
    type:             h.type,
    lat:              h.lat,
    lng:              h.lng,
    inService:        h.inService,
    onDiversion:      h.onDiversion,
    helipadInstalled: h.helipadInstalled,
    departments: Object.fromEntries(
      Object.entries(h.departments).map(([k, dept]) => [k, {
        beds:         dept.beds,
        occupiedBeds: dept.occupiedBeds,
        patients:     dept.patients.map(pt => ({
          // Preserve all stage state so processing continues from where it left off
          id:                pt.id,
          injuryType:        pt.injuryType,
          tier:              pt.tier,
          incidentId:        pt.incidentId,
          stabilizeProgress: pt.stabilizeProgress,
          status:            pt.status,
          transportUnitId:   pt.transportUnitId,
          hospitalId:        pt.hospitalId,
          arrivalGameSec:    pt.arrivalGameSec,
          stage:             pt.stage,
          stageQueue:        [...(pt.stageQueue || [])],
          stageStartSec:     pt.stageStartSec,
          stageDurationSec:  pt.stageDurationSec,
          revenueEarned:     pt.revenueEarned,
        })),
      }])
    ),
  }));
}

// Rebuilds hospitals from saved data and reattaches map markers.
// Stage timers resume from saved timestamps — no exploit to clear beds by reloading.
function loadHospitalData(savedHospitals){
  hospitals = [];
  if(!savedHospitals?.length) return;

  savedHospitals.forEach(data => {
    const marker = _buildHospitalMarker(data.id, data.lat, data.lng, data.name);
    if(!data.inService) marker.setOpacity(0.4);
    if(data.onDiversion) marker.setOpacity(0.5);

    const depts = {};
    Object.entries(data.departments || {}).forEach(([k, dept]) => {
      depts[k] = {
        beds:         dept.beds,
        occupiedBeds: dept.occupiedBeds,
        patients:     (dept.patients || []).map(pt => ({ ...pt, stageQueue: pt.stageQueue || [] })),
      };
    });

    hospitals.push({
      id:               data.id,
      name:             data.name,
      type:             data.type || 'hospital',
      lat:              data.lat,
      lng:              data.lng,
      marker,
      inService:        data.inService !== false,
      onDiversion:      data.onDiversion || false,
      helipadInstalled: data.helipadInstalled || false,
      departments:      depts,
    });
  });
}
