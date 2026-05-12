# Security Model — By Any Means

This document covers every layer of the security architecture: what the framework handles automatically, what we build explicitly, what the server operator is responsible for, and how risk changes as the player base grows.

---

## Threat Matrix

| Threat | Layer | Mitigation | Status |
|---|---|---|---|
| SQL injection | Database | Prisma ORM parameterized queries — structurally impossible | Built-in |
| Password breach (DB leaked) | Auth | bcrypt hashing — only one-way hash stored, plain password never touches DB | Built-in |
| CSRF attacks | Auth | JWT in `Authorization` header (not cookies) — headers can't be forged by cross-site requests | Built-in |
| Token forgery | Auth | JWTs signed with server secret — fabricated tokens fail signature verification instantly | Built-in |
| Brute-force login | Auth | Rate limiting on `/api/auth/*` endpoints | Implemented |
| Insecure Direct Object Reference (IDOR) | API | Ownership check on every mutating endpoint — guessing another player's station ID gets `403` | Implemented |
| Unauthorized data read | API | All entities scoped to authenticated user; cross-user queries blocked server-side | Implemented |
| Mass assignment | API | Zod schema validation on every request body — only declared fields are accepted | Implemented |
| XSS via player content | Frontend | Player-defined names rendered as text nodes, never as HTML — no `innerHTML` with user data | Implemented |
| Unauthenticated socket access | Real-time | JWT verified at Socket.IO handshake — unauthenticated connections rejected before any room access | Implemented |
| Client-side authority | General | Server re-validates all actions — the client is never trusted, even for things like unit ownership | Implemented |
| Secrets in source code | Server | `.env` file for all secrets, `.env` in `.gitignore`, never committed | Implemented |
| Database exposed to internet | Server | PostgreSQL binds to `localhost` only — never directly reachable from outside the box | Server config |
| Compromised server (OS) | Server | Firewall, SSH key auth, OS updates — operator responsibility | Server config |
| Account takeover | Auth | Strong password requirement enforced at registration | Implemented |

---

## Auth Security

### Password Storage
- Passwords are hashed with `bcrypt` at cost factor 12
- Only the hash is stored in the database — the plain password is never persisted anywhere
- `bcrypt.compare()` is used for login; timing-safe by design
- A database breach exposes only hashes, which are computationally expensive to reverse

### JWT Tokens
- Tokens are signed with a secret key stored in `.env` — never in source code
- Token payload: `{ userId, username }` — minimal, no sensitive data
- Expiry: 7 days. Expired tokens are rejected with `401 Unauthorized`
- Tokens travel in the `Authorization: Bearer <token>` header — never in URLs or cookies
- No server-side session storage needed — the signature is the proof

### Password Requirements
- Minimum 8 characters enforced at registration
- Validated server-side — client-side validation is cosmetic only

### Rate Limiting (Auth Routes)
- `/api/auth/login` and `/api/auth/register` are rate-limited: maximum 10 requests per 15 minutes per IP
- After limit is hit: `429 Too Many Requests`
- Prevents brute-force guessing of passwords

---

## API Security

### Ownership Enforcement
Every endpoint that modifies or deletes a resource verifies that `req.userId === resource.owner_user_id`. This check is performed by the server against the database — it cannot be bypassed by the client. The check lives in the route handler, not in frontend logic.

A player cannot:
- Edit or delete another player's station, unit, or facility
- Resolve or unshare another player's incident
- Dispatch another player's units
- Read another player's private world saves

If a check fails: `403 Forbidden`. No information about the resource is returned.

### Input Validation (Zod)
Every request body is validated against a Zod schema before it reaches any database query. This means:
- Unexpected fields are stripped (no mass assignment)
- Required fields are enforced
- Type coercion is explicit — strings don't sneak into numeric fields
- Invalid requests fail with `400 Bad Request` before any DB query runs

### CORS Configuration
The Express server is configured to accept requests only from the frontend's origin. In development: `localhost`. In production: the actual domain. Random websites cannot call the API pretending to be the game client.

### General Rate Limiting
A global rate limit of 100 requests per minute per IP applies to all routes. This protects against abuse and incidental request flooding.

---

## Real-Time (Socket.IO) Security

### Connection Authentication
The JWT token is passed in the Socket.IO handshake `auth` object:
```js
const socket = io(SERVER_URL, { auth: { token } });
```
The server verifies the token before the socket connects. An invalid or missing token results in a connection refusal — the socket never joins any room.

