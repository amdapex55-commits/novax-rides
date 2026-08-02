// Nova X Rides — splash, phone entry (rider + driver), OTP verify.
// This is the one flow both roles share; the backend, not the button the
// user tapped, decides the real role (see README "Known gaps" — there's no
// self-service driver registration yet, role is set in the database).
import { api, Token } from "./api.js";
import { state } from "./state.js";
import { icon } from "./icons.js";
import { toast, e164 } from "./ui.js";
import { navigate } from "./router.js";

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
        else navigate("/home");
        return;
      } catch { Token.clear(); }
    }
    // No account yet (or session expired) — land straight in the app to
    // browse. OTP only kicks in when something they do actually needs an
    // account (booking, wallet, profile, etc. — see router.js auth guard).
    navigate("/home");
  }, 900);
  return () => clearTimeout(t);
}

export function renderPhoneEntry(role) {
  return (root) => {
    const isDriver = role === "DRIVER";
    root.innerHTML = `
      <div class="page flex-col" style="height:100dvh;">
        <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
        <div class="flex-col" style="flex:1; justify-content:center;">
          <div class="mb-6">
            <div style="width:64px;height:64px;border-radius:20px;background:var(--accent-gradient);display:flex;align-items:center;justify-content:center;box-shadow:var(--accent-glow);margin-bottom:20px;">
              ${icon(isDriver ? "car" : "bolt", 30, 2)}
            </div>
            <h1 class="text-xl">${isDriver ? "Drive with Nova X" : "Welcome to Nova X"}</h1>
            <p class="text-secondary mt-2">${isDriver ? "Enter your registered driver number to continue." : "Enter your phone number to get started."}</p>
          </div>
          <label class="field-label">Phone Number</label>
          <div class="flex gap-2 mb-4">
            <div class="input flex items-center justify-center" style="width:64px; flex:none; color:var(--text-secondary);">+92</div>
            <input id="phoneInput" class="input" type="tel" inputmode="numeric" maxlength="10" placeholder="300 1234567"/>
          </div>
          <button id="continueBtn" class="btn btn-primary btn-block">Continue ${icon("arrow-forward", 18)}</button>
          ${!isDriver ? `<button id="toDriverBtn" class="btn btn-ghost btn-block mt-2">I'm a driver →</button>` : `<button id="toRiderBtn" class="btn btn-ghost btn-block mt-2">I'm a rider →</button>`}
          <p class="text-xs text-muted text-center mt-6">By continuing you agree to Nova X's Terms of Service and Privacy Policy.</p>
        </div>
      </div>
    `;
    const input = root.querySelector("#phoneInput");
    const btn = root.querySelector("#continueBtn");
    root.querySelector("#backBtn").addEventListener("click", () => {
      // Always land on guest home, never history.back() — a route that
      // bounced them here (auth guard) would just bounce them right back,
      // trapping them in a loop with no way out.
      state.postAuthRedirect = null;
      navigate("/home");
    });
    input.focus();

    btn.addEventListener("click", async () => {
      const raw = input.value.replace(/\D/g, "");
      if (raw.length < 10) { toast("Enter a valid 10-digit number", true); return; }
      const phone = e164(input.value);
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        await api.requestOtp(phone);
        state.pendingPhone = phone;
        navigate("/otp");
      } catch (err) {
        toast(err.message || "Couldn't send code", true);
        btn.disabled = false;
        btn.innerHTML = `Continue ${icon("arrow-forward", 18)}`;
      }
    });

    const swapBtn = root.querySelector("#toDriverBtn") || root.querySelector("#toRiderBtn");
    swapBtn?.addEventListener("click", () => navigate(isDriver ? "/phone" : "/driver/phone"));
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
      else navigate("/home");
    } catch (err) {
      toast(err.message || "Invalid code", true);
      verifyBtn.disabled = false;
      verifyBtn.innerHTML = `Verify ${icon("check", 18)}`;
    }
  });

  return () => clearInterval(tick);
}
