# Planned Systems — Phase Roadmap

Phases are a guide, not a strict sequence. Player input determines priority.

---

## ONGOING PROJECTS

### Housekeeping

GENERAL HOUSEKEEPING, cleaning up the index.html file. Check for anything that can help trim down this file. I am open to splitting things out into extra .js/css files that you suggest to keep some features more contained and easier for you to search and edit in the future. Should still allow modularity. Primary goal is reducing token usage overall.

General Realism - Medical Emergency type calls should only have one PT typically. (I can fix this myself, claude ignore this one.)

## Phase 4 — "Noli Timere Messorem" — Backend, Database, Auth, Multiplayer

This is the most critical phase of the project. Every feature built after Phase 4 lands directly into the established backend pattern — new DB table, new API endpoint, new frontend call. No more retrofitting.

See **docs/backend-architecture.md** for the full technical design and **docs/security.md** for the security model.

---

### Phase 4A — Backend Foundation *(do first)*

Goal: Replace `localStorage` with a real backend. Private worlds work exactly as before, now server-backed and accessible from any device.

- Node.js + Express project setup alongside existing frontend
- PostgreSQL schema: `users`, `private_worlds`, `private_world_saves`, `settings`
- Auth endpoints: register, login, JWT middleware
- Private world save/load API (mirrors current save slot behavior)
- Settings API (replaces `bam_settings` key)
- Frontend migration layer: thin API wrapper replaces all `localStorage` reads and writes
- Self-hosted on home box; accessible from work or any device
- Existing save data migration path: export current localStorage → import to new system

**Player-visible change:** Login screen on load. Save/load now persists to server. Everything else identical.

---

### Phase 4B — Global World: Stations & Groups

Goal: Players can see each other's stations and form groups (alliance-style).

- Stations and units become server-side entities in the global world (not just save state)
- Group system: create a group, share invite code, others join
- Group members' stations always render on your map
- Facilities (hospitals, jails, prisons) become global entities — visible to all, valid transport targets for all players regardless of group
- Socket.IO: live station add/edit/remove broadcast within group
- One account gives access to both private worlds and the global world

**Player-visible change:** Friend's stations appear on the map. Facilities placed by anyone are valid for transport.

---

### Phase 4C — Shared Calls

Goal: Group members can share incidents and respond together.

- Incidents stored server-side in global world (real-time, 1× server clock, no time acceleration)
- Calls are private by default — only you see them
- "Share to group" button broadcasts the call to all group members
- Group members can dispatch their own units to a shared call from anywhere
- Responding and on-scene units from group members are visible on shared calls only
- Socket.IO: shared call broadcast, unit position updates on active shared calls, resolution broadcast

**Player-visible change:** Shared calls appear in your incident list. You can dispatch your units to them and see friends' units working the scene.

---

### Phase 4D — Polish & Public *(only if/when needed)*

Goal: Open the game to strangers safely.

- Public registration with email verification
- Cloudflare in front (free DDoS protection, bot filtering)
- Group management UI (kick members, rename, transfer ownership)
- Player profiles
- Abuse reporting
- Move to cloud hosting (Railway.app or Fly.io — free tiers available)
- GDPR considerations if EU players are ever anticipated


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

- Full US map coverage via OSM tile streaming
- Equipment customization per apparatus (tools, equipment loadout affecting capability tags)
- Feature - ESN Creation and Edit has check boxes for various modifiers/designations like "Commercial" and "Interstate" which *in the future* affect the types of calls that can spawn as well as the weighting for them.
- Feature - Allow Players to weight their ESNs within a dispatch center. Lower/Raise spawn rate of calls based on these weights applied. Allows rural ESNs to be determined by player and lower call volume appropriately.
- Major Feature - Police Units/stations Automatically Patrol ESNs they are assigned to. Car Numbers configurable per ESN. If unable to meet requirements, then split evenly. If still unable to meet requirements, then cars are allotted at random, and patrol between different ESNs assigned.
- Major Feature - EMS Units can be staged at a location?
- Bug - ALS PTs transportable by non-ALS units. Rendezvous System is the fix.
