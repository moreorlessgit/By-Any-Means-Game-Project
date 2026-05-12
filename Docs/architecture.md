# Core Architecture Rules

## config.js is the single source of truth

- ALL editable game variables live in `config.js` — mission definitions, unit types, costs, probabilities, rewards, spawn settings, economy values
- Nothing that a player might want to tune is ever hardcoded in game logic
- `config.js` is loaded before `index.html` in the HTML `<head>`
- When adding a new mission type: add ONLY to `config.js` missions block — including the `spawnMode` field
- When adding a new unit type: add ONLY to `config.js` unitTypes block
- `config.js` also has a `ui` section for AVL label color/style defaults

---

## Unit capability tag system

- Units carry an array of capability `tags` (e.g. `['engine', 'tanker']`)
- Missions require tags, not specific unit types
- A pumper/tanker carries both `engine` and `tanker` tags — it satisfies either requirement
- A rescue engine carries `rescue` and `engine` tags
- This system must be preserved and extended, never replaced with direct unit-type matching

---

## Save system

- Multiple save slots via localStorage; key prefix `bam_save_` followed by slot name
- Overwriting an existing slot requires a two-click confirm flow (`overwriteSlot()`) — first click turns button red "Confirm?", second click saves. Auto-resets after 4 seconds.
- Saves backward-compatible: old `gameMinutes` field is converted to `gameSeconds` on load
- Never auto-overwrite a save without this confirmation flow
- **Settings** are stored separately under key `bam_settings` (not part of save slots); `loadSettings()` is called at startup before `initSidebarCosts()`

---

## Game clock

- Time is stored as `gameSeconds` (integer, seconds since midnight)
- Clock starts at 08:00:00 (= 8 * 3600)
- Rolls over at 86400 and increments `gameDay`
- Display format: HH:MM:SS
- Speed values: 0 (paused), 1, 2, 5, 10, 30, 60 (×real-time)

---

## Animation — accumulated game-time approach

- Unit travel uses `requestAnimationFrame` with `gameElapsedMs += realDelta * gameSpeed`
- This means pausing (speed = 0) instantly freezes units mid-animation
- Speed changes mid-flight take effect on the very next frame
- **Never** use `totalMs = totalSec * 1000 / gameSpeed` computed once at dispatch — that pattern doesn't respond to speed changes
- Same rAF approach used for return-to-station travel

---

## Animation — rAF generation counter (`unit._animGen`)

- `unit._animGen` is incremented every time a new animation starts for a unit
- The active `step()` loop saves `myGen = unit._animGen` at start and exits if they diverge
- This is the correct way to cancel an in-flight animation — **never** use `cancelAnimationFrame` directly
- ALL unit creation sites must initialize `_animGen: 0`
- To stop a unit's current animation: `unit._animGen = (unit._animGen || 0) + 1`

---

## Ghost marker defensive pattern

- `routeAndAnimate()` and `routeAndAnimateReturn()` both remove `unit.animMarker` before creating a new one
- Any function that redirects a unit mid-travel must increment `_animGen` and clean up old markers **before** calling the routing function — the routing function creates fresh markers
- Pattern: `unit._animGen++; if(unit.animMarker){ unit.animMarker.remove(); unit.animMarker=null; }`

---

## Unit status lifecycle

- `available` → (dispatch) → `dispatched` → (arrive) → `on_scene` → (resolve) → `returning` → (arrive home) → `available`
- `unit.status = 'returning'` is set at the **start** of `routeAndAnimateReturn()`, before the OSRM fetch, so the station list immediately reflects the new status
- **Status normalization on load:** `recreateStation()` resets any mid-call status (`dispatched`, `on_scene`, `returning`) back to `available` — animation state cannot survive a page reload
- `dispatched` and `returning` units are selectable in the dispatch modal and can be rerouted to a new call mid-travel from their current map position; dispatched units are pulled from their original call automatically

---

## Return ETA (`unit._returnRemSec`)

- `animateUnit()` writes `unit._returnRemSec` every frame during return trips (when `inc === null`)
- Render functions read this property to show live countdown ETAs for returning units
- Cleared to `0` by `onUnitReturned()`
- Station list pills show `↩ Xm to ST` when a unit is returning with remaining time
- Dispatch modal available-unit list shows dual ETA for returning units: `↩ Xm to ST | Ym to SCN`

---

## Time-weighted animation (OSRM segment durations)

- Both `routeAndAnimate()` and `routeAndAnimateReturn()` add `&annotations=duration` to OSRM requests
- Per-segment durations from `legs[0].annotation.duration` are parsed into a normalized cumulative time array stored as `unit.routeCumTimes` (values 0→1, length = coords.length)
- `animateUnit()` calls `interpolatePolylineByTime(coords, cumTimes, progress)` when cumTimes is available, otherwise falls back to distance-weighted `interpolatePolyline()`
- Result: units visually speed up on highways and slow on back roads, matching OSRM's prediction
- Straight-line fallback routes set `unit.routeCumTimes = null`

---

## Staffing — `countMetRequirements()` greedy matching

- Staffing ratio is computed by `countMetRequirements(requirements, onSceneUnits)` using greedy bipartite matching
- Each on-scene unit may satisfy **at most one** requirement group
- A pumper-tanker (`['engine','tanker']`) satisfies one engine slot OR one tanker slot — not both simultaneously
- Called in both `_tickGameClock()` (resolution rate) and `renderDispatchBody()` (staffing bar display)
- Staffing counter displays as `X/Y reqs met (N% efficiency)` on the resolution bar
- Resolution rate and staffing count only `status === 'on_scene'` units; enroute units do not contribute

