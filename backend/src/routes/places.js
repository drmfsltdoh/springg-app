const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const mapProvider = require("../services/mapProvider");

const router = express.Router();

// The mobile app calls these instead of Google Places/Directions directly —
// that's the whole point of the map abstraction layer: the app never needs
// its own Maps API key or billing account. Today this proxies free
// OpenStreetMap/OSRM; swapping MAP_PROVIDER=google in .env later upgrades
// every client automatically, no app update needed.

router.get("/search", requireAuth, asyncHandler(async (req, res) => {
  const { q, biasLat, biasLng } = req.query;
  if (!q || q.trim().length < 3) return res.json({ results: [] });
  const results = await mapProvider.searchPlaces(q, {
    biasLat: biasLat ? parseFloat(biasLat) : undefined,
    biasLng: biasLng ? parseFloat(biasLng) : undefined,
  });
  res.json({ results });
}));

router.post("/route", requireAuth, asyncHandler(async (req, res) => {
  const { origin, destination } = req.body;
  if (!origin?.lat || !destination?.lat) {
    return res.status(400).json({ error: "origin and destination ({lat,lng}) are required" });
  }
  const route = await mapProvider.route(origin, destination);
  if (!route) return res.status(400).json({ error: "Could not calculate a route" });
  res.json(route);
}));

module.exports = router;
