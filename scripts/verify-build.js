/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Post-build gate. Runs against public/ AFTER deploy-public.js.
 *
 * WHY THIS EXISTS
 *
 * The build generates a CSP from what it thinks is being shipped, then writes
 * it into eight HTML files. Nothing checked that the result actually permits
 * the app to run. The failure mode is silent in the worst way: the page loads,
 * the markup renders, and the browser blocks a script — so it looks fine to
 * anyone who is not watching the console.
 *
 * WHAT THIS DOES AND DOES NOT PROVE
 *
 * This is a STATIC check. It proves the shipped CSP permits every resource the
 * shipped HTML references, that every inline script is covered by a hash, and
 * that the build is complete and free of obvious leaks. It does NOT execute
 * the app, so it cannot prove that booking works, that the socket connects, or
 * that Mapbox draws. Those need a real browser against a real backend — see
 * TESTING.md. This catches the class of bug that ships silently; it is not a
 * substitute for running the thing.
 *
 * Deliberately zero-dependency, like audit.js and check-syntax.js. A build
 * gate that needs an install is a build gate that gets skipped.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const out = path.join(__dirname, "..", "public");
const findings = [];
const fail = (check, detail) => findings.push({ check, detail });

if (!fs.existsSync(out)) {
  console.error("\n  public/ does not exist — run scripts/deploy-public.js first.\n");
  process.exit(1);
}

/* ------------------------------------------------------------------ 1 --- */
/* FAIL CLOSED ON A MISSING FILE. The old build skipped anything absent, so
   deleting customer.html still produced a "successful" deploy of a site with
   no customer app in it.                                                    */
const REQUIRED_FILES = [
  "index.html", "customer.html", "driver.html", "merchant.html", "ops.html",
  "landing.html", "offline.html", "delete-account.html",
  "sw.js", "robots.txt", "favicon.svg", "build-manifest.json",
];
const REQUIRED_DIRS = ["css", "js", "icons", "fonts", "vendor"];

for (const f of REQUIRED_FILES) {
  if (!fs.existsSync(path.join(out, f))) fail("missing-file", f);
}
for (const d of REQUIRED_DIRS) {
  const p = path.join(out, d);
  if (!fs.existsSync(p) || fs.readdirSync(p).length === 0) fail("missing-dir", `${d}/ absent or empty`);
}

/* ------------------------------------------------------------------ 2 --- */
/* The service worker must carry a stamped build id, not the hand-written dev
   default. An unstamped SW means returning users keep their old modules
   against a new shell — see deploy-public.js.                               */
{
  const sw = path.join(out, "sw.js");
  if (fs.existsSync(sw)) {
    const m = /const VERSION = "([^"]*)";/.exec(fs.readFileSync(sw, "utf8"));
    if (!m) fail("sw-version", "VERSION constant not found in the shipped sw.js");
    else if (/^novago-v\d+$/.test(m[1])) {
      fail("sw-version", `sw.js still carries the dev default "${m[1]}" — it was not stamped`);
    }
  }
}

/* ------------------------------------------------------------------ 3 --- */
/* CSP: every page has one, every inline script is hashed by it, and every
   external resource it references is allowed by it.                         */
const htmlFiles = REQUIRED_FILES.filter((f) => f.endsWith(".html"));

/** Does `url` satisfy any source in `sources`? Handles https://*.host. */
function allowedBy(url, sources) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return true; // relative — covered by 'self'
  }
  const host = new URL(url).host;
  return sources.some((src) => {
    const s = src.replace(/^'|'$/g, "");
    if (s === "self" || s.startsWith("sha256-") || s === "unsafe-inline") return false;
    if (s === origin || s === url) return true;
    const wm = /^(https?):\/\/\*\.(.+)$/.exec(s);
    if (wm) return url.startsWith(wm[1] + "://") && host.endsWith("." + wm[2]);
    return url.startsWith(s);
  });
}

function directive(csp, name) {
  const m = new RegExp(`(?:^|;)\\s*${name}\\s+([^;]+)`).exec(csp);
  return m ? m[1].trim().split(/\s+/) : [];
}

