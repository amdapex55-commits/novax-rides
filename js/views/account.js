// Nova Go — sign up and sign in.
//
// WHY THIS REPLACED THE OTP SCREENS
//
// OTP login is built and works, but it needs a provisioned SMS sender. A local
// aggregator mask takes weeks to approve, and until then nobody can create an
// account at all — which blocks everything else. So this is the interim door.
//
// The OTP screens and endpoints are NOT deleted. When SMS is live both flows
// run side by side; the backend's passwordHash column is nullable precisely so
// an OTP-created account stays valid without one.
//
// The two signups differ because the two people differ:
//
//   CUSTOMER — name, phone, email, password. Active the moment they submit.
//   There is nothing to verify about someone who wants to book a ride, and
//   making them wait on a human is how you lose them on day one.
//
//   RIDER — the above plus address and both sides of their driving licence.
//   Created pending, and cannot go online until ops approves them against the
//   original document. That gate is not a formality: they carry a passenger.

import { api } from "../api.js";
import { prepareForUpload } from "../imagePrep.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { toast, esc, alertUser} from "../ui.js";
import { navigate } from "../router.js";
import { APP_CONFIG } from "../appMode.js";
import { track } from "../analytics.js";
import { reportHandled } from "../errors.js";

const MAX_DOC_BYTES = 5 * 1024 * 1024;

/** Whichever app this build is decides which account it creates. */
function signupRole() {
  return APP_CONFIG.signupRole === "DRIVER" ? "DRIVER" : "RIDER";
}

function afterAuth() {
  window.__novagoRefreshNav?.();
  const target = state.postAuthRedirect || "/home";
  state.postAuthRedirect = null;
  navigate(target);
}

/* ------------------------------------------------------------- sign in --- */

export function renderSignIn(root) {
  root.innerHTML = `
    <div class="page nx-auth nx-auth-page">
      <div class="nx-auth-stack">
        <div class="nx-auth-mark">${icon("bolt", 26, 2)}</div>
        <h1 class="nx-auth-title">Welcome back</h1>
        <p class="nx-auth-sub">Sign in to keep moving.</p>

        <form id="signinForm" novalidate>
          <label class="field-label" for="identifier">Email or phone</label>
          <input id="identifier" class="input mb-3" type="text" autocomplete="username"
                 placeholder="you@example.com or 0300 1234567" required/>

          <label class="field-label" for="password">Password</label>
          <div class="nx-pw-wrap mb-2">
            <input id="password" class="input" type="password" autocomplete="current-password"
                   placeholder="Your password" required/>
            <button type="button" class="nx-pw-toggle" id="pwToggle" aria-label="Show password">
              ${icon("eye", 18)}
            </button>
          </div>

          <p class="nx-auth-hint" id="hint">&nbsp;</p>

          <button type="submit" id="submitBtn" class="btn btn-primary btn-block"
                  style="height:56px;font-size:16px;">
            Sign in ${icon("arrow-forward", 18)}
          </button>
        </form>

        <p class="text-sm text-center mt-4">
          <a href="#/forgot-password" class="nx-link-strong">Forgot your password?</a>
        </p>

        <p class="text-sm text-center mt-3">
          New to Nova Go?
          <a href="#/signup" class="nx-link-strong">Create an account</a>
        </p>
      </div>
    </div>
  `;

  wirePasswordToggle(root);

  root.querySelector("#signinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = root.querySelector("#identifier").value.trim();
    const password = root.querySelector("#password").value;
    const hint = root.querySelector("#hint");
    const btn = root.querySelector("#submitBtn");

    if (!identifier || !password) {
      hint.textContent = "Enter your email or phone, and your password.";
      hint.className = "nx-auth-hint error";
      return;
    }

    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      // api.login stores the tokens and hydrates Token.user.
      await api.login(identifier, password);
      track("signed_in", { role: signupRole() });
      afterAuth();
    } catch (err) {
      // A wrong password is expected and won't be reported; a TypeError from
      // our own code will be. That distinction is the whole point — the
      // friendly message below is what hid the last one.
      reportHandled(err, "signin");
      hint.textContent = err.message || "Couldn't sign you in. Check your details.";
      hint.className = "nx-auth-hint error";
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });
}

