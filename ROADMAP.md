# Nova Go — road to the App Store and Play Store

Numbered so we can say "do 14" and both know what that means.
Status: **[DONE]** · **[YOU]** needs you (account, money, ID, a Mac) · **[TODO]** buildable.

Last updated 2026-08-18. See **Session log** at the foot of this file
for everything that changed between 08-14 and 08-18.

---

## Three corrections to the source roadmap

**A. Parcels and errands ARE live. Do not "fix" the website to say otherwise.**
The source roadmap says the site wrongly claims parcels/errands are live and
should be changed to "coming soon". That is backwards. `SERVICES.parcel.live`
and `SERVICES.errand.live` are `true`, the backend's `LaunchPolicyService`
defaults `DELIVERY` and `ERRANDS` to on, and there are tests asserting it.
Following that advice would make the site lie in the opposite direction and
switch off two working services. **Food and taxi are the parked ones** — both
already say so on the site and in the app.

**B. No hardcoded reviewer OTP. Ever.**
The source roadmap's reviewer instructions include a fixed phone + OTP pair.
That is a permanent, unremovable backdoor to a DRIVER account living in a
public repo — anyone who reads it can dispatch themselves real passengers.
`scripts/seed-demo-accounts.js` already exists for this: ordinary accounts,
ordinary passwords, same login path as everyone, rotatable in one command,
credentials given to Apple/Google in the console and never in the repo.

**C. Push notifications do not exist.**
The roadmap calls them "absolutely necessary" and lists fifteen types, without
noting there is currently **zero** push infrastructure — no FCM project, no
APNs key, no device-token storage, no send path. This is a real build (item
21), not a configuration step, and it gates the driver app.

---

## Stage 0 — Blocking everything (do these first)

1. **[YOU] Promote an ADMIN account.** Nothing in the codebase could create
   one; I wrote `scripts/make-admin.js`. Until this runs, no driver can be
   approved, so no driver can go online, so **no trip can ever complete**.
   `railway run node scripts/make-admin.js ops@novagorides.com`
2. **[YOU] Fill `js/support.config.js`** — WhatsApp, phone, email, ops
   escalation. Four of the six launch blockers the app logs on every boot.
3. **[YOU] Fill `COMPANY` in `js/launch.config.js`** — legal name, SECP
   number, NTN, registered address, effective date. These appear in Terms,
   Privacy and both agreements. A reviewer must never find a blank.
4. **[YOU] Fill `js/settlement.config.js`** — Easypaisa / JazzCash / Raast /
   bank. Without it a blocked driver is told they owe money and not how to pay.
5. **[YOU] Buy `novagorides.com`** and point it at Pages. In the cart as of
   2026-08-18, checkout next session. The domain CHANGED from `novago.pk` —
   every reference in both repos now points at `novagorides.com`, and the
   bundle IDs derive from it (item 15). Two addresses were deliberately NOT
   renamed because they are live accounts in the production database:
   `ops-bot@novago.pk` and `admin@novago.com`.
6. **[DONE 2026-08-17] Run one complete trip end to end.** Request → match →
   accept → arrive → start → complete → rate. **This has now happened**, driven
   in two browsers side by side with the two screens correlated at every
   transition. Fare Rs 215, commission Rs 32.25, net Rs 182.75, and each number
   checked against what the app showed rather than what the API returned.
   The whole roadmap below assumed the product works; that is now tested
   instead of hoped. See the Session log for the eleven bugs this flushed out.

## Stage 1 — Web becomes the trust + acquisition layer

7. **[DONE]** Service states honest on both site and app (rides/parcels/errands
   live; food/taxi parked, with a way in for kitchens and car drivers).
8. **[DONE]** Karachi-wide availability consistent across landing page, app
   config, backend defaults, `.env.example` and both runbooks.
9. **[DONE]** Ops "command center" panel relabelled as an illustration — it
   read as a live feed showing zero activity.
