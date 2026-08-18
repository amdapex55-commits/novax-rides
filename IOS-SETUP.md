# iOS — where this stands, and what happens next

Written 2026-08-18, at the end of the session that generated the project.
**Nothing here needs Xcode opened by hand yet.** Read the first section before
you touch the IDE.

---

## Do not create a project in Xcode

Xcode's welcome screen offers "Create New Project". That is the wrong door for
this app. `ios/` is **generated from the web app by Capacitor** — the same way
`android/` is — and a hand-made Xcode project would be one Capacitor does not
know about and cannot sync into.

The project already exists. You open it, you never create it:

```bash
cd /Users/aisha/Documents/GitHub/novax-rides && npm run app:driver && npx cap sync ios && npx cap open ios
```

That opens `ios/App/App.xcworkspace`. **Always the .xcworkspace, never the
.xcodeproj** — the `.xcodeproj` alone does not know about CocoaPods, so it
builds without Capacitor and fails in a way that reads like a broken app.

---

## What Xcode is actually for here

Nova Go is a web app. Xcode does not write it and you will not edit app code
there. It does exactly four things this project needs, none of which anything
else can do:

1. **Compiles the native shell** that wraps the web app into a real `.ipa`.
2. **Signs it** with your Apple Developer identity. Unsigned, no iPhone will
   run it and App Store Connect will not accept it.
3. **Uploads** to App Store Connect / TestFlight.
4. **Runs it on a simulator or a real iPhone** so you can see it before anyone
   else does.

Apple permits none of those from a non-Mac, which is why roadmap item 19 was a
blocker. It no longer is — **Xcode 26.6 with the iOS 26.5 SDK is installed.**

---

## State as of this session

| Thing | State |
|---|---|
| Xcode | **26.6**, iOS 26.5 SDK — installed |
| CocoaPods | **1.17.0** via Homebrew |
| `ios/` project | **Generated**, pods installed, 5 plugins linked |
| Bundle IDs | `com.novagorides.customer` / `.driver` / `.merchant` / `.ops` |
| Info.plist usage strings | **Written per build** by `scripts/select-app.js` |
| Apple Developer Program | **Not enrolled** — the remaining blocker |

`ios/` is **gitignored**, like `android/`. It is regenerated, not committed, so
never hand-edit anything inside it: `scripts/select-app.js` is the only durable
place for native settings, and a build overwrites the rest.

### CocoaPods needs a UTF-8 locale

`pod install` dies with `Unicode Normalization not appropriate for ASCII-8BIT`
when `LANG` is unset, which it is in a bare shell here. If you ever run pods by
hand:

```bash
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
```

---

## The usage strings, and why they are per-build

`IOS_USAGE` in `scripts/select-app.js` holds them. Every build rewrites the
plist from that table, and **clears the other builds' strings first** — so
switching from driver to customer genuinely removes the Always-location string
rather than leaving it on a build that cannot justify it.

Two things make this worth understanding rather than trusting:

**A missing usage string is a crash, not a rejection.** iOS kills the process
the moment it requests a permission it has not declared a reason for. A
customer build without `NSLocationWhenInUseUsageDescription` does not degrade
gracefully — it dies on the screen where the pickup pin is set. The generated
project shipped with **zero** usage strings; that is Capacitor's default, and
it is the single most common way a first iOS build fails.

**Apple reads the strings.** "Required for app functionality" is a documented
rejection reason. Each string here says what the app does with the data.

Only the **driver** build declares `UIBackgroundModes: location` and the Always
strings. The customer build gets When-In-Use only. That asymmetry is the same
one the Android manifest makes, for the same reason, and it is what keeps the
customer app out of a background-location policy review it would fail.

---

## Next session, in order

1. **[YOU] Enrol in the Apple Developer Program** — $99/year. Prefer an
   **Organization** enrolment for a transport company; it needs a D-U-N-S
   number, which takes **1–2 weeks on its own**. This is now the longest pole
   on the iOS side and none of the rest can finish without it.
2. **Sign in to Xcode** — Settings → Accounts → add the Apple ID. Then in the
   App target → Signing & Capabilities, pick the team and let it manage
   signing automatically.
3. **Run on the simulator** to confirm the shell loads the web app at all.
4. **Add capabilities** in Signing & Capabilities: Push Notifications, and
   Background Modes → Location updates for the driver build.
5. **Archive and upload** to TestFlight.

Item 1 gates 2 through 5. Everything before it is done.

---

## What is still not done, iOS or not

- **Push credentials** — the code is built and runs in console mode. Needs a
  Firebase project, an APNs key uploaded to it, and `PUSH_PROVIDER=fcm` +
  `FCM_SERVICE_ACCOUNT_JSON` in Railway.
- **`novagorides.com`** — in your cart, not yet checked out. Every reference in
  both repos already points at it.
- **App icons** — `ios/App/App/Assets.xcassets/AppIcon.appiconset` holds
  Capacitor's placeholder. Apple rejects the default.
- **Background GPS on a real handset** — built, never run on physical
  hardware, on either platform.
