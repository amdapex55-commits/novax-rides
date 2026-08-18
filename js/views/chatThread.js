// Nova Go Rides — in-app chat between the two people tied to an active
// Trip/Delivery/FoodOrder/Errand (rider↔driver, customer↔driver,
// requester↔driver). One generic thread screen reused from every "in
// progress" tracking view via state.chatContext — see driverHome.js,
// riderTrip.js, food.js, and driverFoodErrand.js for the entry points.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { revealIn } from "../motion.js";
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

  /* Ticks, on your own messages only — the state of someone else's message is
     not your business and not your problem. One tick left our server, two
     ticks reached them, two blue ticks means they actually opened it. Anyone
     who has used WhatsApp reads this without being taught, which is the whole
     reason for borrowing the convention. */
  function ticks(m) {
    if (m.readAt) return `<span class="nx-tick read" title="Read">${icon("check", 11)}${icon("check", 11)}</span>`;
    if (m.deliveredAt) return `<span class="nx-tick" title="Delivered">${icon("check", 11)}${icon("check", 11)}</span>`;
    return `<span class="nx-tick" title="Sent">${icon("check", 11)}</span>`;
  }

  function bubble(m) {
    const mine = m.senderId === myId;
    return `
      <div class="flex" data-msg="${esc(m.id || "")}" style="justify-content:${mine ? "flex-end" : "flex-start"};">
        <div style="max-width:78%; padding:10px 14px; border-radius:${mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px"}; background:${mine ? "var(--accent-gradient)" : "var(--surface-2)"}; color:${mine ? "var(--on-accent)" : "var(--text-primary)"};">
          <p class="text-sm">${esc(m.body)}</p>
          ${mine ? `<span class="nx-msg-meta">${ticks(m)}</span>` : ""}
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

  /* Opening the thread IS reading it. Marking on open is what turns the other
     person's ticks blue, and what clears the badge on the button that brought
     us here. */
  function markRead() {
    api.markChatRead(ctx.contextType, ctx.contextId).catch(() => { /* retried on the next message */ });
  }

  api.listChatMessages(ctx.contextType, ctx.contextId)
    .then((msgs) => { drawMessages(msgs); markRead(); })
    .catch(() => { listEl.innerHTML = `<div class="empty-state"><p class="text-sm">Couldn't load messages.</p></div>`; });

  socketManager.connect();
  const onIncoming = (payload) => {
    if (payload.contextType !== ctx.contextType || payload.contextId !== ctx.contextId) return;
    const bubbleEl = document.createElement("div");
    bubbleEl.innerHTML = bubble(payload.message);
    const node = bubbleEl.firstElementChild;
    listEl.appendChild(node);
    // A message that materialises is easy to miss mid-conversation; one that
    // rises in reads as having just arrived.
    revealIn(node);
    markRead();
    listEl.scrollTop = listEl.scrollHeight;
  };
  /* Their ticks turn without either side polling.

     THE MOMENT SOMEONE READS YOU IS THE POINT OF HAVING RECEIPTS, and it used
     to arrive as a silent colour change on ticks the reader was probably not
     looking at. Now the ticks that have just been earned pop once — only
     those: re-animating every tick in the thread would say "all of these were
     read just now", which is false for the ones read ten minutes ago. */
  function onRead() {
    listEl.querySelectorAll(".nx-tick:not(.read)").forEach((tick) => {
      tick.classList.add("read", "nx-tick-earned");
      tick.addEventListener("animationend", () => tick.classList.remove("nx-tick-earned"), { once: true });
    });
  }
  socketManager.on("chat:message", onIncoming);
  socketManager.on("chat:read", onRead);

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
    socketManager.off("chat:read", onRead);
}

const CONTEXT_LABEL = {
  TRIP: "Active ride",
  DELIVERY: "Active parcel",
  FOOD_ORDER: "Active food order",
  ERRAND: "Active errand",
};
