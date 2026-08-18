// Nova Go — legal & policy pages.
//
// ⚠️ READ THIS FIRST.
// I am not a lawyer and this is not legal advice. A qualified Pakistani
// lawyer must review these documents before you launch publicly.
//
// What changed: these used to be drafts littered with [SQUARE BRACKETS] that
// would have shipped visibly unfinished. The text below is now complete and
// specific to how Nova Go actually operates — cash fares, 15% commission,
// weekly settlement, verified riders, a bike-only pilot in one zone. The only
// values still pulled from outside are the ones that describe your company
// rather than your product, and those live in js/launch.config.js.
//
// If COMPANY isn't filled in, every page shows a clear "not ready to publish"
// banner rather than printing an empty company name into a contract.

import { icon } from "../icons.js";
import { COMPANY, PRICING, HOURS, ZONE } from "../launch.config.js";
import { COMMERCIALS, SUPPORT, SUPPORT_STATUS } from "../support.config.js";

const configured = !!(COMPANY.legalName && COMPANY.address && COMPANY.effectiveDate);

// Fall back to the trading name so a sentence still reads as a sentence
// during testing, while the banner above makes clear it isn't publishable.
const NAME = COMPANY.legalName || "Nova Go (company details not yet configured)";
const ADDR = COMPANY.address || "(registered office not yet configured)";
const DATE = COMPANY.effectiveDate || "(effective date not yet set)";
const EMAIL = SUPPORT_STATUS.email ? SUPPORT.email : "(support email not yet configured)";
const PHONE = SUPPORT_STATUS.phone ? SUPPORT.phone : "(support phone not yet configured)";

const { base, perKm, minimum } = PRICING.BIKE;
const commission = COMMERCIALS.driverCommissionPct;

function page(title, bodyHtml) {
  return (root) => {
    root.innerHTML = `
      <div class="page nx-stagger">
        <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
        <h1 class="text-xl mb-1">${title}</h1>
        <p class="text-xs text-muted mb-5">Effective: ${DATE}</p>

        ${!configured ? `
          <div class="pending-flag mb-5">
            <span>${icon("bolt", 14)}</span>
            <span><b>Not ready to publish.</b> Fill in COMPANY in js/launch.config.js —
            legal name, registered address and effective date — then have a Pakistani
            lawyer review this document.</span>
          </div>` : `
          <div class="nx-launch-note mb-5">
            ${icon("info", 15)}
            <span>Have a qualified lawyer review this before public launch.</span>
          </div>`}

        <div class="legal-body">${bodyHtml}</div>

        <div class="card mt-6">
          <p class="font-bold text-sm mb-1">Questions about this policy?</p>
          <p class="text-secondary text-sm">${EMAIL} · ${PHONE}</p>
        </div>
      </div>
      <style>
        .legal-body h3 { font-size: 15px; margin: var(--sp-5) 0 var(--sp-2); }
        .legal-body p, .legal-body li { font-size: 14px; color: var(--text-secondary); line-height: 1.65; }
        .legal-body ul { padding-left: 20px; margin: var(--sp-2) 0; }
        .legal-body li { margin-bottom: 6px; }
        .legal-body strong { color: var(--text-primary); }
      </style>
    `;
    root.querySelector("#backBtn").addEventListener("click", () => history.back());
  };
}

/* ==========================================================================
   TERMS OF SERVICE
   ========================================================================== */

