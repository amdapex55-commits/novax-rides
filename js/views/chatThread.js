// Nova Go Rides — in-app chat between the two people tied to an active
// Trip/Delivery/FoodOrder/Errand (rider↔driver, customer↔driver,
// requester↔driver). One generic thread screen reused from every "in
// progress" tracking view via state.chatContext — see driverHome.js,
// riderTrip.js, food.js, and driverFoodErrand.js for the entry points.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, esc } from "../ui.js";
import { navigate } from "../router.js";
import { socketManager } from "../socket.js";

export function renderChatThread(root) {
  const ctx = state.chatContext;
  root.innerHTML = `
    <div class="page flex-col pb-0" style="height:100dvh;">
      <div class="flex items-center gap-3 mb-4">
        <button id="backBtn" class="btn-icon">${icon("arrow-back", 20)}</button>
        <div style="flex:1;">
          <p class="font-bold">${esc(ctx?.otherPartyLabel) || "Chat"}</p>
          <p class="text-secondary text-xs">${CONTEXT_LABEL[ctx?.contextType] || "Active job"}</p>
        </div>
      </div>
      <div id="msgList" class="flex-col gap-2" style="flex:1; overflow-y:auto; padding-bottom:12px;"></div>
      <div class="flex gap-2" style="padding:12px 0 calc(12px + var(--safe-bottom));">
        <input id="msgInput" class="input" style="flex:1;" placeholder="Type a message..." maxlength="1000"/>
        <button id="sendBtn" class="btn-icon" style="background:var(--accent-gradient); box-shadow:var(--accent-glow);">${icon("send", 18)}</button>
      </div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());

  if (!ctx?.contextType || !ctx?.contextId) {
    root.querySelector("#msgList").innerHTML = `<div class="empty-state"><p class="text-sm">No active conversation.</p></div>`;
    return;
  }

  const listEl = root.querySelector("#msgList");
  const inputEl = root.querySelector("#msgInput");
  const sendBtn = root.querySelector("#sendBtn");
  const myId = Token.user?.id;

  function bubble(m) {
    const mine = m.senderId === myId;
    return `
      <div class="flex" style="justify-content:${mine ? "flex-end" : "flex-start"};">
        <div style="max-width:78%; padding:10px 14px; border-radius:${mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px"}; background:${mine ? "var(--accent-gradient)" : "var(--surface-2)"}; color:${mine ? "var(--on-accent)" : "var(--text-primary)"};">
          <p class="text-sm">${esc(m.body)}</p>
        </div>
      </div>
    `;
  }

  function drawMessages(messages) {
    listEl.innerHTML = messages.length
      ? messages.map(bubble).join("")
      : `<div class="empty-state"><p class="text-sm">Say hello 👋</p></div>`;
    listEl.scrollTop = listEl.scrollHeight;
  }

  api.listChatMessages(ctx.contextType, ctx.contextId)
    .then(drawMessages)
    .catch(() => { listEl.innerHTML = `<div class="empty-state"><p class="text-sm">Couldn't load messages.</p></div>`; });

  socketManager.connect();
  const onIncoming = (payload) => {
    if (payload.contextType !== ctx.contextType || payload.contextId !== ctx.contextId) return;
    const bubbleEl = document.createElement("div");
    bubbleEl.innerHTML = bubble(payload.message);
    listEl.appendChild(bubbleEl.firstElementChild);
    listEl.scrollTop = listEl.scrollHeight;
  };
  socketManager.on("chat:message", onIncoming);

  async function send() {
    const body = inputEl.value.trim();
    if (!body) return;
    inputEl.value = "";
    inputEl.focus();
    // Optimistic append — the sender's own copy doesn't come back over the
    // socket (emitToUser only pushes to the recipient), so without this the
    // sender wouldn't see their own message until the next full reload.
    const optimistic = { id: `local-${Date.now()}`, senderId: myId, body, createdAt: new Date().toISOString() };
    const bubbleEl = document.createElement("div");
    bubbleEl.innerHTML = bubble(optimistic);
    listEl.appendChild(bubbleEl.firstElementChild);
    listEl.scrollTop = listEl.scrollHeight;
    try {
      await api.sendChatMessage(ctx.contextType, ctx.contextId, body);
    } catch (err) {
      toast(err.message || "Message didn't send", true);
    }
  }
  sendBtn.addEventListener("click", send);
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

  return () => socketManager.off("chat:message", onIncoming);
}

const CONTEXT_LABEL = {
  TRIP: "Active ride",
  DELIVERY: "Active parcel",
  FOOD_ORDER: "Active food order",
  ERRAND: "Active errand",
};
