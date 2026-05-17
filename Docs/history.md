# Development History

## Phase 1 ✅

- Interactive Leaflet map centered on Susquehanna County, PA
- Station placement (Fire / EMS / Police) with flat cost system
- Multi-unit stations with unit type definitions and capability tag system
- OSRM real-road routing with animated unit travel dot and dashed route line
- Live ETA countdown updated per animation frame
- Money / budget system
- Weighted random mission spawning within configurable radius of stations
- Mission escalation chains (e.g. MVA → MVA w/ Entrapment, Traffic Stop → DUI Arrest)
- Patient generation with injury types and ALS/BLS requirements
- Dispatch modal: requirements checklist, patient list, available units sorted by ETA
- Call log tab
- Save / load via localStorage (multi-slot)
- Test seed data around Harford, PA (clearly labeled, player-replaceable)

---

## Phase 2 ✅

- **ESN polygon zones** — Player draws, names, colors, edits, and deletes coverage zones on the map
- **ESN shape editing** — "Edit Shape" button in ESN modal re-enters draw mode with existing vertices
- **ESN drawing isolation** — Existing polygon clicks suppressed during draw; gray reference dots for snapping
- **Multi-station ESN assignment** — Each ESN assigns fire, EMS, and police stations independently
- **ESN search + DC filter** — Search bar filters ESN list; clicking a DC card filters to that DC's ESNs
- **Dispatch Centers** — Placeable map buildings; assign ESNs; summary modal with cap/active call counts
- **DC sidebar list** — Collapsible DC section at top of DCs & ESNs tab; edit/OOS per DC
- **DC call cap** — Cap = unique stations in DC's ESNs + 1; enforced in spawn logic
- **DC OOS spawn gate** — OOS dispatch center blocks all spawning in its assigned ESNs
- **No DC = no calls** — Spawning completely blocked until at least one DC is placed
- **In / Out of Service** — Stations, units, ESNs, and DCs all support OOS toggle
- **HH:MM:SS game clock** — `gameSeconds`-based, rollover at 86400, speed buttons 1×–60×
- **True pause** — rAF accumulated game-time: speed 0 instantly freezes all in-flight animations
- **Mid-flight speed changes** — Speed changes affect all active animations on the next frame
- **Unit return animation** — After resolution, units animate back to station on a dashed return route
- **OSM-aware spawning** — Per-ESN Overpass cache; structure fires spawn on buildings, MVAs on roads
- **Road node weighting** — Major roads and intersections weighted higher for road-type spawns
- **OSRM snap fallback** — Random-mode calls snap to nearest driveable road; `inc.address` from road name
- **Dispatch stagger** — Units in same dispatch depart 3 game-seconds apart (speed-scaled)
- **AVL-style unit labels** — Callsign text above moving unit dots; toggle in layer panel
- **Station label layer** — Persistent station name tooltips on map markers; toggle in layer panel
- **Station marker click → manage modal** — Clicking a station on the map opens Manage Station directly
- **Incident address display** — Road name from OSRM shown on incident cards and dispatch modal
- **Units Enroute section in dispatch modal** — Live ETA countdown inside modal (not sidebar cards)
- **Resolution progress bar** — Live bar + staffing efficiency + est. clear time in dispatch modal
- **Tick-based resolution system** — No setTimeout; progress driven by game clock, nonlinear staffing penalty
- **Escalation ownership check** — Calls only escalate if player owns units for all new requirements
- **Overwrite save confirm flow** — Two-click confirm (button turns red "Confirm?") replaces browser dialog
- **Response plans** — Named auto-assignment plans; pulls closest available unit by ETA per tag
- **Box alarms** — Per-ESN unit assignments that override/supplement response plans

---

## Phase 2+ Bug Fixes & Feature Additions ✅

