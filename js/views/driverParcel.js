// Nova Go Rides — driver-side parcels.
//
// WHY THIS FILE DID NOT EXIST, AND WHAT THAT COST
//
// The backend has dispatched parcels to drivers since the delivery module
// shipped: delivery.service.ts picks the nearest available rider, marks the
// delivery MATCHING, and emits "delivery:offer" to them. The driver app never
// subscribed to that event. There was no route, no screen and no state key
// for it — so every parcel a customer booked was offered to a rider who could
// not see it, timed out after fifteen seconds, cascaded to the next rider,
// and eventually ran out of riders and failed to match.
//
// From the customer's side that is "nobody ever accepts my parcels". From the
// driver's side it is "this app never gives me parcel jobs". Both were true,
// and neither was visible in any log, because nothing errored.
//
// A parcel is NOT a ride with different words, which is why this is its own
// file rather than a flag inside the trip screens:
//
//   - There is no passenger. The person at the pickup and the person at the
//     drop-off are two different people, and the driver has to call both.
//   - The steps differ: collect, then carry, then hand over. There is no
//     "start trip" — the parcel does not get in.
//   - Cash on delivery. If the sender set a COD amount, the driver collects
//     that money from the recipient and owes it back to Nova Go. It is the
//     driver's own money at risk until they settle, so it is the loudest
//     thing on both the offer and the progress screen. Discovering it after
//     accepting would be indefensible.
import { api } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, esc, fmtMoney, alertUser } from "../ui.js";
import { navigate } from "../router.js";
import { haptic } from "../haptics.js";
import { track } from "../analytics.js";
import { createMap } from "../map.js";
import { reportHandled } from "../errors.js";

/* ------------------------------------------------------------- offer --- */

export function renderParcelOffer(root) {
  const deliveryId = state.offerDeliveryId;
  const offer = state.incomingDeliveryOffer || {};
  const total = 15;
  let seconds = total;

  const fare = offer.fare != null ? Number(offer.fare) : null;
  const cod = Number(offer.codAmount) > 0 ? Number(offer.codAmount) : 0;

  root.innerHTML = `
    <div class="nx-offer${cod > 0 ? " has-tip" : ""}">
      <div class="nx-offer-head">
        <!-- JOB TYPE FIRST. A rider deciding in fifteen seconds needs to know
             what kind of work this is before they read the number: a parcel
             with cash to collect is a different decision to a passenger. -->
        <span class="nx-offer-kind">${icon("package", 14)} Parcel delivery</span>
        ${cod > 0 ? `<span class="nx-offer-fast">${icon("wallet", 13)} Collect ${fmtMoney(cod)}</span>` : ""}
      </div>

      <div class="nx-offer-body">
        <p class="nx-offer-label">You earn</p>
        <h1 class="nx-offer-amount">${fare != null ? fmtMoney(fare) : "—"}</h1>
        ${cod > 0 ? `
          <p class="nx-offer-breakdown">
            You also collect ${fmtMoney(cod)} in cash from the recipient — that money
            is Nova Go's, and you settle it later.
          </p>` : ""}

        <div class="nx-offer-facts">
          <div>
            <span class="k">Distance</span>
            <span class="v">${offer.distanceKm != null ? `${Number(offer.distanceKm).toFixed(1)} km` : "—"}</span>
          </div>
          <div>
            <span class="k">Deliver to</span>
            <span class="v">${esc(offer.recipientName || "Recipient")}</span>
          </div>
        </div>
        ${offer.parcelNote ? `<p class="nx-offer-breakdown">"${esc(offer.parcelNote)}"</p>` : ""}
      </div>

      <div class="nx-offer-actions">
        <button id="acceptBtn" class="nx-offer-accept">
          <span class="nx-offer-accept-fill" id="ring"></span>
          <span class="nx-offer-accept-text">
            ${icon("check", 22)} Accept${fare != null ? ` · ${fmtMoney(fare)}` : ""}
            <em id="countdown">${seconds}s</em>
          </span>
        </button>
        <button id="declineBtn" class="nx-offer-decline">Decline</button>
      </div>
    </div>
  `;

  if (!deliveryId) { navigate("/driver/home"); return; }

  const countdownEl = root.querySelector("#countdown");
  const ring = root.querySelector("#ring");
  const timer = setInterval(() => {
    seconds -= 1;
    countdownEl.textContent = `${seconds}s`;
    if (ring) ring.style.width = `${(seconds / total) * 100}%`;
    if (seconds <= 0) { clearInterval(timer); clearOffer(); navigate("/driver/home"); }
  }, 1000);

  function clearOffer() {
    state.offerDeliveryId = null;
    state.incomingDeliveryOffer = null;
  }

  root.querySelector("#acceptBtn").addEventListener("click", async () => {
    clearInterval(timer);
    haptic.medium();
    try {
      await api.acceptDelivery(deliveryId);
      track("driver_accepted_parcel", { deliveryId });
      state.activeDeliveryId = deliveryId;
      clearOffer();
      navigate("/driver/parcel-progress");
    } catch (err) {
      reportHandled(err, "parcel-accept");
      toast(err.message || "That parcel was taken by someone else", true);
      clearOffer();
      navigate("/driver/home");
    }
  });

  root.querySelector("#declineBtn").addEventListener("click", async () => {
    clearInterval(timer);
    try { await api.declineDelivery(deliveryId); } catch (e) { console.warn(e); }
    clearOffer();
    navigate("/driver/home");
  });

  return () => clearInterval(timer);
}

