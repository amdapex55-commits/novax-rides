// Nova X Rides — ops/admin screens. Fully designed; flagged as UI-only:
// the backend only has POST /users/:id/approve-kyc (single-user action), no
// list endpoints for "all pending drivers" or "all users" yet, so this
// screen has nothing real to fetch until those are built.
import { icon } from "./icons.js";

function pendingFlag() {
  return `<div class="pending-flag">${icon("bell", 16)} Backend only supports approving one driver by ID right now — list endpoints for this dashboard don't exist yet.</div>`;
}

export function renderOpsDashboard(root) {
  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-4">Live Operations</h1>
      ${pendingFlag()}
      <div class="flex gap-3 mb-6">
        <div class="card text-center" style="flex:1;"><p class="text-xs text-secondary mb-1">Active Trips</p><p class="font-bold text-lg">—</p></div>
        <div class="card text-center" style="flex:1;"><p class="text-xs text-secondary mb-1">Online Drivers</p><p class="font-bold text-lg">—</p></div>
        <div class="card text-center" style="flex:1;"><p class="text-xs text-secondary mb-1">Pending KYC</p><p class="font-bold text-lg">—</p></div>
      </div>
      <div class="radar-field" style="height:200px; border-radius:var(--r-lg); display:flex; align-items:center; justify-content:center;">
        <div class="radar-sweep"></div>
        <p class="text-xs text-muted" style="position:relative; z-index:1;">Live fleet map</p>
      </div>
    </div>
  `;
}

export function renderOpsApprovals(root) {
  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-4">Driver Approvals</h1>
      ${pendingFlag()}
      <div class="empty-state"><div class="icon">${icon("check-circle", 32)}</div><p>No pending approvals to show</p></div>
    </div>
  `;
}

export function renderOpsUsers(root) {
  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-4">User Management</h1>
      ${pendingFlag()}
      <div class="empty-state"><div class="icon">${icon("users", 32)}</div><p>No user list to show yet</p></div>
    </div>
  `;
}
