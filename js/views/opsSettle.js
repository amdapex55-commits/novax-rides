// Nova Go — ops settlement desk.
//
// The other half of the driver credit limit.
//
// Matching stops offering work to a driver whose balance passes
// DRIVER_CREDIT_LIMIT_PKR. That's correct — it bounds what the platform can
// lose on cash it hasn't collected. But a cap with no exit is a trap: the
// driver stops earning, has no way to clear it, and the first they hear about
// it is jobs quietly drying up.
//
// Until a JazzCash/EasyPaisa webhook exists, the exit is a person. A driver
// pays whoever runs the desk, ops records it here, and the same second their
// balance crosses back over the limit they're matchable again — no toggle, no
// restart, because matching reads this balance live on every search.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { toast, fmtMoney, skeletonRows, esc } from "../ui.js";

export function renderOpsSettle(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <h1 class="text-xl mb-1">Settlement desk</h1>
      <p class="text-secondary text-sm mb-5">
        Who owes what. Record a payment and the driver starts receiving jobs again immediately.
      </p>
      <div id="settleList">${skeletonRows(4)}</div>
    </div>
  `;

  const list = root.querySelector("#settleList");

  function row(d) {
    const owes = Number(d.balance) < 0;
    const state = d.blocked
      ? `<span class="badge badge-error">Blocked — not getting jobs</span>`
      : owes
        ? `<span class="badge badge-warning">Owes</span>`
        : `<span class="badge badge-accent">Clear</span>`;

    return `
      <div class="card mb-3" data-id="${esc(d.id)}">
        <div class="flex justify-between items-start mb-2">
          <div style="min-width:0;">
            <p class="font-bold">${esc(d.name) || "Unnamed driver"}</p>
            <p class="text-secondary text-sm">${esc(d.phone) || "no phone"}</p>
          </div>
          ${state}
        </div>

        <div class="flex justify-between items-center mb-3">
          <span class="text-xs text-muted">Balance</span>
          <span class="font-bold" style="color:${owes ? "var(--error)" : "var(--success)"};">
            ${fmtMoney(d.balance)}
          </span>
        </div>

        ${
          owes
            ? `<div class="flex gap-2">
                 <input class="input settleAmt" type="number" inputmode="numeric" min="1"
                        placeholder="Amount received"
                        value="${Math.round(Number(d.amountToSettle) || 0)}"
                        style="flex:1;"/>
                 <button class="btn btn-primary settleBtn" style="white-space:nowrap;">
                   ${icon("check", 16)} Record
                 </button>
               </div>
               <p class="text-xs text-muted mt-2">
                 ${d.blocked
                   ? `Needs ${fmtMoney(Math.abs(Number(d.balance)) - Math.abs(Number(d.creditLimit || 0)))} to start getting jobs again, or ${fmtMoney(d.amountToSettle)} to clear fully.`
                   : `Blocked at ${fmtMoney(d.creditLimit)}.`}
               </p>`
            : `<p class="text-xs text-muted">Nothing to collect.</p>`
        }
      </div>`;
  }

  function load() {
    api.getDriverBalances()
      .then((drivers) => {
        const rows = Array.isArray(drivers) ? drivers : [];
        // Drivers who owe nothing are the majority and need no action, so the
        // desk shows only the call list.
        const owing = rows.filter((d) => Number(d.balance) < 0);
        if (owing.length === 0) {
          list.innerHTML = `
            <div class="empty-state">
              <div class="icon">${icon("check-circle", 32)}</div>
              <p>Every driver is settled up.</p>
            </div>`;
          return;
        }
        list.innerHTML = owing.map(row).join("");
      })
      .catch(() => {
        list.innerHTML = `
          <div class="empty-state">
            <div class="icon">${icon("info", 28)}</div>
            <p>Couldn't load balances. Check the connection and try again.</p>
          </div>`;
      });
  }

  list.addEventListener("click", async (e) => {
    const btn = e.target.closest(".settleBtn");
    if (!btn) return;
    const card = btn.closest("[data-id]");
    const input = card.querySelector(".settleAmt");
    const amount = Number(input.value);

    if (!Number.isFinite(amount) || amount <= 0) {
      toast("Enter the amount the driver actually paid", true);
      return;
    }

    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await api.adminTopUp(card.dataset.id, amount);
      toast(`Recorded ${fmtMoney(amount)} — driver can take jobs again`);
      load();
    } catch (err) {
      toast(err.message || "Couldn't record that payment", true);
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  load();
}
