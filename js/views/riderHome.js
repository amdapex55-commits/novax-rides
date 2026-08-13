// Nova Go Rides — rider home (tri-modal Food / Bike / Taxi shell), set
// locations, fare/vehicle selection.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, fmtMoney, skeletonRows, esc } from "../ui.js";
import { navigate } from "../router.js";
import { resolveRoute, geocode, getCurrentCoords, createSuggester } from "../geocode.js";
import { createMap, mapSkeleton } from "../map.js";
import { getRoute, routeSummary } from "../routing.js";
import { VEHICLE_TYPES, SERVICES, PRICING } from "../launch.config.js";
import { listSavedPlaces, listRecents, touchPlace, PLACE_META } from "../savedPlaces.js";
import { activePromos, dismissPromo } from "../promos.js";
import { t } from "../i18n.js";
import { haptic } from "../haptics.js";
import { track } from "../analytics.js";

/* TABS ARE DERIVED, NOT HARDCODED.
   The Taxi tab was a live path to a booking the platform cannot fulfil: it
   offered car tiers from Rs 450 while VEHICLE_TYPES is bike-only and the
   backend's LaunchPolicyService rejects any non-BIKE trip. A customer could
   pick a tier, set pickup and drop-off, and be refused at the last step —
   the worst possible place to find out.

   Now a tab only exists if we can actually serve it. Food keeps its tab while
   parked because its screens route to coming-soon and the tap is a real
   demand signal; Taxi has no such screen, so it goes entirely. */
const CAN_BOOK_CAR = VEHICLE_TYPES.includes("CAR");

/* Bike leads because bike is the business. It is also the tab that opens by
   default, and having the selected tab sit second — with a parked service in
   the primary position — read as though Food were the main event and rides
   were the sideline. */
const TABS = [
  { key: "BIKE", label: "Bike", icon: "bike" },
  { key: "FOOD", label: "Food", icon: "utensils" },
  ...(CAN_BOOK_CAR ? [{ key: "TAXI", label: "Taxi", icon: "taxi" }] : []),
];

export function renderHome(root) {
  const user = Token.user;
  const isGuest = !user;
  let active = state.homeTab || "BIKE";

  /* THE HEADER GREETS A PERSON, NOT A SESSION.

     It used to read "Good morning, there" for anyone signed out — which is
     both cold and not quite English, and it was the first line of the app.
     A guest now gets a line about what the app does, which is more useful to
     them than a malformed hello. */
  const firstName = isGuest ? "" : String(user.name || "").trim().split(" ")[0];

  root.innerHTML = `
    <div class="page pb-0">
      <div class="flex justify-between items-center mb-4">
        <div style="min-width:0;">
          <p class="text-secondary text-sm">${esc(greeting())}${firstName ? "," : ""}</p>
          <h1 class="text-xl" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${firstName ? esc(firstName) : esc(t("Book a Bike Ride"))}
          </h1>
        </div>
        <div class="flex items-center gap-2">
          <!-- Supply, live. See paintNearby(). -->
          <span id="nearbyPill" hidden></span>
          <button id="avatarBtn" class="avatar" aria-label="${esc(t("Account"))}"
                  style="width:44px;height:44px;border:0;cursor:pointer;">${icon("person", 22)}</button>
        </div>
      </div>

      ${isGuest ? `
      <div class="card mb-4 flex items-center gap-3" id="signInCard" style="cursor:pointer;">
        <div class="list-row-icon" style="background:rgba(255, 182, 72, 0.14); color:var(--accent-2);">${icon("bolt", 18)}</div>
        <div style="flex:1;"><p class="font-bold text-sm">${esc(t("Sign in"))}</p><p class="text-secondary text-xs" dir="auto">${esc(t("Takes a minute — only needed to book"))}</p></div>
        ${icon("chevronRight", 18)}
      </div>` : ""}

      <!-- Promotions. Empty and hidden until there is something true to say. -->
      <div class="nx-promo-rail bleed-x mb-4" id="promoRail" hidden></div>

      <div class="top-tabs" id="homeTabs" style="grid-template-columns:repeat(${TABS.length}, 1fr);">
        <div class="top-tabs-indicator" id="tabsIndicator" style="width:${100 / TABS.length}%;"></div>
        ${TABS.map((tb) => `<button class="top-tab" data-tab="${tb.key}">${icon(tb.icon, 16)}<span>${esc(t(tb.label))}</span></button>`).join("")}
      </div>

      <div id="tabPanel"></div>
    </div>
  `;

  root.querySelector("#signInCard")?.addEventListener("click", () => { state.postAuthRedirect = null; navigate("/signin"); });
  root.querySelector("#avatarBtn")?.addEventListener("click", () => navigate(isGuest ? "/signin" : "/account"));

  paintPromos(root, { signedIn: !isGuest });
  const stopNearby = paintNearby(root);

  const indicator = root.querySelector("#tabsIndicator");
  const tabBtns = Array.from(root.querySelectorAll(".top-tab"));
  const panel = root.querySelector("#tabPanel");
  let cleanupPanel = null;

  function setTab(key, { animate = true } = {}) {
    // A previously-saved tab (state.homeTab) can name one that no longer
    // exists — Taxi, after cars were switched off. Fall back rather than
    // leaving the indicator at -1 and the panel blank.
    if (!TABS.some((tb) => tb.key === key)) key = "BIKE";
    active = key;
    state.homeTab = key;
    const idx = TABS.findIndex((tb) => tb.key === key);
    indicator.style.transform = `translateX(${idx * 100}%)`;
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === key));

    if (cleanupPanel) { try { cleanupPanel(); } catch {} cleanupPanel = null; }
    panel.classList.remove("view-enter");
    if (animate) { void panel.offsetWidth; panel.classList.add("view-enter"); }

    if (key === "FOOD") cleanupPanel = renderFoodTab(panel, isGuest);
    else if (key === "TAXI") cleanupPanel = renderTaxiTab(panel);
    else cleanupPanel = renderBikeTab(panel, isGuest);
  }

  tabBtns.forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  setTab(active, { animate: false });

  return () => {
    stopNearby();
    if (cleanupPanel) { try { cleanupPanel(); } catch {} }
  };
}

