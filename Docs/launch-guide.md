# Launch Guide — By Any Means

How to start the game, host it for another computer on your home network, and roll out new code as you build more content. This is the day-to-day reference — start here whenever you sit down to play or develop.

---

## 1. What's running where

By Any Means is now a two-part app:

| Part | What it does | Port | How it's started |
|---|---|---|---|
| **PostgreSQL** | Stores accounts, private worlds, save slots, and settings | 5432 | Auto-starts with Windows (installed as a service) |
| **Backend API** | Node.js + Express; talks to Postgres | **3001** | `npm run dev` (or `npm start`) inside `server/` |
| **Frontend** | `index.html` + JS files served as static files | **5500** | VSCode "Live Server" extension — right-click `index.html` → "Open with Live Server" |

You always need all three running. If any one of them is down, the game won't load.

---

## 2. First-time setup (already done — keep for reference)

Run these once on a fresh machine. Skip if you've already played the game.

### 2.1 Install the runtimes

- **Node.js LTS** (any 18.x or newer) — `node --version` should print something
- **PostgreSQL 18** — make sure the service is set to "Automatic" so it boots with Windows
- **VSCode** + the **Live Server** extension by Ritwick Dey

### 2.2 Create the database

```powershell
# In a PowerShell window, replace <pgpass> with your Postgres superuser password
psql -U postgres -c "CREATE DATABASE bam_dev;"
```

### 2.3 Configure backend secrets

Edit `server/.env` (already created locally, **never committed to git**):

```
DATABASE_URL="postgresql://postgres:<pgpass>@localhost:5432/bam_dev"
JWT_SECRET="<a long random string — at least 32 chars>"
PORT=3001
```

### 2.4 Install backend dependencies and apply the schema

```powershell
cd server
npm install
npx prisma migrate deploy   # applies every existing migration
```

That's it for setup. From here every play session is just step 3.

---

## 3. Daily launch (play locally)

1. **Verify Postgres is running.** Open Services (`Win+R` → `services.msc`), find "postgresql-x64-18", make sure status is "Running". If not, right-click → Start. *(Should be automatic if you set the service to auto-start.)*

2. **Start the backend.** Open a terminal in the project root:
   ```powershell
   cd server
   npm run dev
   ```
   You should see: `BAM server running on http://localhost:3001`. Leave this window open while playing.

3. **Start Live Server.** In VSCode, right-click `index.html` → **Open with Live Server**. It opens `http://127.0.0.1:5500/index.html` in your default browser.

4. **Log in.** First time on a new install you'll register; on subsequent loads the saved token logs you straight to the world picker.

5. **Play.** Pick or create a private world, pick a save slot, and go.

To stop: close the browser tab, close Live Server (status bar at the bottom of VSCode → "Port: 5500" → click to stop), and `Ctrl+C` in the backend terminal. Postgres can keep running.

---

## 4. Playing from another computer on your home network

The setup already supports this — the backend's CORS accepts any LAN IP, and `api.js` derives the API URL from whatever address the page was loaded from.

### 4.1 Find your host PC's LAN IP

On the PC running the server, open PowerShell:

```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notmatch 'Loopback|vEthernet'}).IPAddress
```

You'll get something like `192.168.1.42`. That's your "host IP" — write it down.

### 4.2 Make Live Server accept LAN connections

By default Live Server binds to `127.0.0.1` only (host-only). To let other devices connect, in VSCode:

1. `File → Preferences → Settings`
2. Search for **liveServer.settings.host**
3. Set it to `0.0.0.0`
4. Restart Live Server

Alternatively, edit `.vscode/settings.json` in the project:
```json
{ "liveServer.settings.host": "0.0.0.0", "liveServer.settings.port": 5500 }
```

### 4.3 Allow Windows Firewall through

The first time another device tries to connect, Windows Firewall blocks it silently. Open it up:

```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "BAM Frontend (Live Server 5500)" -Direction Inbound -Protocol TCP -LocalPort 5500 -Action Allow
New-NetFirewallRule -DisplayName "BAM Backend API (3001)"          -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
```

You only need to do this once.

### 4.4 Connect from the other device

On the second PC, phone, or tablet, open a browser to:

```
http://<host-ip>:5500/index.html
```

Example: `http://192.168.1.42:5500/index.html`. Log in with your account. The browser will hit `http://192.168.1.42:3001/api/...` for backend calls automatically — no config needed on the client device.

**Things that won't work from a non-host device:** the VSCode editor itself (obviously). But the game is fully playable.

