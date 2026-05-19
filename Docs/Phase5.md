# Phase 5 — Personnel, Volunteer System, Certifications, Unit List & Details Windows

## Design Intent

Phase 5 introduces individual named personnel, certifications, crew composition rules, and the volunteer response system. **Phase 5 is the substrate for a post-Phase 5 call resolution overhaul** — it's not the destination. Crew-cert composition (e.g. "Engine 5: 1 D/O, 2 FF1, 1 FF1/EMT") will drive call resolution speed, escalation, and incident effectiveness once the personnel layer is in place. The player wants the foundation built first so the resolution rewrite can be designed against real data.

**Playtest cadence:** The player will not playtest Phase 5 mid-phase. The full system ships as a complete whole before evaluation begins. Sub-phases (5A–5E) are engineering chunks for sequencing and stopping points, **not delivery milestones**.

---

## Sub-Phase Breakdown

| Sub-phase | Scope | Status |
|---|---|---|
| **5A** | Unit List window/modal + Unit Details window/modal + dispatch center unit prefixes | ✅ Complete |
| **5B** | Career personnel + certification taxonomy + crew slot rules + min/ideal crew dispatch gating | ✅ Complete |
| **5C** | Training system + career shifts + ranks + cashflow integration (salaries, training costs) | ✅ Complete |
| **5D** | Volunteer system: home/work via OSM (with DB cache), direct-to-scene response, PPE rules, availability/schedules, auto-migration on ESN edits | ✅ Complete (superseded by post-Phase-5 abstract-assembly refactor — see History) |
| **5E** | Stats tracking, career history, NIMS/ICS officer ratios, Database Health panel, span-of-control banner, on-scene roster, personnel patient-stabilization | ✅ Complete |

**Persistence note:** Per the planning session for the 5C/5D/5E batch, every new Phase 5 entity (personnel fields, station shifts, ESN OSM cache, stats, history) lives in the save JSON blob (`state_json` on `PrivateWorldSave`). The real Prisma tables sketched in `docs/backend-architecture.md` (personnel, certifications, osm_building_cache) remain deferred until Phase 4B forces global-world persistence.

Within sub-phases, sequence is: **data model → business logic → UI hookup**. Don't over-invest in polish or empty-state UX for intermediate sub-phases — the only "real" surface is the post-5E whole.

---

## Multiplayer / Phase 4 Integration

**Personnel records stay private to the owning player.** They live on the owner's account; no other player ever sees individual names, certifications, or career history.

**On shared calls (Phase 4C), only aggregated crew composition is broadcast** — e.g. "Engine 5 with 4 crew: 1 D/O, 2 FF1, 1 FF1/EMT". The numbers tell the receiving player whether the apparatus arriving on their shared call can perform interior attack, ALS, etc. — without leaking the roster.

This decision keeps the personnel schema simpler (no permissions/visibility layer) and matches the project's broader "your worlds, your data" stance.

---

## UI Surfaces

- **Unit List Window/Modal** — In Operations Modal, after the Stations tab. Lists units sortable by station with all the relevant details.
- **Unit Details Window/Modal** — Clickable from units on the map or anywhere else a unit is referenced. Shows unit info, supports rename. General data like ETAs for all phases, PTs loaded, suspects loaded, etc. Filters for type, capabilities, stations, dispatch centers associated.
- **Dispatch center unit prefixes** — Units that fall under a certain dispatch center get a unit prefix that is set in the dispatch center. For example, in the Susquehanna County 911 dispatch center, a "Unit Prefixes" field — if a player enters `[SUSQ]` then all units associated with that dispatch center (i.e. stations within ESNs associated with that dispatch center) automatically get the prefix.
- **Station window summary** — Station UI should include a personnel summary showing career staff, volunteers, on-duty personnel, available personnel, busy personnel, certification counts, and current staffing capability.
- **Apparatus staffing preview** — Apparatus UI should show whether each unit can staff minimum or ideal crew and estimated time to respond.

---

## Station Staffing Types

- Each station can be configured as **Career**, **Combination**, or **Volunteer**.
- **Combination stations:** Career and volunteer personnel can work side by side at the same station. Station type can be changed by the player at any time.
- **Career staffing:** Career personnel work assigned shifts and are immediately available while on duty.
- **Volunteer staffing:** Volunteers respond by rolling a personal assembly delay (per-station mean ± spread game minutes); when the timer elapses they're considered at the station and count toward the crew gate. Direct-to-scene responders skip station assembly entirely. *(Pre-refactor 5D used OSM-routed map travel; that model was retired — see history.md.)*

