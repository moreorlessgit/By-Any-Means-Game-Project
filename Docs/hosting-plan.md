# Hosting Plan — By Any Means

Long-term plan for getting the game off the local PC and onto cloud hosting. Kept separate from the daily-launch and feature-roadmap docs because most dev work doesn't need to touch this.

For day-to-day "how do I run the game" steps, see **docs/launch-guide.md**.

---

## Current state

The game runs on the player's home PC:

- Backend (Node + Express) on `localhost:3001`
- Frontend (Live Server) on `localhost:5500`
- PostgreSQL 18 as a Windows service
- LAN access available; no WAN / public internet exposure

This is fine through most of remaining feature development. Migration to cloud hosting is a deliberate future step, not a pressing need.

---

## Near-term plan: Railway Hobby

When the base game is mature enough to share with friends regularly, migrate to **Railway** (railway.app).

### Why Railway over alternatives

- **Friendly UI** — web dashboard, no CLI required for routine work
- **One platform for everything** — backend, Postgres, env vars, logs in one dashboard
- **GitHub auto-deploy** — every push to `main` builds + deploys in ~60–90 seconds
- **Realistic price for personal scale** — $5–10/month all-in
- **WAN access** — playable from work, phone, anywhere, on HTTPS
- **Custom domain support** — point a real domain at the Railway URL when ready
- **Removes home-network exposure** — no port forwarding, no residential IP risk

Fly.io was considered and is technically comparable, but Fly's **managed** Postgres tier is ~$35–40/mo (much higher than expected at first glance), and the Fly UI is more developer-focused. Railway is the better fit for the "small scale, friendly UI" use case.

### Expected monthly cost

| Component | Estimate |
|---|---|
| Node backend (512MB RAM, low CPU avg) | ~$4.50/mo |
| Postgres (512MB RAM, 1GB storage) | ~$4.00/mo |
| Bandwidth (<5GB outbound) | $0 (100GB included) |
| Build minutes (<10 hr) | $0 (500 included) |
| **Total** | **~$8.50/mo** |

Hobby plan minimum is **$5/mo** (includes $5 of usage credit). Actual bill lands between $5 and $10 depending on uptime and activity.

### Frontend hosting

Plan: **Railway serves both backend and frontend** from the same service.

- Simplest setup, one URL, one bill
- Bandwidth cost for static files is trivial at this scale
- If/when commercial traffic ever justifies it, splitting frontend onto Vercel/Netlify (free CDN) is easy

### Pre-flight checklist (work needed before first deploy)

Roughly one focused session of codebase prep:

- [ ] Environment variable handling — Railway auto-injects `DATABASE_URL`; backend reads from `process.env`
- [ ] `config.js` needs an API base URL toggle (localhost in dev, Railway URL in prod)
- [ ] CORS allowlist updated to include the Railway frontend URL
- [ ] `start` script in `server/package.json` that Railway runs in production
- [ ] Prisma `binaryTargets` set for Linux x64 deploy environment (common gotcha)
- [ ] Prisma connection pool tuning (`?connection_limit=10` in `DATABASE_URL`)
- [ ] Decide migration path for local Postgres data (probably: start fresh on Railway; local DB stays as dev sandbox)

### Deploy flow once set up

1. Code changes locally, tested via Live Server
2. `git push origin main`
3. Railway builds + deploys automatically (~60–90 sec)
4. Live in production
5. One-click rollback in dashboard if something breaks

No SSH, no manual file copying. Standard git workflow.

---

## Scaling on Railway

Numbers below are educated estimates for typical Node + Socket.IO + Postgres apps with real-time simulation. Actual capacity depends on tick rate, simulation complexity, and per-player state size. Real measurement once deployed will refine these.

| Tier | Monthly cost | Setup | Realistic concurrent players | Realistic registered users |
|---|---|---|---|---|
| Hobby (start here) | $5–10 | 1 instance, 512MB–1GB RAM, small Postgres | 20–50 | 200–500 |
| Hobby+ | $20–40 | 1 instance, 2GB RAM, dedicated vCPU | 100–250 | 1,000–2,500 |
| Pro | $100–300 | 2–4 instances behind LB, pgBouncer, 4GB Postgres | 500–1,500 | 5,000–15,000 |
| Heavy commercial | $500–2,000+ | 4+ instances, Redis Socket.IO adapter, read replicas | 2,000–10,000+ | 50,000+ |

### Where the scaling walls actually are

