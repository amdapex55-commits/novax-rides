// Nova Go Rides — the money screen: map-first ride booking.
//
// One screen, one map, a docked sheet whose content advances through the
// flow (route → vehicle + fare → searching). Replaces the old three separate
// full-page steps, which is why booking used to feel like filling a form
// instead of hailing a ride.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, fmtMoney, dockSheet, esc, countUp } from "../ui.js";
import { navigate } from "../router.js";
import { createMap } from "../map.js";
import { resolveRoute, geocode, getPickupFix, createSuggester, reverseGeocode } from "../geocode.js";
import { getRoute, routeSummary, formatEta } from "../routing.js";
import { track } from "../analytics.js";
import { mountPickupNote } from "../pickupNote.js";
import {
  PRICING, VEHICLE_TYPES, ALLOW_BID_FARE, GPS, ZONE, inZone, isOpenNow, HOURS,
} from "../launch.config.js";
import { haptic } from "../haptics.js";

const ALL_VEHICLES = [
  { type: "BIKE", name: "Nova Moto", desc: "Fastest through traffic", icon: "bike", tag: "Bike" },
  { type: "RICKSHAW", name: "Nova Lite", desc: "Budget-friendly", icon: "rickshaw" },
  { type: "CAR", name: "Nova Premium", desc: "AC car, extra comfort", icon: "car" },
];

// Only what the pilot actually supplies. Offering a car with no cars online
// produces an unmatched request, which is a worse experience than never
// having offered it.
const VEHICLES = ALL_VEHICLES.filter((v) => VEHICLE_TYPES.includes(v.type));

/**
 * Fare preview.
 *
 * Reads PRICING from launch.config.js, which is kept in step with the
 * backend's FARE_CONFIG. Takes ROAD kilometres — the previous version took
 * straight-line distance and added a fabricated per-minute term derived from
 * an assumed 25km/h, so every quote was low and every real fare came back
 * higher than the number the customer had just agreed to.
 */
function previewFare(type, roadKm, durationMinutes) {
  const c = PRICING[type] || PRICING.BIKE;
  const timePart = c.perMin > 0 && durationMinutes ? durationMinutes * c.perMin : 0;
  const raw = c.base + roadKm * c.perKm + timePart;
  const rounded = Math.round(raw / 5) * 5;   // cash needs change
  return Math.max(c.minimum, rounded);
}

