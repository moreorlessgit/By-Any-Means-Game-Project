// =============================================================================
// BY ANY MEANS — VOLUNTEERS MODULE (Phase 5 refactor — abstract assembly)
// =============================================================================
// Owns the volunteer side of the personnel system. As of the post-Phase-5
// refactor, volunteer RESPONSE is fully abstracted — no map-based homes, no
// OSRM routing, no per-volunteer animation. Each volunteer who is paged for
// a call rolls a personal assembly delay from a per-station window
// (mean ± spread game minutes); when the delay elapses they're considered
// "at station" and count toward the apparatus crew gate.
//
// What still lives here:
//   • OSM building cache per ESN (kept for future call-generation features —
//     building/POI-driven incidents — not used by volunteers anymore).
//   • Volunteer availability evaluation (schedule + super-responder + state).
//   • Hourly availability re-roll (now includes a rare 'at_station' outcome).
//   • Abstract assembly orchestration (triggerVolunteerStationResponse).
//   • Force-out + post-failure linger.
//   • Direct-to-scene eligibility (cert-based, no location).
//   • Volunteer-aware helpers used by the crew picker and station UI.
//
// What was removed in the refactor:
//   • person.home, person.availability.currentLocation, person.isCustomized
//   • generateVolunteerHome, generateVolunteerWork, _pickRoamingLocationFor
//   • dispatchVolunteer (OSRM polyline animation)
//   • _snapToNearestRoad
//   • autoMigrateVolunteersForESN
//   • refreshVolunteerLocationMarkers, _volunteerHomeMarkers, _volunteerLiveMarkers
//   • setVolunteerLayerVisible (the homes/responders map layer toggles)
//   • beginVolunteerLocationPick (map-click home picking)
//
// Depends on: config.js (BAM_CONFIG), personnel.js (personnel[], helpers),
// esn.js (for cache helpers when future POI features land). Loaded after
// personnel.js.
// =============================================================================

