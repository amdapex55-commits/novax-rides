// Nova Go — "how does the money work" screens.
//
// Drivers and restaurants both ask the same question before they sign up:
// what do I actually keep? Answering it plainly, in the app, with the real
// numbers, is the cheapest trust you can buy — and it removes the single
// most common support call.
import { icon } from "../icons.js";
import { PRICING } from "../launch.config.js";
import { navigate } from "../router.js";
import {
  COMMERCIALS, SUPPORT, SUPPORT_STATUS, whatsappLink, phoneLink, emailLink,
} from "../support.config.js";

const { driverCommissionPct, foodDeliveryFeePct, restaurantCommissionPct, payoutSchedule } = COMMERCIALS;

/**
 * "Ask a human" block. Every channel is conditional on being configured —
 * if WhatsApp isn't set up yet the button simply isn't there, and the
 * in-app ticket (which posts to our own backend, so it always works)
 * takes over as the primary route.
 */
function askBlock(prefill, { title = "Still not clear?", note = "We'd rather explain it than have you guess." } = {}) {
  const wa = whatsappLink(prefill);
  return `
    <div class="card mt-6">
      <p class="font-bold text-sm mb-1">${title}</p>
      <p class="text-secondary text-sm mb-3">${note}</p>
      ${wa ? `<a href="${wa}" target="_blank" rel="noopener"
             class="btn btn-secondary btn-block">${icon("chat", 18)} Ask on WhatsApp</a>`
           : `<button class="btn btn-secondary btn-block" data-support-ticket>
                ${icon("chat", 18)} Message the Nova Go team
              </button>`}
    </div>`;
}

function page(title, bodyHtml) {
  return (root) => {
    root.innerHTML = `
      <div class="page nx-stagger">
        <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
        <h1 class="text-xl mb-4">${title}</h1>
        ${bodyHtml}
        ${askBlock("Hi Nova Go — I have a question about payments")}
      </div>
    `;
    root.querySelector("#backBtn").addEventListener("click", () => history.back());
    root.querySelectorAll("[data-support-ticket]").forEach((b) =>
      b.addEventListener("click", () => { location.hash = "/chat"; }));
  };
}

// --------------------------------------------------------------------------

export const renderDriverEarningsExplainer = page("How you get paid", `
  <div class="card-elevated mb-4">
    <p class="text-secondary text-xs mb-1">You keep</p>
    <h2 style="font-size:36px; color:var(--accent);">${100 - driverCommissionPct}%</h2>
    <p class="text-secondary text-sm mt-1">of every ride and parcel fare</p>
  </div>

  <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">A real example</h3>
  <div class="card mb-5">
    <div class="flex justify-between mb-2"><span class="text-sm text-secondary">Rider pays you (cash)</span><span class="font-bold">Rs. 300</span></div>
    <div class="flex justify-between mb-2"><span class="text-sm text-secondary">Nova Go commission (${driverCommissionPct}%)</span><span class="font-bold" style="color:var(--error);">− Rs. ${Math.round(300 * driverCommissionPct / 100)}</span></div>
    <div class="flex justify-between" style="border-top:1px solid var(--surface-border); padding-top:var(--sp-3);">
      <span class="font-bold">You keep</span><span class="font-bold" style="color:var(--accent);">Rs. ${300 - Math.round(300 * driverCommissionPct / 100)}</span>
    </div>
  </div>

  <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">How the cash actually moves</h3>
  <div class="flex-col gap-2 mb-5">
    ${[
      { n: "1", t: "The rider pays you in cash", s: "The full fare, directly, at the end of the trip." },
      { n: "2", t: "You keep it", s: "The money is in your pocket immediately — nothing to wait for." },
      { n: "3", t: `We settle commission ${payoutSchedule}`, s: "Your app shows a running balance of what's owed. You pay that, not the other way round." },
    ].map((s) => `
      <div class="list-row" style="background:var(--surface); border-radius:var(--r-md); align-items:flex-start;">
        <div class="list-row-icon" style="background:var(--brand-ride-soft); color:var(--accent); font-weight:800;">${s.n}</div>
        <div style="flex:1;">
          <p class="font-bold text-sm">${s.t}</p>
          <p class="text-secondary text-xs mt-1">${s.s}</p>
        </div>
      </div>`).join("")}
  </div>

  <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">Food deliveries</h3>
  <p class="text-secondary text-sm mb-4">
    For food orders you earn the <b>delivery fee</b>, minus ${foodDeliveryFeePct}% commission. The cost of the food itself
    goes to the restaurant — you're collecting it on their behalf, not earning it.
  </p>

  <div class="pending-flag">
    <span>${icon("bolt", 14)}</span>
    <span>No hidden deductions. No joining fee. No charge for being online.</span>
  </div>
`);

