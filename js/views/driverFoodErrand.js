// Nova X Rides — driver-side Food & Errand queue: incoming offer countdown
// + step-through progress screens. Mirrors driverHome.js's
// renderIncomingOffer/renderTripProgress shape exactly, just pointed at the
// food-orders/errands endpoints instead of trips.
import { api } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, fmtMoney } from "../ui.js";
import { navigate } from "../router.js";

function renderOfferCountdown(root, { badge, onAccept, onDecline, id, fallbackPath }) {
  let seconds = 15;
  root.innerHTML = `
    <div class="page flex-col items-center text-center" style="height:100dvh; justify-content:center;">
      <span class="badge badge-accent mb-4">${badge}</span>
      <h1 style="font-size:48px;" id="countdown">${seconds}</h1>
      <p class="text-secondary mb-8">seconds to respond</p>
      <button id="acceptBtn" class="btn btn-primary btn-block mb-3">${icon("check", 18)} Accept</button>
      <button id="declineBtn" class="btn btn-secondary btn-block">Decline</button>
    </div>
  `;
  if (!id) { navigate(fallbackPath); return; }

  const countdownEl = root.querySelector("#countdown");
  const timer = setInterval(() => {
    seconds--;
    countdownEl.textContent = seconds;
    if (seconds <= 0) { clearInterval(timer); navigate(fallbackPath); }
  }, 1000);

  root.querySelector("#acceptBtn").addEventListener("click", async () => {
    clearInterval(timer);
    try { await onAccept(); } catch (err) { toast(err.message || "Offer expired", true); navigate(fallbackPath); }
  });
  root.querySelector("#declineBtn").addEventListener("click", async () => {
    clearInterval(timer);
    try { await onDecline(); } catch (e) { console.warn(e); }
    navigate(fallbackPath);
  });

  return () => clearInterval(timer);
}

export function renderFoodOfferIncoming(root) {
  const orderId = state.offerFoodOrderId;
  return renderOfferCountdown(root, {
    badge: "New Food Delivery",
    id: orderId,
    fallbackPath: "/driver/home",
    onAccept: async () => {
      await api.acceptFoodOffer(orderId);
      state.activeFoodOrderId = orderId;
      state.offerFoodOrderId = null;
      navigate("/driver/food-progress");
    },
    onDecline: async () => {
      await api.declineFoodOffer(orderId);
      state.offerFoodOrderId = null;
    },
  });
}

const FOOD_DRIVER_STEPS = [
  { action: "picked-up", label: "Picked up from restaurant", btn: "Confirm Pickup" },
  { action: "delivered", label: "Delivered to customer", btn: "Mark Delivered" },
];

export function renderFoodOrderProgress(root) {
  const orderId = state.activeFoodOrderId;
  let stepIndex = 0;
  root.innerHTML = `
    <div class="page nx-stagger">
      <h1 class="text-xl mb-6">Food Delivery in Progress</h1>
      <div class="radar-field" style="height:180px; border-radius:var(--r-lg); margin-bottom:24px; display:flex; align-items:center; justify-content:center;">
        <div class="radar-sweep"></div>
        <div class="pulse-dot" style="position:relative; z-index:1;"></div>
      </div>
      <div id="orderCard" class="card mb-6">${skeletonRow()}</div>
      <button id="chatBtn" class="btn btn-secondary btn-block mb-3">${icon("chat", 18)} Message Customer</button>
      <button id="actionBtn" class="btn btn-primary btn-block" disabled>${FOOD_DRIVER_STEPS[0].btn}</button>
    </div>
  `;
  if (!orderId) { navigate("/driver/home"); return; }

  root.querySelector("#chatBtn").addEventListener("click", () => {
    state.chatContext = { contextType: "FOOD_ORDER", contextId: orderId, otherPartyLabel: "Customer" };
    navigate("/chat-thread");
  });

  const orderCard = root.querySelector("#orderCard");
  const btn = root.querySelector("#actionBtn");

  api.getFoodOrder(orderId).then((order) => {
    stepIndex = order.status === "PICKED_UP" ? 1 : 0;
    drawOrderCard(order, stepIndex);
    btn.disabled = false;
    btn.textContent = FOOD_DRIVER_STEPS[stepIndex].btn;
  }).catch(() => {
    orderCard.innerHTML = `<p class="text-secondary text-sm">Head to the restaurant, then deliver to the customer's address.</p>`;
    btn.disabled = false;
  });

  function drawOrderCard(order, step) {
    const shortId = (order.id || "").slice(0, 8).toUpperCase();
    orderCard.innerHTML = `
      <div class="flex justify-between items-center mb-3">
        <span class="badge badge-accent">Order #${shortId}</span>
        <span class="font-bold text-accent">${fmtMoney(order.total)}</span>
      </div>
      <div class="flex items-start gap-3 mb-3">
        <div class="list-row-icon">${icon(step === 0 ? "store" : "map-pin", 18)}</div>
        <div style="flex:1;">
          <p class="text-xs text-muted">${step === 0 ? "Pick up from" : "Deliver to"}</p>
          <p class="text-sm font-bold" style="color:var(--text-primary);">${step === 0 ? (order.restaurant?.name || "Restaurant") : "Customer"}</p>
          <p class="text-xs text-secondary">${step === 0 ? (order.restaurant?.address || "") : order.dropoffLabel}</p>
        </div>
      </div>
      ${order.notes ? `<div class="pending-flag" style="margin-bottom:0;"><span>${icon("bolt", 14)}</span><span>${order.notes}</span></div>` : ""}
    `;
  }

  btn.addEventListener("click", async () => {
    const step = FOOD_DRIVER_STEPS[stepIndex];
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      if (step.action === "picked-up") await api.markFoodPickedUp(orderId);
      else await api.markFoodDelivered(orderId);

      stepIndex++;
      if (stepIndex >= FOOD_DRIVER_STEPS.length) {
        toast("Order delivered!");
        state.activeFoodOrderId = null;
        navigate("/driver/earnings");
        return;
      }
      try {
        const order = await api.getFoodOrder(orderId);
        drawOrderCard(order, stepIndex);
      } catch { /* non-fatal — card just won't flip to the dropoff view */ }
      btn.disabled = false;
      btn.textContent = FOOD_DRIVER_STEPS[stepIndex].btn;
    } catch (err) {
      toast(err.message || "Action failed", true);
      btn.disabled = false;
      btn.textContent = FOOD_DRIVER_STEPS[stepIndex].btn;
    }
  });
}

