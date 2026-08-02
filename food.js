// Nova X Rides — Food marketplace: browse restaurants, menu + cart, checkout
// (creates a real FoodOrder against food-orders.controller.ts), live tracking.
// Mirrors the parcel.js flow shape against the FoodOrders module instead of
// Delivery — same real matching engine, driver just has to be in FOOD_ERRAND mode.
import { api, Token } from "./api.js";
import { state } from "./state.js";
import { icon } from "./icons.js";
import { toast, fmtMoney, skeletonRows } from "./ui.js";
import { navigate } from "./router.js";
import { socketManager } from "./socket.js";
import { restaurantCardHtml } from "./riderHome.js";

export function renderFoodBrowse(root) {
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Restaurants</h1>
      <div class="input flex items-center gap-2 mb-6">
        ${icon("eye", 16)}
        <input id="searchInput" type="text" placeholder="Search restaurants or cuisines" style="background:none;border:none;outline:none;flex:1;color:var(--text-primary);"/>
      </div>
      <div id="list" class="flex-col gap-3">${skeletonRows(4)}</div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => navigate("/home"));

  let all = [];
  let cancelled = false;
  const list = root.querySelector("#list");

  function draw(items) {
    if (!items.length) {
      list.innerHTML = `<div class="empty-state"><p class="text-sm">No restaurants match — try a different search.</p></div>`;
      return;
    }
    list.innerHTML = items.map((r) => restaurantCardHtml(r)).join("");
    list.querySelectorAll("[data-restaurant-id]").forEach((c) =>
      c.addEventListener("click", () => {
        const r = all.find((x) => x.id === c.dataset.restaurantId);
        state.currentRestaurant = r ? { ...r, menuItems: null } : { id: c.dataset.restaurantId };
        navigate("/food/restaurant");
      })
    );
  }

  api.browseRestaurants().then((restaurants) => {
    if (cancelled) return;
    all = restaurants;
    draw(all);
  }).catch(() => { if (!cancelled) list.innerHTML = `<div class="empty-state"><p class="text-sm">Couldn't load restaurants right now.</p></div>`; });

  let debounce;
  root.querySelector("#searchInput").addEventListener("input", (e) => {
    clearTimeout(debounce);
    const q = e.target.value.trim().toLowerCase();
    debounce = setTimeout(() => {
      draw(q ? all.filter((r) => r.name.toLowerCase().includes(q) || (r.cuisineTags || []).some((c) => c.toLowerCase().includes(q))) : all);
    }, 200);
  });

  return () => { cancelled = true; clearTimeout(debounce); };
}