---

## 5. Pushing updates as you add content

The whole point of Phase 4A was to set up a foundation you can keep iterating on. Here's the cadence for different kinds of changes.

### 5.1 Pure frontend tweaks (CSS, UI text, a new feature in `index.html` or one of the `*.js` files)

1. Save the file.
2. Reload the browser tab. Live Server auto-refreshes on save anyway.
3. Done.

No server restart needed. No DB changes needed. This is 90% of game-content work.

### 5.2 Backend route changes (new API endpoint, validation tweak)

1. Save the file in `server/routes/...`.
2. If you ran `npm run dev`, the server auto-restarts (native `node --watch`). If you ran `npm start`, Ctrl+C and re-run.
3. Reload the browser tab.

### 5.3 Database schema changes (new table, new column, FK change)

This is the only flow that touches durable state. Plan ahead — migrations are immutable once shipped.

1. Edit `server/prisma/schema.prisma`.
2. From `server/`:
   ```powershell
   npx prisma migrate dev --name <short_snake_case_description>
   ```
   That generates a new SQL file under `server/prisma/migrations/` and applies it to your local `bam_dev` database in one step.
3. Commit both the schema change AND the new migration folder.

Schema changes against **shared** state (after you have other players) get more careful — communicate before shipping, and avoid breaking existing rows.

### 5.4 New dependency

```powershell
cd server
npm install <package>
```

Then commit `package.json` AND `package-lock.json` together.

### 5.5 Routine commit + push

Use your usual git workflow — nothing about Phase 4A changes the commit cadence. Reminders:

- **Never commit `server/.env`** — it's in `.gitignore` for a reason. JWT secrets and DB credentials are local-only.
- `server/prisma/migrations/` IS committed; that's how the schema replays on any clone.
- `server/node_modules/` is NOT committed; `npm install` rebuilds it from `package-lock.json`.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Login spinner spins forever | Backend not running | Restart `npm run dev` in `server/` |
| Browser shows "Network error — is the server running?" | Same as above, OR backend crashed | Check the backend terminal output |
| "Invalid credentials" but you're sure of the password | Account doesn't exist on this DB | Use the **Register** tab instead of Login |
| Page won't load on second PC | Live Server bound to 127.0.0.1 only | See §4.2 — set host to `0.0.0.0` |
| Other PC reaches the page but login fails | Windows Firewall blocking 3001 | See §4.3 — open the firewall rule |
| Backend prints `P1001: Can't reach database` | Postgres service is stopped | Start the `postgresql-x64-18` service |
| Backend prints `P2002: unique constraint` | Tried to register a username that exists | Choose another username |
| Got a 401 mid-game out of nowhere | JWT expired (7-day lifetime) or token was cleared | The app should auto-show the login screen; sign in again |
| Stale save modal shows old saves on a fresh login | Migration importer didn't run | Open DevTools → Application → Local Storage → delete `bam_migration_handled`, reload |
| Schema mismatch error from Prisma | A migration was created on another machine but not run here | `cd server && npx prisma migrate deploy` |
| Want to wipe everything and start over | Dev DB only — fine to nuke | `psql -U postgres -c "DROP DATABASE bam_dev;" -c "CREATE DATABASE bam_dev;"` then `npx prisma migrate deploy` |

---

## 7. Future: hosting on the public internet

When you're ready to let strangers play (Phase 4D in `docs/roadmap.md`):

- Move the backend to a small cloud VM, container service, or platform like Railway.app / Fly.io (both have free tiers that fit this app).
- Tighten the CORS regex in `server/index.js` to an explicit allowlist (your real domain only).
- Get a free TLS cert via Cloudflare or Let's Encrypt — `Authorization: Bearer` over plain HTTP is unsafe outside the LAN.
- Move secrets out of `.env` into the host's secret manager.
- Put Cloudflare in front for free DDoS protection and bot filtering.

Don't worry about any of this until Phase 4C is done.

---

## 8. Quick reference

```
Local play (single PC):
  http://127.0.0.1:5500/index.html

LAN play (other device):
  http://<host-pc-lan-ip>:5500/index.html

Backend health probe:
  curl http://localhost:3001/api/health

Smoke-test the API end-to-end:
  Open server/smoke-test.http in VSCode with the REST Client extension.

Stop everything cleanly:
  Ctrl+C in backend terminal · "Port: 5500" status-bar click in VSCode
  (Postgres can stay running.)
```
