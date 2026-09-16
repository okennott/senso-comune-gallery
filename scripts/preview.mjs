/**
 * Single-file preview builder.
 *
 *   node scripts/preview.mjs [route] [locale]      e.g. node scripts/preview.mjs /works/harbour-light/ en
 *
 * Takes a built page out of dist/ and inlines its stylesheet, fonts and images
 * so the result is one HTML file with no external requests. Useful for a
 * design review, for sending someone a look at the site before it is
 * deployed, and for checking the page renders correctly with the fonts it
 * will really use.
 *
 * This is a review artefact, not the deployable site — the real site ships
 * separate, cacheable assets.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const route = process.argv[2] || '/';
const locale = process.argv[3] || 'en';
const prefix = locale === 'en' ? '' : `/${locale}`;

const pagePath = join(DIST, prefix, route, 'index.html');
if (!existsSync(pagePath)) {
  console.error(`  no built page at ${pagePath}\n  run: npm run build`);
  process.exit(1);
}

let html = readFileSync(pagePath, 'utf8');

const MIME = {
  '.woff2': 'font/woff2', '.webp': 'image/webp', '.avif': 'image/avif',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
};
const dataUri = (abs) => {
  const b = readFileSync(abs);
  return `data:${MIME[extname(abs).toLowerCase()] || 'application/octet-stream'};base64,${b.toString('base64')}`;
};

/* 1. stylesheet, with its font urls inlined */
let css = readFileSync(join(DIST, 'styles.css'), 'utf8');
css = css.replace(/url\('\/fonts\/([^']+)'\)/g, (m, f) => {
  const abs = join(DIST, 'fonts', f);
  return existsSync(abs) ? `url('${dataUri(abs)}')` : m;
});
html = html.replace(
  /<link rel="stylesheet" href="\/styles\.css">/,
  `<style>\n${css}\n</style>`
);

/* 2. drop the font preloads — they now point at nothing */
html = html.replace(/<link rel="preload" href="\/fonts\/[^>]+>\s*/g, '');

/* 3. images: srcset collapses to the single inlined source */
const inlineImg = (p) => {
  const abs = join(DIST, p.replace(/^\//, ''));
  return existsSync(abs) ? dataUri(abs) : null;
};
html = html.replace(/\s(?:src|srcset)="([^"]+)"/g, (m, val) => {
  // take the first candidate of a srcset, or the src itself
  const first = val.split(',')[0].trim().split(/\s+/)[0];
  if (!first.startsWith('/img/')) return m;
  const uri = inlineImg(first);
  if (!uri) return m;
  return m.startsWith(' srcset=') ? '' : ` src="${uri}"`;
});
// <source type="image/avif"> now has no srcset; remove those elements
html = html.replace(/<source type="image\/avif"[^>]*>\s*/g, '');

/* 4. same-page anchors are preserved so in-page nav still works; other
      internal links become inert so the preview cannot 404 */
html = html.replace(/href="\/(?:[a-z-]+\/)*#([a-z-]+)"/g, 'href="#$1"');
html = html.replace(/href="\/(?!\/)[^"#]*"/g, 'href="#"');

const outName = `preview${(prefix + route).replace(/\//g, '-').replace(/-+$/, '') || '-index'}.html`;
const outPath = join(ROOT, 'dist', outName);
writeFileSync(outPath, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
// count only things the browser would actually fetch, not metadata links
const external = (html.match(/<(?:img|script|iframe)[^>]+(?:src)="https?:/g) || []).length
  + (html.match(/<link[^>]+rel="(?:stylesheet|preload)"[^>]*href="https?:/g) || []).length;
console.log(`\n  ${outName}  —  ${kb} KB, ${external} external request${external === 1 ? '' : 's'}`);
console.log(`  ${outPath}\n`);
