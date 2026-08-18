// Nova Go Rides — driver home. This is the driver's whole workday, so it's
// built around the two things they actually care about: what they've earned,
// and whether they're online.
//
// Map is the background (where am I, where's the demand), earnings is the
// hero card, online/offline is the biggest touch target on the screen.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, esc, fmtMoney, trustCard, contactSheet } from "../ui.js";
import { navigate } from "../router.js";
import { socketManager } from "../socket.js";
import { startDriverTracking, requestImmediateFix } from "../driverLocation.js";
import { showLocationDisclosure } from "../locationDisclosure.js";
import { createMap } from "../map.js";
import { getCurrentCoords } from "../geocode.js";
import { getRoute, straightLineKm, formatEta } from "../routing.js";
import { track } from "../analytics.js";
import { haptic } from "../haptics.js";
import { APP_VERSION } from "../appMode.js";
import { reportHandled } from "../errors.js";
import { pushOffer, removeOffer, clearOffers } from "../offerStack.js";

export function renderDriverHome(root) {
  const user = Token.user;
  let online = state.isDriverOnline;
  let mode = state.driverMode || "RIDE";
  // Background-GPS watchdog state — see the long note in goOnline().
  let lastFixAt = 0;
  let tracker = null;
  let staleTimer = 0;
  let heartbeatTimer = 0;
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
            <div class="avatar" style="width:44px;height:44px;">${esc(initialOf(user))}</div>
          </div>
          <div class="flex gap-2 mt-3" style="border-top:1px solid var(--surface-border); padding-top:var(--sp-3);">
            <!-- Four numbers, one row. Online time is here because it is the
                 other half of the earnings figure: Rs 2,450 means something
                 different after two hours than after nine, and a driver
                 deciding whether to keep riding is doing that division in
                 their head anyway. -->
            <div style="flex:1;min-width:0;">
              <p class="nx-stat-k">This week</p>
              <p class="nx-stat-v" id="earnWeek">Rs. —</p>
            </div>
            <div style="flex:1;min-width:0;">
              <p class="nx-stat-k">Jobs</p>
              <p class="nx-stat-v" id="jobsToday">—</p>
            </div>
            <div style="flex:1;min-width:0;">
              <p class="nx-stat-k">Online</p>
              <p class="nx-stat-v" id="onlineFor">—</p>
            </div>
            <div style="flex:1;min-width:0;">
              <p class="nx-stat-k">Rating</p>
              <p class="nx-stat-v">★ ${esc(user?.rating ?? "5.0")}</p>
            </div>
          </div>

          <!-- COMMISSION OWED.
               The credit limit already stopped offering jobs to a driver past
               Rs 2,000 — silently. From the saddle that looks like a quiet
               afternoon, then like a broken app. This is the warning that has
               to arrive before the wall, on the one screen a driver actually
               watches. Hidden entirely while the balance is comfortable, so
               it never becomes furniture they stop seeing. -->
          <button id="oweStrip" class="nx-owe-strip" hidden></button>
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
        <!-- The question every driver eventually asks, one tap from the
             screen where they ask it. -->
        <button id="diagBtn" class="nx-sec-action" style="display:block;margin:8px auto 0;">
          Not getting jobs?
        </button>
      </div>
    </div>
  `;

  const toggle = root.querySelector("#onlineToggle");
  const label = root.querySelector("#onlineLabel");
  const dot = root.querySelector("#statusDot");
  const radarLabelEl = root.querySelector("#radarLabel");
  const modeSwitch = root.querySelector("#modeSwitch");
  root.querySelector("#diagBtn")?.addEventListener("click", () => navigate("/driver/diagnostics"));

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

  // ---------- Commission owed ----------
  api.getWalletBalance()
    .then((b) => {
      if (destroyed) return;
      const strip = root.querySelector("#oweStrip");
      if (!strip || !b) return;
      // "ok" and "notice" stay hidden: a driver two days into the week owing
      // Rs 300 does not need a banner, and showing one every day is how a
      // warning stops being read by the time it matters.
      if (b.level !== "warning" && b.level !== "blocked") return;

      const owed = Number(b.owed || 0).toLocaleString("en-PK");
      strip.hidden = false;
      strip.className = `nx-owe-strip ${b.level}`;
      strip.innerHTML = `
        <span class="nx-owe-strip-dot"></span>
        <span style="flex:1;min-width:0;">
          <span class="font-bold text-sm" style="display:block;">
            ${b.blocked ? "Jobs paused — settle Rs. " + owed : "Rs. " + owed + " commission due"}
          </span>
          <span class="text-xs text-secondary" style="display:block;margin-top:2px;">
            ${b.blocked
              ? "Pay to start receiving jobs again"
              : "Rs. " + Number(b.remainingCredit || 0).toLocaleString("en-PK") + " of trips left before jobs pause"}
          </span>
        </span>
        ${icon("chevronRight", 18)}`;
      strip.addEventListener("click", () => navigate("/driver/settle"));
    })
    .catch(() => { /* the strip simply stays hidden */ });

  // ---------- Online / offline ----------
  function paintOnline() {
    toggle.className = `btn btn-block ${online ? "btn-danger" : "btn-primary"}`;
    label.textContent = online ? "Go Offline" : "Go Online";
    dot.style.animation = online ? "" : "none";
    radarLabelEl.textContent = radarLabel(online, mode);
    paintOnlineFor();
  }

  /* Ticks once a minute, not once a second: the number is read in glances and
     a seconds counter on a screen you look at while riding is just motion. */
  function paintOnlineFor() {
    const el = root.querySelector("#onlineFor");
    if (!el) return;
    const since = online ? Number(state.onlineSince) || 0 : 0;
    if (!since) { el.textContent = "—"; return; }
    const mins = Math.max(0, Math.floor((Date.now() - since) / 60000));
    el.textContent = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  async function goOnline() {
    // Only stamp a NEW shift. Coming back to this screen while already online
    // must not restart the clock — that is the bug that makes the number
    // useless, because a driver checks their earnings constantly.
    if (!state.onlineSince) state.onlineSince = Date.now();
    const socket = await socketManager.connect();
    if (!socket) {
      // Two different failures, two different messages — telling a driver
      // "session expired" when the real problem is a blocked CDN sends them
      // to re-login pointlessly and they still won't get jobs.
      /* NEVER BOUNCE A DRIVER TO THE LOGIN SCREEN FROM HERE.

         connect() returns null when the realtime library could not load or
         when there is no token in memory at that instant — neither of which
         proves the session is over, and both of which happen on a moving
         bike. Sending someone to /signin mid-shift, possibly mid-trip, is
         the worst thing this screen can do: they lose the job, the passenger
         waits, and the app has taught them it cannot be relied on.

         So: say it plainly, leave them signed in, and let them tap Go Online
         again. If the token really is dead the next API call returns 401 and
         the central handler deals with it once, properly. */
      toast(
        socketManager.degraded
          ? "Can't reach the live network right now — check your connection and try again."
          : "Couldn't start listening for jobs. Tap Go Online to retry.",
        true,
      );
      online = false;
      state.isDriverOnline = false;
      paintOnline();
      return;
    }
    socketManager.on("trip:offer", onTripOffer);
    socketManager.on("foodOrder:offer", onFoodOffer);
    socketManager.on("errand:offer", onErrandOffer);
    /* PARCELS. The backend has emitted this since the delivery module
       shipped and nothing listened, so every parcel a customer booked was
       offered to a driver who could not see it, timed out, and cascaded until
       the delivery ran out of drivers and failed to match. */
    socketManager.on("delivery:offer", onDeliveryOffer);
    socketManager.on("trip:offerTaken", onOfferTaken);
    socketManager.on("driver:notApproved", onNotApproved);
    socketManager.on("job:manuallyAssigned", onManualAssign);

    // PROMINENT DISCLOSURE — must come BEFORE any location permission request
    // or foreground service starts. Google Play rejects driver apps that go
    // straight to the Android system prompt, and the rejection costs a full
    // review cycle. See js/locationDisclosure.js for the policy wording.
    //
    // Declining leaves the driver offline rather than proceeding silently:
    // "we asked and they said no" has to actually mean something.
    const consented = await showLocationDisclosure();
    if (!consented) {
      toast("You won't receive jobs without location access", true);
      online = false;
      state.isDriverOnline = false;
      paintOnline();
      return;
    }

    // Native builds get a foreground service that keeps reporting with the
    // screen off; browser builds get watchPosition and the stale banner below.
    // startDriverTracking() decides which, so nothing here has to care.
    tracker = await startDriverTracking({
      onFix: ({ lat, lng }) => {
        lastFixAt = Date.now();
        /* THE TRIP ID IS WHY THE CUSTOMER'S MAP NEVER MOVED.
           The gateway only broadcasts into the rider's trip room when the ping
           carries the trip it belongs to — `if (body.tripId)`. This sent bare
           coordinates, so that branch was never taken and the rider watched a
           stationary pin for the whole journey while their driver was three
           streets away and closing. */
        socketManager.emit("driver:location", { lat, lng, tripId: state.activeTripId || undefined });
        if (mapHandle) mapHandle.setDriver({ lat, lng });
      },
      onError: ({ code, message }) => {
        console.warn(`[NovaGo] location error (${code}):`, message);
        if (code === "NOT_AUTHORIZED") {
          toast("Location permission is off — you won't get jobs until it's on", true);
        }
      },
    });

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
    /* GOING ONLINE IS THE MOMENT A SHIFT STARTS.
       It used to be a switch flipping colour — the same feedback as toggling
       a setting. For a rider this is the point they start earning, and every
       app that competes for their time (Bykea, Careem's captain app, even
       Foodpanda's rider app) marks it. A short haptic and a line that says
       what is now true costs nothing and makes the app feel like it is on
       their side rather than merely recording them. */
    haptic.success();
    toast("You're live — looking for jobs near you");

    /* HEARTBEAT. The server treats liveness as a claim that expires, so this
       has to keep arriving or matching stops offering jobs — which is the
       point: if this app is killed by a battery manager, the beats stop and
       the server notices without needing the dead process to tell it.
       20s against a 60s staleness window: three missed beats before we are
       disbelieved, tolerant of one bad tunnel, not of a killed app. */
    const beat = () => {
      const conn = navigator.connection || {};
      api.sendHeartbeat({
        appVersion: APP_VERSION,
        networkType: conn.effectiveType || undefined,
      }).catch(() => { /* one missed beat is not worth surfacing */ });
    };
    beat();
    heartbeatTimer = setInterval(beat, 20_000);

    lastFixAt = Date.now();
    staleTimer = setInterval(() => {
      if (!online) return;
      const staleFor = Date.now() - lastFixAt;
      const banner = root.querySelector("#gpsStale");
      if (!banner) return;
      if (staleFor > 90_000) {
        banner.hidden = false;
        // Two different causes need two different instructions. On a browser
        // build the fix is "keep the app open". On a native build the
        // foreground service should have kept running, so a stall means the
        // phone killed it — overwhelmingly a Xiaomi/Oppo/Vivo battery manager,
        // and telling that rider to keep the app open would be useless advice.
        banner.innerHTML =
          tracker?.mode === "native"
            ? `${icon("bolt", 15)}<span><strong>Your phone stopped Nova Go's location service.</strong> ` +
              `Open Settings → Battery → App auto-launch and allow Nova Go, or call support.</span>`
            : `${icon("bolt", 15)}<span><strong>Your location has stopped updating.</strong> ` +
              `Keep Nova Go open on screen — you won't get jobs while it's in the background.</span>`;
      } else {
        banner.hidden = true;
      }
    }, 15_000);

    // Re-acquire immediately on return to foreground, instead of waiting for
    // the OS to resume the watch on its own schedule.
    onVisible = () => {
      // Native tracking never paused, so there is nothing to re-acquire.
      if (tracker?.mode === "native") return;
      if (document.visibilityState === "visible" && online) {
        requestImmediateFix(({ lat, lng }) => {
          lastFixAt = Date.now();
          /* THE TRIP ID IS WHY THE CUSTOMER'S MAP NEVER MOVED.
           The gateway only broadcasts into the rider's trip room when the ping
           carries the trip it belongs to — `if (body.tripId)`. This sent bare
           coordinates, so that branch was never taken and the rider watched a
           stationary pin for the whole journey while their driver was three
           streets away and closing. */
        socketManager.emit("driver:location", { lat, lng, tripId: state.activeTripId || undefined });
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    online = true;
    state.isDriverOnline = true;
    track("driver_went_online", { mode });
    paintOnline();
  }

  function goOffline() {
    state.onlineSince = null;
    clearOffers();
    tracker?.stop().catch(() => {});
    tracker = null;
    clearInterval(staleTimer);
    // Stop asserting liveness. Without this the server keeps believing an
    // offline driver is available for a further minute.
    clearInterval(heartbeatTimer);
    heartbeatTimer = 0;
    if (onVisible) { document.removeEventListener("visibilitychange", onVisible); onVisible = null; }
    const banner = root.querySelector("#gpsStale");
    if (banner) banner.hidden = true;
    socketManager.off("trip:offer", onTripOffer);
    socketManager.off("foodOrder:offer", onFoodOffer);
    socketManager.off("errand:offer", onErrandOffer);
    socketManager.off("delivery:offer", onDeliveryOffer);
    socketManager.off("trip:offerTaken", onOfferTaken);
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

  /* Jobs arrive as cards over this screen, not as a screen of their own.
     Several can be on offer at once now, so the rider chooses instead of
     being handed one and given fifteen seconds. */
  function onTripOffer(payload) {
    if (mode !== "RIDE") return; // stale event from before a mode switch
    track("driver_offer_received", { kind: "TRIP" });
    pushOffer(payload);
  }
  /* Somebody else claimed it. Pull the card before the rider taps a job that
     is already gone — a stack containing a dead offer is how they learn to
     stop trusting the stack. */
  function onOfferTaken(payload) {
    removeOffer(payload?.tripId);
  }
  function onFoodOffer(payload) {
    if (mode !== "FOOD_ERRAND") return;
    track("driver_offer_received", { kind: "FOOD_ORDER" });
    state.offerFoodOrderId = payload.orderId;
    navigate("/driver/food-offer");
  }
  /* Parcels ride in the same mode as trips — "Rides & Parcels" is one switch
     because it is one kind of work on a bike. The job TYPE is what changes,
     and that is carried on the offer screen, not in the mode. */
  function onDeliveryOffer(payload) {
    if (mode !== "RIDE") return;
    track("driver_offer_received", { kind: "DELIVERY" });
    state.offerDeliveryId = payload.deliveryId;
    state.incomingDeliveryOffer = payload;
    haptic.medium();
    navigate("/driver/parcel-offer");
  }
  function onErrandOffer(payload) {
    if (mode !== "FOOD_ERRAND") return;
    track("driver_offer_received", { kind: "ERRAND" });
    state.offerErrandId = payload.errandId;
    navigate("/driver/errand-offer");
  }

  toggle.addEventListener("click", () => (online ? goOffline() : goOnline()));
  if (online) goOnline(); // resume if we navigated back while already online
  paintOnlineFor();
  const onlineTicker = setInterval(paintOnlineFor, 60000);

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
    clearInterval(onlineTicker);
    socketManager.off("trip:offer", onTripOffer);
    socketManager.off("foodOrder:offer", onFoodOffer);
    socketManager.off("errand:offer", onErrandOffer);
    socketManager.off("delivery:offer", onDeliveryOffer);
    socketManager.off("trip:offerTaken", onOfferTaken);
    socketManager.off("driver:notApproved", onNotApproved);
    socketManager.off("job:manuallyAssigned", onManualAssign);
    tracker?.stop().catch(() => {});
    if (mapHandle) mapHandle.destroy();
  };
}

/* Token.user is hydrated from the JWT and does not always carry `name` — a
   driver who signed up seconds ago has firstName on the register response and
   nothing else here. The avatar rendered as an empty purple ring for them,
   which looks like a failed image rather than a person. */
function initialOf(user) {
  const source = user?.name || user?.firstName || user?.email || "D";
  return String(source).trim().charAt(0).toUpperCase() || "D";
}

/* A full Karachi address does not fit on an offer card and is not what the
   decision turns on — the area name is. */
function shortPlace(label) {
  if (!label) return "";
  return String(label).split(",")[0].trim().slice(0, 22);
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
        <!-- Job type first, and in the same slot the parcel offer uses, so a
             driver reading two different offers a minute apart is reading the
             same shape twice rather than guessing which is which. -->
        <span class="nx-offer-kind">${icon("bike", 14)} ${isBid ? "Ride · rider's offer" : "Ride request"}</span>
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
          <!-- THIS SAID "3.2 km AWAY" AND MEANT SOMETHING ELSE.
               offer.distanceKm is the LENGTH OF THE TRIP, straight off the
               fare calculation — not the distance to the pickup. A driver
               declining a "far" job was often declining a long, well-paid one
               starting around the corner. Labelled for what it is.
               Vehicle type is dropped: in a bike-only pilot, telling a driver
               on a bike that the job wants a bike is a wasted line on the one
               screen where every line has to earn its place. -->
          <div>
            <span class="k">Trip length</span>
            <span class="v">${offer.distanceKm != null ? `${Number(offer.distanceKm).toFixed(1)} km` : "—"}</span>
          </div>
          <div>
            <span class="k">Pickup</span>
            <span class="v">${esc(shortPlace(offer.pickupLabel) || "Nearby")}</span>
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
    // Confirms the tap through a glove, before the network round trip.
    haptic.medium();
    clearInterval(timer);
    try {
      await api.acceptTrip(tripId);
      track("driver_offer_accepted", { kind: "TRIP", tripId });
      state.activeTripId = tripId;
      state.offerTripId = null;
      state.incomingTripOffer = null;
      navigate("/driver/progress");
    } catch (err) {
      // "Offer expired" is expected (another driver won the race). Anything
      // else here is a bug that costs a driver a job they'd already accepted.
      reportHandled(err, "acceptTrip");
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

/* ONE SHEET, FOUR STATES — not four screens.

   The sheet answers three questions and nothing else: where am I going, how
   long will it take, and what do I do next. Everything a rider does not need
   at this exact moment (earnings, incentives, wallet, notifications) stays off
   this screen, because the whole point of a map-first active job is that the
   map is the environment and the sheet is only the current action.

   `target` decides which end of the job the distance and ETA are measured to,
   which is what makes the metrics mean anything: before pickup it counts down
   to the passenger, after it counts down to the destination. */
const STEPS = [
  { key: "MATCHED", action: "arrive", state: "Going to pickup", target: "pickup", btn: "I've arrived" },
  { key: "ARRIVED", action: "start", state: "Arrived", target: null, btn: "Start trip" },
  { key: "IN_PROGRESS", action: "complete", state: "On trip", target: "dropoff", btn: "Complete trip" },
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

  /* WHOSE PICKUP IS state.pickup? THE CUSTOMER'S.

     This screen read state.pickup / state.dropoff — the booking draft the
     RIDER app writes into its own sessionStorage while choosing a
     destination. On a driver's phone those keys are empty, always. So the
     addresses rendered as the placeholder strings "Pickup point" and
     "Destination" on every real job, and the Navigate button and the ETA I
     added on top of them could never have worked for anyone: there were no
     coordinates there to navigate to.

     The trip itself carries all four, and api.getTrip already returns them. */
  function stop(which) {
    if (!trip) return null;
    return which === "dropoff"
      ? { lat: trip.dropoffLat, lng: trip.dropoffLng, label: trip.dropoffLabel }
      : { lat: trip.pickupLat, lng: trip.pickupLng, label: trip.pickupLabel };
  }

  function draw() {
    const step = STEPS[stepIndex];
    body.innerHTML = `
      <div class="nx-job-head">
        <span class="nx-job-state">${icon("bike", 12)} ${esc(step.state)}</span>
        <span class="ref-id">#${esc(tripId.slice(0, 8).toUpperCase())}</span>
      </div>

      <!-- Primary information: who, then where. Spacing does the hierarchy —
           no nested boxes, no second card inside the card. -->
      <p class="nx-job-primary">${esc(trip?.rider?.name || "Your passenger")}</p>
      <p class="nx-job-secondary">
        ${esc(shortPlace(stop("pickup")?.label) || "Pickup")}
        <span class="nx-job-arrow">${icon("arrow-forward", 12)}</span>
        ${esc(shortPlace(stop("dropoff")?.label) || "Destination")}
      </p>

      <div class="nx-job-metrics" id="jobMetrics">
        ${step.target ? `<span class="nx-job-metric" id="jobEta">—</span>
        <span class="nx-job-metric muted" id="jobDist">—</span>` :
        `<span class="nx-job-metric muted">Waiting for your passenger</span>`}
      </div>

      ${step.target ? `
        <button id="navBtn" class="btn btn-secondary btn-block mb-2">
          ${icon("navigation", 18)} Navigate
        </button>` : ""}
      <!-- Calling the passenger is how a rider actually finds a Karachi
           address. It's a full-width primary action, above Message, because
           it is the thing they reach for while stopped at the gate. -->
      ${trip?.rider?.phone ? `
        <a id="callRiderBtn" class="btn btn-primary btn-block mb-2" href="#">
          ${icon("phone", 18)} Call ${esc((trip.rider.name || "passenger").split(" ")[0])}
        </a>` : ""}
      <div class="flex gap-2 mb-3">
        <button id="chatBtn" class="btn btn-secondary" style="flex:1;">${icon("chat", 18)} Message<span id="chatUnread"></span></button>
        <button id="supportBtn" class="btn btn-secondary" style="flex:1;">${icon("bolt", 18)} Support</button>
      </div>
      <button id="actionBtn" class="btn btn-primary btn-block" style="height:56px;">${step.btn}</button>
    `;

    /* NAVIGATE WAS NOT ON THIS SCREEN AT ALL.
       A rider's single most-used control mid-job was missing, so the only way
       to actually get anywhere was to leave Nova Go, open Maps and type the
       address off a card — which is exactly when a driver stops looking at
       our app. A geo: URL hands off to whatever they already use (Google
       Maps, Waze, Apple Maps) rather than betting on one being installed. */
    body.querySelector("#navBtn")?.addEventListener("click", () => {
      const t = stop(step.target);
      if (!t?.lat) { toast("No coordinates for that stop yet", true); return; }
      haptic.medium();
      track("driver_opened_navigation", { tripId, target: step.target });
      window.open(`geo:${t.lat},${t.lng}?q=${t.lat},${t.lng}`, "_blank");
    });

    paintMetrics(step);

    body.querySelector("#callRiderBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      haptic.medium();
      track("driver_called_customer", { tripId });
      contactSheet({
        name: trip?.rider?.name || "Your passenger",
        phone: trip?.rider?.phone,
        role: "Your passenger",
      });
    });
    body.querySelector("#chatBtn").addEventListener("click", () => {
      state.chatContext = { contextType: "TRIP", contextId: tripId, otherPartyLabel: trip?.rider?.name || "Rider" };
      navigate("/chat-thread");
    });
    body.querySelector("#supportBtn").addEventListener("click", () => navigate("/support"));

    /* THE BADGE IS THE POINT.
       A notification arrives once and is gone; the badge is what is still
       there when the rider next glances at the screen. Polled rather than
       pushed so it is right after a reconnect, a backgrounded tab, or any of
       the other ways a socket quietly stops being the truth. */
    (async function pollUnread() {
      if (destroyed) return;
      try {
        const { count } = await api.chatUnreadCount("TRIP", tripId);
        const el = body.querySelector("#chatUnread");
        if (el) el.outerHTML = count > 0
          ? `<span id="chatUnread" class="nx-unread">${count > 9 ? "9+" : count}</span>`
          : `<span id="chatUnread"></span>`;
      } catch { /* transient */ }
      if (!destroyed) setTimeout(pollUnread, 10000);
    })();

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
    haptic.emergency();
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

  /* Distance and ETA to whichever end of the job is next, recomputed as the
     driver actually moves. A number that never changes is worse than no
     number: it teaches the rider to ignore the one place we tell them how
     they're doing. */
  async function paintMetrics(step) {
    if (!step?.target) return;
    const to = stop(step.target);
    if (!to?.lat) return;
    try {
      const from = await getCurrentCoords();
      if (destroyed) return;
      const etaEl = root.querySelector("#jobEta");
      const distEl = root.querySelector("#jobDist");
      if (!etaEl || !distEl) return;
      const route = await getRoute(from, to).catch(() => null);
      if (destroyed) return;
      const km = route?.km ?? straightLineKm(from, to);
      // No route host? Fall back to straight-line at a Karachi bike's real
      // average, and never dress the estimate up as a routed one.
      const mins = route?.minutes ?? Math.max(1, Math.round((km / 18) * 60));
      etaEl.textContent = formatEta(mins);
      distEl.textContent = `${km.toFixed(1)} km`;
    } catch { /* metrics are a nicety; the job works without them */ }
  }

  draw();

  return () => {
    destroyed = true;
    liveTracker?.stop?.().catch?.(() => {});
    if (mapHandle) mapHandle.destroy();
  };
}
