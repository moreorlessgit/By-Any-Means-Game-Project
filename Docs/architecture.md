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

## Crew-Select Dispatch

- The call modal footer has TWO primary buttons. `Dispatch Selected` runs the auto-matcher (`assignPersonnelToUnit`). `👥 Dispatch w/ Crew…` opens the Crew-Select modal (`#crew-select-modal`, z-index 10001) layered above the call modal.
- `executeDispatch(opts = {})` — when called with `opts.preassigned: true`, the auto-matcher is skipped for any unit that already has personnel with `currentAssignment.unitId === uid && currentAssignment.callId === inc.id`. When called with `opts.keepCallModalOpen: true`, the call modal stays open after dispatch and is re-rendered so the player sees units transition to enroute (used by the crew-select path).
- The pre-flight crew gate inside `executeDispatch` evaluates against preassigned crew via `evaluateCrewSelection(uid, personIds)` rather than `hasMinimumCrew(uid)` whenever preassigned crew exists for the call. Reason: `hasMinimumCrew` calls `getCrewForUnit` which filters by `status === 'available'`, and the just-assigned crew has already been flipped to `busy`/`responding`. Falling back to `hasMinimumCrew` would falsely block the dispatch.
- Defensive cleanup: when a preassigned unit is filtered out at the pre-flight gate, `releasePersonnelFromUnit(uid)` runs so the crew doesn't stay stuck busy on a dispatch that never happened.
- Volunteers picked via the modal go to `status='responding'` (not `busy`). `executeDispatch` discovers them via the same `respondingVolunteers` filter the auto path uses, so the `awaiting_crew` station-response animation kicks in identically.

### Crew-Select picker — `personnel.js` helpers

