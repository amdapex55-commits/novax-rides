// Nova Go — the live ride, on every screen.
//
// WHY THIS EXISTS
//
// A customer with a rider on the way could leave the tracking screen and the
// app forgot the ride was happening. Home looked like Home. The only trace was
// a row in History, styled as a receipt, that had to be hunted for. So the
// single most important fact in the product — someone is coming to you right
// now — was the one thing the interface never mentioned.
//
// This is that fact, pinned above everything, on whatever screen you are on.
// Collapsed it is a glance: who, how far, and a line that keeps moving so the
// ride reads as alive rather than as a stale banner. Tapped it opens into the
// whole card, and from there into the map.
//
// Modelled on a Live Activity rather than a notification: it is not telling
// you something happened, it is showing you something that is still happening.
import { api } from "./api.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { navigate } from "./router.js";
import { esc } from "./ui.js";
import { haptic } from "./haptics.js";

const ACTIVE = ["REQUESTED", "MATCHING", "MATCHED", "ARRIVED", "IN_PROGRESS"];

/* What the customer is actually waiting for, in their words. "MATCHED" is a
   database state; "Your Nova is on the way" is the thing they want to know. */
const HEADLINE = {
  REQUESTED: "Finding your Nova",
  MATCHING: "Finding your Nova",
  MATCHED: "Your Nova is on the way",
  ARRIVED: "Your Nova is here",
  IN_PROGRESS: "On the way to your destination",
};

/* How far through the ride we are, for the progress line. Deliberately coarse
   — a precise percentage would be a lie, since the only honest inputs are the
   trip's state and its ETA. */
const PROGRESS = { REQUESTED: 0.08, MATCHING: 0.15, MATCHED: 0.45, ARRIVED: 0.7, IN_PROGRESS: 0.85 };

let el = null;
let timer = 0;
let trip = null;
let expanded = false;

/** Screens where the widget would be redundant or in the way. */
function suppressed() {
  const path = location.hash.slice(1) || "/";
  return (
    path.startsWith("/tracking") ||
    path.startsWith("/rate") ||
    path.startsWith("/signin") ||
    path.startsWith("/signup") ||
    path.startsWith("/welcome") ||
    path.startsWith("/splash")
  );
}

function host() {
  let h = document.getElementById("nxLive");
  if (!h) {
    h = document.createElement("div");
    h.id = "nxLive";
    document.body.appendChild(h);
  }
  return h;
}

function etaText(t) {
  const mins = t?.etaMinutes ?? t?.pickupEtaMinutes ?? null;
  if (mins != null) return `${Math.max(1, Math.round(mins))} min away`;
  /* Without a number, say something that agrees with the headline. It read
     "Your Nova is on the way" above "Finding a rider" — two different
     answers to the same question, stacked. */
  switch (t?.status) {
    case "ARRIVED": return "Waiting for you outside";
    case "IN_PROGRESS": return "On the move";
    case "MATCHED": return "Heading to your pickup";
    default: return "Contacting riders nearby";
  }
}

function render() {
  const h = host();
  if (!trip || suppressed()) { h.innerHTML = ""; h.classList.remove("is-open"); return; }

  const d = trip.driver || {};
  const pct = Math.round((PROGRESS[trip.status] ?? 0.3) * 100);

  h.className = expanded ? "is-open" : "";
  h.innerHTML = `
    ${expanded ? '<div class="nx-live-scrim" id="nxLiveScrim"></div>' : ""}
    <div class="nx-live ${expanded ? "expanded" : ""}" role="status">
      <button class="nx-live-tap" id="nxLiveTap" aria-label="${expanded ? "Collapse" : "Expand"} your live ride">
        <span class="nx-live-top">
          <span class="nx-live-badge"><span class="nx-live-dot"></span>LIVE</span>
          ${expanded ? `<span class="nx-live-ref">#${esc(String(trip.id || "").slice(0, 8).toUpperCase())}</span>` : ""}
        </span>

        <span class="nx-live-headline">${esc(HEADLINE[trip.status] || "Ride in progress")}</span>
        <span class="nx-live-eta">${esc(etaText(trip))}</span>

        <span class="nx-live-track" aria-hidden="true">
          <span class="nx-live-fill" style="width:${pct}%;"></span>
        </span>

        ${expanded ? `
          <span class="nx-live-route">
            ${esc(trip.pickupLabel || "Pickup")}
            <span class="nx-live-arrow">${icon("arrow-forward", 12)}</span>
            ${esc(trip.dropoffLabel || "Destination")}
          </span>

          ${d.name ? `
            <span class="nx-live-driver">
              <span class="nx-live-avatar">${esc(String(d.name).charAt(0).toUpperCase())}</span>
              <span class="nx-live-driver-text">
                <b>${esc(d.name)}</b>
                <em>★ ${esc(String(d.rating ?? "5.0"))}${d.vehiclePlate ? ` · ${esc(d.vehiclePlate)}` : ""}</em>
              </span>
            </span>` : ""}

          ${trip.fare != null ? `<span class="nx-live-fare">PKR ${esc(String(Math.round(Number(trip.fare))))}</span>` : ""}
        ` : ""}
      </button>

      ${expanded ? `<button class="btn btn-primary btn-block nx-live-cta" id="nxLiveOpen">View trip</button>` : ""}
    </div>
  `;

  h.querySelector("#nxLiveTap")?.addEventListener("click", () => {
    haptic.light();
    expanded = !expanded;
    render();
  });
  h.querySelector("#nxLiveScrim")?.addEventListener("click", () => { expanded = false; render(); });
  h.querySelector("#nxLiveOpen")?.addEventListener("click", () => {
    state.activeTripId = trip.id;
    expanded = false;
    navigate("/tracking");
  });
}

async function refresh() {
  try {
    const mine = await api.listMyTrips();
    const live = (Array.isArray(mine) ? mine : []).find((t) => ACTIVE.includes(t.status));
    const changed = (live?.id !== trip?.id) || (live?.status !== trip?.status);
    trip = live || null;
    if (!trip) expanded = false;
    if (changed || !el) render();
  } catch {
    /* Offline: keep whatever is on screen rather than blanking a live ride. */
  }
}

/**
 * Start watching. Safe to call repeatedly — the timer is singular.
 *
 * Polls rather than relying on the socket, for the same reason the tracking
 * screen now does: a missed event must not leave the customer believing
 * nothing is happening.
 */
export function initLiveActivity() {
  if (timer) return;
  el = host();
  refresh();
  timer = setInterval(refresh, 10000);
  // Re-evaluate on navigation so the widget hides itself on the tracking
  // screen and reappears when the customer wanders off it.
  window.addEventListener("hashchange", render);
}
