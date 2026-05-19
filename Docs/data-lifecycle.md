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
- **Cascade on actual delete:** Apparatus, personnel records, station-scoped settings (response policies, ideal-crew overrides, per-station `volunteerAssembly` window, etc.) all cascade. *(Personnel no longer carry home/work location fields after the abstract-assembly refactor.)*

### ESNs
- **Polygon edit:** Fires building-cache purge for that ESN (see §3). The pre-refactor volunteer-home auto-migration is no longer triggered — under the abstract-assembly model volunteers have no physical location to migrate. `autoMigrateVolunteersForESN` is a no-op stub kept so the ESN-edit hook doesn't throw.
- **Delete:** Blocks if any station/dispatch-center association exists. Force-delete unbinds.

### Dispatch Centers
- **Delete:** Blocks if any ESN references it. Force-delete unbinds the ESNs (they become orphan ESNs, flagged in the ESN list until reassigned).

### Personnel (Phase 5+)
- **Delete (single person):** Hard delete with confirmation. If on an active call, blocked unless force-delete.
- **Cascade from station delete:** Yes — personnel belong to a station.
- **Save-load migration:** `purgeLegacyVolunteerFields(person)` strips `home`, `work`, `currentLocation`, `isCustomized`, `wayId`, `isFallback`, and `availability.currentLocation` from any volunteer record on load, so saves predating the abstract-assembly refactor rehydrate cleanly.
- ~~**Bulk operations:** "Reset all auto-generated volunteer locations" regenerates homes/works for non-customized, non-super personnel only.~~ *(Superseded — no volunteer locations to reset. The Database Health panel's bulk-reset row is now a no-op pending UI cleanup.)*

---

## 3. OSM Building Cache

**Status:** Retained but dormant. The cache was originally built to back volunteer home/work generation; the post-Phase-5 abstract-assembly refactor removed that consumer. The cache is kept because future POI-driven call generation (structure fires at real commercial buildings, MVAs at known intersections) is the obvious next consumer — pre-populating now means that feature is cheap to land.

**Implementation note:** The cache lives on each `esn.osmBuildingCache` and is persisted as part of the save JSON blob (`PrivateWorldSave.state_json`), not in a dedicated Postgres table. The dedicated `osm_building_cache` table sketched below becomes relevant only when Phase 4B forces global-world persistence. Behaviorally the cache rules below all apply.

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
- **Fetch trigger:** Today the only triggers are the manual "Rebuild Building Cache" button and a lazy refetch inside `pickRandomBuildingInESN` (which itself has no live caller). When the future POI/call-generation system lands, its spawn path will be the live trigger.
- **TTL:** 30 days. After 30 days, the next read triggers a refetch for that ESN.
- **Invalidation:** ESN polygon edit immediately purges the cache for that ESN. Refetch happens lazily on next demand.
- **Manual rebuild:** Player-triggered "Rebuild Building Cache" button (see §5) purges and refetches synchronously with progress feedback.

**What the cache does NOT store:**
- Specific personnel locations. The abstract-assembly refactor removed personnel home/work fields entirely; volunteer "location" is now an abstract availability state (`home` / `roaming` / `at_station` / `unavailable`), not a lat/lon.

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
- ~~**Reset Volunteer Locations** — regenerates homes/works for all auto-generated, non-customized, non-super personnel at this station.~~ *(Superseded by the abstract-assembly refactor — no locations to reset.)*
- **Volunteer Assembly Window** — edit the per-station mean ± spread (game minutes) that drives `rollVolunteerAssemblyDelaySec`. Defaults seed from `BAM_CONFIG.volunteerAssemblyMeanGameMin` / `volunteerAssemblySpreadGameMin` when the station is first volunteer-flagged.
- **Reassign Apparatus** — move selected apparatus to another station. Non-destructive.
- **Reassign Personnel** — move selected personnel to another station. Non-destructive.

### Operations Modal → Database Health Panel *(new)*
- **OSM Cache** section: list of ESNs with cached row counts and last-fetched dates. Per-row "Rebuild" button. "Rebuild All" button with progress.
- **Orphan Inspector**: read-only list of any dangling references found. Should always be empty in a healthy world; non-empty means a cascade rule got skipped somewhere — useful for debugging.
- ~~**Volunteer Locations**: bulk reset across selected stations.~~ *(Superseded — pending UI removal.)*
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
- ~~Auto-migrated personnel flag: how is this surfaced?~~ *(Resolved by deletion — abstract-assembly model has nothing to migrate.)*
- World Reset confirmation pattern: typed world name? Multi-step wizard? TBD when the Database Health panel is built (5E).
