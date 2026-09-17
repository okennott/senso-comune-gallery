#!/usr/bin/env bash
# Build the site's icon set.
#
#   ./scripts/build-icons.sh        (or: npm run icons)
#
# Closes finding C-01. The site shipped with no favicon, no home-screen icon
# and no theme colour, so the browser tab, the iOS home screen and the mobile
# browser chrome were all defaults — on a business whose entire acquisition
# motion is a link in an Instagram or WeChat bio, i.e. on its most frequently
# rendered surfaces.
#
# The mark is the wordmark's initials in Fraunces on the dark bar: the one
# lockup that still reads at 16px. Outlines are taken from the real font rather
# than set as <text>, because an SVG favicon is rendered without the page's
# webfonts and would otherwise fall back to whatever serif the OS has.
#
# Fraunces is read from the report's committed static instance so this runs
# offline — same family, same display optical size as the masthead.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> icon.svg"
python3 - "$ROOT" <<'PY'
import pathlib, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

root = pathlib.Path(sys.argv[1])
src  = root / "docs/report/fonts/Fraunces-Display-SemiBold.ttf"

BAR, SAND = "#3A2B22", "#F3EBDD"
BOX  = 64          # viewBox, in px
CAP  = 30          # cap height the monogram is set to, in px
TRACK = -0.012     # slight negative tracking; the pair sets tight at this size

font = TTFont(src)
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
upm     = font["head"].unitsPerEm
cap_upm = font["OS/2"].sCapHeight
scale   = CAP / cap_upm            # scale so CAP is the cap height, not the em

parts, pen_x = [], 0.0
for ch in "SC":
    name = cmap[ord(ch)]
    pen = SVGPathPen(glyphs)
    glyphs[name].draw(pen)
    parts.append((pen.getCommands(), pen_x))
    pen_x += glyphs[name].width + TRACK * upm

width = (pen_x - TRACK * upm) * scale
x0    = (BOX - width) / 2
# y-flip: font units run up from the baseline, SVG runs down.
y0    = (BOX + CAP) / 2

paths = "\n    ".join(
    f'<path d="{d}" transform="translate({x0 + off * scale:.3f} {y0:.3f}) '
    f'scale({scale:.6f} {-scale:.6f})"/>'
    for d, off in parts
)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {BOX} {BOX}" role="img" aria-label="Senso Comune Gallery">
  <title>Senso Comune Gallery</title>
  <rect width="{BOX}" height="{BOX}" fill="{BAR}"/>
  <g fill="{SAND}">
    {paths}
  </g>
</svg>
'''
out = root / "public/icon.svg"
out.write_text(svg, encoding="utf-8")
print(f"    public/icon.svg — {out.stat().st_size:,} bytes, sand on the bar at 11.45:1")
PY

echo "==> apple-touch-icon.png + favicon.ico"
node - "$ROOT" <<'JS'
const sharp = require('sharp');
const { join } = require('node:path');
const { readFileSync, writeFileSync } = require('node:fs');

const root = process.argv[2];
const svg = readFileSync(join(root, 'public/icon.svg'));

(async () => {
  // iOS crops to a rounded rect and never shows transparency, so the bar is
  // painted edge to edge rather than left to the OS.
  const png = await sharp(svg, { density: 384 }).resize(180, 180).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(root, 'public/apple-touch-icon.png'), png);
  console.log(`    public/apple-touch-icon.png — ${png.length.toLocaleString()} bytes, 180x180`);

  // A single 32x32 BMP-in-ICO: still what a few crawlers and older tabs ask for
  // by path, and 4 KB is cheaper than the 404 they would otherwise log.
  const N = 32;
  const raw = await sharp(svg, { density: 384 }).resize(N, N).ensureAlpha().raw().toBuffer();
  const rowBytes = N * 4;
  const xor = Buffer.alloc(rowBytes * N);
  for (let y = 0; y < N; y++) {
    const src = (N - 1 - y) * rowBytes;             // ICO rows run bottom-up
    for (let x = 0; x < N; x++) {
      const s = src + x * 4, d = y * rowBytes + x * 4;
      xor[d] = raw[s + 2]; xor[d + 1] = raw[s + 1]; xor[d + 2] = raw[s]; xor[d + 3] = raw[s + 3];
    }
  }
  const and = Buffer.alloc((N / 8) * N);            // fully opaque mask
  const hdr = Buffer.alloc(40);
  hdr.writeUInt32LE(40, 0); hdr.writeInt32LE(N, 4); hdr.writeInt32LE(N * 2, 8);
  hdr.writeUInt16LE(1, 12); hdr.writeUInt16LE(32, 14);
  hdr.writeUInt32LE(xor.length + and.length, 20);
  const image = Buffer.concat([hdr, xor, and]);

  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
  ico[6] = N; ico[7] = N; ico[8] = 0; ico[9] = 0;
  ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(image.length, 14); ico.writeUInt32LE(22, 18);
  const buf = Buffer.concat([ico, image]);
  writeFileSync(join(root, 'public/favicon.ico'), buf);
  console.log(`    public/favicon.ico — ${buf.length.toLocaleString()} bytes, 32x32`);
})();
JS

echo "==> site.webmanifest"
cat > "$ROOT/public/site.webmanifest" <<'JSON'
{
  "name": "Senso Comune Gallery",
  "short_name": "Senso Comune",
  "icons": [
    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml" },
    { "src": "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png" }
  ],
  "theme_color": "#3A2B22",
  "background_color": "#969B7D",
  "display": "browser",
  "start_url": "/"
}
JSON
echo "    public/site.webmanifest"
