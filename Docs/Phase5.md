## Phase 5 — Personnel, Volunteer System, Certifications, Unit List Window, Unit Details Window.
- **Unit List Window/Modal** — In Operations Modal, after the stations tab. Lists units and are sortable by station. have all sorts of details. Ask questions to verify intent.
- **Groundwork For Phase 4 — Unit Details Window/Modal** — Can click into it from units on the map or anywhere else a unit is referenced in a window. Shows a bunch of unit info, can rename from here too. General data like ETAs for all phases, PTs loaded, Suspects loaded, etc. Filters for type, capabilities, stations, dispatch centers associated. Ask Questions to verify intent.
- Units that fall under a certain dispatch center get a unit prefix that is set in the dispatch center. For example in the Susquehanna county 911 dispatch center, a field for Unit Prefixes, if a player enters [SUSQ] then all units that are associated with that dispatch center (IE, stations within ESNs associated with that dispatch center) automatically get the prefix.
- Station staffing types: Each station can be configured as Career, Combination, or Volunteer.
- Combination stations: Career and volunteer personnel can work side by side at the same station. Station type can be changed by the player at any time.
- Career staffing: Career personnel work assigned shifts and are immediately available while on duty.
- Volunteer staffing: Volunteers respond from their current map location before staffing apparatus or responding directly to scene.
- Volunteer routing: Volunteers are treated like units for routing purposes and may travel from home (Random, defined by ESN, OSM building:house tag, stored in database), work (Random, OSM building:commercial/industrial/retail tags, Defined by ESN, stored in database), station, scene, or custom player-set locations.
- Volunteer locations: Volunteer home/work locations are randomized by default within ESNs covered by their assigned station, using OSM data to fix locations to building. Home/Work locations are stored for personnel so there is continuity. Players may manually view/change/set exact locations.
- Direct-to-scene response: Volunteers do not always have to report to station first. Chiefs, EMS, fire police, LEOs, or nearby responders may respond directly to scene depending on policy and call type. Ambulances may respond to the scene driver only and pick up an EMT on the scene or another driver to complete a crew.
- Volunteer availability: Volunteer availability uses both random chance and optional player-defined schedules.
- Busy personnel: Personnel already assigned to a call are unavailable for new calls unless released as surplus personnel.
- Surplus personnel: If too many personnel are on one incident, some may be released or reassigned to another call in the future.
- Personnel system: Individual named responders assigned to stations/ESNs. Players can rename personnel. Stat tracking for individuals may be a cool feature.
- Personnel preferences: Personnel may have a preferred service, such as fire or EMS, while still being able to work both if certified. (changeable by player)
- Personnel pool: By default, personnel are pooled by station and automatically assigned to units as needed.
- Apparatus assignments: Players may optionally assign preferred personnel to specific apparatus.
- Cross-staffing: Personnel can staff fire and EMS units at the same station if certified.
- Certifications: Personnel can hold certifications such as FF1, FF2, Small Vehicle EVOC, Large Vehicle EVOC, EMT, AEMT, Paramedic, LEO, Fire Officer, HazMat, Rescue Tech, etc.
- EMS cert style: EMS certifications use an NREMT-style ladder: EMR, EMT, AEMT, Paramedic.
- Driver certifications: Driver/operator certification should be split into Small Vehicle EVOC and Large Vehicle EVOC.
- Small Vehicle EVOC: Required for ambulances, chief cars, fly cars, police cars, utility vehicles, and small brush units.
- Large Vehicle EVOC: Required for engines, tankers, ladders, heavy rescues, and large apparatus.
- Aerial operators: Ladder/tower units may require Large Vehicle EVOC plus a future Aerial Operator certification.
- Certification equivalencies: Some higher certifications satisfy lower requirements. Example: Paramedic satisfies EMT, FF2 satisfies FF1, Large Vehicle EVOC satisfies Small Vehicle EVOC.
- Crew slot rule: One person cannot fill multiple crew positions at once, even if they hold multiple certifications.
- Unit staffing requirements: Apparatus require minimum and ideal crew counts, plus required certifications.
- Minimum crew: Player can configure apparatus to respond once minimum crew is met.
- Ideal crew: Default behavior is to wait for ideal crew before responding, with a global player adjustable policy (IE, wait 10 minutes for ideal crew before responding even with extra personnel enroute.)
- Staffing policy: Units/stations can have configurable response policies such as wait for ideal, respond at minimum, wait then respond, or manual release.
- Driver/operator role: Fire apparatus drivers are dedicated to the apparatus they responded with. They count as crew but have limited fireground task availability.
- EMS driver role: EMS drivers may also count as patient care providers if properly certified.
- Fire priority: For mixed fire/EMS volunteer stations, fire apparatus generally take staffing priority on fire-related incidents.
- EMS priority: EMS units take priority on EMS-only or EMS-critical incidents.
- Mutual aid reliance: If a station cannot staff EMS because personnel are committed to fire response, EMS mutual aid may be needed. (already simulated in game)
- Call resolution effects: Number of personnel on scene affects call resolution timers, escalation chance, and incident effectiveness.
- Understaffed response: Units may respond understaffed if allowed, but call resolution may be slower.
- Training system: Training is per-person and grants certifications immediately after payment.
- Batch training: Players can select multiple personnel and train them together.
- Training costs: Certification costs are defined in config.js.
- Training prerequisites: Certifications can require previous certifications. Example: FF2 requires FF1, AEMT requires EMT, Paramedic requires EMT/AEMT, Large Vehicle EVOC requires Small Vehicle EVOC.
- No training timers: Training does not take real-life days or require waiting.
- Career upkeep: Career personnel cost salary upkeep and may have ongoing regular training costs.
- Volunteer recruitment: Future system may include recruitment, retention, active/inactive members, and roster reliability. (player adjustable at a station level, some indvidual personnel along the lines of full customizability can be granted "super responder" status which lets them ignore reliability/inactivity/etc)
- Station reliability: Future station readiness rating may track staffing reliability, response reliability, certification readiness, apparatus readiness, and water supply readiness.
- Water supply hook: Future water supply system can use tanker availability, hydrant coverage, draft sites, fill sites, and qualified drivers.
- Station window summary: Station UI should include a personnel summary showing career staff, volunteers, on-duty personnel, available personnel, busy personnel, certification counts, and current staffing capability.
- Apparatus staffing preview: Apparatus UI should show whether each unit can staff minimum or ideal crew and estimated time to respond.
- Future dispatch system: Separate future phase for dispatch center staffing, dispatcher certifications, CAD workload, call-taking, EMD, radio traffic, and dispatch delays.
- You can watch vollies respond to the station
- Vollie chiefs function like units for calls that need a "chief" unit, have a "Chief" Tag. Also can respond to the station to crew apparatus if needed.
- NIMS/ICS like system would be nice where you have to have a balance of officers to responders. Plays into certifications.