- **Map tile color fix** — Replaced broken `hue-rotate(200deg)` filter (caused greens to appear purple) with `.leaflet-tile-pane { filter: brightness(0.65) saturate(0.75) contrast(1.05) }` darkening
- **Animation race condition fix** — `unit._animGen` generation counter prevents competing rAF loops when a unit is dispatched while another animation is already active
- **Time-weighted unit animation** — OSRM `&annotations=duration` + `interpolatePolylineByTime()` makes units visually speed up on highways and slow on back roads
- **LEO-only spawning fix** — Spawn tag eligibility uses all in-service units regardless of status; busy fire/EMS units no longer suppress fire/EMS call types
- **On-scene-only staffing** — Resolution rate and dispatch modal staffing bar count only `status === 'on_scene'` units; enroute units do not contribute
- **Staffing greedy matching** — `countMetRequirements()` ensures each unit fills at most one requirement slot; staffing counter displays `X/Y reqs met` alongside efficiency %
- **Unit stuck returning fix** — Status normalization on load resets mid-call statuses to `available`; animation state cannot survive a page reload
- **Unit cancellation from current position** — `cancelUnitFromCall()` routes enroute units home from current map position; on-scene units route home from the incident location
- **Enroute unit rerouting** — Dispatched units appear selectable (amber border, `✦ ENROUTE → [call]` label) in any call's dispatch modal; selecting one pulls it from its original call and reroutes to the new call from current position
- **Returning unit ETA** — `unit._returnRemSec` updated every animation frame; station list pills show `↩ Xm to ST`; dispatch modal shows dual ETA (`↩ Xm to ST | Ym to SCN`)
- **Ghost marker fix** — `routeAndAnimate()` and `routeAndAnimateReturn()` defensively remove existing `unit.animMarker` before creating a new one; no frozen ghost dots on reroute
- **AVL label status colors** — Unit map dot labels show status-based background colors: enroute = bright green, on scene = blue, returning = yellow; configurable in Settings
- **AVL label on-scene refresh** — `onUnitArrived()` updates the marker icon immediately so the label turns blue the moment a unit arrives
- **Settings modal** — ⚙ button in header opens tabbed Settings panel: Simulation (spawn rate 0.25×–3×), AVL Labels (color/style pickers per status), Map (placeholder); settings persist to `bam_settings` localStorage
- **Station deletion** — "Delete Station" button in Manage Station modal; two-click confirm; full station cost refunded
- **Unit deletion** — Delete button per unit in Manage Station; two-click confirm; 50% unit cost refunded
- **Dispatch modal auto-refresh** — `_refreshDispatchModalIfOpen(incId)` re-renders the open modal on unit arrival, cancellation, or dispatch; `↻ Update` button for manual refresh

---

## Phase 3 ✅

- **Hospital and prison placement** — Hospitals and jails/prisons placeable on map by player
- **Patient transport logic** — ALS patients routed to nearest appropriate hospital based on injury requirements; BLS patients to nearest BLS-capable hospital
- **Prisoner transport logic** — Prisoners from holding cells route to nearest county jail; from county jails route to nearest state correctional facility
- **Transport unit assignment** — Dispatch modal for manual unit selection when transporting patients/prisoners; units must be marked for transport capability
- **In-transit unavailable** — Units become unavailable during transport + offload time at receiving facility (ALS alert time + offload duration, configurable per facility type)
- **Transport time via OSRM** — Real-road routing used to calculate transport ETAs; displayed in transport dispatch modal
- **Air medical dispatch** — Air units available for time-critical patient transports (configurable per hospital air traffic policy)
- **Cashflow modal** — Summary of income (call rewards), expenses (station/unit purchase/upkeep, transport costs, offload fees), net position; tracks budget changes over time
- **Facilities modal** — Dedicated UI for managing hospitals and jails (OOS status, capacity, offload times)
- **Suspect and charge system** — Arrested suspects tracked with charges and hold duration; booking/processing times at holding stations before jail transfer
- **Holding cell modal with live countdown** — Progress bars and remaining time text update every tick without full re-render
- **Incident label on suspects** — Arrest call label displayed in holding cell modal for context
- **Jail modal with transfer UI** — Manual prisoner-to-prison transfers with destination jail selection

---

## Phase 3+ QOL/UI Batch ✅

