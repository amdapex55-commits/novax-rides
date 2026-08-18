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
import { initInstall } from "./install.js";
import { flush, queueSize } from "./offlineQueue.js";
import { api } from "./api.js";
import { alertUser } from "./ui.js";

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
 * WHY THIS NUMBER IS 2000 AND NOT 600
 *
 * It was cut to 600ms on the argument that the shell is interactive in about
 * 100ms, so anything longer is a delay we add on purpose. That argument is
 * still true and worth re-reading before anyone changes this again: at 2000ms
 * roughly 95% of every app open is a wait we chose.
 *
 * It is set back to 2000 deliberately. At 600 the animation was being cut off
 * mid-sequence — the mark had barely been struck and the tagline never landed
 * at all, so the thing people were meant to remember was the thing that got
 * clipped. A splash that is interrupted every single time reads as a glitch,
 * which is worse than either a short one or a long one.
 *
 * The animation is timed to finish at ~1.8s, leaving a beat on the completed
 * lockup before the fade starts. If this number changes again, retime the
 * keyframes in the inline <style> to match — a splash and its animation have
 * to agree about how long they last.
 */
const SPLASH_MIN_MS = 2000;
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
  // Captures beforeinstallprompt only — it does not ask anyone anything
  // yet. The ask happens after the app has been used; see offerInstall.
  initInstall();
  renderShell();
  renderBottomNav();
  watchForSuspension();
  initRouter();
  // After initRouter(), so the first view is already painted underneath and
  // the splash fades to real content rather than to an empty container.
  dismissSplash();
}

/* OPS SUSPENDS AN ACCOUNT AND THE APP NEVER FINDS OUT.

   admin.service.ts emits "account:suspended" to the user the moment ops
   suspends them, and nothing anywhere listened for it. The suspension does
   take effect — the token is revoked and their driver profile is flipped
   offline — but the app kept behaving as though nothing had happened until
   the next API call failed with a generic error. A driver mid-shift saw
   "something went wrong" and reasonably concluded the app was broken, not
   that ops had stopped them.

   Handled here rather than on any one screen, because a suspension applies to
   whoever is signed in, wherever they are: driver, customer or restaurant.

   The session is cleared before showing the message. Ops has already revoked
   the token, so leaving a signed-in shell on screen only invites a series of
   failing requests. */
async function watchForSuspension() {
  if (!Token.access) return;
  try {
    const { socketManager } = await import("./socket.js");
    socketManager.on("account:suspended", (payload) => {
      Token.clear();
      window.__novagoRefreshNav?.();
      alertUser("Your account has been suspended.", {
        suggestion: payload?.message || "Contact support if you think this is a mistake.",
        tone: "warn",
      });
      navigate("/signin");
    });
  } catch {
    /* No socket (offline, or the CDN is blocked). The token is revoked
       server-side regardless, so the next request still fails closed. */
  }
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
