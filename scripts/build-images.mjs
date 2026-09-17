/**
 * Image pipeline. Build-time only — no image CDN, nothing metered in the
 * request path, $0/month forever.
 *
 *   node scripts/build-images.mjs
 *
 * Reads full-resolution masters from  masters/{slug}.{jpg,png,tif,webp}
 *                                    masters/{slug}-{detail|edge|back}.{jpg,…}
 *                                    masters/{slug}-video.{mp4,mov,webm}
 * Writes web derivatives to          public/img/{slug}[-{kind}]-{width}.{avif,webp}
 *                                    public/video/{slug}.mp4
 *                                    public/img/views.json  (true pixel sizes)
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
 *    glazes, craquelure and low-contrast gradients. At this catalogue size
 *    file size is not the constraint; quality is. THRESHOLD: past roughly
 *    fifty works, revisit — the whole-site payload starts to matter more
 *    than the last increment of chroma fidelity.
 *
 * 3. 2000px cap. This is the only image protection that actually works. It
 *    covers a 1000–1200 CSS-px hero at 2x, while the best true-300-DPI print
 *    a thief can pull is 6.7 inches. Right-click blocking and watermarks cost
 *    real accessibility and buyer trust and stop nobody.
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTERS = join(ROOT, 'masters');
const OUT = join(ROOT, 'public/img');

const WIDTHS = [640, 960, 1280, 1600, 2000];
/* Thumbnails for the gallery rail: 64-80 CSS px, at 1x and 2x+. */
const THUMBS = [160, 320];
const VIDEO_OUT = join(ROOT, 'public/video');
const MAX_EDGE = 2000;
/* AVIF effort 6 is for photographs of paintings, where the time is worth it.
   A placeholder is a flat card with a label: effort 1 is indistinguishable and
   keeps a placeholder-only build, as in CI, to a fraction of the time. */
const effort = (isReal) => (isReal ? 6 : 1);
const EXTS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.avif'];

const works = JSON.parse(readFileSync(join(ROOT, 'src/data/artworks.json'), 'utf8')).works;

mkdirSync(OUT, { recursive: true });

const findMaster = (slug, exts = EXTS) => {
  if (!existsSync(MASTERS)) return null;
  const files = readdirSync(MASTERS);
  for (const ext of exts) {
    const hit = files.find((f) => f.toLowerCase() === (slug + ext).toLowerCase());
    if (hit) return join(MASTERS, hit);
  }
  return null;
};

/** A placeholder that is obviously a placeholder, at the real aspect ratio. */
/* Placeholder proportions for the extra views, until a photograph exists.
   A real master always wins and keeps its own proportions: the build reads
   the true size from views.json, so nothing downstream assumes these. */
const VIEW_RATIO = {           // height / width
  detail: () => 1,             // a square crop of the surface
  edge:   () => 4 / 3,         // the side of the stretcher, shot at 45°
  back:   (w) => w.heightCm / w.widthCm,
  video:  () => 5 / 4,         // a phone held upright
};

