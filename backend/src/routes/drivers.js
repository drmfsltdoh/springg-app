const express = require("express");
const { query } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { logAudit } = require("../utils/audit");
const walletService = require("../services/walletService");

const router = express.Router();

// ── Driver uploads verification documents ─────────────────────────────
router.post("/documents", requireAuth, requireRole("driver"), asyncHandler(async (req, res) => {
  const { type, fileBase64 } = req.body;
  if (!type || !fileBase64) return res.status(400).json({ error: "type and fileBase64 are required" });

  const driverResult = await query("SELECT id FROM drivers WHERE user_id = $1", [req.user.id]);
  if (!driverResult.rows.length) return res.status(404).json({ error: "Driver profile not found" });

  await query(
    `INSERT INTO driver_documents (driver_id, type, file_base64) VALUES ($1, $2, $3)`,
    [driverResult.rows[0].id, type, fileBase64]
  );
  res.json({ message: "Document uploaded, pending review" });
}));

// ── Driver's own verification status ───────────────────────────────────
router.get("/verification-status", requireAuth, requireRole("driver"), asyncHandler(async (req, res) => {
  const result = await query(
    "SELECT verification_status, verification_notes FROM drivers WHERE user_id = $1",
    [req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Driver profile not found" });
  res.json(result.rows[0]);
}));

// ── Admin: view a driver's documents for manual review ─────────────────
router.get("/:id/documents", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM driver_documents WHERE driver_id = $1 ORDER BY created_at DESC", [req.params.id]);
  res.json({ documents: result.rows });
}));

// ── Admin: approve/reject a driver ─────────────────────────────────────
router.post("/:id/verify", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ error: "status must be approved, rejected, or pending" });
  }
  const before = await query("SELECT verification_status FROM drivers WHERE id = $1", [req.params.id]);
  await query(
    "UPDATE drivers SET verification_status = $1, verification_notes = $2 WHERE id = $3",
    [status, notes || "", req.params.id]
  );
  await logAudit({
    actorId: req.user.id,
    action: "driver_verification_updated",
    entityType: "driver",
    entityId: req.params.id,
    before: before.rows[0],
    after: { verification_status: status, notes },
  });
  res.json({ message: `Driver verification set to ${status}` });
}));

// ── Go online/offline + push location ──────────────────────────────────
router.post("/status", requireAuth, requireRole("driver"), asyncHandler(async (req, res) => {
  const { online, lat, lng } = req.body;

  const driverResult = await query("SELECT verification_status FROM drivers WHERE user_id = $1", [req.user.id]);
  if (!driverResult.rows.length) return res.status(404).json({ error: "Driver profile not found" });

  if (online && driverResult.rows[0].verification_status !== "approved") {
    return res.status(403).json({ error: "You cannot go online until your ID verification is approved" });
  }

  const setClauses = ["online = $1"];
  const params = [!!online];
  if (typeof lat === "number" && typeof lng === "number") {
    setClauses.push("current_lat = $2", "current_lng = $3", "location_updated_at = now()");
    params.push(lat, lng);
  }
  params.push(req.user.id);
  await query(`UPDATE drivers SET ${setClauses.join(", ")} WHERE user_id = $${params.length}`, params);

  res.json({ message: "Status updated" });
}));

// ── Available drivers (for rider matching) ─────────────────────────────
router.get("/available", requireAuth, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT d.id, d.legal_name, d.rating_avg, d.current_lat, d.current_lng,
            v.make, v.model, v.plate_number, v.category
     FROM drivers d
     LEFT JOIN vehicles v ON v.driver_id = d.id
     WHERE d.online = TRUE AND d.verification_status = 'approved'`
  );
  res.json({ drivers: result.rows });
}));

// ── Driver wallet ────────────────────────────────────────────────────────
router.get("/wallet", requireAuth, requireRole("driver"), asyncHandler(async (req, res) => {
  const driverResult = await query("SELECT wallet_id FROM drivers WHERE user_id = $1", [req.user.id]);
  if (!driverResult.rows.length || !driverResult.rows[0].wallet_id) {
    return res.status(404).json({ error: "Wallet not found" });
  }
  const walletId = driverResult.rows[0].wallet_id;
  const balance = await walletService.getBalance(walletId);
  const history = await walletService.getTransactionHistory(walletId);
  res.json({ ...balance, transactions: history });
}));

module.exports = router;
