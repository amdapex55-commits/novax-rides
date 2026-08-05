// Nova X Rides — legal & policy pages.
//
// IMPORTANT, and stated plainly on every page below: these are working
// DRAFTS, not legal advice and not a substitute for a Pakistani lawyer
// reviewing them. They exist so the app has real, linkable policies at
// launch instead of dead links, and so a lawyer has something concrete to
// mark up rather than a blank page. Anything in [SQUARE BRACKETS] is a
// business decision that must be filled in before you publish.
import { icon } from "../icons.js";
import { navigate } from "../router.js";

const COMPANY = "[COMPANY LEGAL NAME]";
const SUPPORT_EMAIL = "[support@yourdomain.pk]";
const SUPPORT_PHONE = "[+92 XXX XXXXXXX]";
const ADDRESS = "[REGISTERED OFFICE ADDRESS, KARACHI]";

function page(title, updated, bodyHtml) {
  return (root) => {
    root.innerHTML = `
      <div class="page nx-stagger">
        <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
        <h1 class="text-xl mb-1">${title}</h1>
        <p class="text-xs text-muted mb-5">Last updated: ${updated}</p>

        <div class="pending-flag mb-5">
          <span>${icon("bolt", 14)}</span>
          <span>Draft — must be reviewed by a qualified Pakistani lawyer before launch. Bracketed fields need completing.</span>
        </div>

        <div class="legal-body">${bodyHtml}</div>

        <div class="card mt-6">
          <p class="font-bold text-sm mb-1">Questions about this policy?</p>
          <p class="text-secondary text-sm">${SUPPORT_EMAIL} · ${SUPPORT_PHONE}</p>
        </div>
      </div>
      <style>
        .legal-body h3 { font-size: 15px; margin: var(--sp-5) 0 var(--sp-2); }
        .legal-body p, .legal-body li { font-size: 14px; color: var(--text-secondary); line-height: 1.6; }
        .legal-body ul { padding-left: 20px; margin: var(--sp-2) 0; }
        .legal-body li { margin-bottom: 6px; }
      </style>
    `;
    root.querySelector("#backBtn").addEventListener("click", () => history.back());
  };
}

export const renderTerms = page("Terms of Service", "August 2026", `
  <p>These terms govern your use of the Nova X platform operated by ${COMPANY}, registered at ${ADDRESS}.</p>

  <h3>1. What Nova X is</h3>
  <p>Nova X is a technology platform that connects riders and customers with independent drivers and restaurants. We are a marketplace, not a transport or food business — drivers and restaurants are independent contractors, not our employees.</p>

  <h3>2. Your account</h3>
  <ul>
    <li>You must be at least 18 years old to create an account.</li>
    <li>You are responsible for activity on your account and for keeping your phone number secure.</li>
    <li>One person, one account. Accounts may not be shared or transferred.</li>
  </ul>

  <h3>3. Payment</h3>
  <p>Nova X currently operates on a <b>cash basis</b>. You pay your driver directly in cash at the end of a ride, and pay cash on delivery for parcels and food orders. Fares shown in the app before booking are estimates; the final fare is calculated from actual distance and time.</p>

  <h3>4. Conduct</h3>
  <p>You agree not to: harass or endanger drivers or other users; damage vehicles; request illegal transport of goods or people; or use the platform fraudulently. We may suspend accounts for any of these.</p>

  <h3>5. Our liability</h3>
  <p>To the maximum extent permitted by Pakistani law, ${COMPANY} is not liable for the acts or omissions of independent drivers or restaurants. [LAWYER: this clause needs review against Pakistani consumer protection law before publishing.]</p>

  <h3>6. Changes</h3>
  <p>We may update these terms. Continued use after a change means you accept the updated terms.</p>

  <h3>7. Governing law</h3>
  <p>These terms are governed by the laws of Pakistan, with courts in [CITY] having exclusive jurisdiction.</p>
`);

export const renderPrivacy = page("Privacy Policy", "August 2026", `
  <p>This explains what ${COMPANY} collects, why, and what control you have.</p>

  <h3>What we collect</h3>
  <ul>
    <li><b>Account:</b> your phone number, name, and role (rider, driver, restaurant).</li>
    <li><b>Location:</b> your device location while you have an active booking, and continuously while a driver is online. This is what makes matching and live tracking work.</li>
    <li><b>Trip &amp; order history:</b> pickup/drop-off, fares, order contents, ratings.</li>
    <li><b>Driver documents:</b> CNIC, licence and vehicle papers, held for verification and regulatory compliance.</li>
    <li><b>Messages:</b> in-app chat between riders and drivers, retained for safety and dispute resolution.</li>
    <li><b>Usage analytics:</b> anonymous product events (e.g. "ride requested") used to improve the service.</li>
  </ul>

  <h3>What we do NOT collect</h3>
  <p>We do not store card or bank credentials — Nova X is cash-based and has no payment gateway. Payout details you provide are destinations we send your earnings to, not instruments we can charge.</p>

  <h3>Who we share with</h3>
  <ul>
    <li>Your driver sees your first name, pickup/drop-off and masked contact — not your full profile.</li>
    <li>Anyone you send a "share my ride" link to can see that ride's live status until it ends.</li>
    <li>Law enforcement, where we're legally required to comply.</li>
  </ul>
  <p>We do not sell your personal data.</p>

  <h3>Retention &amp; deletion</h3>
  <p>We keep trip and order records for [X YEARS] for tax and dispute purposes. To request deletion of your account and personal data, contact ${SUPPORT_EMAIL} — we will respond within [30] days. Some records may be retained where the law requires it.</p>

  <h3>Your rights</h3>
  <p>You can request a copy of your data, correct it, or ask us to delete it, by contacting ${SUPPORT_EMAIL}. [LAWYER: align this section with Pakistan's data protection framework as enacted.]</p>
`);