/* ---------------------------------------------------------------- promos --- */

function paintPromos(root, { signedIn }) {
  const rail = root.querySelector("#promoRail");
  if (!rail) return;

  function paint(referralPoints) {
    const promos = activePromos({ signedIn, referralPoints });
    if (!promos.length) { rail.hidden = true; return; }
    rail.hidden = false;
    rail.innerHTML = promos
      .map(
        (p) => `
        <!-- dir="auto" on every one of these. A campaign string that has no
             Urdu translation yet falls back to English (see js/i18n.js), and
             an English sentence inside an RTL container has its trailing full
             stop moved to the FRONT of the line by the bidi algorithm — it
             renders as ".Quoted before you book". dir="auto" lets the browser
             pick direction per element from its first strong character, so a
             translated string goes RTL and an untranslated one stays LTR,
             with no way for the two to get out of step. -->
        <div class="nx-promo tone-${esc(p.tone || "violet")}" data-promo="${esc(p.id)}" ${p.nav ? 'role="button" tabindex="0"' : ""}>
          ${p.permanent ? "" : `<button class="nx-promo-close" data-dismiss="${esc(p.id)}" aria-label="Dismiss">${icon("close", 13)}</button>`}
          <p class="nx-promo-kicker" dir="auto">${esc(t(p.kicker))}</p>
          <p class="nx-promo-title" dir="auto">${esc(t(p.title, p.vars))}</p>
          ${p.sub ? `<p class="nx-promo-sub" dir="auto">${esc(t(p.sub))}</p>` : ""}
          ${p.cta ? `<span class="nx-promo-cta" dir="auto">${esc(t(p.cta))} ${icon("arrow-forward", 13)}</span>` : ""}
        </div>`,
      )
      .join("");

    rail.querySelectorAll("[data-dismiss]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation(); // don't navigate on the way out
        dismissPromo(b.dataset.dismiss);
        haptic.light();
        b.closest(".nx-promo")?.remove();
        if (!rail.querySelector(".nx-promo")) rail.hidden = true;
      }),
    );
    rail.querySelectorAll("[data-promo]").forEach((card) => {
      const promo = promos.find((p) => p.id === card.dataset.promo);
      if (!promo?.nav) return;
      card.addEventListener("click", () => {
        track("promo_tapped", { id: promo.id });
        navigate(promo.nav);
      });
    });
  }

  // Paint immediately without the referral card, then again if the real
  // number arrives. Waiting on the network to draw the home screen is what
  // made this app feel slow in the first place.
  paint(0);
  if (signedIn) {
    api.getLoyalty()
      .then((l) => { if (root.isConnected) paint(l?.referralBonusPoints || 0); })
      .catch(() => { /* the other promos are already on screen */ });
  }
}

/* --------------------------------------------------------------- supply --- */

/* "Will anyone actually come?" is the question a first-time customer in this
   market is really asking, and no amount of reassuring copy answers it. A
   real count does. The endpoint is anonymised and capped at 12 server-side
   (see LocationController.nearby) — we are showing supply, never a person. */
function paintNearby(root) {
  const pill = root.querySelector("#nearbyPill");
  let cancelled = false;
  if (!pill) return () => {};

  getCurrentCoords()
    .then((c) => (cancelled ? null : api.getNearbyRiders(c.lat, c.lng)))
    .then((riders) => {
      if (cancelled || !riders || !root.isConnected) return;
      const n = riders.length;
      // Zero is not shown. It is accurate and it is also the single most
      // discouraging thing the home screen could say to someone deciding
      // whether to try this app — and it is frequently a coverage artefact
      // (out of zone, GPS not yet warm) rather than a genuinely empty fleet.
      // Silence is the honest middle: we claim nothing.
      if (n === 0) return;
      pill.hidden = false;
      pill.className = `nx-nearby${n <= 2 ? " is-thin" : ""}`;
      // 12 is the server's cap, so it is a floor, not a total.
      pill.innerHTML = `<span class="nx-nearby-dot"></span><span>${n >= 12 ? "12+" : n} ${esc(t("riders nearby"))}</span>`;
    })
    .catch(() => { /* no location permission or offline — say nothing */ });

  return () => { cancelled = true; };
}

