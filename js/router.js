// Nova Go — hash router.
//
// Views are LAZY: each route holds `() => import("./views/x.js")` rather than
// a static import, so a module is fetched the first time its route is
// visited and never otherwise. That's what makes the four apps real rather
// than cosmetic — the customer bundle never downloads driver, merchant or
// ops screens (or their copy: "KYC", "approvals", "dispatch"), because the
// browser is never asked for those files.
//
// Route shape: { view: () => import(...), fn: "exportName", auth, nav, tab }
// `wrap: true` marks the handful of routes whose export is a factory
// (renderPhoneEntry(role) returns the actual render function).
//
// The previous view's cleanup() still runs before the next renders, so
// intervals / geolocation watches / socket listeners never leak across
// navigation.
import { Token } from "./api.js";
import { state } from "./state.js";
import { APP_CONFIG, routeAllowed, isParkedRoute, serviceForRoute } from "./appMode.js";
import { SERVICES } from "./launch.config.js";

// auth: "none" (public) | "guest" (public, but bounces a logged-in
// non-rider to their own home) | "any" (any logged-in role) | "RIDER" |
// "DRIVER" | "ADMIN". "guest" is what lets people browse the app before
// they have an account — OTP is only required at the point of an action
// that actually needs one (booking, wallet, profile, etc.).
export const ROUTES = {
  "/splash": { view: () => import("./views/auth.js"), fn: "renderSplash", auth: "none", nav: false },
  "/welcome": { view: () => import("./views/auth.js"), fn: "renderWelcome", auth: "guest", nav: false },
  // One phone-entry route per build. Which role a brand-new number becomes
  // is decided by WHICH APP they downloaded (see appMode.js signupRole) —
  // there's no in-app role picker any more, because a customer app that asks
  // "are you a driver?" isn't a consumer product.
  // `wrap: true` — renderPhoneEntry is a factory: it takes the role and
  // returns the actual render function.
  // Password auth is the live path while SMS is being provisioned. The OTP
  // routes below still resolve, so nothing breaks for an account created that
  // way and the flow can be switched back with a redirect.
  "/signin": { view: () => import("./views/account.js"), fn: "renderSignIn", auth: "none", nav: false },
  "/signup": { view: () => import("./views/account.js"), fn: "renderSignUp", auth: "none", nav: false },
  "/phone": { view: () => import("./views/auth.js"), fn: "renderPhoneEntry", wrap: true, auth: "none", nav: false },
  "/otp": { view: () => import("./views/auth.js"), fn: "renderOtp", auth: "none", nav: false },
  // Home swaps with the pilot. With one service live the customer gets the
  // focused bike-hailing screen (map + "Where to?"); once a second service
  // goes live in launch.config.js the multi-service tabbed home returns.
  "/home": Object.values(SERVICES).filter((x) => x.live).length === 1
    ? { view: () => import("./views/bikeHome.js"), fn: "renderBikeHome", auth: "guest", nav: true, tab: "home" }
    : { view: () => import("./views/riderHome.js"), fn: "renderHome", auth: "guest", nav: true, tab: "home" },
  "/coming-soon": { view: () => import("./views/bikeHome.js"), fn: "renderComingSoon", auth: "none", nav: false },
  // Map-first booking — one screen with a docked sheet, replacing the old
  // /set-locations → /fare page-per-step flow (both kept as aliases so any
  // saved postAuthRedirect or bookmark still lands somewhere sane).
  "/ride": { view: () => import("./views/rideFlow.js"), fn: "renderRideBooking", auth: "guest", nav: false },
  "/set-locations": { view: () => import("./views/rideFlow.js"), fn: "renderRideBooking", auth: "guest", nav: false },
  "/fare": { view: () => import("./views/rideFlow.js"), fn: "renderRideBooking", auth: "guest", nav: false },
  "/tracking": { view: () => import("./views/rideTracking.js"), fn: "renderRideTracking", auth: "RIDER", nav: false },
  // Public live-tracking view opened from a shared link — no account needed.
  "/shared": { view: () => import("./views/rideTracking.js"), fn: "renderSharedTrip", auth: "none", nav: false },
  "/legal/terms": { view: () => import("./views/legal.js"), fn: "renderTerms", auth: "none", nav: false },
  "/legal/privacy": { view: () => import("./views/legal.js"), fn: "renderPrivacy", auth: "none", nav: false },
  "/legal/cancellation": { view: () => import("./views/legal.js"), fn: "renderCancellation", auth: "none", nav: false },
  "/legal/driver-agreement": { view: () => import("./views/legal.js"), fn: "renderDriverAgreement", auth: "none", nav: false },
  "/legal/restaurant-agreement": { view: () => import("./views/legal.js"), fn: "renderRestaurantAgreement", auth: "none", nav: false },
  "/legal/safety": { view: () => import("./views/legal.js"), fn: "renderSafety", auth: "none", nav: false },
  "/rate": { view: () => import("./views/riderTrip.js"), fn: "renderRateTrip", auth: "RIDER", nav: false },
  "/wallet": { view: () => import("./views/riderAccount.js"), fn: "renderWallet", auth: "guest", nav: true, tab: "wallet" },
  "/history": { view: () => import("./views/riderAccount.js"), fn: "renderTripHistory", auth: "guest", nav: true, tab: "history" },
  "/profile": { view: () => import("./views/riderAccount.js"), fn: "renderProfile", auth: "guest", nav: true, tab: "profile" },
  "/settings": { view: () => import("./views/riderAccount.js"), fn: "renderSettings", auth: "RIDER", nav: false },
  "/loyalty": { view: () => import("./views/riderExtras.js"), fn: "renderLoyalty", auth: "guest", nav: false },
  "/refer": { view: () => import("./views/riderExtras.js"), fn: "renderRefer", auth: "guest", nav: false },
  "/business": { view: () => import("./views/riderExtras.js"), fn: "renderBusiness", auth: "guest", nav: false },
  "/driver/pending": { view: () => import("./views/driverAuth.js"), fn: "renderPendingApproval", auth: "DRIVER", nav: false },
  "/driver/kyc": { view: () => import("./views/driverAuth.js"), fn: "renderKycUpload", auth: "DRIVER", nav: false },
  "/driver/onboarding": { view: () => import("./views/driverOnboarding.js"), fn: "renderDriverOnboarding", auth: "DRIVER", nav: false },
  "/driver/home": { view: () => import("./views/driverHome.js"), fn: "renderDriverHome", auth: "DRIVER", nav: true, tab: "home" },
  "/driver/offer": { view: () => import("./views/driverHome.js"), fn: "renderIncomingOffer", auth: "DRIVER", nav: false },
  "/driver/progress": { view: () => import("./views/driverHome.js"), fn: "renderTripProgress", auth: "DRIVER", nav: false },
  "/driver/earnings": { view: () => import("./views/driverAccount.js"), fn: "renderEarnings", auth: "DRIVER", nav: true, tab: "earnings" },
  "/driver/profile": { view: () => import("./views/driverAccount.js"), fn: "renderDriverProfile", auth: "DRIVER", nav: true, tab: "profile" },
  "/driver/vehicle": { view: () => import("./views/driverAccount.js"), fn: "renderVehicle", auth: "DRIVER", nav: false },
  "/driver/notifications": { view: () => import("./views/driverAccount.js"), fn: "renderDriverNotifications", auth: "DRIVER", nav: true, tab: "alerts" },
  "/driver/incentives": { view: () => import("./views/driverAccount.js"), fn: "renderIncentives", auth: "DRIVER", nav: false },
  "/parcel/service": { view: () => import("./views/parcel.js"), fn: "renderParcelService", auth: "guest", nav: false },
  "/parcel/details": { view: () => import("./views/parcel.js"), fn: "renderParcelDetails", auth: "guest", nav: false },
  "/parcel/contact": { view: () => import("./views/parcel.js"), fn: "renderParcelContact", auth: "guest", nav: false },
  "/parcel/tracking": { view: () => import("./views/parcel.js"), fn: "renderParcelTracking", auth: "RIDER", nav: false },
  "/errand/details": { view: () => import("./views/errand.js"), fn: "renderErrandDetails", auth: "guest", nav: false },
  "/errand/tracking": { view: () => import("./views/errand.js"), fn: "renderErrandTracking", auth: "RIDER", nav: false },
  "/food/browse": { view: () => import("./views/food.js"), fn: "renderFoodBrowse", auth: "guest", nav: false },
  "/food/restaurant": { view: () => import("./views/food.js"), fn: "renderRestaurantMenu", auth: "guest", nav: false },
  "/food/cart": { view: () => import("./views/food.js"), fn: "renderFoodCart", auth: "guest", nav: false },
  "/food/tracking": { view: () => import("./views/food.js"), fn: "renderFoodTracking", auth: "RIDER", nav: false },
  "/ops/command": { view: () => import("./views/opsCommand.js"), fn: "renderOpsCommand", auth: "ADMIN", nav: true, tab: "command" },
  "/ops/dashboard": { view: () => import("./views/ops.js"), fn: "renderOpsDashboard", auth: "ADMIN", nav: true, tab: "dashboard" },
  "/ops/approvals": { view: () => import("./views/ops.js"), fn: "renderOpsApprovals", auth: "ADMIN", nav: true, tab: "approvals" },
  "/ops/settle": { view: () => import("./views/opsSettle.js"), fn: "renderOpsSettle", auth: "ADMIN", nav: true, tab: "settle" },
  "/ops/users": { view: () => import("./views/ops.js"), fn: "renderOpsUsers", auth: "ADMIN", nav: true, tab: "users" },
  "/ops/live": { view: () => import("./views/opsLive.js"), fn: "renderOpsLiveDrivers", auth: "ADMIN", nav: true, tab: "live" },
  "/ops/cancellations": { view: () => import("./views/opsLive.js"), fn: "renderOpsCancellations", auth: "ADMIN", nav: false },
  "/ops/balances": { view: () => import("./views/opsLive.js"), fn: "renderOpsBalances", auth: "ADMIN", nav: false },
  "/ops/tickets": { view: () => import("./views/opsLive.js"), fn: "renderOpsTickets", auth: "ADMIN", nav: true, tab: "tickets" },

  // "How the money works" — the question every driver and restaurant asks
  // before signing up. Answering it in-app removes the most common call.
  "/earnings-explained": { view: () => import("./views/explainers.js"), fn: "renderDriverEarningsExplainer", auth: "none", nav: false },
  "/commission-explained": { view: () => import("./views/explainers.js"), fn: "renderRestaurantCommissionExplainer", auth: "none", nav: false },
  "/help": { view: () => import("./views/explainers.js"), fn: "renderSupportContact", auth: "none", nav: false },
  // Onboarding lives in its own module: it's the heaviest screen in the
  // merchant app and only ever runs once per restaurant, so there's no reason
  // for a kitchen checking today's orders to download the whole wizard.
  "/restaurant/onboarding": { view: () => import("./views/restaurantOnboarding.js"), fn: "renderRestaurantOnboarding", auth: "RESTAURANT", nav: false },
  "/restaurant/pending": { view: () => import("./views/restaurant.js"), fn: "renderRestaurantPending", auth: "RESTAURANT", nav: false },
  "/restaurant/orders": { view: () => import("./views/restaurant.js"), fn: "renderRestaurantOrders", auth: "RESTAURANT", nav: true, tab: "orders" },
  "/restaurant/menu": { view: () => import("./views/restaurant.js"), fn: "renderRestaurantMenuManage", auth: "RESTAURANT", nav: true, tab: "menu" },
  "/restaurant/profile": { view: () => import("./views/restaurant.js"), fn: "renderRestaurantProfile", auth: "RESTAURANT", nav: true, tab: "profile" },
  "/driver/food-offer": { view: () => import("./views/driverFoodErrand.js"), fn: "renderFoodOfferIncoming", auth: "DRIVER", nav: false },
  "/driver/food-progress": { view: () => import("./views/driverFoodErrand.js"), fn: "renderFoodOrderProgress", auth: "DRIVER", nav: false },
  "/driver/errand-offer": { view: () => import("./views/driverFoodErrand.js"), fn: "renderErrandOfferIncoming", auth: "DRIVER", nav: false },
  "/driver/errand-progress": { view: () => import("./views/driverFoodErrand.js"), fn: "renderErrandProgress", auth: "DRIVER", nav: false },
  // "none" here (not "guest") — support should be reachable by anyone
  // regardless of role, including a logged-in DRIVER/ADMIN, with no
  // role-based bounce. "guest" would incorrectly redirect them away.
  "/chat": { view: () => import("./views/support.js"), fn: "renderChat", auth: "none", nav: false },
  "/support": { view: () => import("./views/support.js"), fn: "renderSupport", auth: "none", nav: false },
  // In-app chat with the other party on an active job — separate from
  // /chat above, which is customer-support ticket messaging, not this.
  "/chat-thread": { view: () => import("./views/chatThread.js"), fn: "renderChatThread", auth: "any", nav: false },
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

/**
 * Wrong app for this account.
 *
 * A driver who opens the customer app (or vice versa) is a real, common
 * situation — same person, two apps on one phone, tapped the wrong icon.
 * Rather than dumping them somewhere broken or silently logging them out,
 * say plainly which app they need.
 */
function renderWrongApp(container, userRole) {
  const APP_FOR_ROLE = {
    RIDER: "Nova Go",
    DRIVER: "Nova Go Driver",
    RESTAURANT: "Nova Go Merchant",
    ADMIN: "Nova Go Ops",
  };
  container.innerHTML = `
    <div class="page flex-col items-center text-center" style="min-height:100dvh; justify-content:center;">
      <div style="width:72px;height:72px;border-radius:22px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;margin-bottom:20px;">
        <span style="font-size:30px;">🔑</span>
      </div>
      <h1 class="text-xl mb-2">Wrong app</h1>
      <p class="text-secondary mb-6">
        This number is registered as a <b>${(userRole || "").toLowerCase()}</b> account.<br/>
        Please use <b>${APP_FOR_ROLE[userRole] || "the correct Nova Go app"}</b> to sign in.
      </p>
      <button id="signOutBtn" class="btn btn-secondary btn-block">Sign out and use a different number</button>
    </div>
  `;
  container.querySelector("#signOutBtn").addEventListener("click", () => {
    Token.clear();
    location.hash = "/welcome";
    location.reload();
  });
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

  // ---- Guard order matters ----
  //
  // WRONG-APP FIRST. Previously scope ran first and caused an infinite loop:
  // a signed-in DRIVER opening the customer app at #/driver/home hit
  // routeAllowed() === false, got redirected to roleHome("DRIVER") — which is
  // /driver/home — and round it went forever. Checking the account before the
  // path means that user lands on a clear explanation instead of a spin.
  const signedInUser = Token.user;
  if (Token.access && signedInUser && !APP_CONFIG.allowedRoles.includes(signedInUser.role)) {
    if (currentCleanup) { try { currentCleanup(); } catch { /* noop */ } currentCleanup = null; }
    nav.classList.add("hidden");
    renderWrongApp(container, signedInUser.role);
    return;
  }

  // App-scope guard. Each build only exposes its own routes (js/appMode.js).
  // Redirect target is ALWAYS this build's own home — never roleHome(), which
  // can point outside this app and re-trigger this very guard.
  if (route && !routeAllowed(path)) {
    navigate(APP_CONFIG.home);
    return;
  }

  if (!route) { navigate(APP_CONFIG.home); return; }

  // PARKED-SERVICE GUARD. Food, parcels and errands are built and tested but
  // switched off for the bike pilot (see js/launch.config.js). Their routes
  // stay registered so an old bookmark or a shared link still resolves — but
  // anyone reaching one lands on the coming-soon screen rather than a
  // checkout that can't be fulfilled. Flip the service to live in
  // launch.config.js and the real screens come back with no code change.
  if (isParkedRoute(path)) {
    state.comingSoonService = serviceForRoute(path);
    if (path !== "/coming-soon") { navigate("/coming-soon"); return; }
  }

  // Auth guard
  if (route.auth === "guest") {
    // Public browsing route. A logged-out visitor (or a logged-in RIDER)
    // sees it as-is; a logged-in DRIVER/ADMIN gets bounced to their own
    // home instead of the rider guest view.
    const user = Token.user;
    if (Token.access && user && user.role !== "RIDER") { navigate(roleHome(user.role)); return; }
  } else if (route.auth !== "none") {
    const user = Token.user;
    if (!Token.access || !user) { state.postAuthRedirect = path; navigate("/signin"); return; }
    if (route.auth !== "any" && route.auth !== user.role) { navigate(roleHome(user.role)); return; }
  }

  if (currentCleanup) { try { currentCleanup(); } catch (e) { console.error("[NovaGo] cleanup error:", e); } currentCleanup = null; }

  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "view-enter";
  container.appendChild(wrap);

  nav.classList.toggle("hidden", !route.nav);
  if (route.nav) renderNavActive(route.tab);

  try {
    // Fetch the view module on demand. The browser caches it after the first
    // visit, so this costs one small network request per screen at most —
    // and never a byte for screens this app doesn't have.
    const mod = await route.view();
    const exported = mod[route.fn];
    const render = route.wrap ? exported(APP_CONFIG.signupRole || "RIDER") : exported;
    currentCleanup = (await render(wrap)) || null;
  } catch (e) {
    console.error("[NovaGo] render error on", path, e);
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
