# Next session — where things stand and what's left

Written 2026-08-11. Both repos are committed and pushed; the backend is deployed
and healthy on Railway.

---

## 🔴 Do these first — each is minutes, and two of them are live problems

**1. ~~Finish the Pages deploy switch.~~ DONE — verified live 2026-08-16.**
`deploy.yml` is in `.github/workflows/`, Pages is building from Actions, and
`js/map-token.js` returns 200 on the deployed site, so Mapbox is live.

**`ops.html` being public is now DELIBERATE, not a bug.** The workflow's own
check *requires* it in the build: ops is web-only and is protected by the
ADMIN role server-side, not by being absent. Excluding it just meant there was
nowhere to run the dispatch desk from. (One stale comment in `deploy.yml` still
says the build "deliberately leaves ops.html behind" — it does not.)

**2. Add `SENTRY_DSN` to Railway variables.** Backend error reporting is wired
but a no-op without it. The DSN is in the local `.env` (gitignored). Boot logs
should print `Sentry error reporting: on`.

**3. Restrict the Mapbox token by URL.** Mapbox → Tokens → URL restrictions →
`https://amdapex55-commits.github.io/*` (and the real domain later). A `pk.*`
token is meant to be public, but without restrictions anyone can spend the
50k free loads.

---

## 🟠 Only you can do these — no code involved

**4. Support contacts** — `js/support.config.js`. WhatsApp, phone, email, ops
escalation. Until filled, the app hides every live-contact button by design and
flags a launch blocker.

**5. Company legal details** — `COMPANY` in `js/launch.config.js`. Legal name,
SECP number, NTN, registered address, effective date. Until filled, every legal
page shows a "not ready to publish" banner.

**6. Lawyer review** of the five policies. Budget a day; it's the item most
likely to slip.

**7. ~~SMS provider~~ — NOT A BLOCKER. Verified against production 2026-08-16.**

This was listed as the longest-lead-time item on the critical path and it is
not on the path at all. OTP is opt-in and off: `ENABLE_OTP_LOGIN` defaults to
false, the controller refuses `/auth/otp/*` while it is, and `config.validation`
only demands an SMS provider when OTP is switched on. Password signup is the
live path.

Proven end to end against production: `POST /api/v1/auth/register` returns
tokens immediately, no SMS anywhere in the flow.

The phone+OTP SCREENS were removed from the frontend on 2026-08-16 — they could
only ever have failed, and their copy ("No password. We'll text you a code")
promised something that could not happen. They are in git history for whenever
a sender is provisioned; the backend endpoints are untouched behind the flag.

Provision a sender when you want OTP as a *second* login option. Nothing is
blocked on it.

## 🟡 Code work still outstanding

**8. Android native build.** `android/` has never been generated, so background
GPS cannot work yet:

```bash
npx cap add android
npm run cap:sync:driver
```

Then add the five `<uses-permission>` lines to
`android/app/src/main/AndroidManifest.xml` — they're written out in
`BUILD_APPS.md`, along with a verification procedure. `ACCESS_BACKGROUND_LOCATION`
and `FOREGROUND_SERVICE_LOCATION` are the two that matter and the two most often
missed.

**Test it on a real phone, not an emulator:** go online, confirm the persistent
notification appears, lock the screen, wait 3 minutes, walk 100m, and check the
driver is still green and has moved on the ops fleet map. Step four is the only
real test.

**9. Run `TESTING.md` end to end.** This is the highest-value item on the whole
list. ~19 backend modules and ~12k lines of views exist, and **not one real trip
has ever gone `REQUESTED → COMPLETED`** with a real phone and a real ledger entry
at the end. Whatever breaks there outranks everything below it.

**10. Domain.** Buy `novagorides.com` (PKNIC). Apex → GitHub Pages, `api.` → Railway.
Then set `CORS_ORIGINS` to the real domain. **The app already references
`novagorides.com` in legal pages and support config** — if you don't own it, that copy
is currently wrong.

**11. Play Store.** $25 one-time. Needs: privacy policy at a public URL (needs
the domain), a **background-location declaration plus demo video** (mandatory
because of the foreground service, and the most common rejection reason),
data-safety form, real screenshots. **Review takes 1–2 weeks.** Ship Android
first — the market here is overwhelmingly Android and Apple review is slower and
stricter.

---

## 🔵 Known and deliberately deferred

- **Driver settle-up is manual.** `/ops/settle` lets ops record a payment and the
  driver is matchable again the same second. Automating it needs a JazzCash /
  Easypaisa webhook. Same for COD withdrawal payouts — the request is recorded,
  paying it out is a human.
- **Errands, parcels and food return 403.** Deliberate, enforced server-side by
  `LaunchPolicyService`. Flip `ENABLE_ERRANDS` / `ENABLE_DELIVERY` /
  `ENABLE_FOOD` when you can actually operate them. The code and the money flows
  are done and correct.
- **29 dependency vulnerabilities.** Unfixable without a NestJS v10 → v11 major
  upgrade. Full reachability analysis and a plan are in the backend's
  `SECURITY.md`. Review by end of pilot week 1 — after that it stops being an
  accepted risk and becomes an ignored one.
- **Redis is a single point of failure.** A Redis outage will cascade into
  matching. Worth wrapping the geo calls in fallbacks post-launch.