- **~50 concurrent:** Postgres default connection limit (~20). Fix with pool tuning. Cheap.
- **~250 concurrent:** Single Node.js process saturates one CPU core under simulation load. Fix with dedicated vCPU + tick optimization.
- **~500 concurrent:** Single Node instance can't handle Socket.IO connection volume. Fix requires horizontal scaling + Redis adapter for Socket.IO + sticky sessions. **Real architectural work.**
- **~1,500 concurrent:** Postgres write throughput. Fix with pgBouncer + read replicas + possibly Redis for hot ephemeral state.
- **~5,000 concurrent:** Server-side simulation tick. Fix by sharding worlds across instances.

### Private vs shared worlds — critical distinction

- **Private worlds** scale near-infinitely. Each player is isolated; 1,000 private-world players is essentially 1,000 lightweight DB rows. Trivial.
- **Shared / global worlds** are where real concurrency challenges live. The tier numbers above mostly apply to shared-world concurrency.

A product weighted toward private worlds with optional shared content scales much further on the same hardware than the table suggests.

---

## Going commercial — challenges

If the project ever moves from "personal + friends" to "paying subscribers," several non-trivial issues need addressing. None of these matter for the personal use case; this section exists so future-you isn't surprised.

### 1. Public OSRM and Overpass APIs are not commercially usable

**This is the single biggest architectural shift required to commercialize.**

- **OSRM public server** has a polite-use policy: ~1 req/sec, no commercial use, no heavy traffic. Will throttle hard at ~50 concurrent players doing dispatches.
- **Overpass public API** has similar throttling and policy restrictions.

Required before commercial launch:

- **Self-host OSRM** — Docker container, can run as a separate Railway service or a dedicated VPS. Needs an OSM data file (~200MB for one US state, ~10GB for the full US) and preprocessing time.
- **Self-host Overpass** OR aggressively cache common queries OR switch to a paid OSM data API.

Cost for self-hosted OSRM:
- One US state: ~2GB RAM, ~10GB storage → ~$10–15/mo on a separate VPS
- Full US: ~16GB RAM, ~50GB storage → ~$50–80/mo

### 2. Architectural changes for real concurrency

Beyond the routing / data issue:

- **Redis adapter for Socket.IO** — required for horizontal scaling. Multiple Node instances need pub/sub to coordinate WebSocket events.
- **Sticky sessions** on the load balancer — each player's WebSocket traffic must hit the same instance.
- **pgBouncer** — Postgres connection pooling for high concurrent write load.
- **World sharding** — at scale, one "world clock" tick loop can't serve thousands of concurrent players. Each shared world (or group of worlds) needs to run on a specific instance.

None of this is exotic, but it's real engineering work that takes weeks, not days.

### 3. Operational concerns

- **Payment processing** — Stripe (or similar), ~3% transaction fee, plus tax handling (sales tax / VAT depending on jurisdiction)
- **Customer support time** — even a small player base generates email
- **Abuse handling** — bad actors, account recovery, content moderation
- **Privacy & legal** — GDPR if EU players, ToS, refund policy, privacy policy
- **Uptime expectations** — paying customers expect things to work; this changes how casual deploys can be
- **Backups & disaster recovery** — losing a player's data is a refund event

### 4. Pricing economics check

If the subscription is $3–5/month per player:

| Scale | Subs | Revenue | Hosting | OSRM/Overpass | Net |
|---|---|---|---|---|---|
| Hobby commercial | 50 | $150–250 | $20 | $15 | +$115–215 |
| Indie scale | 500 | $1,500–2,500 | $100 | $50 | +$1,350–2,350 |
| Indie hit | 5,000 | $15K–25K | $500–800 | $100 | +$14K–24K |

The economics are healthy at every tier — *if* the users exist and the architectural prep is done.

---

## Decision criteria

### When to migrate from local to Railway

Any of:
- Friends start asking to play regularly and the "is the host PC on?" dance gets annoying
- Want to play from work or a phone reliably
- Base game features mature enough that bugs in production won't be catastrophic
- Comfortable with the deploy / rollback workflow

Not a reason on its own:
- "It would be cool" — wait until there's a real driver
- New feature development — local dev is faster and free

### When to upgrade Railway tier

Any of:
- Postgres connection errors under load
- WebSocket disconnections during active play
- Backend memory usage consistently over 75% of allocated
- Latency on game actions noticeably degrading

### When to seriously consider going commercial

All of:
- Game is feature-complete for the intended core loop
- A self-hosted OSRM / Overpass setup has been validated end-to-end
- 20+ committed beta users willing to pay
- Time available to handle ops and support
- Architectural prep work (Redis, sticky sessions, pgBouncer) understood and scoped

---

## Open questions to revisit later

- Custom domain — when, and what name?
- Migration path for existing private-world data on the local DB (probably: start fresh; local DB is just dev sandbox)
- Backup strategy beyond Railway's daily Postgres backups — offsite export cadence?
- Whether to ever offer a self-hosted / single-user install as an alternative to subscription
