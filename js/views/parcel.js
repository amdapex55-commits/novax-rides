// Nova Go Rides — send-a-parcel flow: service selection, package details,
// recipient contact + confirm (creates a real delivery), live tracking.
// Mirrors the trips flow but against the Delivery module (POST /deliveries,
// same real matching engine on the backend).
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, esc, alertField, alertUser } from "../ui.js";
import { firstProblem, clearInvalid, required, positiveNumber, maxNumber, phone, normalisePkPhone } from "../forms.js";
import { navigate } from "../router.js";
import { track } from "../analytics.js";
import { socketManager } from "../socket.js";
import { resolveRoute } from "../geocode.js";

// Two cards that differ only in wording read as the same thing twice, and
// the faster one was not visibly the faster one. Each now carries its own
// icon and accent, and Express says what you are actually buying — the front
// of the queue — rather than "priority matching", which is our word, not the
// customer's.
const SERVICES = [
  {
    key: "standard", name: "Nova Standard", ic: "package", accent: "ride",
    desc: "The next rider free in your area", eta: "25–40 min", tag: "",
  },
  {
    key: "express", name: "Nova Express", ic: "bolt", accent: "express",
    desc: "Goes to the front of the queue", eta: "15–25 min", tag: "Fastest",
  },
];

export function renderParcelService(root) {
  let selected = "standard";
  root.innerHTML = `
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-6">Send a Parcel</h1>
      <div class="flex-col gap-3 mb-6">
        ${SERVICES.map(
          (s, i) => `
          <button class="option-card nx-svc nx-svc-${s.accent}${i === 0 ? " selected" : ""}" data-key="${s.key}">
            <div class="list-row-icon nx-svc-ic">${icon(s.ic, 20)}</div>
            <div class="flex-col" style="flex:1;min-width:0;">
              <p class="font-bold">${esc(s.name)}${s.tag ? `<span class="nx-svc-tag">${esc(s.tag)}</span>` : ""}</p>
              <p class="text-secondary text-sm">${esc(s.desc)}</p>
            </div>
            <p class="text-xs text-muted">${esc(s.eta)}</p>
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
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-6">Package Details</h1>
      <label class="field-label">Weight (kg) <span class="nx-req">Required</span></label>
      <input id="weightInput" class="input mb-4" type="number" inputmode="decimal" placeholder="0.5" value="${draft.weight || ""}"/>

      <label class="field-label">What's inside? <span class="nx-req">Required</span></label>
      <textarea id="descInput" class="input mb-4" placeholder="e.g. iPhone 15 Pro, sealed box">${draft.note || ""}</textarea>

      <!-- Cash to collect is required as a NUMBER, and 0 is a valid answer.
           "Optional" was the wrong word: a blank meant the rider found out at
           the door whether they were collecting money, which is the one thing
           they must know before they set off. -->
      <label class="field-label">Cash to collect on delivery <span class="nx-req">Required</span></label>
      <input id="codInput" class="input mb-2" type="number" inputmode="numeric" placeholder="0 if nothing to collect" value="${draft.codAmount ?? ""}"/>
      <p class="text-xs text-muted mb-6">Enter 0 if the rider isn't collecting anything.</p>
      <button id="continueBtn" class="btn btn-primary btn-block">Continue ${icon("arrow-forward", 18)}</button>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelector("#continueBtn").addEventListener("click", () => {
    clearInvalid(root);
    // Stops at the first problem on purpose — five errors at once reads as a
    // broken form, and only one of them can be fixed first anyway.
    const bad = firstProblem([
      { el: root.querySelector("#weightInput"), rules: [
          positiveNumber("Weight"),
          maxNumber("Weight", 30, "Over 30kg won't go on a bike. Split it, or book a larger vehicle."),
        ] },
      { el: root.querySelector("#descInput"), rules: [
          required("Contents", "Tell us what's inside — the rider has to know what they're carrying, and it's what we go on if it's lost."),
        ] },
      { el: root.querySelector("#codInput"), rules: [
          (v) => String(v ?? "").trim() === ""
            ? "Enter how much cash to collect, or 0 if none."
            : (Number.isFinite(Number(v)) && Number(v) >= 0 ? null : "Cash to collect has to be 0 or more."),
        ] },
    ]);
    if (bad) {
      alertField(bad.el, bad.problem, "Fill this in to carry on.");
      return;
    }
    state.parcelDraft = {
      ...draft,
      weight: root.querySelector("#weightInput").value,
      note: root.querySelector("#descInput").value.trim(),
      codAmount: root.querySelector("#codInput").value,
    };
    navigate("/parcel/contact");
  });
}