export function renderRestaurantMenu(root) {
  const stub = state.currentRestaurant;
  if (!stub?.id) { navigate("/food/browse"); return; }

  root.innerHTML = `
    <div class="page pb-0">
      <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
      <div id="header">${skeletonRows(1)}</div>
      <div id="menuList" class="flex-col gap-4 mt-4" style="padding-bottom:120px;">${skeletonRows(4)}</div>
    </div>
    <div class="cart-fab" id="cartFab">
      <button id="cartBtn" class="btn btn-primary btn-block" style="justify-content:space-between; padding:0 var(--sp-5);">
        <span id="cartCount" class="badge" style="background:rgba(4,16,28,0.25); color:var(--on-accent);">0 items</span>
        <span id="cartTotal">Rs. 0</span>
        <span>View Cart ${icon("arrow-forward", 16)}</span>
      </button>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => navigate("/food/browse"));

  const cartFab = root.querySelector("#cartFab");
  const cartCount = root.querySelector("#cartCount");
  const cartTotal = root.querySelector("#cartTotal");

  function refreshCartFab() {
    const cart = state.cart;
    const count = cart.items.reduce((s, i) => s + i.quantity, 0);
    const total = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
    cartCount.textContent = `${count} item${count === 1 ? "" : "s"}`;
    cartTotal.textContent = fmtMoney(total);
    cartFab.classList.toggle("show", count > 0);
  }
  root.querySelector("#cartBtn").addEventListener("click", () => navigate("/food/cart"));

  let cancelled = false;
  api.getRestaurant(stub.id).then((restaurant) => {
    if (cancelled) return;
    state.currentRestaurant = restaurant;
    renderHeader(restaurant);
    renderMenu(restaurant);
  }).catch((err) => {
    if (cancelled) return;
    root.querySelector("#header").innerHTML = `<div class="empty-state"><p class="text-sm">${err.message || "Couldn't load this restaurant."}</p></div>`;
    root.querySelector("#menuList").innerHTML = "";
  });

  function renderHeader(r) {
    root.querySelector("#header").innerHTML = `
      <div class="card-elevated mb-2">
        <div class="flex items-center gap-3 mb-2">
          <div class="restaurant-card-thumb">${icon("store", 26)}</div>
          <div class="flex-col" style="flex:1;">
            <h1 class="text-lg">${r.name}</h1>
            <p class="text-secondary text-xs">${(r.cuisineTags || []).join(" · ") || "Restaurant"}</p>
          </div>
          <span class="badge badge-accent">${icon("star", 12)} ${(r.rating ?? 5).toFixed(1)}</span>
        </div>
        ${r.description ? `<p class="text-secondary text-sm">${r.description}</p>` : ""}
        <p class="text-xs mt-2" style="color:${r.isOpen ? "var(--success)" : "var(--error)"};">${r.isOpen ? "Open now" : "Currently closed"}</p>
      </div>
    `;
  }

  function renderMenu(r) {
    const categories = {};
    (r.menuItems || []).forEach((mi) => {
      (categories[mi.category || "Menu"] ||= []).push(mi);
    });
    const menuList = root.querySelector("#menuList");
    if (!Object.keys(categories).length) {
      menuList.innerHTML = `<div class="empty-state"><p class="text-sm">This restaurant hasn't added any menu items yet.</p></div>`;
      return;
    }
    menuList.innerHTML = Object.entries(categories).map(([cat, items]) => `
      <div>
        <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">${cat}</h3>
        <div class="flex-col gap-2">
          ${items.map((mi) => menuItemRowHtml(mi)).join("")}
        </div>
      </div>
    `).join("");

    Object.values(categories).flat().forEach((mi) => wireMenuItemRow(root, mi, r, refreshCartFab));
    refreshCartFab();
  }

  return () => { cancelled = true; };
}

function menuItemRowHtml(mi) {
  const cart = state.cart;
  const inCart = cart.items.find((i) => i.menuItemId === mi.id);
  const qty = inCart ? inCart.quantity : 0;
  return `
    <div class="list-row" data-item-id="${mi.id}">
      <div class="flex-col" style="flex:1;">
        <p class="font-bold text-sm">${mi.name}</p>
        ${mi.description ? `<p class="text-secondary text-xs">${mi.description}</p>` : ""}
        <p class="text-accent font-bold text-sm mt-1">${fmtMoney(mi.price)}</p>
      </div>
      <div class="qty-stepper">
        <button class="qty-btn" data-action="dec">−</button>
        <span class="font-bold" data-qty style="min-width:16px; text-align:center;">${qty}</span>
        <button class="qty-btn" data-action="inc">+</button>
      </div>
    </div>
  `;
}

function wireMenuItemRow(root, mi, restaurant, onChange) {
  const row = root.querySelector(`[data-item-id="${mi.id}"]`);
  if (!row) return;
  const qtyEl = row.querySelector("[data-qty]");

  function currentQty() {
    return state.cart.items.find((i) => i.menuItemId === mi.id)?.quantity || 0;
  }
  function setQty(next) {
    let cart = state.cart;
    if (cart.restaurantId && cart.restaurantId !== restaurant.id && cart.items.length && next > 0) {
      toast(`Cart cleared — now ordering from ${restaurant.name}`);
      cart = { restaurantId: null, restaurantName: null, items: [] };
    }
    const items = cart.items.filter((i) => i.menuItemId !== mi.id);
    if (next > 0) items.push({ menuItemId: mi.id, name: mi.name, price: mi.price, quantity: next });
    state.cart = { restaurantId: items.length ? restaurant.id : null, restaurantName: items.length ? restaurant.name : null, items };
    qtyEl.textContent = next;
    onChange();
  }

  row.querySelector('[data-action="inc"]').addEventListener("click", () => setQty(currentQty() + 1));
  row.querySelector('[data-action="dec"]').addEventListener("click", () => setQty(Math.max(0, currentQty() - 1)));
}