/* ---------------------------------------------------------- progress --- */

/* Collect, carry, hand over. Deliberately not the trip's
   arrive/start/complete: a parcel does not get in, and "in transit" is a real
   state a sender watches for. */
const STEPS = [
  { action: "pickup", btn: "Collected the parcel", hint: "Tap once the parcel is in your hands." },
  { action: "in-transit", btn: "On my way to drop-off", hint: "Lets the sender track you to the recipient." },
  { action: "deliver", btn: "Handed over", hint: "Tap once the recipient has the parcel." },
];

export function renderParcelProgress(root) {
  const deliveryId = state.activeDeliveryId;
  let stepIndex = 0;
  let mapHandle = null;
  let destroyed = false;
  let delivery = null;

  root.innerHTML = `
    <div class="map-screen">
      <div class="nx-map" id="mapEl"></div>
      <button id="sosBtn" class="map-fab danger" style="top:calc(14px + var(--safe-top)); right:14px;">${icon("sos", 20)}</button>
      <div class="dock-sheet">
        <div class="sheet-handle"></div>
        <div id="sheetBody"></div>
      </div>
    </div>
  `;
  if (!deliveryId) { navigate("/driver/home"); return; }

  const body = root.querySelector("#sheetBody");

  function draw() {
    const step = STEPS[stepIndex];
    const cod = Number(delivery?.codAmount) > 0 ? Number(delivery.codAmount) : 0;
    // Which end of the job the driver is at decides who they need to phone.
    const atPickup = stepIndex === 0;
    const contactName = atPickup ? (delivery?.sender?.name || "Sender") : (delivery?.recipientName || "Recipient");
    const contactPhone = atPickup ? delivery?.sender?.phone : delivery?.recipientPhone;

    body.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <span class="badge badge-accent">${icon("package", 12)} Parcel</span>
        <span class="ref-id">#${esc(deliveryId.slice(0, 8).toUpperCase())}</span>
      </div>

      <div class="nx-step-rail mb-3">
        ${STEPS.map((s, i) => `
          <span class="nx-step-dot${i < stepIndex ? " done" : i === stepIndex ? " now" : ""}"></span>
        `).join("")}
      </div>

      ${cod > 0 ? `
        <div class="nx-cod-strip mb-3">
          ${icon("wallet", 16)}
          <span>
            <b>Collect ${fmtMoney(cod)} in cash</b> from ${esc(delivery?.recipientName || "the recipient")}.
            You owe this to Nova Go — settle it from Earnings.
          </span>
        </div>` : ""}

      <div class="flex-col gap-1 mb-3" style="border-top:1px solid var(--surface-border); padding-top:var(--sp-3);">
        <p class="text-sm"><span class="text-muted text-xs">Collect from</span><br/>${esc(delivery?.pickupLabel || "Pickup point")}</p>
        <p class="text-sm mt-2"><span class="text-muted text-xs">Deliver to</span><br/>${esc(delivery?.dropoffLabel || "Drop-off point")}</p>
        ${delivery?.parcelNote ? `<p class="text-xs text-muted mt-2">"${esc(delivery.parcelNote)}"</p>` : ""}
      </div>

      ${contactPhone ? `
        <a id="callBtn" class="btn btn-primary btn-block mb-2" href="tel:${esc(contactPhone)}">
          ${icon("phone", 18)} Call ${esc(String(contactName).split(" ")[0])}
        </a>` : ""}
      <div class="flex gap-2 mb-3">
        <button id="chatBtn" class="btn btn-secondary" style="flex:1;">${icon("chat", 18)} Message</button>
        <button id="supportBtn" class="btn btn-secondary" style="flex:1;">${icon("bolt", 18)} Support</button>
      </div>

      <button id="actionBtn" class="btn btn-primary btn-block" style="height:56px;">${step.btn}</button>
      <p class="text-xs text-muted text-center mt-2">${esc(step.hint)}</p>
    `;

    body.querySelector("#callBtn")?.addEventListener("click", () => {
      haptic.medium();
      track("driver_called_parcel_contact", { deliveryId, at: atPickup ? "pickup" : "dropoff" });
    });
    body.querySelector("#chatBtn").addEventListener("click", () => {
      state.chatContext = {
        contextType: "DELIVERY",
        contextId: deliveryId,
        otherPartyLabel: delivery?.sender?.name || "Sender",
      };
      navigate("/chat-thread");
    });
    body.querySelector("#supportBtn").addEventListener("click", () => navigate("/support"));

    body.querySelector("#actionBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const s = STEPS[stepIndex];
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        if (s.action === "pickup") await api.pickupDelivery(deliveryId);
        else if (s.action === "in-transit") await api.inTransitDelivery(deliveryId);
        else await api.deliverDelivery(deliveryId);

        haptic.medium();
        stepIndex += 1;
        if (stepIndex >= STEPS.length) {
          state.activeDeliveryId = null;
          if (cod > 0) {
            alertUser(`Delivered. You're holding ${fmtMoney(cod)} of Nova Go's cash.`, {
              suggestion: "Settle it from Earnings so your account keeps taking jobs.",
              tone: "warn",
            });
          } else {
            toast("Parcel delivered");
          }
          navigate("/driver/earnings");
          return;
        }
        draw();
      } catch (err) {
        reportHandled(err, "parcel-step", { step: s.action });
        toast(err.message || "That didn't go through — try again", true);
        btn.disabled = false;
        btn.textContent = s.btn;
      }
    });
  }

  draw();

  api.getDelivery(deliveryId)
    .then((d) => {
      if (destroyed) return;
      delivery = d;
      // Resume where the job actually is, not where this screen was opened.
      // A driver who backgrounds the app mid-parcel must not be asked to
      // collect a parcel they are already carrying.
      const byStatus = { MATCHED: 0, ACCEPTED: 0, PICKED_UP: 1, IN_TRANSIT: 2 };
      if (byStatus[d.status] != null) stepIndex = byStatus[d.status];
      draw();

      if (d.pickupLat != null) drawMap(d);
    })
    .catch((err) => reportHandled(err, "parcel-load"));

  /** Both ends of the job on one map, framed above the sheet. */
  async function drawMap(d) {
    try {
      const el = root.querySelector("#mapEl");
      if (!el) return;
      mapHandle = await createMap(el, { center: { lat: d.pickupLat, lng: d.pickupLng }, zoom: 14 });
      if (destroyed) { mapHandle.destroy(); return; }
      const p = { lat: d.pickupLat, lng: d.pickupLng };
      const q = { lat: d.dropoffLat, lng: d.dropoffLng };
      mapHandle.setPickup(p);
      mapHandle.setDropoff(q);
      mapHandle.setRoute([p, q]);
      // Bottom padding clears the dock sheet — otherwise the drop-off pin
      // sits underneath it and the driver never sees where they're going.
      mapHandle.fit([p, q], [70, 300]);
    } catch (err) {
      reportHandled(err, "parcel-map");
    }
  }

  root.querySelector("#sosBtn").addEventListener("click", () => navigate("/support"));

  return () => {
    destroyed = true;
    mapHandle?.destroy?.();
  };
}
