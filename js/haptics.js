// Nova Go — haptic feedback.
//
// A short vibration on a primary action is the single cheapest thing that
// makes a WebView feel native. It's also the difference between a driver
// wearing gloves knowing their tap registered and tapping twice.
//
// Reads window.Capacitor.Plugins rather than importing @capacitor/haptics: this
// app ships as unbundled ES modules with no bundler to resolve that import.
// In a browser the global is absent and every call is a no-op, which is the
// correct behaviour — desktop browsers have no haptics engine.

function plugin() {
  return typeof window !== "undefined" ? window.Capacitor?.Plugins?.Haptics : undefined;
}

/**
 * Fire and forget, always. A failed vibration must never surface to the user
 * or interrupt the action it was decorating — haptics are garnish.
 */
function safe(fn) {
  try {
    const h = plugin();
    if (!h) return;
    const result = fn(h);
    if (result?.catch) result.catch(() => {});
  } catch {
    /* no haptics engine, or permission denied */
  }
}

export const haptic = {
  /** Tabs, chips, selecting a tip, toggling an option. */
  light: () => safe((h) => h.impact({ style: "LIGHT" })),

  /** Primary buttons: Book, Accept, Go online. */
  medium: () => safe((h) => h.impact({ style: "MEDIUM" })),

  /** Rider matched, trip completed, payment recorded. */
  success: () => safe((h) => h.notification({ type: "SUCCESS" })),

  /** Cancellations and refusals. */
  warning: () => safe((h) => h.notification({ type: "WARNING" })),

  /**
   * SOS only.
   *
   * Deliberately the heaviest pattern in the app and used in exactly one
   * place: pressing the panic button must feel different from pressing
   * anything else, so a person who cannot look at their screen still knows it
   * registered.
   */
  emergency: () => safe((h) => h.vibrate({ duration: 400 })),
};