// --------------------------------------------------------------------------

export const renderRestaurantCommissionExplainer = page("How payments work", `
  <div class="card-elevated mb-4">
    <p class="text-secondary text-xs mb-1">You keep</p>
    <h2 style="font-size:36px; color:var(--accent);">${100 - restaurantCommissionPct}%</h2>
    <p class="text-secondary text-sm mt-1">of every food order subtotal</p>
  </div>

  <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">A real example</h3>
  <div class="card mb-5">
    <div class="flex justify-between mb-2"><span class="text-sm text-secondary">Food subtotal</span><span class="font-bold">Rs. 1,000</span></div>
    <div class="flex justify-between mb-2"><span class="text-sm text-secondary">Nova Go commission (${restaurantCommissionPct}%)</span><span class="font-bold" style="color:var(--error);">− Rs. ${restaurantCommissionPct * 10}</span></div>
    <div class="flex justify-between mb-3" style="border-top:1px solid var(--surface-border); padding-top:var(--sp-3);">
      <span class="font-bold">You receive</span><span class="font-bold" style="color:var(--accent);">Rs. ${1000 - restaurantCommissionPct * 10}</span>
    </div>
    <p class="text-xs text-muted">
      The delivery fee the customer pays is separate — that goes to the rider, not deducted from you.
    </p>
  </div>

  <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">How you get the money</h3>
  <div class="flex-col gap-2 mb-5">
    ${[
      { n: "1", t: "Customer pays the rider in cash", s: "On delivery — full amount, food plus delivery fee." },
      { n: "2", t: "We track what's yours", s: "Every completed order adds your share to your balance automatically." },
      { n: "3", t: `Paid out ${payoutSchedule}`, s: "To the account you set in your store profile." },
    ].map((s) => `
      <div class="list-row" style="background:var(--surface); border-radius:var(--r-md); align-items:flex-start;">
        <div class="list-row-icon" style="background:var(--brand-ride-soft); color:var(--accent); font-weight:800;">${s.n}</div>
        <div style="flex:1;">
          <p class="font-bold text-sm">${s.t}</p>
          <p class="text-secondary text-xs mt-1">${s.s}</p>
        </div>
      </div>`).join("")}
  </div>

  <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">What you control</h3>
  <ul style="padding-left:20px; color:var(--text-secondary); font-size:14px; line-height:1.7;">
    <li>Your menu, prices and photos — change any time</li>
    <li>Your prep time, which sets the customer's ETA</li>
    <li>Open/closed — stop taking orders instantly when you're slammed</li>
    <li>Which orders you accept</li>
  </ul>

  <div class="pending-flag mt-4">
    <span>${icon("bolt", 14)}</span>
    <span>No listing fee, no monthly charge. We only earn when you do.</span>
  </div>
`);

// --------------------------------------------------------------------------

