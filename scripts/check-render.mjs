/**
 * Rendering check: the paintings are shown as they are.
 *
 *   node scripts/check-render.mjs        (or: npm run check:render)
 *
 * The softness pass put every work in a passe-partout: padding, a shadow and
 * box-sizing:border-box, inside layouts that already cap heights and widths.
 * That is exactly the combination in which an image box can quietly stop
 * matching the painting's proportions — and a stretched painting on a site
 * that sells paintings is not a cosmetic defect. No static check can see it:
 * it only exists once a browser has done layout, at a particular width.
 *
 * So this lays the built pages out in headless Chrome at the widths the layout
 * is verified at and, for every work image, asserts:
 *
 *   - its content box has the painting's own ratio (width/height attributes),
 *     to within 1% — the mat surrounds the work, it never reshapes it;
 *   - object-fit is contain, the guard if some future box disagrees;
 *   - no border-radius: rounding a corner crops the object being sold;
 *   - no transform: a painting is never drawn scaled or skewed.
 *
 * The same pass covers the work videos, and the masthead: with search, cart
 * and account added it must still fit a phone — no horizontal overflow, at most
 * two rows below 720px, and every shop control at least 44px square — and the
 * homepage quote: the Dutch original and the translation both set as written,
 * the attribution flush with their right edge, and read before the featured
 * work.
 *
 * PHONE WIDTHS. Headless Chrome will not lay a window out narrower than 500px:
 * --window-size=390 reports innerWidth 500 and a screenshot merely crops it.
 * Every "390px" result taken that way was a 500px layout. So widths under 500
 * are measured inside an iframe of exactly that width — an iframe's width IS
 * its viewport, media queries included — and the probe reports up to the
 * harness page. The viewport it actually got — the CONTENT width, after any
 * scrollbar — is asserted, not assumed.
 *
 * Needs Chrome. It is not part of `npm run check`, which must run anywhere;
 * CI runs it after the build. Set CHROME=/path/to/chrome if it is not on PATH.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { BASE } from '../src/templates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const CHROME = process.env.CHROME
  || ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
       .find((c) => { try { execSync(`command -v ${c}`, { stdio: 'ignore' }); return true; } catch { return false; } });

if (!CHROME) {
  console.error('  no Chrome found. Install it, or set CHROME=/path/to/chrome.');
  process.exit(1);
}
if (!existsSync(DIST)) {
  console.error('  no dist/ — run: npm run build');
  process.exit(1);
}

const works = JSON.parse(readFileSync(join(ROOT, 'src/data/artworks.json'), 'utf8')).works;
const series = JSON.parse(readFileSync(join(ROOT, 'src/data/site.json'), 'utf8')).series.items;
const PAGES = ['/', '/zh/', '/works/', '/works/sold/', ...series.map((x) => `/works/series/${x.id}/`), ...works.map((w) => `/works/${w.slug}/`)];
const WIDTHS = [1440, 900, 390, 360, 320];
const HEADLESS_MIN = 500;

/* The probe runs inside the page, after layout, and writes its findings into
   the DOM, where --dump-dom can read them back. */
const PROBE = `<script>addEventListener('load',()=>setTimeout(()=>{
  const px=(v)=>parseFloat(v)||0;
  const out=[...document.querySelectorAll('.work__img, .hero__work img, dialog.lightbox img, .work__video')].map((i)=>{
    const cs=getComputedStyle(i);
    const cw=i.clientWidth-px(cs.paddingLeft)-px(cs.paddingRight);
    const ch=i.clientHeight-px(cs.paddingTop)-px(cs.paddingBottom);
    return { src:(i.currentSrc||i.src).split('/').pop(), rendered:i.clientWidth>0,
      box:cw/ch, want:i.getAttribute('width')/i.getAttribute('height'),
      fit:cs.objectFit, radius:cs.borderRadius, transform:cs.transform,
      lightbox:!!i.closest('dialog') };
  });
  const inner=document.querySelector('.masthead__inner');
  // Rows by vertical overlap, not by rounding each top edge into a band: a band
  // boundary can fall between two items on the same row, and anything above
  // the masthead that changes height (the preview ribbon wrapping differently
  // on another machine's fonts) moves where the boundaries fall.
  const boxes=[...inner.children].filter((c)=>c.offsetParent!==null&&getComputedStyle(c).display!=='none')
    .map((c)=>c.getBoundingClientRect()).filter((r)=>r.height>0).sort((x,y)=>x.top-y.top);
  let rowCount=0, rowBottom=-Infinity;
  for (const r of boxes) { if (r.top >= rowBottom - 1) { rowCount++; rowBottom = r.bottom; } else rowBottom = Math.max(rowBottom, r.bottom); }
  const tops={ length: rowCount };
  const mast={ overflow: inner.scrollWidth > inner.clientWidth + 1 || document.documentElement.scrollWidth > document.documentElement.clientWidth,
    rows: tops.length,
    small: [...document.querySelectorAll('.shopbar__link')].map((a)=>a.getBoundingClientRect()).filter((r)=>r.width<44||r.height<44).length };
  // The Dutch original and the translation are both set as written, and the
  // attribution sits flush with the real right edge of the widest of their
  // lines: no line the browser wrapped, no gap, and the quote before the
  // featured work in reading order at every width.
  const original=document.querySelector('.hero__original');
  const block=document.querySelector('.hero__quote');
  const motto=document.querySelector('.hero__motto'), cite=document.querySelector('.hero__cite');
  let quote=null;
  if (motto && cite) {
    const measure=(el)=>{
      const r=document.createRange(); r.selectNodeContents(el);
      const lines=[...r.getClientRects()];
      return { wrapped: new Set(lines.map((x)=>Math.round(x.top))).size !== el.querySelectorAll('br').length+1,
        right: Math.max(...lines.map((x)=>x.right)) };
    };
    const said=[original, motto].filter(Boolean).map(measure);
    const c=document.createRange(); c.selectNodeContents(cite);
    const feature=document.querySelector('.hero__feature');
    quote={ wrapped: said.some((s)=>s.wrapped),
      gap: Math.round(Math.max(...said.map((s)=>s.right)) - c.getBoundingClientRect().right),
      // The quote leads, the featured work follows — measured from the top of
      // the quote, which since the original was added is the Dutch line and
      // not the motto.
      first: !feature || block.getBoundingClientRect().top <= feature.getBoundingClientRect().top };
  }
  const payload=JSON.stringify({ viewport: document.documentElement.clientWidth, rows: out, mast, quote });
  if (window.parent !== window) { parent.document.getElementById('render-probe').textContent = payload; return; }
  const p=document.createElement('pre'); p.id='render-probe'; p.textContent=payload;
  document.body.append(p);
},250));</script>`;

