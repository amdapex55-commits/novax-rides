# Nova Go — one landing page, four apps, one codebase

## Structure

`index.html` is the **public landing page** — a marketing front door with a 3D city-network hero. It is not an app. It links out to four separate products:

| File | What it is | `NOVAGO_APP` |
|---|---|---|
| `index.html` | Public landing page | *(none — not an app)* |
| `customer.html` | **Nova Go** — rides, food, parcels, errands | `customer` |
| `driver.html` | **Nova Go Driver** — go online, offers, earnings | `driver` |
| `merchant.html` | **Nova Go Merchant** — orders, menu, prep time | `merchant` |
| `ops.html` | **Nova Go Ops** — dispatch, approvals, incidents | `ops` |

Each app entry sets one line before booting:

```html
<script>window.NOVAGO_APP = "customer";</script>
```

Everything downstream — routes, bottom nav, signup role, welcome screen — reads that from `js/appMode.js`. Views are lazy-loaded per route, so the customer app never downloads driver/merchant/ops code.

## Web URLs

One GitHub Pages deploy serves all five:

- **Landing** — `https://amdapex55-commits.github.io/novax-rides/`
- Customer — `…/customer.html`
- Driver — `…/driver.html`
- Merchant — `…/merchant.html`
- Ops — `…/ops.html`

Send the landing page to the public. Send drivers the driver link directly, restaurants the merchant link. Each opens as its own product.

**Tip:** all four apps work as home-screen apps. Android Chrome: ⋮ → "Add to Home screen". A driver gets a Nova Go Driver icon that opens straight into the driver app — enough to run your first weeks without the Play Store.

## Landing page

- `index.html` — structure and copy
- `css/landing.css` — its own dark stylesheet, deliberately separate from the apps' light `tokens.css` so landing changes can't break the products
- `js/landing.js` — Three.js hero: city blocks, glowing arterial routes, particles travelling those routes (green rides/parcels, amber food, blue ops signal), pulsing hub nodes

Hero behaviour:
- **No WebGL / CDN blocked** → falls back to a CSS-only gradient hero that still looks deliberate
- **`prefers-reduced-motion`** → renders one static frame, no animation
- **Scrolled out of view or tab hidden** → animation pauses (battery)
- DPR capped at 2, ~80 particles total, no textures or models

## Two guards that make the app split real

1. **Route scoping** — each build only registers its own routes. A customer typing `/ops/command` is redirected home; that path doesn't exist in their build.
2. **Wrong-app detection** — a driver signing into the customer app gets *"This number is registered as a driver account — please use Nova Go Driver"*, not a broken screen.

## Signup roles

There's no role picker. **The app you open decides your role.** A new number signing up in `driver.html` becomes a DRIVER; in `customer.html`, a RIDER.

Ops accounts aren't self-service — promote an existing user to `ADMIN` in the database.

---

## Packaging as native Android apps

Native builds have **no landing page** — a packaged app opens straight into its product. Capacitor always loads `index.html`, so the build script swaps the chosen app's entry into that slot.

```bash
npm install

npm run cap:sync:customer     # or driver / merchant / ops
npx cap add android           # first time only
npx cap open android
```

Then in Android Studio: Build → Generate Signed Bundle → AAB.

**Restore the repo afterwards:**

```bash
npm run app:web               # puts the landing page back in index.html
```

The script verifies `index.html` actually declares the app you asked for and aborts on mismatch — so you can't ship the driver app under the customer's `appId`.

| App | appId |
|---|---|
| Nova Go | `com.novago.app` |
| Nova Go Driver | `com.novago.driver` |
| Nova Go Merchant | `com.novago.merchant` |
| Nova Go Ops | `com.novago.ops` |

**Keep your signing keystore backed up.** Lose it and you can never update that app again.

**Recommendation:** publish only **Customer** and **Driver**. Ops should never be on a public store (it's an internal console, and Google would likely reject it). Merchant runs fine as a browser tab on a counter tablet.

## Still needed before Play Store

- App icons (512×512) and feature graphics (1024×500) — one set per app
- A privacy policy at a real public URL (the in-app drafts have `[BRACKETED]` placeholders)
- Background location plugin for the driver app — browser geolocation stops when the app is backgrounded, so a driver would silently go offline when switching apps
- Lawyer review of the legal drafts
- Real WhatsApp/phone/email in `js/support.config.js` (currently `TODO` placeholders)
