#!/usr/bin/env node
/**
 * Build one of the four Nova Go apps for Capacitor.
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
  customer: { entry: "customer.html", config: "capacitor.customer.json", name: "Nova Go",          appId: "com.novagorides.customer" },
  driver:   { entry: "driver.html",   config: "capacitor.driver.json",   name: "Nova Go Rider",    appId: "com.novagorides.driver" },
  merchant: { entry: "merchant.html", config: "capacitor.merchant.json", name: "Nova Go Merchant",  appId: "com.novagorides.merchant" },
  ops:      { entry: "ops.html",      config: "capacitor.ops.json",      name: "Nova Go Ops",       appId: "com.novagorides.ops" },
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
const declared = built.match(/window\.NOVAGO_APP\s*=\s*["'](\w+)["']/);
if (!declared || declared[1] !== target) {
  console.error(
    `\n  ABORT: ${app.entry} declares NOVAGO_APP="${declared ? declared[1] : "none"}" ` +
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

/* ------------------------------------------------- android manifest ------

   PERMISSIONS FOLLOW THE APP, BECAUSE THERE IS ONLY ONE android/ PROJECT.

   All four builds share a single native project — select-app swaps the web
   assets and the appId, then `cap sync` copies them in. The AndroidManifest
   does NOT swap on its own, which is a trap: whichever set of permissions was
   last written stays there for every subsequent build.

   That matters in one direction far more than the other. ACCESS_BACKGROUND_
   LOCATION on the CUSTOMER build means a Play Store background-location
   declaration and a manual policy review — for a capability that build never
   uses and cannot justify. Reviews are refused for exactly this. Meanwhile
   the DRIVER build without it silently stops reporting position the moment
   the screen locks, which is the failure BACKGROUND-GPS.md exists to describe.

   So the manifest is rewritten on every build, from this table.             */

const ANDROID_PERMISSIONS = {
  // Every build talks to the API.
  _base: ["android.permission.INTERNET", "android.permission.ACCESS_NETWORK_STATE"],

  // The customer needs a pin for pickup, and nothing more. Foreground only.
  customer: ["android.permission.ACCESS_COARSE_LOCATION", "android.permission.ACCESS_FINE_LOCATION"],

  // The rider is tracked through a whole shift, with the screen off and the
  // app behind Google Maps. That needs the background grant AND a location-
  // typed foreground service, or Android suspends the updates.
  driver: [
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_BACKGROUND_LOCATION",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_LOCATION",
    // Android 13+: without this the foreground-service notification the OS
    // requires us to show is silently dropped, and the driver has no way to
    // tell the service is running.
    "android.permission.POST_NOTIFICATIONS",
  ],

  // A kitchen tablet and an ops desk never need a position.
  merchant: [],
  ops: [],
};

function writeAndroidManifest(appKey) {
  const manifestPath = p("android", "app", "src", "main", "AndroidManifest.xml");
  if (!fs.existsSync(manifestPath)) return null; // no native project yet — fine

  const perms = [...ANDROID_PERMISSIONS._base, ...(ANDROID_PERMISSIONS[appKey] || [])];
  const block =
    "    <!-- GENERATED by scripts/select-app.js for the `" + appKey + "` build.\n" +
    "         Do not hand-edit: the next build overwrites this block. Change\n" +
    "         ANDROID_PERMISSIONS in that script instead. -->\n" +
    perms.map((x) => `    <uses-permission android:name="${x}" />`).join("\n");

  let xml = fs.readFileSync(manifestPath, "utf8");
  // Replace everything from the first uses-permission to the last, inclusive.
  const first = xml.indexOf("<uses-permission");
  const lastEnd = xml.lastIndexOf("<uses-permission");
  if (first === -1) return null;
  const closeOfLast = xml.indexOf(">", lastEnd) + 1;
  xml = xml.slice(0, first) + block.trimStart() + xml.slice(closeOfLast);
  fs.writeFileSync(manifestPath, xml);
  return perms;
}

/* ------------------------------------------ android application id ------

   THE MANIFEST FOLLOWED THE APP AND THE APPLICATION ID DID NOT.

   `cap add android` writes applicationId once, from whichever appId was in
   capacitor.config.json at the time, and nothing has rewritten it since —
   not cap sync, and until now not this script. So every AAB this project
   could produce carried the customer's identity, including the driver one.

   The comment forty lines above says shipping the driver app under the
   customer's appId is unrecoverable once it is live. It was true, and the
   build did it. The verify step did not catch it because it checks
   NOVAGO_APP in index.html, which is the web layer, not the store identity. */

