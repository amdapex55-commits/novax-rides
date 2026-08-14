# Store screenshots

**Both stores require real screenshots of the actual app.** Mockups, marketing
banners and rendered device frames with invented content get rejected — Apple
in particular checks that what you show matches what the reviewer sees.

The web build and the native build render identically (Capacitor loads the same
HTML), so capturing from the deployed site at phone width produces genuine
screenshots of the real UI.

## Sizes

| Store | Required | Notes |
|---|---|---|
| Play — phone | 1080×1920 (min 320px, max 3840px) | 2–8 per app |
| Play — feature graphic | **1024×500** | Required. No screenshot substitutes for it. |
| Apple — 6.7" iPhone | 1290×2796 | Required; other sizes are derived from it |
| Apple — 6.5" iPhone | 1242×2688 | Often still requested |

## Capturing them

**Verified 2026-08-14 against the deployed app:** a 430×932 viewport at 3×
device pixel ratio produces exactly **1290×2796** — Apple's required 6.7"
size — with no horizontal overflow on any screen. Play accepts the same file.

So: set your browser to 430×932, set device pixel ratio to 3 (Chrome DevTools
→ Device Toolbar → Add custom device), and every capture is store-ready with
no resizing or padding.

1. Open the deployed app, sign in with the demo account.
2. Set the viewport to 430×932.
3. Capture each screen in the list below.

## The eight to capture — passenger

Order matters: stores show the first two or three in search results, so lead
with the reason someone would install this rather than with a splash screen.

1. **Home** — service tiles and the promo. Shows breadth in one glance.
2. **Fare confirmation** — the fixed fare with its breakdown. *The single most
   important screenshot; it is the whole product claim.*
3. **Tracking with the rider card** — verification badge, plate, trip count.
4. **Safety checklist** at the kerb.
5. **Share ride / SOS** on the map.
6. **Trip complete** — cash amount and the round-up prompt.
7. **Trip history** with a receipt and "Ride again".
8. **Urdu home screen** — right-to-left. Differentiates from every competitor
   listing in this market.

## The six — rider

1. Earnings with the weekly bars
2. A job offer with the fare shown
3. Go Online / map
4. Incentive progress ring
5. Commission screen with the settle-up detail
6. "Why am I not getting jobs?" diagnostics

## Captions

Optional on Play, absent on Apple. If you add them, describe the screen —
"See your fare before you book" — rather than shouting a slogan.

## Feature graphic (1024×500)

Not a screenshot. Wordmark, one line, one bike. It appears above your
screenshots in the Play listing and is the first thing anyone sees.

Suggested line: **"Fixed fare. Verified riders. Pay cash."**
