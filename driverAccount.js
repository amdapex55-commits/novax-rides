// Nova X Rides — driver earnings, profile, vehicle, notifications, incentives.
import { api, Token } from "./api.js";
import { icon } from "./icons.js";
import { toast, fmtMoney, fmtDate, countUp, skeletonRows } from "./ui.js";

function pendingFlag() {
  return `<div class="pending-flag">${icon("bell", 16)} Designed but not backend-wired yet — no API exists for this feature.</div>`;
}

export function renderEarnings(root) {
  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-6">Earnings</h1>
      <div class="glow-card mb-6 text-center" style="padding:32px 20px;">
        <p class="text-secondary text-sm mb-2">Total Balance</p>
        <h1 id="balanceText" style="font-size:34px;">Rs. 0.00</h1>
      </div>
      <h3 class="text-sm text-secondary mb-3" style="text-transform:uppercase; letter-spacing:0.04em;">Payout History</h3>
      <div id="historyList">${skeletonRows(4)}</div>
    </div>
  `;
  const balanceText = root.querySelector("#balanceText");
  const historyList = root.querySelector("#historyList");

  api.getWalletBalance()
    .then((data) => countUp(balanceText, Number(data.balance || 0), { prefix: "Rs. ", decimals: 2 }))
    .catch(() => { balanceText.textContent = "Rs. 0.00"; });

  api.getWalletHistory()
    .then((entries) => {
      if (!Array.isArray(entries) || entries.length === 0) {
        historyList.innerHTML = `<div class="empty-state"><div class="icon">${icon("wallet", 32)}</div><p>No payouts yet</p></div>`;
        return;
      }
      historyList.innerHTML = entries.slice(0, 25).map((e, i) => `
        <div class="list-row stagger-item" style="animation-delay:${i * 40}ms;">
          <div class="list-row-icon">${icon("wallet", 18)}</div>
          <div class="flex-col" style="flex:1;">
            <p class="font-bold text-sm">${(e.type || "Payout").replace(/_/g, " ")}</p>
            <p class="text-xs text-muted">${fmtDate(e.createdAt || Date.now())}</p>
          </div>
          <p class="font-bold" style="color:var(--success);">+ ${fmtMoney(e.netAmount || e.grossAmount || 0)}</p>
        </div>`).join("");
    })
    .catch(() => { historyList.innerHTML = `<div class="empty-state"><p>Couldn't load history</p></div>`; });
}

export function renderDriverProfile(root) {
  const cached = Token.user || {};
  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-6">Driver Profile</h1>
      <div class="card-elevated text-center mb-6" style="padding:28px 20px;">
        <div class="avatar" style="width:80px;height:80px;font-size:28px;margin:0 auto 12px;">${(cached.name || "N").charAt(0)}</div>
        <h2 id="nameText">${cached.name || "Nova X Driver"}</h2>
        <div class="flex items-center justify-center gap-1 mt-2">
          ${icon("star", 16)}<span id="ratingText" class="font-bold">${cached.rating || "5.0"}</span>
        </div>
        <span class="badge badge-success mt-3">${cached.kycStatus || "APPROVED"}</span>
      </div>
      <div class="card mb-3">
        <label class="field-label">Full Name</label>
        <div class="flex gap-2">
          <input id="nameInput" class="input" value="${cached.name || ""}" placeholder="Your name"/>
          <button id="saveNameBtn" class="btn btn-secondary">Save</button>
        </div>
      </div>
      <div class="flex-col gap-1">
        <div class="list-row" style="cursor:pointer;" data-nav="/driver/vehicle">
          <div class="list-row-icon">${icon("car", 18)}</div>
          <p style="flex:1;" class="font-bold text-sm">Vehicle Management</p>${icon("chevronRight", 18)}
        </div>
        <div class="list-row" style="cursor:pointer;" data-nav="/driver/incentives">
          <div class="list-row-icon">${icon("gift", 18)}</div>
          <p style="flex:1;" class="font-bold text-sm">Incentives & Rewards</p>${icon("chevronRight", 18)}
        </div>
        <div class="list-row" style="cursor:pointer;" data-nav="/support">
          <div class="list-row-icon">${icon("help", 18)}</div>
          <p style="flex:1;" class="font-bold text-sm">Help & Support</p>${icon("chevronRight", 18)}
        </div>
      </div>
      <button id="logoutBtn" class="btn btn-danger btn-block mt-6">${icon("logout", 18)} Log Out</button>
    </div>
  `;

  api.getMe().then((u) => {
    root.querySelector("#nameText").textContent = u.name || "Nova X Driver";
    root.querySelector("#ratingText").textContent = u.rating ?? "5.0";
    root.querySelector("#nameInput").value = u.name || "";
  }).catch(() => {});

  root.querySelector("#saveNameBtn").addEventListener("click", async () => {
    const name = root.querySelector("#nameInput").value.trim();
    if (!name) return;
    try {
      await api.updateMe(name);
      Token.user = { ...(Token.user || {}), name };
      root.querySelector("#nameText").textContent = name;
      toast("Profile updated");
    } catch (err) { toast(err.message || "Couldn't update", true); }
  });
  root.querySelector("#logoutBtn").addEventListener("click", () => { api.logout(); location.hash = "/driver/phone"; });
  root.querySelectorAll("[data-nav]").forEach((r) => r.addEventListener("click", () => (location.hash = r.dataset.nav)));
}

export function renderVehicle(root) {
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Vehicle Management</h1>
      ${pendingFlag()}
      <div class="card flex items-center gap-3 mb-3">
        <div class="list-row-icon">${icon("car", 20)}</div>
        <div style="flex:1;">
          <p class="font-bold text-sm">Primary Vehicle</p>
          <p class="text-secondary text-xs">Not added yet</p>
        </div>
      </div>
      <button class="btn btn-secondary btn-block">Add Vehicle</button>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
}

export function renderDriverNotifications(root) {
  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-4">Notifications</h1>
      ${pendingFlag()}
      <div class="empty-state"><div class="icon">${icon("bell", 32)}</div><p>No notifications yet</p></div>
    </div>
  `;
}

export function renderIncentives(root) {
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Incentives & Rewards</h1>
      ${pendingFlag()}
      <div class="card mb-3">
        <p class="font-bold mb-1">Complete 20 trips this week</p>
        <p class="text-secondary text-sm">Earn a Rs. 1,500 bonus</p>
      </div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
}
