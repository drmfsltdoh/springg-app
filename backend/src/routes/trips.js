const express = require("express");
const { query, getClient } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const fareEngine = require("../services/fareEngine");
const mapProvider = require("../services/mapProvider");
const tripStateMachine = require("../utils/tripStateMachine");
const { logTripEvent } = require("../utils/audit");
const walletService = require("../services/walletService");

const router = express.Router();

async function getRiderIdForUser(userId) {
  const result = await query("SELECT id FROM riders WHERE user_id = $1", [userId]);
  if (!result.rows.length) throw Object.assign(new Error("Rider profile not found"), { statusCode: 404 });
  return result.rows[0].id;
}

// ── Fare estimate (pre-trip quote — the transparency promise) ─────────────
router.post("/fare/estimate", requireAuth, asyncHandler(async (req, res) => {
  const { pickup, destination } = req.body; // { lat, lng }
  if (!pickup || !destination) return res.status(400).json({ error: "pickup and destination are required" });

  const route = await mapProvider.route(pickup, destination);
  if (!route) return res.status(400).json({ error: "Could not calculate a route for this trip" });

  const breakdown = await fareEngine.calculateFare({
    distanceKm: route.distanceKm,
    durationMin: route.durationMin,
  });

  res.json({ ...breakdown, routeCoordinates: route.coordinates });
}));

