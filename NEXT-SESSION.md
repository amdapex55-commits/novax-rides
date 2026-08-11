# Next session — where things stand and what's left

Written 2026-08-11. Both repos are committed and pushed; the backend is deployed
and healthy on Railway.

---

## 🔴 Do these first — each is minutes, and two of them are live problems

**1. Finish the Pages deploy switch.** Two steps, both in the GitHub UI:

- `deploy.yml` is sitting in the **repo root**. Workflows only run from
  `.github/workflows/`. Open it → pencil → change the filename box to
  `.github/workflows/deploy.yml` → commit. (Typing `/` creates the folders.)
- Settings → Pages → Source: change **"Deploy from a branch"** to
  **"GitHub Actions"**.

Until both are done, two things are true and both are bad:

- **`ops.html` is publicly reachable.** Pages serves the repo root, so the
  dispatch console is on the open internet. Verified returning 200.
- **Mapbox is not live.** `js/map-token.js` is gitignored and written by the
  workflow from the `MAPBOX_TOKEN` secret, so the site is still on the free
  Carto basemap.

Verify after: `ops.html` should 404, `js/map-token.js` should 200.

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

**7. SMS provider — start this immediately, it has the longest lead time.**
Nobody can sign up without OTP delivery. `config.validation.ts` refuses to boot
production with `SMS_PROVIDER=console`. Twilio works as a stopgap but is
expensive to Pakistani numbers with mixed deliverability; a local aggregator
(Jazz/Telenor/Zong corporate SMS) is cheaper and lands better but needs a
registered mask and business documents — **weeks, not days**. The interface in
`sms.service.ts` is already swappable.

---

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

**10. Domain.** Buy `novago.pk` (PKNIC). Apex → GitHub Pages, `api.` → Railway.
Then set `CORS_ORIGINS` to the real domain. **The app already references
`novago.pk` in legal pages and support config** — if you don't own it, that copy
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
- **Ops nav cosmetic bug:** `/ops/dashboard` is routed with `tab: "dashboard"`
  but `appMode.js` has no matching nav entry, so its highlight silently matches
  nothing.

---

## Reference

- Backend health: `https://novax-backend-production-68af.up.railway.app/health/ready`
- **Point Railway's health check at `/health/ready`**, not `/health` — that's what
  makes deploys zero-downtime.
- Railway credit was down to **$4.57 / 19 days** on 2026-08-11. Top it up before
  putting real riders on this.
