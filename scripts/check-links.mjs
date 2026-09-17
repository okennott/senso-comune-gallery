/**
 * Structural and accessibility invariants over the built site.
 *
 *   node scripts/check-links.mjs
 *
 * Catches the class of defect that is cheap to introduce and expensive to
 * notice: a link to a page that was never generated, an image with no alt
 * text, a missing lang attribute, a second <h1>, an over-landmarked page.
 *
 * It does NOT replace a keyboard pass or a screen-reader pass — automated
 * testing decides roughly 13-30% of WCAG success criteria and catches almost
 * none of the focus-order and focus-visibility failures that actually block
 * people. See the test plan in the build report.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, PREVIEW } from '../src/templates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

if (!existsSync(DIST)) {
  console.error('  no dist/ — run: npm run build');
  process.exit(1);
}

/* collect built pages */
const pages = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e === 'index.html') pages.push(p);
  }
})(DIST);

const problems = [];
const warnings = [];
const rel = (p) => p.replace(DIST, '').replace(/\\/g, '/') || '/';

/* A preview build under BASE_PATH (GitHub Pages serves a project site from
   /<repo>/) writes every URL with that prefix, but dist/ itself is not nested
   under it. Strip it before resolving. Without this every link read as dead —
   and, worse, every image path failed the /img/ test below and was skipped,
   so the asset check passed by checking nothing. */
const local = (url) => (BASE && (url === BASE || url.startsWith(BASE + '/'))
  ? url.slice(BASE.length) || '/'
  : url);

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const where = rel(page);

  /* --- lang --- */
  const lang = html.match(/<html[^>]+lang="([^"]+)"/);
  if (!lang) problems.push(`${where}: <html> has no lang attribute (SC 3.1.1)`);

  /* --- exactly one h1 --- */
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) problems.push(`${where}: ${h1s} <h1> elements, expected 1`);

  /* --- landmarks: four is right, eight is noise --- */
  const landmarks =
    (html.match(/<(header|nav|main|footer|aside)[\s>]/g) || []).length;
  if (landmarks > 6) warnings.push(`${where}: ${landmarks} landmarks — past 5 or 6 they add noise`);

  /* --- every image has an alt attribute (empty is allowed, absent is not) --- */
  for (const tag of html.match(/<img[^>]*>/g) || []) {
    if (!/\salt=/.test(tag)) {
      problems.push(`${where}: <img> with no alt attribute — ${tag.slice(0, 70)}…`);
    }
    if (!/\swidth=/.test(tag) || !/\sheight=/.test(tag)) {
      problems.push(`${where}: <img> missing width/height — causes CLS, and lazy images default to 0x0`);
    }
  }

  /* --- skip link present and points somewhere real --- */
  if (!/class="skip-link"/.test(html)) warnings.push(`${where}: no skip link`);

  /* --- internal links resolve --- */
  for (const m of html.matchAll(/href="(\/[^"#]*)"/g)) {
    const href = local(m[1]);
    if (href.startsWith('//')) continue;
    const target = href.endsWith('/')
      ? join(DIST, href, 'index.html')
      : join(DIST, href);
    if (!existsSync(target)) problems.push(`${where}: dead internal link → ${href}`);
  }

  /* --- image sources resolve --- */
  for (const m of html.matchAll(/(?:src|srcset)="([^"]+)"/g)) {
    for (const cand of m[1].split(',')) {
      const url = local(cand.trim().split(/\s+/)[0]);
      if (!url.startsWith('/img/') && !url.startsWith('/fonts/')) continue;
      if (!existsSync(join(DIST, url))) problems.push(`${where}: missing asset → ${url}`);
    }
  }

  /* --- placeholders must not reach production --- */
  if (html.includes('NEEDS-INPUT')) warnings.push(`${where}: still contains NEEDS-INPUT`);

  /* --- indexing: preview builds are hidden, production builds never are --- */
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  if (PREVIEW && !noindex) problems.push(`${where}: preview build without noindex — it would be indexed`);
  if (!PREVIEW && noindex) problems.push(`${where}: PRODUCTION build carries noindex — the shop would be delisted`);

  /* --- canonical present --- */
  if (!/rel="canonical"/.test(html)) problems.push(`${where}: no canonical link`);

  /* --- work pages carry structured data --- */
  if (/\/works\//.test(where) && !/application\/ld\+json/.test(html)) {
    problems.push(`${where}: work page with no VisualArtwork JSON-LD`);
  }

  /* --- og:image on pages that should preview as an image --- */
  if ((/\/works\//.test(where) || where === '/index.html' || where === '/zh/index.html')
      && !/property="og:image"/.test(html)) {
    problems.push(`${where}: no og:image — link cards will not show the painting`);
  }
}

