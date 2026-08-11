// Nova Go Rides — Food marketplace: browse restaurants, menu + cart, checkout
// (creates a real FoodOrder against food-orders.controller.ts), live tracking.
// Mirrors the parcel.js flow shape against the FoodOrders module instead of
// Delivery — same real matching engine, driver just has to be in FOOD_ERRAND mode.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, fmtMoney, skeletonRows, esc, emptyRich } from "../ui.js";
import { navigate } from "../router.js";
import { track } from "../analytics.js";
import { socketManager } from "../socket.js";
import { geocode, getCurrentCoords } from "../geocode.js";
import { restaurantCardHtml } from "./riderHome.js";

export function renderFoodBrowse(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-1">Food</h1>
      <p class="text-secondary text-sm mb-4">Delivered by Nova Go riders</p>

      <div class="input flex items-center gap-2 mb-4">
        ${icon("eye", 16)}
        <input id="searchInput" type="text" placeholder="Search food or restaurants" style="background:none;border:none;outline:none;flex:1;color:var(--text-primary);"/>
      </div>

      <div class="chip-row mb-4" id="cuisineRow"></div>
      <div id="list" class="flex-col gap-4">${skeletonRows(3)}</div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => navigate("/home"));

  let all = [];
  let activeCuisine = null;
  let query = "";
  let cancelled = false;
  const list = root.querySelector("#list");
  const cuisineRow = root.querySelector("#cuisineRow");

  function visible() {
    return all.filter((r) => {
      const matchesQ = !query
        || r.name.toLowerCase().includes(query)
        || (r.cuisineTags || []).some((c) => c.toLowerCase().includes(query));
      const matchesC = !activeCuisine || (r.cuisineTags || []).includes(activeCuisine);
      return matchesQ && matchesC;
    });
  }

  function drawCuisines() {
    // Cuisines come from what restaurants actually tagged themselves — no
    // hardcoded list that goes stale the moment a new place joins.
    const counts = new Map();
    all.forEach((r) => (r.cuisineTags || []).forEach((c) => counts.set(c, (counts.get(c) || 0) + 1)));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c);
    if (!top.length) { cuisineRow.innerHTML = ""; return; }
    cuisineRow.innerHTML = `
      <button class="chip${activeCuisine ? "" : " selected"}" data-cuisine="">All</button>
      ${top.map((c) => `<button class="chip${activeCuisine === c ? " selected" : ""}" data-cuisine="${esc(c)}">${esc(c)}</button>`).join("")}
    `;
    cuisineRow.querySelectorAll("[data-cuisine]").forEach((chip) =>
      chip.addEventListener("click", () => {
        activeCuisine = chip.dataset.cuisine || null;
        drawCuisines();
        draw();
      }),
    );
  }

  function draw() {
    const items = visible();
    if (!items.length) {
      // A quiet marketplace should read as "early", not "broken".
      list.innerHTML = all.length
        ? emptyRich({
            icon: icon("utensils", 26),
            title: "Nothing matches that",
            body: "Try a different search or clear your filters.",
          })
        : emptyRich({
            icon: icon("utensils", 26),
            title: "Restaurants are joining this week",
            body: "We're onboarding kitchens across Karachi right now. Tell us where you'd like Nova Go Food next.",
            actionLabel: "Request a restaurant",
            actionId: "requestRestaurantBtn",
          });
      list.querySelector("#requestRestaurantBtn")?.addEventListener("click", () => navigate("/support"));
      return;
    }
    list.innerHTML = items.map((r) => restaurantCardHtml(r)).join("");
    list.querySelectorAll("[data-restaurant-id]").forEach((c) =>
      c.addEventListener("click", () => {
        const r = all.find((x) => x.id === c.dataset.restaurantId);
        state.currentRestaurant = r ? { ...r, menuItems: null } : { id: c.dataset.restaurantId };
        navigate("/food/restaurant");
      }),
    );
  }

  // Load, with a retry that's part of the screen rather than an error dump.
  //
  // A customer who opens Food and sees "Couldn't load restaurants" concludes
  // the app is broken and doesn't come back. But the two reasons this fails
  // are completely different problems and deserve different screens: their
  // connection dropped (their side, retryable) versus we have no kitchens
  // live yet (our side, and an invitation rather than a failure).
  let attempts = 0;

  function loadRestaurants() {
    attempts++;
    api.browseRestaurants().then((restaurants) => {
      if (cancelled) return;
      all = Array.isArray(restaurants) ? restaurants : [];
      drawCuisines();
      draw();
    }).catch((err) => {
      if (cancelled) return;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      list.innerHTML = `
        <div class="nx-empty">
          <div class="nx-empty-art">${icon(offline ? "bolt" : "utensils", 26)}</div>
          <h3>${offline ? "You're offline" : "Kitchens are coming online"}</h3>
          <p>
            ${offline
              ? "Reconnect and we'll load the kitchens near you."
              : "We're signing up restaurants across Karachi right now. Try again in a moment — or tell us which one you want first."}
          </p>
          <button class="btn btn-primary btn-block" id="retryFood">
            ${icon("refresh", 16)} Try again
          </button>
          ${offline ? "" : `
            <button class="btn btn-ghost btn-block mt-2" id="suggestFood">
              Suggest a restaurant
            </button>
            <p class="text-xs text-muted mt-4" style="margin-bottom:0;">
              Run a kitchen? <a href="merchant.html" style="color:var(--accent);font-weight:600;">Partner with Nova Go</a>
            </p>`}
        </div>`;

      list.querySelector("#retryFood")?.addEventListener("click", (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span>`;
        // Back off a little on repeated failures so a down backend doesn't
        // get hammered by someone tapping retry.
        setTimeout(loadRestaurants, Math.min(attempts * 400, 2000));
      });
      list.querySelector("#suggestFood")?.addEventListener("click", () => navigate("/support"));

      console.warn("[NovaGo] food browse failed:", err?.message);
    });
  }

  loadRestaurants();

  let debounce;
  root.querySelector("#searchInput").addEventListener("input", (e) => {
    clearTimeout(debounce);
    query = e.target.value.trim().toLowerCase();
    debounce = setTimeout(draw, 200);
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
    track("food_restaurant_viewed", { restaurantId: restaurant.id });
    renderHeader(restaurant);
    renderMenu(restaurant);
  }).catch((err) => {
    if (cancelled) return;
    root.querySelector("#header").innerHTML = `<div class="empty-state"><p class="text-sm">${err.message || "Couldn't load this restaurant."}</p></div>`;
    root.querySelector("#menuList").innerHTML = "";
  });

  function renderHeader(r) {
    const prep = r.prepTimeMinutes || 20;
    root.querySelector("#header").innerHTML = `
      <div class="food-card" style="box-shadow:var(--shadow-md);">
        <div class="food-card-banner" style="height:150px;${r.bannerUrl ? `background-image:url('${esc(r.bannerUrl)}');` : ""}">
          ${r.bannerUrl ? "" : icon("utensils", 38)}
          <div class="food-card-badges">
            ${r.isOpen ? `<span class="badge badge-success">Open now</span>` : `<span class="badge badge-error">Closed</span>`}
            ${r.status === "APPROVED" ? `<span class="badge badge-accent">${icon("check", 10)} Verified partner</span>` : ""}
          </div>
          ${r.isOpen ? "" : `<div class="closed-veil">Not accepting orders right now</div>`}
        </div>
        <div class="food-card-body">
          <div class="flex justify-between items-start">
            <h1 class="text-lg" style="flex:1;">${esc(r.name)}</h1>
            <span class="badge badge-accent">${icon("star", 12)} ${(r.rating ?? 5).toFixed(1)}</span>
          </div>
          <p class="text-secondary text-xs mt-1">${esc((r.cuisineTags || []).join(" · ")) || "Restaurant"}</p>
          ${r.description ? `<p class="text-secondary text-sm mt-2">${esc(r.description)}</p>` : ""}
          <div class="food-meta">
            <span>${prep}–${prep + 15} min</span>
            <span class="dot"></span>
            <span>Delivery from Rs. 50</span>
            <span class="dot"></span>
            <span>Cash on delivery</span>
          </div>
        </div>
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
  // Photo-led: a dish with a picture sells; a dish as a text row does not.
  // Falls back to a branded tile so an un-photographed menu still looks
  // intentional rather than half-built.
  return `
    <div class="menu-item" data-item-id="${esc(mi.id)}">
      <div class="menu-item-photo" ${mi.imageUrl ? `style="background-image:url('${esc(mi.imageUrl)}');"` : ""}>
        ${mi.imageUrl ? "" : icon("utensils", 22)}
      </div>
      <div class="flex-col" style="flex:1; min-width:0;">
        <p class="font-bold text-sm">${esc(mi.name)}</p>
        ${mi.description ? `<p class="text-secondary text-xs mt-1">${esc(mi.description)}</p>` : ""}
        <div class="flex items-center justify-between mt-2">
          <p class="font-bold">${fmtMoney(mi.price)}</p>
          <div class="qty-stepper">
            <button class="qty-btn" data-action="dec">−</button>
            <span class="font-bold" data-qty style="min-width:16px; text-align:center;">${qty}</span>
            <button class="qty-btn" data-action="inc">+</button>
          </div>
        </div>
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
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-1">Your Cart</h1>
      <p class="text-secondary mb-6">${esc(cart.restaurantName) || "No restaurant selected"}</p>

      ${!cart.items.length ? `
      <div class="empty-state"><p class="text-sm">Your cart is empty.</p></div>
      <button id="browseBtn" class="btn btn-secondary btn-block mt-4">Browse Restaurants</button>
      ` : `
      <div class="flex-col gap-2 mb-6" id="cartItems">
        ${cart.items.map((i) => `
          <div class="list-row" data-cart-item="${i.menuItemId}">
            <div class="flex-col" style="flex:1;">
              <p class="font-bold text-sm">${esc(i.name)}</p>
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
      // Geocode the delivery address the customer actually typed — this
      // used to just send their current GPS regardless of the address.
      const here = await getCurrentCoords();
      const coords = await geocode(dropoffLabel, here);
      if (!coords.resolved) {
        toast("Couldn't find that delivery address — try a more specific one", true);
        btn.disabled = false;
        btn.innerHTML = `Place Order ${icon("bolt", 18)}`;
        return;
      }
      const currentCart = state.cart;
      track("food_checkout_started");
      const order = await api.createFoodOrder({
        restaurantId: currentCart.restaurantId,
        items: currentCart.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        dropoffLabel,
        dropoffLat: coords.lat,
        dropoffLng: coords.lng,
        notes: notes || undefined,
      });
      state.activeFoodOrderId = order.id;
      track("food_order_placed", { orderId: order.id });
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
        <div class="flex justify-between items-center mb-3">
          <span class="badge badge-accent" id="statusBadge">Loading...</span>
          <span class="text-xs text-muted" id="orderNumText"></span>
        </div>
        <p class="text-lg font-bold mb-4" id="statusText">Connecting...</p>
        <button id="chatBtn" class="btn btn-secondary btn-block hidden">${icon("chat", 18)} Message Delivery Rider</button>
      </div>
    </div>
  `;
  if (!orderId) { navigate("/home"); return; }
  root.querySelector("#backBtn").addEventListener("click", () => navigate("/home"));

  const statusCard = root.querySelector(".card-elevated");
  const statusBadge = root.querySelector("#statusBadge");
  const statusText = root.querySelector("#statusText");
  const chatBtn = root.querySelector("#chatBtn");
  chatBtn.addEventListener("click", () => {
    state.chatContext = { contextType: "FOOD_ORDER", contextId: orderId, otherPartyLabel: "Delivery rider" };
    navigate("/chat-thread");
  });
  function setStatus(s) {
    statusBadge.textContent = s;
    statusText.textContent = FOOD_STATUS_COPY[s] || s;
    // Every real status change gets a one-beat pulse — not a looping glow —
    // so live updates read as "something just happened" without being noisy.
    statusCard.classList.remove("success-pulse");
    void statusCard.offsetWidth;
    statusCard.classList.add("success-pulse");
    // A driver is only actually assigned from ASSIGNED onward.
    chatBtn.classList.toggle("hidden", !["ASSIGNED", "PICKED_UP"].includes(s));
  }

  api.getFoodOrder(orderId).then((o) => {
    setStatus(o.status);
    root.querySelector("#orderNumText").textContent = `Order #${(o.id || "").slice(0, 8).toUpperCase()}`;
  }).catch(() => setStatus("PLACED"));

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
