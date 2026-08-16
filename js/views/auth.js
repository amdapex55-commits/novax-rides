// Nova Go Rides — splash, welcome/role picker, phone entry (rider + driver +
// restaurant), OTP verify. Self-service signup is real: whichever door a
// new phone number comes through (rider / "Drive & Earn" / "List Your
// Restaurant") sets that account's role on creation — see
// auth.service.requestOtp on the backend. An existing account's role never
// changes by re-requesting an OTP through a different door.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, e164, esc } from "../ui.js";
import { navigate } from "../router.js";
import { track } from "../analytics.js";
import { APP, APP_CONFIG, isCustomerApp } from "../appMode.js";
import { COMMERCIALS } from "../support.config.js";
import { ZONE, PRICING, SERVICES } from "../launch.config.js";

export function renderSplash(root) {
  root.innerHTML = `
    <div class="flex-col items-center justify-center" style="height:100dvh;">
      <div style="width:96px;height:96px;border-radius:28px;background:var(--accent-gradient);display:flex;align-items:center;justify-content:center;box-shadow:var(--accent-glow);margin-bottom:24px;">
        ${icon("bolt", 48, 2)}
      </div>
      <h1 style="font-size:28px;">${APP_CONFIG.name}</h1>
      <p class="text-secondary mt-2">${APP_CONFIG.tagline}</p>
      <div class="spinner text-accent mt-6"></div>
    </div>
  `;
  const t = setTimeout(async () => {
    if (Token.access) {
      try {
        const user = await api.getMe();
        window.__novagoRefreshNav();
        // Wrong app for this account — the router's own guard renders a clear
        // "use the other app" screen, so just land on this build's home and
        // let it catch them there.
        if (!APP_CONFIG.allowedRoles.includes(user.role)) { navigate(APP_CONFIG.home); return; }

        if (user.role === "DRIVER") navigate(user.kycStatus === "APPROVED" ? "/driver/home" : "/driver/pending");
        else if (user.role === "ADMIN") navigate("/ops/command");
        else if (user.role === "RESTAURANT") navigate(await restaurantHomePath());
        else navigate("/home");
        return;
      } catch { Token.clear(); }
    }
    navigate("/welcome");
  }, 900);
  return () => clearTimeout(t);
}

// ---------------------------------------------------------------------------
// Welcome screens — one per app.
//
// The customer app is a CONSUMER product: it opens on "what can I get right
// now", never on "which kind of user are you". Driver/merchant/ops open on
// their own value proposition. This is the difference between an app that
// feels like a product and one that feels like an internal tool with a
// public login.
// ---------------------------------------------------------------------------

// The FIRST screen a customer ever sees. It used to advertise four services
// and "one app" — three of which can't take an order, and a vehicle choice
// (rickshaw, car) that doesn't exist in the pilot. That's not ambition, it's
// a promise the product breaks two taps later.
//
// Now it sells the one thing Nova Go actually does, with the four reasons to
// trust it. "Coming next" lives further down, small, where it belongs.
const CUSTOMER_PROOF = [
  { icon: "bolt",   label: "Beat traffic",   sub: "A bike gets through where a car can't" },
  { icon: "wallet", label: "Fare locked",    sub: "See the price before you book" },
  { icon: "shield", label: "Verified rider", sub: "CNIC & licence checked by a person" },
  { icon: "locate", label: "Live tracking",  sub: "Watch them arrive, share your ride" },
];

// One accent. A single-service app shouldn't look like four products.
const PROOF_THEME = {
  color: "var(--accent)", soft: "var(--brand-ride-soft)", glow: "rgba(109,40,217,0.14)",
};

