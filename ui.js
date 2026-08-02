// Nova X Rides — shared UI helpers used across every view: toast, bottom
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

const CONFETTI_COLORS = ["#23d68a", "#ffb648", "#2ee6a6", "#ffb547", "#f2f7f4"];
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