**Sidebar Redesign & Operations Modal:**
- **Sidebar structure** — Simplified sidebar with Cancel Placement button (top), collapsible BUILD panel (6 categories: Fire/EMS/Police/Air/Facilities/Dispatch Center, each independently collapsible), OPERATIONS button
- **Operations modal** — `#ops-modal` with 3 top-level tabs:
  - **Stations tab** — Search + filter pills (All|Fire|EMS|Police|Air); full station list with Manage/Focus/OOS buttons
  - **Facilities tab** — Search + filter pills (All|Hospitals|Jails); hospital and jail lists with Manage/Focus/OOS buttons
  - **Operations tab** — 4 sub-tabs:
    - **Dispatch Centers** — Search bar; DC list with Edit/Summary/OOS buttons; shows active call count vs cap
    - **ESN Zones** — Search bar; ESN list with Edit Shape/Manage/OOS buttons
    - **Response Plans** — Search bar; Plans list with Edit/Delete buttons
    - **Box Alarms** — Search bar; Box alarms list with Edit/Delete buttons per ESN
- **Transport Queue button** — Dedicated sidebar control (below OPERATIONS button) visible when queue has pending transports; shows count badge and pulses for attention
- **Transport dispatch modal** — Unit-selection UI showing available `transport_prisoner` or `patrol` units sorted by distance from current holding location; displays unit name, home station, distance, and ETA estimates
- **Pending transport queue** — Global `pendingTransports[]` stores references to suspects needing transport; auto-queued from processing timer expiry; manually queued from holding cell / jail transfers; player assigns units via dispatch modal
- **Transport queue modal** — Lists all pending transports with Assign Unit and Dismiss buttons per entry; clicking Assign opens the dispatch modal for that transfer

**Search & Filter Improvements:**
- **DC modal ESN search** — Input field above ESN checkbox list filters in real-time by ESN name
- **ESN modal station search per service** — Three independent search inputs (Fire|EMS|Law) filter assigned stations per service group
- **DC assignment in ESN modal** — Select dropdown to assign/reassign an ESN to a specific dispatch center; removes ESN from all other DCs on save
- **DC summary 3-column grid** — Replaces flat pill layout with structured 3-column Fire/EMS/Law grid per ESN showing coverage by service

**Box Alarm Ordered Preferences:**
- **New data structure** — `requirements: [{ prefs: [{type:'unit'|'tag', id?, name?, tag?}] }]` replacing old flat `[['tag']]` format
- **Ordered preference list UI** — Each slot shows list of preferences with Add Unit / Add Tag / Remove / Move buttons; preferences executed in order (first available unit wins)
- **Backward compatibility** — `loadBoxAlarmData()` auto-converts old `[['tag']]` format to new structure on load; `applyAutoDispatch()` handles both formats at runtime

**Unit and Station Management:**
- **Unit drag-and-drop reorder** — Units in station Manage modal are `draggable`; drag-over highlights target; drop reorders in `s.units[]` array and persists to save data
- **Incident label display** — Suspects in holding cell show arrest call incident label for context (stored in `suspect.incidentLabel`)
- **Holding cell live countdown** — Progress bars and remaining time text (`#hcm-bar-${sus.id}`, `#hcm-rem-${sus.id}`) update every tick via `_updateHoldingCellModal()` without full modal re-render

**UI Polish:**
- **Header always visible** — `#header` now `position:sticky; top:0; z-index:10001` so clock/speed controls remain accessible above all modals (z-index 9999)
- **ESN color presets expanded** — `ESN_COLOR_PRESETS` increased from 8 to 21 colors (ambers, greens, blues, reds, purples, pinks, teals, gray, white) for more visual variety

---

---

## Phase 3.25 Bugfix & UI Batch ✅

