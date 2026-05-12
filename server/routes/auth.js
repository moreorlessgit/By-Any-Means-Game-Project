// Auth routes: register, login, and get-current-user.
// All three endpoints share a rate limiter (10 requests per 15 min per IP)
// to slow down brute-force and credential-stuffing attempts.

const express       = require('express');
const bcrypt        = require('bcryptjs');
const jwt           = require('jsonwebtoken');
const { z }         = require('zod');
const { rateLimit } = require('express-rate-limit');

const db          = require('../lib/db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Shared across all auth endpoints. 10 attempts per IP per 15-minute window.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes in milliseconds
  limit: 10,                   // max 10 requests per window (v8 canonical key)
  standardHeaders: 'draft-8', // send RateLimit headers in the response
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// ── Validation schemas ────────────────────────────────────────────────────────
// Username: 3–20 chars, letters/numbers/underscores only.
// Password: 8–128 chars, no complexity requirements (length is the main factor).
const registerSchema = z.object({
  username: z.string()
    .min(3,  'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores'),
  password: z.string()
    .min(8,   'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

const loginSchema = registerSchema; // same shape

// ── POST /api/auth/register ───────────────────────────────────────────────────
// Body:    { username, password }
// Returns: { token, user: { id, username } }
router.post('/register', authLimiter, async (req, res) => {
  // Validate input shape and rules.
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten().fieldErrors });
  }

  const { username, password } = result.data;

  try {
    // Hash before any DB work — if hashing fails we don't want a partial insert.
    // Cost factor 12 is a good balance between security and ~300ms hash time.
    const password_hash = await bcrypt.hash(password, 12);

    // Create the user row and their settings row in a single transaction.
    // If either insert fails, both are rolled back — no orphaned records.
    const user = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { username, password_hash },
      });

      // Every user gets a settings row; settings_json defaults to {} per schema.
      await tx.settings.create({
        data: { user_id: newUser.id },
      });

      return newUser;
    });

    // Sign a 7-day JWT so the player stays logged in across browser sessions.
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      token,
      user: { id: user.id, username: user.username },
    });

  } catch (err) {
    // Prisma throws P2002 when a unique constraint is violated — username taken.
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Username is already taken' });
    }
    // Anything else goes to the global 500 handler in index.js.
    throw err;
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Body:    { username, password }
// Returns: { token, user: { id, username } }
router.post('/login', authLimiter, async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten().fieldErrors });
  }

  const { username, password } = result.data;

  // Same message for "user not found" and "wrong password" — prevents
  // attackers from learning which usernames are registered (enumeration).
  const INVALID_CREDS = { error: 'Invalid credentials' };

  const user = await db.user.findUnique({ where: { username } });
  if (!user) return res.status(401).json(INVALID_CREDS);

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) return res.status(401).json(INVALID_CREDS);

  // Record login time without blocking the response — if this update fails
  // the login still succeeds and the error is logged for visibility.
  db.user.update({ where: { id: user.id }, data: { last_login: new Date() } })
    .catch(err => console.error('Failed to update last_login:', err));

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.json({
    token,
    user: { id: user.id, username: user.username },
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Requires: Authorization: Bearer <token>
// Returns:  { id, username, created_at }
router.get('/me', requireAuth, async (req, res) => {
  // Re-fetch from DB rather than trusting only the JWT payload, in case the
  // user record changed since the token was issued.
  const user = await db.user.findUnique({
    where:  { id: req.user.userId },
    select: { id: true, username: true, created_at: true }, // never return password_hash
  });

  // Valid token but user no longer exists in the DB (edge case).
  if (!user) return res.status(401).json({ error: 'User not found' });

  return res.json(user);
});

module.exports = router;
