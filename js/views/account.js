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

/* THE WHOLE APPLICATION, ON ONE SCREEN.

   There used to be two: this form, and then a second "onboarding" form after
   sign-in that asked for the documents all over again. A rider photographed
   their licence, created an account, and was immediately shown a form
   demanding the same licence plus four more things. That is where they left.

   So everything a reviewer needs is collected once, here, and the application
   is submitted for review automatically. The onboarding screen still exists,
   but only as a repair path for the rare case where an upload fails after the
   account is already created — never as a second gate.

   Payout details are the one deliberate exception. They are asked for after
   approval, because a bank or wallet number is a strange thing to demand from
   someone we might be about to reject, and nobody is paid before their first
   completed job anyway. */

const DRIVER_DOCS = [
  {
    key: "cnic",
    field: "cnicFrontUrl",
    label: "CNIC",
    hint: "Front side — all four corners in frame",
  },
  {
    key: "licence",
    field: "licenseDocUrl",
    label: "Driving licence",
    hint: "The side with your photo and licence number",
  },
  {
    key: "vehicle",
    field: "vehiclePhotoUrl",
    label: "Photo of your bike",
    hint: "Whole bike, with the number plate readable",
  },
];

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
            ? "One form, then we review it — usually the same day. There is nothing else to fill in afterwards."
            : "Takes a minute. You can book straight away."}
        </p>

        <form id="signupForm" novalidate>
          ${isDriver ? `<p class="nx-form-section">About you</p>` : ""}

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
                 inputmode="email" placeholder="you@example.com" required/>

          ${isDriver ? `
            <label class="field-label" for="address">Home address</label>
            <input id="address" class="input mb-3" autocomplete="street-address"
                   placeholder="House 12, Street 4, Gulshan-e-Iqbal" required/>
          ` : ""}

          <label class="field-label" for="password">Password</label>
          <div class="nx-pw-wrap ${isDriver ? "mb-3" : "mb-2"}">
            <input id="password" class="input" type="password" autocomplete="new-password"
                   placeholder="At least 8 characters" required/>
            <button type="button" class="nx-pw-toggle" id="pwToggle" aria-label="Show password">
              ${icon("eye", 18)}
            </button>
          </div>

          ${isDriver ? `
            <p class="nx-form-section">Your bike</p>
            <!-- Bike only in the pilot, so this is a statement rather than a
                 dropdown offering a rickshaw we can never approve. -->
            <input type="hidden" id="vehicleType" value="bike"/>
            <label class="field-label" for="vehiclePlate">Number plate</label>
            <input id="vehiclePlate" class="input mb-3" placeholder="KHI-2024"
                   autocapitalize="characters" required/>

            <label class="field-label" for="serviceZone">Where you'll mostly drive</label>
            <input id="serviceZone" class="input mb-1" placeholder="DHA / Clifton / Saddar" required/>
            <p class="nx-field-hint mb-3">Just the areas you know well. You can still take jobs anywhere.</p>

            <p class="nx-form-section">Your documents</p>
            <label class="field-label" for="cnicNumber">CNIC number</label>
            <input id="cnicNumber" class="input mb-3" inputmode="numeric"
                   placeholder="42101-1234567-1" maxlength="15" required/>

            <div class="nx-doc-list mb-3">
              ${DRIVER_DOCS.map(docRow).join("")}
            </div>
            <p class="nx-field-hint mb-3">
              ${icon("shield", 13)} Photos go straight to Nova Go's secure storage.
              Only our review team ever sees them.
            </p>

            <p class="nx-form-section">Emergency contact</p>
            <p class="nx-field-hint mb-3">Who we call if something happens to you while you're working.</p>
            <label class="field-label" for="emergencyContactName">Name</label>
            <input id="emergencyContactName" class="input mb-3" placeholder="Fatima Khan" required/>
            <label class="field-label" for="emergencyContactPhone">Their mobile number</label>
            <div class="nx-phone-field mb-3">
              <span class="nx-phone-cc">+92</span>
              <input id="emergencyContactPhone" class="nx-phone-input" type="tel" inputmode="numeric"
                     maxlength="11" placeholder="300 1234567" required/>
            </div>

            <div class="nx-launch-note mb-3">
              ${icon("wallet", 15)}
              <span>We'll ask where to send your earnings <strong>after you're approved</strong> —
              no bank or wallet number needed to apply.</span>
            </div>
          ` : ""}

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

  // Prepared files, held in memory until there is a token to upload them with.
  const docs = {};
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

    /* Scroll the offending field into view and focus it. On a form this long
       a red line of text at the bottom is invisible — the rider sees a button
       that did nothing and taps it again. */
    const fail = (msg, fieldId) => {
      hint.textContent = msg;
      hint.className = "nx-auth-hint error";
      const el = fieldId && root.querySelector(`#${fieldId}`);
      if (el) {
        el.classList.add("invalid");
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus({ preventScroll: true });
      } else {
        hint.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    root.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));

    if (!dto.firstName) return fail("Enter your first name.", "firstName");
    if (!dto.lastName) return fail("Enter your last name.", "lastName");
    if (dto.phone.replace(/\D/g, "").length < 10) return fail("Enter your 10-digit mobile number.", "phone");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dto.email)) return fail("Enter a valid email address.", "email");
    if (dto.password.length < 8) return fail("Password must be at least 8 characters.", "password");

    // The driver's half of the application — everything ops needs to decide.
    let profile = null;
    if (isDriver) {
      dto.address = val("address");
      if (!dto.address) return fail("Enter your home address.", "address");

      profile = {
        vehicleType: "bike",
        vehiclePlate: val("vehiclePlate"),
        serviceZone: val("serviceZone"),
        cnicNumber: val("cnicNumber"),
        emergencyContactName: val("emergencyContactName"),
        emergencyContactPhone: val("emergencyContactPhone"),
      };

      if (!profile.vehiclePlate) return fail("Enter your number plate.", "vehiclePlate");
      if (!profile.serviceZone) return fail("Tell us the areas you'll mostly drive in.", "serviceZone");
      if (profile.cnicNumber.replace(/\D/g, "").length !== 13) {
        return fail("A CNIC number has 13 digits.", "cnicNumber");
      }
      if (!profile.emergencyContactName) return fail("Enter your emergency contact's name.", "emergencyContactName");
      if (profile.emergencyContactPhone.replace(/\D/g, "").length < 10) {
        return fail("Enter your emergency contact's 10-digit number.", "emergencyContactPhone");
      }

      // Blocked here rather than server-side so nobody submits an application
      // ops will only have to reject.
      const missingDoc = DRIVER_DOCS.find((d) => !docs[d.key]);
      if (missingDoc) return fail(`Add a photo of your ${missingDoc.label.toLowerCase()}.`, `${missingDoc.key}Slot`);
    }

    btn.disabled = true;
    const label = btn.innerHTML;
    const working = (text) => { btn.innerHTML = `<span class="spinner"></span> ${esc(text)}`; };
    working(isDriver ? "Creating your account…" : "Creating your account…");

    try {
      // api.register stores the tokens and hydrates Token.user.
      await api.register(dto);
      track("signed_up", { role });

      if (isDriver) {
        /* Now there is a token, so the photos can go up — /uploads/presign is
           behind the JWT guard, which is why nothing could be uploaded before
           this line. A failure from here on must NOT read as a failed signup:
           the account exists and they are signed in. Sending them back to
           "create an account" would strand them, because their own phone
           number is now taken. */
        try {
          const urls = await uploadHeldDocs(docs, working);
          working("Submitting your application…");
          await api.saveDriverOnboarding({ ...profile, ...urls });
          await api.submitDriverOnboarding();
          track("driver_application_submitted");
          toast("Application received — we'll review it shortly");
          /* NOT afterAuth(). That lands on the driver dashboard, which offers
             a Go Online button to someone ops has not looked at yet. The
             honest next screen is the one that says we're reviewing it. */
          window.__novagoRefreshNav?.();
          state.postAuthRedirect = null;
          return navigate("/driver/pending");
        } catch (err) {
          reportHandled(err, "signup-application", { role });
          alertUser("Your account is ready, but the application didn't finish sending.", {
            suggestion: "Nothing is lost — the next screen picks up exactly where this stopped.",
            tone: "warn",
          });
          window.__novagoRefreshNav?.();
          state.postAuthRedirect = null;
          return navigate("/driver/onboarding");
        }
      } else {
        toast("Welcome to Nova Go");
      }
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

function docRow(d) {
  return `
    <label class="nx-doc-row" for="${d.key}Input" id="${d.key}Slot">
      <input type="file" id="${d.key}Input" accept="image/*" capture="environment" hidden/>
      <span class="nx-doc-thumb" id="${d.key}Thumb">${icon("camera", 20)}</span>
      <span class="nx-doc-text">
        <span class="nx-doc-label">${esc(d.label)}</span>
        <span class="nx-doc-hint">${esc(d.hint)}</span>
      </span>
      <span class="nx-doc-state" id="${d.key}State">Add photo</span>
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
  DRIVER_DOCS.forEach((d) => {
    const key = d.key;
    const input = root.querySelector(`#${key}Input`);
    const slot = root.querySelector(`#${key}Slot`);
    const stateEl = root.querySelector(`#${key}State`);
    const thumb = root.querySelector(`#${key}Thumb`);

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;

      if (file.size > MAX_DOC_BYTES) {
        stateEl.textContent = "Too large";
        slot.classList.add("error");
        alertUser("That photo is too large.", {
          suggestion: "Take a fresh one with the camera — phone photos from the camera app are fine.",
        });
        return;
      }

      slot.classList.remove("error", "done", "invalid");
      slot.classList.add("busy");
      stateEl.textContent = "Preparing…";

      try {
        // Normalises HEIC/image-jpg and shrinks a 12MP photo before it ever
        // has to cross mobile data.
        const prepared = await prepareForUpload(file);
        docs[key] = prepared;
        slot.classList.remove("busy");
        slot.classList.add("done");
        stateEl.textContent = "Ready";
        // Seeing the actual photo is how someone catches a blurry or
        // half-cropped licence before ops rejects it three days later.
        if (thumb) {
          const url = URL.createObjectURL(prepared.blob);
          thumb.innerHTML = `<img src="${url}" alt=""/>`;
          thumb.classList.add("has-image");
        }
      } catch (err) {
        slot.classList.remove("busy");
        slot.classList.add("error");
        stateEl.textContent = "Try again";
        alertUser("That photo couldn't be read.", {
          suggestion: `Try taking a fresh one with the camera. (${file.type || "unknown type"} · ${Math.round(file.size / 1024)}KB)`,
        });
        console.warn("[NovaGo] document prepare failed:", err?.message);
      }
    });
  });
}

