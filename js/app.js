// Nova Go Rides — app bootstrap. Renders the persistent shell (bottom nav +
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

/**
 * Dismiss the boot splash (see the inline block in customer.html et al).
 *
 * It holds for a minimum of ~1.2s so the mark finishes drawing — a splash cut
 * off mid-animation reads as a glitch, not as speed. But it is never allowed
 * to hold longer than that just because something downstream is slow: the
 * floor is a floor, not a delay added to boot time.
 */
const SPLASH_MIN_MS = 1750;
const bootStartedAt = Date.now();

function dismissSplash() {
  const splash = document.getElementById("nxSplash");
  if (!splash) return;
  const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - bootStartedAt));
  setTimeout(() => {
    splash.classList.add("is-done");
    // Remove from the DOM after the fade so it can't trap focus or eat taps
    // on a device where transitionend never fires.
    setTimeout(() => splash.remove(), 500);
  }, wait);
}

function boot() {
  renderShell();
  renderBottomNav();
  initRouter();
  // After initRouter(), so the first view is already painted underneath and
  // the splash fades to real content rather than to an empty container.
  dismissSplash();
}

document.addEventListener("DOMContentLoaded", boot);

// Service worker. Registered AFTER load so it never competes with the first
// paint, and wrapped in a guard because it needs a secure context — it's
// simply absent on http://localhost:5500-style dev servers and inside some
// Capacitor shells, which is fine.
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      // Non-fatal: the app works without it, just without offline support.
      console.warn("[NovaGo] service worker not registered:", err.message);
    });
  });
}

// Exposed for views that need to trigger a nav refresh after login/role change.
window.__novagoRefreshNav = renderBottomNav;
