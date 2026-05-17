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
let _addPersonModalType      = 'career';   // Phase 5D — 'career' | 'volunteer'

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

// =============================================================================
// RANK HELPERS  (Phase 5C)
// =============================================================================

// Returns the entire rankConfig as a flat array across all services. Used by
// promote pickers and rank lookups.
function _allRankDefs(){
  const cfg = BAM_CONFIG.rankConfig || {};
  return Object.values(cfg).flat();
}

// Looks up a single rank definition by its `key`. Returns null if not found
// (e.g. legacy person with free-text rank only).
function getRankByKey(rankKey){
  if(!rankKey) return null;
  return _allRankDefs().find(r => r.key === rankKey) || null;
}

// Picks a sensible default rankKey from a cert set + service preference. Mirrors
// _defaultRankFromCerts but returns a rankConfig key instead of a free-text
// label, so salary derivation and promote eligibility can use it directly.
// Service hint:
//   'fire' | 'ems' | 'police' | 'either'
// Defaults to fire if 'either' and the cert mix is fire-heavy, otherwise EMS.
function _defaultRankKeyFromCerts(certs, service){
  const set = expandCertSet(certs);
  // Police is unambiguous — if patrol_officer is held, we go police.
  if(set.has('patrol_officer') || service === 'police'){
    if(set.has('patrol_supervisor')) return 'pol_sergeant';
    return 'pol_officer';
  }
  // Service preference drives fire-vs-EMS when both are credible.
  const preferEms = service === 'ems'
    || (service !== 'fire' && (set.has('paramedic') || set.has('aemt') || set.has('emt')) && !set.has('ff1'));
  if(preferEms){
    if(set.has('paramedic'))     return 'ems_paramedic';
    if(set.has('aemt'))          return 'ems_aemt';
    if(set.has('emt'))           return 'ems_emt';
    if(set.has('emr'))           return 'ems_emr';
    if(set.has('evoc_small'))    return 'ems_driver';
    return 'ems_probationary';
  }
  // Fire side.
  if(set.has('fire_officer_2'))                       return 'fire_battalion';
  if(set.has('fire_officer_1'))                       return 'fire_lieutenant';
  if(set.has('pump_ops_1') && set.has('evoc_large'))  return 'fire_driver_op';
  if(set.has('ff2'))                                  return 'fire_senior_ff';
  if(set.has('ff1'))                                  return 'fire_firefighter';
  return 'fire_probationary';
}

// Returns the daily salary for a person in $. Career personnel derive from
// rankKey × salaryBaseAnnual / 365. Volunteers always return 0 (no salary).
// If `salaryAnnual` is explicitly set on the record it wins (player override).
function getSalaryDailyFor(person){
  if(!person) return 0;
  if(person.type === 'volunteer') return 0;
  const annual = (person.salaryAnnual != null)
    ? person.salaryAnnual
    : _deriveSalaryAnnual(person.rankKey);
  return annual / 365;
}

// Computes annual salary in $ for a given rankKey. Returns salaryBaseAnnual if
// no rank lookup matches (graceful fallback for legacy free-text-only ranks).
function _deriveSalaryAnnual(rankKey){
  const base = BAM_CONFIG.salaryBaseAnnual || 0;
  const def  = getRankByKey(rankKey);
  if(!def) return base;
  return Math.round(base * (def.salaryMultiplier || 1.0));
}

