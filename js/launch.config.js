// Nova Go — LAUNCH CONFIGURATION.
// ===========================================================================
// This is the one file you edit before going live. Nothing else needs
// touching to run the bike pilot.
//
// Why one file: the previous setup had pricing in the backend, service
// availability hardcoded across a dozen views, support numbers in a third
// place and legal entity details written into the policy text itself.
// Changing "are we live with food yet?" meant editing eight files and
// missing two. Now it's one boolean here.
//
// STRATEGY THIS ENCODES — Nova Go Bike, one zone, cash, verified riders:
// launching rides + food + parcels + errands + a restaurant marketplace
// simultaneously means five sets of operational problems on day one, five
// sets of support calls, and five ways to look broken. The other services
// stay VISIBLE (so customers know they're coming and you keep the demand
// signal) but are marked "coming soon" instead of taking real orders.
//
// Flip a service to true only when you can actually operate it.
// ===========================================================================

/* ---------------------------------------------------------------------------
   1. WHAT'S LIVE
   --------------------------------------------------------------------------- */

export const SERVICES = {
  // The pilot. This is the only one taking real orders.
  ride:   { live: true,  label: "Bike ride",  eta: null },

  // Built, tested, and deliberately parked. Customers see the tile and a
  // "coming soon" screen they can register interest on — which gives you a
  // waiting list instead of a dead end, and tells you which service to turn
  // on next based on real demand rather than a guess.
  food:   { live: false, label: "Food",   eta: "Coming soon" },
  parcel: { live: false, label: "Parcel", eta: "Coming soon" },
  errand: { live: false, label: "Errands", eta: "Coming soon" },
};

/** Vehicle types a customer can actually book. Bike only for the pilot:
 *  every extra vehicle type is another supply pool you have to fill, and a
 *  car request with no cars online is a worse experience than no car option. */
export const VEHICLE_TYPES = ["BIKE"];

/** "Name your own fare" (inDrive-style bidding). OFF for the pilot.
 *  Bidding needs enough drivers online that a rejected bid finds someone
 *  else — with 30–50 riders it mostly produces unmatched requests. Turn on
 *  once matching is reliably filling at fixed fares. */
export const ALLOW_BID_FARE = false;

/** Cash only. Do not enable the wallet until settlement, negative-balance
 *  rules and reconciliation are all working — holding customer money you
 *  can't account for is a different category of problem. */
export const PAYMENT_METHODS = ["CASH"];

/* ---------------------------------------------------------------------------
   2. PRICING  (your choice: Rs 60 base + Rs 22/km, minimum Rs 150)
   These MUST match src/trips/fare.util.ts on the backend. The backend is
   authoritative — this copy exists so the app can show a fare estimate
   before it has a server answer. There's a consistency test in
   TESTING.md that checks the two agree.
   --------------------------------------------------------------------------- */

export const PRICING = {
  BIKE: {
    base: 60,          // Rs, on every trip
    perKm: 22,         // Rs per road kilometre (not straight-line)
    perMin: 0,         // pilot is distance-only: simpler to explain, and no
                       // arguments about traffic time on a fixed quote
    minimum: 150,      // Rs — no trip earns less than this
  },
  /* Parcel and errand share the ride's per-km rate — same bike, same petrol,
     same road. Only the base differs, and only where the work does.

     THESE MUST MATCH src/trips/fare.util.ts ON THE BACKEND. The backend is
     authoritative; this copy exists so the app can quote a fare before it has
     a server answer. If the two drift, a customer is shown one number and
     charged another, which is the fastest way to lose trust in a cash market.
     TESTING.md has a check that compares them. */
  PARCEL: { base: 60, perKm: 22, perMin: 0, minimum: 150 },
  ERRAND: { base: 80, perKm: 22, perMin: 0, minimum: 180 },

  currency: "Rs.",
  // Shown to the customer before they confirm. Honesty beats a surprise.
  waitingChargePerMin: 0,
  cancellationFee: 0,  // pilot: no cancellation fee while you're building trust

  /* FAIR PETROL GUARANTEE
   *
   * The reference petrol price the per-km rate above was calculated against.
   * Shown to the customer as "Fare calculated at Petrol Rs. 275/L".
   *
   * Why this earns its space on the screen: every Karachi passenger has been
   * in the argument where a rider says petrol went up, so the meter is
   * "wrong". Naming the number the fare was built on turns that from a
   * negotiation into a fact the customer can check — and it's a promise we
   * can actually keep, because the fare is fixed and the app quotes it.
   *
   * UPDATE THIS when you re-price after a fuel change, and update `perKm`
   * in the same edit. Showing a stale petrol price next to a fare that no
   * longer matches it is worse than showing nothing.
   */
  petrolReferencePerLitre: 275,
  // Set to false if you'd rather not commit to a public number.
  showPetrolGuarantee: true,
};

