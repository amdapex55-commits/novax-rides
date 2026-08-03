// Nova X Rides — loyalty, referral, business lead capture. Real backend
// behind all three now: points/tiers accrue from actual completed trips
// and deliveries (LoyaltyService), referral codes are real + credited on
// signup, and the business form lands a real row for manual follow-up
// (no self-serve corporate billing system exists — that's a genuine
// product build, not a form).
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, skeletonRows } from "../ui.js";
import { navigate } from "../router.js";

function signInPrompt(title, body) {
  return `
    <div class="empty-state">
      <div class="icon">${icon("bolt", 32)}</div>
      <p class="font-bold" style="color:var(--text-primary);">${title}</p>
      <p class="mt-1 mb-5">${body}</p>
      <button id="promptSignInBtn" class="btn btn-primary" style="display:inline-flex;">Sign in ${icon("arrow-forward", 16)}</button>
    </div>
  `;
}
function wireSignInPrompt(root, resumePath) {
  root.querySelector("#promptSignInBtn")?.addEventListener("click", () => {
    state.postAuthRedirect = resumePath;
    navigate("/phone");
  });
}
function backBtn(root) {
  root.querySelector("#backBtn")?.addEventListener("click", () => history.back());
}

export function renderLoyalty(root) {
  if (!Token.access) {
    root.innerHTML = `<div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Loyalty & Rewards</h1>
      ${signInPrompt("Sign in to see your points", "You earn points automatically on every completed ride and delivery.")}
    </div>`;
    backBtn(root);
    wireSignInPrompt(root, "/loyalty");
    return;
  }

  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Loyalty & Rewards</h1>
      <div id="loyaltyCard">${skeletonRows(1)}</div>
    </div>
  `;
  backBtn(root);

  api.getLoyalty()
    .then((l) => {
      root.querySelector("#loyaltyCard").innerHTML = `
        <div class="glow-card text-center mb-6" style="padding:28px;">
          <p class="text-secondary text-sm mb-1">Your Points</p>
          <h1 style="font-size:34px;">${l.points}</h1>
          <span class="badge badge-accent mt-2" style="display:inline-flex;">${l.tier}</span>
          ${l.nextTier ? `<p class="text-xs text-muted mt-3">${l.pointsToNextTier} points to ${l.nextTier}</p>` : `<p class="text-xs text-muted mt-3">You've reached the top tier</p>`}
        </div>
        <h3 class="text-sm text-secondary mb-3">How you earn</h3>
        <div class="flex-col gap-2 mb-6">
          <div class="list-row"><div class="list-row-icon">${icon("bike", 18)}</div><p style="flex:1;" class="font-bold text-sm">Complete a ride</p><span class="text-accent font-bold text-sm">+${l.pointsPerTrip}</span></div>
          <div class="list-row"><div class="list-row-icon">${icon("package", 18)}</div><p style="flex:1;" class="font-bold text-sm">Complete a delivery</p><span class="text-accent font-bold text-sm">+${l.pointsPerDelivery}</span></div>
          <div class="list-row"><div class="list-row-icon">${icon("gift", 18)}</div><p style="flex:1;" class="font-bold text-sm">Refer a friend</p><span class="text-accent font-bold text-sm">+${l.referralBonusPoints}</span></div>
        </div>
        <div class="pending-flag">${icon("bell", 16)} Redeeming points for ride credit is coming soon — points are tracking for real starting now.</div>
      `;
    })
    .catch(() => { root.querySelector("#loyaltyCard").innerHTML = `<div class="empty-state"><p>Couldn't load your points right now</p></div>`; });
}

