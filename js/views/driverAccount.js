// Nova Go Rides — driver earnings, profile, vehicle, notifications, incentives.
import { api, Token } from "../api.js";
import { icon } from "../icons.js";
import { offerInstall, isInstalled } from "../install.js";
import { toast, fmtMoney, fmtDate, countUp, skeletonRows, esc, alertUser} from "../ui.js";
import { SETTLEMENT, activeSettlementChannels } from "../settlement.config.js";
import { COMMISSION_PCT } from "../launch.config.js";
import { haptic } from "../haptics.js";
import { reportHandled } from "../errors.js";
import { navigate } from "../router.js";

/** Today and yesterday, pulled out of the week the API already sent.
 *  todayIndex is the server's own idea of which bucket is today, so this
 *  never re-derives a week boundary in the phone's timezone and lands a day
 *  out — which is exactly the kind of bug a driver reports as "it stole my
 *  earnings". */
function paintDay(root, e) {
  const daily = Array.isArray(e.daily) ? e.daily : [];
  const i = Number.isInteger(e.todayIndex) ? e.todayIndex : daily.length - 1;
  const today = daily[i];
  const yesterday = i > 0 ? daily[i - 1] : null;

  const set = (amountId, jobsId, bucket, fallbackAmount) => {
    const amount = bucket ? Number(bucket.amount || 0) : fallbackAmount;
    root.querySelector(`#${amountId}`).textContent = fmtMoney(amount ?? 0);
    const jobs = bucket ? Number(bucket.jobs || 0) : null;
    root.querySelector(`#${jobsId}`).textContent =
      jobs == null ? "\u00a0" : jobs === 0 ? "No jobs" : `${jobs} job${jobs === 1 ? "" : "s"}`;
  };

  // `today` from the API is authoritative for today; the bucket is the
  // fallback if the array is shaped unexpectedly.
  set("todayAmount", "todayJobs", today, Number(e.today || 0));
  // Yesterday only exists inside this week. On a Sunday there is no bucket
  // before today, and inventing one from last week's total would be a lie.
  if (yesterday) {
    set("yesterdayAmount", "yesterdayJobs", yesterday, 0);
  } else {
    root.querySelector("#yesterdayAmount").textContent = "—";
    root.querySelector("#yesterdayJobs").textContent = "New week";
  }
}

