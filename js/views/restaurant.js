// Nova X Rides — Restaurant portal: onboarding, pending-approval, live order
// queue, menu management, store profile. Mirrors driverAuth.js's
// pending-approval pattern (poll real status, same honest "still under
// review" copy) and food.js's cart/menu patterns for consistency.
import { api, Token } from "../api.js";
import { icon } from "../icons.js";
import { toast, fmtMoney, skeletonRows, esc, emptyRich } from "../ui.js";
import { navigate } from "../router.js";
import { socketManager } from "../socket.js";

const KARACHI = { lat: 24.8607, lng: 67.0011 };
function getDeviceCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(KARACHI);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(KARACHI),
      { timeout: 4000 }
    );
  });
}

// Storefront onboarding now lives in views/restaurantOnboarding.js — a
// five-step wizard with a live preview. Kept out of this file because it's
// large, runs exactly once per restaurant, and every kitchen loading their
// order queue would otherwise pay to download it.

export function renderRestaurantPending(root) {
  root.innerHTML = `
    <div class="page flex-col items-center text-center nx-stagger" style="min-height:100dvh; justify-content:center;">
      <div class="nx-empty-art" style="width:96px;height:96px;border-radius:28px;color:var(--warning);background:var(--brand-food-soft);">
        ${icon("store", 40)}
      </div>
      <h1 class="text-xl mb-2">We're reviewing your storefront</h1>
      <p class="text-secondary mb-2" style="max-width:34ch;">
        Someone on our team is checking your details. This usually takes
        24–48 hours, and we'll call if anything's missing.
      </p>
      <p class="text-xs text-muted mb-8" style="display:flex;align-items:center;gap:7px;">
        <span class="nx-live-dot" style="background:var(--warning);"></span>
        Checking for updates automatically
      </p>
      <button id="checkStatusBtn" class="btn btn-primary btn-block">${icon("refresh", 18)} Check now</button>
    </div>
  `;
  const checkBtn = root.querySelector("#checkStatusBtn");
  async function check(showToastIfPending) {
    try {
      const restaurant = await api.getMyRestaurant();
      if (restaurant.status === "APPROVED") {
        toast("You're approved! 🎉");
        setTimeout(() => navigate("/restaurant/orders"), 800);
      } else if (showToastIfPending) {
        toast("Still under review — check back soon");
      }
    } catch (e) { console.warn(e); }
  }
  checkBtn.addEventListener("click", () => check(true));
  const poll = setInterval(() => check(false), 15000);
  return () => clearInterval(poll);
}

