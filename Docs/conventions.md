# Coding Conventions

## Comments and Clarity

- **Comments on every config variable** explaining what it does and what values are valid
- **Comments throughout game logic code** explaining what each function and significant block does in plain English — the player is not a developer and should be able to read the code and get a general understanding of what is happening
- **Function names:** descriptive and verb-first (`spawnIncident`, `routeAndAnimate`, `executeDispatch`, `renderStationList`)
- **No magic numbers** in game logic — everything referenced from config
- **CSS variables** for all colors — never hardcode hex values in JS or inline styles where avoidable

---

## Naming and IDs

- **IDs:** stations use `st_` prefix, units use `u_` prefix, incidents use `inc_` prefix, personnel will use `p_` prefix
- **Before any significant change:** explain to the player in plain English what is changing, why, and what files will be affected. Wait for confirmation before proceeding.
- **At the end of productive sessions:** offer to update CLAUDE.md and docs files to reflect new systems built or decisions made.
- **Never delete or overwrite player save data** without explicit confirmation.
- **Prefer editing existing files** over creating new ones unless separation is clearly justified. Explain reasoning if a new file is proposed.

---

## UI Text Abbreviations

- `ST` = station in all ETA and status display strings
- `SCN` = scene in all ETA and status display strings
- Examples: `↩ 4m to ST`, `6m to SCN`, `On SCN`

---

## Live UI Update Pattern

DOM elements inside modals that display countdown timers or progress bars must receive an `id` attribute (e.g. `id="hcm-bar-${item.id}"`) so they can be updated in-place each game tick by a dedicated `_update*()` helper called from `_tickGameClock()`. Never fully re-render a modal every tick — it destroys dropdown state. Pattern established in `_updateDispatchStabBars()`, `_updateHospitalProgressBars()`, `_updateHoldingCellModal()`.

---

## US Units Only

All game distances, speeds, and measurements displayed to the player must use US customary units: miles (mi), miles per hour (mph). Never display kilometers or km/h to the player. Internal OSRM data (which returns meters/km) is converted before display. Config values are in mph.

---

## On Introducing New Tools or Dependencies

If a new library, framework, or tool would meaningfully improve the project, suggest it and explain why before adding it. Free only. The player is not a developer — keep the local setup as simple as possible to run even if the code itself is complex.
