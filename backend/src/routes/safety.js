const express = require("express");
const { query } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { logAudit } = require("../utils/audit");

const router = express.Router();

// ── Trusted contacts ─────────────────────────────────────────────────
router.post("/trusted-contacts", requireAuth, asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ error: "name and phone are required" });
  const result = await query(
    `INSERT INTO trusted_contacts (user_id, name, phone) VALUES ($1,$2,$3) RETURNING *`,
    [req.user.id, name, phone]
  );
  res.json({ contact: result.rows[0] });
}));

router.get("/trusted-contacts", requireAuth, asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM trusted_contacts WHERE user_id = $1", [req.user.id]);
  res.json({ contacts: result.rows });
}));

// ── SOS ───────────────────────────────────────────────────────────────
// Real, honest scope: this logs an emergency event tied to the trip and
// notifies trusted contacts (via the notifications table — actual SMS/push
// delivery depends on SMS_PROVIDER/push setup, same caveat as OTP). This is
// NOT a replacement for calling emergency services, and the API response
// says so explicitly rather than implying otherwise.
router.post("/sos", requireAuth, asyncHandler(async (req, res) => {
  const { tripId, lat, lng } = req.body;

  const incident = await query(
    `INSERT INTO safety_incidents (trip_id, reported_by, category, description, status)
     VALUES ($1, $2, 'sos', $3, 'flagged') RETURNING *`,
    [tripId || null, req.user.id, `SOS triggered at ${lat},${lng}`]
  );

  const contacts = await query("SELECT * FROM trusted_contacts WHERE user_id = $1", [req.user.id]);
  for (const contact of contacts.rows) {
    await query(
      `INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, 'safety')`,
      [req.user.id, "SOS Alert Logged", `Your trusted contact ${contact.name} would be notified here once SMS delivery is configured.`]
    );
  }

  res.json({
    message: "SOS logged and flagged for review.",
    warning: "This does not contact Nigerian emergency services (112/199). If you are in immediate danger, call them directly.",
    incident: incident.rows[0],
  });
}));

// ── Report an incident ───────────────────────────────────────────────
router.post("/report", requireAuth, asyncHandler(async (req, res) => {
  const { tripId, category, description } = req.body;
  if (!category || !description) return res.status(400).json({ error: "category and description are required" });
  const result = await query(
    `INSERT INTO safety_incidents (trip_id, reported_by, category, description) VALUES ($1,$2,$3,$4) RETURNING *`,
    [tripId || null, req.user.id, category, description]
  );
  res.json({ incident: result.rows[0] });
}));

// ── Admin: review queue ──────────────────────────────────────────────
router.get("/incidents", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const { status } = req.query;
  const result = status
    ? await query("SELECT * FROM safety_incidents WHERE status = $1 ORDER BY created_at DESC", [status])
    : await query("SELECT * FROM safety_incidents ORDER BY created_at DESC");
  res.json({ incidents: result.rows });
}));

router.post("/incidents/:id/resolve", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const { status, resolution } = req.body;
  if (!["review", "action_taken", "dismissed"].includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }
  await query(
    `UPDATE safety_incidents SET status = $1, resolution = $2, reviewed_by = $3, resolved_at = now() WHERE id = $4`,
    [status, resolution || null, req.user.id, req.params.id]
  );
  await logAudit({ actorId: req.user.id, action: "safety_incident_resolved", entityType: "safety_incident", entityId: req.params.id, after: { status, resolution } });
  res.json({ message: "Incident updated" });
}));

// ── Driver account actions (warnings/suspensions) with appeal path ─────
router.post("/driver-actions", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const { driverId, actionType, reason, evidence } = req.body;
  if (!driverId || !actionType || !reason) return res.status(400).json({ error: "driverId, actionType and reason are required" });

  const result = await query(
    `INSERT INTO driver_account_actions (driver_id, action_type, reason, evidence, issued_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [driverId, actionType, reason, evidence || null, req.user.id]
  );

  if (actionType === "permanent_suspension" || actionType === "temporary_suspension") {
    await query(
      `UPDATE drivers SET verification_status = 'suspended' WHERE id = $1`,
      [driverId]
    );
  }

  await logAudit({ actorId: req.user.id, action: "driver_account_action", entityType: "driver", entityId: driverId, after: result.rows[0] });
  res.json({ action: result.rows[0] });
}));

router.get("/driver-actions/mine", requireAuth, requireRole("driver"), asyncHandler(async (req, res) => {
  const driverResult = await query("SELECT id FROM drivers WHERE user_id = $1", [req.user.id]);
  if (!driverResult.rows.length) return res.json({ actions: [] });
  const result = await query("SELECT * FROM driver_account_actions WHERE driver_id = $1 ORDER BY created_at DESC", [driverResult.rows[0].id]);
  res.json({ actions: result.rows });
}));

router.post("/driver-actions/:id/appeal", requireAuth, requireRole("driver"), asyncHandler(async (req, res) => {
  const { notes } = req.body;
  await query(
    `UPDATE driver_account_actions SET appeal_status = 'submitted', appeal_notes = $1 WHERE id = $2`,
    [notes || null, req.params.id]
  );
  res.json({ message: "Appeal submitted for human review" });
}));

module.exports = router;
