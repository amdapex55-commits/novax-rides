// Nova X Rides — splash, welcome/role picker, phone entry (rider + driver +
// restaurant), OTP verify. Self-service signup is real: whichever door a
// new phone number comes through (rider / "Drive & Earn" / "List Your
// Restaurant") sets that account's role on creation — see
// auth.service.requestOtp on the backend. An existing account's role never
// changes by re-requesting an OTP through a different door.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, e164 } from "../ui.js";
import { navigate } from "../router.js";
import { track } from "../analytics.js";
import { APP, APP_CONFIG, isCustomerApp } from "../appMode.js";

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

const CUSTOMER_SERVICES = [
  { icon: "bike", label: "Ride", sub: "Bike, rickshaw or car" },
  { icon: "utensils", label: "Food", sub: "From restaurants near you" },
  { icon: "package", label: "Parcel", sub: "Send it across town" },
  { icon: "basket", label: "Errand", sub: "We'll pick it up for you" },
];

function renderCustomerWelcome(root) {
  root.innerHTML = `
    <div class="page flex-col" style="min-height:100dvh; justify-content:center;">
      <div class="text-center mb-6">
        <div style="width:64px;height:64px;border-radius:20px;background:var(--accent-gradient);display:flex;align-items:center;justify-content:center;box-shadow:var(--accent-glow);margin:0 auto 18px;">
          ${icon("bolt", 30, 2)}
        </div>
        <span class="badge badge-accent mb-3">${icon("map-pin", 11)} Available in Karachi</span>
        <h1 class="text-xl" style="font-size:30px; line-height:1.15;">Anything you need,<br/>on its way</h1>
        <p class="text-secondary mt-2">Rides, food, parcels &amp; errands — one app.</p>
      </div>

      <div class="flex-col gap-2 mb-6">
        ${CUSTOMER_SERVICES.map((s) => `
          <div class="list-row" style="background:var(--surface); border-radius:var(--r-md);">
            <div class="list-row-icon" style="color:var(--accent);">${icon(s.icon, 20)}</div>
            <div style="flex:1;">
              <p class="font-bold text-sm">${s.label}</p>
              <p class="text-secondary text-xs">${s.sub}</p>
            </div>
          </div>`).join("")}
      </div>

      <button id="startBtn" class="btn btn-primary btn-block mb-3" style="height:56px; font-size:16px;">
        Get started ${icon("arrow-forward", 18)}
      </button>
      <button id="guestBtn" class="btn btn-ghost btn-block">Look around first</button>

      <p class="text-xs text-muted text-center mt-6">
        By continuing you agree to our
        <a href="#/legal/terms" style="color:var(--accent);">Terms</a> and
        <a href="#/legal/privacy" style="color:var(--accent);">Privacy Policy</a>.
      </p>
    </div>
  `;
  root.querySelector("#startBtn").addEventListener("click", () => {
    track("welcome_role_selected", { role: "RIDER" });
    navigate("/phone");
  });
  root.querySelector("#guestBtn").addEventListener("click", () => navigate("/home"));
}

const PARTNER_COPY = {
  driver: {
    icon: "car",
    heading: "Earn on your schedule",
    sub: "Accept rides, deliveries and errands. Get paid in cash, keep what you earn.",
    points: [
      { icon: "bolt", label: "Work when you want", sub: "Go online and offline any time" },
      { icon: "wallet", label: "Cash in hand", sub: "Riders pay you directly" },
      { icon: "bike", label: "Bike, rickshaw or car", sub: "Use what you already own" },
    ],
    cta: "Start driving",
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
  root.innerHTML = `
    <div class="page flex-col" style="min-height:100dvh; justify-content:center;">
      <div class="text-center mb-6">
        <div style="width:64px;height:64px;border-radius:20px;background:var(--accent-gradient);display:flex;align-items:center;justify-content:center;box-shadow:var(--accent-glow);margin:0 auto 18px;">
          ${icon(c.icon, 30, 2)}
        </div>
        <h1 class="text-xl" style="font-size:28px;">${c.heading}</h1>
        <p class="text-secondary mt-2">${c.sub}</p>
      </div>

      ${c.points.length ? `
        <div class="flex-col gap-2 mb-6">
          ${c.points.map((p) => `
            <div class="list-row" style="background:var(--surface); border-radius:var(--r-md);">
              <div class="list-row-icon" style="color:var(--accent);">${icon(p.icon, 20)}</div>
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
