# Glossary

## Acronyms & Abbreviations

**ALS** — Advanced Life Support. A level of pre-hospital emergency care and scope of practice performed by paramedics. In the game, ALS patients require transport to hospitals with ALS capabilities; hospital destination is determined by proximity and hospital capability.

**AVL** — Automatic Vehicle Location. GPS-based system that shows dispatch where units are located in real time. In the game, unit positions are displayed on the map with animated dots and labels showing callsign and status.

**BLS** — Basic Life Support. A level of pre-hospital emergency care and scope of practice performed by EMTs. In the game, BLS patients require transport to hospitals with BLS capabilities; hospital destination is determined by proximity and hospital capability.

**CAD** — Computer Aided Dispatch. A dispatch center software system used in real-world public safety. Phase 5 of By Any Means will implement a CAD-style running call list.

**DC** — Dispatch Center. The player-placeable command center that coordinates emergency response for assigned ESNs. In real life, dispatch centers are called PSAPs (Public Safety Answering Points). Each DC has a call cap (= number of unique stations in its ESNs + 1) and can be toggled out of service.

**EMT** — Emergency Medical Technician. A real-world responder trained in emergency medical care at the Basic Life Support level.

**ESN** — Emergency Service Number. Used by the E911 system to route calls to the correct PSAP (Public Safety Answering Point) and core part of the MSAG (Master Street Address Guide). In the game, ESNs are player-drawn polygons on the map that define coverage areas. Each ESN is assigned to a dispatch center and has independent fire/EMS/police station assignments, response plans, and box alarms.

**ETA** — Estimated Time of Arrival. The calculated time remaining for a unit to reach its destination (incident scene or station), updated in real time based on OSRM routing.

**FF1 / FF2** — Firefighter certification levels (Firefighter I and II).

**LEO** — Law Enforcement Officer. Police/patrol personnel.

**MVA** — Motor Vehicle Accident. A vehicle collision incident type.

**OOS** — Out of Service. A toggle status applied to stations, units, ESNs, dispatch centers, and facilities. When OOS, a unit will not respond, a station will not appear available for assignment, a DC will block all spawning in its ESNs, etc.

**OSRM** — Open Source Routing Machine. A public routing engine that calculates real road routes and accurate ETAs for unit travel. The game uses `router.project-osrm.org` to fetch routes and time data annotated by road segment duration.

**PT** — Patient. Used interchangeably with "patient" when referring to medical call victims and their transport.

**PSAP** — Public Safety Answering Point. The real-world dispatch center that answers E911 calls. In the game, these are called Dispatch Centers (DCs).

**ST** — Station. Abbreviation used in UI text for "station" (e.g., "↩ 4m to ST" = 4 minutes to station).

**SCN** — Scene. Abbreviation used in UI text for "scene" / "incident location" (e.g., "On SCN" = on scene).

---

## Core Game Mechanics

**Air Medical** — Air units (helicopters) available for time-critical patient transports. Dispatch is based on hospital air traffic policy and patient criticality, typically reserved for critical patients or transports to remote locations.

**Box Alarm** — A predetermined, automatic response of emergency apparatus to a specific geographic location, such as a building, intersection, or neighborhood, often triggered by a confirmed structure fire or high-risk incident. In real-world public safety, box alarms are assigned by district/area. In By Any Means (Phase 3+), box alarms are tied to ESNs with ordered unit/tag preferences that auto-dispatch in priority order when the alarm is triggered.

**Call Cap** — The maximum number of active incidents a dispatch center can handle simultaneously. Calculated as the number of unique stations assigned to the DC's ESNs + 1. When a DC reaches its cap, no new calls spawn in its ESNs until active calls resolve.

**Capability Tags** — An array of abilities that a unit carries (e.g., `['engine', 'tanker', 'rescue']`) to fulfill mission requirements. Missions specify required tags, not unit types. A pumper-tanker unit carrying both `engine` and `tanker` tags satisfies either an engine slot OR a tanker slot (greedy matching).

**Certifications** — Qualifications held by personnel (e.g., FF1, FF2, Paramedic, EMT, AEMT, LEO, Driver/Operator). In Phase 4, units will require minimum certified personnel to respond (e.g., an ALS ambulance needs at least one Paramedic).

