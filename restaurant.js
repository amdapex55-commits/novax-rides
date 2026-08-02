// Nova X Rides — Restaurant portal: onboarding, pending-approval, live order
// queue, menu management, store profile. Mirrors driverAuth.js's
// pending-approval pattern (poll real status, same honest "still under
// review" copy) and food.js's cart/menu patterns for consistency.
import { api, Token } from "./api.js";
import { icon } from "./icons.js";
import { toast, fmtMoney, skeletonRows } from "./ui.js";
import { navigate } from "./router.js";
import { socketManager } from "./socket.js";

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

export function renderRestaurantOnboarding(root) {
  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-1">Set Up Your Storefront</h1>
      <p class="text-secondary mb-6">This is what customers see on Nova X Food.</p>

      <label class="field-label">Restaurant Name</label>
      <input id="nameInput" class="input mb-4" placeholder="e.g. Karachi Karahi House"/>

      <label class="field-label">Description <span class="text-muted" style="text-transform:none; font-weight:400;">(optional)</span></label>
      <textarea id="descInput" class="input mb-4" placeholder="What makes your food great?"></textarea>

      <label class="field-label">Address</label>
      <input id="addressInput" class="input mb-4" placeholder="Shop #, Street, Area"/>

      <label class="field-label">Cuisine Tags <span class="text-muted" style="text-transform:none; font-weight:400;">(comma separated)</span></label>
      <input id="tagsInput" class="input mb-6" placeholder="e.g. Pakistani, BBQ, Fast Food"/>

      <p class="text-xs text-muted mb-6">We'll use your device's current location to place your store on the map — you can fine-tune this later.</p>

      <button id="submitBtn" class="btn btn-primary btn-block">Submit for Approval ${icon("arrow-forward", 18)}</button>
    </div>
  `;

  root.querySelector("#submitBtn").addEventListener("click", async (e) => {
    const name = root.querySelector("#nameInput").value.trim();
    const description = root.querySelector("#descInput").value.trim();
    const address = root.querySelector("#addressInput").value.trim();
    const cuisineTags = root.querySelector("#tagsInput").value.split(",").map((t) => t.trim()).filter(Boolean);
    if (!name || !address) { toast("Enter at least a name and address", true); return; }

    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const coords = await getDeviceCoords();
      await api.createRestaurant({ name, description: description || undefined, address, lat: coords.lat, lng: coords.lng, cuisineTags });
      toast("Submitted! We'll review it shortly.");
      navigate("/restaurant/pending");
    } catch (err) {
      toast(err.message || "Couldn't submit — try again", true);
      btn.disabled = false;
      btn.innerHTML = `Submit for Approval ${icon("arrow-forward", 18)}`;
    }
  });
}

export function renderRestaurantPending(root) {
  root.innerHTML = `
    <div class="page flex-col items-center text-center" style="height:100dvh; justify-content:center;">
      <div style="width:88px;height:88px;border-radius:50%;background:rgba(255,181,71,0.12);display:flex;align-items:center;justify-content:center;color:var(--warning);margin-bottom:24px;">
        ${icon("store", 40)}
      </div>
      <h1 class="text-xl mb-2">Awaiting Approval</h1>
      <p class="text-secondary mb-8">Our team is reviewing your storefront. This usually takes 24-48 hours.</p>
      <button id="checkStatusBtn" class="btn btn-primary btn-block">${icon("refresh", 18)} Check Status</button>
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
  root.innerHTML = `
    <div class="page pb-0">
      <h1 class="text-xl mb-6">Orders</h1>
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
      if (!cancelled) root.querySelector("#orderList").innerHTML = `<div class="empty-state"><p class="text-sm">Couldn't load orders.</p></div>`;
    }
  }

  function draw(orders) {
    const list = root.querySelector("#orderList");
    const active = orders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status));
    const past = orders.filter((o) => ["DELIVERED", "CANCELLED"].includes(o.status));
    if (!orders.length) {
      list.innerHTML = `<div class="empty-state"><p class="text-sm">No orders yet — make sure your store is open.</p></div>`;
      return;
    }
    list.innerHTML = [
      ...active.map((o) => orderCardHtml(o, true)),
      ...(past.length ? [`<h3 class="text-sm text-secondary mt-4 mb-1" style="text-transform:uppercase; letter-spacing:0.04em;">Past Orders</h3>`] : []),
      ...past.slice(0, 10).map((o) => orderCardHtml(o, false)),
    ].join("");

    list.querySelectorAll("[data-accept]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { await api.restaurantAcceptOrder(b.dataset.accept); toast("Order accepted"); load(); }
      catch (err) { toast(err.message || "Couldn't accept", true); b.disabled = false; }
    }));
    list.querySelectorAll("[data-ready]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { await api.markOrderReady(b.dataset.ready); toast("Marked ready — matching a driver"); load(); }
      catch (err) { toast(err.message || "Couldn't update", true); b.disabled = false; }
    }));
  }

  function orderCardHtml(o, active) {
    const itemsSummary = (o.items || []).map((i) => `${i.quantity}x ${i.nameSnapshot}`).join(", ");
    return `
      <div class="card${active ? "" : " opacity-muted"}" style="${active ? "" : "opacity:0.6;"}">
        <div class="flex justify-between items-start mb-2">
          <span class="badge badge-accent">${ORDER_STATUS_LABEL[o.status] || o.status}</span>
          <span class="font-bold text-accent">${fmtMoney(o.total)}</span>
        </div>
        <p class="text-sm text-secondary mb-1">${itemsSummary || "No items"}</p>
        <p class="text-xs text-muted">${o.dropoffLabel}</p>
        ${o.status === "PLACED" ? `<button class="btn btn-primary btn-sm btn-block mt-3" data-accept="${o.id}">Accept Order</button>` : ""}
        ${o.status === "ACCEPTED" ? `<button class="btn btn-primary btn-sm btn-block mt-3" data-ready="${o.id}">Mark Ready for Pickup</button>` : ""}
      </div>
    `;
  }

  load();
  socketManager.connect();
  const onNew = () => load();
  socketManager.on("foodOrder:new", onNew);
  const poll = setInterval(load, 20000);

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
          <p class="font-bold text-sm">${mi.name}${mi.isAvailable ? "" : ` <span class="badge" style="background:var(--surface-2);">Archived</span>`}</p>
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
  root.innerHTML = `<div class="page">${skeletonRows(3)}</div>`;
  let cancelled = false;

  api.getMyRestaurant().then((r) => {
    if (cancelled) return;
    root.innerHTML = `
      <div class="page">
        <div class="flex justify-between items-center mb-6">
          <h1 class="text-xl">Store Profile</h1>
          <button id="logoutBtn" class="btn-icon">${icon("logout", 20)}</button>
        </div>

        <div class="card-elevated mb-6 flex items-center justify-between">
          <div>
            <p class="font-bold">${r.isOpen ? "Open for orders" : "Closed"}</p>
            <p class="text-secondary text-xs">${r.status === "APPROVED" ? "Toggle to start/stop receiving orders" : `Status: ${r.status}`}</p>
          </div>
          <div class="toggle-switch${r.isOpen ? " on" : ""}" id="openToggle" role="switch">
            <div class="toggle-switch-thumb"></div>
          </div>
        </div>

        <div class="card mb-6">
          <p class="font-bold mb-1">${r.name}</p>
          <p class="text-secondary text-sm mb-1">${r.address}</p>
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
  }).catch(() => { if (!cancelled) root.innerHTML = `<div class="page"><div class="empty-state"><p class="text-sm">Couldn't load your store profile.</p></div></div>`; });

  return () => { cancelled = true; };
}
