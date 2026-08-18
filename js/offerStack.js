// Nova Go — the offer stack.
//
// WHY THIS REPLACED A FULL-SCREEN TAKEOVER
//
// One offer used to seize the whole screen: `position: fixed; inset: 0`, map
// gone, everything else gone, fifteen seconds to decide. A rider stopped at a
// junction had their phone commandeered by a job they had not asked for, and
// with only one job on screen there was nothing to compare it against —
// accept this, or wait and find out what the next one might have been.
//
// The stack is what the rider actually wants: jobs arrive as cards over their
// own home screen, several at once, each with its own countdown. They pick.
// The map stays visible behind, so a pickup can be judged against where they
// already are.
//
// Two riders taking the same job is prevented at the database, not here —
// acceptTrip claims an unclaimed row and the loser is told plainly. This side
// just has to remove a card the moment somebody else wins it, which is what
// `trip:offerTaken` is for.
import { api } from "./api.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { navigate } from "./router.js";
import { esc, fmtMoney, toast } from "./ui.js";
import { haptic } from "./haptics.js";
import { track } from "./analytics.js";

const WINDOW_MS = 15000;

/** tripId -> { payload, expiresAt, el } */
const offers = new Map();
let host = null;

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement("div");
  host.id = "nxOffers";
  document.body.appendChild(host);
  return host;
}

function cardMarkup(o) {
  const earn = (Number(o.fare) || 0) + (Number(o.tipAmount) || 0);
  const km = o.distanceKm != null ? `${Number(o.distanceKm).toFixed(1)} km` : "—";
  const pickup = String(o.pickupLabel || "Nearby").split(",")[0].trim();
  const drop = String(o.dropoffLabel || "").split(",")[0].trim();
  return `
    <div class="nx-offer-card" data-trip="${esc(o.tripId)}">
      <span class="nx-offer-card-ring" aria-hidden="true"></span>
      <div class="nx-offer-card-top">
        <span class="nx-offer-card-kind">${icon("bike", 13)} Ride</span>
        <span class="nx-offer-card-earn">${esc(fmtMoney(earn))}</span>
      </div>
      <p class="nx-offer-card-route">
        <span>${esc(pickup)}</span>
        ${drop ? `<span class="nx-offer-card-arrow">${icon("arrow-forward", 11)}</span><span>${esc(drop)}</span>` : ""}
      </p>
      <p class="nx-offer-card-meta">${esc(km)} trip<span class="nx-offer-card-dot">·</span><em data-left>15s</em> to decide</p>
      <div class="nx-offer-card-actions">
        <button class="nx-offer-card-decline" data-act="decline">Decline</button>
        <button class="nx-offer-card-accept" data-act="accept">Accept</button>
      </div>
    </div>`;
}

function render() {
  const h = ensureHost();
  if (offers.size === 0) { h.innerHTML = ""; h.classList.remove("has-offers"); return; }
  h.classList.add("has-offers");
  // Newest on top: the freshest job has the most time left on it.
  const list = [...offers.values()].sort((a, b) => b.expiresAt - a.expiresAt);
  h.innerHTML = list.map((o) => cardMarkup(o.payload)).join("");

  h.querySelectorAll("[data-trip]").forEach((el) => {
    const tripId = el.dataset.trip;
    el.querySelector('[data-act="accept"]').addEventListener("click", () => accept(tripId, el));
    el.querySelector('[data-act="decline"]').addEventListener("click", () => decline(tripId));
  });
}

/** One timer for the whole stack rather than one per card. */
let tick = 0;
function startTicking() {
  if (tick) return;
  tick = setInterval(() => {
    const now = Date.now();
    let expired = false;
    for (const [tripId, o] of offers) {
      const left = Math.max(0, Math.ceil((o.expiresAt - now) / 1000));
      const el = host?.querySelector(`[data-trip="${tripId}"] [data-left]`);
      if (el) el.textContent = `${left}s`;
      if (left <= 0) { offers.delete(tripId); expired = true; }
    }
    if (expired) render();
    if (offers.size === 0) { clearInterval(tick); tick = 0; }
  }, 250);
}

async function accept(tripId, el) {
  const btn = el.querySelector('[data-act="accept"]');
  btn.disabled = true;
  btn.textContent = "…";
  haptic.medium();
  try {
    await api.acceptTrip(tripId);
    track("driver_accepted_offer", { tripId });
    offers.clear();
    render();
    state.activeTripId = tripId;
    navigate("/driver/progress");
  } catch (err) {
    /* 409 means another rider claimed it first — which is a normal outcome
       of a broadcast, not a fault. Say so without alarming anyone, drop the
       card, and leave the rest of the stack alone. */
    offers.delete(tripId);
    render();
    toast(err?.status === 409 ? "Another rider took that one." : (err?.message || "Couldn't accept that job"), true);
  }
}

async function decline(tripId) {
  offers.delete(tripId);
  render();
  haptic.light();
  try { await api.declineTrip(tripId); } catch { /* excluded server-side anyway */ }
}

/** A job arrived. */
export function pushOffer(payload) {
  if (!payload?.tripId || offers.has(payload.tripId)) return;
  offers.set(payload.tripId, {
    payload,
    expiresAt: Date.now() + (Number(payload.expiresInMs) || WINDOW_MS),
  });
  haptic.medium();
  render();
  startTicking();
}

/** Somebody else won it. */
export function removeOffer(tripId) {
  if (!offers.delete(tripId)) return;
  render();
}

/** Going offline, or leaving the home screen. */
export function clearOffers() {
  offers.clear();
  if (tick) { clearInterval(tick); tick = 0; }
  render();
}