- `getSeatingLayoutForUnit(unit)` — returns `{ label, seats[] }` from `unitTypes[typeKey].seats`. Falls back to a single driver-seat layout when not configured.
- `getCrewCandidatesForUnit(unitId)` — returns every responder eligible to ride: station personnel (career on-duty + volunteers passing `isVolunteerAvailableNow`), `status === 'available'`, not pinned to a different unit. Each candidate is annotated with `_pickerMeta: { state: 'station'|'home'|'roaming', distanceMi, etaMin }`. Cert-eligibility is NOT enforced here — the picker shows everyone so the player can cross-staff.
- `evaluateCrewSelection(unitId, personIdsOrSeatMap)` — pure analyzer. Accepts EITHER a Person[] or a `{seatId: personId}` map. Returns `{ ok, hasDriver, driverCert, minMet, missing, idealMet, idealMissing, crew, assignments, unfilledRequired, unfilledOptional }`. When given a seat map the evaluator scores per-seat; when given a flat list it runs the seat-based matcher. `minMet` ≡ every required seat filled; `idealMet` ≡ every responder seat filled.
- `assignSpecificCrewToUnit(unitId, callId, personIdsOrSeatMap)` — commits the manual crew. The Crew-Select picker passes the full seat map so each person rides in their chosen seat (`person.currentAssignment.seatId` is persisted). Mirrors `assignPersonnelToUnit`'s status mutations (career→busy, volunteer→responding).
- `_estimateResponderTravel(person, station)` — volunteers only. Computes distance + ETA from `person.availability.currentLocation || person.home` to the station using `haversineKm` and `BAM_CONFIG.volunteerResponseSpeedMph` (default 50 mph). Returns `null` for career personnel (they're at the station).

### Seating layouts — config shape (single source of truth)

Seats own capacity, crew requirements, and patient/prisoner transport capacity. The legacy `crewDefaults` block has been retired — every constraint lives on the seat itself.

Seat schema (`BAM_CONFIG.unitTypes[typeKey].seats[]`):

- `id`, `label` — unique slot key + display name
- `isDriver: bool` — label-only flag (drives the ★ DRIVER badge in pickers; the actual hard gate is `requiredCert` on this same seat)
- `requiredCert: 'cert_id'` — HARD cert gate. Seat MUST be filled by someone holding this cert (or an equivalent via `satisfies`) for the apparatus to roll. Setting `requiredCert` also marks the seat as required-to-roll.
- `preferredCerts: string[]` — array of equally-valid preferred certs. Any hit scores `+BAM_CONFIG.crewScorePreferredHit` for auto-assign.
- `niceToHaveCerts: string[]` — additive scoring bonus per cert held (`+BAM_CONFIG.crewScoreNiceToHaveHit` each, stacks).
- `isPatientSeat: bool` — stretcher; counts toward unit's patient transport capacity. Responders cannot occupy.
- `isPrisonerSeat: bool` — cell/cage; counts toward unit's prisoner transport capacity. Responders cannot occupy.

A seat is mutually-exclusive: responder OR patient OR prisoner.

Dispatch gate: apparatus rolls when every seat with `requiredCert` is filled by someone holding that cert. Other responder seats are fill-if-available; the assembly timer (`BAM_CONFIG.volunteerAssemblyMaxGameMin`, default 10 game-minutes) caps how long the apparatus holds for non-required seats.

Mission/box-alarm requirements:

- Tag-array slots remain (`['engine']`, `['bls','als']`).
- Patient transport is `{ needs: 'isPatientSeat' }` — replaces the retired `'transport'` tag.
- Prisoner transport is `{ needs: 'isPrisonerSeat' }` — replaces the retired `'transport_prisoner'` tag.
- Legacy `'transport'`/`'transport_prisoner'` tags in older saves are interpreted by `unitMatchesRequirement` as the seat-needs equivalents.

Capacity helpers (in `personnel.js`):

- `unitPatientCapacity(unit)` / `unitCanTransportPatient(unit)`
- `unitPrisonerCapacity(unit)` / `unitCanTransportPrisoner(unit)`
- `getResponderSeats(unit)` / `getRequiredSeats(unit)` / `getUnitDriverCert(unit)`
- `_matchCrewToSeats(crew, unit)` — greedy seat assigner; scores per the config tunables above.

Read by the Crew-Select picker AND the Unit Details modal's merged Seating &amp; Crew section (`_renderUnitSeatingSection` in `units.js`).

### Assembly timer — abort behavior

When the assembly watchdog (`BAM_CONFIG.volunteerAssemblyMaxGameMin` game-minutes) fires:

- **Required seats filled** → apparatus rolls with whoever's at the station; remaining responders become no-shows.
- **Required seats short** → dispatch is ABORTED. `showCrewFailureToast()` raises a prominent "CREW ASSEMBLY FAILED" toast (bottom-center, red border, 12-second dismiss). Crew that's still en route continues their trip to the station; on arrival they linger there for `BAM_CONFIG.volunteerStationLingerGameMin` game-minutes (`availability.lingerAtStationUntilGameSec`) before normal hourly availability resumes. The unit returns to `available`; the incident drops to `needs_dispatch`.

Force-out (`forceVolunteerCrewDeparture`) bypasses the watchdog. Driver-cert gate still applies — the player can't force out a unit that has no driver at the station.

### Per-seat assignment storage

`person.currentAssignment.seatId` is persisted alongside `unitId`/`callId`. The Unit Details modal renders each person inside their seat row. Legacy saves without `seatId` show their crew under an "Riding (no seat)" subgroup; the next dispatch reassigns seats cleanly.

---

## Crew continuity on mid-cycle redispatch

- A `returning` unit's crew stays attached: `personnel.currentAssignment.unitId` still points to the unit, status is `busy`/`responding`. `hasMinimumCrew` correctly evaluates against the assigned crew via `getAssignedCrewForUnit` because `returning` is in the `_unitIsOnCall` list (`personnel.js`).
- An `available` unit retains its crew for a configurable grace window (`BAM_CONFIG.volunteerPostCallReleaseGameSec`, default 300 game-seconds). `onUnitReturned` sets `unit._releasePersonnelAtAbsSec`; `_tickPostCallRelease` releases when the threshold is hit.
- Two redispatch rules enforced inside `executeDispatch` to preserve continuity:
  1. **`callId` re-point on mid-cycle redispatch** — when `isReturning || isDispatched`, every person with `currentAssignment.unitId === uid` has their `currentAssignment.callId` updated to the new incident. Without this, `getOnSceneRoster(newIncId)` (and any other `callId`-filtered query) misses the crew that's physically in the cab.
  2. **Clear post-call release timer on redispatch** — `unit._releasePersonnelAtAbsSec = null` at the top of every redispatch path. Without this, a unit grabbed during the grace window would have its crew stripped mid-call when the timer fires.

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

## Unit display names — DC prefix system (Phase 5A)

- `unit.name` is the **internal callsign** (e.g. `E-52`). Never include a prefix here — prefixes are purely a display concern.
- Every user-visible surface uses `getUnitDisplayName(unit, stationHint)` from `units.js` instead of `unit.name`. The helper resolves the unit's station's dispatch center and applies the DC's `unitPrefix` using `prefixFormat` (`'bracket' | 'dash' | 'space'`). When no DC applies or `unitPrefix` is empty, the raw callsign is returned.
- DC-to-station resolution lives in `getStationDC(stationOrId)`:
  - Returns the DC whose `assignedESNs` contain any ESN whose `assignments` (fire/ems/police) include the station id.
  - If multiple DCs qualify and the station has a `preferredDCId`, that DC wins.
  - Otherwise the first matching DC by creation order wins.
- `hasStationDCConflict(station)` is true when ≥2 DCs qualify and no `preferredDCId` is set. The Manage Station modal surfaces a picker; the Unit List surfaces a ⚠ badge. Setting the override resolves the conflict.
- After any DC edit, ESN-assignment change, or station-DC override change, call:
  - `renderStationList()` — sidebar pills
  - `renderUnitList()` — Units tab in the Operations Modal
  - `refreshAllUnitMapLabels()` — rebuilds every moving unit's AVL label icon so the prefix appears immediately on the map
- New unit display surfaces should pull from `getUnitDisplayName()`. The only place `unit.name` is read directly is the rename input (so the player edits the raw callsign).

---

## Unit List and Unit Details modal (Phase 5A)

- **Unit List** is a top-level tab in the Operations Modal (Stations | Units | Facilities | Operations). Rendered by `renderUnitList()` in `units.js`. Filters: search / type / status. Sort: station / type / status / callsign. Updated each game-tick only while the Units tab is visible (`_activeOpsTab === 'units'`).
- **Unit Details** is a single dynamically-created modal (`#unit-details-modal`, built lazily on first `openUnitDetails(unitId)` call). The modal body is fully re-rendered each tick by `_updateUnitDetailsModal()`, EXCEPT when the rename input has focus — that guard prevents clobbering the player's edit.
- **Open triggers** — Unit Details opens from: sidebar station-list pills (left-click), Manage Station unit row (ℹ︎ button), AVL map labels (click the prefixed callsign), dispatch modal enroute row (click the name), dispatch modal available row (ℹ︎ button), prisoner-transport dispatch row (click the name), and Unit List rows.
- **Station-pill click was reassigned** from "toggle OOS" to "open Unit Details". Shift+click preserves the legacy OOS shortcut. New OOS toggle lives inside the Unit Details modal.
- Personnel/staffing fields in the Unit Details modal are intentionally stubbed with "(staffing in Phase 5B)" — the surface is ready, the data isn't yet.

---

## Station and unit deletion

- Station deletion: full `stationCost[s.type]` refund; two-click confirm (`_deleteStationConfirm` state var)
- Unit deletion: 50% of `unitTypes[typeKey].cost` refund; two-click confirm (`_deleteUnitConfirm` state var)
- Both cancel active animations (`_animGen++`), remove map markers, and update any active incidents
- Deletion is allowed even when units are on active calls — the call loses that unit (may revert to `needs_dispatch`)
