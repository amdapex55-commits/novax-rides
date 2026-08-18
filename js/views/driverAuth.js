// Nova Go Rides — driver pending-approval (polls real KYC status) and KYC
// document upload (wired to the real presign endpoint; actual file PUT only
// succeeds once R2 credentials are configured on the backend — see README).
import { api, Token } from "../api.js";
import { icon } from "../icons.js";
import { toast, esc } from "../ui.js";
import { haptic } from "../haptics.js";
import { COMMISSION_PCT } from "../launch.config.js";
import { navigate } from "../router.js";

export function renderPendingApproval(root) {
  root.innerHTML = `
    <div class="page flex-col items-center text-center" style="height:100dvh; justify-content:center;">
      <div style="width:88px;height:88px;border-radius:50%;background:rgba(255,181,71,0.12);display:flex;align-items:center;justify-content:center;color:var(--warning);margin-bottom:24px;">
        ${icon("shield", 40)}
      </div>
      <h1 class="text-xl mb-2">Verification in progress</h1>
      <p class="text-secondary mb-8" id="pendingSub">
        We're reviewing your documents. This usually takes 24–48 hours.
      </p>
      <div class="flex-col gap-2" style="width:100%;">
        <button id="checkStatusBtn" class="btn btn-primary btn-block">${icon("refresh", 18)} Check status</button>
        <button id="kycBtn" class="btn btn-secondary btn-block">${icon("upload", 18)} View your application</button>
      </div>
    </div>
  `;

  /* THE BUTTON USED TO LIE.
     It said "Complete your application" to every driver, including the ones
     who had just completed it — sending them into a second form that asked
     for the documents they had photographed ninety seconds earlier. The whole
     application is now taken at signup, so this only offers repair when
     something is genuinely missing, and otherwise just shows them what we
     hold. */
  const kycBtn = root.querySelector("#kycBtn");
  const sub = root.querySelector("#pendingSub");
  kycBtn.addEventListener("click", () => navigate("/driver/onboarding"));

  api.getDriverOnboarding()
    .then((status) => {
      if (!status.canSubmit) {
        kycBtn.innerHTML = `${icon("upload", 18)} Finish your application`;
        kycBtn.className = "btn btn-primary btn-block";
        root.querySelector("#checkStatusBtn").className = "btn btn-secondary btn-block";
        sub.textContent = `We still need: ${status.missing.join(", ")}.`;
      } else if (!status.submittedForReviewAt) {
        // Complete but never submitted — one tap away from the queue.
        kycBtn.innerHTML = `${icon("arrow-forward", 18)} Submit for review`;
        kycBtn.className = "btn btn-primary btn-block";
      }
    })
    .catch(() => { /* Offline: the default copy is still true. */ });

  const checkBtn = root.querySelector("#checkStatusBtn");
  async function check(showToastIfPending) {
    try {
      const user = await api.getMe();
      if (user.kycStatus === "APPROVED") {
        /* THE BIGGEST MOMENT IN A DRIVER'S RELATIONSHIP WITH US, ANNOUNCED BY
           A TOAST THAT VANISHED IN THREE SECONDS.

           Someone photographed their CNIC and licence, waited a day or two for
           a stranger to judge them, and opened the app to check. Being told
           "You're approved 🎉" by the same grey strip that says "Couldn't
           save" is a waste of the one moment they will remember. It also
           taught them nothing: approved to do what, starting how?

           So the screen becomes the announcement, and it says what happens
           next in the order it happens. */
        clearInterval(poll);
        showWelcome(root, user);
        return;
      } else if (showToastIfPending) {
        toast("Still under review — check back soon");
      }
    } catch (e) { console.warn(e); }
  }
  checkBtn.addEventListener("click", () => check(true));
  const poll = setInterval(() => check(false), 15000);
  return () => clearInterval(poll);
}

/**
 * Approved. Replaces the waiting screen outright rather than layering a
 * message over it — there is nothing left to wait for, and leaving "Check
 * status" on screen invites a tap that does nothing.
 */
