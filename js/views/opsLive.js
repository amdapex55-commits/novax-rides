// Nova X Ops — the monitoring screens that sit alongside the command center.
//
// Command center answers "what needs me right now". These answer "is the
// marketplace healthy": who's actually working, what's being cancelled, who
// we owe money to, and who's complaining.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { toast, esc, fmtMoney, fmtDate, skeletonRows, emptyRich } from "../ui.js";

// --------------------------------------------------------------------------
// Live drivers — real-time supply
// --------------------------------------------------------------------------

export function renderOpsLiveDrivers(root) {
  root.innerHTML = `
    <div class="page pb-0">
      <h1 class="text-xl mb-1">Live drivers</h1>
      <p class="text-secondary text-xs mb-4" id="summary">Loading…</p>
      <div id="list" class="flex-col gap-2">${skeletonRows(4)}</div>
    </div>
  `;
  let cancelled = false;

  async function load() {
    try {
      const drivers = await api.getLiveDrivers();
      if (cancelled) return;
      const idle = drivers.filter((d) => d.idle).length;
      root.querySelector("#summary").textContent =
        `${drivers.length} online · ${idle} idle · ${drivers.length - idle} on a job`;

      const list = root.querySelector("#list");
      if (!drivers.length) {
        list.innerHTML = emptyRich({
          icon: icon("car", 26),
          title: "Nobody is online",
          body: "No drivers are currently available. Rides requested now will sit unmatched — worth calling your regulars.",
        });
        return;
      }

      // Idle first: those are the ones a dispatcher can actually give work to.
      drivers.sort((a, b) => Number(b.idle) - Number(a.idle));

      list.innerHTML = drivers.map((d) => `
        <div class="card" style="padding:var(--sp-3) var(--sp-4); border-left:4px solid ${d.idle ? "var(--accent)" : "var(--warning)"};">
          <div class="flex justify-between items-start">
            <div style="flex:1; min-width:0;">
              <p class="font-bold text-sm">${esc(d.user?.name || d.user?.phone || "Driver")}</p>
              <p class="text-xs text-muted">
                ${esc(d.user?.phone || "")} · ${esc(d.vehicleType || "")}${d.vehiclePlate ? ` · ${esc(d.vehiclePlate)}` : ""}
              </p>
              <p class="text-xs mt-1" style="color:${d.idle ? "var(--accent)" : "var(--warning)"};">
                ${d.idle ? "Idle — available now" : esc(d.currentJob)}
              </p>
              ${d.serviceZone ? `<p class="text-xs text-muted mt-1">${icon("map-pin", 10)} ${esc(d.serviceZone)}</p>` : ""}
            </div>
            <div class="flex-col gap-2" style="align-items:flex-end;">
              <span class="badge ${d.activeMode === "FOOD_ERRAND" ? "badge-warning" : "badge-accent"}">
                ${d.activeMode === "FOOD_ERRAND" ? "Food" : "Rides"}
              </span>
              <div class="flex gap-1">
                ${d.user?.phone ? `<a href="tel:${esc(d.user.phone)}" class="btn btn-secondary btn-sm">Call</a>` : ""}
                <button class="btn btn-danger btn-sm" data-suspend="${esc(d.userId)}">Suspend</button>
              </div>
            </div>
          </div>
        </div>
      `).join("");

      wireSuspend(list, load);
    } catch (err) {
      if (!cancelled) root.querySelector("#list").innerHTML =
        emptyRich({ icon: icon("bolt", 26), title: "Couldn't load drivers", body: esc(err.message || "Try again shortly.") });
    }
  }

  load();
  const poll = setInterval(load, 15000);
  return () => { cancelled = true; clearInterval(poll); };
}

/** Suspension always asks for a reason — the person gets it as a
 * notification, and "no reason given" just becomes a support call. */
function wireSuspend(container, reload) {
  container.querySelectorAll("[data-suspend]").forEach((b) =>
    b.addEventListener("click", async () => {
      const reason = prompt("Reason for suspending this account?\n(They will see this message.)");
      if (reason === null) return;
      b.disabled = true;
      try {
        await api.suspendUser(b.dataset.suspend, reason || undefined);
        toast("Account suspended");
        reload();
      } catch (err) { toast(err.message || "Couldn't suspend", true); b.disabled = false; }
    }),
  );
}

