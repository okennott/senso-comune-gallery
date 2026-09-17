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
# The geometry lives in scripts/mark.mjs and is documented there. The first
# version of this script cut an "SC" monogram out of Fraunces; it was replaced
# because the wordmark translates and "SC" means nothing beside 常识画廊.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> icon.svg + apple-touch-icon.png + favicon.ico"
node --input-type=module -e '
const sharp = (await import("sharp")).default;
const { join } = await import("node:path");
const { writeFileSync } = await import("node:fs");
const { markSvg, MARK } = await import(join(process.argv[1], "scripts/mark.mjs"));

const root = process.argv[1];
const svg  = markSvg({ wall: "fill", label: "Senso Comune Gallery" }) + "\n";
writeFileSync(join(root, "public/icon.svg"), svg, "utf8");
console.log(`    public/icon.svg — ${Buffer.byteLength(svg).toLocaleString()} bytes, `
  + `cream on the bar at 11.45:1, sage datum at 4.70:1`);

const buf = Buffer.from(svg);

// iOS crops to a rounded rect and never shows transparency, so the wall is
// painted edge to edge rather than left to the OS.
const png = await sharp(buf, { density: 384 }).resize(180, 180).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(join(root, "public/apple-touch-icon.png"), png);
console.log(`    public/apple-touch-icon.png — ${png.length.toLocaleString()} bytes, 180x180`);

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
console.log(`    public/favicon.ico — ${out.length.toLocaleString()} bytes, 32x32`);
' "$ROOT"

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
