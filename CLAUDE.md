# CLAUDE.md — By Any Means
## Project Briefing for Claude Code Sessions

---

## 1. Project Identity

**Name:** By Any Means
**Type:** Personal emergency services dispatch and agency-building simulation game
**Status:** Active development, Phase 2+ bug fixes and feature additions complete

### Primary Goal
A fully custom-buildable emergency services simulation. The player starts small — a single station, a single unit — and builds outward at their own pace with no artificial cost scaling or forced progression. The player defines everything: station names, unit callsigns, coverage areas, response plans, box alarms. The game is a canvas for the player's vision of their local emergency services landscape, not a fixed scenario.

### Player Background
The primary player/developer is a real-world 911 dispatcher and Firefighter/EMT. Authenticity is a core design value. Mechanics should mirror how real dispatch, fire, and EMS operations actually work — not how games typically simulate them.

### Geographic Scope
- **Starting area:** Harford, PA and surrounding Susquehanna County
- **Planned expansion:** Wyoming County and Lackawanna County, PA
- **Long-term goal:** Full US map playable via OpenStreetMap tile streaming (no local map storage needed)

### Distribution Goals
- Currently personal use only
- May be shared non-commercially with one or two friends (fellow dispatchers)
- Long-term stretch goal: free or very cheap hosting (GitHub Pages, Cloudflare Pages, etc.)
- Never commercial

---

## 2. Tech Stack

Simple does not need to mean limited. Free is required. Best tool for the job wins.

| Layer | Current | Notes |
|---|---|---|
| UI/Game | Plain HTML + CSS + JS | No framework yet, acceptable to introduce one if justified |
| Map | Leaflet.js | OpenStreetMap tiles, streamed on demand |
| Routing | OSRM (public API) | Real road routing, ETA calculation; `router.project-osrm.org` |
| OSM data | Overpass API | Per-ESN building + road node cache; `overpass-api.de` |
| Storage | localStorage (`bam_save_` prefix) | SQLite migration planned for later |
| Local server | Live Server (VSCode extension) | Sufficient for now |
| Build tools | None currently | Can be introduced if there is a clear benefit — explain before adding |

### On introducing new tools or dependencies
If a new library, framework, or tool would meaningfully improve the project, suggest it and explain why before adding it. Free only. The player is not a developer — keep the local setup as simple as possible to run even if the code itself is complex.

---

## 3. Current File Structure

```
/By Any Means
  index.html      — Game engine, UI, all rendering and game loop logic
  config.js       — MASTER CONFIG FILE. Single source of truth for all variables.
  esn.js          — ESN polygon drawing, dispatch centers, box alarms, OSM cache, spawn logic
  CLAUDE.md       — This file. Read at the start of every session.
```

### Planned future files (not yet created)
These will be created only when a system grows too large to logically live in an existing file, or when separation genuinely improves maintainability. Always discuss with the player before creating a new file.

```
  saves/          — Folder for JSON save files (multiple save slots)
  personnel.js    — Individual responder tracking, certifications, volunteer status (when built)
  dispatch.js     — CAD-style dispatch window and response plan logic (when built)
```

### File creation rules
- Bug fixes and expansions to existing systems go in the existing file unless there is a strong reason otherwise
- Before creating a new .js file, explain to the player why separation is better than expanding an existing file
- Avoid file bloat — logical cohesion matters more than line count
- Existing features CAN and SHOULD be rewritten when improvements, bug fixes, or additions require it

---

## 4. Core Architecture Rules

### config.js is the single source of truth
- ALL editable game variables live in `config.js` — mission definitions, unit types, costs, probabilities, rewards, spawn settings, economy values
- Nothing that a player might want to tune is ever hardcoded in game logic
- `config.js` is loaded before `index.html` in the HTML `<head>`
- When adding a new mission type: add ONLY to `config.js` missions block — including the `spawnMode` field
- When adding a new unit type: add ONLY to `config.js` unitTypes block
- `config.js` also has a `ui` section for AVL label color/style defaults

### Unit capability tag system
- Units carry an array of capability `tags` (e.g. `['engine', 'tanker']`)
- Missions require tags, not specific unit types
- A pumper/tanker carries both `engine` and `tanker` tags — it satisfies either requirement
- A rescue engine carries `rescue` and `engine` tags
- This system must be preserved and extended, never replaced with direct unit-type matching