export function renderParcelContact(root) {
  const draft = state.parcelDraft || {};
  root.innerHTML = `
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-6">Pickup & Receiver</h1>

      <label class="field-label">Pickup Address</label>
      <input id="pickupInput" class="input mb-4" placeholder="Leave blank to use your current location" value="${esc(draft.pickupLabel)}"/>

      <label class="field-label">Delivery Address</label>
      <input id="dropoffInput" class="input mb-4" placeholder="e.g. House 12, Street 4, DHA Phase 6" value="${esc(draft.dropoffLabel)}"/>

      <label class="field-label">Receiver Name</label>
      <input id="nameInput" class="input mb-4" placeholder="e.g. Sara Khan" value="${esc(draft.recipientName)}"/>
      <label class="field-label">Phone Number</label>
      <div class="flex gap-2 mb-6">
        <div class="input flex items-center justify-center" style="width:64px; flex:none; color:var(--text-secondary);">+92</div>
        <input id="phoneInput" class="input" type="tel" placeholder="321 7654321" value="${esc(draft.recipientPhoneLocal)}"/>
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
    const pickupLabel = root.querySelector("#pickupInput").value.trim();
    const dropoffLabel = root.querySelector("#dropoffInput").value.trim();
    clearInvalid(root);
    const bad = firstProblem([
      { el: root.querySelector("#dropoffInput"), rules: [
          required("Delivery address", "Where is it going? A street and area is enough — we'll pin it on the map next."),
        ] },
      { el: root.querySelector("#nameInput"), rules: [
          required("Receiver name", "The rider asks for this person by name at the door."),
        ] },
      { el: root.querySelector("#phoneInput"), rules: [phone()] },
    ]);
    if (bad) { alertField(bad.el, bad.problem, "Fill this in to book."); return; }
    // 0321 7654321 and 321 7654321 both arrive here as +923217654321.
    const phoneParsed = normalisePkPhone(phoneLocal);
    if (!Token.access) {
      // Save what they've typed so it's still here after they log in.
      state.parcelDraft = { ...draft, recipientName: name, recipientPhoneLocal: phoneLocal, pickupLabel, dropoffLabel };
      state.postAuthRedirect = "/parcel/contact";
      navigate("/signin");
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      // Real geocoding of what the sender typed — this flow used to submit
      // current-GPS + a fixed offset and ignore the addresses entirely.
      const { pickup, dropoff } = await resolveRoute(pickupLabel, dropoffLabel);
      if (!dropoff.resolved) {
        toast("Couldn't find that delivery address — try a more specific one", true);
        btn.disabled = false;
        btn.innerHTML = `Confirm & Book ${icon("arrow-forward", 18)}`;
        return;
      }
      const dto = {
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        recipientName: name,
        recipientPhone: phoneParsed.e164,
        parcelNote: draft.note || undefined,
      };
      // 0 is a real answer here, so this cannot be a truthiness check — a
      // deliberate "collect nothing" would be dropped and the rider would be
      // back to finding out at the door.
      if (String(draft.codAmount ?? "").trim() !== "") dto.codAmount = Number(draft.codAmount);
      track("parcel_requested");
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

  const statusCard = root.querySelector(".card-elevated");
  const statusBadge = root.querySelector("#statusBadge");
  const statusText = root.querySelector("#statusText");
  function setStatus(s) {
    statusBadge.textContent = s;
    statusText.textContent = STATUS_COPY[s] || s;
    statusCard.classList.remove("success-pulse");
    void statusCard.offsetWidth;
    statusCard.classList.add("success-pulse");
  }

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
