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
];
const DIRS = ["css", "js", "icons", "vendor", "fonts"];
// js/map-token.js is gitignored but MUST ship — copyDir picks it up from
// the working tree, so a deploy from a checkout that has it keeps Mapbox.


// NOT copied, on purpose.
const EXCLUDED = ["ops.html", "manifest.ops.json"];

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

  Push public/ to GitHub Pages. Ops stays off the public origin.
`);
