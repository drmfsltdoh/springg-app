const express = require("express");
const { query } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();
const CATEGORIES = ["rider", "driver", "safety", "payment", "trip", "account"];

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { category, description, tripId } = req.body;
  if (!category || !description) return res.status(400).json({ error: "category and description are required" });
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(", ")}` });

  const result = await query(
    `INSERT INTO support_tickets (user_id, category, trip_id, description) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user.id, category, tripId || null, description]
  );
  res.json({ ticket: result.rows[0] });
}));

router.get("/mine", requireAuth, asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC", [req.user.id]);
  res.json({ tickets: result.rows });
}));

router.get("/:id/messages", requireAuth, asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC", [req.params.id]);
  res.json({ messages: result.rows });
}));

router.post("/:id/messages", requireAuth, asyncHandler(async (req, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: "body is required" });
  const result = await query(
    `INSERT INTO support_messages (ticket_id, sender_id, body) VALUES ($1,$2,$3) RETURNING *`,
    [req.params.id, req.user.id, body]
  );
  await query(
    `UPDATE support_tickets SET status = CASE WHEN status = 'resolved' THEN 'in_review' ELSE status END WHERE id = $1`,
    [req.params.id]
  );
  res.json({ message: result.rows[0] });
}));

// ── Admin: manage tickets ────────────────────────────────────────────
router.get("/", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const { status } = req.query;
  const result = status
    ? await query("SELECT * FROM support_tickets WHERE status = $1 ORDER BY created_at DESC", [status])
    : await query("SELECT * FROM support_tickets ORDER BY created_at DESC");
  res.json({ tickets: result.rows });
}));

router.post("/:id/status", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const { status, resolution, assignedAgentId } = req.body;
  const validStatuses = ["open", "in_review", "waiting_for_user", "resolved", "escalated"];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: "invalid status" });

  await query(
    `UPDATE support_tickets SET status = $1, resolution = COALESCE($2, resolution),
      assigned_agent_id = COALESCE($3, assigned_agent_id),
      resolved_at = CASE WHEN $1 = 'resolved' THEN now() ELSE resolved_at END
     WHERE id = $4`,
    [status, resolution || null, assignedAgentId || null, req.params.id]
  );
  res.json({ message: "Ticket updated" });
}));

module.exports = router;
