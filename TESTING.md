# Nova Go Bike — pre-launch test plan

The happy path already works. **These are the tests that matter**, because
every one of them is a way a real customer's first ride goes wrong.

Run everything before Day 5. Anything that fails is a launch blocker unless
you write down why it isn't.

---

## A. Configuration (2 minutes, do this first)

| # | Test | Expected |
|---|---|---|
| A1 | Open any app, check the browser console | Either no launch-blocker warning, or a list you're deliberately ignoring |
| A2 | Open Ops → Command | Launch readiness panel shows all blockers cleared |
| A3 | Open Help in the customer app **before** filling support config | WhatsApp/call buttons **absent**, ticket button primary |
| A4 | Fill support config, reload Help | WhatsApp and call buttons appear |
| A5 | Open `#/legal/terms` before filling `COMPANY` | Red "not ready to publish" banner |
| A6 | Fare consistency: compute 6.2 km by hand | `60 + 6.2×22 = 196.4 → 195`. App quote and server fare must both be **Rs. 195** |
| A7 | Compute 1 km | `60 + 22 = 82 → minimum applies → Rs. 150` |

---

## B. GPS and pickup — the P0

| # | Scenario | How to reproduce | Expected |
|---|---|---|---|
| B1 | Permission denied | Deny location in browser settings | "Location is off — set your pickup manually". **No booking possible on GPS.** |
| B2 | Vague fix | Test indoors on wifi, or throttle to a coarse location | "±NNNm — too vague to send a rider". Booking blocked. |
| B3 | Good fix | Outdoors, or devtools → Sensors → custom location | "Picking you up here · ±NNm", pin on map, booking allowed |
| B4 | Slow fix | Devtools → Network throttle | Waits up to 12s, then falls back to manual entry — never hangs forever |
| B5 | Typed pickup | Type "Dolmen Mall Clifton" as pickup | Geocodes, books, **no GPS needed at all** |
| B6 | Outside zone | Set `ZONE.enabled=true`, spoof a location 30km out | "We're not in your area yet", booking blocked |
| B7 | **Fake fallback check** | Deny GPS, then try every route into booking | Confirm no path ever books at Karachi city centre. This is the bug that ruins pilots. |

---

## C. Addresses and routing

| # | Test | Expected |
|---|---|---|
| C1 | Type "gulsha" (partial) | Suggestions appear within ~1s, local landmarks instantly |
| C2 | Type nonsense: "asdfgh" | "Couldn't find that address" — booking blocked, no crash |
| C3 | Pick a suggestion | Pin drops, road route draws (a curved line following streets, **not** a straight line) |
| C4 | Block `router.project-osrm.org` in devtools | Falls back to estimate; fare screen says "Distance is estimated"; booking still works |
| C5 | Compare a known trip | Road distance should be ~1.2–1.6× the straight line. If it equals it exactly, routing isn't working |
| C6 | Block both geocoders | Local landmarks still resolve; free text fails honestly |

---

## D. Booking edge cases

| # | Test | Expected |
|---|---|---|
| D1 | **Double-tap Request ride** | Exactly ONE trip created. Tap fast, twice, on a throttled connection |
| D2 | Book outside operating hours | Blocked with the closed message |
| D3 | Book as guest | Redirected to OTP at the point of booking, not before |
| D4 | Guest browses first | Can see home, map, fare estimate without an account |
| D5 | No riders online | "No riders available" — not a spinner forever |
| D6 | Rider declines | Cascades to the next rider automatically |
| D7 | Rider cancels after accepting | Customer told, re-matched, not charged |
| D8 | Customer cancels | No fee, trip closed cleanly |
| D9 | Weak internet | Throttle to Slow 3G through a whole booking — no duplicate trips, no stuck states |
| D10 | **Tampered distance** | Send `roadDistanceKm: 0.1` for a 10km trip via curl | Server logs "Rejected implausible" and charges the correct fare |

---

## E. Driver app gates

| # | Test | Expected |
|---|---|---|
| E1 | Unapproved driver tries to go online | Blocked, "not approved yet", socket disconnected |
| E2 | Driver denies location permission | Cannot go online |
| E3 | Driver offline | Receives no offers |
| E4 | **Suspend a driver mid-shift** | Ops suspends while they're online → they receive no further offers, and are evicted from the geo pool. *This was broken before — test it.* |
| E5 | Driver accepts the same ride twice | Second accept rejected — no double assignment |
| E6 | Approved driver, full loop | Go online → offer → accept → navigate → start → end → earnings updated |
| E7 | Commission ledger | After a completed trip, commission appears and matches 15% |

---

## F. Safety

| # | Test | Expected |
|---|---|---|
| F1 | Share ride link | Opens for someone with no account; shows live position; **no phone numbers exposed** |
| F2 | Share link after trip ends | Stops updating / shows completed |
| F3 | SOS | Places the emergency call and logs an incident ops can see |
| F4 | Customer sees before boarding | Rider name, photo, rating, **number plate** |
| F5 | Rating after trip | Saves, affects the rider's average |

