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
  const soon = SERVICES.food && !SERVICES.food.live;
  const alsoLive = [SERVICES.parcel, SERVICES.errand]
    .filter((x) => x && x.live)
    .map((x) => x.label.toLowerCase());

  root.innerHTML = `
    <div class="page nx-wel">
      <!-- The screen is a COMPOSITION, not a form with a button at the
           bottom. This is the moment the product is actually about: a rider
           already on the way to you, on a real street layout, at night.

           Built rather than photographed because no photograph exists yet —
           but built to be a SCENE, not a diagram. Blocks give the grid
           depth, the route has a travelled half and an untravelled half, the
           bike sits on the join, and the destination pin waits at the end.
           All of it is one inline SVG: no images, no requests. -->
      <div class="nx-wel-scene" aria-hidden="true">
        <svg viewBox="0 0 375 300" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="wtravelled" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stop-color="var(--brand-400)"/>
              <stop offset="100%" stop-color="var(--brand-600)"/>
            </linearGradient>
            <radialGradient id="wglow" cx="50%" cy="42%">
              <stop offset="0%" stop-color="var(--brand-500)" stop-opacity=".5"/>
              <stop offset="100%" stop-color="var(--brand-900)" stop-opacity="0"/>
            </radialGradient>
            <filter id="wsoft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="5"/>
            </filter>
          </defs>

          <rect width="375" height="300" fill="url(#wglow)"/>

          <!-- City blocks. Rectangles between the roads are what turn a grid
               into somewhere; a bare lattice reads as graph paper. -->
          <g class="nx-wel-blocks">
            <rect x="18"  y="34"  width="66" height="46" rx="4"/>
            <rect x="104" y="18"  width="88" height="58" rx="4"/>
            <rect x="212" y="34"  width="54" height="42" rx="4"/>
            <rect x="286" y="12"  width="72" height="64" rx="4"/>
            <rect x="10"  y="106" width="78" height="58" rx="4"/>
            <rect x="108" y="100" width="62" height="50" rx="4"/>
            <rect x="192" y="112" width="86" height="46" rx="4"/>
            <rect x="298" y="104" width="64" height="60" rx="4"/>
            <rect x="24"  y="196" width="70" height="54" rx="4"/>
            <rect x="116" y="188" width="90" height="62" rx="4"/>
            <rect x="228" y="200" width="58" height="48" rx="4"/>
            <rect x="306" y="192" width="58" height="56" rx="4"/>
          </g>

          <!-- Roads. -->
          <g class="nx-wel-roads">
            <path d="M-10 92 H385 M-10 176 H385 M-10 262 H385"/>
            <path d="M96 -10 V310 M180 -10 V310 M284 -10 V310"/>
          </g>

          <!-- The trip. One path drawn twice: the faint whole route, then
               the travelled portion over it, so progress is legible at a
               glance instead of implied. -->
          <path class="nx-wel-route-bed"
                d="M64 246 C 112 246 116 182 156 178 S 236 156 262 96"/>
          <path class="nx-wel-route"
                d="M64 246 C 112 246 116 182 156 178 S 236 156 262 96"/>

          <circle class="nx-wel-halo" cx="64" cy="246" r="13" filter="url(#wsoft)"/>
          <circle class="nx-wel-dot-a" cx="64" cy="246" r="6.5"/>

          <!-- The rider, on the join between travelled and not. -->
          <g class="nx-wel-bike">
            <circle r="13"/>
            <path class="nx-wel-bike-g" d="M-6.5 2.5 h4.2 l2-5.4 h4.6 l2 5.4 h1.6"
                  fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
            <circle class="nx-wel-bike-g" cx="-5.6" cy="3.4" r="2.7" fill="none" stroke-width="1.6"/>
            <circle class="nx-wel-bike-g" cx="5.6"  cy="3.4" r="2.7" fill="none" stroke-width="1.6"/>
          </g>

          <g class="nx-wel-pin" transform="translate(262 96)">
            <path d="M0 9 C -8.5 -2 -12 -6.5 -12 -12 A 12 12 0 0 1 12 -12 C 12 -6.5 8.5 -2 0 9 Z"/>
            <circle cx="0" cy="-12" r="4.2" class="nx-wel-pin-eye"/>
          </g>
        </svg>
      </div>

      <section class="nx-wel-sheet">
        <header class="nx-wel-brandline">
          <span class="nx-wel-mark">${icon("bike", 20, 2)}</span>
          <span class="nx-wel-live"><span class="nx-live-dot"></span> Live in ${esc(ZONE.name)}</span>
        </header>

        <h1 class="nx-wel-h1">Beat the traffic.<br/><span class="nx-chrome">Pay in cash.</span></h1>
        <p class="nx-urdu nx-wel-urdu" lang="ur">بس نووا کرو</p>
        <p class="nx-wel-sub">Fixed fare before you book. Cash when you arrive.</p>

        <!-- Three facts, equal columns, each one line. The previous version
             let one label wrap to two lines and the row went ragged. -->
        <ul class="nx-wel-facts">
          <li><b>Rs ${PRICING.BIKE.minimum}</b><span>minimum</span></li>
          <li><b>CNIC</b><span>rider checked</span></li>
          <li><b>Live</b><span>track &amp; share</span></li>
        </ul>

        <button id="startBtn" class="btn btn-primary btn-block nx-wel-cta">
          Book a bike ${icon("arrow-forward", 18)}
        </button>
        <button id="guestBtn" class="nx-wel-secondary">Look around first</button>

        ${alsoLive.length || soon ? `<p class="nx-wel-next">
          ${alsoLive.length ? `Also ${alsoLive.join(" &amp; ")}` : ""}${alsoLive.length && soon ? " &middot; " : ""}${soon ? "food coming soon" : ""}
        </p>` : ""}
        <p class="nx-wel-legal">
          By continuing you agree to our <a href="#/legal/terms">Terms</a>,
          <a href="#/legal/privacy">Privacy</a> and <a href="#/legal/safety">Safety</a> policies.
        </p>
      </section>
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
  const accent = APP === "merchant" ? "food" : APP === "ops" ? "ops" : "ride";

  // What you keep. The one number the decision turns on, so it leads.
  const share = APP === "driver"
    ? {
        value: 100 - COMMERCIALS.driverCommissionPct,
        label: "of every fare, in cash, the same day",
        // Adds to the number rather than repeating it — c.sub already says
        // the share and the terms, so pasting it here said it all twice.
        tail: "Work the hours you choose, on the bike you already own.",
      }
    : APP === "merchant"
      ? {
          value: 100 - COMMERCIALS.restaurantCommissionPct,
          label: "of every order subtotal",
          tail: "You set the menu, the prices and the hours.",
        }
      : null;

  root.innerHTML = `
    <div class="page nx-wel nx-wel-${accent}">
      <!-- The screen is a COMPOSITION, not a form with a button at the
           bottom. This is the moment the product is actually about: a rider
           already on the way to you, on a real street layout, at night.

           Built rather than photographed because no photograph exists yet —
           but built to be a SCENE, not a diagram. Blocks give the grid
           depth, the route has a travelled half and an untravelled half, the
           bike sits on the join, and the destination pin waits at the end.
           All of it is one inline SVG: no images, no requests. -->
      <div class="nx-wel-scene" aria-hidden="true">
        <svg viewBox="0 0 375 300" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="wtravelled" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stop-color="var(--brand-400)"/>
              <stop offset="100%" stop-color="var(--brand-600)"/>
            </linearGradient>
            <radialGradient id="wglow" cx="50%" cy="42%">
              <stop offset="0%" stop-color="var(--brand-500)" stop-opacity=".5"/>
              <stop offset="100%" stop-color="var(--brand-900)" stop-opacity="0"/>
            </radialGradient>
            <filter id="wsoft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="5"/>
            </filter>
          </defs>

          <rect width="375" height="300" fill="url(#wglow)"/>

          <!-- City blocks. Rectangles between the roads are what turn a grid
               into somewhere; a bare lattice reads as graph paper. -->
          <g class="nx-wel-blocks">
            <rect x="18"  y="34"  width="66" height="46" rx="4"/>
            <rect x="104" y="18"  width="88" height="58" rx="4"/>
            <rect x="212" y="34"  width="54" height="42" rx="4"/>
            <rect x="286" y="12"  width="72" height="64" rx="4"/>
            <rect x="10"  y="106" width="78" height="58" rx="4"/>
            <rect x="108" y="100" width="62" height="50" rx="4"/>
            <rect x="192" y="112" width="86" height="46" rx="4"/>
            <rect x="298" y="104" width="64" height="60" rx="4"/>
            <rect x="24"  y="196" width="70" height="54" rx="4"/>
            <rect x="116" y="188" width="90" height="62" rx="4"/>
            <rect x="228" y="200" width="58" height="48" rx="4"/>
            <rect x="306" y="192" width="58" height="56" rx="4"/>
          </g>

          <!-- Roads. -->
          <g class="nx-wel-roads">
            <path d="M-10 92 H385 M-10 176 H385 M-10 262 H385"/>
            <path d="M96 -10 V310 M180 -10 V310 M284 -10 V310"/>
          </g>

          <!-- The trip. One path drawn twice: the faint whole route, then
               the travelled portion over it, so progress is legible at a
               glance instead of implied. -->
          <path class="nx-wel-route-bed"
                d="M64 246 C 112 246 116 182 156 178 S 236 156 262 96"/>
          <path class="nx-wel-route"
                d="M64 246 C 112 246 116 182 156 178 S 236 156 262 96"/>

          <circle class="nx-wel-halo" cx="64" cy="246" r="13" filter="url(#wsoft)"/>
          <circle class="nx-wel-dot-a" cx="64" cy="246" r="6.5"/>

          <!-- The rider, on the join between travelled and not. -->
          <g class="nx-wel-bike">
            <circle r="13"/>
            <path class="nx-wel-bike-g" d="M-6.5 2.5 h4.2 l2-5.4 h4.6 l2 5.4 h1.6"
                  fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
            <circle class="nx-wel-bike-g" cx="-5.6" cy="3.4" r="2.7" fill="none" stroke-width="1.6"/>
            <circle class="nx-wel-bike-g" cx="5.6"  cy="3.4" r="2.7" fill="none" stroke-width="1.6"/>
          </g>

          <g class="nx-wel-pin" transform="translate(262 96)">
            <path d="M0 9 C -8.5 -2 -12 -6.5 -12 -12 A 12 12 0 0 1 12 -12 C 12 -6.5 8.5 -2 0 9 Z"/>
            <circle cx="0" cy="-12" r="4.2" class="nx-wel-pin-eye"/>
          </g>
        </svg>
      </div>

      <section class="nx-wel-sheet">
        <header class="nx-wel-brandline">
          <span class="nx-wel-mark">${icon(c.icon, 20, 2)}</span>
          <span class="nx-wel-live">${esc(c.heading)}</span>
        </header>

        ${share ? `
          <h1 class="nx-wel-h1 nx-wel-figure">
            <span class="nx-chrome">${share.value}%</span> yours
          </h1>
          <p class="nx-wel-sub">${esc(share.label)}. ${esc(share.tail)}</p>
        ` : `
          <h1 class="nx-wel-h1">${esc(c.heading)}</h1>
          <p class="nx-wel-sub">${esc(c.sub)}</p>
        `}

        ${c.points.length ? `
          <ul class="nx-wel-facts">
            ${c.points.slice(0, 3).map((pt) => `
              <li><b>${esc(pt.label.split(" ")[0])}</b><span>${esc(shortPoint(pt.label))}</span></li>`).join("")}
          </ul>` : ""}

        <button id="startBtn" class="btn btn-primary btn-block nx-wel-cta">
          ${esc(c.cta)} ${icon("arrow-forward", 18)}
        </button>
        ${c.explainerPath ? `<button id="explainerBtn" class="nx-wel-secondary">${esc(c.explainerLabel)}</button>` : ""}

        ${c.legalPath ? `<p class="nx-wel-legal">
          By continuing you agree to the <a href="#${c.legalPath}">${esc(c.legalLabel)}</a>.
        </p>` : ""}
      </section>
    </div>
  `;

  root.querySelector("#startBtn").addEventListener("click", () => {
    track("welcome_role_selected", { role: APP_CONFIG.signupRole || "ADMIN" });
    navigate("/signin");
  });
  root.querySelector("#explainerBtn")?.addEventListener("click", () => navigate(c.explainerPath));
}

/* The fact row needs a short second line, and the points were written as
   full sentences. Rather than duplicate the copy, drop the first word (which
   is already the bold label) and keep it to a few words. */
function shortPoint(label) {
  const rest = label.split(" ").slice(1).join(" ");
  return rest || label;
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
