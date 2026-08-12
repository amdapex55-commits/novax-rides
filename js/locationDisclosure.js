// Nova Go — prominent location disclosure.
//
// WHY THIS EXISTS
//
// Google Play's Prominent Disclosure policy: an app that requests
// ACCESS_BACKGROUND_LOCATION or starts a location foreground service MUST show
// its own in-app explanation FIRST — before the Android system permission
// dialog appears. Going straight to the system prompt is one of the most
// common rejection reasons for driver apps, and the rejection is on the
// listing, not the code, so it costs a full review cycle to fix.
//
// The wording below is not decorative. Google requires the disclosure to name:
//   1. that location is collected,
//   2. what it is used for,
//   3. that it happens when the app is closed or not in use.
// The phrase "even when the app is closed or not in use" is the one reviewers
// look for. Do not soften it.
//
// It also has to be dismissible with a real choice — a disclosure with only an
// "OK" button isn't consent. Declining leaves the driver offline rather than
// silently proceeding.

const ACCEPTED_KEY = "novago_location_disclosure_v1";

/** Has this driver already accepted? Versioned, so changed wording re-prompts. */
export function hasAcceptedLocationDisclosure() {
  try {
    return localStorage.getItem(ACCEPTED_KEY) === "true";
  } catch {
    // Private mode / storage disabled. Show it again rather than assume
    // consent that was never given.
    return false;
  }
}

/**
 * Show the disclosure and resolve true only on explicit acceptance.
 *
 * Deliberately localStorage, not sessionStorage: consent shouldn't be
 * re-asked every time the app restarts, but it also shouldn't be assumed
 * across a wording change — hence the version in the key.
 *
 * @returns {Promise<boolean>}
 */
export function showLocationDisclosure() {
  if (hasAcceptedLocationDisclosure()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "nx-disclosure";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "nxDiscTitle");

    modal.innerHTML = `
      <div class="nx-disclosure-card">
        <div class="nx-disclosure-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>

        <h2 id="nxDiscTitle" class="nx-disclosure-title">Location access for dispatch</h2>

        <p class="nx-disclosure-body">
          <strong>Nova Go Driver collects location data to enable trip dispatching,
          fare and route calculation, and live tracking for your customer &mdash;
          even when the app is closed or not in use.</strong>
        </p>

        <ul class="nx-disclosure-list">
          <li>You'll see a permanent notification while you're online, so it's
              always obvious when your location is being shared.</li>
          <li>Tracking stops the moment you go offline.</li>
          <li>Customers only see your position during a job they booked.</li>
        </ul>

        <button type="button" class="nx-disclosure-accept" id="nxDiscAccept">
          Accept &amp; continue
        </button>
        <button type="button" class="nx-disclosure-deny" id="nxDiscDeny">
          Not now
        </button>
        <p class="nx-disclosure-foot">
          You can't receive jobs without this. See our
          <a href="#/legal/privacy">Privacy Policy</a>.
        </p>
      </div>
    `;

    const close = (accepted) => {
      document.removeEventListener("keydown", onKey);
      modal.remove();
      resolve(accepted);
    };

    const onKey = (e) => {
      // Escape counts as declining, never as accepting.
      if (e.key === "Escape") close(false);
    };

    document.body.appendChild(modal);
    document.addEventListener("keydown", onKey);
    // Focus the primary action so a keyboard/TalkBack user lands somewhere real.
    modal.querySelector("#nxDiscAccept").focus();

    modal.querySelector("#nxDiscAccept").addEventListener("click", () => {
      try {
        localStorage.setItem(ACCEPTED_KEY, "true");
      } catch {
        // Consent still applies for this session even if it can't be stored.
      }
      close(true);
    });

    modal.querySelector("#nxDiscDeny").addEventListener("click", () => close(false));
  });
}
