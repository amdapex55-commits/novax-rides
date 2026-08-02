// Nova X Rides — driver home (online/offline + live location), incoming
// trip offer, trip-in-progress state machine.
import { api, Token } from "./api.js";
import { state } from "./state.js";
import { icon } from "./icons.js";
import { toast } from "./ui.js";
import { navigate } from "./router.js";
import { socketManager } from "./socket.js";

export function renderDriverHome(root) {
  const user = Token.user;
  let online = state.isDriverOnline;
  let watchId = null;

  root.innerHTML = `
    <div class="page pb-0">
      <div class="flex justify-between items-center mb-6">
        <div>
          <p class="text-secondary text-sm">Welcome back,</p>
          <h1 class="text-xl">${(user?.name || "Driver").split(" ")[0]}</h1>
        </div>
        <div class="avatar" style="width:44px;height:44px;">${icon("person", 22)}</div>
      </div>

      <button id="onlineToggle" class="glow-card mb-6 w-full flex items-center justify-between" style="padding:20px; cursor:pointer;">
        <div class="flex items-center gap-3">
          <div class="pulse-dot" id="statusDot" style="background:${online ? "var(--success)" : "var(--text-muted)"}; ${online ? "" : "animation:none;"}"></div>
          <p class="font-bold" id="onlineLabel">${online ? "You're Online" : "You're Offline"}</p>
        </div>
        ${icon("bolt", 20)}
      </button>

      <div class="flex gap-3 mb-6">
        <div class="card text-center" style="flex:1;">
          <p class="text-secondary text-xs mb-1">Today</p>
          <p class="font-bold text-lg">Rs. 0</p>
        </div>
        <div class="card text-center" style="flex:1;">
          <p class="text-secondary text-xs mb-1">Trips</p>
          <p class="font-bold text-lg">0</p>
        </div>
        <div class="card text-center" style="flex:1;">
          <p class="text-secondary text-xs mb-1">Rating</p>
          <p class="font-bold text-lg">${user?.rating ?? "5.0"}</p>
        </div>
      </div>

      <div class="radar-field" style="height:180px; border-radius:var(--r-lg); display:flex; align-items:center; justify-content:center;">
        ${online ? '<div class="radar-sweep"></div>' : ""}
        <p class="text-xs text-muted" style="position:relative; z-index:1;">${online ? "Listening for ride requests..." : "Go online to start receiving trips"}</p>
      </div>
    </div>
  `;

  const toggle = root.querySelector("#onlineToggle");
  const dot = root.querySelector("#statusDot");
  const label = root.querySelector("#onlineLabel");

  function goOnline() {
    const socket = socketManager.connect();
    if (!socket) { toast("Session expired — log in again", true); navigate("/driver/phone"); return; }
    socketManager.on("trip:offer", onOffer);
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => socketManager.emit("driver:location", { lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.warn("[NovaX] geolocation error:", err.message),
        { enableHighAccuracy: false, maximumAge: 10000, timeout: 10000 }
      );
    }
    online = true;
    state.isDriverOnline = true;
    dot.style.background = "var(--success)";
    dot.style.animation = "";
    label.textContent = "You're Online";
  }
  function goOffline() {
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    socketManager.off("trip:offer", onOffer);
    online = false;
    state.isDriverOnline = false;
    dot.style.background = "var(--text-muted)";
    dot.style.animation = "none";
    label.textContent = "You're Offline";
  }
  function onOffer(payload) {
    state.offerTripId = payload.tripId;
    navigate("/driver/offer");
  }

  toggle.addEventListener("click", () => (online ? goOffline() : goOnline()));
  if (online) goOnline(); // resume listening if we navigated back while already online

  return () => {
    socketManager.off("trip:offer", onOffer);
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  };
}

export function renderIncomingOffer(root) {
  const tripId = state.offerTripId;
  let seconds = 15;
  root.innerHTML = `
    <div class="page flex-col items-center text-center" style="height:100dvh; justify-content:center;">
      <span class="badge badge-accent mb-4">New Ride Request</span>
      <h1 style="font-size:48px;" id="countdown">${seconds}</h1>
      <p class="text-secondary mb-8">seconds to respond</p>
      <div class="card w-full mb-8">
        <div class="flex items-center gap-3 mb-3">
          <div class="list-row-icon">${icon("map-pin", 18)}</div>
          <p class="text-sm text-secondary">Pickup nearby</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="list-row-icon">${icon("bolt", 18)}</div>
          <p class="text-sm text-secondary">Estimated fare shown after accept</p>
        </div>
      </div>
      <button id="acceptBtn" class="btn btn-primary btn-block mb-3">${icon("check", 18)} Accept</button>
      <button id="declineBtn" class="btn btn-secondary btn-block">Decline</button>
    </div>
  `;
  if (!tripId) { navigate("/driver/home"); return; }

  const countdownEl = root.querySelector("#countdown");
  const timer = setInterval(() => {
    seconds--;
    countdownEl.textContent = seconds;
    if (seconds <= 0) { clearInterval(timer); navigate("/driver/home"); }
  }, 1000);

  root.querySelector("#acceptBtn").addEventListener("click", async () => {
    clearInterval(timer);
    try {
      await api.acceptTrip(tripId);
      state.activeTripId = tripId;
      state.offerTripId = null;
      navigate("/driver/progress");
    } catch (err) {
      toast(err.message || "Offer expired", true);
      navigate("/driver/home");
    }
  });
  root.querySelector("#declineBtn").addEventListener("click", async () => {
    clearInterval(timer);
    try { await api.declineTrip(tripId); } catch (e) { console.warn(e); }
    state.offerTripId = null;
    navigate("/driver/home");
  });

  return () => clearInterval(timer);
}

const STEPS = [
  { key: "MATCHED", action: "arrive", label: "Arrived at pickup", btn: "I've Arrived" },
  { key: "ARRIVED", action: "start", label: "Start trip", btn: "Start Trip" },
  { key: "IN_PROGRESS", action: "complete", label: "Complete trip", btn: "Complete Trip" },
];

export function renderTripProgress(root) {
  const tripId = state.activeTripId;
  let stepIndex = 0;

  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-6">Trip in Progress</h1>
      <div class="radar-field" style="height:220px; border-radius:var(--r-lg); margin-bottom:24px; display:flex; align-items:center; justify-content:center;">
        <div class="radar-sweep"></div>
        <div class="pulse-dot" style="position:relative; z-index:1;"></div>
      </div>
      <div class="card mb-6">
        <p class="text-secondary text-sm mb-1">${state.pickup?.label || "Pickup"}</p>
        <p class="text-secondary text-sm">${state.dropoff?.label || "Drop-off"}</p>
      </div>
      <button id="tripActionBtn" class="btn btn-primary btn-block">${STEPS[0].btn}</button>
    </div>
  `;
  if (!tripId) { navigate("/driver/home"); return; }

  const btn = root.querySelector("#tripActionBtn");
  btn.addEventListener("click", async () => {
    const step = STEPS[stepIndex];
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      if (step.action === "arrive") await api.arriveTrip(tripId);
      else if (step.action === "start") await api.startTrip(tripId);
      else await api.completeTrip(tripId);

      stepIndex++;
      if (stepIndex >= STEPS.length) {
        toast("Trip completed!");
        state.activeTripId = null;
        navigate("/driver/earnings");
        return;
      }
      btn.disabled = false;
      btn.textContent = STEPS[stepIndex].btn;
    } catch (err) {
      toast(err.message || "Action failed", true);
      btn.disabled = false;
      btn.textContent = STEPS[stepIndex].btn;
    }
  });
}
