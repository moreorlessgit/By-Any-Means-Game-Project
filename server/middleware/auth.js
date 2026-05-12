// Middleware that protects routes requiring a logged-in user.
// Reads the Authorization header, verifies the JWT, and attaches
// req.user = { userId, username } for the route handler to use.

const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  // The Authorization header must look like: Bearer <token>
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Pull the token string out, cutting off the "Bearer " prefix (7 chars).
  const token = authHeader.slice(7);

  try {
    // jwt.verify throws if the token is expired, malformed, or signed with
    // the wrong secret — all three cases return the same 401 below.
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the decoded payload so downstream handlers know who is calling.
    req.user = { userId: payload.userId, username: payload.username };

    next();
  } catch (err) {
    // No distinction between expired vs. invalid — attacker learns nothing.
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;
