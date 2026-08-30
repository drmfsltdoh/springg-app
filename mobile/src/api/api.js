import AsyncStorage from "@react-native-async-storage/async-storage";

// CHANGE THIS to your backend's URL — same rule as before: your phone and
// computer need to reach this address. Use your LAN IP for local dev
// (e.g. "http://192.168.1.42:3001") or your Render URL once deployed
// (e.g. "https://spring-backend.onrender.com").
export const BASE_URL = "https://springg-app.onrender.com";

const TOKEN_KEY = "spring_access_token";
const REFRESH_KEY = "spring_refresh_token";

// ── Token storage ───────────────────────────────────────────────────────
// Kept here (not in AuthContext) so any api.js call can attach the current
// token without every screen needing to know where it lives.
async function getAccessToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

async function setTokens({ accessToken, refreshToken }) {
  await AsyncStorage.setItem(TOKEN_KEY, accessToken);
  await AsyncStorage.setItem(REFRESH_KEY, refreshToken);
}

async function clearTokens() {
  await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY]);
}

// ── Core request helper ─────────────────────────────────────────────────
async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error("Could not reach the server. Check BASE_URL in src/api/api.js and that the backend is running.");
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

// ── Money helper ─────────────────────────────────────────────────────────
// Backend does everything in kobo (integers, no float rounding errors).
// Every screen displays naira, so convert at the boundary, here.
export function koboToNaira(kobo) {
  return Math.round(kobo) / 100;
}
export function formatNaira(kobo) {
  return `₦${koboToNaira(kobo).toLocaleString("en-NG")}`;
}

// ── Auth ─────────────────────────────────────────────────────────────────
export const api = {
  async requestOtp(phone, purpose = "signup") {
    return request("/api/v1/auth/otp/request", { method: "POST", body: { phone, purpose }, auth: false });
  },

  async verifyOtp(phone, code, purpose = "signup") {
    return request("/api/v1/auth/otp/verify", { method: "POST", body: { phone, code, purpose }, auth: false });
  },

  async signup({ phone, email, password, role, name, otpCode }) {
    const data = await request("/api/v1/auth/signup", {
      method: "POST",
      body: { phone, email, password, role, name, otpCode },
      auth: false,
    });
    await setTokens(data);
    return data;
  },

  async login({ phone, password }) {
    const data = await request("/api/v1/auth/login", { method: "POST", body: { phone, password }, auth: false });
    await setTokens(data);
    return data;
  },

  async logout() {
    await clearTokens();
  },

  // ── Driver documents & verification ─────────────────────────────────
  async uploadDriverDocument(type, fileBase64) {
    return request("/api/v1/drivers/documents", { method: "POST", body: { type, fileBase64 } });
  },
  async getVerificationStatus() {
    return request("/api/v1/drivers/verification-status");
  },
  async registerVehicle({ make, model, year, plateNumber, color, category }) {
    return request("/api/v1/vehicles", { method: "POST", body: { make, model, year, plateNumber, color, category } });
  },

  // ── Driver status/location ──────────────────────────────────────────
  async setDriverStatus({ online, lat, lng }) {
    return request("/api/v1/drivers/status", { method: "POST", body: { online, lat, lng } });
  },
  async getAvailableDrivers() {
    const data = await request("/api/v1/drivers/available");
    return data.drivers;
  },
  async getDriverWallet() {
    return request("/api/v1/drivers/wallet");
  },

  // ── Places (free, no API key — proxied through our own backend) ─────
  async searchPlaces(q, bias) {
    const params = new URLSearchParams({ q });
    if (bias?.lat) params.set("biasLat", bias.lat);
    if (bias?.lng) params.set("biasLng", bias.lng);
    const data = await request(`/api/v1/places/search?${params.toString()}`);
    return data.results;
  },
  async getRoute(origin, destination) {
    return request("/api/v1/places/route", { method: "POST", body: { origin, destination } });
  },

  // ── Trips ─────────────────────────────────────────────────────────────
  async getFareEstimate(pickup, destination) {
    return request("/api/v1/trips/fare/estimate", { method: "POST", body: { pickup, destination } });
  },
  async requestTrip({ pickup, destination, vehicleCategory }) {
    const data = await request("/api/v1/trips", { method: "POST", body: { pickup, destination, vehicleCategory } });
    return data.trip;
  },
  async getSearchingTrips() {
    const data = await request("/api/v1/trips/searching");
    return data.trips;
  },
  async acceptTrip(tripId) {
    return request(`/api/v1/trips/${tripId}/accept`, { method: "POST" });
  },
  async transitionTrip(tripId, toStatus) {
    return request(`/api/v1/trips/${tripId}/transition`, { method: "POST", body: { toStatus } });
  },
  async completeTrip(tripId, { actualDistanceKm, actualDurationMin }) {
    return request(`/api/v1/trips/${tripId}/complete`, { method: "POST", body: { actualDistanceKm, actualDurationMin } });
  },
  async cancelTrip(tripId, reason) {
    return request(`/api/v1/trips/${tripId}/cancel`, { method: "POST", body: { reason } });
  },
  async getMyTrips() {
    const data = await request("/api/v1/trips/mine");
    return data.trips;
  },
  async getTrip(tripId) {
    return request(`/api/v1/trips/${tripId}`);
  },

  // ── Chat ──────────────────────────────────────────────────────────────
  async getMessages(tripId) {
    const data = await request(`/api/v1/trips/${tripId}/messages`);
    return data.messages;
  },
  async sendMessage(tripId, body) {
    return request(`/api/v1/trips/${tripId}/messages`, { method: "POST", body: { body } });
  },

  // ── Ratings ───────────────────────────────────────────────────────────
  async submitRating({ tripId, toUserId, stars, tags, comment }) {
    return request("/api/v1/ratings", { method: "POST", body: { tripId, toUserId, stars, tags, comment } });
  },

  // ── Payments ──────────────────────────────────────────────────────────
  async chargeTrip({ tripId, method, amountKobo }) {
    return request("/api/v1/payments/charge", { method: "POST", body: { tripId, method, amountKobo } });
  },

  // ── Safety ────────────────────────────────────────────────────────────
  async triggerSos({ tripId, lat, lng }) {
    return request("/api/v1/safety/sos", { method: "POST", body: { tripId, lat, lng } });
  },
  async addTrustedContact({ name, phone }) {
    return request("/api/v1/safety/trusted-contacts", { method: "POST", body: { name, phone } });
  },
  async getTrustedContacts() {
    const data = await request("/api/v1/safety/trusted-contacts");
    return data.contacts;
  },
  async reportIncident({ tripId, category, description }) {
    return request("/api/v1/safety/report", { method: "POST", body: { tripId, category, description } });
  },

  // ── Support ───────────────────────────────────────────────────────────
  async createSupportTicket({ category, description, tripId }) {
    return request("/api/v1/support", { method: "POST", body: { category, description, tripId } });
  },
  async getMySupportTickets() {
    const data = await request("/api/v1/support/mine");
    return data.tickets;
  },
};
