const express = require("express");
const { query } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();

router.post("/", requireAuth, requireRole("driver"), asyncHandler(async (req, res) => {
  const { make, model, year, plateNumber, color, category } = req.body;
  if (!plateNumber) return res.status(400).json({ error: "plateNumber is required" });

  const driverResult = await query("SELECT id FROM drivers WHERE user_id = $1", [req.user.id]);
  if (!driverResult.rows.length) return res.status(404).json({ error: "Driver profile not found" });

  const result = await query(
    `INSERT INTO vehicles (driver_id, make, model, year, plate_number, color, category)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [driverResult.rows[0].id, make, model, year || null, plateNumber, color, category || "economy"]
  );
  res.json({ vehicle: result.rows[0] });
}));

router.get("/mine", requireAuth, requireRole("driver"), asyncHandler(async (req, res) => {
  const driverResult = await query("SELECT id FROM drivers WHERE user_id = $1", [req.user.id]);
  if (!driverResult.rows.length) return res.json({ vehicles: [] });
  const result = await query("SELECT * FROM vehicles WHERE driver_id = $1", [driverResult.rows[0].id]);
  res.json({ vehicles: result.rows });
}));

module.exports = router;