/* Translated as a whole phrase rather than "Good " + timeOfDay(): Urdu does
   not build the greeting that way, and concatenating translated fragments is
   how you get grammatical nonsense in the language you cannot read. */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return t("Good morning");
  if (h < 17) return t("Good afternoon");
  return t("Good evening");
}

// ---------------- Bike tab (Ride / Parcel / Pick & Deliver) ----------------

function renderBikeTab(panel, isGuest) {
  /* SERVICES ARE TILES, NOT TEXT ROWS.

     Loyalty, Refer and Business used to be three near-identical grey list
     rows under a "Quick Links" heading — the visual treatment you give a
     footer. Two of them (referral, business leads) are how this business
     grows, and neither was getting tapped. In this market a service that
     matters looks like a tile with a colour and an icon; that is what Bykea,
     Daraz and JazzCash all trained the customer to look for.

     Parked services keep a tile rather than disappearing, because the tap is
     the demand signal that decides what launches next. */
  const soon = (key) => (SERVICES?.[key]?.live === false);

  panel.innerHTML = `
    <button class="nx-where" id="whereToCard">
      <span class="nx-where-icon">${icon("search", 20)}</span>
      <span class="nx-where-text">
        <span class="nx-where-title">${esc(t("Where to?"))}</span>
        <span class="nx-where-sub">${esc(t("Fastest way through traffic — where to?"))}</span>
      </span>
      ${icon("arrow-forward", 20)}
    </button>

    <!-- One tap to somewhere you go constantly, instead of retyping a Karachi
         address every booking. Saved places first, then what you actually
         used recently. Hidden entirely until there is something in it, so a
         new customer never meets an empty rail. -->
    <div class="nx-places mb-4" id="savedPlaces" hidden></div>

    <div class="nx-sec"><span class="nx-sec-title">${esc(t("Rides"))}</span></div>
    <div class="nx-tiles mb-4">
      <button class="nx-tile t-ride" data-go="/set-locations" data-vehicle="BIKE">
        <span class="nx-tile-icon">${icon("bike", 21)}</span>
        <span class="nx-tile-label">${esc(t("Ride"))}</span>
        <span class="nx-tile-sub">From Rs ${PRICING.BIKE.minimum}</span>
      </button>
      <button class="nx-tile t-parcel${soon("parcel") ? " is-soon" : ""}" data-go="/parcel/service">
        ${soon("parcel") ? `<span class="nx-tile-flag">${esc(t("Soon"))}</span>` : `<span class="nx-tile-flag new">${esc(t("New"))}</span>`}
        <span class="nx-tile-icon">${icon("package", 21)}</span>
        <span class="nx-tile-label">${esc(t("Send a Parcel"))}</span>
        <span class="nx-tile-sub">From Rs ${PRICING.PARCEL.minimum}</span>
      </button>
      <button class="nx-tile t-errand${soon("errand") ? " is-soon" : ""}" data-go="/errand/details">
        ${soon("errand") ? `<span class="nx-tile-flag">${esc(t("Soon"))}</span>` : `<span class="nx-tile-flag new">${esc(t("New"))}</span>`}
        <span class="nx-tile-icon">${icon("basket", 21)}</span>
        <span class="nx-tile-label">${esc(t("Pick & Deliver"))}</span>
        <span class="nx-tile-sub">From Rs ${PRICING.ERRAND.minimum}</span>
      </button>
    </div>

    <!-- Real points against a real tier. Nothing here promises a free ride,
         because nothing in the backend currently grants one — see the note in
         js/promos.js. -->
    <div id="loyaltyStrip" class="mb-4" hidden></div>

    <div class="nx-sec"><span class="nx-sec-title">${esc(t("More"))}</span></div>
    <div class="nx-tiles mb-6">
      <button class="nx-tile t-reward" data-go="/loyalty">
        <span class="nx-tile-icon">${icon("star", 21)}</span>
        <span class="nx-tile-label">${esc(t("Loyalty & Rewards"))}</span>
      </button>
      <button class="nx-tile t-refer" data-go="/refer">
        <span class="nx-tile-icon">${icon("gift", 21)}</span>
        <span class="nx-tile-label">${esc(t("Refer & Earn"))}</span>
      </button>
      <button class="nx-tile t-biz" data-go="/business">
        <span class="nx-tile-icon">${icon("users", 21)}</span>
        <span class="nx-tile-label">${esc(t("Nova Go for Business"))}</span>
      </button>
    </div>
  `;

  /* ---- saved places + recents ---- */
  (function paintPlaces() {
    const rail = panel.querySelector("#savedPlaces");
    if (!rail) return;
    const saved = listSavedPlaces();
    // A recent that is already saved under a name would otherwise appear
    // twice, once as "Home" and once as its raw address.
    const savedKeys = new Set(saved.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`));
    const recents = listRecents()
      .filter((r) => !savedKeys.has(`${r.lat.toFixed(3)},${r.lng.toFixed(3)}`))
      .slice(0, 4);

    const entries = [
      ...saved.map((pl) => ({ ...pl, isRecent: false })),
      ...recents.map((pl) => ({ ...pl, kind: "recent", isRecent: true })),
    ];
    if (entries.length === 0) return;

    rail.hidden = false;
    rail.innerHTML = entries
      .map((pl, i) => {
        const meta = pl.isRecent
          ? { icon: "history", label: t("Recent") }
          : PLACE_META[pl.kind] || PLACE_META.other;
        const title = pl.isRecent || pl.kind === "other" ? pl.label : meta.label;
        const sub = pl.isRecent || pl.kind === "other" ? "" : pl.label;
        return `
          <button class="nx-place" data-place="${i}">
            <span class="nx-place-icon">${icon(meta.icon, 16)}</span>
            <span class="nx-place-text">
              <span class="nx-place-title" dir="auto">${esc(title)}</span>
              ${sub ? `<span class="nx-place-sub" dir="auto">${esc(sub)}</span>` : ""}
            </span>
          </button>`;
      })
      .join("");

    rail.querySelectorAll("[data-place]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const pl = entries[Number(btn.dataset.place)];
        if (!pl) return;
        haptic.light();
        touchPlace(pl.lat, pl.lng);
        // The destination is the only thing the next screen exists to
        // collect, and we already have it.
        state.selectedVehicle = "BIKE";
        state.dropoff = { label: pl.label, lat: pl.lat, lng: pl.lng };
        track(pl.isRecent ? "recent_place_used" : "saved_place_used", { kind: pl.kind });
        navigate("/set-locations");
      }),
    );
  })();

  /* ---- loyalty progress ---- */
  if (!isGuest) {
    api.getLoyalty()
      .then((l) => {
        const strip = panel.querySelector("#loyaltyStrip");
        if (!strip || !panel.isConnected || !l) return;
        strip.hidden = false;
        strip.innerHTML = loyaltyStripHtml(l);
      })
      .catch(() => { /* the strip simply stays hidden */ });
  }

  panel.querySelectorAll("[data-go]").forEach((elm) =>
    elm.addEventListener("click", () => {
      haptic.light();
      if (elm.dataset.vehicle) state.selectedVehicle = elm.dataset.vehicle;
      navigate(elm.dataset.go);
    }),
  );
}

/**
 * Distance to the next tier, as a bar.
 *
 * Deliberately NOT "3 more rides to a free ride". That is the copy the
 * category uses and it would be a lie here: LoyaltyService awards points and
 * sorts users into Bronze/Silver/Gold, but nothing spends points and no tier
 * currently confers a benefit. Promising a reward the backend cannot deliver
 * is worse than showing a smaller, true one — the customer finds out at the
 * moment they try to claim it. What is shown is exactly what exists: points
 * earned, tier, and how far the next tier is.
 */
function loyaltyStripHtml(l) {
  const points = Number(l.points || 0);
  const toNext = Number(l.pointsToNextTier || 0);
  const nextTier = l.nextTier;
  // The bar spans the CURRENT tier band, so it fills as you cross it rather
  // than measuring progress from zero forever.
  const bandStart = nextTier ? points + toNext - tierBand(l.tier) : 0;
  const pct = nextTier && toNext > 0
    ? Math.max(4, Math.min(100, ((points - bandStart) / Math.max(1, points + toNext - bandStart)) * 100))
    : 100;

  return `
    <div class="nx-loyalty">
      <div class="flex justify-between items-baseline">
        <p class="font-bold text-sm">${esc(l.tier || "Bronze")} · <span class="nx-num">${points}</span> points</p>
        ${nextTier
          ? `<p class="text-xs text-secondary"><span class="nx-num">${toNext}</span> to ${esc(nextTier)}</p>`
          : `<p class="text-xs" style="color:var(--success);font-weight:700;">Top tier</p>`}
      </div>
      <div class="nx-loyalty-track">
        <div class="nx-loyalty-fill" style="width:${pct.toFixed(0)}%;"></div>
      </div>
      <p class="text-xs text-muted">
        ${l.pointsPerTrip ? `<span class="nx-num">${l.pointsPerTrip}</span> points every completed trip` : "Earn points on every trip"}
      </p>
    </div>
  `;
}

/* Mirrors the TIERS table in the backend's loyalty.service.ts. Only used to
   size the progress bar; if the two drift the bar is slightly wrong, which
   is a cosmetic problem rather than a correctness one. */
function tierBand(tier) {
  return { Bronze: 200, Silver: 300, Gold: 500, Platinum: 1000 }[tier] || 200;
}

// ---------------- Taxi tab (Standard / AC / Premium tiers) ----------------

const TAXI_TIERS = [
  { key: "STANDARD", name: "Nova Standard", desc: "Everyday car, real-time fare", multiplier: 1.0, icon: "car" },
  { key: "AC", name: "Nova AC", desc: "Air-conditioned, extra comfort", multiplier: 1.3, icon: "car" },
  { key: "PREMIUM", name: "Nova Premium", desc: "Top-rated drivers, newer cars", multiplier: 1.8, icon: "car" },
];
const TAXI_BASE_FROM = 450; // mirrors VEHICLES' CAR "from" price on the Bike tab's old fare screen

function renderTaxiTab(panel) {
  let selected = state.taxiTier || "STANDARD";
  panel.innerHTML = `
    <div class="glow-card mb-4">
      <div class="flex items-center gap-3">
        <div class="list-row-icon" style="background:rgba(255, 182, 72, 0.14); color:var(--accent-2);">${icon("taxi", 22)}</div>
        <div class="flex-col" style="flex:1;">
          <p class="font-bold">Book a Taxi</p>
          <p class="text-secondary text-sm">Pick a comfort tier, then set your route</p>
        </div>
      </div>
    </div>
    <div class="flex-col gap-3 mb-4" id="tierList">
      ${TAXI_TIERS.map((t) => `
        <button class="option-card${t.key === selected ? " selected" : ""}" data-tier="${t.key}">
          <div class="list-row-icon">${icon(t.icon, 20)}</div>
          <div class="flex-col" style="flex:1;">
            <p class="font-bold">${t.name}</p>
            <p class="text-secondary text-sm">${t.desc}</p>
          </div>
          <p class="font-bold text-accent">from ${fmtMoney(Math.round(TAXI_BASE_FROM * t.multiplier))}</p>
        </button>`).join("")}
    </div>
    <p class="text-xs text-muted mb-4 text-center">Tier sets your comfort preference — the real fare is calculated by the backend from live distance once you request, same as every Nova Go ride.</p>
    <button id="taxiContinueBtn" class="btn btn-primary btn-block">Set Pickup & Drop-off ${icon("arrow-forward", 18)}</button>
  `;

  panel.querySelectorAll("[data-tier]").forEach((c) => {
    c.addEventListener("click", () => {
      panel.querySelectorAll("[data-tier]").forEach((x) => x.classList.remove("selected"));
      c.classList.add("selected");
      selected = c.dataset.tier;
      state.taxiTier = selected;
    });
  });
  panel.querySelector("#taxiContinueBtn").addEventListener("click", () => {
    state.selectedVehicle = "CAR";
    state.taxiTier = selected;
    navigate("/set-locations");
  });
}

// ---------------- Food tab (restaurant marketplace teaser) ----------------

function renderFoodTab(panel, isGuest) {
  /* FOOD IS PARKED, AND THIS PANEL HAS TO SAY SO.
     The routes below (/food/browse) are guarded and redirect to coming-soon,
     but the guard only fires once someone taps. Until then this panel was
     rendering "Order food — browse restaurants near you", an "Open Now"
     heading and a live restaurant fetch: a customer reads that as a working
     service, taps, and gets bounced. Advertising something we can't serve and
     catching it one screen later is worse than not advertising it.

     Still a tab rather than hidden, deliberately: the tap is a real demand
     signal telling you whether food is worth switching on next, and a waiting
     list is more useful than a dead end. */
  if (!SERVICES.food.live) {
    panel.innerHTML = `
      <div class="nx-soon-panel">
        <div class="nx-soon-art">${icon("utensils", 28)}</div>
        <h3 class="nx-soon-title">Food is coming</h3>
        <p class="nx-soon-copy">
          We're signing up kitchens across Karachi now. Rides, parcels and
          errands are live today &mdash; food switches on once there are enough
          restaurants for it to actually be useful.
        </p>
        <button id="notifyFoodBtn" class="btn btn-secondary">${icon("bell", 16)} Tell me when it's live</button>
      </div>`;

    panel.querySelector("#notifyFoodBtn").addEventListener("click", (e) => {
      // No endpoint behind this yet, so it does not pretend to have signed
      // anyone up — it records the intent for you and says something true.
      track("food_interest", {});
      e.currentTarget.disabled = true;
      e.currentTarget.innerHTML = `${icon("check-circle", 16)} We'll let you know`;
    });
    return () => {};
  }

  panel.innerHTML = `
    <div class="glow-card mb-4" id="foodSearchCard" style="cursor:pointer;">
      <div class="flex items-center gap-3">
        <div class="list-row-icon" style="background:rgba(124, 58, 237, 0.12); color:var(--accent);">${icon("utensils", 22)}</div>
        <div class="flex-col" style="flex:1;">
          <p class="font-bold">Order food</p>
          <p class="text-secondary text-sm">Browse restaurants near you</p>
        </div>
        ${icon("arrow-forward", 20)}
      </div>
    </div>
    <div class="flex justify-between items-center mb-3">
      <h3 class="text-sm text-secondary" style="text-transform:uppercase; letter-spacing:0.04em;">Open Now</h3>
      <button id="seeAllBtn" class="text-xs text-accent font-bold">See all</button>
    </div>
    <div id="restaurantList" class="flex-col gap-3">${skeletonRows(3)}</div>
  `;

  panel.querySelector("#foodSearchCard").addEventListener("click", () => navigate("/food/browse"));
  panel.querySelector("#seeAllBtn").addEventListener("click", () => navigate("/food/browse"));

  let cancelled = false;
  api.browseRestaurants()
    .then((restaurants) => {
      if (cancelled) return;
      const list = panel.querySelector("#restaurantList");
      if (!restaurants.length) {
        list.innerHTML = `<div class="empty-state"><p class="text-sm">No restaurants live in your area yet — check back soon.</p></div>`;
        return;
      }
      list.innerHTML = restaurants.slice(0, 5).map((r) => restaurantCardHtml(r)).join("");
      list.querySelectorAll("[data-restaurant-id]").forEach((c) =>
        c.addEventListener("click", () => openRestaurant(c.dataset.restaurantId, restaurants))
      );
    })
    .catch(() => {
      if (cancelled) return;
      panel.querySelector("#restaurantList").innerHTML = `<div class="empty-state"><p class="text-sm">Couldn't load restaurants right now.</p></div>`;
    });

  return () => { cancelled = true; };
}

