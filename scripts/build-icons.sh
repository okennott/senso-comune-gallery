#!/usr/bin/env bash
# Build the site's icon set from the mark.
#
#   ./scripts/build-icons.sh        (or: npm run icons)
#
# Closes finding C-01. The site shipped with no favicon, no home-screen icon
# and no theme colour, so the browser tab, the iOS home screen and the mobile
# browser chrome were all defaults — on a business whose entire acquisition
# motion is a link in an Instagram or WeChat bio, i.e. on its most frequently
# rendered surfaces.
#
# The geometry lives in scripts/mark.mjs and is documented there. The mark is
# the SC monogram from Priscilla's prototype sheet, drawn in Fraunces outlines
# cut from the font by scripts/build-mark-paths.py — an SVG favicon renders
# without the page's webfonts, so <text> would fall back to whatever serif the
# OS has. The reversed variation is used throughout: cream letters on the bar,
# which is the most legible pair on the site and the one iOS can crop.
#
# No hatching at icon sizes. The sheet's own minimum is 15mm in print; at 16px
# the hatch fills in and the mark becomes a smudge.
#
# icon.svg is written by Node alone, so the one artefact the build and the
# checks depend on never needs an image library. The two rasters are cut by
# sharp where it is installed, and by cairosvg + Pillow where it is not — the
# same SVG either way, so the two paths cannot disagree about the drawing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> icon.svg"
node --input-type=module -e '
const { join } = await import("node:path");
const { writeFileSync } = await import("node:fs");
const { markSvg } = await import(join(process.argv[1], "scripts/mark.mjs"));
const svg = markSvg({ variant: "reversed", label: "Senso Comune Gallery" }) + "\n";
writeFileSync(join(process.argv[1], "public/icon.svg"), svg, "utf8");
console.log(`    public/icon.svg — ${Buffer.byteLength(svg).toLocaleString()} bytes, `
  + `cream letters on the bar at 11.45:1`);
' "$ROOT"

echo "==> apple-touch-icon.png + favicon.ico"
if node --input-type=module -e 'await import("sharp")' >/dev/null 2>&1; then
  node --input-type=module -e '
const sharp = (await import("sharp")).default;
const { join } = await import("node:path");
const { readFileSync, writeFileSync } = await import("node:fs");
const root = process.argv[1];
const buf = readFileSync(join(root, "public/icon.svg"));

// iOS crops to a rounded rect and never shows transparency, so the field is
// painted edge to edge rather than left to the OS.
const png = await sharp(buf, { density: 384 }).resize(180, 180).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(join(root, "public/apple-touch-icon.png"), png);
console.log(`    public/apple-touch-icon.png — ${png.length.toLocaleString()} bytes, 180x180 (sharp)`);

// A single 32x32 BMP-in-ICO: still what a few crawlers and older tabs ask for
// by path, and 4 KB is cheaper than the 404 they would otherwise log.
const N = 32;
const raw = await sharp(buf, { density: 384 }).resize(N, N).ensureAlpha().raw().toBuffer();
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
const out = Buffer.concat([ico, image]);
writeFileSync(join(root, "public/favicon.ico"), out);
console.log(`    public/favicon.ico — ${out.length.toLocaleString()} bytes, 32x32 (sharp)`);
' "$ROOT"
else
  echo "    sharp unavailable — cutting the rasters with cairosvg + Pillow"
  python3 - "$ROOT" <<'PY'
import io, sys
from pathlib import Path
import cairosvg
from PIL import Image

root = Path(sys.argv[1])
svg = (root / "public/icon.svg").read_bytes()

def raster(px):
    buf = cairosvg.svg2png(bytestring=svg, output_width=px, output_height=px)
    # iOS never shows transparency and the ICO mask is opaque: flatten onto
    # the mark's own field so nothing depends on how a viewer renders alpha.
    im = Image.open(io.BytesIO(buf)).convert("RGBA")
    flat = Image.new("RGBA", im.size, (0x3A, 0x2B, 0x22, 255))
    flat.alpha_composite(im)
    return flat.convert("RGB")

png = raster(180)
png.save(root / "public/apple-touch-icon.png", optimize=True)
print(f"    public/apple-touch-icon.png — {(root / 'public/apple-touch-icon.png').stat().st_size:,} bytes, 180x180 (cairosvg)")

raster(32).save(root / "public/favicon.ico", sizes=[(32, 32)])
print(f"    public/favicon.ico — {(root / 'public/favicon.ico').stat().st_size:,} bytes, 32x32 (cairosvg)")
PY
fi

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
