// Nova Go — the pilot customer home. Bike hailing, and nothing else.
//
// The previous home was a three-tab shell (Food / Bike / Taxi) with quick
// links to loyalty, referrals and Nova Go for Business. That's the right home
// for a super-app with all four services running. It is the wrong home for a
// bike pilot: a customer opening it has to work out what this app is before
// they can use it, and two of the three tabs lead somewhere that can't serve
// them yet.
//
// So this screen does one thing. Map, "Where to?", book. Everything else —
// the other services, the account extras — is reachable but subordinate.
//
// The coming-soon tiles are deliberate rather than hidden: they tell the
// customer this is going somewhere, and the "notify me" taps give you a
// demand signal for which service to switch on next. Hiding them entirely
// would throw that away.

import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, esc } from "../ui.js";
import { navigate } from "../router.js";
import { track } from "../analytics.js";
import { createMap } from "../map.js";
import { getPickupFix, reverseGeocode } from "../geocode.js";
import { SERVICES, GPS, HOURS, isOpenNow, ZONE, inZone, PRICING } from "../launch.config.js";

const SOON = [
  { key: "food",   icon: "utensils", label: "Food",    sub: "Restaurants near you" },
  { key: "parcel", icon: "package",  label: "Parcel",  sub: "Send across the city" },
  { key: "errand", icon: "basket",   label: "Errands", sub: "We'll shop for you" },
];