export const renderTerms = page("Terms of Service", `
  <p>These Terms govern your use of the Nova Go mobile application and website
  ("the Platform"), operated by <strong>${NAME}</strong>, registered office
  ${ADDR}, ${COMPANY.city}, ${COMPANY.country}.</p>

  <p>By creating an account or booking a ride you accept these Terms. If you
  do not accept them, do not use the Platform.</p>

  <h3>1. What Nova Go is</h3>
  <p>Nova Go is a technology platform that connects passengers with independent
  motorcycle riders. <strong>We are not a transport company.</strong> We do not
  own vehicles and we do not employ riders. Riders are independent
  contractors who use the Platform to find passengers. The transport service
  itself is provided by the rider, not by ${NAME}.</p>

  <h3>2. Eligibility</h3>
  <ul>
    <li>You must be at least 18 years old to hold an account.</li>
    <li>You must provide a valid mobile number, which we verify by SMS code.</li>
    <li>One account per person. Accounts are not transferable.</li>
    <li>You are responsible for everything done through your account.</li>
  </ul>

  <h3>3. Service area and hours</h3>
  <p>Nova Go currently operates bike rides only, in ${ZONE.enabled ? ZONE.name : "Karachi"},
  ${HOURS.enabled ? `between ${HOURS.open} and ${HOURS.close} daily` : "during posted hours"}.
  We may change the service area, the hours or the services offered at any
  time. Requests outside the service area or hours will not be accepted.</p>

  <h3>4. Fares and payment</h3>
  <ul>
    <li>Fares are <strong>cash only</strong>, paid directly to the rider at the
    end of the trip. We do not currently accept cards or hold customer funds.</li>
    <li>The pilot fare is Rs. ${base} base plus Rs. ${perKm} per kilometre of
    road distance, with a minimum fare of Rs. ${minimum}.</li>
    <li>The fare is calculated from the road route between your pickup and
    drop-off and is shown to you <strong>before</strong> you confirm.</li>
    <li>If you change the destination mid-trip, the fare changes accordingly.</li>
    <li>Tolls, parking and similar third-party charges, if any, are additional.</li>
  </ul>

  <h3>5. Your responsibilities as a passenger</h3>
  <ul>
    <li>Be at your pickup point at the agreed time.</li>
    <li><strong>Wear the helmet provided.</strong> A rider may refuse to carry
    you if you will not wear one.</li>
    <li>Do not carry illegal, dangerous, flammable or prohibited items.</li>
    <li>Do not ask the rider to break traffic law, exceed speed limits or
    carry more passengers than the motorcycle is licensed for.</li>
    <li>Treat the rider with respect. Abuse, harassment, discrimination or
    threats will result in your account being permanently closed.</li>
    <li>Pay the fare shown. Refusing to pay is theft of service and we will
    report it.</li>
  </ul>

  <h3>6. Cancellations</h3>
  <p>See our Cancellation &amp; Refund Policy, which forms part of these Terms.</p>

  <h3>7. Accounts we may suspend or close</h3>
  <p>We may suspend or permanently close an account, with reason given, where
  there is: non-payment; abuse or threats toward a rider or our staff; repeated
  no-shows; fraudulent activity; misuse of promotions; or any conduct that
  puts another person's safety at risk.</p>

  <h3>8. Limits on our liability</h3>
  <p>Nothing in these Terms excludes liability that cannot lawfully be
  excluded, including liability for death or personal injury caused by our
  negligence, or for fraud.</p>
  <p>Subject to that: because the transport is provided by an independent
  rider and not by us, ${NAME} is not liable for the rider's acts or
  omissions during a trip. We are liable for the Platform itself — for
  operating it with reasonable skill and care, matching you fairly, showing
  you accurate fares, and handling your data as described in our Privacy
  Policy.</p>
  <p>We do not guarantee that a rider will always be available, that the
  Platform will be uninterrupted, or that estimated arrival times will be
  exact. Traffic in Karachi is not predictable and our estimates are
  estimates.</p>

  <h3>9. Insurance</h3>
  <p>Riders are required to hold valid motorcycle registration and a valid
  driving licence, both of which we verify before approving them. Riders are
  responsible for their own vehicle insurance. We tell you this plainly so
  you can make an informed decision rather than assuming cover that may not
  exist.</p>

  <h3>10. Complaints</h3>
  <p>Contact us at ${EMAIL} or ${PHONE}. We aim to acknowledge within one
  working day. Safety incidents are prioritised immediately — see our Safety
  Policy.</p>

  <h3>11. Changes to these Terms</h3>
  <p>We may update these Terms. Material changes will be notified in the app
  before they take effect. Continuing to use the Platform after that means you
  accept the updated Terms.</p>

  <h3>12. Governing law</h3>
  <p>These Terms are governed by the laws of the Islamic Republic of Pakistan.
  Disputes are subject to the exclusive jurisdiction of ${COMPANY.jurisdiction}.</p>
`);

