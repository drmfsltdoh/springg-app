const express = require("express");
const { query } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const env = require("../config/env");
const walletService = require("../services/walletService");

const router = express.Router();

// Cash and wallet payments are fully real — no external dependency needed.
// Card/transfer are honestly stubbed: they return a clear "not configured"
// error rather than pretending to charge a card, per your instruction to
// leave payment integration blank until real keys exist.

router.post("/charge", requireAuth, requireRole("rider"), asyncHandler(async (req, res) => {
  const { tripId, method, amountKobo } = req.body;
  if (!tripId || !method || !amountKobo) {
    return res.status(400).json({ error: "tripId, method and amountKobo are required" });
  }

  const riderResult = await query("SELECT id, wallet_id FROM riders WHERE user_id = $1", [req.user.id]);
  if (!riderResult.rows.length) return res.status(404).json({ error: "Rider profile not found" });
  const rider = riderResult.rows[0];

  if (method === "cash") {
    const payment = await query(
      `INSERT INTO payments (trip_id, rider_id, amount, method, status) VALUES ($1,$2,$3,'cash','success') RETURNING *`,
      [tripId, rider.id, amountKobo]
    );
    return res.json({ payment: payment.rows[0] });
  }

  if (method === "wallet") {
    try {
      await walletService.recordTransaction({
        walletId: rider.wallet_id,
        type: "debit",
        amountKobo,
        reason: "trip_payment",
        referenceId: tripId,
      });
    } catch (err) {
      if (err.code === "INSUFFICIENT_BALANCE") {
        return res.status(400).json({ error: "Insufficient wallet balance" });
      }
      throw err;
    }
    const payment = await query(
      `INSERT INTO payments (trip_id, rider_id, amount, method, status) VALUES ($1,$2,$3,'wallet','success') RETURNING *`,
      [tripId, rider.id, amountKobo]
    );
    return res.json({ payment: payment.rows[0] });
  }

  if (method === "card" || method === "transfer") {
    if (!env.paystackSecretKey) {
      // Real, honest response — not a fake "success". Record the attempt
      // as pending so the ride/support flow has something to show, but
      // make the actual limitation completely clear to the caller.
      const payment = await query(
        `INSERT INTO payments (trip_id, rider_id, amount, method, status)
         VALUES ($1,$2,$3,$4,'pending') RETURNING *`,
        [tripId, rider.id, amountKobo, method]
      );
      return res.status(501).json({
        error: "Card/transfer payments require a Paystack (or Flutterwave) secret key. Set PAYSTACK_SECRET_KEY in .env to enable this — see services/paymentService.js for where the real integration goes.",
        payment: payment.rows[0],
      });
    }
    // TODO once PAYSTACK_SECRET_KEY is set: initialize a Paystack
    // transaction here, return the authorization_url to the client, and
    // verify it via a webhook (see routes for a /payments/webhook route
    // you'd add at that point) before marking this payment "success".
    return res.status(501).json({ error: "Paystack integration not yet implemented — key is set but the API calls need writing." });
  }

  res.status(400).json({ error: "Unknown payment method" });
}));

router.get("/history", requireAuth, requireRole("rider"), asyncHandler(async (req, res) => {
  const riderResult = await query("SELECT id FROM riders WHERE user_id = $1", [req.user.id]);
  if (!riderResult.rows.length) return res.json({ payments: [] });
  const result = await query(
    "SELECT * FROM payments WHERE rider_id = $1 ORDER BY created_at DESC LIMIT 50",
    [riderResult.rows[0].id]
  );
  res.json({ payments: result.rows });
}));

module.exports = router;