for (const f of htmlFiles) {
  const p = path.join(out, f);
  if (!fs.existsSync(p)) continue;
  const html = fs.readFileSync(p, "utf8");

  const cspMatch = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i.exec(html);
  if (!cspMatch) { fail("no-csp", f); continue; }
  const csp = cspMatch[1];

  const scriptSrc = directive(csp, "script-src");
  const styleSrc = directive(csp, "style-src");
  const connectSrc = directive(csp, "connect-src");

  // 3a. Every inline script must have its hash in script-src. This is the one
  //     that silently kills a page: an inline bootstrap that was edited after
  //     the hash was computed is blocked, and with it the whole boot.
  const inline = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = inline.exec(html)) !== null) {
    const body = m[1];
    if (!body.trim()) continue;
    const hash = "'sha256-" + crypto.createHash("sha256").update(body, "utf8").digest("base64") + "'";
    if (!scriptSrc.includes(hash)) {
      fail("unhashed-inline-script", `${f}: an inline <script> is not covered by script-src`);
    }
  }

  // 3b. External scripts and stylesheets must be permitted.
  for (const sm of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/gi)) {
    if (!allowedBy(sm[1], scriptSrc)) fail("csp-blocks-script", `${f}: ${sm[1]}`);
  }
  for (const lm of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/gi)) {
    if (!allowedBy(lm[1], styleSrc)) fail("csp-blocks-style", `${f}: ${lm[1]}`);
  }

  // 3c. The API origin the app actually calls must be in connect-src. A CSP
  //     that forgets it produces an app that loads perfectly and cannot talk
  //     to the backend — which looks like a backend outage, not a CSP bug.
  if (connectSrc.length && !connectSrc.some((s) => s.includes("railway.app") || s.includes("novago"))) {
    fail("connect-src-missing-api", `${f}: no backend origin in connect-src`);
  }
}

/* ------------------------------------------------------------------ 4 --- */
/* Source maps. A shipped .map hands over the unminified original; a
   sourceMappingURL pointing at one that isn't there is just a 404 per load. */
function walk(dir, hit) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, hit);
    else hit(p);
  }
}
walk(out, (p) => {
  if (p.endsWith(".map")) fail("source-map-shipped", path.relative(out, p));
  else if (/\.(js|css)$/.test(p)) {
    const src = fs.readFileSync(p, "utf8");
    if (/[#@]\s*sourceMappingURL=/.test(src)) {
      fail("source-map-reference", path.relative(out, p));
    }
  }
});

/* ------------------------------------------------------------------ 5 --- */
/* Secrets. Not every match is real — the build should stop and make a human
   look, which is the whole point.                                           */
const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
  [/\bsk_live_[A-Za-z0-9]{8,}/, "stripe live secret key"],
  [/\bsk_test_[A-Za-z0-9]{8,}/, "stripe test secret key"],
  [/\bclient_secret\s*[:=]\s*["'][^"']{8,}/i, "client_secret assignment"],
  [/\bAWS_SECRET[A-Z_]*\s*[:=]/i, "aws secret"],
  [/\bservice_role\b/, "service_role key"],
  // The Mapbox token is a pk.* and is MEANT to be public — sk.* is not.
  [/\bsk\.eyJ[A-Za-z0-9_-]{10,}/, "mapbox SECRET token (sk.*)"],
];
walk(out, (p) => {
  if (!/\.(js|css|html|json|txt|svg)$/.test(p)) return;
  const src = fs.readFileSync(p, "utf8");
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(src)) fail("possible-secret", `${path.relative(out, p)}: ${label}`);
  }
});

/* ------------------------------------------------------------------- */
const CHECKS = [
  "missing-file", "missing-dir", "sw-version", "no-csp", "unhashed-inline-script",
  "csp-blocks-script", "csp-blocks-style", "connect-src-missing-api",
  "source-map-shipped", "source-map-reference", "possible-secret",
];
const byCheck = {};
for (const f of findings) (byCheck[f.check] ||= []).push(f.detail);

console.log("\n  Nova Go build verification\n");
for (const c of CHECKS) {
  const hits = byCheck[c] || [];
  console.log(`  ${hits.length ? "✗" : "✓"} ${c}${hits.length ? ` (${hits.length})` : ""}`);
  for (const d of hits) console.log(`      ${d}`);
}
console.log(
  findings.length === 0
    ? `\n  Build verified. NOTE: this is static — it does not prove the app RUNS.\n  A real trip through TESTING.md is still the thing that does.\n`
    : `\n  ${findings.length} finding(s) — refusing to publish.\n`,
);
process.exit(findings.length ? 1 : 0);
