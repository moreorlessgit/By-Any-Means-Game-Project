# Backend Architecture — By Any Means

Phase 4 introduces a Node.js + PostgreSQL backend. Every feature built after Phase 4 follows the same established pattern: new DB table, new API route, new frontend call. No retrofitting.

---

## World Model

```
Global World (real-time, 1× server clock, persistent)
├── Players — accounts with their own stations, units, and money
├── Groups — alliance system (create, invite by code, join)
│   ├── Members always see each other's stations on the map
│   ├── Facilities (hospitals, jails, prisons) — global, visible to all,
│   │   valid transport target for all players regardless of group
│   ├── Calls — private by default, only you see them
│   └── Shared Calls — group can see, dispatch to, and see responding units
└── Private Worlds — per-player, isolated, full time acceleration, save slots
    └── Server-backed (accessible from any device), but only you play in them
```

One account gives access to both the global world and any private worlds you own.

---

## Tech Stack

| Component | Choice | Notes |
|---|---|---|
| Runtime | Node.js | JavaScript — consistent with frontend |
| Framework | Express.js | Minimal, well-documented REST API server |
| Database | PostgreSQL | Free, open-source, handles concurrency, scales to cloud |
| Auth | JWT (JSON Web Tokens) | Stateless, no session DB needed |
| Real-time | Socket.IO | Group sync: station updates, shared call broadcasts |
| DB layer | Prisma ORM | Migrations, type-safe queries, prevents SQL injection |
| Validation | Zod | Schema-based input validation on all API routes |
| Password hashing | bcrypt | One-way hash, never store plain passwords |

---

## Database Schema

All IDs are database-generated. Player-defined names (station names, callsigns, etc.) are stored as-is — fully customizable. The DB enforces uniqueness and ownership; it never dictates what the player calls things.

```sql
-- Authentication
users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(32) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
)

-- Groups (alliance system)
groups (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(64) NOT NULL,
  owner_user_id INTEGER REFERENCES users(id),
  invite_code   VARCHAR(16) UNIQUE NOT NULL,   -- short random code, shareable
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
)

group_members (
  group_id    INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(16) NOT NULL DEFAULT 'member',  -- 'owner' | 'member'
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
)

-- Global world: stations
stations (
  id              SERIAL PRIMARY KEY,
  owner_user_id   INTEGER REFERENCES users(id),
  name            VARCHAR(128) NOT NULL,
  type            VARCHAR(32) NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  data_json       JSONB,          -- coverage area, extra config
  created_at      TIMESTAMPTZ DEFAULT NOW()
)

-- Global world: units
units (
  id              SERIAL PRIMARY KEY,
  station_id      INTEGER REFERENCES stations(id) ON DELETE CASCADE,
  owner_user_id   INTEGER REFERENCES users(id),
  callsign        VARCHAR(64) NOT NULL,
  type            VARCHAR(32) NOT NULL,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  status          VARCHAR(32) NOT NULL DEFAULT 'available',
  created_at      TIMESTAMPTZ DEFAULT NOW()
)

-- Global world: incidents
incidents (
  id                  SERIAL PRIMARY KEY,
  creator_user_id     INTEGER REFERENCES users(id),
  type                VARCHAR(64) NOT NULL,
  lat                 DOUBLE PRECISION NOT NULL,
  lng                 DOUBLE PRECISION NOT NULL,
  address             TEXT,
  status              VARCHAR(32) NOT NULL DEFAULT 'active',
  is_shared           BOOLEAN NOT NULL DEFAULT FALSE,
  shared_to_group_id  INTEGER REFERENCES groups(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ
)

-- Global world: incident/unit junction
incident_units (
  incident_id   INTEGER REFERENCES incidents(id) ON DELETE CASCADE,
  unit_id       INTEGER REFERENCES units(id) ON DELETE CASCADE,
  dispatched_at TIMESTAMPTZ DEFAULT NOW(),
  arrived_at    TIMESTAMPTZ,
  resolved_at   TIMESTAMPTZ,
  PRIMARY KEY (incident_id, unit_id)
)

-- Global world: facilities (hospitals, jails, prisons — visible to all)
facilities (
  id              SERIAL PRIMARY KEY,
  type            VARCHAR(32) NOT NULL,    -- 'hospital' | 'jail' | 'prison'
  name            VARCHAR(128) NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  owner_user_id   INTEGER REFERENCES users(id),   -- who placed it
  data_json       JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
)

-- Private worlds
private_worlds (
  id              SERIAL PRIMARY KEY,
  owner_user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(128) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
)

-- Private world save slots
private_world_saves (
  id          SERIAL PRIMARY KEY,
  world_id    INTEGER REFERENCES private_worlds(id) ON DELETE CASCADE,
  slot_name   VARCHAR(64) NOT NULL,
  state_json  JSONB NOT NULL,
  saved_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (world_id, slot_name)
)

-- Per-user settings (separate from save slots, persists across all worlds)
settings (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings_json JSONB NOT NULL DEFAULT '{}'
)
```

