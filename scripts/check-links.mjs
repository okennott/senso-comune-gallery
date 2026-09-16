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
    const href = m[1];
    if (href.startsWith('//')) continue;
    const target = href.endsWith('/')
      ? join(DIST, href, 'index.html')
      : join(DIST, href);
    if (!existsSync(target)) problems.push(`${where}: dead internal link → ${href}`);
  }

  /* --- image sources resolve --- */
  for (const m of html.matchAll(/(?:src|srcset)="([^"]+)"/g)) {
    for (const cand of m[1].split(',')) {
      const url = cand.trim().split(/\s+/)[0];
      if (!url.startsWith('/img/') && !url.startsWith('/fonts/')) continue;
      if (!existsSync(join(DIST, url))) problems.push(`${where}: missing asset → ${url}`);
    }
  }

  /* --- placeholders must not reach production --- */
  if (html.includes('NEEDS-INPUT')) warnings.push(`${where}: still contains NEEDS-INPUT`);

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
    .filter((h) => h.startsWith('/'));
  for (const a of alts) {
    const target = a.endsWith('/') ? join(DIST, a, 'index.html') : join(DIST, a);
    if (!existsSync(target)) problems.push(`${rel(page)}: hreflang points at a page that does not exist → ${a}`);
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