export function renderEarnings(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <h1 class="text-xl mb-4">Earnings</h1>

      <!-- A DRIVER IS RUNNING A BUSINESS OFF THIS SCREEN.
           It used to open on "Total Balance" — an accounting figure — followed
           by a list of transactions. That is a bank statement, and it answers
           a question nobody opens the app to ask. What a rider wants to know
           at the end of a shift is whether today was a good day, and whether
           this week is beating last week. So the week leads, the seven bars
           make the shape of it readable at a glance, and the balance moves
           down to where it belongs. -->
      <div class="nx-earn-hero mb-4" id="earnHero">
        <p style="font-size:11.5px; opacity:0.85; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;">This week</p>
        <p class="nx-earn-amount" id="weekAmount">Rs. —</p>
        <div id="weekDelta" style="margin-top:8px;"></div>
        <div class="nx-bars" id="weekBars"></div>
      </div>

      <!-- TODAY IS THE NUMBER A DRIVER CHECKS MOST, and it was not on the
           earnings screen at all — only the week, and a home-screen figure
           they had to navigate away to see. Yesterday sits next to it because
           "am I doing better than yesterday" is the actual question; a bare
           number answers nothing without something to compare it to.
           Both come from the daily[] array the API already returns, so this
           costs no extra request. -->
      <div class="nx-earn-pair mb-3">
        <div class="card">
          <p class="text-secondary text-xs">Today</p>
          <p class="font-bold" id="todayAmount" style="font-size:22px;">Rs. —</p>
          <p class="text-xs text-muted" id="todayJobs">&nbsp;</p>
        </div>
        <div class="card">
          <p class="text-secondary text-xs">Yesterday</p>
          <p class="font-bold" id="yesterdayAmount" style="font-size:22px;">Rs. —</p>
          <p class="text-xs text-muted" id="yesterdayJobs">&nbsp;</p>
        </div>
      </div>

      <div class="card mb-3 flex items-center justify-between">
        <div>
          <p class="text-secondary text-xs">Wallet balance</p>
          <p class="font-bold" id="balanceText" style="font-size:20px;">Rs. 0.00</p>
        </div>
        <div class="text-end">
          <p class="text-secondary text-xs">Jobs this week</p>
          <p class="font-bold" id="jobsWeek" style="font-size:20px;">—</p>
        </div>
      </div>

      <!-- Commission owed lived only on its own screen, which a driver reaches
           by knowing it exists. It belongs next to the money it comes out of. -->
      <button id="settleBtn" class="list-row mb-4" style="width:100%;text-align:start;">
        <div class="list-row-icon">${icon("wallet", 18)}</div>
        <div style="flex:1;">
          <p class="font-bold text-sm">Commission &amp; settlement</p>
          <p class="text-secondary text-xs">What you owe Nova Go, and how to pay it</p>
        </div>
        ${icon("arrow-forward", 16)}
      </button>

      <h3 class="nx-sec-title mb-3">Payout history</h3>
      <div id="historyList">${skeletonRows(4)}</div>
    </div>
  `;
  const balanceText = root.querySelector("#balanceText");
  const historyList = root.querySelector("#historyList");
  root.querySelector("#settleBtn").addEventListener("click", () => navigate("/driver/settle"));

  api.getDriverEarnings()
    .then((e) => {
      if (!root.isConnected) return;
      countUp(root.querySelector("#weekAmount"), Number(e.week || 0), { prefix: "Rs. " });
      root.querySelector("#jobsWeek").textContent = e.jobsThisWeek ?? 0;
      paintWeekBars(root.querySelector("#weekBars"), e);
      paintWeekDelta(root.querySelector("#weekDelta"), e);
      paintDay(root, e);
    })
    .catch(() => {
      if (!root.isConnected) return;
      root.querySelector("#weekAmount").textContent = fmtMoney(0);
      root.querySelector("#weekDelta").innerHTML =
        `<span class="nx-earn-delta">Couldn't load this week</span>`;
    });

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

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/* Seven bars, scaled to the driver's own best day rather than to a fixed
   ceiling — the shape of the week is the information, and a Rs 900 day
   should look full on a quiet week rather than like a stub against some
   aspirational maximum. */
function paintWeekBars(el, e) {
  if (!el) return;
  const daily = Array.isArray(e.daily) ? e.daily : [];
  if (daily.length === 0) { el.remove(); return; }
  const peak = Math.max(...daily.map((d) => d.amount), 1);
  const todayIndex = Number.isInteger(e.todayIndex) ? e.todayIndex : -1;

  el.innerHTML = daily
    .map((d, i) => {
      const pct = Math.round((d.amount / peak) * 100);
      const isToday = i === todayIndex;
      // Days that haven't happened yet get a flat track, not a zero bar —
      // Thursday looking like a bad day on a Tuesday is just wrong.
      const future = todayIndex >= 0 && i > todayIndex;
      return `
        <div class="nx-bar-col" title="${esc(d.date)}: Rs ${Math.round(d.amount)}">
          <div class="nx-bar-track">
            <div class="nx-bar${future ? "" : d.amount > 0 ? (isToday ? " is-today" : " has-value") : ""}"
                 style="height:${future ? 3 : Math.max(3, pct)}%;"></div>
          </div>
          <span class="nx-bar-label" style="${isToday ? "color:var(--accent-2);font-weight:800;" : ""}">${DAY_INITIALS[i]}</span>
        </div>`;
    })
    .join("");
}

/* Week-on-week, in the driver's terms. "Rs 1,240 ahead of last week" is the
   sentence that decides whether they go out again tomorrow; a percentage is
   not how anybody thinks about a day's takings. */
function paintWeekDelta(el, e) {
  if (!el) return;
  const week = Number(e.week || 0);
  const last = Number(e.lastWeek || 0);
  if (last <= 0 && week <= 0) { el.innerHTML = ""; return; }
  if (last <= 0) {
    el.innerHTML = `<span class="nx-earn-delta">First week — keep going</span>`;
    return;
  }
  const diff = Math.round(week - last);
  const ahead = diff >= 0;
  el.innerHTML = `
    <span class="nx-earn-delta">
      ${ahead ? "▲" : "▼"} Rs ${Math.abs(diff).toLocaleString("en-PK")}
      ${ahead ? "ahead of" : "behind"} last week
    </span>`;
}