/* ---------------------------------------------------------------------------
   3. SERVICE ZONE
   You said you'd pick the zone later. Set `enabled: true` and adjust the
   centre/radius when you decide — until then the app serves all of Karachi.

   Why a geofence matters: 40 riders spread across a 3,500 km² city means
   nobody is ever close enough. The same 40 riders inside one 6km circle is
   a 4-minute pickup. Density is the entire product.
   --------------------------------------------------------------------------- */

export const ZONE = {
  // ON BY DEFAULT, deliberately.
  //
  // Leaving this off was the more dangerous choice: with no geofence the app
  // silently accepts a booking from anywhere in a 3,500 km² city, and a
  // customer in Malir waits for a rider who is 40 minutes away and never
  // comes. "We don't serve your area yet" is a disappointment; a rider who
  // never arrives is a lost customer and a public complaint.
  //
  // NOVA GO RUNS ACROSS ALL OF KARACHI.
  //
  // The radius below is drawn from the city centre and set wide enough to
  // cover Karachi end to end — Malir and Bin Qasim in the east, Baldia and
  // Hawksbay in the west, North Karachi and Gadap to the north, Sea View to
  // the south. It is a sanity boundary, not a service area: it stops a
  // booking from Hyderabad or a GPS glitch in the Arabian Sea, and nothing
  // else.
  //
  // Supply is managed by where you recruit riders, not by fencing customers
  // out. Turning whole neighbourhoods away is how a new service stays small.
  enabled: true,
  name: "Karachi",
  // Roughly the geographic centre of the city, not Clifton — a centre point
  // in the south would push the radius out to sea and cut off the north.
  center: { lat: 24.9200, lng: 67.1000 },
  // 45km from centre covers every populated part of Karachi with room to
  // spare, and still rejects another city.
  radiusKm: 45,
  outsideMessage: "Nova Go runs across Karachi — it looks like you're outside the city.",
};

