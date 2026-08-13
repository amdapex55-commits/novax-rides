#!/usr/bin/env node
/**
 * Assemble the PUBLIC web deploy (GitHub Pages) into `public/`.
 *
 * Why: ops.html is an internal dispatch console. Its API is ADMIN-guarded
 * server-side, so an outsider can't read data — but publishing the UI hands
 * a stranger your endpoint contracts, your field names and a login form to
 * probe. There is no reason for it to sit on the same public origin as the
 * marketing page.
 *
 * This build excludes it. Ops staff reach the console by:
 *   • running it locally (`npx serve .`), or
 *   • hosting it behind Cloudflare Access / HTTP Basic Auth on a private
 *     subdomain (see DEPLOY.md).
 *
 *   node scripts/deploy-public.js   → public/  (push this to Pages)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const out = path.join(root, "public");

// Everything a customer, rider or restaurant needs — and nothing else.
const FILES = [
  "index.html", "customer.html", "driver.html", "merchant.html",
  "landing.html", "offline.html", "sw.js", "robots.txt", "favicon.svg",
  "manifest.customer.json", "manifest.driver.json", "manifest.merchant.json",
  // Ops: browser only. Deliberately no native build (see capacitor/ — there
  // is no ops app to install), because a dispatcher works at a desk on a
  // real screen, not on a phone.
  "ops.html", "manifest.ops.json",
  // Google Play requires a deletion route reachable without the app installed.
  // If this stops shipping, the Play listing's data-deletion URL 404s and the
  // app is out of compliance — so it belongs in this list, not in a dir.
  "delete-account.html",
];
const DIRS = ["css", "js", "icons", "vendor", "fonts"];
// js/map-token.js is gitignored but MUST ship — copyDir picks it up from
// the working tree, so a deploy from a checkout that has it keeps Mapbox.


// OPS IS WEB-ONLY, AND IT DOES SHIP.
//
// It was excluded here on the reasoning that a dispatch console shouldn't sit
// on the public internet. But excluding it doesn't hide it — it just means
// there is nowhere to USE it from, which is worse: the desk ends up run from
// someone's laptop off a local file, with no shared URL and no way to hand
// over a shift.
//
// What actually protects it is not obscurity:
//   - every ops route requires a logged-in ADMIN (js/router.js auth: "ADMIN")
//   - every admin endpoint is behind JwtAuthGuard + RolesGuard("ADMIN")
//   - nobody can self-register as an ADMIN; the role is set in the database
// So an unauthenticated visitor gets a login screen and nothing else.
//
// HARDEN IT ANYWAY before real volume: put Cloudflare Access (or basic auth)
// in front of ops.html on its own hostname. That removes even the login
// screen from public view and gives you an audit trail of who opened the
// desk. Until then the ADMIN gate is the control.
const EXCLUDED = [];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

let copied = 0;
for (const f of FILES) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(out, f)); copied++; }
}
for (const d of DIRS) {
  const src = path.join(root, d);
  if (fs.existsSync(src)) copyDir(src, path.join(out, d));
}

/* ---------------------------------------------------------------- CSP ---

   WHY THIS IS GENERATED RATHER THAN WRITTEN BY HAND

   The app keeps everything it owns in localStorage — access token, refresh
   token, the user object. That makes XSS the highest-value bug anyone could
   find here: one injected script reads all three and the attacker is that
   customer until the refresh token expires. A CSP is the layer that survives
   an XSS we missed.

   The obvious CSP allows 'unsafe-inline' for scripts, because each entry
   point has two inline blocks (the app-mode + theme/language bootstrap, and
   Sentry's loader). But 'unsafe-inline' in script-src disables almost exactly
   the protection we are here for — an injected <script> is inline.

   Those blocks cannot simply move to external files: the theme bootstrap has
   to run before first paint to stop a dark-mode user seeing a white flash,
   which is the whole reason it is inline.

   So the hashes are computed at build time from the bytes being shipped, and
   named in the policy. It cannot rot, because it is derived rather than
   pasted.

   Every source below is something the app genuinely fetches:
     unpkg          Leaflet (js/map.js) and Three.js (landing)
     cdn.socket.io  the realtime client
     js.sentry-cdn  error reporting
     Mapbox/Carto   map tiles
     Nominatim/Photon  address search
     OSRM           routing
     Railway        our own API and websocket
   Anything not listed cannot be reached — an injected script cannot post a
   stolen token to an endpoint we never use. */

