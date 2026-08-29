const rateLimit = require("express-rate-limit");

// Generous general API limit — protects against runaway clients/bugs.
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });

// Tighter limit on auth endpoints specifically — this is what actually
// matters for security (brute-force login/OTP attempts).
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

module.exports = { generalLimiter, authLimiter };