---

## Personnel System

- Individual named responders assigned to stations/ESNs. Players can rename personnel. Stat tracking for individuals is a desired feature.
- **Personnel preferences:** Personnel may have a preferred service (fire or EMS) while still being able to work both if certified. Changeable by player.
- **Personnel pool:** By default, personnel are pooled by station and automatically assigned to units as needed.
- **Apparatus assignments:** Players may optionally assign preferred personnel to specific apparatus.
- **Cross-staffing:** Personnel can staff fire and EMS units at the same station if certified.
- **Reassignment is a first-class action.** Both apparatus and personnel must have a non-destructive "Reassign to another station" action available outside of any delete flow. This is what makes the force-delete escape hatch in docs/data-lifecycle.md usable — the player has a clean alternative before resorting to destructive options.
- **Busy personnel:** Personnel already assigned to a call are unavailable for new calls unless released as surplus personnel.
- **Surplus personnel:** If too many personnel are on one incident, some may be released or reassigned to another call in the future.

---

## Volunteer System

> **Refactor note (post-Phase-5):** The original 5D shipped with OSM-derived home/work locations, OSRM-routed map travel, and a live responder dot on the map. That model proved fragile (OSRM stalls, marker churn, save bloat) and was replaced with an **abstract assembly** model. Volunteers no longer occupy a physical position on the map; instead, each paged volunteer rolls a personal assembly delay drawn from a per-station window. The sections below describe the current (post-refactor) behavior; the Clarifying Questions section at the bottom retains the original design Q&A as historical context.

### Assembly (replaces OSM Routing)
- **Per-station delay window:** Each volunteer station carries `station.volunteerAssembly = { meanGameMin, spreadGameMin }`. Defaults come from `BAM_CONFIG.volunteerAssemblyMeanGameMin` / `volunteerAssemblySpreadGameMin` (5 min ± 2 min). Player-editable per station in the station modal.
- **Personal roll:** When a volunteer is paged, `rollVolunteerAssemblyDelaySec(person, station)` draws a uniform delay in `[mean-spread, mean+spread]`. Roaming responders multiply by `BAM_CONFIG.volunteerOutOfAreaMultiplier` (default 1.5). `at_station` responders skip the timer entirely.
- **Status flow:** `available → responding` (timer running) → `at_station` (timer elapsed, counted toward the crew gate). The apparatus rolls when every required seat has someone in `at_station`.
- **Failed assembly:** At the cap (`volunteerAssemblyFailGameMin`, default 10 game-min), the assembly resolves: required-met rolls with whoever's there; required-short aborts. Late arrivals after a successful rollout are tracked as `leftBehind` and linger at the station once their personal timer elapses.
- **Post-failure linger:** All responders linger at the station for `volunteerFailedAssemblyLingerGameMin` (default 30 game-min) before the hourly availability roll resumes, so they don't immediately get re-paged.

### OSM Cache (Retained but Dormant)
- The per-ESN OSM building cache (`esn.osmBuildingCache`) is still maintained and still ships in the save blob — but **no live system consumes it**. It's kept so future call-generation features (structure fires that spawn at a real commercial building, MVAs on a known intersection) can plug in cheaply. See docs/data-lifecycle.md §3.
- The "Rebuild Building Cache" button remains in the ESN modal and Database Health panel.
- Cache TTL stays at 30 real-life days; cooldown still 30 seconds per ESN.

### Direct-to-Scene
- **Cert-based gate, no location:** `evaluateDirectToSceneEligibility(person, incident)` now decides direct-to-scene purely from certs + incident type. There's no physical distance check anymore — the abstract model assumes "near enough to plausibly self-respond."
- **Eligible roles:** Chiefs (Fire Officer 1+), fire police, LEOs, EMS-certified responders, plus FF1+ holders with `hasPpeInVehicle:true` for fire calls. Ambulance driver-only response is still policy-gated per station.

### Availability
- **Hourly state roll:** `recomputeVolunteerAvailabilityHour()` re-rolls each idle volunteer's `availability.currentState` every game-hour. Outcomes (weights from config):
  - `home` (`volunteerAvailableHomeChance`, default 0.70) — paged with normal delay.
  - `roaming` (`volunteerAvailableRoamingChance`, default 0.05) — paged with `volunteerOutOfAreaMultiplier` delay.
  - `at_station` (`volunteerAtStationHourlyChance`, default 0.02) — rare; zero assembly delay if paged this hour.
  - `unavailable` — remainder; not pageable.