10. **[TODO] Platform-aware download buttons.** iPhone → App Store, Android →
    Play, desktop → QR. Replaces "Book a bike" as the primary CTA once apps
    exist. **Do this last** — pointing at store pages that 404 is worse than
    the current CTA.
11. **[TODO] Legal URLs on the real domain**: `/privacy`, `/terms`, `/safety`,
    `/cancellation`, `/account-deletion`, `/support`, `/driver-terms`. Pages
    exist; they need the domain and stable public paths.
12. **[DONE]** `delete-account.html` files a real deletion request. Public, not
    behind login — Google requires an external route as well as in-app.

## Stage 2 — Store accounts (long lead time, start early)

13. **[YOU] Google Play Developer account** — $25 once, government ID,
    two-step verification.
14. **[YOU] Apple Developer Program** — **$99/year**, and prefer an
    **Organization** enrolment over a personal one for a transport company.
    Organization needs a D-U-N-S number, which can itself take **1–2 weeks**.
    Start this before you need it.
15. **[DONE 2026-08-18] Bundle IDs settled and made consistent**:
    `com.novagorides.customer`, `com.novagorides.driver`,
    `com.novagorides.merchant`, `com.novagorides.ops` — reverse-DNS of
    `novagorides.com`, the domain being bought. Applied in all six places
    (`capacitor.config.json`, the four `capacitor/*.json`, `select-app.js`)
    plus the Android `namespace`, `applicationId` and Java package.
    **[YOU] Still to do:** reserve them in App Store Connect and the Play
    Console when those accounts exist. They cannot change after first upload.

## Stage 3 — Native builds

16. **[DONE]** Android project scaffolded; `scripts/select-app.js` rewrites
    `AndroidManifest.xml` per build so the customer app never ships
    background location.
17. **[YOU] Install Android Studio**, then build signed AABs for customer and
    driver. **Back up the keystore** — losing it means never updating that
    listing again.
18. **[TODO] GitHub Actions build workflow** — builds both AABs in CI, keystore
    in encrypted secrets. Removes the "only Aisha's Mac can ship" problem and
    backs up the keystore by definition. *(This is the answer to "should we use
    Expo" — no; Expo is React Native and we are Capacitor. EAS's appeal was
    cloud builds, and Actions gives that without a rewrite.)*
19. **[DONE] A Mac with Xcode.** Verified 2026-08-18: **Xcode 26.6** with the
    **iOS 26.5 SDK**, plus CocoaPods 1.17.0 installed via Homebrew. This was
    listed as a hard blocker and it is simply satisfied.
20. **[DONE 2026-08-18] `npx cap add ios` + Info.plist usage strings.**
    Project generated at `ios/`, pods installed, all five Capacitor plugins
    linked. Usage strings are written **per build** by `scripts/select-app.js`
    (`IOS_USAGE`), which also clears the other builds' strings first — only the
    driver build carries the Always-location strings and
    `UIBackgroundModes: location`. Capacitor generates the project with ZERO
    usage strings, and on iOS a missing one is a crash rather than a
    rejection. See `IOS-SETUP.md`.

    While wiring this I found that `select-app.js` never rewrote the Android
    `applicationId` — `cap add android` set it once from the customer config
    and nothing changed it since, so **every AAB this project could build
    carried the customer's identity, including the driver one.** The verify
    step missed it because it checks `NOVAGO_APP` in `index.html`, which is the
    web layer, not the store identity. Both platforms' identities are now
    written on every build.

## Stage 3b — Found on 2026-08-18, when Android Studio first opened the project

**A. [YOU, 2 minutes] SDK Platform 34 is not installed.** `variables.gradle`
asks for `compileSdkVersion = 34`; the only platform on this Mac is
`android-37.0`. The first Gradle sync fails on this and Android Studio offers
to download it — accept, and the sync goes green. This blocks nothing else.

**B. [TODO — blocks upload, not testing] targetSdk 34 is very likely below
Play's floor.** Google ratchets the minimum target API for NEW submissions
every August, roughly to "within a year of current". Current here is API 37.
A build targeting 34 will compile, install and run on a real handset perfectly
well — so **it does not block any device testing** — but it is likely refused
at upload.

