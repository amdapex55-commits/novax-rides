#!/usr/bin/env node
/**
 * Nova Go — the checks that keep finding real bugs.
 *
 * WHY THIS EXISTS
 *
 * Eight bugs across recent sessions were all the same shape, and every one was
 * found by a throwaway script that was then thrown away — which is exactly why
 * the next one kept getting through:
 *
 *   - `track` used without importing it, so tapping a saved place threw
 *   - `reportHandled` likewise, so saving a profile threw
 *   - `state` missing in opsCommand, so a new link would have thrown
 *   - #whereToCard rendered with no handler — the main home CTA did nothing
 *   - /alerts registered but not allowlisted, so notifications were unreachable
 *   - /explainer/fixed-fare didn't exist, and the biggest promo pointed at it
 *   - the heartbeat endpoint shipped with nothing calling it
 *   - badge-danger used and never defined
 *
 * None of these are caught by a syntax check. There is no bundler and no type
 * checker on this codebase, so nothing else looks at them at all.
 *
 *   npm run audit          report and exit non-zero on failures
 *   npm run audit -- --warn  report but always exit 0
 *
 * Every check prints the FILE and the SYMBOL, because a check that only says
 * "something is wrong" gets ignored.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const warnOnly = process.argv.includes("--warn");
const findings = [];
const fail = (check, detail) => findings.push({ check, detail });

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(rel, out); }
    else if (e.name.endsWith(".js")) out.push(rel);
  }
  return out;
}
const JS_FILES = walk("js");
/** Comments and strings produce false positives in every check below. */
const stripped = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

/* ------------------------------------------------------------------ 1 --- */
/* Symbols used but never imported or defined — a guaranteed ReferenceError
   the first time that line runs, and invisible until a user hits it.        */
const WATCHED = [
  "track", "haptic", "esc", "toast", "icon", "fmtMoney", "fmtDate", "reportHandled",
  "navigate", "skeletonRows", "state", "Token", "countUp", "confettiBurst",
  "trustCard", "dockSheet", "emptyRich", "APP_CONFIG", "APP_VERSION", "PRICING",
  "SERVICES", "enablePush",
];
for (const f of JS_FILES) {
  const src = read(f);
  const body = stripped(src);
  for (const sym of WATCHED) {
    if (!new RegExp(`(?<![A-Za-z0-9_.$])${sym}\\s*[.(]`).test(body)) continue;
    const imported = new RegExp(`import\\s*\\{[^}]*\\b${sym}\\b[^}]*\\}`).test(src);
    const defined = new RegExp(`(?:function|const|let|var|class)\\s+${sym}\\b`).test(body);
    // A same-named function parameter or destructured field is fine.
    const local = new RegExp(`[({,]\\s*${sym}\\s*[,)}:=]`).test(body);
    if (!imported && !defined && !local) fail("undefined-symbol", `${f} uses \`${sym}\``);
  }
}

/* ------------------------------------------------------------------ 2 --- */
/* Nav targets with no route. Covers navigate(), data-nav, data-go, href,
   AND object properties (`nav:`, `path:`) — the last of which is how a dead
   CTA sat on the home screen unnoticed.                                     */
const router = read("js/router.js");
const routes = new Set([...router.matchAll(/^\s+"(\/[^"]*)":\s*\{/gm)].map((m) => m[1]));
const aliases = new Set([...router.matchAll(/"(\/[^"]+)":\s*"\/[^"]+"/g)].map((m) => m[1]));
const PREFIX_ROUTES = ["/shared/", "/ops/trip/", "/legal/"];
const NAV_PATTERNS = [
  /navigate\(\s*"(\/[^"]*)"/g, /data-nav="(\/[^"]*)"/g, /data-go="(\/[^"]*)"/g,
  /href="#(\/[^"]*)"/g, /\bnav:\s*"(\/[^"]*)"/g, /\bpath:\s*"(\/[^"]*)"/g,
  /location\.hash\s*=\s*"(\/[^"]*)"/g,
];
// Defined as an expression rather than a literal key; see router.js.
const EXPRESSION_ROUTES = new Set(["/home"]);
for (const f of JS_FILES) {
  const src = read(f);
  for (const pat of NAV_PATTERNS) {
    for (const m of src.matchAll(pat)) {
      const t = m[1];
      if (routes.has(t) || aliases.has(t) || EXPRESSION_ROUTES.has(t)) continue;
      if (PREFIX_ROUTES.some((p) => t.startsWith(p))) continue;
      fail("dead-nav-target", `${f} -> ${t}`);
    }
  }
}

