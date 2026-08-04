// Nova X Rides — live ride tracking. Map is the screen; a docked sheet
// carries status, the driver's identity, and the actions that matter mid-ride
// (message, SOS, share, cancel).
//
// Safety is real here, not decorative: SOS places an actual phone call to
// emergency services AND files a durable Incident the ops dashboard sees.
import { api } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, trustCard, dockSheet, esc, confettiBurst } from "../ui.js";
import { navigate } from "../router.js";
import { socketManager } from "../socket.js";
import { createMap } from "../map.js";
import { track } from "../analytics.js";

const STATUS = {
  REQUESTED: { label: "Finding a driver", copy: "Matching you with a driver nearby..." },
  MATCHING: { label: "Finding a driver", copy: "Matching you with a driver nearby..." },
  MATCHED: { label: "Driver on the way", copy: "Your driver is heading to your pickup" },
  ARRIVED: { label: "Driver arrived", copy: "Your driver is waiting at the pickup point" },
  IN_PROGRESS: { label: "On the way", copy: "Enjoy your ride" },
  COMPLETED: { label: "Completed", copy: "You've arrived" },
  CANCELLED: { label: "Cancelled", copy: "This trip was cancelled" },
};

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

  // ---------- Sheet rendering ----------
  function drawSheet() {
    const s = STATUS[currentStatus] || STATUS.REQUESTED;
    const matched = ["MATCHED", "ARRIVED", "IN_PROGRESS"].includes(currentStatus);
    const cancellable = ["REQUESTED", "MATCHING", "MATCHED"].includes(currentStatus);

    const node = sheet.step(`
      <div class="flex justify-between items-start mb-1">
        <div>
          <span class="badge ${matched ? "badge-accent" : "badge-warning"}">${esc(s.label)}</span>
          <p class="text-lg font-bold mt-2">${esc(s.copy)}</p>
        </div>
        <span class="ref-id">#${esc((tripId || "").slice(0, 8).toUpperCase())}</span>
      </div>

      ${matched && trip?.driver ? `
        <div style="border-top:1px solid var(--surface-border); margin-top:var(--sp-3);">
          ${trustCard({
            name: trip.driver.name,
            subtitle: trip.vehicleType ? String(trip.vehicleType).toLowerCase() : "",
            rating: trip.driver.rating,
            plate: trip.driverProfile?.vehiclePlate,
          })}
        </div>
        <div class="flex gap-2 mb-3">
          <button id="chatBtn" class="btn btn-secondary" style="flex:1;">${icon("chat", 18)} Message</button>
          <button id="shareBtn" class="btn btn-secondary" style="flex:1;">${icon("send", 18)} Share ride</button>
        </div>
      ` : `
        <div class="flex items-center gap-3 mb-3 mt-3">
          <span class="spinner text-accent"></span>
          <p class="text-secondary text-sm">Contacting drivers near you</p>
        </div>
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

    node.querySelector("#chatBtn")?.addEventListener("click", () => {
      state.chatContext = { contextType: "TRIP", contextId: tripId, otherPartyLabel: trip?.driver?.name || "Your driver" };
      navigate("/chat-thread");
    });
    node.querySelector("#supportBtn")?.addEventListener("click", () => navigate("/support"));
    node.querySelector("#shareBtn")?.addEventListener("click", shareRide);
    node.querySelector("#cancelBtn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await api.cancelTrip(tripId);
        track("ride_cancelled", { tripId, status: currentStatus });
        state.activeTripId = null;
        toast("Trip cancelled");
        navigate("/home");
      } catch (err) {
        toast(err.message || "Couldn't cancel", true);
        btn.disabled = false;
      }
    });
  }

  async function shareRide() {
    try {
      const { shareToken } = await api.shareTrip(tripId);
      const url = `${location.origin}${location.pathname}#/shared/${shareToken}`;
      track("trip_shared", { tripId });
      // Native share sheet where available (real phones), clipboard otherwise.
      if (navigator.share) {
        await navigator.share({ title: "Track my Nova X ride", text: "Follow my ride live:", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast("Tracking link copied — send it to anyone");
      }
    } catch (err) {
      if (err?.name !== "AbortError") toast(err.message || "Couldn't create a share link", true);
    }
  }

  // ---------- SOS ----------
  root.querySelector("#sosBtn").addEventListener("click", () => {
    const overlay = document.createElement("div");
    overlay.className = "overlay open";
    overlay.style.zIndex = "1200";
    overlay.innerHTML = `
      <div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:100%;max-width:var(--max-w);
                  background:var(--bg);border-radius:var(--r-xl) var(--r-xl) 0 0;
                  padding:var(--sp-6) var(--sp-5) calc(var(--sp-6) + var(--safe-bottom));">
        <div class="sheet-handle"></div>
        <h2 class="text-lg mb-1" style="color:var(--error);">Emergency</h2>
        <p class="text-secondary text-sm mb-5">We'll alert Nova X support with your live location straight away.</p>
        <button id="callEmergencyBtn" class="btn btn-danger btn-block mb-3">${icon("sos", 18)} Call ${EMERGENCY_NUMBER} now</button>
        <button id="alertOpsBtn" class="btn btn-secondary btn-block mb-3">Alert Nova X support only</button>
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
  function applyTrip(t) {
    trip = t;
    currentStatus = t.status;
    drawSheet();
    if (mapHandle) {
      const p = { lat: t.pickupLat, lng: t.pickupLng };
      const d = { lat: t.dropoffLat, lng: t.dropoffLng };
      mapHandle.setPickup(p);
      mapHandle.setDropoff(d);
      mapHandle.setRoute([p, d]);
      mapHandle.fit([p, d], [70, 300]);
    }
  }

  api.getTrip(tripId).then((t) => { if (!destroyed) applyTrip(t); }).catch(() => drawSheet());

  const socket = socketManager.connect();
  socket?.emit("trip:subscribe", { tripId });

  const setStatus = (s) => { currentStatus = s; drawSheet(); };
  const onMatched = async () => {
    track("ride_driver_matched", { tripId });
    try { const t = await api.getTrip(tripId); if (!destroyed) applyTrip(t); } catch { setStatus("MATCHED"); }
  };
  const onArrived = () => setStatus("ARRIVED");
  const onStarted = () => { track("ride_started", { tripId }); setStatus("IN_PROGRESS"); };
  const onLocation = (payload) => {
    if (mapHandle && payload?.lat) mapHandle.setDriver({ lat: payload.lat, lng: payload.lng });
  };
  const onCompleted = () => {
    track("ride_completed", { tripId });
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
          ${trustCard({ name: t.driverFirstName, subtitle: String(t.vehicleType || "").toLowerCase(), rating: t.driverRating })}
        </div>` : ""}
      <p class="text-xs text-muted text-center mt-3">Shared live from Nova X · this link updates automatically</p>
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