export function renderBikeHome(root) {
  const user = Token.user;
  const isGuest = !user;
  const open = isOpenNow();

  root.innerHTML = `
    <div class="nx-bike-home">
      <!-- Map as the hero. A ride-hailing app that opens on a list looks
           like a directory; one that opens on a map looks like it already
           knows where you are. -->
      <div class="nx-bike-map" id="homeMap"></div>

      <div class="nx-bike-topbar">
        <div class="nx-bike-brand">
          <span class="nx-bike-logo">${icon("bolt", 15)}</span>
          <span>Nova Go <b>Bike</b></span>
        </div>
        <button class="nx-bike-avatar" id="profileBtn" aria-label="Profile">
          ${icon("person", 19)}
        </button>
      </div>

      ${!open ? `
        <div class="nx-bike-closed">
          ${icon("clock", 15)}
          <span>${esc(HOURS.closedMessage)}</span>
        </div>` : ""}

      <!-- The booking sheet. Docked over the map, never more than one tap
           from a ride. -->
      <div class="nx-bike-sheet">
        <div class="nx-sheet-grab"></div>

        <p class="nx-bike-greet">
          ${isGuest ? "Where are you going?" : `Hi ${esc((user.name || "there").split(" ")[0])} — where to?`}
        </p>

        <button class="nx-whereto" id="wheretoBtn" ${!open ? "disabled" : ""}>
          <span class="nx-whereto-icon">${icon("search", 18)}</span>
          <span class="nx-whereto-text">Enter your destination</span>
          <span class="nx-whereto-go">${icon("arrow-forward", 17)}</span>
        </button>

        <!-- Pickup status. This line is the GPS accuracy gate made visible:
             the customer always knows whether we actually know where they
             are, instead of finding out when nobody arrives. -->
        <div class="nx-bike-supply hidden" id="supplyLine"></div>

        <div class="nx-pickup-row" id="pickupRow">
          <span class="nx-pickup-dot"></span>
          <span class="nx-pickup-label" id="pickupLabel">Finding your location…</span>
          <button class="nx-pickup-fix" id="pickupFix" hidden>Set manually</button>
        </div>

        <div class="nx-bike-fare">
          ${icon("info", 13)}
          <span>Rs. ${PRICING.BIKE.base} base + Rs. ${PRICING.BIKE.perKm}/km · minimum Rs. ${PRICING.BIKE.minimum} · cash only</span>
        </div>

        <div class="nx-soon-row">
          ${SOON.map((s) => `
            <button class="nx-soon-tile" data-soon="${s.key}">
              <span class="nx-soon-icon">${icon(s.icon, 18)}</span>
              <span class="nx-soon-label">${s.label}</span>
              <span class="nx-soon-badge">${esc(SERVICES[s.key]?.eta || "Soon")}</span>
            </button>`).join("")}
        </div>

        <div class="nx-bike-trust">
          <span>${icon("shield", 13)} Verified riders</span>
          <span>${icon("locate", 13)} Live tracking</span>
          <span>${icon("phone", 13)} Real support</span>
        </div>
      </div>
    </div>
  `;

  const $ = (s) => root.querySelector(s);
  let mapHandle = null;
  let pickup = null;   // { lat, lng, label } — only set when TRUSTWORTHY

  $("#profileBtn").addEventListener("click", () => navigate("/profile"));

  // Coming-soon tiles: a real screen, not a dead tap.
  root.querySelectorAll("[data-soon]").forEach((b) =>
    b.addEventListener("click", () => {
      state.comingSoonService = b.dataset.soon;
      navigate("/coming-soon");
    }));

  /* ---------------------------------------------------------------- GPS --- */

  async function locate() {
    const label = $("#pickupLabel");
    const fixBtn = $("#pickupFix");
    const row = $("#pickupRow");

    const fix = await getPickupFix({
      maxAccuracyMeters: GPS.maxAccuracyMeters,
      maxAgeMs: GPS.maxAgeMs,
      timeoutMs: GPS.timeoutMs,
    });

    if (fix.ok) {
      // Outside the launch zone is a "not yet", not an error — and it must
      // be said before they type a destination, not after.
      if (!inZone(fix)) {
        row.classList.add("warn");
        label.textContent = ZONE.outsideMessage;
        fixBtn.hidden = false;
        // NOT "Book anyway" — that promised something the geofence then
        // refuses, which is worse than saying no. This offers the only
        // thing that actually helps: pick a different pickup point, one
        // that might be inside the zone.
        fixBtn.textContent = "Use another pickup";
        pickup = null;
        mapHandle?.center(fix, 13);
        mapHandle?.setPickup(fix);
        track("pickup_outside_zone", { zone: ZONE.name });
        return;
      }

      pickup = { lat: fix.lat, lng: fix.lng, label: "Current location" };
      state.pickup = { ...pickup, accuracy: fix.accuracy, verified: true };
      row.classList.remove("warn");
      label.textContent = `Picking you up here · ±${fix.accuracy}m`;
      fixBtn.hidden = false;
      fixBtn.textContent = "Change";

      mapHandle?.setPickup(pickup);
      // NOVA PULSE: draw how confident we are, to scale, in metres. The
      // customer can see the difference between "they've got me" and "they're
      // guessing" without reading a word.
      mapHandle?.setAccuracy(pickup, fix.accuracy);
      mapHandle?.center(pickup, 16);
      loadNearbyRiders(pickup);

      // Turn the pin into a street name in the background — nice to have,
      // never blocking.
      reverseGeocode(pickup).then((name) => {
        if (name && pickup) {
          pickup.label = name;
          state.pickup = { ...state.pickup, label: name };
          label.textContent = name;
        }
      });
      return;
    }

    // Every failure path ends the same way: we do NOT have a pickup, we say
    // so plainly, and we give them the manual route. What we never do is
    // quietly substitute a guess and dispatch a rider to it.
    pickup = null;
    state.pickup = null;
    row.classList.add("warn");
    fixBtn.hidden = false;
    fixBtn.textContent = "Set pickup manually";

    label.textContent = {
      denied: "Location is off — set your pickup manually",
      inaccurate: `Your location is only accurate to ±${fix.accuracy}m — too vague to send a rider`,
      unavailable: "Couldn't find your location — set your pickup manually",
      timeout: "Location is taking too long — set your pickup manually",
      unsupported: "This device can't share location — set your pickup manually",
    }[fix.reason] || "Set your pickup manually";

    track("pickup_gps_failed", { reason: fix.reason, accuracy: fix.accuracy || null });

    // A vague fix is still fine for centring the map so they can see roughly
    // where they are while they correct it.
    if (fix.lat) { mapHandle?.center(fix, 14); }
  }

  /**
   * Real supply near the customer.
   *
   * Most ride apps scatter fake vehicles across the map. These are the
   * actual online riders the matching service can reach — so the number is
   * true, and an empty map honestly says nobody is available rather than
   * animating a car that doesn't exist. Best-effort: a failure here must
   * never stop someone booking.
   */
  async function loadNearbyRiders(at) {
    const el = $("#supplyLine");
    if (!el) return;
    try {
      const riders = await api.getNearbyRiders(at.lat, at.lng);
      const list = Array.isArray(riders) ? riders : [];
      mapHandle?.setNearbyRiders(list);
      if (list.length === 0) {
        el.className = "nx-bike-supply none";
        el.innerHTML = `${icon("info", 13)} <span>No riders online near you right now</span>`;
      } else {
        el.className = "nx-bike-supply";
        el.innerHTML =
          `<span class="nx-live-dot"></span>` +
          `<span><b>${list.length}</b> rider${list.length === 1 ? "" : "s"} near you</span>`;
      }
    } catch {
      // Endpoint unavailable — say nothing rather than guess a number.
      el.innerHTML = "";
      el.className = "nx-bike-supply hidden";
    }
  }

  $("#pickupFix").addEventListener("click", () => {
    state.editingPickup = true;
    navigate("/set-locations");
  });

  /* --------------------------------------------------------- Book flow --- */

  $("#wheretoBtn").addEventListener("click", () => {
    if (!open) { toast(HOURS.closedMessage, true); return; }
    track("whereto_tapped", { hasPickup: !!pickup });
    state.selectedVehicle = "BIKE";
    navigate("/set-locations");
  });

  /* -------------------------------------------------------------- Boot --- */

  (async () => {
    try {
      mapHandle = await createMap($("#homeMap"), { zoom: 14 });
    } catch {
      $("#homeMap").classList.add("nx-map-skeleton");
    }
    locate();
  })();

  return () => mapHandle?.destroy();
}

