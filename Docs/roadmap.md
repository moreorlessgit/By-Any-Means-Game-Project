# Planned Systems — Phase Roadmap

Phases are a guide, not a strict sequence. Player input determines priority.

---

## Phase 3.25 (Next) General Bugfixes and Phases 1-3 working as intended.



## Phase 3.5 (Next, Framework For Phase 4) — Framework for Volunteer System, Certifications, and Personnel

Groundwork For Phase 4 - Unit Details Window/Modal. Can click into it from units on the map or anywhere else a unit is referenced in a window. Shows a bunch of unit info, can rename from here too. General data like ETAs for all phases, PTs loaded, Suspects loaded, etc. Ask Questions to verify intent.



## Phase 4 (After Framework) — Volunteer System, Certifications, and Personnel

- **Station staffing types:** Each station configured as Career (fully paid), Combination, or Volunteer
- **Volunteer response delay:** Volunteers must respond to the station before the apparatus can respond. Delay calculated from volunteer's home/work location within the ESN. Adds realistic rural response time lag.
- **Personnel system:** Individual named responders at each station. Can be renamed by player. Tracks certifications (FF1, FF2, Driver/Operator, EMT, AEMT, Paramedic, LEO, etc.)
- **Volunteer roster:** Volunteers assigned to ESNs, not just stations. They respond from within the ESN.
- **Certification requirements:** Units require minimum certified personnel to respond (e.g. ALS ambulance needs at least one Paramedic)
- **Training system:** Player can train personnel to gain new certifications. Training is money-gated only — the player pays a cost and the certification is granted immediately. No waiting. Costs defined in config.js.

---

## Phase 5 — CAD-Style Call List

- Running call list mimicking real CAD/dispatch workflow
- Call creation, unit assignment, status updates (dispatched, enroute, on scene, available)
- Call history with timestamps and unit activity log per call
- This should feel familiar to a real dispatcher

---

## Phase 6 — Water Supply

- Wet hydrant and dry hydrant placement by player
- Tanker shuttle logic for areas without hydrant coverage
- Fill site designation
- Supply line tracking per incident
- Water supply requirements added to structure fire mission types

---

## Future / Stretch Goals

- Equipment customization per apparatus (tools, equipment loadout affecting capability tags)
- Multi-agency scenarios
- Potential cheap hosting for sharing with friends (GitHub Pages / Cloudflare Pages)
- Possible future: simple multiplayer where two dispatchers share a CAD

### Note on mutual aid
Mutual aid is already modeled organically by the player through ESN assignments. A player can assign a distant station to cover an ESN, which naturally represents a mutual aid agreement. No separate mutual aid system is needed.