### Save system
- Multiple save slots via localStorage; key prefix `bam_save_` followed by slot name
- Overwriting an existing slot requires a two-click confirm flow (`overwriteSlot()`) — first click turns button red "Confirm?", second click saves. Auto-resets after 4 seconds.
- Saves backward-compatible: old `gameMinutes` field is converted to `gameSeconds` on load
- Never auto-overwrite a save without this confirmation flow
- **Settings** are stored separately under key `bam_settings` (not part of save slots); `loadSettings()` is called at startup before `initSidebarCosts()`

### Game clock
- Time is stored as `gameSeconds` (integer, seconds since midnight)
- Clock starts at 08:00:00 (= 8 * 3600)
- Rolls over at 86400 and increments `gameDay`
- Display format: HH:MM:SS
- Speed values: 0 (paused), 1, 2, 5, 10, 30, 60 (×real-time)

### Animation — accumulated game-time approach
- Unit travel uses `requestAnimationFrame` with `gameElapsedMs += realDelta * gameSpeed`
- This means pausing (speed = 0) instantly freezes units mid-animation
- Speed changes mid-flight take effect on the very next frame
- **Never** use `totalMs = totalSec * 1000 / gameSpeed` computed once at dispatch — that pattern doesn't respond to speed changes
- Same rAF approach used for return-to-station travel

### Animation — rAF generation counter (`unit._animGen`)
- `unit._animGen` is incremented every time a new animation starts for a unit
- The active `step()` loop saves `myGen = unit._animGen` at start and exits if they diverge
- This is the correct way to cancel an in-flight animation — **never** use `cancelAnimationFrame` directly
- ALL unit creation sites must initialize `_animGen: 0`
- To stop a unit's current animation: `unit._animGen = (unit._animGen || 0) + 1`

### Ghost marker defensive pattern
- `routeAndAnimate()` and `routeAndAnimateReturn()` both remove `unit.animMarker` before creating a new one
- Any function that redirects a unit mid-travel must increment `_animGen` and clean up old markers **before** calling the routing function — the routing function creates fresh markers
- Pattern: `unit._animGen++; if(unit.animMarker){ unit.animMarker.remove(); unit.animMarker=null; }`

### Unit status lifecycle
- `available` → (dispatch) → `dispatched` → (arrive) → `on_scene` → (resolve) → `returning` → (arrive home) → `available`
- `unit.status = 'returning'` is set at the **start** of `routeAndAnimateReturn()`, before the OSRM fetch, so the station list immediately reflects the new status
- **Status normalization on load:** `recreateStation()` resets any mid-call status (`dispatched`, `on_scene`, `returning`) back to `available` — animation state cannot survive a page reload
- `dispatched` and `returning` units are selectable in the dispatch modal and can be rerouted to a new call mid-travel from their current map position; dispatched units are pulled from their original call automatically

### Return ETA (`unit._returnRemSec`)
- `animateUnit()` writes `unit._returnRemSec` every frame during return trips (when `inc === null`)
- Render functions read this property to show live countdown ETAs for returning units
- Cleared to `0` by `onUnitReturned()`
- Station list pills show `↩ Xm to ST` when a unit is returning with remaining time
- Dispatch modal available-unit list shows dual ETA for returning units: `↩ Xm to ST | Ym to SCN`

### Time-weighted animation (OSRM segment durations)
- Both `routeAndAnimate()` and `routeAndAnimateReturn()` add `&annotations=duration` to OSRM requests
- Per-segment durations from `legs[0].annotation.duration` are parsed into a normalized cumulative time array stored as `unit.routeCumTimes` (values 0→1, length = coords.length)
- `animateUnit()` calls `interpolatePolylineByTime(coords, cumTimes, progress)` when cumTimes is available, otherwise falls back to distance-weighted `interpolatePolyline()`
- Result: units visually speed up on highways and slow on back roads, matching OSRM's prediction
- Straight-line fallback routes set `unit.routeCumTimes = null`

### Staffing — `countMetRequirements()` greedy matching
- Staffing ratio is computed by `countMetRequirements(requirements, onSceneUnits)` using greedy bipartite matching
- Each on-scene unit may satisfy **at most one** requirement group
- A pumper-tanker (`['engine','tanker']`) satisfies one engine slot OR one tanker slot — not both simultaneously
- Called in both `_tickGameClock()` (resolution rate) and `renderDispatchBody()` (staffing bar display)
- Staffing counter displays as `X/Y reqs met (N% efficiency)` on the resolution bar
- Resolution rate and staffing count only `status === 'on_scene'` units; enroute units do not contribute