function showWelcome(root, user) {
  const firstName = String(user?.name || "").trim().split(" ")[0] || "rider";
  root.innerHTML = `
    <div class="page nx-welcome-approved">
      <div class="nx-approved-badge">${icon("check-circle", 44)}</div>
      <p class="nx-approved-eyebrow">Verified rider</p>
      <h1 class="nx-approved-title">Welcome to Nova Go, ${esc(firstName)}.</h1>
      <p class="nx-approved-sub">
        Your documents checked out. You're cleared to carry passengers and parcels
        across Karachi.
      </p>

      <ol class="nx-approved-steps">
        <li><span>1</span><div>
          <b>Go online</b>
          <p>The big button on your home screen. Jobs only reach you while it's on.</p>
        </div></li>
        <li><span>2</span><div>
          <b>Accept a job</b>
          <p>You get fifteen seconds and the fare up front. Nothing is hidden until after.</p>
        </div></li>
        <li><span>3</span><div>
          <b>Keep the cash</b>
          <p>Passengers pay you directly. Nova Go's ${esc(String(COMMISSION_PCT))}% commission is
          settled later from Earnings — never taken from your pocket at the kerb.</p>
        </div></li>
      </ol>

      <button id="startBtn" class="btn btn-primary btn-block" style="height:56px;font-size:16px;">
        Start earning ${icon("arrow-forward", 18)}
      </button>
      <p class="text-xs text-muted text-center mt-3">
        Your safety kit — SOS, share ride, support — is on every job screen.
      </p>
    </div>
  `;
  haptic.medium();
  root.querySelector("#startBtn").addEventListener("click", () => navigate("/driver/home"));
}

const DOC_TYPES = [
  { key: "cnic_front", label: "CNIC — Front" },
  { key: "cnic_back", label: "CNIC — Back" },
  { key: "license", label: "Driving License" },
];

export function renderKycUpload(root) {
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-2">Upload Documents</h1>
      <p class="text-secondary mb-6">Clear photos, all four corners visible.</p>
      <div class="flex-col gap-3 mb-6" id="docList">
        ${DOC_TYPES.map(
          (d) => `
          <div class="card flex items-center gap-3">
            <div class="list-row-icon">${icon("camera", 20)}</div>
            <p style="flex:1;" class="font-bold text-sm">${d.label}</p>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
              Choose File
              <input type="file" accept="image/*" data-key="${d.key}" style="display:none;"/>
            </label>
            <span class="badge badge-warning" data-status="${d.key}">Pending</span>
          </div>`
        ).join("")}
      </div>
      <p class="text-xs text-muted text-center">Uploads go directly to Nova Go's secure storage via a signed URL — files never pass through this app's own server.</p>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());

  root.querySelectorAll('input[type="file"]').forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const key = input.dataset.key;
      const statusBadge = root.querySelector(`[data-status="${key}"]`);
      statusBadge.textContent = "Uploading...";
      try {
        // "kyc-doc" (not "KYC_DOCUMENT") and fileName are what the backend's
        // PresignUploadDto actually requires, and the response field is
        // uploadUrl — the previous values silently 400'd on every attempt.
        const contentType = file.type || "image/jpeg";
        const { uploadUrl } = await api.presignUpload("kyc-doc", contentType, file.name || "kyc-document.jpg");
        const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
        if (!putRes.ok) throw new Error("Upload rejected by storage");
        statusBadge.textContent = "Uploaded";
        statusBadge.className = "badge badge-success";
      } catch (err) {
        statusBadge.textContent = "Failed";
        statusBadge.className = "badge badge-error";
        toast(err.message?.includes("R2") || err.message?.includes("configur")
          ? "Storage isn't configured on the backend yet (needs R2 credentials) — this is a real infra gap, not a bug in this screen."
          : (err.message || "Upload failed"), true);
      }
    });
  });
}
