# Play Store submission — what to declare, and what's already built

Two apps ship to Play: **Nova Go** (customer) and **Nova Go Driver**. They have
different permissions and different Data Safety answers. Submit them separately.

---

## Data Safety form

**Get this right rather than fast.** A declaration that overstates what you
collect is a policy violation in the same way understating is — Google checks
declarations against observed traffic, and a mismatch is a rejection.

### Nova Go Driver

| Data type | Collected | Shared | Purpose | Notes |
|---|---|---|---|---|
| Precise location | Yes | **Yes — Mapbox** | App functionality, dispatch | Sent to Mapbox as map tile requests. **Not** shared with Sentry (see below). |
| Approximate location | Yes | Yes — Mapbox | App functionality | Same channel |
| Name | Yes | No | Account management | |
| Email address | Yes | No | Account management | |
| Phone number | Yes | No | Account management | |
| Address | Yes | No | Account management | Driver signup only |
| Photos (documents) | Yes | No | Account management | CNIC + driving licence, stored in Cloudflare R2 |
| Payment info | Yes | No | App functionality | Payout destination only — no card is ever stored |
| Crash logs | Yes | **Yes — Sentry** | Diagnostics | |
| Diagnostics / performance | Yes | Yes — Sentry | Diagnostics | |

### Nova Go (customer)

Same as above **minus** address, documents and payout info.

### Answers to the standard questions

- **Is data encrypted in transit?** Yes — HTTPS/WSS everywhere.
- **Can users request deletion?** Yes — in-app (Profile → Delete account) and
  at a public URL, see below.
- **Is data collected required?** Location on the driver app is required to
  receive jobs. Everything else on the customer app is required to book.

### ⚠️ The Sentry answer people get wrong

It is tempting to tick "location shared with Sentry" because Sentry sees error
context. **We specifically prevent that.** `beforeBreadcrumb` and `beforeSend`
redact `lat`, `lng`, `phone`, `code` and `token` from every captured URL, and
`sendDefaultPii` is off on both the browser and the backend. Verified in a
browser — a captured URL comes back as
`lat=[redacted]&lng=[redacted]&phone=[redacted]`.

So: **crash logs shared with Sentry, location not.** Declaring location sharing
we don't do is a false declaration.

---

## Prominent location disclosure — built

Required before requesting `ACCESS_BACKGROUND_LOCATION` or starting a location
foreground service. Going straight to the Android system prompt is the most
common rejection for driver apps.

`js/locationDisclosure.js` shows it before `startDriverTracking()` is ever
called (see `goOnline()` in `js/views/driverHome.js`). It contains the phrase
reviewers look for — **"even when the app is closed or not in use"** — and
declining leaves the driver offline rather than proceeding anyway.

**Don't reword it without re-reading the policy.** The version key in
`novago_location_disclosure_v1` exists so changed wording re-prompts everyone.

---

## Account deletion — built

Google requires both routes:

- **In-app:** Profile → Delete account, on both the customer and driver apps.
  Immediate. Typed `DELETE` confirmation.
- **Public URL:** `https://<your-domain>/delete-account.html` — a real form that
  posts to `POST /api/v1/users/deletion-request`. Put this URL in the Play
  Console data-deletion field.

**What actually happens:** the account is *anonymised*, not dropped. Name,
email, address, password, CNIC and licence images are erased and the phone
becomes an unusable placeholder. Completed trips and ledger rows survive
without identifiers, because a trip has two people in it and the ledger is the
platform's books. Nothing remaining identifies the person — which is what the
policy is actually about.

R2 objects are deleted by the ops runbook; this backend deliberately holds no
delete credentials for that bucket.

---

## Demo accounts for reviewers

Reviewers test from outside Pakistan. A driver who signs up normally sits at
`kycStatus: PENDING` and sees a waiting screen — which reads as "can't access
the app" and gets rejected.

```bash
DEMO_PASSWORD='pick-something' npm run seed:demo
```

Creates a pre-approved customer and a pre-approved driver with a vehicle on
file. Put the credentials in **Play Console → App access → "All or some
functionality is restricted"**, one entry per app.

**These are ordinary accounts, deliberately.** No hardcoded OTP, no magic
number in `auth.service.ts`. That shortcut is a permanent backdoor to a driver
account in a public repo — anyone reading the source could dispatch themselves
real passengers. These log in through the same path as everyone, can be
suspended from ops, and rotate with one command.

---

## Background location declaration + video

Required for the driver app. Record on a real phone:

1. Open Nova Go Driver, sign in
2. Tap **Go online** → the disclosure modal appears → accept
3. Grant **Allow all the time** in the Android dialog
4. Show the persistent notification: *"You're online — Nova Go is finding you jobs"*
5. **Lock the screen. Wait 3 minutes. Walk 100 metres.**
6. Show the ops fleet map with the driver still green and moved

Step 6 is the only step that proves anything. Upload unlisted to YouTube and
link it in the declaration form.

---

## Before you submit

- [ ] Support contacts filled in (`js/support.config.js`) — the app hides live
      contact buttons until they are
- [ ] `COMPANY` filled in (`js/launch.config.js`) — legal pages show a
      "not ready to publish" banner until then
- [ ] Privacy Policy reachable at a public URL
- [ ] `delete-account.html` reachable and **actually submitting** — click it
- [ ] Demo accounts seeded and credentials in App access
- [ ] Manifest permissions added (see `BUILD_APPS.md`) — background GPS does
      not work without them
- [ ] Background location video recorded and linked
- [ ] Ship **Android first.** The market here is overwhelmingly Android and
      Apple's review is slower and stricter.