export function renderDriverProfile(root) {
  const cached = Token.user || {};
  root.innerHTML = `
    <div class="page nx-stagger">
      <h1 class="text-xl mb-6">Driver Profile</h1>
      <div class="card-elevated text-center mb-6" style="padding:28px 20px;">
        <div class="avatar" style="width:80px;height:80px;font-size:28px;margin:0 auto 12px;">${esc((cached.name || "N").charAt(0))}</div>
        <h2 id="nameText">${esc(cached.name || "Nova Go Driver")}</h2>
        <div class="flex items-center justify-center gap-1 mt-2">
          ${icon("star", 16)}<span id="ratingText" class="font-bold">${cached.rating || "5.0"}</span>
        </div>
        <span class="badge badge-success mt-3">${cached.kycStatus || "APPROVED"}</span>
      </div>
      <div class="card mb-3">
        <label class="field-label">Full Name</label>
        <div class="flex gap-2">
          <input id="nameInput" class="input" value="${esc(cached.name || "")}" placeholder="Your name"/>
          <button id="saveNameBtn" class="btn btn-secondary">Save</button>
        </div>
      </div>
      <div class="flex-col gap-1">
        <!-- Only rendered when the app is NOT already installed, so it
             cannot become a row that does nothing on the device where it
             would matter most. -->
        <div class="list-row" style="cursor:pointer;" id="installRow" hidden>
          <div class="list-row-icon">${icon("add", 18)}</div>
          <p style="flex:1;" class="font-bold text-sm">Add to home screen</p>${icon("chevronRight", 18)}
        </div>
        <!-- The star on this screen is a number with nothing behind it until
             there is somewhere to go and read the reasons. -->
        <div class="list-row" style="cursor:pointer;" data-nav="/driver/reviews">
          <div class="list-row-icon" style="color:var(--warning);">${icon("star", 18)}</div>
          <p style="flex:1;" class="font-bold text-sm">Your rating &amp; reviews</p>
          ${icon("arrow-forward", 16)}
        </div>
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
      <!-- Google Play requires in-app account deletion for any app with
           signup. Below Log Out and styled as a quiet text link, not a red
           button: it is genuinely irreversible and should not sit next to Log
           Out looking like an equally casual choice. -->
      <button id="deleteAccountBtn" class="nx-delete-account">Delete my account</button>
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
    root.querySelector("#nameText").textContent = u.name || "Nova Go Driver";
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
  root.querySelector("#logoutBtn").addEventListener("click", () => { api.logout(); location.hash = "/signin"; });
  root.querySelector("#deleteAccountBtn")?.addEventListener("click", async () => {
    // Typed confirmation. A single confirm() on an irreversible action is how
    // an account gets deleted by a phone in someone's pocket.
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
  root.querySelectorAll("[data-nav]").forEach((r) => r.addEventListener("click", () => (location.hash = r.dataset.nav)));
}

/* Bike only in the pilot. Offering rickshaw and car let a driver select a
   vehicle Nova Go cannot dispatch to, which reads as "the app never gives me
   jobs" — the same complaint the diagnostics screen exists to answer. */
const VEHICLE_TYPES = [
  { value: "bike", label: "Bike" },
];

export function renderVehicle(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
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
    <div class="page nx-stagger">
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
      /* esc() ON EVERY FIELD — title and body were interpolated raw. See the
         same note on the customer copy in riderExtras.js: notification bodies
         carry text that people typed, and this runs with the driver's token
         in localStorage. */
      root.querySelector("#notifList").innerHTML = items.map((n, i) => `
        <div class="list-row stagger-item" style="animation-delay:${i * 40}ms;" data-id="${esc(n.id)}">
          <div class="list-row-icon">${icon("bell", 18)}</div>
          <div class="flex-col" style="flex:1;">
            <p class="font-bold text-sm">${esc(n.title)}${n.read ? "" : ` <span class="badge badge-accent">New</span>`}</p>
            <p class="text-secondary text-xs mt-1" dir="auto">${esc(n.body)}</p>
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
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-6">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-4">Incentives & Rewards</h1>
      <div id="incentiveCard">${skeletonRows(1)}</div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());

  api.getIncentiveProgress()
    .then((p) => {
      if (!root.isConnected) return;
      /* A RING, NOT A BAR.
         The bar this replaces measured a percentage, and a percentage is not
         what the rider is tracking — they are counting trips to a single
         milestone with money on the other side of it. A ring reads as
         distance to a thing, holds the count in the middle where the eye
         lands, and puts the bonus next to it rather than in a line of body
         copy underneath. */
      const target = Math.max(1, Number(p.target) || 1);
      const done = Math.min(target, Number(p.tripsThisWeek) || 0);
      const pct = done / target;
      // r=40 -> circumference 251.3. Stroke-dashoffset counts the gap down
      // as progress goes up, which is why it is (1 - pct).
      const CIRC = 2 * Math.PI * 40;

      root.querySelector("#incentiveCard").innerHTML = `
        <div class="card mb-3">
          <div class="flex items-center gap-4">
            <div class="nx-ring-wrap">
              <svg width="92" height="92" viewBox="0 0 92 92">
                <circle class="nx-ring-bg" cx="46" cy="46" r="40" fill="none" stroke-width="9"/>
                <circle class="nx-ring-fill" cx="46" cy="46" r="40" fill="none" stroke-width="9"
                        stroke-dasharray="${CIRC.toFixed(1)}"
                        stroke-dashoffset="${(CIRC * (1 - pct)).toFixed(1)}"/>
              </svg>
              <div class="nx-ring-text">${done}<span style="font-size:12px;opacity:0.6;">/${target}</span></div>
            </div>
            <div style="flex:1; min-width:0;">
              <p class="font-bold">Weekly bonus</p>
              <p class="text-secondary text-sm" style="margin-top:2px;">
                Complete ${target} trips this week
              </p>
              <p class="font-bold mt-2" style="font-size:22px; color:var(--accent);">
                Rs. ${Number(p.bonusAmount || 0).toLocaleString("en-PK")}
              </p>
              <span class="badge ${p.achieved ? "badge-success" : "badge-accent"} mt-2">
                ${p.achieved ? "Achieved" : `${p.remaining} to go`}
              </span>
            </div>
          </div>
          <p class="text-xs text-muted mt-3" style="border-top:1px solid var(--surface-border); padding-top:10px;">
            ${p.achieved
              ? "Bonus is paid with your next payout cycle."
              : `${p.remaining} more trip${p.remaining === 1 ? "" : "s"} and the bonus is yours.`}
          </p>
        </div>
      `;
    })
    .catch(() => {
      if (!root.isConnected) return;
      root.querySelector("#incentiveCard").innerHTML = `<div class="empty-state"><p>Couldn't load incentive progress</p></div>`;
    });
}