/* ------------------------------------------------------------- sign up --- */

export function renderSignUp(root) {
  const role = signupRole();
  const isDriver = role === "DRIVER";

  root.innerHTML = `
    <div class="page nx-auth nx-auth-page">
      <div class="nx-auth-stack">
        <div class="nx-auth-mark ${isDriver ? "internal" : ""}">${icon(isDriver ? "bike" : "bolt", 26, 2)}</div>
        <h1 class="nx-auth-title">${isDriver ? "Ride with Nova Go" : "Create your account"}</h1>
        <p class="nx-auth-sub">
          ${isDriver
            ? "We'll check your licence before you can take jobs — usually the same day."
            : "Takes a minute. You can book straight away."}
        </p>

        <form id="signupForm" novalidate>
          <div class="nx-field-row">
            <div>
              <label class="field-label" for="firstName">First name</label>
              <input id="firstName" class="input mb-3" autocomplete="given-name" placeholder="Ahmed" required/>
            </div>
            <div>
              <label class="field-label" for="lastName">Last name</label>
              <input id="lastName" class="input mb-3" autocomplete="family-name" placeholder="Khan" required/>
            </div>
          </div>

          <label class="field-label" for="phone">Mobile number</label>
          <div class="nx-phone-field mb-3">
            <span class="nx-phone-cc">+92</span>
            <input id="phone" class="nx-phone-input" type="tel" inputmode="numeric"
                   autocomplete="tel-national" maxlength="11" placeholder="300 1234567" required/>
          </div>

          <label class="field-label" for="email">Email</label>
          <input id="email" class="input mb-3" type="email" autocomplete="email"
                 placeholder="you@example.com" required/>

          ${isDriver ? `
            <label class="field-label" for="address">Home address</label>
            <input id="address" class="input mb-3" autocomplete="street-address"
                   placeholder="House 12, Street 4, Gulshan-e-Iqbal" required/>

            <!-- Both sides, because the expiry and the licence class are on
                 the back. A front-only photo can't actually be checked. -->
            <p class="field-label" style="margin-bottom:8px;">Driving licence</p>
            <div class="nx-doc-grid mb-3">
              ${docSlot("licenseFront", "Front")}
              ${docSlot("licenseBack", "Back")}
            </div>
          ` : ""}

          <label class="field-label" for="password">Password</label>
          <div class="nx-pw-wrap mb-2">
            <input id="password" class="input" type="password" autocomplete="new-password"
                   placeholder="At least 8 characters" required/>
            <button type="button" class="nx-pw-toggle" id="pwToggle" aria-label="Show password">
              ${icon("eye", 18)}
            </button>
          </div>

          <p class="nx-auth-hint" id="hint">&nbsp;</p>

          <button type="submit" id="submitBtn" class="btn btn-primary btn-block"
                  style="height:56px;font-size:16px;">
            ${isDriver ? "Submit application" : "Create account"} ${icon("arrow-forward", 18)}
          </button>
        </form>

        <p class="text-xs text-muted text-center mt-4">
          By continuing you agree to our
          <a href="#/legal/terms" class="nx-link">Terms</a>,
          <a href="#/legal/privacy" class="nx-link">Privacy Policy</a>
          and <a href="#/legal/safety" class="nx-link">Safety Policy</a>.
        </p>

        <p class="text-sm text-center mt-4">
          Already have an account?
          <a href="#/signin" class="nx-link-strong">Sign in</a>
        </p>
      </div>
    </div>
  `;

  wirePasswordToggle(root);

  // Uploaded document URLs, filled in as each upload completes.
  const docs = { licenseFront: null, licenseBack: null };
  if (isDriver) wireDocUploads(root, docs);

  root.querySelector("#signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const hint = root.querySelector("#hint");
    const btn = root.querySelector("#submitBtn");
    const val = (id) => root.querySelector(`#${id}`)?.value.trim() || "";

    const dto = {
      firstName: val("firstName"),
      lastName: val("lastName"),
      phone: val("phone"),
      email: val("email"),
      password: root.querySelector("#password").value,
      role,
    };

    const fail = (msg) => {
      hint.textContent = msg;
      hint.className = "nx-auth-hint error";
    };

    if (!dto.firstName || !dto.lastName) return fail("Enter your first and last name.");
    if (dto.phone.replace(/\D/g, "").length < 10) return fail("Enter your 10-digit mobile number.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dto.email)) return fail("Enter a valid email address.");
    if (dto.password.length < 8) return fail("Password must be at least 8 characters.");

    if (isDriver) {
      dto.address = val("address");
      if (!dto.address) return fail("Enter your home address.");
      // Blocked here rather than server-side so nobody submits an application
      // that ops will only have to reject.
      if (!docs.licenseFront || !docs.licenseBack) {
        return fail("Upload both sides of your driving licence.");
      }
      // The URLs do not exist yet — the files are uploaded after register(),
      // because that is the first moment there is a token to upload with.
    }

    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      // api.register stores the tokens and hydrates Token.user.
      await api.register(dto);
      track("signed_up", { role });

      /* Now there is a token, so the documents can go up. A failure here
         must NOT read as a failed signup — the account exists and they are
         signed in; only the licence is missing, and onboarding asks for it
         again. Losing that distinction would send someone back to create a
         second account they cannot create, because the phone is taken. */
      if (isDriver) {
        try {
          const urls = await uploadHeldDocs(docs);
          if (Object.keys(urls).length) await api.saveDriverOnboarding(urls);
        } catch (err) {
          reportHandled(err, "signup-doc-upload", { role });
          alertUser("Your account is created, but the licence didn't upload.", {
            suggestion: "Nothing is lost — you'll be asked for it again on the next screen.",
            tone: "warn",
          });
        }
      }
      toast(isDriver
        ? "Application received — we'll review your licence shortly"
        : "Welcome to Nova Go");
      afterAuth();
    } catch (err) {
      reportHandled(err, "signup", { role });
      fail(err.message || "Couldn't create your account.");
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });
}