**Crew Continuity** — Design rule that an apparatus' assigned crew stays attached through the full call cycle and into post-arrival idle. A `returning` unit's crew remains on the unit so it can be redispatched mid-return without re-staffing; an `available` unit retains its crew for a grace window (`volunteerPostCallReleaseGameSec`) after arrival. Mid-cycle redispatch re-points each crew member's `currentAssignment.callId` to the new incident and cancels the post-call release timer.

**Crew-Select Dispatch** — Optional manual-crew flow opened by the `👥 Dispatch w/ Crew…` button on the call modal. Per-apparatus picker showing seats (left) + available responders at station/home/roaming (right). Player picks who rides where; the modal validates driver-cert + min-crew live, then dispatches with the chosen crew instead of running the auto-matcher. Separate from the existing `Dispatch Selected` button, which still auto-fills crew greedily.

**Dispatch Stagger** — In a multi-unit dispatch, units are staggered in departure time by 3 game-seconds per unit in the batch. This prevents all units from being routed simultaneously and creates realistic staged response.

**Enroute** — A unit status indicating the unit is actively traveling toward an incident. Enroute units display a bright green AVL label on the map and can be rerouted mid-travel from their current position.

**Escalation** — A call evolves into a more complex incident (e.g., MVA → MVA with Entrapment, Traffic Stop → DUI Arrest), requiring additional units with new capability tags. Escalations only occur if the player owns at least one unit capable of fulfilling all new requirements.

**Incident** — A call or emergency event that spawns in an ESN and requires dispatch response. Incidents have a location, mission type, requirements (capability tags), and a resolution target.

**Mutual Aid** — Inter-agency cooperation modeled by allowing the player to assign a distant station to cover an ESN. No separate mutual aid system is needed; player choice of coverage area naturally represents mutual aid agreements.

**Offload Time** — The duration a unit is unavailable after dropping off a patient or prisoner at a receiving facility. For hospitals, this includes alert time and offload duration. For jails, it includes booking and processing time. Simulates paperwork and transfer of care/custody.

**On Scene** — A unit status indicating the unit has arrived at the incident location and is actively working the call. Only on-scene units contribute to staffing and call resolution. Displayed as a blue AVL label.

**Response Plan** — A named auto-assignment plan that pulls the closest available unit(s) by ETA for each required capability tag. Functionally similar to box alarms but assignment is based on proximity rather than fixed pre-selected units.

**Returning** — A unit status indicating the unit is traveling back to its home station after call resolution. Displayed as a yellow AVL label. Units show remaining ETA to station in the station list and dispatch modal.

