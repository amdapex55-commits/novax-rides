// Nova Go Rides — "Pick & Deliver to Me" errand flow: what to buy + where
// from + budget, then live tracking. Mirrors parcel.js's shape against the
// Errands module (POST /errands) instead of Delivery.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, fmtMoney } from "../ui.js";
import { navigate } from "../router.js";
import { track } from "../analytics.js";
import { socketManager } from "../socket.js";
import { geocode, getCurrentCoords } from "../geocode.js";


export function renderErrandDetails(root) {
  const draft = state.errandDraft || {};
  root.innerHTML = `
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-1">Pick & Deliver to Me</h1>
      <p class="text-secondary mb-6">Tell a driver what to buy — they'll shop and bring it to you.</p>

      <label class="field-label">Which store?</label>
      <input id="storeInput" class="input mb-4" placeholder="e.g. Imtiaz Super Market, Tariq Road" value="${draft.storeLabel || ""}"/>

      <label class="field-label">What should they buy?</label>
      <textarea id="itemsInput" class="input mb-4" placeholder="e.g. 2x milk (1L), 1 dozen eggs, AA batteries">${draft.itemsDescription || ""}</textarea>

      <label class="field-label">Budget (Rs.)</label>
      <input id="budgetInput" class="input mb-4" type="number" placeholder="2000" value="${draft.estimatedBudget || ""}"/>

      <label class="field-label">Deliver to</label>
      <input id="dropoffInput" class="input mb-6" placeholder="House / Street / Area" value="${draft.dropoffLabel || ""}"/>

      <div class="card mb-6">
        <div class="flex justify-between">
          <span class="text-secondary text-sm">Service fee</span>
          <span class="font-bold text-accent">calculated at checkout</span>
        </div>
        <p class="text-xs text-muted mt-1">Plus the actual cost of items — the driver reports what they spent before heading your way.</p>
      </div>

      <button id="continueBtn" class="btn btn-primary btn-block">Request Errand ${icon("arrow-forward", 18)}</button>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelector("#continueBtn").addEventListener("click", async (e) => {
    const storeLabel = root.querySelector("#storeInput").value.trim();
    const itemsDescription = root.querySelector("#itemsInput").value.trim();
    const estimatedBudget = Number(root.querySelector("#budgetInput").value);
    const dropoffLabel = root.querySelector("#dropoffInput").value.trim();
    if (!storeLabel || !itemsDescription || !dropoffLabel) { toast("Fill in the store, items, and delivery address", true); return; }
    if (!estimatedBudget || estimatedBudget <= 0) { toast("Enter a budget", true); return; }

    state.errandDraft = { storeLabel, itemsDescription, estimatedBudget, dropoffLabel };

    if (!Token.access) {
      state.postAuthRedirect = "/errand/details";
      navigate("/phone");
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      // Real geocoding of the store + delivery address the requester typed;
      // this used to send current-GPS + a fixed offset for both.
      const here = await getCurrentCoords();
      const [store, dropoff] = await Promise.all([
        geocode(storeLabel, here),
        geocode(dropoffLabel, here),
      ]);
      if (!store.resolved || !dropoff.resolved) {
        toast(`Couldn't find that ${!store.resolved ? "store" : "delivery"} address — try a more specific one`, true);
        btn.disabled = false;
        btn.innerHTML = `Request Errand ${icon("arrow-forward", 18)}`;
        return;
      }
      track("errand_requested");
      const errand = await api.createErrand({
        storeLabel,
        storeLat: store.lat,
        storeLng: store.lng,
        dropoffLabel,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        itemsDescription,
        estimatedBudget,
      });
      state.activeErrandId = errand.id;
      state.errandDraft = {};
      navigate("/errand/tracking");
    } catch (err) {
      toast(err.message || "Couldn't request errand", true);
      btn.disabled = false;
      btn.innerHTML = `Request Errand ${icon("arrow-forward", 18)}`;
    }
  });
}

const ERRAND_STATUS_COPY = {
  REQUESTED: "Finding a driver...",
  MATCHING: "Finding a driver...",
  ACCEPTED: "Driver is heading to the store",
  SHOPPING: "Driver is shopping for your items",
  ON_THE_WAY: "On the way to you",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function renderErrandTracking(root) {
  const errandId = state.activeErrandId;
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
        <p class="text-secondary text-sm mt-3" id="spendLine"></p>
      </div>
    </div>
  `;
  if (!errandId) { navigate("/home"); return; }
  root.querySelector("#backBtn").addEventListener("click", () => navigate("/home"));

  const statusCard = root.querySelector(".card-elevated");
  const statusBadge = root.querySelector("#statusBadge");
  const statusText = root.querySelector("#statusText");
  const spendLine = root.querySelector("#spendLine");
  function setStatus(s) {
    statusBadge.textContent = s;
    statusText.textContent = ERRAND_STATUS_COPY[s] || s;
    statusCard.classList.remove("success-pulse");
    void statusCard.offsetWidth;
    statusCard.classList.add("success-pulse");
  }

  api.getErrand(errandId).then((e) => {
    setStatus(e.status);
    if (e.actualSpend) spendLine.textContent = `Items spend: ${fmtMoney(e.actualSpend)}`;
  }).catch(() => setStatus("REQUESTED"));

  socketManager.connect();
  const onAccepted = () => setStatus("ACCEPTED");
  const onShopping = () => setStatus("SHOPPING");
  const onOnTheWay = (payload) => {
    setStatus("ON_THE_WAY");
    if (payload?.actualSpend) spendLine.textContent = `Items spend: ${fmtMoney(payload.actualSpend)}`;
  };
  const onDelivered = () => {
    setStatus("DELIVERED");
    toast("Errand delivered!");
    state.activeErrandId = null;
    setTimeout(() => navigate("/home"), 1500);
  };
  socketManager.on("errand:accepted", onAccepted);
  socketManager.on("errand:shopping", onShopping);
  socketManager.on("errand:onTheWay", onOnTheWay);
  socketManager.on("errand:delivered", onDelivered);

  return () => {
    socketManager.off("errand:accepted", onAccepted);
    socketManager.off("errand:shopping", onShopping);
    socketManager.off("errand:onTheWay", onOnTheWay);
    socketManager.off("errand:delivered", onDelivered);
  };
}
