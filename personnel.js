// =============================================================================
// BY ANY MEANS — PERSONNEL MODULE (Phase 5B)
// =============================================================================
// Owns everything about individual responders:
//   • Career personnel data model (`personnel[]` top-level state)
//   • Cert taxonomy + equivalency expansion (paramedic counts as EMT, etc.)
//   • Crew matching against unit min/ideal slots (greedy bipartite, slot rule)
//   • Auto-staff / batch-hire economics (hire cost = base + Σ cert costs)
//   • Per-station and per-unit roster summary rendering
//   • Personnel tab in the Operations Modal
//
// Depends on: config.js, stations.js (stations[]), index.html (money, updateMoney,
// logCashflow, setStatus, gameSeconds). Loaded after units.js.
// =============================================================================

// ── STATE ────────────────────────────────────────────────────────────────────
// Top-level array of every career responder in the world.
// Volunteers land in 5D and will share the same shape with type='volunteer'.
// Each record:
//   { id, name, stationId, pinnedUnitId, type, rank, certs[], preference,
//     status, currentAssignment, createdAt, playerEdited }
let personnel = [];

// Operations Modal → Personnel tab state. Live filters/sort across renders.
let _personnelTabSearch        = '';
let _personnelTabStationFilter = '';   // station id; '' = all
let _personnelTabCertFilter    = '';   // cert id;    '' = all
let _personnelTabSort          = 'station';  // station | name | rank | certs | status

// Add-personnel modal state (single + batch hire).
let _addPersonModalStationId = null;
let _addPersonModalBatch     = false;
let _addPersonModalCerts     = new Set();
let _addPersonModalCount     = 1;
let _addPersonModalName      = '';
let _addPersonModalPref      = 'either';