/* ==========================================================================
   PRIVACY POLICY
   ========================================================================== */

export const renderPrivacy = page("Privacy Policy", `
  <p>This policy explains what personal data ${NAME} collects, why, and what
  control you have over it.</p>

  <h3>1. What we collect</h3>
  <p><strong>From passengers:</strong></p>
  <ul>
    <li>Mobile number (required — you can sign in with it)</li>
    <li>Email address (required — you can sign in with this instead)</li>
    <li>Your first and last name (required)</li>
    <li>A password, which we store only as a one-way hash and cannot read</li>
    <li>Pickup and drop-off locations for each trip</li>
    <li>Live location while a trip is active</li>
    <li>Trip history, fares and ratings</li>
    <li>Messages you send to support or to your rider through the app</li>
  </ul>
  <p><strong>From riders, additionally:</strong></p>
  <ul>
    <li>CNIC (front and back), driving licence, motorcycle registration</li>
    <li>Number plate and a profile photograph</li>
    <li>An emergency contact</li>
    <li>Payout details (JazzCash, Easypaisa or bank account)</li>
    <li>Location while online, whether or not on a trip</li>
  </ul>
  <p>We do <strong>not</strong> collect card numbers, CVVs, PINs or banking
  passwords from anyone. Nova Go is cash-only and will never ask you for these.</p>

  <h3>2. Why we collect it</h3>
  <ul>
    <li><strong>To provide the service</strong> — matching you with a nearby
    rider requires knowing where you both are.</li>
    <li><strong>To calculate fares</strong> — road distance between two points.</li>
    <li><strong>For safety</strong> — so we can find a trip in progress, respond
    to an SOS, and investigate an incident afterwards.</li>
    <li><strong>To verify riders</strong> — identity and licence documents are
    checked by a person before a rider is approved.</li>
    <li><strong>To pay riders</strong> — settlement of fares and commission.</li>
    <li><strong>To improve the service</strong> — aggregate patterns like where
    demand is unmet.</li>
  </ul>

  <h3>3. Location data specifically</h3>
  <p>This is the most sensitive thing we hold, so to be exact:</p>
  <ul>
    <li>Passengers: we access location when you open the app to set a pickup,
    and during an active trip. Not when the app is closed.</li>
    <li>Riders: we access location whenever you are <em>online</em> and
    available for jobs, because that is what makes matching possible. When you
    go offline, we stop and your position is removed.</li>
    <li>You can refuse location permission. The app still works — you enter
    your pickup address manually instead.</li>
  </ul>

  <h3>4. Who we share it with</h3>
  <ul>
    <li><strong>Your rider</strong> sees your first name, your pickup and
    drop-off, and your masked contact — not your full number.</li>
    <li><strong>You</strong> see your rider's name, photo, rating, motorcycle
    plate and live position.</li>
    <li><strong>Anyone you send a ride-share link to</strong> sees the live
    position of that trip until it ends. You choose whether to send it.</li>
    <li><strong>Our service providers</strong> — hosting, SMS delivery, map and
    routing services — process data on our instructions only.</li>
    <li><strong>Law enforcement</strong>, where we are legally required to, or
    where there is a genuine risk to someone's life.</li>
  </ul>
  <p>We do not sell your personal data. We do not share it with advertisers.</p>

  <h3>5. How long we keep it</h3>
  <ul>
    <li>Trip records and fares: seven years (tax and accounting requirements).</li>
    <li>Live location points: 90 days, then deleted.</li>
    <li>Rider verification documents: for as long as the rider is active, plus
    two years after.</li>
    <li>Support conversations: two years.</li>
    <li>Incident reports: seven years, because they may be needed later.</li>
  </ul>

  <h3>6. Your rights</h3>
  <ul>
    <li>Ask for a copy of the data we hold about you.</li>
    <li>Ask us to correct anything that's wrong.</li>
    <li>Ask us to delete your account and data, subject to records we must keep
    by law (trip and tax records above).</li>
    <li>Withdraw location permission at any time in your phone settings.</li>
  </ul>
  <p>Email ${EMAIL} and we will respond within 30 days.</p>

  <h3>7. Security</h3>
  <p>Data is encrypted in transit. Verification documents are stored in
  access-controlled storage, not in the app. Access to personal data inside
  our team is limited to staff who need it to do their job. No system is
  perfectly secure, and we will tell you promptly if a breach affects you.</p>

  <h3>8. Children</h3>
  <p>Nova Go is not for anyone under 18. We do not knowingly collect data from
  children. If you believe a child has an account, contact us and we will
  remove it.</p>

  <h3>9. Changes</h3>
  <p>We will notify you in the app before any material change takes effect.</p>

  <h3>10. Contact</h3>
  <p>${NAME}, ${ADDR}, ${COMPANY.city}. Email ${EMAIL}. Phone ${PHONE}.</p>
`);