/**
 * Upload the held documents. Called AFTER registration, when a token exists.
 * @param {object} docs   prepared blobs, keyed by DRIVER_DOCS key
 * @param {(text: string) => void} onProgress  drives the button label
 * @returns {Promise<Record<string, string>>} profile fields -> public URLs
 */
async function uploadHeldDocs(docs, onProgress = () => {}) {
  const urls = {};
  let done = 0;
  const total = DRIVER_DOCS.filter((d) => docs[d.key]).length;

  for (const d of DRIVER_DOCS) {
    const prepared = docs[d.key];
    if (!prepared) continue;
    onProgress(`Uploading photo ${done + 1} of ${total}…`);

    const { uploadUrl, publicUrl } = await api.presignUpload(
      "kyc-doc",
      prepared.contentType,
      prepared.fileName || `${d.key}.jpg`,
    );
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": prepared.contentType },
      body: prepared.blob,
    });
    if (!res.ok) {
      // R2's own body explains refusals (signature mismatch, expired URL,
      // content-type disagreement). Losing it and saying "upload failed" is
      // how an hour disappears.
      const detail = await res.text().catch(() => "");
      throw new Error(`Storage refused your ${d.label} (${res.status})${detail ? `: ${detail.slice(0, 120)}` : ""}`);
    }
    urls[d.field] = publicUrl;
    done += 1;
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
