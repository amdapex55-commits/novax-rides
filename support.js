// Nova X Rides — help center + support ticket submission. No live chat
// backend exists (that's a real realtime feature) — this is the honest
// functional version: a real ticket lands in the database via
// POST /support/tickets instead of a chat UI that goes nowhere.
import { icon } from "./icons.js";
import { api, Token } from "./api.js";
import { state } from "./state.js";
import { toast } from "./ui.js";
import { navigate } from "./router.js";

export function renderChat(root) {
  root.innerHTML = `
    <div class="page flex-col" style="min-height:100dvh;">
      <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-2">Contact Support</h1>
      <p class="text-secondary text-sm mb-6">No live chat yet — send us a message and we'll get back to you.</p>
      ${!Token.access ? `
        <div class="empty-state">
          <div class="icon">${icon("bolt", 32)}</div>
          <p class="font-bold" style="color:var(--text-primary);">Sign in to contact support</p>
          <p class="mt-1 mb-5">So we know which account (and trips) you're asking about.</p>
          <button id="promptSignInBtn" class="btn btn-primary" style="display:inline-flex;">Sign in ${icon("arrow-forward", 16)}</button>
        </div>
      ` : `
        <label class="field-label">Subject</label>
        <input id="subjectInput" class="input mb-4" placeholder="e.g. Driver went the wrong way"/>
        <label class="field-label">Message</label>
        <textarea id="messageInput" class="input mb-6" style="min-height:140px;" placeholder="Tell us what happened..."></textarea>
        <button id="sendTicketBtn" class="btn btn-primary btn-block">${icon("send", 18)} Send Message</button>
      `}
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelector("#promptSignInBtn")?.addEventListener("click", () => {
    state.postAuthRedirect = "/chat";
    navigate("/phone");
  });
  root.querySelector("#sendTicketBtn")?.addEventListener("click", async (e) => {
    const subject = root.querySelector("#subjectInput").value.trim();
    const message = root.querySelector("#messageInput").value.trim();
    if (subject.length < 3 || message.length < 5) {
      toast("Add a subject and a bit more detail", true);
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await api.submitSupportTicket(subject, message);
      root.querySelector(".page").innerHTML = `
        <button id="backBtn2" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
        <div class="empty-state">
          <div class="icon">${icon("check-circle", 32)}</div>
          <p class="font-bold" style="color:var(--text-primary);">Message sent</p>
          <p class="mt-1">We'll get back to you as soon as we can.</p>
        </div>
      `;
      root.querySelector("#backBtn2").addEventListener("click", () => history.back());
    } catch (err) {
      toast(err.message || "Couldn't send — try again", true);
      btn.disabled = false;
      btn.innerHTML = `${icon("send", 18)} Send Message`;
    }
  });
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
        <div style="flex:1;"><p class="font-bold text-sm">Contact us</p><p class="text-secondary text-xs">We reply as soon as we can</p></div>
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
