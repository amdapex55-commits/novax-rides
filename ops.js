// Nova X Rides — ops/admin screens. Real list endpoints now exist
// (AdminController) instead of the backend only supporting a single
// approve-by-id action, so this dashboard is genuinely wired.
import { api } from "./api.js";
import { icon } from "./icons.js";
import { toast, fmtDate, skeletonRows } from "./ui.js";

export function renderOpsDashboard(root) {
  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-4">Live Operations</h1>
      <div class="flex gap-3 mb-6" id="statsRow">
        <div class="card text-center" style="flex:1;"><p class="text-xs text-secondary mb-1">Active Trips</p><p class="font-bold text-lg" id="statActiveTrips">—</p></div>
        <div class="card text-center" style="flex:1;"><p class="text-xs text-secondary mb-1">Online Drivers</p><p class="font-bold text-lg" id="statOnlineDrivers">—</p></div>
        <div class="card text-center" style="flex:1;"><p class="text-xs text-secondary mb-1">Pending KYC</p><p class="font-bold text-lg" id="statPendingKyc">—</p></div>
      </div>
      <div class="flex gap-3 mb-6">
        <div class="card text-center" style="flex:1;"><p class="text-xs text-secondary mb-1">Total Users</p><p class="font-bold text-lg" id="statTotalUsers">—</p></div>
        <div class="card text-center" style="flex:1;"><p class="text-xs text-secondary mb-1">Total Drivers</p><p class="font-bold text-lg" id="statTotalDrivers">—</p></div>
        <div class="card text-center" style="flex:1;"><p class="text-xs text-secondary mb-1">Active Deliveries</p><p class="font-bold text-lg" id="statActiveDeliveries">—</p></div>
      </div>
      <div class="radar-field" style="height:200px; border-radius:var(--r-lg); display:flex; align-items:center; justify-content:center;">
        <div class="radar-sweep"></div>
        <p class="text-xs text-muted" style="position:relative; z-index:1;">Live fleet map needs a Maps API key — not wired yet</p>
      </div>
    </div>
  `;
  api.getAdminStats()
    .then((s) => {
      root.querySelector("#statActiveTrips").textContent = s.activeTrips;
      root.querySelector("#statOnlineDrivers").textContent = s.onlineDrivers;
      root.querySelector("#statPendingKyc").textContent = s.pendingKyc;
      root.querySelector("#statTotalUsers").textContent = s.totalUsers;
      root.querySelector("#statTotalDrivers").textContent = s.totalDrivers;
      root.querySelector("#statActiveDeliveries").textContent = s.activeDeliveries;
    })
    .catch(() => toast("Couldn't load stats", true));
}

export function renderOpsApprovals(root) {
  root.innerHTML = `
    <div class="page">
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
              <p class="font-bold">${d.name || "Unnamed driver"}</p>
              <p class="text-secondary text-sm">${d.phone}</p>
            </div>
            <span class="badge badge-warning">Pending</span>
          </div>
          <p class="text-xs text-muted mb-3">
            ${d.driverProfile ? `${d.driverProfile.vehicleType || "No vehicle set"} · ${d.driverProfile.vehiclePlate || "no plate"}` : "No vehicle info submitted yet"}
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
    <div class="page">
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
            <p class="font-bold text-sm">${u.name || u.phone}</p>
            <p class="text-secondary text-xs">${u.phone} · joined ${fmtDate(u.createdAt)}</p>
          </div>
          <span class="badge ${ROLE_BADGE[u.role] || "badge-accent"}">${u.role}</span>
        </div>`).join("");
    })
    .catch(() => { root.querySelector("#usersList").innerHTML = `<div class="empty-state"><p>Couldn't load users</p></div>`; });
}
