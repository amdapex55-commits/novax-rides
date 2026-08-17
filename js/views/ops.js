// Nova Go Rides — ops/admin screens. Real list endpoints now exist
// (AdminController) instead of the backend only supporting a single
// approve-by-id action, so this dashboard is genuinely wired.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { toast, fmtDate, skeletonRows, esc, countUp } from "../ui.js";
import { createMap, mapSkeleton, KARACHI } from "../map.js";

const STAT_CARDS = [
  ["statActiveTrips", "Active trips", "activeTrips", "var(--accent)"],
  ["statOnlineDrivers", "Drivers online", "onlineDrivers", "var(--accent)"],
  ["statPendingKyc", "Pending KYC", "pendingKyc", "var(--warning)"],
  ["statActiveDeliveries", "Active deliveries", "activeDeliveries", "var(--accent-2)"],
  ["statTotalDrivers", "Total drivers", "totalDrivers", "var(--text-primary)"],
  ["statTotalUsers", "Total users", "totalUsers", "var(--text-primary)"],
];

/**
 * OPS HOME — "what needs me right now".
 *
 * The previous dashboard showed six counters and a map. Counters tell you the
 * state of the world; they don't tell you what to DO, and an ops desk during a
 * pilot is a queue of small interventions, not a monitoring exercise.
 *
 * So this leads with the action list: everything waiting on a human, worst
 * first, each item a link to the screen that resolves it. When that list is
 * empty the desk is genuinely clear — which is the single most useful thing a
 * dispatcher can know.
 *
 * Every panel loads independently and fails independently. One dead endpoint
 * must never blank the screen someone is running the day from.
 */