/* ------------------------------------------------------------- helpers --- */

function docSlot(id, label) {
  return `
    <label class="nx-doc" for="${id}Input" id="${id}Slot">
      <input type="file" id="${id}Input" accept="image/*" capture="environment" hidden/>
      <span class="nx-doc-icon">${icon("camera", 20)}</span>
      <span class="nx-doc-label">${esc(label)}</span>
      <span class="nx-doc-state" id="${id}State">Tap to upload</span>
    </label>`;
}

function wireDocUploads(root, docs) {
  /* THE UPLOAD CANNOT HAPPEN ON THIS SCREEN.

     This is the signup form: the account does not exist yet, so there is no
     access token, and POST /uploads/presign sits behind the JWT guard. Every
     attempt returned 401 — for every driver, on every device, with every file
     type, since the day it was written. The submit button then refused to
     proceed without the uploads it had just made impossible, so a driver
     could not sign up at all.

     So nothing is uploaded here. The file is decoded, downscaled and held in
     memory, and the submit handler sends it the moment registration returns a
     token. That is the only ordering that can work, and it keeps the guard on
     the endpoint, which should stay: an unauthenticated presign endpoint is
     an open invitation to fill someone else's bucket. */
  ["licenseFront", "licenseBack"].forEach((key) => {
    const input = root.querySelector(`#${key}Input`);
    const slot = root.querySelector(`#${key}Slot`);
    const stateEl = root.querySelector(`#${key}State`);

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;

      if (file.size > MAX_DOC_BYTES) {
        stateEl.textContent = "Too large — under 5MB please";
        slot.classList.add("error");
        return;
      }

      slot.classList.remove("error", "done");
      slot.classList.add("busy");
      stateEl.textContent = "Preparing…";

      try {
        // Normalises HEIC/image-jpg and shrinks a 12MP photo before it ever
        // has to cross mobile data.
        const prepared = await prepareForUpload(file);
        docs[key] = prepared;
        slot.classList.remove("busy");
        slot.classList.add("done");
        stateEl.textContent = `Ready · ${Math.round(prepared.blob.size / 1024)}KB`;
      } catch (err) {
        slot.classList.remove("busy");
        slot.classList.add("error");
        stateEl.textContent = "Couldn't read that file";
        alertUser("That photo couldn't be read.", {
          suggestion: `Try taking a fresh one with the camera. (${file.type || "unknown type"} · ${Math.round(file.size / 1024)}KB)`,
        });
        console.warn("[NovaGo] licence prepare failed:", err?.message);
      }
    });
  });
}