export const renderCancellation = page("Cancellation & Refund Policy", "August 2026", `
  <h3>Rides</h3>
  <ul>
    <li>Free to cancel before a driver accepts.</li>
    <li>After a driver accepts and is on the way, a cancellation fee of [Rs. XXX] may apply to cover their travel.</li>
    <li>No fee if the driver is more than [X] minutes late, cancels on you, or doesn't arrive.</li>
  </ul>

  <h3>Food orders</h3>
  <ul>
    <li>Free to cancel until the restaurant accepts.</li>
    <li>Once the kitchen has started cooking, the order cannot be cancelled — the food is already made.</li>
    <li>If your order arrives wrong, missing items, or unreasonably late, contact support within [24 hours].</li>
  </ul>

  <h3>Parcels &amp; errands</h3>
  <ul>
    <li>Free to cancel before pickup.</li>
    <li>After pickup, cancellation means the parcel is returned to you and the full fare applies.</li>
    <li>For errands, you are responsible for the cost of items already purchased on your behalf.</li>
  </ul>

  <h3>Refunds</h3>
  <p>Because Nova X is cash-based, refunds are handled case by case by our support team, typically as a credit to your Nova X account or a direct cash refund arranged with you. Contact ${SUPPORT_PHONE}.</p>
`);

export const renderDriverAgreement = page("Driver Agreement", "August 2026", `
  <p>This agreement is between you (the driver) and ${COMPANY}.</p>

  <h3>Your status</h3>
  <p>You are an <b>independent contractor</b>, not an employee. You choose when to go online, which offers to accept, and how many hours to work. You are responsible for your own taxes, vehicle costs, fuel, and insurance.</p>

  <h3>Requirements</h3>
  <ul>
    <li>Valid CNIC, driving licence, and vehicle registration — uploaded and verified before you can go online.</li>
    <li>A roadworthy vehicle matching the category you registered.</li>
    <li>Completion of Nova X onboarding and safety briefing.</li>
  </ul>

  <h3>Earnings &amp; commission</h3>
  <p>You collect fares in cash directly from riders. Nova X charges a platform commission of [15%] on ride and parcel fares, and [15%] on food delivery fees. Commission is settled [WEEKLY] against your Nova X account balance.</p>

  <h3>Conduct</h3>
  <ul>
    <li>Treat every rider with respect. Harassment of any kind results in permanent removal.</li>
    <li>No sub-contracting — the account holder must be the person driving.</li>
    <li>Follow all traffic laws. Nova X does not require or reward speeding.</li>
  </ul>

  <h3>Deactivation</h3>
  <p>We may deactivate your account for safety violations, fraud, sustained low ratings below [X], or expired documents. You may appeal by contacting ${SUPPORT_EMAIL}.</p>

  <h3>Insurance</h3>
  <p>[LAWYER / OPS: state clearly what insurance, if any, Nova X provides versus what the driver must carry. This is the highest-risk clause in this document — do not launch without it resolved.]</p>
`);

export const renderRestaurantAgreement = page("Restaurant Partner Agreement", "August 2026", `
  <p>This agreement is between your restaurant and ${COMPANY}.</p>

  <h3>Listing</h3>
  <p>Nova X lists your restaurant, menu and prices to customers in your delivery area. You control your menu, prices, prep time and open/closed status at all times through the partner portal.</p>

  <h3>Commission</h3>
  <p>Nova X charges [20%] commission on the food subtotal of each completed order. The delivery fee is separate and goes to the delivery rider.</p>

  <h3>Your obligations</h3>
  <ul>
    <li>Accept or decline orders promptly — an unanswered order is a lost customer for both of us.</li>
    <li>Keep your menu and availability accurate. Repeatedly cancelling for out-of-stock items affects your listing.</li>
    <li>Maintain applicable food safety and hygiene standards and licences.</li>
    <li>Keep a working contact number reachable during your open hours.</li>
  </ul>

  <h3>Payouts</h3>
  <p>Orders are paid in cash on delivery. Your rider collects the full amount; Nova X settles your share, net of commission, [WEEKLY] to the payout account on file.</p>

  <h3>Food quality &amp; complaints</h3>
  <p>You are responsible for the food you prepare. Where a customer complaint is upheld and caused by preparation, the refund is deducted from your next payout.</p>

  <h3>Termination</h3>
  <p>Either party may end this agreement with [14 days] notice. Nova X may suspend a listing immediately for food safety concerns.</p>
`);