/**
 * Rich restaurant card — banner-led, the way food apps sell food. A plain
 * text row makes a biryani place look like a bank statement line.
 *
 * bannerUrl comes from the restaurant's own upload; when it's missing we
 * show a branded gradient placeholder rather than a broken image, so an
 * un-photographed restaurant still looks deliberate.
 */
export function restaurantCardHtml(r) {
  const tags = (r.cuisineTags || []).slice(0, 3);
  const isOpen = r.isOpen !== false;
  const prep = r.prepTimeMinutes || 20;
  return `
    <div class="food-card stagger-item" data-restaurant-id="${esc(r.id)}" style="cursor:pointer;">
      <div class="food-card-banner" ${r.bannerUrl ? `style="background-image:url('${esc(r.bannerUrl)}');"` : ""}>
        ${r.bannerUrl ? "" : icon("utensils", 34)}
        <div class="food-card-badges">
          ${isOpen ? `<span class="badge badge-success">Open now</span>` : ""}
          ${r.status === "APPROVED" ? `<span class="badge badge-accent">${icon("check", 10)} Verified</span>` : ""}
        </div>
        ${isOpen ? "" : `<div class="closed-veil">Currently closed</div>`}
      </div>
      <div class="food-card-body">
        <div class="flex justify-between items-start">
          <p class="font-bold" style="flex:1;">${esc(r.name)}</p>
          <span class="badge badge-accent" style="padding:2px 8px;">${icon("star", 11)} ${(r.rating ?? 5).toFixed(1)}</span>
        </div>
        <p class="text-secondary text-xs mt-1">${esc(tags.join(" · ")) || "Restaurant"}</p>
        <div class="food-meta">
          <span>${prep}–${prep + 15} min</span>
          <span class="dot"></span>
          <span>Delivery from Rs. 50</span>
        </div>
      </div>
    </div>
  `;
}