- **Schedules:** Optional per-volunteer `availability.schedule[]` windows force `unavailable` outside any configured window. Super-responders and `forceAvailableUntil` overrides bypass the schedule.
- **Pure read:** `isVolunteerAvailableNow(person)` is now side-effect-free — every UI surface reads the same value between hour ticks.

### Visualization
- **No volunteer map markers.** The "Volunteer Responders" / "Volunteer Homes" / "Volunteer Works" layer toggles were removed along with the marker pools. Volunteer status is surfaced numerically in the station window, Personnel tab, and Crew-Select picker (`station` / `home` / `roaming` chips with the assembly ETA in minutes).
- Legacy `setVolunteerLayerVisible`, `refreshVolunteerLocationMarkers`, and the map-click home-pick flow remain as no-op stubs so external callers don't throw; new code should not call them.

### Chief Roles
- **Volunteer chiefs** function like units for calls that need a "chief" unit — have a "Chief" tag. They can also respond to the station to crew apparatus if needed.
- **NIMS/ICS-like balance** — having to maintain a balance of officers to responders would play into certifications.

---

## Certifications

### Rules
- Personnel can hold certifications such as FF1, FF2, Small Vehicle EVOC, Large Vehicle EVOC, EMT, AEMT, Paramedic, LEO, Fire Officer, HazMat, Rescue Tech, etc.
- **EMS cert style:** EMS certifications use an NREMT-style ladder: EMR, EMT, AEMT, Paramedic.
- **Driver certifications:** Driver/operator certification is split into Small Vehicle EVOC and Large Vehicle EVOC.
  - **Small Vehicle EVOC:** Required for ambulances, chief cars, fly cars, police cars, utility vehicles, and small brush units.
  - **Large Vehicle EVOC:** Required for engines, tankers, ladders, heavy rescues, and large apparatus.
- **Aerial operators:** Ladder/tower units may require Large Vehicle EVOC plus a future Aerial Operator certification.
- **Certification equivalencies:** Some higher certifications satisfy lower requirements. Examples: Paramedic satisfies EMT, FF2 satisfies FF1, Large Vehicle EVOC satisfies Small Vehicle EVOC.

### Suggested Simplified Game Certification Groups

#### Core Fire Certs
- Fireground Support
- Exterior Firefighter [Additionally counts as Fireground Support]
- Firefighter 1 [Additionally counts as Fireground Support and Exterior Firefighter]
- Firefighter 2 [Additionally counts as Fireground Support, Exterior Firefighter, and Firefighter 1]
- Small Vehicle EVOC [Additionally counts as Ambulance EVOC]
- Large Vehicle EVOC [Additionally counts as Small EVOC and Ambulance EVOC. Prereq for Pump Ops, Aerial Operator]
- Pump Operator 1
- Pump Operator 2
- Aerial Operator
- Fire Officer 1 [Prereq for any Command role — LTs, CPTs, etc.]
- Fire Officer 2 [Prereq for Chief]
- HazMat Awareness
- HazMat Operations
- HazMat Technician [For advanced HazMat call types]
- Basic Vehicle Rescue
- Rescue Technician [For advanced Rescue call types]
- Wildland Firefighter [More efficiency on brush fires]
- Fire Police
- Drone Operator

#### Core EMS Certs
- EMR
- EMT
- AEMT
- Paramedic
- Critical Care Paramedic
- Prehospital Registered Nurse
- Ambulance EVOC
- EMS Supervisor
- Tactical EMS

#### Core Police Certs
- Patrol Officer
- Patrol Supervisor
- Field Training Officer
- Crash Investigation
- K9
- SWAT
- Detective
- Crisis Negotiator
- Bomb Squad

#### Shared Certs
- Drone Operator
- BLS/First Aid

---

## Crew Composition & Dispatch Rules

- **Crew slot rule:** One person cannot fill multiple crew positions at once, even if they hold multiple certifications.
- **Unit staffing requirements:** Apparatus require minimum and ideal crew counts, plus required certifications.
- **Minimum crew:** Player can configure apparatus to respond once minimum crew is met.
- **Ideal crew:** Default behavior is to wait for ideal crew before responding, with a global player-adjustable policy (e.g. wait 10 minutes for ideal crew before responding even with extra personnel enroute).
- **Staffing policy:** Units/stations can have configurable response policies such as wait for ideal, respond at minimum, wait then respond, or manual release.
- **Driver/operator role:** Fire apparatus drivers are dedicated to the apparatus they responded with. They count as crew but have limited fireground task availability.
- **EMS driver role:** EMS drivers may also count as patient care providers if properly certified.
- **Fire priority:** For mixed fire/EMS volunteer stations, fire apparatus generally take staffing priority on fire-related incidents.
- **EMS priority:** EMS units take priority on EMS-only or EMS-critical incidents.
- **Mutual aid reliance:** If a station cannot staff EMS because personnel are committed to fire response, EMS mutual aid may be needed (already simulated in game).
- **Call resolution effects:** Number of personnel on scene affects call resolution timers, escalation chance, and incident effectiveness. **This is the seam where the post-Phase 5 call resolution overhaul will plug in.**
- **Understaffed response:** Units may respond understaffed if allowed, but call resolution may be slower.

