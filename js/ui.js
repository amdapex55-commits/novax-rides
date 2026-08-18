// Nova Go Rides — shared UI helpers used across every view: toast, bottom
// sheet, confetti burst, count-up numbers, skeleton loaders.

/* --------------------------------------------------------------------------
   TELLING SOMEONE SOMETHING WENT WRONG

   The old toast sat at the bottom of the screen, above the nav, said one
   short line and vanished after three seconds. Three problems with that on a
   booking flow: it appears where the thumb already is (so it gets covered),
   it says what failed without saying what to do, and three seconds is not
   long enough to read a sentence you did not expect.

   alertUser() replaces it. It comes in at the TOP, where nothing is
   obscuring it, it carries a suggestion as well as a problem, and it holds
   for longer the more there is to read. Identical messages collapse instead
   of stacking up — a button pressed three times should not produce three
   notices.

   It is deliberately synchronous and does no work before painting: an error
   that arrives 300ms after the tap reads as a second, unrelated failure.
   -------------------------------------------------------------------------- */

const ALERT_TONES = { error: "error", warn: "warn", success: "success", info: "info" };
let alertStack = [];
// Lets the action button reach the entry that is created after the markup.
const entryRef = { current: null };

export function alertUser(problem, options = {}) {
  const { suggestion = "", tone = "error", timeout, action = null } = options;
  const key = `${tone}:${problem}:${suggestion}`;

  // Same message already up: restart its clock rather than stacking a copy.
  const existing = alertStack.find((a) => a.key === key);
  if (existing) {
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => dismissAlert(existing), holdFor(problem, suggestion, timeout));
    existing.el.classList.remove("nx-alert-nudge");
    void existing.el.offsetWidth; // restart the nudge animation
    existing.el.classList.add("nx-alert-nudge");
    return;
  }

  const host = alertHost();
  const el = document.createElement("div");
  el.className = `nx-alert ${ALERT_TONES[tone] || "error"}`;
  // assertive for errors: a blocked action is worth interrupting a screen
  // reader for. Everything else waits its turn.
  el.setAttribute("role", tone === "error" ? "alert" : "status");
  el.innerHTML = `
    <span class="nx-alert-bar" aria-hidden="true"></span>
    <span class="nx-alert-body">
      <span class="nx-alert-problem"></span>
      ${suggestion ? '<span class="nx-alert-suggestion"></span>' : ""}
      ${action ? '<button class="nx-alert-action"></button>' : ""}
    </span>
    <button class="nx-alert-close" aria-label="Dismiss">&times;</button>
  `;
  el.querySelector(".nx-alert-problem").textContent = problem;
  if (suggestion) el.querySelector(".nx-alert-suggestion").textContent = suggestion;
  /* An alert that names a way out should offer it. Telling someone they
     already have a ride in progress is only half the message — the half that
     helps is the button that opens it. textContent, because the label is
     caller-supplied. */
  if (action) {
    const btn = el.querySelector(".nx-alert-action");
    btn.textContent = action.label || "Open";
    btn.addEventListener("click", () => {
      dismissAlert(entryRef.current);
      try { action.onClick?.(); } catch (err) { console.warn("[NovaGo] alert action failed:", err); }
    });
  }

  host.appendChild(el);
  const entry = { key, el, timer: null };
  entryRef.current = entry;
  alertStack.push(entry);

  el.querySelector(".nx-alert-close").addEventListener("click", () => dismissAlert(entry));
  requestAnimationFrame(() => el.classList.add("show"));
  entry.timer = setTimeout(() => dismissAlert(entry), holdFor(problem, suggestion, timeout));

  // More than three on screen is noise, not information.
  while (alertStack.length > 3) dismissAlert(alertStack[0]);
}

/** Reading time, floored at 3.5s and capped at 9s. */
function holdFor(problem, suggestion, override) {
  if (override) return override;
  const words = `${problem} ${suggestion}`.trim().split(/\s+/).length;
  return Math.min(9000, Math.max(3500, words * 320));
}

function dismissAlert(entry) {
  if (!entry || !entry.el.isConnected) return;
  clearTimeout(entry.timer);
  alertStack = alertStack.filter((a) => a !== entry);
  entry.el.classList.remove("show");
  setTimeout(() => entry.el.remove(), 260);
}

