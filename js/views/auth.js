// Nova X Rides — splash, welcome/role picker, phone entry (rider + driver +
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
import { ZONE, PRICING } from "../launch.config.js";

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
        window.__novaxRefreshNav();
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
// Now it sells the one thing Nova X actually does, with the four reasons to
// trust it. "Coming next" lives further down, small, where it belongs.
const CUSTOMER_PROOF = [
  { icon: "bolt",   label: "Beat traffic",   sub: "A bike gets through where a car can't" },
  { icon: "wallet", label: "Fare locked",    sub: "See the price before you book" },
  { icon: "shield", label: "Verified rider", sub: "CNIC & licence checked by a person" },
  { icon: "locate", label: "Live tracking",  sub: "Watch them arrive, share your ride" },
];

// One accent. A single-service app shouldn't look like four products.
const PROOF_THEME = {
  color: "var(--accent)", soft: "var(--brand-ride-soft)", glow: "rgba(15,169,104,0.14)",
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

      <!-- Coming next: small, below the action, honest. This is the ONLY
           mention of the other services on the first screen. -->
      <p class="nx-welcome-next">
        Food, parcels &amp; errands coming to ${esc(ZONE.name)} soon
      </p>

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
    navigate("/phone");
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
      { icon: "bike", label: "We handle delivery", sub: "Nova X riders collect and deliver" },
    ],
    cta: "Partner with Nova X",
    explainerPath: "/commission-explained",
    explainerLabel: "See exactly how payments work",
    legalPath: "/legal/restaurant-agreement",
    legalLabel: "Restaurant Partner Agreement",
  },
  ops: {
    icon: "bolt",
    heading: "Nova X Operations",
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
    navigate("/phone");
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

// No cross-app "I'm actually a driver" links any more — each app is its own
// product with its own download. A customer never sees the word "driver"
// during signup, which is the entire point of the four-app split.
const ROLE_COPY = {
  RIDER: { icon: "bolt", title: "Enter your number", subtitle: "We'll text you a code to sign in." },
  DRIVER: { icon: "car", title: "Enter your number", subtitle: "We'll text you a code to start your driver application." },
  RESTAURANT: { icon: "store", title: "Enter your number", subtitle: "We'll text you a code to set up your restaurant." },
};

export function renderPhoneEntry(role) {
  return (root) => {
    const copy = ROLE_COPY[role] || ROLE_COPY.RIDER;
    const isRider = role === "RIDER";
    root.innerHTML = `
      <div class="page flex-col" style="height:100dvh;">
        <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
        <div class="flex-col" style="flex:1; justify-content:center;">
          <div class="mb-6">
            <div style="width:64px;height:64px;border-radius:20px;background:var(--accent-gradient);display:flex;align-items:center;justify-content:center;box-shadow:var(--accent-glow);margin-bottom:20px;">
              ${icon(copy.icon, 30, 2)}
            </div>
            <h1 class="text-xl">${copy.title}</h1>
            <p class="text-secondary mt-2">${copy.subtitle}</p>
          </div>
          <label class="field-label">Phone Number</label>
          <div class="flex gap-2 mb-4">
            <div class="input flex items-center justify-center" style="width:64px; flex:none; color:var(--text-secondary);">+92</div>
            <input id="phoneInput" class="input" type="tel" inputmode="numeric" maxlength="10" placeholder="300 1234567"/>
          </div>
          ${isRider ? `
          <label class="field-label">Referral Code <span class="text-muted" style="text-transform:none; font-weight:400;">(optional)</span></label>
          <input id="referralInput" class="input mb-4" type="text" maxlength="8" placeholder="e.g. AB12CD" value="${state.pendingReferralCode || ""}" style="text-transform:uppercase;"/>
          ` : ""}
          <button id="continueBtn" class="btn btn-primary btn-block">Continue ${icon("arrow-forward", 18)}</button>
          <div class="flex-col gap-1 mt-2">

          </div>
          <p class="text-xs text-muted text-center mt-6">By continuing you agree to Nova X's Terms of Service and Privacy Policy.</p>
        </div>
      </div>
    `;
    const input = root.querySelector("#phoneInput");
    const btn = root.querySelector("#continueBtn");
    root.querySelector("#backBtn").addEventListener("click", () => {
      // Always land on /welcome, never history.back() — a route that
      // bounced them here (auth guard) would just bounce them right back,
      // trapping them in a loop with no way out.
      state.postAuthRedirect = null;
      navigate("/welcome");
    });
    input.focus();

    btn.addEventListener("click", async () => {
      const raw = input.value.replace(/\D/g, "");
      if (raw.length < 10) { toast("Enter a valid 10-digit number", true); return; }
      const phone = e164(input.value);
      const referralCode = root.querySelector("#referralInput")?.value.trim().toUpperCase() || undefined;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        await api.requestOtp(phone, referralCode, isRider ? undefined : role);
        track("otp_requested", { role });
        state.pendingPhone = phone;
        state.pendingReferralCode = null;
        navigate("/otp");
      } catch (err) {
        toast(err.message || "Couldn't send code", true);
        btn.disabled = false;
        btn.innerHTML = `Continue ${icon("arrow-forward", 18)}`;
      }
    });


  };
}

