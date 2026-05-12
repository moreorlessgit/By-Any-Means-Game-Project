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
  CLAUDE.md           — Project briefing and session instructions
  docs/               — Reference documentation (project-brief.md, history.md, roadmap.md, architecture.md, conventions.md, this file)
```

---

## Planned Future Files (not yet created)

These will be created only when a system grows too large to logically live in an existing file, or when separation genuinely improves maintainability. Always discuss with the player before creating a new file.

### Phase 4 — Backend (new directory alongside frontend)

```
  server/
    index.js            — Express app entry point, middleware setup, Socket.IO init
    .env                — Secrets (JWT secret, DB connection string). NEVER committed to git.
    prisma/
      schema.prisma     — Database schema (single source of truth for DB structure)
      migrations/       — Auto-generated migration files from Prisma
    routes/
      auth.js           — POST /api/auth/register, /api/auth/login, GET /api/auth/me
      groups.js         — Group CRUD, invite codes, join/leave
      stations.js       — Station CRUD (global world)
      units.js          — Unit CRUD (global world)
      incidents.js      — Incident CRUD, share-to-group, dispatch
      facilities.js     — Hospital/jail/prison CRUD (global, visible to all)
      privateWorlds.js  — Private world create/delete
      saves.js          — Private world save slot CRUD
      settings.js       — Per-user settings persistence
    middleware/
      auth.js           — JWT verification middleware (protects all non-auth routes)
      validate.js       — Input validation middleware (Zod schemas)
      rateLimit.js      — Rate limiting config (strict on auth routes)
    sockets/
      index.js          — Socket.IO event handlers (group rooms, position broadcasts)
    lib/
      db.js             — Prisma client singleton
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
