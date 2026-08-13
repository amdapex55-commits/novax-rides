// Nova Go — the promotional surface.
//
// WHY THIS FILE EXISTS
//
// The app had nowhere to say anything. No banner, no offer, no campaign
// slot — so "first ride free", an Eid discount, or a new-area launch had no
// home except a push notification nobody has permission to send yet. Every
// competitor in this market leads with an offer: Foodpanda's home screen is
// mostly discount, Bykea runs permanent promo codes, Daraz is a wall of
// price. A Karachi customer arriving here to find no offer at all does not
// read it as premium positioning; they read it as "nothing on sale".
//
// WHY IT IS CONFIG, NOT A CMS
//
// Running a campaign should be editing this list and pushing — not a
// backend deploy and not a dashboard nobody has built. Each entry is plain
// data, so a non-engineer can add one by copying the block above it.
//
// WHAT IT WILL NOT DO
//
// It will not advertise a service that is switched off, and it will not
// advertise a discount the backend does not honour. `requires` gates the
// first automatically. The second is on you: if you put "50% off" here,
// something server-side has to actually take 50% off, or the first customer
// to read it has been lied to and the fare argument happens at the kerb.
//
// Referral is generated rather than listed, because its copy depends on the
// signed-in user and the amounts come from launch.config.

import { SERVICES } from "./launch.config.js";

const DISMISS_KEY = "novago.promo.dismissed";

/**
 * Campaign slots.
 *
 * id       stable; used to remember a dismissal. Change it to re-show a card.
 * tone     "violet" (default) | "gold" | "green" | "ink"
 * requires optional service key from SERVICES — hidden while that is parked.
 * nav      route to open on tap. Omit for a card that only informs.
 * signedIn true = only for signed-in users, false = only guests, undefined = both.
 */
export const CAMPAIGNS = [
  {
    id: "welcome-fixed-fare",
    kicker: "Why Nova Go",
    title: "The fare you see is the fare you pay",
    sub: "No meter, no haggling, no surge. Quoted before you book.",
    tone: "violet",
    cta: "See how it works",
    nav: "/explainer/fixed-fare",
  },
  {
    id: "parcel-live",
    kicker: "Now live",
    title: "Send a parcel across Karachi",
    sub: "Same bike, same fixed fare. Recipient pays cash on delivery.",
    tone: "green",
    cta: "Send something",
    nav: "/parcel/service",
    requires: "parcel",
  },
  {
    id: "errand-live",
    kicker: "Now live",
    title: "Can't get there? Send someone.",
    sub: "Your rider buys it and brings it. You pay at the door.",
    tone: "gold",
    cta: "Start an errand",
    nav: "/errand/details",
    requires: "errand",
  },
];

function dismissed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function dismissPromo(id) {
  try {
    const set = dismissed();
    set.add(id);
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
  } catch {
    // Storage blocked — the card comes back next launch. Acceptable.
  }
}

/**
 * The cards to actually show, in order.
 *
 * Referral goes first for a signed-in user: it is the only one that makes
 * the business money rather than spending it, and it is the one that was
 * previously buried in a grey text row nobody tapped.
 */
export function activePromos({ signedIn = false, referralPoints = 0 } = {}) {
  const skip = dismissed();
  const out = [];

  /* REFERRAL COPY IS DELIBERATELY MODEST, AND THAT IS A BUSINESS PROBLEM
     RATHER THAN A COPY ONE.

     The obvious banner here is Bykea's "Give Rs 100, Get Rs 100". We cannot
     write that, because it is not what the backend does. LoyaltyService
     .applyReferral credits the REFERRER 100 loyalty points and gives the new
     customer nothing at all, and loyalty points currently have no redemption
     path — no endpoint spends them, and the Bronze/Silver/Gold tiers confer
     no benefit yet. So a rupee-denominated two-sided offer would be a lie
     told on the home screen to the people we most want to trust us.

     What is written below is exactly what happens. It is a weaker offer than
     the competition's, and the fix is a business decision (see the note in
     NEXT-SESSION.md): make the reward two-sided and give points something to
     buy. The moment either is true, this copy should change. */
  if (signedIn && referralPoints > 0) {
    out.push({
      id: "referral",
      kicker: "Refer & earn",
      // Left as a placeholder rather than an interpolated string so the
      // whole thing is one translatable unit — Urdu puts the number in a
      // different place in the sentence, which concatenation cannot express.
      title: "Earn {points} points per friend",
      vars: { points: referralPoints },
      sub: "Share your code. When they take their first ride, the points are yours.",
      tone: "ink",
      cta: "Get my code",
      nav: "/refer",
      permanent: true, // the business's own offer; not dismissible
    });
  }

  for (const c of CAMPAIGNS) {
    if (skip.has(c.id)) continue;
    if (c.requires && !SERVICES?.[c.requires]?.live) continue;
    if (c.signedIn === true && !signedIn) continue;
    if (c.signedIn === false && signedIn) continue;
    out.push(c);
  }
  return out;
}
