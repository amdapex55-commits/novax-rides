// Nova Go Rides — shared UI helpers used across every view: toast, bottom
// sheet, confetti burst, count-up numbers, skeleton loaders.

export function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3000);
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

export function skeletonRows(n = 3) {
  return Array.from({ length: n })
    .map(() => `<div class="skeleton" style="height:64px;margin-bottom:12px;"></div>`)
    .join("");
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

  handle.addEventListener("click", () => setExpanded(!expanded));

  /* Drag. Deliberately vertical-only and threshold-based: a small movement is
     a tap, and a horizontal one is the map being panned, not the sheet being
     dragged. */
  let startY = null;
  handle.addEventListener("touchstart", (e) => { startY = e.touches[0].clientY; }, { passive: true });
  handle.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < -28 && !expanded) { setExpanded(true); startY = null; }
    else if (dy > 28 && expanded) { setExpanded(false); startY = null; }
  }, { passive: true });
  handle.addEventListener("touchend", () => { startY = null; }, { passive: true });

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
export function trustCard({ name, subtitle, rating, plate, verified = true, initial }) {
  const safeName = esc(name || "Your driver");
  const letter = esc(initial || (name ? name.charAt(0).toUpperCase() : "N"));
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
