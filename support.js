// Nova X Rides — chat + help center. No chat/support backend exists yet
// (no messages table, no endpoints) — designed UI, flagged clearly.
import { icon } from "./icons.js";

function pendingFlag() {
  return `<div class="pending-flag">${icon("bell", 16)} No chat/support backend exists yet — this is a designed placeholder.</div>`;
}

export function renderChat(root) {
  root.innerHTML = `
    <div class="page flex-col" style="height:100dvh;">
      <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Support Chat</h1>
      ${pendingFlag()}
      <div class="flex-col gap-3" style="flex:1;">
        <div class="card" style="align-self:flex-start; max-width:80%;">
          <p class="text-sm">Hi! How can we help you today?</p>
        </div>
      </div>
      <div class="flex gap-2 mt-4">
        <input class="input" placeholder="Type a message..." disabled/>
        <button class="btn-icon" disabled>${icon("send", 18)}</button>
      </div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
}

const FAQS = [
  "How do I cancel a trip?",
  "How does fare pricing work?",
  "How do I become a driver?",
  "What if I left something in the vehicle?",
  "How do refunds work?",
];

export function renderSupport(root) {
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-6">Help & Support</h1>
      <div class="card flex items-center gap-3 mb-6" id="chatCard" style="cursor:pointer;">
        <div class="list-row-icon">${icon("chat", 20)}</div>
        <div style="flex:1;"><p class="font-bold text-sm">Chat with us</p><p class="text-secondary text-xs">Typically replies in a few minutes</p></div>
        ${icon("chevronRight", 18)}
      </div>
      <h3 class="text-sm text-secondary mb-3">Frequently Asked</h3>
      <div class="flex-col gap-1">
        ${FAQS.map((q) => `<div class="list-row"><p style="flex:1;" class="text-sm">${q}</p>${icon("chevronRight", 16)}</div>`).join("")}
      </div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelector("#chatCard").addEventListener("click", () => (location.hash = "/chat"));
}
