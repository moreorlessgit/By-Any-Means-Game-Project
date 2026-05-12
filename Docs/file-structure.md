# File Structure

## Current Files

```
/By Any Means
  index.html          — Game engine, UI, all rendering and game loop logic
  config.js           — MASTER CONFIG FILE. Single source of truth for all variables.
  esn.js              — ESN polygon drawing, dispatch centers, box alarms, OSM cache, spawn logic
  criminals.js        — Suspect and arrest management, charges, holding cells
  hospitals.js        — Hospital placement and management, patient transport
  prisons.js          — Jail and prison placement and management, prisoner transport
  stations.js         — Station, unit, and responder management
  .gitignore          — Excludes server/.env and server/node_modules from git
  CLAUDE.md           — Project briefing and session instructions
  docs/               — Reference documentation (project-brief.md, history.md, roadmap.md, architecture.md, conventions.md, this file)

  server/             — Phase 4A backend (Node.js + Express + Prisma)
    index.js          — Express app entry point; CORS, JSON middleware, health check route; route mounts (stubs, filled in Sessions 2–3)
    .env              — Secrets: DATABASE_URL, JWT_SECRET, PORT. NEVER committed to git.
    .gitignore        — Excludes node_modules/ and .env from git
    package.json      — npm manifest; dependencies: express, cors, dotenv, jsonwebtoken, bcryptjs, zod, express-rate-limit, @prisma/client
    package-lock.json — Locked dependency tree
    lib/
      db.js           — Prisma client singleton (one shared connection pool)
    prisma/
      schema.prisma   — DB schema: users, private_worlds, private_world_saves, settings
      migrations/     — Auto-generated migration SQL (committed to git)
    routes/
      auth.js         — POST /api/auth/register, /api/auth/login, GET /api/auth/me (live, Session 2)
                        [privateWorlds.js, saves.js, settings.js stubs — Session 3]
    middleware/
      auth.js         — requireAuth: JWT Bearer verification, attaches req.user (live, Session 2)
```

---

## Planned Future Files (not yet created)

These will be created only when a system grows too large to logically live in an existing file, or when separation genuinely improves maintainability. Always discuss with the player before creating a new file.

### Phase 4 — Backend (skeleton in place; routes/middleware filled per session)

The `server/` directory exists and is running. Remaining files to be added:

```
  server/
    routes/
      auth.js           — ✅ LIVE — see server/routes/auth.js
      privateWorlds.js  — Private world CRUD  [Session 3]
      saves.js          — Private world save slot CRUD  [Session 3]
      settings.js       — Per-user settings persistence  [Session 3]
      groups.js         — Group CRUD, invite codes, join/leave  [Phase 4B]
      stations.js       — Station CRUD (global world)  [Phase 4B]
      units.js          — Unit CRUD (global world)  [Phase 4B]
      incidents.js      — Incident CRUD, share-to-group, dispatch  [Phase 4C]
      facilities.js     — Hospital/jail/prison CRUD (global)  [Phase 4B]
    middleware/
      auth.js           — ✅ LIVE — see server/middleware/auth.js
      [validate.js and rateLimit.js were merged into routes/auth.js; no separate files needed]
    sockets/
      index.js          — Socket.IO event handlers  [Phase 4B]
```

### Phase 5 — Personnel

```
  personnel.js        — Individual responder tracking, certifications, volunteer status
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