Fixing it is not a one-line bump. `variables.gradle` is generated, so the
change has to live in `select-app.js` like the applicationId does; and moving
past 34 means moving off AGP 8.2.1 / Gradle 8.2.1, which is what Capacitor 6
scaffolds. Raising targetSdk also opts the app into Android 14/15/16 behaviour
changes — foreground-service types most of all, which is precisely the
machinery the driver app's background GPS depends on.

So: **verify Play's actual current minimum in the console before doing this
work**, then do it deliberately with a real handset to retest against. Do NOT
rush it in the week before submission — it lands on the one subsystem with no
test coverage and no hardware verification.

## Stage 4 — The native capabilities reviewers look for

21. **[DONE, except credentials] Push notifications.** Built 2026-08-14:
    `PushService` (console + FCM HTTP v1 via a locally signed service-account
    JWT, no firebase-admin), `device_tokens` table keyed on the token so a
    shared handset re-homes to its new owner, dead-token pruning, and
    `NotificationsService.notify()` writing the in-app row and the push from
    one call so they cannot drift. Wired to job offer / rider found / rider
    arrived / trip complete. Permission is asked after the FIRST BOOKING, not
    at launch — iOS allows one prompt and a decline is permanent.
    **[YOU] What remains:** create a Firebase project, upload an APNs key to
    it, and set `PUSH_PROVIDER=fcm` + `FCM_SERVICE_ACCOUNT_JSON` in Railway.
    Until then it runs in console mode and delivers nothing.
22. **[DONE, needs a real handset] Background location for the driver app
    only.** Built, not stale-TODO as this file said until 08-18.
    `@capacitor-community/background-geolocation` is installed,
    `js/driverLocation.js` wraps it (falling back to browser geolocation on the
    web build), `js/views/driverHome.js` drives it, and `scripts/select-app.js`
    writes `ACCESS_BACKGROUND_LOCATION` + `FOREGROUND_SERVICE` +
    `FOREGROUND_SERVICE_LOCATION` into `AndroidManifest.xml` **for the driver
    build only** — the customer build ships neither.
    **What remains is verification, not construction:** this has never run on a
    physical Android phone. It stays the biggest technical risk in the list
    until it survives item 39's device matrix, because the failure mode is a
    driver who believes they are online and is sending nothing.
23. **[TODO] Deferred location permission on the customer app.** Ask at "Where
    are you going?", not on launch, with the purpose string. Apple requires
    relevance; asking early is a common rejection.
24. **[TODO] Secure token storage.** Tokens are in `localStorage` today. Move to
    Keychain / EncryptedSharedPreferences in the native shells.
25. **[TODO] Deep links** — `novagorides.com/ride/NX123456` opens the app, falls back
    to the store. Also referral and shared-trip links.
26. **[TODO] Native states for no internet / expired session / permission
    denied / location unavailable.** Partly done (`js/net.js`, offline queue).

## Stage 5 — Reviewer experience (where rejections actually come from)

27. **[TODO] Demo accounts via `seed-demo-accounts.js`** — pre-approved
    customer and driver, credentials into App Store Connect and Play Console.
    **Not** a hardcoded OTP. See correction B.
28. **[DONE, needs switching on] A deterministic test fleet.** Built
    2026-08-14. `isTestAccount` on users and `isTest` on trips, with matching
    segregated in BOTH directions inside `LocationService.filterEligible` —
    a reviewer's ride can never reach a real rider, and a paying customer can
    never be matched to the test fleet. `ReviewFleetService` keeps test drivers
    online and walks their trips through accept → arrive → start → complete.
    Test trips are excluded from the ledger, settlement and loyalty totals, and
    ops sees `isTest` on the stuck-jobs list. Four independent gates; off by
    default. Five tests assert the produced query directly.
    **[YOU] To use it:** run `seed-demo-accounts.js` (it now sets the flag),
    then set `REVIEW_FLEET_ENABLED=true` in Railway before submitting.
