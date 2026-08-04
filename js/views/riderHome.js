// Nova X Rides — rider home (tri-modal Food / Bike / Taxi shell), set
// locations, fare/vehicle selection.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, fmtMoney, skeletonRows, esc } from "../ui.js";
import { navigate } from "../router.js";
import { resolveRoute } from "../geocode.js";

const TABS = [
  { key: "FOOD", label: "Food", icon: "utensils" },
  { key: "BIKE", label: "Bike", icon: "bike" },
  { key: "TAXI", label: "Taxi", icon: "taxi" },
];

export function renderHome(root) {
  const user = Token.user;
  const isGuest = !user;
  let active = state.homeTab || "BIKE";

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
        <div class="list-row-icon" style="background:rgba(255, 182, 72, 0.14); color:var(--accent-2);">${icon("bolt", 18)}</div>
        <div style="flex:1;"><p class="font-bold text-sm">Sign in</p><p class="text-secondary text-xs">Just a phone number + code — only needed to book</p></div>
        ${icon("chevronRight", 18)}
      </div>` : ""}

      <div class="top-tabs" id="homeTabs" style="grid-template-columns:repeat(${TABS.length}, 1fr);">
        <div class="top-tabs-indicator" id="tabsIndicator" style="width:${100 / TABS.length}%;"></div>
        ${TABS.map((t) => `<button class="top-tab" data-tab="${t.key}">${icon(t.icon, 16)}<span>${t.label}</span></button>`).join("")}
      </div>

      <div id="tabPanel"></div>
    </div>
  `;

  root.querySelector("#signInCard")?.addEventListener("click", () => { state.postAuthRedirect = null; navigate("/phone"); });

  const indicator = root.querySelector("#tabsIndicator");
  const tabBtns = Array.from(root.querySelectorAll(".top-tab"));
  const panel = root.querySelector("#tabPanel");
  let cleanupPanel = null;

  function setTab(key, { animate = true } = {}) {
    active = key;
    state.homeTab = key;
    const idx = TABS.findIndex((t) => t.key === key);
    indicator.style.transform = `translateX(${idx * 100}%)`;
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === key));

    if (cleanupPanel) { try { cleanupPanel(); } catch {} cleanupPanel = null; }
    panel.classList.remove("view-enter");
    if (animate) { void panel.offsetWidth; panel.classList.add("view-enter"); }

    if (key === "FOOD") cleanupPanel = renderFoodTab(panel, isGuest);
    else if (key === "TAXI") cleanupPanel = renderTaxiTab(panel);
    else cleanupPanel = renderBikeTab(panel, isGuest);
  }

  tabBtns.forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  setTab(active, { animate: false });

  return () => { if (cleanupPanel) { try { cleanupPanel(); } catch {} } };
}

function timeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

// ---------------- Bike tab (Ride / Parcel / Pick & Deliver) ----------------

