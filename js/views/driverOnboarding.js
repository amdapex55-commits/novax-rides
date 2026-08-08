// Nova X Rides — driver onboarding.
//
// A real application, not a form: documents, vehicle, service area, payout
// destination and emergency contact — everything a human reviewer needs
// before letting someone drive a paying passenger.
//
// Saves as you go (drivers gather documents over days, not minutes) and
// shows a live checklist of what's still missing, so nobody submits a
// half-empty file and then waits three days to be told.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { toast, esc, skeletonRows } from "../ui.js";
import { navigate } from "../router.js";

const DOCS = [
  { key: "cnicFrontUrl", label: "CNIC — front", purpose: "kyc-doc" },
  { key: "cnicBackUrl", label: "CNIC — back", purpose: "kyc-doc" },
  { key: "licenseDocUrl", label: "Driving licence", purpose: "kyc-doc" },
  { key: "vehicleDocUrl", label: "Vehicle registration", purpose: "kyc-doc" },
  { key: "vehiclePhotoUrl", label: "Photo of your vehicle", purpose: "kyc-doc" },
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
      if (!cancelled) root.querySelector("#wrap").innerHTML = `<div class="empty-state"><p class="text-sm">${esc(err.message || "Couldn't load your application")}</p></div>`;
    }
  }

  function draw(status) {
    const wrap = root.querySelector("#wrap");
    const submitted = !!status.submittedForReviewAt;
    // Payout fields only appear once a human has approved the application.
    status.approved = status.kycStatus === "APPROVED";

    wrap.innerHTML = `
      <h1 class="text-xl mb-1">Your rider application</h1>
      <p class="text-secondary text-sm mb-4">
        A person checks every application before anyone carries a passenger.
        You can stop at any point and come back — nothing is lost.
      </p>

      ${submitted ? `
        <div class="card mb-5" style="border-color:var(--accent);">
          <p class="font-bold text-sm">${icon("check-circle", 14)} Submitted for review</p>
          <p class="text-secondary text-xs mt-1">Our team is checking your documents. You'll get a notification the moment you're approved.</p>
        </div>` : ""}

      ${status.missing.length ? `
        <div class="pending-flag mb-5" style="align-items:flex-start;">
          <span>${icon("bolt", 14)}</span>
          <span><b>Still needed:</b> ${esc(status.missing.join(", "))}</span>
        </div>` : `
        <div class="card mb-5" style="border-color:var(--accent); background:var(--brand-ride-soft);">
          <p class="font-bold text-sm">${icon("check-circle", 14)} Everything's here — ready to submit</p>
        </div>`}

      <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">Your vehicle</h3>
      <!-- Bike only in the pilot, so this is a statement rather than a
           choice. A dropdown offering rickshaw and car would take an
           application we can never approve. -->
      <input type="hidden" id="vehicleType" value="bike"/>
      <div class="list-row mb-3" style="background:var(--surface);border-radius:var(--r-md);">
        <div class="list-row-icon" style="color:var(--accent);">${icon("bike", 18)}</div>
        <div style="flex:1;">
          <p class="font-bold text-sm">Motorcycle</p>
          <p class="text-secondary text-xs">Nova X is bike-only right now</p>
        </div>
      </div>
      <label class="field-label">Number plate</label>
      <input id="vehiclePlate" class="input mb-3" placeholder="e.g. KHI-2024" value="${esc(profile.vehiclePlate)}"/>
      <label class="field-label">CNIC number</label>
      <input id="cnicNumber" class="input mb-5" placeholder="42101-1234567-1" value="${esc(profile.cnicNumber)}"/>

      <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">Documents</h3>
      <div class="flex-col gap-2 mb-5" id="docList">
        ${DOCS.map((d) => `
          <div class="list-row" style="cursor:pointer;" data-doc="${d.key}">
            <div class="list-row-icon">${icon("package", 18)}</div>
            <p style="flex:1;" class="text-sm font-bold">${d.label}</p>
            <span class="badge ${profile[d.key] ? "badge-success" : "badge-warning"}" data-doc-status="${d.key}">
              ${profile[d.key] ? "Uploaded" : "Required"}
            </span>
            <input type="file" accept="image/*" data-doc-input="${d.key}" style="display:none;"/>
          </div>`).join("")}
      </div>

      <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">Where you'll drive</h3>
      <label class="field-label">Service area</label>
      <input id="serviceZone" class="input mb-5" placeholder="e.g. DHA / Clifton / Saddar" value="${esc(profile.serviceZone)}"/>

      <!-- PAYOUT IS DEFERRED.
           Asking a rider for their JazzCash or bank number before we've even
           looked at their documents does two bad things: it lengthens the
           form at the exact moment they're deciding whether to bother, and
           it asks for financial details from someone we may reject. We
           collect it once they're approved, just before the first payout.
           The fields still exist below for an approved rider editing their
           profile — they're simply not part of the application. -->
      ${status.approved ? `
        <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">Where we send your earnings</h3>
        <p class="text-xs text-muted mb-3">Passengers pay you in cash. This is where your weekly share is settled after commission.</p>
        <label class="field-label">Payout method</label>
        <select id="payoutMethod" class="input mb-3">
          <option value="">Select…</option>
          ${["JAZZCASH", "EASYPAISA", "BANK"].map((m) => `<option value="${m}"${profile.payoutMethod === m ? " selected" : ""}>${m === "BANK" ? "Bank account" : m[0] + m.slice(1).toLowerCase()}</option>`).join("")}
        </select>
        <label class="field-label">Account name</label>
        <input id="payoutAccountName" class="input mb-3" placeholder="As registered" value="${esc(profile.payoutAccountName)}"/>
        <label class="field-label">Account / mobile number</label>
        <input id="payoutAccountNumber" class="input mb-5" placeholder="03001234567" value="${esc(profile.payoutAccountNumber)}"/>
      ` : `
        <div class="nx-launch-note mb-5">
          ${icon("wallet", 15)}
          <span>We'll ask for your <strong>payout details after you're approved</strong> —
          no bank or wallet number needed to apply.</span>
        </div>
      `}

      <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">Emergency contact</h3>
      <p class="text-xs text-muted mb-3">Who we call if something happens to you while you're working.</p>
      <label class="field-label">Name</label>
      <input id="emergencyContactName" class="input mb-3" placeholder="Full name" value="${esc(profile.emergencyContactName)}"/>
      <label class="field-label">Phone</label>
      <input id="emergencyContactPhone" class="input mb-5" placeholder="+923001234567" value="${esc(profile.emergencyContactPhone)}"/>

      <button id="saveBtn" class="btn btn-secondary btn-block mb-3">Save and continue later</button>
      <button id="submitBtn" class="btn btn-primary btn-block" ${status.canSubmit ? "" : "disabled"}>
        ${submitted ? "Re-submit for review" : "Submit for review"} ${icon("arrow-forward", 18)}
      </button>
      <p class="text-xs text-muted text-center mt-3">
        By submitting you agree to the
        <a href="#/legal/driver-agreement" style="color:var(--accent);">Driver Agreement</a>.
      </p>
    `;

    // ---- Document uploads ----
    wrap.querySelectorAll("[data-doc]").forEach((row) => {
      const key = row.dataset.doc;
      const input = wrap.querySelector(`[data-doc-input="${key}"]`);
      row.addEventListener("click", (e) => { if (e.target !== input) input.click(); });
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;
        const badge = wrap.querySelector(`[data-doc-status="${key}"]`);
        badge.textContent = "Uploading…";
        badge.className = "badge badge-warning";
        try {
          const contentType = file.type || "image/jpeg";
          const { uploadUrl, publicUrl } = await api.presignUpload("kyc-doc", contentType, file.name || `${key}.jpg`);
          const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
          if (!put.ok) throw new Error("Storage rejected the upload");
          // Persist immediately — a driver who uploads then closes the app
          // must not lose the document.
          await api.saveDriverOnboarding({ [key]: publicUrl });
          profile[key] = publicUrl;
          badge.textContent = "Uploaded";
          badge.className = "badge badge-success";
          load(); // refresh the missing-items checklist
        } catch (err) {
          badge.textContent = "Failed";
          badge.className = "badge badge-error";
          toast(
            /R2|configur|storage/i.test(err.message || "")
              ? "File storage isn't configured on the server yet — this is an infra gap, not a bug in this screen."
              : err.message || "Upload failed",
            true,
          );
        }
      });
    });

    function collect() {
      const val = (id) => wrap.querySelector(`#${id}`)?.value.trim() || undefined;
      return {
        vehicleType: val("vehicleType"),
        vehiclePlate: val("vehiclePlate"),
        cnicNumber: val("cnicNumber"),
        serviceZone: val("serviceZone"),
        payoutMethod: val("payoutMethod"),
        payoutAccountName: val("payoutAccountName"),
        payoutAccountNumber: val("payoutAccountNumber"),
        emergencyContactName: val("emergencyContactName"),
        emergencyContactPhone: val("emergencyContactPhone"),
      };
    }

    wrap.querySelector("#saveBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        await api.saveDriverOnboarding(collect());
        toast("Saved");
        load();
      } catch (err) {
        toast(err.message || "Couldn't save", true);
        btn.disabled = false;
        btn.textContent = "Save progress";
      }
    });

    wrap.querySelector("#submitBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        await api.saveDriverOnboarding(collect()); // save latest edits first
        await api.submitDriverOnboarding();
        toast("Submitted — we'll review your documents shortly");
        navigate("/driver/pending");
      } catch (err) {
        toast(err.message || "Couldn't submit", true);
        btn.disabled = false;
        btn.innerHTML = `Submit for review ${icon("arrow-forward", 18)}`;
      }
    });
  }

  load();
  return () => { cancelled = true; };
}
