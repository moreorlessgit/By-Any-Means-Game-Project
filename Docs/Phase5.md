# Phase 5 — Personnel, Volunteer System, Certifications, Unit List & Details Windows

## Design Intent

Phase 5 introduces individual named personnel, certifications, crew composition rules, and the volunteer response system. **Phase 5 is the substrate for a post-Phase 5 call resolution overhaul** — it's not the destination. Crew-cert composition (e.g. "Engine 5: 1 D/O, 2 FF1, 1 FF1/EMT") will drive call resolution speed, escalation, and incident effectiveness once the personnel layer is in place. The player wants the foundation built first so the resolution rewrite can be designed against real data.

**Playtest cadence:** The player will not playtest Phase 5 mid-phase. The full system ships as a complete whole before evaluation begins. Sub-phases (5A–5E) are engineering chunks for sequencing and stopping points, **not delivery milestones**.

---

## Sub-Phase Breakdown

| Sub-phase | Scope | Notes |
|---|---|---|
| **5A** | Unit List window/modal + Unit Details window/modal + dispatch center unit prefixes | Pure UI work; can ship early with placeholder data since no mid-phase playtest |
| **5B** | Career personnel + certification taxonomy + crew slot rules + min/ideal crew dispatch gating | Establishes the personnel data model and cert/cap gating before dispatch |
| **5C** | Training system + career shifts + ranks + cashflow integration (salaries, training costs) | Economic side of personnel |
| **5D** | Volunteer system: home/work via OSM (with DB cache), direct-to-scene response, PPE rules, availability/schedules, auto-migration on ESN edits | Heaviest sub-phase; depends on `osm_building_cache` table and ESN-edit invalidation per docs/data-lifecycle.md |
| **5E** | Stats tracking, career history, NIMS/ICS officer ratios, Database Health panel additions for personnel cleanup, polish | Closes out the phase with quality-of-life and admin tools |

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
- **Volunteer staffing:** Volunteers respond from their current map location before staffing apparatus or responding directly to scene.

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

### Routing & Locations
- **Volunteer routing:** Volunteers are treated like units for routing purposes and may travel from home (random, defined by ESN, OSM `building:house` tag, stored in database), work (random, OSM `building:commercial`/`industrial`/`retail` tags, defined by ESN, stored in database), station, scene, or custom player-set locations.
- **Volunteer locations:** Volunteer home/work locations are randomized by default within ESNs covered by their assigned station, using OSM data to fix locations to building. Home/work locations are stored for personnel so there is continuity. Players may manually view/change/set exact locations.
- **OSM building cache:** Per docs/data-lifecycle.md, OSM building candidates are cached per-ESN in the database with a 30-day TTL and on-demand rebuild. Player gets a "Rebuild building cache" button in the ESN edit modal and in the Database Health panel.

### Direct-to-Scene
- **Direct-to-scene response:** Volunteers do not always have to report to station first. Chiefs, EMS, fire police, LEOs, or nearby responders may respond directly to scene depending on policy and call type. Ambulances may respond to the scene driver only and pick up an EMT on the scene or another driver to complete a crew.

### Availability
- **Volunteer availability:** Volunteer availability uses both random chance and optional player-defined schedules.

### Visualization
- You can watch volunteers respond to the station.
- **Volunteer visibility:** When watching volunteers respond, the player sees individual names/icons on the map.
- **Volunteer privacy/visual clutter:** Individual volunteer map icons toggleable in the map layers like ESNs and station names.

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

- **Volunteer home/work generation:** Allow fallback random points if no valid buildings exist inside an ESN.
- **Volunteer home/work continuity:** Homes stay put under normal play. **On ESN edits, if a volunteer's home now falls outside their home station's coverage area, they auto-regenerate to a new valid building inside the new coverage.** Exceptions that never auto-migrate: (1) player-customized responders (any field manually edited by the player), and (2) super responders. Auto-migrated personnel should be flagged in some way so the player can see who moved and why.
- **Work locations:** Some volunteers work outside the station's covered ESN and have poor daytime availability.
- **Direct-to-scene logic:** Direct-to-scene volunteers count toward call manpower immediately in circumstances where they would realistically be able to contribute prior to apparatus arriving on the scene — e.g. in patient care, scene size-ups, etc.
- **Direct-to-scene fire personnel:** Firefighters who arrive POV are allowed to perform interior/fireground tasks if two criteria are met: (1) actual fire apparatus is on scene, and (2) the personnel in question carry their PPE/Gear in their POVs (random, toggleable by player).
- **PPE/equipment issue:** "If a firefighter goes direct to scene from home/work, do they have turnout gear with them, or do they need to respond to station for gear first?" — A mix depending on the volunteer in question. Editable by player.
- **Ambulance driver-only response:** Ambulances are allowed to respond with only a driver by default, depending on a player/station policy toggle. The default is that ambulances will respond driver-only and meet an EMT on scene to complete the crew if needed. But that should not be the default overall behavior.
- **Ambulance crew completion:** Crews can only be completed either at the station (default behavior) or on the scene.
- **Ambulance transport rule:** An ambulance is allowed to arrive driver-only but is unable to transport until a valid EMS crew is assembled.
- **Chiefs as units:** Chief units will be assigned to people in cases of volunteers, but paid stations can have "Battalion Chief" units. Example: "Chief 5" as a command vehicle versus "Fire Officer 2 Certification".
- **Chief tag:** Chief tag on incidents that are more complex.
- **Chief staffing flexibility:** If the chief responds to station to drive an engine, does the incident lose chief/command capability unless another chief responds? — Yes, although if that chief is running the pump of a truck for example, they can multitask, but with reduced efficiency.
- **Volunteer visibility:** When watching volunteers respond, the player sees individual names/icons on the map.
- **Volunteer privacy/visual clutter:** Individual volunteer map icons toggleable in the map layers like ESNs and station names.
- **Super responder status:** Purely for player customization purposes and only enablable by the player.
- **Super responder limits:** Super responders are still subject to availability, but only as assigned by players. Basically it locks this person into whatever the player customizes them to be.
- **Stat tracking:** Calls responded, fire calls, EMS calls, transports, saves, missed calls, training completed, driving time, command incidents, awards — all sound cool. There should be a player option to reset stats (e.g. for testing) with verification in place so it can't be done accidentally.
- **Personnel history:** Each person has a career log showing major incidents, certifications earned, promotions, commendations, injuries, and days of service.
- **Player customization:** Player can fully edit certs, home/work location, reliability, name, rank, and status for sandbox purposes. Certs are still locked behind money in normal play.
- **Ideal crew timer:** "Wait 10 minutes for ideal crew" is a global setting for a player, editable on a station/unit/call type level that diverts from the global setting. Needs a button to restore to default.
- **Failed staffing:** If a unit waits too long and fails to crew, CAD should not automatically recommend the next-due unit, but there should be some type of notification.
- **Partial crew response:** Unit should leave automatically after the ideal wait timer at minimum staffing, and the player should be notified.
- **Fire/EMS priority:** By default, fire priority applies at all times (responders should also have their own preferences). Editable at the station level.
- **Career shifts:** Career staffing is based on fixed shift templates like 24/48, 48/96, weekday daytime, and custom schedules.
- **Combination stations:** Paid staff can be assigned to specific units, such as one paid ambulance crew and volunteer fire apparatus. Combination stations may randomly assign if a player does not specify.
- **OSM dependency:** OSM-derived home/work generation is cached in the database to avoid repeated external lookups. See docs/data-lifecycle.md for the cache rules and lifecycle.

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
