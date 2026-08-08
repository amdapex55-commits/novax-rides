# Background GPS — the one gap I can't close in JavaScript

**This is the most important unresolved item before you scale past the pilot.**
Read it before Day 3.

---

## The problem

Browser geolocation — including inside a Capacitor WebView — only runs while
the page is in the **foreground**. The moment a rider:

- opens WhatsApp to message a customer
- switches to Google Maps for directions
- locks their screen while waiting at a signal
- gets a phone call

…Android suspends the JavaScript timer. Position updates stop, usually within
**1–2 minutes**. Android 10+ battery optimisation is aggressive about this and
gets more aggressive the longer the app is backgrounded.

**What that looks like in production:**

| Who | What they see |
|---|---|
| Rider | "Online". Getting no jobs. Doesn't know why. |
| Customer | A rider dot frozen on a street they left ten minutes ago |
| Ops | A fleet map that lies |
| Matcher | Skips them (stale Redis position) or dispatches to the wrong place |

Every one of those is silent. Nothing errors. That's what makes it dangerous.

---

## What I've done in the meantime

The app now **detects** the failure and tells the rider:

- Timestamp on every GPS fix (`lastFixAt`)
- A watchdog checks every 15s; if no fix for **90 seconds**, an amber banner
  appears on the driver home: *"Your location has stopped updating. Keep Nova
  Go open on screen — you won't get jobs while it's in the background."*
- Returning to the foreground triggers an immediate re-acquire rather than
  waiting for the OS to resume the watch

This does **not** fix the problem. It converts a silent failure into a visible
one, which is the most JavaScript can do.

---

## The real fix (needs a native build)

You need a **foreground service** — an Android service with a persistent
notification. That notification is the price Android charges for continuous
background location, and it's non-negotiable on Android 10+.

### Install

```bash
npm install @capacitor-community/background-geolocation
npx cap sync android
```

### `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
```

### Replace the `watchPosition` block in `js/views/driverHome.js`

```js
import { registerPlugin } from "@capacitor/core";
const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");

// Only in the native shell — the browser build keeps watchPosition.
const isNative = /^(capacitor|ionic):$/.test(location.protocol);

if (isNative) {
  watcherId = await BackgroundGeolocation.addWatcher(
    {
      // This text appears in the rider's notification shade the entire time
      // they're online. Write it for them, not for you.
      backgroundMessage: "Nova Go is finding you jobs",
      backgroundTitle: "You're online",
      requestPermissions: true,
      stale: false,
      distanceFilter: 25, // metres — fewer updates, much better battery
    },
    (location, error) => {
      if (error) {
        // NOT_AUTHORIZED means they denied "Allow all the time". Send them
        // to settings — there is no in-app recovery from this.
        if (error.code === "NOT_AUTHORIZED") BackgroundGeolocation.openSettings();
        return;
      }
      lastFixAt = Date.now();
      socketManager.emit("driver:location", {
        lat: location.latitude,
        lng: location.longitude,
      });
    },
  );
}
```

Remove the watcher in `goOffline()`:

```js
if (watcherId) await BackgroundGeolocation.removeWatcher({ id: watcherId });
```

---

## Things that will bite you

**"Allow all the time" is a separate permission.** Android shows "While using
the app" by default. The rider must explicitly choose *Allow all the time* in
system settings — most won't find it unaided. **Walk every rider through this
during in-person onboarding** (Day 3 in `LAUNCH.md`). Add it to the checklist.

**Battery.** Riders will blame the app for battery drain, and they'll be
partly right. `distanceFilter: 25` helps a lot. Recommend a bike phone mount
with a charger — cheap, and it removes the complaint entirely.

**Chinese Android skins** (Xiaomi/MIUI, Oppo/ColorOS, Vivo, Realme) kill
background services aggressively regardless of permissions. These are a large
share of the Karachi market. Riders must add Nova Go to **Battery → App
auto-launch / Protected apps**. Note which handset each rider uses at
onboarding — when a rider reports "not getting jobs", this is the first thing
to check.

**The stale-GPS banner stays useful after this ships.** It'll catch the
Xiaomi-killed-the-service case that no amount of correct code prevents.

---

## Server-side backstop worth adding

Redis already stores `driver:lastseen:<id>` with a 120s TTL. Consider:

- Ops fleet map: render a driver whose last fix is >2 minutes old in **grey**,
  not green. A dispatcher should be able to see which positions are real.
- Matcher: skip drivers with no fix in the last 3 minutes rather than offering
  them a job they'll never see, which currently costs a 15-second timeout per
  cascade.

Both are small changes and both make the pilot more honest. Say the word.