export function renderSupportContact(root) {
  const wa = whatsappLink("Hi Nova Go, I need help with:");
  const tel = phoneLink();
  const mail = emailLink("Nova Go — I need help");

  // With no live channel configured, the written ticket is the ONLY honest
  // option — so it gets promoted from a footnote to the primary button
  // rather than leaving the screen looking like support doesn't exist.
  const ticketIsPrimary = !SUPPORT_STATUS.anyLive;

  root.innerHTML = `
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-1">Help</h1>
      <p class="text-secondary text-sm mb-5">
        ${SUPPORT_STATUS.anyLive
          ? `We answer ${SUPPORT.hours}.`
          : "Send us a message and the team replies in the app."}
      </p>

      ${wa ? `<a href="${wa}" target="_blank" rel="noopener"
         class="btn btn-primary btn-block mb-3" style="height:56px;">
        ${icon("chat", 20)} WhatsApp us
      </a>` : ""}

      ${tel ? `<a href="${tel}" class="btn btn-secondary btn-block mb-3" style="height:52px;">
        ${icon("phone", 18)} Call ${SUPPORT.phone}
      </a>` : ""}

      ${ticketIsPrimary ? `
        <button id="ticketPrimary" class="btn btn-primary btn-block mb-3" style="height:56px;">
          ${icon("chat", 20)} Message the Nova Go team
        </button>
        <p class="text-secondary text-xs mb-5" style="text-align:center;">
          Usually answered the same day.
        </p>` : ""}

      ${mail ? `<div class="card mb-5">
        <p class="text-secondary text-sm">Or email <a href="mailto:${SUPPORT.email}" style="color:var(--accent);">${SUPPORT.email}</a></p>
      </div>` : ""}

      <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">Common questions</h3>
      <div class="flex-col gap-1">
        <div class="list-row" style="cursor:pointer;" data-nav="/legal/cancellation">
          <p style="flex:1;" class="text-sm">Cancellations &amp; refunds</p>${icon("chevronRight", 16)}
        </div>
        <div class="list-row" style="cursor:pointer;" data-nav="/legal/terms">
          <p style="flex:1;" class="text-sm">Terms of Service</p>${icon("chevronRight", 16)}
        </div>
        <div class="list-row" style="cursor:pointer;" data-nav="/legal/privacy">
          <p style="flex:1;" class="text-sm">Privacy Policy</p>${icon("chevronRight", 16)}
        </div>
      </div>

      ${ticketIsPrimary ? "" : `<button id="ticketBtn" class="btn btn-ghost btn-block mt-5">Raise a written ticket instead</button>`}
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelectorAll("[data-nav]").forEach((el) =>
    el.addEventListener("click", () => { location.hash = el.dataset.nav; }));
  root.querySelectorAll("#ticketBtn, #ticketPrimary").forEach((b) =>
    b.addEventListener("click", () => { location.hash = "/chat"; }));
}

/* ---------------------------------------------------------- fixed fare ---

   The home screen's first promo card promises "the fare you see is the fare
   you pay" and offers to explain how. That link pointed at a route that did
   not exist — the single most prominent CTA on the home screen led nowhere.

   Worth a real screen rather than a redirect to the FAQ: fixed pricing is the
   main thing separating Nova Go from a rickshaw negotiation, and it is the
   claim a first-time customer is most sceptical of. The numbers below are
   read from PRICING so this page can never quote a rate the app does not
   charge — the failure that would do the most damage here is explaining the
   fare wrongly.                                                           */

export function renderFixedFareExplainer(root) {
  const bike = PRICING.BIKE;
  root.innerHTML = `
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-2">The fare you see is the fare you pay</h1>
      <p class="text-secondary text-sm mb-5">
        No meter, no surge, no haggling at the kerb. Here is exactly how the
        number is worked out.
      </p>

      <div class="nx-fare-hero mb-4">
        <p class="nx-fare-label">How a fare is built</p>
        <div class="nx-fare-rows">
          <div class="nx-fare-row"><span>Base, on every trip</span><span class="v">${PRICING.currency} ${bike.base}</span></div>
          <div class="nx-fare-row"><span>Per kilometre of road</span><span class="v">${PRICING.currency} ${bike.perKm}</span></div>
          <div class="nx-fare-row"><span>Per minute</span><span class="v">${PRICING.currency} 0</span></div>
          <div class="nx-fare-row total"><span>Minimum fare</span><span class="v">${PRICING.currency} ${bike.minimum}</span></div>
        </div>
      </div>

      <div class="nx-action-row info mb-3">
        <div>
          <p class="font-bold text-sm">Why there is no charge for time</p>
          <p class="text-xs text-secondary" style="margin-top:3px;">
            Karachi traffic is not something you chose, and nobody can quote it
            in advance. Charging for it would mean either quoting a range —
            which reads as evasive — or quoting a number and charging a
            different one. So distance is the whole fare.
          </p>
        </div>
      </div>

      <div class="nx-action-row info mb-3">
        <div>
          <p class="font-bold text-sm">Locked when you book</p>
          <p class="text-xs text-secondary" style="margin-top:3px;">
            The fare is recorded the moment you confirm and is what you are
            charged at the end, even if the route takes longer than expected.
            If your rider asks for more than the app showed, that is not our
            fare — tell the ops desk.
          </p>
        </div>
      </div>

      ${PRICING.showPetrolGuarantee && PRICING.petrolReferencePerLitre ? `
        <div class="nx-petrol mb-4">
          ${icon("shield", 14)}
          <div>
            <strong>Fair petrol guarantee.</strong>
            This rate was calculated with petrol at
            ${PRICING.currency} ${PRICING.petrolReferencePerLitre}/L. If fuel
            moves enough to change it, we re-price openly rather than adding a
            surcharge at the end of your ride.
          </div>
        </div>` : ""}

      <button id="bookBtn" class="btn btn-primary btn-block">Book a ride ${icon("arrow-forward", 18)}</button>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelector("#bookBtn").addEventListener("click", () => navigate("/set-locations"));
}