### Mission spawning rules
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

### OSM data cache (per-ESN)
- Each ESN has `_osmCache: { fetched, fetching, fetchedAt, buildings[], majorNodes[], minorNodes[] }`
- Populated lazily via Overpass API on first spawn attempt; cached for `osmCacheTTLMs` (default 1 hour)
- Road node weighting: `majorRoadWeight * (1 + (intersectionCount - 1) * intersectionWeight)`
- Fallback: random polygon point + OSRM nearest snap if cache is empty or mode is `random`
- `inc.address` populated from OSRM nearest `waypoint.name` (road name)

### Call resolution system
- No `setTimeout` for resolution — uses a tick-based system in `_tickGameClock()`
- Each on-scene incident has `resolutionTarget` (game-seconds) and `resolutionProgress` (0.0–1.0)
- Effective rate: `Math.pow(staffingRatio, 2)` — poorly staffed calls resolve dramatically slower
- Staffing ratio = `countMetRequirements()` result / total requirement groups (on-scene units only)
- Resolution progress shown as a live bar with `X/Y reqs met` counter in the dispatch modal

### Station markers
- Station markers use Leaflet tooltips (not popups)
- Hover = tooltip appears; "Station Labels" layer toggle makes them permanent
- Clicking a station marker directly opens the Manage Station modal — NOT a popup
- `_buildStationTooltip(name, type)` helper builds the tooltip content string
- `setStationLabelsVisible(visible)` iterates all stations and rebinds tooltips as permanent/hover

### ESN drawing and editing
- First vertex is green (start indicator); subsequent vertices are gold
- Existing ESN polygon clicks are suppressed during drawing (`_suppressESNClicks`)
- Gray `L.circleMarker` reference dots show all existing ESN vertices as snapping aids during draw
- Shape editing reuses the draw system: existing coords pre-loaded, toolbar shows "Editing: [name]"
- `_editingESNId` tracks whether we are creating a new ESN or reshaping an existing one

### Dispatch stagger
- In `executeDispatch()`, each unit in a batch gets a staggered departure: unit N leaves after `N * 3` game-seconds
- Departure delay is `departureGameSec * 1000 / Math.max(1, gameSpeed)` real milliseconds
- OSRM route fetch happens at departure time

### Unit return animation
- On resolution, each dispatched unit animates back to its home station via OSRM (reverse route)
- Enroute units (still traveling at resolve time) return from their current map position, not from the incident
- Return line is dashed and drawn at 45% opacity to visually distinguish from dispatch lines
- `unit.returnLine` is a separate field from `unit.routeLine` so cleanup doesn't collide

### Escalation ownership check
- Before escalating an incident, verify the player owns at least one unit for each new requirement group
- If any requirement group has no matching owned unit, escalation is silently skipped

### DCs & ESNs sidebar tab
- Tab is labelled "DCs & ESNs" (not just "ESNs")
- DC section is collapsible (▲/▼ button); `toggleDCSection()` in `index.html`
- Clicking a DC card filters the ESN list to that DC's assigned ESNs; clicking again clears the filter
- Typing in the ESN search bar clears any active DC filter
- Filter state: `_selectedDCFilter` (dc id or null) in `esn.js`

### AVL label color system
- `avlColors` state var: `{ enroute, on_scene, returning }` — configurable label background colors per movement status
- `avlStyle` state var: `{ borderColor, textColor, fontSize }` — configurable label appearance
- Both default from `BAM_CONFIG.ui.avlLabelColors` / `BAM_CONFIG.ui.avlLabelStyle` in `config.js`
- `_buildUnitDotIcon(unit, dotColor)` applies status-based label background from `avlColors`
- `onUnitArrived()` refreshes `unit.animMarker` icon immediately after setting `on_scene` so the label color updates without a reload

### Settings persistence
- `playerSpawnRate` (default `1`, range `0.25`–`3×`), `avlColors`, and `avlStyle` are persisted to localStorage key `bam_settings`
- `loadSettings()` is called at startup; `saveSettings()` is called immediately on any settings change
- Settings are separate from save slots — they persist across all save games

