// Nova Go — trip status copy, in the language people actually speak here.
//
// This is the cheapest competitive advantage in the app.
//
// Bykea and Careem both write in stiff, translated-sounding English —
// "Your captain is en route to the pickup location." Nobody in Karachi says
// that. Roman Urdu for the live status line makes the app read as though it
// was built here rather than localised into here, and it costs nothing.
//
// WHERE THIS IS AND ISN'T USED
//
// Status lines during an active job only — the moments where a customer is
// anxious and wants reassurance in the register they'd get it from a person.
// NOT for legal text, money, forms or errors: a fare dispute or a Terms page
// read in Roman Urdu is worse, not better, and mixing scripts in a form is
// genuinely harder to use.
//
// English stays underneath every line, because Karachi reads both and some
// people strongly prefer English. Neither is a translation of the other —
// each is written to sound natural on its own.

export const TRIP_STATUS_COPY = {
  SEARCHING: {
    urdu: "Rider dhoond rahe hain…",
    english: "Finding you a rider",
    sub: "Aas paas ke riders ko aap ki request bhej di hai.",
    subEn: "We've sent your request to riders nearby.",
  },
  MATCHED: {
    urdu: "Rider mil gaya!",
    english: "Rider on the way",
    // The plate check is the single most useful safety habit we can build,
    // so it goes in the line people actually read.
    sub: "Number plate zaroor check karein.",
    subEn: "Check the number plate before you get on.",
  },
  ARRIVED: {
    urdu: "Rider pohnch gaya",
    english: "Your rider is here",
    sub: "Bahar intezar kar rahe hain.",
    subEn: "They're waiting outside.",
  },
  IN_PROGRESS: {
    urdu: "Safar jaari hai",
    english: "On the way",
    sub: "SOS button screen par hai.",
    subEn: "SOS is on screen the whole way.",
  },
  COMPLETED: {
    urdu: "Safar mukammal!",
    english: "Trip complete",
    sub: "Cash rider ko ada kar dein. Shukriya!",
    subEn: "Please pay the rider in cash. Thank you!",
  },
  CANCELLED: {
    urdu: "Safar cancel ho gaya",
    english: "Trip cancelled",
    sub: "Koi paisa nahi liya gaya.",
    subEn: "You haven't been charged.",
  },
};

/**
 * Copy for a backend trip status.
 *
 * Falls back to SEARCHING rather than throwing: an unknown status should show
 * a reasonable line, not break the tracking screen a customer is watching mid
 * journey.
 */
export function tripCopy(status) {
  return TRIP_STATUS_COPY[String(status || "").toUpperCase()] || TRIP_STATUS_COPY.SEARCHING;
}

/**
 * Render a status block: Roman Urdu headline, English underneath.
 *
 * `lang="en"` on the English lines matters — without it a screen reader tries
 * to pronounce English words with Urdu phonetics, and vice versa.
 */
export function renderTripStatus(status) {
  const c = tripCopy(status);
  return `
    <p class="nx-status-ur">${c.urdu}</p>
    <p class="nx-status-en" lang="en">${c.english}</p>
    <p class="nx-status-sub">${c.sub}
      <span class="nx-status-sub-en" lang="en">${c.subEn}</span>
    </p>`;
}