/* --- hreflang reciprocity --- */
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const alts = [...html.matchAll(/hreflang="[^"]+"\s+href="([^"]+)"/g)]
    .map((m) => m[1].replace(/^https?:\/\/[^/]+/, ''))
    .filter((h) => h.startsWith('/'))
    .map(local);
  for (const a of alts) {
    const target = a.endsWith('/') ? join(DIST, a, 'index.html') : join(DIST, a);
    if (!existsSync(target)) problems.push(`${rel(page)}: hreflang points at a page that does not exist → ${a}`);
  }
}

/* --- finding E-01: the CJK subset must still cover what is set in it -------
 *
 * The Chinese display face is subset to exactly the characters in src/data,
 * and fonts-cjk.css carries a unicode-range drawn to match. But the subset is
 * rebuilt by `npm run fonts`, which `npm run build` does not call, and until
 * now nothing verified it. The first Chinese work title using a character
 * outside the range would render that one glyph in the system face, mid-title,
 * beside Noto Serif SC — in the most brand-critical text on the site, with the
 * build reporting nothing.
 *
 * KEEP IN SYNC with collect() in scripts/build-fonts-cjk.py. */
const CJK_RE = /[\u2E80-\u2EFF\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/gu;

function displayCjk() {
  const site  = JSON.parse(readFileSync(join(ROOT, 'src/data/site.json'), 'utf8'));
  const sell  = JSON.parse(readFileSync(join(ROOT, 'src/data/seller.json'), 'utf8'));
  const arts  = JSON.parse(readFileSync(join(ROOT, 'src/data/artworks.json'), 'utf8'));
  const out = new Set();
  // Only the zh side of a locale pair, exactly as collect() does. The en side
  // can legitimately hold CJK — ui.langSwitch is 中文 on the English page — but
  // that is set in the BODY stack, not the display face, so it needs no subset
  // coverage. Taking both sides here would block the build on a non-issue.
  const add = (v) => {
    if (typeof v === 'string') for (const c of v.match(CJK_RE) ?? []) out.add(c);
    else if (v && typeof v === 'object') add(v.zh ?? '');
  };
  add(sell.artist.siteName);
  add(site.hero.title);
  for (const s of Object.values(site.sections)) add(s.title);
  for (const n of site.nav) { add(n.label); add(n.labelShort); }
  for (const w of arts.works) add(w.title);
  for (const v of Object.values(site.ui)) add(v);
  return out;
}

function coveredCodepoints() {
  const css = readFileSync(join(ROOT, 'public/fonts/fonts-cjk.css'), 'utf8');
  const m = css.match(/unicode-range:([^;]+);/);
  if (!m) return null;
  const set = new Set();
  for (const part of m[1].split(',')) {
    const r = part.trim().replace(/^U\+/i, '');
    if (r.includes('-')) {
      const [a, b] = r.split('-').map((x) => parseInt(x, 16));
      for (let i = a; i <= b; i++) set.add(i);
    } else set.add(parseInt(r, 16));
  }
  return set;
}

{
  const covered = coveredCodepoints();
  if (!covered) {
    problems.push('fonts-cjk.css has no unicode-range — run: npm run fonts');
  } else {
    const missing = [...displayCjk()].filter((c) => !covered.has(c.codePointAt(0)));
    if (missing.length) {
      problems.push(
        `${missing.length} CJK character${missing.length > 1 ? 's' : ''} set in the display face ` +
        `but outside the shipped subset: ${missing.join(' ')} — these render in the system ` +
        `face mid-heading. Run: npm run fonts`
      );
    }
  }
}

/* --- report --- */
console.log(`\n  checked ${pages.length} pages\n`);
for (const w of warnings) console.log(`  ! ${w}`);
if (warnings.length) console.log('');
for (const p of problems) console.log(`  ✗ ${p}`);

if (problems.length) {
  console.log(`\n  ${problems.length} problem${problems.length > 1 ? 's' : ''}. Build blocked.\n`);
  process.exit(1);
}
console.log(`  no structural problems.${warnings.length ? `  (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''}\n`);