29. **[DONE] Written reviewer instructions** — `REVIEWER-NOTES.md`, step by step, including SOS,
    share-ride and account deletion.
30. **[TODO] Strip the shipped binaries** — no ops, no admin, no debug menus,
    no placeholder numbers. Customer build ships customer only.

## Stage 6 — Declarations (get these exactly right)

31. **[DONE — draft] Play Data Safety form** — `DATA-SAFETY.md`, checked against the schema — every type collected, including CNIC,
    licence photos, payout details and precise location, plus third-party SDKs.
    Draft is in `PLAY-STORE.md`; it must match what the binary actually does.
32. **[DONE — draft] Apple App Privacy** — in `DATA-SAFETY.md` — the equivalent in App Store Connect.
33. **[TODO] Background-location declaration + demo video** for Play. Driver app
    only, with the justification that a driver must transmit position while
    online to be dispatched and tracked for passenger safety.
34. **[TODO] Content rating questionnaire** and target-audience declarations.
35. **[PARTLY DONE] Store assets** — copy in `STORE-LISTING.md`, capture guide in `screenshots/`; the PNGs themselves need capturing on your machine — icon, feature graphic (1024×500), 8 screenshots
    per app showing real UI, short (80) and full (4000) descriptions. Capture
    screenshots from the deployed web app at phone width; the UI is identical.

## Stage 7 — Testing before submission

36. **[YOU] Line up 12–20 real testers now.** Play requires them to use the app
    for **14 consecutive days** before a personal account gets production
    access. **This is the longest pole in the entire plan** and it is purely
    social — start it the day the first AAB builds, not after polish.
37. **[TODO] Play internal testing** → closed testing (the 14 days) →
    production.
38. **[TODO] TestFlight**, internal then external.
39. **[TODO] Device matrix** — Xiaomi/Redmi/POCO, Oppo, Realme, Vivo especially.
    Their battery managers kill foreground services; `BACKGROUND-GPS.md` flags
    this as the main driver-app failure mode in this market.
40. **[TODO] Weak-network testing** — 3G, network switching, app killed, phone
    restarted.

## Stage 8 — Launch

41. **[TODO] One dense recruitment cluster.** Customers can book from anywhere
    in Karachi (item 8); riders should be *recruited* one district at a time.
    Watch no-match rate and pickup ETA by area.
42. **[TODO] Set `LAUNCH_HOURS_ENABLED=true`** before real customers. It is off
    for testing.

---

## Items I added that the source roadmap missed

- **1** (no admin exists — blocks literally everything)
- **6** (no trip has ever completed)
- **14** D-U-N-S lead time and the $99/year cost
- **15** bundle-ID inconsistency (`com.` vs `pk.`) — unfixable after upload
- **18** CI builds, and the Expo answer
- **21** push does not exist at all
- **28** the reviewer will see "no riders available" without a test fleet
- **36** the 14-day / 12-tester rule, which decides the launch date

## Items I dropped

- "Make the website say parcels/errands are coming soon" — factually wrong,
  see correction A.
- "Hardcoded reviewer OTP" — see correction B.
- "Instant approval" framing — no such thing exists for either store.
- The `track.novagorides.com` / `api.novagorides.com` subdomain split — real, but it is
  infrastructure polish and nothing here is blocked on it.

---

# Session log — 2026-08-14 → 2026-08-18

**Read this first if you are a new session picking Nova Go up cold.** The
numbered list above is the plan; this is the state of the ground. Everything
here is committed and pushed — both repos were clean at the time of writing.

## Orientation in ninety seconds

Two repos, both under `~/Documents/GitHub/`:

- **`novax-rides`** — the frontend. Vanilla ES modules, **no bundler, no build
  step**. Four apps (customer / driver / merchant / ops) served from ONE
  codebase; `window.NOVAGO_APP` is set by the entry HTML and `js/appMode.js`
  gates routes off it. Deployed to GitHub Pages by `.github/workflows/deploy.yml`.
