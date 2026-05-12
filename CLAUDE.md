# CLAUDE.md — By Any Means

## Project

**By Any Means** is a custom-buildable emergency services dispatch and agency-building simulation game for a real-world 911 dispatcher/Firefighter/EMT. The player starts with a single station and unit, then expands at their own pace with flat costs, no artificial grind, and full control over station names, unit callsigns, coverage areas, response plans, and box alarms.

See **docs/project-brief.md** for full project identity, design philosophy, and tech stack details.

---

## Tech Stack

| Layer | Current |
|---|---|
| UI/Game | Plain HTML + CSS + JS |
| Map | Leaflet.js |
| Routing | OSRM (public API) |
| OSM data | Overpass API |
| Storage | localStorage (`bam_save_` prefix) |
| Local server | Live Server (VSCode extension) |

---

## Current Files

```
index.html, config.js, esn.js, criminals.js, hospitals.js, prisons.js, stations.js, CLAUDE.md, docs/
```

---

## Always-On Rules

- **config.js is the single source of truth.** All tunable values live there; nothing is hardcoded in game logic.
- **Unit capability uses tag arrays.** Never replace with direct type matching.
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
- **docs/conventions.md** — Coding conventions, naming rules, ID prefixes, UI patterns. Pull when writing new code or establishing new patterns.
- **docs/glossary.md** — Terms, acronyms, abbreviations, and mechanics definitions. Reference when reading documentation or discussing game concepts if unsure what a meaning could be.