function renderCustomerWelcome(root) {
  root.innerHTML = `
    <div class="page nx-welcome nx-stagger" style="min-height:100dvh; display:flex; flex-direction:column; justify-content:center;">
      <!-- Ambient brand glow. Cheap (two blurred radial gradients, no JS) but
           it's the difference between "form on white" and "a product". -->
      <div class="nx-welcome-glow" aria-hidden="true"></div>

      <div class="text-center mb-5" style="position:relative;">
        <div class="nx-welcome-mark">${icon("bike", 30, 2)}</div>
        <span class="badge badge-accent mb-3">
          <span class="nx-live-dot" style="width:6px;height:6px;"></span> Live in ${esc(ZONE.name)}
        </span>
        <h1 class="text-xl" style="font-size:34px; line-height:1.1; letter-spacing:-0.035em;">
          Beat the traffic.<br/>Pay in cash.
        </h1>
        <p class="text-secondary mt-2">
          Bike rides across ${esc(ZONE.name)} — from Rs. ${PRICING.BIKE.minimum}.
        </p>
      </div>

      <div class="nx-welcome-grid mb-5">
        ${CUSTOMER_PROOF.map((s) => `
          <div class="nx-service-tile" style="--tile-color:${PROOF_THEME.color}; --tile-soft:${PROOF_THEME.soft}; --tile-glow:${PROOF_THEME.glow};">
            <span class="nx-tile-icon">${icon(s.icon, 21)}</span>
            <span class="nx-tile-title">${s.label}</span>
            <span class="nx-tile-sub">${s.sub}</span>
          </div>`).join("")}
      </div>

      <button id="startBtn" class="btn btn-primary btn-block mb-3" style="height:56px; font-size:16px;">
        Book a bike ${icon("arrow-forward", 18)}
      </button>
      <button id="guestBtn" class="btn btn-ghost btn-block">Look around first</button>

      <!-- What else we do. Derived from SERVICES rather than hardcoded — this
           line said "food, parcels & errands coming soon" for hours after
           parcels and errands went live, which is the first screen telling a
           new customer we do less than we do. -->
      ${(() => {
        const live = [SERVICES.parcel, SERVICES.errand].filter((s) => s.live).map((s) => s.label.toLowerCase());
        const soon = [SERVICES.food].filter((s) => !s.live).map((s) => s.label.toLowerCase());
        const parts = [];
        if (live.length) parts.push(`${live.join(" &amp; ")} too`);
        if (soon.length) parts.push(`${soon.join(" &amp; ")} coming soon`);
        return parts.length
          ? `<p class="nx-welcome-next">Bike rides, ${parts.join(" &middot; ")}</p>`
          : "";
      })()}

      <p class="text-xs text-muted text-center mt-3">
        By continuing you agree to our
        <a href="#/legal/terms" style="color:var(--accent);">Terms</a>,
        <a href="#/legal/privacy" style="color:var(--accent);">Privacy Policy</a> and
        <a href="#/legal/safety" style="color:var(--accent);">Safety Policy</a>.
      </p>
    </div>
  `;
  // The tiles are reasons to trust us, not navigation — tapping one starts
  // the same booking flow rather than doing nothing (which reads as broken).
  root.querySelectorAll(".nx-service-tile").forEach((tile) =>
    tile.addEventListener("click", () => root.querySelector("#startBtn").click()));

  root.querySelector("#startBtn").addEventListener("click", () => {
    track("welcome_role_selected", { role: "RIDER" });
    navigate("/signin");
  });
  root.querySelector("#guestBtn").addEventListener("click", () => navigate("/home"));
}

const PARTNER_COPY = {
  driver: {
    // Bike-only, because that is the only vehicle the pilot dispatches.
    // Telling a car owner "use what you already own" and then never sending
    // them a job wastes their time and burns a recruit you may want later.
    icon: "bike",
    heading: "Your bike. Your hours.",
    sub: "Carry passengers across Karachi and keep 85% of every fare, in cash, the same day.",
    points: [
      { icon: "wallet", label: "Cash in your hand", sub: "Passengers pay you directly, every trip" },
      { icon: "bolt", label: "Work when you want", sub: "Go online and offline any time — no shifts" },
      { icon: "bike", label: "Just your motorcycle", sub: "Licence, registration and a helmet is all you need" },
    ],
    cta: "Start riding",
    explainerPath: "/earnings-explained",
    explainerLabel: "See exactly how you get paid",
    legalPath: "/legal/driver-agreement",
    legalLabel: "Driver Agreement",
  },
  merchant: {
    icon: "store",
    heading: "Fill more orders",
    sub: "Put your kitchen in front of customers across the city. You control your menu, prices and hours.",
    points: [
      { icon: "package", label: "Orders straight to you", sub: "Accept, prepare, hand over" },
      { icon: "utensils", label: "Your menu, your prices", sub: "Update anything, any time" },
      { icon: "bike", label: "We handle delivery", sub: "Nova Go riders collect and deliver" },
    ],
    cta: "Partner with Nova Go",
    explainerPath: "/commission-explained",
    explainerLabel: "See exactly how payments work",
    legalPath: "/legal/restaurant-agreement",
    legalLabel: "Restaurant Partner Agreement",
  },
  ops: {
    icon: "bolt",
    heading: "Nova Go Operations",
    sub: "Internal console. Dispatch, safety incidents and partner approvals.",
    points: [],
    cta: "Sign in",
    legalPath: null,
    legalLabel: null,
  },
};

