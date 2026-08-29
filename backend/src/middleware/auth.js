const jwt = require("jsonwebtoken");
const env = require("../config/env");

// Verifies the JWT and attaches { id, role, phone } to req.user.
// Every protected route uses this — no route reads/trusts a role or user id
// from the request body, only from a verified token, closing the obvious
// "just tell the API you're an admin" hole.
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.sub, role: payload.role, phone: payload.phone };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Usage: requireRole("driver") or requireRole("admin", "driver")
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to do this" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