### Station and unit deletion
- Station deletion: full `stationCost[s.type]` refund; two-click confirm (`_deleteStationConfirm` state var)
- Unit deletion: 50% of `unitTypes[typeKey].cost` refund; two-click confirm (`_deleteUnitConfirm` state var)
- Both cancel active animations (`_animGen++`), remove map markers, and update any active incidents
- Deletion is allowed even when units are on active calls — the call loses that unit (may revert to `needs_dispatch`)

### UI text abbreviations
- `ST` = station in all ETA and status display strings
- `SCN` = scene in all ETA and status display strings
- Examples: `↩ 4m to ST`, `6m to SCN`, `On SCN`

### Progression philosophy
- No artificial grind. Progression comes from expanding your footprint, not from repetition
- Station costs are FLAT — the 10th fire station costs exactly the same as the first
- No cost scaling based on existing station count (unlike games in this genre)
- Rewards should feel meaningful relative to costs without requiring hundreds of calls to afford one station

---

## 5. Systems Built — Phase 1 ✅

- Interactive Leaflet map centered on Susquehanna County, PA
- Station placement (Fire / EMS / Police) with flat cost system
- Multi-unit stations with unit type definitions and capability tag system
- OSRM real-road routing with animated unit travel dot and dashed route line
- Live ETA countdown updated per animation frame
- Money / budget system
- Weighted random mission spawning within configurable radius of stations
- Mission escalation chains (e.g. MVA → MVA w/ Entrapment, Traffic Stop → DUI Arrest)
- Patient generation with injury types and ALS/BLS requirements
- Dispatch modal: requirements checklist, patient list, available units sorted by ETA
- Call log tab
- Save / load via localStorage (multi-slot)
- Test seed data around Harford, PA (clearly labeled, player-replaceable)

---

## 6. Systems Built — Phase 2 ✅

- **ESN polygon zones** — Player draws, names, colors, edits, and deletes coverage zones on the map
- **ESN shape editing** — "Edit Shape" button in ESN modal re-enters draw mode with existing vertices
- **ESN drawing isolation** — Existing polygon clicks suppressed during draw; gray reference dots for snapping
- **Multi-station ESN assignment** — Each ESN assigns fire, EMS, and police stations independently
- **ESN search + DC filter** — Search bar filters ESN list; clicking a DC card filters to that DC's ESNs
- **Dispatch Centers** — Placeable map buildings; assign ESNs; summary modal with cap/active call counts
- **DC sidebar list** — Collapsible DC section at top of DCs & ESNs tab; edit/OOS per DC
- **DC call cap** — Cap = unique stations in DC's ESNs + 1; enforced in spawn logic
- **DC OOS spawn gate** — OOS dispatch center blocks all spawning in its assigned ESNs
- **No DC = no calls** — Spawning completely blocked until at least one DC is placed
- **In / Out of Service** — Stations, units, ESNs, and DCs all support OOS toggle
- **HH:MM:SS game clock** — `gameSeconds`-based, rollover at 86400, speed buttons 1×–60×
- **True pause** — rAF accumulated game-time: speed 0 instantly freezes all in-flight animations
- **Mid-flight speed changes** — Speed changes affect all active animations on the next frame
- **Unit return animation** — After resolution, units animate back to station on a dashed return route
- **OSM-aware spawning** — Per-ESN Overpass cache; structure fires spawn on buildings, MVAs on roads
- **Road node weighting** — Major roads and intersections weighted higher for road-type spawns
- **OSRM snap fallback** — Random-mode calls snap to nearest driveable road; `inc.address` from road name
- **Dispatch stagger** — Units in same dispatch depart 3 game-seconds apart (speed-scaled)
- **AVL-style unit labels** — Callsign text above moving unit dots; toggle in layer panel
- **Station label layer** — Persistent station name tooltips on map markers; toggle in layer panel
- **Station marker click → manage modal** — Clicking a station on the map opens Manage Station directly
- **Incident address display** — Road name from OSRM shown on incident cards and dispatch modal
- **Units Enroute section in dispatch modal** — Live ETA countdown inside modal (not sidebar cards)
- **Resolution progress bar** — Live bar + staffing efficiency + est. clear time in dispatch modal
- **Tick-based resolution system** — No setTimeout; progress driven by game clock, nonlinear staffing penalty
- **Escalation ownership check** — Calls only escalate if player owns units for all new requirements
- **Overwrite save confirm flow** — Two-click confirm (button turns red "Confirm?") replaces browser dialog
- **Response plans** — Named auto-assignment plans; pulls closest available unit by ETA per tag
- **Box alarms** — Per-ESN unit assignments that override/supplement response plans