async function placeholder(w, width, kind = '') {
  const ratio = kind ? VIEW_RATIO[kind](w) : w.heightCm / w.widthCm;
  const height = Math.round(ratio * width);
  const label = kind ? `${w.slug}  ·  ${kind}` : `${w.slug}  ·  ${w.heightCm} × ${w.widthCm} cm`;
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
const notes = [];
const manifest = {};

/* ffmpeg is needed only to turn a real video master into a web file and a
   poster. Without it — CI has none — placeholders are used and the build says so. */
const FFMPEG = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

/** The first frame of a video master, as a still the image pipeline can size. */
async function posterFrom(video, key) {
  const out = join(ROOT, 'public/img', `.${key}-poster.png`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.5', '-i', video, '-frames:v', '1', out]);
  return out;
}

for (const w of works) {
  const master = findMaster(w.image);
  if (!master) missing.push(`${w.image}.jpg`);

  for (const width of [...THUMBS, ...WIDTHS]) {
    if (width > MAX_EDGE) continue;

    const input = master
      ? sharp(master).rotate()          // honour EXIF orientation before stripping it
      : sharp(await placeholder(w, width));

    const base = input
      .resize({ width, withoutEnlargement: true })
      .toColourspace('srgb')
      .withIccProfile('srgb');          // transforms AND attaches; survives the default strip

    await base.clone()
      .avif({ quality: 68, chromaSubsampling: '4:4:4', effort: effort(master) })
      .toFile(join(OUT, `${w.image}-${width}.avif`));

    await base.clone()
      .webp({ quality: 82, effort: effort(master) })
      .toFile(join(OUT, `${w.image}-${width}.webp`));

    built += 2;
  }

  manifest[w.image] = {
    width: 2000, height: Math.round((w.heightCm / w.widthCm) * 2000), placeholder: !master,
  };
  if (master) {
    const m = await sharp(master).rotate().metadata();
    const scale = Math.min(1, MAX_EDGE / m.width);
    manifest[w.image] = { width: Math.round(m.width * scale), height: Math.round(m.height * scale), placeholder: false };
  }

  // The extra views: detail, edge, back — and the video's poster.
  for (const v of w.views ?? []) {
    const key = `${w.image}-${v.kind}`;
    let still = null, videoMaster = null;
    if (v.kind === 'video') {
      videoMaster = findMaster(key, ['.mp4', '.mov', '.webm', '.m4v']);
      if (videoMaster && FFMPEG) still = await posterFrom(videoMaster, key);
      if (videoMaster && !FFMPEG) notes.push(`${key}: master found, but ffmpeg is not installed — placeholder kept`);
    } else {
      still = findMaster(key);
    }
    if (!still) missing.push(`${key}.${v.kind === 'video' ? 'mp4' : 'jpg'}`);

    for (const width of [...THUMBS, ...WIDTHS]) {
      const input = still ? sharp(still).rotate() : sharp(await placeholder(w, width, v.kind));
      const base = input.resize({ width, withoutEnlargement: true })
        .toColourspace('srgb').withIccProfile('srgb');
      await base.clone().avif({ quality: 68, chromaSubsampling: '4:4:4', effort: effort(still) })
        .toFile(join(OUT, `${key}-${width}.avif`));
      await base.clone().webp({ quality: 82, effort: effort(still) })
        .toFile(join(OUT, `${key}-${width}.webp`));
      built += 2;
    }
    let size = { width: 2000, height: Math.round(VIEW_RATIO[v.kind](w) * 2000) };
    if (still) {
      const m = await sharp(still).rotate().metadata();
      const scale = Math.min(1, MAX_EDGE / m.width);
      size = { width: Math.round(m.width * scale), height: Math.round(m.height * scale) };
    }
    manifest[key] = { ...size, placeholder: !still };

    if (v.kind === 'video') {
      if (videoMaster && FFMPEG) {
        mkdirSync(VIDEO_OUT, { recursive: true });
        // H.264 for every browser, including WeChat's; 1080px long edge; no
        // audio track, since a studio clip's sound is room noise; faststart so
        // the first frame arrives before the whole file.
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', videoMaster,
          '-vf', "scale='if(gt(iw,ih),min(1080,iw),-2)':'if(gt(iw,ih),-2,min(1080,ih))'",
          '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart', '-an', join(VIDEO_OUT, `${w.image}.mp4`)]);
        manifest[key].video = `/video/${w.image}.mp4`;
      } else {
        manifest[key].video = '/placeholders/work-video.mp4';
      }
    }
  }
}

writeFileSync(join(OUT, 'views.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`\n  ${built} image files → public/img/`);
if (missing.length) {
  console.log(`\n  ${missing.length} master${missing.length > 1 ? 's' : ''} missing — placeholders generated:`);
  for (const m of missing) console.log(`    · masters/${m}`);
  console.log(`\n  Drop the full-resolution photographs into masters/ and re-run.`);
  console.log(`  That folder is gitignored: masters never go in the repo.\n`);
} else {
  console.log('  all masters present.\n');
}
for (const n of notes) console.log(`  note: ${n}`);