/* ==========================================================================
   CANCELLATION & REFUND
   ========================================================================== */

export const renderCancellation = page("Cancellation &amp; Refund Policy", `
  <p>Nova Go is cash-only: you pay the rider directly at the end of the trip.
  That means in almost every case there is nothing to refund, because nothing
  has been charged. This policy explains the exceptions.</p>

  <h3>1. Cancelling before a rider is assigned</h3>
  <p>Free, always. No charge and no penalty.</p>

  <h3>2. Cancelling after a rider is assigned</h3>
  <p>During the pilot there is <strong>no cancellation fee</strong>. We would
  rather you cancel than take a ride you don't want.</p>
  <p>We do ask you to cancel promptly if your plans change — a rider who
  travels to a pickup that evaporates has lost time and fuel they aren't paid
  for. Repeated late cancellations (more than three in seven days) may lead to
  a temporary suspension, and we will tell you why.</p>

  <h3>3. If your rider cancels</h3>
  <p>You are not charged. We look for another rider immediately. If we cannot
  find one, we tell you rather than leaving you waiting.</p>

  <h3>4. If nobody arrives</h3>
  <p>If a rider accepts and then does not arrive, contact support. You pay
  nothing, and we follow up with that rider directly. Repeated no-shows remove
  a rider from the Platform.</p>

  <h3>5. Refunds</h3>
  <p>Because payment is cash and happens at the end of a completed trip, a
  refund only arises if you were charged for something you didn't receive.
  If that happens, contact support within 48 hours with the trip details. If
  we agree the charge was wrong we will arrange reimbursement in cash or by
  mobile wallet within seven working days.</p>

  <h3>6. Fare disputes</h3>
  <p>The fare is shown before you confirm and is calculated from the road
  route. If the amount you were asked for doesn't match what the app showed,
  do not argue with the rider at the roadside — pay the fare shown in the app,
  then report it. We investigate every one of these, and a rider who
  overcharges is removed.</p>

  <h3>7. How to raise a problem</h3>
  <p>In the app: Help → Message the Nova Go team. Or ${EMAIL} / ${PHONE}${
    HOURS.enabled ? ` during ${HOURS.open}–${HOURS.close}` : ""
  }. We aim to resolve within two working days.</p>
`);

/* ==========================================================================
   SAFETY POLICY  (new)
   ========================================================================== */

