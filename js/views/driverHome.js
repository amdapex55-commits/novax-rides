// Nova Go Rides — driver home. This is the driver's whole workday, so it's
// built around the two things they actually care about: what they've earned,
// and whether they're online.
//
// Map is the background (where am I, where's the demand), earnings is the
// hero card, online/offline is the biggest touch target on the screen.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, esc, fmtMoney, trustCard } from "../ui.js";
import { navigate } from "../router.js";
import { socketManager } from "../socket.js";
import { createMap } from "../map.js";
import { getCurrentCoords } from "../geocode.js";
import { track } from "../analytics.js";

export function renderDriverHome(root) {
  const user = Token.user;
  let online = state.isDriverOnline;
  let mode = state.driverMode || "RIDE";
  let watchId = null;
  // Background-GPS watchdog state — see the long note in goOnline().
  let lastFixAt = 0;
  let staleTimer = 0;
  let onVisible = null;
  let mapHandle = null;
  let destroyed = false;

  root.innerHTML = `
    <div class="map-screen" style="height:calc(100dvh - 76px);">
      <div class="nx-map" id="mapEl"></div>

      <!-- Shown when position updates stop (usually because Android
           backgrounded the app). A rider who thinks they're online but
           isn't receiving jobs is the worst possible silent failure. -->
      <div class="nx-gps-stale" id="gpsStale" hidden></div>

      <!-- Earnings hero floats over the map: the number they opened the app for -->
      <div style="position:absolute; top:calc(12px + var(--safe-top)); left:12px; right:12px; z-index:var(--z-map-ui);">
        <div class="card-elevated" style="padding:var(--sp-4); box-shadow:var(--shadow-lg);">
          <div class="flex justify-between items-start">
            <div>
              <p class="text-secondary text-xs">Today's earnings</p>
              <h1 style="font-size:30px; line-height:1.15;" id="earnToday">Rs. —</h1>
              <p class="text-xs text-muted mt-1" id="earnSub">Loading...</p>
            </div>
            <div class="avatar" style="width:44px;height:44px;">${esc((user?.name || "D").charAt(0).toUpperCase())}</div>
          </div>
          <div class="flex gap-2 mt-3" style="border-top:1px solid var(--surface-border); padding-top:var(--sp-3);">
            <div style="flex:1;">
              <p class="text-xs text-muted">This week</p>
              <p class="font-bold" id="earnWeek">Rs. —</p>
            </div>
            <div style="flex:1;">
              <p class="text-xs text-muted">Jobs today</p>
              <p class="font-bold" id="jobsToday">—</p>
            </div>
            <div style="flex:1;">
              <p class="text-xs text-muted">Rating</p>
              <p class="font-bold">★ ${esc(user?.rating ?? "5.0")}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Docked control sheet: mode + the big online switch -->
      <div class="dock-sheet" style="max-height:none;">
        <div class="sheet-handle"></div>

        <div class="mode-switch mb-4${mode === "FOOD_ERRAND" ? " right" : ""}" id="modeSwitch">
          <div class="mode-switch-indicator"></div>
          <button class="mode-switch-option${mode === "RIDE" ? " active" : ""}" data-mode="RIDE">${icon("bike", 18)}<span>Rides &amp; Parcels</span></button>
          <button class="mode-switch-option${mode === "FOOD_ERRAND" ? " active" : ""}" data-mode="FOOD_ERRAND">${icon("utensils", 18)}<span>Food &amp; Errands</span></button>
        </div>

        <button id="onlineToggle" class="btn btn-block ${online ? "btn-danger" : "btn-primary"}" style="height:60px; font-size:17px;">
          <span class="pulse-dot" id="statusDot" style="width:10px;height:10px;background:currentColor;${online ? "" : "animation:none;"}"></span>
          <span id="onlineLabel">${online ? "Go Offline" : "Go Online"}</span>
        </button>
        <p class="text-xs text-muted text-center mt-2" id="radarLabel">${radarLabel(online, mode)}</p>
      </div>
    </div>
  `;

  const toggle = root.querySelector("#onlineToggle");
  const label = root.querySelector("#onlineLabel");
  const dot = root.querySelector("#statusDot");
  const radarLabelEl = root.querySelector("#radarLabel");
  const modeSwitch = root.querySelector("#modeSwitch");

  // ---------- Earnings ----------
  api.getDriverEarnings()
    .then((e) => {
      if (destroyed) return;
      root.querySelector("#earnToday").textContent = fmtMoney(e.today);
      root.querySelector("#earnWeek").textContent = fmtMoney(e.week);
      root.querySelector("#jobsToday").textContent = e.jobsToday;
      root.querySelector("#earnSub").textContent =
        e.jobsToday > 0 ? `${e.jobsToday} job${e.jobsToday === 1 ? "" : "s"} completed today` : "No jobs yet today — go online";
    })
    .catch(() => {
      if (destroyed) return;
      root.querySelector("#earnToday").textContent = fmtMoney(0);
      root.querySelector("#earnWeek").textContent = fmtMoney(0);
      root.querySelector("#jobsToday").textContent = "0";
      root.querySelector("#earnSub").textContent = "Couldn't load earnings";
    });

  // ---------- Online / offline ----------
  function paintOnline() {
    toggle.className = `btn btn-block ${online ? "btn-danger" : "btn-primary"}`;
    label.textContent = online ? "Go Offline" : "Go Online";
    dot.style.animation = online ? "" : "none";
    radarLabelEl.textContent = radarLabel(online, mode);
  }

  async function goOnline() {
    const socket = await socketManager.connect();
    if (!socket) {
      // Two different failures, two different messages — telling a driver
      // "session expired" when the real problem is a blocked CDN sends them
      // to re-login pointlessly and they still won't get jobs.
      if (socketManager.degraded) {
        toast("Can't reach the live network right now — check your connection", true);
      } else {
        toast("Session expired — log in again", true);
        navigate("/phone");
      }
      return;
    }
    socketManager.on("trip:offer", onTripOffer);
    socketManager.on("foodOrder:offer", onFoodOffer);
    socketManager.on("errand:offer", onErrandOffer);
    socketManager.on("driver:notApproved", onNotApproved);
    socketManager.on("job:manuallyAssigned", onManualAssign);

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          lastFixAt = Date.now();
          socketManager.emit("driver:location", { lat: pos.coords.latitude, lng: pos.coords.longitude });
          if (mapHandle) mapHandle.setDriver({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => console.warn("[NovaGo] geolocation error:", err.message),
        { enableHighAccuracy: false, maximumAge: 10000, timeout: 10000 },
      );
    }

    /* ---- THE BACKGROUND PROBLEM ------------------------------------
       Browser geolocation only runs while this page is in the foreground.
       The moment a rider opens WhatsApp, switches to Google Maps for
       directions, or just locks their screen, Android suspends the timer
       and position updates STOP — usually within 1-2 minutes.

       The rider believes they're online. Our map shows them frozen at
       their last known point. Ops dispatches to a stale position, or the
       matcher skips them entirely. Nobody is told.

       A real fix needs a native foreground service (see BACKGROUND-GPS.md).
       Until that ships, the honest thing is to DETECT it and say so, rather
       than let a rider sit there believing they're earning.               */
    lastFixAt = Date.now();
    staleTimer = setInterval(() => {
      if (!online) return;
      const staleFor = Date.now() - lastFixAt;
      const banner = root.querySelector("#gpsStale");
      if (!banner) return;
      if (staleFor > 90_000) {
        banner.hidden = false;
        banner.innerHTML =
          `${icon("bolt", 15)}<span><strong>Your location has stopped updating.</strong> ` +
          `Keep Nova Go open on screen — you won't get jobs while it's in the background.</span>`;
      } else {
        banner.hidden = true;
      }
    }, 15_000);

    // Re-acquire immediately on return to foreground, instead of waiting for
    // the OS to resume the watch on its own schedule.
    onVisible = () => {
      if (document.visibilityState === "visible" && online && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            lastFixAt = Date.now();
            socketManager.emit("driver:location", { lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => {},
          { maximumAge: 0, timeout: 8000 },
        );
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    online = true;
    state.isDriverOnline = true;
    track("driver_went_online", { mode });
    paintOnline();
  }

  function goOffline() {
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    clearInterval(staleTimer);
    if (onVisible) { document.removeEventListener("visibilitychange", onVisible); onVisible = null; }
    const banner = root.querySelector("#gpsStale");
    if (banner) banner.hidden = true;
    socketManager.off("trip:offer", onTripOffer);
    socketManager.off("foodOrder:offer", onFoodOffer);
    socketManager.off("errand:offer", onErrandOffer);
    socketManager.off("driver:notApproved", onNotApproved);
    socketManager.off("job:manuallyAssigned", onManualAssign);
    online = false;
    state.isDriverOnline = false;
    track("driver_went_offline", { mode });
    paintOnline();
  }

  // The backend now refuses to put unapproved drivers in the pool and closes
  // the socket — without this the app would just look silently broken.
  function onNotApproved(payload) {
    online = false;
    state.isDriverOnline = false;
    paintOnline();
    toast(payload?.message || "Your account isn't approved to go online yet", true);
    navigate("/driver/pending");
  }

  // Ops assigned a job by hand (dispatch fallback) — no countdown, it's
  // already agreed on the phone.
  function onManualAssign(payload) {
    toast("Ops assigned you a job");
    if (payload.jobType === "TRIP") { state.activeTripId = payload.jobId; navigate("/driver/progress"); }
    else if (payload.jobType === "FOOD_ORDER") { state.activeFoodOrderId = payload.jobId; navigate("/driver/food-progress"); }
    else if (payload.jobType === "ERRAND") { state.activeErrandId = payload.jobId; navigate("/driver/errand-progress"); }
  }

  function onTripOffer(payload) {
    if (mode !== "RIDE") return; // stale event from before a mode switch
    track("driver_offer_received", { kind: "TRIP" });
    state.offerTripId = payload.tripId;
    state.incomingTripOffer = payload;
    navigate("/driver/offer");
  }
  function onFoodOffer(payload) {
    if (mode !== "FOOD_ERRAND") return;
    track("driver_offer_received", { kind: "FOOD_ORDER" });
    state.offerFoodOrderId = payload.orderId;
    navigate("/driver/food-offer");
  }
  function onErrandOffer(payload) {
    if (mode !== "FOOD_ERRAND") return;
    track("driver_offer_received", { kind: "ERRAND" });
    state.offerErrandId = payload.errandId;
    navigate("/driver/errand-offer");
  }

  toggle.addEventListener("click", () => (online ? goOffline() : goOnline()));
  if (online) goOnline(); // resume if we navigated back while already online

  modeSwitch.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const next = btn.dataset.mode;
      if (next === mode) return;
      // Confirm with the backend BEFORE flipping the UI — it rejects a switch
      // mid-job, and an optimistic flip that silently failed would leave the
      // driver subscribed to the wrong queue, dropping real offers.
      modeSwitch.style.opacity = "0.6";
      try {
        await api.setDriverMode(next);
        mode = next;
        state.driverMode = mode;
        modeSwitch.classList.toggle("right", mode === "FOOD_ERRAND");
        modeSwitch.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
        radarLabelEl.textContent = radarLabel(online, mode);
      } catch (err) {
        toast(err.message || "Couldn't switch queues", true);
      } finally {
        modeSwitch.style.opacity = "";
      }
    });
  });

  // ---------- Map ----------
  (async () => {
    try {
      const here = await getCurrentCoords();
      if (destroyed) return;
      mapHandle = await createMap(root.querySelector("#mapEl"), { center: here, zoom: 14 });
      if (destroyed) { mapHandle.destroy(); return; }
      mapHandle.setDriver(here);
    } catch { /* map is ambience here, not required to work */ }
  })();

  return () => {
    destroyed = true;
    socketManager.off("trip:offer", onTripOffer);
    socketManager.off("foodOrder:offer", onFoodOffer);
    socketManager.off("errand:offer", onErrandOffer);
    socketManager.off("driver:notApproved", onNotApproved);
    socketManager.off("job:manuallyAssigned", onManualAssign);
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    if (mapHandle) mapHandle.destroy();
  };
}

