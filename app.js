// Nova X Rides — app bootstrap. Renders the persistent shell (bottom nav +
// view container) once, then hands off to the router for everything else.
import { icon } from "./icons.js";
import { Token } from "./api.js";
import { initRouter, navigate } from "./router.js";

const NAV_SETS = {
  RIDER: [
    { tab: "home", icon: "home", label: "Home", path: "/home" },
    { tab: "history", icon: "history", label: "Activity", path: "/history" },
    { tab: "wallet", icon: "wallet", label: "Wallet", path: "/wallet" },
    { tab: "profile", icon: "person", label: "Profile", path: "/profile" },
  ],
  DRIVER: [
    { tab: "home", icon: "home", label: "Home", path: "/driver/home" },
    { tab: "earnings", icon: "wallet", label: "Earnings", path: "/driver/earnings" },
    { tab: "alerts", icon: "bell", label: "Alerts", path: "/driver/notifications" },
    { tab: "profile", icon: "person", label: "Profile", path: "/driver/profile" },
  ],
  ADMIN: [
    { tab: "dashboard", icon: "dashboard", label: "Live", path: "/ops/dashboard" },
    { tab: "approvals", icon: "check-circle", label: "Approvals", path: "/ops/approvals" },
    { tab: "users", icon: "users", label: "Users", path: "/ops/users" },
  ],
  RESTAURANT: [
    { tab: "orders", icon: "package", label: "Orders", path: "/restaurant/orders" },
    { tab: "menu", icon: "utensils", label: "Menu", path: "/restaurant/menu" },
    { tab: "profile", icon: "store", label: "Store", path: "/restaurant/profile" },
  ],
};

export function renderBottomNav() {
  const role = Token.user?.role || "RIDER";
  const items = NAV_SETS[role] || NAV_SETS.RIDER;
  const nav = document.getElementById("bottom-nav");
  nav.innerHTML = items
    .map(
      (i) => `<a href="#${i.path}" class="nav-item" data-tab="${i.tab}">${icon(i.icon, 22)}<span>${i.label}</span></a>`
    )
    .join("");
}

function renderShell() {
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div id="view-container"></div>
    <nav id="bottom-nav" class="bottom-nav hidden"></nav>
  `;
}

function boot() {
  renderShell();
  renderBottomNav();
  initRouter();
}

document.addEventListener("DOMContentLoaded", boot);

// Exposed for views that need to trigger a nav refresh after login/role change.
window.__novaxRefreshNav = renderBottomNav;