---

## API Endpoint Contract

All routes except `/api/auth/*` require a valid JWT in the `Authorization: Bearer <token>` header. The server always verifies ownership before modifying or returning any entity — a user cannot read, modify, or delete another user's data by guessing IDs.

```
Auth
  POST   /api/auth/register          { username, password }
  POST   /api/auth/login             { username, password } → { token }
  GET    /api/auth/me                → current user info

Groups
  GET    /api/groups                 → my groups
  POST   /api/groups                 { name, description }
  GET    /api/groups/:id             → group details + member list
  DELETE /api/groups/:id             → delete group (owner only)
  POST   /api/groups/:id/leave       → leave group
  GET    /api/groups/join/:code      → look up group by invite code
  POST   /api/groups/join/:code      → join group

Stations (global world)
  GET    /api/stations               → my stations
  GET    /api/stations/group/:id     → all stations belonging to group members
  POST   /api/stations               { name, type, lat, lng, data_json }
  PUT    /api/stations/:id           { name, ... }  (owner only)
  DELETE /api/stations/:id           (owner only)

Units
  GET    /api/units                  → my units
  POST   /api/units                  { station_id, callsign, type, tags }
  PUT    /api/units/:id              { callsign, type, tags, ... }  (owner only)
  PUT    /api/units/:id/status       { status }  (owner only)
  DELETE /api/units/:id              (owner only)

Incidents (global world)
  GET    /api/incidents              → my active incidents
  POST   /api/incidents              { type, lat, lng, address }
  POST   /api/incidents/:id/share    { group_id }  (owner only)
  DELETE /api/incidents/:id/share    → unshare  (owner only)
  POST   /api/incidents/:id/resolve  (owner only)
  GET    /api/incidents/group/:id    → incidents shared to this group

Dispatch
  POST   /api/incidents/:id/dispatch { unit_ids[] }  (unit owner only — you can only dispatch your own units)

Facilities
  GET    /api/facilities             → all facilities (global — all players see these)
  POST   /api/facilities             { type, name, lat, lng, data_json }
  PUT    /api/facilities/:id         (owner only)
  DELETE /api/facilities/:id         (owner only)

Private Worlds
  GET    /api/private-worlds         → my worlds
  POST   /api/private-worlds         { name }
  DELETE /api/private-worlds/:id     (owner only)

Private World Saves
  GET    /api/private-worlds/:id/saves
  POST   /api/private-worlds/:id/saves     { slot_name, state_json }
  DELETE /api/private-worlds/:id/saves/:slot

Settings
  GET    /api/settings               → my settings
  PUT    /api/settings               { settings_json }
```

---

## Socket.IO Event Reference

Socket connections authenticate using the same JWT as REST calls. The token is passed during the handshake; unauthenticated sockets are rejected before they can subscribe to any room.

```
Client → Server
  join_group(groupId)                     subscribe to this group's room
  leave_group(groupId)                    unsubscribe
  unit_position(unitId, lat, lng)         broadcast my unit's position to group (shared calls only)

Server → Client (broadcast to group room)
  station:added(station)                  a group member placed a new station
  station:updated(station)                a group member edited a station
  station:removed(stationId)              a group member deleted a station
  incident:shared(incident, userId)       a group member shared a call
  incident:unshared(incidentId)           a group member unshared a call
  incident:resolved(incidentId)           a shared call was resolved
  unit:dispatched(unitId, incidentId, userId)  a group member dispatched to a shared call
  unit:position(unitId, lat, lng, userId) unit position update on an active shared call
  unit:arrived(unitId, incidentId)        a unit arrived on a shared call
  unit:returning(unitId)                  a unit is returning from a shared call
```