---

## Mission spawning rules

- Missions only spawn within defined ESN polygons. No ESN = no calls in that area.
- No ESN = no calls; no Dispatch Center = no calls even if ESNs exist
- `availableTags` (spawn filter) is built from ALL in-service units regardless of `unit.status` — busy fire/EMS units do not suppress fire/EMS call types
- Each ESN's call spawning is gated by: (1) ESN has a DC assigned, (2) that DC is in service, (3) the DC's active call count is below its cap
- **DC call cap** = number of unique stations across all of that DC's assigned ESNs + 1
- **spawnMode per mission** (set in config.js): `'building'` / `'road_major'` / `'road_any'` / `'random'`
  - `building`: spawns on a building centroid (structure fires, gas leaks)
  - `road_major`: spawns on major road node, weighted toward intersections (MVAs on highways)
  - `road_any`: any driveable road (vehicle fires, traffic stops on local roads)
  - `random`: random polygon point + OSRM nearest snap (brush fires, medical emergencies anywhere)

---

## OSM data cache (per-ESN)

- Each ESN has `_osmCache: { fetched, fetching, fetchedAt, buildings[], majorNodes[], minorNodes[] }`
- Populated lazily via Overpass API on first spawn attempt; cached for `osmCacheTTLMs` (default 1 hour)
- Road node weighting: `majorRoadWeight * (1 + (intersectionCount - 1) * intersectionWeight)`
- Fallback: random polygon point + OSRM nearest snap if cache is empty or mode is `random`
- `inc.address` populated from OSRM nearest `waypoint.name` (road name)

---

## Call resolution system

- No `setTimeout` for resolution — uses a tick-based system in `_tickGameClock()`
- Each on-scene incident has `resolutionTarget` (game-seconds) and `resolutionProgress` (0.0–1.0)
- Effective rate: `Math.pow(staffingRatio, 2)` — poorly staffed calls resolve dramatically slower
- Staffing ratio = `countMetRequirements()` result / total requirement groups (on-scene units only)
- Resolution progress shown as a live bar with `X/Y reqs met` counter in the dispatch modal

---

## Station markers

- Station markers use Leaflet tooltips (not popups)
- Hover = tooltip appears; "Station Labels" layer toggle makes them permanent
- Clicking a station marker directly opens the Manage Station modal — NOT a popup
- `_buildStationTooltip(name, type)` helper builds the tooltip content string
- `setStationLabelsVisible(visible)` iterates all stations and rebinds tooltips as permanent/hover

---

## ESN drawing and editing

- First vertex is green (start indicator); subsequent vertices are gold
- Existing ESN polygon clicks are suppressed during drawing (`_suppressESNClicks`)
- Gray `L.circleMarker` reference dots show all existing ESN vertices as snapping aids during draw
- Shape editing reuses the draw system: existing coords pre-loaded, toolbar shows "Editing: [name]"
- `_editingESNId` tracks whether we are creating a new ESN or reshaping an existing one

---

## Dispatch stagger

- In `executeDispatch()`, each unit in a batch gets a staggered departure: unit N leaves after `N * 3` game-seconds
- Departure delay is `departureGameSec * 1000 / Math.max(1, gameSpeed)` real milliseconds
- OSRM route fetch happens at departure time

---

## Unit return animation

- On resolution, each dispatched unit animates back to its home station via OSRM (reverse route)
- Enroute units (still traveling at resolve time) return from their current map position, not from the incident
- Return line is dashed and drawn at 45% opacity to visually distinguish from dispatch lines
- `unit.returnLine` is a separate field from `unit.routeLine` so cleanup doesn't collide

---

## Escalation ownership check

- Before escalating an incident, verify the player owns at least one unit for each new requirement group
- If any requirement group has no matching owned unit, escalation is silently skipped

---

## DCs & ESNs sidebar tab

- Tab is labelled "DCs & ESNs" (not just "ESNs")
- DC section is collapsible (▲/▼ button); `toggleDCSection()` in `index.html`
- Clicking a DC card filters the ESN list to that DC's assigned ESNs; clicking again clears the filter
- Typing in the ESN search bar clears any active DC filter
- Filter state: `_selectedDCFilter` (dc id or null) in `esn.js`

---

## AVL label color system

- `avlColors` state var: `{ enroute, on_scene, returning }` — configurable label background colors per movement status
- `avlStyle` state var: `{ borderColor, textColor, fontSize }` — configurable label appearance
- Both default from `BAM_CONFIG.ui.avlLabelColors` / `BAM_CONFIG.ui.avlLabelStyle` in `config.js`
- `_buildUnitDotIcon(unit, dotColor)` applies status-based label background from `avlColors`
- `onUnitArrived()` refreshes `unit.animMarker` icon immediately after setting `on_scene` so the label color updates without a reload

---

## Settings persistence

- `playerSpawnRate` (default `1`, range `0.25`–`3×`), `avlColors`, and `avlStyle` are persisted to localStorage key `bam_settings`
- `loadSettings()` is called at startup; `saveSettings()` is called immediately on any settings change
- Settings are separate from save slots — they persist across all save games

---

## Station and unit deletion

- Station deletion: full `stationCost[s.type]` refund; two-click confirm (`_deleteStationConfirm` state var)
- Unit deletion: 50% of `unitTypes[typeKey].cost` refund; two-click confirm (`_deleteUnitConfirm` state var)
- Both cancel active animations (`_animGen++`), remove map markers, and update any active incidents
- Deletion is allowed even when units are on active calls — the call loses that unit (may revert to `needs_dispatch`)
