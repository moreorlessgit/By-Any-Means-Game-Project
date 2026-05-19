# CLAUDE.md — By Any Means

## Project

**By Any Means** is a custom-buildable emergency services dispatch and agency-building simulation game for a real-world 911 dispatcher/Firefighter/EMT. The player starts with a single station and unit, then expands at their own pace with flat costs, no artificial grind, and full control over station names, unit callsigns, coverage areas, response plans, and box alarms.

See **docs/project-brief.md** for full project identity, design philosophy, and tech stack details.

---

## Tech Stack

| Layer | Current / Planned |
|---|---|
| UI/Game | Plain HTML + CSS + JS |
| Map | Leaflet.js |
| Routing | OSRM (public API) |
| OSM data | Overpass API |
| Storage | PostgreSQL via REST API — **localStorage retired for game data (Phase 4A complete)** |
| Local server (frontend) | Live Server (VSCode extension) — port 5500 |
| Backend | Node.js + Express — **live, port 3001** |
| Database | PostgreSQL 18 — **live, bam_dev** |
| Auth | JWT — **login required to play; settings auto-sync, private worlds use save slots** |
| Real-time | Socket.IO (Phase 4B) |
| DB layer | Prisma ORM v6 — **live, schema migrated** |

---

## Current Files

```
Frontend (root):
  index.html, api.js, config.js, esn.js, criminals.js, hospitals.js, prisons.js, stations.js, units.js,
  personnel.js, volunteers.js, dbhealth.js
  CLAUDE.md, docs/, .gitignore

Backend (server/):
  index.js, lib/db.js, smoke-test.http, package.json
  middleware/auth.js
  routes/auth.js, routes/privateWorlds.js, routes/privateWorldSaves.js, routes/settings.js
  prisma/schema.prisma, prisma/migrations/

Admin tools (tools/):
  config-editor/         ← schema-driven visual editor for BAM_CONFIG. Standalone, never shipped with the game.

Launch + hosting reference:
  docs/launch-guide.md   ← how to run, host, connect remotely, push updates
```

---

## Always-On Rules

- **config.js is the single source of truth.** All tunable values live there; nothing is hardcoded in game logic.
- **Config Editor must stay in sync.** `tools/config-editor/` is the visual editor for `BAM_CONFIG`. Any time the shape of a config section changes — new fields, renamed keys, new sections, changed value types, new validation rules — update `tools/config-editor/schemas.js` (and `validators.js` if needed) in the same change. The editor is schema-driven; an out-of-date schema silently drops fields when the player edits. See `tools/config-editor/README.md` for how to extend.
- **Unit capability uses tag arrays.** Never replace with direct type matching.
- **Seats own apparatus capacity AND crew requirements.** `BAM_CONFIG.unitTypes[k].seats[]` is the authority — there is NO separate `crewDefaults` block or `maxTransportCapacity` field. Each seat is one of three roles: responder seat (with optional `requiredCert` / `preferredCerts[]` / `niceToHaveCerts[]` / `isDriver`), `isPatientSeat:true` (stretcher), or `isPrisonerSeat:true` (cell/cage). Patient and prisoner seats cannot hold responders. Apparatus rolls when every seat with `requiredCert` is filled.
- **US customary units only.** Display miles/mph to the player; convert from OSRM before display.
- **Never delete or overwrite player save data** without explicit confirmation.
- **Station and unit costs are flat.** No scaling based on count.
- **Comments required.** All config variables and significant logic blocks need plain-English explanation.
- **Prefer editing existing files.** Explain before proposing a new file.
- **No magic numbers.** Everything references config.

---

## Session Behavior

- **Read this file first.** Pull relevant docs/ file when working on that system.
- **Explain changes in plain English.** The player is not a developer.
- **Ask before any significant change.** Never assume design intent or priorities.
- **Flag breaking changes** before proceeding.
- **Keep the player informed** of what files are being changed and why.
- **Suggest updates** to CLAUDE.md and docs at session end if architecture or plans changed.
- **Present options** when something could be done multiple ways; let the player decide.
- **Brief summaries welcome.** 1–2 sentences at end of response is good; verbose preamble before tool calls is not.
- **Ask Clarifying Questions** Ask clarifying questions to ensure player intent is met.

---

## Docs Reference

- **docs/project-brief.md** — Full project identity, design philosophy, tech stack details. Pull when making design decisions or discussing player intent/goals.
- **docs/history.md** — All completed systems by phase. Pull only if asked what was built or when; not needed for active coding.
- **docs/roadmap.md** — Phase 4+ planned systems. Pull when planning or building new phases.
- **docs/file-structure.md** — Current + planned file layout and file creation rules. Pull when adding files or asking where code belongs.
- **docs/architecture.md** — Detailed implementation rules per system (animation, saves, ESNs, dispatch, etc.). Pull when touching a specific system.
- **docs/backend-architecture.md** — Full backend design: DB schema, API contract, Socket.IO events, auth flow, world model. Pull when working on any Phase 4+ backend or API code.
- **docs/security.md** — Security model, threat matrix, implementation checklist. Pull when working on auth, API endpoints, or any code that touches player data.
- **docs/conventions.md** — Coding conventions, naming rules, ID prefixes, UI patterns. Pull when writing new code or establishing new patterns.
- **docs/glossary.md** — Terms, acronyms, abbreviations, and mechanics definitions. Reference when reading documentation or discussing game concepts if unsure what a meaning could be.
- **docs/launch-guide.md** — How to start the backend + frontend, connect from another computer on the LAN, and roll out updates. Pull when the player asks how to launch, host, or update the game.
- **docs/data-lifecycle.md** — Cleanup, caching, retention, and cascade rules per entity. Pull when adding a new DB table, designing delete behavior, or building cache invalidation. Every new entity type should add an entry here.
- **tools/config-editor/README.md** — How to launch and extend the config editor. Pull when changing the shape of any `BAM_CONFIG` section or adding a new one.