// --------------------------------------------------------------------------
// Cancellations — the earliest warning signal
// --------------------------------------------------------------------------

export function renderOpsCancellations(root) {
  root.innerHTML = `
    <div class="page pb-0">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h1 class="text-xl">Cancellations</h1>
          <p class="text-secondary text-xs" id="summary">Loading…</p>
        </div>
        <select id="hours" class="input" style="width:auto; height:34px; font-size:12px; padding:0 8px;">
          <option value="6">Last 6h</option>
          <option value="24" selected>Last 24h</option>
          <option value="168">Last 7 days</option>
        </select>
      </div>
      <div id="list" class="flex-col gap-2">${skeletonRows(3)}</div>
    </div>
  `;
  let cancelled = false;

  async function load() {
    const hours = root.querySelector("#hours").value;
    try {
      const d = await api.getCancellations(hours);
      if (cancelled) return;
      root.querySelector("#summary").textContent = `${d.total} cancelled in the last ${d.windowHours}h`;
      const list = root.querySelector("#list");

      if (!d.total) {
        list.innerHTML = emptyRich({
          icon: icon("check-circle", 26),
          title: "No cancellations",
          body: "Nothing was cancelled in this window. That's a good sign.",
        });
        return;
      }

      const rows = [
        ...d.trips.map((t) => ({ kind: "Ride", when: t.cancelledAt, who: t.rider, amount: t.fare, extra: t.driver?.name ? `driver ${t.driver.name}` : "no driver assigned" })),
        ...d.foodOrders.map((o) => ({ kind: "Food", when: o.cancelledAt, who: o.customer, amount: o.total, extra: o.restaurant?.name || "" })),
        ...d.deliveries.map((x) => ({ kind: "Parcel", when: x.cancelledAt, who: x.sender, amount: x.fare, extra: "" })),
      ].sort((a, b) => new Date(b.when) - new Date(a.when));

      list.innerHTML = rows.map((r) => `
        <div class="card" style="padding:var(--sp-3) var(--sp-4);">
          <div class="flex justify-between items-start">
            <div>
              <p class="font-bold text-sm">${r.kind} · ${esc(r.who?.name || r.who?.phone || "Customer")}</p>
              <p class="text-xs text-muted">${fmtDate(r.when)}${r.extra ? ` · ${esc(r.extra)}` : ""}</p>
            </div>
            <div style="text-align:right;">
              ${r.amount != null ? `<p class="font-bold text-sm">${fmtMoney(r.amount)}</p>` : ""}
              ${r.who?.phone ? `<a href="tel:${esc(r.who.phone)}" class="text-xs text-accent font-bold">Call</a>` : ""}
            </div>
          </div>
        </div>
      `).join("");
    } catch (err) {
      if (!cancelled) root.querySelector("#list").innerHTML =
        emptyRich({ icon: icon("bolt", 26), title: "Couldn't load", body: esc(err.message || "") });
    }
  }

  root.querySelector("#hours").addEventListener("change", load);
  load();
  return () => { cancelled = true; };
}

// --------------------------------------------------------------------------
// Balances — who we owe, who owes us
// --------------------------------------------------------------------------

export function renderOpsBalances(root) {
  root.innerHTML = `
    <div class="page pb-0">
      <h1 class="text-xl mb-1">Wallet balances</h1>
      <p class="text-secondary text-xs mb-4">
        Cash-only: positive means Nova X owes them a payout, negative means they're holding our cash (COD).
      </p>
      <div id="list" class="flex-col gap-2">${skeletonRows(4)}</div>
    </div>
  `;
  let cancelled = false;

  api.getBalances().then((rows) => {
    if (cancelled) return;
    const list = root.querySelector("#list");
    if (!rows.length) {
      list.innerHTML = emptyRich({
        icon: icon("wallet", 26),
        title: "Everything settled",
        body: "No outstanding balances either way.",
      });
      return;
    }
    list.innerHTML = rows.map((r) => `
      <div class="card" style="padding:var(--sp-3) var(--sp-4);">
        <div class="flex justify-between items-center">
          <div>
            <p class="font-bold text-sm">${esc(r.user?.name || r.user?.phone || "User")}</p>
            <p class="text-xs text-muted">${esc(r.user?.role || "")} · ${esc(r.user?.phone || "")}</p>
          </div>
          <p class="font-bold" style="color:${r.balance >= 0 ? "var(--accent)" : "var(--error)"};">
            ${r.balance >= 0 ? "" : "−"}${fmtMoney(Math.abs(r.balance))}
          </p>
        </div>
      </div>
    `).join("");
  }).catch((err) => {
    if (!cancelled) root.querySelector("#list").innerHTML =
      emptyRich({ icon: icon("bolt", 26), title: "Couldn't load balances", body: esc(err.message || "") });
  });

  return () => { cancelled = true; };
}

