// Nova Go — which app is this build?
//
// One codebase, four products. Each entry point (index.html, driver.html,
// merchant.html, ops.html) sets window.NOVAGO_APP before app.js loads, and
// everything downstream — routes, nav, signup role, splash destination —
// reads from here.
//
// Why not four codebases: the four apps share the map layer, the API client,
// the socket, chat, the design system, and every model. Splitting the repo
// would mean fixing every bug four times. Splitting the *experience* while
// sharing the engine is what Careem/Uber do, and it's what this file buys.
//
// The point of the split is emotional, not technical: a customer must never
// see the words "KYC", "driver mode", "approval queue" or "ops". They should
// see a product that does one thing — get me a ride, get me food. Drivers
// see earnings. Restaurants see orders. Ops sees control.

import { SERVICES } from "./launch.config.js";

export const APP = (typeof window !== "undefined" && window.NOVAGO_APP) || "customer";

function liveServiceCount() {
  return Object.values(SERVICES).filter((s) => s.live).length;
}

/**
 * Route prefixes belonging to a service that isn't live yet.
 *
 * Rather than deleting these routes (which would 404 old links and mean
 * un-deleting a dozen entries when food launches), each parked service's
 * routes are redirected to /coming-soon. Flipping SERVICES.food.live to
 * true in launch.config.js switches the real screens back on with no other
 * change anywhere in the codebase.
 */
const SERVICE_ROUTE_PREFIXES = {
  food: ["/food/"],
  parcel: ["/parcel/"],
  errand: ["/errand/"],
};

/** Which service does this route belong to, if any? */
export function serviceForRoute(path) {
  for (const [key, prefixes] of Object.entries(SERVICE_ROUTE_PREFIXES)) {
    if (prefixes.some((p) => path.startsWith(p))) return key;
  }
  return null;
}

/** True when the route's service is parked and should show coming-soon. */
export function isParkedRoute(path) {
  const svc = serviceForRoute(path);
  return !!svc && !SERVICES[svc]?.live;
}

const CONFIGS = {
  customer: {
    key: "customer",
    // Pilot naming. "Nova Go Bike" sets the expectation the app can actually
    // meet; "Rides, food, parcels & errands" promises three things that
    // aren't live and makes the app feel broken rather than focused.
    name: SERVICES.ride.live && liveServiceCount() === 1 ? "Nova Go Bike" : "Nova Go",
    tagline: liveServiceCount() === 1 ? "Bike rides across Karachi" : "Rides, food, parcels & errands",
    // Role assigned when a brand-new number signs up through this app.
    signupRole: "RIDER",
    // Which backend role is allowed to use this app at all.
    allowedRoles: ["RIDER"],
    home: "/home",
    // Everything a consumer can reach. Anything not listed is invisible in
    // this build — the driver/restaurant/ops worlds simply don't exist here.
    //
    // Parked services keep their routes registered so nothing 404s if a
    // customer has an old link bookmarked, but the tiles route to
    // /coming-soon instead. See routeAllowed() below, which redirects any
    // parked service route to the coming-soon screen.
    routes: [
      "/splash", "/welcome", "/signin", "/signup", "/phone", "/otp",
      "/home", "/ride", "/set-locations", "/fare", "/tracking", "/rate", "/shared",
      "/coming-soon",
      "/food/browse", "/food/restaurant", "/food/cart", "/food/tracking",
      "/parcel/service", "/parcel/details", "/parcel/contact", "/parcel/tracking",
      "/errand/details", "/errand/tracking",
      "/wallet", "/history", "/profile", "/settings", "/alerts",
      "/loyalty", "/refer", "/business",
      "/chat", "/support", "/help", "/chat-thread", "/explainer/fixed-fare",
      "/legal/terms", "/legal/privacy", "/legal/cancellation",
      "/legal/safety",
    ],
    // Wallet is dropped from the pilot nav: it's cash-only, so a Wallet tab
    // that can only ever show Rs. 0 is a tab that teaches people the app is
    // half-built. Route stays registered for when top-ups arrive.
    nav: [
      { tab: "home", icon: "home", label: "Ride", path: "/home" },
      { tab: "history", icon: "history", label: "Trips", path: "/history" },
      { tab: "help", icon: "help", label: "Help", path: "/support" },
      { tab: "profile", icon: "person", label: "Profile", path: "/profile" },
    ],
  },

  driver: {
    key: "driver",
    name: "Nova Go Driver",
    tagline: "Drive. Deliver. Earn.",
    signupRole: "DRIVER",
    allowedRoles: ["DRIVER"],
    home: "/driver/home",
    routes: [
      "/splash", "/welcome", "/signin", "/signup", "/phone", "/otp",
      "/driver/onboarding", "/driver/pending", "/driver/kyc",
      "/driver/home", "/driver/offer", "/driver/progress",
      "/driver/food-offer", "/driver/food-progress",
      "/driver/errand-offer", "/driver/errand-progress",
      "/driver/earnings", "/driver/profile", "/driver/vehicle",
      "/driver/notifications", "/driver/incentives", "/driver/settle", "/driver/diagnostics",
      "/chat", "/support", "/help", "/chat-thread", "/explainer/fixed-fare", "/earnings-explained",
      "/legal/terms", "/legal/privacy", "/legal/driver-agreement", "/legal/safety",
    ],
    nav: [
      { tab: "home", icon: "home", label: "Home", path: "/driver/home" },
      { tab: "earnings", icon: "wallet", label: "Earnings", path: "/driver/earnings" },
      { tab: "alerts", icon: "bell", label: "Alerts", path: "/driver/notifications" },
      { tab: "profile", icon: "person", label: "Profile", path: "/driver/profile" },
    ],
  },

  merchant: {
    key: "merchant",
    name: "Nova Go Merchant",
    tagline: "Your kitchen, online",
    signupRole: "RESTAURANT",
    allowedRoles: ["RESTAURANT"],
    home: "/restaurant/orders",
    routes: [
      "/splash", "/welcome", "/signin", "/signup", "/phone", "/otp",
      "/restaurant/onboarding", "/restaurant/pending",
      "/restaurant/orders", "/restaurant/menu", "/restaurant/profile",
      "/chat", "/support", "/help", "/commission-explained",
      "/legal/terms", "/legal/privacy", "/legal/restaurant-agreement",
    ],
    nav: [
      { tab: "orders", icon: "package", label: "Orders", path: "/restaurant/orders" },
      { tab: "menu", icon: "utensils", label: "Menu", path: "/restaurant/menu" },
      { tab: "profile", icon: "store", label: "Store", path: "/restaurant/profile" },
    ],
  },

  ops: {
    key: "ops",
    name: "Nova Go Ops",
    tagline: "Dispatch & control",
    // Nobody self-signs-up as an admin — an ops account is created by
    // promoting an existing user in the database. Signing up here just
    // makes a rider account that then gets bounced.
    signupRole: null,
    allowedRoles: ["ADMIN"],
    home: "/ops/dashboard",
    routes: [
      "/splash", "/welcome", "/signin", "/signup", "/phone", "/otp",
      "/ops/command", "/ops/dashboard", "/ops/approvals", "/ops/users",
      "/ops/live", "/ops/cancellations", "/ops/balances", "/ops/tickets",
      "/ops/settle", "/ops/growth", "/ops/market", "/ops/trip",
      "/support", "/help",
      "/legal/terms", "/legal/privacy",
    ],
    nav: [
      // Today first: it's the screen that says what to do next, and it's
      // where a dispatcher should land every morning.
      { tab: "dashboard", icon: "dashboard", label: "Today", path: "/ops/dashboard" },
      { tab: "live", icon: "car", label: "Live", path: "/ops/live" },
      { tab: "approvals", icon: "check-circle", label: "Approve", path: "/ops/approvals" },
      { tab: "settle", icon: "wallet", label: "Settle", path: "/ops/settle" },
      { tab: "market", icon: "dashboard", label: "Market", path: "/ops/market" },
      { tab: "growth", icon: "gift", label: "Growth", path: "/ops/growth" },
    ],
  },
};