const ORDER_STATUS_LABEL = {
  PLACED: "New order",
  ACCEPTED: "Preparing",
  READY: "Ready — waiting for driver",
  MATCHING: "Ready — finding a driver",
  ASSIGNED: "Driver on the way",
  PICKED_UP: "Picked up",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function renderRestaurantOrders(root) {
  // POS surface, not a consumer list: this is read from across a counter by
  // someone with flour on their hands. Loud colour on new orders, big
  // buttons, prep time adjustable per order because a biryani is not a
  // sandwich.
  root.innerHTML = `
    <div class="page pb-0">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h1 class="text-xl">Orders</h1>
          <p class="text-secondary text-xs" id="liveCount">Live queue</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="pulse-dot" style="width:8px;height:8px;background:var(--success);"></span>
          <span class="text-xs text-secondary">Live</span>
        </div>
      </div>
      <div id="orderList" class="flex-col gap-3">${skeletonRows(3)}</div>
    </div>
  `;
  let cancelled = false;

  async function load() {
    try {
      const orders = await api.listRestaurantOrders();
      if (cancelled) return;
      draw(orders);
    } catch {
      if (!cancelled) {
        root.querySelector("#orderList").innerHTML = emptyRich({
          icon: icon("bolt", 26),
          title: "Couldn't load orders",
          body: "Check your connection — we'll keep retrying automatically.",
        });
      }
    }
  }

  function draw(orders) {
    const list = root.querySelector("#orderList");
    const active = orders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status));
    const past = orders.filter((o) => ["DELIVERED", "CANCELLED"].includes(o.status));
    const newCount = active.filter((o) => o.status === "PLACED").length;

    root.querySelector("#liveCount").textContent =
      newCount > 0 ? `${newCount} new order${newCount === 1 ? "" : "s"} need action` : `${active.length} in progress`;

    if (!orders.length) {
      list.innerHTML = emptyRich({
        icon: icon("store", 26),
        title: "No orders yet today",
        body: "Make sure your store is open and your menu is up to date — orders appear here the moment they come in.",
      });
      return;
    }

    // Newest-actionable first: a PLACED order is money waiting on a decision.
    const priority = { PLACED: 0, ACCEPTED: 1, READY: 2, MATCHING: 3, ASSIGNED: 4, PICKED_UP: 5 };
    active.sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));

    list.innerHTML = [
      ...active.map((o) => posOrderHtml(o)),
      ...(past.length ? [`<h3 class="text-sm text-secondary mt-5 mb-1" style="text-transform:uppercase; letter-spacing:0.04em;">Completed today</h3>`] : []),
      ...past.slice(0, 10).map((o) => pastOrderHtml(o)),
    ].join("");

    list.querySelectorAll("[data-accept]").forEach((b) => b.addEventListener("click", async () => {
      const card = b.closest(".pos-order");
      const prep = card?.querySelector("[data-prep]")?.value;
      b.disabled = true;
      b.innerHTML = `<span class="spinner"></span>`;
      try {
        // Prep time is saved on the restaurant profile so it also improves
        // the ETA shown to the next customer, not just this order.
        if (prep) { try { await api.updateMyRestaurant({ prepTimeMinutes: Number(prep) }); } catch { /* non-fatal */ } }
        await api.restaurantAcceptOrder(b.dataset.accept);
        toast("Order accepted — kitchen notified");
        load();
      } catch (err) { toast(err.message || "Couldn't accept", true); b.disabled = false; b.textContent = "Accept order"; }
    }));

    list.querySelectorAll("[data-ready]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      b.innerHTML = `<span class="spinner"></span>`;
      try { await api.markOrderReady(b.dataset.ready); toast("Ready — finding a rider"); load(); }
      catch (err) { toast(err.message || "Couldn't update", true); b.disabled = false; b.textContent = "Mark ready for pickup"; }
    }));
  }

  function statusClass(status) {
    if (status === "PLACED") return "is-new";
    if (status === "ACCEPTED") return "is-preparing";
    return "is-ready";
  }

  function posOrderHtml(o) {
    const items = (o.items || []);
    const minsAgo = o.placedAt ? Math.floor((Date.now() - new Date(o.placedAt).getTime()) / 60000) : null;
    return `
      <div class="pos-order ${statusClass(o.status)}">
        <div class="pos-order-head">
          <div>
            <span class="badge ${o.status === "PLACED" ? "badge-error" : "badge-accent"}">${ORDER_STATUS_LABEL[o.status] || esc(o.status)}</span>
            <p class="ref-id mt-2">#${esc((o.id || "").slice(0, 8).toUpperCase())}${minsAgo != null ? ` · ${minsAgo} min ago` : ""}</p>
          </div>
          <p class="font-bold text-lg">${fmtMoney(o.total)}</p>
        </div>

        <div class="flex-col gap-1 mb-3">
          ${items.map((i) => `
            <div class="flex justify-between text-sm">
              <span><b>${i.quantity}×</b> ${esc(i.nameSnapshot)}</span>
              <span class="text-secondary">${fmtMoney(i.subtotal)}</span>
            </div>`).join("") || `<p class="text-sm text-secondary">No items</p>`}
        </div>

        ${o.notes ? `
          <div class="pending-flag" style="margin-bottom:var(--sp-3);">
            <span>${icon("bolt", 14)}</span><span><b>Note:</b> ${esc(o.notes)}</span>
          </div>` : ""}

        <p class="text-xs text-muted mb-3">${icon("map-pin", 12)} ${esc(o.dropoffLabel)}</p>

        ${o.status === "PLACED" ? `
          <label class="field-label">Prep time</label>
          <div class="flex gap-2 mb-3">
            <select class="input" data-prep style="flex:1;">
              ${[10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}"${m === 20 ? " selected" : ""}>${m} minutes</option>`).join("")}
            </select>
          </div>
          <button class="btn btn-primary btn-block" style="height:52px;" data-accept="${esc(o.id)}">Accept order</button>
        ` : ""}

        ${o.status === "ACCEPTED" ? `
          <button class="btn btn-primary btn-block" style="height:52px;" data-ready="${esc(o.id)}">Mark ready for pickup</button>
        ` : ""}

        ${["READY", "MATCHING"].includes(o.status) ? `
          <div class="flex items-center gap-2 text-sm text-secondary">
            <span class="spinner" style="width:16px;height:16px;"></span> Finding a rider…
          </div>` : ""}
      </div>
    `;
  }

  function pastOrderHtml(o) {
    return `
      <div class="card" style="opacity:0.55; padding:var(--sp-3) var(--sp-4);">
        <div class="flex justify-between items-center">
          <div>
            <p class="text-sm font-bold">${ORDER_STATUS_LABEL[o.status] || esc(o.status)}</p>
            <p class="ref-id">#${esc((o.id || "").slice(0, 8).toUpperCase())}</p>
          </div>
          <p class="font-bold">${fmtMoney(o.total)}</p>
        </div>
      </div>
    `;
  }

  load();
  socketManager.connect();
  const onNew = () => { toast("New order received"); load(); };
  socketManager.on("foodOrder:new", onNew);
  const poll = setInterval(load, 15000);

  return () => { cancelled = true; clearInterval(poll); socketManager.off("foodOrder:new", onNew); };
}

