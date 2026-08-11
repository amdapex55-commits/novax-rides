#!/usr/bin/env bash
#
# Re-download the self-hosted Inter + Sora woff2 files and regenerate
# css/fonts.css.
#
# You only need this if the weights used by the app change (see --font and
# --font-display in css/tokens.css). The generated files are committed, so a
# normal checkout needs nothing.
#
# Only the latin and latin-ext subsets are kept. Google's default response also
# carries Cyrillic, Greek and Vietnamese ranges, which no screen in this app
# will ever render.

set -euo pipefail

cd "$(dirname "$0")/.."

FAMILIES="family=Inter:wght@400;500;600;700;800&family=Sora:wght@600;700;800"
# A modern desktop UA is required — Google serves legacy .ttf to unrecognised
# clients, which is roughly twice the size for the same glyphs.
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

TMP_CSS="$(mktemp)"
trap 'rm -f "$TMP_CSS"' EXIT

echo "Fetching font CSS from Google…"
curl -sfL -A "$UA" "https://fonts.googleapis.com/css2?${FAMILIES}&display=swap" -o "$TMP_CSS"

mkdir -p fonts

python3 - "$TMP_CSS" <<'PY'
import os, re, subprocess, sys

css = open(sys.argv[1], encoding="utf-8").read()
KEEP = {"latin", "latin-ext"}

blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{.*?\})", css, re.S)

kept, downloaded = [], {}
for subset, block in blocks:
    if subset not in KEEP:
        continue
    url = re.search(r"url\((https://[^)]+)\)", block).group(1)
    family = re.search(r"font-family:\s*'([^']+)'", block).group(1)
    weight = re.search(r"font-weight:\s*([^;]+);", block).group(1).strip()

    if url not in downloaded:
        # Inter and Sora ship as variable fonts, so one file covers every
        # weight in a subset — hence "var" rather than a weight in the name.
        fname = f"{family.lower()}-var-{subset}.woff2"
        subprocess.run(["curl", "-sfL", url, "-o", os.path.join("fonts", fname)], check=True)
        downloaded[url] = fname

    # "../fonts/", not "fonts/": a url() in a stylesheet resolves against the
    # STYLESHEET's location (css/), not the document's. Getting this wrong
    # 404s every font while the <link rel=preload> in the HTML — which does
    # resolve against the document — still succeeds, so the page looks fine
    # in the network tab right up until no text is in the right typeface.
    block = re.sub(r"url\(https://[^)]+\)", f"url(../fonts/{downloaded[url]})", block)
    kept.append(f"/* {family} {weight} — {subset} */\n{block}")

header = """/* Self-hosted Inter + Sora. GENERATED — edit scripts/vendor-fonts.sh, not this.
 *
 * Previously loaded from fonts.googleapis.com, which cost a DNS lookup, a TLS
 * handshake and a round trip to a third party before a single glyph rendered —
 * on a Karachi 3G connection that is most of a second of blank text, and it
 * only works if Google is reachable at all.
 *
 * Only the latin and latin-ext subsets are shipped. Both families are variable
 * fonts, so every weight below points at the same file per subset.
 *
 * font-display: swap is preserved, so text paints immediately in the system
 * fallback and reflows once these arrive.
 */

"""

with open(os.path.join("css", "fonts.css"), "w", encoding="utf-8") as f:
    f.write(header + "\n\n".join(kept) + "\n")

total = sum(os.path.getsize(os.path.join("fonts", f)) for f in downloaded.values())
print(f"  {len(downloaded)} files, {total/1024:.1f} KB -> fonts/, css/fonts.css")
PY

echo "Done. If the file list changed, bump VERSION in sw.js and update SHELL."
