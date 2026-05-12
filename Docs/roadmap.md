# Planned Systems — Phase Roadmap

Phases are a guide, not a strict sequence. Player input determines priority.

---

## ONGOING PROJECTS

### Housekeeping

GENERAL HOUSEKEEPING, cleaning up the index.html file. Check for anything that can help trim down this file. I am open to splitting things out into extra .js/css files that you suggest to keep some features more contained and easier for you to search and edit in the future. Should still allow modularity. Primary goal is reducing token usage overall.

General Realism - Medical Emergency type calls should only have one PT typically. (I can fix this myself, claude ignore this one.)

## Phase 3.25 (Next) — General Bugfixes and Phases 1-3 Working as Intended

### Bugs ✅ (All resolved in Phase 3.25 bugfix batch)

~~Bug - Suspect Transfer unit assignment from holding cells now works. However the assigned unit does not go to the police station where the suspect is to pick up the suspect before beginning their transport to the jail. And the ETAs are messed up.~~

~~Bug - Operations Modal - Facilities Tab - Facilities tab does not list facilities like the station tab does, and does not have a search bar.~~

### UI

~~UI - Left Sidebar - Operations Modal - ESNs show up under dispatch centers tab not the ESN zones tab like they should.~~

~~UI - Edit ESN Zone Modal - No search bar in dropdown for the dispatch center assignment. Along this same fix, change from checkboxes to searchable dropdowns for Fire/EMS/Law Coverage so format remains uniform and it is easier on the player to define coverage for an ESN.~~

~~UI - Add another settings tab where you can define colors to units based on type. This saves and is used in the dispatch list where it highlights behind only the Unit Type Name. For players to easily pick out types of units. Suggestions on alternate methods acceptable. Examples - "Patrol Unit" "Supervisor" "Brush Truck"~~

~~UI Feature - Incident List right sidebar - Calls in transport pending should have some sort of temporary flash to them to make them easily visible.~~

~~UI - Transport PT to hospital ETA should be shown on transport tab when picking hospitals, to make informed decisions on closest hospital.~~

~~UI - Hospital Modal Glitched and lost its tabs at the top. Order for tabs on the top should be offloading units to the left most, purchases to the right most.~~

---

## Phase 4 - "Noli Timere Messorem" - Oh god. Oh Fuck. Backend build, database build, auth build, frontend changes.


---

## Phase 4.5 (Framework For Phase 5) — Framework for Volunteer System, Certifications, and Personnel

- **Unit List Window/Modal** — In Operations Modal, after the stations tab.
- **Groundwork For Phase 4 — Unit Details Window/Modal** — Can click into it from units on the map or anywhere else a unit is referenced in a window. Shows a bunch of unit info, can rename from here too. General data like ETAs for all phases, PTs loaded, Suspects loaded, etc. Ask Questions to verify intent.

---

## Phase 5 (After Framework) — Volunteer System, Certifications, and Personnel

- **Station staffing types:** Each station configured as Career (fully paid), Combination, or Volunteer
- **Volunteer response delay:** Volunteers must respond to the station before the apparatus can respond. Delay calculated from volunteer's home/work location within the ESN. Adds realistic rural response time lag.
- **Personnel system:** Individual named responders at each station. Can be renamed by player. Tracks certifications (FF1, FF2, Driver/Operator, EMT, AEMT, Paramedic, LEO, etc.)
- **Volunteer roster:** Volunteers assigned to ESNs, not just stations. They respond from within the ESN.
- **Certification requirements:** Units require minimum certified personnel to respond (e.g. ALS ambulance needs at least one Paramedic)
- **Training system:** Player can train personnel to gain new certifications. Training is money-gated only — the player pays a cost and the certification is granted immediately. No waiting. Costs defined in config.js.

---

## Phase 6 — CAD-Style Call List Overhaul

- Running call list mimicking real CAD/dispatch workflow
- Call creation, unit assignment, status updates (dispatched, enroute, on scene, available)
- Call history with timestamps and unit activity log per call
- This should feel familiar to a real dispatcher

---

## Phase 7 — Water Supply

- Wet hydrant and dry hydrant placement by player
- Tanker shuttle logic for areas without hydrant coverage
- Fill site designation
- Supply line tracking per incident
- Water supply requirements added to structure fire mission types

---

## Future Goals

- Equipment customization per apparatus (tools, equipment loadout affecting capability tags)
- Feature - ESN Creation and Edit has check boxes for various modifiers/designations like "Commercial" and "Interstate" which *in the future* affect the types of calls that can spawn as well as the weighting for them.
- Feature - Allow Players to weight their ESNs within a dispatch center. Lower/Raise spawn rate of calls based on these weights applied. Allows rural ESNs to be determined by player and lower call volume appropriately.
- Major Feature - Police Units/stations Automatically Patrol ESNs they are assigned to. Car Numbers configurable per ESN. If unable to meet requirements, then split evenly. If still unable to meet requirements, then cars are allotted at random, and patrol between different ESNs assigned.
- Major Feature - EMS Units can be staged at a location?
- Big QOL - What would it take to allow save state to retain across page refreshes?
- Bug - ALS PTs transportable by non-ALS units. Rendezvous System is the fix.

---

## Stretch Goals

- Potential cheap hosting for sharing with friends (GitHub Pages / Cloudflare Pages)
- Possible future: simple multiplayer where two dispatchers share a CAD