export function renderRestaurantMenuManage(root) {
  root.innerHTML = `
    <div class="page pb-0">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-xl">Menu</h1>
        <button id="addBtn" class="btn btn-primary btn-sm">${icon("plus", 16)} Add Item</button>
      </div>
      <div id="formWrap"></div>
      <div id="itemList" class="flex-col gap-2">${skeletonRows(3)}</div>
    </div>
  `;

  let cancelled = false;
  function load() {
    api.getMyRestaurant().then((r) => { if (!cancelled) draw(r.menuItems || []); })
      .catch(() => { if (!cancelled) root.querySelector("#itemList").innerHTML = `<div class="empty-state"><p class="text-sm">Couldn't load your menu.</p></div>`; });
  }

  function draw(items) {
    const list = root.querySelector("#itemList");
    if (!items.length) { list.innerHTML = `<div class="empty-state"><p class="text-sm">No menu items yet — tap "Add Item" to get started.</p></div>`; return; }
    list.innerHTML = items.map((mi) => `
      <div class="list-row">
        <div class="flex-col" style="flex:1;">
          <p class="font-bold text-sm">${esc(mi.name)}${mi.isAvailable ? "" : ` <span class="badge" style="background:var(--surface-2);">Archived</span>`}</p>
          <p class="text-accent text-sm">${fmtMoney(mi.price)}</p>
        </div>
        ${mi.isAvailable ? `<button class="btn btn-secondary btn-sm" data-archive="${mi.id}">Archive</button>` : ""}
      </div>
    `).join("");
    list.querySelectorAll("[data-archive]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { await api.archiveMenuItem(b.dataset.archive); toast("Removed from menu"); load(); }
      catch (err) { toast(err.message || "Couldn't archive", true); b.disabled = false; }
    }));
  }

  const formWrap = root.querySelector("#formWrap");
  let formOpen = false;
  function toggleForm() {
    formOpen = !formOpen;
    formWrap.innerHTML = formOpen ? `
      <div class="card mb-4 view-enter">
        <label class="field-label">Item Name</label>
        <input id="miName" class="input mb-3" placeholder="e.g. Chicken Karahi (Half)"/>
        <label class="field-label">Price (Rs.)</label>
        <input id="miPrice" class="input mb-3" type="number" placeholder="950"/>
        <label class="field-label">Category</label>
        <input id="miCategory" class="input mb-3" placeholder="Mains"/>
        <label class="field-label">Description <span class="text-muted" style="text-transform:none; font-weight:400;">(optional)</span></label>
        <textarea id="miDesc" class="input mb-4" placeholder="Served with 2 naan"></textarea>
        <button id="miSaveBtn" class="btn btn-primary btn-block">Save Item</button>
      </div>
    ` : "";
    if (formOpen) {
      root.querySelector("#miSaveBtn").addEventListener("click", async (e) => {
        const name = root.querySelector("#miName").value.trim();
        const price = Number(root.querySelector("#miPrice").value);
        const category = root.querySelector("#miCategory").value.trim() || "Menu";
        const description = root.querySelector("#miDesc").value.trim();
        if (!name || !price) { toast("Enter a name and price", true); return; }
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span>`;
        try {
          await api.addMenuItem({ name, price, category, description: description || undefined });
          toast("Item added");
          toggleForm();
          load();
        } catch (err) {
          toast(err.message || "Couldn't add item", true);
          btn.disabled = false;
          btn.innerHTML = "Save Item";
        }
      });
    }
  }
  root.querySelector("#addBtn").addEventListener("click", toggleForm);

  load();
  return () => { cancelled = true; };
}

export function renderRestaurantProfile(root) {
  root.innerHTML = `<div class="page nx-stagger">${skeletonRows(3)}</div>`;
  let cancelled = false;

  api.getMyRestaurant().then((r) => {
    if (cancelled) return;
    root.innerHTML = `
      <div class="page nx-stagger">
        <div class="flex justify-between items-center mb-6">
          <h1 class="text-xl">Store Profile</h1>
          <button id="logoutBtn" class="btn-icon">${icon("logout", 20)}</button>
        </div>

        <div class="card-elevated mb-6 flex items-center justify-between">
          <div>
            <p class="font-bold">${r.isOpen ? "Open for orders" : "Closed"}</p>
            <p class="text-secondary text-xs">${r.status === "APPROVED" ? "Toggle to start/stop receiving orders" : `Status: ${esc(r.status)}`}</p>
          </div>
          <div class="toggle-switch${r.isOpen ? " on" : ""}" id="openToggle" role="switch">
            <div class="toggle-switch-thumb"></div>
          </div>
        </div>

        <div class="card mb-6">
          <p class="font-bold mb-1">${esc(r.name)}</p>
          <p class="text-secondary text-sm mb-1">${esc(r.address)}</p>
          <p class="text-secondary text-xs">${(r.cuisineTags || []).join(" · ") || "No cuisine tags"}</p>
        </div>

        <div class="flex-col gap-2">
          <div class="list-row" data-nav="/restaurant/menu" style="cursor:pointer;">
            <div class="list-row-icon">${icon("utensils", 18)}</div>
            <div style="flex:1;"><p class="font-bold text-sm">Manage Menu</p></div>
            ${icon("chevronRight", 18)}
          </div>
          <div class="list-row" data-nav="/support" style="cursor:pointer;">
            <div class="list-row-icon">${icon("help", 18)}</div>
            <div style="flex:1;"><p class="font-bold text-sm">Support</p></div>
            ${icon("chevronRight", 18)}
          </div>
        </div>
      </div>
    `;
    root.querySelector("#logoutBtn").addEventListener("click", () => { Token.clear(); window.__novaxRefreshNav(); navigate("/home"); });
    root.querySelectorAll("[data-nav]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.nav)));

    const toggle = root.querySelector("#openToggle");
    toggle?.addEventListener("click", async () => {
      if (r.status !== "APPROVED") { toast("Your restaurant needs to be approved first", true); return; }
      try {
        const updated = await api.toggleRestaurantOpen();
        r.isOpen = updated.isOpen;
        toggle.classList.toggle("on", r.isOpen);
        toast(r.isOpen ? "You're now open for orders" : "You're now closed");
      } catch (err) { toast(err.message || "Couldn't update", true); }
    });
  }).catch(() => { if (!cancelled) root.innerHTML = `<div class="page nx-stagger"><div class="empty-state"><p class="text-sm">Couldn't load your store profile.</p></div></div>`; });

  return () => { cancelled = true; };
}
