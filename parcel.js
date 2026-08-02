// Nova X Rides — send-a-parcel flow: service selection, package details,
// recipient contact + confirm (creates a real delivery), live tracking.
// Mirrors the trips flow but against the Delivery module (POST /deliveries,
// same real matching engine on the backend).
import { api, Token } from "./api.js";
import { state } from "./state.js";
import { icon } from "./icons.js";
import { toast } from "./ui.js";
import { navigate } from "./router.js";
import { socketManager } from "./socket.js";

const SERVICES = [
  { key: "standard", name: "Nova Standard", desc: "Next available driver", eta: "25-40 min" },
  { key: "express", name: "Nova Express", desc: "Priority matching", eta: "15-25 min" },
];

export function renderParcelService(root) {
  let selected = "standard";
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-6">Send a Parcel</h1>
      <div class="flex-col gap-3 mb-6">
        ${SERVICES.map(
          (s, i) => `
          <button class="option-card${i === 0 ? " selected" : ""}" data-key="${s.key}">
            <div class="list-row-icon">${icon("package", 20)}</div>
            <div class="flex-col" style="flex:1;">
              <p class="font-bold">${s.name}</p>
              <p class="text-secondary text-sm">${s.desc}</p>
            </div>
            <p class="text-xs text-muted">${s.eta}</p>
          </button>`
        ).join("")}
      </div>
      <button id="continueBtn" class="btn btn-primary btn-block">Next ${icon("arrow-forward", 18)}</button>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelectorAll(".option-card").forEach((c) => {
    c.addEventListener("click", () => {
      root.querySelectorAll(".option-card").forEach((x) => x.classList.remove("selected"));
      c.classList.add("selected");
      selected = c.dataset.key;
    });
  });
  root.querySelector("#continueBtn").addEventListener("click", () => {
    state.parcelDraft = { ...state.parcelDraft, service: selected };
    navigate("/parcel/details");
  });
}

export function renderParcelDetails(root) {
  const draft = state.parcelDraft || {};
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-6">Package Details</h1>
      <label class="field-label">Weight (kg)</label>
      <input id="weightInput" class="input mb-4" type="number" placeholder="0.5" value="${draft.weight || ""}"/>
      <label class="field-label">What's inside?</label>
      <textarea id="descInput" class="input mb-4" placeholder="e.g. iPhone 15 Pro, sealed box">${draft.note || ""}</textarea>
      <label class="field-label">Cash to collect on delivery (optional)</label>
      <input id="codInput" class="input mb-6" type="number" placeholder="e.g. 1500" value="${draft.codAmount || ""}"/>
      <button id="continueBtn" class="btn btn-primary btn-block">Continue ${icon("arrow-forward", 18)}</button>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelector("#continueBtn").addEventListener("click", () => {
    state.parcelDraft = {
      ...draft,
      weight: root.querySelector("#weightInput").value,
      note: root.querySelector("#descInput").value.trim(),
      codAmount: root.querySelector("#codInput").value,
    };
    navigate("/parcel/contact");
  });
}

const KARACHI = { lat: 24.8607, lng: 67.0011 };
function getDemoCoords() {
  return new Promise((resolve) => {
    const fallback = () => ({ pickupLat: KARACHI.lat, pickupLng: KARACHI.lng, dropoffLat: KARACHI.lat + 0.02, dropoffLng: KARACHI.lng + 0.02 });
    if (!navigator.geolocation) return resolve(fallback());
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ pickupLat: pos.coords.latitude, pickupLng: pos.coords.longitude, dropoffLat: pos.coords.latitude + 0.02, dropoffLng: pos.coords.longitude + 0.02 }),
      () => resolve(fallback()),
      { timeout: 4000 }
    );
  });
}