// ── ID HELPER ────────────────────────────────────────────────────────────────
function _genVolunteerEventId(){
  return 'vol_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// Absolute game-seconds since game start. `gameSeconds` is an in-day counter
// (rolls 0 → 86399), `gameDay` is 1-indexed. Use this for any timestamp that
// must compare correctly across midnight rollover.
function _absGameSec(){
  const day = (typeof gameDay     !== 'undefined') ? gameDay     : 1;
  const sec = (typeof gameSeconds !== 'undefined') ? gameSeconds : 0;
  return (day - 1) * 86400 + sec;
}

// =============================================================================
// OSM BUILDING CACHE  (retained for future POI / call-generation features)
// =============================================================================
// Cache lives on the ESN object (esn.osmBuildingCache) so it ships with the
// save blob and survives reloads. Currently used by NOTHING in the live game —
// the volunteer refactor removed its consumer. Kept around because future
// call-types will spawn at specific building types (e.g., "structure fire at
// a commercial address") and the cache is the cheap path to that data.
//
// Shape:
//   esn.osmBuildingCache = {
//     fetchedAt: <epoch ms>,
//     fallbackMode: <bool>,
//     houses:      [{lat,lng,wayId}, ...],
//     commercial:  [...],
//     industrial:  [...],
//     retail:      [...]
//   }
//
// TTL is 30 REAL-LIFE days. `fetchedAt` is wall-clock so a save from a year
// ago that gets loaded today is immediately stale.

const _osmRebuildCooldowns = new Map();

function _osmCacheIsStale(esn){
  const cache = esn?.osmBuildingCache;
  if(!cache?.fetchedAt) return true;
  const ttl = BAM_CONFIG.osmCacheTtlMs || (30 * 24 * 60 * 60 * 1000);
  return (Date.now() - cache.fetchedAt) > ttl;
}

function _osmCacheIsEmpty(esn){
  const cache = esn?.osmBuildingCache;
  if(!cache) return true;
  return !((cache.houses||[]).length || (cache.commercial||[]).length
        || (cache.industrial||[]).length || (cache.retail||[]).length);
}

function _buildOverpassQuery(coords){
  const poly = coords.map(c => `${c[0]} ${c[1]}`).join(' ');
  const timeoutSec = Math.round((BAM_CONFIG.overpassTimeoutMs || 10000) / 1000);
  return `
[out:json][timeout:${timeoutSec}];
(
  way["building"~"^(house|residential|detached|semidetached_house|terrace|bungalow|farm)$"](poly:"${poly}");
  way["building"~"^(commercial|office|retail|shop|supermarket|mall)$"](poly:"${poly}");
  way["building"~"^(industrial|warehouse|factory|manufacture)$"](poly:"${poly}");
);
out center;`;
}

function _bucketBuildingType(tagValue){
  if(!tagValue) return null;
  const v = tagValue.toLowerCase();
  if(['house','residential','detached','semidetached_house','terrace','bungalow','farm'].includes(v)) return 'houses';
  if(['commercial','office','supermarket','mall'].includes(v)) return 'commercial';
  if(['industrial','warehouse','factory','manufacture'].includes(v)) return 'industrial';
  if(['retail','shop'].includes(v)) return 'retail';
  return null;
}

function _emptyCache(fallbackMode){
  return {
    fetchedAt: Date.now(),
    fallbackMode: !!fallbackMode,
    houses: [], commercial: [], industrial: [], retail: []
  };
}

async function fetchBuildingsForESN(esnId, force=false){
  const esn = esns.find(e => e.id === esnId);
  if(!esn || !esn.coords?.length){
    return _emptyCache(true);
  }
  if(!force){
    const cd = _osmRebuildCooldowns.get(esnId);
    if(cd && cd > Date.now()){
      return esn.osmBuildingCache || _emptyCache(true);
    }
  }
  _osmRebuildCooldowns.set(esnId, Date.now() + (BAM_CONFIG.osmRebuildCooldownSec || 30) * 1000);

  const endpoint = BAM_CONFIG.overpassEndpoint || 'https://overpass-api.de/api/interpreter';
  const query = _buildOverpassQuery(esn.coords);
  const controller = new AbortController();
  const timeoutMs = BAM_CONFIG.overpassTimeoutMs || 10000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let cache;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
      signal: controller.signal
    });
    clearTimeout(timer);
    if(!res.ok) throw new Error('overpass ' + res.status);
    const json = await res.json();
    cache = _emptyCache(false);
    (json.elements || []).forEach(el => {
      if(!el.center) return;
      const bucket = _bucketBuildingType(el.tags?.building);
      if(!bucket) return;
      cache[bucket].push({ lat: el.center.lat, lng: el.center.lon, wayId: el.id });
    });
    cache.fetchedAt = Date.now();
    if(typeof setStatus === 'function'){
      setStatus(`OSM cache: ${esn.name} — ${cache.houses.length}H / ${cache.commercial.length}C / ${cache.industrial.length}I / ${cache.retail.length}R`);
    }
  } catch (err) {
    clearTimeout(timer);
    cache = _emptyCache(true);
    if(typeof setStatus === 'function'){
      setStatus(`OSM cache: ${esn.name} — Overpass unavailable.`);
    }
  }

  esn.osmBuildingCache = cache;
  return cache;
}

function purgeBuildingCacheForESN(esnId){
  const esn = esns.find(e => e.id === esnId);
  if(!esn) return;
  esn.osmBuildingCache = null;
  _osmRebuildCooldowns.delete(esnId);
}