export const renderSafety = page("Safety Policy", `
  <p>Motorcycle travel carries real risk. We are not going to pretend
  otherwise. This policy sets out what we do about it, and what we require
  from riders and passengers.</p>

  <h3>1. Every rider is verified by a person</h3>
  <p>Before a rider can accept a single trip, a member of our team checks:</p>
  <ul>
    <li>CNIC, front and back</li>
    <li>A valid motorcycle driving licence</li>
    <li>Motorcycle registration and number plate</li>
    <li>A clear photograph of the rider's face</li>
    <li>An emergency contact we can call</li>
  </ul>
  <p>No automatic approvals. An unapproved rider cannot go online, cannot be
  matched, and cannot see a passenger's details.</p>

  <h3>2. Helmets</h3>
  <p>Riders must wear a helmet at all times and must carry a passenger helmet.
  Passengers must wear it. A rider may refuse a trip if you will not, and
  should. This is not negotiable and is not a formality.</p>

  <h3>3. What you can see before you get on</h3>
  <ul>
    <li>The rider's name and photograph</li>
    <li>The motorcycle's number plate</li>
    <li>Their rating and number of completed trips</li>
    <li>Their live position as they approach</li>
  </ul>
  <p><strong>Check the plate matches before you get on.</strong> If it doesn't,
  don't take the ride, and tell us.</p>

  <h3>4. Share your ride</h3>
  <p>Every trip has a share link. Send it to anyone — they don't need the app
  or an account — and they can watch your trip live until it ends. We
  recommend using it at night and on any trip you're unsure about.</p>

  <h3>5. SOS</h3>
  <p>The SOS button is on the trip screen throughout every ride. Pressing it:</p>
  <ul>
    <li>opens a call to emergency services (Rescue 1122 / Police 15)</li>
    <li>logs an incident our operations desk sees immediately</li>
    <li>records your trip, position and rider details at that moment</li>
  </ul>
  <p>Use it if you feel unsafe. There is no penalty for using it and no
  question asked about why.</p>

  <h3>6. Our operations desk</h3>
  ${HOURS.enabled ? `
  <p>A human is on duty for every hour we run rides
  (${HOURS.open}–${HOURS.close}). They can see every active trip, call either
  party, and cancel or escalate. Outside those hours we do not accept
  bookings, because a ride nobody is watching is a ride we can't help with.</p>
  ` : `
  <p>Our operations desk can see every active trip, call either party, and
  cancel or escalate. Bookings are accepted around the clock.</p>
  `}

  <h3>7. Conduct that removes a rider immediately</h3>
  <ul>
    <li>Driving under the influence of alcohol or drugs</li>
    <li>Refusing to provide a helmet, or riding without one</li>
    <li>Any form of harassment, unwanted contact or discrimination</li>
    <li>Carrying a weapon</li>
    <li>Letting someone else use their account</li>
    <li>Demanding more than the fare shown in the app</li>
    <li>Dangerous riding, or a pattern of complaints about speed</li>
  </ul>
  <p>These result in permanent removal, not a warning.</p>

  <h3>8. Conduct that closes a passenger account</h3>
  <ul>
    <li>Abuse, threats or harassment toward a rider</li>
    <li>Refusing to pay a completed fare</li>
    <li>Refusing to wear a helmet and insisting on travelling</li>
    <li>Asking a rider to break traffic law</li>
    <li>Damage to a rider's motorcycle or property</li>
  </ul>

  <h3>9. Incidents</h3>
  <p>Every safety report is logged with the trip, both parties, the time and
  the location, and kept for seven years. We investigate every one. Where
  there is injury or a crime we support the people involved in going to the
  authorities and provide our records where lawfully required.</p>

  <h3>10. Accidents</h3>
  <p>If you are in an accident: get to safety, call 1122, then contact us on
  ${PHONE}. We will contact the rider's emergency contact and give you
  whatever trip records you need. Report it to us even if it seems minor.</p>

  <h3>11. What we're still building</h3>
  <p>We would rather tell you what we don't have yet than let you assume it.
  As of ${DATE} we do not offer in-app trip insurance, in-app emergency
  services dispatch (the SOS button places a normal phone call), or 24-hour
  support. We run limited hours so that every ride is covered by a person.</p>
`);

