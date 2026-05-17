# Data Lifecycle — Cleanup, Caching, Retention, Cascades

This is the single reference for what happens to data when it goes stale, when its parent gets deleted, or when the player wants to wipe it. Every phase that creates a new entity type should add an entry here.

The goal is to prevent two failure modes:
1. **Orphan rot** — old data referencing deleted parents, accumulating glitchy state over time.
2. **Cache staleness** — derived/cached data drifting from its source (OSM updates, ESN polygon edits, etc.).

---

## 1. Cleanup Vectors

There are five distinct categories of cleanup. Each is handled differently.

| Vector | Trigger | Handler | Player visible? |
|---|---|---|---|
| **OSM building cache** | ESN polygon edit OR 30-day TTL OR manual rebuild | Event-driven purge + lazy refetch + sweep | Yes — rebuild button |
| **OSRM route cache** *(if added later)* | Station/facility move OR LRU eviction | Background sweep | No |
| **Orphaned child records** | Parent entity deleted | Schema-level FK cascade | No (cascade is invisible) |
| **Player-initiated hard delete** | Player clicks delete in UI | Confirmation modal → immediate hard delete | Yes |
| **In-flight game state on parent delete** | Player tries to delete station/world with active calls/units | Block by default, force-delete escape hatch | Yes |

---

## 2. Per-Entity Cleanup Rules

### Private Worlds & Save Slots
- **Delete behavior:** Hard delete immediately. No trash bin. No recovery.
- **Confirmation:** Modal with the world/slot name typed back or a clear "I understand this is permanent" checkbox. No accidental clicks.
- **Cascade:** All `private_world_saves` rows for the world cascade. Settings tied to the world cascade. Any future world-scoped data (groups, friends list, etc.) cascades.

### Users (account delete — future Phase 4D)
- All owned `private_worlds`, saves, settings cascade.
- Global-world stations/units owned by the user transition to a "decommissioned" state rather than vanishing mid-call from other players' views.
- Personnel records cascade with their stations (private to user anyway).

### Stations
- **Default delete:** Blocked while any of these reference the station:
  - Active incidents with units from this station enroute or on scene
  - Patients in transit assigned to units from this station
  - Suspects in transit assigned to units from this station
  - Pending box alarm responses
- **UI feedback:** Block modal lists exactly what's blocking (e.g. "Engine 5 enroute to Call #142, Medic 5 on scene at Call #137"). Each blocker is clickable → jumps to the relevant call/transport.
- **"Danger: Force Delete":** Power-user escape hatch behind a second confirmation. Cancels active calls assigned to this station, returns transit units OOS at current location, releases patients/suspects back to scene or last facility.
- **Personnel/apparatus reassignment:** A general "Reassign" action (separate from delete) must exist for both apparatus and personnel — moving an engine or a firefighter from Station A to Station B without deleting anything. This is a Phase 5 ergonomics requirement that the force-delete path leans on (so the player has a non-destructive option first).
- **Cascade on actual delete:** Apparatus, personnel home/work records, station-scoped settings (response policies, ideal-crew overrides, etc.) all cascade.

### ESNs
- **Polygon edit:** Fires building-cache purge for that ESN (see §3). Also triggers volunteer home auto-migration check per Phase5.md — homes outside the new station coverage regenerate, unless personnel is player-customized or super-responder tagged.
- **Delete:** Blocks if any station/dispatch-center association exists. Force-delete unbinds.

### Dispatch Centers
- **Delete:** Blocks if any ESN references it. Force-delete unbinds the ESNs (they become orphan ESNs, flagged in the ESN list until reassigned).

### Personnel (Phase 5+)
- **Delete (single person):** Hard delete with confirmation. If on an active call, blocked unless force-delete.
- **Cascade from station delete:** Yes — personnel belong to a station.
- **Bulk operations:** "Reset all auto-generated volunteer locations" regenerates homes/works for non-customized, non-super personnel only.

---

## 3. OSM Building Cache

The cache exists so we don't hammer the public Overpass API every time a volunteer needs a home or work address.

**Implementation note (Phase 5D ✅):** The cache currently lives on each `esn.osmBuildingCache` and is persisted as part of the save JSON blob (`PrivateWorldSave.state_json`), not in a dedicated Postgres table. The dedicated `osm_building_cache` table sketched below becomes relevant only when Phase 4B forces global-world persistence. Behaviorally the cache rules below all apply.

**Schema (sketch — future table):**
```
osm_building_cache
  id
  esn_id (FK, indexed)
  building_type (house | commercial | industrial | retail)
  lat, lon
  osm_way_id (for stable reference)
  fetched_at
```

**Lifecycle:**
- **Fetch trigger:** First time a volunteer in this ESN needs a home/work address. Fetch is per-ESN, per-building-type, batched.
- **TTL:** 30 days. After 30 days, the next read triggers a refetch for that ESN.
- **Invalidation:** ESN polygon edit immediately purges all `osm_building_cache` rows for that ESN. Refetch happens lazily on next demand.
- **Manual rebuild:** Player-triggered "Rebuild building cache" button (see §5) purges and refetches synchronously with progress feedback.