function radarLabel(online, mode) {
  if (!online) return "You won't receive job offers while offline";
  return mode === "FOOD_ERRAND" ? "Listening for food & errand offers…" : "Listening for ride & parcel offers…";
}

// ---------------- Incoming offer ----------------

export function renderIncomingOffer(root) {
  const tripId = state.offerTripId;
  const offer = state.incomingTripOffer || {};
  const isBid = offer.fareType === "BID";
  const total = 15;
  let seconds = total;

  const tip = Number(offer.tipAmount) > 0 ? Number(offer.tipAmount) : 0;
  const fare = offer.fare != null ? Number(offer.fare) : null;
  // What actually lands in the driver's pocket. A tip shown as a separate
  // line under a smaller "fare" is a tip that doesn't influence the decision —
  // the total is the number worth deciding on, so it's the number that's big.
  const earn = fare == null ? null : fare + tip;

  // FULL-SCREEN, ONE-TAP. This screen is read at a roadside, in sunlight,
  // often with a helmet on and possibly while still rolling to a stop. So:
  // one enormous accept target that's hard to miss with a gloved thumb, and
  // the decline deliberately small and out of the primary thumb arc, because
  // an accidental decline costs a passenger a ride and the driver a fare.
  root.innerHTML = `
    <div class="nx-offer${tip > 0 ? " has-tip" : ""}">
      <div class="nx-offer-head">
        <span class="nx-offer-kind">${isBid ? "Rider's offer" : "New ride request"}</span>
        ${tip > 0 ? `<span class="nx-offer-fast">${icon("bolt", 13)} Fast Match · +${fmtMoney(tip)} tip</span>` : ""}
      </div>

      <div class="nx-offer-body">
        <p class="nx-offer-label">You earn</p>
        <h1 class="nx-offer-amount">${earn != null ? fmtMoney(earn) : "—"}</h1>
        ${
          tip > 0
            ? `<p class="nx-offer-breakdown">${fmtMoney(fare)} fare + ${fmtMoney(tip)} tip — the tip is yours in full</p>`
            : isBid
              ? `<p class="nx-offer-breakdown">Rider named this fare</p>`
              : ""
        }

        <div class="nx-offer-facts">
          <div>
            <span class="k">Pickup</span>
            <span class="v">${offer.distanceKm != null ? `${Number(offer.distanceKm).toFixed(1)} km away` : "Nearby"}</span>
          </div>
          <div>
            <span class="k">Vehicle</span>
            <span class="v">${esc(String(offer.vehicleType || "—").toLowerCase())}</span>
          </div>
        </div>
      </div>

      <div class="nx-offer-actions">
        <!-- The countdown lives INSIDE the accept button. It's the only place
             the eye is already going, and it means the driver never has to
             look somewhere else to know how long is left. -->
        <button id="acceptBtn" class="nx-offer-accept">
          <span class="nx-offer-accept-fill" id="ring"></span>
          <span class="nx-offer-accept-text">
            ${icon("check", 22)} Accept${earn != null ? ` · ${fmtMoney(earn)}` : ""}
            <em id="countdown">${seconds}s</em>
          </span>
        </button>
        <button id="declineBtn" class="nx-offer-decline">Decline</button>
      </div>
    </div>
  `;
  if (!tripId) { navigate("/driver/home"); return; }

  const countdownEl = root.querySelector("#countdown");
  const ring = root.querySelector("#ring");

  const timer = setInterval(() => {
    seconds--;
    countdownEl.textContent = `${Math.max(seconds, 0)}s`;
    // The button drains left-to-right as the window closes — peripheral
    // information, readable without focusing on it.
    ring.style.transform = `scaleX(${Math.max(seconds, 0) / total})`;
    if (seconds <= 5) ring.classList.add("is-urgent");
    if (seconds <= 0) { clearInterval(timer); navigate("/driver/home"); }
  }, 1000);

  root.querySelector("#acceptBtn").addEventListener("click", async () => {
    clearInterval(timer);
    try {
      await api.acceptTrip(tripId);
      track("driver_offer_accepted", { kind: "TRIP", tripId });
      state.activeTripId = tripId;
      state.offerTripId = null;
      state.incomingTripOffer = null;
      navigate("/driver/progress");
    } catch (err) {
      toast(err.message || "Offer expired", true);
      navigate("/driver/home");
    }
  });

  root.querySelector("#declineBtn").addEventListener("click", async () => {
    clearInterval(timer);
    try { await api.declineTrip(tripId); } catch (e) { console.warn(e); }
    track("driver_offer_declined", { kind: "TRIP", tripId });
    state.offerTripId = null;
    state.incomingTripOffer = null;
    navigate("/driver/home");
  });

  return () => clearInterval(timer);
}