export function renderOpsDashboard(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <div class="flex items-center gap-3 mb-1">
        <h1 class="text-xl">Today</h1>
        <span class="nx-live-dot"></span>
      </div>
      <p class="text-secondary text-sm mb-5" id="opsGreeting">Karachi &middot; loading…</p>

      <!-- Action queue first. This is the part that changes what someone does
           in the next five minutes. -->
      <div id="actionQueue" class="mb-5">${skeletonRows(3)}</div>

      <div class="nx-desk-grid nx-stat-grid mb-5" id="statGrid">
        ${STAT_CARDS.map(([id, label, , color]) => `
          <div class="card nx-lift" style="padding:16px 18px;">
            <p class="text-xs text-secondary mb-1">${label}</p>
            <p class="font-bold nx-stat-num" id="${id}" style="color:${color};">—</p>
          </div>`).join("")}
      </div>

      <div class="card nx-desk-wide" style="padding:0; overflow:hidden;">
        <div class="flex items-center justify-between" style="padding:14px 18px;">
          <div>
            <p class="font-bold text-sm">Fleet map</p>
            <p class="text-xs text-muted" id="fleetCount">Loading drivers…</p>
          </div>
          <div class="flex gap-3 text-xs text-secondary">
            <span class="flex items-center gap-1"><i class="nx-key-dot" style="--dot:#6d28d9;"></i>Idle</span>
            <span class="flex items-center gap-1"><i class="nx-key-dot" style="--dot:#e2960a;"></i>Busy</span>
            <span class="flex items-center gap-1"><i class="nx-key-dot" style="--dot:#94a1a9;"></i>Stale</span>
          </div>
        </div>
        <div id="fleetMap" style="height:340px;">${mapSkeleton("340px")}</div>
      </div>
    </div>
  `;

  const hour = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", hour12: false });
  const greet = Number(hour) < 12 ? "Good morning" : Number(hour) < 17 ? "Good afternoon" : "Good evening";
  root.querySelector("#opsGreeting").textContent = `${greet} — everything moving in Karachi right now.`;

  /* ---------------------------------------------------- action queue --- */

  function actionRow({ count, label, detail, path, tone }) {
    return `
      <a class="nx-action-row ${tone}" href="#${path}">
        <span class="nx-action-count">${count}</span>
        <span class="nx-action-text">
          <span class="nx-action-label">${label}</span>
          <span class="nx-action-detail">${detail}</span>
        </span>
        ${icon("chevronRight", 18)}
      </a>`;
  }

  async function loadActionQueue() {
    const box = root.querySelector("#actionQueue");

    // Each source is independent — settle() so one failure can't blank the
    // queue that the whole desk runs from.
    const [approvals, incidents, stuck, tickets, balances] = await Promise.allSettled([
      api.getPendingDrivers(),
      api.listOpenIncidents(),
      api.getStuckJobs(3),
      api.getTickets("OPEN"),
      api.getDriverBalances(),
    ]);

    const val = (r) => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []);
    const rows = [];

    // Ordered by how badly it goes if ignored, not by count.
    const sos = val(incidents);
    if (sos.length) {
      rows.push(actionRow({
        count: sos.length, tone: "danger",
        label: sos.length === 1 ? "Open safety incident" : "Open safety incidents",
        detail: "Someone pressed SOS. Handle before anything else.",
        path: "/ops/live",
      }));
    }

    const jobs = val(stuck);
    if (jobs.length) {
      rows.push(actionRow({
        count: jobs.length, tone: "warn",
        label: jobs.length === 1 ? "Job with no driver" : "Jobs with no driver",
        detail: "Unmatched for 3+ minutes — assign someone by hand.",
        path: "/ops/command",
      }));
    }

    const pending = val(approvals);
    if (pending.length) {
      rows.push(actionRow({
        count: pending.length, tone: "warn",
        label: pending.length === 1 ? "Driver waiting for approval" : "Drivers waiting for approval",
        detail: "Check the licence against the original before approving.",
        path: "/ops/approvals",
      }));
    }

    const blocked = val(balances).filter((d) => d.blocked);
    if (blocked.length) {
      rows.push(actionRow({
        count: blocked.length, tone: "warn",
        label: blocked.length === 1 ? "Driver blocked on balance" : "Drivers blocked on balance",
        detail: "Over the credit limit — not receiving jobs until they settle.",
        path: "/ops/settle",
      }));
    }

    const open = val(tickets);
    if (open.length) {
      rows.push(actionRow({
        count: open.length, tone: "info",
        label: open.length === 1 ? "Open support ticket" : "Open support tickets",
        detail: "The same complaint three times is a product bug.",
        path: "/ops/tickets",
      }));
    }

    box.innerHTML = rows.length
      ? rows.join("")
      : `<div class="nx-action-clear">
           ${icon("check-circle", 20)}
           <div>
             <p class="font-bold text-sm">Nothing needs you right now</p>
             <p class="text-xs text-muted">No SOS, no stuck jobs, no approvals, no open tickets.</p>
           </div>
         </div>`;
  }

  /* ----------------------------------------------------- counters ------ */

  api.getAdminStats()
    .then((s) => STAT_CARDS.forEach(([id, , key]) => countUp(root.querySelector(`#${id}`), Number(s?.[key] ?? 0))))
    .catch(() => toast("Couldn't load stats", true));

  /* ------------------------------------------------------- map -------- */

  let mapHandle = null;
  let poll = 0;

  (async () => {
    const container = root.querySelector("#fleetMap");
    try {
      container.innerHTML = "";
      mapHandle = await createMap(container, { center: KARACHI, zoom: 12, scrollWheelZoom: true });
    } catch {
      container.innerHTML = `
        <div class="nx-empty" style="margin:16px;">
          <div class="nx-empty-art">${icon("location", 26)}</div>
          <h3>Map didn't load</h3>
          <p>Check the connection — your figures above are still live.</p>
        </div>`;
      return;
    }

    const STALE_AFTER_SECONDS = 120;
    const describeAge = (s) => (s == null ? "no GPS fix yet" : s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`);

    async function refreshFleet() {
      try {
        const drivers = await api.getLiveDrivers();
        const points = (Array.isArray(drivers) ? drivers : [])
          .filter((d) => d?.lat != null && d?.lng != null)
          .map((d) => {
            const age = d.fixAgeSeconds == null ? null : Number(d.fixAgeSeconds);
            const stale = age == null || age > STALE_AFTER_SECONDS;
            const busy = d.idle === false || Boolean(d.currentJob);
            const name = d.name || d.user?.name || d.phone || d.user?.phone || "Driver";
            return {
              lat: Number(d.lat), lng: Number(d.lng),
              status: stale ? "stale" : busy ? "busy" : "idle",
              label: stale ? `${name} · last seen ${describeAge(age)}`
                           : `${name}${d.currentJob ? ` · ${d.currentJob}` : " · available"}`,
            };
          });
        mapHandle.setFleet(points);

        const stale = points.filter((p) => p.status === "stale").length;
        const available = points.filter((p) => p.status === "idle").length;
        root.querySelector("#fleetCount").textContent = points.length
          ? `${points.length} online · ${available} available now` + (stale ? ` · ${stale} stale (no recent GPS)` : "")
          : "No drivers online right now";
      } catch {
        root.querySelector("#fleetCount").textContent = "Driver positions unavailable";
      }
    }

    await refreshFleet();
    poll = setInterval(refreshFleet, 15000);
  })();

  loadActionQueue();
  // The action queue is the reason to keep this tab open, so it refreshes
  // itself — a dispatcher shouldn't have to remember to reload.
  const queuePoll = setInterval(loadActionQueue, 30000);

  return () => { clearInterval(poll); clearInterval(queuePoll); mapHandle?.destroy(); };
}

export function renderOpsApprovals(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <h1 class="text-xl mb-1">Driver approvals</h1>
      <p class="text-secondary text-sm mb-5">
        Check every document against the original before approving. This is the
        gate that decides who carries a passenger.
      </p>
      <div id="approvalsList">${skeletonRows(3)}</div>
    </div>
  `;

  const list = root.querySelector("#approvalsList");

  const empty = () => `
    <div class="empty-state">
      <div class="icon">${icon("check-circle", 32)}</div>
      <p>No pending approvals</p>
    </div>`;

  /* A document tile. Opens the R2 object in a new tab at full size — a
     thumbnail is not enough to read a licence expiry or match a face, and
     approving from a thumbnail is the same as approving blind. */
  function doc(label, url) {
    if (!url) {
      return `
        <div class="nx-doc-cell missing">
          <span class="nx-doc-cell-label">${esc(label)}</span>
          <span class="nx-doc-cell-state">Not uploaded</span>
        </div>`;
    }
    return `
      <a class="nx-doc-cell" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
        <img src="${esc(url)}" alt="${esc(label)}" loading="lazy"/>
        <span class="nx-doc-cell-label">${esc(label)}</span>
        <span class="nx-doc-cell-state">Tap to enlarge</span>
      </a>`;
  }

  function card(d) {
    const p = d.driverProfile || {};
    return `
      <div class="card mb-3 nx-approval-card" data-id="${esc(d.id)}">
        <div class="flex justify-between items-start mb-2">
          <div style="min-width:0;">
            <p class="font-bold">${esc([d.name, d.lastName].filter(Boolean).join(" ")) || "Unnamed driver"}</p>
            <p class="text-secondary text-sm">${esc(d.phone) || "no phone"}</p>
            ${d.email ? `<p class="text-xs text-muted">${esc(d.email)}</p>` : ""}
          </div>
          <span class="badge badge-warning">Pending</span>
        </div>

        <div class="nx-approval">
        <div>
        <div class="nx-kv mb-3">
          <div><span>Vehicle</span><span>${esc(p.vehicleType) || "—"} · ${esc(p.vehiclePlate) || "no plate"}</span></div>
          <div><span>CNIC</span><span>${esc(p.cnicNumber) || "—"}</span></div>
          <div><span>Zone</span><span>${esc(p.serviceZone) || "—"}</span></div>
          <div><span>Address</span><span>${esc(d.address) || "—"}</span></div>
          <div><span>Payout</span><span>${esc(p.payoutMethod) || "—"} ${esc(p.payoutAccountNumber) || ""}</span></div>
          <div><span>Applied</span><span>${fmtDate(d.createdAt)}</span></div>
        </div>

          <div class="nx-approval-actions">
            <button class="btn btn-primary approveBtn">
              ${icon("check-circle", 16)} Approve
            </button>
            <button class="btn btn-ghost rejectBtn" style="color:var(--error);">
              Reject
            </button>
          </div>
        </div>

        <div>
          <p class="field-label" style="margin-bottom:8px;">Documents</p>
          <div class="nx-doc-review">
            ${doc("Licence front", p.licenseFrontUrl || p.licenseDocUrl)}
            ${doc("Licence back", p.licenseBackUrl)}
            ${doc("CNIC front", p.cnicFrontUrl)}
            ${doc("CNIC back", p.cnicBackUrl)}
          </div>
        </div>
        </div>
      </div>`;
  }

  function load() {
    api.getPendingDrivers()
      .then(async (drivers) => {
        if (!Array.isArray(drivers) || drivers.length === 0) {
          list.innerHTML = empty();
          return;
        }
        // The list endpoint returns a summary; the documents live on the full
        // application. Fetched per driver so the reviewer sees everything
        // without a second click.
        const full = await Promise.all(
          drivers.map((d) =>
            api.getDriverApplication(d.id).then((a) => ({ ...d, ...a })).catch(() => d),
          ),
        );
        list.innerHTML = full.map(card).join("");
      })
      .catch(() => {
        list.innerHTML = `
          <div class="empty-state">
            <div class="icon">${icon("info", 28)}</div>
            <p>Couldn't load applications. Check the connection.</p>
          </div>`;
      });
  }

  list.addEventListener("click", async (e) => {
    const approve = e.target.closest(".approveBtn");
    const reject = e.target.closest(".rejectBtn");
    if (!approve && !reject) return;

    const btn = approve || reject;
    const card = btn.closest("[data-id]");
    const id = card.dataset.id;

    if (reject) {
      // A reason is required, not optional: the driver is told why, and
      // "rejected, no reason recorded" is not something ops can defend later.
      const reason = window.prompt(
        "Why is this application being rejected?\n\nThe driver is shown this.",
      );
      if (!reason?.trim()) return;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        await api.rejectDriverKyc(id, reason.trim());
        toast("Application rejected — the driver has been notified");
        card.remove();
        if (!list.querySelector("[data-id]")) list.innerHTML = empty();
      } catch (err) {
        toast(err.message || "Couldn't reject", true);
        btn.disabled = false;
        btn.textContent = "Reject application";
      }
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      await api.approveKyc(id);
      toast("Driver approved — they can go online now");
      card.remove();
      if (!list.querySelector("[data-id]")) list.innerHTML = empty();
    } catch (err) {
      toast(err.message || "Couldn't approve", true);
      btn.disabled = false;
      btn.innerHTML = `${icon("check-circle", 16)} Approve`;
    }
  });

  load();
}

const ROLE_BADGE = { ADMIN: "badge-accent", DRIVER: "badge-warning", RIDER: "badge-success" };

export function renderOpsUsers(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <h1 class="text-xl mb-4">User Management</h1>
      <div id="usersList">${skeletonRows(5)}</div>
    </div>
  `;
  api.getAllUsers()
    .then((users) => {
      const list = root.querySelector("#usersList");
      if (!Array.isArray(users) || users.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="icon">${icon("users", 32)}</div><p>No users yet</p></div>`;
        return;
      }
      // isActive was being fetched and thrown away — a suspended account looked
      // identical to a working one, and there was no way to reverse a
      // suspension from anywhere in ops. Suspending with no path back is a
      // one-way door on a real person's income.
      list.innerHTML = users.map((u, i) => `
        <div class="list-row stagger-item" data-user="${esc(u.id)}" style="animation-delay:${Math.min(i, 10) * 30}ms;">
          <div class="list-row-icon">${icon("person", 18)}</div>
          <div class="flex-col" style="flex:1;min-width:0;">
            <p class="font-bold text-sm">${esc([u.name, u.lastName].filter(Boolean).join(" ") || u.phone)}</p>
            <p class="text-secondary text-xs">${esc(u.phone)} · joined ${fmtDate(u.createdAt)}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="badge ${ROLE_BADGE[u.role] || "badge-accent"}">${esc(u.role)}</span>
            ${u.isActive === false
              ? `<span class="badge badge-error">Suspended</span>
                 <button class="btn btn-secondary btn-sm" data-reactivate="${esc(u.id)}">Reactivate</button>`
              : `<button class="btn btn-ghost btn-sm" data-suspend="${esc(u.id)}" style="color:var(--error);">Suspend</button>`}
          </div>
        </div>`).join("");

      list.addEventListener("click", async (e) => {
        const susp = e.target.closest("[data-suspend]");
        const react = e.target.closest("[data-reactivate]");
        if (!susp && !react) return;
        const btn = susp || react;
        btn.disabled = true;
        try {
          if (susp) {
            // The person is shown this, and "suspended, no reason recorded"
            // becomes a support call ops can't answer.
            const reason = window.prompt("Why is this account being suspended?\n\nThey will see this message.");
            if (reason === null) { btn.disabled = false; return; }
            await api.suspendUser(susp.dataset.suspend, reason.trim() || undefined);
            toast("Account suspended");
          } else {
            await api.reactivateUser(react.dataset.reactivate);
            toast("Account reactivated");
          }
          renderOpsUsers(root);
        } catch (err) {
          toast(err.message || "Couldn't update that account", true);
          btn.disabled = false;
        }
      });
    })
    .catch(() => { root.querySelector("#usersList").innerHTML = `<div class="empty-state"><p>Couldn't load users</p></div>`; });
}
