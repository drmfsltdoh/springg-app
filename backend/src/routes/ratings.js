const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();

// Structured tags, not just stars — per the brief, ratings shouldn't be a
// blunt instrument. Frontend picks from these; backend just stores whatever
// subset is sent so the tag list can evolve without a migration.
router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { tripId, toUserId, stars, tags, comment } = req.body;
  if (!tripId || !toUserId || !stars) {
    return res.status(400).json({ error: "tripId, toUserId and stars are required" });
  }
  if (stars < 1 || stars > 5) return res.status(400).json({ error: "stars must be between 1 and 5" });

  const fromRole = req.user.role === "driver" ? "driver" : "rider";

  const result = await query(
    `INSERT INTO ratings (trip_id, from_role, to_user_id, stars, tags, comment)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (trip_id, from_role) DO UPDATE SET stars = $4, tags = $5, comment = $6
     RETURNING *`,
    [tripId, fromRole, toUserId, stars, JSON.stringify(tags || []), comment || null]
  );

  // Recompute the target's rolling average rating. Simple and correct;
  // fine at MVP scale — worth a materialized/cached average later if the
  // ratings table gets large.
  if (fromRole === "rider") {
    // rating a driver
    const driverResult = await query("SELECT id FROM drivers WHERE user_id = $1", [toUserId]);
    if (driverResult.rows.length) {
      const avgResult = await query(
        `SELECT AVG(stars) as avg FROM ratings r
         JOIN trips t ON t.id = r.trip_id
         WHERE t.driver_id = $1 AND r.from_role = 'rider'`,
        [driverResult.rows[0].id]
      );
      await query("UPDATE drivers SET rating_avg = $1 WHERE id = $2", [
        Number(avgResult.rows[0].avg).toFixed(2), driverResult.rows[0].id,
      ]);
    }
  }

  res.json({ rating: result.rows[0] });
}));

router.get("/trip/:tripId", requireAuth, asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM ratings WHERE trip_id = $1", [req.params.tripId]);
  res.json({ ratings: result.rows });
}));

module.exports = router;