const CSP_SOURCES = {
  connect: [
    "'self'",
    /* Localhost is allowed on purpose so the EXACT bytes being shipped can be
       smoke-tested against a local backend. It gives an attacker nothing: a
       script that posts a stolen token to the victim's own machine has
       exfiltrated it to nobody. Without this, testing the production build
       means testing a different CSP than the one that ships. */
    "http://localhost:3000",
    "ws://localhost:3000",
    "https://novax-backend-production-68af.up.railway.app",
    "wss://novax-backend-production-68af.up.railway.app",
    "https://api.mapbox.com",
    "https://*.basemaps.cartocdn.com",
    "https://nominatim.openstreetmap.org",
    "https://photon.komoot.io",
    "https://router.project-osrm.org",
    "https://*.ingest.sentry.io",
    "https://*.ingest.de.sentry.io",
    "https://*.ingest.us.sentry.io",
  ],
  script: ["'self'", "https://unpkg.com", "https://cdn.socket.io", "https://js.sentry-cdn.com"],
  /* style-src keeps 'unsafe-inline'. The app sets style="" attributes in
     dozens of templates and removing them all is a separate piece of work.
     An injected stylesheet is a far weaker primitive than an injected script,
     and script-src is where the real control is. */
  style: ["'self'", "https://unpkg.com", "'unsafe-inline'"],
  img: ["'self'", "data:", "blob:", "https://api.mapbox.com", "https://*.basemaps.cartocdn.com", "https://*.tile.openstreetmap.org"],
  font: ["'self'", "data:"],
  media: ["'self'", "blob:", "https://novax-backend-production-68af.up.railway.app"],
};

function inlineScriptHashes(html) {
  const hashes = [];
  // Only blocks with no src — those are the ones a hash has to cover.
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1];
    if (!body.trim()) continue;
    hashes.push(`'sha256-${crypto.createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
  return hashes;
}

function buildCsp(scriptHashes) {
  return [
    "default-src 'self'",
    `script-src ${[...CSP_SOURCES.script, ...scriptHashes].join(" ")}`,
    `style-src ${CSP_SOURCES.style.join(" ")}`,
    `img-src ${CSP_SOURCES.img.join(" ")}`,
    `font-src ${CSP_SOURCES.font.join(" ")}`,
    `connect-src ${CSP_SOURCES.connect.join(" ")}`,
    `media-src ${CSP_SOURCES.media.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    /* frame-ancestors is deliberately ABSENT: it is ignored in a <meta>
       element (the browser logs an error and drops it) and GitHub Pages
       cannot set a response header. Leaving it in produced a console error on
       every page load that looked like a real CSP failure and masked actual
       ones. Clickjacking cover comes from the frame-buster in each entry
       point's inline bootstrap instead. When this moves behind Cloudflare or
       any real origin, set the header there. */
    "form-action 'self'",
    "base-uri 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

let cspApplied = 0;
for (const f of FILES) {
  if (!f.endsWith(".html")) continue;
  const dest = path.join(out, f);
  if (!fs.existsSync(dest)) continue;
  let html = fs.readFileSync(dest, "utf8");
  if (/http-equiv="Content-Security-Policy"/i.test(html)) continue;
  const csp = buildCsp(inlineScriptHashes(html));
  const tag = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  const at = html.search(/<head[^>]*>/i);
  if (at === -1) continue;
  const insertAt = html.indexOf(">", at) + 1;
  html = html.slice(0, insertAt) + "\n" + tag + "\n" + html.slice(insertAt);
  fs.writeFileSync(dest, html);
  cspApplied++;
}

// Fail loudly if an excluded file somehow made it in.
for (const bad of EXCLUDED) {
  if (fs.existsSync(path.join(out, bad))) {
    console.error(`\n  ABORT: ${bad} ended up in the public build.\n`);
    process.exit(1);
  }
}

console.log(`
  Public build ready → public/

    ${copied} files + ${DIRS.length} asset directories
    CSP injected into ${cspApplied} HTML files (inline scripts hashed)
    EXCLUDED: ${EXCLUDED.join(", ")}

  Push public/ to GitHub Pages. Ops ships too — it's browser-only\n  and gated on the ADMIN role.
`);
