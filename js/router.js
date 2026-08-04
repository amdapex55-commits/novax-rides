// Nova X Rides — hash router. A true SPA: view modules mount into
// #view-container, the previous view's cleanup() runs first (clears
// intervals/geolocation watches/socket listeners so nothing leaks across
// navigation), then the new view renders with a fade-rise transition.
import { Token } from "./api.js";
import { state } from "./state.js";
import * as Auth from "./views/auth.js";
import * as RiderHome from "./views/riderHome.js";
import * as RiderTrip from "./views/riderTrip.js";
import * as RiderAccount from "./views/riderAccount.js";
import * as RiderExtras from "./views/riderExtras.js";
import * as DriverAuth from "./views/driverAuth.js";
import * as DriverHome from "./views/driverHome.js";
import * as DriverAccount from "./views/driverAccount.js";
import * as Parcel from "./views/parcel.js";
import * as Ops from "./views/ops.js";
import * as Support from "./views/support.js";
import * as Food from "./views/food.js";
import * as Errand from "./views/errand.js";
import * as Restaurant from "./views/restaurant.js";
import * as DriverFoodErrand from "./views/driverFoodErrand.js";
import * as ChatThread from "./views/chatThread.js";
import * as RideFlow from "./views/rideFlow.js";
import * as RideTracking from "./views/rideTracking.js";
import * as Legal from "./views/legal.js";
import * as OpsCommand from "./views/opsCommand.js";
import * as DriverOnboarding from "./views/driverOnboarding.js";

// auth: "none" (public) | "guest" (public, but bounces a logged-in
// non-rider to their own home) | "any" (any logged-in role) | "RIDER" |
// "DRIVER" | "ADMIN". "guest" is what lets people browse the app before
// they have an account — OTP is only required at the point of an action
// that actually needs one (booking, wallet, profile, etc.).
export const ROUTES = {
  "/splash": { render: Auth.renderSplash, auth: "none", nav: false },
  "/welcome": { render: Auth.renderWelcome, auth: "guest", nav: false },
  "/phone": { render: (root) => Auth.renderPhoneEntry("RIDER")(root), auth: "none", nav: false },
  "/driver/phone": { render: (root) => Auth.renderPhoneEntry("DRIVER")(root), auth: "none", nav: false },
  "/restaurant/phone": { render: (root) => Auth.renderPhoneEntry("RESTAURANT")(root), auth: "none", nav: false },
  "/otp": { render: Auth.renderOtp, auth: "none", nav: false },

  "/home": { render: RiderHome.renderHome, auth: "guest", nav: true, tab: "home" },
  // Map-first booking — one screen with a docked sheet, replacing the old
  // /set-locations → /fare page-per-step flow (both kept as aliases so any
  // saved postAuthRedirect or bookmark still lands somewhere sane).
  "/ride": { render: RideFlow.renderRideBooking, auth: "guest", nav: false },
  "/set-locations": { render: RideFlow.renderRideBooking, auth: "guest", nav: false },
  "/fare": { render: RideFlow.renderRideBooking, auth: "guest", nav: false },
  "/tracking": { render: RideTracking.renderRideTracking, auth: "RIDER", nav: false },
  // Public live-tracking view opened from a shared link — no account needed.
  "/shared": { render: RideTracking.renderSharedTrip, auth: "none", nav: false },

  "/legal/terms": { render: Legal.renderTerms, auth: "none", nav: false },
  "/legal/privacy": { render: Legal.renderPrivacy, auth: "none", nav: false },
  "/legal/cancellation": { render: Legal.renderCancellation, auth: "none", nav: false },
  "/legal/driver-agreement": { render: Legal.renderDriverAgreement, auth: "none", nav: false },
  "/legal/restaurant-agreement": { render: Legal.renderRestaurantAgreement, auth: "none", nav: false },
  "/rate": { render: RiderTrip.renderRateTrip, auth: "RIDER", nav: false },
  "/wallet": { render: RiderAccount.renderWallet, auth: "guest", nav: true, tab: "wallet" },
  "/history": { render: RiderAccount.renderTripHistory, auth: "guest", nav: true, tab: "history" },
  "/profile": { render: RiderAccount.renderProfile, auth: "guest", nav: true, tab: "profile" },
  "/settings": { render: RiderAccount.renderSettings, auth: "RIDER", nav: false },
  "/loyalty": { render: RiderExtras.renderLoyalty, auth: "guest", nav: false },
  "/refer": { render: RiderExtras.renderRefer, auth: "guest", nav: false },
  "/business": { render: RiderExtras.renderBusiness, auth: "guest", nav: false },

  "/driver/pending": { render: DriverAuth.renderPendingApproval, auth: "DRIVER", nav: false },
  "/driver/kyc": { render: DriverAuth.renderKycUpload, auth: "DRIVER", nav: false },
  "/driver/onboarding": { render: DriverOnboarding.renderDriverOnboarding, auth: "DRIVER", nav: false },
  "/driver/home": { render: DriverHome.renderDriverHome, auth: "DRIVER", nav: true, tab: "home" },
  "/driver/offer": { render: DriverHome.renderIncomingOffer, auth: "DRIVER", nav: false },
  "/driver/progress": { render: DriverHome.renderTripProgress, auth: "DRIVER", nav: false },
  "/driver/earnings": { render: DriverAccount.renderEarnings, auth: "DRIVER", nav: true, tab: "earnings" },
  "/driver/profile": { render: DriverAccount.renderDriverProfile, auth: "DRIVER", nav: true, tab: "profile" },
  "/driver/vehicle": { render: DriverAccount.renderVehicle, auth: "DRIVER", nav: false },
  "/driver/notifications": { render: DriverAccount.renderDriverNotifications, auth: "DRIVER", nav: true, tab: "alerts" },
  "/driver/incentives": { render: DriverAccount.renderIncentives, auth: "DRIVER", nav: false },

  "/parcel/service": { render: Parcel.renderParcelService, auth: "guest", nav: false },
  "/parcel/details": { render: Parcel.renderParcelDetails, auth: "guest", nav: false },
  "/parcel/contact": { render: Parcel.renderParcelContact, auth: "guest", nav: false },
  "/parcel/tracking": { render: Parcel.renderParcelTracking, auth: "RIDER", nav: false },

  "/errand/details": { render: Errand.renderErrandDetails, auth: "guest", nav: false },
  "/errand/tracking": { render: Errand.renderErrandTracking, auth: "RIDER", nav: false },

  "/food/browse": { render: Food.renderFoodBrowse, auth: "guest", nav: false },
  "/food/restaurant": { render: Food.renderRestaurantMenu, auth: "guest", nav: false },
  "/food/cart": { render: Food.renderFoodCart, auth: "guest", nav: false },
  "/food/tracking": { render: Food.renderFoodTracking, auth: "RIDER", nav: false },

  "/ops/command": { render: OpsCommand.renderOpsCommand, auth: "ADMIN", nav: true, tab: "command" },
  "/ops/dashboard": { render: Ops.renderOpsDashboard, auth: "ADMIN", nav: true, tab: "dashboard" },
  "/ops/approvals": { render: Ops.renderOpsApprovals, auth: "ADMIN", nav: true, tab: "approvals" },
  "/ops/users": { render: Ops.renderOpsUsers, auth: "ADMIN", nav: true, tab: "users" },

  "/restaurant/onboarding": { render: Restaurant.renderRestaurantOnboarding, auth: "RESTAURANT", nav: false },
  "/restaurant/pending": { render: Restaurant.renderRestaurantPending, auth: "RESTAURANT", nav: false },
  "/restaurant/orders": { render: Restaurant.renderRestaurantOrders, auth: "RESTAURANT", nav: true, tab: "orders" },
  "/restaurant/menu": { render: Restaurant.renderRestaurantMenuManage, auth: "RESTAURANT", nav: true, tab: "menu" },
  "/restaurant/profile": { render: Restaurant.renderRestaurantProfile, auth: "RESTAURANT", nav: true, tab: "profile" },

  "/driver/food-offer": { render: DriverFoodErrand.renderFoodOfferIncoming, auth: "DRIVER", nav: false },
  "/driver/food-progress": { render: DriverFoodErrand.renderFoodOrderProgress, auth: "DRIVER", nav: false },
  "/driver/errand-offer": { render: DriverFoodErrand.renderErrandOfferIncoming, auth: "DRIVER", nav: false },
  "/driver/errand-progress": { render: DriverFoodErrand.renderErrandProgress, auth: "DRIVER", nav: false },

  // "none" here (not "guest") — support should be reachable by anyone
  // regardless of role, including a logged-in DRIVER/ADMIN, with no
  // role-based bounce. "guest" would incorrectly redirect them away.
  "/chat": { render: Support.renderChat, auth: "none", nav: false },
  "/support": { render: Support.renderSupport, auth: "none", nav: false },
  // In-app chat with the other party on an active job — separate from
  // /chat above, which is customer-support ticket messaging, not this.
  "/chat-thread": { render: ChatThread.renderChatThread, auth: "any", nav: false },
};

