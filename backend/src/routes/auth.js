const express = require("express");
const { query } = require("../config/db");
const auth = require("../services/authService");
const { asyncHandler } = require("../middleware/errorHandler");
const walletService = require("../services/walletService");

const router = express.Router();

// ── OTP ──────────────────────────────────────────────────────────────────
router.post("/otp/request", asyncHandler(async (req, res) => {
  const { phone, purpose } = req.body;
  if (!phone) return res.status(400).json({ error: "phone is required" });
  const devCode = await auth.createOtp(phone, purpose || "signup");
  res.json({
    message: "OTP sent",
    // Only present outside production, and only because no SMS provider is
    // configured yet — see services/authService.js createOtp().
    devCode,
  });
}));

router.post("/otp/verify", asyncHandler(async (req, res) => {
  const { phone, code, purpose } = req.body;
  if (!phone || !code) return res.status(400).json({ error: "phone and code are required" });
  const valid = await auth.verifyOtp(phone, code, purpose || "signup");
  if (!valid) return res.status(400).json({ error: "Invalid or expired code" });
  res.json({ verified: true });
}));

// ── Signup ───────────────────────────────────────────────────────────────
router.post("/signup", asyncHandler(async (req, res) => {
  const { phone, email, password, role, name, otpCode } = req.body;
  if (!phone || !password || !role || !name) {
    return res.status(400).json({ error: "phone, password, role and name are required" });
  }
  if (!["rider", "driver"].includes(role)) {
    return res.status(400).json({ error: 'role must be "rider" or "driver"' });
  }

  // Require a verified OTP before creating the account — this is what
  // makes phone the real trust anchor, not just a form field.
  const otpValid = await auth.verifyOtp(phone, otpCode, "signup");
  if (!otpValid) {
    return res.status(400).json({ error: "Phone number not verified. Request and verify an OTP first." });
  }

  const user = await auth.createUser({ phone, email, password, role });

  const wallet = await walletService.getOrCreateWallet(role, user.id);

  if (role === "rider") {
    await query(
      `INSERT INTO riders (user_id, name, wallet_id) VALUES ($1, $2, $3)`,
      [user.id, name, wallet.id]
    );
  } else {
    await query(
      `INSERT INTO drivers (user_id, legal_name, wallet_id) VALUES ($1, $2, $3)`,
      [user.id, name, wallet.id]
    );
    // Driver verification documents (photo, ID, vehicle) are uploaded via
    // POST /api/v1/drivers/:id/documents after this signup call — see
    // routes/drivers.js. verification_status starts "pending" by default.
  }

  const accessToken = auth.signAccessToken(user);
  const refreshToken = auth.signRefreshToken(user);
  res.json({ user: { id: user.id, phone: user.phone, role: user.role, name }, accessToken, refreshToken });
}));

// ── Login ────────────────────────────────────────────────────────────────
router.post("/login", asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: "phone and password are required" });

  const user = await auth.findUserByPhone(phone);
  if (!user) return res.status(401).json({ error: "Invalid phone number or password" });

  const valid = await auth.verifyPassword(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid phone number or password" });

  if (user.status !== "active") {
    return res.status(403).json({ error: `Your account is ${user.status}. Contact support for details.` });
  }

  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);

  const accessToken = auth.signAccessToken(user);
  const refreshToken = auth.signRefreshToken(user);
  res.json({ user: { id: user.id, phone: user.phone, role: user.role }, accessToken, refreshToken });
}));

module.exports = router;
