// Nova X Rides — loyalty, referral, business dashboard. Fully designed;
// clearly flagged as UI-only since no backend models/endpoints exist yet
// for points, referrals, or corporate accounts (see README "Known gaps").
import { icon } from "./icons.js";

function pendingFlag() {
  return `<div class="pending-flag">${icon("bell", 16)} This screen is designed but not backend-wired yet — no API exists for this feature.</div>`;
}
function backBtn(root) {
  root.querySelector("#backBtn")?.addEventListener("click", () => history.back());
}

export function renderLoyalty(root) {
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Loyalty & Rewards</h1>
      ${pendingFlag()}
      <div class="glow-card text-center mb-6" style="padding:28px;">
        <p class="text-secondary text-sm mb-1">Your Points</p>
        <h1 style="font-size:34px;">0</h1>
      </div>
      <h3 class="text-sm text-secondary mb-3">Redeem</h3>
      <div class="flex-col gap-2">
        ${["Rs. 100 ride credit — 500 pts", "Rs. 250 ride credit — 1000 pts", "Free delivery — 300 pts"]
          .map((r) => `<div class="list-row"><div class="list-row-icon">${icon("gift", 18)}</div><p style="flex:1;" class="font-bold text-sm">${r}</p></div>`)
          .join("")}
      </div>
    </div>
  `;
  backBtn(root);
}

export function renderRefer(root) {
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Refer & Earn</h1>
      ${pendingFlag()}
      <div class="glow-card text-center mb-6" style="padding:28px;">
        ${icon("gift", 36)}
        <p class="font-bold mt-3">Give Rs. 200, Get Rs. 200</p>
        <p class="text-secondary text-sm mt-1">Share your code with friends</p>
        <div class="input mt-4 flex items-center justify-center font-bold text-accent" style="letter-spacing:0.1em;">NOVAX-XXXX</div>
        <button class="btn btn-primary btn-block mt-4">${icon("send", 16)} Share Invite</button>
      </div>
    </div>
  `;
  backBtn(root);
}

export function renderBusiness(root) {
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Nova X for Business</h1>
      ${pendingFlag()}
      <div class="card mb-4">
        <p class="font-bold mb-1">Team Travel, Simplified</p>
        <p class="text-secondary text-sm">Centralized billing, spend controls, and travel policies for your organization.</p>
      </div>
      <button class="btn btn-secondary btn-block">Request Business Account</button>
    </div>
  `;
  backBtn(root);
}