function skeletonRow() {
  return `<div class="skeleton" style="height:60px; border-radius:var(--r-md);"></div>`;
}

export function renderErrandOfferIncoming(root) {
  const errandId = state.offerErrandId;
  return renderOfferCountdown(root, {
    badge: "New Pick & Deliver Errand",
    id: errandId,
    fallbackPath: "/driver/home",
    onAccept: async () => {
      await api.acceptErrandOffer(errandId);
      state.activeErrandId = errandId;
      state.offerErrandId = null;
      navigate("/driver/errand-progress");
    },
    onDecline: async () => {
      await api.declineErrandOffer(errandId);
      state.offerErrandId = null;
    },
  });
}

export function renderErrandProgress(root) {
  const errandId = state.activeErrandId;
  let phase = "SHOPPING"; // SHOPPING -> ON_THE_WAY -> DELIVERED

  root.innerHTML = `
    <div class="page nx-stagger">
      <h1 class="text-xl mb-6">Errand in Progress</h1>
      <div class="radar-field" style="height:200px; border-radius:var(--r-lg); margin-bottom:24px; display:flex; align-items:center; justify-content:center;">
        <div class="radar-sweep"></div>
        <div class="pulse-dot" style="position:relative; z-index:1;"></div>
      </div>
      <div id="stepContent"></div>
    </div>
  `;
  if (!errandId) { navigate("/driver/home"); return; }

  const stepContent = root.querySelector("#stepContent");

  function drawShopping() {
    stepContent.innerHTML = `
      <div class="card mb-6">
        <p class="text-secondary text-sm">Head to the store and pick up everything on the requester's list.</p>
      </div>
      <button id="startBtn" class="btn btn-primary btn-block mb-3">Start Shopping</button>
      <button id="reportBtn" class="btn btn-secondary btn-block">Done Shopping — Report Spend</button>
    `;
    root.querySelector("#startBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await api.startErrandShopping(errandId); toast("Marked as shopping"); }
      catch (err) { toast(err.message || "Couldn't update", true); btn.disabled = false; }
    });
    root.querySelector("#reportBtn").addEventListener("click", drawReportSpend);
  }

  function drawReportSpend() {
    stepContent.innerHTML = `
      <label class="field-label">What did you actually spend? (Rs.)</label>
      <input id="spendInput" class="input mb-4" type="number" placeholder="1840"/>
      <button id="onWayBtn" class="btn btn-primary btn-block">Confirm & Head Out ${icon("arrow-forward", 18)}</button>
    `;
    root.querySelector("#onWayBtn").addEventListener("click", async (e) => {
      const actualSpend = Number(root.querySelector("#spendInput").value);
      if (!actualSpend || actualSpend < 0) { toast("Enter what you spent", true); return; }
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        await api.markErrandOnTheWay(errandId, actualSpend);
        phase = "ON_THE_WAY";
        drawOnTheWay(actualSpend);
      } catch (err) {
        toast(err.message || "Couldn't update", true);
        btn.disabled = false;
        btn.innerHTML = `Confirm & Head Out ${icon("arrow-forward", 18)}`;
      }
    });
  }

  function drawOnTheWay(actualSpend) {
    stepContent.innerHTML = `
      <div class="card mb-6">
        <div class="flex justify-between mb-2"><span class="text-secondary text-sm">Items spend</span><span class="font-bold">${fmtMoney(actualSpend)}</span></div>
        <p class="text-secondary text-sm">On your way — deliver to the requester's address.</p>
      </div>
      <button id="deliveredBtn" class="btn btn-primary btn-block">Mark Delivered</button>
    `;
    root.querySelector("#deliveredBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        await api.markErrandDelivered(errandId);
        toast("Errand delivered!");
        state.activeErrandId = null;
        navigate("/driver/earnings");
      } catch (err) {
        toast(err.message || "Action failed", true);
        btn.disabled = false;
        btn.textContent = "Mark Delivered";
      }
    });
  }

  drawShopping();
}
