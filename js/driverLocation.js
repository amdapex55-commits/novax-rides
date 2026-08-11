// Nova Go — driver location tracking.
//
// THE PROBLEM (the long version is in BACKGROUND-GPS.md)
//
// Browser geolocation, including inside a Capacitor WebView, only runs while
// the page is in the FOREGROUND. The moment a rider opens WhatsApp, switches
// to Google Maps, takes a call, or locks their screen at a signal, Android
// suspends the timer and position updates stop — usually within 1-2 minutes.
//
// Nothing errors. The rider still sees "Online". Our fleet map still shows a
// confident green dot at a junction they left ten minutes ago. Since the
// backend now evicts drivers with no fix for 3 minutes, they also quietly stop
// receiving jobs. Every part of that failure is silent, which is what makes it
// dangerous.
//
// The only real fix is a native FOREGROUND SERVICE — an Android service with a
// persistent notification. That notification is the price Android charges for
// continuous background location on Android 10+, and it is non-negotiable.
//
// This module hides the difference. Callers ask for location; they don't care
// which engine produced it.
//
// WHY window.Capacitor AND NOT AN IMPORT
//
// This app ships as unbundled ES modules served as static files — there is no
// bundler to resolve `import { registerPlugin } from "@capacitor/core"`, and
// adding one for a single import is not worth it. The native shell injects
// `window.Capacitor` before any of our code runs, so the plugin is read off
// the global. In a plain browser that global is simply absent and we fall
// straight through to watchPosition, which is exactly the right behaviour.

const PLUGIN_NAME = "BackgroundGeolocation";

// Fewer updates, dramatically better battery. A bike moving through traffic
// still produces a steady stream at 25m; a parked one produces almost none.
const DISTANCE_FILTER_METRES = 25;

/** True inside the Capacitor/Ionic native shell, false in any browser. */
export function isNativeShell() {
  if (typeof window === "undefined") return false;
  if (window.Capacitor?.isNativePlatform?.()) return true;
  return /^(capacitor|ionic):$/.test(window.location?.protocol || "");
}

function getBackgroundPlugin() {
  const register = window.Capacitor?.registerPlugin;
  if (typeof register !== "function") return null;
  try {
    const plugin = register(PLUGIN_NAME);
    // registerPlugin happily returns a proxy for a plugin that was never
    // installed; the call only fails later, mid-shift. Probe for the method
    // we actually need so we can fall back now instead.
    return typeof plugin?.addWatcher === "function" ? plugin : null;
  } catch {
    return null;
  }
}

/**
 * Start tracking this driver's position.
 *
 * @param {object} handlers
 * @param {(fix: {lat: number, lng: number}) => void} handlers.onFix
 * @param {(info: {code: string, message: string}) => void} [handlers.onError]
 * @returns {Promise<{ mode: "native"|"browser"|"none", stop: () => Promise<void> }>}
 */
export async function startDriverTracking({ onFix, onError = () => {} }) {
  const plugin = isNativeShell() ? getBackgroundPlugin() : null;

  if (plugin) {
    try {
      const id = await plugin.addWatcher(
        {
          // This sits in the rider's notification shade for their whole shift.
          // Written for them, not for us.
          backgroundTitle: "You're online",
          backgroundMessage: "Nova Go is finding you jobs",
          requestPermissions: true,
          // false = don't hand us a cached fix from before the watcher started.
          stale: false,
          distanceFilter: DISTANCE_FILTER_METRES,
        },
        (location, error) => {
          if (error) {
            // NOT_AUTHORIZED means they picked "While using the app" rather
            // than "Allow all the time". There is no in-app recovery — the
            // choice only exists in system settings, so send them there.
            if (error.code === "NOT_AUTHORIZED" && typeof plugin.openSettings === "function") {
              plugin.openSettings().catch(() => {});
            }
            onError({ code: error.code || "UNKNOWN", message: error.message || String(error) });
            return;
          }
          if (!location) return;
          onFix({ lat: location.latitude, lng: location.longitude });
        },
      );

      return {
        mode: "native",
        stop: async () => {
          try {
            await plugin.removeWatcher({ id });
          } catch {
            // Already gone, or the shell tore it down for us.
          }
        },
      };
    } catch (err) {
      // Plugin present but refused to start (permission denied outright, or a
      // sync mismatch after `cap sync` wasn't run). Fall through to the
      // browser engine rather than leaving the rider with no tracking at all.
      onError({ code: "NATIVE_START_FAILED", message: err?.message || String(err) });
    }
  }

  if (!navigator.geolocation) {
    return { mode: "none", stop: async () => {} };
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    (err) => onError({ code: err.code === 1 ? "NOT_AUTHORIZED" : "POSITION_ERROR", message: err.message }),
    { enableHighAccuracy: false, maximumAge: 10000, timeout: 10000 },
  );

  return {
    mode: "browser",
    stop: async () => navigator.geolocation.clearWatch(watchId),
  };
}

/**
 * One-off position read, used to re-acquire the moment the app returns to the
 * foreground rather than waiting for the OS to resume a watch on its own
 * schedule. Native tracking never goes stale this way, so it's a no-op there.
 */
export function requestImmediateFix(onFix) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => {},
    { maximumAge: 0, timeout: 8000 },
  );
}