function writeAndroidAppId(appKey, appId) {
  const gradlePath = p("android", "app", "build.gradle");
  if (!fs.existsSync(gradlePath)) return null;
  let g = fs.readFileSync(gradlePath, "utf8");
  if (!/applicationId\s+"[^"]*"/.test(g)) return null;
  g = g.replace(/applicationId\s+"[^"]*"/, `applicationId "${appId}"`);
  fs.writeFileSync(gradlePath, g);
  return appId;
}

/* --------------------------------------------------- android signing -----

   WITHOUT THIS, `gradlew bundleRelease` PRODUCES AN UNSIGNED AAB and the Play
   Console rejects it on upload. Capacitor does not scaffold a signing config,
   and android/ is gitignored and regenerated, so the config cannot simply be
   committed once — it has to be reapplied on every build, from here.

   The keystore itself and its passwords live OUTSIDE the repo, in
   ~/.novago/, for the same reason the ops credentials do. Nothing secret is
   in this file: it only points at them.

   ⚠️ THE KEYSTORE IS UNREPLACEABLE. Google identifies an app by the key it
   was signed with. Lose it and you cannot ship an update to that listing
   ever again — not with a new key, not by asking support. Back it up
   somewhere that is not this laptop before the first upload. */

function writeAndroidSigning() {
  const gradlePath = p("android", "app", "build.gradle");
  if (!fs.existsSync(gradlePath)) return null;

  const os = require("os");
  const propsPath = path.join(os.homedir(), ".novago", "keystore.properties");
  if (!fs.existsSync(propsPath)) return "missing"; // not set up yet — debug builds still work

  let g = fs.readFileSync(gradlePath, "utf8");
  if (g.includes("novagoSigning")) return "already"; // idempotent across rebuilds

  const loader = `
def novagoSigning = new Properties()
def novagoPropsFile = new File(System.getProperty("user.home"), ".novago/keystore.properties")
if (novagoPropsFile.exists()) {
    novagoPropsFile.withInputStream { novagoSigning.load(it) }
}
`;
  // Load the properties before the android {} block reads them.
  g = g.replace(/^android\s*\{/m, loader + "\nandroid {");

  const configs = `
    signingConfigs {
        release {
            if (novagoSigning['storeFile']) {
                storeFile file(novagoSigning['storeFile'])
                storePassword novagoSigning['storePassword']
                keyAlias novagoSigning['keyAlias']
                keyPassword novagoSigning['keyPassword']
            }
        }
    }
`;
  g = g.replace(/(\n\s*buildTypes\s*\{)/, configs + "$1");

  // Point the release build type at it.
  g = g.replace(
    /(buildTypes\s*\{\s*\n\s*release\s*\{)/,
    "$1\n            if (novagoSigning['storeFile']) signingConfig signingConfigs.release"
  );

  fs.writeFileSync(gradlePath, g);
  return "written";
}

/* ------------------------------------------------------ ios Info.plist ---

   SAME TRAP AS THE MANIFEST, WITH A WORSE FAILURE MODE.

   There is one ios/ project shared by all four builds, so the usage strings
   have to be rewritten per build for the same reason the permissions do. But
   on iOS a MISSING usage string is not a rejection — the process is killed
   the instant it asks for the permission. An app with no
   NSLocationWhenInUseUsageDescription does not degrade; it crashes on the
   screen where the customer sets their pickup.

   Apple also reads these strings. "Required for app functionality" is a
   documented rejection reason; the string has to say what the app does with
   the data, in words a person would use. These do.                          */

const IOS_USAGE = {
  customer: {
    NSLocationWhenInUseUsageDescription:
      "Nova Go uses your location to set your pickup point and show your rider approaching on the map. We only use it while the app is open.",
    NSCameraUsageDescription:
      "Nova Go uses the camera so you can add a photo to a support request about a trip.",
    NSPhotoLibraryUsageDescription:
      "Nova Go needs access to your photos so you can attach one to a support request.",
  },

  /* The rider is the only build that asks for Always, and it is the only one
     that can justify it: a rider is dispatched, tracked and held accountable
     for a passenger's safety across a whole shift, with the phone in a pocket
     or the screen off behind Google Maps. */
  driver: {
    NSLocationWhenInUseUsageDescription:
      "Nova Go uses your location to send you jobs nearby and to show your customer where you are.",
    NSLocationAlwaysAndWhenInUseUsageDescription:
      "Nova Go needs your location while you are online, including when the app is in the background or your screen is off, so we can send you jobs and so your passenger can see you approaching. Location is never collected while you are offline.",
    NSLocationAlwaysUsageDescription:
      "Nova Go needs your location while you are online, including in the background, so we can dispatch jobs to you and your passenger can track the ride. Location is never collected while you are offline.",
    NSCameraUsageDescription:
      "Nova Go uses the camera to photograph your CNIC, licence and vehicle for verification, and to capture proof of delivery.",
    NSPhotoLibraryUsageDescription:
      "Nova Go needs access to your photos so you can upload your CNIC, licence and vehicle photos for verification.",
  },

  merchant: {
    NSCameraUsageDescription:
      "Nova Go uses the camera to photograph your menu items and storefront.",
    NSPhotoLibraryUsageDescription:
      "Nova Go needs access to your photos so you can upload menu and storefront images.",
  },

  ops: {},
};

// Only the rider build runs location with the app backgrounded. Declaring
// this on any other build invites the reviewer to ask which feature uses it.
const IOS_BACKGROUND_MODES = { driver: ["location"] };

function writeIosPlist(appKey, appId, displayName) {
  const plist = p("ios", "App", "App", "Info.plist");
  if (!fs.existsSync(plist)) return null;
  if (process.platform !== "darwin") return null; // PlistBuddy is macOS-only

  const { execFileSync } = require("child_process");
  const PB = "/usr/libexec/PlistBuddy";
  if (!fs.existsSync(PB)) return null;

  const run = (cmd) => {
    try { execFileSync(PB, ["-c", cmd, plist], { stdio: "pipe" }); return true; }
    catch { return false; }
  };

  // Clear every usage string first, so switching from driver to customer
  // actually REMOVES the Always-location string rather than leaving it
  // behind on a build that cannot justify it.
  const allKeys = new Set();
  Object.values(IOS_USAGE).forEach((set) => Object.keys(set).forEach((k) => allKeys.add(k)));
  allKeys.forEach((k) => run(`Delete :${k}`));
  run("Delete :UIBackgroundModes");

  const usage = IOS_USAGE[appKey] || {};
  Object.entries(usage).forEach(([k, v]) => {
    run(`Add :${k} string ${JSON.stringify(v)}`);
  });

  const modes = IOS_BACKGROUND_MODES[appKey] || [];
  if (modes.length) {
    run("Add :UIBackgroundModes array");
    modes.forEach((m) => run(`Add :UIBackgroundModes: string ${m}`));
  }

  run(`Set :CFBundleDisplayName ${JSON.stringify(displayName)}`);

  // The bundle identifier lives in the pbxproj, not the plist — the plist
  // just references $(PRODUCT_BUNDLE_IDENTIFIER).
  const pbx = p("ios", "App", "App.xcodeproj", "project.pbxproj");
  if (fs.existsSync(pbx)) {
    let x = fs.readFileSync(pbx, "utf8");
    x = x.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]*;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${appId};`);
    fs.writeFileSync(pbx, x);
  }

  return { usage: Object.keys(usage), modes };
}

const writtenPerms = writeAndroidManifest(target);
const writtenAppId = writeAndroidAppId(target, app.appId);
const writtenIos = writeIosPlist(target, app.appId, app.name);
const writtenSigning = writeAndroidSigning();

console.log(`
  Built ${app.name}  (${app.appId})

    source : ${app.entry}
    output : www/
    verified NOVAGO_APP = "${target}"
${writtenPerms
  ? `    android  : manifest rewritten — ${writtenPerms.length} permissions\n` +
    writtenPerms.map((x) => `               ${x.replace("android.permission.", "")}`).join("\n")
  : "    android  : no native project yet (npx cap add android)"}
${writtenAppId ? `    android  : applicationId = ${writtenAppId}` : ""}
${writtenSigning === "written" ? "    android  : release signing config injected"
  : writtenSigning === "already" ? "    android  : release signing already configured"
  : writtenSigning === "missing" ? "    android  : NO SIGNING — see IOS-SETUP.md / ANDROID-RELEASE.md"
  : ""}
${writtenIos
  ? `    ios      : bundle id = ${app.appId}\n` +
    `               ${writtenIos.usage.length} usage string(s)` +
    (writtenIos.modes.length ? `, background modes: ${writtenIos.modes.join(", ")}` : ", no background modes")
  : "    ios      : no native project yet (npx cap add ios)"}

  Next:
    npx cap sync android
    npx cap open android

  index.html was NOT modified — your landing page is untouched.
`);