### Clarifying Questions and Answers

- Volunteer home/work generation: allow fallback random points if no valid buildings exist inside an ESN
- Volunteer home/work continuity: they can occasionally move, but any personnel edited by players should be assumed to stay the same unless adjusted by player. 
- Work locations: Some volunteers work outside the stations's covered ESN and have poor daytime availability.
- Direct-to-scene logic: Direct-to-scene volunteers count toward call manpower immediately in circumstances where they would realistically be able to contribute prior to apparatus arriving on the scene. IE - In patient care, scene size ups, etc.
- Direct-to-scene fire personnel: Firefighters who arrive POV be allowed to perform interior/fireground tasks if two criteria are met - 1. Actual fire apparatus is on scene and 2. The personnel in question carry their PPE/Gear in their POVs. (random, toggleable by player)
- PPE/equipment issue: "If a firefighter goes direct to scene from home/work, do they have turnout gear with them, or do they need to respond to station for gear first?" Answer - It should be a mix depending on the volunteer in question. Editable by player.
- Ambulance driver-only response: Ambulances are allowed to respond with only a driver by default, depending on a player/station policy toggle. The default is that ambulances will respond driver only and meet an EMT on scene to complete crew if needed. But that should not be the default overall behavior.
- Ambulance crew completion: Crews can only be completed either at the station (default behavior) or on the scene.
- Ambulance transport rule: An ambulance is allowed to arrive driver-only but is unable to transport until a valid EMS crew is assembled.
- Chiefs as units: Chief units will be assigned to people in cases of volunteers, but paid stations can have "Battalion Chief" units. Example: “Chief 5” as a command vehicle versus “Fire Office 2 Certification”
- Chief tag: Chief tag on incidents that are more complex.
- Chief staffing flexibility: If the chief responds to station to drive an engine, does the incident lose chief/command capability unless another chief responds? Answer: Yes, although if that chief is running the pump of a truck for example, they can multitask, but with reduced efficiency.
- Volunteer visibility: When watching vollies respond, the player sees individual names/icons on the map.
- Volunteer privacy/visual clutter: Individual volunteer map icons be optional toggleable in the map layers like ESNs and station names.
- Super responder status: This is purely for player customization purposes and only enablable by the player.
- Super responder limits: Super Responders are still subject to availability, but only as assigned by players. Basically it locks this person into whatever the player customizes them to be.
- Stat tracking: What stats matter most: calls responded, fire calls, EMS calls, transports, saves, missed calls, training completed, driving time, command incidents, or awards? Answer: Honestly all sound cool. There should be a player option to reset stats (in the case of testing) with verification in place so it can't be accidentally done.
- Personnel history: Should each person have a career log showing major incidents, certifications earned, promotions, commendations, injuries, and days of service? Answer: Yes.
- Player customization: Should the player be able to fully edit certs, home/work location, reliability, name, rank, and status for sandbox purposes? Answer: Yes, though certs should still be locked behind money.
- Ideal crew timer: Should “wait 10 minutes for ideal crew” be global only, or configurable by station/unit/call type? Answer: Global setting for a player, editable on a station/unit/call type level that diverts from thje global setting. Needs a button to restore to default.
- Failed staffing: If a unit waits too long and fails to crew, should CAD automatically recommend the next-due unit? Answer: No, but there should be some type of notification.
- Partial crew response: Should the unit leave at minimum automatically after the ideal wait timer, or should the player be prompted? Answer: Unit should leave automatically and player should be notified somehow.
- Fire/EMS priority: Should fire priority apply only to fire calls, or should the player define station-level priority rules? Answer: By default yes the fire priority should apply at all times (responders should also have their own preferences.) but this should be editable at a station level.
- Career shifts: Should career staffing be based on fixed shift templates like 24/48, 48/96, weekday daytime, and custom schedules? Answer: Yes.
- Combination stations: Can paid staff be assigned to specific units, such as one paid ambulance crew and volunteer fire apparatus? Answer: Yes. Combination stations may randomly assign if a player does not specify.
- OSM dependency: Since this will be hosted, should OSM-derived home/work generation be cached in your database to avoid repeated external lookups? Answer: Yes, it makes sense for a lot of this stuff to be stored in the database, if reasonable.

