// Settings routes — per-user preferences (spawn rate, AVL colors, etc.).
// Settings are NOT a game save — they persist across all worlds and slots.
//
// Auto-sync contract (Phase 4A Session 3 design decision):
//   The frontend calls PUT /api/settings on every settings change, debounced
//   ~500ms. There is no Save button for settings; they just persist.
//   See docs/backend-architecture.md "Settings Sync" for the full contract.

const express       = require('express');
const { z }         = require('zod');
const { rateLimit } = require('express-rate-limit');

const db          = require('../lib/db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Because the client debounces and sends a PUT on every settings change, this
// endpoint is much chattier than auth. A generous 120-per-minute ceiling still
// catches runaway loops while leaving plenty of headroom for normal use.
const settingsLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute window
  limit: 120,                   // 120 requests per IP per minute
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// ── Validation ────────────────────────────────────────────────────────────────
// settings_json shape is owned by the frontend (spawn rate, AVL colors, etc.).
// We only require it to be a JSON object so we can store it as-is.
const putSettingsSchema = z.object({
  settings_json: z.record(z.string(), z.unknown()),
});

// ── GET /api/settings ─────────────────────────────────────────────────────────
// Returns: { settings_json }
// Defensively returns {} if the row is missing — registration creates the row,
// so this shouldn't happen, but we don't want a 500 if it ever does.
router.get('/', async (req, res) => {
  const row = await db.settings.findUnique({
    where:  { user_id: req.user.userId },
    select: { settings_json: true },
  });

  return res.json({ settings_json: row?.settings_json ?? {} });
});

// ── PUT /api/settings ─────────────────────────────────────────────────────────
// Body:    { settings_json }  — full replacement, not a merge
// Returns: { settings_json }  — echo the saved value
router.put('/', settingsLimiter, async (req, res) => {
  const result = putSettingsSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten().fieldErrors });
  }

  const { settings_json } = result.data;

  // Upsert covers the (theoretically impossible) case where the settings row
  // was never created at registration. Keeps the endpoint idempotent.
  const saved = await db.settings.upsert({
    where:  { user_id: req.user.userId },
    create: { user_id: req.user.userId, settings_json },
    update: { settings_json },
    select: { settings_json: true },
  });

  return res.json(saved);
});

module.exports = router;