export function renderOtp(root) {
  const phone = state.pendingPhone;
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-2">Verification code</h1>
      <p class="text-secondary mb-6">Sent to <b class="text-primary">${phone || "your number"}</b></p>
      <div class="otp-boxes mb-4">
        ${Array.from({ length: 6 }).map((_, i) => `<input class="otp-box" maxlength="1" inputmode="numeric" data-i="${i}"/>`).join("")}
      </div>
      <p class="text-sm text-secondary mb-6">Resend code in <span id="timer" class="text-accent font-bold">00:59</span></p>
      <button id="resendBtn" class="btn btn-secondary btn-block mb-3" disabled>Resend Code</button>
      <button id="verifyBtn" class="btn btn-primary btn-block">Verify ${icon("check", 18)}</button>
    </div>
  `;
  if (!phone) toast("No phone number on file — go back and try again", true);

  root.querySelector("#backBtn").addEventListener("click", () => history.back());

  const boxes = Array.from(root.querySelectorAll(".otp-box"));
  boxes[0].focus();
  boxes.forEach((box, i) => {
    box.addEventListener("input", () => {
      box.value = box.value.replace(/\D/g, "");
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
    });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && i > 0) boxes[i - 1].focus();
    });
  });

  const timerEl = root.querySelector("#timer");
  const resendBtn = root.querySelector("#resendBtn");
  let seconds = 59;
  const tick = setInterval(() => {
    seconds--;
    timerEl.textContent = "00:" + String(Math.max(seconds, 0)).padStart(2, "0");
    if (seconds <= 0) {
      clearInterval(tick);
      resendBtn.disabled = false;
      timerEl.textContent = "expired";
    }
  }, 1000);

  resendBtn.addEventListener("click", async () => {
    if (resendBtn.disabled) return;
    try { await api.requestOtp(phone); toast("Code resent"); } catch (e) { toast(e.message, true); }
  });

  const verifyBtn = root.querySelector("#verifyBtn");
  verifyBtn.addEventListener("click", async () => {
    const code = boxes.map((b) => b.value).join("");
    if (code.length !== 6) { toast("Enter all 6 digits", true); return; }
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = `<span class="spinner"></span>`;
    try {
      await api.verifyOtp(phone, code);
      track("otp_verified");
      const user = await api.getMe();
      state.pendingPhone = null;
      window.__novaxRefreshNav();
      // Resume whatever guest action triggered the login prompt (request a
      // ride, confirm a parcel, open wallet, ...) instead of always
      // dropping them back on home. The router re-validates this path
      // against the now-known role, so a stale/mismatched target is safe.
      const resume = state.postAuthRedirect;
      state.postAuthRedirect = null;
      if (resume) navigate(resume);
      else if (user.role === "DRIVER") navigate(user.kycStatus === "APPROVED" ? "/driver/home" : "/driver/pending");
      else if (user.role === "ADMIN") navigate("/ops/dashboard");
      else if (user.role === "RESTAURANT") navigate(await restaurantHomePath());
      else navigate("/home");
    } catch (err) {
      toast(err.message || "Invalid code", true);
      verifyBtn.disabled = false;
      verifyBtn.innerHTML = `Verify ${icon("check", 18)}`;
    }
  });

  return () => clearInterval(tick);
}