### Suggested Simplified Game Certification Groups

#### Core Fire Certs

- Fireground Support
- Exterior Firefighter [Additionally counts as Fireground Support]
- Firefighter 1 [Additionally counts as Fireground Support and Exterior Firefighter]
- Firefighter 2 [Additionally counts as Fireground Support, Exterior Firefighter, And Firefighter 1]
- Small Vehicle EVOC [Additionally Counts as Ambulance EVOC]
- Large Vehicle EVOC [Additionally Counts as Small EVOC and Ambulance EVOC. Prereq for PumpOps, Aerial Operator]
- Pump Operator 1
- Pump Operator 2
- Aerial Operator
- Fire Officer 1 [Prereq for any Command role, LTs, CPTs, ETC]
- Fire Officer 2 [Prereq For Chief]
- HazMat Awareness
- HazMat Operations
- HazMat Technician [For Advanced HAZMAT type calls.]
- Basic Vehicle Rescue
- Rescue Technician [For Advanced Rescue type calls]
- Wildland Firefighter [More efficiency on brush fires.]
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

### Proposed Fire / EMS / Police Ranks

#### Fire Ranks

- Probationary Firefighter
- Firefighter
- Senior Firefighter 
- Driver/Operator [Needs Min Large Vehicle EVOC and PumpOps 1]
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

#### EMS Ranks (Tied to certs loosely)

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

#### Police / Law Enforcement Ranks

(Defined based upon selection made in station menu, wouldn't make sense to have them shared at stations. Selections for Local/City Police, County Sheriff, State Police.)

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

- Sheriff’s Deputy
- Senior Deputy
- Sergeant Deputy
- Lieutenant Deputy
- Chief Deputy
- Sheriff

- State Trooper
- Trooper First Class
- Trooper Corporal
- Trooper Sergeant
- Trooper Lieutenant
- Trooper Captain
- Major
- Colonel / Superintendent

---