- **`novax-backend`** — NestJS + Prisma + Postgres + Redis, hosted on Railway.
  Socket.IO on the `/location` namespace. 115 tests across 12 suites.

Because there is no bundler, **you edit the file that ships**. There is also no
type checker, so three zero-dependency scripts stand in for one — run them
before every push:

```
npm run check      # check-syntax.js + audit.js — parses all 69 modules
npm run verify     # verify-build.js
```

`scripts/audit.js` holds project-specific rules that have each caught a real
bug (e.g. refusing a built value in a Leaflet content sink). Add to it when you
find a new class of mistake; that is what it is for.

## The invariants — do not break these

**1. Two riders can never take the same job.** One customer booking is offered
to `BROADCAST_TO = 3` drivers simultaneously. Safety comes from the database,
not from the app, in `trips.service.ts`:

```ts
const claimed = await this.prisma.trip.updateMany({
  where: { id: tripId, status: "MATCHING", driverId: null },
  data: { status: "MATCHED", driverId, matchedAt: new Date() },
});
if (claimed.count === 0) throw new ConflictException("Another rider took this one first.");
```

The guard lives in the WHERE clause, so the loser's update matches zero rows.
The frontend (`js/offerStack.js`) treats a 409 as normal and says "Another
rider took that one." **Never turn this into read-then-write.**

**2. Cash trips create a debt.** `ledger.service.ts` writes two entries on
completion: `TRIP_PAYOUT +182.75` (earnings) and `TRIP_CASH_COLLECTED -215.00`
(the fare the driver physically holds). Balance sums everything, earnings sum
only `PAYOUT_TYPES`. Net effect: the driver owes Nova Go Rs 32.25. Before this,
wallets could never go negative and settlement never triggered.

**3. Sessions are app-scoped.** `js/api.js` keys storage as
`novago_${window.NOVAGO_APP}_`. All four apps share one origin, so a single key
meant signing into the driver app silently destroyed the customer session —
this was the cause of the "signed out again and again" complaint, which is a
safety issue on a motorbike, not an annoyance. `migrateLegacyKeys()` adopts an
old session only when its role matches the build.

**4. The JWT is not the authority; the database is.** `jwt.strategy.ts` reloads
the user on every request so suspending an account takes effect immediately
rather than whenever the token happens to expire.

## What shipped in this window

**Frontend — 62 commits, `b8a2540` … `386c2f4`.** Highlights:

- **Live tracking rebuilt** (`js/views/rideTracking.js`). Moving rider pin,
  inline route polyline, live ETA, 6s poll that is idempotent via a
  `lastSignature` so re-renders don't flash the drawer. Route refresh throttled
  to 250m/20s to stay off the public OSRM demo server.
- **The live pill** (`js/liveActivity.js`, `css/premium.css`) — an iOS Live
  Activity-style widget pinned over the home screen, tap to expand to the full
  map. Two moods: a bike traversing the bar en route, a breathing card on
  ARRIVED. Home screen only; `suppressed()` enforces that.
- **Offer stack** (`js/offerStack.js`) — jobs arrive as stacked cards instead of
  a full-screen takeover that blacked out the rider's phone.
- **Driver signup is ONE form.** CNIC, licence, vehicle photo, plus address and
  password, all at signup. Vehicle registration dropped entirely. The old second
  onboarding screen is now a status/repair screen that only asks for what is
  genuinely missing.
- **Chat** — unread badges, push to the other party, WhatsApp-style sent /
  delivered / read ticks.
- **Call** — shows the registered number and asks phone or WhatsApp.
- **Driver reviews screen** (`js/views/driverAccount.js`) with the star
  distribution, not just an average.
- **Ops console** — auto-refreshing rather than hard-reload-only, desk-width
  layout, and it now NAMES online drivers it cannot place on the map instead of
  silently dropping them.

**Backend — 19 commits, `9432973` … `38ee8a2`.** Highlights: the broadcast +
atomic claim; the cash-debt ledger fix; a ratings controller (ratings could be
written and never read — there was no controller at all); parcel dispatch
actually reaching drivers; ops-mediated password recovery; security headers;
session revocation on delete/suspend; round-the-clock bookings.

