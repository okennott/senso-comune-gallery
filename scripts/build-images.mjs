/**
 * Image pipeline. Build-time only — no image CDN, nothing metered in the
 * request path, $0/month forever.
 *
 *   node scripts/build-images.mjs
 *
 * Reads full-resolution masters from  masters/{slug}.{jpg,png,tif,webp}
 * Writes web derivatives to          public/img/{slug}-{width}.{avif,webp}
 *
 * If a master is missing, a clearly-marked placeholder is generated at the
 * work's true aspect ratio, so layout and CLS can be checked before the
 * photographs exist. Placeholders are reported at the end.
 *
 * THREE DECISIONS THAT MATTER, from the build report:
 *
 * 1. sRGB, tagged. The failure mode is asymmetric: every browser assumes an
 *    untagged image is sRGB, so a tagged sRGB file that loses its profile
 *    still renders correctly, while a Display P3 file that loses its profile
 *    renders as heavily oversaturated sRGB. sRGB fails safe; P3 fails loud.
 *    And sharp strips all metadata by default, so the profile is forced back
 *    on explicitly.
 *
 * 2. AVIF at 4:4:4, never subsampled. The AVIF spec leaves chroma upsampling
 *    decoder-dependent, so 4:2:0 can render with visible colour-edge
 *    distortion depending on the viewer's decoder — which lands exactly on
 *    glazes, craquelure and low-contrast gradients. With six images, file
 *    size is not the constraint; quality is.
 *
 * 3. 2000px cap. This is the only image protection that actually works. It
 *    covers a 1000–1200 CSS-px hero at 2x, while the best true-300-DPI print
 *    a thief can pull is 6.7 inches. Right-click blocking and watermarks cost
 *    real accessibility and buyer trust and stop nobody.
 */

import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTERS = join(ROOT, 'masters');
const OUT = join(ROOT, 'public/img');

const WIDTHS = [640, 960, 1280, 1600, 2000];
const MAX_EDGE = 2000;
const EXTS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.avif'];

const works = JSON.parse(readFileSync(join(ROOT, 'src/data/artworks.json'), 'utf8')).works;

mkdirSync(OUT, { recursive: true });

const findMaster = (slug) => {
  if (!existsSync(MASTERS)) return null;
  const files = readdirSync(MASTERS);
  for (const ext of EXTS) {
    const hit = files.find((f) => f.toLowerCase() === (slug + ext).toLowerCase());
    if (hit) return join(MASTERS, hit);
  }
  return null;
};

/** A placeholder that is obviously a placeholder, at the real aspect ratio. */
async function placeholder(w, width) {
  const height = Math.round((w.heightCm / w.widthCm) * width);
  const label = `${w.slug}  ·  ${w.heightCm} × ${w.widthCm} cm`;
  const fs = Math.max(11, Math.round(width / 46));
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#FAF7F2"/>
      <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}"
            fill="none" stroke="#E0DED9"/>
      <g font-family="monospace" font-size="${fs}" fill="#9684A2" text-anchor="middle">
        <text x="50%" y="50%">${label}</text>
        <text x="50%" y="${height / 2 + fs * 1.8}">no master — placeholder</text>
      </g>
    </svg>`
  );
  return sharp(svg).png().toBuffer();
}

let built = 0;
const missing = [];

for (const w of works) {
  const master = findMaster(w.image);
  if (!master) missing.push(w.image);

  for (const width of WIDTHS) {
    if (width > MAX_EDGE) continue;

    const input = master
      ? sharp(master).rotate()          // honour EXIF orientation before stripping it
      : sharp(await placeholder(w, width));

    const base = input
      .resize({ width, withoutEnlargement: true })
      .toColourspace('srgb')
      .withIccProfile('srgb');          // transforms AND attaches; survives the default strip

    await base.clone()
      .avif({ quality: 68, chromaSubsampling: '4:4:4', effort: 6 })
      .toFile(join(OUT, `${w.image}-${width}.avif`));

    await base.clone()
      .webp({ quality: 82, effort: 6 })
      .toFile(join(OUT, `${w.image}-${width}.webp`));

    built += 2;
  }

  // Detail crops, if any are declared.
  for (const d of w.details ?? []) {
    const dm = findMaster(d.image);
    if (!dm) { missing.push(d.image); continue; }
    for (const width of [640, 960]) {
      const b = sharp(dm).rotate().resize({ width, withoutEnlargement: true })
        .toColourspace('srgb').withIccProfile('srgb');
      await b.clone().avif({ quality: 68, chromaSubsampling: '4:4:4', effort: 6 })
        .toFile(join(OUT, `${d.image}-${width}.avif`));
      await b.clone().webp({ quality: 82, effort: 6 })
        .toFile(join(OUT, `${d.image}-${width}.webp`));
      built += 2;
    }
  }
}

console.log(`\n  ${built} image files → public/img/`);
if (missing.length) {
  console.log(`\n  ${missing.length} master${missing.length > 1 ? 's' : ''} missing — placeholders generated:`);
  for (const m of missing) console.log(`    · masters/${m}.jpg`);
  console.log(`\n  Drop the full-resolution photographs into masters/ and re-run.`);
  console.log(`  That folder is gitignored: masters never go in the repo.\n`);
} else {
  console.log('  all masters present.\n');
}
