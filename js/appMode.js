// Nova X — which app is this build?
//
// One codebase, four products. Each entry point (index.html, driver.html,
// merchant.html, ops.html) sets window.NOVAX_APP before app.js loads, and
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

export const APP = (typeof window !== "undefined" && window.NOVAX_APP) || "customer";

const CONFIGS = {
  customer: {
    key: "customer",
    name: "Nova X",
    tagline: "Rides, food, parcels & errands",
    // Role assigned when a brand-new number signs up through this app.
    signupRole: "RIDER",
    // Which backend role is allowed to use this app at all.
    allowedRoles: ["RIDER"],
    home: "/home",
    // Everything a consumer can reach. Anything not listed is invisible in
    // this build — the driver/restaurant/ops worlds simply don't exist here.
    routes: [
      "/splash", "/welcome", "/phone", "/otp",
      "/home", "/ride", "/set-locations", "/fare", "/tracking", "/rate", "/shared",
      "/food/browse", "/food/restaurant", "/food/cart", "/food/tracking",
      "/parcel/service", "/parcel/details", "/parcel/contact", "/parcel/tracking",
      "/errand/details", "/errand/tracking",
      "/wallet", "/history", "/profile", "/settings",
      "/loyalty", "/refer", "/business",
      "/chat", "/support", "/chat-thread",
      "/legal/terms", "/legal/privacy", "/legal/cancellation",
    ],
    nav: [
      { tab: "home", icon: "home", label: "Home", path: "/home" },
      { tab: "history", icon: "history", label: "Activity", path: "/history" },
      { tab: "wallet", icon: "wallet", label: "Wallet", path: "/wallet" },
      { tab: "profile", icon: "person", label: "Profile", path: "/profile" },
    ],
  },

  driver: {
    key: "driver",
    name: "Nova X Driver",
    tagline: "Drive. Deliver. Earn.",
    signupRole: "DRIVER",
    allowedRoles: ["DRIVER"],
    home: "/driver/home",
    routes: [
      "/splash", "/welcome", "/phone", "/otp",
      "/driver/onboarding", "/driver/pending", "/driver/kyc",
      "/driver/home", "/driver/offer", "/driver/progress",
      "/driver/food-offer", "/driver/food-progress",
      "/driver/errand-offer", "/driver/errand-progress",
      "/driver/earnings", "/driver/profile", "/driver/vehicle",
      "/driver/notifications", "/driver/incentives",
      "/chat", "/support", "/chat-thread",
      "/legal/terms", "/legal/privacy", "/legal/driver-agreement",
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
    name: "Nova X Merchant",
    tagline: "Your kitchen, online",
    signupRole: "RESTAURANT",
    allowedRoles: ["RESTAURANT"],
    home: "/restaurant/orders",
    routes: [
      "/splash", "/welcome", "/phone", "/otp",
      "/restaurant/onboarding", "/restaurant/pending",
      "/restaurant/orders", "/restaurant/menu", "/restaurant/profile",
      "/chat", "/support",
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
    name: "Nova X Ops",
    tagline: "Dispatch & control",
    // Nobody self-signs-up as an admin — an ops account is created by
    // promoting an existing user in the database. Signing up here just
    // makes a rider account that then gets bounced.
    signupRole: null,
    allowedRoles: ["ADMIN"],
    home: "/ops/command",
    routes: [
      "/splash", "/welcome", "/phone", "/otp",
      "/ops/command", "/ops/dashboard", "/ops/approvals", "/ops/users",
      "/support",
      "/legal/terms", "/legal/privacy",
    ],
    nav: [
      { tab: "command", icon: "bolt", label: "Command", path: "/ops/command" },
      { tab: "dashboard", icon: "dashboard", label: "Stats", path: "/ops/dashboard" },
      { tab: "approvals", icon: "check-circle", label: "Approvals", path: "/ops/approvals" },
      { tab: "users", icon: "users", label: "Users", path: "/ops/users" },
    ],
  },
};

export const APP_CONFIG = CONFIGS[APP] || CONFIGS.customer;

/** Is this route part of this build at all? */
export function routeAllowed(path) {
  if (path.startsWith("/shared/")) return APP_CONFIG.routes.includes("/shared");
  return APP_CONFIG.routes.includes(path);
}

export const isCustomerApp = APP === "customer";
export const isDriverApp = APP === "driver";
export const isMerchantApp = APP === "merchant";
export const isOpsApp = APP === "ops";
