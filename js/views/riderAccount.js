// Nova Go Rides — wallet, trip history, profile, settings.
import { api, Token } from "../api.js";
import { state } from "../state.js";
import { icon } from "../icons.js";
import { offerInstall, isInstalled } from "../install.js";
import { toast, fmtMoney, fmtDate, countUp, skeletonRows, esc, alertUser} from "../ui.js";
import { navigate } from "../router.js";
import { reportHandled } from "../errors.js";
import { t, getLang, setLang } from "../i18n.js";
import { getThemeMode, setThemeMode } from "../theme.js";
import { clearRecents } from "../savedPlaces.js";
import { haptic } from "../haptics.js";
import { track } from "../analytics.js";

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
    navigate("/signin");
  });
}

export function renderWallet(root) {
  if (!Token.access) {
    root.innerHTML = `<div class="page nx-stagger">
      <h1 class="text-xl mb-6">Wallet</h1>
      ${signInPrompt("Sign in to see your wallet", "Your balance and transaction history live on your account — takes a phone number and a code, no password.")}
    </div>`;
    wireSignInPrompt(root, "/wallet");
    return;
  }

  root.innerHTML = `
    <div class="page nx-stagger">
      <h1 class="text-xl mb-6">Wallet</h1>
      <div class="glow-card mb-4 text-center" style="padding:32px 20px;">
        <p class="text-secondary text-sm mb-2">Available Balance</p>
        <h1 class="text-xl" id="balanceText" style="font-size:34px;">Rs. 0.00</h1>
      </div>
      <!-- Withdraw only appears when there is something to withdraw. A COD
           sender is credited the moment their recipient pays the driver, and
           until this existed that balance had no way out of the app at all. -->
      <button id="withdrawBtn" class="btn btn-primary btn-block mb-2" hidden>
        ${icon("wallet", 18)} Withdraw to JazzCash / Easypaisa
      </button>
      <button id="addMoneyBtn" class="btn btn-secondary btn-block mb-6">${icon("bolt", 18)} Add Money</button>
      <h3 class="text-sm text-secondary mb-3" style="text-transform:uppercase; letter-spacing:0.04em;">Recent Activity</h3>
      <div id="historyList">${skeletonRows(4)}</div>
    </div>
  `;
  const balanceText = root.querySelector("#balanceText");
  const historyList = root.querySelector("#historyList");

  let currentBalance = 0;

  function loadBalance() {
    return api.getWalletBalance()
      .then((data) => {
        currentBalance = Number(data.balance || 0);
        countUp(balanceText, currentBalance, { prefix: "Rs. ", decimals: 2 });
        const w = root.querySelector("#withdrawBtn");
        if (w) w.hidden = !(currentBalance > 0);
      })
      .catch((e) => { balanceText.textContent = "Rs. 0.00"; console.warn(e); });
  }

  root.querySelector("#withdrawBtn")?.addEventListener("click", async () => {
    const method = window.prompt(
      `You can withdraw up to ${fmtMoney(currentBalance)}.\n\n` +
      "Where should we send it? Type JAZZCASH, EASYPAISA or BANK.",
    );
    if (!method) return;
    const m = method.trim().toUpperCase();
    if (!["JAZZCASH", "EASYPAISA", "BANK"].includes(m)) {
      toast("Type JAZZCASH, EASYPAISA or BANK", true);
      return;
    }

    const destination = window.prompt(
      m === "BANK" ? "Your bank account number" : "Your mobile wallet number",
    );
    if (!destination?.trim()) return;

    const amountRaw = window.prompt(
      `How much? Up to ${fmtMoney(currentBalance)}.`,
      String(Math.floor(currentBalance)),
    );
    if (!amountRaw) return;
    const amount = Number(amountRaw);
    // Checked here for a fast, clear message; the server checks it again
    // against the real balance, because a client-supplied amount is a
    // request, not a fact.
    if (!Number.isFinite(amount) || amount <= 0 || amount > currentBalance) {
      toast(`Enter an amount between 1 and ${fmtMoney(currentBalance)}`, true);
      return;
    }

    try {
      const res = await api.requestWithdrawal(amount, m, destination.trim());
      toast(res?.message || "Withdrawal requested");
      loadBalance();
      loadHistory();
    } catch (err) {
      toast(err.message || "Couldn't request that withdrawal", true);
    }
  });
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
                <p class="font-bold text-sm">${esc((e.type || "Transaction").replace(/_/g, " "))}</p>
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

  // Real payment gateway (EasyPaisa/JazzCash) isn't connected yet — the
  // backend no longer lets a rider self-credit their own balance (that was
  // a real security hole: free money on demand), so this is honest about
  // the gap instead of silently failing or pretending it worked.
  root.querySelector("#addMoneyBtn").addEventListener("click", () => {
    toast("Payments aren't connected yet — top-ups will work once a real payment gateway is wired in");
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
    root.innerHTML = `<div class="page nx-stagger">
      <h1 class="text-xl mb-6">Trip History</h1>
      ${signInPrompt("Sign in to see your trips", "Your past rides and receipts show up here once you're signed in.")}
    </div>`;
    wireSignInPrompt(root, "/history");
    return;
  }
  root.innerHTML = `
    <div class="page nx-stagger">
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
      /* A receipt, not a log line.
         This listed status, date, vehicle and fare — which tells someone
         nothing about which trip it was. In a cash market the question people
         actually bring to support is "what was that Rs 340 on Tuesday", and
         answering it needs the route and what the fare was made of. A tip is
         broken out separately because it went to the rider in full and the
         customer should be able to see that. */
      list.innerHTML = trips
        .slice(0, 30)
        .map((t, i) => {
          const fare = Number(t.fare || 0);
          const tip = Number(t.tipAmount || 0);
          const total = fare + tip;
          const cancelled = t.status === "CANCELLED";
          return `
        <div class="card mb-3 stagger-item" style="animation-delay:${Math.min(i, 10) * 40}ms;">
          <div class="flex justify-between items-center mb-2">
            <span class="badge ${TRIP_STATUS_BADGE[t.status] || "badge-accent"}">${esc(t.status)}</span>
            <span class="text-xs text-muted">${fmtDate(t.completedAt || t.createdAt)}</span>
          </div>

          <div class="nx-receipt-route mb-2">
            <span class="nx-receipt-dot start"></span>
            <span class="nx-receipt-place">${esc(t.pickupLabel || "Pickup")}</span>
            <span class="nx-receipt-dot end"></span>
            <span class="nx-receipt-place">${esc(t.dropoffLabel || "Drop-off")}</span>
          </div>

          ${cancelled
            ? `<p class="text-xs text-muted">${
                t.cancelReason
                  ? `Cancelled — ${esc(String(t.cancelReason).toLowerCase().replace(/_/g, " "))}`
                  : "Cancelled"
              }. You weren't charged.</p>`
            : `<div class="nx-receipt-lines">
                 ${t.distanceKm ? `<div><span>Distance</span><span>${Number(t.distanceKm).toFixed(1)} km</span></div>` : ""}
                 <div><span>Fare (cash)</span><span>${fmtMoney(fare)}</span></div>
                 ${tip > 0 ? `<div><span>Fast Match tip</span><span>${fmtMoney(tip)}</span></div>` : ""}
                 <div class="total"><span>Total paid</span><span>${fmtMoney(total)}</span></div>
               </div>`}

          <!-- RIDE AGAIN.
               The cheapest retention there is: most trips in this market are
               the same two or three journeys repeated — home, work, the same
               market. Re-typing a Karachi address every time is the tap
               people abandon on, and the destination is already right here on
               the receipt.
               Only offered when we actually have coordinates. A button that
               reopens the booking screen empty is worse than no button,
               because it promises one tap and delivers six. -->
          ${t.dropoffLat != null && t.dropoffLng != null ? `
            <button class="btn btn-secondary btn-block mt-3" data-again="${i}">
              ${icon("refresh", 16)} Ride again to ${esc(t.dropoffLabel || "here")}
            </button>` : ""}
        </div>`;
        })
        .join("");
      /* The trip list is the only place that has both ends of a past journey,
         so this is where repeating one belongs. Sets the same state the
         booking screen reads when a saved place is tapped — no new path. */
      list.querySelectorAll("[data-again]").forEach((btn) =>
        btn.addEventListener("click", () => {
          const t = trips[Number(btn.dataset.again)];
          if (!t) return;
          haptic.light();
          state.selectedVehicle = "BIKE";
          state.dropoff = {
            label: t.dropoffLabel || "Previous destination",
            lat: t.dropoffLat,
            lng: t.dropoffLng,
          };
          /* Pickup is deliberately NOT restored. Where someone went is stable;
             where they left from usually is not, and pre-filling a stale
             pickup is how a rider is sent to yesterday's address. The booking
             screen asks for it fresh. */
          state.pickup = null;
          track("ride_again", { from: "history" });
          navigate("/set-locations");
        }),
      );
    })
    .catch(() => { list.innerHTML = `<div class="empty-state"><p>Couldn't load trip history</p></div>`; });
}

export function renderProfile(root) {
  if (!Token.access) {
    root.innerHTML = `<div class="page nx-stagger">
      <h1 class="text-xl mb-6">Profile</h1>
      ${signInPrompt("Sign in to see your profile", "Your name, rating, and account settings live here once you're signed in.")}
    </div>`;
    wireSignInPrompt(root, "/profile");
    return;
  }
  const cached = Token.user || {};
  root.innerHTML = `
    <div class="page nx-stagger">
      <h1 class="text-xl mb-6">Profile</h1>
      <div class="card-elevated text-center mb-6" style="padding:28px 20px;">
        <div class="avatar" style="width:80px;height:80px;font-size:28px;margin:0 auto 12px;">${esc((cached.name || "N").charAt(0))}</div>
        <h2 id="nameText">${esc(cached.name) || "Nova Go Rider"}</h2>
        <div class="flex items-center justify-center gap-1 mt-2">
          ${icon("star", 16)}<span id="ratingText" class="font-bold">${cached.rating || "5.0"}</span>
        </div>
      </div>

      <!-- Editable in the app rather than by calling support. Phone is shown
           but deliberately not editable: it's a login identifier here, so a
           signed-in session rewriting it turns a borrowed phone into a
           permanent account transfer. That change goes through a person. -->
      <div class="card mb-3">
        <div class="nx-field-row">
          <div>
            <label class="field-label" for="nameInput">First name</label>
            <input id="nameInput" class="input mb-3" value="${esc(cached.name)}" placeholder="Ahmed"/>
          </div>
          <div>
            <label class="field-label" for="lastNameInput">Last name</label>
            <input id="lastNameInput" class="input mb-3" value="${esc(cached.lastName)}" placeholder="Khan"/>
          </div>
        </div>

        <label class="field-label" for="emailInput">Email</label>
        <input id="emailInput" class="input mb-3" type="email" value="${esc(cached.email)}"
               placeholder="you@example.com"/>

        <label class="field-label">Phone</label>
        <div class="nx-locked-field mb-3">
          <span>${esc(cached.phone) || "—"}</span>
          <span class="nx-locked-note">Contact support to change</span>
        </div>

        <p class="nx-auth-hint" id="profileHint">&nbsp;</p>
        <button id="saveNameBtn" class="btn btn-primary btn-block">Save changes</button>
      </div>

      <div class="flex-col gap-1">
        <!-- The customer app collected notifications and had nowhere to read
             them; getNotifications() was only ever called by the driver. -->
        <div class="list-row" style="cursor:pointer;" data-nav="/alerts">
          <div class="list-row-icon">${icon("bell", 18)}</div>
          <p style="flex:1;" class="font-bold text-sm">Notifications</p>${icon("chevronRight", 18)}
        </div>
        <!-- Only rendered when the app is NOT already installed, so it
             cannot become a row that does nothing on the device where it
             would matter most. -->
        <div class="list-row" style="cursor:pointer;" id="installRow" hidden>
          <div class="list-row-icon">${icon("add", 18)}</div>
          <p style="flex:1;" class="font-bold text-sm">Add to home screen</p>${icon("chevronRight", 18)}
        </div>
        <div class="list-row" style="cursor:pointer;" data-nav="/settings">
          <div class="list-row-icon">${icon("settings", 18)}</div>
          <p style="flex:1;" class="font-bold text-sm">Settings</p>${icon("chevronRight", 18)}
        </div>
        <div class="list-row" style="cursor:pointer;" data-nav="/support">
          <div class="list-row-icon">${icon("help", 18)}</div>
          <p style="flex:1;" class="font-bold text-sm">Help & Support</p>${icon("chevronRight", 18)}
        </div>
      </div>

      <h3 class="text-sm text-secondary mt-6 mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">Legal</h3>
      <div class="flex-col gap-1">
        <div class="list-row" style="cursor:pointer;" data-nav="/legal/terms">
          <p style="flex:1;" class="text-sm">Terms of Service</p>${icon("chevronRight", 16)}
        </div>
        <div class="list-row" style="cursor:pointer;" data-nav="/legal/privacy">
          <p style="flex:1;" class="text-sm">Privacy Policy</p>${icon("chevronRight", 16)}
        </div>
        <div class="list-row" style="cursor:pointer;" data-nav="/legal/cancellation">
          <p style="flex:1;" class="text-sm">Cancellation &amp; Refunds</p>${icon("chevronRight", 16)}
        </div>
      </div>
      <p class="text-xs text-muted text-center mt-5">Nova Go · Cash payments · Karachi</p>
    </div>
  `;

  /* Add to home screen. An explicit row rather than a pop-up: the prompt
     that interrupts you is the one you dismiss without reading, and this is
     a thing people go looking for once they have decided they like the app. */
  const installRow = root.querySelector("#installRow");
  if (installRow && !isInstalled()) {
    installRow.hidden = false;
    installRow.addEventListener("click", () => {
      // force: they asked for it, so a previous dismissal is not a refusal.
      if (!offerInstall({ force: true })) {
        alertUser("This browser can't add apps to the home screen.", {
          suggestion: "Open novago.pk in Chrome or Safari and try again.",
          tone: "info",
        });
      }
    });
  }


  api.getMe().then((u) => {
    root.querySelector("#nameText").textContent = u.name || "Nova Go Rider";
    root.querySelector("#ratingText").textContent = u.rating ?? "5.0";
    root.querySelector("#nameInput").value = u.name || "";
  }).catch(() => {});

  root.querySelector("#saveNameBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const hint = root.querySelector("#profileHint");
    const name = root.querySelector("#nameInput").value.trim();
    const lastName = root.querySelector("#lastNameInput").value.trim();
    const email = root.querySelector("#emailInput").value.trim();

    const fail = (msg) => { hint.textContent = msg; hint.className = "nx-auth-hint error"; };
    if (!name) return fail("Enter your first name.");
    // Checked here for an instant answer; the server checks again, and also
    // checks nobody else already has this address.
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return fail("Enter a valid email address.");
    }

    btn.disabled = true;
    const label = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      const updated = await api.updateMe({ name, lastName, email: email || undefined });
      Token.user = { ...(Token.user || {}), ...updated };
      root.querySelector("#nameText").textContent = name;
      hint.textContent = "\u00a0";
      hint.className = "nx-auth-hint";
      toast("Profile updated");
    } catch (err) {
      // "That email is already used" is expected and shown; anything else is
      // a bug and gets reported.
      reportHandled(err, "updateProfile");
      fail(err.message || "Couldn't update your profile.");
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  root.querySelectorAll("[data-nav]").forEach((r) => r.addEventListener("click", () => navigate(r.dataset.nav)));
}

export function renderSettings(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-6">Settings</h1>

      <!-- APPEARANCE + LANGUAGE.
           Both are segmented controls rather than rows leading to a sub-screen:
           there are three options each, they fit, and burying a language
           switch one level deep is how you make it invisible to exactly the
           people who need it — someone who cannot read the English label on
           the row that leads to it. -->
      <p class="nx-sec-title mb-2">${esc(t("Language"))}</p>
      <div class="nx-seg mb-4" id="langSeg" role="group" aria-label="${esc(t("Language"))}">
        <button class="nx-seg-btn" data-lang="en">English</button>
        <button class="nx-seg-btn" data-lang="ur" lang="ur">اردو</button>
      </div>

      <p class="nx-sec-title mb-2">${esc(t("Theme"))}</p>
      <div class="nx-seg mb-6" id="themeSeg" role="group" aria-label="${esc(t("Theme"))}">
        <button class="nx-seg-btn" data-theme-mode="light">${icon("sun", 15)} ${esc(t("Light"))}</button>
        <button class="nx-seg-btn" data-theme-mode="dark">${icon("moon", 15)} ${esc(t("Dark"))}</button>
        <button class="nx-seg-btn" data-theme-mode="system">${esc(t("System"))}</button>
      </div>

      <div class="flex-col gap-1 mb-6">
        ${settingsRow("history", "Clear recent destinations", { action: "clearRecents", note: "Removes the places you've travelled to from this device" })}
        ${settingsRow("bell", "Notifications", { note: "Trip updates are shown in the app while a ride is active" })}
        ${settingsRow("shield", "Privacy & Security", { nav: "/legal/privacy" })}
        ${settingsRow("phone", "Payment", { note: "Cash only — you pay your rider directly at the end of the trip" })}
        ${settingsRow("document", "Terms & Policies", { nav: "/legal/terms" })}
      </div>
      <button id="logoutBtn" class="btn btn-danger btn-block">${icon("logout", 18)} Log Out</button>
      <!-- Google Play requires in-app account deletion for any app with
           signup. Placed below Log Out and styled as a quiet text link, not a
           red button: it is genuinely irreversible, and it should not sit next
           to Log Out looking like an equally casual choice. -->
      <button id="deleteAccountBtn" class="nx-delete-account">Delete my account</button>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());
  root.querySelectorAll("[data-nav]").forEach((r) =>
    r.addEventListener("click", () => navigate(r.dataset.nav)),
  );

  /* ---- language ---- */
  const langSeg = root.querySelector("#langSeg");
  langSeg.querySelectorAll("[data-lang]").forEach((b) =>
    b.classList.toggle("active", b.dataset.lang === getLang()),
  );
  langSeg.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lang]");
    if (!btn || btn.dataset.lang === getLang()) return;
    haptic.light();
    track("language_changed", { lang: btn.dataset.lang });
    // setLang reloads: every view builds its strings at render time, so a
    // partial repaint would leave half the app in the other language.
    setLang(btn.dataset.lang);
  });

  /* ---- theme ---- */
  const themeSeg = root.querySelector("#themeSeg");
  function paintTheme() {
    const mode = getThemeMode();
    themeSeg.querySelectorAll("[data-theme-mode]").forEach((b) =>
      b.classList.toggle("active", b.dataset.themeMode === mode),
    );
  }
  paintTheme();
  themeSeg.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-mode]");
    if (!btn) return;
    haptic.light();
    setThemeMode(btn.dataset.themeMode);
    track("theme_changed", { mode: btn.dataset.themeMode });
    paintTheme();
  });

  /* ---- clear recents ---- */
  root.querySelector('[data-action="clearRecents"]')?.addEventListener("click", (e) => {
    clearRecents();
    haptic.light();
    const row = e.currentTarget;
    row.querySelector("p.text-xs").textContent = "Cleared from this device";
    row.style.opacity = "0.55";
    row.style.pointerEvents = "none";
  });
  root.querySelector("#deleteAccountBtn")?.addEventListener("click", async () => {
    // Two-step, typed confirmation. A single confirm() on an irreversible,
    // policy-mandated action is how people delete an account by accident on a
    // phone in their pocket.
    const typed = window.prompt(
      "This permanently deletes your account.\n\n" +
      "Your name, phone, email and documents are erased. Anonymous records of " +
      "completed trips are kept for accounting, as set out in the Privacy Policy.\n\n" +
      "Type DELETE to confirm.",
    );
    if (typed?.trim().toUpperCase() !== "DELETE") return;

    try {
      const res = await api.deleteAccount();
      api.logout();
      toast(res?.message || "Your account has been deleted");
      location.hash = "/signin";
    } catch (err) {
      toast(err.message || "Couldn't delete your account — contact support", true);
    }
  });

  root.querySelector("#logoutBtn").addEventListener("click", () => {
    api.logout();
    navigate("/signin");
  });
}

/* These four rows rendered with cursor:pointer and a chevron — every signal
   that says "this goes somewhere" — and had no handler at all. Four dead
   taps on the settings screen.
   
   Two of them now go where they claim. The other two describe what the app
   actually does instead of pretending a screen exists: there is no
   notification-preferences system to configure (nothing is pushed yet), and
   there are no payment methods because the pilot is cash-only. Saying so is
   better than a chevron that does nothing. */
function settingsRow(iconName, label, { nav, note, action } = {}) {
  const interactive = Boolean(nav || action);
  const attrs = nav ? `data-nav="${nav}"` : action ? `data-action="${action}"` : "";
  return `<div class="list-row" ${interactive ? `style="cursor:pointer;" ${attrs}` : ""}>
    <div class="list-row-icon">${icon(iconName, 18)}</div>
    <div style="flex:1;min-width:0;">
      <p class="font-bold text-sm">${label}</p>
      ${note ? `<p class="text-xs text-muted">${note}</p>` : ""}
    </div>
    ${interactive ? icon("chevronRight", 18) : ""}
  </div>`;
}