/**
 * Upload the held documents. Called AFTER registration, when a token exists.
 * @returns {Promise<{licenseFrontUrl?: string, licenseBackUrl?: string}>}
 */
async function uploadHeldDocs(docs) {
  const urls = {};
  for (const [key, field] of [["licenseFront", "licenseFrontUrl"], ["licenseBack", "licenseBackUrl"]]) {
    const prepared = docs[key];
    if (!prepared) continue;
    const { uploadUrl, publicUrl } = await api.presignUpload(
      "kyc-doc",
      prepared.contentType,
      prepared.fileName || `${key}.jpg`,
    );
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": prepared.contentType },
      body: prepared.blob,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Storage refused ${key} (${res.status})${detail ? `: ${detail.slice(0, 120)}` : ""}`);
    }
    urls[field] = publicUrl;
  }
  return urls;
}

function wirePasswordToggle(root) {
  const toggle = root.querySelector("#pwToggle");
  const field = root.querySelector("#password");
  if (!toggle || !field) return;
  toggle.addEventListener("click", () => {
    const showing = field.type === "text";
    field.type = showing ? "password" : "text";
    toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  });
}


/**
 * Forgot password.
 *
 * There is no emailed reset link, because there is no email provider and no
 * SMS sender — see the backend's requestPasswordReset. So this is honest
 * about what happens next: a person reads the request and calls you back.
 *
 * The confirmation is deliberately the same whether or not the contact
 * matches an account. Telling an anonymous form "no such account" turns it
 * into a way to find out who has one.
 */
export function renderForgotPassword(root) {
  root.innerHTML = `
    <div class="page nx-auth nx-auth-page">
      <div id="forgotCard" class="nx-auth-stack">
        <div class="nx-auth-mark">${icon("bolt", 26, 2)}</div>
        <h1 class="nx-auth-title">Forgot your password?</h1>
        <p class="nx-auth-sub">
          Tell us the number or email you signed up with and our team will
          contact you to reset it.
        </p>

        <form id="forgotForm" novalidate>
          <label class="field-label" for="contact">Mobile number or email</label>
          <input id="contact" class="input mb-2" type="text" autocomplete="username"
                 placeholder="0300 1234567 or you@example.com" required/>

          <p class="nx-auth-hint" id="hint">&nbsp;</p>

          <button type="submit" id="submitBtn" class="btn btn-primary btn-block"
                  style="height:56px;font-size:16px;">
            Send request ${icon("arrow-forward", 18)}
          </button>
        </form>

        <p class="text-sm text-center mt-5">
          Remembered it? <a href="#/signin" class="nx-link-strong">Sign in</a>
        </p>
      </div>
    </div>
  `;

  const form = root.querySelector("#forgotForm");
  const btn = root.querySelector("#submitBtn");
  const hint = root.querySelector("#hint");
  let submitting = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;

    const contact = root.querySelector("#contact").value.trim();
    if (contact.length < 5) {
      hint.textContent = "Enter the number or email you signed up with.";
      return;
    }

    submitting = true;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const res = await api.requestPasswordReset(contact);
      // Replaces the form outright: leaving a submit button on screen invites
      // a second and third request for something a human has to action.
      root.querySelector("#forgotCard").innerHTML = `
        <div class="text-center">
          <div class="nx-auth-mark">${icon("check-circle", 26, 2)}</div>
          <h1 class="nx-auth-title mt-3">Request sent</h1>
          <p class="nx-auth-sub">${res.message}</p>
          <a href="#/signin" class="btn btn-primary btn-block mt-4"
             style="height:56px;font-size:16px;">Back to sign in</a>
        </div>
      `;
    } catch (err) {
      hint.textContent = err.message || "Could not send that request. Try again.";
      submitting = false;
      btn.disabled = false;
      btn.innerHTML = `Send request ${icon("arrow-forward", 18)}`;
    }
  });
}