export function renderParcelContact(root) {
  const draft = state.parcelDraft || {};
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-6">Receiver Details</h1>
      <label class="field-label">Receiver Name</label>
      <input id="nameInput" class="input mb-4" placeholder="e.g. Sara Khan" value="${draft.recipientName || ""}"/>
      <label class="field-label">Phone Number</label>
      <div class="flex gap-2 mb-6">
        <div class="input flex items-center justify-center" style="width:64px; flex:none; color:var(--text-secondary);">+92</div>
        <input id="phoneInput" class="input" type="tel" placeholder="321 7654321" value="${draft.recipientPhoneLocal || ""}"/>
      </div>
      <div class="card mb-6">
        <div class="flex justify-between">
          <span class="text-secondary text-sm">Estimated Total</span>
          <span class="font-bold text-accent">Rs. 250 - 400</span>
        </div>
      </div>
      <button id="confirmBtn" class="btn btn-primary btn-block">Confirm & Book ${icon("arrow-forward", 18)}</button>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelector("#confirmBtn").addEventListener("click", async (e) => {
    const name = root.querySelector("#nameInput").value.trim();
    const phoneLocal = root.querySelector("#phoneInput").value.trim();
    const digits = phoneLocal.replace(/\D/g, "").replace(/^0+/, "");
    if (!name || digits.length < 9) { toast("Enter a valid receiver name and phone", true); return; }
    if (!Token.access) {
      // Save what they've typed so it's still here after they log in.
      state.parcelDraft = { ...draft, recipientName: name, recipientPhoneLocal: phoneLocal };
      state.postAuthRedirect = "/parcel/contact";
      navigate("/phone");
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const coords = await getDemoCoords();
      const dto = {
        pickupLat: coords.pickupLat,
        pickupLng: coords.pickupLng,
        dropoffLat: coords.dropoffLat,
        dropoffLng: coords.dropoffLng,
        recipientName: name,
        recipientPhone: "+92" + digits,
        parcelNote: draft.note || undefined,
      };
      if (draft.codAmount) dto.codAmount = Number(draft.codAmount);
      const delivery = await api.createDelivery(dto);
      state.activeDeliveryId = delivery.id;
      state.parcelDraft = {};
      navigate("/parcel/tracking");
    } catch (err) {
      toast(err.message || "Couldn't create delivery", true);
      btn.disabled = false;
      btn.innerHTML = `Confirm & Book ${icon("arrow-forward", 18)}`;
    }
  });
}

const STATUS_COPY = {
  REQUESTED: "Finding a courier...",
  MATCHING: "Finding a courier...",
  MATCHED: "Courier is on the way to pickup",
  PICKED_UP: "Package picked up",
  IN_TRANSIT: "On the way to receiver",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function renderParcelTracking(root) {
  const deliveryId = state.activeDeliveryId;
  root.innerHTML = `
    <div style="position:relative;">
      <div class="radar-field" style="height:280px; display:flex; align-items:center; justify-content:center;">
        <div class="radar-sweep"></div>
        <div class="pulse-dot" style="position:relative; z-index:1;"></div>
      </div>
      <button id="backBtn" class="btn-icon" style="position:absolute; top:calc(16px + env(safe-area-inset-top)); left:16px; background:var(--bg-elevated);">${icon("arrow-back", 20)}</button>
    </div>
    <div class="page" style="margin-top:-24px; position:relative; z-index:2;">
      <div class="card-elevated" style="border-radius:var(--r-xl);">
        <span class="badge badge-accent mb-3" id="statusBadge">Loading...</span>
        <p class="text-lg font-bold" id="statusText">Connecting...</p>
      </div>
    </div>
  `;
  if (!deliveryId) { navigate("/home"); return; }
  root.querySelector("#backBtn").addEventListener("click", () => navigate("/home"));

  const statusBadge = root.querySelector("#statusBadge");
  const statusText = root.querySelector("#statusText");
  function setStatus(s) { statusBadge.textContent = s; statusText.textContent = STATUS_COPY[s] || s; }

  api.getDelivery(deliveryId).then((d) => setStatus(d.status)).catch(() => setStatus("REQUESTED"));

  socketManager.connect();
  const onMatched = () => setStatus("MATCHED");
  const onPickedUp = () => setStatus("PICKED_UP");
  const onInTransit = () => setStatus("IN_TRANSIT");
  const onDelivered = () => {
    setStatus("DELIVERED");
    toast("Package delivered!");
    state.activeDeliveryId = null;
    setTimeout(() => navigate("/home"), 1500);
  };
  const onCancelled = () => {
    toast("Delivery was cancelled");
    state.activeDeliveryId = null;
    setTimeout(() => navigate("/home"), 1000);
  };
  socketManager.on("delivery:matched", onMatched);
  socketManager.on("delivery:pickedUp", onPickedUp);
  socketManager.on("delivery:inTransit", onInTransit);
  socketManager.on("delivery:delivered", onDelivered);
  socketManager.on("delivery:cancelled", onCancelled);

  return () => {
    socketManager.off("delivery:matched", onMatched);
    socketManager.off("delivery:pickedUp", onPickedUp);
    socketManager.off("delivery:inTransit", onInTransit);
    socketManager.off("delivery:delivered", onDelivered);
    socketManager.off("delivery:cancelled", onCancelled);
  };
}
