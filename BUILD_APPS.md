# Nova X — four apps, one codebase

## What changed

One repo now ships **four separate products**. Which one you get is decided by a single line in the HTML file you open:

```html
<script>window.NOVAX_APP = "customer";</script>
```

Everything downstream — routes, bottom nav, signup role, welcome screen — reads from `js/appMode.js`.

| App | Entry file | Who it's for | What they see |
|---|---|---|---|
| **Nova X** | `index.html` | Customers | Rides, food, parcels, errands. No driver/restaurant/ops language anywhere. |
| **Nova X Driver** | `driver.html` | Drivers | Onboarding, go online, offers, earnings. |
| **Nova X Merchant** | `merchant.html` | Restaurants | Orders, menu, prep time, store settings. |
| **Nova X Ops** | `ops.html` | Your team | Stuck jobs, manual dispatch, approvals, incidents. |

## Web URLs (live now)

Same GitHub Pages deploy serves all four:

- Customer — `https://amdapex55-commits.github.io/novax-rides/`
- Driver — `https://amdapex55-commits.github.io/novax-rides/driver.html`
- Merchant — `https://amdapex55-commits.github.io/novax-rides/merchant.html`
- Ops — `https://amdapex55-commits.github.io/novax-rides/ops.html`

Send drivers the driver link, restaurants the merchant link. Each opens as its own app — nobody sees anyone else's world.

**Tip:** all four work as home-screen apps. On Android Chrome: ⋮ → "Add to Home screen". The driver gets an icon that opens straight into the driver app. That's enough to run your first weeks without the Play Store.

## Two guards that make the split real

1. **Route scoping.** Each build only registers its own routes. A customer typing `/ops/command` gets redirected home — that path doesn't exist in their build.
2. **Wrong-app detection.** A driver who signs into the customer app sees a clear *"This number is registered as a driver account — please use Nova X Driver"* screen instead of something broken.

## Signup roles

There's no role picker any more. **The app you download decides your role.** A new number signing up in `driver.html` becomes a DRIVER; in `index.html`, a RIDER.

Ops accounts aren't self-service — promote an existing user to `ADMIN` in the database.

---

## Packaging as native Android apps

Four separate Play Store listings, four `appId`s. Configs are in `capacitor/`.

For each app:

1. **Make its entry point the index.** Capacitor always loads `index.html`, so for the driver build:
   ```
   cp index.html index.customer.html      # keep a copy
   cp driver.html index.html
   ```
2. **Use its config:**
   ```
   cp capacitor/capacitor.driver.json capacitor.config.json
   ```
3. **Build:**
   ```
   npm install
   npx cap add android
   npx cap sync
   npx cap open android
   ```
   Then in Android Studio: Build → Generate Signed Bundle → AAB.
4. **Restore** `index.html` from your copy before doing the next app.

| App | appId |
|---|---|
| Nova X | `com.novax.app` |
| Nova X Driver | `com.novax.driver` |
| Nova X Merchant | `com.novax.merchant` |
| Nova X Ops | `com.novax.ops` |

**Keep your signing keystore backed up.** Lose it and you can never update that app again.

## Still needed before Play Store

- App icons (512×512) and feature graphics (1024×500) — one set per app
- A privacy policy at a real public URL (the in-app drafts have `[BRACKETED]` placeholders)
- Background location plugin for the driver app — browser geolocation stops when the app is backgrounded, so a driver would silently go offline when they switch apps
- Lawyer review of the legal drafts
