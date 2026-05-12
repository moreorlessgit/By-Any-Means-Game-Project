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

```
  saves/              — Folder for JSON save files (multiple save slots)
  personnel.js        — Individual responder tracking, certifications, volunteer status (when built in Phase 4)
  dispatch.js         — CAD-style dispatch window and response plan logic (when built in Phase 5)
```

---

## File Creation Rules

- Bug fixes and expansions to existing systems go in the existing file unless there is a strong reason otherwise
- Before creating a new .js file, explain to the player why separation is better than expanding an existing file
- Avoid file bloat — logical cohesion matters more than line count
- Existing features CAN and SHOULD be rewritten when improvements, bug fixes, or additions require it