/* ==========================================================================
   Coming soon — a real screen for a service that isn't live yet.
   ========================================================================== */

const SOON_COPY = {
  food: {
    icon: "utensils", title: "Nova Go Food",
    body: "We're signing up kitchens across the city now. Food goes live once we can deliver it hot and on time — not before.",
  },
  parcel: {
    icon: "package", title: "Nova Go Parcel",
    body: "Send anything across Karachi in under an hour. We're switching this on once our rider network is dense enough to make that promise true.",
  },
  errand: {
    icon: "basket", title: "Nova Go Errands",
    body: "Tell us what to buy and your budget, and a rider shops it for you. Coming after parcels.",
  },
};

export function renderComingSoon(root) {
  const key = state.comingSoonService || "food";
  const c = SOON_COPY[key] || SOON_COPY.food;
  const storeKey = `novago_notify_${key}`;
  const already = (() => { try { return localStorage.getItem(storeKey) === "1"; } catch { return false; } })();

  root.innerHTML = `
    <div class="page nx-stagger" style="min-height:100dvh;display:flex;flex-direction:column;justify-content:center;">
      <button id="backBtn" class="btn-icon mb-4" style="position:absolute;top:20px;left:20px;">
        ${icon("arrow-back", 20)}
      </button>

      <div class="text-center">
        <div class="nx-empty-art" style="width:88px;height:88px;border-radius:26px;">
          ${icon(c.icon, 34)}
        </div>
        <span class="badge badge-warning mb-3">${esc(SERVICES[key]?.eta || "Coming soon")}</span>
        <h1 class="text-xl mb-2">${c.title}</h1>
        <p class="text-secondary text-sm" style="max-width:32ch;margin:0 auto 26px;line-height:1.6;">
          ${c.body}
        </p>
      </div>

      <button id="notifyBtn" class="btn ${already ? "btn-secondary" : "btn-primary"} btn-block mb-3" ${already ? "disabled" : ""}>
        ${already ? `${icon("check", 17)} We'll let you know` : `${icon("bell", 17)} Tell me when it's live`}
      </button>
      <button id="bikeBtn" class="btn btn-ghost btn-block">Book a bike instead</button>

      <p class="text-xs text-muted text-center mt-6" style="max-width:34ch;margin-left:auto;margin-right:auto;">
        We're running bike rides first and doing them properly, rather than
        launching four services that all half-work.
      </p>
    </div>
  `;

  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelector("#bikeBtn").addEventListener("click", () => navigate("/home"));

  root.querySelector("#notifyBtn").addEventListener("click", (e) => {
    // Recorded as an analytics event, so the waiting list is a number you
    // can actually query rather than a feeling about what to build next.
    track("service_interest", { service: key });
    try { localStorage.setItem(storeKey, "1"); } catch { /* private mode */ }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.className = "btn btn-secondary btn-block mb-3";
    btn.innerHTML = `${icon("check", 17)} We'll let you know`;
    toast("Noted — we'll message you when it's live");
  });
}