/* ----------------------------------------------------------------- 2b --- */
/* A route drawn WITH the nav bar whose tab matches no nav entry in any app.
   The bar renders, renderNavActive() finds no `[data-tab]` to light up, and
   the screen reads as though you have stepped outside the app. It is silent:
   nothing errors, nothing 404s, the highlight is just never there. Screens
   entered from a tab rather than from the bar declare a `navTab` parent, and
   that is what has to resolve.                                              */
{
  const navEntries = new Set(
    [...read("js/appMode.js").matchAll(/\{\s*tab:\s*"([^"]+)"/g)].map((m) => m[1]),
  );
  const navRoutes = router.matchAll(
    /"(\/[^"]*)":\s*\{[^}]*?nav:\s*true[^}]*?tab:\s*"([^"]+)"(?:,\s*navTab:\s*"([^"]+)")?/g,
  );
  for (const [, path, tab, navTab] of navRoutes) {
    const highlights = navTab || tab;
    if (!navEntries.has(highlights)) {
      fail("orphan-nav-tab", `${path} highlights "${highlights}", which no app's nav defines`);
    }
  }
}

/* ----------------------------------------------------------------- 2c --- */
/* An upload purpose the API does not have. presignUpload's first argument is
   validated server-side with @IsEnum, so a value outside the enum is a 400 on
   every device, for every file, forever — and the screen that had one
   ("driver-licence") showed only "Failed — tap to retry", which is
   indistinguishable from a network problem.

   Kept in sync by hand with UploadPurpose in the backend's
   presign-upload.dto.ts. That is a real cost, but the alternative is a
   silent, permanent, device-independent failure that looks exactly like a
   flaky connection.                                                        */
{
  const PURPOSES = new Set([
    "kyc-doc", "proof-of-delivery", "profile-photo",
    "restaurant-logo", "restaurant-banner", "menu-item", "pickup-note",
  ]);
  for (const f of JS_FILES) {
    for (const m of read(f).matchAll(/presignUpload\(\s*["'`]([^"'`]+)["'`]/g)) {
      if (!PURPOSES.has(m[1])) {
        fail("bad-upload-purpose", `${f} presigns with "${m[1]}", which the API will reject`);
      }
    }
  }
}

/* ------------------------------------------------------------------ 3 --- */
/* A route registered in the router but missing from every app's allowlist is
   unreachable: routeAllowed() rejects it and the router bounces to home. The
   screen works perfectly and nothing can get to it.                         */
const appMode = read("js/appMode.js");
const allowlisted = new Set([...appMode.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]));
for (const r of routes) {
  if (r.startsWith("/legal/")) continue;
  if (!allowlisted.has(r)) fail("unreachable-route", `${r} is in the router but no app allows it`);
}

/* ------------------------------------------------------------------ 4 --- */
/* Elements that LOOK clickable with nothing bound to them. Anchors with an
   href and multi-selector wiring are excluded — both were false positives
   the first time this ran.                                                  */
for (const f of JS_FILES.filter((p) => p.includes("/views/"))) {
  const src = read(f);
  for (const m of src.matchAll(/<(\w+)([^>]*)id="([A-Za-z0-9_-]+)"([^>]*)>/g)) {
    const [, tag, pre, id, post] = m;
    const attrs = pre + post;
    if (tag === "a" && /href=/.test(attrs)) continue;          // navigates by itself
    if (/data-(nav|go|tab-go|again|help|timeline|place|tip|check|amount)/.test(attrs)) continue;
    const clickable = tag === "button" || tag === "a" || /cursor:\s*pointer/.test(attrs);
    if (!clickable) continue;
    // Wired counts as: a #selector anywhere, getElementById, or the id passed
    // as a bare string to a helper — restaurantOnboarding wires its upload
    // buttons with wire("logoBtn", ...), which no selector search would find.
    const rest = src.replace(new RegExp(`id="${id}"`, "g"), "");
    const wired =
      new RegExp(`#${id}\\b`).test(rest) ||
      new RegExp(`getElementById\\(["']${id}["']`).test(rest) ||
      new RegExp(`["']${id}["']`).test(rest);
    if (!wired) fail("dead-cta", `${f} #${id} <${tag}> has no handler`);
  }
}

/* ------------------------------------------------------------------ 5 --- */
/* Every frontend API call must hit a real backend route. This is what caught
   the heartbeat endpoint shipping with no caller.                           */
const BACKEND = path.join(ROOT, "..", "novax-backend", "src");
if (fs.existsSync(BACKEND)) {
  const controllers = [];
  (function findControllers(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) findControllers(p);
      else if (e.name.endsWith(".controller.ts")) controllers.push(p);
    }
  })(BACKEND);

  const backendRoutes = new Set();
  for (const c of controllers) {
    const src = fs.readFileSync(c, "utf8");
    const base = (src.match(/@Controller\(\s*"([^"]*)"\s*\)/)?.[1] || "")
      .replace("api/v1", "").replace(/^\/|\/$/g, "");
    for (const m of src.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*(?:"([^"]*)")?\s*\)/g)) {
      const sub = (m[2] || "").replace(/^\/|\/$/g, "");
      const full = "/" + [base, sub].filter(Boolean).join("/");
      backendRoutes.add(full.replace(/:[A-Za-z_]+/g, ":p").replace(/\/$/, "") || "/");
    }
  }

  const apiSrc = read("js/api.js");
  for (const m of apiSrc.matchAll(/request\(\s*[`"]([^`"]+)[`"]/g)) {
    let p = m[1]
      .replace(/\$\{[^}]*\?[^}]*$/, "")      // trailing query-builder ternary
      .replace(/\$\{[^}]*\?[^}]*\}/g, "")    // inline ternary
      .replace(/\$\{[^}]+\}/g, ":p")         // path param
      .split("?")[0].replace(/\/$/, "") || "/";
    if (!backendRoutes.has(p)) fail("missing-endpoint", `api.js calls ${p} — no backend route`);
  }
} else {
  console.log("  (backend not found alongside — skipping endpoint cross-check)");
}

