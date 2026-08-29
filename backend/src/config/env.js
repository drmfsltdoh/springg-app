require("dotenv").config();

// Central place every service reads config from — never read process.env
// directly elsewhere, so it's obvious at a glance what this app depends on.
module.exports = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL, // postgres connection string
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtAccessExpiry: "15m",
  jwtRefreshExpiry: "30d",

  // Payment provider — leave blank until you have real keys. Every call in
  // paymentService.js checks for these and returns a clear "not configured"
  // error instead of pretending to charge a card.
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || null,

  // SMS/OTP provider — leave blank for now. otpService.js falls back to
  // returning the code directly in the API response, but ONLY when
  // nodeEnv !== "production", so this can never accidentally ship insecure.
  smsProvider: process.env.SMS_PROVIDER || null,
  smsApiKey: process.env.SMS_API_KEY || null,

  // Map provider — OpenStreetMap/Nominatim + OSRM need no API key at all,
  // which is exactly why they're the MVP default (see mapProvider.js).
  mapProvider: process.env.MAP_PROVIDER || "osm",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null,
};