export function renderRefer(root) {
  if (!Token.access) {
    root.innerHTML = `<div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Refer & Earn</h1>
      ${signInPrompt("Sign in to get your code", "Every account gets its own referral code — share it and earn points when friends sign up.")}
    </div>`;
    backBtn(root);
    wireSignInPrompt(root, "/refer");
    return;
  }

  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Refer & Earn</h1>
      <div id="referCard">${skeletonRows(1)}</div>
    </div>
  `;
  backBtn(root);

  api.getLoyalty()
    .then((l) => {
      root.querySelector("#referCard").innerHTML = `
        <div class="glow-card text-center mb-6" style="padding:28px;">
          ${icon("gift", 36)}
          <p class="font-bold mt-3">Earn ${l.referralBonusPoints} points per friend</p>
          <p class="text-secondary text-sm mt-1">They enter your code when they sign up</p>
          <div class="input mt-4 flex items-center justify-center font-bold text-accent" style="letter-spacing:0.15em;" id="codeText">${l.referralCode}</div>
          <button id="copyBtn" class="btn btn-secondary btn-block mt-4">${icon("document", 16)} Copy Code</button>
          <button id="shareBtn" class="btn btn-primary btn-block mt-2">${icon("send", 16)} Share Invite</button>
        </div>
        <p class="text-secondary text-sm text-center">${l.referralCount} friend${l.referralCount === 1 ? "" : "s"} joined with your code so far</p>
      `;
      const code = l.referralCode;
      root.querySelector("#copyBtn").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(code); toast("Code copied"); }
        catch { toast("Couldn't copy — code is " + code, true); }
      });
      root.querySelector("#shareBtn").addEventListener("click", async () => {
        const text = `Ride with Nova X — use my code ${code} when you sign up!`;
        if (navigator.share) {
          try { await navigator.share({ text }); } catch { /* user cancelled */ }
        } else {
          try { await navigator.clipboard.writeText(text); toast("Invite message copied"); }
          catch { toast("Your code is " + code); }
        }
      });
    })
    .catch(() => { root.querySelector("#referCard").innerHTML = `<div class="empty-state"><p>Couldn't load your referral code right now</p></div>`; });
}

export function renderBusiness(root) {
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Nova X for Business</h1>
      <div class="card mb-4">
        <p class="font-bold mb-1">Team Travel, Simplified</p>
        <p class="text-secondary text-sm">Centralized billing and ride management for your organization. Tell us about your team and we'll reach out to set it up — self-serve corporate accounts aren't live yet.</p>
      </div>
      <div id="leadForm">
        <label class="field-label">Company Name</label>
        <input id="companyInput" class="input mb-4" placeholder="Acme Logistics"/>
        <label class="field-label">Your Name</label>
        <input id="contactInput" class="input mb-4" placeholder="Ayesha Malik"/>
        <label class="field-label">Phone Number</label>
        <div class="flex gap-2 mb-4">
          <div class="input flex items-center justify-center" style="width:64px; flex:none; color:var(--text-secondary);">+92</div>
          <input id="phoneInput" class="input" type="tel" placeholder="300 1234567"/>
        </div>
        <label class="field-label">Email <span class="text-muted" style="text-transform:none; font-weight:400;">(optional)</span></label>
        <input id="emailInput" class="input mb-4" type="email" placeholder="you@company.com"/>
        <label class="field-label">Notes <span class="text-muted" style="text-transform:none; font-weight:400;">(optional)</span></label>
        <textarea id="notesInput" class="input mb-6" placeholder="e.g. ~50 deliveries/day across Karachi"></textarea>
        <button id="submitLeadBtn" class="btn btn-primary btn-block">Request Business Account</button>
      </div>
    </div>
  `;
  backBtn(root);

  root.querySelector("#submitLeadBtn").addEventListener("click", async () => {
    const companyName = root.querySelector("#companyInput").value.trim();
    const contactName = root.querySelector("#contactInput").value.trim();
    const phoneLocal = root.querySelector("#phoneInput").value.trim();
    const email = root.querySelector("#emailInput").value.trim();
    const notes = root.querySelector("#notesInput").value.trim();
    const digits = phoneLocal.replace(/\D/g, "").replace(/^0+/, "");
    if (!companyName || !contactName || digits.length < 9) {
      toast("Fill in company, name, and a valid phone number", true);
      return;
    }
    const btn = root.querySelector("#submitLeadBtn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await api.submitBusinessLead({
        companyName,
        contactName,
        phone: "+92" + digits,
        email: email || undefined,
        notes: notes || undefined,
      });
      root.querySelector("#leadForm").innerHTML = `
        <div class="empty-state">
          <div class="icon">${icon("check-circle", 32)}</div>
          <p class="font-bold" style="color:var(--text-primary);">Thanks, ${contactName}!</p>
          <p class="mt-1">We'll reach out to ${companyName} shortly to set up your account.</p>
        </div>
      `;
    } catch (err) {
      toast(err.message || "Couldn't submit — try again", true);
      btn.disabled = false;
      btn.innerHTML = "Request Business Account";
    }
  });
}
