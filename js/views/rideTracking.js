// Nova Go Rides — live ride tracking. Map is the screen; a docked sheet
// carries status, the driver's identity, and the actions that matter mid-ride
// (message, SOS, share, cancel).
//
// Safety is real here, not decorative: SOS places an actual phone call to
// emergency services AND files a durable Incident the ops dashboard sees.
import { api } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { swapText, countTo } from "../motion.js";
import { toast, trustCard, dockSheet, esc, confettiBurst, contactSheet } from "../ui.js";
import { t } from "../i18n.js";
import { navigate } from "../router.js";
import { socketManager } from "../socket.js";
import { createMap } from "../map.js";
import { getRoute, straightLineKm, formatEta } from "../routing.js";
import { track } from "../analytics.js";
import { renderTripStatus } from "../tripCopy.js";
import { haptic } from "../haptics.js";
import { reportHandled } from "../errors.js";

// Badge labels stay English — a status chip is scanned, not read, and mixing
// scripts in a 2-word badge is harder to parse, not friendlier. The warm
// Roman Urdu lives in the status BLOCK below it (see js/tripCopy.js), which is
// the part people actually read while they're waiting.
const STATUS = {
  REQUESTED: { label: "Finding a driver", copy: "Matching you with a driver nearby..." },
  MATCHING: { label: "Finding a driver", copy: "Matching you with a driver nearby..." },
  MATCHED: { label: "Driver on the way", copy: "Your driver is heading to your pickup" },
  ARRIVED: { label: "Driver arrived", copy: "Your driver is waiting at the pickup point" },
  IN_PROGRESS: { label: "On the way", copy: "Enjoy your ride" },
  COMPLETED: { label: "Completed", copy: "You've arrived" },
  CANCELLED: { label: "Cancelled", copy: "This trip was cancelled" },
};

/** Statuses worth a vibration — the ones a customer is waiting on. */
const HAPTIC_ON = { MATCHED: "success", ARRIVED: "success", COMPLETED: "success", CANCELLED: "warning" };

// Pakistan emergency services. tel: works on real devices; on desktop the
// browser will simply ignore it, which is why we ALSO file the incident.
const EMERGENCY_NUMBER = "15";

