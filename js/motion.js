// Nova Go Rides — shared motion primitives.
//
// WHY THIS FILE EXISTS
//
// The app had 58 keyframes and still felt abrupt, because the motion was in
// the wrong places: things pulsed and drifted forever while the moments that
// actually change — a rider being found, a fare resolving, money landing in a
// wallet — swapped instantly with no transition at all. Ambient motion is
// decoration; a state change is information, and information deserves the
// motion budget.
//
// Every helper here honours prefers-reduced-motion by jumping straight to the
// final value. That is not a courtesy: motion sickness is real, and a value
// that animates is worthless if the person cannot look at it.

export const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Count a number up (or down) to its new value.
 *
 * Used for fares and wallet balances. A figure that swaps in place is a figure
 * nobody notices changed — a driver looking at their earnings after a trip
 * wants to SEE the money arrive, and a customer watching a fare resolve reads
 * a settling number as a quote being calculated rather than invented.
 *
 * @param {HTMLElement} el      target; its textContent is replaced
 * @param {number} to           final value
 * @param {object} [opts]
 * @param {number} [opts.from]  start value (defaults to whatever is on screen)
 * @param {number} [opts.duration] ms; scaled down for small deltas
 * @param {(n:number)=>string} [opts.format] renders each frame
 */
export function countTo(el, to, opts = {}) {
  if (!el) return;
  const format = opts.format || ((n) => String(Math.round(n)));
  const target = Number(to) || 0;

  if (reducedMotion()) { el.textContent = format(target); return; }

  const parsed = opts.from != null
    ? Number(opts.from)
    : Number(String(el.textContent || "").replace(/[^0-9.-]/g, ""));
  const from = Number.isFinite(parsed) ? parsed : 0;
  if (from === target) { el.textContent = format(target); return; }

  /* Short counts for small changes. Counting Rs 4 over 900ms looks broken;
     counting Rs 4,000 over 200ms is unreadable. */
  const delta = Math.abs(target - from);
  const duration = opts.duration ?? Math.min(900, Math.max(260, delta * 2.2));
  const start = performance.now();

  // Cancel any count already running on this element, or two rAF loops fight
  // over the same textContent and the number visibly stutters.
  if (el._nxCount) cancelAnimationFrame(el._nxCount);

  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    // easeOutCubic: fast enough to feel responsive, settles rather than stops.
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = format(from + (target - from) * eased);
    if (p < 1) el._nxCount = requestAnimationFrame(tick);
    else { el._nxCount = null; el.textContent = format(target); }
  };
  el._nxCount = requestAnimationFrame(tick);
}

/**
 * Replace an element's text with a cross-fade and a small rise.
 *
 * For status lines that change under the reader — "Rider on the way" becoming
 * "Rider has arrived". An instant swap is easy to miss when you glance away,
 * and re-reading a sentence to work out whether it changed is exactly the
 * cost this removes. No-ops when the text is identical, so a poll delivering
 * the same status eight seconds apart does not flicker.
 */
export function swapText(el, next) {
  if (!el) return;
  const text = String(next ?? "");
  if (el.textContent === text) return;
  if (reducedMotion()) { el.textContent = text; return; }

  el.classList.remove("nx-swap-in");
  // Force a reflow so re-adding the class restarts the animation even when
  // the status changes twice inside one frame.
  void el.offsetWidth;
  el.textContent = text;
  el.classList.add("nx-swap-in");
}

/**
 * Play an entrance on an element that has just appeared.
 * Returns immediately under reduced motion, leaving the element visible.
 */
export function revealIn(el, className = "nx-reveal", { delay = 0 } = {}) {
  if (!el || reducedMotion()) return;
  el.classList.remove(className);
  void el.offsetWidth;
  if (delay) el.style.animationDelay = `${delay}ms`;
  el.classList.add(className);
}
