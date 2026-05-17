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
// Three independent toggles per docs/Phase5.md. Persisted in settings (Phase 4A
// settings autosync). Defaults reasonable so a brand-new player isn't drowned
// in dots.
let volunteerLayerVisibility = {
  responders: true,   // dots while responding on the map
  homes:      false,  // persistent home markers
  works:      false   // persistent work markers
};

// Internal: marker pools for the home/work overlays so toggling on/off is fast.
let _volunteerHomeMarkers = new Map();   // personId → Leaflet marker
let _volunteerWorkMarkers = new Map();
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
  const candidates = esns.filter(e => {
    const ids = e.assignments?.[service] || [];
    return ids.includes(station.id);
  });
  if(!candidates.length){
    // Fallback: any ESN that geographically contains the station, regardless
    // of explicit assignment.
    const geo = esns.filter(e => e.coords && _pointInPolygon([station.lat, station.lng], e.coords));
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

// Public: generate (or regenerate) a work location for a volunteer. Tries
// commercial → industrial → retail buckets in order, then falls back to a
// road-snapped random polygon point.
async function generateVolunteerWork(person){
  if(!person || person.type !== 'volunteer') return null;
  const esn = _pickCoverageESN(person);
  if(!esn){ person.work = null; return null; }
  let pick = null;
  for(const type of ['commercial','industrial','retail']){
    pick = await pickRandomBuildingInESN(esn.id, type);
    if(pick && !pick.fallback) break;  // first cached hit wins
  }
  if(!pick){ person.work = null; return null; }
  person.work = {
    lat: pick.lat, lng: pick.lng, esnId: esn.id,
    wayId: pick.wayId || null, isFallback: !!pick.fallback
  };
  return person.work;
}

// =============================================================================
// AVAILABILITY
// =============================================================================

// Public: true if a volunteer should be considered "available right now" for
// dispatch. Combines:
//   • super-responder flag — always available, ignores reliability/schedule
//   • availability.defaultAvailable — explicit player toggle
//   • availability.schedule windows (Phase 5C-shaped: [start,end,daysMask])
//   • availability.reliability — random gate per dispatch attempt
//
// Career personnel always return true (they use isOnDutyNow for shift gating
// in personnel.js).
function isVolunteerAvailableNow(person){
  if(!person) return false;
  if(person.type !== 'volunteer') return true;
  if(person.isSuperResponder) return true;
  const a = person.availability;
  if(!a) return true; // legacy / not configured = available
  // Schedule check (optional). When schedule entries exist, the volunteer is
  // only considered available within those windows.
  if(Array.isArray(a.schedule) && a.schedule.length){
    const day  = (typeof gameDay !== 'undefined') ? gameDay : 1;
    const sec  = (typeof gameSeconds !== 'undefined') ? gameSeconds : 0;
    const hour = sec / 3600;
    const dayOfWeek = ((day - 1) % 7 + 7) % 7;
    const mask = 1 << dayOfWeek;
    const inWindow = a.schedule.some(([start, end, daysMask]) => {
      if(daysMask != null && (daysMask & mask) === 0) return false;
      return hour >= start && hour < end;
    });
    if(!inWindow) return false;
  } else if(a.defaultAvailable === false){
    return false;
  }
  // Reliability roll — single random gate per call. Default reliability used
  // when none configured.
  const reliability = (a.reliability != null) ? a.reliability : (BAM_CONFIG.volunteerDefaultReliability ?? 0.8);
  return Math.random() < reliability;
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
    const coverageEsns = esns.filter(e => {
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
function _getVolunteerWorkMarker(personId){
  return _volunteerWorkMarkers.get(personId) || null;
}

// Re-renders the home + work overlays based on current visibility flags and
// the current volunteer roster. Idempotent — call after any change that
// affects volunteer locations (hire, regen, ESN migration, layer toggle).
function refreshVolunteerLocationMarkers(){
  if(typeof map === 'undefined' || !map) return;
  // Homes
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
  // Works
  if(volunteerLayerVisibility.works){
    personnel.forEach(p => {
      if(p.type !== 'volunteer' || !p.work) return;
      let m = _volunteerWorkMarkers.get(p.id);
      const latLng = [p.work.lat, p.work.lng];
      if(!m){
        m = L.circleMarker(latLng, {
          radius: 4, color: '#fbbf24', fillColor: '#fbbf24',
          fillOpacity: 0.65, weight: 1
        }).bindTooltip(`🏢 ${p.name}`, { direction: 'top' });
        m.addTo(map);
        _volunteerWorkMarkers.set(p.id, m);
      } else {
        m.setLatLng(latLng);
      }
    });
    for(const [pid, m] of _volunteerWorkMarkers.entries()){
      const p = personnel.find(x => x.id === pid);
      if(!p || !p.work || p.type !== 'volunteer'){ m.remove(); _volunteerWorkMarkers.delete(pid); }
    }
  } else {
    for(const m of _volunteerWorkMarkers.values()) m.remove();
    _volunteerWorkMarkers.clear();
  }
}

// Public: toggle a layer visibility. Persists to settings and refreshes markers.
function setVolunteerLayerVisible(layer, visible){
  if(!['responders','homes','works'].includes(layer)) return;
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

let _mapClickVolunteerTarget = null;  // { personId, kind: 'home'|'work' }

// Public: begin pick-on-map mode. Subsequent map click will set the location.
// Call this from the personnel details modal handlers.
function beginVolunteerLocationPick(personId, kind){
  if(!['home','work'].includes(kind)) return;
  _mapClickVolunteerTarget = { personId, kind };
  if(typeof setStatus === 'function'){
    setStatus(`Click the map to set ${kind} for this volunteer (Esc to cancel).`);
  }
  if(typeof map !== 'undefined' && map){
    // Cursor crosshair while pick is active.
    const c = map.getContainer();
    if(c) c.style.cursor = 'crosshair';
    map.once('click', _onMapClickForVolunteerPick);
  }
}

function _onMapClickForVolunteerPick(e){
  const target = _mapClickVolunteerTarget;
  _mapClickVolunteerTarget = null;
  if(typeof map !== 'undefined' && map){
    const c = map.getContainer();
    if(c) c.style.cursor = '';
  }
  if(!target) return;
  const p = personnel.find(x => x.id === target.personId);
  if(!p) return;
  const loc = { lat: e.latlng.lat, lng: e.latlng.lng, esnId: null, wayId: null, isFallback: false };
  if(target.kind === 'home') p.home = loc;
  else                       p.work = loc;
  p.isCustomized = true;
  p.playerEdited = true;
  if(typeof setStatus === 'function') setStatus(`Volunteer ${target.kind} set for ${p.name}.`);
  refreshVolunteerLocationMarkers();
  if(typeof renderPersonnelTab === 'function') renderPersonnelTab();
}

// =============================================================================
// VOLUNTEER DISPATCH ANIMATION  (Phase 5D)
// =============================================================================
// Minimal self-contained animator: spawns a marker at `from`, eases it to `to`
// along a straight line scaled by gameSpeed, then cleans up. The full road-
// routed multi-volunteer station-response simulation is intentionally deferred
// to the post-Phase-5 call resolution overhaul — this animator provides the
// substrate hook the rewrite will call into.
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
    || (person.work && { lat: person.work.lat, lng: person.work.lng })
    || (() => {
      const s = stations.find(x => x.id === person.stationId);
      return s ? { lat: s.lat, lng: s.lng } : null;
    })();
  if(!from) return { cancel: () => {} };

  // Straight-line distance + a default 30 mph for civilian POV speed (~13 m/s).
  const speedMph = opts.speedMph || 35;
  const distKm   = (typeof haversineKm === 'function')
    ? haversineKm(from.lat, from.lng, toLatLng.lat, toLatLng.lng)
    : _haversineKmLocal(from.lat, from.lng, toLatLng.lat, toLatLng.lng);
  const durationGameSec = (distKm / (speedMph * 1.60934)) * 3600;

  const eventId = _genVolunteerEventId();
  let marker = null;
  if(showMarker){
    marker = L.circleMarker([from.lat, from.lng], {
      radius: 5, color: '#22c55e', fillColor: '#a7f3d0', fillOpacity: 0.9, weight: 2
    }).bindTooltip(`🧍 ${person.name}`, { direction: 'top' }).addTo(map);
    _volunteerLiveMarkers.set(eventId, marker);
  }

  let cancelled = false;
  let elapsedGameSec = 0;
  let lastReal = performance.now();
  const tick = (now) => {
    if(cancelled) return cleanup();
    const realDelta = (now - lastReal) / 1000;
    lastReal = now;
    const speed = (typeof gameSpeed !== 'undefined') ? gameSpeed : 1;
    elapsedGameSec += realDelta * speed;
    const t = Math.min(1, elapsedGameSec / Math.max(0.0001, durationGameSec));
    const lat = from.lat + (toLatLng.lat - from.lat) * t;
    const lng = from.lng + (toLatLng.lng - from.lng) * t;
    if(marker) marker.setLatLng([lat, lng]);
    person.currentLocation = { lat, lng };
    if(t >= 1) return cleanup(true);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function cleanup(arrived){
    if(marker){ marker.remove(); _volunteerLiveMarkers.delete(eventId); }
    if(arrived){
      person.currentLocation = { lat: toLatLng.lat, lng: toLatLng.lng };
      if(typeof opts.onArrive === 'function') opts.onArrive(person);
    } else if(typeof opts.onCancel === 'function'){
      opts.onCancel(person);
    }
  }
  return { cancel: () => { cancelled = true; } };
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