**What the cache does NOT store:**
- Specific personnel home/work assignments. Those live on the `personnel` row itself as `home_lat`/`home_lon`/`home_osm_way_id` (and same for work). This way personnel locations survive cache purges and OSM data updates — continuity per Phase5.md.

**Refetch rate limits:**
- Single ESN refetch: one Overpass query (or two, if buildings + commercial come in separate queries). Trivial.
- Bulk "rebuild all ESNs": queue with 1-second spacing to stay polite on the public API. Show progress to player.

---

## 4. OSRM Route Cache *(future, optional)*

Not building this for Phase 5 unless OSRM load becomes a real problem. If/when added:
- Short TTL (1 hour) — routes don't change often but road closures and OSM updates do happen.
- Keyed on (origin lat/lon rounded to 5 decimals, destination lat/lon rounded, profile).
- LRU eviction at a size cap (e.g. 10k entries).
- Invalidate on station/facility move within the snapping radius.

---

## 5. Player-Facing Cleanup Tools

Tools live in **two places**: their natural contextual home AND the central Database Health panel. Player gets to choose discovery by symptom or by category.

### ESN Edit Modal
- **Rebuild Building Cache** — purges and refetches OSM buildings for this ESN. Confirmation: none (operation is non-destructive).

### Station Edit Modal
- **Reset Volunteer Locations** — regenerates homes/works for all auto-generated, non-customized, non-super personnel at this station. Confirmation: yes (changes personnel data the player may have grown attached to).
- **Reassign Apparatus** — move selected apparatus to another station. Non-destructive.
- **Reassign Personnel** — move selected personnel to another station. Non-destructive.

### Operations Modal → Database Health Panel *(new)*
- **OSM Cache** section: list of ESNs with cached row counts and last-fetched dates. Per-row "Rebuild" button. "Rebuild All" button with progress.
- **Orphan Inspector**: read-only list of any dangling references found. Should always be empty in a healthy world; non-empty means a cascade rule got skipped somewhere — useful for debugging.
- **Volunteer Locations**: bulk reset across selected stations.
- **World Reset**: nuclear option. Wipes all stations/units/personnel/calls in the current world, keeps the world record. Triple confirmation.

### Settings → Account Cleanup *(future)*
- **Purge All Soft-Deleted Data** — n/a today since we hard-delete, but a placeholder if we ever add trash.
- **Delete Account** — Phase 4D concern.

---

## 6. Background Sweeps

A single daily cron job (server-side, lightweight) handles:
- OSM building cache rows past 30-day TTL → mark stale (next read triggers refetch, no immediate work).
- OSRM route cache eviction (if implemented).
- Orphan detection report — logged for review, not auto-fixed. If orphans are showing up regularly, a cascade rule is missing.

Sweeps are not user-visible. Failures get logged; no notifications. Sweep job is idempotent and safe to run manually for debugging.

---

## 7. Schema-Level Cascade Rules

Cascades happen at the Prisma/Postgres level so application code can't accidentally leave orphans.

| Parent | Child | Behavior |
|---|---|---|
| `users` | `private_worlds`, `settings` | `ON DELETE CASCADE` |
| `private_worlds` | `private_world_saves` | `ON DELETE CASCADE` |
| `users` (future) | global-world stations/units | `ON DELETE SET NULL` + decommission flag |
| `stations` (future) | `apparatus`, `personnel` | `ON DELETE CASCADE` |
| `esns` (future) | `osm_building_cache` rows | `ON DELETE CASCADE` |

When introducing a new table, decide cascade behavior at migration time, not later.

---

## 8. What This Doc Does NOT Cover

- **Backups.** Server backup strategy (DB dumps, retention, off-site copies) is a hosting/ops concern handled separately. See **docs/launch-guide.md** for current backup posture.
- **Audit logging.** If we add audit/event tables later, their retention will be added here.
- **Migration data.** The Phase 4A localStorage importer is a one-shot; see **docs/backend-architecture.md** for that flow.
- **Test/dev database.** Resetting the dev DB during development is a developer workflow, not a player-facing feature.

---

## 9. Open Questions / Future Considerations

- Should the "Rebuild Building Cache" button be rate-limited per-player to prevent accidental Overpass hammering if a player gets click-happy? Probably yes — soft cooldown of ~30 seconds per ESN.
- Auto-migrated personnel flag: how is this surfaced? Per Phase5.md, "auto-migrated personnel should be flagged so the player can see who moved and why." Likely a notification + a visual marker on the personnel row that persists until the player acknowledges.
- World Reset confirmation pattern: typed world name? Multi-step wizard? TBD when the Database Health panel is built (5E).
