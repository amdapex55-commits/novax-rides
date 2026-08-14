// Nova Go Rides — app bootstrap. Renders the persistent shell (bottom nav +
// view container) once, then hands off to the router for everything else.
import { icon } from "./icons.js";
import { Token } from "./api.js";
import { initRouter, navigate } from "./router.js";
import { APP_CONFIG } from "./appMode.js";
import { initTheme } from "./theme.js";
import { initI18n, t } from "./i18n.js";
import { initNet, isConnectivityError, showNetBanner } from "./net.js";
import { initPush } from "./push.js";
import { flush, queueSize } from "./offlineQueue.js";
import { api } from "./api.js";

// The nav comes from the BUILD, not the logged-in role. Each app ships with
// exactly one nav bar — the customer app has no concept of an "Earnings" tab
// existing anywhere, which is the whole point of the split.
export function renderBottomNav() {
  const items = APP_CONFIG.nav;
  const nav = document.getElementById("bottom-nav");
  nav.innerHTML = items
    .map(
      (i) => `<a href="#${i.path}" class="nav-item" data-tab="${i.tab}">${icon(i.icon, 22)}<span>${t(i.label)}</span></a>`
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
 * WHY THIS NUMBER CAME DOWN
 *
 * The shell is interactive in about 100ms. Holding the splash for 1750ms so
 * the tagline could finish animating meant ~94% of every app open was a delay
 * we were adding on purpose. That is the single biggest reason the app felt
 * slow: not the code, the wait we chose.
 *
 * 600ms is enough for the mark to read as intentional rather than a flash,
 * and short enough that opening the app feels instant. The tagline animation
 * is retimed to finish inside it.
 *
 * A returning user (service worker warm) now sees roughly half a second
 * instead of nearly two.
 */
const SPLASH_MIN_MS = 600;
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
  // Both are already applied by the inline block in the HTML head — this is
  // what hands ownership to the modules (OS-change listener, language state)
  // now that they have loaded. Re-applying the same value is a no-op.
  initTheme();
  initI18n();
  initNet();
  // Listeners only — this does NOT prompt. The permission ask happens after
  // the first booking (see enablePush), because iOS allows exactly one
  // prompt and a customer who has not booked yet has no reason to accept.
  initPush();
  renderShell();
  renderBottomNav();
  initRouter();
  // After initRouter(), so the first view is already painted underneath and
  // the splash fades to real content rather than to an empty container.
  dismissSplash();
}

document.addEventListener("DOMContentLoaded", boot);

/* Send anything parked while the connection was down. Fires on the way back
   up and once at startup, because the app is frequently closed offline and
   reopened somewhere with signal — which never produces an "online" event. */
async function drainOutbox() {
  if (queueSize() === 0) return;
  const { sent, left } = await flush(api, isConnectivityError);
  if (sent > 0) {
    showNetBanner("back", `Sent ${sent} saved ${sent === 1 ? "change" : "changes"}`, { autoHideMs: 2600 });
  }
  if (left > 0) showNetBanner("queued", `${left} still waiting to send`, { autoHideMs: 3000 });
}
window.addEventListener("novago:online", drainOutbox);
window.addEventListener("load", () => { setTimeout(drainOutbox, 1500); });

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
