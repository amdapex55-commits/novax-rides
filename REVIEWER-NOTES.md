# Nova Go — notes for App Store / Play reviewers

Paste the relevant sections into **App Store Connect → App Review Information**
and **Play Console → App access**. Fill the two `<…>` placeholders first.

---

## Why this app needs a test account

Nova Go is a bike ride-hailing service operating in **Karachi, Pakistan**. A
reviewer testing from outside Pakistan cannot complete a real ride, so we run a
**segregated test fleet**: the account below is matched only to simulated test
riders, and never to a real person on a real motorcycle.

That segregation is enforced server-side in both directions — a real customer
can never be matched to the test fleet either. Test rides move no money and do
not appear in any driver's earnings.

## Demo account

| | |
|---|---|
| **Email** | `<demo.customer@novagorides.com>` |
| **Password** | `<supplied in App Store Connect / Play Console — never in the repo>` |
| **Country** | Any. Location permission can be granted or denied. |

Generated with `scripts/seed-demo-accounts.js`. **There is no hardcoded OTP or
bypass code** — the account signs in through the same path as every user, and
its password can be rotated with one command.

## Walkthrough — about 4 minutes

1. **Open the app.** You'll see the welcome screen. Tap **Look around first**
   to browse without an account, or **Sign in** and use the credentials above.
2. **Allow location when asked.** The prompt appears at the *booking* step, not
   at launch — it is only requested at the point it is used. Denying it is
   fine: you can type an address instead.
3. **Tap "Where to?"** and enter any Karachi destination, e.g. `Dolmen Mall
   Clifton` or `Lucky One Mall`. Suggestions appear as you type.
4. **Review the fare.** It is fixed and shown before booking — base + per-km,
   with the calculation visible. This is the core of the product: no meter, no
   surge, no negotiation.
5. **Confirm.** A test rider accepts within a few seconds.
6. **Watch the tracking screen.** Live map, rider details with verification
   badge and number plate, and a pre-boarding safety checklist.
7. **Try the safety features** — the red **SOS** button (top right of the map)
   and **Share ride**, which generates a public live-tracking link.
8. **The ride completes automatically** after about a minute. You'll be asked
   to rate it and shown what to pay in cash.

## Things a reviewer usually looks for

**Account deletion** — Profile → Settings → **Delete my account**. Requires
typing DELETE. Also available without installing the app at
`https://novagorides.com/delete-account.html`, which is the URL given in the Play
listing's data-deletion field.

**Payments** — Nova Go is **cash only**. The passenger pays the rider directly
at the end of the trip. There are no in-app purchases, no card entry, and no
digital goods. Per App Store Review Guideline 3.1.5(a), transportation is a
physical service and does not use in-app purchase.

**Location use** — see the section below.

**Languages** — English and Urdu. Switch in Settings → Language. The app is
fully right-to-left in Urdu.

## Location permission — what we request and why

| Build | Permission | Why |
|---|---|---|
| **Nova Go** (passenger) | While in use | To place the pickup pin, find nearby riders and show the ride on the map. **No background location.** |
| **Nova Go Rider** (driver) | While in use **+ background** | A rider must transmit position while online so we can dispatch jobs to them, give the passenger live tracking, and locate them if the passenger raises SOS. Background access starts only when the rider explicitly taps **Go Online**, and stops when they go offline. |

The passenger app does **not** request background location. Please review the
two apps separately — they are different bundles with different permissions.

## Operating hours

Bookings are accepted **08:00–22:00 Pakistan Standard Time (UTC+5)** because a
human operations desk covers every ride. Outside those hours the app says so
rather than accepting a booking nobody can service.

**For review, this restriction is lifted** so the app is testable at any hour.
If you see an hours message, contact us and we will confirm it is disabled.

## Contact

<support@novagorides.com> · <+92 …> — we respond within one working day.