function alertHost() {
  let host = document.getElementById("nxAlerts");
  if (!host) {
    host = document.createElement("div");
    host.id = "nxAlerts";
    host.className = "nx-alert-host";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  return host;
}

/**
 * Marks the offending field, focuses it, and explains what to do.
 * The focus matters more than it looks: on a phone it scrolls the field into
 * view and opens the keyboard, so the fix is one tap away instead of a hunt.
 */
export function alertField(el, problem, suggestion) {
  if (el) {
    el.classList.add("is-invalid");
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.addEventListener("input", () => el.classList.remove("is-invalid"), { once: true });
  }
  alertUser(problem, { suggestion, tone: "error" });
}

/* Kept because a lot of screens already call it. Success and neutral notes
   still read fine at the top, so it simply forwards. */
export function toast(msg, isError = false) {
  alertUser(msg, { tone: isError ? "error" : "success" });
}

export function openSheet(sheetEl, overlayEl) {
  overlayEl.classList.add("open");
  sheetEl.classList.add("open");
}
export function closeSheet(sheetEl, overlayEl) {
  overlayEl.classList.remove("open");
  sheetEl.classList.remove("open");
}

const CONFETTI_COLORS = ["#6d28d9", "#e2960a", "#7c3aed", "#d97706", "#0e1d16"];
export function confettiBurst(x, y, count = 26) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 100;
    const x1 = Math.cos(angle) * dist;
    const y1 = Math.sin(angle) * dist - 40;
    p.style.setProperty("--x0", "0px");
    p.style.setProperty("--y0", "0px");
    p.style.setProperty("--x1", `${x1}px`);
    p.style.setProperty("--y1", `${y1}px`);
    p.style.setProperty("--rot", `${Math.round(Math.random() * 360)}deg`);
    p.style.setProperty("--dur", `${700 + Math.random() * 500}ms`);
    document.body.appendChild(p);
    requestAnimationFrame(() => p.classList.add("fall"));
    p.addEventListener("animationend", () => p.remove());
  }
}

