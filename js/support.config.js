// Nova Go — support contact details and the commercial terms shown in-app.
//
// ONE place to change these. They appear on the customer support screen, the
// driver earnings explainer, the merchant commission explainer and the legal
// pages, so a number changed here changes everywhere.
//
// ⚠️ REPLACE THE PLACEHOLDERS BEFORE LAUNCH. A support screen with a fake
// number is worse than no support screen — people will call it.

export const SUPPORT = {
  // ⚠️ ALL FOUR MUST BE REAL BEFORE PUBLIC LAUNCH.
  // Until they are, every live-contact button hides itself automatically
  // (see the placeholder guard below) and the ops dashboard shows a blocker.

  // Digits only, with country code, no + or spaces — this is what wa.me needs.
  // Use a WhatsApp BUSINESS account, not a personal one: you need the away
  // messages, quick replies and the ability to hand the number to whoever is
  // on the ops desk without handing over someone's personal WhatsApp.
  whatsapp: "923000000000",       // TODO: your real WhatsApp Business number

  // The number a customer or driver calls when something is wrong. It must
  // be answered by a human during operating hours — an unanswered support
  // line does more damage than no number at all.
  phone: "+92 300 0000000",       // TODO: display format for tel: links

  email: "support@novago.pk",      // TODO: your real support inbox

  // Escalation: the number ops staff call when a ride goes badly wrong —
  // an accident, a safety incident, a driver who won't respond. NOT shown
  // to customers. This should reach you or whoever owns the pilot,
  // 24 hours a day, for as long as rides are running.
  opsEscalation: "",              // TODO: your own number

  // Must match HOURS in js/launch.config.js — don't advertise cover you
  // aren't providing.
  hours: "8am – 10pm, every day",
};

/* ---------------------------------------------------------------------------
   Placeholder guard.

   The danger with TODO contact details isn't that they're missing — it's that
   they LOOK real. A "Chat on WhatsApp" button wired to 923000000000 sends a
   stranded customer to a number that either doesn't exist or belongs to some
   unrelated person. That's worse than showing no button at all.

   So rather than trusting whoever deploys to remember, the app detects
   unconfigured values and every support surface degrades on its own: live
   channels disappear, the in-app ticket form (which always works, because it
   posts to your own backend) becomes the primary path, and a loud warning
   prints to the console for whoever is testing.

   Fill in the four values above and every channel switches itself back on.
   Nothing else needs editing.
   --------------------------------------------------------------------------- */

const PLACEHOLDERS = {
  whatsapp: [/^92300{0,1}0{6,}$/, /^0+$/, /^$/],
  phone: [/0{6,}/, /^$/],
  email: [/^support@novago\.pk$/i, /example\.com$/i, /^$/],
};

function isPlaceholder(field) {
  const value = String(SUPPORT[field] ?? "").replace(/[\s\-()+]/g, "");
  return (PLACEHOLDERS[field] || []).some((re) => re.test(value));
}

/** Which live channels are safe to show a real user right now. */
export const SUPPORT_STATUS = {
  whatsapp: !isPlaceholder("whatsapp"),
  phone: !isPlaceholder("phone"),
  email: !isPlaceholder("email"),
  // Internal only — never rendered to a customer, but a launch blocker,
  // because "who do we call at 11pm when a rider has an accident" needs an
  // answer before the first ride, not after the first incident.
  opsEscalation: !!String(SUPPORT.opsEscalation || "").replace(/[\s\-()+]/g, ""),
};

SUPPORT_STATUS.anyLive =
  SUPPORT_STATUS.whatsapp || SUPPORT_STATUS.phone || SUPPORT_STATUS.email;
SUPPORT_STATUS.configured = SUPPORT_STATUS.whatsapp && SUPPORT_STATUS.phone && SUPPORT_STATUS.email;

if (!SUPPORT_STATUS.configured && typeof console !== "undefined") {
  const missing = ["whatsapp", "phone", "email"].filter((k) => !SUPPORT_STATUS[k]);
  console.warn(
    `[NovaGo] Support contacts not configured: ${missing.join(", ")}. ` +
      `Those buttons are hidden from users until you set real values in js/support.config.js. ` +
      `The in-app ticket form still works.`,
  );
}

/**
 * WhatsApp deep link, or null when unconfigured.
 * Callers MUST handle null by not rendering the button — that's the whole
 * point. `whatsappLink() && renderButton()` is the pattern.
 */
export function whatsappLink(prefillText = "") {
  if (!SUPPORT_STATUS.whatsapp) return null;
  const t = prefillText ? `?text=${encodeURIComponent(prefillText)}` : "";
  return `https://wa.me/${SUPPORT.whatsapp}${t}`;
}

/** tel: link, or null when unconfigured. */
export function phoneLink() {
  if (!SUPPORT_STATUS.phone) return null;
  return `tel:${SUPPORT.phone.replace(/[\s()-]/g, "")}`;
}

/** mailto: link, or null when unconfigured. */
export function emailLink(subject = "Nova Go support") {
  if (!SUPPORT_STATUS.email) return null;
  return `mailto:${SUPPORT.email}?subject=${encodeURIComponent(subject)}`;
}

// The commercial terms. Kept here rather than hardcoded into screens so the
// number a driver sees always matches the number the backend charges
// (COMMISSION_RATE in commission.util.ts) — if you change one, change both.
export const COMMERCIALS = {
  driverCommissionPct: 15,     // platform cut of ride/parcel fares
  foodDeliveryFeePct: 15,      // platform cut of the delivery fee
  restaurantCommissionPct: 20, // platform cut of the food subtotal
  payoutSchedule: "every Monday",
  referral: {
    riderReward: 100,   // loyalty points for the referrer
    friendReward: 100,  // loyalty points for the new user
  },
};
