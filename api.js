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
  getWalletHistory: () => request("/wallet/history"),
  topUpWallet: (amount) => request("/wallet/topup", { method: "POST", body: { amount } }),

  // --- Uploads ---
  presignUpload: (purpose, contentType) => request("/uploads/presign", { method: "POST", body: { purpose, contentType } }),

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
};
