// Nova X Rides — the money screen: map-first ride booking.
//
// One screen, one map, a docked sheet whose content advances through the
// flow (route → vehicle + fare → searching). Replaces the old three separate
// full-page steps, which is why booking used to feel like filling a form
// instead of hailing a ride.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, fmtMoney, dockSheet, esc } from "../ui.js";
import { navigate } from "../router.js";
import { createMap } from "../map.js";
import { resolveRoute, getCurrentCoords } from "../geocode.js";
import { track } from "../analytics.js";

const VEHICLES = [
  { type: "BIKE", name: "Nova Moto", desc: "Fastest through traffic", icon: "bike", from: 120, tag: "Fastest" },
  { type: "RICKSHAW", name: "Nova Lite", desc: "Budget-friendly", icon: "rickshaw", from: 250 },
  { type: "CAR", name: "Nova Premium", desc: "AC car, extra comfort", icon: "car", from: 450 },
];

// Same shape as the backend's FARE_CONFIG so the preview is honest rather
// than decorative. The server still calculates the real fare on booking.
const FARE_PREVIEW = {
  BIKE: { base: 30, perKm: 4, perMin: 1 },
  RICKSHAW: { base: 60, perKm: 7, perMin: 1.5 },
  CAR: { base: 100, perKm: 12, perMin: 2 },
};
const AVG_SPEED_KMH = 25;

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function previewFare(type, km) {
  const c = FARE_PREVIEW[type] || FARE_PREVIEW.BIKE;
  const mins = (km / AVG_SPEED_KMH) * 60;
  return Math.round(c.base + km * c.perKm + mins * c.perMin);
}
function etaMinutes(km) {
  return Math.max(3, Math.round((km / AVG_SPEED_KMH) * 60));
}

