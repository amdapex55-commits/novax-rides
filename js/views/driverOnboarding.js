// Nova Go Rides — driver application: status, and repair.
//
// THIS IS NO LONGER A FORM YOU HAVE TO FILL IN.
//
// It used to be the second half of signup: a rider photographed their licence
// on the signup screen, created an account, and was then shown this page
// demanding the same licence plus a CNIC, a vehicle registration, a plate, a
// service area and an emergency contact. Two forms for one application. That
// is where riders left, and it is why the same document was collected twice.
//
// The whole application is now collected once, on the signup screen, and
// submitted automatically. This page survives for two jobs:
//
//   1. SHOW the application back to the rider while it is under review.
//   2. REPAIR it in the one case that can still strand someone — a photo that
//      failed to upload after the account was already created. Only the
//      genuinely missing pieces are shown, so nobody re-enters what they
//      already gave us.
//
// Payout details appear once a human has approved the application, because a
// bank or wallet number is a strange thing to demand from someone we might be
// about to reject.
import { api } from "../api.js";
import { prepareForUpload } from "../imagePrep.js";
import { icon } from "../icons.js";
import { toast, esc, skeletonRows, alertUser } from "../ui.js";
import { navigate } from "../router.js";

/* Must match UsersService.REQUIRED_FOR_REVIEW. Vehicle registration is gone:
   in Karachi the bike is very often registered to a father, a brother or the
   previous owner, so the document failed honest riders and proved nothing
   about the person in front of us. The vehicle photo stays — that is what a
   passenger matches against at the kerb. */
const DOCS = [
  { key: "cnicFrontUrl", label: "CNIC", hint: "Front side — all four corners in frame" },
  { key: "licenseDocUrl", label: "Driving licence", hint: "The side with your photo and licence number" },
  { key: "vehiclePhotoUrl", label: "Photo of your bike", hint: "Whole bike, with the number plate readable" },
];

const TEXT_FIELDS = [
  { key: "vehiclePlate", label: "Number plate", placeholder: "KHI-2024" },
  { key: "cnicNumber", label: "CNIC number", placeholder: "42101-1234567-1" },
  { key: "serviceZone", label: "Where you'll mostly drive", placeholder: "DHA / Clifton / Saddar" },
  { key: "emergencyContactName", label: "Emergency contact name", placeholder: "Fatima Khan" },
  { key: "emergencyContactPhone", label: "Emergency contact number", placeholder: "03001234567" },
];