---

## 7. Systems Built — Phase 2+ Bug Fixes & Feature Additions ✅

- **Map tile color fix** — Replaced broken `hue-rotate(200deg)` filter (caused greens to appear purple) with `.leaflet-tile-pane { filter: brightness(0.65) saturate(0.75) contrast(1.05) }` darkening
- **Animation race condition fix** — `unit._animGen` generation counter prevents competing rAF loops when a unit is dispatched while another animation is already active
- **Time-weighted unit animation** — OSRM `&annotations=duration` + `interpolatePolylineByTime()` makes units visually speed up on highways and slow on back roads
- **LEO-only spawning fix** — Spawn tag eligibility uses all in-service units regardless of status; busy fire/EMS units no longer suppress fire/EMS call types
- **On-scene-only staffing** — Resolution rate and dispatch modal staffing bar count only `status === 'on_scene'` units; enroute units do not contribute
- **Staffing greedy matching** — `countMetRequirements()` ensures each unit fills at most one requirement slot; staffing counter displays `X/Y reqs met` alongside efficiency %
- **Unit stuck returning fix** — Status normalization on load resets mid-call statuses to `available`; animation state cannot survive a page reload
- **Unit cancellation from current position** — `cancelUnitFromCall()` routes enroute units home from current map position; on-scene units route home from the incident location
- **Enroute unit rerouting** — Dispatched units appear selectable (amber border, `✦ ENROUTE → [call]` label) in any call's dispatch modal; selecting one pulls it from its original call and reroutes to the new call from current position
- **Returning unit ETA** — `unit._returnRemSec` updated every animation frame; station list pills show `↩ Xm to ST`; dispatch modal shows dual ETA (`↩ Xm to ST | Ym to SCN`)
- **Ghost marker fix** — `routeAndAnimate()` and `routeAndAnimateReturn()` defensively remove existing `unit.animMarker` before creating a new one; no frozen ghost dots on reroute
- **AVL label status colors** — Unit map dot labels show status-based background colors: enroute = bright green, on scene = blue, returning = yellow; configurable in Settings
- **AVL label on-scene refresh** — `onUnitArrived()` updates the marker icon immediately so the label turns blue the moment a unit arrives
- **Settings modal** — ⚙ button in header opens tabbed Settings panel: Simulation (spawn rate 0.25×–3×), AVL Labels (color/style pickers per status), Map (placeholder); settings persist to `bam_settings` localStorage
- **Station deletion** — "Delete Station" button in Manage Station modal; two-click confirm; full station cost refunded
- **Unit deletion** — Delete button per unit in Manage Station; two-click confirm; 50% unit cost refunded
- **Dispatch modal auto-refresh** — `_refreshDispatchModalIfOpen(incId)` re-renders the open modal on unit arrival, cancellation, or dispatch; `↻ Update` button for manual refresh

---

## 8. Planned Systems — Phase Roadmap

Phases are a guide, not a strict sequence. Player input determines priority.

### Phase 3 — Hospitals, Prisons, and Transport
- Hospital and prison locations placeable on map by player
- Patient transport logic: ALS patients to nearest appropriate hospital, prisoners to nearest prison
- BLS vs ALS transport decisions based on patient injury type
- Unit becomes unavailable during transport + offload time
- Transport time calculated via OSRM routing

### Phase 4 — Volunteer System and Personnel
- **Station staffing types:** Each station configured as Career (fully paid), Combination, or Volunteer
- **Volunteer response delay:** Volunteers must respond to the station before the apparatus can respond. Delay calculated from volunteer's home/work location within the ESN. Adds realistic rural response time lag.
- **Personnel system:** Individual named responders at each station. Can be renamed by player. Tracks certifications (FF1, FF2, Driver/Operator, EMT, AEMT, Paramedic, LEO, etc.)
- **Volunteer roster:** Volunteers assigned to ESNs, not just stations. They respond from within the ESN.
- **Certification requirements:** Units require minimum certified personnel to respond (e.g. ALS ambulance needs at least one Paramedic)
- **Training system:** Player can train personnel to gain new certifications. Training is money-gated only — the player pays a cost and the certification is granted immediately. No waiting. Costs defined in config.js.

### Phase 5 — CAD-Style Call List
- Running call list mimicking real CAD/dispatch workflow
- Call creation, unit assignment, status updates (dispatched, enroute, on scene, available)
- Call history with timestamps and unit activity log per call
- This should feel familiar to a real dispatcher

