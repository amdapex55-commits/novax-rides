// Nova X Rides — hash router. A true SPA: view modules mount into
// #view-container, the previous view's cleanup() runs first (clears
// intervals/geolocation watches/socket listeners so nothing leaks across
// navigation), then the new view renders with a fade-rise transition.
import { Token } from "./api.js";
import * as Auth from "./auth.js";
import * as RiderHome from "./riderHome.js";
import * as RiderTrip from "./riderTrip.js";
import * as RiderAccount from "./riderAccount.js";
import * as RiderExtras from "./riderExtras.js";
import * as DriverAuth from "./driverAuth.js";
import * as DriverHome from "./driverHome.js";
import * as DriverAccount from "./driverAccount.js";
import * as Parcel from "./parcel.js";
import * as Ops from "./ops.js";
import * as Support from "./support.js";

// auth: "none" (public) | "any" (any logged-in role) | "RIDER" | "DRIVER" | "ADMIN"
export const ROUTES = {
  "/splash": { render: Auth.renderSplash, auth: "none", nav: false },
  "/phone": { render: (root) => Auth.renderPhoneEntry("RIDER")(root), auth: "none", nav: false },
  "/driver/phone": { render: (root) => Auth.renderPhoneEntry("DRIVER")(root), auth: "none", nav: false },
  "/otp": { render: Auth.renderOtp, auth: "none", nav: false },

  "/home": { render: RiderHome.renderHome, auth: "RIDER", nav: true, tab: "home" },
  "/set-locations": { render: RiderHome.renderSetLocations, auth: "RIDER", nav: false },
  "/fare": { render: RiderHome.renderFareSelection, auth: "RIDER", nav: false },
  "/tracking": { render: RiderTrip.renderActiveTracking, auth: "RIDER", nav: false },
  "/rate": { render: RiderTrip.renderRateTrip, auth: "RIDER", nav: false },
  "/wallet": { render: RiderAccount.renderWallet, auth: "RIDER", nav: true, tab: "wallet" },
  "/history": { render: RiderAccount.renderTripHistory, auth: "RIDER", nav: true, tab: "history" },
  "/profile": { render: RiderAccount.renderProfile, auth: "RIDER", nav: true, tab: "profile" },
  "/settings": { render: RiderAccount.renderSettings, auth: "RIDER", nav: false },
  "/loyalty": { render: RiderExtras.renderLoyalty, auth: "RIDER", nav: false },
  "/refer": { render: RiderExtras.renderRefer, auth: "RIDER", nav: false },
  "/business": { render: RiderExtras.renderBusiness, auth: "RIDER", nav: false },

  "/driver/pending": { render: DriverAuth.renderPendingApproval, auth: "DRIVER", nav: false },
  "/driver/kyc": { render: DriverAuth.renderKycUpload, auth: "DRIVER", nav: false },
  "/driver/home": { render: DriverHome.renderDriverHome, auth: "DRIVER", nav: true, tab: "home" },
  "/driver/offer": { render: DriverHome.renderIncomingOffer, auth: "DRIVER", nav: false },
  "/driver/progress": { render: DriverHome.renderTripProgress, auth: "DRIVER", nav: false },
  "/driver/earnings": { render: DriverAccount.renderEarnings, auth: "DRIVER", nav: true, tab: "earnings" },
  "/driver/profile": { render: DriverAccount.renderDriverProfile, auth: "DRIVER", nav: true, tab: "profile" },
  "/driver/vehicle": { render: DriverAccount.renderVehicle, auth: "DRIVER", nav: false },
  "/driver/notifications": { render: DriverAccount.renderDriverNotifications, auth: "DRIVER", nav: true, tab: "alerts" },
  "/driver/incentives": { render: DriverAccount.renderIncentives, auth: "DRIVER", nav: false },

  "/parcel/service": { render: Parcel.renderParcelService, auth: "RIDER", nav: false },
  "/parcel/details": { render: Parcel.renderParcelDetails, auth: "RIDER", nav: false },
  "/parcel/contact": { render: Parcel.renderParcelContact, auth: "RIDER", nav: false },
  "/parcel/tracking": { render: Parcel.renderParcelTracking, auth: "RIDER", nav: false },

  "/ops/dashboard": { render: Ops.renderOpsDashboard, auth: "ADMIN", nav: true, tab: "dashboard" },
  "/ops/approvals": { render: Ops.renderOpsApprovals, auth: "ADMIN", nav: true, tab: "approvals" },
  "/ops/users": { render: Ops.renderOpsUsers, auth: "ADMIN", nav: true, tab: "users" },

  "/chat": { render: Support.renderChat, auth: "any", nav: false },
  "/support": { render: Support.renderSupport, auth: "any", nav: false },
};

let currentCleanup = null;
let currentRoute = null;

function roleHome(role) {
  if (role === "DRIVER") return Token.user?.kycStatus === "APPROVED" ? "/driver/home" : "/driver/pending";
  if (role === "ADMIN") return "/ops/dashboard";
  return "/home";
}

export function navigate(path) {
  if (location.hash.slice(1) === path) { renderRoute(path); return; }
  location.hash = path;
}

function resolvePath() {
  return location.hash.slice(1) || "/splash";
}

async function renderRoute(path) {
  const route = ROUTES[path];
  const container = document.getElementById("view-container");
  const nav = document.getElementById("bottom-nav");

  if (!route) { navigate("/splash"); return; }

  // Auth guard
  if (route.auth !== "none") {
    const user = Token.user;
    if (!Token.access || !user) { navigate("/phone"); return; }
    if (route.auth !== "any" && route.auth !== user.role) { navigate(roleHome(user.role)); return; }
  }

  if (currentCleanup) { try { currentCleanup(); } catch (e) { console.error("[NovaX] cleanup error:", e); } currentCleanup = null; }

  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "view-enter";
  container.appendChild(wrap);

  nav.classList.toggle("hidden", !route.nav);
  if (route.nav) renderNavActive(route.tab);

  try {
    currentCleanup = (await route.render(wrap)) || null;
  } catch (e) {
    console.error("[NovaX] render error on", path, e);
    wrap.innerHTML = `<div class="page text-center"><p class="text-secondary">Something broke loading this screen.</p><p class="text-xs text-muted mt-2">${(e && e.message) || e}</p></div>`;
  }
  currentRoute = path;
  window.scrollTo(0, 0);
}

function renderNavActive(tab) {
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.tab === tab));
}

export function initRouter() {
  window.addEventListener("hashchange", () => renderRoute(resolvePath()));
  renderRoute(resolvePath());
}

export function getCurrentRoute() { return currentRoute; }
