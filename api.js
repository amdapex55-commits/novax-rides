// Nova X Rides — REST client for novax-backend. Every path/field here was
// read directly from the backend's controllers/DTOs (trips.controller.ts,
// delivery.controller.ts, auth.controller.ts, ratings/dto/rate.dto.ts,
// create-delivery.dto.ts), not guessed.
import { CONFIG } from "./config.js";

const BASE = CONFIG.API_BASE_URL;
const LS = "novax_";

export const Token = {
  get access() { return localStorage.getItem(LS + "access"); },
  set access(v) { v ? localStorage.setItem(LS + "access", v) : localStorage.removeItem(LS + "access"); },
  get refresh() { return localStorage.getItem(LS + "refresh"); },
  set refresh(v) { v ? localStorage.setItem(LS + "refresh", v) : localStorage.removeItem(LS + "refresh"); },
  get phone() { return localStorage.getItem(LS + "phone"); },
  set phone(v) { v ? localStorage.setItem(LS + "phone", v) : localStorage.removeItem(LS + "phone"); },
  get user() {
    const raw = localStorage.getItem(LS + "user");
    return raw ? JSON.parse(raw) : null;
  },
  set user(v) { v ? localStorage.setItem(LS + "user", JSON.stringify(v)) : localStorage.removeItem(LS + "user"); },
  clear() { ["access", "refresh", "phone", "user"].forEach((k) => localStorage.removeItem(LS + k)); },
};

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

let refreshInFlight = null;
function doRefresh() {
  if (!Token.refresh) return Promise.reject(new ApiError("No refresh token", 401));
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: Token.refresh }),
  })
    .then((res) => {
      if (!res.ok) throw new ApiError("Refresh failed", res.status);
      return res.json();
    })
    .then((data) => {
      Token.access = data.accessToken;
      Token.refresh = data.refreshToken;
      return data;
    })
    .finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function request(path, opts = {}, isRetry = false) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (Token.access) headers.Authorization = `Bearer ${Token.access}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && !isRetry && Token.refresh) {
    await doRefresh();
    return request(path, opts, true);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || res.statusText;
    throw new ApiError(Array.isArray(msg) ? msg.join(", ") : msg, res.status, data);
  }
  return data;
}

export const api = {
  // --- Auth ---
  requestOtp: (phone) => request("/auth/otp/request", { method: "POST", body: { phone } }),
  verifyOtp: (phone, code) =>
    request("/auth/otp/verify", { method: "POST", body: { phone, code } }).then((data) => {
      Token.access = data.accessToken;
      Token.refresh = data.refreshToken;
      Token.phone = phone;
      return data;
    }),
  logout: () => Token.clear(),

  // --- Users ---
  getMe: () => request("/users/me").then((u) => { Token.user = u; return u; }),
  updateMe: (name) => request("/users/me", { method: "PATCH", body: { name } }),

  // --- Trips ---
  createTrip: (dto) => request("/trips", { method: "POST", body: dto }),
  acceptTrip: (id) => request(`/trips/${id}/accept`, { method: "POST" }),
  declineTrip: (id) => request(`/trips/${id}/decline`, { method: "POST" }),
  arriveTrip: (id) => request(`/trips/${id}/arrive`, { method: "POST" }),
  startTrip: (id) => request(`/trips/${id}/start`, { method: "POST" }),
  completeTrip: (id) => request(`/trips/${id}/complete`, { method: "POST" }),
  cancelTrip: (id) => request(`/trips/${id}/cancel`, { method: "POST" }),
  rateTrip: (id, score, comment) => request(`/trips/${id}/rate`, { method: "POST", body: { score, comment } }),
  getTrip: (id) => request(`/trips/${id}`),
  listMyTrips: () => request("/trips"),

  // --- Deliveries (parcels) ---
  createDelivery: (dto) => request("/deliveries", { method: "POST", body: dto }),
  acceptDelivery: (id) => request(`/deliveries/${id}/accept`, { method: "POST" }),
  declineDelivery: (id) => request(`/deliveries/${id}/decline`, { method: "POST" }),
  pickupDelivery: (id) => request(`/deliveries/${id}/pickup`, { method: "POST" }),
  inTransitDelivery: (id) => request(`/deliveries/${id}/in-transit`, { method: "POST" }),
  deliverDelivery: (id, proofOfDeliveryUrl) => request(`/deliveries/${id}/deliver`, { method: "POST", body: { proofOfDeliveryUrl } }),
  cancelDelivery: (id) => request(`/deliveries/${id}/cancel`, { method: "POST" }),
  rateDelivery: (id, score, comment) => request(`/deliveries/${id}/rate`, { method: "POST", body: { score, comment } }),
  getDelivery: (id) => request(`/deliveries/${id}`),
  listMyDeliveries: () => request("/deliveries"),

  // --- Wallet ---
  getWalletBalance: () => request("/wallet/balance"),
  getWalletHistory: () => request("/wallet/history"),

  // --- Uploads ---
  presignUpload: (purpose, contentType) => request("/uploads/presign", { method: "POST", body: { purpose, contentType } }),
};
