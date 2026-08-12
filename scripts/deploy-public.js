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
    EXCLUDED: ${EXCLUDED.join(", ")}

  Push public/ to GitHub Pages. Ops ships too — it's browser-only\n  and gated on the ADMIN role.
`);
