// MapProvider abstraction — every screen/service in this app talks to the
// functions exported here, never directly to a mapping vendor's SDK. That's
// what makes the provider swappable (per the brief) without rewriting
// business logic: swap MAP_PROVIDER=osm to MAP_PROVIDER=google in .env and
// implement googleProvider below with the same shape, nothing else changes.

const env = require("../config/env");

// ── OpenStreetMap / Nominatim + OSRM implementation (MVP default) ─────────
// No API key required, no per-request billing — the right default for
// getting the whole app working before deciding whether Google's better
// data quality in Nigeria is worth paying for.
// Small shared helper: fetch + confirm we actually got JSON back. Nominatim
// and OSRM both return an HTML/plain-text error page (not JSON) when
// they're rate-limiting you or down — without this check, that shows up to
// the rider as a cryptic "Unexpected token '<'..." instead of a clear error.
async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`Map provider request failed (${res.status}): ${url.split("?")[0]}`);
  }
  return res.json();
}

const osmProvider = {
  async geocode(address) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const data = await fetchJson(url, { headers: { "User-Agent": "SpringApp/1.0" } });
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name };
  },

  async reverseGeocode(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const data = await fetchJson(url, { headers: { "User-Agent": "SpringApp/1.0" } });
    return data.display_name || null;
  },

  async searchPlaces(query, { biasLat, biasLng } = {}) {
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
    if (biasLat && biasLng) {
      // Nominatim supports a rough viewbox bias — widen/narrow as needed
      const delta = 0.3;
      url += `&viewbox=${biasLng - delta},${biasLat + delta},${biasLng + delta},${biasLat - delta}&bounded=0`;
    }
    const data = await fetchJson(url, { headers: { "User-Agent": "SpringApp/1.0" } });
    return data.map((p) => ({
      name: p.display_name,
      lat: parseFloat(p.lat),
      lng: parseFloat(p.lon),
    }));
  },

  async route(origin, destination) {
    // Public OSRM demo server — fine for development. For production
    // volume, self-host OSRM (it's open source) or use a paid routing
    // provider behind this same interface.
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const data = await fetchJson(url);
    if (!data.routes || !data.routes.length) return null;
    const route = data.routes[0];
    return {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      // GeoJSON [lng, lat] pairs, flipped to {latitude, longitude} for
      // direct use with react-native-maps' <Polyline coordinates={...} />
      coordinates: route.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    };
  },

  async eta(origin, destination) {
    const route = await this.route(origin, destination);
    return route ? route.durationMin : null;
  },
};

// ── Google Maps implementation (optional, later) ──────────────────────────
// Not implemented yet — stubbed so the interface shape is locked in and
// switching providers later is a config change, not a rewrite. Fill this in
// using the same fetch-based pattern as osmProvider once GOOGLE_MAPS_API_KEY
// is set, reusing the logic already written for Spring-v5's mobile app
// (src/config/maps.js, src/utils/polyline.js) — just moved server-side.
const googleProvider = {
  async geocode() { throw new Error("Google Maps provider not implemented yet — set MAP_PROVIDER=osm or implement this."); },
  async reverseGeocode() { throw new Error("Google Maps provider not implemented yet."); },
  async searchPlaces() { throw new Error("Google Maps provider not implemented yet."); },
  async route() { throw new Error("Google Maps provider not implemented yet."); },
  async eta() { throw new Error("Google Maps provider not implemented yet."); },
};

const providers = { osm: osmProvider, google: googleProvider };
const activeProvider = providers[env.mapProvider] || osmProvider;

module.exports = activeProvider;
