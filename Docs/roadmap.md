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

### Phase 4A — Backend Foundation ✅ *(complete)*

Goal: Replace `localStorage` with a real backend. Private worlds work exactly as before, now server-backed and accessible from any device.

- ✅ Node.js + Express project setup alongside existing frontend (`server/`)
- ✅ PostgreSQL schema: `users`, `private_worlds`, `private_world_saves`, `settings` — migrated and live (FKs cascade on owner delete)
- ✅ Health check endpoint, CORS, secrets management
- ✅ Auth endpoints: register, login, JWT middleware, rate limiting
- ✅ Private world save/load API — manual save slots, mirrors Phase 3 behavior (upsert on slot_name)
- ✅ Settings API — **auto-syncs on change, no Save button** (debounced PUT, 120 req/min limit)
- ✅ Frontend migration layer: `api.js` REST client replaces every `localStorage` game-data read/write
- ✅ Login screen on load → world picker (private worlds list + disabled "Global World" tile for Phase 4B)
- ✅ One-shot localStorage importer: detects legacy `bam_save_*` keys and offers to import into an "Imported Saves" world

**Player-visible change:** Login screen on load. Save/load persists to the server and is accessible from any device. Settings sync silently. Everything else identical to Phase 3.

**Save model going forward:**
- **Private worlds (live now)** — manual save slots, just like Phase 3. You name a slot and overwrite when you want.
- **Global world (Phase 4B+)** — always-live, server-clock, no Save button. Your stations/units persist automatically.
- **Settings (any world)** — auto-synced on change. No Save button.

See **docs/launch-guide.md** for how to start the server, host on the LAN, and push updates.

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

- Merged into Phase 5
---

## Phase 5 — Personnel, Volunteer System, Certifications, Unit List Window, Unit Details Window.

Phase 5 introduces individual named personnel, certifications, crew composition rules, and the volunteer response system. It is the **substrate for a post-Phase 5 call resolution overhaul** — crew-cert composition will eventually drive resolution speed, escalation, and incident effectiveness.

**Playtest cadence:** Full system ships before player playtests. Sub-phases below are engineering chunks, not delivery milestones.

- **5A** — Unit List + Unit Details modals + dispatch center unit prefixes (pure UI) ✅
- **5B** — Career personnel + cert taxonomy + crew slot rules + min/ideal crew dispatch gating
- **5C** — Training system + career shifts + ranks + cashflow integration
- **5D** — Volunteer system: OSM-cached home/work, direct-to-scene, PPE rules, availability, auto-migration on ESN edits
- **5E** — Stats, career history, NIMS/ICS officer ratios, Database Health panel, polish

**Multiplayer integration:** Personnel records stay private to the owning player. On shared calls (Phase 4C), only aggregated crew composition is broadcast (e.g. "Engine 5 with 4 crew: 1 D/O, 2 FF1, 1 FF1/EMT").

See **docs/Phase5.md** for full design, **docs/data-lifecycle.md** for OSM cache and cleanup rules, **docs/backend-architecture.md** for planned schema.

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
- Future Phase — Dispatch Center Staffing, CAD Workflow, and Call-Taking
- Full US map coverage via OSM tile streaming
- Equipment customization per apparatus (tools, equipment loadout affecting capability tags)
- Feature - ESN Creation and Edit has check boxes for various modifiers/designations like "Commercial" and "Interstate" which *in the future* affect the types of calls that can spawn as well as the weighting for them.
- Feature - Allow Players to weight their ESNs within a dispatch center. Lower/Raise spawn rate of calls based on these weights applied. Allows rural ESNs to be determined by player and lower call volume appropriately.
- Major Feature - Police Units/stations Automatically Patrol ESNs they are assigned to. Car Numbers configurable per ESN. If unable to meet requirements, then split evenly. If still unable to meet requirements, then cars are allotted at random, and patrol between different ESNs assigned.
- Major Feature - EMS Units can be staged at a location?
- Bug - ALS PTs transportable by non-ALS units. Rendezvous System is the fix.
