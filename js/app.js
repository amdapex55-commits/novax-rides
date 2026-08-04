// Nova X Rides — app bootstrap. Renders the persistent shell (bottom nav +
// view container) once, then hands off to the router for everything else.
import { icon } from "./icons.js";
import { Token } from "./api.js";
import { initRouter, navigate } from "./router.js";
import { APP_CONFIG } from "./appMode.js";

// The nav comes from the BUILD, not the logged-in role. Each app ships with
// exactly one nav bar — the customer app has no concept of an "Earnings" tab
// existing anywhere, which is the whole point of the split.
export function renderBottomNav() {
  const items = APP_CONFIG.nav;
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