export const APP_CONFIG = CONFIGS[APP] || CONFIGS.customer;

/** Is this route part of this build at all? */
/**
 * Routes every build must be able to reach, whatever its own allowlist says.
 *
 * These are the screens the auth guard REDIRECTS TO. If one is ever missing
 * from an app's `routes` array, the result isn't a missing page — it's an
 * infinite loop: the guard sends an unauthenticated visitor to /signin,
 * routeAllowed() rejects it, the scope guard sends them to the app's home,
 * home needs auth, and round it goes. The user sees a permanently blank
 * screen and nothing is logged, because nothing threw.
 *
 * That exact loop happened once already with the wrong-app guard (see the
 * comment in router.js). Listing the redirect targets here makes the whole
 * class of bug impossible rather than relying on four allowlists staying in
 * sync by hand.
 */
const UNIVERSAL_ROUTES = new Set([
  "/splash",
  "/welcome",
  "/signin",
  "/signup",
  "/phone",
  "/otp",
  "/coming-soon",
]);

export function routeAllowed(path) {
  if (UNIVERSAL_ROUTES.has(path)) return true;
  // Legal pages are linked from signup and from the footer of every app.
  if (path.startsWith("/legal/")) return true;
  if (path.startsWith("/shared/")) return APP_CONFIG.routes.includes("/shared");
  if (path.startsWith("/ops/trip/")) return APP_CONFIG.routes.includes("/ops/trip");
  return APP_CONFIG.routes.includes(path);
}

/* The build identifier reported to the server with each driver heartbeat and
   shown on the device-diagnostics screen. Ops uses it to answer "are they on
   an old build?" without asking, which is the first question when one
   driver's app behaves differently from everyone else's.
   Bump alongside the service-worker version in sw.js — they describe the same
   deploy, and a version that never changes is worse than none because it
   looks trustworthy. */
export const APP_VERSION = "1.0.0-v25";

export const isCustomerApp = APP === "customer";
export const isDriverApp = APP === "driver";
export const isMerchantApp = APP === "merchant";
export const isOpsApp = APP === "ops";
