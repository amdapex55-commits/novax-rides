// Nova X Rides — funnel tracking client.
//
// Fire-and-forget by design: analytics must never delay a booking or throw
// into a user-facing flow. Every call is `void track(...)` — no awaits, no
// error surfacing. If the network is down the event is simply lost, which is
// the correct trade for a metric.
//
// Event names must match backend/src/analytics/analytics.constants.ts; the
// server drops anything it doesn't recognise, so a typo shows up as a flat
// line in the dashboard rather than silent bad data.
import { CONFIG } from "./config.js";
import { Token } from "./api.js";

export function track(name, props = {}) {
  try {
    const body = JSON.stringify({ name, props });
    const headers = { "Content-Type": "application/json" };
    if (Token.access) headers.Authorization = `Bearer ${Token.access}`;

    fetch(`${CONFIG.API_BASE_URL}/analytics/track`, {
      method: "POST",
      headers,
      body,
      // Lets the request survive the page being navigated away from, which
      // is exactly when the most interesting drop-off events fire.
      keepalive: true,
    }).catch(() => { /* metrics are best-effort, never user-visible */ });
  } catch {
    /* ignore */
  }
}