**Suspect/Prisoner Transport — Two-Leg Routing:**
- **Two-leg pickup flow** — Transport units now drive to the suspect's current holding location first (police station holding cell for station→jail transfers; source county jail for jail→prison transfers), pick up the prisoner, then continue to the destination. Previously units skipped the pickup and routed directly to the destination.
- **`_getSuspectPickupLocation()` helper** — Single source of truth for "where is this suspect right now"; resolves over `suspect.status`, `suspect.facilityId`, and `suspect.holdingStationId` so station→jail and jail→prison flows are handled uniformly.
- **Phase tracking** — `unit.transportPhase` = `'enroute_pickup'` | `'enroute_dropoff'`; `suspect.status` = `'awaiting_pickup'` during leg 1, `'in_transport'` during leg 2.
- **Deferred cell vacate** — Source jail cell stays occupied until the transport unit physically arrives for pickup (`onPickupArrived`). Previously `_doTransfer` freed the cell immediately at queue time, causing count drift.
- **`_holdingTransfer` fix** — Was setting `suspect.facilityId` to the destination before dispatch, causing `_getSuspectPickupLocation` to return the destination as the pickup point. Removed; `intakePrisoner` sets `facilityId` on arrival.
- **`_doTransfer` fix** — Same `facilityId` contamination bug plus premature cell vacate. Both corrected; status properly set to `'needs_transport'` so dismiss/re-queue works.
- **Returning units dispatchable** — Units in `returning` status are now included in transport unit selection (both the dispatch modal list and auto-dispatch). Routing starts from the unit's current animated position (`unit.animMarker.getLatLng()`), not home station.
- **Transport dispatch modal z-index** — Modal and queue modal bumped to `z-index: 10001` at creation; no longer appears behind jail/facility modals when opened from within them.
- **ETA includes pickup leg** — Dispatch modal ETA calculation sums pickup leg (unit → suspect location) + dropoff leg (suspect location → destination); pickup hint shown per unit row when pickup leg is non-trivial.
- **Station-list pills** — Transporting units show `🚔📥` during pickup phase and `🚔→` during dropoff phase; tooltip includes pickup source and destination.

**Operations Modal:**
- **Facilities tab list + search** — Hospitals and jails now render as searchable cards in the Facilities tab (same card pattern as Stations tab); Focus pans map, Manage opens the facility modal; OOS badge reflects live status.
- **DC tab / ESN tab separation** — Dispatch Centers tab now shows only DC cards; ESN Zones tab shows only ESNs with working search. Previously ESNs appeared under the DC tab.

**Edit ESN Zone Modal:**
- **Searchable multi-select coverage** — Fire, EMS, and Law coverage dropdowns replaced with chip-based searchable multiselect (`_buildSearchableMultiselect`); chips show current assignments with × removal; panel filters by typing.
- **DC assignment search** — DC dropdown also uses the multiselect helper in single-select mode; consistent UX across all assignment groups.

**UI Polish & Dispatch Clarity:**
- **Unit Type Colors settings tab** — New "Unit Colors" tab in Settings modal; color pickers for all 15 unit types grouped by Fire / EMS / Police / Air. Selected color renders as a rounded pill badge behind the unit type label in the dispatch list (both Available Units and Enroute/On Scene sections). Colors persist to `bam_settings` localStorage and apply immediately to any open dispatch modal.
- **Transport pending flash** — Incident cards in `transport_pending` status now pulse with an orange background animation (`bam-transport-pulse`) so they stand out visually in the right sidebar incident list.
- **Hospital ETA in transport tab** — When selecting a destination hospital for a patient transport, `_updateTransportCompat()` now fires an OSRM route call from the incident scene to the selected hospital and displays `🏥 ETA: X min — Y mi` below the compatibility indicator. Updates on every hospital change; clears on deselect.
- **Hospital modal tab CSS fix** — `.sb-tabs` and `.sb-tab` CSS rules were missing from `index.html`, causing the hospital modal tab bar to be invisible. Added full flex tab styling matching the ops/rp-tabs pattern. Tab order (Offloading → Departments → Purchases) was already correct in `hospitals.js`.

---

---

## Phase 4A — Session 1: Backend Foundation ✅

- **Node.js + Express server** initialized in `server/`; runs on port 3001
- **Prisma v6 ORM** with PostgreSQL datasource; `bam_dev` database created locally
- **Initial migration applied** — four Phase 4A tables live in PostgreSQL:
  - `users` — registered player accounts (id, username, password_hash, created_at, last_login)
  - `private_worlds` — save world containers per player (id, owner_user_id, name, created_at)
  - `private_world_saves` — named save slots within a world (id, world_id, slot_name, state_json, saved_at); UNIQUE(world_id, slot_name)
  - `settings` — per-user preferences that survive across worlds (user_id PK, settings_json)
