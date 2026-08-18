# Deploying the Nova Go Bike pilot

Order matters. **Config → backend → frontend → verify.** Roughly 45 minutes
the first time.

---

## STEP 0 — Fill in the config (do this first, on your computer)

If you deploy before this, the apps still run but every support button hides
itself and the legal pages show a "not ready to publish" banner. Ten minutes
here saves a redeploy.

Unzip `novago-bike-pilot-frontend.zip`. Open the folder in any text editor
(TextEdit on Mac is fine — use Format → Make Plain Text).

**File 1: `js/support.config.js`** — around line 12:

```js
whatsapp: "923001234567",        // your WhatsApp Business number, digits only, no +
phone: "+92 300 1234567",        // the number a human answers 8am–10pm
email: "support@yourdomain.pk",
opsEscalation: "+92 300 7654321", // YOUR number, 24h, never shown to customers
```

**File 2: `js/launch.config.js`** — the `COMPANY` block, around line 155:

```js
legalName: "Nova Go Logistics (Private) Limited",
registrationNumber: "0123456",     // SECP
ntn: "1234567-8",                  // FBR
address: "Office 4, Zamzama Boulevard, DHA Phase 5",
website: "https://novagorides.com",
effectiveDate: "1 September 2026",
```

The zone is already set, and already on:

```js
ZONE = { enabled: true, name: "Karachi",
         center: { lat: 24.9200, lng: 67.1000 }, radiusKm: 45 }
```

**Nova Go serves all of Karachi.** That radius is drawn from the geographic
centre of the city — not Clifton, which would push the circle out to sea and
cut off the north — and is wide enough to cover Malir and Bin Qasim in the
east, Baldia and Hawksbay in the west, North Karachi and Gadap above, Sea View
below.

It is a **sanity boundary, not a service area.** Its only job is to reject a
booking from Hyderabad or a GPS glitch in the Arabian Sea. It is not there to
decide who you serve.

Keep it in step with the backend (`LAUNCH_ZONE_*` in Railway, defaults in
`src/launch/launch-policy.service.ts`). The frontend copy is what makes the UI
honest before a request is sent; the backend is what makes it true. There are
tests asserting the default covers six named Karachi neighbourhoods and still
rejects Hyderabad and Lahore.

Save both files.

---

## STEP 1 — Get a Twilio account (15 min, needed for OTP)

**Without this nobody can log in.** OTP codes would go to your server logs
instead of people's phones.

1. Sign up at twilio.com — free trial gives you credit to test with
2. Console home page shows **Account SID** and **Auth Token** — copy both
3. Phone Numbers → Buy a number → pick one with SMS capability
4. Keep all three values open in a tab; you'll paste them in Step 3

> Trial accounts can only text numbers you've verified in the Twilio console.
> Verify your own and your first riders' numbers, or upgrade before Day 5.

I can't do this part for you — it requires entering payment details, and I
don't handle those.

---

## STEP 2 — Deploy the backend

The backend runs `prisma db push` automatically on every boot, so the schema
changes apply themselves. No terminal needed.

1. Unzip `novago-bike-pilot-backend.zip`
2. Open **GitHub Desktop** → your `novax-backend` repository
3. Click **Repository → Show in Finder**
4. Delete everything inside that folder **except the hidden `.git` folder**
   (Cmd+Shift+. shows hidden files on Mac)
5. Copy everything from the unzipped `novax-backend` folder into it
6. Back in GitHub Desktop you'll see the changed files. Summary:
   `Bike pilot: road-distance fares, Twilio OTP, driver eligibility gate`
7. **Commit to main** → **Push origin**

Railway picks up the push and redeploys automatically. It will fail to boot
until you add the variables in Step 3 — that's expected and correct.

---

## STEP 3 — Railway environment variables

Railway → your project → the backend service → **Variables** tab.

Add these (keep whatever is already there):

| Variable | Value |
|---|---|
| `SMS_PROVIDER` | `twilio` |
| `TWILIO_ACCOUNT_SID` | from Twilio console |
| `TWILIO_AUTH_TOKEN` | from Twilio console |
| `TWILIO_FROM_NUMBER` | your Twilio number, e.g. `+15551234567` |
| `CORS_ORIGINS` | `https://YOURNAME.github.io` |
| `NODE_ENV` | `production` |

**Two important notes:**

- `CORS_ORIGINS` must exactly match where your frontend is served from —
  scheme, no trailing slash. Wrong value = the app loads but every API call
  fails silently.
- Set `NODE_ENV=production` **now**. You previously had it on `development`
  to bypass the SMS guard. With Twilio configured the guard passes, and
  production mode is what disables the public API docs.

