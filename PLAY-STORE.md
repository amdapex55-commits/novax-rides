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

---

## Android build state (2026-08-13)

`android/` is now generated and gitignored. `scripts/select-app.js` rewrites
`AndroidManifest.xml` on every build, so permissions follow whichever app you
built — this is the part that is easy to get wrong and expensive to undo.

| Build | Permissions | Why |
|---|---|---|
| customer | INTERNET, ACCESS_NETWORK_STATE, COARSE, FINE | Foreground pin only. **No background location** — adding it means a Play background-location declaration and a policy review for a capability this build never uses, which is a common rejection. |
| driver | the above + BACKGROUND_LOCATION, FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION, POST_NOTIFICATIONS | Tracked through a whole shift with the screen off. Without these, position updates stop the moment the phone locks. |
| merchant / ops | INTERNET, ACCESS_NETWORK_STATE | A kitchen tablet and a dispatch desk never need a position. |

To build one:

```bash
npm run cap:sync:driver && npx cap open android
```

### What still cannot be done from this machine

There is **no JDK and no Android SDK installed here**, so no AAB was produced.
`npx cap add android` only scaffolds the Gradle project; compiling needs
Android Studio. Everything below is yours to do on a machine with it:

1. Install Android Studio (brings its own JDK and SDK).
2. `npm run cap:sync:customer` → `npx cap open android` → Build → Generate
   Signed Bundle → **create a keystore and back it up somewhere you will not
   lose it.** Losing it means you can never update that listing again; the
   only remedy is publishing a new app under a new package name.
3. Repeat for `cap:sync:driver` — separate keystore is fine, separate listing
   is required (different appId: `com.novago.app` vs `com.novago.driver`).
4. Set `targetSdk` per Google's current floor. Capacitor 6 ships API 34;
   check `android/variables.gradle` against the requirement in force on your
   submission date and raise it if needed.
5. `minSdk` 23–24 is the right call for this market — it covers the Tecno /
   Infinix / Realme hardware most Karachi riders carry.

### Blocking items that are decisions, not code

- Play Console account ($25, government ID, two-step verification).
- **Closed testing: 12–20 real testers for 14 consecutive days** before a
  personal account gets production access. This is the long pole. Start it the
  day the first AAB builds, not after everything else is polished.
- Store listing copy and graphics (feature graphic 1024×500, 8 screenshots).
  Screenshots can be captured from the deployed web app on a phone-sized
  viewport — the UI is identical.
- Support contacts in `js/support.config.js` and `COMPANY` in
  `js/launch.config.js`. The app currently logs 5 launch blockers on every
  boot because of these; they appear in Terms, Privacy and both agreements.