/* ------------------------------------------------------- commission owed ---

   WHAT THIS FIXES

   The credit limit already worked: a driver past Rs 2,000 of unsettled
   commission is filtered out of matching by LocationService.filterEligible
   and stops being offered jobs. The backend knew the exact figure, knew they
   were blocked, and knew what would clear it.

   None of it reached the driver. The app kept showing "Online" and jobs
   simply stopped arriving. From the saddle that is indistinguishable from a
   quiet afternoon, and then from a broken app — and the driver goes back to
   Bykea without ever learning they owed Rs 2,000.

   So this screen does three things, in this order:
     1. says what is owed and how much room is left before work stops
     2. warns on the way up, not at the wall
     3. tells them exactly how to pay, into a real account

   The ladder (ok / notice / warning / blocked) is graded server-side against
   the configured limit, so changing DRIVER_CREDIT_LIMIT_PKR moves the whole
   thing rather than stranding warnings that fire after the block.           */

const LEVEL_COPY = {
  ok:      { tone: "ok",      title: "You're all clear" },
  notice:  { tone: "notice",  title: "Commission building up" },
  warning: { tone: "warning", title: "Settle soon to keep working" },
  blocked: { tone: "blocked", title: "Jobs paused until you settle" },
};

export function renderSettleUp(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-1">Commission</h1>
      <p class="text-secondary text-sm mb-4">
        You collect the full fare in cash. Nova Go's ${COMMISSION_PCT}% is settled separately.
      </p>
      <div id="settleBody">${skeletonRows(2)}</div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());

  api.getWalletBalance()
    .then((b) => {
      if (!root.isConnected) return;
      root.querySelector("#settleBody").innerHTML = settleBodyHtml(b);
      wireCopyButtons(root);
    })
    .catch(() => {
      if (!root.isConnected) return;
      root.querySelector("#settleBody").innerHTML =
        `<div class="empty-state"><p>Couldn't load your balance. Pull down to retry.</p></div>`;
    });
}

