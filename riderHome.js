// Nova X Rides — rider home, set locations, fare/vehicle selection.
import { api, Token } from "./api.js";
import { state } from "./state.js";
import { icon } from "./icons.js";
import { toast } from "./ui.js";
import { navigate } from "./router.js";

export function renderHome(root) {
  const user = Token.user;
  const isGuest = !user;
  root.innerHTML = `
    <div class="page pb-0">
      <div class="flex justify-between items-center mb-6">
        <div>
          <p class="text-secondary text-sm">Good ${timeOfDay()},</p>
          <h1 class="text-xl">${isGuest ? "there" : (user.name || "Rider").split(" ")[0]}</h1>
        </div>
        <div class="avatar" style="width:44px;height:44px;">${icon("person", 22)}</div>
      </div>

      ${isGuest ? `
      <div class="card mb-4 flex items-center gap-3" id="signInCard" style="cursor:pointer;">
        <div class="list-row-icon" style="background:rgba(124,92,255,0.14); color:var(--accent-2);">${icon("bolt", 18)}</div>
        <div style="flex:1;"><p class="font-bold text-sm">Sign in</p><p class="text-secondary text-xs">Just a phone number + code — only needed to book</p></div>
        ${icon("chevronRight", 18)}
      </div>` : ""}

      <div class="glow-card mb-4" id="whereToCard" style="cursor:pointer;">
        <div class="flex items-center gap-3">
          <div class="list-row-icon" style="background:rgba(0,229,255,0.12); color:var(--accent);">${icon("map-pin", 20)}</div>
          <div class="flex-col" style="flex:1;">
            <p class="font-bold">Where to?</p>
            <p class="text-secondary text-sm">Book a ride in seconds</p>
          </div>
          ${icon("arrow-forward", 20)}
        </div>
      </div>

      <div class="flex gap-3 mb-6">
        <button id="rideBtn" class="option-card selected" style="flex:1; flex-direction:column; align-items:flex-start; gap:8px;">
          ${icon("car", 22)}
          <span class="font-bold text-sm">Ride</span>
        </button>
        <button id="parcelBtn" class="option-card" style="flex:1; flex-direction:column; align-items:flex-start; gap:8px;">
          ${icon("package", 22)}
          <span class="font-bold text-sm">Send a Parcel</span>
        </button>
      </div>

      <div class="flex justify-between items-center mb-3">
        <h3 class="text-sm text-secondary" style="text-transform:uppercase; letter-spacing:0.04em;">Quick Links</h3>
      </div>
      <div class="flex-col gap-2 mb-6">
        <div class="list-row stagger-item" data-nav="/loyalty" style="cursor:pointer;">
          <div class="list-row-icon">${icon("star", 18)}</div>
          <div style="flex:1;"><p class="font-bold text-sm">Loyalty & Rewards</p></div>
          ${icon("chevronRight", 18)}
        </div>
        <div class="list-row stagger-item" data-nav="/refer" style="cursor:pointer; animation-delay:60ms;">
          <div class="list-row-icon">${icon("gift", 18)}</div>
          <div style="flex:1;"><p class="font-bold text-sm">Refer & Earn</p></div>
          ${icon("chevronRight", 18)}
        </div>
        <div class="list-row stagger-item" data-nav="/business" style="cursor:pointer; animation-delay:120ms;">
          <div class="list-row-icon">${icon("users", 18)}</div>
          <div style="flex:1;"><p class="font-bold text-sm">Nova X for Business</p></div>
          ${icon("chevronRight", 18)}
        </div>
        ${isGuest ? `
        <div class="list-row stagger-item" data-nav-driver="1" style="cursor:pointer; animation-delay:180ms;">
          <div class="list-row-icon">${icon("car", 18)}</div>
          <div style="flex:1;"><p class="font-bold text-sm">Drive with Nova X</p></div>
          ${icon("chevronRight", 18)}
        </div>` : ""}
      </div>
    </div>
  `;

  root.querySelector("#whereToCard").addEventListener("click", () => navigate("/set-locations"));
  root.querySelector("#signInCard")?.addEventListener("click", () => { state.postAuthRedirect = null; navigate("/phone"); });
  root.querySelector("[data-nav-driver]")?.addEventListener("click", () => navigate("/driver/phone"));
  const rideBtn = root.querySelector("#rideBtn");
  const parcelBtn = root.querySelector("#parcelBtn");
  rideBtn.addEventListener("click", () => {
    rideBtn.classList.add("selected");
    parcelBtn.classList.remove("selected");
  });
  parcelBtn.addEventListener("click", () => navigate("/parcel/service"));
  root.querySelectorAll("[data-nav]").forEach((elm) => elm.addEventListener("click", () => navigate(elm.dataset.nav)));
}

function timeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

const KARACHI = { lat: 24.8607, lng: 67.0011 };