### Phase 6 — Water Supply
- Wet hydrant and dry hydrant placement by player
- Tanker shuttle logic for areas without hydrant coverage
- Fill site designation
- Supply line tracking per incident
- Water supply requirements added to structure fire mission types

### Future / Stretch
- Equipment customization per apparatus (tools, equipment loadout affecting capability tags)
- Multi-agency scenarios
- Potential cheap hosting for sharing with friends (GitHub Pages / Cloudflare Pages)
- Possible future: simple multiplayer where two dispatchers share a CAD

**Note on mutual aid:** Mutual aid is already modeled organically by the player through ESN assignments. A player can assign a distant station to cover an ESN, which naturally represents a mutual aid agreement. No separate mutual aid system is needed.

---

## 9. Design Philosophy

- **Authenticity over arcade.** If it doesn't work like this in real life, it probably shouldn't work like this in the game. The player is a real dispatcher and EMT — they will notice.
- **The player is in control.** Every area, every station name, every unit callsign, every ESN boundary is defined by the player. The game provides the engine; the player provides the world.
- **No grind.** Progression should feel like expansion, not repetition. The player should be excited to place a new station because it opens new territory, not because they finally ground out enough calls.
- **Flat costs.** Station and unit costs never increase. The 50th engine costs the same as the first.
- **Realism at all scales.** The starting setting is rural Pennsylvania, and rural firefighting mechanics — tanker shuttles, volunteer delays, long response times, sparse coverage — are core to the experience, not edge cases. As the game expands to cover the full US, urban and suburban mechanics will be added alongside rural ones. The rural foundation should never be deprioritized.
- **Modular and editable.** A player should be able to add a new call type by editing config.js without touching a single line of game logic.

---

## 10. Coding Conventions

- **Comments on every config variable** explaining what it does and what values are valid
- **Comments throughout game logic code** explaining what each function and significant block does in plain English — the player is not a developer and should be able to read the code and get a general understanding of what is happening
- **Function names:** descriptive and verb-first (`spawnIncident`, `routeAndAnimate`, `executeDispatch`, `renderStationList`)
- **No magic numbers** in game logic — everything referenced from config
- **CSS variables** for all colors — never hardcode hex values in JS or inline styles where avoidable
- **IDs:** stations use `st_` prefix, units use `u_` prefix, incidents use `inc_` prefix, personnel will use `p_` prefix
- **Before any significant change:** explain to the player in plain English what is changing, why, and what files will be affected. Wait for confirmation before proceeding.
- **At the end of productive sessions:** offer to update this CLAUDE.md file to reflect new systems built or decisions made.
- **Never delete or overwrite player save data** without explicit confirmation.
- **Prefer editing existing files** over creating new ones unless separation is clearly justified. Explain reasoning if a new file is proposed.

### Live UI update pattern
DOM elements inside modals that display countdown timers or progress bars must receive an `id` attribute (e.g. `id="hcm-bar-${item.id}"`) so they can be updated in-place each game tick by a dedicated `_update*()` helper called from `_tickGameClock()`. Never fully re-render a modal every tick — it destroys dropdown state. Pattern established in `_updateDispatchStabBars()`, `_updateHospitalProgressBars()`, `_updateHoldingCellModal()`.

### US units only
All game distances, speeds, and measurements displayed to the player must use US customary units: miles (mi), miles per hour (mph). Never display kilometers or km/h to the player. Internal OSRM data (which returns meters/km) is converted before display. Config values are in mph.

---

## 11. Session Behavior for Claude

- Read this file at the start of every session before doing anything
- Ask clarifying questions whenever anything is ambiguous — not just about code, but about design intent, priorities, or player preferences. It is always better to ask than to assume.
- Explain changes in plain English before making them — the player is not a developer
- Flag anything that might break existing functionality before proceeding
- Keep the player informed of what files are being changed and why
- Suggest CLAUDE.md updates at the end of sessions where architecture or plans changed
- When something could be done multiple ways, briefly present the options and let the player decide

---

*Last updated: Phase 3 complete. Major QOL/UI batch complete — sidebar redesign (Operations modal), transport dispatch queue, holding cell live timers, ESN/DC search fields, box alarm ordered preferences, drag-and-drop unit reorder. Phase 4 (volunteer system, personnel) is next.*
