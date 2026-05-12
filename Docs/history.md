# Development History

## Phase 1 ✅

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

## Phase 2 ✅

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

## Phase 2+ Bug Fixes & Feature Additions ✅

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

## Phase 3 ✅

- **Hospital and prison placement** — Hospitals and jails/prisons placeable on map by player
- **Patient transport logic** — ALS patients routed to nearest appropriate hospital based on injury requirements; BLS patients to nearest BLS-capable hospital
- **Prisoner transport logic** — Prisoners from holding cells route to nearest county jail; from county jails route to nearest state correctional facility
- **Transport unit assignment** — Dispatch modal for manual unit selection when transporting patients/prisoners; units must be marked for transport capability
- **In-transit unavailable** — Units become unavailable during transport + offload time at receiving facility (ALS alert time + offload duration, configurable per facility type)
- **Transport time via OSRM** — Real-road routing used to calculate transport ETAs; displayed in transport dispatch modal
- **Air medical dispatch** — Air units available for time-critical patient transports (configurable per hospital air traffic policy)
- **Cashflow modal** — Summary of income (call rewards), expenses (station/unit purchase/upkeep, transport costs, offload fees), net position; tracks budget changes over time
- **Facilities modal** — Dedicated UI for managing hospitals and jails (OOS status, capacity, offload times)
- **Suspect and charge system** — Arrested suspects tracked with charges and hold duration; booking/processing times at holding stations before jail transfer
- **Holding cell modal with live countdown** — Progress bars and remaining time text update every tick without full re-render
- **Incident label on suspects** — Arrest call label displayed in holding cell modal for context
- **Jail modal with transfer UI** — Manual prisoner-to-prison transfers with destination jail selection

---

## Phase 3+ QOL/UI Batch ✅

**Sidebar Redesign & Operations Modal:**
- **Sidebar structure** — Simplified sidebar with Cancel Placement button (top), collapsible BUILD panel (6 categories: Fire/EMS/Police/Air/Facilities/Dispatch Center, each independently collapsible), OPERATIONS button
- **Operations modal** — `#ops-modal` with 3 top-level tabs:
  - **Stations tab** — Search + filter pills (All|Fire|EMS|Police|Air); full station list with Manage/Focus/OOS buttons
  - **Facilities tab** — Search + filter pills (All|Hospitals|Jails); hospital and jail lists with Manage/Focus/OOS buttons
  - **Operations tab** — 4 sub-tabs:
    - **Dispatch Centers** — Search bar; DC list with Edit/Summary/OOS buttons; shows active call count vs cap
    - **ESN Zones** — Search bar; ESN list with Edit Shape/Manage/OOS buttons
    - **Response Plans** — Search bar; Plans list with Edit/Delete buttons
    - **Box Alarms** — Search bar; Box alarms list with Edit/Delete buttons per ESN
- **Transport Queue button** — Dedicated sidebar control (below OPERATIONS button) visible when queue has pending transports; shows count badge and pulses for attention
- **Transport dispatch modal** — Unit-selection UI showing available `transport_prisoner` or `patrol` units sorted by distance from current holding location; displays unit name, home station, distance, and ETA estimates
- **Pending transport queue** — Global `pendingTransports[]` stores references to suspects needing transport; auto-queued from processing timer expiry; manually queued from holding cell / jail transfers; player assigns units via dispatch modal
- **Transport queue modal** — Lists all pending transports with Assign Unit and Dismiss buttons per entry; clicking Assign opens the dispatch modal for that transfer

**Search & Filter Improvements:**
- **DC modal ESN search** — Input field above ESN checkbox list filters in real-time by ESN name
- **ESN modal station search per service** — Three independent search inputs (Fire|EMS|Law) filter assigned stations per service group
- **DC assignment in ESN modal** — Select dropdown to assign/reassign an ESN to a specific dispatch center; removes ESN from all other DCs on save
- **DC summary 3-column grid** — Replaces flat pill layout with structured 3-column Fire/EMS/Law grid per ESN showing coverage by service

**Box Alarm Ordered Preferences:**
- **New data structure** — `requirements: [{ prefs: [{type:'unit'|'tag', id?, name?, tag?}] }]` replacing old flat `[['tag']]` format
- **Ordered preference list UI** — Each slot shows list of preferences with Add Unit / Add Tag / Remove / Move buttons; preferences executed in order (first available unit wins)
- **Backward compatibility** — `loadBoxAlarmData()` auto-converts old `[['tag']]` format to new structure on load; `applyAutoDispatch()` handles both formats at runtime

**Unit and Station Management:**
- **Unit drag-and-drop reorder** — Units in station Manage modal are `draggable`; drag-over highlights target; drop reorders in `s.units[]` array and persists to save data
- **Incident label display** — Suspects in holding cell show arrest call incident label for context (stored in `suspect.incidentLabel`)
- **Holding cell live countdown** — Progress bars and remaining time text (`#hcm-bar-${sus.id}`, `#hcm-rem-${sus.id}`) update every tick via `_updateHoldingCellModal()` without full modal re-render

**UI Polish:**
- **Header always visible** — `#header` now `position:sticky; top:0; z-index:10001` so clock/speed controls remain accessible above all modals (z-index 9999)
- **ESN color presets expanded** — `ESN_COLOR_PRESETS` increased from 8 to 21 colors (ambers, greens, blues, reds, purples, pinks, teals, gray, white) for more visual variety

---

*Last updated: 2026-05-12. Phase 3 (hospitals, jails, patient/prisoner transport, air medical, cashflow/facilities modals, suspects/charges) and Phase 3+ QOL/UI batch (sidebar redesign with Operations modal, transport dispatch queue, holding cell live timers, ESN/DC search, box alarm ordered preferences, unit drag-and-drop reorder, header sticky positioning, expanded color presets) complete. Phase 4 (volunteer system, personnel, certifications) is next.*
