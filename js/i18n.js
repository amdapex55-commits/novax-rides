// Nova Go — English / Urdu.
//
// WHY ENGLISH STRINGS ARE THE KEYS
//
// The usual approach is symbolic keys ("home.cta.book"). That is the better
// design for a project that starts bilingual. This one did not: there are
// ~30 view files with English written directly into template literals, and
// converting them to symbolic keys means touching every line and having a
// missing key render as "home.cta.book" on someone's phone.
//
// So the English string IS the key. Two consequences, both of which we want:
//
//   1. An untranslated string falls back to itself. A missed line renders in
//      English — imperfect, but readable — instead of rendering as a broken
//      identifier. With a launch this close, that failure mode matters more
//      than the tidier one.
//   2. Adding Urdu is additive. Nothing breaks by being absent.
//
// WHY THERE IS NO NASTALIQ WEBFONT
//
// Jameel Noori Nastaleeq and Noto Nastaliq Urdu are 200KB+ each. Point 9 of
// the same review this work came from is that the app is too heavy for the
// Tecno/Infinix hardware most Karachi riders carry — shipping a third font to
// fix localisation would take back what that fix gains. Both iOS and Android
// ship Urdu system faces (Noto Nastaliq Urdu on iOS, Noto Naskh Arabic on
// Android), so the stack below costs nothing and renders correctly on a real
// phone. If a Nastaliq webfont is wanted later it belongs behind a lazy load
// on the Urdu path only, never in the default bundle.
//
// URDU IS RIGHT-TO-LEFT
//
// setLang flips document.dir, and the app CSS was converted to logical
// properties (padding-inline-start rather than padding-left) so the layout
// mirrors on its own. Numbers, money and phone numbers stay LTR — Urdu uses
// Western digits in this context, and a mirrored phone number is unusable.

const KEY = "novago.lang";
export const LANGS = { en: "English", ur: "اردو" };
export const RTL_LANGS = ["ur"];

/* Ordered by how often a first-time customer meets the string, not
   alphabetically — the booking path is translated to the end, settings and
   legal are deliberately still English because a mistranslated cancellation
   policy is worse than an English one. */
