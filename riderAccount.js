// Nova X Rides — wallet, trip history, profile, settings.
import { api, Token } from "./api.js";
import { state } from "./state.js";
import { icon } from "./icons.js";
import { toast, fmtMoney, fmtDate, countUp, skeletonRows, openSheet, closeSheet } from "./ui.js";
import { navigate } from "./router.js";

function signInPrompt(title, body) {
  return `
    <div class="empty-state">
      <div class="icon">${icon("bolt", 32)}</div>
      <p class="font-bold" style="color:var(--text-primary);">${title}</p>
      <p class="mt-1 mb-5">${body}</p>
      <button id="promptSignInBtn" class="btn btn-primary" style="display:inline-flex;">Sign in ${icon("arrow-forward", 16)}</button>
    </div>
  `;
}
function wireSignInPrompt(root, resumePath) {
  root.querySelector("#promptSignInBtn")?.addEventListener("click", () => {
    state.postAuthRedirect = resumePath;
    navigate("/phone");
  });
}

const TOPUP_PRESETS = [500, 1000, 2000, 5000];

export function renderWallet(root) {
  if (!Token.access) {
    root.innerHTML = `<div class="page">
      <h1 class="text-xl mb-6">Wallet</h1>
      ${signInPrompt("Sign in to see your wallet", "Your balance and transaction history live on your account — takes a phone number and a code, no password.")}
    </div>`;
    wireSignInPrompt(root, "/wallet");
    return;
  }

  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-6">Wallet</h1>
      <div class="glow-card mb-4 text-center" style="padding:32px 20px;">
        <p class="text-secondary text-sm mb-2">Available Balance</p>
        <h1 class="text-xl" id="balanceText" style="font-size:34px;">Rs. 0.00</h1>
      </div>
      <button id="addMoneyBtn" class="btn btn-primary btn-block mb-6">${icon("bolt", 18)} Add Money</button>
      <h3 class="text-sm text-secondary mb-3" style="text-transform:uppercase; letter-spacing:0.04em;">Recent Activity</h3>
      <div id="historyList">${skeletonRows(4)}</div>
    </div>

    <div class="overlay" id="topupOverlay"></div>
    <div class="sheet" id="topupSheet">
      <div class="sheet-handle"></div>
      <h2 class="text-lg mb-1">Add Money</h2>
      <p class="text-secondary text-sm mb-5">No card on file yet — this credits your Nova X balance directly so you can use the app while a real payment gateway is being connected.</p>
      <div class="flex gap-2 mb-4" id="presetRow" style="flex-wrap:wrap;">
        ${TOPUP_PRESETS.map((v) => `<button class="chip" data-amt="${v}">Rs. ${v.toLocaleString("en-PK")}</button>`).join("")}
      </div>
      <label class="field-label">Or enter an amount</label>
      <input id="topupInput" class="input mb-5" type="number" min="1" max="500000" placeholder="e.g. 1500"/>
      <button id="confirmTopupBtn" class="btn btn-primary btn-block">Add Funds</button>
    </div>
  `;
  const balanceText = root.querySelector("#balanceText");
  const historyList = root.querySelector("#historyList");

  function loadBalance() {
    return api.getWalletBalance()
      .then((data) => countUp(balanceText, Number(data.balance || 0), { prefix: "Rs. ", decimals: 2 }))
      .catch((e) => { balanceText.textContent = "Rs. 0.00"; console.warn(e); });
  }
  function loadHistory() {
    return api.getWalletHistory()
      .then((entries) => {
        if (!Array.isArray(entries) || entries.length === 0) {
          historyList.innerHTML = `<div class="empty-state"><div class="icon">${icon("wallet", 32)}</div><p>No transactions yet — add money or take your first ride</p></div>`;
          return;
        }
        historyList.innerHTML = entries
          .slice(0, 25)
          .map((e, i) => {
            const isCredit = (e.type || "").includes("PAYOUT") || (e.type || "") === "WALLET_TOPUP";
            return `
            <div class="list-row stagger-item" style="animation-delay:${i * 40}ms;">
              <div class="list-row-icon">${icon("wallet", 18)}</div>
              <div class="flex-col" style="flex:1;">
                <p class="font-bold text-sm">${(e.type || "Transaction").replace(/_/g, " ")}</p>
                <p class="text-xs text-muted">${fmtDate(e.createdAt || Date.now())}</p>
              </div>
              <p class="font-bold" style="color:${isCredit ? "var(--success)" : "var(--error)"};">${isCredit ? "+" : "-"} ${fmtMoney(Math.abs(e.netAmount || e.grossAmount || 0))}</p>
            </div>`;
          })
          .join("");
      })
      .catch(() => { historyList.innerHTML = `<div class="empty-state"><p>Couldn't load history</p></div>`; });
  }
  loadBalance();
  loadHistory();

  const overlay = root.querySelector("#topupOverlay");
  const sheet = root.querySelector("#topupSheet");
  const input = root.querySelector("#topupInput");
  const confirmBtn = root.querySelector("#confirmTopupBtn");

  root.querySelector("#addMoneyBtn").addEventListener("click", () => openSheet(sheet, overlay));
  overlay.addEventListener("click", () => closeSheet(sheet, overlay));
  root.querySelectorAll("#presetRow .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      root.querySelectorAll("#presetRow .chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      input.value = chip.dataset.amt;
    });
  });

  confirmBtn.addEventListener("click", async () => {
    const amount = Number(input.value);
    if (!amount || amount <= 0) { toast("Enter an amount to add", true); return; }
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<span class="spinner"></span>`;
    try {
      await api.topUpWallet(amount);
      closeSheet(sheet, overlay);
      toast(`Rs. ${amount.toLocaleString("en-PK")} added`);
      input.value = "";
      root.querySelectorAll("#presetRow .chip").forEach((c) => c.classList.remove("selected"));
      await Promise.all([loadBalance(), loadHistory()]);
    } catch (err) {
      toast(err.message || "Couldn't add funds", true);
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = "Add Funds";
    }
  });
}

const TRIP_STATUS_BADGE = {
  COMPLETED: "badge-success",
  CANCELLED: "badge-error",
  IN_PROGRESS: "badge-accent",
  MATCHED: "badge-accent",
  REQUESTED: "badge-warning",
  MATCHING: "badge-warning",
};

export function renderTripHistory(root) {
  if (!Token.access) {
    root.innerHTML = `<div class="page">
      <h1 class="text-xl mb-6">Trip History</h1>
      ${signInPrompt("Sign in to see your trips", "Your past rides and receipts show up here once you're signed in.")}
    </div>`;
    wireSignInPrompt(root, "/history");
    return;
  }
  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-6">Trip History</h1>
      <div id="list">${skeletonRows(4)}</div>
    </div>
  `;
  const list = root.querySelector("#list");
  api.listMyTrips()
    .then((trips) => {
      if (!Array.isArray(trips) || trips.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="icon">${icon("history", 32)}</div><p>No trips yet — your first ride will show up here</p></div>`;
        return;
      }
      list.innerHTML = trips
        .slice(0, 30)
        .map(
          (t, i) => `
        <div class="card mb-3 stagger-item" style="animation-delay:${i * 40}ms;">
          <div class="flex justify-between items-center mb-2">
            <span class="badge ${TRIP_STATUS_BADGE[t.status] || "badge-accent"}">${t.status}</span>
            <span class="text-xs text-muted">${fmtDate(t.createdAt)}</span>
          </div>
          <div class="flex justify-between items-center">
            <p class="text-sm text-secondary">${t.vehicleType || ""}</p>
            <p class="font-bold">${t.fare ? fmtMoney(t.fare) : "—"}</p>
          </div>
        </div>`
        )
        .join("");
    })
    .catch(() => { list.innerHTML = `<div class="empty-state"><p>Couldn't load trip history</p></div>`; });
}

export function renderProfile(root) {
  if (!Token.access) {
    root.innerHTML = `<div class="page">
      <h1 class="text-xl mb-6">Profile</h1>
      ${signInPrompt("Sign in to see your profile", "Your name, rating, and account settings live here once you're signed in.")}
    </div>`;
    wireSignInPrompt(root, "/profile");
    return;
  }
  const cached = Token.user || {};
  root.innerHTML = `
    <div class="page">
      <h1 class="text-xl mb-6">Profile</h1>
      <div class="card-elevated text-center mb-6" style="padding:28px 20px;">
        <div class="avatar" style="width:80px;height:80px;font-size:28px;margin:0 auto 12px;">${(cached.name || "N").charAt(0)}</div>
        <h2 id="nameText">${cached.name || "Nova X Rider"}</h2>
        <div class="flex items-center justify-center gap-1 mt-2">
          ${icon("star", 16)}<span id="ratingText" class="font-bold">${cached.rating || "5.0"}</span>
        </div>
      </div>

      <div class="card mb-3">
        <label class="field-label">Full Name</label>
        <div class="flex gap-2">
          <input id="nameInput" class="input" value="${cached.name || ""}" placeholder="Your name"/>
          <button id="saveNameBtn" class="btn btn-secondary">Save</button>
        </div>
      </div>

      <div class="flex-col gap-1">
        <div class="list-row" style="cursor:pointer;" data-nav="/settings">
          <div class="list-row-icon">${icon("settings", 18)}</div>
          <p style="flex:1;" class="font-bold text-sm">Settings</p>${icon("chevronRight", 18)}
        </div>
        <div class="list-row" style="cursor:pointer;" data-nav="/support">
          <div class="list-row-icon">${icon("help", 18)}</div>
          <p style="flex:1;" class="font-bold text-sm">Help & Support</p>${icon("chevronRight", 18)}
        </div>
      </div>
    </div>
  `;

  api.getMe().then((u) => {
    root.querySelector("#nameText").textContent = u.name || "Nova X Rider";
    root.querySelector("#ratingText").textContent = u.rating ?? "5.0";
    root.querySelector("#nameInput").value = u.name || "";
  }).catch(() => {});

  root.querySelector("#saveNameBtn").addEventListener("click", async () => {
    const name = root.querySelector("#nameInput").value.trim();
    if (!name) return;
    try {
      await api.updateMe(name);
      const u = Token.user || {};
      Token.user = { ...u, name };
      root.querySelector("#nameText").textContent = name;
      toast("Profile updated");
    } catch (err) { toast(err.message || "Couldn't update profile", true); }
  });

  root.querySelectorAll("[data-nav]").forEach((r) => r.addEventListener("click", () => navigate(r.dataset.nav)));
}

export function renderSettings(root) {
  root.innerHTML = `
    <div class="page">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-6">Settings</h1>
      <div class="flex-col gap-1 mb-6">
        ${settingsRow("bell", "Notifications")}
        ${settingsRow("shield", "Privacy & Security")}
        ${settingsRow("phone", "Payment Methods")}
        ${settingsRow("document", "Terms & Policies")}
      </div>
      <button id="logoutBtn" class="btn btn-danger btn-block">${icon("logout", 18)} Log Out</button>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelector("#logoutBtn").addEventListener("click", () => {
    api.logout();
    navigate("/phone");
  });
}

function settingsRow(iconName, label) {
  return `<div class="list-row" style="cursor:pointer;">
    <div class="list-row-icon">${icon(iconName, 18)}</div>
    <p style="flex:1;" class="font-bold text-sm">${label}</p>${icon("chevronRight", 18)}
  </div>`;
}
