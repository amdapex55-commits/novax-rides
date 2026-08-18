// Nova Go Rides — REST client for novax-backend. Every path/field here was
// read directly from the backend's controllers/DTOs (trips.controller.ts,
// delivery.controller.ts, auth.controller.ts, ratings/dto/rate.dto.ts,
// create-delivery.dto.ts), not guessed.
import { CONFIG } from "./config.js";

const BASE = CONFIG.API_BASE_URL;

/* ONE ORIGIN, FOUR APPS, ONE SET OF KEYS — WHICH MEANT ONE SESSION.

   customer.html, driver.html, merchant.html and ops.html all ship from the
   same origin and all read `novago_access`. So signing into any one of them
   overwrote the session of the other three. Proven live: a driver sitting on
   the dashboard, online and waiting, was handed a real job offer — and the
   moment a customer signed in on the same device the driver's own screen
   said "Wrong app: this number is registered as a rider account", mid-offer.

   That is not only a testing nuisance. It is anyone running the customer and
   driver apps on one phone, every operator with the ops console open beside
   the customer app, and every support person reproducing a rider's problem.
   Each app now keeps its own keys, so four sessions coexist and none of them
   can evict another.

   The old unscoped keys are migrated on first read rather than dropped,
   because otherwise this change signs out every existing user exactly once —
   which is the thing we have just spent a session trying to stop doing. */
const APP_KEY = (typeof window !== "undefined" && window.NOVAGO_APP) || "customer";
const LS = `novago_${APP_KEY}_`;
const LEGACY_LS = "novago_";

