// Private worlds CRUD routes.
// A "private world" is a single-player game container — only the owner can
// see, modify, or play in it. Save slots live inside a world (see
// privateWorldSaves.js, mounted as a sub-router below).
//
// All routes require Authorization: Bearer <token>. Ownership is checked
// on every read and mutation by filtering on owner_user_id = req.user.userId.

const express = require('express');
const { z }   = require('zod');

const db          = require('../lib/db');
const requireAuth = require('../middleware/auth');
const savesRouter = require('./privateWorldSaves');

const router = express.Router();

// Every route on this router requires a valid JWT.
router.use(requireAuth);

// Nested save-slot routes: /api/private-worlds/:worldId/saves...
// The saves router uses mergeParams to read :worldId from this mount.
router.use('/:worldId/saves', savesRouter);

// ── Validation ────────────────────────────────────────────────────────────────
// World names are player-defined and visible only to the owner — trim
// whitespace and cap length but otherwise allow any printable text.
const createWorldSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(128, 'Name must be at most 128 characters'),
});

// ── GET /api/private-worlds ───────────────────────────────────────────────────
// Returns: [ { id, name, created_at, save_count, latest_saved_at } ]
// Lightweight — does not include save state.
router.get('/', async (req, res) => {
  const worlds = await db.privateWorld.findMany({
    where:   { owner_user_id: req.user.userId },
    orderBy: { created_at: 'asc' },
    include: {
      // Pull just enough save metadata to show "last played" on the picker.
      saves: {
        select:  { saved_at: true },
        orderBy: { saved_at: 'desc' },
        take:    1,
      },
      _count: { select: { saves: true } },
    },
  });

  // Flatten the Prisma result into a clean response shape.
  const out = worlds.map((w) => ({
    id:              w.id,
    name:            w.name,
    created_at:      w.created_at,
    save_count:      w._count.saves,
    latest_saved_at: w.saves[0]?.saved_at ?? null,
  }));

  return res.json(out);
});

// ── POST /api/private-worlds ──────────────────────────────────────────────────
// Body:    { name }
// Returns: { id, name, created_at }
router.post('/', async (req, res) => {
  const result = createWorldSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten().fieldErrors });
  }

  const world = await db.privateWorld.create({
    data: {
      owner_user_id: req.user.userId,
      name:          result.data.name,
    },
    select: { id: true, name: true, created_at: true },
  });

  return res.status(201).json(world);
});

// ── DELETE /api/private-worlds/:id ────────────────────────────────────────────
// Removes the world; save slots cascade-delete via the FK (ON DELETE CASCADE).
// 404 is returned both when the world doesn't exist AND when it belongs to
// another user — never reveal which.
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid world id' });
  }

  // deleteMany combines existence and ownership check in one query — if zero
  // rows match, the world either doesn't exist or isn't ours.
  const { count } = await db.privateWorld.deleteMany({
    where: { id, owner_user_id: req.user.userId },
  });

  if (count === 0) return res.status(404).json({ error: 'World not found' });

  return res.status(204).end();
});

module.exports = router;