---

## Training System

- **Training is per-person** and grants certifications immediately after payment.
- **Batch training:** Players can select multiple personnel and train them together.
- **Training costs:** Certification costs are defined in `config.js`.
- **Training prerequisites:** Certifications can require previous certifications. Examples: FF2 requires FF1, AEMT requires EMT, Paramedic requires EMT/AEMT, Large Vehicle EVOC requires Small Vehicle EVOC.
- **No training timers:** Training does not take real-life days or require waiting.

---

## Economic Effects

- **Career upkeep:** Career personnel cost salary upkeep and may have ongoing regular training costs.
- Cashflow modal needs new line items for salaries and training expenses (5C).

---

## Proposed Fire / EMS / Police Ranks

### Fire Ranks
- Probationary Firefighter
- Firefighter
- Senior Firefighter
- Driver/Operator [Needs Min Large Vehicle EVOC and Pump Ops 1]
- Lieutenant [Needs Min Fire Officer 1]
- Captain [Needs Min Fire Officer 1]
- Battalion Chief [Needs Min Fire Officer 2]
- Deputy Chief
- Assistant Chief
- Department Chief [Highest]
- Fire Marshal
- Fire Inspector
- Training Officer
- Safety Officer

### EMS Ranks (Tied to certs loosely)
- Probationary EMS Member
- EMS Driver
- EMR
- EMT
- Advanced EMT
- Paramedic
- Senior EMT
- Senior Paramedic
- Field Training Officer
- EMS Lieutenant
- EMS Captain
- EMS Supervisor
- EMS Duty Officer
- EMS Chief
- Medical Director