/** Move a pre-scoping session into this app's namespace, once. */
function migrateLegacyKeys() {
  try {
    if (localStorage.getItem(LS + "access")) return;      // already scoped
    const legacyRole = localStorage.getItem(LEGACY_LS + "user");
    if (!localStorage.getItem(LEGACY_LS + "access")) return;
    // Only adopt it if the stored role actually belongs to this build —
    // otherwise the driver app would inherit a customer session and land
    // straight on the "wrong app" screen it used to.
    const role = legacyRole ? (JSON.parse(legacyRole).role || "") : "";
    const belongs =
      (APP_KEY === "customer" && role === "RIDER") ||
      (APP_KEY === "driver" && role === "DRIVER") ||
      (APP_KEY === "ops" && role === "ADMIN") ||
      (APP_KEY === "merchant" && role === "RESTAURANT");
    if (!belongs) return;
    for (const k of ["access", "refresh", "phone", "user"]) {
      const v = localStorage.getItem(LEGACY_LS + k);
      if (v != null) localStorage.setItem(LS + k, v);
    }
  } catch { /* storage blocked — a fresh sign-in is the fallback */ }
}
migrateLegacyKeys();

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
      // Status carried through so the caller can tell a dead token from a
      // dead network — see the note at the 401 branch in request().
      if (!res.ok) throw new ApiError("Refresh failed", res.status);
      return res.json();
    })
    .catch((err) => {
      // fetch() rejects on transport failure with a TypeError and no status.
      if (err instanceof ApiError) throw err;
      throw new ApiError("Network unreachable during refresh", 0, { retryable: true });
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
    /* A 401 IS NOT AUTOMATICALLY A SIGN-OUT.

       Refreshing can fail for two completely different reasons and only one
       of them means the session is over:

         the server answered 4xx  -> the refresh token really is dead
         the request never landed -> a tunnel, a lift, a dropped cell

       Treating the second as the first is what threw riders back to the
       login screen mid-shift. On a bike in Karachi the network drops
       constantly, and a driver who has to re-authenticate at a junction is a
       driver who stops using the app. So a transport failure re-throws the
       ORIGINAL 401 as retryable and leaves the tokens exactly where they
       are; the next request, seconds later, usually just works. */
    try {
      await doRefresh();
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err;
      throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0, { retryable: true });
    }
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
  // Cash out a COD balance. Server re-checks the amount against the real
  // balance — a client-supplied number is a request, not a fact.
  requestWithdrawal: (amount, method, destination) =>
    request("/wallet/withdraw", { method: "POST", body: { amount, method, destination } }),

  // Google Play requires in-app deletion. Anonymises server-side; anonymous
  // financial records survive (see users.service.ts).
  deleteAccount: () => request("/users/me", { method: "DELETE" }),

  /* Recovery is a REQUEST, not a reset: there is no delivery channel yet, so
     ops closes the loop by phone. Same response whether or not the contact
     exists — see the backend. */
  requestPasswordReset: (contact, note) =>
    request("/users/password-reset-request", {
      method: "POST",
      body: { contact, ...(note ? { note } : {}) },
    }),

  /* Password auth — the only signup path. The OTP client methods were
     removed with the screens that called them; the backend endpoints stay,
     gated off behind ENABLE_OTP_LOGIN, for whenever an SMS sender is
     provisioned.

     TOKEN STORAGE LIVES HERE, not in the view. The OTP flow had always worked
     this way and register/login did not, which is what broke signup: the
     screen called a Token.set() that has never existed on this object (it
     exposes `access`/`refresh`/`user` setters and clear(), nothing else), so
     every successful signup threw immediately after the server had already
     created the account.

     getMe() is awaited before resolving because the router's auth guard reads
     Token.user for the role. Returning without it sends a freshly signed-up
     person to a guard that sees no user and bounces them straight back to
     the sign-in screen they just completed. */
  register: (dto) =>
    request("/auth/register", { method: "POST", body: dto }).then(async (data) => {
      Token.access = data.accessToken;
      Token.refresh = data.refreshToken;
      if (dto?.phone) Token.phone = dto.phone;
      await api.getMe().catch(() => {});
      return data;
    }),

  login: (identifier, password) =>
    request("/auth/login", { method: "POST", body: { identifier, password } }).then(async (data) => {
      Token.access = data.accessToken;
      Token.refresh = data.refreshToken;
      await api.getMe().catch(() => {});
      return data;
    }),

  /* Sign-out clears the session AND stops push reaching this handset.
     Without the second half, the next person to sign in on a shared phone —
     which in this market is common for driver handsets — keeps receiving the
     previous user's job offers until they happen to re-register. Fire and
     forget: a failed unregister must never block someone from signing out. */
  logout: () => {
    import("./push.js").then((m) => m.disablePush()).catch(() => {});
    Token.clear();
  },

  // --- Users ---
  getMe: () => request("/users/me").then((u) => { Token.user = u; return u; }),
  // Accepts a patch object. Kept backwards-compatible with the old
  // updateMe("Ahmed") call shape so a screen I haven't touched can't break.
  updateMe: (patch) =>
    request("/users/me", {
      method: "PATCH",
      body: typeof patch === "string" ? { name: patch } : patch,
    }),
  getVehicle: () => request("/users/me/vehicle"),
  updateVehicle: (dto) => request("/users/me/vehicle", { method: "PATCH", body: dto }),
  approveKyc: (userId) => request(`/users/${userId}/approve-kyc`, { method: "POST" }),
  setDriverMode: (mode) => request("/users/me/mode", { method: "PATCH", body: { mode } }),

  // --- Loyalty & Referrals ---
  getLoyalty: () => request("/loyalty/me"),

  // --- Notifications ---
  getNotifications: () => request("/notifications/me"),
  // Called on every cold start once signed in — FCM rotates tokens, so a
  // one-time registration silently stops working weeks later.
  registerDevice: (dto) => request("/notifications/devices", { method: "POST", body: dto }),
  unregisterDevice: (token) =>
    request(`/notifications/devices/${encodeURIComponent(token)}`, { method: "DELETE" }),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH" }),

  // --- Support ---
  // The user's own tickets. The endpoint existed and nothing called it, so
  // someone could raise a ticket and then never see it again — no status, no
  // reply, no evidence it had been received.
  listMySupportTickets: () => request("/support/tickets/me"),

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
  // reason is optional on the wire so an older cached bundle can still
  // cancel — nobody should be trapped in a booking because their app is a
  // version behind.
  cancelTrip: (id, reason, note) =>
    request(`/trips/${id}/cancel`, {
      method: "POST",
      ...(reason ? { body: { reason, ...(note ? { note } : {}) } } : {}),
    }),
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
  getMarketplaceMetrics: (minutes) => request(`/admin/marketplace?minutes=${minutes || 60}`),
  getTripEvents: (tripId) => request(`/trips/${tripId}/events`),
  getNearbyRiders: (lat, lng) => request(`/location/nearby?lat=${lat}&lng=${lng}`),
  // Liveness. The server stops believing a driver is online when these stop
  // arriving — see LocationService.recordHeartbeat for why a boolean the app
  // sets is not enough.
  sendHeartbeat: (device) => request("/location/heartbeat", { method: "POST", body: device || {} }),
  getDriverStatus: () => request("/location/driver-status"),

  // --- Uploads ---
  // purpose must be one of the backend's UploadPurpose enum values
  // ("kyc-doc" | "proof-of-delivery" | "profile-photo"), and fileName is
  // required — the DTO rejects the request without it. Returns
  // { uploadUrl, publicUrl, key, expiresInSeconds }.
  /* Identity documents are no longer public objects — the stored value is an
     object key and this exchanges it for a signed URL that dies in two
     minutes. Accepts a legacy absolute pub-….r2.dev URL too, so records made
     before the bucket was locked down still open. */
  viewPrivateDoc: (keyOrUrl) =>
    request("/uploads/view", { method: "POST", body: { key: String(keyOrUrl) } }),

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
  // Business leads, referrals and loyalty — all three were captured and none
  // were readable from ops.
  getGrowth: () => request("/admin/growth"),
  setLeadStatus: (id, status) =>
    request(`/admin/leads/${id}`, { method: "PATCH", body: { status } }),
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