/* ==========================================================================
   DRIVER AGREEMENT
   ========================================================================== */

export const renderDriverAgreement = page("Rider Partner Agreement", `
  <p>This agreement is between you ("Rider Partner") and <strong>${NAME}</strong>,
  ${ADDR}. It governs your use of the Nova Go Driver app.</p>

  <h3>1. You are independent</h3>
  <p>You are an independent contractor, not an employee of ${NAME}. You choose
  when to go online, which trips to accept, and when to stop. There is no
  shift, no minimum hours and no obligation to accept any particular trip.</p>
  <p>Because you are not an employee, you do not receive salary, paid leave,
  pension, gratuity or employment benefits, and you are responsible for your
  own tax.</p>

  <h3>2. What you must have before approval</h3>
  <ul>
    <li>Valid CNIC</li>
    <li>Valid motorcycle driving licence</li>
    <li>Motorcycle registration in a name you can account for</li>
    <li>A readable number plate matching that registration</li>
    <li>A helmet for yourself and a second helmet for your passenger</li>
    <li>A working smartphone with location enabled</li>
    <li>An emergency contact</li>
    <li>Payout details (JazzCash, Easypaisa or bank)</li>
  </ul>
  <p>All of it is checked by a person. You cannot go online until approved.</p>

  <h3>3. What you earn</h3>
  <ul>
    <li>Fares are <strong>cash</strong>, paid to you directly by the passenger.</li>
    <li>You keep <strong>${100 - commission}%</strong> of every fare.</li>
    <li>Nova Go commission is <strong>${commission}%</strong>, settled
    ${COMMERCIALS.payoutSchedule}.</li>
    <li>There is no joining fee, no charge for being online, and no deduction
    you have not agreed to here.</li>
    <li>The pilot fare is Rs. ${base} base plus Rs. ${perKm}/km, minimum
    Rs. ${minimum}.</li>
  </ul>

  <h3>4. Settlement and commission</h3>
  <p>Because you collect cash, you owe us commission rather than us owing you
  a fare. We maintain a running ledger you can see in the app at any time.</p>
  <ul>
    <li>Commission accrues per completed trip and is settled
    ${COMMERCIALS.payoutSchedule}.</li>
    <li>If your outstanding commission balance exceeds the limit shown in the
    app, you will not receive new trips until it is settled. You will be
    warned before that happens, not after.</li>
    <li>Every entry in your ledger shows the trip it came from. If you think
    one is wrong, raise it and we will check it.</li>
  </ul>

  <h3>5. What we expect of you</h3>
  <ul>
    <li>Wear a helmet. Carry a passenger helmet. Offer it every time.</li>
    <li>Obey traffic law. No trip is worth a red light.</li>
    <li>Arrive at the pickup shown. If you can't, cancel promptly so someone
    else can go.</li>
    <li>Charge the fare shown in the app. Nothing more, for any reason.</li>
    <li>Treat every passenger with respect regardless of gender, religion,
    ethnicity, disability or how they're dressed.</li>
    <li>Never let anyone else use your account.</li>
    <li>Keep your motorcycle roadworthy — brakes, lights, tyres.</li>
  </ul>

  <h3>6. Cancellations by you</h3>
  <p>Accepting a trip and then cancelling costs the passenger their time and
  costs us their trust. Occasional cancellations are understood. A pattern is
  not: more than 20% cancellations over 20 trips triggers a conversation,
  and continued cancellation leads to removal.</p>

  <h3>7. Suspension and removal</h3>
  <p>We may suspend or remove you, with the reason given in writing in the
  app, for: unverified or expired documents; riding under the influence;
  harassment or discrimination; carrying a weapon; overcharging; account
  sharing; dangerous riding; repeated no-shows; or unpaid commission beyond
  the agreed limit.</p>
  <p>Immediate removal applies to anything that puts a passenger's safety at
  risk. For everything else you will be told what the problem is and given a
  chance to respond.</p>

  <h3>8. Insurance and liability</h3>
  <p>You are responsible for insuring your own motorcycle and for complying
  with Pakistani law on motor insurance. ${NAME} does not provide vehicle
  insurance, health insurance or accident cover, and we state that plainly so
  you can arrange your own. You are responsible for your riding and for any
  loss or damage you cause.</p>

  <h3>9. Your data</h3>
  <p>We collect and hold your verification documents, location while online,
  trip records and payout details as described in the Privacy Policy. Your
  location is tracked only while you are online and stops when you go offline.</p>

  <h3>10. Ending this agreement</h3>
  <p>You may stop using Nova Go at any time. Any commission you owe at that
  point remains payable. We may end this agreement on notice, or immediately
  in the circumstances in section 7.</p>

  <h3>11. Governing law</h3>
  <p>This agreement is governed by the laws of Pakistan, subject to the
  jurisdiction of ${COMPANY.jurisdiction}.</p>
`);

