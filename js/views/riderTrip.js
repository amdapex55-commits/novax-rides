// Nova Go Rides — active trip tracking (live socket) + rate trip.
import { api } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, confettiBurst } from "../ui.js";
import { navigate } from "../router.js";
import { socketManager } from "../socket.js";
import { savePlace, listSavedPlaces } from "../savedPlaces.js";
import { haptic } from "../haptics.js";
import { track } from "../analytics.js";

const STATUS_COPY = {
  REQUESTED: "Looking for a driver...",
  MATCHING: "Looking for a driver...",
  MATCHED: "Driver is on the way",
  IN_PROGRESS: "Trip in progress",
  COMPLETED: "Trip completed",
  CANCELLED: "Trip cancelled",
};

export function renderActiveTracking(root) {
  const tripId = state.activeTripId;
  root.innerHTML = `
    <div style="position:relative;">
      <div class="radar-field" style="height:340px; display:flex; align-items:center; justify-content:center;">
        <div class="radar-sweep"></div>
        <div class="pulse-dot" style="position:relative; z-index:1;"></div>
      </div>
      <button id="backBtn" class="btn-icon" style="position:absolute; top:calc(16px + env(safe-area-inset-top)); left:16px; background:var(--bg-elevated);">${icon("arrow-back", 20)}</button>
      <button id="sosBtn" class="btn btn-danger btn-sm" style="position:absolute; top:calc(16px + env(safe-area-inset-top)); right:16px;">${icon("sos", 16)} SOS</button>
    </div>
    <div class="page" style="margin-top:-24px; position:relative; z-index:2;">
      <div class="card-elevated" style="border-radius:var(--r-xl);">
        <div class="flex justify-between items-center mb-2">
          <span class="badge badge-accent" id="statusBadge">Loading...</span>
          <span class="text-xs text-muted" id="tripIdLabel">${tripId ? "#" + tripId.slice(0, 8) : ""}</span>
        </div>
        <p class="text-lg font-bold mb-4" id="statusText">Connecting...</p>
        <div class="flex justify-between text-sm text-secondary mb-1">
          <span>${state.pickup?.label || "Pickup"}</span>
        </div>
        <div class="flex justify-between text-sm text-secondary mb-4">
          <span>${state.dropoff?.label || "Drop-off"}</span>
        </div>
        <button id="chatBtn" class="btn btn-secondary btn-block mb-3 hidden">${icon("chat", 18)} Message Driver</button>
        <button id="cancelTripBtn" class="btn btn-danger btn-block">Cancel Trip</button>
      </div>
    </div>
  `;

  if (!tripId) {
    toast("No active trip found", true);
    navigate("/home");
    return;
  }

  root.querySelector("#backBtn").addEventListener("click", () => navigate("/home"));
  root.querySelector("#sosBtn").addEventListener("click", () => toast("Emergency contact calling isn't wired yet — real backend gap, flagged in README"));

  const statusBadge = root.querySelector("#statusBadge");
  const statusText = root.querySelector("#statusText");
  const cancelBtn = root.querySelector("#cancelTripBtn");
  const chatBtn = root.querySelector("#chatBtn");

  const statusCard = root.querySelector(".card-elevated");
  function setStatus(status) {
    statusBadge.textContent = status;
    statusText.textContent = STATUS_COPY[status] || status;
    statusCard.classList.remove("success-pulse");
    void statusCard.offsetWidth;
    statusCard.classList.add("success-pulse");
    // A driver is only actually assigned once the trip has moved past
    // matching — chatting before that has nobody on the other end.
    chatBtn.classList.toggle("hidden", !["MATCHED", "IN_PROGRESS"].includes(status));
  }
  chatBtn.addEventListener("click", () => {
    state.chatContext = { contextType: "TRIP", contextId: tripId, otherPartyLabel: "Your driver" };
    navigate("/chat-thread");
  });

  api.getTrip(tripId).then((trip) => setStatus(trip.status)).catch(() => setStatus("REQUESTED"));

  // connect() is async (the library is fetched on demand), so subscribe
  // once it resolves rather than on a Promise object.
  socketManager.connect().then((socket) => {
    socket?.emit("trip:subscribe", { tripId });
  });

  const onMatched = () => setStatus("MATCHED");
  const onArrived = () => { statusText.textContent = "Driver has arrived"; };
  const onStarted = () => setStatus("IN_PROGRESS");
  const onLocation = () => {
    const dot = root.querySelector(".pulse-dot");
    if (dot) { dot.style.transform = "scale(1.3)"; setTimeout(() => (dot.style.transform = ""), 250); }
  };
  const onCompleted = () => {
    toast("Trip completed!");
    setTimeout(() => navigate("/rate"), 800);
  };
  const onCancelled = () => {
    toast("Trip was cancelled");
    state.activeTripId = null;
    setTimeout(() => navigate("/home"), 1000);
  };

  socketManager.on("trip:matched", onMatched);
  socketManager.on("trip:driverArrived", onArrived);
  socketManager.on("trip:started", onStarted);
  socketManager.on("trip:driverLocation", onLocation);
  socketManager.on("trip:completed", onCompleted);
  socketManager.on("trip:cancelled", onCancelled);

  cancelBtn.addEventListener("click", async () => {
    cancelBtn.disabled = true;
    try {
      await api.cancelTrip(tripId);
      state.activeTripId = null;
      toast("Trip cancelled");
      navigate("/home");
    } catch (err) {
      toast(err.message || "Couldn't cancel", true);
      cancelBtn.disabled = false;
    }
  });

  return () => {
    socket?.emit("trip:unsubscribe", { tripId });
    socketManager.off("trip:matched", onMatched);
    socketManager.off("trip:driverArrived", onArrived);
    socketManager.off("trip:started", onStarted);
    socketManager.off("trip:driverLocation", onLocation);
    socketManager.off("trip:completed", onCompleted);
    socketManager.off("trip:cancelled", onCancelled);
  };
}

