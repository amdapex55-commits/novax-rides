// Nova Go Rides — REST client for novax-backend. Every path/field here was
// read directly from the backend's controllers/DTOs (trips.controller.ts,
// delivery.controller.ts, auth.controller.ts, ratings/dto/rate.dto.ts,
// create-delivery.dto.ts), not guessed.
import { CONFIG } from "./config.js";

const BASE = CONFIG.API_BASE_URL;
const LS = "novago_";

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
  // Guarded parse: not every response that reaches us is JSON. A Railway
  // cold-start page, a Cloudflare 502, or an nginx error page is HTML, and
  // an unguarded JSON.parse turns "server is down" into an unrelated
  // "Unexpected token <" SyntaxError that surfaces to the user as gibberish
  // and hides the real status code.
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new ApiError(
          res.status >= 500
            ? "Server error — the backend may be starting up or down. Try again in a moment."
            : `Unexpected response from server (${res.status})`,
          res.status,
          { raw: text.slice(0, 200) },
        );
      }
      // 2xx that isn't JSON — hand back the raw text rather than throwing.
      return text;
    }
  }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || res.statusText;
    throw new ApiError(Array.isArray(msg) ? msg.join(", ") : msg, res.status, data);
  }
  return data;
}

export const api = {
  // --- Auth ---
  // Password auth. OTP below still works and is kept deliberately — when an
  // SMS sender is provisioned, both flows run side by side.
  // Google Play requires in-app deletion. Anonymises server-side; anonymous
  // financial records survive (see users.service.ts).
  deleteAccount: () => request("/users/me", { method: "DELETE" }),

  register: (dto) => request("/auth/register", { method: "POST", body: dto }),
  login: (identifier, password) =>
    request("/auth/login", { method: "POST", body: { identifier, password } }),

  requestOtp: (phone, referralCode, role) =>
    request("/auth/otp/request", { method: "POST", body: { phone, ...(referralCode ? { referralCode } : {}), ...(role ? { role } : {}) } }),
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
  getVehicle: () => request("/users/me/vehicle"),
  updateVehicle: (dto) => request("/users/me/vehicle", { method: "PATCH", body: dto }),
  approveKyc: (userId) => request(`/users/${userId}/approve-kyc`, { method: "POST" }),
  setDriverMode: (mode) => request("/users/me/mode", { method: "PATCH", body: { mode } }),

  // --- Loyalty & Referrals ---
  getLoyalty: () => request("/loyalty/me"),

  // --- Notifications ---
  getNotifications: () => request("/notifications/me"),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH" }),

  // --- Support ---
  submitSupportTicket: (subject, message) => request("/support/tickets", { method: "POST", body: { subject, message } }),

  // --- Business leads (public — no auth) ---
  submitBusinessLead: (dto) => request("/business/leads", { method: "POST", body: dto }),

  // --- Driver incentives ---
  getIncentiveProgress: () => request("/trips/incentive-progress"),

  // --- Admin / Ops ---
  getAdminStats: () => request("/admin/stats"),
  getPendingDrivers: () => request("/admin/drivers/pending"),
  getAllUsers: () => request("/admin/users"),

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
  getDriverEarnings: () => request("/wallet/earnings"),
  getWalletHistory: () => request("/wallet/history"),

  // Anonymised nearby-rider positions for the supply indicator on the
  // customer home. Public (a guest browsing needs it) and deliberately
  // coarse — see location.controller.ts for the privacy reasoning.
  getNearbyRiders: (lat, lng) => request(`/location/nearby?lat=${lat}&lng=${lng}`),

  // --- Uploads ---
  // purpose must be one of the backend's UploadPurpose enum values
  // ("kyc-doc" | "proof-of-delivery" | "profile-photo"), and fileName is
  // required — the DTO rejects the request without it. Returns
  // { uploadUrl, publicUrl, key, expiresInSeconds }.
  presignUpload: (purpose, contentType, fileName) =>
    request("/uploads/presign", { method: "POST", body: { purpose, contentType, fileName } }),

  // --- Restaurants (Food marketplace) ---
  browseRestaurants: (search) => request(`/restaurants${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getRestaurant: (id) => request(`/restaurants/${id}`),
  createRestaurant: (dto) => request("/restaurants", { method: "POST", body: dto }),
  getMyRestaurant: () => request("/restaurants/me"),
  updateMyRestaurant: (dto) => request("/restaurants/me", { method: "PATCH", body: dto }),
  toggleRestaurantOpen: () => request("/restaurants/me/toggle-open", { method: "PATCH" }),
  addMenuItem: (dto) => request("/restaurants/me/menu", { method: "POST", body: dto }),
  updateMenuItem: (itemId, dto) => request(`/restaurants/me/menu/${itemId}`, { method: "PATCH", body: dto }),
  archiveMenuItem: (itemId) => request(`/restaurants/me/menu/${itemId}/archive`, { method: "PATCH" }),
  getPendingRestaurants: () => request("/restaurants/admin/pending"),
  approveRestaurant: (id) => request(`/restaurants/admin/${id}/approve`, { method: "POST" }),
  suspendRestaurant: (id) => request(`/restaurants/admin/${id}/suspend`, { method: "POST" }),

  // --- Food Orders ---
  createFoodOrder: (dto) => request("/food-orders", { method: "POST", body: dto }),
  listMyFoodOrders: () => request("/food-orders"),
  getFoodOrder: (id) => request(`/food-orders/${id}`),
  cancelFoodOrder: (id) => request(`/food-orders/${id}/cancel`, { method: "POST" }),
  rateFoodOrder: (id, score, comment) => request(`/food-orders/${id}/rate`, { method: "POST", body: { score, comment } }),
  listRestaurantOrders: () => request("/food-orders/restaurant/mine"),
  restaurantAcceptOrder: (id) => request(`/food-orders/${id}/restaurant-accept`, { method: "POST" }),
  markOrderReady: (id) => request(`/food-orders/${id}/mark-ready`, { method: "POST" }),
  acceptFoodOffer: (id) => request(`/food-orders/${id}/accept`, { method: "POST" }),
  declineFoodOffer: (id) => request(`/food-orders/${id}/decline`, { method: "POST" }),
  markFoodPickedUp: (id) => request(`/food-orders/${id}/picked-up`, { method: "POST" }),
  markFoodDelivered: (id) => request(`/food-orders/${id}/delivered`, { method: "POST" }),

  // --- Chat (one thread per Trip/Delivery/FoodOrder/Errand — see backend
  // ChatService for how the two allowed participants are resolved) ---
  listChatMessages: (contextType, contextId) => request(`/chat/${contextType}/${contextId}`),
  sendChatMessage: (contextType, contextId, body) => request(`/chat/${contextType}/${contextId}`, { method: "POST", body: { body } }),

  // --- Safety ---
  raiseIncident: (dto) => request("/safety/incidents", { method: "POST", body: dto }),
  listOpenIncidents: () => request("/safety/incidents/open"),
  updateIncident: (id, status, resolution) =>
    request(`/safety/incidents/${id}`, { method: "PATCH", body: { status, resolution } }),

  // --- Trip sharing (public read needs no auth — see publicRequest below) ---
  shareTrip: (tripId) => request(`/trips/${tripId}/share`, { method: "POST" }),

  // --- Driver onboarding ---
  getDriverOnboarding: () => request("/users/me/onboarding"),
  saveDriverOnboarding: (dto) => request("/users/me/onboarding", { method: "PATCH", body: dto }),
  submitDriverOnboarding: () => request("/users/me/onboarding/submit", { method: "POST" }),
  getDriverApplication: (id) => request(`/users/${id}/application`),
  reviewDriver: (id, dto) => request(`/users/${id}/review`, { method: "PATCH", body: dto }),
  rejectDriverKyc: (id, reason) => request(`/users/${id}/reject-kyc`, { method: "POST", body: { reason } }),

  // --- Ops: dispatch fallback + funnel ---
  getStuckJobs: (minutes) => request(`/admin/stuck-jobs${minutes ? `?minutes=${minutes}` : ""}`),
  getAvailableDrivers: () => request("/admin/drivers/available"),
  manuallyAssign: (jobType, jobId, driverId) =>
    request("/admin/assign", { method: "POST", body: { jobType, jobId, driverId } }),
  getFunnel: (days) => request(`/analytics/funnel${days ? `?days=${days}` : ""}`),
  getLiveDrivers: () => request("/admin/drivers/live"),
  suspendUser: (id, reason) => request(`/admin/users/${id}/suspend`, { method: "POST", body: { reason } }),
  reactivateUser: (id) => request(`/admin/users/${id}/reactivate`, { method: "POST" }),
  getCancellations: (hours) => request(`/admin/cancellations${hours ? `?hours=${hours}` : ""}`),
  getBalances: () => request("/admin/balances"),
  getTickets: (status) => request(`/admin/tickets${status ? `?status=${status}` : ""}`),
  resolveTicket: (id) => request(`/admin/tickets/${id}/resolve`, { method: "POST" }),
  getDriverBalances: () => request("/admin/drivers/balances"),
  adminTopUp: (userId, amount) => request(`/wallet/admin/topup/${userId}`, { method: "POST", body: { amount } }),

  // --- Errands (Pick & Deliver to Me) ---
  createErrand: (dto) => request("/errands", { method: "POST", body: dto }),
  listMyErrands: () => request("/errands"),
  getErrand: (id) => request(`/errands/${id}`),
  cancelErrand: (id) => request(`/errands/${id}/cancel`, { method: "POST" }),
  acceptErrandOffer: (id) => request(`/errands/${id}/accept`, { method: "POST" }),
  declineErrandOffer: (id) => request(`/errands/${id}/decline`, { method: "POST" }),
  startErrandShopping: (id) => request(`/errands/${id}/start-shopping`, { method: "POST" }),
  markErrandOnTheWay: (id, actualSpend) => request(`/errands/${id}/on-the-way`, { method: "POST", body: { actualSpend } }),
  markErrandDelivered: (id) => request(`/errands/${id}/delivered`, { method: "POST" }),

  // Public read for a shared trip link. Bypasses `request()` entirely — no
  // Authorization header and no 401-refresh dance, because the whole point
  // is that the person opening this has no account.
  getSharedTrip: async (shareToken) => {
    const res = await fetch(`${BASE}/public/trips/shared/${encodeURIComponent(shareToken)}`);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
    if (!res.ok) throw new ApiError((data && data.message) || "This share link isn't valid", res.status, data);
    return data;
  },
};
