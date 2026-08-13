// Nova Go — the offline write queue.
//
// WHY A BOOKING IS NOT IN IT
//
// The obvious version of this feature queues everything, including the ride
// request, and flushes when signal returns. That is the wrong design, and it
// is worth being explicit about why, because it looks like the helpful
// option.
//
// A ride request is a promise to send a human being to a street corner. If
// it leaves the phone eleven minutes after the customer pressed the button —
// somewhere in North Karachi where the signal came back as they walked — a
// real rider is dispatched to a person who gave up and took a rickshaw. The
// customer is charged nothing and the rider loses twenty minutes and the
// petrol, and neither of them did anything wrong. Failing loudly at the
// moment of the tap is a far better outcome than succeeding silently later.
//
// The same argument rules out anything else time-critical: cancelling a
// trip, going online, accepting a job.
//
// WHAT IS IN IT
//
// Writes where a delay changes nothing about their meaning:
//
//   rateTrip          — a rating is just as true an hour later
//   updateMe          — a profile edit
//   submitBusinessLead— a sales enquiry
//   createSupportTicket — support reads a queue anyway
//
// Deliberately an ALLOWLIST, not a blocklist. A blocklist means the next
// endpoint anyone adds is queueable by default, and the failure mode of
// getting that wrong is dispatching riders to nobody.

const KEY = "novago.outbox.v1";
const MAX_ITEMS = 25;
const MAX_ATTEMPTS = 5;

/** The only api.js methods this queue will ever replay. See the header. */
export const QUEUEABLE = new Set([
  "rateTrip",
  "updateMe",
  "submitBusinessLead",
  "createSupportTicket",
]);

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* Quota or private mode. The queue is a convenience; losing it is not
       worth taking the screen down for. */
  }
}

export function queueSize() {
  return read().length;
}

/**
 * Park a call for later.
 * @returns true if it was queued, false if this method may not be queued.
 */
export function enqueue(method, args) {
  if (!QUEUEABLE.has(method)) return false;
  const list = read();
  list.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, method, args, attempts: 0, at: Date.now() });
  write(list);
  return true;
}

/**
 * Try to send everything parked.
 *
 * Runs items in order and stops at the first connectivity failure — if the
 * network is down for item one it is down for item four, and hammering it
 * just burns battery. A non-connectivity failure (a 400, a 403) is permanent
 * for that item, so it is dropped rather than retried forever.
 */
export async function flush(api, isConnectivityError) {
  let list = read();
  if (list.length === 0) return { sent: 0, dropped: 0, left: 0 };

  let sent = 0;
  let dropped = 0;
  const remaining = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const fn = api?.[item.method];
    if (typeof fn !== "function") { dropped++; continue; } // method gone in a later build
    try {
      await fn(...(item.args || []));
      sent++;
    } catch (err) {
      if (isConnectivityError(err)) {
        // Still offline — keep this and everything after it, untouched.
        remaining.push({ ...item, attempts: item.attempts + 1 }, ...list.slice(i + 1));
        break;
      }
      // The server considered it and refused. Retrying will not change that.
      dropped++;
    }
  }

  const kept = remaining.filter((it) => it.attempts < MAX_ATTEMPTS);
  dropped += remaining.length - kept.length;
  write(kept);
  return { sent, dropped, left: kept.length };
}

export function clearQueue() {
  write([]);
}