export function renderRateTrip(root) {
  const tripId = state.activeTripId;
  let score = 5;
  root.innerHTML = `
    <div class="page flex-col items-center" style="height:100dvh; justify-content:center;">
      <div style="width:72px;height:72px;border-radius:50%;background:rgba(46,230,166,0.12);display:flex;align-items:center;justify-content:center;color:var(--success);margin-bottom:20px;">
        ${icon("check-circle", 36)}
      </div>
      <h1 class="text-xl mb-2">Trip Completed</h1>

      <!-- WHAT TO ACTUALLY HAND OVER.
           This is a cash business and the payment happens ten seconds from
           now, on a kerb, between two people who do not have change. The
           customer knows the fare; what they do not know is whether to round
           up, and asking "keep the change?" out loud is awkward enough that
           most people either underpay the goodwill or overpay by accident.
           Naming the round number turns it into a tap.

           Nothing is charged here and nothing is sent to the server — there
           is no card, and pretending to process a tip we cannot collect
           would be worse than useless. This is advice about the notes in
           their hand, which is exactly what the moment needs. -->
      <div id="cashCard" class="mb-5" style="width:100%;" hidden></div>

      <p class="text-secondary mb-6">How was your ride?</p>
      <div class="flex gap-2 mb-8" id="stars">
        ${Array.from({ length: 5 }).map((_, i) => `<button data-star="${i + 1}" style="color:${i < 5 ? "var(--warning)" : "var(--surface-border)"};">${icon("star", 36)}</button>`).join("")}
      </div>
      <!-- Offer to save the destination, here and nowhere else. This is the
           one moment we know the address was real: a rider actually took them
           there. Asking at booking time would be asking someone to configure
           the app before they've used it. -->
      <div class="nx-save-place" id="savePlacePrompt" hidden>
        <span style="color:var(--text-muted);">${icon("location", 18)}</span>
        <span class="text-xs" style="flex:1;min-width:0;">
          Save <strong id="savePlaceLabel"></strong> for next time?
        </span>
        <span class="nx-save-place-actions">
          <button data-save="home">Home</button>
          <button data-save="work">Work</button>
        </span>
      </div>

      <button id="submitBtn" class="btn btn-primary btn-block mt-4">Submit Rating</button>
      <button id="skipBtn" class="btn btn-ghost btn-block mt-2">Skip</button>
    </div>
  `;
  /* Only offer to save a destination we actually have, and only if it isn't
     saved already — otherwise a regular commuter is asked the same question
     after every single trip. */
  const dropoff = state.dropoff;
  const prompt = root.querySelector("#savePlacePrompt");
  if (dropoff?.lat != null && dropoff?.label) {
    const already = listSavedPlaces().some(
      (pl) => pl.lat === dropoff.lat && pl.lng === dropoff.lng,
    );
    if (!already) {
      prompt.hidden = false;
      root.querySelector("#savePlaceLabel").textContent = dropoff.label;
      prompt.querySelectorAll("[data-save]").forEach((b) =>
        b.addEventListener("click", () => {
          haptic.light();
          savePlace(b.dataset.save, dropoff);
          track("place_saved", { kind: b.dataset.save });
          prompt.innerHTML = `<span class="text-xs" style="color:var(--success);font-weight:800;">
            ${icon("check-circle", 16)} Saved as ${b.dataset.save === "home" ? "Home" : "Work"}
          </span>`;
        }),
      );
    }
  }

  paintCashCard(root.querySelector("#cashCard"), state.lastFare);

  const stars = Array.from(root.querySelectorAll("#stars button"));
  function paint() {
    stars.forEach((s, i) => { s.style.color = i < score ? "var(--warning)" : "var(--surface-border)"; });
  }
  stars.forEach((s) => s.addEventListener("click", () => { score = Number(s.dataset.star); paint(); }));
  paint();

  function finish() {
    state.activeTripId = null;
    navigate("/home");
  }

  root.querySelector("#submitBtn").addEventListener("click", async (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    confettiBurst(rect.left + rect.width / 2, rect.top);
    if (tripId) {
      try { await api.rateTrip(tripId, score); } catch (err) { console.warn("[NovaGo] rate failed", err); }
    }
    toast("Thanks for rating!");
    setTimeout(finish, 900);
  });
  root.querySelector("#skipBtn").addEventListener("click", finish);
}


