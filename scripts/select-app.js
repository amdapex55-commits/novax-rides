#!/usr/bin/env node
/**
 * Nova X — pick which of the four apps to package natively.
 *
 *   node scripts/select-app.js driver
 *
 * Capacitor always loads `index.html` and always reads `capacitor.config.json`,
 * so building a specific app means putting the right files in those two spots.
 * Doing that by hand (`cp driver.html index.html && cp capacitor/... `) is how
 * you accidentally ship the driver app under the customer's appId — an
 * unrecoverable mistake once it's live on a Play listing.
 *
 * This script does it atomically and tells you exactly what it did.
 *
 * NOTE: the repo's `index.html` is the PUBLIC LANDING PAGE, not an app. The
 * customer app lives in `customer.html`. Native builds have no landing page —
 * a packaged app should open straight into its product — so this script
 * overwrites index.html with the chosen app's entry. `landing.html` keeps a
 * copy of the landing page so the web build can always be restored with
 * `node scripts/select-app.js web`.
 */
const fs = require("fs");
const path = require("path");

const APPS = {
  customer: { entry: "customer.html", config: "capacitor.customer.json", name: "Nova X", appId: "com.novax.app" },
  driver:   { entry: "driver.html",         config: "capacitor.driver.json",   name: "Nova X Driver",   appId: "com.novax.driver" },
  merchant: { entry: "merchant.html",       config: "capacitor.merchant.json", name: "Nova X Merchant", appId: "com.novax.merchant" },
  ops:      { entry: "ops.html",            config: "capacitor.ops.json",      name: "Nova X Ops",      appId: "com.novax.ops" },
};

const target = (process.argv[2] || "").toLowerCase();
const app = APPS[target];

if (!app && target !== "web") {
  console.error(`\nUsage: node scripts/select-app.js <${Object.keys(APPS).join("|")}|web>\n  web = restore index.html to the public landing page\n`);
  process.exit(1);
}

const root = path.join(__dirname, "..");
const p = (...s) => path.join(root, ...s);

// Preserve the landing page before we overwrite index.html with an app entry.
if (!fs.existsSync(p("landing.html"))) {
  fs.copyFileSync(p("index.html"), p("landing.html"));
  console.log("  saved landing.html (public landing page backup)");
}

// `web` restores the repo to its shipped state: index.html = landing page.
if (target === "web") {
  fs.copyFileSync(p("landing.html"), p("index.html"));
  console.log("\n  Restored index.html to the public landing page.\n");
  process.exit(0);
}

const entrySrc = p(app.entry);
if (!fs.existsSync(entrySrc)) {
  console.error(`\nMissing entry file: ${app.entry}\n`);
  process.exit(1);
}

const configSrc = p("capacitor", app.config);
if (!fs.existsSync(configSrc)) {
  console.error(`\nMissing config: capacitor/${app.config}\n`);
  process.exit(1);
}

fs.copyFileSync(entrySrc, p("index.html"));

// Strip the private "_" hint keys — they're documentation for humans reading
// the repo, not Capacitor config, and Capacitor warns about unknown keys.
const cfg = JSON.parse(fs.readFileSync(configSrc, "utf8"));
for (const k of Object.keys(cfg)) if (k.startsWith("_")) delete cfg[k];
fs.writeFileSync(p("capacitor.config.json"), JSON.stringify(cfg, null, 2) + "\n");

// Sanity check: does index.html actually declare the app we asked for?
const html = fs.readFileSync(p("index.html"), "utf8");
const declared = (html.match(/NOVAX_APP\s*=\s*"(\w+)"/) || [])[1];
if (declared !== target) {
  console.error(`\n  MISMATCH: index.html declares "${declared}" but you asked for "${target}". Aborting.\n`);
  process.exit(1);
}

console.log(`
  Selected: ${app.name}
    appId        ${app.appId}
    entry        ${app.entry} -> index.html
    config       capacitor/${app.config} -> capacitor.config.json
    NOVAX_APP    "${declared}"  (verified)

  Next:  npx cap sync  &&  npx cap open android
  After: node scripts/select-app.js web        (restore the landing page)
`);