function openRestaurant(id, cachedList) {
  const cached = cachedList?.find((r) => r.id === id);
  state.currentRestaurant = cached ? { ...cached, menuItems: null } : { id };
  navigate("/food/restaurant");
}

// ---------------- Legacy routes still used by Bike/Taxi flows ----------------

const KARACHI = { lat: 24.8607, lng: 67.0011 };

export function renderSetLocations(root) {
  const pickup = state.pickup || { label: "Current Location" };
  const dropoff = state.dropoff || { label: "" };

  root.innerHTML = `
    <div class="page nx-route-page">
      <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Set your route</h1>

      <div class="card mb-4" style="overflow:visible;">
        <div class="flex gap-3">
          <div class="flex-col items-center" style="gap:4px; padding-top:30px;">
            <div style="width:10px;height:10px;border-radius:50%;background:var(--accent);"></div>
            <div style="width:2px;height:44px;background:var(--surface-border);"></div>
            <div style="width:10px;height:10px;border-radius:2px;background:var(--accent-2);"></div>
          </div>
          <div class="flex-col gap-3" style="flex:1; min-width:0;">
            <div class="nx-autocomplete">
              <label class="field-label">Pickup</label>
              <input id="pickupInput" class="input" type="text" autocomplete="off"
                     value="${esc(pickup.label || "")}" placeholder="Current location"/>
              <div class="nx-suggest" id="pickupSuggest" hidden></div>
            </div>
            <div class="nx-autocomplete">
              <label class="field-label">Drop-off</label>
              <input id="dropoffInput" class="input" type="text" autocomplete="off"
                     value="${esc(dropoff.label || "")}" placeholder="Where to?"/>
              <div class="nx-suggest" id="dropoffSuggest" hidden></div>
            </div>
          </div>
        </div>
      </div>

      <!-- A real map with the real road route. This used to be a decorative
           radar sweep captioned "not wired yet" — the customer's first
           impression of whether this app knows where anything is. -->
      <div id="routeMap" class="mb-2" style="height:220px;border-radius:var(--r-lg);overflow:hidden;">
        ${mapSkeleton("220px")}
      </div>
      <p class="text-xs text-muted mb-4" id="routeInfo" style="min-height:16px;"></p>

      <button id="confirmLocationBtn" class="btn btn-primary btn-block">Confirm route ${icon("arrow-forward", 18)}</button>
    </div>
  `;

  const $ = (s) => root.querySelector(s);
  let mapHandle = null;
  let here = null;
  let pickupCoords = null;
  let dropoffCoords = null;
  const suggesters = [];

  root.querySelector("#backBtn").addEventListener("click", () => history.back());

  /** Redraw pins + road route whenever either end changes. */
  async function refreshRoute() {
    if (!mapHandle) return;
    mapHandle.setPickup(pickupCoords);
    mapHandle.setDropoff(dropoffCoords);

    if (!pickupCoords || !dropoffCoords) {
      mapHandle.setRoute(null);
      mapHandle.fit([pickupCoords, dropoffCoords].filter(Boolean));
      $("#routeInfo").textContent = "";
      return;
    }
    $("#routeInfo").textContent = "Finding the best road route…";
    const route = await getRoute(pickupCoords, dropoffCoords);
    mapHandle.setRoute(route.coordinates);
    mapHandle.fit(route.coordinates, [40, 40]);
    $("#routeInfo").textContent = routeSummary(route) +
      (route.estimated ? " (estimated)" : "");
    // Cache it — the fare screen would otherwise ask the router all over again.
    state.route = route;
  }

  /** Wire one address field: typeahead, selection, and pin sync. */
  function wireField(inputId, listId, onPick) {
    const input = $(`#${inputId}`);
    const list = $(`#${listId}`);
    const suggester = createSuggester((results, { pending }) => {
      if (!results.length) { list.hidden = true; return; }
      list.hidden = false;
      list.innerHTML =
        results.map((r) => `
          <button type="button" class="nx-suggest-row" data-lat="${r.lat}" data-lng="${r.lng}">
            ${icon("location", 15)}<span>${esc(r.displayName)}</span>
          </button>`).join("") +
        (pending ? `<div class="nx-suggest-row muted"><span>Searching…</span></div>` : "");

      list.querySelectorAll("[data-lat]").forEach((row) => {
        row.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus
        row.addEventListener("click", () => {
          const label = row.textContent.trim();
          input.value = label;
          list.hidden = true;
          onPick({ lat: Number(row.dataset.lat), lng: Number(row.dataset.lng), label });
          refreshRoute();
        });
      });
    }, { near: here });

    suggesters.push(suggester);
    input.addEventListener("input", () => {
      onPick(null);              // typing invalidates the previous pin
      suggester.query(input.value);
    });
    input.addEventListener("blur", () => setTimeout(() => { list.hidden = true; }, 180));
    return input;
  }

  (async () => {
    // Boot the map and the device position together — neither blocks the other.
    const container = $("#routeMap");
    here = await getCurrentCoords();
    container.innerHTML = "";
    try {
      mapHandle = await createMap(container, { center: here, zoom: 13 });
    } catch {
      // Tiles blocked or offline. The addresses still work, so say that
      // rather than leaving a broken grey rectangle on the screen.
      container.innerHTML = `<div class="nx-empty" style="padding:26px;">
        <p style="margin:0;">Map didn't load — you can still type your addresses.</p></div>`;
    }

    // "Current Location" is the default pickup, so resolve it up front.
    if (!pickup.label || /current location/i.test(pickup.label)) {
      pickupCoords = { lat: coords.lat, lng: coords.lng };
    }

    wireField("pickupInput", "pickupSuggest", (hit) => { pickupCoords = hit; });
    wireField("dropoffInput", "dropoffSuggest", (hit) => { dropoffCoords = hit; });

    refreshRoute();
    $("#dropoffInput").focus();
  })();

  $("#confirmLocationBtn").addEventListener("click", async (e) => {
    const pickupVal = $("#pickupInput").value.trim() || "Current Location";
    const dropoffVal = $("#dropoffInput").value.trim();
    if (!dropoffVal) { toast("Enter a drop-off location", true); return; }

    // If they typed instead of picking a suggestion, resolve before moving on.
    // Sending an unresolved label to the fare screen is how a driver ends up
    // dispatched to the wrong side of the city.
    const btn = e.currentTarget;
    if (!dropoffCoords) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      const hit = await geocode(dropoffVal, here);
      btn.disabled = false;
      btn.innerHTML = `Confirm route ${icon("arrow-forward", 18)}`;
      if (hit.resolved) dropoffCoords = { lat: hit.lat, lng: hit.lng };
      else { toast("Couldn't find that address — pick one from the list", true); return; }
    }

    state.pickup = { label: pickupVal, ...(pickupCoords || {}) };
    state.dropoff = { label: dropoffVal, ...(dropoffCoords || {}) };
    navigate("/fare");
  });

  return () => { suggesters.forEach((s) => s.destroy()); mapHandle?.destroy(); };
}