// Creates one personnel record. Does NOT debit money — callers (addPersonnel,
// batchAddPersonnel, generateStarterRoster) handle cashflow.
function _createPersonnelRecord(stationId, { name, type='career', rank, rankKey, certs=[], preference='either' } = {}){
  const finalCerts  = Array.from(new Set(certs)); // dedupe
  const finalRankKey = rankKey || _defaultRankKeyFromCerts(finalCerts, preference);
  const rec = {
    id: _genPersonnelId(),
    name: (name && name.trim()) || _randomPersonName(),
    stationId,
    pinnedUnitId: null,
    type,
    // Phase 5B free-text rank kept for back-compat / display. If rankKey resolves
    // we prefer its label; otherwise fall back to the cert-derived free-text rank.
    rank: rank || (getRankByKey(finalRankKey)?.label) || _defaultRankFromCerts(finalCerts),
    // Phase 5C — points into BAM_CONFIG.rankConfig. Drives salary + promote.
    rankKey: finalRankKey,
    certs: finalCerts,
    preference,
    status: 'available',
    currentAssignment: null,
    createdAt: Date.now(),
    playerEdited: false,
    // Phase 5C — shift assignment + salary. shiftId null = always-on (treated
    // as on-duty until the player assigns a real shift). salaryAnnual is
    // derived from rankKey at hire time; player can override later.
    shiftId:      null,
    salaryAnnual: (type === 'volunteer') ? 0 : _deriveSalaryAnnual(finalRankKey),
    // Phase 5E — per-person stat counters + career history log.
    stats: _emptyStats(),
    history: []
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

// Public: hire `count` identical responders in one transaction.
// Phase 5D — accepts `type` ('career' | 'volunteer'). Volunteers are unpaid;
// the hire fee covers training+gear. Returns { hired, cost, ok }. If funds are
// insufficient, hires zero.
function batchAddPersonnel(stationId, { count = 1, certs = [], preference = 'either', type = 'career' } = {}){
  const cost = calcHireCost({ count, certs });
  if(money < cost){
    setStatus(`Cannot batch-hire — need $${cost.toLocaleString()}, have $${money.toLocaleString()}.`);
    return { hired: [], cost, ok: false };
  }
  updateMoney(-cost);
  logCashflow(-cost, `Batch hired ${count} ${type === 'volunteer' ? 'volunteer' : 'responder'}${count===1?'':'s'}`);
  const hired = [];
  for(let i = 0; i < count; i++){
    hired.push(_createPersonnelRecord(stationId, { certs, preference, type }));
  }
  setStatus(`Hired ${count} ${type === 'volunteer' ? 'volunteer' : 'responder'}${count===1?'':'s'} — −$${cost.toLocaleString()}.`);
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
//   • Career personnel: must be on-duty per their shift schedule (Phase 5C).
//   • Volunteers: must pass isVolunteerAvailableNow (Phase 5D) — combines
//     schedule, reliability roll, super-responder flag, defaultAvailable.
// Pinned-to-other-unit personnel are reserved and excluded.
function getCrewForUnit(unitId){
  const { unit, station } = _findUnitAndStation(unitId);
  if(!unit || !station) return [];
  return personnel.filter(p => {
    if(p.stationId !== station.id) return false;
    if(p.status !== 'available') return false;
    if(p.pinnedUnitId != null && p.pinnedUnitId !== unitId) return false;
    if(p.type === 'volunteer'){
      return (typeof isVolunteerAvailableNow === 'function') ? isVolunteerAvailableNow(p) : true;
    }
    return isOnDutyNow(p);
  });
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

  // Phase 5C — per-station salary preview line. Sum of getSalaryDailyFor across
  // career personnel at this station. Volunteers are $0 so don't pollute the total.
  const stationDaily = (typeof estimateStationSalaryDaily === 'function')
    ? estimateStationSalaryDaily(s.id) : 0;

  return `<div class="section-title" style="margin-top:14px;">Personnel</div>
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
      <div style="color:var(--muted);">Salaries</div>
      <div style="font-weight:600;">
        $${stationDaily.toLocaleString()}/day
        ${stationDaily > 0 ? `<span style="color:var(--muted);font-size:.7rem;"> · $${(stationDaily * 365).toLocaleString()}/yr</span>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
      <button class="btn-sm" onclick="openAddPersonnelModal('${s.id}', false)">+ Add Person</button>
      <button class="btn-sm" onclick="openAddPersonnelModal('${s.id}', true)">+ Batch Hire</button>
      <button class="btn-sm" onclick="topUpStationRoster('${s.id}')" title="Hire to fill any ideal-crew shortfall across this station's units">Auto-staff to ideal</button>
      <button class="btn-sm" onclick="openTrainingModal('station', '${s.id}')" title="Open the training modal pre-selected with this station's roster">Train Roster</button>
      <button class="btn-sm" onclick="openStationShiftEditor('${s.id}')" title="Edit shift templates and assign personnel to shifts at this station">Shifts</button>
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

// =============================================================================
// PERSONNEL DETAILS MODAL  (Phase 5D)
// =============================================================================
// Full per-person view + editor. Career personnel see: name, rank, certs,
// salary, shift assignment, train/promote/reassign. Volunteers ALSO see:
// home + work (with regenerate + set-via-map-click), PPE toggle (fire only),
// super-responder toggle, reliability slider, auto-migrated badge with ack.

let _personDetailsId = null;

function openPersonnelDetails(personnelId){
  const p = getPersonnelById(personnelId);
  if(!p){ setStatus('Personnel record not found.'); return; }
  _personDetailsId = personnelId;
  let modal = document.getElementById('person-details-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'person-details-modal';
    modal.className = 'modal-overlay';
    modal.addEventListener('click', e => { if(e.target === modal) closePersonnelDetails(); });
    document.body.appendChild(modal);
  }
  _renderPersonnelDetails();
  modal.classList.add('open');
}

function closePersonnelDetails(){
  const modal = document.getElementById('person-details-modal');
  if(modal) modal.classList.remove('open');
  _personDetailsId = null;
}

function _renderPersonnelDetails(){
  const modal = document.getElementById('person-details-modal');
  if(!modal) return;
  const p = getPersonnelById(_personDetailsId);
  if(!p){ closePersonnelDetails(); return; }
  const defs = BAM_CONFIG.certifications || {};
  const station = stations.find(s => s.id === p.stationId);

  // Cert chips with category-color hint.
  const certColor = { fire:'rgba(224,92,26,.4)', ems:'rgba(46,168,255,.4)', police:'rgba(88,101,242,.4)', shared:'rgba(180,180,180,.3)' };
  const certHTML  = (p.certs || []).map(c => {
    const def = defs[c];
    const bg  = certColor[def?.category] || 'rgba(255,255,255,.08)';
    return `<span style="background:${bg};padding:2px 7px;border-radius:9px;font-size:.72rem;margin:0 4px 4px 0;display:inline-block;">${_escPersonHtml(def?.label || c)}</span>`;
  }).join('') || '<span style="color:var(--muted);font-size:.78rem;">(no certifications)</span>';

  // Shift assignment dropdown (career only).
  const shiftOpts = (p.type !== 'volunteer' && station)
    ? `<select onchange="_personDetailsSetShift('${p.id}', this.value)" style="font-size:.78rem;">
        <option value=""${!p.shiftId?' selected':''}>— always on duty —</option>
        ${getStationShifts(station.id).map(sh =>
          `<option value="${sh.id}"${p.shiftId===sh.id?' selected':''}>${_escPersonHtml(sh.label)}</option>`
        ).join('')}
      </select>`
    : '';

  // Volunteer block: home/work, PPE, super, reliability, auto-migrated banner.
  let volBlock = '';
  if(p.type === 'volunteer'){
    const homeStr = p.home ? `${p.home.lat.toFixed(5)}, ${p.home.lng.toFixed(5)}${p.home.isFallback ? ' <span style="color:var(--gold);font-size:.7rem;">(road-snap fallback)</span>' : ''}` : '<span style="color:var(--muted);">— not set —</span>';
    const workStr = p.work ? `${p.work.lat.toFixed(5)}, ${p.work.lng.toFixed(5)}${p.work.isFallback ? ' <span style="color:var(--gold);font-size:.7rem;">(road-snap fallback)</span>' : ''}` : '<span style="color:var(--muted);">— not set —</span>';
    const reliability = (p.availability?.reliability != null) ? p.availability.reliability : (BAM_CONFIG.volunteerDefaultReliability ?? 0.8);
    const ppeShow    = (p.certs || []).some(c => c === 'ff1' || c === 'ff2' || c === 'fire_exterior' || c === 'fire_support');

    const ackBanner = p.autoMigratedFlag
      ? `<div style="margin-top:6px;padding:7px 10px;background:rgba(251,191,36,0.12);border:1px solid var(--gold);border-radius:4px;font-size:.78rem;">
          ⚠ Home auto-migrated after an ESN polygon change.
          <button class="btn-sm" style="margin-left:8px;" onclick="_acknowledgeAutoMigration('${p.id}')">Acknowledge</button>
        </div>`
      : '';

    volBlock = `
      <div class="section-title" style="margin-top:14px;">Volunteer Settings</div>
      ${ackBanner}
      <div style="display:grid;grid-template-columns:80px 1fr;gap:6px 10px;font-size:.82rem;align-items:center;">
        <div style="color:var(--muted);">Home</div>
        <div>${homeStr}
          <button class="btn-sm" style="margin-left:6px;" onclick="_volunteerRegenHome('${p.id}')">Regenerate</button>
          <button class="btn-sm" onclick="beginVolunteerLocationPick('${p.id}','home'); closePersonnelDetails();" title="Click map to set home">Set via map click</button>
        </div>
        <div style="color:var(--muted);">Work</div>
        <div>${workStr}
          <button class="btn-sm" style="margin-left:6px;" onclick="_volunteerRegenWork('${p.id}')">Regenerate</button>
          <button class="btn-sm" onclick="beginVolunteerLocationPick('${p.id}','work'); closePersonnelDetails();" title="Click map to set work">Set via map click</button>
        </div>
        ${ppeShow ? `
        <div style="color:var(--muted);">PPE in vehicle</div>
        <div>
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:.78rem;">
            <input type="checkbox" ${p.hasPpeInVehicle?'checked':''} onchange="_personDetailsSetPpe('${p.id}', this.checked)"/>
            Carries turnout gear in POV (enables interior tasks on direct-to-scene)
          </label>
        </div>` : ''}
        <div style="color:var(--muted);">Super responder</div>
        <div>
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:.78rem;">
            <input type="checkbox" ${p.isSuperResponder?'checked':''} onchange="_personDetailsSetSuper('${p.id}', this.checked)"/>
            Ignores availability rolls and auto-migration (player-curated)
          </label>
        </div>
        <div style="color:var(--muted);">Reliability</div>
        <div>
          <input type="range" min="0" max="100" value="${Math.round(reliability*100)}"
                 oninput="_personDetailsSetReliability('${p.id}', this.value); this.nextElementSibling.textContent=this.value+'%';"
                 style="width:160px;vertical-align:middle;"/>
          <span style="font-size:.74rem;color:var(--muted);">${Math.round(reliability*100)}%</span>
        </div>
      </div>`;
  }

  modal.innerHTML = `<div class="modal-box gold-top" style="width:580px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;">
    <div class="modal-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <h2 class="gold">${_escPersonHtml(p.name)}</h2>
        <div class="modal-sub">${_escPersonHtml(p.rank || '—')} · ${p.type === 'volunteer' ? 'Volunteer' : 'Career'} · ${_escPersonHtml(station?.name || '(no station)')}</div>
      </div>
      <button class="btn-sm danger" onclick="closePersonnelDetails()">✕</button>
    </div>
    <div class="modal-body" style="flex:1;overflow-y:auto;padding:14px 16px;">

      <div class="field-label">Name</div>
      <div style="display:flex;gap:6px;">
        <input id="pd-name" type="text" value="${_escPersonHtml(p.name)}" style="flex:1;"/>
        <button class="btn-sm" onclick="_personDetailsSaveName('${p.id}')">Rename</button>
      </div>

      <div style="display:grid;grid-template-columns:max-content 1fr;gap:6px 10px;font-size:.82rem;align-items:center;margin-top:10px;">
        <div style="color:var(--muted);">Status</div>
        <div>${_escPersonHtml(p.status || 'available')}${p.type !== 'volunteer' ? ` · ${isOnDutyNow(p) ? '<span style="color:var(--green);">on duty</span>' : '<span style="color:var(--muted);">off duty</span>'}` : ''}</div>
        <div style="color:var(--muted);">Rank</div>
        <div>${_escPersonHtml(p.rank || '—')}
          <button class="btn-sm" style="margin-left:6px;" onclick="closePersonnelDetails(); openPromoteModal('${p.id}');">Promote…</button>
        </div>
        ${p.type !== 'volunteer' ? `
        <div style="color:var(--muted);">Salary</div>
        <div>$${(p.salaryAnnual || 0).toLocaleString()}/yr · $${Math.round(getSalaryDailyFor(p)).toLocaleString()}/day</div>
        <div style="color:var(--muted);">Shift</div>
        <div>${shiftOpts}</div>
        ` : ''}
        <div style="color:var(--muted);">Service pref</div>
        <div>
          <select onchange="_personDetailsSetPref('${p.id}', this.value)" style="font-size:.78rem;">
            <option value="either"${p.preference==='either'?' selected':''}>Either</option>
            <option value="fire"${p.preference==='fire'?' selected':''}>Fire</option>
            <option value="ems"${p.preference==='ems'?' selected':''}>EMS</option>
            <option value="police"${p.preference==='police'?' selected':''}>Police</option>
          </select>
        </div>
      </div>

      <div class="section-title" style="margin-top:14px;">Certifications</div>
      <div>${certHTML}</div>
      <div style="margin-top:6px;">
        <button class="btn-sm" onclick="closePersonnelDetails(); openTrainingModal('${p.id}');">Train…</button>
      </div>

      ${volBlock}

      <div class="section-title" style="margin-top:14px;">Stats</div>
      ${(() => {
        const sum = getCareerSummary(_personDetailsId);
        const st  = sum?.stats || {};
        const cells = [
          ['Calls Responded', st.callsResponded || 0],
          ['Fire Calls', st.fireCalls || 0],
          ['EMS Calls', st.emsCalls || 0],
          ['Police Calls', st.policeCalls || 0],
          ['Transports', st.transports || 0],
          ['Saves', st.saves || 0],
          ['Missed Calls', st.missedCalls || 0],
          ['Training Completed', st.trainingCompleted || 0],
          ['Command Incidents', st.commandIncidents || 0]
        ];
        return `<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:4px 10px;font-size:.78rem;">
          ${cells.map(([l,v]) => `<div><span style="color:var(--muted);">${l}:</span> <b>${v}</b></div>`).join('')}
        </div>
        <button class="btn-sm danger" style="margin-top:8px;" onclick="_personDetailsResetStats('${_personDetailsId}')" title="Reset all counters and clear career history (irreversible)">Reset Stats…</button>`;
      })()}

      <div class="section-title" style="margin-top:14px;">Career History (${(getCareerSummary(_personDetailsId)?.totalEntries || 0)})</div>
      ${(() => {
        const sum = getCareerSummary(_personDetailsId);
        const recent = sum?.recentHistory || [];
        if(!recent.length) return '<div class="empty-msg">No history yet.</div>';
        return `<div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:.74rem;">
          ${recent.map(h => {
            const sec = h.gameSec || 0;
            const hh  = Math.floor((sec % 86400) / 3600).toString().padStart(2,'0');
            const mm  = Math.floor((sec % 3600) / 60).toString().padStart(2,'0');
            return `<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
              <span style="color:var(--muted);">Day ${h.gameDay} ${hh}:${mm}</span>
              · <span style="color:var(--gold);font-size:.7rem;">${_escPersonHtml(h.type)}</span>
              ${_escPersonHtml(h.summary || '')}
            </div>`;
          }).join('')}
        </div>`;
      })()}

      <div class="section-title" style="margin-top:14px;">Actions</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <select onchange="if(this.value){reassignPersonnel('${p.id}', this.value); _renderPersonnelDetails(); if(typeof renderPersonnelTab==='function') renderPersonnelTab();}" style="font-size:.78rem;">
          <option value="">Reassign…</option>
          ${stations.filter(s => s.id !== p.stationId).map(s => `<option value="${s.id}">${_escPersonHtml(s.name)}</option>`).join('')}
        </select>
        <button class="btn-sm danger" onclick="_personDetailsDelete('${p.id}')">Delete</button>
      </div>
    </div>
  </div>`;
}

function _personDetailsSaveName(id){
  const v = document.getElementById('pd-name')?.value?.trim();
  if(!v) return;
  updatePersonnel(id, { name: v });
  _renderPersonnelDetails();
  if(typeof renderPersonnelTab === 'function') renderPersonnelTab();
}

function _personDetailsSetPref(id, v){    updatePersonnel(id, { preference: v });    _renderPersonnelDetails(); }
function _personDetailsSetShift(id, v){
  const p = getPersonnelById(id);
  if(!p) return;
  p.shiftId = v || null; p.playerEdited = true;
  _renderPersonnelDetails();
  if(typeof renderPersonnelTab === 'function') renderPersonnelTab();
}
function _personDetailsSetPpe(id, checked){
  const p = getPersonnelById(id);
  if(!p) return;
  p.hasPpeInVehicle = !!checked; p.isCustomized = true; p.playerEdited = true;
}
function _personDetailsSetSuper(id, checked){
  const p = getPersonnelById(id);
  if(!p) return;
  p.isSuperResponder = !!checked; p.isCustomized = true; p.playerEdited = true;
}
function _personDetailsSetReliability(id, val){
  const p = getPersonnelById(id);
  if(!p) return;
  if(!p.availability) p.availability = {};
  p.availability.reliability = Math.max(0, Math.min(1, parseInt(val, 10) / 100));
  p.isCustomized = true; p.playerEdited = true;
}

async function _volunteerRegenHome(id){
  const p = getPersonnelById(id);
  if(!p) return;
  setStatus('Regenerating home…');
  await generateVolunteerHome(p);
  if(typeof refreshVolunteerLocationMarkers === 'function') refreshVolunteerLocationMarkers();
  _renderPersonnelDetails();
}
async function _volunteerRegenWork(id){
  const p = getPersonnelById(id);
  if(!p) return;
  setStatus('Regenerating work…');
  await generateVolunteerWork(p);
  if(typeof refreshVolunteerLocationMarkers === 'function') refreshVolunteerLocationMarkers();
  _renderPersonnelDetails();
}

function _acknowledgeAutoMigration(id){
  const p = getPersonnelById(id);
  if(!p) return;
  p.autoMigratedFlag = false; p.playerEdited = true;
  _renderPersonnelDetails();
  if(typeof renderPersonnelTab === 'function') renderPersonnelTab();
}

function _personDetailsResetStats(id){
  const p = getPersonnelById(id);
  if(!p) return;
  // Triple confirmation per Phase5.md line 275 — three independent prompts so
  // accidental double-click can't wipe a career log.
  if(!confirm(`Reset all stats and clear career history for ${p.name}?`)) return;
  if(!confirm(`Really reset ${p.name}? Every counter and every history entry will be lost.`)) return;
  const typed = prompt(`Type "RESET" to confirm — this cannot be undone:`);
  if(typed !== 'RESET'){ setStatus('Reset cancelled.'); return; }
  resetStats(id);
  setStatus(`Stats reset for ${p.name}.`);
  _renderPersonnelDetails();
}

function _personDetailsDelete(id){
  const p = getPersonnelById(id);
  if(!p) return;
  if(!confirm(`Delete ${p.name}? This cannot be undone.`)) return;
  const res = deletePersonnel(id, { force: false });
  if(res.ok){
    closePersonnelDetails();
    if(typeof renderPersonnelTab === 'function') renderPersonnelTab();
    if(typeof refreshVolunteerLocationMarkers === 'function') refreshVolunteerLocationMarkers();
    return;
  }
  if(res.conflicts?.includes('on_active_assignment')){
    if(confirm(`${p.name} is on an active call. Force-delete anyway?`)){
      deletePersonnel(id, { force: true });
      closePersonnelDetails();
      if(typeof renderPersonnelTab === 'function') renderPersonnelTab();
      if(typeof refreshVolunteerLocationMarkers === 'function') refreshVolunteerLocationMarkers();
    }
  }
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

  // Phase 5C — career salary summary bar above the list.
  const sumEl = document.getElementById('personnel-salary-summary');
  if(sumEl){
    const est = estimateNextSalaryCycle();
    sumEl.innerHTML = est.totalDaily > 0
      ? `💰 Career salaries: <b style="color:var(--text);">$${est.totalDaily.toLocaleString()}/day</b> across <b style="color:var(--text);">${est.count}</b> personnel · next cycle deducts at end of game-day`
      : '💰 No career salaries — hire career personnel to add ongoing payroll.';
  }

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
          <button class="btn-sm" onclick="openPersonnelDetails('${p.id}')" title="Full details + volunteer settings">Details</button>
          <button class="btn-sm" onclick="openTrainingModal('${p.id}')" title="Train this responder in a new certification">Train</button>
          <button class="btn-sm" onclick="openPromoteModal('${p.id}')" title="Promote to an eligible rank (free; cert training gates eligibility)">Promote</button>
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
  // Phase 5D — default hire type follows station's staffing type. Volunteer-only
  // stations default to volunteer; combination defaults to volunteer for hires
  // (career-only stations can't even pick volunteer).
  const stRec = stations.find(x => x.id === stationId);
  _addPersonModalType = (stRec?.stationType === 'volunteer' || stRec?.stationType === 'combination')
    ? 'volunteer'
    : 'career';

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
function _addPersonSetType(v){
  _addPersonModalType = (v === 'volunteer') ? 'volunteer' : 'career';
  _renderAddPersonnelModal();
}

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

      ${(s.stationType === 'combination' || s.stationType === 'volunteer') ? `
        <div class="field-label" style="margin-top:10px;">Hire as</div>
        <select onchange="_addPersonSetType(this.value)" style="width:160px;">
          ${s.stationType !== 'volunteer' ? `<option value="career"${_addPersonModalType==='career'?' selected':''}>Career (salaried)</option>` : ''}
          <option value="volunteer"${_addPersonModalType==='volunteer'?' selected':''}>Volunteer (unpaid)</option>
        </select>
        <div style="font-size:.7rem;color:var(--muted);margin-top:2px;">
          ${_addPersonModalType === 'volunteer'
            ? 'Volunteers respond from home/work (OSM-derived). Auto-generated on hire — editable later.'
            : 'Career personnel work a station shift and draw a daily salary based on their rank.'}
        </div>
      ` : ''}

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
// Volunteer hires kick off async home/work generation (Phase 5D) — the modal
// closes immediately and the new volunteer's home appears once Overpass (or
// fallback) returns.
function _confirmAddPersonnel(){
  const stationId = _addPersonModalStationId;
  if(!stationId) return;
  const certs = [..._addPersonModalCerts];
  const pref  = _addPersonModalPref;
  const type  = _addPersonModalType;
  let hired = [];
  if(_addPersonModalBatch){
    const res = batchAddPersonnel(stationId, { count: _addPersonModalCount, certs, preference: pref, type });
    if(!res.ok) return;
    hired = res.hired;
  } else {
    const rec = addPersonnel(stationId, {
      name: _addPersonModalName, certs, preference: pref, type
    });
    if(!rec) return;
    hired = [rec];
  }
  // Phase 5D — auto-generate home (and work) for every volunteer hire. Async,
  // best-effort — failures fall back to road-snapped random per volunteers.js.
  if(type === 'volunteer' && typeof generateVolunteerHome === 'function'){
    Promise.all(hired.map(async p => {
      await generateVolunteerHome(p);
      await generateVolunteerWork(p);
    })).then(() => {
      if(typeof refreshVolunteerLocationMarkers === 'function') refreshVolunteerLocationMarkers();
      if(typeof renderPersonnelTab === 'function') renderPersonnelTab();
    });
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

// =============================================================================
// TRAINING + PROMOTE  (Phase 5C)
// =============================================================================

// Returns the trainable cert codes for a single person — every cert in the
// taxonomy they don't already hold (directly OR via equivalency).
function getTrainableCertsFor(person){
  const defs = BAM_CONFIG.certifications || {};
  if(!person) return [];
  const have = expandCertSet(person.certs || []);
  return Object.keys(defs).filter(c => !have.has(c));
}

// Returns the cost in $ to train ONE person in a single new cert. Mirrors
// calcHireCost's cost source but applies the training-cost multiplier.
function calcTrainingCostFor(certCode){
  const defs = BAM_CONFIG.certifications || {};
  const base = defs[certCode]?.cost || 0;
  const mult = BAM_CONFIG.trainingCostMultiplier ?? 1.0;
  return Math.round(base * mult);
}

// Returns the cost to train every person in `personnelIds` in `certCode` once.
// Skips people who already hold (or satisfy) the cert — those get a $0 line.
function calcTrainingCostBatch(personnelIds, certCode){
  const per = calcTrainingCostFor(certCode);
  let count = 0;
  personnelIds.forEach(id => {
    const p = getPersonnelById(id);
    if(p && !personHasCert(p, certCode)) count++;
  });
  return { perPerson: per, count, total: per * count };
}

// Trains one or more existing personnel in a single new cert. Handles money,
// cashflow, prereq enforcement, and equivalency dedupe. Returns
// { ok, trained:[ids], skipped:[ids], cost, reason }.
//
// Rules:
//   • Skips people who already hold (or satisfy) the cert — no cost for them.
//   • Requires each person to hold every direct prereq of the new cert (after
//     transitive expansion of what they already have). If a person is missing
//     a prereq, the entire batch is refused — the player must train the
//     missing prereq first.
//   • Deducts a single consolidated cashflow line for the whole batch.
function trainPersonnel(personnelIds, certCode){
  const defs = BAM_CONFIG.certifications || {};
  const certDef = defs[certCode];
  if(!certDef) return { ok:false, reason:'unknown_cert' };

  const trained = [];
  const skipped = [];
  // First pass — separate already-have vs needs-train, validate prereqs.
  const toTrain  = [];
  const missingPrereq = [];
  personnelIds.forEach(id => {
    const p = getPersonnelById(id);
    if(!p){ skipped.push(id); return; }
    if(personHasCert(p, certCode)){ skipped.push(id); return; }
    // Prereqs must be in the person's expanded set.
    const have = expandCertSet(p.certs || []);
    const need = (certDef.prereqs || []).filter(pr => !have.has(pr));
    if(need.length){ missingPrereq.push({ id, name:p.name, need }); return; }
    toTrain.push(p);
  });

  if(missingPrereq.length){
    const first = missingPrereq[0];
    const needLabels = first.need.map(c => defs[c]?.label || c).join(', ');
    setStatus(`Cannot train ${first.name} — missing prereq: ${needLabels}.`);
    return { ok:false, trained, skipped, cost:0, reason:'missing_prereq', missingPrereq };
  }

  if(!toTrain.length){
    setStatus('No personnel selected need this cert.');
    return { ok:true, trained, skipped, cost:0 };
  }

  const perPerson = calcTrainingCostFor(certCode);
  const cost      = perPerson * toTrain.length;
  if(money < cost){
    setStatus(`Training requires $${cost.toLocaleString()} — funds insufficient.`);
    return { ok:false, trained, skipped, cost, reason:'insufficient_funds' };
  }

  updateMoney(-cost);
  logCashflow(-cost, `[TRAINING] ${certDef.label} × ${toTrain.length}`);
  toTrain.forEach(p => {
    p.certs = Array.from(new Set([...(p.certs || []), certCode]));
    p.playerEdited = true;
    trained.push(p.id);
    // Stats hook for 5E — record training event when stats system is live.
    if(typeof recordPersonStat === 'function'){
      recordPersonStat(p.id, 'trainingCompleted', 1, {
        type: 'training', summary: `Trained: ${certDef.label}`
      });
    }
  });
  setStatus(`Trained ${toTrain.length} in ${certDef.label} — −$${cost.toLocaleString()}.`);
  return { ok:true, trained, skipped, cost };
}

// Returns the rankConfig entries this person is eligible to be promoted into
// based on their current cert holdings. Includes ranks they already hold
// (so the picker can show "current" markers). Filtered to their service group
// when known via `preference`; otherwise spans all services they qualify for.
function getPromotableRanksFor(person){
  if(!person) return [];
  const allRanks = _allRankDefs();
  const haveExpanded = expandCertSet(person.certs || []);

  // Service group filter — if the person has a single clear preference, scope to it.
  let allowedServices = null; // null = no filter
  if(person.preference === 'fire')   allowedServices = ['fire'];
  if(person.preference === 'ems')    allowedServices = ['ems'];
  if(person.preference === 'police') allowedServices = ['police_local','police_county','police_state'];

  return allRanks.filter(r => {
    if(allowedServices && !allowedServices.includes(r.service)) return false;
    // Eligibility: every prereq cert is in the person's expanded set.
    return (r.prereqCerts || []).every(c => haveExpanded.has(c));
  });
}

// Promotes a person to a new rank. Free — cost is in the cert training that
// gates eligibility. Updates rank label, rankKey, and salaryAnnual.
// Returns { ok, reason, person }.
function promotePersonnel(personnelId, rankKey){
  const p = getPersonnelById(personnelId);
  if(!p) return { ok:false, reason:'not_found' };
  const rankDef = getRankByKey(rankKey);
  if(!rankDef) return { ok:false, reason:'unknown_rank' };
  const have = expandCertSet(p.certs || []);
  const missing = (rankDef.prereqCerts || []).filter(c => !have.has(c));
  if(missing.length){
    const defs = BAM_CONFIG.certifications || {};
    const labels = missing.map(c => defs[c]?.label || c).join(', ');
    setStatus(`${p.name} is not eligible — needs ${labels}.`);
    return { ok:false, reason:'missing_prereq', missing };
  }
  const oldRank = p.rank;
  p.rank        = rankDef.label;
  p.rankKey     = rankDef.key;
  // Career personnel re-derive salary on promotion; volunteers stay at 0.
  if(p.type !== 'volunteer') p.salaryAnnual = _deriveSalaryAnnual(rankDef.key);
  p.playerEdited = true;
  // Stats hook for 5E.
  if(typeof recordPersonStat === 'function'){
    recordPersonStat(p.id, null, 0, {
      type: 'promotion', summary: `Promoted: ${oldRank || '(none)'} → ${rankDef.label}`
    });
  }
  setStatus(`${p.name} promoted to ${rankDef.label}.`);
  return { ok:true, person:p };
}

// =============================================================================
// TRAINING MODAL  (Phase 5C)
// =============================================================================
// Single modal handles BOTH single-person and multi-person training. Opened via:
//   openTrainingModal([personnelId])         — single person, from row action
//   openTrainingModal([id1, id2, ...])       — batch, from filtered list
//   openTrainingModal('station', stationId)  — every available person at station
// State lives in closure-style module variables for consistency with the
// existing add-person modal.

let _trainModalPersonIds = [];   // ids selected for training
let _trainModalCert      = '';   // chosen cert code

function openTrainingModal(personIdsOrScope, scopeId){
  if(personIdsOrScope === 'station'){
    _trainModalPersonIds = getPersonnelByStation(scopeId).map(p => p.id);
  } else if(Array.isArray(personIdsOrScope)){
    _trainModalPersonIds = personIdsOrScope.slice();
  } else if(typeof personIdsOrScope === 'string'){
    _trainModalPersonIds = [personIdsOrScope];
  } else {
    _trainModalPersonIds = [];
  }
  _trainModalCert = '';
  let modal = document.getElementById('train-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'train-modal';
    modal.className = 'modal-overlay';
    modal.addEventListener('click', e => { if(e.target === modal) closeTrainingModal(); });
    document.body.appendChild(modal);
  }
  _renderTrainingModal();
  modal.classList.add('open');
}

function closeTrainingModal(){
  const modal = document.getElementById('train-modal');
  if(modal) modal.classList.remove('open');
}

function _trainModalSetCert(certCode){
  _trainModalCert = certCode || '';
  _renderTrainingModal();
}

function _trainModalTogglePerson(id, checked){
  if(checked){
    if(!_trainModalPersonIds.includes(id)) _trainModalPersonIds.push(id);
  } else {
    _trainModalPersonIds = _trainModalPersonIds.filter(x => x !== id);
  }
  _renderTrainingModal();
}

function _renderTrainingModal(){
  const modal = document.getElementById('train-modal');
  if(!modal) return;
  const defs = BAM_CONFIG.certifications || {};

  // Group all certs by category for the picker.
  const grouped = { fire:[], ems:[], police:[], shared:[] };
  Object.entries(defs).forEach(([k,c]) => {
    if(!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push({ id:k, ...c });
  });
  const certOptions = ['fire','ems','police','shared'].map(cat => {
    const items = (grouped[cat] || []).slice().sort((a,b) => a.cost - b.cost);
    if(!items.length) return '';
    const opts = items.map(c => `<option value="${c.id}"${_trainModalCert===c.id?' selected':''}>${_escPersonHtml(c.label)} — $${calcTrainingCostFor(c.id).toLocaleString()}</option>`).join('');
    return `<optgroup label="${cat[0].toUpperCase()+cat.slice(1)}">${opts}</optgroup>`;
  }).join('');

  // Roster picker — checkboxes for every person currently in the scope set,
  // OR every person across all stations when the modal was opened wide.
  // For now we render exactly the ids the player came in with.
  const people = _trainModalPersonIds
    .map(id => getPersonnelById(id))
    .filter(Boolean);

  const certDef = defs[_trainModalCert];
  // Per-person eligibility for the chosen cert.
  const evalRow = (p) => {
    if(!certDef) return { ok:false, label:'(pick a cert)', cls:'muted' };
    if(personHasCert(p, _trainModalCert)) return { ok:false, label:'already holds', cls:'muted' };
    const have = expandCertSet(p.certs || []);
    const missing = (certDef.prereqs || []).filter(pr => !have.has(pr));
    if(missing.length){
      const labels = missing.map(c => defs[c]?.label || c).join(', ');
      return { ok:false, label:'needs ' + labels, cls:'accent' };
    }
    return { ok:true, label:'eligible', cls:'green' };
  };
  const rosterHTML = people.length ? people.map(p => {
    const ev = evalRow(p);
    const cls = ev.cls === 'accent' ? 'var(--accent)' : ev.cls === 'green' ? 'var(--green)' : 'var(--muted)';
    return `<label style="display:flex;align-items:center;gap:6px;padding:3px 4px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:.78rem;">
      <input type="checkbox" checked onchange="_trainModalTogglePerson('${p.id}', this.checked)"/>
      <span style="flex:1;">${_escPersonHtml(p.name)} <span style="color:var(--muted);">· ${_escPersonHtml(p.rank || '')}</span></span>
      <span style="color:${cls};font-size:.72rem;">${ev.label}</span>
    </label>`;
  }).join('') : '<div class="empty-msg">No personnel selected for training.</div>';

  // Cost block + eligibility summary.
  const costInfo = certDef ? calcTrainingCostBatch(_trainModalPersonIds, _trainModalCert) : { perPerson:0, count:0, total:0 };
  const canPay   = costInfo.total <= money;

  modal.innerHTML = `<div class="modal-box gold-top" style="width:560px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;">
    <div class="modal-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <h2 class="gold">Training</h2>
        <div class="modal-sub">${people.length} selected</div>
      </div>
      <button class="btn-sm danger" onclick="closeTrainingModal()">✕</button>
    </div>
    <div class="modal-body" style="flex:1;overflow-y:auto;padding:14px 16px;">
      <div class="field-label">Certification to train</div>
      <select onchange="_trainModalSetCert(this.value)" style="width:100%;">
        <option value="">— pick a cert —</option>${certOptions}
      </select>
      ${certDef ? `<div style="font-size:.74rem;color:var(--muted);margin-top:4px;">
        Prereqs: ${(certDef.prereqs || []).map(c => defs[c]?.label || c).join(', ') || '(none)'}.
        Equivalency satisfies: ${(certDef.satisfies || []).map(c => defs[c]?.label || c).join(', ') || '(none)'}.
      </div>` : ''}

      <div class="section-title" style="margin-top:12px;">Personnel</div>
      <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;padding:4px 6px;">
        ${rosterHTML}
      </div>

      <div style="margin-top:14px;padding:8px 10px;background:rgba(255,255,255,0.04);border-radius:6px;font-size:.8rem;">
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <span style="color:var(--muted);">Per person</span>
          <span>$${costInfo.perPerson.toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:8px;margin-top:2px;">
          <span style="color:var(--muted);">Eligible (will train)</span>
          <span>${costInfo.count}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:8px;margin-top:4px;border-top:1px solid rgba(255,255,255,0.08);padding-top:4px;font-weight:700;">
          <span>Total</span>
          <span style="color:${canPay ? 'var(--green)' : 'var(--accent)'};">$${costInfo.total.toLocaleString()}</span>
        </div>
      </div>
    </div>
    <div class="modal-footer" style="padding:10px 16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;">
      <button class="btn-sm" onclick="closeTrainingModal()">Cancel</button>
      <button class="btn-sm" ${(canPay && costInfo.count > 0) ? '' : 'disabled'} onclick="_confirmTraining()">
        Train ${costInfo.count} — $${costInfo.total.toLocaleString()}
      </button>
    </div>
  </div>`;
}

function _confirmTraining(){
  if(!_trainModalCert || !_trainModalPersonIds.length) return;
  const res = trainPersonnel(_trainModalPersonIds, _trainModalCert);
  if(!res.ok) return;
  closeTrainingModal();
  if(typeof renderPersonnelTab === 'function')   renderPersonnelTab();
  if(typeof _renderManageBody === 'function')    _renderManageBody();
  if(typeof _renderUnitDetails === 'function')   _renderUnitDetails();
  if(typeof renderStationList === 'function')    renderStationList();
}

// =============================================================================
// PROMOTE MODAL  (Phase 5C)
// =============================================================================
// Lightweight picker: shows every rank eligible for this one person, plus the
// current rank for context. Free + instant; the cert training is the gate.

let _promoteModalPersonId = null;

function openPromoteModal(personnelId){
  _promoteModalPersonId = personnelId;
  let modal = document.getElementById('promote-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'promote-modal';
    modal.className = 'modal-overlay';
    modal.addEventListener('click', e => { if(e.target === modal) closePromoteModal(); });
    document.body.appendChild(modal);
  }
  _renderPromoteModal();
  modal.classList.add('open');
}

function closePromoteModal(){
  const modal = document.getElementById('promote-modal');
  if(modal) modal.classList.remove('open');
}

function _renderPromoteModal(){
  const modal = document.getElementById('promote-modal');
  if(!modal) return;
  const p = getPersonnelById(_promoteModalPersonId);
  if(!p){ closePromoteModal(); return; }

  const eligible = getPromotableRanksFor(p);
  // Group by service for readable rendering.
  const groups = {};
  eligible.forEach(r => {
    if(!groups[r.service]) groups[r.service] = [];
    groups[r.service].push(r);
  });
  const serviceLabel = (s) => ({
    fire:'Fire', ems:'EMS',
    police_local:'Local Police', police_county:'County Sheriff', police_state:'State Police'
  })[s] || s;

  const base = BAM_CONFIG.salaryBaseAnnual || 0;
  const rankRows = (rank) => {
    const isCurrent = rank.key === p.rankKey;
    const newSalary = Math.round(base * (rank.salaryMultiplier || 1.0));
    const salaryDelta = newSalary - (p.salaryAnnual || 0);
    const deltaStr = salaryDelta === 0 ? '' :
      `<span style="color:${salaryDelta>0?'var(--accent)':'var(--green)'};font-size:.7rem;">(${salaryDelta>0?'+':''}$${Math.abs(salaryDelta).toLocaleString()}/yr)</span>`;
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.04);">
      <div>
        <div style="font-weight:600;font-size:.84rem;">${_escPersonHtml(rank.label)}${isCurrent?' <span style="font-size:.7rem;color:var(--gold);">(current)</span>':''}</div>
        <div style="font-size:.7rem;color:var(--muted);">$${newSalary.toLocaleString()}/yr ${deltaStr}</div>
      </div>
      ${isCurrent
        ? ''
        : `<button class="btn-sm" onclick="_confirmPromote('${rank.key}')">Promote</button>`}
    </div>`;
  };
  const sections = Object.keys(groups).map(svc => `
    <div class="section-title" style="margin-top:10px;">${serviceLabel(svc)}</div>
    ${groups[svc].map(rankRows).join('')}
  `).join('') || '<div class="empty-msg">No eligible ranks. Train them in additional certifications first.</div>';

  modal.innerHTML = `<div class="modal-box gold-top" style="width:480px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column;">
    <div class="modal-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <h2 class="gold">Promote</h2>
        <div class="modal-sub">${_escPersonHtml(p.name)} · current: ${_escPersonHtml(p.rank || '—')}</div>
      </div>
      <button class="btn-sm danger" onclick="closePromoteModal()">✕</button>
    </div>
    <div class="modal-body" style="flex:1;overflow-y:auto;padding:10px 14px;">
      <div style="font-size:.74rem;color:var(--muted);">Promotion is free — cert training is the cost gate. Eligibility shown is based on current certifications (transitive equivalency applied).</div>
      ${sections}
    </div>
  </div>`;
}

function _confirmPromote(rankKey){
  if(!_promoteModalPersonId || !rankKey) return;
  const res = promotePersonnel(_promoteModalPersonId, rankKey);
  if(!res.ok) return;
  // Re-render the modal so eligibility + current marker update.
  _renderPromoteModal();
  if(typeof renderPersonnelTab === 'function')  renderPersonnelTab();
  if(typeof _renderManageBody === 'function')   _renderManageBody();
  if(typeof _renderUnitDetails === 'function')  _renderUnitDetails();
  if(typeof renderStationList === 'function')   renderStationList();
}

// =============================================================================
// SHIFTS + ON-DUTY EVALUATION  (Phase 5C)
// =============================================================================

// Returns every shift template available for a station — the global built-ins
// from BAM_CONFIG.shiftTemplates plus any custom shifts the station owns.
// Each entry: { key|id, label, cycleDays, onPattern, isCustom }.
function getStationShifts(stationId){
  const station = stations.find(s => s.id === stationId);
  const builtins = (BAM_CONFIG.shiftTemplates || []).map(t => ({ ...t, id: t.key, isCustom: false }));
  const custom   = (station?.shifts || []).map(s => ({ ...s, isCustom: true }));
  return [...builtins, ...custom];
}

// Looks up a shift template (built-in or station-custom) by id/key. Returns
// null when no match — caller treats null as "always on duty".
function _findShiftTemplate(shiftId, stationId){
  if(!shiftId) return null;
  return getStationShifts(stationId).find(s => (s.id || s.key) === shiftId) || null;
}

// True if the person is currently on-duty according to their shift schedule.
//   • Volunteers always return true (5D adds volunteer availability separately).
//   • Career personnel with no shiftId default to always-on (back-compat with
//     5B records that never had a shift assigned).
//   • Otherwise: walks the shift's cycleDay-of-N pattern against gameDay and
//     gameSeconds, treating hours past 24 as carrying into the next day.
function isOnDutyNow(person){
  if(!person) return false;
  if(person.type === 'volunteer') return true;
  if(!person.shiftId) return true;
  // Defensive — index.html owns gameDay/gameSeconds globals.
  const day = (typeof gameDay !== 'undefined') ? gameDay : 1;
  const sec = (typeof gameSeconds !== 'undefined') ? gameSeconds : 0;
  const tpl = _findShiftTemplate(person.shiftId, person.stationId);
  if(!tpl || !tpl.cycleDays || !Array.isArray(tpl.onPattern)) return true;
  const cycleIdx = ((day - 1) % tpl.cycleDays + tpl.cycleDays) % tpl.cycleDays;
  const todayWindows = tpl.onPattern[cycleIdx] || [];
  const hour = sec / 3600;
  // Check today's windows (some may carry past midnight via endHour > 24).
  for(const win of todayWindows){
    const [start, end] = win;
    if(hour >= start && hour < Math.min(end, 24)) return true;
  }
  // Carry-over: check previous cycle day's windows whose end exceeds 24.
  const prevIdx = (cycleIdx - 1 + tpl.cycleDays) % tpl.cycleDays;
  const prevWindows = tpl.onPattern[prevIdx] || [];
  for(const win of prevWindows){
    const [start, end] = win;
    if(end > 24 && hour < (end - 24)) return true;
  }
  return false;
}

// =============================================================================
// SALARY DEDUCTIONS  (Phase 5C)
// =============================================================================
// Tracks the last game-day on which salaries were deducted. _tickGameClock
// invokes tickSalaryDeductions() on every tick; it returns immediately unless
// gameDay has advanced past this marker.

let _lastSalaryGameDay = null;

// Returns an estimate of the next salary cycle: total $/day, per-station
// breakdown, and the count of career personnel contributing. Powers all
// three salary preview surfaces (cashflow header, personnel tab, station modal).
function estimateNextSalaryCycle(){
  let totalDaily = 0;
  let count = 0;
  const byStation = {};
  personnel.forEach(p => {
    const d = getSalaryDailyFor(p);
    if(d <= 0) return;
    totalDaily += d;
    count++;
    byStation[p.stationId] = (byStation[p.stationId] || 0) + d;
  });
  return { totalDaily: Math.round(totalDaily), count, byStation };
}

// Sums salary $/day for a single station's career personnel. Used by the
// per-station salary preview line in the Manage Station modal.
function estimateStationSalaryDaily(stationId){
  let sum = 0;
  getPersonnelByStation(stationId).forEach(p => {
    sum += getSalaryDailyFor(p);
  });
  return Math.round(sum);
}

// Called from _tickGameClock every real second. Deducts salaries once per
// game-day rollover and emits a single consolidated cashflow line.
// Safe to call before salary system is initialized (no-ops when there are no
// career personnel). First call after world load syncs _lastSalaryGameDay
// without charging so an old save doesn't get back-billed.
function tickSalaryDeductions(){
  const day = (typeof gameDay !== 'undefined') ? gameDay : 1;
  if(_lastSalaryGameDay == null){ _lastSalaryGameDay = day; return; }
  if(day === _lastSalaryGameDay) return;
  const daysAdvanced = day - _lastSalaryGameDay;
  _lastSalaryGameDay = day;
  if(daysAdvanced <= 0) return;
  const est = estimateNextSalaryCycle();
  if(est.totalDaily <= 0) return;
  const total = est.totalDaily * daysAdvanced;
  if(typeof updateMoney === 'function')  updateMoney(-total);
  if(typeof logCashflow === 'function')  logCashflow(-total,
    `[SALARIES] Day${daysAdvanced > 1 ? 's ' + (day - daysAdvanced + 1) + '–' + day : ' ' + day} · ${est.count} personnel`);
}

// Resets the salary-day marker. Called on world load so the first post-load
// tick syncs to the loaded gameDay instead of back-billing.
function resetSalaryCycleMarker(){
  _lastSalaryGameDay = null;
}

// =============================================================================
// SHIFT EDITOR MODAL  (Phase 5C)
// =============================================================================
// Per-station shift management. The Shift editor lets the player:
//   • View built-in shift templates + this station's custom shifts.
//   • Add a new custom shift (label + cycleDays + on-hour windows per cycle day).
//   • Assign personnel at this station to a shift (or clear back to always-on).
//   • Delete a custom shift (built-ins are read-only).

let _shiftEditorStationId = null;

function openStationShiftEditor(stationId){
  _shiftEditorStationId = stationId;
  let modal = document.getElementById('shift-editor-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'shift-editor-modal';
    modal.className = 'modal-overlay';
    modal.addEventListener('click', e => { if(e.target === modal) closeShiftEditor(); });
    document.body.appendChild(modal);
  }
  _renderShiftEditor();
  modal.classList.add('open');
}

function closeShiftEditor(){
  const modal = document.getElementById('shift-editor-modal');
  if(modal) modal.classList.remove('open');
}

function _renderShiftEditor(){
  const modal = document.getElementById('shift-editor-modal');
  if(!modal || !_shiftEditorStationId) return;
  const s = stations.find(x => x.id === _shiftEditorStationId);
  if(!s){ closeShiftEditor(); return; }

  const shifts = getStationShifts(s.id);
  const roster = getPersonnelByStation(s.id).filter(p => p.type !== 'volunteer');

  const shiftRow = (sh) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
    <div>
      <div style="font-weight:600;font-size:.84rem;">${_escPersonHtml(sh.label)}${sh.isCustom ? ' <span style="font-size:.66rem;color:var(--gold);">custom</span>' : ''}</div>
      <div style="font-size:.7rem;color:var(--muted);">Cycle: ${sh.cycleDays} day(s) · Pattern: ${_describeShiftPattern(sh)}</div>
    </div>
    ${sh.isCustom
      ? `<button class="btn-sm danger" onclick="_deleteCustomShift('${sh.id}')">Delete</button>`
      : ''}
  </div>`;

  // Personnel assignment table: shift dropdown per person.
  const shiftOpts = ['<option value="">— always on duty —</option>']
    .concat(shifts.map(sh => `<option value="${sh.id}">${_escPersonHtml(sh.label)}</option>`))
    .join('');

  const personRows = roster.length ? roster.map(p => {
    const cur = p.shiftId || '';
    const onDuty = isOnDutyNow(p);
    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:.8rem;">
      <span style="flex:1;">${_escPersonHtml(p.name)} <span style="color:var(--muted);font-size:.7rem;">${_escPersonHtml(p.rank || '')}</span></span>
      <span style="font-size:.7rem;color:${onDuty ? 'var(--green)' : 'var(--muted)'};">${onDuty ? 'on duty' : 'off duty'}</span>
      <select onchange="_assignPersonShift('${p.id}', this.value)" style="font-size:.74rem;">
        ${shiftOpts.replace(`value="${cur}"`, `value="${cur}" selected`)}
      </select>
    </div>`;
  }).join('') : '<div class="empty-msg">No career personnel at this station.</div>';

  modal.innerHTML = `<div class="modal-box gold-top" style="width:640px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;">
    <div class="modal-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <h2 class="gold">Shifts — ${_escPersonHtml(s.name)}</h2>
        <div class="modal-sub">Estimated daily salaries: $${estimateStationSalaryDaily(s.id).toLocaleString()}/day</div>
      </div>
      <button class="btn-sm danger" onclick="closeShiftEditor()">✕</button>
    </div>
    <div class="modal-body" style="flex:1;overflow-y:auto;padding:14px 16px;">
      <div class="section-title">Templates</div>
      ${shifts.map(shiftRow).join('')}
      <div style="margin-top:10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <input id="se-new-label" type="text" placeholder="Shift name (e.g. C-Platoon)" style="flex:1;min-width:160px;"/>
        <input id="se-new-cycle" type="number" min="1" max="14" value="3" style="width:70px;" title="Cycle days"/>
        <input id="se-new-pattern" type="text" placeholder="On hours per day (e.g. 0-24;;)"
               value="0-24;;" style="flex:1;min-width:200px;font-family:var(--mono),monospace;"
               title="Semicolon-separated on-windows per cycle day. Each day: comma-separated 'start-end' (24h). Empty = off day. Example: 0-24;; = 24/48"/>
        <button class="btn-sm" onclick="_addCustomShift()">+ Add</button>
      </div>
      <div style="font-size:.7rem;color:var(--muted);margin-top:4px;">
        Pattern syntax: semicolons separate cycle days. Each day = comma-separated <code>start-end</code> windows in 24-hour time. An empty day = off. <code>end</code> > 24 carries past midnight (e.g. <code>18-30</code> = 18:00 today through 06:00 tomorrow).
      </div>

      <div class="section-title" style="margin-top:14px;">Personnel Assignments</div>
      ${personRows}
    </div>
  </div>`;
}

// Returns a human-friendly description of a shift's onPattern.
function _describeShiftPattern(sh){
  if(!sh.onPattern) return '(custom)';
  return sh.onPattern.map((day,i) => {
    if(!day.length) return 'OFF';
    return day.map(([a,b]) => `${a}-${b}`).join(',');
  }).join(' / ');
}

function _addCustomShift(){
  const s = stations.find(x => x.id === _shiftEditorStationId);
  if(!s) return;
  const label = document.getElementById('se-new-label')?.value?.trim();
  const cycle = parseInt(document.getElementById('se-new-cycle')?.value || '1', 10);
  const pat   = document.getElementById('se-new-pattern')?.value || '';
  if(!label){ setStatus('Enter a shift name.'); return; }
  if(!cycle || cycle < 1){ setStatus('Cycle days must be ≥ 1.'); return; }
  // Parse pattern: semicolon-separated days. Each day: comma-separated start-end ranges.
  const onPattern = [];
  for(let i = 0; i < cycle; i++){
    const dayChunks = (pat.split(';')[i] || '').trim();
    if(!dayChunks){ onPattern.push([]); continue; }
    const wins = dayChunks.split(',').map(w => {
      const [a,b] = w.split('-').map(x => parseFloat(x.trim()));
      return (isFinite(a) && isFinite(b)) ? [a,b] : null;
    }).filter(Boolean);
    onPattern.push(wins);
  }
  s.shifts = s.shifts || [];
  s.shifts.push({
    id: 'sh_' + Date.now().toString(36),
    label,
    cycleDays: cycle,
    onPattern
  });
  setStatus(`Added custom shift "${label}".`);
  _renderShiftEditor();
}

function _deleteCustomShift(shiftId){
  const s = stations.find(x => x.id === _shiftEditorStationId);
  if(!s || !s.shifts) return;
  // Unassign any personnel currently on this shift before removing.
  getPersonnelByStation(s.id).forEach(p => {
    if(p.shiftId === shiftId){ p.shiftId = null; p.playerEdited = true; }
  });
  s.shifts = s.shifts.filter(sh => sh.id !== shiftId);
  setStatus('Custom shift deleted.');
  _renderShiftEditor();
  if(typeof renderPersonnelTab === 'function') renderPersonnelTab();
}

function _assignPersonShift(personnelId, shiftId){
  const p = getPersonnelById(personnelId);
  if(!p) return;
  p.shiftId = shiftId || null;
  p.playerEdited = true;
  _renderShiftEditor();
  if(typeof renderPersonnelTab === 'function') renderPersonnelTab();
}

// =============================================================================
// STATS + CAREER HISTORY  (Phase 5E)
// =============================================================================
// Per-person counters live on person.stats. History (capped, oldest aged out)
// lives on person.history as a list of { gameSec, gameDay, type, summary,
// incidentId? } entries. recordPersonStat is the single entry point that
// callers across dispatch, training, promotion, etc. use to push updates.

// Returns the default-zero stats block. Used at hire time and as a safety
// backfill when an older save is loaded.
function _emptyStats(){
  return {
    callsResponded:    0,
    fireCalls:         0,
    emsCalls:          0,
    policeCalls:       0,
    transports:        0,
    saves:             0,
    missedCalls:       0,
    trainingCompleted: 0,
    driveTimeSec:      0,
    commandIncidents:  0
  };
}

// Public: increments a stat counter on a person AND optionally appends a
// history entry. statKey may be null to record history only.
// historyEntry shape: { type, summary, incidentId? } — gameSec/gameDay are
// stamped here.
//
// History is capped at BAM_CONFIG.statsHistoryCapPerPerson (default 200);
// oldest entries are dropped when the cap is exceeded.
function recordPersonStat(personnelId, statKey, delta = 1, historyEntry = null){
  const p = getPersonnelById(personnelId);
  if(!p) return;
  if(!p.stats) p.stats = _emptyStats();
  if(!p.history) p.history = [];
  if(statKey){
    p.stats[statKey] = (p.stats[statKey] || 0) + delta;
  }
  if(historyEntry){
    const sec = (typeof gameSeconds !== 'undefined') ? gameSeconds : 0;
    const day = (typeof gameDay !== 'undefined') ? gameDay : 1;
    p.history.unshift({
      gameSec: sec, gameDay: day,
      type: historyEntry.type || 'event',
      summary: historyEntry.summary || '',
      incidentId: historyEntry.incidentId || null
    });
    const cap = BAM_CONFIG.statsHistoryCapPerPerson || 200;
    if(p.history.length > cap) p.history = p.history.slice(0, cap);
  }
}

// Public: returns a summary block suitable for the personnel details modal.
// { stats, recentHistory: [first N], totalEntries }.
function getCareerSummary(personnelId){
  const p = getPersonnelById(personnelId);
  if(!p) return null;
  const stats = p.stats || _emptyStats();
  const history = p.history || [];
  return {
    stats,
    recentHistory: history.slice(0, 50),
    totalEntries: history.length
  };
}

// Public: resets every counter and clears the history log. Triple-confirmation
// is the caller's responsibility (the Database Health panel + per-person
// reset button both prompt before calling this).
function resetStats(personnelId){
  const p = getPersonnelById(personnelId);
  if(!p) return;
  p.stats = _emptyStats();
  p.history = [];
}

// =============================================================================
// PATIENT STABILIZATION  (Phase 5E)
// =============================================================================
// Patient objects gain `stabilization: 0..1` and `assignedProviders: [pid]`.
// Each game-second tick (called from _tickGameClock) accumulates progress
// based on the assigned providers' EMS cert levels. Once stabilization >= 1,
// the patient becomes transport-ready.
//
// Rules:
//   • One provider can only be assigned to one patient at a time (slot rule).
//   • Multiple providers can stack on a single patient (additive rate, capped
//     by BAM_CONFIG.stabilizationMaxRate when set).
//   • Provider rate comes from BAM_CONFIG.stabilizationRates keyed on the
//     highest EMS cert the provider holds (paramedic > aemt > emt > emr).

// Returns the per-game-second stabilization rate this provider contributes.
// 0 when they hold no EMS cert. CCP / phrn both treated as ccp tier.
// Sources rates from BAM_CONFIG.personnelStabilizationRates — distinct from
// the older unit-on-scene `stabilizationRates` block (per-unit, not per-person).
function _providerStabilizationRate(person){
  if(!person) return 0;
  const rates = BAM_CONFIG.personnelStabilizationRates || {};
  const certs = expandCertSet(person.certs || []);
  if(certs.has('ccp'))       return rates.ccp || 0;
  if(certs.has('phrn'))      return rates.phrn || rates.ccp || 0;
  if(certs.has('paramedic')) return rates.paramedic || 0;
  if(certs.has('aemt'))      return rates.aemt || 0;
  if(certs.has('emt'))       return rates.emt || 0;
  if(certs.has('emr'))       return rates.emr || 0;
  return 0;
}

// Public: returns the total per-second stabilization rate for a patient from
// PERSONNEL contributions (separate from the unit-on-scene rate computed by
// the existing tickPatientStabilization in index.html). Caps at
// BAM_CONFIG.personnelStabilizationMaxRate when set (>0).
function calcStabilizationRate(patient){
  if(!patient || !patient.assignedProviders?.length) return 0;
  let total = 0;
  patient.assignedProviders.forEach(pid => {
    total += _providerStabilizationRate(getPersonnelById(pid));
  });
  const cap = BAM_CONFIG.personnelStabilizationMaxRate || 0;
  if(cap > 0) total = Math.min(total, cap);
  return total;
}

// Public: assigns a provider to a patient. Enforces 1-provider-per-patient
// invariant by clearing any prior assignment. Returns { ok, reason }.
function assignPersonToPatient(personnelId, patient){
  const p = getPersonnelById(personnelId);
  if(!p) return { ok:false, reason:'not_found' };
  if(!patient) return { ok:false, reason:'no_patient' };
  if(p.assignedPatientId && p.assignedPatientId !== patient.id){
    // Detach from previous patient first.
    unassignPersonFromPatient(personnelId);
  }
  patient.assignedProviders = patient.assignedProviders || [];
  if(!patient.assignedProviders.includes(personnelId)){
    patient.assignedProviders.push(personnelId);
  }
  p.assignedPatientId = patient.id;
  return { ok:true };
}

// Public: removes the person from their currently-assigned patient (if any).
// Caller doesn't need to know which patient — we look up via the back-ref.
function unassignPersonFromPatient(personnelId){
  const p = getPersonnelById(personnelId);
  if(!p) return;
  const pid = p.assignedPatientId;
  if(!pid) return;
  // Find the patient by id across active incidents.
  if(typeof incidents !== 'undefined'){
    for(const inc of incidents){
      const pat = (inc.patients || []).find(x => x.id === pid);
      if(pat){
        pat.assignedProviders = (pat.assignedProviders || []).filter(x => x !== personnelId);
        break;
      }
    }
  }
  p.assignedPatientId = null;
}

// Public: per-tick advance of PERSONNEL-driven patient stabilization across
// every active incident. Adds to the existing per-unit stabilizeProgress
// already maintained by the legacy tickPatientStabilization in index.html —
// we contribute via the same `stabilizeProgress` field so the existing UI bars
// and stabilized-status threshold (>=1) keep working uniformly.
// Named distinctly from the legacy fn to avoid the global-scope collision.
function tickPersonnelStabilization(deltaGameSec){
  if(typeof incidents === 'undefined' || !deltaGameSec) return;
  incidents.forEach(inc => {
    if(inc.status === 'resolved') return;
    (inc.patients || []).forEach(pat => {
      // Use the existing legacy field name so both contribution sources stack
      // onto a single progress value — UI bars and status flips already key on
      // stabilizeProgress >= 1.
      if(pat.stabilizeProgress == null) pat.stabilizeProgress = 0;
      if(pat.stabilizeProgress >= 1) return;
      const rate = calcStabilizationRate(pat);
      if(rate <= 0) return;
      pat.stabilizeProgress = Math.min(1, pat.stabilizeProgress + rate * deltaGameSec);
      if(pat.stabilizeProgress >= 1 && pat.status === 'stabilizing') pat.status = 'stabilized';
    });
  });
}

// =============================================================================
// SPAN OF CONTROL  (Phase 5E)
// =============================================================================

// Returns the on-scene span-of-control rating for an incident. Counts officers
// (Fire Officer 1+, EMS Supervisor, Patrol Supervisor) vs subordinates among
// every currently-busy responder assigned to the incident.
//
// Returns { officerCount, subordinateCount, ratio, tierKey, label, tooltip, color }.
// The tier is universal — no per-incident-size scaling per player requirement.
function getSpanOfControlForIncident(incidentId){
  const officerCerts = BAM_CONFIG.spanOfControlOfficerCerts || [];
  const tiers = BAM_CONFIG.spanOfControlTiers || {};
  let officerCount = 0;
  let totalOnScene = 0;
  personnel.forEach(p => {
    if(p.currentAssignment?.callId !== incidentId) return;
    totalOnScene++;
    const certs = expandCertSet(p.certs || []);
    if(officerCerts.some(c => certs.has(c))) officerCount++;
  });
  const subordinateCount = Math.max(0, totalOnScene - officerCount);
  const ratio = (officerCount > 0) ? (subordinateCount / officerCount) : Infinity;
  // Classify into tier by ratio <= tier.max. Iteration order is bored → ideal
  // → task_saturated → overwhelmed (insertion order of the object literal).
  let tierKey = 'overwhelmed';
  if(officerCount === 0 && subordinateCount === 0){
    // No one on scene — return a neutral tier so the UI can hide the chip.
    return { officerCount, subordinateCount, ratio:0, tierKey:'none', label:'', tooltip:'', color:'#6b7280' };
  }
  for(const [key, def] of Object.entries(tiers)){
    if(ratio <= def.max){ tierKey = key; break; }
  }
  const def = tiers[tierKey] || {};
  return {
    officerCount, subordinateCount, ratio,
    tierKey,
    label:   def.label   || tierKey,
    tooltip: def.tooltip || '',
    color:   def.color   || '#6b7280'
  };
}

// =============================================================================
// ON-SCENE ROSTER  (Phase 5E)
// =============================================================================

// Returns a flat list of every responder currently on scene for an incident:
//   { personId, name, rank, stationId, stationName, apparatusId, apparatusName, currentTask }
// `currentTask` is derived from the person's assignment + role hints:
//   • Pinned to a unit → 'Driver/Operator' if they hold the driver cert,
//     else 'Crew member'
//   • Assigned to a patient → 'Patient Care — PT <suffix>'
//   • Otherwise → 'Standby'
// Public: renders the call-window Personnel tab pane. Lists on-scene roster
// with station/apparatus/task columns and a per-patient provider-assignment
// section honoring the 1-provider-per-patient invariant.
function _renderPersonnelDispatchTab(inc){
  if(!inc) return '';
  const roster = getOnSceneRoster(inc.id);
  const rosterRows = roster.length ? roster.map(r => `
    <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr auto;gap:8px;align-items:center;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:.78rem;">
      <span>${_escPersonHtml(r.name)} <span style="color:var(--muted);font-size:.7rem;">${_escPersonHtml(r.rank)}</span></span>
      <span style="color:var(--muted);">${_escPersonHtml(r.stationName)}</span>
      <span style="color:var(--muted);">${_escPersonHtml(r.apparatusName || '—')}</span>
      <span style="color:var(--gold);font-size:.72rem;">${_escPersonHtml(r.currentTask)}</span>
      <button class="btn-sm" onclick="openPersonnelDetails('${r.personId}')">Details</button>
    </div>
  `).join('') : '<div class="empty-msg">No personnel on scene yet. Personnel are credited automatically when their unit arrives.</div>';

  // Per-patient provider assignment.
  let patientsBlock = '';
  if((inc.patients || []).length){
    patientsBlock = `<div class="section-title" style="margin-top:14px;">Patients & Providers</div>`;
    const candidatePool = personnel.filter(p =>
         p.currentAssignment?.callId === inc.id
      && _providerStabilizationRate(p) > 0
    );
    inc.patients.forEach(pat => {
      const assignedIds   = pat.assignedProviders || [];
      const assignedNames = assignedIds.map(id => getPersonnelById(id)?.name).filter(Boolean).join(', ') || '(none)';
      const totalRate     = calcStabilizationRate(pat);
      const stabPct       = Math.round((pat.stabilizeProgress || 0) * 100);
      const stabColor     = (pat.stabilizeProgress || 0) >= 1 ? 'var(--green)' : 'var(--ems)';
      const injCfg        = BAM_CONFIG.injuryTypes?.[pat.injuryType];
      // Pool = on-scene providers NOT already on a different patient
      // (uniqueness enforced by assignPersonToPatient).
      const dropOpts = candidatePool
        .filter(p => !assignedIds.includes(p.id))
        .map(p => {
          const conflict = p.assignedPatientId && p.assignedPatientId !== pat.id ? ' (will detach)' : '';
          return `<option value="${p.id}">${_escPersonHtml(p.name)} — ${_escPersonHtml(p.rank || '')}${conflict}</option>`;
        }).join('');
      patientsBlock += `<div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:4px;padding:8px 10px;margin-bottom:6px;font-size:.78rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span><b>${_escPersonHtml(injCfg?.label || pat.injuryType)}</b> · ${_escPersonHtml(pat.status || 'stabilizing')}</span>
          <span style="color:var(--muted);font-size:.72rem;">+${totalRate.toFixed(4)}/sec from personnel</span>
        </div>
        <div class="res-bar-track" style="margin:6px 0;"><div style="width:${stabPct}%;background:${stabColor};height:100%;transition:width 1s linear;"></div></div>
        <div style="margin-bottom:4px;"><span style="color:var(--muted);">Providers:</span> ${_escPersonHtml(assignedNames)}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
          ${assignedIds.map(id => `<button class="btn-sm" onclick="_dispatchUnassignProvider('${id}', '${pat.id}', '${inc.id}')" title="Unassign this provider">✕ ${_escPersonHtml(getPersonnelById(id)?.name || 'provider')}</button>`).join('')}
          ${dropOpts ? `<select id="ppa-${pat.id}" style="font-size:.74rem;">
            <option value="">— assign provider —</option>${dropOpts}
          </select>
          <button class="btn-sm" onclick="_dispatchAssignProviderFromSelect('${pat.id}', '${inc.id}')">Assign</button>` : '<span style="color:var(--muted);font-size:.7rem;">No more EMS-cert providers available on scene.</span>'}
        </div>
      </div>`;
    });
  }

  return `<div class="section-title">On Scene (${roster.length})</div>
    ${rosterRows}
    ${patientsBlock}
  `;
}

function _dispatchAssignProviderFromSelect(patientId, incidentId){
  const sel = document.getElementById('ppa-' + patientId);
  if(!sel || !sel.value) return;
  const inc = (typeof incidents !== 'undefined') ? incidents.find(x => x.id === incidentId) : null;
  if(!inc) return;
  const pat = (inc.patients || []).find(x => x.id === patientId);
  if(!pat) return;
  assignPersonToPatient(sel.value, pat);
  if(typeof renderDispatchBody === 'function'){
    renderDispatchBody(inc, BAM_CONFIG.missions[inc.missionKey]);
  }
}

function _dispatchUnassignProvider(personnelId, patientId, incidentId){
  unassignPersonFromPatient(personnelId);
  const inc = (typeof incidents !== 'undefined') ? incidents.find(x => x.id === incidentId) : null;
  if(inc && typeof renderDispatchBody === 'function'){
    renderDispatchBody(inc, BAM_CONFIG.missions[inc.missionKey]);
  }
}

function getOnSceneRoster(incidentId){
  return personnel
    .filter(p => p.currentAssignment?.callId === incidentId)
    .map(p => {
      const station = stations.find(s => s.id === p.stationId);
      const unitId = p.currentAssignment?.unitId;
      let apparatusName = '';
      let driverCert = null;
      if(unitId){
        for(const s of stations){
          const u = s.units?.find(x => x.id === unitId);
          if(u){
            apparatusName = (typeof getUnitDisplayName === 'function') ? getUnitDisplayName(u, s) : u.name;
            driverCert = BAM_CONFIG.crewDefaults?.[u.typeKey]?.driverCert || null;
            break;
          }
        }
      }
      // Task assignment derivation.
      let currentTask = 'Standby';
      if(p.assignedPatientId){
        currentTask = `Patient Care — ${String(p.assignedPatientId).slice(-4)}`;
      } else if(driverCert && personHasCert(p, driverCert)){
        currentTask = 'Driver/Operator';
      } else if(unitId){
        currentTask = 'Crew Member';
      }
      return {
        personId: p.id, name: p.name, rank: p.rank || '',
        stationId: p.stationId, stationName: station?.name || '',
        apparatusId: unitId || null, apparatusName,
        currentTask
      };
    });
}