**Security.** Two external audits were worked through. Closed: stored XSS via
Leaflet `bindTooltip`; KYC documents served from public URLs (now private R2
objects behind 120-second signed GETs — verified 200 then 403 after 135s);
sensitive actions now fail CLOSED when Redis is unavailable; test/review fleet
segregated in both directions so a reviewer's ride can never reach a real rider.

## Traps that have already cost hours

- **`position: fixed` resolves against the viewport, not the 480px `#app-root`
  column.** At 375px wide these are the same thing and every bug hides. **Check
  layout at 375px AND ~900px**, always. A pill that looked centred sat at
  `left: -175` on a desktop window.
- **The service worker cache is keyed by git SHA, and `cache.add()` still goes
  through the HTTP cache.** Use `new Request(url, { cache: "reload" })`. Stale
  SW caches produced several false readings — if the browser seems to disagree
  with the source, suspect this before suspecting the code.
- **Prisma schema comments must be `//`, never `/* */`** — the latter fails
  migration with P1012.
- **This is NestJS 10.** Nest 11 wildcard route syntax (`@Get("view/*key")`)
  parses fine and 404s at runtime. `audit.js` catches it now.
- **Verify in the real UI.** `curl` proves a route exists, not that the feature
  works. Drive the deployed app and confirm the browser actually loaded the new
  code.
- **Watch the timing window when testing dispatch.** The offer expires in 15
  seconds; arm your observer on the driver tab BEFORE booking, or you will miss
  it and wrongly conclude nothing was sent.

## Open work, most valuable first

1. **Bundle IDs — decide before the first AAB.** Configs say `com.novago.*`
   (`capacitor.config.json`, the four files in `capacitor/`, and
   `android/app/build.gradle`); item 15 says `pk.novago.*`. **Unfixable after
   the first upload.** A one-line edit today, a new listing later.
2. **Share ride is broken** — parked at Aisha's explicit request, must be
   rebuilt before launch. She knows; do not re-raise it as a discovery.
3. **Navigate handoff unverified** — the `geo:` URI is inert in a desktop
   browser, so this needs a real handset.
4. **Customer app doesn't fully sync to every trip state change** (task #9).
5. **The completed 08-17 trip predates the cash-debt fix** and was not
   retro-corrected — that one driver shows +182.75 with no matching debt. New
   trips are correct. A corrective ledger entry would fix it if the number
   matters.

## Infrastructure chores, none of them blocking

Rotate the R2 API token; change the `admin@novago.com` password (Aisha chose to
leave it); delete the `@novatest.dev` accounts from production; drop
`http://localhost:5620` from the R2 CORS allowlist before launch; add the CI
gate line to `deploy.yml` **by hand** (the PAT lacks `workflow` scope, so a push
containing it will be rejected); `SENTRY_DSN` unset; the Mapbox token is not
URL-restricted; routing still runs on the public OSRM demo server, which has no
uptime guarantee and must be replaced before real traffic.

Not yet done from the audits: ledger idempotency keys; offer expiry uses
`setTimeout` and does not survive a restart; CNIC and payout details are not
encrypted at rest; tokens live in `localStorage` rather than the Keychain
(item 24); real FCM credentials (item 21).

## Admin access

Ops credentials live at `~/.novago/ops.env` (chmod 600, deliberately **outside
both repos**) with `ops-token.sh` beside it. It is a dedicated `ops-bot@novago.pk`
admin account, not Aisha's. Note that ops-bot is not a trip participant, so
admin-level trip cancellation silently no-ops — cancel as the customer with a
valid enum reason (e.g. `LONG_WAIT`) instead.

## How Aisha wants to work

Fast, no narration, and **never make her repeat a task across sessions** — that
is the thing that actually annoys her. Verify before reporting; she has been
burned by claims that turned out to be untested. When she asks to be walked
through something step by step, stop after each step and wait for "ok".
