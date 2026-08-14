// Nova Go — push notification registration.
//
// WHY THIS IS SO SMALL
//
// The heavy lifting is native: Capacitor's PushNotifications plugin owns the
// permission prompt, the FCM/APNs handshake and the OS-level display. All
// this file does is ask at the right moment, hand the token to our backend,
// and route a tap.
//
// It is written against `window.Capacitor.Plugins` rather than an import,
// because this project has no bundler — an `import from "@capacitor/..."`
// resolves to nothing in a browser and takes the whole module graph down with
// it. On the web the plugin simply is not there and every function here
// becomes a no-op, which is correct: a browser tab has no push token.
//
// WHEN TO ASK
//
// Not at launch. iOS gives an app exactly one chance at the notification
// prompt, and a customer who has not yet booked anything has no reason to say
// yes — a decline is permanent and can only be undone in Settings. So this is
// called after the first successful booking, when "tell me when my rider
// arrives" is obviously worth having.

import { api, Token } from "./api.js";
import { APP_CONFIG } from "./appMode.js";
import { track } from "./analytics.js";
import { reportHandled } from "./errors.js";

const ASKED_KEY = "novago.push.asked";

function plugin() {
  return window.Capacitor?.Plugins?.PushNotifications || null;
}

/** Which of the four apps this build is — the backend needs it to avoid
 *  delivering a driver's job offer to the customer app on the same phone. */
function appKey() {
  return APP_CONFIG.key || window.NOVAGO_APP || "customer";
}

function platform() {
  const p = window.Capacitor?.getPlatform?.();
  return p === "ios" || p === "android" ? p : "web";
}

/** True once we have asked, whatever the answer. iOS will not re-prompt. */
function alreadyAsked() {
  try {
    return localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return false;
  }
}

function markAsked() {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    /* private mode — we may re-ask, which the OS will silently ignore */
  }
}

/**
 * Ask for permission and register. Safe to call more than once.
 *
 * @param {{force?: boolean}} opts force=true re-asks even if we already have
 *        (used by a "turn notifications on" settings row, where the user has
 *        explicitly asked for the prompt).
 */
export async function enablePush({ force = false } = {}) {
  const Push = plugin();
  if (!Push) return { ok: false, reason: "unsupported" };
  if (!Token.access) return { ok: false, reason: "signed-out" };
  if (alreadyAsked() && !force) return { ok: false, reason: "already-asked" };

  try {
    let status = await Push.checkPermissions();
    if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
      status = await Push.requestPermissions();
    }
    markAsked();

    if (status.receive !== "granted") {
      track("push_permission_denied", {});
      return { ok: false, reason: "denied" };
    }

    // register() resolves immediately; the token arrives on the
    // 'registration' event, which is why the listener is attached first.
    await Push.register();
    track("push_permission_granted", {});
    return { ok: true };
  } catch (err) {
    reportHandled(err, "enablePush");
    return { ok: false, reason: "error" };
  }
}

/**
 * Attach the listeners. Called once at boot, before any registration, so a
 * token that arrives during a cold start is never dropped on the floor.
 */
export function initPush() {
  const Push = plugin();
  if (!Push) return;

  Push.addListener("registration", async (tokenData) => {
    const value = tokenData?.value;
    if (!value) return;
    try {
      // Sent on EVERY cold start, not just the first. FCM rotates tokens on
      // reinstall, on restore-from-backup and occasionally on its own
      // schedule; registering once would mean a phone quietly stops receiving
      // notifications weeks later with nothing to show why.
      await api.registerDevice({ token: value, platform: platform(), app: appKey() });
    } catch (err) {
      // Not worth surfacing: the app works without push, and the next cold
      // start retries.
      reportHandled(err, "registerDevice");
    }
  });

  Push.addListener("registrationError", (err) => {
    console.warn("[NovaGo] push registration failed:", err?.error || err);
  });

  // Tapped while the app was backgrounded.
  Push.addListener("pushNotificationActionPerformed", (action) => {
    const data = action?.notification?.data || {};
    routeFromNotification(data);
  });
}

/**
 * Where a tapped notification lands.
 *
 * Deliberately narrow: only the types we send, and anything unrecognised goes
 * to the notifications list rather than guessing. `data.type` arrives from the
 * server, and routing on an unvalidated string is how a push becomes an open
 * redirect.
 */
function routeFromNotification(data) {
  const routes = {
    trip_offer: "/driver/home",
    trip_matched: "/tracking",
    trip_arrived: "/tracking",
    trip_completed: "/rate",
  };
  const target = routes[data.type] || "/alerts";
  track("push_opened", { type: String(data.type || "unknown") });
  location.hash = target;
}

/** Called on sign-out so the next person to use this phone does not receive
 *  the previous user's notifications. */
export async function disablePush() {
  const Push = plugin();
  if (!Push) return;
  try {
    // The plugin has no "get current token" call, so the backend deletes by
    // the token it was given; we clear the local flag and let the OS drop it.
    await Push.unregister?.();
  } catch {
    /* best effort */
  }
  try {
    localStorage.removeItem(ASKED_KEY);
  } catch {
    /* ignore */
  }
}