let currentCleanup = null;
let currentRoute = null;

function roleHome(role) {
  if (role === "DRIVER") return Token.user?.kycStatus === "APPROVED" ? "/driver/home" : "/driver/pending";
  if (role === "ADMIN") return "/ops/command";
  // RESTAURANT's real home depends on onboarding/approval status, which
  // isn't in the JWT — auth.js's restaurantHomePath() resolves that with a
  // real API call right after login. Bouncing mid-navigation here (e.g. a
  // RESTAURANT user hitting a RIDER-only route) can only safely land on the
  // orders queue; a stale bounce to onboarding would wipe an already-approved
  // restaurant back to square one, so restaurant/pending's own poll loop and
  // onboarding's own submit flow are the only paths that go there.
  if (role === "RESTAURANT") return "/restaurant/orders";
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
  // Dynamic segment support. Only one route needs it — the public share link
  // (/shared/<token>) — so this is a targeted prefix match rather than a
  // full pattern router, which would be a lot of machinery for one case.
  // The view reads the token off location.hash itself.
  let route = ROUTES[path];
  if (!route && path.startsWith("/shared/")) route = ROUTES["/shared"];
  const container = document.getElementById("view-container");
  const nav = document.getElementById("bottom-nav");

  if (!route) { navigate("/splash"); return; }

  // Auth guard
  if (route.auth === "guest") {
    // Public browsing route. A logged-out visitor (or a logged-in RIDER)
    // sees it as-is; a logged-in DRIVER/ADMIN gets bounced to their own
    // home instead of the rider guest view.
    const user = Token.user;
    if (Token.access && user && user.role !== "RIDER") { navigate(roleHome(user.role)); return; }
  } else if (route.auth !== "none") {
    const user = Token.user;
    if (!Token.access || !user) { state.postAuthRedirect = path; navigate("/phone"); return; }
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
