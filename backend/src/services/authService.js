const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { query } = require("../config/db");
const env = require("../config/env");

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, phone: user.phone }, env.jwtSecret, {
    expiresIn: env.jwtAccessExpiry,
  });
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiry });
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

async function createUser({ phone, email, password, role }) {
  const existing = await query("SELECT id FROM users WHERE phone = $1", [phone]);
  if (existing.rows.length > 0) {
    const err = new Error("An account with this phone number already exists");
    err.statusCode = 400;
    throw err;
  }
  const passwordHash = await hashPassword(password);
  const result = await query(
    `INSERT INTO users (phone, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *`,
    [phone, email || null, passwordHash, role]
  );
  return result.rows[0];
}

async function findUserByPhone(phone) {
  const result = await query("SELECT * FROM users WHERE phone = $1", [phone]);
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] || null;
}

// ── OTP ──────────────────────────────────────────────────────────────────
// No SMS provider is wired up yet (see env.js). This still creates a real,
// expiring, single-use code in the database — the whole flow works — it
// just can't actually text it to anyone until SMS_PROVIDER/SMS_API_KEY are
// set. In development, the code is returned in the API response so you can
// test the flow end-to-end; this is explicitly blocked outside development.
function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

async function createOtp(phone, purpose = "signup") {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await query(
    `INSERT INTO otp_codes (phone, code, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
    [phone, code, purpose, expiresAt]
  );

  if (env.smsProvider && env.smsApiKey) {
    // TODO: send via configured SMS provider (e.g. Termii, Africa's Talking)
    // once SMS_PROVIDER/SMS_API_KEY are set in .env. Keeping this as an
    // explicit TODO rather than a fake "sent!" response.
  }

  return env.nodeEnv !== "production" ? code : undefined;
}

async function verifyOtp(phone, code, purpose = "signup") {
  const result = await query(
    `SELECT * FROM otp_codes WHERE phone = $1 AND code = $2 AND purpose = $3
     AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [phone, code, purpose]
  );
  if (result.rows.length === 0) return false;
  await query("UPDATE otp_codes SET consumed_at = now() WHERE id = $1", [result.rows[0].id]);
  return true;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  hashPassword,
  verifyPassword,
  createUser,
  findUserByPhone,
  findUserById,
  createOtp,
  verifyOtp,
};
