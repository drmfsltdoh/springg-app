const express = require("express");
const { query } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { logAudit } = require("../utils/audit");

const router = express.Router();
router.use(requireAuth, requireRole("admin")); // every route below is admin-only

// ── Fare/commission/cancellation config — no code deploy needed ────────
router.get("/config", asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM admin_config ORDER BY key");
  res.json({ config: result.rows });
}));

router.post("/config/:key", asyncHandler(async (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: "value is required" });

  const before = await query("SELECT value FROM admin_config WHERE key = $1", [req.params.key]);
  await query(
    `INSERT INTO admin_config (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
    [req.params.key, JSON.stringify(value), req.user.id]
  );
  await logAudit({
    actorId: req.user.id, action: "config_updated", entityType: "admin_config",
    entityId: req.params.key, before: before.rows[0], after: { value },
  });
  res.json({ message: `${req.params.key} updated` });
}));

// ── Dashboard summary numbers ───────────────────────────────────────────
router.get("/dashboard", asyncHandler(async (req, res) => {
  const [riders, drivers, onlineDrivers, tripsToday, completedTrips, cancelledTrips,
    revenue, openTickets, safetyIncidents] = await Promise.all([
    query("SELECT COUNT(*) FROM riders"),
    query("SELECT COUNT(*) FROM drivers"),
    query("SELECT COUNT(*) FROM drivers WHERE online = TRUE"),
    query("SELECT COUNT(*) FROM trips WHERE requested_at >= CURRENT_DATE"),
    query("SELECT COUNT(*) FROM trips WHERE status IN ('trip_completed','payment_completed','rated')"),
    query("SELECT COUNT(*) FROM trips WHERE status LIKE 'cancelled%'"),
    query("SELECT COALESCE(SUM(total),0) as sum FROM fare_breakdowns WHERE is_estimate = false"),
    query("SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','in_review','escalated')"),
    query("SELECT COUNT(*) FROM safety_incidents WHERE status IN ('flagged','review')"),
  ]);

  res.json({
    totalRiders: Number(riders.rows[0].count),
    totalDrivers: Number(drivers.rows[0].count),
    onlineDrivers: Number(onlineDrivers.rows[0].count),
    tripsToday: Number(tripsToday.rows[0].count),
    completedTrips: Number(completedTrips.rows[0].count),
    cancelledTrips: Number(cancelledTrips.rows[0].count),
    totalRevenueKobo: Number(revenue.rows[0].sum),
    openSupportTickets: Number(openTickets.rows[0].count),
    openSafetyIncidents: Number(safetyIncidents.rows[0].count),
  });
}));

// ── Fraud flags — flag → review → action, never auto-ban ──────────────
router.get("/fraud-flags", asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM fraud_flags ORDER BY created_at DESC");
  res.json({ flags: result.rows });
}));

router.post("/fraud-flags/:id/resolve", asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["review", "action_taken", "dismissed"].includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }
  await query("UPDATE fraud_flags SET status = $1 WHERE id = $2", [status, req.params.id]);
  await logAudit({ actorId: req.user.id, action: "fraud_flag_resolved", entityType: "fraud_flag", entityId: req.params.id, after: { status } });
  res.json({ message: "Flag updated" });
}));

// ── Audit log viewer ─────────────────────────────────────────────────
router.get("/audit-logs", asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.query;
  let result;
  if (entityType && entityId) {
    result = await query(
      "SELECT * FROM audit_logs WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT 200",
      [entityType, entityId]
    );
  } else {
    result = await query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200");
  }
  res.json({ logs: result.rows });
}));

module.exports = router;