export function renderRideBooking(root) {
  root.innerHTML = `
    <div class="map-screen">
      <div class="nx-map" id="mapEl"></div>
      <button id="backBtn" class="map-fab" style="top:calc(14px + var(--safe-top)); left:14px;">${icon("arrow-back", 20)}</button>
      <button id="recenterBtn" class="map-fab" style="top:calc(14px + var(--safe-top)); right:14px;">${icon("locate", 20)}</button>
      <!-- Real supply count. Hidden until we actually have an answer, so it
           never flashes a wrong number while the request is in flight. -->
      <span id="nearbyCount" class="nx-nearby-chip" hidden></span>
    </div>
  `;

  const screen = root.querySelector(".map-screen");
  const sheet = dockSheet(screen);
  root.querySelector("#backBtn").addEventListener("click", () => navigate("/home"));

  let mapHandle = null;
  let nearbyPoll = 0;
  let pickup = null;   // { lat, lng, label } — set ONLY when trustworthy
  let dropoff = null;
  let route = null;    // { km, minutes, coordinates, estimated } from routing.js
  let pickupAccuracy = null;
  let selectedVehicle = VEHICLE_TYPES.includes(state.selectedVehicle) ? state.selectedVehicle : VEHICLE_TYPES[0];
  let fareMode = "FIXED";
  // "Fast Match" tip, in PKR. Zero means a normal booking — the default, and
  // the one that must never feel like the punished option.
  let fastMatchTip = 0;
  let destroyed = false;
  let noteCtl = null;
  let note = { text: "", audioUrl: null };

  // ---------- Step 1: where to ----------
  function stepRoute() {
    const node = sheet.step(`
      <h2 class="text-lg mb-1">Where to?</h2>
      <p class="text-secondary text-sm mb-4">We'll find you a driver nearby</p>

      <div class="card mb-3" style="padding:var(--sp-3) var(--sp-4);">
        <div class="flex gap-3">
          <div class="flex-col items-center" style="gap:4px; padding-top:14px;">
            <div style="width:9px;height:9px;border-radius:50%;background:var(--brand-ride);"></div>
            <div style="width:2px;height:26px;background:var(--surface-border);"></div>
            <div style="width:9px;height:9px;border-radius:2px;background:var(--brand-food);"></div>
          </div>
          <div class="flex-col" style="flex:1; gap:2px;">
            <input id="pickupInput" class="input" style="border:none;padding-left:0;height:44px;background:none;"
              placeholder="Current location" value="${esc(state.pickup?.label || "")}"/>
            <div style="height:1px;background:var(--surface-border);"></div>
            <input id="dropoffInput" class="input" style="border:none;padding-left:0;height:44px;background:none;"
              placeholder="Enter destination" value="${esc(state.dropoff?.label || "")}"/>
          </div>
        </div>
      </div>

      <button id="routeNextBtn" class="btn btn-primary btn-block">Continue ${icon("arrow-forward", 18)}</button>
    `);

    const dropInput = node.querySelector("#dropoffInput");
    dropInput.focus();

    node.querySelector("#routeNextBtn").addEventListener("click", async (e) => {
      const pickupLabel = node.querySelector("#pickupInput").value.trim();
      const dropoffLabel = dropInput.value.trim();
      if (!dropoffLabel) { toast("Where are you going?", true); return; }

      if (!isOpenNow()) { toast(HOURS.closedMessage, true); return; }

      const btn = e.currentTarget;
      const reset = () => {
        btn.disabled = false;
        btn.innerHTML = `Continue ${icon("arrow-forward", 18)}`;
      };
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Finding address...`;

      try {
        /* ---- PICKUP: the P0 gate -------------------------------------
           A ride cannot be booked against a pickup we aren't confident
           about. Previously an empty pickup field silently used the
           device position with no accuracy check, and a denied permission
           silently used Karachi city centre — so a customer in DHA could
           be dispatched to a rider in Saddar with nothing on screen ever
           admitting we didn't know where they were.

           Now: typed pickup → geocode it. Blank pickup → demand a fix
           that's accurate enough to send someone to, and refuse to
           continue without one. */
        const typedPickup = pickupLabel && !/current location/i.test(pickupLabel);

        if (typedPickup) {
          const hit = await geocode(pickupLabel);
          if (!hit.resolved) {
            toast("Couldn't find that pickup — add an area or landmark", true);
            reset(); return;
          }
          pickup = { lat: hit.lat, lng: hit.lng, label: hit.displayName || pickupLabel };
          pickupAccuracy = null;
        } else if (state.pickup?.verified && state.pickup.lat != null) {
          // Already verified on the home screen — don't make them wait twice.
          pickup = { lat: state.pickup.lat, lng: state.pickup.lng, label: state.pickup.label || "Current location" };
          pickupAccuracy = state.pickup.accuracy ?? null;
        } else {
          btn.innerHTML = `<span class="spinner"></span> Finding you...`;
          const fix = await getPickupFix({
            maxAccuracyMeters: GPS.maxAccuracyMeters,
            maxAgeMs: GPS.maxAgeMs,
            timeoutMs: GPS.timeoutMs,
          });
          if (!fix.ok) {
            showPickupProblem(fix);
            reset(); return;
          }
          pickup = { lat: fix.lat, lng: fix.lng, label: "Current location" };
          pickupAccuracy = fix.accuracy;
          reverseGeocode(pickup).then((n) => { if (n) pickup.label = n; });
        }

        // Zone check happens on the pickup, not the destination: we can take
        // you out of the zone, we just can't collect you from outside it.
        if (!inZone(pickup)) {
          toast(ZONE.outsideMessage, true);
          track("booking_blocked_outside_zone", {});
          reset(); return;
        }

        /* ---- DROP-OFF ------------------------------------------------ */
        btn.innerHTML = `<span class="spinner"></span> Finding address...`;
        const drop = await geocode(dropoffLabel, pickup);
        if (!drop.resolved) {
          toast("Couldn't find that address — try adding an area or landmark", true);
          reset(); return;
        }
        dropoff = { lat: drop.lat, lng: drop.lng, label: drop.displayName || dropoffLabel };

        /* ---- ROAD ROUTE ---------------------------------------------- */
        btn.innerHTML = `<span class="spinner"></span> Checking the route...`;
        route = await getRoute(pickup, dropoff);

        state.pickup = { ...pickup, accuracy: pickupAccuracy, verified: true };
        state.dropoff = { ...dropoff };
        state.route = route;

        if (mapHandle) {
          mapHandle.setPickup(pickup);
          mapHandle.setDropoff(dropoff);
          mapHandle.setRoute(route.coordinates);
          mapHandle.fit(route.coordinates, [60, 260]);
        }
        track("ride_route_set", {
          distanceKm: route.km,
          routed: !route.estimated,
          pickupAccuracy,
        });
        stepVehicle();
      } catch (err) {
        toast(err.message || "Couldn't look that up", true);
        reset();
      }
    });
  }

  /**
   * Explain a GPS failure and offer the way out.
   *
   * Every branch tells the customer something true and gives them an action.
   * None of them silently books a ride against a location we invented.
   */
  function showPickupProblem(fix) {
    const messages = {
      denied: "Location is off. Turn it on in your browser settings, or type your pickup address above.",
      inaccurate: `We can only place you within ${fix.accuracy}m — too vague to send a rider to. Step outside, or type your pickup address above.`,
      unavailable: "We couldn't find your location. Type your pickup address above instead.",
      timeout: "Finding your location is taking too long. Type your pickup address above instead.",
      unsupported: "This device can't share its location. Type your pickup address above instead.",
    };
    toast(messages[fix.reason] || messages.unavailable, true);
    track("booking_blocked_gps", { reason: fix.reason, accuracy: fix.accuracy || null });

    // Focus the pickup field — the fix is right there.
    const p = sheet.el?.querySelector?.("#pickupInput") || document.querySelector("#pickupInput");
    if (p) { p.value = ""; p.placeholder = "Type your pickup address"; p.focus(); }
  }

  // ---------- Step 2: vehicle + fare ----------
  function stepVehicle() {
    track("ride_fare_viewed", { distanceKm: route.km, routed: !route.estimated });

    const quoted = previewFare(selectedVehicle, route.km, route.minutes);

    const node = sheet.step(`
      <div class="flex justify-between items-center mb-1">
        <h2 class="text-lg">${VEHICLES.length > 1 ? "Choose a ride" : "Confirm your ride"}</h2>
        <button id="editRouteBtn" class="text-xs text-accent font-bold">Edit route</button>
      </div>
      <p class="text-secondary text-sm mb-1">${routeSummary(route)}</p>
      ${route.estimated ? `
        <p class="text-xs text-muted mb-3">
          ${icon("info", 11)} Distance is estimated — we couldn't reach the routing service.
          Your driver may quote a slightly different fare.
        </p>` : `<div class="mb-3"></div>`}

      <!-- THE COCKPIT.
           Every fact needed to commit, on one surface: the locked fare, the
           journey, how confident we are about the pickup, and how many
           riders are actually nearby. In a cash market the number is the
           decision, so it's the biggest thing on the screen — and "FARE
           LOCKED" answers the question every Karachi passenger has been
           trained to ask, which is whether the price will change later. -->
      <div class="nx-cockpit mb-4">
        <div class="nx-cockpit-top">
          <div style="min-width:0;">
            <p class="nx-cockpit-fare-label">Fare, paid in cash</p>
            <!-- Counts up from zero on arrival. The fare is the decision on
                 this screen, and a number that lands rather than appearing
                 draws the eye to it without a single word of instruction. -->
            <p class="nx-cockpit-fare" id="fareAmount">${fmtMoney(0)}</p>
            <!-- Fair Petrol Guarantee. Sits directly under the number it
                 explains, because it's only persuasive next to the fare. -->
            ${
              PRICING.showPetrolGuarantee && PRICING.petrolReferencePerLitre
                ? `<p class="nx-petrol-guarantee">${icon("shield", 11)}
                     Fare calculated at Petrol ${PRICING.currency} ${PRICING.petrolReferencePerLitre}/L</p>`
                : ""
            }
          </div>
          <span class="nx-lock">${icon("shield", 12)} Fare locked</span>
        </div>
        <div class="nx-cockpit-grid">
          <div class="nx-cockpit-cell">
            <div class="k">Journey</div>
            <div class="v">${route.km} km</div>
          </div>
          <div class="nx-cockpit-cell">
            <div class="k">Ride time</div>
            <div class="v">${formatEta(route.minutes)}</div>
          </div>
          <div class="nx-cockpit-cell">
            <div class="k">Pickup</div>
            <div class="v ${pickupAccuracy == null ? "" : pickupAccuracy <= 40 ? "good" : "warn"}">
              ${pickupAccuracy == null ? "By address" : `±${pickupAccuracy}m`}
            </div>
          </div>
        </div>
      </div>

      ${VEHICLES.length > 1 ? `
        <div class="flex-col gap-2 mb-4" id="vehList">
          ${VEHICLES.map((v) => `
            <button class="option-card${v.type === selectedVehicle ? " selected" : ""}" data-type="${v.type}" style="padding:var(--sp-3) var(--sp-4);">
              <div class="list-row-icon">${icon(v.icon, 22)}</div>
              <div class="flex-col" style="flex:1;">
                <div class="flex items-center gap-2">
                  <p class="font-bold">${v.name}</p>
                  ${v.tag ? `<span class="badge badge-accent">${v.tag}</span>` : ""}
                </div>
                <p class="text-secondary text-xs">${v.desc}</p>
              </div>
              <p class="font-bold">${fmtMoney(previewFare(v.type, route.km, route.minutes))}</p>
            </button>`).join("")}
        </div>` : `
        <div class="list-row mb-4" style="background:var(--surface);border-radius:var(--r-md);">
          <div class="list-row-icon" style="color:var(--accent);">${icon("bike", 22)}</div>
          <div style="flex:1;">
            <p class="font-bold text-sm">Nova Moto</p>
            <p class="text-secondary text-xs">Bike · arrives in about ${formatEta(Math.max(3, Math.round(route.minutes * 0.3)))}</p>
          </div>
        </div>`}

      ${ALLOW_BID_FARE ? `
        <!-- FAST MATCH.
             The problem this replaces is haggling: a rider says "traffic hai,
             100 extra", and the customer either argues at the roadside or
             feels cheated. Naming two fixed amounts up front turns an
             argument into a choice — and because the fare is locked, the
             customer knows the total before anyone sets off.
             "No tip" is first and selected by default, so the honest cheap
             option is the path of least resistance rather than a thing you
             have to opt back into. -->
        <div class="nx-fastmatch mb-3" id="fastMatch">
          <div class="nx-fastmatch-head">
            <span class="nx-fastmatch-title">${icon("bolt", 13)} Fast Match</span>
            <span class="nx-fastmatch-sub">Riders see the tip — it goes to them in full</span>
          </div>
          <div class="nx-fastmatch-opts" role="group" aria-label="Add a tip to match faster">
            <button type="button" class="nx-tip active" data-tip="0">No tip</button>
            <button type="button" class="nx-tip" data-tip="20">+${PRICING.currency} 20</button>
            <button type="button" class="nx-tip" data-tip="50">+${PRICING.currency} 50</button>
          </div>
        </div>

        <div class="top-tabs mb-3" id="fareTabs" style="grid-template-columns:1fr 1fr;">
          <div class="top-tabs-indicator" id="fareInd" style="width:50%; transform:translateX(0);"></div>
          <button class="top-tab active" data-mode="FIXED">Fixed fare</button>
          <button class="top-tab" data-mode="BID">Name your fare</button>
        </div>` : ""}
      <div id="pickupNote" class="mb-3"></div>
      <div id="farePanel" class="mb-3"></div>

      <button id="confirmRideBtn" class="btn btn-primary btn-block">Request ride ${icon("bolt", 18)}</button>

      <!-- Safety is not a footnote. These are the reasons someone is willing
           to get on a stranger's motorcycle, so they sit directly under the
           booking button in real colour, not as grey micro-text. -->
      <div class="nx-welcome-trust" style="margin-top:14px;padding-top:14px;">
        <span>${icon("shield", 13)} Verified rider</span>
        <span>${icon("locate", 13)} Live tracking</span>
        <span>${icon("phone", 13)} Ops watching</span>
      </div>
    `);

    node.querySelector("#editRouteBtn").addEventListener("click", stepRoute);

    // Pickup note. Optional, never blocking — Karachi addresses are spoken
    // ("gate ke saamne"), and a GPS pin gets a rider to the street but not
    // to the person.
    noteCtl?.destroy();
    noteCtl = mountPickupNote(node.querySelector("#pickupNote"), (n) => { note = n; });

    // Fare count-up. countUp() already respects the app's motion helpers and
    // finishes on the exact value, so the number shown is never a rounded
    // approximation of the number charged.
    const fareEl = node.querySelector("#fareAmount");
    if (fareEl) countUp(fareEl, quoted, { prefix: "Rs. ", duration: 700 });

    const farePanel = node.querySelector("#farePanel");
    const confirmBtn = node.querySelector("#confirmRideBtn");
    const fareTabs = node.querySelector("#fareTabs");
    const fareInd = node.querySelector("#fareInd");

    // Fast Match tip selection. Re-runs the fare count-up so the number the
    // customer commits to always includes what they just added — a tip that
    // doesn't move the headline total is a tip people forget they chose.
    const fastMatch = node.querySelector("#fastMatch");
    if (fastMatch) {
      fastMatch.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-tip]");
        if (!btn) return;
        haptic.light();
        fastMatchTip = Number(btn.dataset.tip) || 0;
        fastMatch.querySelectorAll("[data-tip]").forEach((b) => b.classList.toggle("active", b === btn));
        track("ride_fastmatch_tip_selected", { tipAmount: fastMatchTip });
        // Only the headline fare moves. The CTA is deliberately left alone —
        // its label carries an inline icon, and setting textContent on it
        // would strip the SVG and silently rename the button.
        const el = node.querySelector("#fareAmount");
        if (el) countUp(el, quoted + fastMatchTip, { prefix: "Rs. ", duration: 340 });
      });
    }

    function drawFarePanel() {
      if (fareMode === "FIXED") {
        // The fare is already stated large above, so this line is the
        // promise about it rather than a repeat of the number.
        farePanel.innerHTML = `
          <p class="text-xs text-muted text-center">
            This is the price. Your rider will not ask for more.
          </p>`;
        confirmBtn.innerHTML = `Request ride ${icon("bolt", 18)}`;
      } else {
        const suggested = previewFare(selectedVehicle, route.km, route.minutes);
        farePanel.innerHTML = `
          <label class="field-label">Your offer</label>
          <div class="flex items-center gap-2">
            <span class="font-bold text-lg">Rs.</span>
            <input id="bidInput" class="input" type="number" inputmode="numeric" min="1" value="${suggested}" style="flex:1;"/>
          </div>
          <p class="text-xs text-muted mt-2">Riders nearby see your offer and choose to accept.</p>
        `;
        confirmBtn.innerHTML = `Send offer ${icon("bolt", 18)}`;
      }
    }
    drawFarePanel();

    // Bidding is off for the pilot (ALLOW_BID_FARE in launch.config.js), so
    // these controls may not exist at all.
    if (fareTabs && fareInd) {
      fareTabs.querySelectorAll("[data-mode]").forEach((btn, i) => {
        btn.addEventListener("click", () => {
          fareMode = btn.dataset.mode;
          fareTabs.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b === btn));
          fareInd.style.transform = i === 0 ? "translateX(0)" : "translateX(100%)";
          drawFarePanel();
        });
      });
    }

    node.querySelectorAll("[data-type]").forEach((card) => {
      card.addEventListener("click", () => {
        node.querySelectorAll("[data-type]").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedVehicle = card.dataset.type;
        state.selectedVehicle = selectedVehicle;
        if (fareMode === "BID") drawFarePanel();
      });
    });

    // Guards against the classic double-booking: an impatient tap on a slow
    // connection creating two trips, two riders dispatched, one customer.
    // The disabled attribute alone loses the race if the tap lands in the
    // same frame, so we also latch a flag.
    let submitting = false;

    confirmBtn.addEventListener("click", async () => {
      if (submitting) return;

      // OTP is required at the point of booking, not before — guest browsing
      // stays open right up until the action that genuinely needs an account.
      if (!Token.access) {
        state.postAuthRedirect = "/ride";
        navigate("/signin");
        return;
      }

      // Re-check the things that can change while someone deliberates.
      if (!isOpenNow()) { toast(HOURS.closedMessage, true); return; }
      if (!pickup || pickup.lat == null) {
        toast("We still don't have your pickup — set it above", true);
        return;
      }

      let offeredFare;
      if (fareMode === "BID") {
        offeredFare = Number(node.querySelector("#bidInput").value);
        if (!offeredFare || offeredFare <= 0) { toast("Enter an offer amount", true); return; }
      }

      submitting = true;
      haptic.medium();
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="spinner"></span>`;
      try {
        const trip = await api.createTrip({
          pickupLat: pickup.lat, pickupLng: pickup.lng,
          dropoffLat: dropoff.lat, dropoffLng: dropoff.lng,
          vehicleType: selectedVehicle,
          fareType: fareMode,
          // Road distance and duration, so the server prices the ride the
          // customer was actually quoted rather than recomputing a
          // straight line. The server sanity-checks both before trusting.
          roadDistanceKm: route.km,
          roadDurationMinutes: route.minutes,
          pickupAccuracyMeters: pickupAccuracy ?? undefined,
          pickupNote: note.text || undefined,
          pickupNoteAudioUrl: note.audioUrl || undefined,
          ...(fastMatchTip > 0 ? { tipAmount: fastMatchTip } : {}),
          ...(fareMode === "BID" ? { offeredFare } : {}),
        });
        track("ride_requested", {
          vehicleType: selectedVehicle, fareType: fareMode,
          distanceKm: route.km, routed: !route.estimated,
          tipAmount: fastMatchTip,
        });
        state.activeTripId = trip.id;
        navigate("/tracking");
      } catch (err) {
        toast(err.message || "Couldn't request a ride", true);
        submitting = false;
        confirmBtn.disabled = false;
        drawFarePanel();
      }
    });
  }

  // ---------- Boot ----------
  (async () => {
    try {
      // Centre on the customer if we can, on the zone centre otherwise.
      // This fix is for the MAP ONLY — an inaccurate position is fine for
      // deciding where to point a viewport, and is never promoted to a
      // pickup without passing the accuracy gate in stepRoute().
      const fix = await getPickupFix({
        maxAccuracyMeters: GPS.maxAccuracyMeters,
        maxAgeMs: GPS.maxAgeMs,
        timeoutMs: 6000,
      });
      const here = fix.lat != null ? { lat: fix.lat, lng: fix.lng } : ZONE.center;
      if (destroyed) return;
      mapHandle = await createMap(root.querySelector("#mapEl"), { center: here, zoom: 14 });
      if (destroyed) { mapHandle.destroy(); return; }

      if (fix.ok) {
        // Trustworthy — remember it so stepRoute doesn't make them wait again.
        pickup = { lat: fix.lat, lng: fix.lng, label: "Current location" };
        pickupAccuracy = fix.accuracy;
        state.pickup = { ...pickup, accuracy: fix.accuracy, verified: true };
        mapHandle.setPickup(pickup);
      }
      root.querySelector("#recenterBtn").addEventListener("click", () => mapHandle.center(here, 15));

      /* LIVE SUPPLY — real riders, not decorative ones.
         Every ride-hailing app in this market draws vehicles on the booking
         map; almost none of them are real. These come from the matching
         service's own geo index, anonymised server-side to positions only —
         no id, no name, nothing followable (see location.controller.ts).
         Two things that buys us: "4 riders nearby" is a claim the customer
         can trust, and an empty map honestly says nobody is around instead
         of promising a pickup that won't come.
         Best-effort throughout: this is reassurance, and a booking must
         never depend on it. */
      const paintNearby = async () => {
        if (destroyed || !mapHandle) return;
        try {
          const riders = await api.getNearbyRiders(here.lat, here.lng);
          if (destroyed || !mapHandle) return;
          const points = Array.isArray(riders) ? riders : [];
          mapHandle.setNearbyRiders(points);
          const label = root.querySelector("#nearbyCount");
          if (label) {
            label.textContent = points.length
              ? `${points.length} rider${points.length === 1 ? "" : "s"} nearby`
              : "No riders nearby right now";
            label.hidden = false;
          }
        } catch { /* supply indicator is never worth failing a booking over */ }
      };
      await paintNearby();
      // Slow poll: riders move, but a booking screen redrawing every few
      // seconds is visual noise on a phone the customer is reading.
      nearbyPoll = setInterval(paintNearby, 20000);
    } catch {
      // Map failed (offline / CDN blocked) — booking must still work.
      const el = root.querySelector("#mapEl");
      if (el) el.innerHTML = `<div class="flex-col items-center justify-center" style="height:100%;color:var(--text-muted);"><p class="text-sm">Map unavailable — booking still works</p></div>`;
    }
  })();

  stepRoute();

  return () => {
    destroyed = true;
    clearInterval(nearbyPoll);
    // Releases the microphone if a recording was in progress.
    noteCtl?.destroy();
    if (mapHandle) mapHandle.destroy();
  };
}