function renderPartnerWelcome(root) {
  const c = PARTNER_COPY[APP] || PARTNER_COPY.driver;
  // Each partner app owns its accent, so a driver and a restaurant owner
  // aren't looking at the identical green screen with different words.
  const theme = APP === "merchant"
    ? { grad: "linear-gradient(135deg,#c07f04,#f0a91b)", color: "var(--accent-2)", soft: "var(--brand-food-soft)" }
    : APP === "ops"
      ? { grad: "linear-gradient(135deg,#16324f,#2563eb)", color: "#2563eb", soft: "rgba(37,99,235,0.10)" }
      : { grad: "var(--accent-gradient)", color: "var(--accent)", soft: "var(--brand-ride-soft)" };

  // The single number that answers "is this worth my time?" — shown before
  // the feature list, because that's the order people actually decide in.
  const headline = APP === "driver"
    ? { value: `${100 - COMMERCIALS.driverCommissionPct}%`, label: "of every fare is yours" }
    : APP === "merchant"
      ? { value: `${100 - COMMERCIALS.restaurantCommissionPct}%`, label: "of every order subtotal is yours" }
      : null;

  root.innerHTML = `
    <div class="page nx-welcome nx-stagger" style="min-height:100dvh; display:flex; flex-direction:column; justify-content:center;">
      <div class="nx-welcome-glow" aria-hidden="true" style="--glow-a:${theme.color};"></div>

      <div class="text-center mb-5" style="position:relative;">
        <div class="nx-welcome-mark" style="background:${theme.grad};">${icon(c.icon, 30, 2)}</div>
        <h1 class="text-xl" style="font-size:29px; letter-spacing:-0.03em;">${c.heading}</h1>
        <p class="text-secondary mt-2">${c.sub}</p>
      </div>

      ${headline ? `
        <div class="nx-hero-card ${APP === "merchant" ? "food" : ""} mb-4 text-center">
          <p style="font-size:44px;font-weight:800;font-family:var(--font-display);letter-spacing:-0.04em;line-height:1;">
            ${headline.value}
          </p>
          <p style="font-size:13.5px;opacity:0.9;margin-top:6px;">${headline.label}</p>
        </div>` : ""}

      ${c.points.length ? `
        <div class="flex-col gap-2 mb-5">
          ${c.points.map((p) => `
            <div class="list-row nx-lift" style="background:var(--surface); border-radius:var(--r-md);">
              <div class="list-row-icon" style="color:${theme.color}; background:${theme.soft};">${icon(p.icon, 20)}</div>
              <div style="flex:1;">
                <p class="font-bold text-sm">${p.label}</p>
                <p class="text-secondary text-xs">${p.sub}</p>
              </div>
            </div>`).join("")}
        </div>` : `<div class="mb-6"></div>`}

      <button id="startBtn" class="btn btn-primary btn-block" style="height:56px; font-size:16px;">
        ${c.cta} ${icon("arrow-forward", 18)}
      </button>
      ${c.explainerPath ? `<button id="explainerBtn" class="btn btn-ghost btn-block mt-2">${c.explainerLabel}</button>` : ""}

      ${c.legalPath ? `
        <p class="text-xs text-muted text-center mt-6">
          By continuing you agree to the
          <a href="#${c.legalPath}" style="color:var(--accent);">${c.legalLabel}</a>.
        </p>` : ""}
    </div>
  `;
  root.querySelector("#startBtn").addEventListener("click", () => {
    track("welcome_role_selected", { role: APP_CONFIG.signupRole || "ADMIN" });
    navigate("/signin");
  });
  root.querySelector("#explainerBtn")?.addEventListener("click", () => navigate(c.explainerPath));
}

export function renderWelcome(root) {
  track("app_opened", { app: APP });
  return isCustomerApp ? renderCustomerWelcome(root) : renderPartnerWelcome(root);
}

// A restaurant account's landing screen depends on how far they've gotten
// in onboarding — no profile yet, awaiting approval, or fully live. One
// extra request on login (mirrors the driver KYC check above) rather than
// guessing from the JWT, since restaurant status can change server-side
// (admin approval/suspension) between logins.
async function restaurantHomePath() {
  try {
    const restaurant = await api.getMyRestaurant();
    if (restaurant.status === "PENDING") return "/restaurant/pending";
    return "/restaurant/orders";
  } catch {
    return "/restaurant/onboarding";
  }
}


// PHONE + OTP SIGNUP WAS REMOVED HERE.
//
// OTP is off (ENABLE_OTP_LOGIN defaults to false, and the backend refuses
// /auth/otp/* at the controller while it is), so these screens could only
// ever have failed. Password signup in views/account.js is the live path and
// hands back tokens immediately — nothing is waiting on an SMS provider.
//
// The screens are in git history if OTP is ever switched back on; they are
// not worth shipping in the meantime, and their copy — "No password, we'll
// text you a code" — was telling people something that could not happen.