async function rebuildAllBuildingCaches(progressCb){
  const list = esns.slice();
  for(let i = 0; i < list.length; i++){
    const e = list[i];
    await fetchBuildingsForESN(e.id, true);
    if(typeof progressCb === 'function') progressCb({ done: i + 1, total: list.length, esnName: e.name });
    if(i < list.length - 1){
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Picks one random building of `type` from an ESN's cache. Lazily refetches
// when stale/empty. The OSRM road-snap fallback was removed in the refactor —
// if Overpass has no buildings, callers get a raw random point in the polygon.
async function pickRandomBuildingInESN(esnId, type){
  const esn = esns.find(e => e.id === esnId);
  if(!esn) return null;
  if(_osmCacheIsStale(esn) || (_osmCacheIsEmpty(esn) && !esn.osmBuildingCache?.fallbackMode)){
    await fetchBuildingsForESN(esn.id);
  }
  const cache = esn.osmBuildingCache;
  const bucket = (cache && cache[type]) || [];
  if(bucket.length){
    const pick = bucket[Math.floor(Math.random() * bucket.length)];
    return { lat: pick.lat, lng: pick.lng, wayId: pick.wayId, fallback: false };
  }
  if(typeof _randomPointInPolygon !== 'function') return null;
  const [lat, lng] = _randomPointInPolygon(esn.coords);
  return { lat, lng, wayId: null, fallback: true };
}

// =============================================================================
// PER-STATION ASSEMBLY DELAY
// =============================================================================
// Each volunteer station carries its own assembly-delay window. Defaults are
// seeded from config when the station is first volunteer-flagged; the player
// can edit them in the station modal.

// Returns the station's effective assembly delay window. Falls back to config
// defaults when the station has no explicit override.
function getStationAssemblyDelay(station){
  const cfgMean   = BAM_CONFIG.volunteerAssemblyMeanGameMin   ?? 5;
  const cfgSpread = BAM_CONFIG.volunteerAssemblySpreadGameMin ?? 2;
  if(!station) return { meanGameMin: cfgMean, spreadGameMin: cfgSpread };
  const va = station.volunteerAssembly || {};
  return {
    meanGameMin:   (typeof va.meanGameMin   === 'number') ? va.meanGameMin   : cfgMean,
    spreadGameMin: (typeof va.spreadGameMin === 'number') ? va.spreadGameMin : cfgSpread,
  };
}

// Seeds station.volunteerAssembly with config defaults if missing. Called from
// the station modal when the player switches a station to volunteer staffing.
function ensureStationAssemblyDefaults(station){
  if(!station) return;
  if(station.volunteerAssembly && typeof station.volunteerAssembly === 'object') return;
  const cfg = getStationAssemblyDelay(null);
  station.volunteerAssembly = { meanGameMin: cfg.meanGameMin, spreadGameMin: cfg.spreadGameMin };
}

// Rolls a per-volunteer assembly delay in game seconds. Roaming ('out of area')
// volunteers get a multiplier so they take longer to respond.
function rollVolunteerAssemblyDelaySec(person, station){
  const win = getStationAssemblyDelay(station);
  const lo  = Math.max(0.5, win.meanGameMin - win.spreadGameMin);
  const hi  = win.meanGameMin + win.spreadGameMin;
  let delayMin = lo + Math.random() * Math.max(0, hi - lo);
  const a = person?.availability;
  if(a?.currentState === 'roaming'){
    delayMin *= (BAM_CONFIG.volunteerOutOfAreaMultiplier ?? 1.5);
  }
  return Math.max(30, Math.round(delayMin * 60));   // ≥ 30 game-seconds
}

// Convenience for the crew picker — returns the typical ETA (mean) for this
// volunteer at this station in game minutes. Used by getCrewCandidatesForUnit
// in place of the retired distance/speed-based travel estimator.
function estimateVolunteerAssemblyMin(person, station){
  if(!person || person.type !== 'volunteer') return null;
  if(person.availability?.currentState === 'at_station') return 0;
  const win = getStationAssemblyDelay(station);
  let etaMin = win.meanGameMin;
  if(person.availability?.currentState === 'roaming'){
    etaMin *= (BAM_CONFIG.volunteerOutOfAreaMultiplier ?? 1.5);
  }
  return { distanceMi: 0, etaMin };
}

// Returns the picker-meta block for a volunteer candidate. Replaces the
// physical distance+ETA shape used by the OSRM-era picker.
function decorateVolunteerCandidate(person, station){
  let state;
  if(person.availability?.currentState === 'at_station' || person.status === 'at_station'){
    state = 'station';
  } else if(person.availability?.currentState === 'roaming'){
    state = 'roaming';
  } else {
    state = 'home';
  }
  const travel = estimateVolunteerAssemblyMin(person, station);
  return {
    state,
    distanceMi: 0,            // no physical distance anymore
    etaMin:     travel?.etaMin || 0,
    fitsSeats:  null
  };
}

// =============================================================================
// AVAILABILITY  (state-driven; persists across saves)
// =============================================================================
// Volunteer availability is a persistent hourly STATE — re-rolled at each
// in-game hour by `recomputeVolunteerAvailabilityHour()`. The states are:
//   'home'        → At Home, available to respond
//   'roaming'     → Out of Area, available with longer assembly delay
//   'at_station'  → Already at the station for the hour (rare; zero delay)
//   'unavailable' → Off-shift or random roll fail; cannot be paged
// Plus per-call status (person.status): 'available' (idle), 'responding'
// (paged, personal timer running), 'at_station' (timer elapsed, counted),
// 'busy' (rolling on a dispatched unit).

function isVolunteerAvailableNow(person){
  if(!person) return false;
  if(person.type !== 'volunteer') return true;
  if(person.isSuperResponder) return true;

  if(person.status && person.status !== 'available') return false;

  let a = person.availability;
  if(!a){
    a = person.availability = {
      currentState:        'home',
      nextRollGameHour:    0,
      schedule:            [],
      forceAvailableUntil: null
    };
  }

  if(a.forceAvailableUntil != null){
    const sec = (typeof gameSeconds !== 'undefined') ? gameSeconds : 0;
    const dayBase = ((typeof gameDay !== 'undefined') ? gameDay : 1) * 86400;
    const now = dayBase + sec;
    if(now < a.forceAvailableUntil) return true;
  }

  return a.currentState === 'home'
      || a.currentState === 'roaming'
      || a.currentState === 'at_station';
}

// Hourly state re-roll. Adds a rare `at_station` outcome where a volunteer is
// already at the station for the whole hour (zero assembly delay if paged).
function recomputeVolunteerAvailabilityHour(){
  if(typeof personnel === 'undefined' || !personnel.length) return;
  const day  = (typeof gameDay !== 'undefined') ? gameDay : 1;
  const sec  = (typeof gameSeconds !== 'undefined') ? gameSeconds : 0;
  const currentGameHour = Math.floor((day - 1) * 24 + sec / 3600);
  const dayOfWeek = ((day - 1) % 7 + 7) % 7;
  const dayMask = 1 << dayOfWeek;
  const hourOfDay = Math.floor(sec / 3600);

  const homeChance      = BAM_CONFIG.volunteerAvailableHomeChance      ?? 0.7;
  const roamingChance   = BAM_CONFIG.volunteerAvailableRoamingChance   ?? 0.05;
  const atStationChance = BAM_CONFIG.volunteerAtStationHourlyChance    ?? 0.02;

  personnel.forEach(p => {
    if(p.type !== 'volunteer') return;
    if(p.status && p.status !== 'available') return;  // busy/responding stay locked
    let a = p.availability;
    if(!a){
      a = p.availability = {
        currentState:        'home',
        nextRollGameHour:    0,
        schedule:            [],
        forceAvailableUntil: null
      };
    }
    if((a.nextRollGameHour || 0) > currentGameHour) return;

    // Post-failed-assembly linger: hold at 'home' until linger window expires.
    if(a.lingerAtStationUntilGameSec != null && a.lingerAtStationUntilGameSec > _absGameSec()){
      a.currentState = 'home';
      a.nextRollGameHour = currentGameHour + 1;
      return;
    }

    // Super-responder + player-override paths short-circuit unavailable / roaming.
    const nowAbs = day * 86400 + sec;
    const isForced = p.isSuperResponder
                  || (a.forceAvailableUntil != null && nowAbs < a.forceAvailableUntil);

    // Schedule windows — force unavailable outside any configured window.
    // Super-responders / force-overrides ignore the schedule.
    if(!isForced && Array.isArray(a.schedule) && a.schedule.length){
      const inWindow = a.schedule.some(([start, end, daysMask]) => {
        if(daysMask != null && (daysMask & dayMask) === 0) return false;
        return hourOfDay >= start && hourOfDay < end;
      });
      if(!inWindow){
        a.currentState = 'unavailable';
        a.nextRollGameHour = currentGameHour + 1;
        return;
      }
    }

    // Rare 'at_station' roll always applies (super-responders included).
    if(Math.random() < atStationChance){
      a.currentState = 'at_station';
      a.nextRollGameHour = currentGameHour + 1;
      return;
    }

    if(isForced){
      a.currentState = 'home';
      a.nextRollGameHour = currentGameHour + 1;
      return;
    }

    // Weighted roll: home / roaming / unavailable.
    const r = Math.random();
    if(r < homeChance){
      a.currentState = 'home';
    } else if(r < homeChance + roamingChance){
      a.currentState = 'roaming';
    } else {
      a.currentState = 'unavailable';
    }
    a.nextRollGameHour = currentGameHour + 1;
  });
}

// =============================================================================
// DIRECT-TO-SCENE ELIGIBILITY  (cert-based; no location)
// =============================================================================
function evaluateDirectToSceneEligibility(person, incident){
  if(!person || person.type !== 'volunteer'){
    return { eligible:false, willGoToScene:false, reason:'not_volunteer' };
  }
  const certs = expandCertSet(person.certs || []);
  const allowed = BAM_CONFIG.directToSceneAllowedRoles || [];
  const anyAllowed = allowed.some(c => certs.has(c));
  if(!anyAllowed){
    return { eligible:false, willGoToScene:false, reason:'role_not_allowed' };
  }
  const isFire = (incident?.type === 'fire' || incident?.missionKey?.startsWith?.('fire_'));
  if(isFire){
    const hasFireCert = certs.has('ff1') || certs.has('ff2');
    if(hasFireCert && person.hasPpeInVehicle){
      return { eligible:true, willGoToScene:true, reason:'ppe_in_vehicle_fire' };
    }
    if(hasFireCert){
      return { eligible:true, willGoToScene:true, reason:'fire_exterior_only' };
    }
  }
  return { eligible:true, willGoToScene:true, reason:'role_eligible' };
}

// =============================================================================
// ABSTRACT ASSEMBLY  (replaces the OSRM-routed station response)
// =============================================================================
// When an apparatus is dispatched with volunteer crew, each picked volunteer
// runs a personal assembly delay drawn from the station's mean ± spread window.
// Roaming responders get a multiplier; volunteers already in the rare
// 'at_station' availability state skip the timer entirely.
//
// Resolution shape (back-compat with the OSRM-era signature):
//   { arrived: personId[], noShows: personId[], forced: bool,
//     aborted: bool, requiredMet: bool, leftBehind: personId[] }
//
// `leftBehind` is new: at the timeout cap, if required seats are met but some
// responders haven't arrived yet, those responders stay in 'responding' and
// linger when their timer eventually elapses. They aren't no-shows; they're
// late.
function triggerVolunteerStationResponse(stationLatLng, responders, opts = {}){
  if(!Array.isArray(responders) || !responders.length){
    return Promise.resolve({ arrived: [], noShows: [], forced: false, aborted: false, requiredMet: true, leftBehind: [] });
  }

  const station = opts.station || null;   // optional — used for per-station delay
  const maxGameSec    = opts.maxGameSec    || ((BAM_CONFIG.volunteerAssemblyFailGameMin
                                              ?? BAM_CONFIG.volunteerAssemblyMaxGameMin
                                              ?? 10) * 60);
  const lingerGameSec = opts.lingerGameSec || ((BAM_CONFIG.volunteerFailedAssemblyLingerGameMin
                                              ?? BAM_CONFIG.volunteerStationLingerGameMin
                                              ?? 30) * 60);
  const abortSignal  = opts.abortSignal  || { aborted: false };
  const requiredCheck = (typeof opts.requiredCheck === 'function')
    ? opts.requiredCheck : (() => true);

  // Seed per-person status + assembly timestamps.
  const arrivedSet = new Set();
  responders.forEach(p => {
    if(p.availability?.currentState === 'at_station'){
      // Already at the station — counts immediately.
      p.status = 'at_station';
      p._respondingArrivalGameSec = _absGameSec();
      arrivedSet.add(p.id);
    } else {
      p.status = 'responding';
      const delaySec = rollVolunteerAssemblyDelaySec(p, station);
      p._respondingArrivalGameSec = _absGameSec() + delaySec;
    }
  });

  return new Promise(resolve => {
    let settled = false;
    let abortMode = false;

    const startGameSec = _absGameSec();

    // Per-tick: promote responders whose personal timer elapsed.
    function checkArrivals(){
      let changed = false;
      responders.forEach(p => {
        if(arrivedSet.has(p.id)) return;
        if(p.status === 'responding' && p._respondingArrivalGameSec != null
           && _absGameSec() >= p._respondingArrivalGameSec){
          p.status = 'at_station';
          arrivedSet.add(p.id);
          changed = true;
        }
      });
      return changed;
    }

    function finish(mode){
      if(settled) return;
      settled = true;
      clearInterval(pollHandle);
      const requiredMet = (mode === 'all_arrived' || mode === 'forced' || mode === 'timer_required_met');
      abortMode = (mode === 'timer_required_short');

      if(!abortMode){
        // Success path. Some responders may still be in 'responding' state if
        // we rolled out at the 10-min cap with required met — those are
        // "left behind." Cancel their assembly cleanly into the linger path.
        const leftBehind = [];
        const noShows = [];
        responders.forEach(p => {
          if(arrivedSet.has(p.id)) return;
          if(mode === 'timer_required_met'){
            // Late arrival continues toward the station via the same timer
            // mechanic, then enters the linger window once they "arrive".
            leftBehind.push(p.id);
          } else {
            // Force-out: cancel their timer and free them.
            p.status = 'available';
            p._respondingArrivalGameSec = null;
            p.currentAssignment = null;
            noShows.push(p.id);
          }
        });
        resolve({
          arrived: Array.from(arrivedSet),
          noShows,
          forced:  mode === 'forced',
          aborted: false,
          requiredMet,
          leftBehind
        });
        return;
      }

      // ABORT MODE — required seats not filled in time. Both already-arrived
      // and still-responding responders linger at the station for the linger
      // window before normal availability resumes. Responders still in
      // 'responding' wait out their timer (no snap-back), then linger.
      const lingerUntil = _absGameSec() + lingerGameSec;
      responders.forEach(p => {
        if(arrivedSet.has(p.id)){
          _setVolunteerLinger(p, lingerUntil);
        } else {
          // Still en route — keep their personal timer running. When it elapses
          // the per-call tick (tickVolunteerResponding) will linger-park them.
          p._respondingLingerUntilGameSec = lingerUntil;
        }
      });
      resolve({
        arrived: Array.from(arrivedSet),
        noShows: [],
        forced:  false,
        aborted: true,
        requiredMet: false,
        leftBehind: []
      });
    }

    // Single poller: drives arrivals, handles force-out + timeout cap.
    // 250ms real-time tick — responsive to force-out, cheap to leave running.
    const pollHandle = setInterval(() => {
      if(settled) return;
      if(abortSignal.aborted){
        finish('forced');
        return;
      }
      checkArrivals();
      if(arrivedSet.size >= responders.length){
        finish('all_arrived');
        return;
      }
      const elapsed = _absGameSec() - startGameSec;
      if(elapsed >= maxGameSec){
        const reqOk = !!requiredCheck(arrivedSet);
        finish(reqOk ? 'timer_required_met' : 'timer_required_short');
      }
    }, 250);
  });
}

// =============================================================================
// POST-ASSEMBLY LINGER + LATE-ARRIVAL TICK
// =============================================================================

// Marks a volunteer as parked at the station for the linger window. Their
// status flips to 'available' (no longer paged) and the hourly roll holds off
// until lingerAtStationUntilGameSec has passed.
function _setVolunteerLinger(person, lingerUntilGameSec){
  if(!person) return;
  person.status = 'available';
  person._respondingArrivalGameSec = null;
  person._respondingLingerUntilGameSec = null;
  person.currentAssignment = null;
  person.availability = person.availability || {
    currentState: 'home', nextRollGameHour: 0,
    schedule: [], forceAvailableUntil: null
  };
  person.availability.currentState = 'home';
  person.availability.lingerAtStationUntilGameSec = lingerUntilGameSec;
}

// Called every game tick. Handles two things:
//   1) Late arrivals: a responder whose personal timer elapsed after we
//      already rolled out (or in abort mode) needs to be transitioned.
//   2) Expired linger stamps cleared so the hourly roll picks fresh state.
function tickVolunteerStationLinger(){
  if(typeof personnel === 'undefined' || !personnel.length) return;
  const now = _absGameSec();
  personnel.forEach(p => {
    // Late arrivals after rollout / abort: their timer elapsed, no longer
    // tied to an active assembly window. Park them in linger.
    if(p.status === 'responding' && p._respondingArrivalGameSec != null
       && now >= p._respondingArrivalGameSec
       && p._respondingLingerUntilGameSec != null){
      _setVolunteerLinger(p, p._respondingLingerUntilGameSec);
    }
    // Clear expired linger stamps.
    const a = p.availability;
    if(a && a.lingerAtStationUntilGameSec != null && now >= a.lingerAtStationUntilGameSec){
      a.lingerAtStationUntilGameSec = null;
    }
  });
}

// =============================================================================
// FORCE-OUT  (depart an awaiting_crew apparatus before all volunteers arrive)
// =============================================================================
// The driver-cert gate is the only block on force-out. "At station" means:
//   • Career personnel on-duty at this station, OR
//   • A volunteer whose per-call status is 'at_station' (their assembly
//     timer elapsed; no longer a physical position check).
function forceVolunteerCrewDeparture(unitId){
  let unit = null, station = null;
  for(const s of (typeof stations !== 'undefined' ? stations : [])){
    const u = s.units?.find(x => x.id === unitId);
    if(u){ unit = u; station = s; break; }
  }
  if(!unit || !station) return { ok:false, reason:'unit_not_found' };
  if(unit.status !== 'awaiting_crew') return { ok:false, reason:'not_awaiting_crew' };

  const driverCert = (typeof getUnitDriverCert === 'function')
    ? getUnitDriverCert(unit) : null;
  if(driverCert){
    const atStation = (typeof personnel !== 'undefined' ? personnel : []).filter(p => {
      if(p.stationId !== station.id) return false;
      if(typeof personHasCert !== 'function' || !personHasCert(p, driverCert)) return false;
      if(p.type !== 'volunteer'){
        return (typeof isOnDutyNow === 'function') ? isOnDutyNow(p) : true;
      }
      return p.status === 'at_station';
    });
    if(!atStation.length){
      const certLabel = BAM_CONFIG.certifications?.[driverCert]?.label || driverCert;
      return { ok:false, reason:`no_driver_at_station:${certLabel}` };
    }
  }

  if(unit._awaitingAbortSignal){
    unit._awaitingAbortSignal.aborted = true;
    return { ok:true };
  }
  return { ok:false, reason:'no_abort_signal' };
}

// =============================================================================
// SAVE-LOAD MIGRATION
// =============================================================================
// Strips legacy physical-location fields from a volunteer record so old saves
// load cleanly under the new abstract model. Called from the save loader as
// each personnel record is rehydrated.
function purgeLegacyVolunteerFields(person){
  if(!person || person.type !== 'volunteer') return;
  if('home' in person) delete person.home;
  if('work' in person) delete person.work;
  if('currentLocation' in person) delete person.currentLocation;
  if('isCustomized' in person) delete person.isCustomized;
  if('wayId' in person) delete person.wayId;
  if('isFallback' in person) delete person.isFallback;
  if(person.availability){
    if('currentLocation' in person.availability) delete person.availability.currentLocation;
  }
}

// =============================================================================
// REMOVED-FUNCTION STUBS
// =============================================================================
// These exist as no-op stubs so any lingering references in other files (the
// dbhealth panel, ESN edit hooks, etc.) don't throw on call. New code should
// not call any of these — they'll be removed once every call site is cleaned.

function refreshVolunteerLocationMarkers(){ /* no-op — volunteer locations removed */ }
function autoMigrateVolunteersForESN(){ return Promise.resolve({ migrated: [], skipped: [] }); }
function generateVolunteerHome(){ return Promise.resolve(null); }
function generateVolunteerWork(){ return Promise.resolve(null); }
function setVolunteerLayerVisible(){ /* no-op — toggles removed */ }
function beginVolunteerLocationPick(){ /* no-op — map-pick removed */ }
function cancelVolunteerLocationPick(){ /* no-op */ }

// Legacy module-scope objects kept defined so any external references resolve
// to empty/safe values rather than ReferenceError.
let volunteerLayerVisibility = { responders: false, homes: false };
let _volunteerHomeMarkers   = new Map();
let _volunteerLiveMarkers   = new Map();
let _mapClickVolunteerTarget = null;
