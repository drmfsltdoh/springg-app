const { query } = require("../config/db");

// The fare engine reads every rate from admin_config so admins can tune
// pricing without a code deploy. All amounts are handled in kobo internally
// (₦1 = 100 kobo) to avoid floating-point rounding errors on money — only
// convert to naira at the very edge, when displaying to a user.

async function getConfig(key) {
  const result = await query("SELECT value FROM admin_config WHERE key = $1", [key]);
  if (result.rows.length === 0) {
    throw new Error(`Missing admin_config for "${key}" — run the migration or seed this value.`);
  }
  return result.rows[0].value;
}

async function getFareConfig() {
  const keys = [
    "fare.base_fare_kobo",
    "fare.per_km_kobo",
    "fare.per_min_kobo",
    "fare.booking_fee_kobo",
    "fare.minimum_fare_kobo",
    "fare.commission_percent",
    "fare.surge_max_multiplier",
    "fare.operating_cost_per_km_kobo",
  ];
  const result = await query(
    "SELECT key, value FROM admin_config WHERE key = ANY($1)",
    [keys]
  );
  const map = {};
  for (const row of result.rows) map[row.key] = Number(row.value);
  return {
    baseFareKobo: map["fare.base_fare_kobo"],
    perKmKobo: map["fare.per_km_kobo"],
    perMinKobo: map["fare.per_min_kobo"],
    bookingFeeKobo: map["fare.booking_fee_kobo"],
    minimumFareKobo: map["fare.minimum_fare_kobo"],
    commissionPercent: map["fare.commission_percent"],
    surgeMaxMultiplier: map["fare.surge_max_multiplier"],
    operatingCostPerKmKobo: map["fare.operating_cost_per_km_kobo"],
  };
}

/**
 * Computes a full, transparent fare breakdown.
 * @param {object} params
 * @param {number} params.distanceKm
 * @param {number} params.durationMin
 * @param {number} [params.tollsKobo]
 * @param {number} [params.discountKobo]
 * @param {number} [params.surgeMultiplier] - must be requested explicitly by
 *   the demand service; this function just applies and caps it, it never
 *   invents surge on its own.
 * @returns {Promise<object>} full breakdown — this exact object is what gets
 *   shown to the rider before they confirm, and what gets stored in
 *   fare_breakdowns when the trip completes. One function, one source of
 *   truth, so the pre-trip estimate and the final charge can never silently
 *   use different logic.
 */
async function calculateFare({ distanceKm, durationMin, tollsKobo = 0, discountKobo = 0, surgeMultiplier = 1.0 }) {
  if (distanceKm < 0 || durationMin < 0) {
    throw new Error("distanceKm and durationMin must be non-negative");
  }

  const cfg = await getFareConfig();
  const cappedSurge = Math.min(surgeMultiplier, cfg.surgeMaxMultiplier);

  const baseFare = cfg.baseFareKobo;
  const distanceCost = Math.round(distanceKm * cfg.perKmKobo);
  const timeCost = Math.round(durationMin * cfg.perMinKobo);
  const bookingFee = cfg.bookingFeeKobo;

  const preSurgeSubtotal = baseFare + distanceCost + timeCost + bookingFee + tollsKobo;
  const surgedSubtotal = Math.round(preSurgeSubtotal * cappedSurge);
  const total = Math.max(surgedSubtotal - discountKobo, cfg.minimumFareKobo);

  const platformFee = Math.round(total * (cfg.commissionPercent / 100));
  const driverEarnings = total - platformFee;
  const operatingCostEstimate = Math.round(distanceKm * cfg.operatingCostPerKmKobo);
  const netDriverEstimate = driverEarnings - operatingCostEstimate;

  return {
    baseFareKobo: baseFare,
    distanceCostKobo: distanceCost,
    timeCostKobo: timeCost,
    bookingFeeKobo: bookingFee,
    tollsKobo,
    surgeMultiplier: cappedSurge,
    discountKobo,
    platformFeeKobo: platformFee,
    driverEarningsKobo: driverEarnings,
    operatingCostEstimateKobo: operatingCostEstimate,
    netDriverEstimateKobo: netDriverEstimate,
    totalKobo: total,
    currency: "NGN",
    distanceKm,
    durationMin,
  };
}

// Convenience for anywhere that needs to show ₦ to a human.
function koboToNaira(kobo) {
  return Math.round(kobo) / 100;
}

function formatNaira(kobo) {
  return `₦${koboToNaira(kobo).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

module.exports = { calculateFare, getFareConfig, getConfig, koboToNaira, formatNaira };
