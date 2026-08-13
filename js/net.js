// Nova Go — connection state, and what the app says about it.
//
// WHY THIS IS NOT JUST navigator.onLine
//
// navigator.onLine answers "is there a network interface" and nothing more.
// On a Karachi 2G/3G connection the phone is emphatically "online" while
// nothing at all is getting through, which is the state this app actually
// has to survive. So the banner reacts to real request failures too, and
// clears on a real success — the browser's own signal is only one input.
//
// WHAT THE USER SEES
//
// One line at the top of the screen, three states:
//   offline  "No connection" (grey)
//   queued   "Saved — will send when you're back" (amber)
//   back     "Back online" (green, then it leaves)
//
// It is deliberately not a modal, not a toast, and not dismissible. An
// offline banner that has to be dismissed is one the user dismisses and then
// forgets, and the whole point is that the state persists until it doesn't.

let bannerEl = null;
let hideTimer = null;

function ensureBanner() {
  if (bannerEl && document.body.contains(bannerEl)) return bannerEl;
  bannerEl = document.createElement("div");
  bannerEl.className = "nx-net-banner";
  bannerEl.setAttribute("role", "status");
  // aria-live polite rather than assertive: this should be announced, but it
  // must never interrupt a screen reader mid-sentence to say the wifi blipped.
  bannerEl.setAttribute("aria-live", "polite");
  document.body.appendChild(bannerEl);
  return bannerEl;
}

export function showNetBanner(kind, message, { autoHideMs = 0 } = {}) {
  const el = ensureBanner();
  clearTimeout(hideTimer);
  el.className = `nx-net-banner show ${kind}`;
  el.textContent = message;
  if (autoHideMs > 0) {
    hideTimer = setTimeout(() => el.classList.remove("show"), autoHideMs);
  }
}

export function hideNetBanner() {
  clearTimeout(hideTimer);
  if (bannerEl) bannerEl.classList.remove("show");
}

export function isOnline() {
  return navigator.onLine !== false;
}

/** True for the failures that mean "the request never arrived", as opposed to
 *  the server having considered it and said no. Only the former is worth
 *  queueing — a 400 will still be a 400 in ten minutes. */
export function isConnectivityError(err) {
  if (!err) return false;
  if (err.name === "TypeError") return true;          // fetch's own network failure
  if (err.name === "AbortError") return true;         // timed out
  if (err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504) return true;
  return /network|failed to fetch|offline|timeout/i.test(String(err.message || ""));
}

export function initNet() {
  window.addEventListener("offline", () => {
    showNetBanner("", "No connection — you can still browse");
  });
  window.addEventListener("online", () => {
    showNetBanner("back", "Back online", { autoHideMs: 2200 });
    window.dispatchEvent(new CustomEvent("novago:online"));
  });
  if (!isOnline()) showNetBanner("", "No connection — you can still browse");
}