---

## G. Ops

| # | Test | Expected |
|---|---|---|
| G1 | Fleet map | Online drivers appear as dots at real positions. *Was returning no coordinates — verify.* |
| G2 | Stuck jobs | A request unmatched >3 min appears |
| G3 | Manual assign | Ops can hand a job to a specific driver |
| G4 | Cancellations list | Shows both sides' cancellations |
| G5 | Suspend + reason | Driver suspended, reason shown to them |
| G6 | Support tickets | Customer ticket arrives and can be resolved |
| G7 | Desktop layout | On a laptop, ops uses full width with a sidebar — not a phone column |

---

## H. Parked services

| # | Test | Expected |
|---|---|---|
| H1 | Tap Food / Parcel / Errands on home | Coming-soon screen, "tell me when it's live" works |
| H2 | Navigate directly to `#/food/browse` | Redirected to coming-soon, not a broken checkout |
| H3 | Flip `SERVICES.food.live = true`, reload | Real food screens return with no other code change |

---

## I. The two full runs

**50 internal rides.** You and your team, both roles, real phones, real
streets. Rotate who plays customer. Count how many need a phone call to
resolve — that number is your support load per 50 trips.

**20 real rides with friends and family.** People who'll tell you the truth.
Ask each one: *did anything confuse you?* and *was the fare what you
expected?*

**Then one full day, invited users only, before any advertising.**

---

## Recording results

For each failure, write down: what you did, what happened, what should have
happened. A test plan with no failures recorded usually means the tests
weren't really run.

---

# Added since this document was written

Everything below shipped after the original test plan and is **not covered by
the steps above**. A pass on the old plan no longer means the product works.

## Dispatch and matching

- [ ] **Scored matching.** With two riders online at different distances, the
      nearer one is offered first. Then make the nearer one decline twice and
      confirm the further one starts winning — acceptance rate is part of the
      score (`dispatch.util.ts`).
- [ ] **New rider is not buried.** A rider with no history must still receive
      offers; they score neutrally, not badly.
- [ ] **Radius expansion.** With nobody within 1km but someone at 4km, the job
      is still placed.
- [ ] **Ops escalation.** Book with no riders online. At **90s** the customer
      sees "Nova Go Ops is watching this ride". At **3 min** it becomes "placing
      this ride by hand", and the job appears in ops → stuck jobs.
- [ ] **No dead spinner.** That same trip must have `noDriverFoundAt` set, and
      must never sit silently in REQUESTED.

## Fare integrity

- [ ] Book a trip and check `quotedFare`, `acceptedFare` and `fareVersion` are
      all set at creation.
- [ ] Complete it. `finalFare` must equal `acceptedFare` exactly.
- [ ] `GET /trips/:id/events` returns the full sequence: requested → quoted →
      offered → accepted → arrived → started → completed.
- [ ] Ops → stuck job → **See what happened** renders that sequence.

## Push notifications

- [ ] Grant permission after the first booking (it must NOT prompt at launch).
- [ ] Rider accepts → passenger's phone shows "Rider found" with the app closed.
- [ ] Rider arrives → notification. Trip completes → notification with the fare.
- [ ] Sign out, sign in as someone else on the same phone, and confirm the
      previous user's notifications stop.

## Driver liveness

- [ ] Go online. `driver-status` shows `receivingJobs: true`.
- [ ] Force-stop the app. Within 60s the driver stops being matched.
- [ ] **Not getting jobs?** lists the real reason, not a generic message.
- [ ] Test on a Xiaomi/Redmi, Oppo, Realme and Vivo specifically — their
      battery managers are the main cause of this failure in this market.

## Commission and settlement

- [ ] Drive until owing >75% of the limit — the driver home shows the amber
      strip with how much room is left.
- [ ] Cross the limit — jobs stop AND the app says why, with how to pay.
- [ ] Settle in ops; jobs resume without toggling offline and back on.

## Cancellation

- [ ] Cancel before a rider accepts → no fee, no count against anyone.
- [ ] Cancel within 30s of accepting → no fee.
- [ ] Rider cancels after accepting → customer charged nothing; it counts
      against the rider's reliability.

## Review fleet (before submitting to the stores)

- [ ] With `REVIEW_FLEET_ENABLED=true`, the demo customer completes a full trip
      end to end with no human involved.
- [ ] **A real customer is never matched to a test rider, and a real rider is
      never offered a test trip.** This is the safety property; verify it
      deliberately with one real and one test account online at once.
- [ ] A completed test trip creates **no ledger entries** and does not appear
      in any driver's earnings.

## Localisation and appearance

- [ ] Switch to Urdu. Whole app is right-to-left; fares, plates and phone
      numbers stay left-to-right and readable.
- [ ] Dark mode on the customer app follows the system; the driver app defaults
      to dark.

## Static checks (run before every push — the hook does this)

```bash
npm run check
```
