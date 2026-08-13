// Nova Go — ops growth desk: business leads, referrals, loyalty.
//
// All three were live and none were readable. A B2B enquiry form that files
// into a table nobody opens is worse than having no form: somebody asked to
// be contacted and won't be. Referrals and loyalty were the same — accruing
// quietly with no way to see whether either was doing anything.
//
// Leads lead, because they're the only one with a person waiting at the other
// end. Referrals and loyalty are numbers you review; a lead is a callback you
// owe someone.

import { api } from "../api.js";
import { icon } from "../icons.js";
import { toast, esc, fmtDate, skeletonRows, countUp } from "../ui.js";
import { reportHandled } from "../errors.js";

const LEAD_STATUS_BADGE = {
  NEW: "badge-warning",
  CONTACTED: "badge-accent",
  CLOSED: "badge-success",
};

export function renderOpsGrowth(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <h1 class="text-xl mb-1">Growth</h1>
      <p class="text-secondary text-sm mb-5">
        Business enquiries, who's referring people, and loyalty points issued.
      </p>

      <div class="nx-desk-grid nx-stat-grid mb-5">
        <div class="card" style="padding:16px 18px;">
          <p class="text-xs text-secondary mb-1">Leads waiting</p>
          <p class="font-bold nx-stat-num" id="gNewLeads" style="color:var(--warning);">—</p>
        </div>
        <div class="card" style="padding:16px 18px;">
          <p class="text-xs text-secondary mb-1">Signups from referral</p>
          <p class="font-bold nx-stat-num" id="gReferred" style="color:var(--accent);">—</p>
        </div>
        <div class="card" style="padding:16px 18px;">
          <p class="text-xs text-secondary mb-1">Loyalty points issued</p>
          <p class="font-bold nx-stat-num" id="gPoints" style="color:var(--accent-2);">—</p>
        </div>
      </div>

      <h3 class="text-sm text-secondary mb-3" style="text-transform:uppercase;letter-spacing:0.04em;">
        Nova Go for Business — enquiries
      </h3>
      <div id="leadList" class="mb-6">${skeletonRows(3)}</div>

      <h3 class="text-sm text-secondary mb-3" style="text-transform:uppercase;letter-spacing:0.04em;">
        Top referrers
      </h3>
      <div id="referrerList">${skeletonRows(2)}</div>
    </div>
  `;

  const leadList = root.querySelector("#leadList");
  const referrerList = root.querySelector("#referrerList");

  function leadCard(l) {
    const status = l.status || "NEW";
    return `
      <div class="card mb-3" data-lead="${esc(l.id)}">
        <div class="flex justify-between items-start mb-2">
          <div style="min-width:0;">
            <p class="font-bold">${esc(l.companyName)}</p>
            <p class="text-secondary text-sm">${esc(l.contactName)}</p>
          </div>
          <span class="badge ${LEAD_STATUS_BADGE[status] || "badge-accent"}">${esc(status)}</span>
        </div>

        <div class="nx-kv mb-3">
          <div><span>Phone</span><span>${esc(l.phone) || "—"}</span></div>
          ${l.email ? `<div><span>Email</span><span>${esc(l.email)}</span></div>` : ""}
          <div><span>Received</span><span>${fmtDate(l.createdAt)}</span></div>
        </div>

        ${l.notes ? `<p class="text-xs text-muted mb-3">${esc(l.notes)}</p>` : ""}

        <div class="flex gap-2">
          <!-- Calling is the action. The phone number is right there and the
               whole reason the row exists is that someone wants to be rung. -->
          <a class="btn btn-primary" style="flex:1;" href="tel:${esc(l.phone)}">
            ${icon("phone", 16)} Call
          </a>
          ${status !== "CONTACTED"
            ? `<button class="btn btn-secondary" data-status="CONTACTED" style="flex:1;">Mark contacted</button>`
            : `<button class="btn btn-secondary" data-status="CLOSED" style="flex:1;">Close</button>`}
        </div>
      </div>`;
  }

  function load() {
    api.getGrowth()
      .then((g) => {
        countUp(root.querySelector("#gNewLeads"), Number(g.newLeadsCount || 0));
        countUp(root.querySelector("#gReferred"), Number(g.signupsFromReferral || 0));
        countUp(root.querySelector("#gPoints"), Number(g.totalLoyaltyPointsIssued || 0));

        const leads = Array.isArray(g.businessLeads) ? g.businessLeads : [];
        leadList.innerHTML = leads.length
          ? leads.map(leadCard).join("")
          : `<div class="empty-state">
               <div class="icon">${icon("store", 28)}</div>
               <p>No business enquiries yet</p>
             </div>`;

        const refs = Array.isArray(g.topReferrers) ? g.topReferrers : [];
        referrerList.innerHTML = refs.length
          ? refs.map((r) => `
              <div class="list-row">
                <div class="list-row-icon">${icon("users", 18)}</div>
                <div class="flex-col" style="flex:1;min-width:0;">
                  <p class="font-bold text-sm">${esc(r.name)}</p>
                  <p class="text-xs text-muted">${esc(r.referralCode || "no code")} · ${r.loyaltyPoints} pts</p>
                </div>
                <span class="badge badge-accent">${r.referredCount} referred</span>
              </div>`).join("")
          : `<div class="empty-state">
               <div class="icon">${icon("gift", 28)}</div>
               <p>Nobody has referred anyone yet</p>
             </div>`;
      })
      .catch((err) => {
        reportHandled(err, "opsGrowth");
        leadList.innerHTML = `<div class="empty-state"><p>Couldn't load growth data</p></div>`;
        referrerList.innerHTML = "";
      });
  }

  leadList.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-status]");
    if (!btn) return;
    const card = btn.closest("[data-lead]");
    btn.disabled = true;
    try {
      await api.setLeadStatus(card.dataset.lead, btn.dataset.status);
      toast(btn.dataset.status === "CONTACTED" ? "Marked as contacted" : "Lead closed");
      load();
    } catch (err) {
      reportHandled(err, "setLeadStatus");
      toast(err.message || "Couldn't update that lead", true);
      btn.disabled = false;
    }
  });

  load();
}
