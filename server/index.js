// Express entry point for the By Any Means backend.
// Phase 4A: health check only. Auth and save/load routes added in Sessions 2 & 3.

require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

// Accept requests from the game frontend on:
//   - localhost / 127.0.0.1 (developer machine)
//   - any RFC1918 LAN IP (10.0.0.0/8, 172.16-31.0.0/12, 192.168.0.0/16)
// This lets other devices on the home network play without re-configuring
// the server. To open the game to the public internet, replace this with
// an explicit allowlist of trusted origins.
const LAN_ORIGIN_RE = /^http:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+)(?::\d+)?$/;
app.use(cors({
  origin: (origin, cb) => {
    // Tools like curl and same-origin requests send no Origin header.
    if(!origin) return cb(null, true);
    if(LAN_ORIGIN_RE.test(origin)) return cb(null, true);
    return cb(new Error('CORS: origin not allowed: ' + origin));
  },
  credentials: true,
}));

// Parse JSON request bodies.
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/private-worlds', require('./routes/privateWorlds'));
app.use('/api/settings',       require('./routes/settings'));

// ── 404 fallback ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`BAM server running on http://localhost:${PORT}`);
});