/* The phone harness: one iframe at the exact width, nothing else. */
const harness = (url, width) => `<!doctype html><body style="margin:0">
<iframe src="${url}" style="border:0;width:${width}px;height:900px"></iframe>
<pre id="render-probe"></pre></body>`;

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.json': 'application/json' };

const server = createServer((req, res) => {
  const q = new URL(req.url, 'http://x');
  if (q.pathname === '/__harness') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(harness(q.searchParams.get('url'), Number(q.searchParams.get('w'))));
  }
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (BASE && url.startsWith(BASE)) url = url.slice(BASE.length) || '/';
  let file = join(DIST, url);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); return res.end(); }
  let body = readFileSync(file);
  if (file.endsWith('.html')) body = Buffer.from(body.toString('utf8').replace('</body>', `${PROBE}</body>`));
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(body);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

/* Chrome must be launched ASYNCHRONOUSLY. The pages are served from this same
   process; a synchronous child call blocks the event loop, the server can
   never answer Chrome's requests, and every page hangs until the timeout.
   Widths for one page run in parallel; pages run in sequence. */
const run = promisify(execFile);
const problems = [];
let measured = 0;
for (const page of PAGES) {
  const doms = await Promise.all(WIDTHS.map((width) =>
    // --hide-scrollbars: a phone's scrollbar overlays the page and takes no
    // width. Without it the iframe draws a desktop 15px bar, the page gets
    // 345px at "360", and the harness reports defects no phone can have.
    run(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      `--window-size=${Math.max(width, HEADLESS_MIN)},900`,
      '--virtual-time-budget=4000', `--user-data-dir=/tmp/check-render-${width}`, '--dump-dom',
      width < HEADLESS_MIN
        ? `${origin}/__harness?w=${width}&url=${encodeURIComponent(`${BASE}${page}`)}`
        : `${origin}${BASE}${page}`],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024 })
      .then((r) => r.stdout, (e) => e.stdout || '')));
  for (const [k, width] of WIDTHS.entries()) {
    const dom = doms[k];
    const m = dom.match(/<pre id="render-probe">([\s\S]*?)<\/pre>/);
    if (!m || !m[1].trim()) { problems.push(`${page} @${width}: the page never finished layout`); continue; }
    const { viewport, rows, mast, quote } = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    if (viewport !== width) { problems.push(`${page} @${width}: laid out at ${viewport}px, not ${width}px`); continue; }
    if (quote) {
      if (quote.wrapped) problems.push(`${page} @${width}px: a line of the quote was re-wrapped by the browser`);
      if (Math.abs(quote.gap) > 1) problems.push(`${page} @${width}px: the attribution is ${quote.gap}px off the quote's right edge`);
      if (!quote.first) problems.push(`${page} @${width}px: the featured work comes before the motto`);
    }
    if (mast.overflow) problems.push(`${page} @${width}px: the masthead overflows the viewport`);
    if (width < 720 && mast.rows > 2) problems.push(`${page} @${width}px: the masthead wraps to ${mast.rows} rows`);
    if (mast.small) problems.push(`${page} @${width}px: ${mast.small} shop control(s) under 44px`);
    for (const r of rows) {
      const at = `${page} @${width}px  ${r.src}`;
      // A closed lightbox is display:none and has no box to measure; its
      // radius and transform still must not be set on the image itself.
      if (r.rendered && !r.lightbox) {
        measured++;
        const drift = Math.abs(r.box / r.want - 1);
        if (!(drift <= 0.01)) problems.push(`${at}: drawn at ${r.box.toFixed(3)}, the painting is ${r.want.toFixed(3)} — distorted by ${(drift * 100).toFixed(1)}%`);
        if (r.fit !== 'contain') problems.push(`${at}: object-fit is ${r.fit}, not contain`);
      }
      if (!/^0px( 0px)*$/.test(r.radius)) problems.push(`${at}: border-radius ${r.radius} — a rounded corner crops the work`);
      if (r.transform !== 'none') problems.push(`${at}: transform ${r.transform} — the work is drawn altered`);
    }
  }
}
server.close();

console.log(`\n  RENDERING — ${measured} painting boxes laid out across ${PAGES.length} pages at ${WIDTHS.join(', ')}px\n`);
if (problems.length) {
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(`\n  ${problems.length} rendering problem${problems.length > 1 ? 's' : ''}. Build blocked.\n`);
  process.exit(1);
}
console.log('  ✓ every painting drawn in its own proportions');
console.log('  ✓ no painting rounded, transformed or cropped by fit\n');