// ---------------- Trip in progress (driver side) ----------------

const STEPS = [
  { key: "MATCHED", action: "arrive", btn: "I've Arrived" },
  { key: "ARRIVED", action: "start", btn: "Start Trip" },
  { key: "IN_PROGRESS", action: "complete", btn: "Complete Trip" },
];

export function renderTripProgress(root) {
  const tripId = state.activeTripId;
  let stepIndex = 0;
  let mapHandle = null;
  let destroyed = false;
  let trip = null;

  root.innerHTML = `
    <div class="map-screen">
      <div class="nx-map" id="mapEl"></div>
      <button id="sosBtn" class="map-fab danger" style="top:calc(14px + var(--safe-top)); right:14px;">${icon("sos", 20)}</button>
      <div class="dock-sheet">
        <div class="sheet-handle"></div>
        <div id="sheetBody"></div>
      </div>
    </div>
  `;
  if (!tripId) { navigate("/driver/home"); return; }

  const body = root.querySelector("#sheetBody");

  function draw() {
    const step = STEPS[stepIndex];
    body.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <span class="badge badge-accent">Trip in progress</span>
        <span class="ref-id">#${esc(tripId.slice(0, 8).toUpperCase())}</span>
      </div>
      ${trip?.rider ? trustCard({ name: trip.rider.name || "Rider", subtitle: "Your passenger", rating: trip.rider.rating }) : ""}
      <div class="flex-col gap-1 mb-3" style="border-top:1px solid var(--surface-border); padding-top:var(--sp-3);">
        <p class="text-sm"><span class="text-muted text-xs">Pickup</span><br/>${esc(state.pickup?.label || "Pickup point")}</p>
        <p class="text-sm mt-2"><span class="text-muted text-xs">Drop-off</span><br/>${esc(state.dropoff?.label || "Destination")}</p>
      </div>
      <div class="flex gap-2 mb-3">
        <button id="chatBtn" class="btn btn-secondary" style="flex:1;">${icon("chat", 18)} Message</button>
        <button id="supportBtn" class="btn btn-secondary" style="flex:1;">${icon("bolt", 18)} Support</button>
      </div>
      <button id="actionBtn" class="btn btn-primary btn-block" style="height:56px;">${step.btn}</button>
    `;

    body.querySelector("#chatBtn").addEventListener("click", () => {
      state.chatContext = { contextType: "TRIP", contextId: tripId, otherPartyLabel: trip?.rider?.name || "Rider" };
      navigate("/chat-thread");
    });
    body.querySelector("#supportBtn").addEventListener("click", () => navigate("/support"));

    body.querySelector("#actionBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const s = STEPS[stepIndex];
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        if (s.action === "arrive") await api.arriveTrip(tripId);
        else if (s.action === "start") await api.startTrip(tripId);
        else await api.completeTrip(tripId);

        stepIndex++;
        if (stepIndex >= STEPS.length) {
          toast("Trip completed!");
          state.activeTripId = null;
          navigate("/driver/earnings");
          return;
        }
        draw();
      } catch (err) {
        toast(err.message || "Action failed", true);
        btn.disabled = false;
        btn.textContent = s.btn;
      }
    });
  }

  root.querySelector("#sosBtn").addEventListener("click", async () => {
    try {
      const pos = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(null),
          { timeout: 3000 },
        );
      });
      await api.raiseIncident({ type: "SOS", contextType: "TRIP", contextId: tripId, ...(pos || {}) });
      toast("Support alerted with your location");
    } catch {
      toast("Couldn't reach support — call 15 if you're in danger", true);
    }
  });

  api.getTrip(tripId).then((t) => {
    if (destroyed) return;
    trip = t;
    draw();
    if (mapHandle) {
      const p = { lat: t.pickupLat, lng: t.pickupLng };
      const d = { lat: t.dropoffLat, lng: t.dropoffLng };
      mapHandle.setPickup(p); mapHandle.setDropoff(d);
      mapHandle.setRoute([p, d]); mapHandle.fit([p, d], [70, 300]);
    }
  }).catch(() => draw());

  (async () => {
    try {
      mapHandle = await createMap(root.querySelector("#mapEl"), { zoom: 14 });
      if (destroyed) mapHandle.destroy();
    } catch { /* optional */ }
  })();

  draw();

  return () => { destroyed = true; if (mapHandle) mapHandle.destroy(); };
}
