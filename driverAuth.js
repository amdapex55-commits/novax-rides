// Nova X Rides — driver pending-approval (polls real KYC status) and KYC
// document upload (wired to the real presign endpoint; actual file PUT only
// succeeds once R2 credentials are configured on the backend — see README).
import { api, Token } from "../api.js";
import { icon } from "../icons.js";
import { toast } from "../ui.js";
import { navigate } from "../router.js";

export function renderPendingApproval(root) {
  root.innerHTML = `
    <div class="page flex-col items-center text-center" style="height:100dvh; justify-content:center;">
      <div style="width:88px;height:88px;border-radius:50%;background:rgba(255,181,71,0.12);display:flex;align-items:center;justify-content:center;color:var(--warning);margin-bottom:24px;">
        ${icon("shield", 40)}
      </div>
      <h1 class="text-xl mb-2">Verification in Progress</h1>
      <p class="text-secondary mb-8">We're reviewing your documents. This usually takes 24-48 hours once submitted.</p>
      <button id="kycBtn" class="btn btn-secondary btn-block mb-3">${icon("upload", 18)} Upload Documents</button>
      <button id="checkStatusBtn" class="btn btn-primary btn-block">${icon("refresh", 18)} Check Status</button>
    </div>
  `;
  root.querySelector("#kycBtn").addEventListener("click", () => navigate("/driver/kyc"));

  const checkBtn = root.querySelector("#checkStatusBtn");
  async function check(showToastIfPending) {
    try {
      const user = await api.getMe();
      if (user.kycStatus === "APPROVED") {
        toast("You're approved! 🎉");
        setTimeout(() => navigate("/driver/home"), 800);
      } else if (showToastIfPending) {
        toast("Still under review — check back soon");
      }
    } catch (e) { console.warn(e); }
  }
  checkBtn.addEventListener("click", () => check(true));
  const poll = setInterval(() => check(false), 15000);
  return () => clearInterval(poll);
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
      <p class="text-xs text-muted text-center">Uploads go directly to Nova X's secure storage via a signed URL — files never pass through this app's own server.</p>
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
        const { url } = await api.presignUpload("KYC_DOCUMENT", file.type || "image/jpeg");
        const putRes = await fetch(url, { method: "PUT", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
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