export function renderRideTracking(root) {
  const tripId = state.activeTripId;
  if (!tripId) { toast("No active trip", true); navigate("/home"); return; }

  root.innerHTML = `
    <div class="map-screen">
      <div class="nx-map" id="mapEl"></div>
      <button id="backBtn" class="map-fab" style="top:calc(14px + var(--safe-top)); left:14px;">${icon("arrow-back", 20)}</button>
      <button id="sosBtn" class="map-fab danger" style="top:calc(14px + var(--safe-top)); right:14px;">${icon("sos", 20)}</button>
    </div>
  `;

  const screen = root.querySelector(".map-screen");
  const sheet = dockSheet(screen);
  root.querySelector("#backBtn").addEventListener("click", () => navigate("/home"));

  let mapHandle = null;
  let destroyed = false;
  let trip = null;
  let currentStatus = "REQUESTED";

  /* Which safety items the customer has ticked, for THIS trip only.
     Deliberately not persisted: it is a prompt to do something in the next
     few seconds, not a preference, and a remembered tick would show the
     next ride's checklist already complete. */
  const safetyDone = new Set();

  /* Null until the backend says ops has picked this up. Not persisted: it
     describes what is happening right now, and a remembered banner on the
     next ride would be a lie. */
  let opsState = null;

  // ---------- Sheet rendering ----------
  function drawSheet() {
    const s = STATUS[currentStatus] || STATUS.REQUESTED;
    const matched = ["MATCHED", "ARRIVED", "IN_PROGRESS"].includes(currentStatus);
    const cancellable = ["REQUESTED", "MATCHING", "MATCHED"].includes(currentStatus);

    /* THIS SHEET REDRAWS EVERY SIX SECONDS.
       The poll rebuilds the node whether or not anything changed, so an
       entrance animation applied unconditionally would replay forever and
       turn a status line into a blinking sign. These two flags are what
       separate "the ETA ticked" from "you now have a rider" — only the second
       gets motion, and only the first time it is true. */
    const statusChanged = currentStatus !== lastDrawnStatus;
    lastDrawnStatus = currentStatus;
    const driverJustFound = matched && !!trip?.driver && !driverRevealed;
    if (driverJustFound) driverRevealed = true;

    const node = sheet.step(`
      <div class="flex justify-between items-start mb-1">
        <div>
          <span class="badge ${matched ? "badge-accent" : "badge-warning"}${statusChanged ? " nx-swap-in" : ""}">${esc(s.label)}</span>
          <p class="text-lg font-bold mt-2${statusChanged ? " nx-swap-in" : ""}">${esc(s.copy)}</p>
          ${liveEtaMinutes != null && ["MATCHED", "IN_PROGRESS"].includes(currentStatus) ? `
            <p class="nx-track-eta">
              <span class="nx-track-eta-num nx-count">${esc(formatEta(liveEtaMinutes))}</span>
              <span class="nx-track-eta-label">${currentStatus === "IN_PROGRESS" ? "to your destination" : "away from you"}</span>
            </p>` : ""}
        </div>
        <span class="ref-id">#${esc((tripId || "").slice(0, 8).toUpperCase())}</span>
      </div>

      ${matched && trip?.driver ? `
        <div class="${driverJustFound ? "nx-found" : ""}" style="border-top:1px solid var(--surface-border); margin-top:var(--sp-3);">
          ${trustCard({
            name: trip.driver.name,
            subtitle: trip.vehicleType ? `${String(trip.vehicleType).toLowerCase()} · arriving now` : "",
            rating: trip.driver.rating,
            plate: trip.driverProfile?.vehiclePlate,
            tripCount: trip.driverTripCount,
          })}
        </div>
        <!-- BEFORE YOU GET ON.
             Shown only once the rider is actually at the kerb, because that
             is the ten seconds when checking the plate is both possible and
             useful — earlier it is noise, later it is too late. Three items,
             all of which the customer can complete without leaving the
             screen, and the state is remembered per trip so it does not
             reset every socket update.

             The third item is the one that matters most and is the easiest
             to skip: telling somebody where you are. Bykea prompts for this
             and we were not prompting at all — the share button existed and
             sat unlabelled between two others. -->
        ${currentStatus === "ARRIVED" ? `
          <div class="mb-3">
            <p class="nx-sec-title mb-2">${esc(t("Before you get on"))}</p>
            <div class="nx-checklist" id="safetyList">
              <button class="nx-check-item${safetyDone.has("plate") ? " done" : ""}" data-check="plate">
                <span class="nx-check-box">${icon("check", 13)}</span>
                <span style="flex:1;">
                  <span class="nx-check-text">${esc(t("Check the number plate"))}</span>
                  ${trip?.driverProfile?.vehiclePlate
                    ? `<span class="nx-check-sub">It should read <strong>${esc(trip.driverProfile.vehiclePlate)}</strong></span>`
                    : `<span class="nx-check-sub">Make sure it matches the bike you're getting on</span>`}
                </span>
              </button>
              <button class="nx-check-item${safetyDone.has("name") ? " done" : ""}" data-check="name">
                <span class="nx-check-box">${icon("check", 13)}</span>
                <span style="flex:1;">
                  <span class="nx-check-text">Ask their name</span>
                  <span class="nx-check-sub">They should say ${esc((trip?.driver?.name || "your rider").split(" ")[0])}</span>
                </span>
              </button>
              <button class="nx-check-item${safetyDone.has("share") ? " done" : ""}" data-check="share">
                <span class="nx-check-box">${icon("check", 13)}</span>
                <span style="flex:1;">
                  <span class="nx-check-text">${esc(t("Share your trip"))}</span>
                  <span class="nx-check-sub">Send a live link to someone at home</span>
                </span>
              </button>
            </div>
          </div>` : ""}

        <!-- CALL IS THE PRIMARY ACTION, not one of three equal buttons.
             Karachi addresses are spoken, not written — "neeli building ke
             saamne", "gate ke paas". A rider in traffic will not read a chat
             thread, and the pickup that fails is the one where nobody could
             just ask. Message and Share stay, one rank down. -->
        ${trip?.driver?.phone ? `
          <a id="callBtn" class="btn btn-primary btn-block mb-2"
             href="#" id="callDriverBtn">
            ${icon("phone", 18)} Call ${esc((trip.driver.name || "your rider").split(" ")[0])}
          </a>` : ""}
        <!-- WHATSAPP IS NOT A NICE-TO-HAVE IN THIS MARKET, IT IS THE CHANNEL.
             Nobody coordinates a Karachi pickup in an in-app chat thread. They
             send a voice note or a location pin on WhatsApp, because typing a
             landmark in Roman Urdu on a moving bike is slower than saying it.
             The in-app thread stays — it is the only record ops can read when
             a trip is disputed — but it stops pretending to be the primary
             channel. The message is pre-filled with the trip's own pickup so
             the customer does not have to retype where they are standing. -->
        <div class="flex gap-2 mb-2">
          ${trip?.driver?.phone ? `
            <a id="waBtn" class="btn btn-secondary" style="flex:1;"
               href="${esc(whatsappLink(trip.driver.phone, state.pickup?.label))}"
               target="_blank" rel="noopener noreferrer">
              ${icon("chat", 18)} ${esc(t("WhatsApp"))}
            </a>` : `
            <button id="chatBtn" class="btn btn-secondary" style="flex:1;">${icon("chat", 18)} ${esc(t("Message"))}<span id="chatUnread"></span></button>`}
          <button id="shareBtn" class="btn btn-secondary" style="flex:1;">${icon("send", 18)} ${esc(t("Share ride"))}</button>
        </div>
        ${trip?.driver?.phone ? `
          <button id="chatBtn" class="btn btn-ghost btn-block mb-3" style="font-size:13px;">
            ${icon("chat", 15)} Or message in the app<span id="chatUnread"></span>
          </button>` : `<div class="mb-3"></div>`}
      ` : `
        <!-- MATCHING IS THE MOMENT PEOPLE ABANDON.
             A generic spinner here is the same feedback the app gives for
             loading a list, so it says nothing about whether anything is
             happening. The radar says "we are reaching outward", which is
             literally what the matcher is doing, and it gives the wait a
             shape. Compositor-only (transform + opacity) so it costs nothing
             on the budget Android hardware most of this market carries. -->
        <div class="nx-radar mt-3 mb-2">
          <span class="nx-radar-ring"></span>
          <span class="nx-radar-ring"></span>
          <span class="nx-radar-ring"></span>
          <span class="nx-radar-core">${icon("bike", 24)}</span>
        </div>
        <p class="text-center font-bold mb-1">${esc(t("Contacting drivers near you"))}</p>
        <p class="text-center text-secondary text-xs mb-3">Your fare is locked while we look.</p>
        ${opsState ? `
          <div class="nx-ops-watch ${esc(opsState.level)}">
            <span class="nx-ops-watch-dot"></span>
            <div style="flex:1;min-width:0;">
              <p class="nx-ops-watch-title">${esc(opsState.message)}</p>
              <p class="nx-ops-watch-sub">
                ${opsState.level === "escalated"
                  ? "Someone at the desk is calling riders directly. Your fare hasn't changed."
                  : "If nobody accepts shortly, a person takes over and places it by hand."}
              </p>
            </div>
          </div>` : ""}
      `}

      <div class="flex justify-between text-sm mb-3" style="padding-top:var(--sp-2); border-top:1px solid var(--surface-border);">
        <span class="text-secondary">${esc(state.pickup?.label || "Pickup")}</span>
        <span class="text-secondary">→ ${esc(state.dropoff?.label || "Drop-off")}</span>
      </div>

      <div class="flex items-center justify-between mb-3">
        <span class="text-xs text-muted">Pay cash to your driver</span>
        <button id="supportBtn" class="text-xs text-accent font-bold">Need help?</button>
      </div>

      ${cancellable ? `<button id="cancelBtn" class="btn btn-danger btn-block">Cancel trip</button>` : ""}
    `);

    node.querySelector("#callBtn")?.addEventListener("click", () => {
      haptic.medium();
      track("customer_called_driver", { tripId });
    });
    /* The badge is what is still there when the customer looks back at the
       screen; a notification arrives once and is gone. Polled so it survives a
       reconnect or a backgrounded tab. */
    (async function pollUnread() {
      if (destroyed) return;
      try {
        const { count } = await api.chatUnreadCount("TRIP", tripId);
        const el = node.querySelector("#chatUnread");
        if (el) el.outerHTML = count > 0
          ? `<span id="chatUnread" class="nx-unread">${count > 9 ? "9+" : count}</span>`
          : `<span id="chatUnread"></span>`;
      } catch { /* transient */ }
      if (!destroyed) setTimeout(pollUnread, 10000);
    })();

    node.querySelector("#chatBtn")?.addEventListener("click", () => {
      state.chatContext = { contextType: "TRIP", contextId: tripId, otherPartyLabel: trip?.driver?.name || "Your driver" };
      navigate("/chat-thread");
    });
    /* CONTEXTUAL HELP, NOT A FAQ.
       This used to open /support — a general help centre — while someone was
       mid-ride with a specific problem. Somebody whose rider is going the
       wrong way does not want a list of articles; they want the one action
       that fixes it, and every second spent finding it is a second they are
       still going the wrong way.
       The options below are the things that actually go wrong on a live trip,
       and each routes to something that does something. */
    node.querySelector("#supportBtn")?.addEventListener("click", () => openRideHelp());
    node.querySelector("#shareBtn")?.addEventListener("click", shareRide);
    /* A bare tel: link is inert on desktop and, on a phone, jumps into the
       dialer without ever showing the number or offering WhatsApp — which in
       Karachi is very often the one people actually use. */
    node.querySelector("#callDriverBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      contactSheet({
        name: trip?.driver?.name || "Your rider",
        phone: trip?.driver?.phone,
        role: trip?.driverProfile?.vehiclePlate ? `Nova Go rider · ${trip.driverProfile.vehiclePlate}` : "Nova Go rider",
      });
    });
    node.querySelector("#cancelBtn")?.addEventListener("click", () => askWhyThenCancel());

    node.querySelector("#safetyList")?.addEventListener("click", (e) => {
      const item = e.target.closest("[data-check]");
      if (!item) return;
      const key = item.dataset.check;
      haptic.light();
      // "Share" does the thing rather than just claiming it was done — a
      // checkbox that only records an intention is theatre.
      if (key === "share" && !safetyDone.has("share")) { shareRide(); }
      safetyDone.add(key);
      item.classList.add("done");
      track("safety_check", { item: key, tripId });
    });
  }

  /* WHY, not just whether.
     A bare cancel count tells you the rate moved and nothing about what to do.
     The two cases that most need separating look identical without this: a
     rider demanding more than the quoted fare, and a customer who mis-pinned
     their pickup. The first ends a rider relationship; the second is a bug in
     our GPS gate. Fixed options rather than a text box, because free text
     produces "cancel", "1" and nothing you can group by. */
  const CANCEL_REASONS = [
    ["DRIVER_ASKED_MORE", "Rider asked for more than the fare"],
    ["LONG_WAIT", "Waiting too long"],
    ["DRIVER_TOO_FAR", "Rider is too far away"],
    ["WRONG_PICKUP", "Pickup location is wrong"],
    ["CHANGED_MIND", "I changed my mind"],
    ["BOOKED_BY_MISTAKE", "Booked by mistake"],
  ];

  function askWhyThenCancel() {
    const sheet = document.createElement("div");
    sheet.className = "nx-reason-sheet";
    sheet.innerHTML = `
      <div class="nx-reason-card" role="dialog" aria-modal="true" aria-label="Why are you cancelling?">
        <div class="nx-sheet-grab"></div>
        <h3 class="nx-reason-title">Why are you cancelling?</h3>
        <p class="nx-reason-sub">It helps us fix what went wrong. No cancellation fee.</p>
        ${CANCEL_REASONS.map(
          ([code, label]) => `<button class="nx-reason-opt" data-reason="${code}">${label}</button>`,
        ).join("")}
        <button class="nx-reason-opt" data-reason="OTHER">Something else</button>
        <button class="nx-reason-back" data-reason="">Keep my trip</button>
      </div>`;
    document.body.appendChild(sheet);

    const close = () => sheet.remove();
    // Tapping the backdrop keeps the trip — the safer of the two outcomes.
    sheet.addEventListener("click", (e) => { if (e.target === sheet) close(); });

    sheet.querySelectorAll("[data-reason]").forEach((b) =>
      b.addEventListener("click", async () => {
        const reason = b.dataset.reason;
        if (!reason) return close();

        // One free-text follow-up, only where the detail changes what ops does.
        let note;
        if (reason === "DRIVER_ASKED_MORE" || reason === "OTHER") {
          note = window.prompt(
            reason === "DRIVER_ASKED_MORE"
              ? "How much did they ask for? This goes to the ops team."
              : "What happened?",
          ) || undefined;
        }

        sheet.querySelectorAll("button").forEach((x) => { x.disabled = true; });
        b.innerHTML = `<span class="spinner"></span>`;
        try {
          await api.cancelTrip(tripId, reason, note);
          haptic.warning();
          track("ride_cancelled", { tripId, status: currentStatus, reason });
          state.activeTripId = null;
          close();
          toast("Trip cancelled");
          navigate("/home");
        } catch (err) {
          reportHandled(err, "cancelTrip", { reason });
          close();
          toast(err.message || "Couldn't cancel", true);
        }
      }),
    );
  }

  async function shareRide() {
    try {
      const { shareToken } = await api.shareTrip(tripId);
      const url = `${location.origin}${location.pathname}#/shared/${shareToken}`;
      track("trip_shared", { tripId });
      // Native share sheet where available (real phones), clipboard otherwise.
      if (navigator.share) {
        await navigator.share({ title: "Track my Nova Go ride", text: "Follow my ride live:", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast("Tracking link copied — send it to anyone");
      }
    } catch (err) {
      if (err?.name !== "AbortError") toast(err.message || "Couldn't create a share link", true);
    }
  }

  /* ---------- In-ride help ---------- */

  function openRideHelp() {
    haptic.light();
    track("ride_help_opened", { tripId, status: currentStatus });
    const driverPhone = trip?.driver?.phone || null;

    const OPTIONS = [
      driverPhone && {
        key: "cant_find",
        icon: "phone",
        title: "I can't find my rider",
        sub: "Call them — it is almost always faster than messaging",
        run: () => { window.location.href = `tel:${driverPhone}`; },
      },
      {
        key: "wrong_route",
        icon: "map-pin",
        title: "We're going the wrong way",
        sub: "Share the live trip so someone can watch it with you",
        run: () => shareRide(),
      },
      {
        key: "fare",
        icon: "wallet",
        title: "A question about the fare",
        sub: "The fare is fixed and was locked when you booked",
        run: () => navigate("/explainer/fixed-fare"),
      },
      {
        key: "safety",
        icon: "sos",
        title: "I feel unsafe",
        sub: "Emergency call and alert the ops desk",
        // Routed to the SAME handler as the SOS button rather than a copy —
        // two code paths for an emergency is one too many.
        run: () => root.querySelector("#sosBtn")?.click(),
      },
      {
        key: "other",
        icon: "chat",
        title: "Something else",
        sub: "Message the support desk",
        run: () => navigate("/support"),
      },
    ].filter(Boolean);

    const sheet = document.createElement("div");
    sheet.className = "nx-help-sheet";
    sheet.innerHTML = `
      <div class="nx-help-panel" role="dialog" aria-modal="true" aria-label="Help with this ride">
        <div class="sheet-handle"></div>
        <p class="font-bold mb-1">What's wrong?</p>
        <p class="text-secondary text-xs mb-3">Your trip keeps running while you do this.</p>
        <div class="flex-col gap-2">
          ${OPTIONS.map((o) => `
            <button class="nx-help-item" data-help="${o.key}">
              <span class="list-row-icon">${icon(o.icon, 17)}</span>
              <span style="flex:1;min-width:0;">
                <span class="nx-check-text" style="display:block;">${esc(o.title)}</span>
                <span class="nx-check-sub" style="display:block;">${esc(o.sub)}</span>
              </span>
              ${icon("chevronRight", 16)}
            </button>`).join("")}
        </div>
        <button class="btn btn-ghost btn-block mt-3" data-help-close>Close</button>
      </div>`;
    document.body.appendChild(sheet);

    const close = () => sheet.remove();
    sheet.addEventListener("click", (e) => {
      // Backdrop tap closes. A modal you cannot dismiss during a live ride is
      // a trap, not a safety feature.
      if (e.target === sheet || e.target.hasAttribute("data-help-close")) { close(); return; }
      const btn = e.target.closest("[data-help]");
      if (!btn) return;
      const opt = OPTIONS.find((o) => o.key === btn.dataset.help);
      close();
      track("ride_help_chosen", { option: btn.dataset.help, tripId });
      opt?.run();
    });
  }

  // ---------- SOS ----------
  root.querySelector("#sosBtn").addEventListener("click", () => {
    // Deliberately the only place this pattern is used: someone who can't
    // look at their screen still needs to know the press registered.
    haptic.emergency();
    const overlay = document.createElement("div");
    overlay.className = "overlay open";
    overlay.style.zIndex = "1200";
    overlay.innerHTML = `
      <div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:100%;max-width:var(--max-w);
                  background:var(--bg);border-radius:var(--r-xl) var(--r-xl) 0 0;
                  padding:var(--sp-6) var(--sp-5) calc(var(--sp-6) + var(--safe-bottom));">
        <div class="sheet-handle"></div>
        <h2 class="text-lg mb-1" style="color:var(--error);">Emergency</h2>
        <p class="text-secondary text-sm mb-5">We'll alert Nova Go support with your live location straight away.</p>
        <button id="callEmergencyBtn" class="btn btn-danger btn-block mb-3">${icon("sos", 18)} Call ${EMERGENCY_NUMBER} now</button>
        <button id="alertOpsBtn" class="btn btn-secondary btn-block mb-3">Alert Nova Go support only</button>
        <button id="closeSosBtn" class="btn btn-ghost btn-block">Cancel</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector("#closeSosBtn").addEventListener("click", close);

    async function fileIncident(alsoCall) {
      // File first, then dial — the record must exist even if the call
      // takes over the UI immediately.
      try {
        const pos = await new Promise((resolve) => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { timeout: 3000 },
          );
        });
        await api.raiseIncident({
          type: "SOS",
          contextType: "TRIP",
          contextId: tripId,
          ...(pos || {}),
        });
        track("sos_pressed", { tripId });
        toast("Support alerted — help is being contacted");
      } catch {
        toast("Couldn't reach support — please call directly", true);
      }
      if (alsoCall) window.location.href = `tel:${EMERGENCY_NUMBER}`;
      close();
    }

    overlay.querySelector("#callEmergencyBtn").addEventListener("click", () => fileIncident(true));
    overlay.querySelector("#alertOpsBtn").addEventListener("click", () => fileIncident(false));
  });

  // ---------- Data + live updates ----------
  /* IDEMPOTENT, BECAUSE THIS NOW RUNS EVERY SIX SECONDS.

     The poll that keeps the screen honest called this unconditionally, and
     this redrew the sheet and re-fitted the map every time — so the drawer
     visibly flashed on a timer and the map jumped back to its default framing
     even while the customer was panning it. A backstop that makes the screen
     twitch is worse than the gap it closes.

     So: redraw only when something a person would notice has actually
     changed, and re-frame the map only once, when the route first arrives. */
  let lastSignature = null;
  let framedOnce = false;
  let lastDrawnStatus = null;
  let driverRevealed = false;

  /* WHICH LEG THE CAMERA IS FRAMED ON.
     framedOnce alone meant the map framed the first thing it saw and then
     never moved again. That was fine while the socket was delivering
     trip:started, because onStarted() re-frames by hand — but when the socket
     drops and the 6s poll is what reports IN_PROGRESS, the leg silently
     flipped from "rider coming to you" to "rider taking you there" and the
     camera stayed pointed at the pickup the customer had already left. */
  let framedLeg = null;

  function applyTrip(t) {
    trip = t;
    const signature = [
      t.status,
      t.driverId || "",
      t.fare ?? "",
      t.tipAmount ?? "",
      (t.driver && t.driver.name) || "",
    ].join("|");

    if (signature !== lastSignature) {
      lastSignature = signature;
      // setStatus handles the haptic-on-transition rule and calls drawSheet.
      setStatus(t.status);
    }

    if (mapHandle) {
      const p = { lat: t.pickupLat, lng: t.pickupLng };
      const d = { lat: t.dropoffLat, lng: t.dropoffLng };
      mapHandle.setPickup(p);
      mapHandle.setDropoff(d);
      /* Only draw the whole booking while nobody is coming yet. The moment a
         rider is attached, the live leg takes over — showing the piece of the
         journey that is actually happening is the entire difference between
         this and a static picture of a booking. */
      if (!t.driverLocation?.lat) {
        mapHandle.setRoute([p, d]);
        if (!framedOnce) { mapHandle.fit([p, d], [70, 300]); framedOnce = true; }
      }
      // The driver's own position, whenever the server knows it — this is
      // what the poll contributes when a socket ping goes missing.
      if (t.driverLocation?.lat != null) {
        mapHandle.setDriver(t.driverLocation);
        // The poll is also what recovers the map when socket pings go
        // missing — same reason it recovers the status.
        refreshLiveRoute(t.driverLocation);
        const leg = currentStatus === "IN_PROGRESS" ? "to-dropoff" : "to-pickup";
        if (!framedOnce || leg !== framedLeg) {
          mapHandle.frameLeg(t.driverLocation, legTarget());
          framedOnce = true;
          framedLeg = leg;
        }
      }
    }
  }

  api.getTrip(tripId).then((t) => { if (!destroyed) applyTrip(t); }).catch(() => drawSheet());

  // Async: the socket library is fetched on demand. Listeners registered
  // via socketManager.on() below are queued and attached on connect.
  //
  // POLLING FALLBACK. If socket.io can't load at all — blocked CDN, hostile
  // network, an ISP having a bad day — a tracking screen that never updates
  // is worse than useless: the customer sits watching a stationary dot while
  // their rider is actually two streets away. So we degrade to polling the
  // REST API instead. Slower, but it always works.
  let pollTimer = 0;

  /* THE SOCKET IS AN OPTIMISATION, NOT THE SOURCE OF TRUTH.

     This used to poll ONLY when the socket failed to connect. That treats a
     connected socket as a guarantee that every event will arrive, which it
     is not: a reconnect drops the room membership, a backgrounded tab on iOS
     suspends the connection, a server restart re-creates the namespace, and
     emitToUser simply finds nobody. Any one of those loses a single message
     — and losing one message left the customer on "Finding a driver" while
     their rider was already outside, with no way to recover short of killing
     the app.

     Observed exactly that: the driver accepted at 05:17:03 and the customer
     screen never moved.

     So the poll now runs ALWAYS, alongside the socket. The socket makes it
     feel instant; the poll makes it correct. applyTrip() is idempotent, so a
     poll arriving after the event it duplicates costs one comparison. */
  const POLL_MS = 6000;
  function startPolling(reason) {
    if (pollTimer) return;
    console.info(`[NovaGo] tracking poll every ${POLL_MS / 1000}s (${reason})`);
    pollTimer = setInterval(async () => {
      if (destroyed) return;
      try {
        const t = await api.getTrip(tripId);
        if (!destroyed) applyTrip(t);
      } catch { /* transient — the next tick retries */ }
    }, POLL_MS);
  }

  socketManager.connect().then((socket) => {
    if (destroyed) return;
    if (socket) socket.emit("trip:subscribe", { tripId });
    // Either way. With a socket this is the safety net that catches a missed
    // event; without one it is the only thing keeping the screen honest.
    startPolling(socket ? "backstop alongside the live socket" : "no live socket");
  });

  const setStatus = (s) => {
    // Only buzz on a real transition. Polling and socket events can both
    // deliver the same status twice, and a phone that vibrates every 8 seconds
    // is a phone that gets put face down.
    if (s !== currentStatus && HAPTIC_ON[s]) haptic[HAPTIC_ON[s]]();
    currentStatus = s;
    drawSheet();
  };
  const onMatched = async () => {
    track("ride_driver_matched", { tripId });
    try { const t = await api.getTrip(tripId); if (!destroyed) applyTrip(t); } catch { setStatus("MATCHED"); }
  };
  const onArrived = () => setStatus("ARRIVED");
  const onStarted = () => {
    track("ride_started", { tripId });
    setStatus("IN_PROGRESS");
    // The leg just flipped from "coming to get you" to "taking you there".
    // Force a re-route and re-frame rather than waiting for the throttle.
    lastRouteAt = 0;
    const d = trip?.driverLocation;
    if (d?.lat != null) {
      refreshLiveRoute(d);
      mapHandle?.frameLeg(d, legTarget());
      framedLeg = "to-dropoff";
    }
  };
  /* THE LIVE LEG.

     Bykea and Foodpanda both show you the same thing: not the whole booking,
     but the piece of it that is happening now — the rider's real road route
     to wherever they are headed next, shortening as they ride, with the
     camera framed on that leg and an ETA counting down.

     Before pickup the leg is driver -> you. Once you are on the bike it flips
     to driver -> destination. Drawing the static pickup-to-dropoff line for
     the whole trip, which is what this used to do, tells the customer nothing
     about where their rider actually is.

     Re-routing is throttled: a routing call per GPS ping would be a request
     every four seconds per trip. It refires when the rider has moved 250m or
     20s have passed, and interpolates smoothly in between. */
  let lastRouteAt = 0;
  let lastRouteFrom = null;
  let liveEtaMinutes = null;

  function legTarget() {
    if (!trip) return null;
    return currentStatus === "IN_PROGRESS"
      ? { lat: trip.dropoffLat, lng: trip.dropoffLng }
      : { lat: trip.pickupLat, lng: trip.pickupLng };
  }

  async function refreshLiveRoute(from) {
    const to = legTarget();
    if (!from || !to || destroyed) return;
    const now = Date.now();
    const movedKm = lastRouteFrom ? straightLineKm(lastRouteFrom, from) : Infinity;
    if (now - lastRouteAt < 20000 && movedKm < 0.25) return;
    lastRouteAt = now;
    lastRouteFrom = from;
    try {
      const route = await getRoute(from, to);
      if (destroyed || !mapHandle) return;
      // The road path the rider is actually taking, not a straight line.
      mapHandle.setRoute(route?.coordinates?.length ? route.coordinates : [from, to]);
      liveEtaMinutes = route?.minutes ?? null;
      drawSheet();
    } catch {
      if (!destroyed && mapHandle) mapHandle.setRoute([from, to]);
    }
  }

  const onLocation = (payload) => {
    if (!mapHandle || !payload?.lat) return;
    const at = { lat: payload.lat, lng: payload.lng };
    mapHandle.setDriver(at);      // glides, and points along its heading
    mapHandle.follow(at);         // camera only moves if they leave the frame
    refreshLiveRoute(at);
  };
  const onCompleted = () => {
    track("ride_completed", { tripId });
    // What the customer owes at the kerb is fare + tip, as one number.
    if (trip?.fare != null) state.lastFare = Number(trip.fare) + Number(trip.tipAmount || 0);
    setStatus("COMPLETED");
    confettiBurst(window.innerWidth / 2, window.innerHeight / 2);
    setTimeout(() => navigate("/rate"), 1200);
  };
  const onCancelled = () => {
    setStatus("CANCELLED");
    toast("This trip was cancelled");
    state.activeTripId = null;
    setTimeout(() => navigate("/home"), 1500);
  };

  /* THE OPS PROMISE, MADE VISIBLE.

     "A person is watching every ride" is the strongest thing Nova Go says,
     and until now the customer had no way to observe it — a ride nobody had
     matched looked exactly like a ride nobody was looking at. The backend
     escalates at 90 seconds and again at 3 minutes (see escalateIfStuck in
     trips.service.ts); these are the two events that reach the person
     waiting.

     This is deliberately not a spinner with nicer words. It names what is
     happening and who is doing it, because the thing that makes someone stop
     waiting is not the wait — it is the suspicion that nothing is happening. */
  const onOpsWatching = (payload) => {
    if (payload?.tripId && payload.tripId !== tripId) return;
    opsState = { level: "watching", message: payload?.message || "Nova Go Ops is watching this ride." };
    track("ops_watching_shown", { tripId });
    drawSheet();
  };
  const onOpsEscalated = (payload) => {
    if (payload?.tripId && payload.tripId !== tripId) return;
    opsState = { level: "escalated", message: payload?.message || "Nova Go Ops is placing this ride by hand." };
    haptic.light();
    track("ops_escalated_shown", { tripId });
    drawSheet();
  };
  socketManager.on("trip:opsWatching", onOpsWatching);
  socketManager.on("trip:opsEscalated", onOpsEscalated);
  socketManager.on("trip:matched", onMatched);
  socketManager.on("trip:driverArrived", onArrived);
  socketManager.on("trip:started", onStarted);
  socketManager.on("trip:driverLocation", onLocation);
  socketManager.on("trip:completed", onCompleted);
  socketManager.on("trip:cancelled", onCancelled);

  (async () => {
    try {
      mapHandle = await createMap(root.querySelector("#mapEl"), { zoom: 14 });
      if (destroyed) { mapHandle.destroy(); return; }
      if (trip) applyTrip(trip);
    } catch {
      const el = root.querySelector("#mapEl");
      if (el) el.innerHTML = `<div class="flex-col items-center justify-center" style="height:100%;color:var(--text-muted);"><p class="text-sm">Map unavailable</p></div>`;
    }
  })();

  return () => {
    destroyed = true;
    socket?.emit("trip:unsubscribe", { tripId });
    clearInterval(pollTimer);
    socketManager.off("trip:opsWatching", onOpsWatching);
    socketManager.off("trip:opsEscalated", onOpsEscalated);
    socketManager.off("trip:matched", onMatched);
    socketManager.off("trip:driverArrived", onArrived);
    socketManager.off("trip:started", onStarted);
    socketManager.off("trip:driverLocation", onLocation);
    socketManager.off("trip:completed", onCompleted);
    socketManager.off("trip:cancelled", onCancelled);
    if (mapHandle) mapHandle.destroy();
  };
}

/** PUBLIC live view for a shared link — no account, no auth. This is the
 * screen a rider's family opens. */
export function renderSharedTrip(root) {
  const shareToken = (location.hash.split("/shared/")[1] || "").trim();
  root.innerHTML = `
    <div class="map-screen">
      <div class="nx-map" id="mapEl"></div>
    </div>
  `;
  const screen = root.querySelector(".map-screen");
  const sheet = dockSheet(screen);
  let mapHandle = null;
  let destroyed = false;
  let poll = null;

  if (!shareToken) {
    sheet.step(`<div class="empty-state"><p class="text-sm">This tracking link isn't valid.</p></div>`);
    return;
  }

  function draw(t) {
    const s = STATUS[t.status] || STATUS.REQUESTED;
    sheet.step(`
      <span class="badge ${["MATCHED","IN_PROGRESS"].includes(t.status) ? "badge-accent" : "badge-warning"}">${esc(s.label)}</span>
      <p class="text-lg font-bold mt-2 mb-1">${esc(t.riderFirstName || "Your contact")}'s ride</p>
      <p class="text-secondary text-sm mb-4">${esc(s.copy)}</p>
      ${t.driverFirstName ? `
        <div style="border-top:1px solid var(--surface-border);">
          ${trustCard({ name: t.driverFirstName, subtitle: String(t.vehicleType || "").toLowerCase(), rating: t.driverRating, compact: true })}
        </div>` : ""}
      <p class="text-xs text-muted text-center mt-3">Shared live from Nova Go · this link updates automatically</p>
    `);

    if (mapHandle) {
      mapHandle.setPickup(t.pickup);
      mapHandle.setDropoff(t.dropoff);
      mapHandle.setRoute([t.pickup, t.dropoff]);
      if (t.driverLocation) mapHandle.setDriver(t.driverLocation);
      mapHandle.fit([t.pickup, t.dropoff, t.driverLocation].filter(Boolean), [60, 280]);
    }
  }

  async function load() {
    try {
      const t = await api.getSharedTrip(shareToken);
      if (destroyed) return;
      draw(t);
      if (["COMPLETED", "CANCELLED"].includes(t.status) && poll) { clearInterval(poll); poll = null; }
    } catch (err) {
      if (!destroyed) sheet.step(`<div class="empty-state"><p class="text-sm">${esc(err.message || "This link isn't valid anymore.")}</p></div>`);
      if (poll) { clearInterval(poll); poll = null; }
    }
  }

  (async () => {
    try {
      mapHandle = await createMap(root.querySelector("#mapEl"), { zoom: 14 });
      if (destroyed) { mapHandle.destroy(); return; }
    } catch { /* map optional */ }
    load();
    // No socket for anonymous viewers — polling is simpler and avoids
    // handing an unauthenticated client a socket session.
    poll = setInterval(load, 8000);
  })();

  return () => {
    destroyed = true;
    if (poll) clearInterval(poll);
    if (mapHandle) mapHandle.destroy();
  };
}


/* ------------------------------------------------------------- whatsapp ---

   wa.me needs digits only, with the country code and no leading +, spaces,
   dashes or brackets. Numbers reach us in several shapes (E.164 from the
   backend, 03xx local from a form), so normalise rather than trusting.

   The prefilled text is the one thing that makes this better than the user
   opening WhatsApp themselves: it already says which ride this is and where
   the customer is standing, which is exactly the message they would
   otherwise type badly while looking for a bike. */
export function whatsappLink(phone, pickupLabel) {
  let digits = String(phone || "").replace(/\D/g, "");
  // 03001234567 -> 923001234567. Pakistani mobile numbers are 11 digits
  // locally and always start 0; the country code replaces that leading zero.
  if (digits.startsWith("0")) digits = "92" + digits.slice(1);
  const where = String(pickupLabel || "").trim();
  const text = where
    ? `Assalam o Alaikum, main Nova Go ride ke liye ${where} par hoon.`
    : "Assalam o Alaikum, main Nova Go ride ke liye wait kar raha hoon.";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