function settleBodyHtml(b) {
  const owed = Number(b.owed || 0);
  const limit = b.creditLimit == null ? null : Math.abs(Number(b.creditLimit));
  const remaining = b.remainingCredit == null ? null : Number(b.remainingCredit);
  const level = LEVEL_COPY[b.level] ? b.level : "ok";
  const meta = LEVEL_COPY[level];
  // Fill the bar against the limit, so the wall is visible before it is hit.
  const pct = limit ? Math.max(2, Math.min(100, (owed / limit) * 100)) : 0;

  const channels = activeSettlementChannels();

  return `
    <div class="nx-owe nx-owe-${meta.tone} mb-4">
      <p class="nx-owe-label">You owe Nova Go</p>
      <p class="nx-owe-amount">Rs. ${owed.toLocaleString("en-PK")}</p>
      ${limit ? `
        <div class="nx-owe-track"><div class="nx-owe-fill" style="width:${pct.toFixed(0)}%;"></div></div>
        <p class="nx-owe-meta">
          ${b.blocked
            ? `You've reached the Rs. ${limit.toLocaleString("en-PK")} limit. New jobs resume as soon as this is cleared.`
            : `Rs. ${Number(remaining).toLocaleString("en-PK")} of trips left before jobs pause at Rs. ${limit.toLocaleString("en-PK")}.`}
        </p>` : ""}
      <p class="nx-owe-title">${esc(meta.title)}</p>
    </div>

    ${b.blocked ? `
      <div class="nx-action-row danger mb-4">
        <div>
          <p class="font-bold text-sm">You're not receiving jobs right now</p>
          <p class="text-xs text-secondary" style="margin-top:3px;">
            This isn't a suspension and nothing is wrong with your account —
            it's the unsettled commission. Pay it and you're back on
            immediately.
          </p>
        </div>
      </div>` : ""}

    ${channels.length === 0 ? `
      <!-- Nothing configured. Say so honestly rather than rendering four
           empty account numbers a driver might try to pay into. -->
      <div class="nx-action-row warn">
        <div>
          <p class="font-bold text-sm">Payment details not set up yet</p>
          <p class="text-xs text-secondary" style="margin-top:3px;">
            Call the ops desk to settle. (Fill SETTLEMENT in
            js/settlement.config.js to show payment options here.)
          </p>
        </div>
      </div>` : `
      <p class="nx-sec-title mb-2">Pay through any of these</p>
      <div class="flex-col gap-2 mb-4">
        ${channels.map((c) => `
          <div class="nx-pay-card">
            <div class="flex justify-between items-center">
              <p class="font-bold text-sm">${esc(c.label)}</p>
              <button class="nx-copy-btn" data-copy="${esc(c.accountNumber)}">${icon("document", 13)} Copy</button>
            </div>
            <p class="nx-pay-number">${esc(c.accountNumber)}</p>
            <p class="text-xs text-secondary">${esc(c.accountTitle)}</p>
            ${c.bankName ? `<p class="text-xs text-muted">${esc(c.bankName)}</p>` : ""}
            <p class="text-xs text-muted" style="margin-top:6px;">${esc(c.hint)}</p>
          </div>`).join("")}
      </div>

      <div class="nx-action-row info">
        <div>
          <p class="font-bold text-sm">After you pay</p>
          <p class="text-xs text-secondary" style="margin-top:3px;">
            ${esc(SETTLEMENT.proofInstruction)} Cleared ${esc(SETTLEMENT.clearedWithin)}.
          </p>
        </div>
      </div>`}
  `;
}

function wireCopyButtons(root) {
  root.querySelectorAll("[data-copy]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const value = btn.dataset.copy;
      haptic.light();
      try {
        await navigator.clipboard.writeText(value);
        const original = btn.innerHTML;
        btn.innerHTML = `${icon("check", 13)} Copied`;
        setTimeout(() => { btn.innerHTML = original; }, 1600);
      } catch {
        // Clipboard is blocked in some in-app webviews. The number is on
        // screen either way, so this is a convenience failing, not the task.
        toast(`Account number: ${value}`);
      }
    }),
  );
}

