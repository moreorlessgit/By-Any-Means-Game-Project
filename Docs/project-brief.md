# By Any Means — Project Brief

## Project Identity

**Name:** By Any Means  
**Type:** Personal emergency services dispatch and agency-building simulation game  
**Status:** Active development, Phase 3 complete with major QOL/UI batch implemented

### Primary Goal
A fully custom-buildable emergency services simulation. The player starts small — a single station, a single unit — and builds outward at their own pace with no artificial cost scaling or forced progression. The player defines everything: station names, unit callsigns, coverage areas, response plans, box alarms. The game is a canvas for the player's vision of their local emergency services landscape, not a fixed scenario.

### Player Background
The primary player/developer is a real-world 911 dispatcher and Firefighter/EMT. Authenticity is a core design value. Mechanics should mirror how real dispatch, fire, and EMS operations actually work — not how games typically simulate them.

### Geographic Scope
- **Starting area:** Harford, PA and surrounding Susquehanna County
- **Planned expansion:** Wyoming County and Lackawanna County, PA
- **Long-term goal:** Full US map playable via OpenStreetMap tile streaming (no local map storage needed)

### Distribution Goals
- Currently personal use only
- May be shared non-commercially with one or two friends (fellow dispatchers)
- Long-term stretch goal: free or very cheap hosting (GitHub Pages, Cloudflare Pages, etc.)
- Never commercial

---

## Tech Stack

Simple does not need to mean limited. Free is required. Best tool for the job wins.

| Layer | Current | Notes |
|---|---|---|
| UI/Game | Plain HTML + CSS + JS | No framework yet, acceptable to introduce one if justified |
| Map | Leaflet.js | OpenStreetMap tiles, streamed on demand |
| Routing | OSRM (public API) | Real road routing, ETA calculation; `router.project-osrm.org` |
| OSM data | Overpass API | Per-ESN building + road node cache; `overpass-api.de` |
| Storage | localStorage (`bam_save_` prefix) | SQLite migration planned for later |
| Local server | Live Server (VSCode extension) | Sufficient for now |
| Build tools | None currently | Can be introduced if there is a clear benefit — explain before adding |

---

## Design Philosophy

- **Authenticity over arcade.** If it doesn't work like this in real life, it probably shouldn't work like this in the game. The player is a real dispatcher and EMT — they will notice.
- **The player is in control.** Every area, every station name, every unit callsign, every ESN boundary is defined by the player. The game provides the engine; the player provides the world.
- **No grind.** Progression comes from expanding your footprint, not from repetition. The player should be excited to place a new station because it opens new territory, not because they finally ground out enough calls.
- **Flat costs.** Station and unit costs never increase. The 50th engine costs the same as the first.
- **Realism at all scales.** The starting setting is rural Pennsylvania, and rural firefighting mechanics — tanker shuttles, volunteer delays, long response times, sparse coverage — are core to the experience, not edge cases. As the game expands to cover the full US, urban and suburban mechanics will be added alongside rural ones. The rural foundation should never be deprioritized.
- **Modular and editable.** A player should be able to add a new call type by editing config.js without touching a single line of game logic.
- **Meaningful progression.** Rewards should feel meaningful relative to costs without requiring hundreds of calls to afford one station.