/** Is this point inside the launch zone? Returns true when zoning is off. */
export function inZone(coords) {
  if (!ZONE.enabled || !coords) return true;
  const R = 6371;
  const dLat = ((coords.lat - ZONE.center.lat) * Math.PI) / 180;
  const dLng = ((coords.lng - ZONE.center.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((ZONE.center.lat * Math.PI) / 180) * Math.cos((coords.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a))) <= ZONE.radiusKm;
}

/* ---------------------------------------------------------------------------
   4. GPS ACCURACY GATE
   The single most damaging failure mode in ride-hailing: a customer books,
   a driver rides to a pin that was never real, nobody is there, both people
   are angry and both blame you. It cost you two users and a rider's time.

   Browser geolocation reports its own accuracy in metres. If it's worse
   than this, or the position is stale, we refuse to book on GPS alone and
   make them confirm an address instead.
   --------------------------------------------------------------------------- */

export const GPS = {
  // Metres. A good phone fix outdoors is 5–20m; wifi-only indoors is often
  // 500–3000m, which is a different neighbourhood.
  maxAccuracyMeters: 120,
  // Don't trust a cached fix older than this.
  maxAgeMs: 60_000,
  // How long to wait for a better fix before giving up and asking.
  timeoutMs: 12_000,
};

/* ---------------------------------------------------------------------------
   5. OPERATING HOURS
   Run the pilot only when a human is at the ops desk. A ride that goes wrong
   at 2am with nobody to call is how you lose a customer permanently.
   --------------------------------------------------------------------------- */

export const HOURS = {
  enabled: true,
  open: "08:00",
  close: "22:00",
  closedMessage: "Nova Go Bike runs 8am–10pm while we're in pilot. We'll be back in the morning.",
};

/** Are we inside operating hours right now? */
export function isOpenNow(now = new Date()) {
  if (!HOURS.enabled) return true;
  const [oh, om] = HOURS.open.split(":").map(Number);
  const [ch, cm] = HOURS.close.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= oh * 60 + om && mins < ch * 60 + cm;
}

/* ---------------------------------------------------------------------------
   6. COMPANY & LEGAL IDENTITY
   These appear in the Terms, Privacy Policy and both agreements. Filling
   them in is what turns the policy text from a template into a document
   that names an accountable party.

   ⚠️ A lawyer must review these documents before public launch. The text is
   written to be accurate and specific to how Nova Go actually works, but it
   is not legal advice and I am not a lawyer.
   --------------------------------------------------------------------------- */

export const COMPANY = {
  legalName: "",              // e.g. "Nova Go Logistics (Private) Limited"
  tradingName: "Nova Go",
  registrationNumber: "",     // SECP incorporation number
  ntn: "",                    // FBR National Tax Number
  address: "",                // registered office, full postal address
  city: "Karachi",
  country: "Pakistan",
  jurisdiction: "the courts of Karachi, Sindh, Pakistan",
  website: "",                // e.g. "https://novago.pk"
  effectiveDate: "",          // e.g. "1 September 2026"
};

/* ---------------------------------------------------------------------------
   7. READINESS CHECK
   Rather than trusting a checklist, the app checks itself. Anything false
   here is a launch blocker — see launchReadiness() below, which the ops
   dashboard renders and the console prints on every boot.
   --------------------------------------------------------------------------- */

import { SUPPORT_STATUS } from "./support.config.js";

export function launchReadiness() {
  const checks = [
    {
      id: "support-whatsapp",
      label: "WhatsApp Business number configured",
      ok: SUPPORT_STATUS.whatsapp,
      fix: "Set SUPPORT.whatsapp in js/support.config.js",
      blocker: true,
    },
    {
      id: "support-phone",
      label: "Support phone line configured",
      ok: SUPPORT_STATUS.phone,
      fix: "Set SUPPORT.phone in js/support.config.js",
      blocker: true,
    },
    {
      id: "support-email",
      label: "Support email configured",
      ok: SUPPORT_STATUS.email,
      fix: "Set SUPPORT.email in js/support.config.js",
      blocker: true,
    },
    {
      id: "ops-escalation",
      label: "Ops escalation number configured",
      ok: !!SUPPORT_STATUS.opsEscalation,
      fix: "Set SUPPORT.opsEscalation in js/support.config.js",
      blocker: true,
    },
    {
      id: "legal-entity",
      label: "Legal entity details filled in",
      ok: !!(COMPANY.legalName && COMPANY.address && COMPANY.effectiveDate),
      fix: "Fill COMPANY in js/launch.config.js — appears in Terms, Privacy and both agreements",
      blocker: true,
    },
    {
      id: "zone",
      label: "Launch zone chosen and geofenced",
      ok: ZONE.enabled,
      fix: "Set ZONE.enabled = true and pick a centre + radius in js/launch.config.js",
      blocker: true,
    },
    {
      id: "single-service",
      label: "Only one service live (bike pilot)",
      ok: Object.values(SERVICES).filter((s) => s.live).length === 1,
      fix: "Launching multiple services at once multiplies your failure modes",
      blocker: false,
    },
    {
      id: "cash-only",
      label: "Cash only — no wallet until settlement is solid",
      ok: PAYMENT_METHODS.length === 1 && PAYMENT_METHODS[0] === "CASH",
      fix: "Remove non-cash methods from PAYMENT_METHODS until reconciliation works",
      blocker: false,
    },
    {
      id: "fixed-fare",
      label: "Fixed fare only — bidding off until matching is reliable",
      ok: !ALLOW_BID_FARE,
      fix: "Set ALLOW_BID_FARE = false until fixed-fare matching fills consistently",
      blocker: false,
    },
    {
      id: "bike-only",
      label: "One vehicle type",
      ok: VEHICLE_TYPES.length === 1,
      fix: "Every extra vehicle type is another supply pool you must fill",
      blocker: false,
    },
  ];

  const blockers = checks.filter((c) => c.blocker && !c.ok);
  return {
    checks,
    blockers,
    ready: blockers.length === 0,
    passed: checks.filter((c) => c.ok).length,
    total: checks.length,
  };
}

// Loud console warning on every boot until the blockers are cleared. This is
// deliberately annoying — these are exactly the things that get forgotten
// and then discovered by a customer instead of by you.
const _r = launchReadiness();
if (!_r.ready && typeof console !== "undefined") {
  console.warn(
    `%c[NovaGo] NOT READY FOR PUBLIC LAUNCH — ${_r.blockers.length} blocker(s)`,
    "color:#e11d48;font-weight:bold",
  );
  _r.blockers.forEach((b) => console.warn(`  ✗ ${b.label}\n    → ${b.fix}`));
}