const VEHICLES = [
  { type: "BIKE", name: "Nova Moto", desc: "Quick, affordable bike rides", icon: "bike", from: 120, tag: "Fastest" },
  { type: "RICKSHAW", name: "Nova Lite", desc: "Budget-friendly rickshaw", icon: "rickshaw", from: 250 },
  { type: "CAR", name: "Nova Premium", desc: "Comfortable AC car", icon: "car", from: 450 },
];

export function renderFareSelection(root) {
  let selected = state.selectedVehicle || "BIKE";
  // "fareMode": FIXED (backend-calculated, take-it-or-leave-it, same as
  // before) or BID (rider names their own price, inDrive-style — nearby
  // drivers see the offer and choose to accept it or let it pass, same
  // single-shot mechanic the backend's fareType=BID already supports).
  let fareMode = "FIXED";
  const selectedVehicleMeta = () => VEHICLES.find((v) => v.type === selected) || VEHICLES[0];

  root.innerHTML = `
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-1">Choose a ride</h1>
      <p class="text-secondary mb-6">${state.pickup?.label || "Pickup"} → ${state.dropoff?.label || "Drop-off"}</p>
      <div class="flex-col gap-3 mb-6" id="vehicleList">
        ${VEHICLES.map(
          (v) => `
          <button class="option-card${v.type === selected ? " selected" : ""}" data-type="${v.type}">
            <div class="list-row-icon">${icon(v.icon, 22)}</div>
            <div class="flex-col" style="flex:1;">
              <div class="flex items-center gap-2"><p class="font-bold">${v.name}</p>${v.tag ? `<span class="badge badge-accent">${v.tag}</span>` : ""}</div>
              <p class="text-secondary text-sm">${v.desc}</p>
            </div>
            <p class="font-bold text-accent">from Rs.${v.from}</p>
          </button>`
        ).join("")}
      </div>

      <div class="top-tabs mb-4" id="fareModeTabs" style="grid-template-columns: 1fr 1fr;">
        <div class="top-tabs-indicator" style="width:50%; transform:translateX(0);"></div>
        <button class="top-tab active" data-mode="FIXED">Fixed Fare</button>
        <button class="top-tab" data-mode="BID">Name Your Fare</button>
      </div>

      <div id="fareModePanel"></div>

      <button id="requestRideBtn" class="btn btn-primary btn-block mt-4">Request Ride ${icon("bolt", 18)}</button>
    </div>
  `;

  const tabsEl = root.querySelector("#fareModeTabs");
  const indicator = tabsEl.querySelector(".top-tabs-indicator");
  const panel = root.querySelector("#fareModePanel");
  const requestBtn = root.querySelector("#requestRideBtn");

  function renderPanel() {
    if (fareMode === "FIXED") {
      panel.innerHTML = `<p class="text-xs text-muted mb-2 text-center">Exact fare is calculated by the backend once you request — this is an indicative starting price.</p>`;
      requestBtn.innerHTML = `Request Ride ${icon("bolt", 18)}`;
    } else {
      const suggested = selectedVehicleMeta().from;
      panel.innerHTML = `
        <div class="card mb-2">
          <label class="field-label">Your offer (Rs.)</label>
          <input id="bidInput" class="input" type="number" inputmode="numeric" min="1" placeholder="e.g. ${suggested}" value="${suggested}"/>
          <p class="text-xs text-muted mt-2">Nearby drivers see your offer and choose to accept it — like inDrive. A fair offer near the going rate gets matched faster.</p>
        </div>
      `;
      requestBtn.innerHTML = `Send Offer ${icon("bolt", 18)}`;
    }
  }
  renderPanel();

  tabsEl.querySelectorAll("[data-mode]").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      fareMode = btn.dataset.mode;
      tabsEl.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b === btn));
      indicator.style.transform = i === 0 ? "translateX(0)" : "translateX(100%)";
      renderPanel();
    });
  });

  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelectorAll(".option-card").forEach((c) => {
    c.addEventListener("click", () => {
      root.querySelectorAll(".option-card").forEach((x) => x.classList.remove("selected"));
      c.classList.add("selected");
      selected = c.dataset.type;
      state.selectedVehicle = selected;
      if (fareMode === "BID") renderPanel();
    });
  });

  requestBtn.addEventListener("click", async () => {
    if (!Token.access) {
      state.postAuthRedirect = "/fare";
      navigate("/signin");
      return;
    }
    let offeredFare;
    if (fareMode === "BID") {
      offeredFare = Number(root.querySelector("#bidInput").value);
      if (!offeredFare || offeredFare <= 0) { toast("Enter a valid offer amount", true); return; }
    }
    requestBtn.disabled = true;
    requestBtn.innerHTML = `<span class="spinner"></span> ${fareMode === "BID" ? "Sending offer..." : "Finding a driver..."}`;
    try {
      const coords = await getRouteCoords();
      if (!coords.dropoffResolved) {
        toast("Couldn't find that drop-off address — try a more specific one", true);
        requestBtn.disabled = false;
        requestBtn.innerHTML = fareMode === "BID" ? `Send Offer ${icon("bolt", 18)}` : `Request Ride ${icon("bolt", 18)}`;
        return;
      }
      const trip = await api.createTrip({
        pickupLat: coords.pickupLat,
        pickupLng: coords.pickupLng,
        dropoffLat: coords.dropoffLat,
        dropoffLng: coords.dropoffLng,
        vehicleType: selected,
        fareType: fareMode,
        ...(fareMode === "BID" ? { offeredFare } : {}),
      });
      state.activeTripId = trip.id;
      navigate("/tracking");
    } catch (err) {
      toast(err.message || "Couldn't request a ride", true);
      requestBtn.disabled = false;
      requestBtn.innerHTML = fareMode === "BID" ? `Send Offer ${icon("bolt", 18)}` : `Request Ride ${icon("bolt", 18)}`;
    }
  });
}

// No geocoding wired (needs a Maps/Places API key — real added cost flagged
// in the roadmap). Pickup uses the device's real GPS; drop-off is a nearby
// offset so the real matching/fare pipeline can be exercised end-to-end.
// Geocodes the addresses the rider actually typed (see js/geocode.js).
// Previously this ignored them entirely and sent current-GPS + a fixed
// offset, so the driver was always dispatched to the wrong place.
async function getRouteCoords() {
  const { pickup, dropoff } = await resolveRoute(state.pickup?.label, state.dropoff?.label);
  return {
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    dropoffLat: dropoff.lat,
    dropoffLng: dropoff.lng,
    dropoffResolved: dropoff.resolved,
  };
}