---

## Auth Flow

**Registration:**
1. Client POST `/api/auth/register` with `{ username, password }`
2. Server validates username uniqueness and password strength
3. Server hashes password with `bcrypt` (cost factor 12)
4. Server inserts `users` row, creates default `settings` row
5. Server returns `{ token }` — player is immediately logged in

**Login:**
1. Client POST `/api/auth/login` with `{ username, password }`
2. Server fetches user by username, runs `bcrypt.compare(password, hash)`
3. On match: server signs a JWT (`{ userId, username }`, expires in 7 days), updates `last_login`
4. Returns `{ token }`

**Authenticated Requests:**
1. Client stores token in `localStorage` (or memory)
2. Every API call includes `Authorization: Bearer <token>` header
3. Auth middleware verifies signature and expiry on every protected route
4. Expired or invalid tokens receive `401 Unauthorized`

---

## Ownership Enforcement Rules

These rules are checked server-side on every mutating request. The client is never trusted.

| Entity | Who can modify/delete |
|---|---|
| Station | `owner_user_id` only |
| Unit | `owner_user_id` only |
| Incident | `creator_user_id` only (share, unshare, resolve) |
| Dispatch to incident | Any authenticated user — but only their own units |
| Facility | `owner_user_id` only |
| Group | Owner can delete/kick; any member can leave |
| Private world + saves | `owner_user_id` only |

If an ownership check fails, the server returns `403 Forbidden` with no data leaked about the resource.

---

## Frontend Migration (localStorage → API)

The Phase 4A migration wraps all `localStorage` calls in an API client module. Game logic does not change — only the data layer underneath. The pattern:

**Before (Phase 3):**
```js
localStorage.setItem('bam_save_slot1', JSON.stringify(state));
const state = JSON.parse(localStorage.getItem('bam_save_slot1'));
```

**After (Phase 4A):**
```js
await api.privateWorlds.saves.put(worldId, 'slot1', state);
const { state_json } = await api.privateWorlds.saves.get(worldId, 'slot1');
```

The `api` module (`api.js` at repo root) handles token attachment, error handling, and response parsing. All existing save/load UI calls through this wrapper. localStorage is removed for game data once migration is verified — the only keys that persist are `bam_token`, `bam_migration_dismissed`, and active-world/slot pointers for UX continuity.

---

## Settings Sync (auto-save contract)

Settings have no Save button — they auto-sync to the server on every change.

**Client-side rule:**
- Every code path that mutates the in-memory settings object calls `api.settings.put(currentSettings)`.
- That call is debounced ~500ms so a burst of rapid changes collapses into a single PUT.

**Server-side rule:**
- `PUT /api/settings` does a full replace of `settings_json` (idempotent, no merge logic on the server).
- Permissive rate-limit (120 req/min per IP) accommodates the chatty pattern while still catching runaway loops.

This is the reference pattern for any future auto-synced surface — the global world (Phase 4B+) follows the same shape: client mutates state, debounced PUT replays the change to the server, server is the source of truth on reload.

---

## Global vs. Private World Behavior

The global world is **always-live**: there is no Save button on the global end. Player state (stations, units, money, etc.) persists automatically on the server, similar to the settings auto-sync pattern above but per-entity rather than blob-replace. Private worlds keep the familiar named-save-slot model so single-player play stays under the player's control.

| Feature | Global World | Private World |
|---|---|---|
| Time | 1× real-time, server clock | Player-controlled (1×–60×) |
| Players | Everyone (groups scope visibility) | Owner only |
| Stations | Shared, visible within group | Isolated to this save |
| Facilities | Global — visible to all players | Isolated to this save |
| Calls | Private until shared | Always private |
| Save slots | N/A (always live) | Multiple named slots per world |
| Multiplayer | Yes | No |

---

## Phase 5 Tables (Planned — Not Yet Built)

These are sketches; final column names and types are decided at migration time. All tables follow the FK cascade rules defined in **docs/data-lifecycle.md**.

