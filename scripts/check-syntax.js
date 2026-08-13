#!/usr/bin/env node
/* Parses every app ES module and fails on a syntax error.
   There is no bundler in this project, so nothing else ever parses these
   files before a browser does — which historically meant a typo shipped and
   was found by a user on a phone. */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const roots = ["js", "scripts"];
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); }
    else if (e.name.endsWith(".js")) files.push(p);
  }
})(roots[0]);

let bad = 0;
for (const f of files) {
  const tmp = path.join(require("os").tmpdir(), "nx-" + Math.random().toString(36).slice(2) + ".mjs");
  fs.copyFileSync(f, tmp);
  try {
    execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
  } catch (err) {
    bad++;
    console.error(`\n✗ ${f}\n${String(err.stderr || err).split("\n").slice(0, 6).join("\n")}`);
  } finally {
    fs.unlinkSync(tmp);
  }
}
console.log(bad === 0 ? `✓ ${files.length} modules parse` : `\n${bad} file(s) failed to parse`);
process.exit(bad === 0 ? 0 : 1);