/* ------------------------------------------------------------------ 6 --- */
/* state.js uses explicit getter/setter pairs. Assigning an undeclared key
   creates a plain property that works in memory and is NEVER persisted, so it
   survives navigation and vanishes on reload — fine in testing, gone for a
   real user. The file's own header warns about this.                        */
const stateSrc = read("js/state.js");
const declared = new Set([...stateSrc.matchAll(/^\s+(?:get|set)\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]));
const methods = new Set([...stateSrc.matchAll(/^\s+([A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]));
for (const f of JS_FILES) {
  // Import lines are removed first — `from "../state.js"` otherwise reads as
  // a use of `state.js`, which was this check's only false positive.
  const noImports = stripped(read(f)).replace(/^\s*import[\s\S]*?from\s*["'][^"']+["'];?/gm, "");
  for (const m of noImports.matchAll(/\bstate\.([A-Za-z0-9_]+)/g)) {
    const k = m[1];
    if (k === "js") continue;
    if (!declared.has(k) && !methods.has(k)) fail("undeclared-state", `${f} uses state.${k}`);
  }
}

/* ------------------------------------------------------------------ 7 --- */
/* CSS classes referenced from JS that no stylesheet defines — an unstyled
   element that looks broken only on the screen nobody opened yet.           */
const cssAll = fs.readdirSync(path.join(ROOT, "css"))
  .filter((f) => f.endsWith(".css")).map((f) => read(`css/${f}`)).join("\n");
const definedClasses = new Set([...cssAll.matchAll(/\.((?:nx|badge)-[a-z0-9-]+)/g)].map((m) => m[1]));
for (const f of JS_FILES) {
  for (const m of read(f).matchAll(/class="([^"$]*)"/g)) {
    for (const cls of m[1].split(/\s+/)) {
      if (!/^(?:nx|badge)-/.test(cls)) continue;
      if (!definedClasses.has(cls)) fail("undefined-css-class", `${f} uses .${cls}`);
    }
  }
}

/* ------------------------------------------------------------------ 8 --- */
/* Nothing internal may ship in a customer- or driver-facing build.          */
const SHIPPED_FORBIDDEN = [
  [/923000000000|0300 0000000|yourdomain\.pk/, "placeholder contact details"],
  [/console\.log\(/, "console.log left in"],
];
for (const f of JS_FILES.filter((p) => p.includes("/views/") && !/ops/i.test(p))) {
  const body = stripped(read(f));
  for (const [pat, label] of SHIPPED_FORBIDDEN) {
    if (pat.test(body)) fail("ships-internal", `${f} contains ${label}`);
  }
}

/* ---------------------------------------------------------------- out --- */
const byCheck = findings.reduce((a, f) => ((a[f.check] ??= []).push(f.detail), a), {});
const CHECKS = [
  "undefined-symbol", "dead-nav-target", "orphan-nav-tab", "bad-upload-purpose", "unreachable-route", "dead-cta",
  "missing-endpoint", "undeclared-state", "undefined-css-class", "ships-internal",
];
console.log("\n  Nova Go audit\n");
for (const c of CHECKS) {
  const hits = byCheck[c] || [];
  console.log(`  ${hits.length ? "✗" : "✓"} ${c}${hits.length ? ` (${hits.length})` : ""}`);
  for (const d of hits) console.log(`      ${d}`);
}
console.log(
  findings.length === 0
    ? `\n  ${JS_FILES.length} modules clean.\n`
    : `\n  ${findings.length} finding(s).\n`,
);
process.exit(findings.length && !warnOnly ? 1 : 0);