/* -------------------------------------------------- device diagnostics ---

   "I'm online but I'm not getting any jobs."

   That sentence is the most common thing a driver says to an ops desk, and
   until now the honest answer was a phone call working through a checklist:
   is your GPS on, is the app open, are your documents approved, do you owe
   commission. Every one of those is something the SERVER already knows —
   LocationService.getDriverStatus computes exactly the conditions matching
   uses, so it can never tell a driver they are fine while the matcher is
   skipping them.

   The screen shows REASONS, not a status light. "You are offline" sends
   someone to a toggle they already switched on; "your location hasn't reached
   us in four minutes" tells them what to actually do.

   Device health is shown even when everything is fine, because it is what a
   dispatcher asks for when a driver phones in — and reading it off their own
   screen is faster than describing where to find it in Android settings.   */

export function renderDriverDiagnostics(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-1">Why am I not getting jobs?</h1>
      <p class="text-secondary text-sm mb-4">
        This is what our servers can see about your phone right now.
      </p>
      <div id="diagBody">${skeletonRows(2)}</div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());

  const body = root.querySelector("#diagBody");
  let timer = null;

  function load() {
    api.getDriverStatus()
      .then((s) => { if (root.isConnected) body.innerHTML = diagHtml(s); })
      .catch((err) => {
        if (!root.isConnected) return;
        reportHandled(err, "driverDiagnostics");
        body.innerHTML = `<div class="empty-state"><p>Couldn't reach the server. Check your connection.</p></div>`;
      });
  }
  load();
  // A driver opens this WHILE fixing something — turning GPS back on, coming
  // out of a basement. Refreshing means they see it clear without knowing to
  // pull down.
  timer = setInterval(load, 10_000);
  return () => clearInterval(timer);
}

function diagHtml(s) {
  const ok = s.receivingJobs === true;
  const d = s.device || {};
  return `
    <div class="nx-owe ${ok ? "nx-owe-ok" : "nx-owe-blocked"} mb-4">
      <p class="nx-owe-label">Right now</p>
      <p class="nx-owe-title" style="font-size:18px;margin-top:6px;">
        ${ok ? "You're receiving jobs" : "You're not receiving jobs"}
      </p>
      ${ok ? `<p class="nx-owe-meta" style="margin-top:6px;">
                Everything checks out. If it stays quiet, it's demand, not your phone.
              </p>` : ""}
    </div>

    ${(s.blockers || []).length ? `
      <p class="nx-sec-title mb-2">What's stopping it</p>
      <div class="flex-col gap-2 mb-4">
        ${s.blockers.map((b) => `
          <div class="nx-action-row danger">
            <div><p class="text-sm" style="font-weight:600;">${esc(b)}</p></div>
          </div>`).join("")}
      </div>` : ""}

    <p class="nx-sec-title mb-2">Your device</p>
    <div class="flex-col gap-1">
      ${diagRow("Location last received", fmtAgo(d.lastFixSecondsAgo), agoTone(d.lastFixSecondsAgo, 180))}
      ${diagRow("App last checked in", fmtAgo(d.lastHeartbeatSecondsAgo), agoTone(d.lastHeartbeatSecondsAgo, 60))}
      ${diagRow("Battery", d.batteryLevel == null ? "Unknown" : `${d.batteryLevel}%`,
                d.batteryLevel != null && d.batteryLevel < 15 ? "warn" : "ok")}
      ${diagRow("Network", d.networkType ? String(d.networkType).toUpperCase() : "Unknown", "ok")}
      ${diagRow("App version", d.appVersion || "Unknown", "ok")}
    </div>

    <div class="nx-action-row info mt-4">
      <div>
        <p class="font-bold text-sm">If your location keeps going stale</p>
        <p class="text-xs text-secondary" style="margin-top:3px;">
          Xiaomi, Redmi, Oppo, Realme and Vivo phones stop background apps to
          save battery. In Settings, find Nova Go and allow it to run in the
          background and use location "always". Keep the app open while you
          ride until that's done.
        </p>
      </div>
    </div>
  `;
}