export function renderDriverOnboarding(root) {
  root.innerHTML = `<div class="page nx-stagger"><div id="wrap">${skeletonRows(4)}</div></div>`;
  let cancelled = false;
  let profile = {};

  async function load() {
    try {
      const status = await api.getDriverOnboarding();
      if (cancelled) return;
      profile = status.profile || {};
      draw(status);
    } catch (err) {
      if (cancelled) return;
      root.querySelector("#wrap").innerHTML = `
        <div class="empty-state">
          <p class="text-sm">${esc(err.message || "Couldn't load your application")}</p>
          <button id="retryBtn" class="btn btn-secondary mt-3">Try again</button>
        </div>`;
      root.querySelector("#retryBtn")?.addEventListener("click", load);
    }
  }

  function draw(status) {
    const wrap = root.querySelector("#wrap");
    const approved = status.kycStatus === "APPROVED";
    const submitted = !!status.submittedForReviewAt;

    const missingDocs = DOCS.filter((d) => !profile[d.key]);
    const missingFields = TEXT_FIELDS.filter((f) => !profile[f.key]);
    const complete = missingDocs.length === 0 && missingFields.length === 0;

    wrap.innerHTML = `
      <h1 class="text-xl mb-1">Your rider application</h1>
      <p class="text-secondary text-sm mb-4">
        ${complete
          ? "Everything we need is in. A person checks every application before anyone carries a passenger."
          : "Almost there — just the pieces below didn't make it through. Nothing else to re-enter."}
      </p>

      ${complete && submitted ? `
        <div class="card mb-5" style="border-color:var(--accent);">
          <p class="font-bold text-sm">${icon("check-circle", 14)} ${approved ? "Approved" : "Under review"}</p>
          <p class="text-secondary text-xs mt-1">
            ${approved
              ? "You're cleared to go online."
              : "Our team is checking your documents. You'll get a notification the moment you're approved — there is nothing else for you to do."}
          </p>
        </div>` : ""}

      ${!complete ? `
        <div class="pending-flag mb-5" style="align-items:flex-start;">
          <span>${icon("bolt", 14)}</span>
          <span><b>Still needed:</b> ${esc([...missingDocs, ...missingFields].map((f) => f.label).join(", "))}</span>
        </div>` : ""}

      ${missingFields.length ? `
        <p class="nx-form-section">Details</p>
        ${missingFields.map((f) => `
          <label class="field-label" for="${f.key}">${esc(f.label)}</label>
          <input id="${f.key}" class="input mb-3" placeholder="${esc(f.placeholder)}"/>
        `).join("")}
      ` : ""}

      ${missingDocs.length ? `
        <p class="nx-form-section">Photos</p>
        <div class="nx-doc-list mb-4">
          ${missingDocs.map((d) => `
            <label class="nx-doc-row" for="${d.key}Input" id="${d.key}Slot">
              <input type="file" id="${d.key}Input" accept="image/*" capture="environment" hidden/>
              <span class="nx-doc-thumb" id="${d.key}Thumb">${icon("camera", 20)}</span>
              <span class="nx-doc-text">
                <span class="nx-doc-label">${esc(d.label)}</span>
                <span class="nx-doc-hint">${esc(d.hint)}</span>
              </span>
              <span class="nx-doc-state" id="${d.key}State">Add photo</span>
            </label>`).join("")}
        </div>
      ` : ""}

      ${complete ? summary(profile) : ""}

      ${approved ? payoutBlock(profile) : ""}

      <div class="flex-col gap-2 mt-4">
        ${!complete ? `
          <button id="submitBtn" class="btn btn-primary btn-block">
            Finish and submit ${icon("arrow-forward", 18)}
          </button>` : ""}
        ${approved ? `<button id="saveBtn" class="btn btn-secondary btn-block">Save payout details</button>` : ""}
        <button id="backBtn" class="btn btn-secondary btn-block">
          ${approved ? "Go to your dashboard" : "Back"}
        </button>
      </div>

      <p class="text-xs text-muted text-center mt-3">
        Covered by the
        <a href="#/legal/driver-agreement" style="color:var(--accent);">Driver Agreement</a>.
      </p>
    `;

    wireDocs(wrap, missingDocs);

    wrap.querySelector("#backBtn").addEventListener("click", () =>
      navigate(approved ? "/driver/home" : "/driver/pending"));

    wrap.querySelector("#saveBtn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        await api.saveDriverOnboarding(collectPayout(wrap));
        toast("Saved");
        load();
      } catch (err) {
        toast(err.message || "Couldn't save", true);
        btn.disabled = false;
        btn.textContent = "Save payout details";
      }
    });

    wrap.querySelector("#submitBtn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const values = {};
      for (const f of missingFields) {
        const v = wrap.querySelector(`#${f.key}`)?.value.trim();
        if (!v) {
          alertUser(`${f.label} is still empty.`, { suggestion: "We can't send the application without it." });
          return;
        }
        values[f.key] = v;
      }
      const stillMissing = DOCS.filter((d) => !profile[d.key]);
      if (stillMissing.length) {
        alertUser(`Add a photo of your ${stillMissing[0].label.toLowerCase()}.`, {
          suggestion: "Tap the row above to take or choose one.",
        });
        return;
      }

      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        if (Object.keys(values).length) await api.saveDriverOnboarding({ vehicleType: "bike", ...values });
        await api.submitDriverOnboarding();
        toast("Submitted — we'll review your documents shortly");
        navigate("/driver/pending");
      } catch (err) {
        alertUser("That didn't send.", { suggestion: err.message || "Check your connection and try again." });
        btn.disabled = false;
        btn.innerHTML = `Finish and submit ${icon("arrow-forward", 18)}`;
      }
    });
  }

  /** Uploads immediately — unlike signup, there IS a token on this screen, and
   *  a rider who uploads then closes the app must not lose the photo. */
  function wireDocs(wrap, docs) {
    docs.forEach((d) => {
      const input = wrap.querySelector(`#${d.key}Input`);
      if (!input) return;
      const slot = wrap.querySelector(`#${d.key}Slot`);
      const stateEl = wrap.querySelector(`#${d.key}State`);
      const thumb = wrap.querySelector(`#${d.key}Thumb`);

      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        slot.classList.remove("error", "done");
        slot.classList.add("busy");
        stateEl.textContent = "Uploading…";
        try {
          // A phone does not hand you a jpeg. iPhones give image/heic, some
          // Android cameras give image/jpg, a few pickers give nothing at
          // all — and the presign endpoint rejects every one of those, which
          // is what produced "Failed, tap to retry" on a perfectly good
          // photo. Normalised to JPEG here, and shrunk on the way.
          const { blob, contentType, fileName } = await prepareForUpload(file);
          const { uploadUrl, publicUrl } = await api.presignUpload("kyc-doc", contentType, fileName || `${d.key}.jpg`);
          const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
          if (!put.ok) {
            // R2's own body explains refusals (signature mismatch, expired
            // URL, content-type disagreement). Losing it and saying "upload
            // failed" is how an hour disappears.
            const detail = await put.text().catch(() => "");
            throw new Error(`Storage refused it (${put.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
          }
          await api.saveDriverOnboarding({ [d.key]: publicUrl });
          profile[d.key] = publicUrl;
          slot.classList.remove("busy");
          slot.classList.add("done");
          stateEl.textContent = "Uploaded";
          if (thumb) {
            thumb.innerHTML = `<img src="${esc(publicUrl)}" alt=""/>`;
            thumb.classList.add("has-image");
          }
        } catch (err) {
          slot.classList.remove("busy");
          slot.classList.add("error");
          stateEl.textContent = "Try again";
          /* SAY WHAT ACTUALLY WENT WRONG. This used to be one red "Failed"
             badge for every possible cause, which is unhelpful to the rider
             and useless to whoever has to fix it — five separate bugs all
             looked identical, and each one hid the next. */
          const msg = String(err?.message || "Upload failed");
          const detail = `${file.type || "unknown type"} · ${Math.round(file.size / 1024)}KB`;

          if (/not configured|R2 is not/i.test(msg)) {
            alertUser("Uploads aren't switched on yet.", {
              suggestion: "This is on our side, not yours — we'll ask for your documents once it's fixed.",
              tone: "warn",
            });
          } else if (/contentType must be one of/i.test(msg)) {
            alertUser("That file type isn't supported.", {
              suggestion: `Try taking a fresh photo with the camera instead of picking from the library. (${detail})`,
            });
          } else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
            alertUser("The upload couldn't reach our storage.", {
              suggestion: "Check your connection and try again — nothing was lost.",
            });
          } else {
            alertUser("That photo didn't upload.", { suggestion: `${msg} (${detail})` });
          }
        }
      });
    });
  }

  load();
  return () => { cancelled = true; };
}

/* ------------------------------------------------------------- helpers --- */

/** What we hold, shown back to them. Read-only: they gave it once already. */
function summary(profile) {
  const rows = [
    ["Vehicle", "Motorcycle"],
    ["Number plate", profile.vehiclePlate],
    ["CNIC number", profile.cnicNumber],
    ["Service area", profile.serviceZone],
    ["Emergency contact", [profile.emergencyContactName, profile.emergencyContactPhone].filter(Boolean).join(" · ")],
  ].filter(([, v]) => v);

  return `
    <p class="nx-form-section">What you sent us</p>
    <div class="card mb-4">
      ${rows.map(([k, v]) => `
        <div class="flex" style="justify-content:space-between;gap:12px;padding:7px 0;">
          <span class="text-xs text-muted">${esc(k)}</span>
          <span class="text-xs font-bold" style="text-align:right;">${esc(v)}</span>
        </div>`).join("")}
    </div>
    <div class="nx-doc-list mb-4">
      ${DOCS.map((d) => `
        <div class="nx-doc-row done" style="cursor:default;">
          <span class="nx-doc-thumb has-image"><img src="${esc(profile[d.key] || "")}" alt=""/></span>
          <span class="nx-doc-text">
            <span class="nx-doc-label">${esc(d.label)}</span>
            <span class="nx-doc-hint">Received</span>
          </span>
          <span class="nx-doc-state">${icon("check-circle", 14)}</span>
        </div>`).join("")}
    </div>`;
}

function payoutBlock(profile) {
  return `
    <p class="nx-form-section">Where we send your earnings</p>
    <p class="text-xs text-muted mb-3">
      Passengers pay you in cash. This is where your weekly share is settled after commission.
    </p>
    <label class="field-label" for="payoutMethod">Payout method</label>
    <select id="payoutMethod" class="input mb-3">
      <option value="">Select…</option>
      ${["JAZZCASH", "EASYPAISA", "BANK"].map((m) =>
        `<option value="${m}"${profile.payoutMethod === m ? " selected" : ""}>${m === "BANK" ? "Bank account" : m[0] + m.slice(1).toLowerCase()}</option>`).join("")}
    </select>
    <label class="field-label" for="payoutAccountName">Account name</label>
    <input id="payoutAccountName" class="input mb-3" placeholder="As registered" value="${esc(profile.payoutAccountName)}"/>
    <label class="field-label" for="payoutAccountNumber">Account / mobile number</label>
    <input id="payoutAccountNumber" class="input mb-3" placeholder="03001234567" value="${esc(profile.payoutAccountNumber)}"/>`;
}

function collectPayout(wrap) {
  const val = (id) => wrap.querySelector(`#${id}`)?.value.trim() || undefined;
  return {
    payoutMethod: val("payoutMethod"),
    payoutAccountName: val("payoutAccountName"),
    payoutAccountNumber: val("payoutAccountNumber"),
  };
}
