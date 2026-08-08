#!/usr/bin/env node
/**
 * Build one of the four Nova X apps for Capacitor.
 *
 * ============================================================================
 * WHY THIS NO LONGER TOUCHES index.html
 * ============================================================================
 * The previous version copied the chosen app's entry OVER the repo's
 * index.html, then relied on you remembering to run `npm run app:web` to put
 * the landing page back.
 *
 * That is a loaded gun. Build the customer app, forget the restore, commit,
 * push — and GitHub Pages instantly serves the customer app at your marketing
 * URL. Your landing page is gone, and nothing warns you, because the commit
 * looks completely normal.
 *
 * Now the build assembles into `www/`, which is gitignored and rebuilt from
 * scratch every time. Capacitor's webDir points there. The repo's index.html
 * is never modified, so there is nothing to restore and nothing to forget.
 *
 *   node scripts/select-app.js customer   → www/ contains the customer app
 *   npx cap sync android
 *
 * `www/` is disposable. Delete it any time.
 * ============================================================================
 */
const fs = require("fs");
const path = require("path");

const APPS = {
  customer: { entry: "customer.html", config: "capacitor.customer.json", name: "Nova Go",          appId: "com.novax.app" },
  driver:   { entry: "driver.html",   config: "capacitor.driver.json",   name: "Nova Go Rider",    appId: "com.novax.driver" },
  merchant: { entry: "merchant.html", config: "capacitor.merchant.json", name: "Nova X Merchant",  appId: "com.novax.merchant" },
  ops:      { entry: "ops.html",      config: "capacitor.ops.json",      name: "Nova X Ops",       appId: "com.novax.ops" },
};

// Everything the apps need at runtime. Deliberately an allowlist, not a
// "copy everything except…" — that way a new stray file in the repo root
// can't silently end up inside a shipped APK.
const ASSET_DIRS = ["css", "js", "icons"];
const ASSET_FILES = ["favicon.svg"];

const target = (process.argv[2] || "").toLowerCase();

if (target === "web") {
  console.log(
    "\n  `web` is no longer needed.\n" +
    "  Builds go to www/ and never modify index.html, so there is nothing to restore.\n",
  );
  process.exit(0);
}

const app = APPS[target];
if (!app) {
  console.error(`\nUsage: node scripts/select-app.js <${Object.keys(APPS).join("|")}>\n`);
  process.exit(1);
}

const root = path.join(__dirname, "..");
const p = (...s) => path.join(root, ...s);
const www = p("www");

/* -------------------------------------------------------------- helpers -- */

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, item.name);
    const to = path.join(dest, item.name);
    if (item.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/* ---------------------------------------------------------------- build -- */

const entrySrc = p(app.entry);
if (!fs.existsSync(entrySrc)) {
  console.error(`\nMissing entry file: ${app.entry}\n`);
  process.exit(1);
}

// Always start clean. A stale file from a previous app is exactly the kind of
// thing that ships to a store and is never noticed.
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

// The chosen entry becomes www/index.html — Capacitor always loads index.html.
fs.copyFileSync(entrySrc, path.join(www, "index.html"));

for (const dir of ASSET_DIRS) {
  if (fs.existsSync(p(dir))) copyDir(p(dir), path.join(www, dir));
}
for (const file of ASSET_FILES) {
  if (fs.existsSync(p(file))) fs.copyFileSync(p(file), path.join(www, file));
}

// Per-app manifest, renamed so the entry's <link rel="manifest"> resolves.
const manifestSrc = p(`manifest.${target}.json`);
if (fs.existsSync(manifestSrc)) {
  fs.copyFileSync(manifestSrc, path.join(www, `manifest.${target}.json`));
}

// Service worker, so a packaged app keeps its offline behaviour.
if (fs.existsSync(p("sw.js"))) fs.copyFileSync(p("sw.js"), path.join(www, "sw.js"));

/* --------------------------------------------------------------- verify -- */

// Confirm the built entry really declares the app we were asked for. Shipping
// the driver app under the customer's appId is unrecoverable once it's live
// on a store listing.
const built = fs.readFileSync(path.join(www, "index.html"), "utf8");
const declared = built.match(/window\.NOVAX_APP\s*=\s*["'](\w+)["']/);
if (!declared || declared[1] !== target) {
  console.error(
    `\n  ABORT: ${app.entry} declares NOVAX_APP="${declared ? declared[1] : "none"}" ` +
    `but you asked for "${target}".\n  Refusing to build a mislabelled app.\n`,
  );
  fs.rmSync(www, { recursive: true, force: true });
  process.exit(1);
}

// Swap in the matching Capacitor config (appId + appName).
const cfgSrc = p(app.config);
if (fs.existsSync(cfgSrc)) {
  fs.copyFileSync(cfgSrc, p("capacitor.config.json"));
} else {
  // Generate it rather than failing — one less file to keep in sync by hand.
  const base = JSON.parse(fs.readFileSync(p("capacitor.config.json"), "utf8"));
  base.appId = app.appId;
  base.appName = app.name;
  base.webDir = "www";
  fs.writeFileSync(p("capacitor.config.json"), JSON.stringify(base, null, 2) + "\n");
}

console.log(`
  Built ${app.name}  (${app.appId})

    source : ${app.entry}
    output : www/
    verified NOVAX_APP = "${target}"

  Next:
    npx cap sync android
    npx cap open android

  index.html was NOT modified — your landing page is untouched.
`);
