// =============================================================================
// BY ANY MEANS — VOLUNTEERS MODULE (Phase 5D)
// =============================================================================
// Owns the volunteer response side of the personnel system:
//   • OSM building cache per ESN (homes, commercial, industrial, retail)
//   • Volunteer home + work generation via Overpass, with road-snapped
//     random fallback when Overpass fails / times out
//   • Volunteer availability evaluation (schedule + reliability + super flag)
//   • Direct-to-scene eligibility + dispatch helpers (reuses routeAndAnimate)
//   • Per-ESN auto-migration of volunteer homes on ESN polygon edits
//   • Map-layer toggles: volunteer responders, volunteer homes, volunteer works
//
// Depends on: config.js (BAM_CONFIG), personnel.js (personnel[], helpers),
// esn.js (_pointInPolygon, _randomPointInPolygon), index.html (routeAndAnimate).
// Loaded after personnel.js.
// =============================================================================

// ── MAP-LAYER VISIBILITY STATE ───────────────────────────────────────────────
// Two independent toggles. Persisted in settings (Phase 4A settings autosync).
// Defaults reasonable so a brand-new player isn't drowned in dots.
//
// Phase 5 bugfix — work locations removed entirely. Volunteers are now in one
// of three states (unavailable / home / roaming-in-coverage), not tied to a
// fixed work address. The legacy `works` flag is silently ignored if loaded
// from old settings.
let volunteerLayerVisibility = {
  responders: true,   // dots while responding on the map
  homes:      false   // persistent home markers
};

// Internal: marker pools for the home overlay so toggling on/off is fast.
let _volunteerHomeMarkers = new Map();   // personId → Leaflet marker
let _volunteerLiveMarkers = new Map();   // personId → Leaflet marker (transient, during response)

// ── ID HELPER ────────────────────────────────────────────────────────────────
function _genVolunteerEventId(){
  return 'vol_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// =============================================================================
// OSM BUILDING CACHE
// =============================================================================
// Cache lives on the ESN object (esn.osmBuildingCache) so it ships with the
// save blob and survives reloads — consistent with the Phase 5 persistence
// rule of "everything in the save blob, no new Prisma tables in this batch."
//
// Shape:
//   esn.osmBuildingCache = {
//     fetchedAt: <Date.now()-style epoch ms>,
//     fallbackMode: <bool>,         // true if last fetch fell back to random
//     houses:      [{lat,lng,wayId}, ...],
//     commercial:  [...],
//     industrial:  [...],
//     retail:      [...]
//   }
//
// TTL is 30 REAL-LIFE days (calendar time) per docs/data-lifecycle.md — not
// game days. `fetchedAt` is wall-clock so a save from a year ago that gets
// loaded today is immediately stale and the next read refetches.

// Returns the current per-ESN cooldown lookup. Keyed by esn id → epoch ms when
// the cooldown expires. Used to prevent rapid manual rebuild presses from
// hammering Overpass.
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

// Builds an Overpass QL query string targeting the ESN polygon. Single batched
// query returns all four building types at once via union. Bounded by polygon
// to keep response size small.
function _buildOverpassQuery(coords){
  // Overpass poly is space-separated "lat lng" pairs.
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

// Buckets an Overpass tags.building value into our 4 categories. Returns null
// for buildings that don't match any category (those get dropped).
function _bucketBuildingType(tagValue){
  if(!tagValue) return null;
  const v = tagValue.toLowerCase();
  if(['house','residential','detached','semidetached_house','terrace','bungalow','farm'].includes(v)) return 'houses';
  if(['commercial','office','supermarket','mall'].includes(v)) return 'commercial';
  if(['industrial','warehouse','factory','manufacture'].includes(v)) return 'industrial';
  if(['retail','shop'].includes(v)) return 'retail';
  return null;
}

// Public: fetches buildings for a single ESN from Overpass. On success populates
// esn.osmBuildingCache with fresh data + fallbackMode:false. On failure (timeout
// or any other error), seeds the cache as fallbackMode:true so subsequent
// pickRandomBuildingInESN calls fall through to road-snapped random points.
// Returns a Promise that resolves with the cache object (never rejects — the
// caller doesn't need to handle errors).
//
// Use `force=true` to bypass cooldown + freshness checks.
async function fetchBuildingsForESN(esnId, force=false){
  const esn = esns.find(e => e.id === esnId);
  if(!esn || !esn.coords?.length){
    return { fetchedAt: Date.now(), fallbackMode: true, houses:[], commercial:[], industrial:[], retail:[] };
  }

  // Cooldown gate (skipped on force=true).
  if(!force){
    const cd = _osmRebuildCooldowns.get(esnId);
    if(cd && cd > Date.now()){
      return esn.osmBuildingCache || _emptyCache(true);
    }
  }
  _osmRebuildCooldowns.set(esnId, Date.now() + (BAM_CONFIG.osmRebuildCooldownSec || 30) * 1000);

  // Send Overpass query. AbortController gives us a true timeout.
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
    // Fallback mode: empty cache, marked so pickRandomBuildingInESN falls through.
    cache = _emptyCache(true);
    if(typeof setStatus === 'function'){
      setStatus(`OSM cache: ${esn.name} — Overpass unavailable, using road-snapped random fallback.`);
    }
  }

  esn.osmBuildingCache = cache;
  return cache;
}

function _emptyCache(fallbackMode){
  return {
    fetchedAt: Date.now(),
    fallbackMode: !!fallbackMode,
    houses: [], commercial: [], industrial: [], retail: []
  };
}

// Public: immediately invalidates the cache for an ESN. Used by the ESN-edit
// save hook so a polygon change purges stale building suggestions.
function purgeBuildingCacheForESN(esnId){
  const esn = esns.find(e => e.id === esnId);
  if(!esn) return;
  esn.osmBuildingCache = null;
  _osmRebuildCooldowns.delete(esnId);
}

// Public: bulk rebuild every ESN's cache. Sequential with 1-second spacing to
// stay polite on the public Overpass API. progressCb({done, total, esnName})
// is invoked after each rebuild.
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

// =============================================================================
// BUILDING / LOCATION PICKING
// =============================================================================

// Public: picks one random building of `type` from an ESN's cache. Lazily
// refetches if cache is empty or stale. If Overpass-fetched buildings exist,
// picks at random. Otherwise falls back to road-snapped random point inside
// polygon. Returns Promise<{lat, lng, wayId|null, fallback:bool}>.
async function pickRandomBuildingInESN(esnId, type){
  const esn = esns.find(e => e.id === esnId);
  if(!esn) return null;
  // Lazy refetch on stale or empty (skip if currently in fallback mode and
  // last fetch was recent — no point hitting Overpass repeatedly while it's
  // unreachable).
  if(_osmCacheIsStale(esn) || (_osmCacheIsEmpty(esn) && !esn.osmBuildingCache?.fallbackMode)){
    await fetchBuildingsForESN(esn.id);
  }
  const cache = esn.osmBuildingCache;
  const bucket = (cache && cache[type]) || [];
  if(bucket.length){
    const pick = bucket[Math.floor(Math.random() * bucket.length)];
    return { lat: pick.lat, lng: pick.lng, wayId: pick.wayId, fallback: false };
  }
  // Fallback path — random point in polygon, snapped to nearest road.
  const [lat, lng] = _randomPointInPolygon(esn.coords);
  const snapped = await _snapToNearestRoad(lat, lng);
  return { lat: snapped.lat, lng: snapped.lng, wayId: null, fallback: true };
}

// Internal: snap a lat/lng to the nearest road segment using OSRM's /nearest.
// Returns the original point on any failure — we'd rather drop a volunteer on
// a random point than break the response flow.
async function _snapToNearestRoad(lat, lng){
  const endpoint = BAM_CONFIG.osrmNearestEndpoint || 'https://router.project-osrm.org/nearest/v1/driving';
  const url = `${endpoint}/${lng},${lat}?number=1`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if(!res.ok) throw new Error('osrm ' + res.status);
    const json = await res.json();
    const wp = json.waypoints?.[0];
    if(wp && wp.location && wp.location.length === 2){
      return { lat: wp.location[1], lng: wp.location[0] };
    }
  } catch (err) {
    // swallow and fall through
  }
  return { lat, lng };
}