- **Prisma client singleton** in `server/lib/db.js` — one shared connection pool
- **Health check endpoint** — `GET /api/health` returns `{ ok: true, time }` to confirm server is up
- **CORS configured** — accepts requests from localhost Live Server origins only
- **Secrets management** — `server/.env` holds DATABASE_URL and JWT_SECRET; both `.gitignore` files exclude it from the repo
- **bcryptjs** used in place of native `bcrypt` (pure JS, identical API, no native build required on Windows)

---

## Phase 4A — Session 2: JWT Authentication ✅

- **`server/middleware/auth.js`** — `requireAuth` middleware; reads `Authorization: Bearer <token>`, calls `jwt.verify()`, attaches `req.user = { userId, username }` to the request; returns 401 on missing/invalid/expired tokens (no distinction to prevent info leakage)
- **`server/routes/auth.js`** — three endpoints mounted at `/api/auth`:
  - `POST /api/auth/register` — Zod validation (username 3–20 chars alphanumeric+underscore, password 8–128), bcrypt hash cost 12, Prisma transaction creates `users` + `settings` rows atomically, returns 201 + JWT + `{ id, username }`; 409 on duplicate username
  - `POST /api/auth/login` — bcrypt.compare against stored hash; identical 401 "Invalid credentials" for both bad username and bad password (no enumeration); fire-and-forget `last_login` update; returns JWT + `{ id, username }`
  - `GET /api/auth/me` — protected by `requireAuth`; re-fetches user from DB with `select` to exclude `password_hash`; returns `{ id, username, created_at }`
- **Rate limiting** — `express-rate-limit` v8 (`limit: 10`, 15-minute window) applied to all three auth routes via shared `authLimiter` instance
- **`server/index.js`** — auth router mounted (`app.use('/api/auth', require('./routes/auth'))`); private-worlds and settings routes remain stubbed for Session 3

---

## Phase 4A — Session 3: Saves & Settings API ✅

- **`server/routes/privateWorlds.js`** — private world CRUD mounted at `/api/private-worlds`; all routes guarded by `requireAuth`:
  - `GET /` — returns the caller's worlds with `save_count` and `latest_saved_at` for the world picker (no save payloads)
  - `POST /` — Zod validation (name 1–128 chars, trimmed), returns the created world
  - `DELETE /:id` — single `deleteMany` with ownership filter; save slots are removed automatically via `ON DELETE CASCADE` (see follow-up below)
- **`server/routes/privateWorldSaves.js`** — save slot CRUD mounted as sub-router at `/api/private-worlds/:worldId/saves` (uses `mergeParams`); every handler first calls `assertWorldOwnership(worldId, userId)`:
  - `GET /` — list slot metadata only (no `state_json`) so the picker stays fast
  - `GET /:slot` — full save payload for one slot
  - `POST /` — `prisma.upsert()` on `(world_id, slot_name)` so saving to an existing slot overwrites (matches Phase 3 behavior); Zod requires `state_json` to be a JSON object but otherwise leaves shape to the frontend
  - `DELETE /:slot` — single-slot delete
- **`server/routes/settings.js`** — settings auto-sync endpoint at `/api/settings`:
  - `GET /` — returns `{ settings_json }`, defaults to `{}` if the row is somehow missing
  - `PUT /` — full replace (idempotent); separate rate-limiter (`120 req/min`) since the frontend will hit this on every settings change debounced ~500ms
- **`server/index.js`** — both new routers mounted at the previously stubbed placeholders
- **`server/smoke-test.http`** — REST Client/JetBrains-compatible end-to-end smoke chain: register → me → settings GET/PUT → worlds list/create → saves upsert/overwrite/list/get → cross-user 404 check → delete cleanup
- **`server/package.json`** — added `start` and `dev` scripts (uses native `node --watch`)
- **Design decision (docs):** Settings are auto-synced (no Save button); private world game state keeps manual save slots; future global world (Phase 4B+) will be always-live following the same auto-sync pattern. Documented in [docs/backend-architecture.md](backend-architecture.md) "Settings Sync" and [docs/roadmap.md](roadmap.md) Phase 4A.