export function renderSetLocations(root) {
  const pickup = state.pickup || { label: "Current Location" };
  const dropoff = state.dropoff || { label: "" };
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-6">Set your route</h1>

      <div class="card mb-6">
        <div class="flex gap-3 mb-4">
          <div class="flex-col items-center" style="gap:4px; padding-top:8px;">
            <div style="width:10px;height:10px;border-radius:50%;background:var(--accent);"></div>
            <div style="width:2px;height:32px;background:var(--surface-border);"></div>
            <div style="width:10px;height:10px;border-radius:2px;background:var(--accent-2);"></div>
          </div>
          <div class="flex-col gap-3" style="flex:1;">
            <div>
              <label class="field-label">Pickup</label>
              <input id="pickupInput" class="input" type="text" value="${pickup.label || ""}" placeholder="Current location"/>
            </div>
            <div>
              <label class="field-label">Drop-off</label>
              <input id="dropoffInput" class="input" type="text" value="${dropoff.label || ""}" placeholder="Where to?" autofocus/>
            </div>
          </div>
        </div>
      </div>

      <div class="radar-field" style="height:180px; border-radius:var(--r-lg); margin-bottom:24px; display:flex; align-items:center; justify-content:center;">
        <div class="radar-sweep"></div>
        <div style="position:relative; z-index:1;" class="text-center">
          ${icon("locate", 28)}
          <p class="text-xs text-muted mt-2">Live map needs a Maps API key — not wired yet</p>
        </div>
      </div>

      <button id="confirmLocationBtn" class="btn btn-primary btn-block">Confirm Route ${icon("arrow-forward", 18)}</button>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelector("#confirmLocationBtn").addEventListener("click", () => {
    const pickupVal = root.querySelector("#pickupInput").value.trim() || "Current Location";
    const dropoffVal = root.querySelector("#dropoffInput").value.trim();
    if (!dropoffVal) { toast("Enter a drop-off location", true); return; }
    state.pickup = { label: pickupVal };
    state.dropoff = { label: dropoffVal };
    navigate("/fare");
  });
}

const VEHICLES = [
  { type: "BIKE", name: "Nova Moto", desc: "Quick, affordable bike rides", icon: "bike", from: 120 },
  { type: "RICKSHAW", name: "Nova Lite", desc: "Budget-friendly rickshaw", icon: "rickshaw", from: 250 },
  { type: "CAR", name: "Nova Premium", desc: "Comfortable AC car", icon: "car", from: 450 },
];

export function renderFareSelection(root) {
  let selected = state.selectedVehicle || "CAR";
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-1">Choose a ride</h1>
      <p class="text-secondary mb-6">${state.pickup?.label || "Pickup"} → ${state.dropoff?.label || "Drop-off"}</p>
      <div class="flex-col gap-3 mb-6" id="vehicleList">
        ${VEHICLES.map(
          (v) => `
          <button class="option-card${v.type === selected ? " selected" : ""}" data-type="${v.type}">
            <div class="list-row-icon">${icon(v.icon, 22)}</div>
            <div class="flex-col" style="flex:1;">
              <p class="font-bold">${v.name}</p>
              <p class="text-secondary text-sm">${v.desc}</p>
            </div>
            <p class="font-bold text-accent">from Rs.${v.from}</p>
          </button>`
        ).join("")}
      </div>
      <p class="text-xs text-muted mb-4 text-center">Exact fare is calculated by the backend once you request — this is an indicative starting price.</p>
      <button id="requestRideBtn" class="btn btn-primary btn-block">Request Ride ${icon("bolt", 18)}</button>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelectorAll(".option-card").forEach((c) => {
    c.addEventListener("click", () => {
      root.querySelectorAll(".option-card").forEach((x) => x.classList.remove("selected"));
      c.classList.add("selected");
      selected = c.dataset.type;
      state.selectedVehicle = selected;
    });
  });

  const requestBtn = root.querySelector("#requestRideBtn");
  requestBtn.addEventListener("click", async () => {
    if (!Token.access) {
      state.postAuthRedirect = "/fare";
      navigate("/phone");
      return;
    }
    requestBtn.disabled = true;
    requestBtn.innerHTML = `<span class="spinner"></span> Finding a driver...`;
    try {
      const coords = await getDemoCoords();
      const trip = await api.createTrip({
        pickupLat: coords.pickupLat,
        pickupLng: coords.pickupLng,
        dropoffLat: coords.dropoffLat,
        dropoffLng: coords.dropoffLng,
        vehicleType: selected,
        fareType: "FIXED",
      });
      state.activeTripId = trip.id;
      navigate("/tracking");
    } catch (err) {
      toast(err.message || "Couldn't request a ride", true);
      requestBtn.disabled = false;
      requestBtn.innerHTML = `Request Ride ${icon("bolt", 18)}`;
    }
  });
}

// No geocoding wired (needs a Maps/Places API key — real added cost flagged
// in the roadmap). Pickup uses the device's real GPS; drop-off is a nearby
// offset so the real matching/fare pipeline can be exercised end-to-end.
function getDemoCoords() {
  return new Promise((resolve) => {
    const fallback = () => ({ pickupLat: KARACHI.lat, pickupLng: KARACHI.lng, dropoffLat: KARACHI.lat + 0.02, dropoffLng: KARACHI.lng + 0.02 });
    if (!navigator.geolocation) return resolve(fallback());
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        pickupLat: pos.coords.latitude,
        pickupLng: pos.coords.longitude,
        dropoffLat: pos.coords.latitude + 0.02,
        dropoffLng: pos.coords.longitude + 0.02,
      }),
      () => resolve(fallback()),
      { timeout: 4000 }
    );
  });
}