// =============================================================================
// VOLUNTEER PERSONNEL HELPERS
// =============================================================================

// Picks the ESN this volunteer's home/work should land in. Uses the volunteer's
// station's coverage assignments — every ESN where this station is assigned to
// the station's service (fire/ems/police). Returns one ESN at random, or null
// when the station isn't covered by any ESN yet.
function _pickCoverageESN(person){
  const station = stations.find(s => s.id === person.stationId);
  if(!station) return null;
  const service = station.type; // 'fire' | 'ems' | 'police'
  // Phase 5D bug-fix — exclude ESNs flagged as not-residential (typically
  // interstate corridors or rural pass-through zones). If everything in the
  // station's coverage is excluded, fall back to any non-excluded ESN that
  // geographically contains the station before giving up.
  const notExcluded = e => !e.excludeFromGeneration;
  const candidates = esns.filter(e => {
    if(!notExcluded(e)) return false;
    const ids = e.assignments?.[service] || [];
    return ids.includes(station.id);
  });
  if(!candidates.length){
    const geo = esns.filter(e =>
      notExcluded(e) && e.coords && _pointInPolygon([station.lat, station.lng], e.coords)
    );
    if(geo.length) return geo[Math.floor(Math.random() * geo.length)];
    return null;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Public: generate (or regenerate) a home location for a volunteer. Picks
// a coverage ESN, then a random `houses` building from that ESN's cache.
// Sets person.home = {lat, lng, esnId, wayId, isFallback}.
// Marks person.playerEdited=false (still auto-generated) unless caller sets it.
async function generateVolunteerHome(person){
  if(!person || person.type !== 'volunteer') return null;
  const esn = _pickCoverageESN(person);
  if(!esn){
    // No coverage ESN — leave home null. Caller can fall back to station coords.
    person.home = null;
    return null;
  }
  const pick = await pickRandomBuildingInESN(esn.id, 'houses');
  if(!pick){ person.home = null; return null; }
  person.home = {
    lat: pick.lat, lng: pick.lng, esnId: esn.id,
    wayId: pick.wayId || null, isFallback: !!pick.fallback
  };
  return person.home;
}

// Phase 5 bugfix — generateVolunteerWork removed. Work locations are no longer
// tracked; volunteers are either at home or rarely roaming within coverage
// ESNs. The function is preserved as a deprecated no-op for any lingering
// caller that hasn't been updated; it returns null and clears any stray
// `p.work` so saves migrate forward.
async function generateVolunteerWork(person){
  if(person && 'work' in person) delete person.work;
  return null;
}

// =============================================================================
// AVAILABILITY
// =============================================================================

// Phase 5 bugfix — availability is now persistent hourly STATE, not a per-call
// random gate. Returns true iff the volunteer's stored `currentState` is one
// of the available states. The hourly re-roll lives in
// `recomputeVolunteerAvailabilityHour()` below; this function is pure (no
// randomness, no side effects) so every UI surface reads the same value
// between hour ticks.
//
//   • super-responder flag — always available (forced 'home')
//   • forceAvailableUntil  — player override; available while gameSeconds < it
//   • busy / responding    — never re-evaluated here; their state is locked
//                            until the call releases them
//   • currentState         — set by the hourly roll
//
// Career personnel always return true (they use isOnDutyNow for shift gating
// in personnel.js).
function isVolunteerAvailableNow(person){
  if(!person) return false;
  if(person.type !== 'volunteer') return true;
  if(person.isSuperResponder) return true;

  // Busy / responding volunteers are committed to an existing assignment.
  // getCrewForUnit already filters on status === 'available' upstream, but
  // we double-check here so external callers can't accidentally re-dispatch
  // a busy volunteer.
  if(person.status && person.status !== 'available') return false;

  let a = person.availability;
  if(!a){
    // Legacy / missing availability — seed defaults and treat as available
    // until the next hourly tick re-rolls them.
    a = person.availability = {
      currentState:        'home',
      currentLocation:     null,
      nextRollGameHour:    0,
      schedule:            [],
      forceAvailableUntil: null
    };
  }

  // Player override — "forced available" wins until the timestamp passes.
  if(a.forceAvailableUntil != null){
    const sec = (typeof gameSeconds !== 'undefined') ? gameSeconds : 0;
    const dayBase = ((typeof gameDay !== 'undefined') ? gameDay : 1) * 86400;
    const now = dayBase + sec;
    if(now < a.forceAvailableUntil) return true;
  }

  return a.currentState === 'home' || a.currentState === 'roaming';
}

// =============================================================================
// HOURLY AVAILABILITY RE-ROLL  (Phase 5 bugfix)
// =============================================================================
// Called from the game-clock hour-tick in index.html. For each idle volunteer
// (status === 'available'), re-rolls their currentState according to
// configurable probabilities. Volunteers who are busy/responding/awaiting are
// skipped — they remain locked to their assignment. Schedule windows force
// 'unavailable' when the current hour is outside any configured window.
//
// Roll outcomes:
//   • forced 'home' if super-responder or forceAvailableUntil is active
//   • 'unavailable' if schedule windows exist and current hour is outside them
//   • else: weighted roll across available/home, available/roaming, unavailable
//
// Sets:
//   availability.currentState     — new state
//   availability.currentLocation  — set to a random point in a coverage ESN
//                                   when state === 'roaming', else null
//   availability.nextRollGameHour — current hour + 1
function recomputeVolunteerAvailabilityHour(){
  if(typeof personnel === 'undefined' || !personnel.length) return;
  const day  = (typeof gameDay !== 'undefined') ? gameDay : 1;
  const sec  = (typeof gameSeconds !== 'undefined') ? gameSeconds : 0;
  const currentGameHour = Math.floor((day - 1) * 24 + sec / 3600);
  const dayOfWeek = ((day - 1) % 7 + 7) % 7;
  const dayMask = 1 << dayOfWeek;
  const hourOfDay = Math.floor(sec / 3600);

  const homeChance    = BAM_CONFIG.volunteerAvailableHomeChance    ?? 0.7;
  const roamingChance = BAM_CONFIG.volunteerAvailableRoamingChance ?? 0.05;

  personnel.forEach(p => {
    if(p.type !== 'volunteer') return;
    if(p.status && p.status !== 'available') return;  // busy/responding stay locked
    let a = p.availability;
    if(!a){
      a = p.availability = {
        currentState:        'home',
        currentLocation:     null,
        nextRollGameHour:    0,
        schedule:            [],
        forceAvailableUntil: null
      };
    }
    if((a.nextRollGameHour || 0) > currentGameHour) return;

    // Super-responder and player-override paths short-circuit the roll.
    if(p.isSuperResponder){
      a.currentState = 'home';
      a.currentLocation = null;
      a.nextRollGameHour = currentGameHour + 1;
      return;
    }
    const nowAbs = day * 86400 + sec;
    if(a.forceAvailableUntil != null && nowAbs < a.forceAvailableUntil){
      a.currentState = 'home';
      a.currentLocation = null;
      a.nextRollGameHour = currentGameHour + 1;
      return;
    }

    // Schedule windows — when present, the volunteer is forced unavailable
    // outside any configured window.
    if(Array.isArray(a.schedule) && a.schedule.length){
      const inWindow = a.schedule.some(([start, end, daysMask]) => {
        if(daysMask != null && (daysMask & dayMask) === 0) return false;
        return hourOfDay >= start && hourOfDay < end;
      });
      if(!inWindow){
        a.currentState = 'unavailable';
        a.currentLocation = null;
        a.nextRollGameHour = currentGameHour + 1;
        return;
      }
    }

    // Weighted roll.
    const r = Math.random();
    if(r < homeChance){
      a.currentState = 'home';
      a.currentLocation = null;
    } else if(r < homeChance + roamingChance){
      a.currentState = 'roaming';
      a.currentLocation = _pickRoamingLocationFor(p);
      // If we can't find a roaming location (no coverage ESN), fall back to
      // 'home' so we never have a roaming-state volunteer with no location.
      if(!a.currentLocation) a.currentState = 'home';
    } else {
      a.currentState = 'unavailable';
      a.currentLocation = null;
    }
    a.nextRollGameHour = currentGameHour + 1;
  });
}

// Internal: picks a random point inside one of the volunteer's station's
// coverage ESNs. Returns {lat,lng} or null if no eligible ESN exists.
// Synchronous — uses the polygon randomizer directly without OSRM snap (cheap,
// and we don't need road-snap accuracy for a transient roaming origin).
function _pickRoamingLocationFor(person){
  if(typeof esns === 'undefined' || typeof stations === 'undefined') return null;
  const station = stations.find(s => s.id === person.stationId);
  if(!station) return null;
  const service = station.type;
  const candidates = esns.filter(e => {
    if(e.excludeFromGeneration) return false;
    const ids = e.assignments?.[service] || [];
    return ids.includes(station.id) && Array.isArray(e.coords) && e.coords.length;
  });
  if(!candidates.length) return null;
  const esn = candidates[Math.floor(Math.random() * candidates.length)];
  if(typeof _randomPointInPolygon !== 'function') return null;
  const [lat, lng] = _randomPointInPolygon(esn.coords);
  return { lat, lng };
}

// =============================================================================
// DIRECT-TO-SCENE ELIGIBILITY
// =============================================================================

// Public: determines whether this volunteer should respond direct-to-scene or
// report to station first for a specific incident.
// Returns { eligible:bool, willGoToScene:bool, reason:string }.
//
// Rules (from docs/Phase5.md):
//   • Eligible roles: chiefs (Fire Officer 1+), fire police, LEOs, EMS-certified.
//     Cert list lives in BAM_CONFIG.directToSceneAllowedRoles.
//   • If the person has PPE in their vehicle (hasPpeInVehicle) AND holds a
//     fire suppression cert (ff1+), they go direct to scene for fires.
//   • Otherwise default to station.
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
  // Fire incident interior-task gate: needs PPE-in-vehicle and an FF cert.
  const isFire = (incident?.type === 'fire' || incident?.missionKey?.startsWith?.('fire_'));
  if(isFire){
    const hasFireCert = certs.has('ff1') || certs.has('ff2');
    if(hasFireCert && person.hasPpeInVehicle){
      return { eligible:true, willGoToScene:true, reason:'ppe_in_vehicle_fire' };
    }
    // Fire cert but no PPE → still goes direct for exterior/support tasks but
    // can't perform interior work. Caller (call-resolution) honors this hint.
    if(hasFireCert){
      return { eligible:true, willGoToScene:true, reason:'fire_exterior_only' };
    }
  }
  // EMS / chief / fire police / LEO → direct to scene.
  return { eligible:true, willGoToScene:true, reason:'role_eligible' };
}

// =============================================================================
// AUTO-MIGRATION ON ESN POLYGON EDIT
// =============================================================================

// Public: walks volunteers attached to stations covered by `esnId`. For any
// volunteer whose home now falls outside their station's coverage polygon set,
// regenerates their home and flags autoMigratedFlag=true. Skips
// isCustomized + isSuperResponder per Phase5.md.
// Returns Promise<{migrated:[ids], skipped:[ids]}>.
async function autoMigrateVolunteersForESN(esnId){
  const migrated = [];
  const skipped  = [];
  // Find stations whose coverage involves this ESN.
  const esn = esns.find(e => e.id === esnId);
  if(!esn) return { migrated, skipped };
  const affectedStationIds = new Set();
  ['fire','ems','police'].forEach(svc => {
    (esn.assignments?.[svc] || []).forEach(id => affectedStationIds.add(id));
  });
  // Now check each volunteer at those stations.
  for(const p of personnel){
    if(p.type !== 'volunteer') continue;
    if(!affectedStationIds.has(p.stationId)) continue;
    if(p.isCustomized){ skipped.push(p.id); continue; }
    if(p.isSuperResponder){ skipped.push(p.id); continue; }
    if(!p.home){ skipped.push(p.id); continue; }
    // Is the home still inside ANY of this station's coverage ESNs?
    const station = stations.find(s => s.id === p.stationId);
    if(!station){ skipped.push(p.id); continue; }
    // Phase 5D bug-fix — exclude flagged-out ESNs from the "still covered"
    // check, so flipping the exclude flag on a polygon migrates the volunteers
    // who currently live inside it to an eligible polygon.
    const coverageEsns = esns.filter(e => {
      if(e.excludeFromGeneration) return false;
      const ids = e.assignments?.[station.type] || [];
      return ids.includes(station.id);
    });
    const stillCovered = coverageEsns.some(e => e.coords && _pointInPolygon([p.home.lat, p.home.lng], e.coords));
    if(stillCovered){ skipped.push(p.id); continue; }
    // Regenerate.
    await generateVolunteerHome(p);
    p.autoMigratedFlag = true;
    migrated.push(p.id);
  }
  if(migrated.length){
    if(typeof setStatus === 'function'){
      setStatus(`Auto-migrated ${migrated.length} volunteer home${migrated.length===1?'':'s'} after ESN edit.`);
    }
  }
  return { migrated, skipped };
}

// =============================================================================
// MAP LAYER TOGGLES
// =============================================================================

// Returns the current marker for a volunteer's home, or null. Used by the
// layer-rendering pass to avoid stacking duplicates.
function _getVolunteerHomeMarker(personId){
  return _volunteerHomeMarkers.get(personId) || null;
}

// Re-renders the home overlay based on current visibility flag and the current
// volunteer roster. Idempotent — call after any change that affects volunteer
// locations (hire, regen, ESN migration, layer toggle).
//
// Phase 5 bugfix — work-marker pass removed.
function refreshVolunteerLocationMarkers(){
  if(typeof map === 'undefined' || !map) return;
  if(volunteerLayerVisibility.homes){
    personnel.forEach(p => {
      if(p.type !== 'volunteer' || !p.home) return;
      let m = _volunteerHomeMarkers.get(p.id);
      const latLng = [p.home.lat, p.home.lng];
      if(!m){
        m = L.circleMarker(latLng, {
          radius: 4, color: '#22c55e', fillColor: '#22c55e',
          fillOpacity: 0.65, weight: 1
        }).bindTooltip(`🏠 ${p.name}`, { direction: 'top' });
        m.addTo(map);
        _volunteerHomeMarkers.set(p.id, m);
      } else {
        m.setLatLng(latLng);
      }
    });
    // Remove markers for people who lost their home or were deleted.
    for(const [pid, m] of _volunteerHomeMarkers.entries()){
      const p = personnel.find(x => x.id === pid);
      if(!p || !p.home || p.type !== 'volunteer'){ m.remove(); _volunteerHomeMarkers.delete(pid); }
    }
  } else {
    for(const m of _volunteerHomeMarkers.values()) m.remove();
    _volunteerHomeMarkers.clear();
  }
}

// Public: toggle a layer visibility. Persists to settings and refreshes markers.
// Phase 5 bugfix — `works` is no longer a valid layer; calls with that value
// silently no-op (kept so old settings/UI don't throw).
function setVolunteerLayerVisible(layer, visible){
  if(layer === 'works') return;  // legacy — work locations removed
  if(!['responders','homes'].includes(layer)) return;
  volunteerLayerVisibility[layer] = !!visible;
  refreshVolunteerLocationMarkers();
  // Persist via the Phase 4A settings autosync if present.
  if(typeof window !== 'undefined' && window.api?.settings?.putDebounced){
    const current = (typeof currentSettings === 'object' && currentSettings) ? currentSettings : {};
    current.volunteerLayerVisibility = { ...volunteerLayerVisibility };
    window.api.settings.putDebounced(current);
  }
}

// =============================================================================
// MAP-CLICK SET-LOCATION MODE
// =============================================================================
// Players can click anywhere on the map to set a volunteer's home/work after
// pressing the "Set via map click" button in the Personnel details modal.
// The next map click consumes the active intent and stores the lat/lng.

let _mapClickVolunteerTarget = null;  // { personId, kind, returnToDetails }

// Public: begin pick-on-map mode. Subsequent map click will set the location.
// Call this from the personnel details modal handlers.
// Phase 5D bug-fix: also closes every modal that would obscure the map (the
// Personnel Details modal, plus the Ops modal underneath it), surfaces a
// floating confirmation toolbar like the ESN draw flow, and remembers that
// we need to reopen the Personnel Details modal once the pick lands.
function beginVolunteerLocationPick(personId, kind){
  // Phase 5 bugfix — only 'home' is supported now. Legacy 'work' callers no-op.
  if(kind !== 'home') return;
  _mapClickVolunteerTarget = { personId, kind, returnToDetails: true };

  // Stash any open modal state we need to restore later. Then close everything
  // so the map is visible. We track the Ops tab separately so reopening
  // returns the player to where they were.
  const opsModalEl = document.getElementById('ops-modal');
  _mapClickVolunteerTarget._opsWasOpen = opsModalEl?.classList.contains('open') ? true : false;
  _mapClickVolunteerTarget._opsTab     = (typeof _activeOpsTab !== 'undefined') ? _activeOpsTab : null;
  if(typeof closePersonnelDetails === 'function') closePersonnelDetails();
  if(opsModalEl) opsModalEl.classList.remove('open');

  if(typeof setStatus === 'function'){
    setStatus(`Click the map to set ${kind} for this volunteer (Esc to cancel).`);
  }
  _showVolPickToolbar(kind);
  if(typeof map !== 'undefined' && map){
    const c = map.getContainer();
    if(c) c.style.cursor = 'crosshair';
    map.once('click', _onMapClickForVolunteerPick);
  }
}

// Build / show the floating "Click map to set [kind]" confirmation bar. It
// mirrors the styling and behavior of #esn-draw-toolbar so the two map-pick
// flows feel consistent.
function _showVolPickToolbar(kind){
  let bar = document.getElementById('vol-pick-toolbar');
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'vol-pick-toolbar';
    // Mirror the ESN draw toolbar's look: top-center floating chrome with a
    // gold top border and monospace font.
    bar.style.cssText = `
      position:fixed;top:52px;left:50%;transform:translateX(-50%);
      z-index:2000;background:var(--panel2);
      border:1px solid var(--gold);border-top:2px solid var(--gold);
      border-radius:0 0 4px 4px;padding:7px 14px;
      display:flex;align-items:center;gap:12px;
      box-shadow:0 4px 20px rgba(0,0,0,.6);
      font-family:var(--mono);font-size:.8rem;
    `;
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <span style="color:var(--gold);">📍 Click map to set ${kind}</span>
    <button class="btn-sm danger" onclick="cancelVolunteerLocationPick()">✕ Cancel (Esc)</button>
  `;
  bar.style.display = 'flex';
}

function _hideVolPickToolbar(){
  const bar = document.getElementById('vol-pick-toolbar');
  if(bar) bar.style.display = 'none';
}

// Public: cancel an in-progress pick. Wired to Esc + the toolbar's Cancel.
function cancelVolunteerLocationPick(){
  const target = _mapClickVolunteerTarget;
  _mapClickVolunteerTarget = null;
  _hideVolPickToolbar();
  if(typeof map !== 'undefined' && map){
    const c = map.getContainer();
    if(c) c.style.cursor = '';
    map.off('click', _onMapClickForVolunteerPick);
  }
  if(target){
    _restoreModalsAfterVolPick(target);
    if(typeof setStatus === 'function') setStatus('Volunteer location pick cancelled.');
  }
}

// Reopens whatever modals were dismissed when the pick began.
function _restoreModalsAfterVolPick(target){
  if(!target) return;
  if(target._opsWasOpen && typeof openOpsModal === 'function'){
    openOpsModal(target._opsTab || 'personnel');
  }
  if(target.returnToDetails && target.personId && typeof openPersonnelDetails === 'function'){
    openPersonnelDetails(target.personId);
  }
}

function _onMapClickForVolunteerPick(e){
  const target = _mapClickVolunteerTarget;
  _mapClickVolunteerTarget = null;
  _hideVolPickToolbar();
  if(typeof map !== 'undefined' && map){
    const c = map.getContainer();
    if(c) c.style.cursor = '';
  }
  if(!target) return;
  const p = personnel.find(x => x.id === target.personId);
  if(!p){
    _restoreModalsAfterVolPick(target);
    return;
  }
  const loc = { lat: e.latlng.lat, lng: e.latlng.lng, esnId: null, wayId: null, isFallback: false };
  // Phase 5 bugfix — work locations removed; only home is settable now.
  // The map-pick UI only exposes 'home' going forward; legacy 'work' calls fall
  // through to no-op rather than corrupting state with a phantom field.
  if(target.kind === 'home') p.home = loc;
  p.isCustomized = true;
  p.playerEdited = true;
  if(typeof setStatus === 'function') setStatus(`✅ Volunteer ${target.kind} set for ${p.name}.`);
  refreshVolunteerLocationMarkers();
  if(typeof renderPersonnelTab === 'function') renderPersonnelTab();
  _restoreModalsAfterVolPick(target);
}

// =============================================================================
// VOLUNTEER STATION-RESPONSE ASSEMBLY  (Phase 5D bug-fix)
// =============================================================================
// When an apparatus is dispatched with volunteer crew, those volunteers must
// travel from their home/work to the station before the apparatus can leave.
// `triggerVolunteerStationResponse` animates each volunteer to the station
// and returns a Promise that resolves once every volunteer has arrived OR the
// per-volunteer maxResponseSec has elapsed (so a no-show doesn't deadlock the
// call indefinitely).
//
// On resolution, every volunteer that successfully arrived has status promoted
// from 'responding' → 'busy'. Volunteers who failed to arrive within the
// window get unassigned (status='available', currentAssignment cleared) so
// the caller can decide what to do (most likely: dispatch what showed up).
function triggerVolunteerStationResponse(stationLatLng, responders, opts = {}){
  if(!Array.isArray(responders) || !responders.length) return Promise.resolve({ arrived: [], noShows: [] });
  if(!stationLatLng) return Promise.resolve({ arrived: [], noShows: [] });
  const speedMph     = opts.speedMph     || BAM_CONFIG.volunteerResponseSpeedMph || 50;
  const maxRealMs    = opts.maxRealMs    || 60000; // safety so a misconfigured volunteer can't hang dispatch
  const abortSignal  = opts.abortSignal  || { aborted: false };  // Phase 5 bugfix — force-out support
  const arrived = [];
  const noShows = [];
  const handles = [];  // per-volunteer cancellable handles so force-out can stop pending travel

  return new Promise(resolve => {
    let settled = false;
    const finish = (forced = false) => {
      if(settled) return;
      settled = true;
      // Cancel any in-flight per-volunteer animations so their marker timers stop.
      handles.forEach(h => { try { h.cancel?.(); } catch(_){} });
      // Anyone still not in `arrived` becomes a no-show. On a force-out, they
      // get released ('available') so the dispatch flow doesn't strand them on
      // a busy/responding status forever. Cancelled animations leave the
      // volunteer's currentLocation wherever the polyline last placed them.
      responders.forEach(p => {
        if(!arrived.includes(p.id)){
          p.status = 'available';
          p.currentAssignment = null;
          noShows.push(p.id);
        }
      });
      resolve({ arrived, noShows, forced });
    };
    const watchdog = setTimeout(() => finish(false), maxRealMs);
    // Phase 5 bugfix — abort poller. Cheap setInterval (every 250ms real) that
    // resolves the promise when the external signal flips. We don't poll
    // gameSpeed-scaled time here because force-out should respond to the
    // player's click in real-time even when the game is running fast or paused.
    const poller = setInterval(() => {
      if(abortSignal.aborted){
        clearInterval(poller);
        clearTimeout(watchdog);
        finish(true);
      }
    }, 250);

    let arrivalsLeft = responders.length;
    responders.forEach(p => {
      // Origin order: explicit currentLocation > home > station.
      const from = p.currentLocation
        || (p.home ? { lat: p.home.lat, lng: p.home.lng } : null)
        || stationLatLng;
      const h = dispatchVolunteer(p, stationLatLng, {
        speedMph,
        fromLatLng: from,
        onArrive: () => {
          if(settled) return;
          arrived.push(p.id);
          p.status = 'busy';
          p.currentLocation = { lat: stationLatLng.lat, lng: stationLatLng.lng };
          arrivalsLeft--;
          if(arrivalsLeft <= 0){
            clearInterval(poller);
            clearTimeout(watchdog);
            finish(false);
          }
        }
      });
      handles.push(h);
    });
  });
}

// =============================================================================
// FORCE-OUT — depart an awaiting_crew apparatus before all volunteers arrive
// =============================================================================
// Player spec: force-out is only allowed when at least one person currently at
// the station holds the apparatus's driver cert. The driver may be career
// (already on-duty) or volunteer (already arrived as part of the response).
// Returns { ok:bool, reason?:string } so the UI can surface the failure.
function forceVolunteerCrewDeparture(unitId){
  // Find the unit + station.
  let unit = null, station = null;
  for(const s of (typeof stations !== 'undefined' ? stations : [])){
    const u = s.units?.find(x => x.id === unitId);
    if(u){ unit = u; station = s; break; }
  }
  if(!unit || !station) return { ok:false, reason:'unit_not_found' };
  if(unit.status !== 'awaiting_crew') return { ok:false, reason:'not_awaiting_crew' };

  // Resolve driver cert for this apparatus.
  const driverCert = BAM_CONFIG.crewDefaults?.[unit.typeKey]?.driverCert;
  if(driverCert){
    // Find someone at the station with the required cert. "At station" means
    // career personnel on-duty here, OR a volunteer who has already arrived
    // (status 'busy' AND assigned to this unit OR currentLocation at station).
    const STATION_RADIUS_KM = 0.05;  // tight — they must physically be at the apparatus
    const atStation = (typeof personnel !== 'undefined' ? personnel : []).filter(p => {
      if(p.stationId !== station.id) return false;
      if(typeof personHasCert !== 'function' || !personHasCert(p, driverCert)) return false;
      if(p.type !== 'volunteer'){
        // Career: on-duty here counts as at-station (no positional check; they're working).
        return (typeof isOnDutyNow === 'function') ? isOnDutyNow(p) : true;
      }
      // Volunteer must be busy AND have arrived (status === 'busy' is set on
      // dispatch; arrival sets currentLocation to the station).
      if(p.status !== 'busy') return false;
      const loc = p.currentLocation;
      if(!loc) return false;
      const dx = (typeof haversineKm === 'function')
        ? haversineKm(loc.lat, loc.lng, station.lat, station.lng)
        : _haversineKmLocal(loc.lat, loc.lng, station.lat, station.lng);
      return dx <= STATION_RADIUS_KM;
    });
    if(!atStation.length){
      const certLabel = BAM_CONFIG.certifications?.[driverCert]?.label || driverCert;
      return { ok:false, reason:`no_driver_at_station:${certLabel}` };
    }
  }

  // Trip the abort signal. The promise inside executeDispatch resolves and
  // its .then() handler advances the unit to 'dispatched' + routes to scene.
  if(unit._awaitingAbortSignal){
    unit._awaitingAbortSignal.aborted = true;
    return { ok:true };
  }
  return { ok:false, reason:'no_abort_signal' };
}

// =============================================================================
// VOLUNTEER DISPATCH ANIMATION  (Phase 5 bugfix — road-routed via OSRM)
// =============================================================================
// Animates a single volunteer along an OSRM driving route from their current
// origin to `toLatLng`. Honors gameSpeed (pausing freezes movement). The route
// is fetched asynchronously; while waiting we keep the marker stationary at
// the origin. On any OSRM failure we fall back to a straight-line animation
// so dispatch never deadlocks because the routing API is unreachable.
//
// Speed model: OSRM's predicted duration is the upper bound on travel time,
// but we enforce a `volunteerResponseSpeedMph` floor (default 50). If the
// implied speed is below the floor, we shrink the duration to match the
// floor — so highway sections stay fast but slow back-road predictions don't
// leave the volunteer crawling forever.
//
// Returns a cancellable handle: { cancel() }.
function dispatchVolunteer(person, toLatLng, opts = {}){
  if(!person || !toLatLng) return { cancel: () => {} };
  if(typeof map === 'undefined' || !map) return { cancel: () => {} };
  // Honor the layer-visibility toggle. If responders are hidden the math still
  // runs (so callbacks fire) but the marker is suppressed.
  const showMarker = !!volunteerLayerVisibility.responders;
  const from = opts.fromLatLng
    || (person.currentLocation)
    || (person.home && { lat: person.home.lat, lng: person.home.lng })
    || (() => {
      const s = stations.find(x => x.id === person.stationId);
      return s ? { lat: s.lat, lng: s.lng } : null;
    })();
  if(!from) return { cancel: () => {} };

  const speedFloorMph = opts.speedMph || BAM_CONFIG.volunteerResponseSpeedMph || 50;
  const eventId = _genVolunteerEventId();
  let cancelled = false;
  let cleanedUp = false;
  let marker = null;
  if(showMarker){
    marker = L.circleMarker([from.lat, from.lng], {
      radius: 5, color: '#22c55e', fillColor: '#a7f3d0', fillOpacity: 0.9, weight: 2
    }).bindTooltip(`🧍 ${person.name}`, { direction: 'top' }).addTo(map);
    _volunteerLiveMarkers.set(eventId, marker);
  }

  // Helper to run the actual animation given a coords array + total game-secs.
  // Walks the polyline using cumulative segment progress.
  function _runAnim(coords, durationGameSec){
    if(cancelled) return cleanup();
    if(!coords || coords.length < 2 || !(durationGameSec > 0)){
      return cleanup(true);
    }
    let elapsedGameSec = 0;
    let lastReal = performance.now();
    const tick = (now) => {
      if(cancelled) return cleanup();
      const realDelta = (now - lastReal) / 1000;
      lastReal = now;
      const speed = (typeof gameSpeed !== 'undefined') ? gameSpeed : 1;
      elapsedGameSec += realDelta * speed;
      const t = Math.min(1, elapsedGameSec / Math.max(0.0001, durationGameSec));
      // Polyline interpolation by uniform segment progress.
      const segCount = coords.length - 1;
      const scaled = t * segCount;
      const segIdx = Math.min(segCount - 1, Math.floor(scaled));
      const segT   = scaled - segIdx;
      const a = coords[segIdx];
      const b = coords[segIdx + 1];
      const lat = a[0] + (b[0] - a[0]) * segT;
      const lng = a[1] + (b[1] - a[1]) * segT;
      if(marker) marker.setLatLng([lat, lng]);
      person.currentLocation = { lat, lng };
      if(t >= 1) return cleanup(true);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Kick off OSRM route fetch. While waiting the marker just sits at origin.
  (async () => {
    if(cancelled) return cleanup();   // Phase 5 bugfix v2 — was bare `return`,
    // which leaked the marker when cancel fired before the fetch started.
    const distKm = (typeof haversineKm === 'function')
      ? haversineKm(from.lat, from.lng, toLatLng.lat, toLatLng.lng)
      : _haversineKmLocal(from.lat, from.lng, toLatLng.lat, toLatLng.lng);
    const floorDurationSec = (distKm / (speedFloorMph * 1.60934)) * 3600;

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${toLatLng.lng},${toLatLng.lat}?overview=full&geometries=geojson`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if(cancelled) return cleanup();   // Phase 5 bugfix v2 — cancel during fetch
      if(!resp.ok) throw new Error('osrm ' + resp.status);
      const data = await resp.json();
      if(data.code !== 'Ok' || !data.routes?.length) throw new Error('no_route');
      const coords = data.routes[0].geometry.coordinates.map(([lng,lat]) => [lat, lng]);
      const osrmDur = data.routes[0].duration;  // seconds at OSRM's predicted average
      // Enforce the speed floor: never travel slower than `speedFloorMph`.
      const durationGameSec = Math.min(osrmDur, floorDurationSec);
      _runAnim(coords, durationGameSec);
    } catch(err){
      if(cancelled) return cleanup();
      // OSRM unreachable / timed out — straight-line fallback at the floor speed.
      const coords = [[from.lat, from.lng], [toLatLng.lat, toLatLng.lng]];
      _runAnim(coords, floorDurationSec);
    }
  })();

  // Idempotent cleanup — guarded so a double-call (cancel after arrival, etc.)
  // doesn't double-fire onCancel or remove an already-removed marker. This
  // also fixes the duplicate-marker bug where the cancel handle and the
  // animation tick both raced to clean up.
  function cleanup(arrived){
    if(cleanedUp) return;
    cleanedUp = true;
    if(marker){ marker.remove(); marker = null; }
    _volunteerLiveMarkers.delete(eventId);
    if(arrived){
      person.currentLocation = { lat: toLatLng.lat, lng: toLatLng.lng };
      if(typeof opts.onArrive === 'function') opts.onArrive(person);
    } else if(typeof opts.onCancel === 'function'){
      opts.onCancel(person);
    }
  }
  return { cancel: () => {
    cancelled = true;
    // Phase 5 bugfix v2 — eagerly clean up so the marker disappears even if
    // we're stuck awaiting OSRM. cleanup() is idempotent so this is safe.
    cleanup();
  } };
}

// Local haversine in case index.html's helper isn't loaded yet (defensive).
function _haversineKmLocal(lat1, lng1, lat2, lng2){
  const toRad = d => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
