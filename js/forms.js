// Nova Go — field rules and the phone number problem.
//
// Every form in this app asks for a Pakistani mobile number, and people type
// it five different ways. The rule below accepts all of them rather than
// telling someone their own number is wrong:
//
//   0321 7654321   11 digits, leading zero      — how it is written on paper
//   321 7654321    10 digits, no zero           — how it is said out loud
//   +92 321 7654321 / 0092... / 92...           — how a contacts app stores it
//
// All of them are the same number and all of them normalise to +923217654321.
// Spaces and dashes are stripped before anything is judged, because a number
// pasted from WhatsApp arrives full of them.

/** Digits only, with the international prefixes peeled off. */
function localDigits(raw) {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  d = d.replace(/^\+92/, "").replace(/^0092/, "").replace(/^92(?=\d{10}$)/, "");
  d = d.replace(/^0/, ""); // 0321... -> 321...
  return d.replace(/\D/g, "");
}

/**
 * @returns {{ok: true, e164: string, local: string} | {ok: false, hint: string}}
 * The hint is written to be shown to the person as-is: it says what to do,
 * not what went wrong.
 */
export function normalisePkPhone(raw) {
  const entered = String(raw || "").trim();
  if (!entered) return { ok: false, hint: "Enter the mobile number — we need it to call about the delivery." };

  const d = localDigits(entered);
  if (!d) return { ok: false, hint: "That doesn't look like a number. Enter 11 digits, like 0321 7654321." };

  if (d.length < 10) {
    return { ok: false, hint: `That's ${d.length} digit${d.length === 1 ? "" : "s"} — a Pakistani mobile has 10 after the 0, like 0321 7654321.` };
  }
  if (d.length > 10) {
    return { ok: false, hint: "That's too long. Drop the country code and any extra digits — 0321 7654321." };
  }
  // Every Pakistani mobile network sits on 3xx. A landline pasted in here
  // reaches nobody on a delivery, so it is worth catching now rather than
  // when the rider is standing outside.
  if (!/^3/.test(d)) {
    return { ok: false, hint: "Pakistani mobile numbers start 03. Check the number — landlines can't receive delivery updates." };
  }
  return { ok: true, e164: `+92${d}`, local: d };
}

/** Formats as "321 7654321" for display in an input. */
export function formatPkPhone(raw) {
  const d = localDigits(raw).slice(0, 10);
  return d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
}

/* --------------------------------------------------------------------------
   FIELD RULES

   check() takes the fields a screen cannot proceed without and returns the
   FIRST problem, already paired with what to do about it. First, not all of
   them: a form that lights up five errors at once is a form that reads as
   broken, and the person can only fix one thing first anyway.
   -------------------------------------------------------------------------- */

export const required = (label, hint) => (v) =>
  String(v ?? "").trim() ? null : (hint || `${label} is needed to continue.`);

export const positiveNumber = (label, hint) => (v) => {
  const s = String(v ?? "").trim();
  if (!s) return hint || `${label} is needed to continue.`;
  const n = Number(s);
  if (!Number.isFinite(n)) return `${label} has to be a number.`;
  if (n <= 0) return `${label} has to be more than zero.`;
  return null;
};

export const maxNumber = (label, max, hint) => (v) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > max ? (hint || `${label} can't be more than ${max}.`) : null;
};

export const phone = () => (v) => {
  const res = normalisePkPhone(v);
  return res.ok ? null : res.hint;
};

/** Runs rules in order and stops at the first failure. */
export function checkField(value, rules) {
  for (const rule of rules) {
    const problem = rule(value);
    if (problem) return problem;
  }
  return null;
}

/**
 * @param {Array<{el: HTMLElement, rules: Function[]}>} fields
 * @returns {{el: HTMLElement, problem: string} | null}
 */
export function firstProblem(fields) {
  for (const f of fields) {
    if (!f.el) continue;
    const problem = checkField(f.el.value, f.rules);
    if (problem) return { el: f.el, problem };
  }
  return null;
}

/** Clears any invalid marks left from a previous attempt. */
export function clearInvalid(root) {
  root.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
}