function renderBikeTab(panel, isGuest) {
  panel.innerHTML = `
    <div class="glow-card mb-4" id="whereToCard" style="cursor:pointer;">
      <div class="flex items-center gap-3">
        <div class="list-row-icon" style="background:rgba(35, 214, 138, 0.12); color:var(--accent);">${icon("bike", 22)}</div>
        <div class="flex-col" style="flex:1;">
          <p class="font-bold">Book a Bike Ride</p>
          <p class="text-secondary text-sm">Fastest way through traffic — where to?</p>
        </div>
        ${icon("arrow-forward", 20)}
      </div>
    </div>

    <div class="flex gap-3 mb-6">
      <button id="rideBtn" class="option-card selected" style="flex:1; flex-direction:column; align-items:flex-start; gap:8px;">
        ${icon("bike", 22)}
        <span class="font-bold text-sm">Ride</span>
      </button>
      <button id="parcelBtn" class="option-card" style="flex:1; flex-direction:column; align-items:flex-start; gap:8px;">
        ${icon("package", 22)}
        <span class="font-bold text-sm">Send a Parcel</span>
      </button>
      <button id="errandBtn" class="option-card" style="flex:1; flex-direction:column; align-items:flex-start; gap:8px;">
        ${icon("basket", 22)}
        <span class="font-bold text-sm">Pick & Deliver</span>
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
  `;

  panel.querySelector("#whereToCard").addEventListener("click", () => { state.selectedVehicle = "BIKE"; navigate("/set-locations"); });
  panel.querySelector("[data-nav-driver]")?.addEventListener("click", () => navigate("/driver/phone"));
  const rideBtn = panel.querySelector("#rideBtn");
  const parcelBtn = panel.querySelector("#parcelBtn");
  const errandBtn = panel.querySelector("#errandBtn");
  parcelBtn.addEventListener("click", () => navigate("/parcel/service"));
  errandBtn.addEventListener("click", () => navigate("/errand/details"));
  rideBtn.addEventListener("click", () => { state.selectedVehicle = "BIKE"; navigate("/set-locations"); });
  panel.querySelectorAll("[data-nav]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.nav)));
}

// ---------------- Taxi tab (Standard / AC / Premium tiers) ----------------

const TAXI_TIERS = [
  { key: "STANDARD", name: "Nova Standard", desc: "Everyday car, real-time fare", multiplier: 1.0, icon: "car" },
  { key: "AC", name: "Nova AC", desc: "Air-conditioned, extra comfort", multiplier: 1.3, icon: "car" },
  { key: "PREMIUM", name: "Nova Premium", desc: "Top-rated drivers, newer cars", multiplier: 1.8, icon: "car" },
];
const TAXI_BASE_FROM = 450; // mirrors VEHICLES' CAR "from" price on the Bike tab's old fare screen

function renderTaxiTab(panel) {
  let selected = state.taxiTier || "STANDARD";
  panel.innerHTML = `
    <div class="glow-card mb-4">
      <div class="flex items-center gap-3">
        <div class="list-row-icon" style="background:rgba(255, 182, 72, 0.14); color:var(--accent-2);">${icon("taxi", 22)}</div>
        <div class="flex-col" style="flex:1;">
          <p class="font-bold">Book a Taxi</p>
          <p class="text-secondary text-sm">Pick a comfort tier, then set your route</p>
        </div>
      </div>
    </div>
    <div class="flex-col gap-3 mb-4" id="tierList">
      ${TAXI_TIERS.map((t) => `
        <button class="option-card${t.key === selected ? " selected" : ""}" data-tier="${t.key}">
          <div class="list-row-icon">${icon(t.icon, 20)}</div>
          <div class="flex-col" style="flex:1;">
            <p class="font-bold">${t.name}</p>
            <p class="text-secondary text-sm">${t.desc}</p>
          </div>
          <p class="font-bold text-accent">from ${fmtMoney(Math.round(TAXI_BASE_FROM * t.multiplier))}</p>
        </button>`).join("")}
    </div>
    <p class="text-xs text-muted mb-4 text-center">Tier sets your comfort preference — the real fare is calculated by the backend from live distance once you request, same as every Nova X ride.</p>
    <button id="taxiContinueBtn" class="btn btn-primary btn-block">Set Pickup & Drop-off ${icon("arrow-forward", 18)}</button>
  `;

  panel.querySelectorAll("[data-tier]").forEach((c) => {
    c.addEventListener("click", () => {
      panel.querySelectorAll("[data-tier]").forEach((x) => x.classList.remove("selected"));
      c.classList.add("selected");
      selected = c.dataset.tier;
      state.taxiTier = selected;
    });
  });
  panel.querySelector("#taxiContinueBtn").addEventListener("click", () => {
    state.selectedVehicle = "CAR";
    state.taxiTier = selected;
    navigate("/set-locations");
  });
}

// ---------------- Food tab (restaurant marketplace teaser) ----------------

function renderFoodTab(panel, isGuest) {
  panel.innerHTML = `
    <div class="glow-card mb-4" id="foodSearchCard" style="cursor:pointer;">
      <div class="flex items-center gap-3">
        <div class="list-row-icon" style="background:rgba(35, 214, 138, 0.12); color:var(--accent);">${icon("utensils", 22)}</div>
        <div class="flex-col" style="flex:1;">
          <p class="font-bold">Order food</p>
          <p class="text-secondary text-sm">Browse restaurants near you</p>
        </div>
        ${icon("arrow-forward", 20)}
      </div>
    </div>
    <div class="flex justify-between items-center mb-3">
      <h3 class="text-sm text-secondary" style="text-transform:uppercase; letter-spacing:0.04em;">Open Now</h3>
      <button id="seeAllBtn" class="text-xs text-accent font-bold">See all</button>
    </div>
    <div id="restaurantList" class="flex-col gap-3">${skeletonRows(3)}</div>
  `;

  panel.querySelector("#foodSearchCard").addEventListener("click", () => navigate("/food/browse"));
  panel.querySelector("#seeAllBtn").addEventListener("click", () => navigate("/food/browse"));

  let cancelled = false;
  api.browseRestaurants()
    .then((restaurants) => {
      if (cancelled) return;
      const list = panel.querySelector("#restaurantList");
      if (!restaurants.length) {
        list.innerHTML = `<div class="empty-state"><p class="text-sm">No restaurants live in your area yet — check back soon.</p></div>`;
        return;
      }
      list.innerHTML = restaurants.slice(0, 5).map((r) => restaurantCardHtml(r)).join("");
      list.querySelectorAll("[data-restaurant-id]").forEach((c) =>
        c.addEventListener("click", () => openRestaurant(c.dataset.restaurantId, restaurants))
      );
    })
    .catch(() => {
      if (cancelled) return;
      panel.querySelector("#restaurantList").innerHTML = `<div class="empty-state"><p class="text-sm">Couldn't load restaurants right now.</p></div>`;
    });

  return () => { cancelled = true; };
}

/**
 * Rich restaurant card — banner-led, the way food apps sell food. A plain
 * text row makes a biryani place look like a bank statement line.
 *
 * bannerUrl comes from the restaurant's own upload; when it's missing we
 * show a branded gradient placeholder rather than a broken image, so an
 * un-photographed restaurant still looks deliberate.
 */
export function restaurantCardHtml(r) {
  const tags = (r.cuisineTags || []).slice(0, 3);
  const isOpen = r.isOpen !== false;
  const prep = r.prepTimeMinutes || 20;
  return `
    <div class="food-card stagger-item" data-restaurant-id="${esc(r.id)}" style="cursor:pointer;">
      <div class="food-card-banner" ${r.bannerUrl ? `style="background-image:url('${esc(r.bannerUrl)}');"` : ""}>
        ${r.bannerUrl ? "" : icon("utensils", 34)}
        <div class="food-card-badges">
          ${isOpen ? `<span class="badge badge-success">Open now</span>` : ""}
          ${r.status === "APPROVED" ? `<span class="badge badge-accent">${icon("check", 10)} Verified</span>` : ""}
        </div>
        ${isOpen ? "" : `<div class="closed-veil">Currently closed</div>`}
      </div>
      <div class="food-card-body">
        <div class="flex justify-between items-start">
          <p class="font-bold" style="flex:1;">${esc(r.name)}</p>
          <span class="badge badge-accent" style="padding:2px 8px;">${icon("star", 11)} ${(r.rating ?? 5).toFixed(1)}</span>
        </div>
        <p class="text-secondary text-xs mt-1">${esc(tags.join(" · ")) || "Restaurant"}</p>
        <div class="food-meta">
          <span>${prep}–${prep + 15} min</span>
          <span class="dot"></span>
          <span>Delivery from Rs. 50</span>
        </div>
      </div>
    </div>
  `;
}

function openRestaurant(id, cachedList) {
  const cached = cachedList?.find((r) => r.id === id);
  state.currentRestaurant = cached ? { ...cached, menuItems: null } : { id };
  navigate("/food/restaurant");
}

// ---------------- Legacy routes still used by Bike/Taxi flows ----------------

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
  { type: "BIKE", name: "Nova Moto", desc: "Quick, affordable bike rides", icon: "bike", from: 120, tag: "Fastest" },
  { type: "RICKSHAW", name: "Nova Lite", desc: "Budget-friendly rickshaw", icon: "rickshaw", from: 250 },
  { type: "CAR", name: "Nova Premium", desc: "Comfortable AC car", icon: "car", from: 450 },
];