- **Mapbox GL JS (vector tiles)** would give smooth zoom, rotation and a better
  quota than the raster tiles now in use. It means rewriting all nine handle
  methods in `map.js` including the animated driver marker — a good week-two
  project, not a pre-launch one.
- **Only 24 unit tests, no integration tests.** Nothing covers a full trip
  lifecycle, OTP, KYC approval, or the ledger end to end.
- ~~**Ops nav cosmetic bug**~~ **FIXED 2026-08-16.** `/ops/dashboard` had
  gained its nav entry already, but three more routes had the same fault —
  `/ops/command`, `/ops/users`, `/ops/tickets` — plus `/wallet` on the customer
  app. `/ops/command` was the visible one: it is where every ADMIN lands after
  signing in, showing a nav bar highlighting nothing. Routes with no nav entry
  of their own now declare a `navTab` parent in `router.js`. A new
  `orphan-nav-tab` rule in `scripts/audit.js` fails the build if it recurs.

---

## Reference

- Backend health: `https://novax-backend-production-68af.up.railway.app/health/ready`
- **Point Railway's health check at `/health/ready`**, not `/health` — that's what
  makes deploys zero-downtime.
- Railway credit was down to **$4.57 / 19 days** on 2026-08-11. Top it up before
  putting real riders on this.

---

## Market-review rebuild — what was deliberately NOT built

Four things the review asked for are missing on purpose. Each is a business
decision or a missing backend, not an oversight, and each would have meant
telling a customer something untrue.

### 1. No "3 more rides to a free ride"

The review is right that this is the addictive framing. It cannot be written
yet, because **loyalty points currently buy nothing**. `LoyaltyService` awards
10 points a trip and sorts users into Bronze/Silver/Gold/Platinum, but no
endpoint spends points and no tier confers any benefit. The home screen shows
real points against the real next tier instead.

**To fix:** decide what a tier is worth (a free ride at 500 points? priority
matching?), build the redemption, then change the copy in
`js/views/riderHome.js → loyaltyStripHtml()`.

### 2. Referral is one-sided, so the banner is modest

Bykea runs "Give Rs 100, Get Rs 100". Ours says "Earn 100 points per friend",
because `LoyaltyService.applyReferral` credits **the referrer only** — the new
customer gets nothing — and those points are the same points that currently
buy nothing.

This is the weakest offer on the home screen and it is worth fixing before
spending anything on acquisition. **To fix:** credit both sides in
`applyReferral`, give points a cash value, then update the `referral` entry in
`js/promos.js`.

### 3. No demand heat map for drivers

"High demand in Clifton" needs trip-request density by area over the last N
minutes. **No endpoint produces this.** The styling is ready
(`.nx-heat-row` in `css/market.css`) and deliberately unused — inventing plausible
hot zones would send riders across Karachi on made-up data, burning their own
petrol.

**To fix:** an endpoint that buckets recent `Trip.requestedAt` by area and
returns counts, then render it into the driver home.

### 4. No post-ride "did you reach safely?" check

Requires push notifications ten minutes after drop-off. **There is no push
infrastructure** — no FCM/APNs credentials, no device-token storage, no send
path. The in-app safety checklist covers the moment of boarding, which is the
higher-risk one and needs no push.

**To fix:** this lands with the Play Store build (FCM), not before.

---

## Also worth knowing

- **Service worker is v17.** Anyone on v16 needs one reload to pick up the
  redesign. The theme and language bootstraps are inline in each HTML `<head>`,
  so they are not subject to module caching.
- **`js/config.js` gained a localhost-only dev override.** Set
  `localStorage["novago.dev.apiBase"]` to point a local build at the deployed
  backend. Hard-gated on hostname so it can never apply in production.
- **Fast Match tips are now visible for the first time.** They were built,
  wired to `tipAmount`, capped at Rs 500 server-side, and hidden behind the
  bidding flag. Expect tip revenue to appear in the data from this deploy on;
  it is not a new feature so much as a feature that was switched off.
- **Real bundle numbers**, since the review quoted uncompressed sizes:
  app CSS is ~46 KB gzipped (not 76 KB), eager JS ~38 KB gzipped, fonts 73 KB
  and non-blocking. This is not the emergency the review implies, and no font
  was added for Urdu precisely to keep it that way.

---

## Found while testing, not fixed (out of scope, but real)

**Deleting an account did not revoke its existing tokens. FIXED 2026-08-16.**

Verified against production on 2026-08-13: after `DELETE /users/me` the row was
correctly anonymised and `POST /auth/login` correctly refused, but the access
token issued before deletion still authenticated for up to its full 30-day
life. Ops suspension had the same hole — `isActive` was re-checked on socket
connect and on every match, but never on the HTTP path, so a suspended user
kept ordinary API access.

Fixed with a Redis denylist (`auth/token-denylist.service.ts`), checked in
`JwtStrategy.validate` and written by `UsersService.deleteOwnAccount` and
`AdminService.setUserActive`. Reactivation clears the entry, so an unsuspended
user is not forced to sign in again. Entries expire after `JWT_ACCESS_TTL`.

**It fails OPEN if Redis is down** — deliberately. Failing closed would sign
out every user on the platform, drivers mid-trip included, the moment Redis
blinked; that is a much larger incident than a revoked session on a phone the
person is still holding. The failure logs at error level. 7 unit tests cover
it, including the fail-open path.

**Still worth doing:** this is the answer to the Play data-deletion review
question, so say it in those words on the deletion screen if asked.
