// Private world save slot routes.
// Mounted under /api/private-worlds/:worldId/saves by privateWorlds.js.
//
// Every request first verifies the caller owns :worldId. Slot names are
// player-defined and unique within a world (enforced by a DB unique index
// on (world_id, slot_name)).

const express = require('express');
const { z }   = require('zod');

const db = require('../lib/db');

// mergeParams: true lets us read :worldId from the parent router's mount.
const router = express.Router({ mergeParams: true });

// ── Validation ────────────────────────────────────────────────────────────────
// state_json is intentionally permissive — the frontend defines the save
// shape (stations, units, ESN zones, etc.) and we don't want to lock it.
// We do require it to be a JSON object so we can store and query it sanely.
const upsertSaveSchema = z.object({
  slot_name:  z.string().trim().min(1, 'Slot name is required').max(64, 'Slot name must be at most 64 characters'),
  state_json: z.record(z.string(), z.unknown()),
});

// ── Ownership helper ──────────────────────────────────────────────────────────
// Returns the world id if the caller owns it, otherwise null. Used by every
// handler in this file as the very first check. 404 is the response in both
// "world doesn't exist" and "world isn't yours" cases — never leak which.
async function assertWorldOwnership(worldIdParam, userId) {
  const worldId = Number(worldIdParam);
  if (!Number.isInteger(worldId) || worldId <= 0) return null;

  const world = await db.privateWorld.findFirst({
    where:  { id: worldId, owner_user_id: userId },
    select: { id: true },
  });
  return world ? worldId : null;
}

// ── GET /api/private-worlds/:worldId/saves ────────────────────────────────────
// Returns slot metadata only (no state_json) so the picker stays fast.
// Response: [ { slot_name, saved_at } ]
router.get('/', async (req, res) => {
  const worldId = await assertWorldOwnership(req.params.worldId, req.user.userId);
  if (!worldId) return res.status(404).json({ error: 'World not found' });

  const saves = await db.privateWorldSave.findMany({
    where:   { world_id: worldId },
    select:  { slot_name: true, saved_at: true },
    orderBy: { saved_at: 'desc' },
  });

  return res.json(saves);
});

// ── GET /api/private-worlds/:worldId/saves/:slot ──────────────────────────────
// Returns the full save payload for one slot.
// Response: { slot_name, saved_at, state_json }
router.get('/:slot', async (req, res) => {
  const worldId = await assertWorldOwnership(req.params.worldId, req.user.userId);
  if (!worldId) return res.status(404).json({ error: 'World not found' });

  const save = await db.privateWorldSave.findUnique({
    where:  { world_id_slot_name: { world_id: worldId, slot_name: req.params.slot } },
    select: { slot_name: true, saved_at: true, state_json: true },
  });

  if (!save) return res.status(404).json({ error: 'Save slot not found' });

  return res.json(save);
});

// ── POST /api/private-worlds/:worldId/saves ───────────────────────────────────
// Upserts on (world_id, slot_name): saving to an existing slot overwrites it,
// matching the current Phase 3 frontend behavior (overwrite by name).
// Body:     { slot_name, state_json }
// Response: { slot_name, saved_at }
router.post('/', async (req, res) => {
  const worldId = await assertWorldOwnership(req.params.worldId, req.user.userId);
  if (!worldId) return res.status(404).json({ error: 'World not found' });

  const result = upsertSaveSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten().fieldErrors });
  }

  const { slot_name, state_json } = result.data;

  const save = await db.privateWorldSave.upsert({
    where:  { world_id_slot_name: { world_id: worldId, slot_name } },
    create: { world_id: worldId, slot_name, state_json },
    update: { state_json },   // saved_at auto-updates via @updatedAt in schema
    select: { slot_name: true, saved_at: true },
  });

  return res.status(200).json(save);
});

// ── DELETE /api/private-worlds/:worldId/saves/:slot ───────────────────────────
router.delete('/:slot', async (req, res) => {
  const worldId = await assertWorldOwnership(req.params.worldId, req.user.userId);
  if (!worldId) return res.status(404).json({ error: 'World not found' });

  const { count } = await db.privateWorldSave.deleteMany({
    where: { world_id: worldId, slot_name: req.params.slot },
  });

  if (count === 0) return res.status(404).json({ error: 'Save slot not found' });

  return res.status(204).end();
});

module.exports = router;
