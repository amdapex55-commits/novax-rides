// "Add to home screen" — the prompt, and the two platforms that need
// completely different handling.
//
// ANDROID fires beforeinstallprompt and lets us show the real OS install
// dialog whenever we choose. Chrome's own mini-infobar is easy to miss and
// easy to dismiss forever, so we capture the event and ask at a better
// moment with our own button.
//
// iOS fires nothing and has no API at all. The only route is Share →
// Add to Home Screen, performed by hand, so the best available thing is to
// SHOW someone where that is — once, and never again if they say no.
//
// Neither prompt appears if the app is already installed, and neither
// appears on the first screen a person ever sees. Being asked to install
// something you have not yet used is how you teach people to dismiss
// prompts without reading them.

import { icon } from "./icons.js";
import { track } from "./analytics.js";

const DISMISSED_KEY = "novago.install.dismissed";
const SEEN_KEY = "novago.install.seen";

let deferredPrompt = null;

/** Already running as an installed app — nothing to offer. */
export function isInstalled() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac; the touch points give it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function dismissed() {
  try { return localStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; }
}
function remember(key) {
  try { localStorage.setItem(key, "1"); } catch { /* private mode */ }
}

export function initInstall() {
  if (isInstalled()) return;

  window.addEventListener("beforeinstallprompt", (e) => {
    // Stop Chrome's mini-infobar so ours is the only ask.
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    remember(DISMISSED_KEY);
    track("pwa_installed");
  });
}

/**
 * Offer installation. Safe to call whenever — it declines quietly if the app
 * is installed, already refused, or the platform has nothing to offer yet.
 * @returns {boolean} whether anything was shown
 */
export function offerInstall({ force = false } = {}) {
  if (isInstalled()) return false;
  if (!force && dismissed()) return false;

  if (deferredPrompt) {
    track("pwa_prompt_shown", { platform: "android" });
    deferredPrompt.prompt();
    deferredPrompt.userChoice
      .then((choice) => {
        track("pwa_prompt_answered", { outcome: choice?.outcome });
        if (choice?.outcome === "dismissed") remember(DISMISSED_KEY);
      })
      .catch(() => {})
      .finally(() => { deferredPrompt = null; });
    return true;
  }

  if (isIOS()) {
    showIosSheet();
    return true;
  }
  return false;
}

/* iOS: no API, so this shows the actual gesture rather than describing it. */
function showIosSheet() {
  if (document.getElementById("nxInstallSheet")) return;
  track("pwa_prompt_shown", { platform: "ios" });

  const el = document.createElement("div");
  el.id = "nxInstallSheet";
  el.className = "nx-install-scrim";
  el.innerHTML = `
    <div class="nx-install-card" role="dialog" aria-modal="true" aria-labelledby="nxInstallTitle">
      <div class="nx-install-mark">${icon("bolt", 24, 2)}</div>
      <h2 id="nxInstallTitle" class="nx-install-title">Put Nova Go on your home screen</h2>
      <p class="nx-install-body">
        It opens full screen, loads faster, and works on a bad signal.
      </p>
      <ol class="nx-install-steps">
        <li><span class="nx-install-step-n">1</span> Tap the <strong>Share</strong> button in Safari's toolbar</li>
        <li><span class="nx-install-step-n">2</span> Scroll and choose <strong>Add to Home Screen</strong></li>
        <li><span class="nx-install-step-n">3</span> Tap <strong>Add</strong></li>
      </ol>
      <button class="btn btn-ghost btn-block" id="nxInstallClose">Not now</button>
    </div>`;
  document.body.appendChild(el);

  const close = () => {
    remember(DISMISSED_KEY);
    el.classList.remove("show");
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector("#nxInstallClose").addEventListener("click", close);
  // Tapping the backdrop is the gesture people already expect from a sheet.
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  requestAnimationFrame(() => el.classList.add("show"));
}

/**
 * Ask at a moment that has earned it — after someone has actually used the
 * app, not on the screen they land on. Called once per session at most.
 */
export function maybeOfferInstallAfterUse() {
  if (isInstalled() || dismissed()) return;
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* ignore */ }
  if (!seen) { remember(SEEN_KEY); return; } // first visit: just remember it
  offerInstall();
}