```sql
-- Personnel: individual named responders, owned by a user, assigned to a station
personnel (
  id                  SERIAL PRIMARY KEY,
  owner_user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  station_id          INTEGER REFERENCES stations(id) ON DELETE CASCADE,
  name                VARCHAR(128) NOT NULL,
  staffing_type       VARCHAR(16) NOT NULL,            -- 'career' | 'volunteer'
  rank                VARCHAR(64),
  preferred_service   VARCHAR(16),                     -- 'fire' | 'ems' | 'either'
  home_lat            DOUBLE PRECISION,
  home_lng            DOUBLE PRECISION,
  home_osm_way_id     BIGINT,
  work_lat            DOUBLE PRECISION,
  work_lng            DOUBLE PRECISION,
  work_osm_way_id     BIGINT,
  is_customized       BOOLEAN NOT NULL DEFAULT FALSE,  -- player has manually edited; opts out of auto-migration
  is_super_responder  BOOLEAN NOT NULL DEFAULT FALSE,  -- player-tagged; ignores availability/auto-migration
  auto_migrated_flag  BOOLEAN NOT NULL DEFAULT FALSE,  -- set when ESN edit forced a home regen; cleared on player ack
  data_json           JSONB,                           -- schedule, reliability, stats, history
  created_at          TIMESTAMPTZ DEFAULT NOW()
)

-- Certifications: lookup table for cert types (FF1, EMT, Paramedic, etc.)
certifications (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(32) UNIQUE NOT NULL,           -- 'FF1', 'EMT', 'LV_EVOC', etc.
  display_name  VARCHAR(128) NOT NULL,
  category      VARCHAR(16) NOT NULL,                  -- 'fire' | 'ems' | 'police' | 'shared'
  cost_cents    INTEGER NOT NULL,                      -- training cost (mirrors config.js)
  prereq_codes  TEXT[]                                 -- required prior certs
)

-- Personnel-certification join
personnel_certifications (
  personnel_id      INTEGER REFERENCES personnel(id) ON DELETE CASCADE,
  certification_id  INTEGER REFERENCES certifications(id),
  earned_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (personnel_id, certification_id)
)

-- OSM building cache: per-ESN cached candidate buildings for volunteer home/work placement
-- TTL 30 days, invalidated on ESN polygon edit; see docs/data-lifecycle.md
osm_building_cache (
  id              SERIAL PRIMARY KEY,
  esn_id          INTEGER REFERENCES esns(id) ON DELETE CASCADE,
  building_type   VARCHAR(16) NOT NULL,                -- 'house' | 'commercial' | 'industrial' | 'retail'
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  osm_way_id      BIGINT,
  fetched_at      TIMESTAMPTZ DEFAULT NOW()
)
CREATE INDEX ON osm_building_cache (esn_id, building_type);

-- Apparatus: replaces or supplements `units` for Phase 5 with crew requirements
-- Decision point at 5B start: extend `units` or migrate to a new `apparatus` table.
-- Either way, the following fields are added:
--   min_crew, ideal_crew                 INTEGER
--   required_certs                       TEXT[]  -- cert codes required to staff
--   ideal_wait_seconds                   INTEGER NULL  -- per-apparatus override of global ideal-crew wait
--   response_policy                      VARCHAR(32)   -- 'wait_for_ideal' | 'respond_at_min' | 'wait_then_respond' | 'manual'
```

**Aggregated crew composition broadcast (Phase 4C interaction):**

When a unit is dispatched to a shared call, the owning player's server emits a Socket.IO `unit:dispatched` event whose payload includes an aggregated crew summary, **not** the personnel roster:

```js
{
  unitId: 142,
  incidentId: 137,
  userId: 5,
  crewSummary: {
    total: 4,
    breakdown: [
      { role: 'driver_operator', count: 1 },
      { role: 'firefighter_1',   count: 2 },
      { role: 'firefighter_1_emt', count: 1 }
    ],
    capabilities: ['interior_attack', 'bls_patient_care']  // derived, drives the receiving player's UI
  }
}
```

Individual personnel IDs, names, and full certification lists never cross the wire to other players. This preserves the "your roster is yours" guarantee while giving group members enough info to know what's actually arriving on their shared call.
