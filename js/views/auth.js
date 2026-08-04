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

export function renderSplash(root) {
  root.innerHTML = `
    <div class="flex-col items-center justify-center" style="height:100dvh;">
      <div style="width:96px;height:96px;border-radius:28px;background:var(--accent-gradient);display:flex;align-items:center;justify-content:center;box-shadow:var(--accent-glow);margin-bottom:24px;">
        ${icon("bolt", 48, 2)}
      </div>
      <h1 style="font-size:28px;">Nova X</h1>
      <p class="text-secondary mt-2">Rides. Delivered. Faster.</p>
      <div class="spinner text-accent mt-6"></div>
    </div>
  `;
  const t = setTimeout(async () => {
    if (Token.access) {
      try {
        const user = await api.getMe();
        window.__novaxRefreshNav();
        if (user.role === "DRIVER") navigate(user.kycStatus === "APPROVED" ? "/driver/home" : "/driver/pending");
        else if (user.role === "ADMIN") navigate("/ops/dashboard");
        else if (user.role === "RESTAURANT") navigate(await restaurantHomePath());
        else navigate("/home");
        return;
      } catch { Token.clear(); }
    }
    // No account yet (or session expired) — show the welcome/role picker
    // instead of dropping straight into rider browsing, so Drive & Earn and
    // List Your Restaurant are an actual front door, not a buried link.
    navigate("/welcome");
  }, 900);
  return () => clearTimeout(t);
}

// First front door a logged-out visitor sees: pick a lane (Rider / Driver /
// Restaurant) or skip straight to browsing as a guest. Each option leads to
// its own phone-entry + OTP flow, and — because role is set on the backend
// at first signup (see file header) — its own distinct portal afterward.
const WELCOME_OPTIONS = [
  { role: "DRIVER", to: "/driver/phone", icon: "car", title: "Drive & Earn", subtitle: "Your hours, your vehicle" },
  { role: "RESTAURANT", to: "/restaurant/phone", icon: "store", title: "Partner Your Restaurant", subtitle: "Reach customers city-wide" },
];

// What Nova X actually does, said in four words the moment the app opens.
const MODES = [
  { icon: "bike", label: "Rides" },
  { icon: "utensils", label: "Food" },
  { icon: "package", label: "Parcels" },
  { icon: "basket", label: "Errands" },
];

export function renderWelcome(root) {
  track("app_opened");
  root.innerHTML = `
    <div class="page flex-col" style="min-height:100dvh; justify-content:center;">

      <div class="text-center mb-6">
        <div style="width:64px;height:64px;border-radius:20px;background:var(--accent-gradient);display:flex;align-items:center;justify-content:center;box-shadow:var(--accent-glow);margin:0 auto 18px;">
          ${icon("bolt", 30, 2)}
        </div>
        <span class="badge badge-accent mb-3">${icon("map-pin", 11)} Available in Karachi</span>
        <h1 class="text-xl" style="font-size:28px;">Rides, food, parcels<br/>&amp; errands</h1>
        <p class="text-secondary mt-2">One app. One tap. Across the city.</p>
      </div>

      <!-- The four things, as icons rather than a paragraph -->
      <div class="flex gap-2 mb-6">
        ${MODES.map((m) => `
          <div class="card text-center" style="flex:1; padding:var(--sp-4) var(--sp-2);">
            <div style="color:var(--accent); margin-bottom:6px;">${icon(m.icon, 22)}</div>
            <p class="text-xs font-bold">${m.label}</p>
          </div>`).join("")}
      </div>

      <button id="riderBtn" class="btn btn-primary btn-block mb-3" style="height:56px; font-size:16px;">
        Continue as Rider ${icon("arrow-forward", 18)}
      </button>
      <button id="guestBtn" class="btn btn-ghost btn-block mb-6">Browse first — no account needed</button>

      <div style="border-top:1px solid var(--surface-border); padding-top:var(--sp-5);">
        <p class="text-xs text-muted text-center mb-3" style="text-transform:uppercase; letter-spacing:0.06em;">Work with Nova X</p>
        <div class="flex-col gap-2">
          ${WELCOME_OPTIONS.map((o) => `
            <button class="list-row" data-to="${o.to}" style="cursor:pointer; width:100%;">
              <div class="list-row-icon">${icon(o.icon, 20)}</div>
              <div style="flex:1; text-align:left;">
                <p class="font-bold text-sm">${o.title}</p>
                <p class="text-secondary text-xs">${o.subtitle}</p>
              </div>
              ${icon("chevronRight", 18)}
            </button>`).join("")}
        </div>
      </div>

      <p class="text-xs text-muted text-center mt-6">
        By continuing you agree to our
        <a href="#/legal/terms" style="color:var(--accent);">Terms</a> and
        <a href="#/legal/privacy" style="color:var(--accent);">Privacy Policy</a>.
      </p>
    </div>
  `;
  root.querySelector("#riderBtn").addEventListener("click", () => {
    track("welcome_role_selected", { role: "RIDER" });
    navigate("/phone");
  });
  root.querySelector("#guestBtn").addEventListener("click", () => navigate("/home"));
  root.querySelectorAll("[data-to]").forEach((b) =>
    b.addEventListener("click", () => {
      track("welcome_role_selected", { role: b.dataset.to.includes("driver") ? "DRIVER" : "RESTAURANT" });
      navigate(b.dataset.to);
    }),
  );
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

const ROLE_COPY = {
  RIDER: { icon: "bolt", title: "Welcome to Nova X", subtitle: "Enter your phone number to get started.", swap: [{ label: "I'm a driver →", to: "/driver/phone" }, { label: "List your restaurant →", to: "/restaurant/phone" }] },
  DRIVER: { icon: "car", title: "Drive with Nova X", subtitle: "Enter your number to start earning — bike, rickshaw, or car.", swap: [{ label: "I'm a rider →", to: "/phone" }, { label: "List your restaurant →", to: "/restaurant/phone" }] },
  RESTAURANT: { icon: "store", title: "List Your Restaurant", subtitle: "Enter your number to set up your storefront on Nova X Food.", swap: [{ label: "I'm a rider →", to: "/phone" }, { label: "I'm a driver →", to: "/driver/phone" }] },
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
            ${copy.swap.map((s, i) => `<button class="btn btn-ghost btn-block" data-swap-to="${s.to}">${s.label}</button>`).join("")}
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

    root.querySelectorAll("[data-swap-to]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.swapTo)));
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
