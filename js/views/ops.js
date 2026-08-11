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

export function renderOpsDashboard(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <div class="flex items-center gap-3 mb-1">
        <h1 class="text-xl">Live operations</h1>
        <span class="nx-live-dot" style="background:#2563eb;"></span>
      </div>
      <p class="text-secondary text-sm mb-5">Everything moving in Karachi right now.</p>

      <div class="nx-desk-grid nx-stat-grid mb-5">
        ${STAT_CARDS.map(([id, label, , color]) => `
          <div class="card nx-lift" style="padding:16px 18px;">
            <p class="text-xs text-secondary mb-1">${label}</p>
            <p class="font-bold nx-stat-num" id="${id}" style="color:${color};">—</p>
          </div>`).join("")}
      </div>

      <!-- The fleet map. Real Leaflet, real driver positions from the admin
           live-drivers endpoint — dispatchers were previously being shown a
           decorative radar sweep with an apology written across it. -->
      <div class="card nx-desk-wide" style="padding:0; overflow:hidden;">
        <div class="flex items-center justify-between" style="padding:14px 18px;">
          <div>
            <p class="font-bold text-sm">Fleet map</p>
            <p class="text-xs text-muted" id="fleetCount">Loading drivers…</p>
          </div>
          <div class="flex gap-3 text-xs text-secondary">
            <span class="flex items-center gap-1"><i class="nx-key-dot" style="--dot:#0fa968;"></i>Idle</span>
            <span class="flex items-center gap-1"><i class="nx-key-dot" style="--dot:#e2960a;"></i>Busy</span>
          </div>
        </div>
        <div id="fleetMap" style="height:340px;">${mapSkeleton("340px")}</div>
      </div>
    </div>
  `;

  api.getAdminStats()
    .then((s) => {
      STAT_CARDS.forEach(([id, , key]) => {
        const el = root.querySelector(`#${id}`);
        const value = Number(s?.[key] ?? 0);
        countUp(el, value);
      });
    })
    .catch(() => toast("Couldn't load stats", true));

  // Map + fleet. Both are best-effort: a dispatcher must still get their
  // numbers if the tile CDN or the drivers endpoint is having a bad minute.
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

    // A position older than this is shown greyed out. Deliberately shorter
    // than the matcher's 3-minute cutoff (see MAX_FIX_AGE_MS in the backend's
    // location.service.ts) so a dispatcher watching the map sees a driver
    // going dark BEFORE matching gives up on them, rather than after.
    const STALE_AFTER_SECONDS = 120;

    function describeAge(seconds) {
      if (seconds == null) return "no GPS fix yet";
      if (seconds < 60) return `${seconds}s ago`;
      return `${Math.round(seconds / 60)}m ago`;
    }

    async function refreshFleet() {
      try {
        const drivers = await api.getLiveDrivers();
        const points = (Array.isArray(drivers) ? drivers : [])
          .filter((d) => d?.lat != null && d?.lng != null)
          .map((d) => {
            const age = d.fixAgeSeconds == null ? null : Number(d.fixAgeSeconds);
            // No fix at all counts as stale — an unknown age is not a fresh one.
            const stale = age == null || age > STALE_AFTER_SECONDS;
            // `idle` and `currentJob` are what the API actually returns; this
            // used to read a `busy` field that has never existed, so every
            // driver rendered as available even mid-trip.
            const busy = d.idle === false || Boolean(d.currentJob);
            const name = d.name || d.user?.name || d.phone || d.user?.phone || "Driver";
            return {
              lat: Number(d.lat),
              lng: Number(d.lng),
              status: stale ? "stale" : busy ? "busy" : "idle",
              label: stale
                ? `${name} · last seen ${describeAge(age)}`
                : `${name}${d.currentJob ? ` · ${d.currentJob}` : " · available"}`,
            };
          });
        mapHandle.setFleet(points);

        const stale = points.filter((p) => p.status === "stale").length;
        const available = points.filter((p) => p.status === "idle").length;
        // Stale drivers are called out separately rather than folded into the
        // total: "12 online" when 5 of them are dead phones is the number that
        // gets a dispatcher to promise a passenger a ride nobody will take.
        root.querySelector("#fleetCount").textContent = points.length
          ? `${points.length} online · ${available} available now` +
            (stale ? ` · ${stale} stale (no recent GPS)` : "")
          : "No drivers online right now";
      } catch {
        root.querySelector("#fleetCount").textContent = "Driver positions unavailable";
      }
    }

    await refreshFleet();
    poll = setInterval(refreshFleet, 15000);
  })();

  return () => { clearInterval(poll); mapHandle?.destroy(); };
}

export function renderOpsApprovals(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <h1 class="text-xl mb-4">Driver Approvals</h1>
      <div id="approvalsList">${skeletonRows(3)}</div>
    </div>
  `;
  api.getPendingDrivers()
    .then((drivers) => {
      const list = root.querySelector("#approvalsList");
      if (!Array.isArray(drivers) || drivers.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="icon">${icon("check-circle", 32)}</div><p>No pending approvals</p></div>`;
        return;
      }
      list.innerHTML = drivers.map((d) => `
        <div class="card mb-3" data-id="${d.id}">
          <div class="flex justify-between items-start mb-2">
            <div>
              <p class="font-bold">${esc(d.name) || "Unnamed driver"}</p>
              <p class="text-secondary text-sm">${esc(d.phone)}</p>
            </div>
            <span class="badge badge-warning">Pending</span>
          </div>
          <p class="text-xs text-muted mb-3">
            ${d.driverProfile ? `${esc(d.driverProfile.vehicleType) || "No vehicle set"} · ${esc(d.driverProfile.vehiclePlate) || "no plate"}` : "No vehicle info submitted yet"}
            · Applied ${fmtDate(d.createdAt)}
          </p>
          <button class="btn btn-primary btn-block approveBtn">${icon("check-circle", 16)} Approve</button>
        </div>`).join("");
      list.querySelectorAll(".approveBtn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const card = btn.closest("[data-id]");
          const id = card.dataset.id;
          btn.disabled = true;
          btn.innerHTML = `<span class="spinner"></span>`;
          try {
            await api.approveKyc(id);
            toast("Driver approved");
            card.remove();
            if (!list.querySelector("[data-id]")) {
              list.innerHTML = `<div class="empty-state"><div class="icon">${icon("check-circle", 32)}</div><p>No pending approvals</p></div>`;
            }
          } catch (err) {
            toast(err.message || "Couldn't approve", true);
            btn.disabled = false;
            btn.innerHTML = `${icon("check-circle", 16)} Approve`;
          }
        });
      });
    })
    .catch(() => { root.querySelector("#approvalsList").innerHTML = `<div class="empty-state"><p>Couldn't load pending drivers</p></div>`; });
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
      list.innerHTML = users.map((u, i) => `
        <div class="list-row stagger-item" style="animation-delay:${Math.min(i, 10) * 30}ms;">
          <div class="list-row-icon">${icon("person", 18)}</div>
          <div class="flex-col" style="flex:1;">
            <p class="font-bold text-sm">${esc(u.name || u.phone)}</p>
            <p class="text-secondary text-xs">${esc(u.phone)} · joined ${fmtDate(u.createdAt)}</p>
          </div>
          <span class="badge ${ROLE_BADGE[u.role] || "badge-accent"}">${esc(u.role)}</span>
        </div>`).join("");
    })
    .catch(() => { root.querySelector("#usersList").innerHTML = `<div class="empty-state"><p>Couldn't load users</p></div>`; });
}