*Follow-up resolved in same session:* Migration `20260515002826_cascade_owned_data` switched the three owned-data FKs (`User → PrivateWorld`, `PrivateWorld → PrivateWorldSave`, `User → Settings`) from `RESTRICT` to `CASCADE`, matching `docs/backend-architecture.md`. The world DELETE handler was simplified from a 2-step transaction to a single `deleteMany`.

*Remaining Phase 4A: Session 4 (frontend migration + login UI + world picker + one-shot importer).*

---

## Phase 4A — Session 4: Frontend Migration ✅

- **`api.js`** (new, root) — single ES-free module exposing `window.api` with auth/private-worlds/saves/settings/health calls. Token stored at `localStorage['bam_token']`. On every fetch: auto-attaches `Authorization: Bearer <token>`; on 401 it clears the token and invokes `window.onApiUnauthorized()` so the page re-renders the login overlay. Includes `api.settings.putDebounced()` (500 ms debounce) and `api.activePointer` helpers for the last-world/slot UX pointer.
- **Login / Register overlay** — full-screen, z-index 10000, two-tab form with username/password fields, server-error display, focuses username on appear.
- **World picker overlay** — lists the player's private worlds (name, slot count, last-saved timestamp). Card click → slot picker. Includes a disabled "🌐 Global World" tile captioned for Phase 4B. Inline name field creates a new world. Per-world Delete button.
- **Slot picker overlay** — per-world slot list, clicking a slot loads it; inline "new slot name" field creates a fresh seeded game and saves it under the chosen slot. Back button returns to world picker.
- **In-game save modal repointed** — `openSaveModal`/`saveToSlot`/`overwriteSlot`/`loadFromSlot`/`deleteSlot` all now hit `api.privateWorlds.saves.*` against `window._activeWorldId`. Two-click overwrite confirm preserved.
- **Settings auto-sync** — `saveSettings()` now calls `api.settings.putDebounced` (no Save button); `loadSettings()` is async and pulls from the server after auth succeeds. The settings modal's existing change handlers (spawn rate slider, AVL color pickers, unit-type color pickers) all flow through `saveSettings()` so they sync automatically.
- **One-shot localStorage importer** — on first login per browser, scans for legacy `bam_save_*` keys and offers to import them into a new "Imported Saves" world. Migrates legacy `bam_settings` payload to the server too. Marks `bam_migration_handled = "imported" | "dismissed"` so the modal never reappears on this browser.
- **Bootstrap flow** — page-load no longer auto-loads any save. Instead: `_bootstrapAuth()` decides between login overlay (no/expired token) and the world picker (`api.auth.me()` succeeds). The map, sidebar, layer controls, and game clock initialize behind the overlay so loading a save shows instant feedback.
- **`localStorage` keys post-Session-4** — only `bam_token`, `bam_active_world_id`, `bam_active_slot_name`, `bam_migration_handled` remain. All `bam_save_*` and `bam_settings` keys are removed after import/dismiss.
- **CORS verified** — `Access-Control-Allow-Origin: http://localhost:5500` preflight OK against the live server.

*Phase 4A complete.* Next: Phase 4B (groups, global stations/units, Socket.IO).

---

## Phase 5A — Unit List, Unit Details, DC Unit Prefixes ✅

Pure-UI sub-phase of Phase 5. The personnel data model (Phase 5B) doesn't exist yet, so the staffing/personnel fields in this UI are intentionally stubbed with "Phase 5B" hints — the surfaces are wired and ready to consume that data once it lands.