/* ==========================================================================
   RESTAURANT AGREEMENT  (parked with the food service, kept current)
   ========================================================================== */

export const renderRestaurantAgreement = page("Restaurant Partner Agreement", `
  <div class="nx-launch-note mb-4">
    ${icon("info", 15)}
    <span>Nova Go Food is not live yet. This agreement applies from the date
    your storefront is approved and takes its first order.</span>
  </div>

  <p>This agreement is between your restaurant ("Partner") and
  <strong>${NAME}</strong>, ${ADDR}.</p>

  <h3>1. What you get</h3>
  <ul>
    <li>A storefront on Nova Go Food that customers can order from</li>
    <li>Full control of your menu, prices, photographs and opening hours</li>
    <li>Delivery handled by Nova Go riders</li>
    <li>An order screen you control — accept, set prep time, mark ready</li>
  </ul>

  <h3>2. Commission</h3>
  <ul>
    <li>You keep <strong>${100 - COMMERCIALS.restaurantCommissionPct}%</strong>
    of the food subtotal on every order.</li>
    <li>Nova Go commission is <strong>${COMMERCIALS.restaurantCommissionPct}%</strong>
    of the subtotal, settled ${COMMERCIALS.payoutSchedule}.</li>
    <li>The delivery fee is the rider's and is never taken from your share.</li>
    <li>No listing fee, no monthly charge, no charge for being open.</li>
  </ul>

  <h3>3. What we expect</h3>
  <ul>
    <li>Set a realistic prep time and meet it. The customer's ETA is built on it.</li>
    <li>Close your storefront when you can't cook, rather than accepting orders
    you'll be late on.</li>
    <li>Keep your menu and prices accurate.</li>
    <li>Comply with all food safety and hygiene law, and hold any licence your
    operation requires.</li>
    <li>Package food so it survives a motorcycle journey.</li>
    <li>Answer the contact number you gave us during your opening hours.</li>
  </ul>

  <h3>4. Food safety</h3>
  <p>You are solely responsible for the food you prepare — its safety, its
  hygiene, its accuracy against what was ordered, and its allergen
  information. ${NAME} transports food; we do not prepare or inspect it.</p>

  <h3>5. Suspension</h3>
  <p>We may suspend a storefront for repeated late or rejected orders,
  substantiated food safety complaints, persistent menu or price
  inaccuracies, or failure to answer the contact number during posted hours.
  You will be told the reason.</p>

  <h3>6. Ending this agreement</h3>
  <p>Either side may end it with seven days' notice. Commission accrued
  remains payable and any amount owed to you will be settled in the next
  cycle.</p>

  <h3>7. Governing law</h3>
  <p>Laws of Pakistan, subject to ${COMPANY.jurisdiction}.</p>
`);
