// Nova X Rides — driver earnings, profile, vehicle, notifications, incentives.
import { api, Token } from "./api.js";
import { icon } from "./icons.js";
import { toast, fmtMoney, fmtDate, countUp, skeletonRows } from "./ui.js";

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

const VEHICLE_TYPES = [
  { value: "bike", label: "Bike" },
  { value: "rickshaw", label: "Rickshaw" },
  { value: "car", label: "Car" },
];

export function renderVehicle(root) {
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Vehicle Management</h1>
      <div id="vehicleForm">${skeletonRows(3)}</div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());

  api.getVehicle()
    .then((v) => renderForm(v || {}))
    .catch(() => renderForm({}));

  function renderForm(v) {
    root.querySelector("#vehicleForm").innerHTML = `
      <label class="field-label">Vehicle Type</label>
      <div class="flex gap-2 mb-4" id="typeRow">
        ${VEHICLE_TYPES.map((t) => `<button class="option-card${v.vehicleType === t.value ? " selected" : ""}" data-type="${t.value}" style="flex:1; justify-content:center;">${t.label}</button>`).join("")}
      </div>
      <label class="field-label">Number Plate</label>
      <input id="plateInput" class="input mb-4" placeholder="e.g. KHI-2024" value="${v.vehiclePlate || ""}"/>
      <label class="field-label">CNIC Number</label>
      <input id="cnicInput" class="input mb-6" placeholder="42101-1234567-1" value="${v.cnicNumber || ""}"/>
      <button id="saveVehicleBtn" class="btn btn-primary btn-block">Save Vehicle</button>
    `;
    let selectedType = v.vehicleType || "bike";
    root.querySelectorAll("#typeRow .option-card").forEach((c) => {
      c.addEventListener("click", () => {
        root.querySelectorAll("#typeRow .option-card").forEach((x) => x.classList.remove("selected"));
        c.classList.add("selected");
        selectedType = c.dataset.type;
      });
    });
    root.querySelector("#saveVehicleBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>`;
      try {
        await api.updateVehicle({
          vehicleType: selectedType,
          vehiclePlate: root.querySelector("#plateInput").value.trim() || undefined,
          cnicNumber: root.querySelector("#cnicInput").value.trim() || undefined,
        });
        toast("Vehicle saved");
      } catch (err) {
        toast(err.message || "Couldn't save vehicle", true);
      } finally {
        btn.disabled = false;
        btn.innerHTML = "Save Vehicle";
      }
    });
  }
}

export function renderDriverNotifications(root) {
  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-4">Notifications</h1>
      <div id="notifList">${skeletonRows(3)}</div>
    </div>
  `;
  api.getNotifications()
    .then((items) => {
      if (!Array.isArray(items) || items.length === 0) {
        root.querySelector("#notifList").innerHTML = `<div class="empty-state"><div class="icon">${icon("bell", 32)}</div><p>No notifications yet</p></div>`;
        return;
      }
      root.querySelector("#notifList").innerHTML = items.map((n, i) => `
        <div class="list-row stagger-item" style="animation-delay:${i * 40}ms;" data-id="${n.id}">
          <div class="list-row-icon">${icon("bell", 18)}</div>
          <div class="flex-col" style="flex:1;">
            <p class="font-bold text-sm">${n.title}${n.read ? "" : ` <span class="badge badge-accent">New</span>`}</p>
            <p class="text-secondary text-xs mt-1">${n.body}</p>
            <p class="text-xs text-muted mt-1">${fmtDate(n.createdAt)}</p>
          </div>
        </div>`).join("");
      root.querySelectorAll("#notifList [data-id]").forEach((row) => {
        row.addEventListener("click", () => api.markNotificationRead(row.dataset.id).catch(() => {}));
      });
    })
    .catch(() => { root.querySelector("#notifList").innerHTML = `<div class="empty-state"><p>Couldn't load notifications</p></div>`; });
}

export function renderIncentives(root) {
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Incentives & Rewards</h1>
      <div id="incentiveCard">${skeletonRows(1)}</div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());

  api.getIncentiveProgress()
    .then((p) => {
      const pct = Math.min(100, Math.round((p.tripsThisWeek / p.target) * 100));
      root.querySelector("#incentiveCard").innerHTML = `
        <div class="card mb-3">
          <div class="flex justify-between items-center mb-2">
            <p class="font-bold">Complete ${p.target} trips this week</p>
            <span class="badge ${p.achieved ? "badge-success" : "badge-accent"}">${p.achieved ? "Achieved" : `${p.tripsThisWeek}/${p.target}`}</span>
          </div>
          <p class="text-secondary text-sm mb-3">Earn a Rs. ${p.bonusAmount.toLocaleString("en-PK")} bonus</p>
          <div style="height:8px; border-radius:var(--r-full); background:var(--surface-2); overflow:hidden;">
            <div style="height:100%; width:${pct}%; background:var(--accent-gradient); border-radius:var(--r-full);"></div>
          </div>
          <p class="text-xs text-muted mt-2">${p.achieved ? "Bonus paid out with your next payout cycle." : `${p.remaining} more trip${p.remaining === 1 ? "" : "s"} to go`}</p>
        </div>
      `;
    })
    .catch(() => { root.querySelector("#incentiveCard").innerHTML = `<div class="empty-state"><p>Couldn't load incentive progress</p></div>`; });
}