const UR = {
  // --- shell / nav ---
  "Home": "ہوم",
  "Rides": "سفر",
  "Trips": "سفر",
  "Account": "اکاؤنٹ",
  "Wallet": "والٹ",
  "Earnings": "کمائی",
  "Support": "مدد",
  "Orders": "آرڈرز",
  "Help": "مدد",
  "Profile": "پروفائل",
  "Alerts": "اطلاعات",
  "New": "نیا",
  "Soon": "جلد",

  // --- greeting ---
  "Good morning": "صبح بخیر",
  "Good afternoon": "دوپہر بخیر",
  "Good evening": "شام بخیر",

  // --- home ---
  "Where to?": "کہاں جانا ہے؟",
  "Bike": "بائیک",
  "Taxi": "ٹیکسی",
  "More": "مزید",
  "Book a Bike Ride": "بائیک رائیڈ بک کریں",
  "Fastest way through traffic — where to?": "ٹریفک سے بچ کر جلدی پہنچیں — کہاں جانا ہے؟",
  "Ride": "رائیڈ",
  "Send a Parcel": "پارسل بھیجیں",
  "Pick & Deliver": "منگوائیں",
  "Parcel": "پارسل",
  "Errand": "کام",
  "Food": "کھانا",
  "Loyalty & Rewards": "انعامات",
  "Refer & Earn": "دوست بلائیں، کمائیں",
  "Nova Go for Business": "کاروبار کے لیے نووا گو",
  "Saved places": "محفوظ مقامات",
  "Recent": "حالیہ",
  "Home place": "گھر",
  "Work": "کام کی جگہ",
  "Sign in": "سائن ان",
  "Sign up": "اکاؤنٹ بنائیں",
  "riders nearby": "قریب سوار",
  "Looking for riders": "سوار تلاش کیے جا رہے ہیں",

  // --- booking ---
  "Pickup": "پک اپ",
  "Drop-off": "منزل",
  "Set Pickup & Drop-off": "پک اپ اور منزل منتخب کریں",
  "Confirm": "تصدیق کریں",
  "Confirm booking": "بکنگ کی تصدیق کریں",
  "Book now": "ابھی بک کریں",
  "Continue": "آگے بڑھیں",
  "Back": "واپس",
  "Cancel": "منسوخ",
  "Cancel trip": "سفر منسوخ کریں",
  "Your fare": "آپ کا کرایہ",
  "Fixed fare": "مقررہ کرایہ",
  "Base fare": "بنیادی کرایہ",
  "Distance": "فاصلہ",
  "Total": "کل",
  "Minimum fare": "کم سے کم کرایہ",
  "Pay cash to your driver": "ڈرائیور کو نقد ادائیگی کریں",
  "Cash": "نقد",

  // --- tracking ---
  "Finding you a rider": "آپ کے لیے سوار تلاش کیا جا رہا ہے",
  "Contacting drivers near you": "قریبی ڈرائیوروں سے رابطہ ہو رہا ہے",
  "Rider found": "سوار مل گیا",
  "Rider is on the way": "سوار راستے میں ہے",
  "Rider has arrived": "سوار پہنچ گیا",
  "On the way": "راستے میں",
  "Trip complete": "سفر مکمل",
  "Call": "کال",
  "Message": "پیغام",
  "Share ride": "سفر شیئر کریں",
  "WhatsApp": "واٹس ایپ",
  "Need help?": "مدد چاہیے؟",
  "Verified": "تصدیق شدہ",
  "trips": "سفر",

  // --- safety ---
  "Safety": "حفاظت",
  "Emergency": "ایمرجنسی",
  "Share your trip": "اپنا سفر شیئر کریں",
  "Check the number plate": "نمبر پلیٹ چیک کریں",
  "Before you get on": "سوار ہونے سے پہلے",

  // --- money ---
  "Tip": "ٹپ",
  "Keep the change": "بقیہ رکھ لیں",
  "Add a tip": "ٹپ شامل کریں",
  "Fare breakdown": "کرایہ کی تفصیل",

  // --- generic ---
  "Yes": "جی ہاں",
  "No": "نہیں",
  "Done": "مکمل",
  "Save": "محفوظ کریں",
  "Close": "بند کریں",
  "Retry": "دوبارہ کوشش",
  "Loading": "لوڈ ہو رہا ہے",

  // --- promotions (js/promos.js) ---
  "Why Nova Go": "نووا گو کیوں",
  "The fare you see is the fare you pay": "جو کرایہ نظر آ رہا ہے وہی ادا کریں گے",
  "No meter, no haggling, no surge. Quoted before you book.": "نہ میٹر، نہ بحث، نہ اضافی چارج۔ بکنگ سے پہلے قیمت بتا دی جاتی ہے۔",
  "See how it works": "یہ کیسے کام کرتا ہے",
  "Now live": "اب دستیاب",
  "Send a parcel across Karachi": "کراچی میں کہیں بھی پارسل بھیجیں",
  "Same bike, same fixed fare. Recipient pays cash on delivery.": "وہی بائیک، وہی مقررہ کرایہ۔ وصول کنندہ ڈیلیوری پر نقد ادائیگی کرے گا۔",
  "Send something": "کچھ بھیجیں",
  "Can't get there? Send someone.": "خود نہیں جا سکتے؟ کسی کو بھیجیں۔",
  "Your rider buys it and brings it. You pay at the door.": "آپ کا سوار خرید کر لے آئے گا۔ آپ دروازے پر ادائیگی کریں۔",
  "Start an errand": "کام شروع کریں",
  "Refer & earn": "دوست بلائیں، کمائیں",
  "Share your code. When they take their first ride, the points are yours.": "اپنا کوڈ شیئر کریں۔ ان کے پہلے سفر پر پوائنٹس آپ کے۔",
  "Earn {points} points per friend": "ہر دوست پر {points} پوائنٹس کمائیں",
  "Get my code": "میرا کوڈ حاصل کریں",
  "Something went wrong": "کچھ غلط ہو گیا",
  "Language": "زبان",
  "Theme": "تھیم",
  "Dark": "گہرا",
  "Light": "روشن",
  "System": "سسٹم",
};

const DICTS = { en: {}, ur: UR };

let current = "en";

export function getLang() {
  return current;
}

export function isRTL(lang = current) {
  return RTL_LANGS.includes(lang);
}

/**
 * Translate. The key is the English string.
 *
 * `vars` interpolates {name}-style placeholders AFTER lookup, so a translated
 * string can move the placeholder to wherever the sentence needs it — which
 * in Urdu is frequently not where English put it.
 */
export function t(key, vars) {
  let out = DICTS[current]?.[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

/** Digits stay Western and LTR even inside an RTL sentence. */
export function ltr(value) {
  // U+2066 LEFT-TO-RIGHT ISOLATE ... U+2069 POP DIRECTIONAL ISOLATE.
  // Without this a fare, a phone number or a plate lands in the middle of an
  // Urdu line and the bidi algorithm reorders its characters.
  return `⁦${value}⁩`;
}

export function setLang(lang, { reload = true } = {}) {
  if (!LANGS[lang]) lang = "en";
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Storage disabled — applies for this session only.
  }
  applyLangAttributes();
  window.dispatchEvent(new CustomEvent("novago:langchange", { detail: { lang } }));
  // Views render their strings at build time, so switching language has to
  // repaint. A full reload is heavier than re-rendering the current view, but
  // it is the only version that cannot leave half the screen in one language.
  if (reload) location.reload();
  return lang;
}

function applyLangAttributes() {
  const root = document.documentElement;
  root.setAttribute("lang", current);
  root.setAttribute("dir", isRTL() ? "rtl" : "ltr");
  root.classList.toggle("nx-urdu", current === "ur");
}

export function initI18n() {
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // ignore
  }
  if (LANGS[saved]) current = saved;
  else if (typeof navigator !== "undefined" && /^ur\b/i.test(navigator.language || "")) current = "ur";
  applyLangAttributes();
}