// --------------------------------------------------------------------------
// Support tickets
// --------------------------------------------------------------------------

export function renderOpsTickets(root) {
  root.innerHTML = `
    <div class="page pb-0">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h1 class="text-xl">Support</h1>
          <p class="text-secondary text-xs" id="summary">Loading…</p>
        </div>
        <select id="status" class="input" style="width:auto; height:34px; font-size:12px; padding:0 8px;">
          <option value="OPEN" selected>Open</option>
          <option value="">All</option>
          <option value="RESOLVED">Resolved</option>
        </select>
      </div>
      <div id="list" class="flex-col gap-2">${skeletonRows(3)}</div>
    </div>
  `;
  let cancelled = false;

  async function load() {
    const status = root.querySelector("#status").value;
    try {
      const tickets = await api.getTickets(status || undefined);
      if (cancelled) return;
      root.querySelector("#summary").textContent = `${tickets.length} ticket${tickets.length === 1 ? "" : "s"}`;
      const list = root.querySelector("#list");

      if (!tickets.length) {
        list.innerHTML = emptyRich({
          icon: icon("check-circle", 26),
          title: status === "OPEN" ? "No open tickets" : "Nothing here",
          body: status === "OPEN" ? "Nobody is waiting on you right now." : "No tickets match this filter.",
        });
        return;
      }

      list.innerHTML = tickets.map((t) => `
        <div class="card" style="padding:var(--sp-4); border-left:4px solid ${t.status === "OPEN" ? "var(--warning)" : "var(--surface-3)"};">
          <div class="flex justify-between items-start mb-2">
            <div style="flex:1;">
              <p class="font-bold text-sm">${esc(t.subject)}</p>
              <p class="text-xs text-muted">
                ${esc(t.user?.name || t.user?.phone || "User")} · ${esc(t.user?.role || "")} · ${fmtDate(t.createdAt)}
              </p>
            </div>
            <span class="badge ${t.status === "OPEN" ? "badge-warning" : "badge-success"}">${esc(t.status)}</span>
          </div>
          <p class="text-sm text-secondary mb-3">${esc(t.message)}</p>
          <div class="flex gap-2">
            ${t.user?.phone ? `<a href="tel:${esc(t.user.phone)}" class="btn btn-secondary btn-sm" style="flex:1;">Call</a>` : ""}
            ${t.user?.phone ? `<a href="https://wa.me/${esc(String(t.user.phone).replace(/\D/g, ""))}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="flex:1;">WhatsApp</a>` : ""}
            ${t.status === "OPEN" ? `<button class="btn btn-primary btn-sm" style="flex:1;" data-resolve="${esc(t.id)}">Resolve</button>` : ""}
          </div>
        </div>
      `).join("");

      list.querySelectorAll("[data-resolve]").forEach((b) =>
        b.addEventListener("click", async () => {
          b.disabled = true;
          try { await api.resolveTicket(b.dataset.resolve); toast("Ticket resolved"); load(); }
          catch (err) { toast(err.message || "Couldn't resolve", true); b.disabled = false; }
        }),
      );
    } catch (err) {
      if (!cancelled) root.querySelector("#list").innerHTML =
        emptyRich({ icon: icon("bolt", 26), title: "Couldn't load tickets", body: esc(err.message || "") });
    }
  }

  root.querySelector("#status").addEventListener("change", load);
  load();
  const poll = setInterval(load, 30000);
  return () => { cancelled = true; clearInterval(poll); };
}