export function renderFareSelection(root) {
  let selected = state.selectedVehicle || "BIKE";
  // "fareMode": FIXED (backend-calculated, take-it-or-leave-it, same as
  // before) or BID (rider names their own price, inDrive-style — nearby
  // drivers see the offer and choose to accept it or let it pass, same
  // single-shot mechanic the backend's fareType=BID already supports).
  let fareMode = "FIXED";
  const selectedVehicleMeta = () => VEHICLES.find((v) => v.type === selected) || VEHICLES[0];

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
              <div class="flex items-center gap-2"><p class="font-bold">${v.name}</p>${v.tag ? `<span class="badge badge-accent">${v.tag}</span>` : ""}</div>
              <p class="text-secondary text-sm">${v.desc}</p>
            </div>
            <p class="font-bold text-accent">from Rs.${v.from}</p>
          </button>`
        ).join("")}
      </div>

      <div class="top-tabs mb-4" id="fareModeTabs" style="grid-template-columns: 1fr 1fr;">
        <div class="top-tabs-indicator" style="width:50%; transform:translateX(0);"></div>
        <button class="top-tab active" data-mode="FIXED">Fixed Fare</button>
        <button class="top-tab" data-mode="BID">Name Your Fare</button>
      </div>

      <div id="fareModePanel"></div>

      <button id="requestRideBtn" class="btn btn-primary btn-block mt-4">Request Ride ${icon("bolt", 18)}</button>
    </div>
  `;

  const tabsEl = root.querySelector("#fareModeTabs");
  const indicator = tabsEl.querySelector(".top-tabs-indicator");
  const panel = root.querySelector("#fareModePanel");
  const requestBtn = root.querySelector("#requestRideBtn");

  function renderPanel() {
    if (fareMode === "FIXED") {
      panel.innerHTML = `<p class="text-xs text-muted mb-2 text-center">Exact fare is calculated by the backend once you request — this is an indicative starting price.</p>`;
      requestBtn.innerHTML = `Request Ride ${icon("bolt", 18)}`;
    } else {
      const suggested = selectedVehicleMeta().from;
      panel.innerHTML = `
        <div class="card mb-2">
          <label class="field-label">Your offer (Rs.)</label>
          <input id="bidInput" class="input" type="number" inputmode="numeric" min="1" placeholder="e.g. ${suggested}" value="${suggested}"/>
          <p class="text-xs text-muted mt-2">Nearby drivers see your offer and choose to accept it — like inDrive. A fair offer near the going rate gets matched faster.</p>
        </div>
      `;
      requestBtn.innerHTML = `Send Offer ${icon("bolt", 18)}`;
    }
  }
  renderPanel();

  tabsEl.querySelectorAll("[data-mode]").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      fareMode = btn.dataset.mode;
      tabsEl.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b === btn));
      indicator.style.transform = i === 0 ? "translateX(0)" : "translateX(100%)";
      renderPanel();
    });
  });

  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelectorAll(".option-card").forEach((c) => {
    c.addEventListener("click", () => {
      root.querySelectorAll(".option-card").forEach((x) => x.classList.remove("selected"));
      c.classList.add("selected");
      selected = c.dataset.type;
      state.selectedVehicle = selected;
      if (fareMode === "BID") renderPanel();
    });
  });

  requestBtn.addEventListener("click", async () => {
    if (!Token.access) {
      state.postAuthRedirect = "/fare";
      navigate("/phone");
      return;
    }
    let offeredFare;
    if (fareMode === "BID") {
      offeredFare = Number(root.querySelector("#bidInput").value);
      if (!offeredFare || offeredFare <= 0) { toast("Enter a valid offer amount", true); return; }
    }
    requestBtn.disabled = true;
    requestBtn.innerHTML = `<span class="spinner"></span> ${fareMode === "BID" ? "Sending offer..." : "Finding a driver..."}`;
    try {
      const coords = await getRouteCoords();
      if (!coords.dropoffResolved) {
        toast("Couldn't find that drop-off address — try a more specific one", true);
        requestBtn.disabled = false;
        requestBtn.innerHTML = fareMode === "BID" ? `Send Offer ${icon("bolt", 18)}` : `Request Ride ${icon("bolt", 18)}`;
        return;
      }
      const trip = await api.createTrip({
        pickupLat: coords.pickupLat,
        pickupLng: coords.pickupLng,
        dropoffLat: coords.dropoffLat,
        dropoffLng: coords.dropoffLng,
        vehicleType: selected,
        fareType: fareMode,
        ...(fareMode === "BID" ? { offeredFare } : {}),
      });
      state.activeTripId = trip.id;
      navigate("/tracking");
    } catch (err) {
      toast(err.message || "Couldn't request a ride", true);
      requestBtn.disabled = false;
      requestBtn.innerHTML = fareMode === "BID" ? `Send Offer ${icon("bolt", 18)}` : `Request Ride ${icon("bolt", 18)}`;
    }
  });
}

// No geocoding wired (needs a Maps/Places API key — real added cost flagged
// in the roadmap). Pickup uses the device's real GPS; drop-off is a nearby
// offset so the real matching/fare pipeline can be exercised end-to-end.
// Geocodes the addresses the rider actually typed (see js/geocode.js).
// Previously this ignored them entirely and sent current-GPS + a fixed
// offset, so the driver was always dispatched to the wrong place.
async function getRouteCoords() {
  const { pickup, dropoff } = await resolveRoute(state.pickup?.label, state.dropoff?.label);
  return {
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    dropoffLat: dropoff.lat,
    dropoffLng: dropoff.lng,
    dropoffResolved: dropoff.resolved,
  };
}