### Server-Side Event Validation
All incoming socket events are validated server-side. A client emitting a malformed or unauthorized event gets no response and no error — silent rejection. The server never acts on unvalidated socket data.

### Group Room Scoping
Socket rooms are scoped to group IDs. A player can only join rooms for groups they are verified members of (checked against the database at join time). Broadcasting to another group's room is not possible from the client.

---

## Data Security

### Secrets Management
- JWT secret key, database connection string, and any API keys live exclusively in `server/.env`
- `.env` is in `.gitignore` and never committed to the repository
- If the `.env` file is ever accidentally committed, rotate all secrets immediately
- Production secrets are different from development secrets

### Database Access
- PostgreSQL is configured to listen on `127.0.0.1` only — never `0.0.0.0`
- No external port is exposed for the database
- Database credentials are in `.env` only

### What Is Stored
- Passwords: bcrypt hash only
- Game state: JSON in PostgreSQL — no payment data, no real personally identifiable information beyond a chosen username
- The game never asks for real names, email (for friends-only phase), or location data beyond what the player places on the map

---

## Server-Level Security (Operator Responsibility)

The application can be perfectly coded and still be compromised if the machine it runs on is not secured. These are the operator's (your) responsibilities for the home box:

**Firewall**
- Only expose ports 80 (HTTP) and 443 (HTTPS) to the internet
- Port 22 (SSH) should ideally be restricted to known IPs, or use a non-standard port
- Port 5432 (PostgreSQL) must never be exposed — localhost only
- Port 3000 (Node dev) must never be exposed — proxy through Nginx or Caddy

**SSH Hardening**
- Disable password authentication: `PasswordAuthentication no` in `/etc/ssh/sshd_config`
- Use SSH key pairs only
- Keep your private key secure

**OS and Dependency Updates**
- Keep the server OS patched — unpatched Linux is a common real-world entry point
- Run `npm audit` periodically and update dependencies with known CVEs
- Subscribe to Node.js security advisories

**Reverse Proxy (Nginx or Caddy)**
- Do not expose the Node.js process directly on port 80/443
- Run a reverse proxy in front — it handles HTTPS termination, hides the backend port, and adds a layer of protection
- Caddy is the simpler choice: automatic HTTPS via Let's Encrypt, minimal config

**Backups**
- Run `pg_dump` on a schedule and store backups somewhere off the machine (external drive, cloud storage)
- A ransomware attack or hardware failure without backups means permanent loss of all player save data

---

## Risk Assessment by Phase

### Phase 4A/4B/4C — Friends Only, Closed Registration
**Risk: Low**

- No public registration means no random attackers creating accounts
- The realistic threats are: a friend sharing credentials, a weak password, or a misconfigured server
- Ownership enforcement handles any friend trying to interact with your data
- The box being on the internet is the biggest attack surface — keep it patched

### Phase 4D — Public Registration
**Risk: Moderate — additional steps required**

When strangers can create accounts, add:
- **Email verification** — prevents throwaway account spam
- **Stricter rate limiting** — especially on registration and dispatch routes
- **Cloudflare in front** — free DDoS protection, bot filtering, hides server IP
- **Monitoring and alerting** — know when login attempts spike or unusual activity occurs
- **Account lockout** after N failed login attempts within a window
- **GDPR review** if EU players are anticipated (right to deletion, data processing disclosure)

---

## Implementation Checklist

Before Phase 4A goes live:
- [ ] `bcrypt` password hashing in place
- [ ] JWT signed with strong random secret (min 32 chars), stored in `.env`
- [ ] JWT expiry set (7 days)
- [ ] Rate limiting on auth routes
- [ ] Ownership check on every mutating endpoint
- [ ] Zod validation on every request body
- [ ] CORS restricted to frontend origin
- [ ] PostgreSQL not exposed externally
- [ ] `.env` in `.gitignore`
- [ ] Socket.IO handshake JWT verification
- [ ] Socket room membership verified against DB at join time

Before Phase 4D (public):
- [ ] Email verification on registration
- [ ] Cloudflare configured in front
- [ ] Account lockout after failed attempts
- [ ] Global rate limiting reviewed and tightened
- [ ] Monitoring and alerting in place
- [ ] GDPR review completed if applicable
- [ ] Security audit of all API routes