export function renderFoodCart(root) {
  const cart = state.cart;
  const dropoff = state.foodDropoff || { label: "" };
  const itemsTotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);

  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-1">Your Cart</h1>
      <p class="text-secondary mb-6">${cart.restaurantName || "No restaurant selected"}</p>

      ${!cart.items.length ? `
      <div class="empty-state"><p class="text-sm">Your cart is empty.</p></div>
      <button id="browseBtn" class="btn btn-secondary btn-block mt-4">Browse Restaurants</button>
      ` : `
      <div class="flex-col gap-2 mb-6" id="cartItems">
        ${cart.items.map((i) => `
          <div class="list-row" data-cart-item="${i.menuItemId}">
            <div class="flex-col" style="flex:1;">
              <p class="font-bold text-sm">${i.name}</p>
              <p class="text-accent text-sm">${fmtMoney(i.price * i.quantity)}</p>
            </div>
            <div class="qty-stepper">
              <button class="qty-btn" data-action="dec">−</button>
              <span class="font-bold" style="min-width:16px; text-align:center;">${i.quantity}</span>
              <button class="qty-btn" data-action="inc">+</button>
            </div>
          </div>
        `).join("")}
      </div>

      <label class="field-label">Deliver to</label>
      <input id="dropoffInput" class="input mb-4" placeholder="House / Street / Area" value="${dropoff.label || ""}"/>
      <label class="field-label">Notes for the restaurant <span class="text-muted" style="text-transform:none; font-weight:400;">(optional)</span></label>
      <textarea id="notesInput" class="input mb-4" placeholder="e.g. No onions please">${state.foodOrderNotes || ""}</textarea>

      <div class="card mb-6">
        <div class="flex justify-between mb-2"><span class="text-secondary text-sm">Items</span><span class="text-sm">${fmtMoney(itemsTotal)}</span></div>
        <div class="flex justify-between"><span class="text-secondary text-sm">Delivery fee</span><span class="text-sm text-muted">calculated at checkout</span></div>
      </div>

      <button id="placeOrderBtn" class="btn btn-primary btn-block">Place Order ${icon("bolt", 18)}</button>
      `}
    </div>
  `;

  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelector("#browseBtn")?.addEventListener("click", () => navigate("/food/browse"));

  root.querySelectorAll("[data-cart-item]").forEach((row) => {
    const id = row.dataset.cartItem;
    row.querySelector('[data-action="inc"]').addEventListener("click", () => bumpCartItem(id, 1, root));
    row.querySelector('[data-action="dec"]').addEventListener("click", () => bumpCartItem(id, -1, root));
  });

  root.querySelector("#placeOrderBtn")?.addEventListener("click", async (e) => {
    const dropoffLabel = root.querySelector("#dropoffInput").value.trim();
    const notes = root.querySelector("#notesInput").value.trim();
    if (!dropoffLabel) { toast("Enter a delivery address", true); return; }
    state.foodDropoff = { label: dropoffLabel };
    state.foodOrderNotes = notes;

    if (!Token.access) {
      state.postAuthRedirect = "/food/cart";
      navigate("/phone");
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const coords = await getDemoDropoffCoords();
      const currentCart = state.cart;
      const order = await api.createFoodOrder({
        restaurantId: currentCart.restaurantId,
        items: currentCart.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        dropoffLabel,
        dropoffLat: coords.lat,
        dropoffLng: coords.lng,
        notes: notes || undefined,
      });
      state.activeFoodOrderId = order.id;
      state.clearCart();
      navigate("/food/tracking");
    } catch (err) {
      toast(err.message || "Couldn't place order", true);
      btn.disabled = false;
      btn.innerHTML = `Place Order ${icon("bolt", 18)}`;
    }
  });
}

function bumpCartItem(menuItemId, delta, root) {
  const cart = state.cart;
  const items = cart.items
    .map((i) => (i.menuItemId === menuItemId ? { ...i, quantity: i.quantity + delta } : i))
    .filter((i) => i.quantity > 0);
  state.cart = { ...cart, items, restaurantId: items.length ? cart.restaurantId : null };
  renderFoodCart(root); // small screen, full re-render is simplest & keeps totals honest
}

const KARACHI = { lat: 24.8607, lng: 67.0011 };
function getDemoDropoffCoords() {
  return new Promise((resolve) => {
    const fallback = () => ({ lat: KARACHI.lat + 0.01, lng: KARACHI.lng + 0.01 });
    if (!navigator.geolocation) return resolve(fallback());
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(fallback()),
      { timeout: 4000 }
    );
  });
}

const FOOD_STATUS_COPY = {
  PLACED: "Waiting for the restaurant to accept...",
  ACCEPTED: "The restaurant is preparing your order",
  READY: "Order ready — finding a delivery partner",
  MATCHING: "Finding a delivery partner...",
  ASSIGNED: "A driver is heading to the restaurant",
  PICKED_UP: "On the way to you",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function renderFoodTracking(root) {
  const orderId = state.activeFoodOrderId;
  root.innerHTML = `
    <div style="position:relative;">
      <div class="radar-field" style="height:280px; display:flex; align-items:center; justify-content:center;">
        <div class="radar-sweep"></div>
        <div class="pulse-dot" style="position:relative; z-index:1;"></div>
      </div>
      <button id="backBtn" class="btn-icon" style="position:absolute; top:calc(16px + env(safe-area-inset-top)); left:16px; background:var(--bg-elevated);">${icon("arrow-back", 20)}</button>
    </div>
    <div class="page" style="margin-top:-24px; position:relative; z-index:2;">
      <div class="card-elevated" style="border-radius:var(--r-xl);">
        <span class="badge badge-accent mb-3" id="statusBadge">Loading...</span>
        <p class="text-lg font-bold" id="statusText">Connecting...</p>
      </div>
    </div>
  `;
  if (!orderId) { navigate("/home"); return; }
  root.querySelector("#backBtn").addEventListener("click", () => navigate("/home"));

  const statusCard = root.querySelector(".card-elevated");
  const statusBadge = root.querySelector("#statusBadge");
  const statusText = root.querySelector("#statusText");
  function setStatus(s) {
    statusBadge.textContent = s;
    statusText.textContent = FOOD_STATUS_COPY[s] || s;
    // Every real status change gets a one-beat pulse — not a looping glow —
    // so live updates read as "something just happened" without being noisy.
    statusCard.classList.remove("success-pulse");
    void statusCard.offsetWidth;
    statusCard.classList.add("success-pulse");
  }

  api.getFoodOrder(orderId).then((o) => setStatus(o.status)).catch(() => setStatus("PLACED"));

  socketManager.connect();
  const onAccepted = () => setStatus("ACCEPTED");
  const onReady = () => setStatus("READY");
  const onAssigned = () => setStatus("ASSIGNED");
  const onPickedUp = () => setStatus("PICKED_UP");
  const onDelivered = () => {
    setStatus("DELIVERED");
    toast("Order delivered — enjoy!");
    state.activeFoodOrderId = null;
    setTimeout(() => navigate("/home"), 1500);
  };
  socketManager.on("foodOrder:accepted", onAccepted);
  socketManager.on("foodOrder:ready", onReady);
  socketManager.on("foodOrder:assigned", onAssigned);
  socketManager.on("foodOrder:pickedUp", onPickedUp);
  socketManager.on("foodOrder:delivered", onDelivered);

  return () => {
    socketManager.off("foodOrder:accepted", onAccepted);
    socketManager.off("foodOrder:ready", onReady);
    socketManager.off("foodOrder:assigned", onAssigned);
    socketManager.off("foodOrder:pickedUp", onPickedUp);
    socketManager.off("foodOrder:delivered", onDelivered);
  };
}
