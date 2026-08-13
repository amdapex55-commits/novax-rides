// Nova Go — light / dark theme.
//
// WHY THE DRIVER APP DEFAULTS TO DARK AND THE CUSTOMER APP DOES NOT
//
// A customer opens this app for thirty seconds, usually outdoors, often in
// direct Karachi sunlight where a dark screen is genuinely harder to read.
// Following the phone's own setting is the right call for them.
//
// A driver has it mounted on the handlebars for a ten-hour shift that runs
// well past dark. A white screen at night wrecks night vision for a few
// seconds every time a job comes in, and they are moving in traffic when it
// happens. So DRIVER_DEFAULT_DARK flips the default — the driver can still
// override it, but the safe option is the one they get without choosing.
//
// THREE STATES, NOT TWO
//
// "system" is a real, distinct choice, not the absence of one: it means
// "follow the phone", and it must keep tracking the OS as the OS changes.
// Storing only light/dark would silently freeze a user who had never
// expressed a preference at whatever the OS happened to be on first launch.

const KEY = "novago.theme"; // "light" | "dark" | "system"

/** Only these three are ever written to the attribute or storage. */
const MODES = ["light", "dark", "system"];

function appName() {
  return (typeof window !== "undefined" && window.NOVAGO_APP) || "customer";
}

/** Drivers ride at night; see the header. */
function defaultMode() {
  return appName() === "driver" ? "dark" : "system";
}

export function getThemeMode() {
  try {
    const saved = localStorage.getItem(KEY);
    if (MODES.includes(saved)) return saved;
  } catch {
    // Private mode / storage disabled — fall through to the default.
  }
  return defaultMode();
}

/** What is actually on screen right now: never returns "system". */
export function resolvedTheme() {
  const mode = getThemeMode();
  if (mode !== "system") return mode;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Keep the browser chrome in step with the page.
 *
 * Without this the status bar and the pull-to-refresh backdrop stay white
 * behind a dark app, which looks like a rendering bug rather than a theme.
 */
function syncBrowserChrome(theme) {
  const color = theme === "dark" ? "#100d16" : "#ffffff";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    // Leave media-scoped tags alone — those are doing their own job.
    if (!m.getAttribute("media")) m.setAttribute("content", color);
  });
  document.documentElement.style.colorScheme = theme;
}

export function applyTheme(mode = getThemeMode()) {
  const root = document.documentElement;
  // "system" removes the attribute entirely so the @media rule in tokens.css
  // is what decides. Writing data-theme="system" would match neither branch
  // and strand the page on the light defaults.
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  syncBrowserChrome(resolvedTheme());
  return resolvedTheme();
}

export function setThemeMode(mode) {
  if (!MODES.includes(mode)) mode = "system";
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Non-fatal: the theme still applies for this session, it just won't
    // survive a reload.
  }
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent("novago:themechange", { detail: { mode, theme: resolvedTheme() } }));
  return resolvedTheme();
}

/** Cycles the visible theme. Used by the header toggle. */
export function toggleTheme() {
  return setThemeMode(resolvedTheme() === "dark" ? "light" : "dark");
}

export function initTheme() {
  applyTheme();
  // Only meaningful while the mode is "system" — but the listener is cheap and
  // guarding inside it is simpler than adding and removing it on every change.
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (getThemeMode() === "system") applyTheme("system");
  });
}
