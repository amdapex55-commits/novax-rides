# Nova Go — road to the App Store and Play Store

Numbered so we can say "do 14" and both know what that means.
Status: **[DONE]** · **[YOU]** needs you (account, money, ID, a Mac) · **[TODO]** buildable.

Last updated 2026-08-14.

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
   `railway run node scripts/make-admin.js ops@novago.pk`
2. **[YOU] Fill `js/support.config.js`** — WhatsApp, phone, email, ops
   escalation. Four of the six launch blockers the app logs on every boot.
3. **[YOU] Fill `COMPANY` in `js/launch.config.js`** — legal name, SECP
   number, NTN, registered address, effective date. These appear in Terms,
   Privacy and both agreements. A reviewer must never find a blank.
4. **[YOU] Fill `js/settlement.config.js`** — Easypaisa / JazzCash / Raast /
   bank. Without it a blocked driver is told they owe money and not how to pay.
5. **[YOU] Buy `novago.pk`** and point it at Pages. The app already references
   it; every store listing needs a real domain.
6. **[TODO] Run one complete trip end to end.** Request → match → accept →
   arrive → start → complete → rate. This has never happened. Everything below
   assumes the product works; this is the test that says whether it does.

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
15. **[YOU] Reserve bundle IDs**: `pk.novago.customer`, `pk.novago.driver`.
    Note our Capacitor configs currently say `com.novago.*` — pick one scheme
    and make it consistent before the first upload, because it cannot be
    changed afterwards.

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
19. **[YOU] A Mac with Xcode** for the iOS builds. There is no way around this.
20. **[TODO] `npx cap add ios`** + Info.plist usage strings, once 19 exists.

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
22. **[TODO] Background location for the driver app only.** `BACKGROUND-GPS.md`
    documents the gap: browser geolocation stops when the app backgrounds, so a
    driver believes they are online while sending nothing. Needs a real
    foreground service. **The single biggest technical risk in the whole list.**
23. **[TODO] Deferred location permission on the customer app.** Ask at "Where
    are you going?", not on launch, with the purpose string. Apple requires
    relevance; asking early is a common rejection.
24. **[TODO] Secure token storage.** Tokens are in `localStorage` today. Move to
    Keychain / EncryptedSharedPreferences in the native shells.
25. **[TODO] Deep links** — `novago.pk/ride/NX123456` opens the app, falls back
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
- The `track.novago.pk` / `api.novago.pk` subdomain split — real, but it is
  infrastructure polish and nothing here is blocked on it.
