// Express entry point for the By Any Means backend.
// Phase 4A: health check only. Auth and save/load routes added in Sessions 2 & 3.

require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

// Only accept requests from the game frontend (localhost in dev).
app.use(cors({
  origin: [
    'http://localhost:5500',   // VSCode Live Server default
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ],
  credentials: true,
}));

// Parse JSON request bodies.
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ── Routes (added in Sessions 2 & 3) ─────────────────────────────────────────
// app.use('/api/auth',           require('./routes/auth'));
// app.use('/api/private-worlds', require('./routes/privateWorlds'));
// app.use('/api/settings',       require('./routes/settings'));

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
