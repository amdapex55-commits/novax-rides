# Nova X Bike — pilot launch runbook

One service, one zone, cash, verified riders, live ops.

Everything you configure lives in **two files**:

- `js/launch.config.js` — services, pricing, zone, hours, company legal details
- `js/support.config.js` — WhatsApp, phone, email, ops escalation

Nothing else needs editing to run the pilot.

---

## Do not launch if any of these is true

The app checks most of these itself — open **Nova X Ops → Command** and look
at the launch readiness panel, or check the browser console on boot.

| Blocker | How it's enforced now |
|---|---|
| Pickup can fall back to a fake location | **Fixed.** `getPickupFix()` refuses any fix worse than 120m and every failure path makes the customer enter an address. No booking proceeds without a real pickup. |
| Legal pages still have placeholders | **Fixed.** Full policy text written. Company details come from `COMPANY` in `launch.config.js`; until they're filled, every legal page shows a "not ready to publish" banner. |
| Support number is fake or unmanned | **Fixed.** Placeholder detection hides every live-contact button and flags a blocker. You still have to supply real numbers. |
| Driver approval can be bypassed | **Fixed twice.** The gateway blocks unapproved drivers from going online, and `filterEligible()` re-checks the database on every match — so a driver suspended *after* going online is dropped from the pool immediately. |
| Ops cannot see active rides | **Fixed.** Ops fleet map now plots real driver positions (this was silently broken — the endpoint returned no coordinates at all). |
| No real drivers in one dense zone | **Your job.** Set `ZONE.enabled = true` and recruit inside it. |
| Launching everything at once | **Fixed.** Only `SERVICES.ride.live` is true. Food/parcel/errand show a coming-soon screen. |

---

## Day 1–2 — Fix and configure

**1. Fill in `js/support.config.js`**

```js
whatsapp: "923XXXXXXXXX",   // WhatsApp Business, digits only, no +
phone: "+92 3XX XXXXXXX",   // answered by a human during operating hours
email: "support@yourdomain.pk",
opsEscalation: "+92 3XX XXXXXXX",  // YOU, 24h, never shown to customers
```

Use a **WhatsApp Business** account, not a personal one — you need away
messages and the ability to hand the number to whoever is on the desk.

**2. Fill in `COMPANY` in `js/launch.config.js`**

Legal name, SECP registration number, NTN, registered address, effective date.
These print into the Terms, Privacy Policy and Rider Agreement.

**3. Get the policies reviewed by a Pakistani lawyer.** The text is complete
and specific to how Nova X works, but I'm not a lawyer and it isn't legal
advice. Budget a day for this; it's the item most likely to slip.

**4. Choose your zone**

```js
ZONE = { enabled: true, name: "Clifton & DHA",
         center: { lat: 24.8138, lng: 67.0300 }, radiusKm: 6 }
```

Smaller is better. 40 riders across Karachi is nobody nearby; 40 riders in a
6km circle is a 4-minute pickup.

**5. Deploy**

Backend first — the schema changed:

```bash
npx prisma db push     # adds distanceSource, pickupAccuracyMeters, storefront fields
```

Then push the frontend. Confirm the console prints no launch blockers.

---

## Day 3 — Onboard the first 30 riders

Do this **in person**. Not through the app, not over WhatsApp.

**Collect and verify against the original document:**

- CNIC — front and back
- Motorcycle driving licence — check it hasn't expired
- Bike registration — check the name, ask about it if it isn't theirs
- Number plate — photograph it, check it matches the registration
- Selfie / profile photo — this is what the customer sees
- Emergency contact — call it while they're standing there
- Payout details — JazzCash, Easypaisa or bank

**Explain, and check they've understood by asking them to repeat it:**

- They keep **85%** of every fare. Commission is 15%, settled every Monday.
- Fares are **cash, paid directly to them**. They owe us commission, not the
  other way round.
- The fare in the app is the fare. Asking for more is removal, not a warning.
- Cancelling after accepting costs a customer their time. A pattern of it
  ends the relationship.
- Helmet for them, helmet for the passenger, every trip.
- No account sharing, ever.
- What SOS does and when to use it.

**Give them:** a helmet if they don't have a spare, the support number, and
the ops escalation number.

**Do not approve anyone whose documents you haven't physically seen.**

---

## Day 4 — Internal testing

Run the full checklist in `TESTING.md`. Every scenario, not the happy path
only. The failure cases are the entire point — the happy path already works.

---

## Day 5 — 100–200 invited customers

Friends, family, their colleagues. People who will tell you the truth and
won't leave a one-star review while you're finding out what's broken.

---

## Day 6 — One zone, real rides

Ops desk staffed for every bookable hour. Watch the fleet map. Call people.

---

## Day 7 — Soft launch, limited hours

`HOURS` is set to 08:00–22:00. Keep it. A ride that goes wrong at 2am with
nobody at the desk is how you lose a customer permanently — and Karachi is a
city where word travels.

---

## Commission and settlement — decide before day 3

You're taking cash, so the money flows the "wrong" way: riders owe you.

| Decision | Current setting | Where |
|---|---|---|
| Commission | 15% of fare | `COMMERCIALS.driverCommissionPct` |
| Settlement day | Every Monday | `COMMERCIALS.payoutSchedule` |
| Negative balance limit | **Not set — decide this** | See below |
| Payout method | JazzCash / Easypaisa / bank | Collected at onboarding |

**The negative balance rule is the one that bites.** A rider who does 40
trips a week at Rs 200 owes you about Rs 1,200 by Monday. If they don't pay
and keep riding, that grows. Set a ceiling — Rs 2,000 is a reasonable
starting point — and cut off new trips above it. The app already warns a
rider before they hit a limit; you need to choose the number.

---

## What to watch in the first week

| Signal | Where | Bad sign |
|---|---|---|
| Failed matches | Ops → Command, stuck jobs | Requests with no rider found |
| Cancellations | Ops → Cancellations | Same rider appearing repeatedly |
| Estimated fares | `distanceSource = "ESTIMATED"` in the DB | Routing host failing often |
| Vague pickups | `pickupAccuracyMeters` on trips | Consistently high = address entry is the real path |
| Support tickets | Ops → Support | The same complaint three times is a product bug |

---

## What is deliberately NOT in the pilot

Stated so nobody wonders whether it's broken:

- Food, parcels, errands — built, tested, switched off
- Car and rickshaw — one vehicle type means one supply pool to fill
- Wallet / top-ups — cash only until settlement and reconciliation are solid
- "Name your own fare" bidding — needs enough riders online that a rejected
  bid finds someone else
- 24-hour service — limited hours so every ride is covered by a person
- In-app insurance — riders carry their own; the Safety Policy says so plainly