export function countUp(el, target, { prefix = "", suffix = "", decimals = 0, duration = 900 } = {}) {
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = target * eased;
    el.textContent = prefix + current.toLocaleString("en-PK", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    if (t < 1) requestAnimationFrame(frame);
    else {
      el.textContent = prefix + target.toLocaleString("en-PK", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
      el.classList.add("count-pulse");
    }
  }
  requestAnimationFrame(frame);
}

/**
 * Loading placeholders.
 *
 * A skeleton beats a spinner because it says what is coming — "three rows,
 * each with an icon and two lines" — so the eye has somewhere to be while
 * the network works. A spinner says only "wait", and the same wait measured
 * against a spinner feels longer.
 *
 * The shapes below deliberately mirror .list-row, so nothing jumps when the
 * real content replaces them. That is the half people skip, and it is the
 * half that makes the difference: a skeleton of the wrong shape produces a
 * layout shift, which feels worse than having shown nothing.
 */
export function skeletonRows(n = 3) {
  return Array.from({ length: n })
    .map(
      () => `
      <div class="list-row" style="pointer-events:none;">
        <div class="nx-skel" style="width:38px;height:38px;border-radius:12px;flex:none;"></div>
        <div style="flex:1;min-width:0;">
          <div class="nx-skel nx-skel-line w-60"></div>
          <div class="nx-skel nx-skel-line w-40" style="margin-bottom:0;"></div>
        </div>
      </div>`,
    )
    .join("");
}

/** Placeholder for the home screen's service grid. */
export function skeletonTiles(n = 3) {
  return `<div class="nx-tiles">${Array.from({ length: n })
    .map(() => `<div class="nx-skel nx-skel-tile"></div>`)
    .join("")}</div>`;
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Escape anything that came from the backend before it goes into innerHTML.
//
// Every view in this app renders with template literals + innerHTML, so any
// server-supplied string (a restaurant name, a menu item description, an
// order note, a user's own name/phone in the admin console) is live HTML by
// default. A restaurant owner typing a <script> tag into their own store
// name would otherwise run code in the admin's browser — and since JWTs live
// in localStorage, that means stolen sessions, not just a broken layout.
//
// Use on EVERY interpolation of backend/user data. Numbers, ids we generate,
// and our own static strings don't need it, but escaping them is harmless.
export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * A sheet docked over a map whose CONTENT swaps as a flow advances —
 * the pattern every ride app uses (set route → pick vehicle → confirm →
 * tracking) instead of pushing a new full screen for each step.
 *
 * Returns { el, step(html), onMount(fn) }; each step() animates in.
 */
/**
 * The bottom sheet that docks over the booking map.
 *
 * THE HANDLE USED TO BE A LIE. It rendered a grab bar — the universal "drag
 * me" affordance — with no drag logic behind it, while the sheet capped at
 * 82% and scrolled internally. On a phone that put the Confirm button below
 * the fold of a nested scroll container nobody could see, on the one screen
 * where the whole point is to press it. People pulled the handle, nothing
 * moved, and the booking looked broken.
 *
 * Now the handle does what it looks like it does: drag it, or tap it, and the
 * sheet expands to full height or collapses back to its natural size.
 */
export function dockSheet(container) {
  const el = document.createElement("div");
  el.className = "dock-sheet";
  el.innerHTML = `
    <button class="sheet-handle" type="button"
            aria-label="Expand or collapse" aria-expanded="false"></button>
    <div class="sheet-body"></div>`;
  container.appendChild(el);

  const body = el.querySelector(".sheet-body");
  const handle = el.querySelector(".sheet-handle");
  let expanded = false;

  function setExpanded(next) {
    expanded = next;
    el.classList.toggle("is-expanded", expanded);
    handle.setAttribute("aria-expanded", String(expanded));
  }

  handle.addEventListener("click", (e) => {
    // A click that ends a drag is not a tap. Without this every drag also
    // toggled the sheet, so a careful pull down snapped straight back up.
    if (el.dataset.dragged === "1") { e.preventDefault(); return; }
    setExpanded(!expanded);
  });

  /* ------------------------------------------------------------------
     THE DRAG.

     What was here before only listened on the handle — a 28px strip — and
     only for touch events, and it did not follow the finger: it waited for
     28px of movement and then jumped to a state. So on the booking screen
     the sheet appeared stuck. There was nothing to grab and nothing moved
     while you pulled.

     Now the whole sheet is draggable, it tracks the pointer one-to-one, and
     it lets go based on where you release AND how fast you were going — a
     short fast flick should close it, a long slow drag that ends high should
     not.

     Two things it deliberately refuses to do:

       - It will not start a downward drag while the body is scrolled, or the
         gesture that scrolls a long fare breakdown back to the top would
         throw the sheet off the bottom of the screen instead.
       - It ignores gestures that are mostly horizontal, because that is the
         map being panned underneath.
     ------------------------------------------------------------------ */
  const CLOSE_AFTER_PX = 110;   // pull past this and it collapses
  const OPEN_AFTER_PX = 70;     // push up past this and it expands
  const FLICK_VELOCITY = 0.45;  // px/ms — a decisive throw

  let dragging = false;
  let startY = 0;
  let startX = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let decided = false;   // committed to a vertical drag
  let offset = 0;

  const isInteractive = (t) =>
    t.closest("input, textarea, select, button:not(.sheet-handle), a, [contenteditable]");

  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Let people use the controls inside the sheet. The handle is the one
    // button that IS a drag surface.
    if (isInteractive(e.target) && !e.target.closest(".sheet-handle")) return;
    dragging = true;
    decided = false;
    offset = 0;
    startY = lastY = e.clientY;
    startX = e.clientX;
    lastT = e.timeStamp;
    velocity = 0;
    delete el.dataset.dragged;
  });

  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    const dx = e.clientX - startX;

    if (!decided) {
      if (Math.abs(dy) < 6) return;              // still a tap
      if (Math.abs(dx) > Math.abs(dy)) {         // panning the map
        dragging = false;
        return;
      }
      // Pulling down while the content is scrolled belongs to the scroll.
      if (dy > 0 && el.scrollTop > 0) { dragging = false; return; }
      decided = true;
      el.classList.add("is-dragging");
      el.setPointerCapture?.(e.pointerId);
    }

    const dt = Math.max(1, e.timeStamp - lastT);
    velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY;
    lastT = e.timeStamp;

    // Resisting upward movement when already expanded stops the sheet being
    // dragged off the top of its own container.
    offset = dy < 0 && expanded ? dy * 0.25 : dy;
    if (offset < 0 && !expanded) offset = dy * 0.6; // opening has a little weight
    el.style.transform = `translateY(${offset}px)`;
    el.dataset.dragged = "1";
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    el.classList.remove("is-dragging");
    el.style.transform = "";

    if (!decided) return;
    const flickedDown = velocity > FLICK_VELOCITY;
    const flickedUp = velocity < -FLICK_VELOCITY;

    if (expanded) {
      if (flickedDown || offset > CLOSE_AFTER_PX) setExpanded(false);
    } else if (flickedUp || offset < -OPEN_AFTER_PX) {
      setExpanded(true);
    }
    // The click handler reads this, then the next pointerdown clears it.
    setTimeout(() => { delete el.dataset.dragged; }, 0);
  }

  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);

  return {
    el,
    /** Replace the sheet's contents and return the new node so the caller
     * can wire its buttons. */
    step(html) {
      body.innerHTML = `<div class="sheet-step">${html}</div>`;
      // A new step is new content of a new length — start it scrolled to the
      // top rather than wherever the previous step happened to be left.
      el.scrollTop = 0;
      return body.firstElementChild;
    },
    expand() { setExpanded(true); },
    collapse() { setExpanded(false); },
    height() {
      return el.getBoundingClientRect().height;
    },
  };
}

