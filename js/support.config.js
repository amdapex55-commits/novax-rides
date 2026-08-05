// Nova X — support contact details and the commercial terms shown in-app.
//
// ONE place to change these. They appear on the customer support screen, the
// driver earnings explainer, the merchant commission explainer and the legal
// pages, so a number changed here changes everywhere.
//
// ⚠️ REPLACE THE PLACEHOLDERS BEFORE LAUNCH. A support screen with a fake
// number is worse than no support screen — people will call it.

export const SUPPORT = {
  // Digits only, with country code, no + or spaces — this is what wa.me needs.
  whatsapp: "923000000000",       // TODO: your real WhatsApp business number
  phone: "+92 300 0000000",       // TODO: display format for tel: links
  email: "support@novax.pk",      // TODO: your real support inbox
  hours: "8am – 11pm, every day", // TODO: when someone actually answers
};

export function whatsappLink(prefillText = "") {
  const t = prefillText ? `?text=${encodeURIComponent(prefillText)}` : "";
  return `https://wa.me/${SUPPORT.whatsapp}${t}`;
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
