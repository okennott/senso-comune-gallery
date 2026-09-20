/**
 * The softness plate for the report: fig/cap-soft.png.
 *
 *   node docs/report/soft_shots.mjs <origin>      (called by shots.sh)
 *
 * The site has no photography yet, and a mat, a mount shadow or a glass bar
 * shown around a near-white placeholder shows nothing. So the works are drawn
 * with a SYNTHETIC stand-in canvas — dark ground, ochre and blue passages, one
 * near-white highlight, which is also the worst case the glass bar is measured
 * against. The report captions it as a stand-in. Nothing here ships.
 *
 * Three states a plain screenshot cannot reach are forced:
 *   hover  — the hover rules copied onto the first nav item, the hero and its button
 *   glass  — the bar pinned at its scrolled end state with the painting beneath
 *   band   — the page at a section boundary
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const run = promisify(execFile);
/* The pixels are Pillow's, not sharp's. sharp is the site's only runtime
   dependency and is built per platform; a report build should not fail
   because an image library was installed for another operating system, and
   figures.py already needs Pillow. See soft_plate.py. */
const pixels = (...args) => run('python3', [join(HERE, 'soft_plate.py'), ...args]);
const [origin] = process.argv.slice(2);
const CHROME = process.env.CHROME || 'google-chrome';
const DIST = join(ROOT, 'dist');
const STAGE = join(DIST, '_report');
const TMP = join(HERE, 'fig', '.soft');
mkdirSync(STAGE, { recursive: true });
mkdirSync(TMP, { recursive: true });

/* ---- the stand-in canvas: deterministic, so the plate does not churn ---- */
{
  const W = 800, H = 1000, px = Buffer.alloc(W * H * 3);
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = (y * W + x) * 3;
    let r = 40 + 60 * v, g = 48 + 40 * v, b = 70 - 20 * v;
    const blob = (cx, cy, rad, k0, [dr, dg, db], p = 1) => {
      const d = Math.hypot(u - cx, v - cy); if (d >= rad) return;
      const k = Math.pow(1 - d / rad, p) * k0; r += dr * k; g += dg * k; b += db * k;
    };
    blob(.35, .30, .28, 1, [190, 150, 60]);
    blob(.70, .62, .22, 1, [20, 60, 140]);
    blob(.30, .08, .16, 1, [255, 255, 255], .6);
    const n = (rnd() - .5) * 26;
    px[i] = Math.max(0, Math.min(255, r + n)); px[i + 1] = Math.max(0, Math.min(255, g + n)); px[i + 2] = Math.max(0, Math.min(255, b + n));
  }
  const raw = join(TMP, 'stand-in.raw');
  writeFileSync(raw, px);
  await pixels('canvas', raw, String(W), String(H), join(STAGE, 'stand-in.webp'));
}

const stage = (name, extra) => {
  let h = readFileSync(join(DIST, 'index.html'), 'utf8');
  h = h.replace(/<source[^>]*>/g, '')
       .replace(/(<img[^>]*?)\ssrcset="[^"]*"/g, '$1')
       // relative, not root-absolute: the staged page and the stand-in sit in the
       // same directory, so this resolves under a file:// origin as well as http
       .replace(/(<img[^>]*?\bclass="work__img"[^>]*?)\ssrc="[^"]*"/g, '$1 src="stand-in.webp"')
       .replace(/loading="lazy"/g, 'loading="eager"')
       .replace('</head>', `${extra}</head>`);
  writeFileSync(join(STAGE, `${name}.html`), h);
};
/* Bring an element to a fixed viewport height by MEASURING it, rather than by a
   guessed negative margin that silently frames the wrong thing when the layout
   above it changes. */
const bring = (selector, y) => `<script>addEventListener('load',()=>{
  const main=document.querySelector('main'), el=document.querySelector(${JSON.stringify(selector)});
  const now=el.getBoundingClientRect().top, cur=parseFloat(getComputedStyle(main).marginTop)||0;
  main.style.setProperty('margin-top',(cur+${y}-now)+'px','important');
})</script>`;

const shoot = async (name, w, h) => {
  const file = join(TMP, `${name}.png`);
  await run(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=2',
    `--window-size=${w},${h}`, '--virtual-time-budget=5000', `--user-data-dir=/tmp/soft-shots-${name}`,
    `--screenshot=${file}`, `${origin}/_report/${name}.html`]);
  return file;
};

stage('hover', `<style>
  .nav a:first-child{color:#fff} .nav a:first-child::after{transform:scaleX(1)}
  .hero__work img{box-shadow:var(--shadow-lift)}
  .hero__work .btn{background:var(--sanguine);border-color:var(--sanguine);transform:translateY(-1px);box-shadow:var(--shadow-lift)}
</style>`);
/* the painting's near-white highlight (8% down the canvas) under the bar */
/* shot at full height and cropped: a short window trips the hero's 48vh cap and reflows mid-capture */
stage('glass', `<style>
  .masthead{position:fixed!important;top:0;left:0;right:0;animation:none!important;
    background-color:color-mix(in srgb,var(--bar) var(--glass-bar-opacity),transparent)!important}
</style>${bring('.hero__work img', -12)}`);
/* a boundary BETWEEN two sections — Works above, Tribute below — centred */
stage('band', `<style>.masthead{display:none!important}</style>${bring('.edge--pale-mid', 260 - 72)}`);

const [hover, glass, band] = await Promise.all([shoot('hover', 1440, 900), shoot('glass', 1440, 900), shoot('band', 1440, 520)]);

/* ---- compose: hover on the left, glass and a boundary stacked on the right ---- */
const plate = join(HERE, 'fig', 'cap-soft.png');
await pixels('plate', hover, glass, band, plate);
await pixels('page', plate, plate);        // 300 dpi, lossless, like the captures

rmSync(STAGE, { recursive: true, force: true });
rmSync(TMP, { recursive: true, force: true });
console.log('  fig/cap-soft.png  hover · glass · boundary  (synthetic stand-in canvas)');