/** Person card used on every active job: who you're dealing with, proof
 * they're vetted, and how to reach them. Trust beats decoration. */
/**
 * Who is picking you up.
 *
 * WHY THIS IS THE MOST IMPORTANT COMPONENT IN THE APP
 *
 * In Karachi the decision to get on the back of a stranger's motorcycle is
 * the actual product risk — more than price, more than wait time, and by a
 * long way the thing that stops women and families using this category at
 * all. Bykea's answer is a line of copy: "all partners background checked".
 * Copy is free, so copy is not evidence, and their own review pages are full
 * of people saying they did not believe it.
 *
 * We verify CNIC and licence against the original document, by a person,
 * before a rider can go online. That is a genuinely stronger position than
 * the market leader's, and it was being spent on an 11px grey "✓ Verified"
 * next to the name. This renders it as evidence instead:
 *
 *   - the tick sits ON the avatar, so it reads as "this person is verified"
 *     rather than "this app has a badge somewhere"
 *   - the plate is drawn as a plate, because that is the object the customer
 *     is about to look for in traffic
 *   - completed trips are shown, because experience answers the question a
 *     star rating cannot: a rider with one 5-star trip outranks one with two
 *     hundred 4.8s, and everybody knows it
 *
 * Every field is optional and each one is omitted rather than faked when it
 * is missing. A placeholder "0 trips" or a fake photo would do more damage
 * than the empty space it fills.
 */
export function trustCard({
  name,
  subtitle,
  rating,
  plate,
  verified = true,
  initial,
  tripCount = null,
  photoUrl = null,
  compact = false,
}) {
  const safeName = esc(name || "Your driver");
  const letter = esc(initial || (name ? name.charAt(0).toUpperCase() : "N"));

  // Compact keeps the old single-row shape for places that only need to say
  // who the other party is — the driver app's view of a passenger, the
  // read-only shared-trip page.
  if (compact) {
    return `
      <div class="trust-row">
        <div class="trust-avatar">${letter}</div>
        <div style="flex:1; min-width:0;">
          <div class="flex items-center gap-2" style="flex-wrap:wrap;">
            <p class="font-bold">${safeName}</p>
            ${verified ? `<span class="verified-badge">✓ Verified</span>` : ""}
          </div>
          <p class="text-secondary text-xs mt-1">
            ${rating != null ? `★ ${Number(rating).toFixed(1)}` : ""}${rating != null && subtitle ? " · " : ""}${esc(subtitle || "")}
          </p>
        </div>
        ${plate ? `<span class="plate-chip">${esc(plate)}</span>` : ""}
      </div>
    `;
  }

  const stats = [];
  if (rating != null) stats.push({ v: `★ ${Number(rating).toFixed(1)}`, k: "Rating" });
  // Below about 10 trips the number argues against the rider rather than for
  // them, and a new rider is not less verified — they are just new. Showing
  // "Verified" as the third stat is true and does not undersell them.
  if (tripCount != null && tripCount >= 10) {
    stats.push({ v: tripCount >= 1000 ? `${(tripCount / 1000).toFixed(1)}k` : String(tripCount), k: "Trips" });
  }
  if (verified) stats.push({ v: "CNIC", k: "Checked" });

  return `
    <div class="nx-driver-card">
      <div class="nx-driver-top">
        <div class="nx-driver-avatar">
          ${photoUrl ? `<img src="${esc(photoUrl)}" alt="" loading="lazy"/>` : letter}
          ${verified ? `<span class="nx-driver-tick" title="Verified by Nova Go">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"
                 stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
          </span>` : ""}
        </div>
        <div style="flex:1; min-width:0;">
          <p class="nx-driver-name">${safeName}</p>
          <p class="nx-driver-meta">${esc(subtitle || "")}</p>
          ${verified ? `<span class="nx-verify-seal" style="margin-top:6px;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
                 stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
            Verified by Nova Go
          </span>` : ""}
        </div>
        ${plate ? `<span class="nx-plate">${esc(plate)}</span>` : ""}
      </div>
      ${stats.length ? `
        <div class="nx-trust-stats">
          ${stats.map((st) => `
            <div class="nx-trust-stat">
              <div class="nx-trust-stat-value">${esc(st.v)}</div>
              <div class="nx-trust-stat-label">${esc(st.k)}</div>
            </div>`).join("")}
        </div>` : ""}
    </div>
  `;
}

