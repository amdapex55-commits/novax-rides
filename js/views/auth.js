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
  /* A WELCOME SCREEN IS NOT A LANDING PAGE.
     The person has already found us, chosen to open the app, and is holding
     it. Selling them four benefit cards before showing a button treats an
     opened app like a cold visitor — and pushed the one control that matters
     off the bottom of a 812px screen.

     So: say what this is, give the number that decides it, get out of the
     way. Three facts on ONE line instead of four cards, and the CTA sitting
     where a thumb already rests. */
  const soon = SERVICES.food && !SERVICES.food.live;
  const alsoLive = [SERVICES.parcel, SERVICES.errand]
    .filter((x) => x && x.live)
    .map((x) => x.label.toLowerCase());

  root.innerHTML = `
    <div class="page nx-wel">
      <div class="nx-wel-glow" aria-hidden="true"></div>

      <header class="nx-wel-top">
        <div class="nx-wel-mark">${icon("bike", 26, 2)}</div>
        <span class="nx-wel-live">
          <span class="nx-live-dot"></span> Live in ${esc(ZONE.name)}
        </span>
      </header>

      <div class="nx-wel-hero">
        <h1 class="nx-wel-h1">
          Beat the traffic.<br/><span class="nx-chrome">Pay in cash.</span>
        </h1>
        <p class="nx-urdu nx-wel-urdu" lang="ur">بس نووا کرو</p>
        <p class="nx-wel-sub">
          A bike to your door in ${esc(ZONE.name)}. The fare is fixed before
          you book, and cash is the only thing you need.
        </p>
      </div>

      <!-- Three facts, one row. These are the answers to the only three
           questions a first-time customer actually has: what does it cost,
           who turns up, and can I see them coming. -->
      <ul class="nx-wel-facts">
        <li><span class="nx-wel-fact-v">Rs ${PRICING.BIKE.minimum}</span><span class="nx-wel-fact-l">minimum fare</span></li>
        <li><span class="nx-wel-fact-v">CNIC</span><span class="nx-wel-fact-l">rider checked by a person</span></li>
        <li><span class="nx-wel-fact-v">Live</span><span class="nx-wel-fact-l">track and share the ride</span></li>
      </ul>

      <div class="nx-wel-actions">
        <button id="startBtn" class="btn btn-primary btn-block nx-wel-cta">
          Book a bike ${icon("arrow-forward", 18)}
        </button>
        <button id="guestBtn" class="btn btn-ghost btn-block">Look around first</button>
      </div>

      <footer class="nx-wel-foot">
        ${alsoLive.length || soon ? `<p class="nx-wel-next">
          ${alsoLive.length ? `Bike rides, ${alsoLive.join(" &amp; ")} too` : "Bike rides"}${soon ? " &middot; food coming soon" : ""}
        </p>` : ""}
        <p class="nx-wel-legal">
          By continuing you agree to our
          <a href="#/legal/terms">Terms</a>,
          <a href="#/legal/privacy">Privacy Policy</a> and
          <a href="#/legal/safety">Safety Policy</a>.
        </p>
      </footer>
    </div>
  `;

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
  // Each partner app owns its accent, so a rider and a restaurant owner are
  // not looking at the identical screen with different words.
  const accent = APP === "merchant" ? "food" : APP === "ops" ? "ops" : "ride";

  /* THE NUMBER IS THE HEADLINE.
     It used to sit in a large card BELOW a headline and a paragraph, so the
     first thing a rider read was "Your bike. Your hours." — which is a
     slogan — and the thing they actually decide on was third.
     Someone weighing up whether to sign up is answering one question: what
     do I keep. That goes first, at the size it deserves. */
  const share = APP === "driver"
    ? { value: 100 - COMMERCIALS.driverCommissionPct, label: "of every fare is yours, in cash, the same day" }
    : APP === "merchant"
      ? { value: 100 - COMMERCIALS.restaurantCommissionPct, label: "of every order subtotal is yours" }
      : null;

  root.innerHTML = `
    <div class="page nx-wel nx-wel-${accent}">
      <div class="nx-wel-glow" aria-hidden="true"></div>

      <header class="nx-wel-top">
        <div class="nx-wel-mark">${icon(c.icon, 26, 2)}</div>
        <span class="nx-wel-live">${esc(c.heading)}</span>
      </header>

      <div class="nx-wel-hero">
        ${share ? `
          <p class="nx-wel-figure"><span class="nx-chrome">${share.value}%</span></p>
          <p class="nx-wel-figure-label">${esc(share.label)}</p>
        ` : `<h1 class="nx-wel-h1">${esc(c.heading)}</h1>`}
        <p class="nx-wel-sub">${esc(c.sub)}</p>
      </div>

      ${c.points.length ? `
        <ul class="nx-wel-points">
          ${c.points.map((pt) => `
            <li>
              <span class="nx-wel-point-ic">${icon(pt.icon, 18)}</span>
              <span class="nx-wel-point-text">
                <strong>${esc(pt.label)}</strong>
                <span>${esc(pt.sub)}</span>
              </span>
            </li>`).join("")}
        </ul>` : ""}

      <div class="nx-wel-actions">
        <button id="startBtn" class="btn btn-primary btn-block nx-wel-cta">
          ${esc(c.cta)} ${icon("arrow-forward", 18)}
        </button>
        ${c.explainerPath ? `<button id="explainerBtn" class="btn btn-ghost btn-block">${esc(c.explainerLabel)}</button>` : ""}
      </div>

      ${c.legalPath ? `
        <footer class="nx-wel-foot">
          <p class="nx-wel-legal">
            By continuing you agree to the
            <a href="#${c.legalPath}">${esc(c.legalLabel)}</a>.
          </p>
        </footer>` : ""}
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