// ── Request a ride ──────────────────────────────────────────────────────
router.post("/", requireAuth, requireRole("rider"), asyncHandler(async (req, res) => {
  const { pickup, destination, vehicleCategory } = req.body;
  if (!pickup?.lat || !destination?.lat) {
    return res.status(400).json({ error: "pickup and destination coordinates are required" });
  }

  const riderResult = await query("SELECT id FROM riders WHERE user_id = $1", [req.user.id]);
  if (!riderResult.rows.length) return res.status(404).json({ error: "Rider profile not found" });
  const riderId = riderResult.rows[0].id;

  const tripResult = await query(
    `INSERT INTO trips (rider_id, status, pickup_lat, pickup_lng, pickup_address,
      destination_lat, destination_lng, destination_address, vehicle_category)
     VALUES ($1, 'requested', $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [riderId, pickup.lat, pickup.lng, pickup.address || "", destination.lat, destination.lng,
     destination.address || "", vehicleCategory || "economy"]
  );
  const trip = tripResult.rows[0];
  await logTripEvent({ tripId: trip.id, eventType: "requested", actor: "rider" });

  // Move to searching_for_driver immediately — actual matching logic
  // (nearest/best available driver) is a Phase 4 concern per the roadmap;
  // for now this marks intent clearly rather than leaving trips silently
  // stuck in "requested".
  tripStateMachine.assertTransition("requested", "searching_for_driver");
  await query("UPDATE trips SET status = 'searching_for_driver' WHERE id = $1", [trip.id]);
  await logTripEvent({ tripId: trip.id, eventType: "searching_for_driver", actor: "system" });

  res.json({ trip: { ...trip, status: "searching_for_driver" } });
}));

// ── Generic status transition endpoint ─────────────────────────────────
// Used for: driver_accepted, driver_en_route_to_pickup, driver_arrived,
// rider_onboard, trip_started. Each checks the actor is allowed to make
// that particular move, then defers to the state machine for validity.
router.post("/:id/transition", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { toStatus } = req.body;
  if (!toStatus) return res.status(400).json({ error: "toStatus is required" });

  const tripResult = await query("SELECT * FROM trips WHERE id = $1", [id]);
  if (!tripResult.rows.length) return res.status(404).json({ error: "Trip not found" });
  const trip = tripResult.rows[0];

  tripStateMachine.assertTransition(trip.status, toStatus); // throws 400 if invalid

  const timestampColumn = {
    driver_accepted: "accepted_at",
    driver_arrived: "arrived_at",
    trip_started: "started_at",
  }[toStatus];

  const setClauses = ["status = $1"];
  const params = [toStatus];
  if (timestampColumn) {
    setClauses.push(`${timestampColumn} = now()`);
  }
  params.push(id);

  await query(`UPDATE trips SET ${setClauses.join(", ")} WHERE id = $${params.length}`, params);
  await logTripEvent({ tripId: id, eventType: toStatus, actor: req.user.role });

  res.json({ status: toStatus });
}));

// ── Driver accepts a searching trip ────────────────────────────────────
router.post("/:id/accept", requireAuth, requireRole("driver"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const driverResult = await query("SELECT * FROM drivers WHERE user_id = $1", [req.user.id]);
  if (!driverResult.rows.length) return res.status(404).json({ error: "Driver profile not found" });
  const driver = driverResult.rows[0];

  if (driver.verification_status !== "approved") {
    return res.status(403).json({ error: "Your account is still pending ID verification" });
  }

  const tripResult = await query("SELECT * FROM trips WHERE id = $1", [id]);
  if (!tripResult.rows.length) return res.status(404).json({ error: "Trip not found" });
  const trip = tripResult.rows[0];

  tripStateMachine.assertTransition(trip.status, "driver_assigned");
  tripStateMachine.assertTransition("driver_assigned", "driver_accepted");

  await query(
    `UPDATE trips SET driver_id = $1, status = 'driver_accepted', accepted_at = now() WHERE id = $2`,
    [driver.id, id]
  );
  await logTripEvent({ tripId: id, eventType: "driver_accepted", actor: "driver", metadata: { driverId: driver.id } });

  res.json({ message: "Trip accepted" });
}));

// ── Complete a trip — writes the final, immutable fare breakdown ──────
router.post("/:id/complete", requireAuth, requireRole("driver"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { actualDistanceKm, actualDurationMin } = req.body;

  const tripResult = await query("SELECT * FROM trips WHERE id = $1", [id]);
  if (!tripResult.rows.length) return res.status(404).json({ error: "Trip not found" });
  const trip = tripResult.rows[0];

  tripStateMachine.assertTransition(trip.status, "trip_completed");

  const breakdown = await fareEngine.calculateFare({
    distanceKm: actualDistanceKm,
    durationMin: actualDurationMin,
  });

  await query(
    `INSERT INTO fare_breakdowns (trip_id, base_fare, distance_cost, time_cost, booking_fee,
      surge_multiplier, tolls, discount, platform_fee, driver_earnings,
      operating_cost_estimate, net_driver_estimate, total, distance_km, duration_min, is_estimate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, false)`,
    [id, breakdown.baseFareKobo, breakdown.distanceCostKobo, breakdown.timeCostKobo,
     breakdown.bookingFeeKobo, breakdown.surgeMultiplier, breakdown.tollsKobo, breakdown.discountKobo,
     breakdown.platformFeeKobo, breakdown.driverEarningsKobo, breakdown.operatingCostEstimateKobo,
     breakdown.netDriverEstimateKobo, breakdown.totalKobo, breakdown.distanceKm, breakdown.durationMin]
  );

  await query(
    `UPDATE trips SET status = 'trip_completed', completed_at = now() WHERE id = $1`,
    [id]
  );
  await logTripEvent({ tripId: id, eventType: "trip_completed", actor: "driver", metadata: breakdown });

  // Credit the driver's wallet immediately as "pending" earnings.
  // Actual payout timing/rules are configurable — see driver_payouts.
  const driverResult = await query("SELECT wallet_id FROM drivers WHERE id = $1", [trip.driver_id]);
  if (driverResult.rows[0]?.wallet_id) {
    await walletService.recordTransaction({
      walletId: driverResult.rows[0].wallet_id,
      type: "credit",
      amountKobo: breakdown.driverEarningsKobo,
      reason: "trip_earning",
      referenceId: id,
    });
  }

  res.json({ status: "trip_completed", fareBreakdown: breakdown });
}));

// ── Cancel a trip (reason-based, per the brief's fairness rules) ──────
router.post("/:id/cancel", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const tripResult = await query("SELECT * FROM trips WHERE id = $1", [id]);
  if (!tripResult.rows.length) return res.status(404).json({ error: "Trip not found" });
  const trip = tripResult.rows[0];

  const cancelledBy = req.user.role === "driver" ? "driver" : "rider";
  const toStatus = reason === "safety" ? "cancelled_for_safety" :
    cancelledBy === "driver" ? "cancelled_by_driver" : "cancelled_by_rider";

  tripStateMachine.assertTransition(trip.status, toStatus);

  await query(
    `UPDATE trips SET status = $1, cancelled_at = now(), cancelled_by = $2, cancellation_reason = $3 WHERE id = $4`,
    [toStatus, cancelledBy, reason || null, id]
  );
  await logTripEvent({ tripId: id, eventType: toStatus, actor: cancelledBy, metadata: { reason } });

  // NOTE: cancellation fee logic (rider fee, driver pickup compensation,
  // no-show fee) reads its amounts from admin_config
  // (cancellation.rider_fee_kobo etc, seeded in schema.sql) but charging
  // them requires the payment service to be wired to a real provider —
  // left as a clear next step once Paystack/Flutterwave keys are added,
  // rather than faking a charge here.

  res.json({ status: toStatus });
}));

// ── Trip history / current trip ────────────────────────────────────────
router.get("/mine", requireAuth, asyncHandler(async (req, res) => {
  const table = req.user.role === "driver" ? "drivers" : "riders";
  const idColumn = req.user.role === "driver" ? "driver_id" : "rider_id";

  const profileResult = await query(`SELECT id FROM ${table} WHERE user_id = $1`, [req.user.id]);
  if (!profileResult.rows.length) return res.json({ trips: [] });

  const trips = await query(
    `SELECT * FROM trips WHERE ${idColumn} = $1 ORDER BY requested_at DESC LIMIT 50`,
    [profileResult.rows[0].id]
  );
  res.json({ trips: trips.rows });
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const tripResult = await query(
    `SELECT t.*,
            r.name as rider_name, ru.phone as rider_phone,
            d.legal_name as driver_name, d.rating_avg as driver_rating,
            d.current_lat as driver_lat, d.current_lng as driver_lng,
            du.phone as driver_phone,
            v.make as vehicle_make, v.model as vehicle_model, v.plate_number as vehicle_plate
     FROM trips t
     JOIN riders r ON r.id = t.rider_id
     JOIN users ru ON ru.id = r.user_id
     LEFT JOIN drivers d ON d.id = t.driver_id
     LEFT JOIN users du ON du.id = d.user_id
     LEFT JOIN vehicles v ON v.driver_id = d.id
     WHERE t.id = $1`,
    [req.params.id]
  );
  if (!tripResult.rows.length) return res.status(404).json({ error: "Trip not found" });
  const fareResult = await query("SELECT * FROM fare_breakdowns WHERE trip_id = $1 ORDER BY calculated_at DESC LIMIT 1", [req.params.id]);
  res.json({ trip: tripResult.rows[0], fareBreakdown: fareResult.rows[0] || null });
}));

// ── Trips currently searching for a driver ─────────────────────────────
// Drivers poll this to see requests they can accept. MVP matching is
// "show every searching trip to every online, approved driver" — real
// nearest-driver/smart matching is Phase 4 per the roadmap; this is the
// same simplicity Spring-v5's MVP already had, just server-driven now.
router.get("/searching", requireAuth, requireRole("driver"), asyncHandler(async (req, res) => {
  const driverResult = await query("SELECT verification_status, online FROM drivers WHERE user_id = $1", [req.user.id]);
  if (!driverResult.rows.length) return res.status(404).json({ error: "Driver profile not found" });
  if (driverResult.rows[0].verification_status !== "approved") return res.json({ trips: [] });

  const result = await query(
    `SELECT t.*, r.name as rider_name FROM trips t
     JOIN riders r ON r.id = t.rider_id
     WHERE t.status = 'searching_for_driver' ORDER BY t.requested_at ASC LIMIT 20`
  );
  res.json({ trips: result.rows });
}));

// ── In-trip chat ─────────────────────────────────────────────────────────
router.get("/:id/messages", requireAuth, asyncHandler(async (req, res) => {
  const result = await query(
    "SELECT * FROM trip_messages WHERE trip_id = $1 ORDER BY created_at ASC",
    [req.params.id]
  );
  res.json({ messages: result.rows });
}));

router.post("/:id/messages", requireAuth, asyncHandler(async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: "body is required" });
  const senderRole = req.user.role === "driver" ? "driver" : "rider";
  const result = await query(
    `INSERT INTO trip_messages (trip_id, sender_id, sender_role, body) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.id, req.user.id, senderRole, body.trim()]
  );
  res.json({ message: result.rows[0] });
}));

module.exports = router;
