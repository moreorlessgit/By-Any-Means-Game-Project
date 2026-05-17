# File Structure

## Current Files

```
/By Any Means
  index.html          — Game engine, UI, all rendering and game loop logic; login/world-picker overlays
  api.js              — REST client for the Phase 4A backend; window.api.* (auth, worlds, saves, settings)
  config.js           — MASTER CONFIG FILE. Single source of truth for all variables.
  esn.js              — ESN polygon drawing, dispatch centers, box alarms, OSM cache, spawn logic
  criminals.js        — Suspect and arrest management, charges, holding cells
  hospitals.js        — Hospital placement and management, patient transport
  prisons.js          — Jail and prison placement and management, prisoner transport
  stations.js         — Station, unit, and responder management
  units.js            — Unit-level display layer: DC prefix resolution, Unit List tab, Unit Details modal (Phase 5A+)
  .gitignore          — Excludes server/.env and server/node_modules from git
  CLAUDE.md           — Project briefing and session instructions
  docs/               — Reference documentation (project-brief.md, history.md, roadmap.md, architecture.md, conventions.md, launch-guide.md, this file)

  server/             — Phase 4A backend (Node.js + Express + Prisma) — COMPLETE
    index.js          — Express app entry; CORS, JSON middleware, health check, mounts all routers
    smoke-test.http   — REST Client/JetBrains-compatible end-to-end smoke chain
    .env              — Secrets: DATABASE_URL, JWT_SECRET, PORT. NEVER committed to git.
    .gitignore        — Excludes node_modules/ and .env from git
    package.json      — npm manifest; scripts: `start`, `dev` (node --watch)
    package-lock.json — Locked dependency tree
    lib/
      db.js           — Prisma client singleton (one shared connection pool)
    prisma/
      schema.prisma   — DB schema (cascade FKs on owner delete)
      migrations/     — Auto-generated migration SQL (committed to git)
    routes/
      auth.js              — POST /api/auth/register, /login, GET /me
      privateWorlds.js     — GET/POST/DELETE /api/private-worlds; mounts saves sub-router
      privateWorldSaves.js — GET/POST/GET-one/DELETE /api/private-worlds/:id/saves[/:slot]
      settings.js          — GET/PUT /api/settings (auto-sync, debounced from client)
    middleware/
      auth.js         — requireAuth: JWT Bearer verification, attaches req.user
```

---

## Planned Future Files (not yet created)

These will be created only when a system grows too large to logically live in an existing file, or when separation genuinely improves maintainability. Always discuss with the player before creating a new file.

### Phase 4 — Backend (Phase 4A complete; 4B+ files below)

```
  server/
    routes/
      auth.js                  — ✅ LIVE
      privateWorlds.js         — ✅ LIVE
      privateWorldSaves.js     — ✅ LIVE
      settings.js              — ✅ LIVE
      groups.js                — Group CRUD, invite codes, join/leave  [Phase 4B]
      stations.js              — Station CRUD (global world)  [Phase 4B]
      units.js                 — Unit CRUD (global world)  [Phase 4B]
      incidents.js             — Incident CRUD, share-to-group, dispatch  [Phase 4C]
      facilities.js            — Hospital/jail/prison CRUD (global)  [Phase 4B]
    middleware/
      auth.js                  — ✅ LIVE
      [validate.js and rateLimit.js were merged into route files; no separate files needed]
    sockets/
      index.js                 — Socket.IO event handlers  [Phase 4B]
```

### Phase 5 — Personnel

```
  units.js            — ✅ LIVE (5A) — display layer + Unit List + Unit Details modal
  personnel.js        — Individual responder tracking, certifications, volunteer status (Phase 5B+)
```

### Phase 6 — CAD

```
  dispatch.js         — CAD-style dispatch window and response plan logic
```

---

## File Creation Rules

- Bug fixes and expansions to existing systems go in the existing file unless there is a strong reason otherwise
- Before creating a new .js file, explain to the player why separation is better than expanding an existing file
- Avoid file bloat — logical cohesion matters more than line count
- Existing features CAN and SHOULD be rewritten when improvements, bug fixes, or additions require it