- **`units.js`** (new, root) — owns unit-centric display logic that spans stations: prefix resolution, Unit List rendering, and the Unit Details modal. Stations.js stays focused on station-level CRUD and the in-sidebar pill rendering.
- **DC Unit Prefixes** — Each dispatch center has a `unitPrefix` (string, optional) and a `prefixFormat` (`bracket` | `dash` | `space`). DC create/edit modal exposes both fields. Units at any station whose ESN belongs to that DC display the prefix automatically (e.g. `[SUSQ] E-52`).
- **Display-name pipeline** — A single helper `getUnitDisplayName(unit, station)` is applied at every visible surface: station-list pills, AVL map labels, map tooltips, dispatch modal (enroute rows + available rows), transport dropdowns, prisoner-transport dispatch rows, Manage Station unit rows, and the new Unit List + Unit Details modal. Internal `unit.name` is unchanged — prefix is purely a display layer.
- **DC override + conflict notice** — When a station's ESNs are covered by multiple DCs, the Manage Station modal shows a "Dispatch Center for Unit Prefixes" picker; the chosen DC is persisted on `station.preferredDCId`. Until the player picks, a ⚠ DC conflict tag appears on the station in the Manage Station modal and the Unit List, and `getStationDC()` falls back to the first matching DC by creation order so prefixes still render. Clearing the override returns to auto-pick.
- **Unit List tab** — New top-level tab in the Operations Modal (Stations | **Units** | Facilities | Operations). Filters: search (callsign / station / type / DC), unit type dropdown, status dropdown. Sort: by station, by type, by status, by callsign. Rows are clickable and show DC + prefix + conflict badge inline.
- **Unit Details modal** — Opens from: station-list pills (left-click), Manage Station unit row (ℹ︎ button), AVL map labels (click the label), dispatch modal enroute row (click the name), dispatch modal available row (ℹ︎ button), prisoner-transport dispatch row (click the name), and Unit List rows. Shows: status with live ETAs (per phase: enroute / on-scene / transporting / offloading / returning), callsign with rename input + display preview, type / tags / provider / personnel placeholder / transport capacity, resolved DC + prefix, conflict notice if any, and actions (toggle service, jump to Manage Station, focus on map when animating).
- **Station-pill click reassigned** — Pills in the sidebar station list now open Unit Details on left-click. Shift+click preserves the legacy OOS toggle shortcut.
- **Save schema (private worlds)** — DC payload gains `unitPrefix` and `prefixFormat`; station payload gains `preferredDCId`. Older saves missing these fields default to `''` / `'bracket'` / `null` on load — backward compatible, no migration required.
- **Live updates** — `_tickGameClock()` calls `_updateUnitDetailsModal()` (re-renders only when modal is open and the rename input isn't focused) and re-renders the Unit List only while the Units tab is visible.

*Phase 5A is the UI skeleton.* No playtest yet — per agreement, Phase 5 ships as a whole at the end of 5E.

*Last updated: 2026-05-15. Phase 5A complete — Unit List, Unit Details, DC prefixes, per-station DC override.*

---

## Phase 5B — Career Personnel, Certifications, Crew Slot Gating ✅

Personnel data model and crew gating layer. Volunteers are still 5D; this sub-phase is career-only. Per agreement, no mid-phase playtest — the staffing surfaces shipped here will be evaluated as part of the full Phase 5 whole.

- **`personnel.js`** (new, root, ~1,185 lines) — owns the `personnel[]` top-level array, cert taxonomy helpers, the greedy crew matcher, auto-staff/batch-hire economics, the Personnel tab in the Operations Modal, and the per-station / per-unit roster summary renderers. Loaded after `units.js`, before `esn.js`.
- **Cert taxonomy expanded in `config.js`** — `BAM_CONFIG.certifications` rebuilt from the 8-entry Phase 5A stub into the full fire / EMS / police / shared ladder from Phase5.md. Each cert now carries `label`, `category`, `cost`, `prereqs[]`, and `satisfies[]`. `satisfies` is walked transitively by `expandCertSet()` so Paramedic counts as AEMT/EMT/EMR, FF2 counts as FF1/Exterior/Support, Large EVOC counts as Small EVOC, HazMat Tech counts as Ops/Awareness, etc.
- **Crew defaults in `config.js`** — New `BAM_CONFIG.crewDefaults` keyed by `unitTypes` id. Each entry has `driverCert` (hard gate cert that must be held by at least one crew member or the apparatus literally cannot move), `min` (slot map required to dispatch), and `ideal` (slot map for normal staffing). One person fills exactly one slot — even multi-cert responders count once — and the greedy matcher handles equivalency. Per-unit overrides via `unit.crewMin` / `unit.crewIdeal` take precedence.
- **Policy defaults** — Added `idealCrewWaitMs` (global default 10 min), `stationStaffingTypes` (`career` / `combination` / `volunteer` — volunteer behavior lands in 5D), and `personnelHireCostBase` ($2,000 flat per career responder, on top of cert training costs). Name pools (`firstNames` / `lastNames`) added for auto-generated rosters; players can rename any responder anytime.
- **Station schema additions** — `station.stationType` (`career` default), `station.idealCrewWaitMs` (null = inherit global). Cascaded into save/load and `recreateStation()` with legacy-save defaults so pre-5B saves load unchanged.
- **Unit schema additions** — `unit.crewMin`, `unit.crewIdeal`, `unit.pinnedPersonnelIds[]`, `unit.idealCrewWaitMs`, `unit.staffingPolicy` (default `wait_then_min`). All default to inherit; nulls mean "use crewDefaults / station / global". Save/load round-trip clean.
- **Starter roster on station create** — `generateStarterRoster()` auto-staffs newly built stations to ideal across all their units at no extra charge (player-confirmed flow). Cashflow modal logs the hire count. Volunteer/combination behavior lands in 5D.
- **Personnel tab** — New top-level tab in the Operations Modal (Stations | Units | **Personnel** | Facilities | Operations). Filters: search (name/rank/cert), station dropdown, cert dropdown. Sort: by station, name, rank, certs, status.
- **Add Person modal** — Single-hire and batch-hire flows. Cost = `personnelHireCostBase` + Σ selected cert costs. Hire is blocked if money is short. Player picks station, name (or auto-generate from name pools), preferred service (`fire` / `ems` / `either`), and starting certs.
- **Crew matcher (`hasMinimumCrew` / `hasIdealCrew`)** — Greedy bipartite slot matcher. Returns `{ ok, hasDriver, missing }`. Equivalency-aware. Used everywhere staffing is evaluated.
- **Dispatch modal staffing gate** — Each available unit row now shows a staffing badge: 🚫 No driver / 🔴 Needs (missing slots) / 🟡 Min only / 🟢 Ideal. **Driver missing is a hard block.** Below-min crew shows an "Override (respond understaffed)" checkbox per row that lets the player force-dispatch one unit at a time — auto-dispatch never auto-overrides. Mid-call redirects (units already `dispatched` / `returning`) skip the gate because their crew is already committed. `executeDispatch()` enforces the same gate as a pre-flight check.
- **Auto-dispatch behavior** — Filters out understaffed and no-driver units. Surfaces `⚠️ N unit slot(s) could not be auto-filled` when nearby coverage is short on crew, so the player knows to crew up or override manually.
- **Crew lifecycle hooks** — `assignPersonnelToUnit()` runs at dispatch and marks the matched crew `status='busy'` on the incident; `releasePersonnelFromUnit()` runs in `onUnitReturned()` and flips them back to `available`. Save data flushes busy → available on persist so save/reload doesn't strand crew.
- **Manage Station modal additions** — Per-station personnel summary block (rendered via `renderManageStationPersonnelHTML()`) plus a per-unit staffing chip on every unit row. Unit Details modal now embeds the actual crew roster (via `renderUnitCrewRosterHTML()`), replacing the Phase-5A "(staffing in Phase 5B)" placeholder.
- **Cascade on station delete** — `cascadeDeletePersonnelForStation(stationId, { force:true })` removes all personnel attached to the station and the status line reports the count alongside the refund. Lines up with the force-delete escape hatch in docs/data-lifecycle.md.
- **Save schema (private worlds)** — `buildSaveData()` adds a top-level `personnel` array; `loadFromSlot()` hydrates it. Pre-5B saves load with `personnel = []` (back-compat). Station/unit staffing fields and `preferredDCId` now round-trip explicitly.

*Phase 5B complete.* Next: 5C (training UI, career shifts, ranks, salary/training cashflow).

*Last updated: 2026-05-17. Phase 5B complete — career personnel, full cert taxonomy, crew matcher, driver+min gating, Personnel tab.*