Railway redeploys when you save. Watch the deploy log — it should end with
Nest listening on a port, not the config-validation error.

**If it refuses to boot,** read the error. It lists exactly which variable is
missing or unsafe. That guard exists so a misconfigured server never quietly
serves real customers.

---

## STEP 4 — Deploy the frontend

1. GitHub Desktop → your `novax-rides` repository → **Show in Finder**
2. Delete everything except `.git`
3. Copy in everything from your **edited** `novax-rides` folder (the one with
   your real support numbers from Step 0 — not the raw unzip)
4. Commit: `Nova Go Bike pilot` → **Push origin**

GitHub Pages rebuilds in 1–2 minutes.

**If Pages isn't switched on yet:** repo → Settings → Pages → Source =
`Deploy from a branch`, Branch = `main`, folder = `/ (root)` → Save.

---

## STEP 4b — Create your ops account

There is no "sign up as admin" button, on purpose: a self-service door into
the dispatch console is a door anyone can walk through. Admin is granted by
promoting an existing account in the database.

**1. Sign in normally at `ops.html`** with your own phone number. Enter the
OTP from the SMS. This creates an ordinary account.

**2. You'll land on a "Wrong app" screen.** That's correct — your account is
still a RIDER. Leave the tab open.

**3. Promote yourself.** Railway → your **Postgres** service → **Data** tab →
run:

```sql
UPDATE users SET role = 'ADMIN' WHERE phone = '+923001234567';
```

Use the **+92 format** — the app normalises `0300 1234567` to `+923001234567`
before saving, so that's what's in the column. Check it worked:

```sql
SELECT phone, role FROM users WHERE role = 'ADMIN';
```

**4. Sign out and sign in again.** This matters: your role is baked into the
JWT at login, so the token in your browser still says RIDER. Hit **"Sign out
and use a different number"** on the wrong-app screen, then sign in with the
same number. You'll land on the Command centre.

**Ops accounts to create:** one per person on the desk, each with their own
number. Never share a login — the incident log records who resolved what, and
that's worthless if three people share an account.

---

## STEP 5 — Verify (10 minutes, do all of it)

Your URLs:

| | |
|---|---|
| Landing | `https://YOURNAME.github.io/novax-rides/` |
| Customer | `…/customer.html` |
| Driver | `…/driver.html` |
| Ops | `…/ops.html` |

**1. Launch blockers.** Open `ops.html`, sign in as your admin account, go to
Command. The readiness panel should say **"Launch checks passing"**. If it
lists blockers, they name the file and the fix.

**2. OTP works.** Open `customer.html` on your phone, enter your number.
**A real SMS should arrive.** If it doesn't, check Railway logs — Twilio's
rejection reason is logged there.

**3. GPS gate.** With location permission granted and standing outside, the
home screen should say *"Picking you up here · ±NNm"*. Now deny location in
browser settings and reload: it must say *"Location is off — set your pickup
manually"* and refuse to book. **That refusal is the fix working.**

**4. Real road route.** Book from Clifton to Gulshan. The line on the map
must curve along roads. A dead-straight line means routing isn't reaching
OSRM — bookings still work, but the fare screen will say "estimated".

**5. Fare is right.** A 6.2 km trip must quote **Rs. 195**. Wrong number =
frontend and backend pricing have drifted apart.

**6. Ops sees the fleet.** Have someone go online in `driver.html`. Within
15 seconds a dot should appear on the ops fleet map.

**7. Parked services.** Tap Food on the customer home → coming-soon screen,
not a broken menu.

---

## Order of operations, in one line

Config → Twilio → backend push → Railway variables → frontend push → verify.

---

## If something breaks

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module '/app/dist/main'` | Build tools were devDependencies, skipped by `NODE_ENV=production` | **Already fixed** — the Nest CLI and TypeScript are now regular dependencies. Deploy the latest backend zip. |
| "Application failed to respond" | Backend won't boot | Read the deploy log — config validation names the variable |
| App loads, everything fails | CORS | `CORS_ORIGINS` must match your Pages URL exactly |
| No OTP arrives | Twilio | Check Railway logs; on trial, verify the recipient number first |
| 404 on css/js | Folders flattened on upload | Use GitHub Desktop, not the browser uploader |
| Map blank | Tile CDN blocked | Booking still works by address; check the browser console |
| Blockers panel still red | Config not saved before copying | You copied the raw unzip instead of your edited folder |

---

## Still yours, before public launch

- Lawyer review of the five policy documents
- 30–50 riders verified in person (see `LAUNCH.md`)
- Decide the negative-balance cutoff for rider commission
- Run `TESTING.md` end to end
