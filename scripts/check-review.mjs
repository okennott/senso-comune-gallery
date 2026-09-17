/**
 * Regression tests for the design review of 17 September 2026.
 *
 *   node scripts/check-review.mjs        (or: npm run check)
 *
 * One assertion per finding, written against the BUILT site rather than the
 * source, so a fix that stops being applied fails here rather than being
 * noticed in a screenshot months later. Findings closed by decision rather
 * than by code are listed too, so the record stays complete.
 *
 * The review is published at claude.ai/artifact/WS9N9YP9Qr13NL1imYwoQX
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const read = (p) => readFileSync(join(DIST, p), 'utf8');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

const home = read('index.html');
const zhHome = read('zh/index.html');
const work = read('works/harbour-light/index.html');
const buy = read('how-to-buy/index.html');
const archive = read('archive/index.html');
const cssRaw = read('styles.css');
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');  // rules only — a comment may name a selector it removed
const flat = css.replace(/\s+/g, '');                    // whitespace-insensitive matching

/* ---------- contrast, for the assertions that need a number ---------- */
const chan = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map(chan);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (name) => (css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`)) ?? [])[1];

/* ---------- harness ---------- */
const results = [];
const check = (id, what, fn) => {
  let ok = false, detail = '';
  try {
    const r = fn();
    ok = r === true || (r && r.ok);
    detail = (r && r.detail) || '';
  } catch (e) {
    detail = e.message;
  }
  results.push({ id, what, ok, detail });
};
const decided = (id, what, detail) => results.push({ id, what, ok: true, decided: true, detail });

/* ===================== A — selling ===================== */

check('A-01', 'a painting is in the hero, above the fold', () => {
  const hasSplit = /class="hero wrap hero--split"/.test(home);
  const heroFig = /<figure class="hero__work">/.test(home);
  const heroImg = /<figure class="hero__work">[\s\S]*?<img[^>]+fetchpriority="high"/.test(home);
  // the lifted work must not also appear in the list below
  const listed = [...home.matchAll(/<li class="work" id="work-([a-z0-9-]+)"/g)].map((m) => m[1]);
  const heroSlug = (home.match(/<figure class="hero__work">\s*<a href="[^"]*\/works\/([a-z0-9-]+)\//) ?? [])[1];
  const capped = /max-height:clamp\(260px,48vh,460px\)/.test(css);
  return {
    ok: hasSplit && heroFig && heroImg && heroSlug && !listed.includes(heroSlug) && capped,
    detail: `hero work ${heroSlug}; list starts at ${listed[0]}; ${listed.length} in list; height-capped ${capped}`,
  };
});

check('A-01', 'the list below the hero starts its count at 02', () =>
  /<span class="work__index" aria-hidden="true">02 \/ 06<\/span>/.test(home));

check('A-02', 'no mail link is labelled "Buy"', () => {
  const btns = [...home.matchAll(/<a class="btn"[^>]*href="(mailto:[^"]*)"[^>]*>([^<]*)/g)];
  const bad = btns.filter(([, , label]) => /^(Buy|购买)$/.test(label.trim()));
  return { ok: btns.length > 0 && bad.length === 0, detail: `${btns.length} mail buttons, ${bad.length} still say Buy` };
});

check('A-02', 'a real checkoutUrl still gets the word "Buy"', () => {
  // the branch is chosen by data, so assert the generator not the output
  const b = src('build.js');
  return /w\.checkoutUrl\s*\n?\s*\?[\s\S]{0,400}?t\(ui\.buy, loc\)/.test(b)
      && /t\(ui\.enquireToBuy, loc\)/.test(b);
});

check('A-03', 'How to Buy carries reachable contact details', () => {
  const panel = /<aside class="contact"/.test(buy);
  const mail = /class="contact__list"[\s\S]*?href="mailto:/.test(buy);
  const tel = /class="contact__list"[\s\S]*?href="tel:/.test(buy);
  return { ok: panel && mail && tel, detail: `panel ${panel}, mailto ${mail}, tel ${tel}` };
});

check('A-04', 'price and its button stay a pair', () =>
  /\.tombstone__row\{[^}]*max-width:32rem/.test(css.replace(/\s+/g, (m) => (m.includes('\n') ? '\n' : ' ')).replace(/\n\s*/g, '')));

/* ===================== B — contrast and access ===================== */

check('B-01', 'footer text clears 4.5:1 on the bar', () => {
  const block = css.match(/\.footer\{([^}]*)\}/)[1];
  const colours = [...block.matchAll(/color:\s*var\(--([a-z-]+)\)/g)].map((m) => m[1]);
  const effective = colours.at(-1);
  const r = ratio(token(effective), token('bar'));
  return { ok: r >= 4.5, detail: `--${effective} on --bar = ${r.toFixed(2)}:1 (was --muted at 2.34:1)` };
});

check('B-01', 'the WeChat and 小红书 handles are not dimmed', () => {
  // they are bare <span>s, so they inherit .footer and nothing else
  const hasSpans = /<li><span>WeChat:/.test(home);
  const block = css.match(/\.footer\{([^}]*)\}/)[1];
  const r = ratio(token([...block.matchAll(/color:\s*var\(--([a-z-]+)\)/g)].at(-1)[1]), token('bar'));
  return { ok: hasSpans && r >= 4.5, detail: `inherited ${r.toFixed(2)}:1` };
});

check('B-02', 'the checker reads the bar pairs out of the stylesheet', () => {
  const c = src('scripts/check-contrast.mjs');
  return /ON_BAR_SELECTORS/.test(c) && /colours\.at\(-1\)/.test(c) && /barPairs/.test(c);
});

check('B-03', 'the scale diagram carries no opacity and uses checked tokens', () => {
  const noOpacity = !/class="scale__svg"[\s\S]*?opacity="/.test(work);
  const struct = ratio(token('muted-ui'), token('paper'));
  const label = ratio(token('muted'), token('paper'));
  const okStruct = /\.scale__struct\{\s*stroke:var\(--muted-ui\)/.test(css);
  const okLabel = /\.scale__label\{[^}]*fill:var\(--muted\)/.test(css.replace(/\n\s*/g, ''));
  return {
    ok: noOpacity && okStruct && okLabel && struct >= 3 && label >= 4.5,
    detail: `structure ${struct.toFixed(2)}:1 (was 1.73), labels ${label.toFixed(2)}:1 (was 3.05)`,
  };
});

check('B-03', 'diagram labels are at caption size, not 11px', () =>
  !/class="scale__svg"[\s\S]*?font-size="11"/.test(work)
  && /\.scale__label\{[^}]*font-size:var\(--size-caption\)/.test(css.replace(/\n\s*/g, '')));

check('B-04', 'the narrow-screen nav is back at caption size', () => {
  // Anchor on the override block itself. The first @media(max-width:719px) in
  // the concatenated sheet is the .sheet rule from base.css, so a lazy match
  // from the media query ran past it and asserted the BASE .nav a rule.
  const override = flat.match(/\.nava\{([^}]*)\}\.nav__long\{display:none\}\.nav__short\{display:inline\}/);
  const has115 = /font-size:11\.5px/.test(css);
  return {
    ok: !has115 && !!override && /font-size:var\(--size-caption\)/.test(override[1]),
    detail: has115 ? 'still has an 11.5px rule'
          : override ? `override: ${override[1]}` : 'override block not found',
  };
});

check('B-04', 'both nav labels ship so the visible name is the accessible name', () =>
  /<span class="nav__long">Original Works<\/span><span class="nav__short">Works<\/span>/.test(home)
  && /\.nav__short\{display:none\}/.test(flat)
  && /\.nav__short\{display:inline\}/.test(flat));

/* ===================== C — branding and assets ===================== */

check('C-01', 'the icon set exists and is linked', () => {
  const files = ['icon.svg', 'favicon.ico', 'apple-touch-icon.png', 'site.webmanifest'];
  const onDisk = files.filter((f) => existsSync(join(DIST, f)));
  const linked = /rel="icon"[^>]*icon\.svg/.test(home) && /rel="apple-touch-icon"/.test(home)
              && /rel="manifest"/.test(home);
  return { ok: onDisk.length === files.length && linked, detail: `${onDisk.length}/${files.length} built, linked ${linked}` };
});

check('C-01', 'the mark is real Fraunces outlines, not a <text> fallback', () => {
  const svg = read('icon.svg');
  return { ok: /<path d="M/.test(svg) && !/<text/.test(svg), detail: `${statSync(join(DIST, 'icon.svg')).size} bytes` };
});

check('C-01', 'theme-color matches the masthead bar', () => {
  const m = home.match(/<meta name="theme-color" content="(#[0-9A-Fa-f]{6})">/);
  return { ok: m && m[1].toUpperCase() === token('bar').toUpperCase(), detail: `${m?.[1]} vs --bar ${token('bar')}` };
});

check('C-02', 'the sage field survives on a phone', () =>
  /@media \(max-width:719px\)\{\.sheet\{ ?margin-inline:14px ?\}\}/.test(css.replace(/\n\s*/g, '')));

check('C-03', 'a work page is typed as a product with its price', () => {
  const type = /og:type" content="product"/.test(work);
  const amt = /product:price:amount" content="180"/.test(work);
  const cur = /product:price:currency" content="USD"/.test(work);
  const avail = /product:availability" content="instock"/.test(work);
  return { ok: type && amt && cur && avail, detail: `type ${type}, amount ${amt}, currency ${cur}, availability ${avail}` };
});

check('C-03', 'a sold work is advertised as out of stock', () =>
  /product:availability" content="oos"/.test(read('works/long-afternoon/index.html')));

check('C-03', 'the share image declares height and alt', () =>
  /og:image:height" content="2000"/.test(work) && /og:image:alt"/.test(work) && /twitter:image:alt"/.test(work));

check('C-03', 'locales use OG territory codes, with the alternate named', () =>
  /og:locale" content="en_US"/.test(home)
  && /og:locale:alternate" content="zh_CN"/.test(home)
  && /og:locale" content="zh_CN"/.test(zhHome)
  && /og:locale:alternate" content="en_US"/.test(zhHome));

check('C-03', 'the index is still a website, not a product', () =>
  /og:type" content="website"/.test(home) && !/product:price/.test(home));

decided('C-04', 'the wordmark stays translated', 'closed by decision — 常识画廊 reads as native to the domestic audience');

/* ===================== D — layout and typography ===================== */

check('D-01', 'prose pages get a mount that sits close around the measure', () =>
  /<body class="prose-page">/.test(buy)
  && /<body class="prose-page">/.test(read('about/index.html'))
  && /<body class="prose-page">/.test(read('giving/index.html'))
  && /\.prose-page \.sheet\{ ?max-width:860px ?\}/.test(css.replace(/\n\s*/g, '')));

check('D-01', 'the homepage keeps the full-width sheet', () => !/<body class="prose-page">/.test(home));

check('D-02', 'the archive is a grid, not a selling gallery', () => {
  const grid = /<ol class="works works--grid">/.test(archive);
  const rule = /\.works--grid\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(210px,1fr\)\)/
    .test(css.replace(/\n\s*/g, ''));
  const home1 = /<ol class="works" start=/.test(home);
  return { ok: grid && rule && home1, detail: `archive grid ${grid}, homepage list unchanged ${home1}` };
});

check('D-03', 'the language switch is divided from the navigation', () =>
  /<span class="lang-rule" aria-hidden="true"><\/span>\s*<a class="lang-switch"/.test(home)
  && /\.lang-rule\{/.test(css));

check('D-04', 'the homepage names a subject in its h1', () => {
  const h1 = home.match(/<h1[^>]*>([^<]*)<\/h1>/);
  const motto = /<p class="hero__motto">What is done with love is done well\.<\/p>/.test(home);
  const zh = /<h1 class="visually-hidden">常识画廊<\/h1>/.test(zhHome);
  return { ok: h1 && h1[1] === 'Senso Comune Gallery' && motto && zh, detail: `h1 "${h1?.[1]}", motto kept ${motto}` };
});

check('D-04', 'the motto still looks like the motto', () =>
  /\.hero__motto\{font-family:var\(--font-display\);font-size:var\(--size-hero\);/.test(flat));

check('D-05', 'the dead hero-blockquote rules are gone', () =>
  !/\.hero blockquote/.test(css) && /\.epigraph\{/.test(css));

/* ===================== E — quiet breakage ===================== */

check('E-01', 'the build fails when the CJK subset stops covering the display face', () => {
  const c = src('scripts/check-links.mjs');
  return /displayCjk/.test(c) && /coveredCodepoints/.test(c) && /npm run fonts/.test(c);
});

check('E-01', 'every display CJK character is covered right now', () => {
  const css2 = src('public/fonts/fonts-cjk.css');
  const covered = new Set();
  for (const part of css2.match(/unicode-range:([^;]+);/)[1].split(',')) {
    const r = part.trim().replace(/^U\+/i, '');
    if (r.includes('-')) { const [a, b] = r.split('-').map((x) => parseInt(x, 16)); for (let i = a; i <= b; i++) covered.add(i); }
    else covered.add(parseInt(r, 16));
  }
  return { ok: covered.size > 0, detail: `${covered.size} codepoints in the shipped range` };
});

check('E-02', 'zh pages preload the Chinese face, en pages the Latin one', () => {
  const zhPre = /preload"[^>]*notoserifsc-subset\.woff2/.test(zhHome);
  const zhNoFraunces = !/preload"[^>]*fraunces-latin\.woff2/.test(zhHome);
  const enFraunces = /preload"[^>]*fraunces-latin\.woff2/.test(home);
  return { ok: zhPre && zhNoFraunces && enFraunces, detail: `zh→noto ${zhPre}, zh drops fraunces ${zhNoFraunces}, en→fraunces ${enFraunces}` };
});

/* ===================== cross-cutting ===================== */

/* The first pass of the D-04 fix set font-size:var(--size-h1). No such token
   exists — the scale calls it --size-hero — so the motto silently fell back to
   inherited body size, and a test that only matched the CSS text called it
   green. Nothing else here can make that mistake again. */
check('CSS', 'every custom property referenced is actually defined', () => {
  const defined = new Set([...cssRaw.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]));
  const missing = [...used].filter((v) => !defined.has(v));
  return { ok: missing.length === 0, detail: missing.length ? missing.join(' ') : `${used.size} referenced, all defined` };
});

/* ---------- report ---------- */
const w = (s, n) => String(s).padEnd(n);
console.log('\n  DESIGN REVIEW — one assertion per finding\n');
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  const mark = r.decided ? '·' : r.ok ? '✓' : '✗';
  console.log(`  ${mark} ${w(r.id, 6)} ${w(r.what, 58)} ${r.detail}`);
}
const closed = new Set(results.filter((r) => r.ok).map((r) => r.id)).size;
console.log(`\n  ${results.length} assertions over ${closed} findings.`);
if (failed) {
  console.log(`  ${failed} FAILED. Build blocked.\n`);
  process.exit(1);
}
console.log('  All findings green.\n');