// ── ID GENERATION ───────────────────────────────────────────────────────────
// Personnel use the `p_` prefix per docs/conventions.md.
function _genPersonnelId(){
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// =============================================================================
// CERTIFICATION HELPERS
// =============================================================================

// Returns the union of a person's held certs PLUS every cert those certs
// transitively satisfy. Example: ['paramedic'] → {paramedic, aemt, emt, emr}.
// Used by the crew matcher so a Paramedic can fill an EMT crew slot.
function expandCertSet(certIds){
  const out = new Set();
  const defs = BAM_CONFIG.certifications || {};
  const walk = (id) => {
    if(!id || out.has(id)) return;
    out.add(id);
    const def = defs[id];
    if(!def) return;
    (def.satisfies || []).forEach(walk);
  };
  (certIds || []).forEach(walk);
  return out;
}

// True if a person holds (or satisfies) a given cert via transitive equivalency.
function personHasCert(person, certId){
  if(!person || !certId) return false;
  return expandCertSet(person.certs || []).has(certId);
}

// Validates that a candidate cert list is internally consistent (every prereq
// is also present). Used at hire time to prevent paying for AEMT without EMT.
// Returns { ok, missing } — missing lists the unmet prereq codes.
function validateCertPrereqs(certIds){
  const have = new Set(certIds || []);
  const defs = BAM_CONFIG.certifications || {};
  const missing = [];
  have.forEach(c => {
    const def = defs[c];
    if(!def) return;
    (def.prereqs || []).forEach(p => {
      if(!have.has(p) && !expandCertSet([...have]).has(p)) missing.push(p);
    });
  });
  return { ok: missing.length === 0, missing };
}

// =============================================================================
// ECONOMICS
// =============================================================================

// Returns the $ cost to onboard `count` responders, each holding every cert in
// `certs`. Cost = (PERSONNEL_HIRE_COST_BASE + Σ cert.cost) × count.
// Unknown cert codes are charged 0 (defensive — should never happen in practice).
function calcHireCost({ count = 1, certs = [] } = {}){
  const defs = BAM_CONFIG.certifications || {};
  const certTotal = certs.reduce((sum, c) => sum + (defs[c]?.cost || 0), 0);
  const perPerson = (BAM_CONFIG.personnelHireCostBase || 0) + certTotal;
  return perPerson * Math.max(0, count|0);
}

// =============================================================================
// CRUD
// =============================================================================

// Returns the personnel record with the given id, or null.
function getPersonnelById(id){
  return personnel.find(p => p.id === id) || null;
}

// Returns all personnel currently assigned to a station.
function getPersonnelByStation(stationId){
  return personnel.filter(p => p.stationId === stationId);
}

// Returns all personnel currently pinned to a specific unit.
function getPinnedPersonnelForUnit(unitId){
  return personnel.filter(p => p.pinnedUnitId === unitId);
}

// Picks a random first+last name from the config pools. Used by auto-staff
// and as the default name when the player doesn't type one in Add Person.
function _randomPersonName(){
  const fn = BAM_CONFIG.firstNames || ['Jane'];
  const ln = BAM_CONFIG.lastNames  || ['Doe'];
  return fn[Math.floor(Math.random() * fn.length)] + ' ' + ln[Math.floor(Math.random() * ln.length)];
}

// Picks a sensible default `rank` from a cert set (used for new hires before
// 5C builds the rank picker). Returns a free-text rank string.
function _defaultRankFromCerts(certs){
  const set = expandCertSet(certs);
  if(set.has('fire_officer_2'))   return 'Battalion Chief';
  if(set.has('fire_officer_1'))   return 'Lieutenant';
  if(set.has('paramedic'))        return 'Paramedic';
  if(set.has('aemt'))             return 'AEMT';
  if(set.has('emt'))              return 'EMT';
  if(set.has('emr'))              return 'EMR';
  if(set.has('patrol_supervisor'))return 'Sergeant';
  if(set.has('patrol_officer'))   return 'Patrol Officer';
  if(set.has('ff2'))              return 'Senior Firefighter';
  if(set.has('ff1'))              return 'Firefighter';
  return 'Probationary';
}

// Creates one personnel record. Does NOT debit money — callers (addPersonnel,
// batchAddPersonnel, generateStarterRoster) handle cashflow.
function _createPersonnelRecord(stationId, { name, type='career', rank, certs=[], preference='either' } = {}){
  const finalCerts = Array.from(new Set(certs)); // dedupe
  const rec = {
    id: _genPersonnelId(),
    name: (name && name.trim()) || _randomPersonName(),
    stationId,
    pinnedUnitId: null,
    type,
    rank: rank || _defaultRankFromCerts(finalCerts),
    certs: finalCerts,
    preference,
    status: 'available',
    currentAssignment: null,
    createdAt: Date.now(),
    playerEdited: false
  };
  personnel.push(rec);
  return rec;
}

// Public: hire one career responder. Debits hire cost upfront and logs cashflow.
// Returns the created record on success, or null if funds are insufficient.
function addPersonnel(stationId, opts = {}){
  const cost = calcHireCost({ count:1, certs: opts.certs || [] });
  if(money < cost){
    setStatus(`Cannot hire — need $${cost.toLocaleString()}, have $${money.toLocaleString()}.`);
    return null;
  }
  updateMoney(-cost);
  logCashflow(-cost, `Hired ${opts.name || 'new responder'}`);
  const rec = _createPersonnelRecord(stationId, opts);
  setStatus(`Hired ${rec.name} (${rec.rank}) — −$${cost.toLocaleString()}.`);
  return rec;
}

// Public: hire `count` identical career responders in one transaction.
// Returns { hired, cost, ok }. If funds are insufficient, hires zero.
function batchAddPersonnel(stationId, { count = 1, certs = [], preference = 'either' } = {}){
  const cost = calcHireCost({ count, certs });
  if(money < cost){
    setStatus(`Cannot batch-hire — need $${cost.toLocaleString()}, have $${money.toLocaleString()}.`);
    return { hired: [], cost, ok: false };
  }
  updateMoney(-cost);
  logCashflow(-cost, `Batch hired ${count} responder${count===1?'':'s'}`);
  const hired = [];
  for(let i = 0; i < count; i++){
    hired.push(_createPersonnelRecord(stationId, { certs, preference }));
  }
  setStatus(`Hired ${count} responder${count===1?'':'s'} — −$${cost.toLocaleString()}.`);
  return { hired, cost, ok: true };
}

// Public: removes a personnel record. Blocks if status==='busy' unless force.
// Returns { ok, conflicts } — conflicts describes why removal was refused.
function deletePersonnel(personnelId, { force = false } = {}){
  const idx = personnel.findIndex(p => p.id === personnelId);
  if(idx < 0) return { ok: false, conflicts: ['not_found'] };
  const p = personnel[idx];
  if(p.status === 'busy' && !force){
    return { ok: false, conflicts: ['on_active_assignment'] };
  }
  // If force-deleting a busy responder, also detach from the unit they're on.
  if(p.status === 'busy' && p.currentAssignment?.unitId){
    // Defensive: the unit's crew list lives in personnel.pinnedUnitId for pinned,
    // or transient assignment for auto-assigned. No mirrored field to clean here.
  }
  personnel.splice(idx, 1);
  return { ok: true, conflicts: [] };
}

// Public: moves a person to a different station. First-class non-destructive
// action — the alternative to delete + re-hire. Clears any pin (pin belongs
// to a unit at the old station). Returns the updated record or null.
function reassignPersonnel(personnelId, newStationId){
  const p = getPersonnelById(personnelId);
  if(!p) return null;
  const oldStationId = p.stationId;
  p.stationId    = newStationId;
  p.pinnedUnitId = null;          // pin doesn't carry across stations
  p.playerEdited = true;
  setStatus(`${p.name} reassigned.`);
  return p;
}

// Public: patches arbitrary fields on a person (name, certs, preference, rank).
// Marks playerEdited=true so 5D's auto-migration logic leaves this person alone.
function updatePersonnel(personnelId, patch = {}){
  const p = getPersonnelById(personnelId);
  if(!p) return null;
  Object.assign(p, patch);
  p.playerEdited = true;
  return p;
}

// Public: pins a person to a specific unit (or unpins when unitId is null).
// Pinned personnel are tried first by the crew matcher before pool fallback.
// Validates that the unit belongs to the person's station; otherwise no-op.
function pinPersonnelToUnit(personnelId, unitId){
  const p = getPersonnelById(personnelId);
  if(!p) return null;
  if(unitId === null){
    p.pinnedUnitId = null;
    return p;
  }
  // Verify the unit is at the person's current station.
  const station = stations.find(s => s.id === p.stationId);
  if(!station || !station.units?.some(u => u.id === unitId)){
    setStatus('Cannot pin — unit is not at this person\'s station.');
    return null;
  }
  p.pinnedUnitId = unitId;
  return p;
}

// =============================================================================
// AUTO-STAFFING
// =============================================================================

// Returns the resolved crew-default block for a unit, honoring per-unit overrides.
// Falls back to BAM_CONFIG.crewDefaults[unit.typeKey] when unit.crewMin/Ideal are null.
function _resolveCrewDefaults(unit){
  const base = BAM_CONFIG.crewDefaults?.[unit.typeKey] || { driverCert: null, min: {}, ideal: {} };
  return {
    driverCert: base.driverCert,
    min:        unit.crewMin   || base.min   || {},
    ideal:      unit.crewIdeal || base.ideal || {}
  };
}

// Sums every cert needed to ideally staff every unit at the station, treating
// each unit's `ideal` as a discrete demand. Used by auto-staff to size hires.
// Returns a map { certId: totalCountNeeded }.
function _sumIdealCertDemand(station){
  const demand = {};
  (station.units || []).forEach(u => {
    const { ideal } = _resolveCrewDefaults(u);
    Object.entries(ideal).forEach(([cert, n]) => {
      demand[cert] = (demand[cert] || 0) + n;
    });
  });
  return demand;
}

// Public: auto-generate a starter roster for a station, sized to ideal-staff
// every unit at that station once. Free in 'create' mode (called automatically
// at station creation, like seed personnel); debited in 'topup' mode when the
// player clicks "Refresh / Auto-staff to ideal".
//
// Strategy: greedily create one person per ideal slot, holding exactly that
// cert. The crew matcher takes care of equivalency later — we don't need to
// stack certs on each new hire here. Player can train them up later.
function generateStarterRoster(stationId, { mode = 'create' } = {}){
  const station = stations.find(s => s.id === stationId);
  if(!station) return [];
  const demand = _sumIdealCertDemand(station);
  const certKeys = Object.keys(demand);
  // Build a flat list of cert assignments — one entry per person we'll create.
  const slots = [];
  certKeys.forEach(c => { for(let i = 0; i < demand[c]; i++) slots.push(c); });
  if(!slots.length) return [];

  // Cost: free at station creation (the "starter roster" is part of the build);
  // paid per-person on topup. Use calcHireCost with one cert each, sum them.
  if(mode === 'topup'){
    // Only hire to fill the GAP vs current roster cert capability.
    const currentSupply = {};
    getPersonnelByStation(stationId).forEach(p => {
      expandCertSet(p.certs).forEach(c => {
        currentSupply[c] = (currentSupply[c] || 0) + 1;
      });
    });
    // Filter slots: skip if currentSupply already covers it.
    // Greedy: decrement supply as we mark slots as already-covered.
    const supply = { ...currentSupply };
    const remaining = [];
    slots.forEach(c => {
      if((supply[c] || 0) > 0){ supply[c]--; }
      else                     { remaining.push(c); }
    });
    if(!remaining.length){
      setStatus('Roster already meets ideal staffing.');
      return [];
    }
    const cost = remaining.reduce((sum, c) => sum + calcHireCost({ count:1, certs:[c] }), 0);
    if(money < cost){
      setStatus(`Top-up costs $${cost.toLocaleString()} — funds insufficient.`);
      return [];
    }
    updateMoney(-cost);
    logCashflow(-cost, `Auto-staff top-up at ${station.name}`);
    const hired = remaining.map(c => _createPersonnelRecord(stationId, { certs:[c] }));
    setStatus(`Hired ${hired.length} for ${station.name} — −$${cost.toLocaleString()}.`);
    return hired;
  }

  // mode === 'create' — free seed roster bundled with station purchase.
  const hired = slots.map(c => _createPersonnelRecord(stationId, { certs:[c] }));
  return hired;
}

// =============================================================================
// CASCADE HOOK (called from station delete in stations.js)
// =============================================================================

// Removes every personnel record attached to a station. Used by the station
// delete flow. Force=true skips the busy check (matches station force-delete).
// Returns { removed, blocked } — blocked lists personnel who were busy and
// not removed when force=false.
function cascadeDeletePersonnelForStation(stationId, { force = false } = {}){
  const removed = [];
  const blocked = [];
  // Walk a copy so splicing is safe.
  personnel.slice().forEach(p => {
    if(p.stationId !== stationId) return;
    const res = deletePersonnel(p.id, { force });
    if(res.ok) removed.push(p.id); else blocked.push(p.id);
  });
  return { removed, blocked };
}

// =============================================================================
// UNIT LOOKUP + CREW SCOPE HELPERS
// =============================================================================

// Walks the stations array to find a {unit, station} pair for a unit id.
// Returns { unit:null, station:null } when not found.
function _findUnitAndStation(unitId){
  for(const s of (stations || [])){
    const u = s.units?.find(x => x.id === unitId);
    if(u) return { unit: u, station: s };
  }
  return { unit: null, station: null };
}

// Returns every personnel record currently eligible to crew a specific unit:
//   • Same station
//   • status === 'available' (not on another call)
//   • Either pinned to THIS unit, or not pinned to any unit (free pool)
// Pinned-to-other-unit personnel are reserved and excluded.
function getCrewForUnit(unitId){
  const { unit, station } = _findUnitAndStation(unitId);
  if(!unit || !station) return [];
  return personnel.filter(p =>
       p.stationId === station.id
    && p.status === 'available'
    && (p.pinnedUnitId === unitId || p.pinnedUnitId == null)
  );
}

// =============================================================================
// CREW MATCHING  (greedy bipartite with min-degree heuristic + slot rule)
// =============================================================================
//
// matchCrewToRequirements(crew, reqMap):
//   reqMap = { certId: requiredCount, ... }
//   Each "slot" in reqMap is filled by exactly one person (crew-slot rule per
//   Phase5.md — one person cannot occupy multiple slots, even if multi-cert).
//
//   Matching strategy (mirrors the pattern in countMetRequirements()):
//     1. Expand each person's cert set transitively (paramedic→aemt→emt→emr).
//     2. Repeatedly pick the slot with the FEWEST remaining candidates among
//        unused crew. This prevents painting yourself into a corner where a
//        rare-cert slot becomes unfillable because a multi-cert person already
//        burned themselves on an easier slot.
//     3. Within that slot, prefer the candidate with the FEWEST other slots
//        they could still fill (minimum-degree). This protects multi-cert
//        responders for harder slots later in the pass.
//
//   Returns:
//     { matched: [{slotCert, personId}], unfilled: {certId: remainingCount} }
function matchCrewToRequirements(crew, reqMap){
  // Build per-person expanded cert sets up front (cheap, used repeatedly).
  const personCerts = new Map();
  (crew || []).forEach(p => personCerts.set(p.id, expandCertSet(p.certs)));

  // Materialize one slot object per required cert count.
  let slots = [];
  Object.entries(reqMap || {}).forEach(([cert, n]) => {
    for(let i = 0; i < n; i++) slots.push({ cert });
  });

  const matched   = [];
  const usedIds   = new Set();
  const unfilled  = {};

  while(slots.length){
    // For each remaining slot, list eligible candidates (unused crew that satisfy this cert).
    slots.forEach(s => {
      s._candidates = (crew || [])
        .filter(p => !usedIds.has(p.id) && personCerts.get(p.id).has(s.cert))
        .map(p => p.id);
    });
    // Pick slot with fewest candidates (rarest demand first).
    slots.sort((a,b) => a._candidates.length - b._candidates.length);
    const next = slots.shift();
    if(!next._candidates.length){
      // Slot is unfillable — count it, plus everything else of the same cert
      // that hasn't been matched yet (since matching another would also fail).
      unfilled[next.cert] = (unfilled[next.cert] || 0) + 1;
      // Continue the loop so we count ALL unfilled slots (UI displays "needs N of X").
      continue;
    }
    // Among candidates, prefer the one with the LEAST flexibility for the remaining slots.
    next._candidates.sort((aId, bId) => {
      const aSet = personCerts.get(aId);
      const bSet = personCerts.get(bId);
      const aDeg = slots.filter(s => aSet.has(s.cert)).length;
      const bDeg = slots.filter(s => bSet.has(s.cert)).length;
      return aDeg - bDeg;
    });
    const chosenId = next._candidates[0];
    usedIds.add(chosenId);
    matched.push({ slotCert: next.cert, personId: chosenId });
  }
  return { matched, unfilled };
}

// True if at least one crew member on the unit holds the unit's driver cert
// (or the unit has no driver gate — e.g., helicopter). HARD GATE — apparatus
// cannot move without a qualified driver, no override.
function hasQualifiedDriver(unitId, crewOverride){
  const { unit } = _findUnitAndStation(unitId);
  if(!unit) return false;
  const { driverCert } = _resolveCrewDefaults(unit);
  if(!driverCert) return true;  // aircraft etc. — no driver gate
  const crew = crewOverride || getCrewForUnit(unitId);
  return crew.some(p => personHasCert(p, driverCert));
}

// Returns the unit's effective minimum-crew status. Used by the dispatch gate.
// Shape: { ok, missing, hasDriver, crew, matched, driverCert }
function hasMinimumCrew(unitId){
  const { unit } = _findUnitAndStation(unitId);
  if(!unit) return { ok:false, missing:{}, hasDriver:false, crew:[], matched:[], driverCert:null };
  const { min, driverCert } = _resolveCrewDefaults(unit);
  const crew      = getCrewForUnit(unitId);
  const hasDriver = driverCert ? crew.some(p => personHasCert(p, driverCert)) : true;
  const { matched, unfilled } = matchCrewToRequirements(crew, min);
  return {
    ok:        Object.keys(unfilled).length === 0,
    missing:   unfilled,
    hasDriver,
    crew,
    matched,
    driverCert
  };
}

// Same as hasMinimumCrew but against the unit's `ideal` slots. Falling short
// of ideal does NOT block dispatch — it kicks the ideal-wait timer per policy.
function hasIdealCrew(unitId){
  const { unit } = _findUnitAndStation(unitId);
  if(!unit) return { ok:false, missing:{}, hasDriver:false, crew:[], matched:[], driverCert:null };
  const { ideal, driverCert } = _resolveCrewDefaults(unit);
  const crew      = getCrewForUnit(unitId);
  const hasDriver = driverCert ? crew.some(p => personHasCert(p, driverCert)) : true;
  const { matched, unfilled } = matchCrewToRequirements(crew, ideal);
  return {
    ok:        Object.keys(unfilled).length === 0,
    missing:   unfilled,
    hasDriver,
    crew,
    matched,
    driverCert
  };
}

// =============================================================================
// IDEAL-CREW WAIT TIMER  (Phase 5B data shape; activated in 5D)
// =============================================================================
// The unit/station/global idealCrewWaitMs fields and the `staffingPolicy` enum
// are persisted from 5B onward. In 5B the timer is effectively a no-op because
// career personnel don't "trickle in" — if a station can't field ideal crew
// right now, it won't in 10 minutes either; the player needs to hire more.
// In 5D when volunteers respond from home/work in transit, the game-loop tick
// will start polling pending dispatches against `idealDeadline` and depart at
// minimum staffing once the deadline hits. The save shape is already correct.
// =============================================================================

// Cascade: unit override → station override → global config default.
// Returns the # of milliseconds the dispatch should wait for ideal crew once
// minimum crew is met, before departing at minimum staffing.
function getEffectiveIdealWaitMs(unitId){
  const { unit, station } = _findUnitAndStation(unitId);
  if(unit?.idealCrewWaitMs != null)    return unit.idealCrewWaitMs;
  if(station?.idealCrewWaitMs != null) return station.idealCrewWaitMs;
  return BAM_CONFIG.idealCrewWaitMs || (10 * 60 * 1000);
}

// =============================================================================
// STATION SUMMARY (used by the Manage Station Personnel block + Personnel tab)
// =============================================================================

// Returns an aggregate roster summary for a station:
//   { total, available, busy, offDuty, byCategory: { fire, ems, police, shared } }
// byCategory counts each PERSON once per category any of their certs belong to.
function getStaffingRatio(stationId){
  const defs   = BAM_CONFIG.certifications || {};
  const roster = getPersonnelByStation(stationId);
  const byCategory = { fire:0, ems:0, police:0, shared:0 };
  let available = 0, busy = 0, offDuty = 0;
  roster.forEach(p => {
    if(p.status === 'available')   available++;
    else if(p.status === 'busy')   busy++;
    else                            offDuty++;
    const cats = new Set();
    (p.certs || []).forEach(c => { if(defs[c]?.category) cats.add(defs[c].category); });
    cats.forEach(cat => { byCategory[cat] = (byCategory[cat] || 0) + 1; });
  });
  return { total: roster.length, available, busy, offDuty, byCategory };
}

// =============================================================================
// CALL-LIFECYCLE HOOKS  (used by dispatch in Step 10)
// =============================================================================

// Marks the matched crew for a unit as busy on a specific call. Called from
// executeDispatch when a unit is dispatched. Uses hasMinimumCrew's matched
// list as the canonical crew that's "on" this call.
// Returns { assigned: personnel[], minMet: bool }.
function assignPersonnelToUnit(unitId, callId){
  const min = hasMinimumCrew(unitId);
  const assigned = [];
  // Also include any pinned personnel who weren't matched into a min slot,
  // so the full pinned crew rides along (matters for the resolution overhaul).
  const matchedIds = new Set(min.matched.map(m => m.personId));
  min.crew.forEach(p => {
    if(matchedIds.has(p.id) || p.pinnedUnitId === unitId){
      p.status = 'busy';
      p.currentAssignment = { unitId, callId };
      assigned.push(p);
    }
  });
  return { assigned, minMet: min.ok };
}

// Releases every responder currently assigned to a unit. Called when the unit
// clears the call (returns available, returning, or back at station).
function releasePersonnelFromUnit(unitId){
  let released = 0;
  personnel.forEach(p => {
    if(p.currentAssignment?.unitId === unitId){
      p.status = 'available';
      p.currentAssignment = null;
      released++;
    }
  });
  return released;
}

// =============================================================================
// HTML ESCAPE HELPER  (scoped to this file)
// =============================================================================
function _escPersonHtml(str){
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// =============================================================================
// RENDERING — Manage Station section + per-unit staffing chip
// =============================================================================

// Formats a "missing" cert map ({ff1:2, evoc_large:1}) into a human string:
// "1 Large Vehicle EVOC, 2 Firefighter 1".
function _formatMissing(missingMap){
  const defs = BAM_CONFIG.certifications || {};
  return Object.entries(missingMap || {})
    .map(([cert, n]) => `${n} ${defs[cert]?.label || cert}`)
    .join(', ');
}

// Returns a compact staffing chip for a unit row. Used in the Manage Station
// unit list and the Unit List tab. Colors mirror the dispatch gate spec:
//   🚫 No driver (red, hard-block)
//   🔴 Below min (red)
//   🟡 Min met, ideal short (yellow)
//   🟢 Ideal met (green)
function renderUnitStaffingChip(unit){
  if(!unit) return '';
  const min   = hasMinimumCrew(unit.id);
  const ideal = hasIdealCrew(unit.id);
  if(!min.hasDriver){
    return `<span class="staffing-chip" style="font-size:.66rem;font-weight:700;background:rgba(232,67,26,.15);color:var(--accent);border:1px solid var(--accent);padding:1px 6px;border-radius:9px;" title="No qualified driver — apparatus cannot move">🚫 No driver</span>`;
  }
  if(!min.ok){
    return `<span class="staffing-chip" style="font-size:.66rem;font-weight:700;background:rgba(232,67,26,.15);color:var(--accent);border:1px solid var(--accent);padding:1px 6px;border-radius:9px;" title="Understaffed: needs ${_escPersonHtml(_formatMissing(min.missing))}">🔴 Understaffed</span>`;
  }
  if(!ideal.ok){
    return `<span class="staffing-chip" style="font-size:.66rem;font-weight:700;background:rgba(251,191,36,.15);color:var(--gold);border:1px solid var(--gold);padding:1px 6px;border-radius:9px;" title="Min crew met. Ideal short: ${_escPersonHtml(_formatMissing(ideal.missing))}">🟡 Min only</span>`;
  }
  return `<span class="staffing-chip" style="font-size:.66rem;font-weight:700;background:rgba(34,197,94,.15);color:var(--green);border:1px solid var(--green);padding:1px 6px;border-radius:9px;" title="Ideal staffing met">🟢 Ready</span>`;
}

// Returns the HTML block injected into the Manage Station modal between the
// DC row and the Units section. Shows:
//   • Station Type dropdown (career/combination/volunteer)
//   • Personnel summary counts (total, on-duty, by category)
//   • Auto-staff top-up button, Add Personnel button, Batch Add button
function renderManageStationPersonnelHTML(s){
  if(!s) return '';
  const ratio    = getStaffingRatio(s.id);
  const stType   = s.stationType || 'career';
  const stTypes  = BAM_CONFIG.stationStaffingTypes || ['career','combination','volunteer'];
  const typeOpts = stTypes.map(t =>
    `<option value="${t}" ${stType===t?'selected':''}>${t[0].toUpperCase()+t.slice(1)}</option>`
  ).join('');

  // Cert-category counts shown as inline chips.
  const catChip = (label, count, color) =>
    `<span style="font-size:.7rem;background:${color};color:#000;padding:1px 6px;border-radius:9px;margin-right:4px;">${label}: ${count}</span>`;
  const chips = [
    catChip('Fire',   ratio.byCategory.fire,   'rgba(224,92,26,.55)'),
    catChip('EMS',    ratio.byCategory.ems,    'rgba(46,168,255,.55)'),
    catChip('Police', ratio.byCategory.police, 'rgba(88,101,242,.55)'),
    catChip('Shared', ratio.byCategory.shared, 'rgba(200,200,200,.4)'),
  ].join('');

  return `<div class="section-title" style="margin-top:14px;">Personnel (Phase 5B)</div>
    <div style="display:grid;grid-template-columns:max-content 1fr;gap:4px 10px;font-size:.82rem;align-items:center;">
      <label class="field-label" style="margin:0;">Staffing Type</label>
      <select onchange="setStationStaffingType('${s.id}', this.value)" style="width:160px;">
        ${typeOpts}
      </select>
      <div style="color:var(--muted);">Roster</div>
      <div>
        <b>${ratio.total}</b> total
        · <span style="color:var(--green);">${ratio.available} available</span>
        · <span style="color:var(--gold);">${ratio.busy} busy</span>
        ${ratio.offDuty ? ` · <span style="color:var(--muted);">${ratio.offDuty} off-duty</span>` : ''}
      </div>
      <div style="color:var(--muted);">Categories</div>
      <div>${chips}</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
      <button class="btn-sm" onclick="openAddPersonnelModal('${s.id}', false)">+ Add Person</button>
      <button class="btn-sm" onclick="openAddPersonnelModal('${s.id}', true)">+ Batch Hire</button>
      <button class="btn-sm" onclick="topUpStationRoster('${s.id}')" title="Hire to fill any ideal-crew shortfall across this station's units">Auto-staff to ideal</button>
      <button class="btn-sm" onclick="openStationPersonnelList('${s.id}')">View Roster</button>
    </div>`;
}

// Wraps generateStarterRoster(_,{mode:'topup'}) and refreshes the modal.
function topUpStationRoster(stationId){
  const hired = generateStarterRoster(stationId, { mode:'topup' });
  // Refresh open modals so chips and counts update.
  if(typeof _renderManageBody === 'function') _renderManageBody();
  if(typeof renderPersonnelTab === 'function') renderPersonnelTab();
  if(typeof renderStationList === 'function') renderStationList();
  return hired;
}

// Persists the player's station-type choice. Refreshes the modal so the
// dropdown selection and any future volunteer-specific UI updates.
function setStationStaffingType(stationId, type){
  const s = stations.find(x => x.id === stationId);
  if(!s) return;
  s.stationType = type;
  if(typeof _renderManageBody === 'function') _renderManageBody();
  setStatus(`${s.name} set to ${type}.`);
}

// Opens the Operations Modal Personnel tab and pre-filters by station. Used
// from the "View Roster" button so the player can drill into the full list.
function openStationPersonnelList(stationId){
  _personnelTabStationFilter = stationId;
  if(typeof switchOpsTab === 'function'){
    closeManageStation?.();
    switchOpsTab('personnel');
  }
}

// =============================================================================
// RENDERING — Unit Details crew roster
// =============================================================================

// Compact one-line label for a personnel row used in the Unit Details modal
// and the Personnel tab. Shows name · rank · cert chips (limited to first 4).
function _renderPersonRowLabel(p){
  const defs = BAM_CONFIG.certifications || {};
  const certList = (p.certs || []).slice(0, 4)
    .map(c => `<span style="background:rgba(255,255,255,0.06);padding:0 5px;border-radius:8px;font-size:.66rem;margin-right:3px;">${_escPersonHtml(defs[c]?.label || c)}</span>`)
    .join('');
  const more = (p.certs?.length || 0) > 4 ? ` <span style="color:var(--muted);font-size:.66rem;">+${p.certs.length - 4}</span>` : '';
  const statusColor = p.status === 'available' ? 'var(--green)' : p.status === 'busy' ? 'var(--gold)' : 'var(--muted)';
  return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
    <span style="font-weight:600;">${_escPersonHtml(p.name)}</span>
    <span style="font-size:.7rem;color:var(--muted);">${_escPersonHtml(p.rank || '')}</span>
    <span style="font-size:.66rem;color:${statusColor};">● ${_escPersonHtml(p.status || 'available')}</span>
    <span style="display:inline-flex;flex-wrap:wrap;">${certList}${more}</span>
  </div>`;
}

// Returns the HTML block injected into the Unit Details modal, replacing the
// Phase 5A "(staffing in Phase 5B)" stub. Surfaces:
//   • Staffing chip (Ready / Min only / Understaffed / No driver)
//   • Pinned crew list with unpin buttons
//   • Free-pool dropdown to pin an additional person
//   • Missing-cert breakdown when below min or ideal
function renderUnitCrewRosterHTML(unitId){
  const { unit, station } = _findUnitAndStation(unitId);
  if(!unit || !station) return '';
  const min   = hasMinimumCrew(unitId);
  const ideal = hasIdealCrew(unitId);
  const chip  = renderUnitStaffingChip(unit);

  const pinned = getPinnedPersonnelForUnit(unitId);
  // Free pool: same station, available, not pinned to any unit.
  const pool = personnel.filter(p =>
    p.stationId === station.id && !p.pinnedUnitId && p.status === 'available'
  );

  // Other-station dropdown options reused per pinned row (non-destructive Reassign action).
  const otherStationOpts = stations
    .filter(other => other.id !== station.id)
    .map(other => `<option value="${other.id}">${_escPersonHtml(other.name)}</option>`).join('');

  const pinnedHtml = pinned.length
    ? pinned.map(p => `<div class="udm-crew-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        ${_renderPersonRowLabel(p)}
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
          <button class="btn-sm" onclick="pinPersonnelToUnit('${p.id}', null); _renderUnitDetails();" title="Remove pin (stays at station)">Unpin</button>
          ${otherStationOpts ? `<select onchange="if(this.value){_reassignFromUnitDetails('${p.id}', this.value);}" style="font-size:.7rem;" title="Reassign to another station">
            <option value="">Reassign…</option>${otherStationOpts}
          </select>` : ''}
        </div>
      </div>`).join('')
    : '<div class="empty-msg" style="font-size:.78rem;padding:6px 0;">No personnel pinned to this unit. Pool members fill slots as needed.</div>';

  const poolOpts = pool.length
    ? `<option value="">— pin from pool —</option>` + pool.map(p =>
        `<option value="${p.id}">${_escPersonHtml(p.name)} (${_escPersonHtml(p.rank || 'responder')})</option>`
      ).join('')
    : `<option value="">— no available pool members —</option>`;

  // Missing-cert breakdown — show min first, then ideal-only gap if min is met.
  const missingHtml = (() => {
    if(!min.hasDriver){
      const defs = BAM_CONFIG.certifications || {};
      const dc = _resolveCrewDefaults(unit).driverCert;
      return `<div style="color:var(--accent);font-size:.78rem;margin-top:6px;">🚫 No qualified driver — need ${_escPersonHtml(defs[dc]?.label || dc)}.</div>`;
    }
    if(!min.ok){
      return `<div style="color:var(--accent);font-size:.78rem;margin-top:6px;">🔴 Below minimum — needs ${_escPersonHtml(_formatMissing(min.missing))}.</div>`;
    }
    if(!ideal.ok){
      return `<div style="color:var(--gold);font-size:.78rem;margin-top:6px;">🟡 Ideal short — would benefit from ${_escPersonHtml(_formatMissing(ideal.missing))}.</div>`;
    }
    return `<div style="color:var(--green);font-size:.78rem;margin-top:6px;">🟢 Ideal crew met.</div>`;
  })();

  return `<div class="section-title" style="margin-top:14px;">Crew Roster</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">${chip}<span style="font-size:.74rem;color:var(--muted);">${pinned.length} pinned · ${pool.length} pool</span></div>
    ${pinnedHtml}
    <div style="margin-top:8px;display:flex;gap:6px;align-items:center;">
      <select id="udm-pin-select" style="flex:1;">${poolOpts}</select>
      <button class="btn-sm" onclick="_unitDetailsPinFromPool('${unitId}')">Pin</button>
    </div>
    ${missingHtml}
    <div style="font-size:.7rem;color:var(--muted);margin-top:4px;">
      Pinned personnel ride this unit first; the matcher fills remaining slots from the station pool at dispatch time.
    </div>`;
}

// Handler used by the Unit Details modal's "Pin" button.
function _unitDetailsPinFromPool(unitId){
  const sel = document.getElementById('udm-pin-select');
  if(!sel || !sel.value) return;
  pinPersonnelToUnit(sel.value, unitId);
  if(typeof _renderUnitDetails === 'function') _renderUnitDetails();
}

// Handler for the Unit Details reassign dropdown. If the person is currently
// busy on a call, confirms before reassigning so the player doesn't accidentally
// pull crew off an active incident.
function _reassignFromUnitDetails(personnelId, newStationId){
  const p = getPersonnelById(personnelId);
  if(!p) return;
  if(p.status === 'busy'){
    if(!confirm(`${p.name} is currently on a call. Reassign anyway? They'll finish the current call from their new station's roster.`)){
      if(typeof _renderUnitDetails === 'function') _renderUnitDetails();
      return;
    }
  }
  reassignPersonnel(personnelId, newStationId);
  if(typeof _renderUnitDetails === 'function')   _renderUnitDetails();
  if(typeof _renderManageBody === 'function')    _renderManageBody();
  if(typeof renderPersonnelTab === 'function')   renderPersonnelTab();
  if(typeof renderStationList === 'function')    renderStationList();
}

// Stub used by buttons that open the personnel details modal (Step 12 wires the
// modal). Until that ships, just routes the player to the Personnel tab,
// pre-scoped to that one person.
function openPersonnelDetails(personnelId){
  // Step 12 will replace this stub with an actual details modal. For now,
  // surface a brief status line so click targets have feedback.
  const p = getPersonnelById(personnelId);
  if(!p){ setStatus('Personnel record not found.'); return; }
  setStatus(`Personnel: ${p.name} — ${p.rank || ''} · ${(p.certs || []).join(', ') || 'no certs'}`);
}

// =============================================================================
// PERSONNEL TAB — Operations Modal
// =============================================================================

// Filter/sort/search setters. Each re-renders the table.
function _personnelTabSetSearch(v){  _personnelTabSearch        = v; renderPersonnelTab(); }
function _personnelTabSetStation(v){ _personnelTabStationFilter = v; renderPersonnelTab(); }
function _personnelTabSetCert(v){    _personnelTabCertFilter    = v; renderPersonnelTab(); }
function _personnelTabSetSort(v){    _personnelTabSort          = v; renderPersonnelTab(); }

// Populates the station and cert filter dropdowns on first render.
function _populatePersonnelFilters(){
  const stSel = document.getElementById('personnel-filter-station');
  if(stSel && !stSel.dataset.populated){
    stSel.innerHTML = '<option value="">All stations</option>'
      + stations.map(s => `<option value="${s.id}">${_escPersonHtml(s.name)}</option>`).join('');
    stSel.dataset.populated = '1';
  }
  const ctSel = document.getElementById('personnel-filter-cert');
  if(ctSel && !ctSel.dataset.populated){
    const defs = BAM_CONFIG.certifications || {};
    ctSel.innerHTML = '<option value="">All certs</option>'
      + Object.entries(defs).map(([k,c]) =>
          `<option value="${k}">${_escPersonHtml(c.label)}</option>`).join('');
    ctSel.dataset.populated = '1';
  }
  // Restore filter selection state in case a station was pre-set via openStationPersonnelList
  if(stSel && _personnelTabStationFilter) stSel.value = _personnelTabStationFilter;
  if(ctSel && _personnelTabCertFilter)    ctSel.value = _personnelTabCertFilter;
  const srch = document.getElementById('personnel-search');
  if(srch && srch.value !== _personnelTabSearch) srch.value = _personnelTabSearch;
}

// Renders the Personnel tab table — every responder across every station, with
// active filters/sort applied.
function renderPersonnelTab(){
  const el = document.getElementById('personnel-list-scroll');
  if(!el) return;
  _populatePersonnelFilters();

  const defs = BAM_CONFIG.certifications || {};
  // Apply filters.
  let rows = personnel.slice();
  if(_personnelTabStationFilter){
    rows = rows.filter(p => p.stationId === _personnelTabStationFilter);
  }
  if(_personnelTabCertFilter){
    rows = rows.filter(p => personHasCert(p, _personnelTabCertFilter));
  }
  if(_personnelTabSearch){
    const q = _personnelTabSearch.toLowerCase();
    rows = rows.filter(p =>
         p.name.toLowerCase().includes(q)
      || (p.rank || '').toLowerCase().includes(q)
      || (p.certs || []).some(c => (defs[c]?.label || c).toLowerCase().includes(q))
    );
  }

  // Sort.
  const stNameOf = id => stations.find(s => s.id === id)?.name || '';
  rows.sort((a, b) => {
    switch(_personnelTabSort){
      case 'name':   return a.name.localeCompare(b.name);
      case 'rank':   return (a.rank || '').localeCompare(b.rank || '') || a.name.localeCompare(b.name);
      case 'certs':  return (b.certs?.length || 0) - (a.certs?.length || 0) || a.name.localeCompare(b.name);
      case 'status': return (a.status || '').localeCompare(b.status || '') || a.name.localeCompare(b.name);
      case 'station':
      default:       return stNameOf(a.stationId).localeCompare(stNameOf(b.stationId)) || a.name.localeCompare(b.name);
    }
  });

  if(!rows.length){
    el.innerHTML = '<div class="empty-msg">No personnel match the current filters.</div>';
    return;
  }

  // Reassign station dropdown options (built once per render).
  const reassignOpts = stations.map(s => `<option value="${s.id}">${_escPersonHtml(s.name)}</option>`).join('');

  el.innerHTML = rows.map(p => {
    const stName = stNameOf(p.stationId);
    const pinnedUnit = p.pinnedUnitId
      ? (typeof getUnitDisplayNameById === 'function' ? getUnitDisplayNameById(p.pinnedUnitId) : p.pinnedUnitId)
      : null;
    return `<div class="scard" style="margin-bottom:6px;padding:8px 10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <div style="flex:1;min-width:240px;">
          ${_renderPersonRowLabel(p)}
          <div style="font-size:.7rem;color:var(--muted);margin-top:2px;">
            ${_escPersonHtml(stName)}
            ${pinnedUnit ? ` · pinned to <span style="color:var(--gold);">${_escPersonHtml(pinnedUnit)}</span>` : ''}
            ${p.preference && p.preference !== 'either' ? ` · prefers ${_escPersonHtml(p.preference)}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          <select onchange="if(this.value){reassignPersonnel('${p.id}', this.value); renderPersonnelTab();}" style="font-size:.74rem;">
            <option value="">Reassign…</option>${reassignOpts}
          </select>
          <button class="btn-sm danger" onclick="_personnelTabDelete('${p.id}')">Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// =============================================================================
// ADD / BATCH-ADD PERSONNEL MODAL
// =============================================================================

// Opens the Add Personnel modal targeted at a specific station. When batch=true,
// the modal shows a count selector and the cert grid applies to every hire.
function openAddPersonnelModal(stationId, batch = false){
  _addPersonModalStationId = stationId;
  _addPersonModalBatch     = !!batch;
  _addPersonModalCerts     = new Set();
  _addPersonModalCount     = batch ? 3 : 1;
  _addPersonModalName      = '';
  _addPersonModalPref      = 'either';

  let modal = document.getElementById('add-person-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'add-person-modal';
    modal.className = 'modal-overlay';
    modal.addEventListener('click', e => { if(e.target === modal) closeAddPersonnelModal(); });
    document.body.appendChild(modal);
  }
  _renderAddPersonnelModal();
  modal.classList.add('open');
}

function closeAddPersonnelModal(){
  const modal = document.getElementById('add-person-modal');
  if(modal) modal.classList.remove('open');
}

// Toggles a cert in the in-progress selection. When checking a cert, also
// auto-selects its (transitive) prereqs so the player never pays for a half-
// configured ladder. When unchecking, leaves prereqs alone (player intent).
function _addPersonToggleCert(certId, checked){
  const defs = BAM_CONFIG.certifications || {};
  if(checked){
    _addPersonModalCerts.add(certId);
    // Walk prereqs transitively.
    const walk = (id) => {
      const def = defs[id];
      if(!def) return;
      (def.prereqs || []).forEach(p => {
        if(!_addPersonModalCerts.has(p)){
          _addPersonModalCerts.add(p);
          walk(p);
        }
      });
    };
    walk(certId);
  } else {
    _addPersonModalCerts.delete(certId);
  }
  _renderAddPersonnelModal();
}

function _addPersonSetCount(n){
  _addPersonModalCount = Math.max(1, Math.min(20, parseInt(n, 10) || 1));
  _renderAddPersonnelModal();
}
function _addPersonSetName(v){ _addPersonModalName = v; _refreshAddPersonnelCost(); }
function _addPersonSetPref(v){ _addPersonModalPref = v; }

// Light refresh: only updates the cost line so the player can type a name
// without losing focus. Heavier rebuilds use _renderAddPersonnelModal().
function _refreshAddPersonnelCost(){
  const el = document.getElementById('apm-cost');
  if(!el) return;
  const certs = [..._addPersonModalCerts];
  const count = _addPersonModalBatch ? _addPersonModalCount : 1;
  const total = calcHireCost({ count, certs });
  el.textContent = '$' + total.toLocaleString();
  el.style.color = (total <= money) ? 'var(--green)' : 'var(--accent)';
}

// Renders the modal body. Always a full rebuild for cert checkbox toggles
// (cheap; the modal has no dropdowns that lose state). Name input preserves
// focus across the cost-only refresh path.
function _renderAddPersonnelModal(){
  const modal = document.getElementById('add-person-modal');
  if(!modal) return;
  const s = stations.find(x => x.id === _addPersonModalStationId);
  if(!s){ closeAddPersonnelModal(); return; }
  const defs = BAM_CONFIG.certifications || {};

  // Group certs by category for a tidy checkbox grid.
  const groups = { fire: [], ems: [], police: [], shared: [] };
  Object.entries(defs).forEach(([k, c]) => {
    if(!groups[c.category]) groups[c.category] = [];
    groups[c.category].push({ id: k, ...c });
  });
  const groupHTML = (label, items) => {
    if(!items.length) return '';
    const sorted = items.slice().sort((a,b) => a.cost - b.cost);
    return `<div style="margin-top:8px;">
      <div class="field-label" style="margin-bottom:4px;">${label}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:3px 8px;">
        ${sorted.map(c => `
          <label style="display:flex;align-items:center;gap:5px;font-size:.76rem;cursor:pointer;">
            <input type="checkbox" ${_addPersonModalCerts.has(c.id) ? 'checked' : ''}
                   onchange="_addPersonToggleCert('${c.id}', this.checked)"/>
            <span>${_escPersonHtml(c.label)}</span>
            <span style="color:var(--muted);font-size:.7rem;">$${c.cost.toLocaleString()}</span>
          </label>`).join('')}
      </div>
    </div>`;
  };

  const count   = _addPersonModalBatch ? _addPersonModalCount : 1;
  const certs   = [..._addPersonModalCerts];
  const cost    = calcHireCost({ count, certs });
  const canPay  = cost <= money;
  const certSummary = certs.length
    ? certs.map(c => defs[c]?.label || c).join(', ')
    : 'no certifications (raw recruit)';

  modal.innerHTML = `<div class="modal-box gold-top" style="width:620px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;">
    <div class="modal-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <h2 class="gold">${_addPersonModalBatch ? 'Batch Hire' : 'Add Person'}</h2>
        <div class="modal-sub">${_escPersonHtml(s.name)}</div>
      </div>
      <button class="btn-sm danger" onclick="closeAddPersonnelModal()">✕</button>
    </div>
    <div class="modal-body" style="flex:1;overflow-y:auto;padding:14px 16px;">

      ${_addPersonModalBatch ? `
        <div class="field-label">Number of hires</div>
        <input type="number" min="1" max="20" value="${_addPersonModalCount}"
               oninput="_addPersonSetCount(this.value)" style="width:90px;"/>
        <div style="font-size:.7rem;color:var(--muted);margin-top:2px;">Each hire receives the same certifications.</div>
      ` : `
        <div class="field-label">Name</div>
        <input type="text" id="apm-name-input" placeholder="(auto from name pool)"
               value="${_escPersonHtml(_addPersonModalName)}"
               oninput="_addPersonSetName(this.value)" style="width:100%;"/>
      `}

      <div class="field-label" style="margin-top:10px;">Service preference</div>
      <select onchange="_addPersonSetPref(this.value)" style="width:160px;">
        <option value="either"${_addPersonModalPref==='either'?' selected':''}>Either</option>
        <option value="fire"${_addPersonModalPref==='fire'?' selected':''}>Fire</option>
        <option value="ems"${_addPersonModalPref==='ems'?' selected':''}>EMS</option>
        <option value="police"${_addPersonModalPref==='police'?' selected':''}>Police</option>
      </select>

      <div class="section-title" style="margin-top:14px;">Certifications</div>
      <div style="font-size:.74rem;color:var(--muted);margin-bottom:4px;">
        Selecting a cert auto-adds its prerequisites. Training cost is included in the hire price.
      </div>
      ${groupHTML('Fire',   groups.fire)}
      ${groupHTML('EMS',    groups.ems)}
      ${groupHTML('Police', groups.police)}
      ${groupHTML('Shared', groups.shared)}

      <div style="margin-top:14px;padding:8px 10px;background:rgba(255,255,255,0.04);border-radius:6px;font-size:.8rem;">
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <span style="color:var(--muted);">Hire base × ${count}</span>
          <span>$${((BAM_CONFIG.personnelHireCostBase || 0) * count).toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:8px;margin-top:2px;">
          <span style="color:var(--muted);">Cert training × ${count} (${certs.length} cert${certs.length===1?'':'s'} each)</span>
          <span>$${(cost - (BAM_CONFIG.personnelHireCostBase || 0) * count).toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:8px;margin-top:4px;border-top:1px solid rgba(255,255,255,0.08);padding-top:4px;font-weight:700;">
          <span>Total</span>
          <span id="apm-cost" style="color:${canPay ? 'var(--green)' : 'var(--accent)'};">$${cost.toLocaleString()}</span>
        </div>
        <div style="font-size:.7rem;color:var(--muted);margin-top:4px;">
          Selected: ${_escPersonHtml(certSummary)}
        </div>
      </div>
    </div>
    <div class="modal-footer" style="padding:10px 16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;">
      <button class="btn-sm" onclick="closeAddPersonnelModal()">Cancel</button>
      <button class="btn-sm" ${canPay ? '' : 'disabled'} onclick="_confirmAddPersonnel()">
        ${_addPersonModalBatch ? `Hire ${count}` : 'Hire'} — $${cost.toLocaleString()}
      </button>
    </div>
  </div>`;

  // Restore focus on the name input if the player was typing.
  if(!_addPersonModalBatch){
    const inp = document.getElementById('apm-name-input');
    if(inp && document.activeElement === document.body && _addPersonModalName){
      inp.focus();
      inp.setSelectionRange(_addPersonModalName.length, _addPersonModalName.length);
    }
  }
}

// Performs the hire transaction and refreshes the modals/tabs.
function _confirmAddPersonnel(){
  const stationId = _addPersonModalStationId;
  if(!stationId) return;
  const certs = [..._addPersonModalCerts];
  const pref  = _addPersonModalPref;
  if(_addPersonModalBatch){
    const res = batchAddPersonnel(stationId, { count: _addPersonModalCount, certs, preference: pref });
    if(!res.ok) return;
  } else {
    const ok = addPersonnel(stationId, {
      name: _addPersonModalName, certs, preference: pref, type: 'career'
    });
    if(!ok) return;
  }
  closeAddPersonnelModal();
  if(typeof _renderManageBody === 'function')   _renderManageBody();
  if(typeof renderPersonnelTab === 'function')  renderPersonnelTab();
  if(typeof renderStationList === 'function')   renderStationList();
}

// Deletes a personnel record. If they're busy, asks for force-delete confirm.
function _personnelTabDelete(id){
  const p = getPersonnelById(id);
  if(!p) return;
  const res = deletePersonnel(id, { force: false });
  if(res.ok){
    setStatus(`Released ${p.name}.`);
    renderPersonnelTab();
    return;
  }
  if(res.conflicts?.includes('on_active_assignment')){
    if(confirm(`${p.name} is on an active call. Force-delete anyway? The unit they're on will lose this crew member.`)){
      deletePersonnel(id, { force: true });
      setStatus(`Force-deleted ${p.name}.`);
      renderPersonnelTab();
    }
  }
}