/** Empty state that reads as "early", not "broken". */
export function emptyRich({ icon: iconHtml = "", title, body, actionLabel, actionId }) {
  return `
    <div class="empty-rich">
      ${iconHtml ? `<div class="icon-wrap">${iconHtml}</div>` : ""}
      <p class="font-bold" style="color:var(--text-primary);">${esc(title)}</p>
      <p class="text-secondary text-sm mt-2">${esc(body)}</p>
      ${actionLabel ? `<button id="${actionId}" class="btn btn-secondary btn-sm mt-4" style="display:inline-flex;">${esc(actionLabel)}</button>` : ""}
    </div>
  `;
}

export function fmtMoney(n) {
  return "Rs. " + Number(n || 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(d) {
  return new Date(d).toLocaleString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function e164(local) {
  let digits = (local || "").replace(/\D/g, "");
  digits = digits.replace(/^0+/, "");
  if (digits.startsWith("92")) return "+" + digits;
  return "+92" + digits;
}


/* ---------------------------------------------------------------------------
   CONTACT SHEET

   A bare `tel:` link is inert on a desktop browser and, on a phone, jumps
   straight into the dialer with no chance to see the number or pick WhatsApp
   — which in Karachi is very often the one people actually use.

   This shows the number, then offers the two things someone might want to do
   with it, plus a copy for the case where they want to dial it themselves.
   --------------------------------------------------------------------------- */
export function contactSheet({ name, phone, role = "" }) {
  if (!phone) {
    alertUser(`We don't have a number for ${name || "them"}.`, {
      suggestion: "Message them in the app instead — it reaches the same person.",
      tone: "warn",
    });
    return;
  }
  const digits = String(phone).replace(/[^\d+]/g, "");
  const wa = digits.replace(/^\+/, "");

  const host = document.createElement("div");
  host.className = "nx-contact-scrim";
  host.innerHTML = `
    <div class="nx-contact" role="dialog" aria-label="Contact ${esc(name || "them")}">
      <p class="nx-contact-name">${esc(name || "Contact")}</p>
      ${role ? `<p class="nx-contact-role">${esc(role)}</p>` : ""}
      <p class="nx-contact-number">${esc(phone)}</p>
      <a class="btn btn-primary btn-block nx-contact-act" href="tel:${esc(digits)}">Call</a>
      <a class="btn btn-secondary btn-block nx-contact-act" href="https://wa.me/${esc(wa)}"
         target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <button class="nx-contact-copy" data-copy>Copy number</button>
      <button class="nx-contact-close" data-close>Close</button>
    </div>`;
  document.body.appendChild(host);
  requestAnimationFrame(() => host.classList.add("show"));

  const close = () => { host.classList.remove("show"); setTimeout(() => host.remove(), 200); };
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector("[data-close]").addEventListener("click", close);
  host.querySelector("[data-copy]").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(phone); toast("Number copied"); } catch { /* denied */ }
    close();
  });
  host.querySelectorAll(".nx-contact-act").forEach((a) => a.addEventListener("click", close));
}
