# Photography

Drop the brand photographs in here with these exact filenames. The landing
page picks them up automatically and falls back to the gradient hero if a
file is missing, so a half-populated folder never breaks the page.

| filename              | used for                          | ideal size      |
|-----------------------|-----------------------------------|-----------------|
| `hero-rider.jpg`      | hero, right panel / mobile backdrop | 1600×2000 (4:5) |
| `parcel-handover.jpg` | parcel section                    | 1600×1200 (4:3) |
| `rider-street.jpg`    | the truck band                    | 2000×1200 (5:3) |

## Before you export

- **JPEG, not PNG.** These are photographs; PNG will be 4–6× the size for no
  visible gain. Quality 78–82 is the sweet spot.
- **Keep each file under ~250KB.** The whole app CSS is 46KB gzipped and the
  eager JS is 38KB. One careless 3MB hero would cost more than the entire
  application, on connections least able to afford it.
- **Export a 2× and a 1×** if you can (`hero-rider@2x.jpg`), but a single
  well-compressed 1600px file is fine to start.

## What NOT to put here

Anything with a claim printed into the image — rider counts, city counts,
uptime percentages. Numbers baked into a JPEG cannot be corrected when they
change, and cannot be checked by anyone reading the page. Claims belong in
HTML where they can be edited and where they have to be true.

## iOS launch screens

Android generates its launch splash from the manifest (`background_color` +
the 512px icon), so it is branded with no extra files. **iOS ignores the
manifest entirely** and shows a blank screen unless it finds an
`apple-touch-startup-image` matching the exact device resolution.

That needs real PNGs — one per screen size — which cannot be generated from
CSS. Until they exist, an iPhone launching from the home screen shows a brief
blank screen before the in-app splash takes over.

When you generate them, drop them here as `splash-<w>x<h>.png` and each app
page needs a line like:

```html
<link rel="apple-touch-startup-image"
      media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)"
      href="images/splash-1179x2556.png"/>
```

The background must be `#5b21b6` to match the manifest and the in-app splash,
or the launch will flash a different colour than the screen that follows it.
