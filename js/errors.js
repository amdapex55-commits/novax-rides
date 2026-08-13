// Nova Go — error reporting for HANDLED errors.
//
// THE GAP THIS CLOSES
//
// Sentry automatically captures uncaught errors. It does not see anything
// caught by a try/catch — and this app catches almost everything, because a
// booking screen must not white-screen when a request fails.
//
// The cost of that showed up for real: a `TypeError: Token.set is not a
// function` on the signup path was caught, shown as "Couldn't create your
// account", and reported to nobody. Every signup on the live site failed, and
// Sentry stayed empty, because from its point of view nothing had gone wrong.
//
// So handled errors have to be triaged, not silently swallowed:
//
//   EXPECTED   — a 400 from validation, a 401 from a wrong password, a 403
//                from a parked service. These are the API doing its job. They
//                are shown to the user and NOT reported; alerting on them
//                trains everyone to ignore Sentry.
//
//   UNEXPECTED — TypeError, ReferenceError, a 5xx, a malformed response.
//                These are bugs. They get reported even though the user saw a
//                tidy message, because a tidy message is exactly what stops
//                anyone finding out.

/** Errors the API is supposed to produce. Not bugs. */
function isExpectedApiError(err) {
  const status = err?.status;
  if (typeof status !== "number") return false;
  // 4xx is the server telling the client something true: bad input, wrong
  // password, not allowed, not found. 5xx is us breaking.
  return status >= 400 && status < 500;
}

/** A network failure — the user's signal, not our code. */
function isNetworkError(err) {
  const m = String(err?.message || "").toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("load failed") ||
    err?.name === "AbortError"
  );
}

/**
 * Report a caught error if it looks like a bug.
 *
 * @param {unknown} err   the caught error
 * @param {string}  where a stable label for the code path, e.g. "signup"
 * @param {object}  [extra] small, non-identifying context
 * @returns {boolean} whether it was reported
 */
export function reportHandled(err, where, extra = {}) {
  if (!err) return false;
  if (isExpectedApiError(err) || isNetworkError(err)) return false;

  // Always log locally — this works with or without Sentry, and it's what
  // makes a bug findable while someone is standing in front of the phone.
  console.error(`[NovaGo] handled error in ${where}:`, err);

  try {
    const S = window.Sentry;
    if (!S?.captureException) return false;
    S.captureException(err, {
      tags: { handled: "true", where },
      // Deliberately no user identifiers. The scrubbing in the Sentry init
      // covers URLs; this makes sure we don't hand-feed it anything either.
      extra,
    });
    return true;
  } catch {
    // Reporting must never be able to break the thing it's reporting on.
    return false;
  }
}

/**
 * Wrap an async handler so anything it throws is reported and re-thrown.
 *
 * For call sites that already have their own catch (to show a message), call
 * reportHandled inside that catch instead — this is for the ones that don't.
 */
export function guarded(where, fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      reportHandled(err, where);
      throw err;
    }
  };
}