**Seating Layout** — Per-apparatus cab seat map living on `BAM_CONFIG.unitTypes[typeKey].seats`. SEATS ARE THE SINGLE SOURCE OF TRUTH for apparatus capacity, crew requirements, and patient/prisoner transport capacity — the legacy `crewDefaults` block is retired. Each seat is one of three mutually-exclusive types: responder seat (with optional `requiredCert` [HARD cert gate + required-to-roll], `interchangeableCerts[]` [alternate certs that also satisfy the hard gate], `niceToHaveCerts[]` [scoring bonus only], `isDriver:true` label), `isPatientSeat:true` (stretcher; responders cannot occupy; counts toward patient transport capacity), or `isPrisonerSeat:true` (cage/cell; responders cannot occupy; counts toward prisoner transport capacity). The per-unit-type flag `autoFillOptionalSeats` controls whether default-dispatch auto-fill should fill every seat (fire apparatus, `true`) or only the required floor (ambulances, patrol, fly cars, helicopters, `false`). The dispatch gate fires when every seat with `requiredCert` is filled by someone whose certs satisfy it (direct hit, `interchangeableCerts` hit, or the cert hierarchy's `satisfies` chain); optional seats never block dispatch. Assembly timer cap: `BAM_CONFIG.volunteerAssemblyFailGameMin` (default 10 game-min; legacy alias `volunteerAssemblyMaxGameMin`). Drives the Crew-Select Dispatch picker and the Unit Details modal's merged Seating & Crew section. Per-seat assignment is persisted on `person.currentAssignment.seatId`.

**Spawnmode** — The placement rule for incident locations within an ESN:
  - `building` — Spawns on a building centroid (structure fires, gas leaks)
  - `road_major` — Spawns on major road nodes, weighted toward intersections (highway MVAs)
  - `road_any` — Spawns on any driveable road (vehicle fires, traffic stops)
  - `random` — Random point within polygon + OSRM nearest snap (medical emergencies, brush fires)

**Staffing Ratio** — The percentage of incident requirements met by on-scene units. Calculated as (on-scene units fulfilling requirements) / (total requirement groups). Affects resolution speed: poorly staffed calls resolve dramatically slower (nonlinear penalty based on `staffingRatio^2`).

**Station Types** (Phase 4) —
  - **Career:** Fully paid stations. Units respond immediately.
  - **Combination:** Mix of career and volunteer personnel. Variable response delay based on volunteer availability.
  - **Volunteer:** Unpaid stations. Each paged volunteer rolls a personal assembly delay from the station's `volunteerAssembly` window (mean ± spread game minutes); the apparatus rolls once required seats are filled. *(Pre-refactor 5D used OSM-derived home/work locations and OSRM-routed map travel; that model was retired — see history.md.)*

**Transporting** — A unit status (Phase 3+) indicating the unit is en route to a hospital or correctional facility with a patient or prisoner. Units remain unavailable during transport + offload time.

**Tanker Shuttle** — Water supply system (Phase 6). In areas without hydrant coverage, tanker units ferry water from a designated fill site to a structure fire location. Requires tanker and fill site designation by player.

---

## Technical & Infrastructure

**Dispatch Center Call Cap** — See **Call Cap**.

**Game Clock** — Time system stored as `gameSeconds` (integer, seconds since midnight). Starts at 08:00:00 (28,800 seconds). Rolls over at 86,400 seconds and increments `gameDay`. Display format: HH:MM:SS.

**Game Speed** — Multiplier controlling simulation speed: 0 (paused), 1, 2, 5, 10, 30, 60 (×real-time). Pausing (speed = 0) instantly freezes all in-flight unit animations.

**Leaflet.js** — Open-source JavaScript mapping library used to render the interactive map and all map-based elements (markers, polygons, lines).

**localStorage** — Browser-based persistent storage used for save data and settings. Save data keys are prefixed with `bam_save_`, settings stored under `bam_settings`.

**Overpass API** — OpenStreetMap data query tool. The game fetches building locations and road nodes per ESN on first spawn attempt, then caches the data for 1 hour to enable realistic call placement.

**OSM** — OpenStreetMap. Free, crowd-sourced map data used by the game via Leaflet tiles and Overpass API queries.

**Incident Spawning** — The system that creates new calls in eligible ESNs. Governed by: ESN has a DC assigned, that DC is in service, DC's active call count is below its cap. Call location and type determined by spawnmode rules and available unit capabilities.

**Route Line** — The visual dashed line drawn on the map showing a dispatched unit's path from station to incident. Drawn at full opacity. Distinguished from **Return Line** by color and opacity.

**Return Line** — The visual dashed line drawn on the map showing a unit's path from incident back to station after resolution. Drawn at 45% opacity and dashed to distinguish from dispatch route.

---

## Geographic & Administrative

**Harford, PA** — The starting area for By Any Means. Located in Susquehanna County.

**Susquehanna County, PA** — The initial geographic scope of the game, centered on rural Pennsylvania emergency services.

**Wyoming County, PA** — Planned expansion area (Phase 3+).

**Lackawanna County, PA** — Planned expansion area (Phase 3+).

**US Map (Long-term)** — Stretch goal to eventually expand to full playable United States via streaming OpenStreetMap tiles.

---

## UI & UX

**AVL Label** — The text label displayed above a unit dot on the map showing the unit's callsign and status-based background color (green = enroute, blue = on scene, yellow = returning).

**Capability Tags Display** — How a mission's requirements are shown to the player (e.g., `[engine] [tanker]` or `[paramedic]`).

**Operations Modal** — A tabbed interface (Phase 3+) containing Stations, Facilities, and Operations sub-tabs. Provides search and management for all player-placed entities without leaving the map view.

**Transport Queue** — A sidebar control (Phase 3+) showing the count of pending patient/prisoner transports. Clicking opens a modal listing all pending transports with options to assign units or dismiss.

---

*Last updated: 2026-05-12*