function diagRow(label, value, tone) {
  const colour = tone === "bad" ? "var(--error)" : tone === "warn" ? "var(--warning)" : "var(--text-primary)";
  return `
    <div class="list-row" style="min-height:48px;">
      <p class="text-sm" style="flex:1;">${esc(label)}</p>
      <p class="font-bold text-sm" style="color:${colour};" dir="ltr">${esc(value)}</p>
    </div>`;
}

/** Seconds since something last happened, in words a driver reads at a glance. */
function fmtAgo(seconds) {
  if (seconds == null) return "Never";
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.round(seconds / 60);
  return mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} hr ago`;
}

/** Amber before the server actually gives up, so a driver can act on a
 *  problem rather than only being told after it has cost them a job. */
function agoTone(seconds, staleAfter) {
  if (seconds == null) return "bad";
  if (seconds > staleAfter) return "bad";
  if (seconds > staleAfter * 0.6) return "warn";
  return "ok";
}

/**
 * What the star on a driver's profile is actually made of.
 *
 * The average was written to User.rating and displayed as a single number
 * with nothing behind it. A rider could see they were a 4.6 and never learn
 * that three people had written "kept me waiting" — a score with no reasons
 * attached cannot be acted on, which makes it decoration rather than
 * feedback.
 *
 * The breakdown is here for the same reason: 4.6 from forty ratings and 4.6
 * from two are different facts, and one bad night looks very different
 * depending on which one you are.
 */
export function renderDriverReviews(root) {
  root.innerHTML = `
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-1">Your rating</h1>
      <p class="text-secondary text-sm mb-5">What passengers said after their ride.</p>
      <div id="wrap">${skeletonRows(3)}</div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => navigate("/driver/profile"));

  let cancelled = false;
  api.myRatings()
    .then((d) => {
      if (cancelled) return;
      const total = Number(d?.total || 0);
      const avg = d?.average;
      const max = Math.max(1, ...(d?.breakdown || []).map((b) => b.count));

      root.querySelector("#wrap").innerHTML = total === 0
        ? `<div class="empty-state">
             <div class="icon">${icon("star", 30)}</div>
             <p>No ratings yet.</p>
             <p class="text-xs text-muted mt-1">Your first few rides decide this, so they are worth taking slowly.</p>
           </div>`
        : `
        <div class="nx-rating-hero mb-4">
          <span class="nx-rating-avg">${esc(String(avg ?? "—"))}</span>
          <span class="nx-rating-stars">${[1,2,3,4,5].map((i) =>
            `<span class="${avg != null && i <= Math.round(avg) ? "on" : ""}">${icon("star", 15)}</span>`).join("")}</span>
          <span class="nx-rating-count">${total} rating${total === 1 ? "" : "s"}</span>
        </div>

        <div class="nx-rating-bars mb-5">
          ${(d.breakdown || []).map((b) => `
            <div class="nx-rating-row">
              <span class="nx-rating-star">${b.star}${icon("star", 11)}</span>
              <span class="nx-rating-track"><span class="nx-rating-fill" style="width:${Math.round((b.count / max) * 100)}%;"></span></span>
              <span class="nx-rating-num">${b.count}</span>
            </div>`).join("")}
        </div>

        ${(d.reviews || []).length ? `
          <h3 class="nx-sec-title mb-3">What they wrote</h3>
          <div class="flex-col gap-2">
            ${d.reviews.map((r) => `
              <div class="card">
                <div class="flex items-center gap-2 mb-1">
                  <span class="nx-rating-inline">${[1,2,3,4,5].map((i) =>
                    `<span class="${i <= r.score ? "on" : ""}">${icon("star", 11)}</span>`).join("")}</span>
                  <span class="text-xs text-muted">${fmtDate(r.createdAt)}</span>
                </div>
                <p class="text-sm">${esc(r.comment)}</p>
              </div>`).join("")}
          </div>
        ` : `<p class="text-xs text-muted">Nobody has written a comment yet — just stars.</p>`}
      `;
    })
    .catch(() => {
      if (!cancelled) root.querySelector("#wrap").innerHTML =
        `<div class="empty-state"><p class="text-sm">Couldn't load your ratings.</p></div>`;
    });

  return () => { cancelled = true; };
}