/* ------------------------------------------------------------------ cash ---

   Round-up amounts are the ones a real wallet can produce: the next 10, and
   the next 50. Anything finer is not payable in notes, and anything larger
   stops being a tip and starts being a second fare.

   Shown only when we know the fare. A card that says "pay Rs 0" is worse
   than no card. */
function paintCashCard(el, fare) {
  if (!el) return;
  const amount = Math.ceil(Number(fare) || 0);
  if (!amount) return;

  const up10 = Math.ceil(amount / 10) * 10;
  const up50 = Math.ceil(amount / 50) * 50;
  // De-duplicate: a Rs 200 fare rounds to 200 both ways, and offering the
  // same number twice makes the choice look broken.
  const options = [...new Set([amount, up10, up50])].filter((v) => v >= amount).slice(0, 3);

  el.hidden = false;
  el.innerHTML = `
    <div class="nx-fare-hero">
      <p class="nx-fare-label">Pay your rider in cash</p>
      <p class="nx-fare-amount">Rs. ${amount}</p>
      ${options.length > 1 ? `
        <p class="text-xs text-secondary" style="margin-top:8px;">
          Rounding up is the usual courtesy here — it is never expected.
        </p>
        <div class="nx-roundup" id="roundup">
          ${options.map((v, i) => `
            <button class="nx-roundup-btn${i === 0 ? " selected" : ""}" data-amount="${v}">
              Rs ${v}${v > amount ? `<br><span style="font-weight:600;font-size:10.5px;opacity:0.75;">+${v - amount} tip</span>` : `<br><span style="font-weight:600;font-size:10.5px;opacity:0.75;">exact</span>`}
            </button>`).join("")}
        </div>
        <p class="text-xs text-muted" id="roundupHint" style="margin-top:8px;">
          Hand over the exact fare.
        </p>` : ""}
    </div>`;

  const group = el.querySelector("#roundup");
  const hint = el.querySelector("#roundupHint");
  group?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-amount]");
    if (!btn) return;
    haptic.light();
    group.querySelectorAll("[data-amount]").forEach((b) => b.classList.toggle("selected", b === btn));
    const chosen = Number(btn.dataset.amount);
    const tip = chosen - amount;
    hint.textContent = tip > 0
      ? `Hand over Rs ${chosen} and tell them to keep the change.`
      : "Hand over the exact fare.";
    track("cash_roundup_selected", { tip });
  });
}