### Police / Law Enforcement Ranks
*(Defined based on the agency type selected in the station menu. Selections for Local/City Police, County Sheriff, State Police — wouldn't make sense to have shared ranks at stations.)*

**Local/City Police:**
- Police Recruit
- Police Officer
- Senior Police Officer
- Corporal
- Sergeant
- Lieutenant
- Captain
- Deputy Chief
- Assistant Chief
- Police Chief

**County Sheriff:**
- Sheriff's Deputy
- Senior Deputy
- Sergeant Deputy
- Lieutenant Deputy
- Chief Deputy
- Sheriff

**State Police:**
- State Trooper
- Trooper First Class
- Trooper Corporal
- Trooper Sergeant
- Trooper Lieutenant
- Trooper Captain
- Major
- Colonel / Superintendent

---

## Clarifying Questions and Answers

> The bullets below were the original 5D design Q&A. Items struck through were superseded by the abstract-assembly refactor; they're retained here so the design history reads cleanly. Items without a strike-through are still live.

- ~~**Volunteer home/work generation:** Allow fallback random points if no valid buildings exist inside an ESN.~~ *(Superseded — no home/work locations.)*
- ~~**Volunteer home/work continuity:** Homes stay put under normal play. On ESN edits, if a volunteer's home now falls outside their home station's coverage area, they auto-regenerate to a new valid building inside the new coverage.~~ *(Superseded — no homes, no ESN-edit migration. `autoMigrateVolunteersForESN` is a no-op stub.)*
- ~~**Work locations:** Some volunteers work outside the station's covered ESN and have poor daytime availability.~~ *(Superseded by the `roaming` availability state + out-of-area multiplier.)*
- **Direct-to-scene logic:** Direct-to-scene volunteers count toward call manpower immediately in circumstances where they would realistically be able to contribute prior to apparatus arriving on the scene — e.g. in patient care, scene size-ups, etc.
- **Direct-to-scene fire personnel:** Firefighters who arrive POV are allowed to perform interior/fireground tasks if two criteria are met: (1) actual fire apparatus is on scene, and (2) the personnel in question carry their PPE/Gear in their POVs (random, toggleable by player).
- **PPE/equipment issue:** "If a firefighter goes direct to scene from home/work, do they have turnout gear with them, or do they need to respond to station for gear first?" — A mix depending on the volunteer in question. Editable by player.
- **Ambulance driver-only response:** Ambulances are allowed to respond with only a driver by default, depending on a player/station policy toggle. The default is that ambulances will respond driver-only and meet an EMT on scene to complete the crew if needed. But that should not be the default overall behavior.
- **Ambulance crew completion:** Crews can only be completed either at the station (default behavior) or on the scene.
- **Ambulance transport rule:** An ambulance is allowed to arrive driver-only but is unable to transport until a valid EMS crew is assembled.
- **Chiefs as units:** Chief units will be assigned to people in cases of volunteers, but paid stations can have "Battalion Chief" units. Example: "Chief 5" as a command vehicle versus "Fire Officer 2 Certification".
- **Chief tag:** Chief tag on incidents that are more complex.
- **Chief staffing flexibility:** If the chief responds to station to drive an engine, does the incident lose chief/command capability unless another chief responds? — Yes, although if that chief is running the pump of a truck for example, they can multitask, but with reduced efficiency.
- ~~**Volunteer visibility:** When watching volunteers respond, the player sees individual names/icons on the map.~~ *(Superseded — visualization moved to numeric chips in the station/personnel/crew-select panels.)*
- ~~**Volunteer privacy/visual clutter:** Individual volunteer map icons toggleable in the map layers like ESNs and station names.~~ *(Superseded — no map layer to toggle.)*
- **Super responder status:** Purely for player customization purposes and only enablable by the player.
- **Super responder limits:** Super responders are still subject to availability, but only as assigned by players. Basically it locks this person into whatever the player customizes them to be.
- **Stat tracking:** Calls responded, fire calls, EMS calls, transports, saves, missed calls, training completed, driving time, command incidents, awards — all sound cool. There should be a player option to reset stats (e.g. for testing) with verification in place so it can't be done accidentally.
- **Personnel history:** Each person has a career log showing major incidents, certifications earned, promotions, commendations, injuries, and days of service.
- **Player customization:** Player can fully edit certs, reliability, name, rank, status, and (volunteer) per-station assembly delay window. Certs are still locked behind money in normal play. *(Home/work location fields were retired in the refactor.)*
- **Ideal crew timer:** "Wait 10 minutes for ideal crew" is a global setting for a player, editable on a station/unit/call type level that diverts from the global setting. Needs a button to restore to default.
- **Failed staffing:** If a unit waits too long and fails to crew, CAD should not automatically recommend the next-due unit, but there should be some type of notification.
- **Partial crew response:** Unit should leave automatically after the ideal wait timer at minimum staffing, and the player should be notified.
- **Fire/EMS priority:** By default, fire priority applies at all times (responders should also have their own preferences). Editable at the station level.
- **Career shifts:** Career staffing is based on fixed shift templates like 24/48, 48/96, weekday daytime, and custom schedules.
- **Combination stations:** Paid staff can be assigned to specific units, such as one paid ambulance crew and volunteer fire apparatus. Combination stations may randomly assign if a player does not specify.
- ~~**OSM dependency:** OSM-derived home/work generation is cached in the database to avoid repeated external lookups.~~ *(Superseded — no live consumer of the cache. The cache is retained for future POI-driven call-generation features; see docs/data-lifecycle.md §3.)*

---

## Future Hooks (Not Phase 5)

These are noted here for design continuity but are explicitly out of scope for Phase 5:

- **Volunteer recruitment:** Future system may include recruitment, retention, active/inactive members, and roster reliability (player-adjustable at a station level; some individual personnel can be granted "super responder" status which lets them ignore reliability/inactivity/etc.).
- **Station reliability:** Future station readiness rating may track staffing reliability, response reliability, certification readiness, apparatus readiness, and water supply readiness.
- **Water supply hook:** Future water supply system (Phase 7) can use tanker availability, hydrant coverage, draft sites, fill sites, and qualified drivers.
- **Dispatch center staffing:** Separate future phase for dispatch center staffing, dispatcher certifications, CAD workload, call-taking, EMD, radio traffic, and dispatch delays.
- **Call resolution overhaul:** The big post-Phase 5 effort that consumes the personnel/cert system as input.

---

## Related Docs

- **docs/data-lifecycle.md** — Cleanup, caching, retention, cascade rules. OSM building cache and personnel cleanup live here.
- **docs/backend-architecture.md** — DB schema, API contract, Socket.IO events. Planned Phase 5 tables noted there.
- **docs/roadmap.md** — Where Phase 5 sits in the overall plan.
- **docs/architecture.md** — Pull when touching specific systems (dispatch, animation, saves, etc.).