export function renderRideBooking(root) {
  root.innerHTML = `
    <div class="map-screen">
      <div class="nx-map" id="mapEl"></div>
      <button id="backBtn" class="map-fab" style="top:calc(14px + var(--safe-top)); left:14px;">${icon("arrow-back", 20)}</button>
      <button id="recenterBtn" class="map-fab" style="top:calc(14px + var(--safe-top)); right:14px;">${icon("locate", 20)}</button>
    </div>
  `;

  const screen = root.querySelector(".map-screen");
  const sheet = dockSheet(screen);
  root.querySelector("#backBtn").addEventListener("click", () => navigate("/home"));

  let mapHandle = null;
  let pickup = null;   // { lat, lng, label }
  let dropoff = null;
  let distanceKm = 0;
  let selectedVehicle = state.selectedVehicle || "BIKE";
  let fareMode = "FIXED";
  let destroyed = false;

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

      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Finding address...`;
      try {
        const resolved = await resolveRoute(pickupLabel, dropoffLabel);
        if (!resolved.dropoff.resolved) {
          toast("Couldn't find that address — try adding an area or landmark", true);
          btn.disabled = false;
          btn.innerHTML = `Continue ${icon("arrow-forward", 18)}`;
          return;
        }
        pickup = { ...resolved.pickup, label: pickupLabel || "Current location" };
        dropoff = { ...resolved.dropoff, label: dropoffLabel };
        state.pickup = { label: pickup.label, lat: pickup.lat, lng: pickup.lng };
        state.dropoff = { label: dropoff.label, lat: dropoff.lat, lng: dropoff.lng };
        distanceKm = haversineKm(pickup, dropoff);

        if (mapHandle) {
          mapHandle.setPickup(pickup);
          mapHandle.setDropoff(dropoff);
          mapHandle.setRoute([pickup, dropoff]);
          mapHandle.fit([pickup, dropoff], [60, 260]);
        }
        track("ride_route_set", { distanceKm: Math.round(distanceKm * 10) / 10 });
        stepVehicle();
      } catch (err) {
        toast(err.message || "Couldn't look that up", true);
        btn.disabled = false;
        btn.innerHTML = `Continue ${icon("arrow-forward", 18)}`;
      }
    });
  }

  // ---------- Step 2: vehicle + fare ----------
  function stepVehicle() {
    track("ride_fare_viewed", { distanceKm: Math.round(distanceKm * 10) / 10 });
    const eta = etaMinutes(distanceKm);

    const node = sheet.step(`
      <div class="flex justify-between items-center mb-1">
        <h2 class="text-lg">Choose a ride</h2>
        <button id="editRouteBtn" class="text-xs text-accent font-bold">Edit route</button>
      </div>
      <p class="text-secondary text-sm mb-4">${distanceKm.toFixed(1)} km · about ${eta} min</p>

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
            <p class="font-bold">${fmtMoney(previewFare(v.type, distanceKm))}</p>
          </button>`).join("")}
      </div>

      <div class="top-tabs mb-3" id="fareTabs" style="grid-template-columns:1fr 1fr;">
        <div class="top-tabs-indicator" id="fareInd" style="width:50%; transform:translateX(0);"></div>
        <button class="top-tab active" data-mode="FIXED">Fixed fare</button>
        <button class="top-tab" data-mode="BID">Name your fare</button>
      </div>
      <div id="farePanel" class="mb-3"></div>

      <button id="confirmRideBtn" class="btn btn-primary btn-block">Request Ride ${icon("bolt", 18)}</button>
      <p class="text-xs text-muted text-center mt-3">Cash payment · pay your driver directly</p>
    `);

    node.querySelector("#editRouteBtn").addEventListener("click", stepRoute);

    const farePanel = node.querySelector("#farePanel");
    const confirmBtn = node.querySelector("#confirmRideBtn");
    const fareTabs = node.querySelector("#fareTabs");
    const fareInd = node.querySelector("#fareInd");

    function drawFarePanel() {
      if (fareMode === "FIXED") {
        farePanel.innerHTML = `<p class="text-xs text-muted text-center">Final fare is calculated on distance when you book.</p>`;
        confirmBtn.innerHTML = `Request Ride ${icon("bolt", 18)}`;
      } else {
        const suggested = previewFare(selectedVehicle, distanceKm);
        farePanel.innerHTML = `
          <label class="field-label">Your offer</label>
          <div class="flex items-center gap-2">
            <span class="font-bold text-lg">Rs.</span>
            <input id="bidInput" class="input" type="number" inputmode="numeric" min="1" value="${suggested}" style="flex:1;"/>
          </div>
          <p class="text-xs text-muted mt-2">Drivers nearby see your offer and choose to accept.</p>
        `;
        confirmBtn.innerHTML = `Send Offer ${icon("bolt", 18)}`;
      }
    }
    drawFarePanel();

    fareTabs.querySelectorAll("[data-mode]").forEach((btn, i) => {
      btn.addEventListener("click", () => {
        fareMode = btn.dataset.mode;
        fareTabs.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b === btn));
        fareInd.style.transform = i === 0 ? "translateX(0)" : "translateX(100%)";
        drawFarePanel();
      });
    });

    node.querySelectorAll("[data-type]").forEach((card) => {
      card.addEventListener("click", () => {
        node.querySelectorAll("[data-type]").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedVehicle = card.dataset.type;
        state.selectedVehicle = selectedVehicle;
        if (fareMode === "BID") drawFarePanel();
      });
    });

    confirmBtn.addEventListener("click", async () => {
      if (!Token.access) {
        state.postAuthRedirect = "/ride";
        navigate("/phone");
        return;
      }
      let offeredFare;
      if (fareMode === "BID") {
        offeredFare = Number(node.querySelector("#bidInput").value);
        if (!offeredFare || offeredFare <= 0) { toast("Enter an offer amount", true); return; }
      }
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="spinner"></span>`;
      try {
        const trip = await api.createTrip({
          pickupLat: pickup.lat, pickupLng: pickup.lng,
          dropoffLat: dropoff.lat, dropoffLng: dropoff.lng,
          vehicleType: selectedVehicle,
          fareType: fareMode,
          ...(fareMode === "BID" ? { offeredFare } : {}),
        });
        track("ride_requested", { vehicleType: selectedVehicle, fareType: fareMode, distanceKm: Math.round(distanceKm * 10) / 10 });
        state.activeTripId = trip.id;
        navigate("/tracking");
      } catch (err) {
        toast(err.message || "Couldn't request a ride", true);
        confirmBtn.disabled = false;
        drawFarePanel();
      }
    });
  }

  // ---------- Boot ----------
  (async () => {
    try {
      const here = await getCurrentCoords();
      if (destroyed) return;
      mapHandle = await createMap(root.querySelector("#mapEl"), { center: here, zoom: 14 });
      if (destroyed) { mapHandle.destroy(); return; }
      mapHandle.setPickup(here);
      root.querySelector("#recenterBtn").addEventListener("click", () => mapHandle.center(here, 15));
    } catch {
      // Map failed (offline / CDN blocked) — booking must still work.
      const el = root.querySelector("#mapEl");
      if (el) el.innerHTML = `<div class="flex-col items-center justify-center" style="height:100%;color:var(--text-muted);"><p class="text-sm">Map unavailable — booking still works</p></div>`;
    }
  })();

  stepRoute();

  return () => {
    destroyed = true;
    if (mapHandle) mapHandle.destroy();
  };
}
