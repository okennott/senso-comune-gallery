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

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, RELEASE } from '../src/templates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const read = (p) => readFileSync(join(DIST, p), 'utf8');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const exists = (p) => existsSync(join(DIST, p));

const home = read('index.html');
const zhHome = read('zh/index.html');
const work = read('works/harbour-light/index.html');
const buy = read('how-to-buy/index.html');
const archive = read('works/sold/index.html');   // formerly /archive/
/* The stylesheet is content-addressed — /styles.<hash>.css — so it is found
   by the name the built page actually asks for, not by a fixed one. */
const cssName = home.match(/href="[^"]*\/(styles\.[0-9a-f]+\.css)"/)?.[1];
if (!cssName) {
  console.error('  the home page names no /styles.<hash>.css — run: npm run build');
  process.exit(1);
}
const cssRaw = read(cssName);
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
  // the lifted work must not also appear among the latest works below it
  const latest = (home.match(/<section class="section ground--pale" id="latest">([\s\S]*?)<\/section>/) ?? [])[1] ?? '';
  const listed = [...latest.matchAll(/<div class="tombstone" data-work="([a-z0-9-]+)"/g)].map((m) => m[1]);
  const heroSlug = (home.match(/<figure class="hero__work">\s*<a href="[^"]*\/works\/([a-z0-9-]+)\//) ?? [])[1];
  const capped = /max-height:clamp\(260px,48vh,460px\)/.test(css);
  return {
    ok: hasSplit && heroFig && heroImg && heroSlug && !listed.includes(heroSlug) && capped,
    detail: `hero work ${heroSlug}; ${listed.length} latest works beneath, hero not repeated ${!listed.includes(heroSlug)}; height-capped ${capped}`,
  };
});

check('A-02', 'no mail link is labelled "Buy"', () => {
  // an unusable control keeps its address in data-inert-href (readiness gate)
  const btns = [...home.matchAll(/<a class="btn"[^>]*(?:data-inert-href|href)="(mailto:[^"]*)"[^>]*>([^<]*)/g)];
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

check('B-01', 'the contact details the law requires are not dimmed', () => {
  // The address, the email and the phone are bare text in the footer's first
  // column, so they inherit .footer and nothing else — and the footer is now
  // glass over the sage field, so they are solved against that composite
  // rather than against the solid bar.
  const foot = home.slice(home.indexOf('<footer'));
  const plain = /<p>[\s\S]*?<a href="mailto:[\s\S]*?<a href="tel:[\s\S]*?<\/p>/.test(foot);
  const block = css.match(/\.footer\{([^}]*)\}/)[1];
  const ground = (block.match(/--contrast-ground:\s*var\(--([a-z-]+)\)/) ?? [])[1] ?? 'bar';
  const r = ratio(token([...block.matchAll(/(?:^|[;\s])color:\s*var\(--([a-z-]+)\)/g)].at(-1)[1]), token(ground));
  return { ok: plain && r >= 4.5, detail: `inherited ${r.toFixed(2)}:1 on --${ground}` };
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
  /<span class="nav__long">How to Buy<\/span><span class="nav__short">Buy<\/span>/.test(home)
  && /\.nav__short\{display:none\}/.test(flat)
  && /\.nav__short\{display:inline\}/.test(flat));

/* ===================== C — branding and assets ===================== */

check('C-01', 'the icon set exists and is linked', () => {
  const files = ['icon-32.png', 'favicon.ico', 'apple-touch-icon.png', 'logo-mark.png', 'site.webmanifest'];
  const onDisk = files.filter((f) => existsSync(join(DIST, f)));
  const linked = /rel="icon"[^>]*icon-32\.png/.test(home) && /rel="apple-touch-icon"/.test(home)
              && /rel="manifest"/.test(home);
  return { ok: onDisk.length === files.length && linked, detail: `${onDisk.length}/${files.length} built, linked ${linked}` };
});

check('C-01', 'the set is cut at the sizes it is declared at', () => {
  // A PNG states its own size in the IHDR, 16 bytes in. An icon linked as
  // 32x32 and shipped at some other size is the kind of thing nobody looks at
  // twice and every crawler notices.
  const px = (f) => { const b = readFileSync(join(DIST, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  const want = { 'icon-32.png': 32, 'apple-touch-icon.png': 180, 'logo-mark.png': 192 };
  const got = Object.entries(want).map(([f, n]) => [f, px(f), px(f)[0] === n && px(f)[1] === n]);
  const manifest = JSON.parse(read('site.webmanifest'));
  const declared = manifest.icons.every((i) => existsSync(join(DIST, i.src.replace(/^\//, ''))));
  return { ok: got.every(([, , ok]) => ok) && declared,
           detail: got.map(([f, [w, h]]) => `${f} ${w}x${h}`).join(', ') + `, manifest resolves ${declared}` };
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

check('D-01', 'prose pages get a mount that sits close around the measure', () => {
  const flatCss = css.replace(/\n\s*/g, '');
  const bodies = ['how-to-buy', 'about', 'giving']
    .map((p) => [p, /<body class="prose-page(?: [a-z-]+)?">/.test(read(`${p}/index.html`))]);
  // About narrows further: its column is 34rem of serif, not 62ch of sans, so
  // the 860px mount would leave a third of it empty again. Same finding.
  const mounts = /\.prose-page \.sheet\{ ?max-width:860px ?\}/.test(flatCss)
    && /\.about-page \.sheet\{ ?max-width:660px ?\}/.test(flatCss)
    && /<body class="prose-page about-page">/.test(read('about/index.html'));
  const bad = bodies.filter(([, ok]) => !ok).map(([p]) => p);
  return { ok: !bad.length && mounts,
           detail: bad.length ? `not mounted: ${bad.join(', ')}` : '860px for prose, 660px for About' };
});

check('D-01', 'the homepage keeps the full-width sheet', () => !/<body class="prose-page">/.test(home));

check('D-02', 'the archive is a grid, not a selling gallery', () => {
  const grid = /<ol class="works works--grid">/.test(archive);
  const rule = /\.works--grid\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(210px,1fr\)\)/
    .test(css.replace(/\n\s*/g, ''));
  // selling pages use the larger catalogue card; only sold works get the reference grid
  const selling = /<ol class="works works--catalogue">/.test(read('works/index.html')) && !/works--grid/.test(read('works/index.html'));
  return { ok: grid && rule && selling, detail: `sold works grid ${grid}, selling pages use the catalogue card ${selling}` };
});

check('D-03', 'the language switch is divided from the navigation', () =>
  /<span class="lang-rule" aria-hidden="true"><\/span>\s*<a class="lang-switch"/.test(home)
  && /\.lang-rule\{/.test(css));

check('D-04', 'the homepage names a subject in its h1', () => {
  const h1 = home.match(/<h1[^>]*>([^<]*)<\/h1>/);
  // the motto is set with its line breaks as written, and attributed in full
  const motto = /<p class="hero__motto">That which<br>is done<br>with love<br>is well done\.<\/p><\/blockquote>\s*<figcaption class="hero__cite">— Vincent Willem van Gogh<\/figcaption>/.test(home);
  const zh = /<h1 class="visually-hidden">常识画廊<\/h1>/.test(zhHome);
  return { ok: h1 && h1[1] === 'Senso Comune Gallery' && motto && zh, detail: `h1 "${h1?.[1]}", motto kept ${motto}` };
});

// The original above the translation, in Dutch, marked as Dutch, word for word
// as letter 143 has it — and on the Chinese page too, because the original is
// the original in both. The blockquote cites the letter it comes from.
check('D-04', 'van Gogh is quoted in his own language first', () => {
  const nl = '<p class="hero__original" lang="nl">wat met liefde<br>gedaan wordt<br>dat wordt<br>goed gedaan</p>';
  const cited = /<blockquote cite="https:\/\/vangoghletters\.org\/vg\/letters\/let143\/letter\.html">/;
  const before = home.indexOf(nl) < home.indexOf('<p class="hero__motto">') && home.includes(nl);
  return { ok: before && zhHome.includes(nl) && cited.test(home) && cited.test(zhHome),
    detail: `original first ${before}, on the zh page ${zhHome.includes(nl)}` };
});

check('D-04', 'the motto still looks like the motto', () =>
  /\.hero__motto\{font-family:var\(--font-display\);font-size:var\(--size-hero\);/.test(flat));

// Three registers, three drawings: the original italic at body size, the
// translation roman at hero size, the name at caption size in the body face —
// which it gets by not naming a family at all, the way the site's captions do.
check('D-04', 'the original, the translation and the name are set apart', () =>
  /\.hero__original\{font-family:var\(--font-display\);font-size:var\(--size-body\);[^}]*font-style:italic/.test(flat)
  && /\.hero__cite\{[^}]*font-size:var\(--size-caption\)/.test(flat)
  && !/\.hero__cite\{[^}]*font-family/.test(flat));

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

check('E-03', 'the code assets are content-addressed, so no cache can mix two builds', () => {
  /* A page and its stylesheet expire independently. GitHub Pages sends
     max-age=600 on both and ignores _headers, so for ten minutes after a
     deploy a returning visitor could be served the previous stylesheet with
     the current page — which reads as a change that never shipped, and was
     read as one on 20 September 2026. A hashed name makes that impossible:
     the page asks for the bytes it was built against, by name.

     Asserted here rather than trusted: every reference on every built page
     carries a hash, each one resolves to a file, and no plain-named copy is
     left in dist/ for a stale page to find. */
  const want = ['styles.css', 'gallery.js', 'availability.js'];
  const pages = [home, zhHome, work, buy, archive, read('404.html')];
  const stamped = /^(styles|gallery|availability)\.[0-9a-f]{8}\.(css|js)$/;

  const refs = new Set();
  for (const p of pages) {
    for (const m of p.matchAll(/(?:href|src)="[^"]*\/((?:styles|gallery|availability)\.[^"/]+)"/g)) refs.add(m[1]);
    for (const w of want) if (new RegExp(`(?:href|src)="[^"]*/${w.replace('.', '\\.')}"`).test(p)) refs.add(w);
  }
  const unstamped = [...refs].filter((r) => !stamped.test(r));
  const missing = [...refs].filter((r) => stamped.test(r) && !exists(r));
  const plainLeft = want.filter((w) => exists(w));

  return {
    ok: refs.size >= 2 && unstamped.length === 0 && missing.length === 0 && plainLeft.length === 0,
    detail: `${refs.size} references, ${unstamped.length} unhashed, ${missing.length} dangling, ${plainLeft.length} plain-named copies in dist/`,
  };
});

check('E-03', 'the hashed names are cached for a year, and nothing else at the root is', () => {
  const h = read('_headers');
  const immutable = ['/styles.*.css', '/gallery.*.js', '/availability.*.js']
    .every((pat) => new RegExp(`${pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n\\s*Cache-Control: public, max-age=31536000, immutable`).test(h));
  // the one root file that must NOT be frozen: the sold check the shop reads
  const availability = /\/availability\.json\n\s*Cache-Control: public, max-age=60/.test(h);
  return { ok: immutable && availability, detail: `hashed immutable ${immutable}, availability.json still 60s ${availability}` };
});

check('E-03', 'the sold check can still strip its own name to find the base', () => {
  /* availability.js works out the deployment base by stripping its own
     filename off its own src, so one file serves a domain root and a Pages
     subpath. When that filename gained a hash the fixed expression stopped
     matching: the base became the whole script URL, the fetch went to
     /availability.<hash>.jsavailability.json, and a 404 there lands in the
     catch that exists for being offline — so every sold work would have gone
     on showing as for sale, with nothing in the console to say so.

     Asserted, not read: the expression is taken out of the shipped script and
     solved against the name the build actually wrote, at a root and under a
     base path, and the answer has to be the base and nothing else. */
  const js = src('src/scripts/availability.js');
  const m = js.match(/\.replace\((\/[\s\S]*?\/), *''\)/);
  const built = readdirSync(DIST).filter((f) => /^availability\.[0-9a-f]{8}\.js$/.test(f));
  if (!m || built.length !== 1) {
    return { ok: false, detail: `expression found ${!!m}, hashed builds in dist/ ${built.length}` };
  }
  const body = m[1].slice(1, m[1].lastIndexOf('/'));
  const re = new RegExp(body);
  const solved = [`/${built[0]}`, `/senso-comune-gallery/${built[0]}`, '/availability.js']
    .map((u) => [u, u.replace(re, '')]);
  const bad = solved.filter(([u, base]) => !base.endsWith('/') || u.slice(base.length).includes('/'));
  // and the selector it falls back to must match the hashed name too
  const sel = /script\[src\*="availability\."\]\[src\$="\.js"\]/.test(js);
  return { ok: !bad.length && sel,
           detail: bad.length ? bad.map(([u, b]) => `${u} → ${b}`).join('; ')
             : `${solved.length} names solved to their base, fallback selector matches a hashed name ${sel}` };
});

/* ===================== F — the mark ===================== */
/* The SC monogram, as Priscilla's prototype sheet draws it. Adopted as the
   artwork itself on 18 September 2026: the site shows her drawing, not a
   construction of it. These assertions hold the one source file unedited, the
   derivatives to the sizes they claim, and the costs of a raster mark on the
   record rather than quietly absorbed. */

const ART = join(ROOT, 'brand/mark-lockup.png');
const SHEET = join(ROOT, 'brand/brand-sheet.png');
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const pngSize = (f) => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

check('F-01', 'the supplied artwork is present, and is the file that was supplied', () => {
  // brand/ holds the originals and nothing derived. A derived copy quietly
  // replacing an original is how a brand loses its own artwork, so the two
  // files are pinned by hash: re-exporting or "cleaning up" either one fails
  // the build and has to be an explicit decision.
  const want = {
    'brand/mark-lockup.png': '7dfbc7384a9ff346b2a97d8488a95c8fdcdd6e97ccee90ef407d5ce75cf64682',
    'brand/brand-sheet.png': '5b577e91d0e49d12cee7b4462db9298d352bff28008f3cb556209383f2a32eb9',
  };
  const bad = Object.entries(want).filter(([f, h]) => !existsSync(join(ROOT, f)) || sha(join(ROOT, f)) !== h);
  const [w, h] = existsSync(ART) ? pngSize(ART) : [0, 0];
  return { ok: !bad.length && w === 1536 && h === 1024,
           detail: `both originals unmodified ${!bad.length}, lockup ${w}x${h}` };
});

check('F-01', 'every derivative is cut from that one file, by crop and resize alone', () => {
  const py = src('scripts/build-icons.py');
  const reads = [...py.matchAll(/ROOT \/ "([^"]+)"/g)].map((m) => m[1]);
  const onlyArtwork = reads.length === 2 && reads.includes('brand/mark-lockup.png') && reads.includes('public');
  // Crop, resize and save. No drawing, no colour replacement, no tracing.
  const noRedraw = !/ImageDraw|ImageFont|putpixel|new\(\s*["']RGB/.test(py);
  const cropped = /\.crop\(/.test(py) && /\.resize\(/.test(py);
  return { ok: onlyArtwork && noRedraw && cropped,
           detail: `reads ${reads.join(' + ')}, crop+resize only ${cropped}, nothing redrawn ${noRedraw}` };
});

check('F-01', 'the masthead carries the artwork, sized, and does not reflow the bar', () => {
  const m = home.match(/<a class="wordmark"[^>]*>([\s\S]*?)<\/a>/);
  if (!m) return { ok: false, detail: 'no wordmark lockup' };
  const img = (m[1].match(/<img class="wordmark__mark"[^>]*>/) ?? [''])[0];
  const sized = /width="192"/.test(img) && /height="192"/.test(img);
  const art = /src="[^"]*\/logo-mark\.png"/.test(img);
  const plate = /\.wordmark__mark\{[^}]*border-radius:var\(--radius-ui\)/.test(flat)
             && /\.wordmark__mark\{[^}]*box-shadow:var\(--shadow-mount\)/.test(flat);
  return { ok: sized && art && plate,
           detail: `artwork ${art}, width+height ${sized}, mounted as a plate ${plate}` };
});

check('F-02', 'the mark is one link and one tab stop with the wordmark', () => {
  // 2.5.3 Label in Name and 2.4.4: a decorative mark inside the link must not
  // contribute an accessible name of its own, and must not be a second link to
  // the same place. An <img> does that with an EMPTY alt, not a missing one.
  const m = home.match(/<a class="wordmark"[^>]*>([\s\S]*?)<\/a>/);
  const img = (m[1].match(/<img class="wordmark__mark"[^>]*>/) ?? [''])[0];
  const decorative = /\salt=""/.test(img) && !/aria-label=/.test(img) && !/title=/.test(img);
  const named = /<span class="wordmark__name">/.test(m[1]);
  return { ok: decorative && named,
           detail: `empty alt, no name of its own ${decorative}, wordmark still the name ${named}` };
});

check('F-02', 'the monogram serves both locales unchanged', () => {
  // Finding C-04, closed by decision: the NAME stays translated — 常识画廊 on
  // the Chinese page — and the monogram is the device that stands beside it,
  // identical in both. A device is not a translation.
  const lock = (h) => (h.match(/<a class="wordmark"[^>]*>([\s\S]*?)<\/span>/) ?? [])[0] ?? '';
  const img = (h) => (lock(h).match(/<img class="wordmark__mark"[^>]*>/) ?? [''])[0];
  const zhName = /常识画廊/.test(lock(zhHome));
  return { ok: img(home) && img(home) === img(zhHome) && zhName,
           detail: `byte-identical ${img(home) === img(zhHome)}, zh wordmark still translated ${zhName}` };
});

check('F-03', 'nothing on the site redraws the mark', () => {
  // scripts/mark.mjs still holds the Fraunces construction that stood in
  // before the artwork arrived. It is kept because the report's own figure is
  // drawn from it — the recorded alternative, not a second live logo — and
  // this asserts that nothing the SITE builds imports it.
  const site = [src('src/templates.js'), src('build.js'), src('scripts/build-icons.py')].join('\n');
  const unused = !/mark\.mjs|markSvg/.test(site);
  const keptForTheReport = /mark\.mjs/.test(src('docs/report/figures.py'));
  return { ok: unused && keptForTheReport,
           detail: `the site imports no generator ${unused}, the report still draws the alternative ${keptForTheReport}` };
});

check('F-03', 'the cost of a drawn mark at icon sizes is on the record', () => {
  // A pencil drawing with construction lines does not survive 16px, and the
  // supply is one 1536x1024 raster with no vector behind it. Both are true,
  // neither is fixable by the build, and so both are stated in the report
  // rather than absorbed. This asserts the statement is still there.
  const r = src('docs/report/senso-comune-report.qmd');
  const said = /16 px/.test(r) && /1536/.test(r) && /no vector/i.test(r);
  const [w] = pngSize(join(DIST, 'icon-32.png'));
  return { ok: said && w === 32,
           detail: `report states the ceiling and the small-size cost ${said}` };
});

check('F-04', 'the sheet\'s own specification is reproduced, not paraphrased', () => {
  // The report carries the sheet as drawn AND its notes as written. These are
  // the values a reader would check against the image on the facing page.
  const r = src('docs/report/senso-comune-report.qmd');
  const values = ['1 : 1.618', 'Upper Left', 'Lower Right', '15 mm',
                  '#969B7D', '#737C61', '#24241F', '#E9E2D3',
                  'Primary', 'Black', 'Reversed', 'Monochrome'];
  const missing = values.filter((v) => !r.includes(v));
  const figures = /brand-sheet/.test(r) && /mark-lockup/.test(r);
  return { ok: !missing.length && figures,
           detail: `${values.length - missing.length}/${values.length} values quoted${missing.length ? ` — missing ${missing.join(', ')}` : ''}, both plates shown ${figures}` };
});

/* ===================== G — softness ===================== */
/* Added with the softness pass: soft edges, elevation, glass, motion and
   section boundaries, with the palette unchanged. The paintings' own promise —
   never distorted, rounded or transformed — needs a browser and lives in
   check-render.mjs; these are the parts the built files can prove. */

const rulesFor = (selRe) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter((m) => selRe.test(m[1])).map((m) => m[2]);
const allHtml = (() => {
  const out = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html') {
        const html = readFileSync(p, 'utf8');
        if (!/<meta http-equiv="refresh"/.test(html)) out.push([p.slice(DIST.length), html]);   // stubs are not pages
      }
    }
  })(DIST);
  return out;
})();

check('G-01', 'softness adds no colour: shadows, glass and bands are palette tokens', () => {
  const tokens = src('src/styles/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const soft = [...tokens.matchAll(/--(shadow-[a-z]+|glass-[a-z-]+|mat|radius-[a-z]+|edge-breath)\s*:([^;]+);/g)];
  /* --glass-footer is the one hex here, and deliberately so: it is not a
     colour anyone chose but the composite of --bar at --glass-bar-opacity
     over --field, written down so the rest of the site can use it as a
     ground. It is allowed only for as long as check-contrast.mjs recomputes
     it from those three tokens and fails on drift — otherwise it is exactly
     the hand-picked literal this assertion exists to keep out. */
  const derived = new Set(['glass-footer']);
  const literal = soft.filter(([, n, v]) => !derived.has(n) && /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v)).map(([, n]) => n);
  const cc = src('scripts/check-contrast.mjs');
  const recomputed = /T\['glass-footer'\]/.test(cc) && /--glass-bar-opacity/.test(cc) && /T\['field'\]/.test(cc);
  const shadowsUseBar = soft.filter(([, n]) => n.startsWith('shadow-')).every(([, , v]) => /var\(--bar\)/.test(v));
  const edgeRules = rulesFor(/\.edge\b/).join(';');
  const edgeLiteral = /#[0-9a-f]{3,8}\b|rgba?\(/i.test(edgeRules);
  return { ok: soft.length >= 8 && !literal.length && recomputed && shadowsUseBar && !edgeLiteral,
           detail: `${soft.length} softness tokens, literals ${literal.join(' ') || 'none'}, --glass-footer recomputed ${recomputed}, shadows tinted --bar ${shadowsUseBar}, bands literal-free ${!edgeLiteral}` };
});

check('G-02', 'paintings carry a mat, and nothing that rounds, scales or stretches them', () => {
  const mount = rulesFor(/\.work__img|\.hero__work img/);
  const joined = mount.join(';');
  const mat = /padding:var\(--mat\)/.test(joined) && /box-sizing:border-box/.test(joined);
  const contain = /object-fit:contain/.test(joined);
  const radius = /border-radius/.test(joined);
  const transform = /transform/.test(joined);
  return { ok: mat && contain && !radius && !transform,
           detail: `mat ${mat}, contain ${contain}, radius ${radius}, transform ${transform}` };
});

check('G-03', 'the glass bar is solid at rest, scroll-driven, desktop only', () => {
  const gated = /@media\(min-width:720px\)and\(prefers-reduced-motion:no-preference\)\{@supports\(animation-timeline:scroll\(\)\)/.test(flat);
  const fromSolid = /@keyframesmasthead-glass\{from\{background-color:var\(--bar\)\}to\{background-color:color-mix\(insrgb,var\(--bar\)var\(--glass-bar-opacity\),transparent\)\}\}/.test(flat);
  const restSolid = /\.masthead\{position:sticky;[^}]*background:var\(--bar\)/.test(flat);
  const range = /animation-range:096px/.test(flat);
  return { ok: gated && fromSolid && restSolid && range,
           detail: `gated ${gated}, keyframes solid→glass ${fromSolid}, base solid ${restSolid}, first 96px ${range}` };
});

check('G-04', 'new motion stands down for reduced motion; focus is never animated', () => {
  const noPref = [...flat.matchAll(/@media\(prefers-reduced-motion:no-preference\)\{/g)].length;
  const lightboxGated = /@media\(prefers-reduced-motion:no-preference\)\{dialog\.lightbox,dialog\.lightbox::backdrop\{transition/.test(flat);
  const vtGated = /@media\(prefers-reduced-motion:no-preference\)\{::view-transition-old\(root\)/.test(flat);
  const neutraliser = /@media\(prefers-reduced-motion:reduce\)\{\*,\*::before,\*::after\{animation-duration:1ms!important/.test(flat);
  const focus = rulesFor(/:focus-visible\s*$/).join(';');
  const focusStill = !/transition|animation/.test(focus);
  return { ok: lightboxGated && vtGated && neutraliser && focusStill,
           detail: `lightbox gated ${lightboxGated}, page transitions gated ${vtGated}, global neutraliser ${neutraliser}, focus unanimated ${focusStill}` };
});

check('G-05', 'every page names each painting once, and the lightbox copy not at all', () => {
  const dupes = [], lightboxNamed = [];
  let named = 0;
  for (const [p, html] of allHtml) {
    const names = [...html.matchAll(/view-transition-name:(work-[a-z0-9-]+)/g)].map((m) => m[1]);
    named += names.length;
    const seen = new Set();
    for (const n of names) { if (seen.has(n)) dupes.push(`${p} ${n}`); seen.add(n); }
    if (/<dialog[\s\S]*?view-transition-name[\s\S]*?<\/dialog>/.test(html)) lightboxNamed.push(p);
  }
  const masthead = /\.masthead\{view-transition-name:masthead\}/.test(flat);
  return { ok: named > 0 && !dupes.length && !lightboxNamed.length && masthead,
           detail: `${named} names over ${allHtml.length} pages, duplicates ${dupes.length}, lightbox named ${lightboxNamed.length}, masthead held ${masthead}` };
});

check('G-06', 'every boundary band joins the grounds actually either side of it', () => {
  // A band's endpoints must BE its neighbours, or the soft edge breaks into a
  // hard seam — three of four did before this pass. The hero sits on the bare
  // sheet, which is the pale plate. Since 20 September 2026 a band names its
  // neighbours' PLATE tokens rather than the washes those plates are painted
  // with, so the join survives a change of plate — including the current one,
  // where every plate is transparent and a band paints nothing at all.
  const bad = [];
  let bands = 0;
  for (const [p, html] of [['/', home], ['/zh/', zhHome]]) {
    const seq = [...html.matchAll(/<(section|div)\s+class="([^"]*)"/g)]
      .map((m) => m[2]).filter((c) => /\b(hero|edge|section)\b/.test(c) && !/section__/.test(c));
    seq.forEach((c, i) => {
      const m = c.match(/\bedge--([a-z]+)-([a-z]+)\b/);
      if (!m) return;
      bands++;
      const ground = (cls) => (cls && /\bhero\b/.test(cls) ? 'pale' : (cls?.match(/\bground--([a-z]+)/) ?? [])[1]);
      const before = ground(seq[i - 1]), after = ground(seq[i + 1]);
      if (before !== m[1] || after !== m[2]) bad.push(`${p} edge--${m[1]}-${m[2]} sits between ${before} and ${after}`);
    });
    // and the CSS for each band must fade between the grounds its name says
    for (const [, a, b] of html.matchAll(/\bedge--([a-z]+)-([a-z]+)\b/g)) {
      const rule = new RegExp(`\\.edge--${a}-${b}\\{--edge-from:var\\(--plate-${a}\\);--edge-to:var\\(--plate-${b}\\)\\}`);
      if (!rule.test(flat)) bad.push(`CSS for edge--${a}-${b} does not fade ${a} → ${b}`);
    }
  }
  const breath = /--edge-mid:color-mix\(inoklab,var\(--field\)var\(--edge-breath\)/.test(flat);
  return { ok: bands >= 8 && !bad.length && breath, detail: bad.length ? bad.join('; ') : `${bands} bands, all seamless, the field breathes through at the centre ${breath}` };
});

/* ===================== G — the canvas ===================== */
/* Added 18 September 2026 with the texture pass. One tile, defined once,
   blended one way, on the surfaces that frame and on none that is read. */

check('G-07', 'the canvas is one tile, defined once and referenced', () => {
  const tokens = src('src/styles/tokens.css');
  const defined = (tokens.match(/--canvas-grain:/g) ?? []).length;
  const sheets = src('src/styles/base.css') + src('src/styles/gallery.css');
  const used = (sheets.replace(/\/\*[\s\S]*?\*\//g, '').match(/var\(--canvas-grain\)/g) ?? []).length;
  const noOther = !/feTurbulence/.test(sheets.replace(/\/\*[\s\S]*?\*\//g, ''));
  // Two, since 20 September 2026: the tile is on the mat and on the video's
  // mat, and on nothing else. It was three; the field and the bands gave it up.
  return { ok: defined === 1 && used === 2 && noOther,
           detail: `defined ${defined}x, used ${used}x, no second noise in the stylesheets ${noOther}` };
});

check('G-07', 'the tile cannot change a colour: neutral, mean 0.5, soft-light', () => {
  const tokens = src('src/styles/tokens.css');
  const tile = (tokens.match(/--canvas-grain:\s*url\("([^"]+)"\)/) ?? [])[1] ?? '';
  const slope = Number((tokens.match(/--canvas-slope:\s*([\d.]+)/) ?? [])[1]);
  // desaturated, so it can only modulate lightness and never tint
  const grey = /saturate' values='0'/.test(tile);
  // sRGB, or feTurbulence's 0.5 mean arrives as 0.73 and the "identity" lightens
  const srgb = /color-interpolation-filters='sRGB'/.test(tile);
  // the transfer is symmetric about 0.5: intercept = (1 - slope) / 2
  const intercepts = [...tile.matchAll(/slope='([\d.]+)' intercept='([\d.]+)'/g)]
    .map(([, sl, ic]) => Math.abs(Number(ic) - (1 - Number(sl)) / 2) < 1e-9);
  const centred = intercepts.length === 3 && intercepts.every(Boolean);
  const declared = Math.abs(slope - Number((tile.match(/feFuncR type='linear' slope='([\d.]+)'/) ?? [])[1])) < 1e-9;
  const sheets = src('src/styles/base.css') + src('src/styles/gallery.css');
  const blended = (sheets.match(/(?:background-blend-mode|mix-blend-mode):[^;]*soft-light/g) ?? []).length >= 2;
  return { ok: grey && srgb && centred && declared && blended,
           detail: `greyscale ${grey}, sRGB ${srgb}, symmetric about 0.5 ${centred}, --canvas-slope matches the tile ${declared}, soft-light everywhere ${blended}` };
});

check('G-07', 'the texture is on the mat and on nothing else', () => {
  // check-contrast.mjs solves the arithmetic — what excursion each reading
  // ground could take — and fails on a textured reading ground. This asserts
  // the narrower rule the texture now follows: ONE material. A board has
  // tooth; the walls (the field, the sheet, the bands) do not.
  const sheets = (src('src/styles/base.css') + src('src/styles/gallery.css'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const textured = [...sheets.matchAll(/([^{}]+)\{([^{}]*var\(--canvas-grain\)[^{}]*)\}/g)]
    .map((m) => m[1].trim().replace(/\s+/g, ' '));
  const mats = ['.work__img, .hero__work img', '.work__video'];
  const same = textured.length === mats.length && mats.every((f) => textured.includes(f));
  const solved = /READING/.test(src('scripts/check-contrast.mjs'));
  return { ok: same && solved,
           detail: `${textured.join(' · ') || 'nothing'}${same ? '' : ` — expected ${mats.join(' · ')}`}` };
});

/* ===================== H — shop bar and work views ===================== */
/* Decisions of 17 September 2026 (report, Part 6): search, account and cart
   shown now with placeholder destinations; detail, edge, back and video views
   on every work page as placeholders until the photographs exist. */

const siteJson = JSON.parse(src('src/data/site.json'));
const artJson = JSON.parse(src('src/data/artworks.json'));
const SLUG_SET = new Set(artJson.works.map((w) => w.slug));
const isWork = (p) => { const m = p.match(/\/works\/([a-z0-9-]+)\/index\.html$/); return !!m && SLUG_SET.has(m[1]); };
const workPages = allHtml.filter(([p]) => isWork(p));
const notWorkPages = allHtml.filter(([p]) => !isWork(p));

check('H-01', 'search, account and cart, in that order, on every page', () => {
  const bad = [];
  for (const [p, html] of allHtml) {
    const bar = (html.match(/<ul class="shopbar">([\s\S]*?)<\/ul>/) ?? [])[1] ?? '';
    const roles = [...bar.matchAll(/data-placeholder="([a-z]+)"/g)].map((m) => m[1]).join(' ');
    if (roles !== 'search account cart') bad.push(`${p}: ${roles || 'none'}`);
  }
  return { ok: !bad.length, detail: bad.length ? bad.slice(0, 3).join('; ') : `${allHtml.length} pages` };
});

check('H-01', 'each shop control is named by a word, in the page language', () => {
  const want = { en: ['Search', 'Account', 'Cart'], zh: ['搜索', '账户', '购物车'] };
  const got = (html) => [...html.matchAll(/class="shopbar__link"[^>]*>[\s\S]*?<span class="visually-hidden">([^<]+)<\/span>/g)].map((m) => m[1]);
  const en = got(home).join(), zh = got(zhHome).join();
  const iconsHidden = [...home.matchAll(/<svg class="shopbar__icon"[^>]*>/g)].every((m) => /aria-hidden="true"/.test(m[0]));
  return { ok: en === want.en.join() && zh === want.zh.join() && iconsHidden,
           detail: `en ${en}, zh ${zh}, icons aria-hidden ${iconsHidden}` };
});

/* The footer's channel row. The names are proper nouns, so they are the same
   in both locales — that is the point, not an untranslated string. Each mark
   is a link with a hidden name and an aria-hidden drawing, and every channel
   whose handle is still owed points at a declared route that does not exist,
   so the click lands on the 404 page rather than on a profile that is not
   Priscilla's. */
check('H-01', 'every channel is a named mark, and an unset one lands on the 404', () => {
  const names = (html) => [...html.matchAll(/class="social__link"[^>]*>[\s\S]*?<span class="visually-hidden">([^<]+)<\/span>/g)].map((m) => m[1]);
  const want = ['Instagram', 'Facebook', 'X', 'Bluesky', '小红书', 'WeChat'].join();
  const iconsHidden = [...home.matchAll(/<svg class="social__icon"[^>]*>/g)].every((m) => /aria-hidden="true"/.test(m[0]));
  const dead = Object.values(siteJson.placeholders.social);
  const marked = [...home.matchAll(/<a class="social__link" href="([^"]+)"([^>]*)>/g)];
  const unset = marked.filter(([, , a]) => /data-placeholder=/.test(a));
  const allDead = unset.every(([, href]) => dead.some((r) => href.endsWith(r)))
    && dead.every((r) => !existsSync(join(DIST, r, 'index.html')));
  return { ok: names(home).join() === want && names(zhHome).join() === want && iconsHidden
           && marked.length === 6 && unset.length === 6 && allDead,
           detail: `${marked.length} marks, ${unset.length} still owed, all dead ${allDead}, icons aria-hidden ${iconsHidden}` };
});

check('H-02', 'the placeholders land on a bilingual, unindexed 404', () => {
  const nf = existsSync(join(DIST, '404.html')) ? read('404.html') : '';
  const routes = Object.values(siteJson.placeholders.routes);
  const unbuilt = routes.every((r) => !existsSync(join(DIST, r, 'index.html')));
  const bilingual = /lang="en"/.test(nf) && /lang="zh-CN"/.test(nf);
  const noindex = /name="robots" content="noindex/.test(nf);
  const notInSitemap = !/404/.test(read('sitemap.xml'));
  return { ok: !!nf && unbuilt && bilingual && noindex && notInSitemap,
           detail: `404 ${!!nf}, routes unbuilt ${unbuilt}, bilingual ${bilingual}, noindex ${noindex}, not in sitemap ${notInSitemap}` };
});

const viewManifest = existsSync(join(ROOT, 'public/img/views.json')) ? JSON.parse(src('public/img/views.json')) : {};
/** The views a work page should show: all of them in a preview; in a release,
 *  only those whose photograph exists (readiness rule WK-10). */
const expectedViews = (slug) => {
  const w = artJson.works.find((x) => x.slug === slug);
  return ['front', ...(w.views ?? []).map((v) => v.kind)
    .filter((k) => !RELEASE || viewManifest[`${w.image}-${k}`]?.placeholder === false)];
};

check('H-03', 'every work page shows its views, in order, with a thumbnail each', () => {
  const bad = [];
  for (const [p, html] of workPages) {
    const slug = p.match(/\/works\/([a-z0-9-]+)\//)[1];
    const want = expectedViews(slug);
    const views = [...html.matchAll(/<li class="gallery__view" id="view-[a-z0-9-]+?-(front|detail|edge|back|video)"/g)].map((m) => m[1]).join(' ');
    const thumbs = [...html.matchAll(/class="gallery__thumb[^"]*" href="#(view-[a-z0-9-]+)"/g)].map((m) => m[1]);
    const ids = new Set([...html.matchAll(/id="(view-[a-z0-9-]+)"/g)].map((m) => m[1]));
    if (views !== want.join(' ')) bad.push(`${p}: ${views} (expected ${want.join(' ')})`);
    if (thumbs.length !== want.length || !thumbs.every((t) => ids.has(t))) bad.push(`${p}: thumbnails ${thumbs.length}, all targets exist ${thumbs.every((t) => ids.has(t))}`);
  }
  return { ok: workPages.length > 0 && !bad.length, detail: bad.length ? bad.slice(0, 2).join('; ') : `${workPages.length} work pages, each view with a working thumbnail link${RELEASE ? ' (release: views without photographs omitted)' : ''}` };
});

check('H-04', 'video only on work pages; never preloaded, never autoplayed', () => {
  const elsewhere = notWorkPages.filter(([, h]) => /<video\b/.test(h)).map(([p]) => p);
  const vids = workPages.flatMap(([, h]) => [...h.matchAll(/<video\b[^>]*>/g)].map((m) => m[0]));
  const quiet = vids.every((v) => /preload="none"/.test(v) && !/\bautoplay\b/.test(v) && /\bcontrols\b/.test(v) && /\bplaysinline\b/.test(v));
  const named = vids.every((v) => /aria-label="[^"]+"/.test(v));
  const wantVideos = workPages.filter(([p]) => expectedViews(p.match(/\/works\/([a-z0-9-]+)\//)[1]).includes('video')).length;
  return { ok: !elsewhere.length && vids.length === wantVideos && quiet && named,
           detail: `elsewhere ${elsewhere.length}, ${vids.length} videos, preload none + controls + no autoplay ${quiet}, named ${named}` };
});

check('H-04', 'a placeholder view is marked as one, and its alt text is still owed', () => {
  const manifest = existsSync(join(ROOT, 'public/img/views.json')) ? JSON.parse(src('public/img/views.json')) : {};
  let mismatch = 0, views = 0;
  for (const [, html] of workPages) {
    for (const m of html.matchAll(/<img class="work__img work__img--view"[^>]*src="[^"]*\/img\/([a-z0-9-]+)-1280\.webp"[^>]*>/g)) {
      views++;
      const flagged = /data-placeholder="view"/.test(m[0]);
      if (flagged !== !!manifest[m[1]]?.placeholder) mismatch++;
    }
  }
  const owed = artJson.works.every((w) => (w.views ?? []).every((v) => v.alt?.en && v.alt?.zh));
  const wantViews = RELEASE ? workPages.reduce((n, [p]) => n + expectedViews(p.match(/\/works\/([a-z0-9-]+)\//)[1]).filter((k) => k !== 'front' && k !== 'video').length, 0) : views;
  return { ok: (RELEASE || views > 0) && views === wantViews && !mismatch && owed, detail: `${views} view images, flag disagrees with the manifest ${mismatch}, every view has an alt field ${owed}` };
});

check('H-05', 'only the front view carries the painting between pages', () => {
  const bad = workPages.filter(([, h]) => {
    const names = [...h.matchAll(/view-transition-name:work-/g)].length;
    const onView = /work__img--view"[^>]*view-transition-name/.test(h) || /<video[^>]*view-transition-name/.test(h);
    return names !== 1 || onView;
  }).map(([p]) => p);
  return { ok: !bad.length, detail: bad.length ? bad.join(' ') : 'one name per work page, on the front view' };
});

check('H-06', 'purchase limits are declared per entity, and still owed', () => {
  const seller = JSON.parse(src('src/data/seller.json'));
  const ents = Object.entries(seller.entities);
  const declared = ents.every(([, e]) => 'maxTransactionUSD' in e.checkout);
  return { ok: declared, detail: ents.map(([k, e]) => `${k}: ${e.checkout.maxTransactionUSD}`).join(', ') };
});

/* ===================== I — the site's structure ===================== */
/* 17 September 2026 (report, "The site's structure"): the structure the six
   reference sites agree on, with one site-specific departure. Each assertion
   names the finding it holds. */

const seriesItems = siteJson.series.items;
/* URLs in the built pages carry the deployment prefix on a preview build
   (/senso-comune-gallery on GitHub Pages). Every path matched below goes
   through this, or the assertions would pass locally and fail in CI. */
const B = BASE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const byLoc = (p) => [['en', p], ['zh', `/zh${p}`]];

check('I-01', 'the header navigates to four real pages, no in-page jumps', () => {
  const nav = (html) => ((html.match(/<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/) ?? [])[1] ?? '');
  const hrefs = [...nav(home).matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const want = ['/works/', '/about/', '/how-to-buy/', '/contact/'];
  const pages = hrefs.every((h) => !h.includes('#'));
  const order = want.every((w, i) => hrefs[i]?.endsWith(w));
  return { ok: hrefs.length === 4 && pages && order, detail: hrefs.join(' ') };
});

check('I-01', 'the header marks where the visitor is', () => {
  const cur = (html) => (nav => [...nav.matchAll(/<a href="[^"]*"( aria-current="(page|true)")?>/g)].map((m) => m[2] ?? '-').join(','))(((html.match(/<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/) ?? [])[1] ?? ''));
  const worksPg = cur(read('works/index.html')), workPg = cur(workPages[0][1]), contact = cur(read('contact/index.html')), homePg = cur(home);
  const ok = worksPg === 'page,-,-,-' && workPg === 'true,-,-,-' && contact === '-,-,-,page' && homePg === '-,-,-,-';
  return { ok, detail: `works ${worksPg} · a work ${workPg} · contact ${contact} · home ${homePg}` };
});

check('I-02', 'every work is reachable, once, from the catalogue', () => {
  const avail = artJson.works.filter((w) => !w.sold).map((w) => w.slug).sort();
  const sold = artJson.works.filter((w) => w.sold).map((w) => w.slug).sort();
  const listed = (html) => [...html.matchAll(/<div class="tombstone" data-work="([a-z0-9-]+)"/g)].map((m) => m[1]).sort();
  const worksOk = listed(read('works/index.html')).join() === avail.join();
  const soldOk = listed(read('works/sold/index.html')).join() === sold.join();
  const seriesOk = seriesItems.every((x) => listed(read(`works/series/${x.id}/index.html`)).join() ===
    artJson.works.filter((w) => !w.sold && w.section === x.id).map((w) => w.slug).sort().join());
  return { ok: worksOk && soldOk && seriesOk, detail: `works page ${worksOk}, each series page ${seriesOk}, sold page ${soldOk}` };
});

check('I-02', 'the homepage shows a selection and says how many there are', () => {
  const latest = (home.match(/id="latest">([\s\S]*?)<\/section>/) ?? [])[1] ?? '';
  const n = [...latest.matchAll(/class="tombstone"/g)].length;
  const avail = artJson.works.filter((w) => !w.sold).length;
  const more = new RegExp(`href="${B}/works/">[^<]*\\(${avail}\\)<`).test(latest);
  const cards = [...home.matchAll(/<li class="series-card">/g)].length;
  return { ok: n > 0 && n <= 4 && more && cards === seriesItems.length,
           detail: `${n} latest works (at most 4), link to all ${avail} ${more}, ${cards} series cards for ${seriesItems.length} series` };
});

check('I-03', 'a new series needs data only: a page, a tab and a card each', () => {
  const missing = [];
  for (const x of seriesItems) {
    for (const [, p] of byLoc(`/works/series/${x.id}/`)) if (!existsSync(join(DIST, p, 'index.html'))) missing.push(p);
    if (!new RegExp(`class="localnav"[\\s\\S]*?href="${B}/works/series/${x.id}/"`).test(read('works/index.html'))) missing.push(`tab ${x.id}`);
    if (!new RegExp(`series-card__link" href="${B}/works/series/${x.id}/"`).test(home)) missing.push(`card ${x.id}`);
  }
  const build = src('build.js');
  const noHardcoded = !/section === 'tribute'|section === 'originals'/.test(build);
  return { ok: !missing.length && noHardcoded, detail: missing.length ? missing.join(', ') : `${seriesItems.length} series, all generated; no series id hard-coded in build.js ${noHardcoded}` };
});

check('I-04', 'deeper pages carry a breadcrumb whose last step is the page itself', () => {
  const bad = [];
  const pagesWithCrumb = [...workPages, ['/works/sold/', archive], ...seriesItems.map((x) => [`/works/series/${x.id}/`, read(`works/series/${x.id}/index.html`)])];
  for (const [p, html] of pagesWithCrumb) {
    const crumb = (html.match(/<nav class="breadcrumb"[^>]*>([\s\S]*?)<\/nav>/) ?? [])[1];
    if (!crumb) { bad.push(`${p}: none`); continue; }
    const items = [...crumb.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    if (!/aria-current="page"/.test(items.at(-1)) || /<a /.test(items.at(-1))) bad.push(`${p}: last step is a link`);
    if (!/"@type":"BreadcrumbList"/.test(html)) bad.push(`${p}: no BreadcrumbList data`);
  }
  // a work's trail runs through its own series
  const w = artJson.works[0];
  const trail = new RegExp(`href="${B}/works/series/${w.section}/"`).test(read(`works/${w.slug}/index.html`).match(/<nav class="breadcrumb"[\s\S]*?<\/nav>/)?.[0] ?? '');
  const shallow = !/class="breadcrumb"/.test(read('works/index.html')) && !/class="breadcrumb"/.test(home);
  return { ok: !bad.length && trail && shallow, detail: bad.length ? bad.slice(0, 3).join('; ') : `${pagesWithCrumb.length} pages; a work's trail runs through its series ${trail}; none on top-level pages ${shallow}` };
});

check('I-05', 'the old address of sold works still arrives', () => {
  const stub = readFileSync(join(DIST, 'archive/index.html'), 'utf8');
  const refresh = new RegExp(`http-equiv="refresh" content="0; url=${B}/works/sold/"`).test(stub);
  const canonical = /rel="canonical" href="[^"]*\/works\/sold\/"/.test(stub);
  const r = existsSync(join(DIST, '_redirects')) ? readFileSync(join(DIST, '_redirects'), 'utf8') : '';
  const cf = new RegExp(`^${B}/archive/ ${B}/works/sold/ 301$`, 'm').test(r) && new RegExp(`^${B}/zh/archive/ ${B}/zh/works/sold/ 301$`, 'm').test(r);
  const sitemap = read('sitemap.xml');
  const moved = !/\/archive\//.test(sitemap) && /\/works\/sold\//.test(sitemap);
  return { ok: refresh && canonical && cf && moved, detail: `stub refresh ${refresh}, canonical ${canonical}, Cloudflare 301s ${cf}, sitemap moved ${moved}` };
});

check('I-06', 'no sidebar: local navigation is one horizontal row, within its threshold', () => {
  // Every navigation region must be one of the known horizontal ones. An
  // <aside> of related content (the buy box beside a painting) is not a
  // sidebar; navigation placed in a side column is.
  const KNOWN = /^(nav|localnav|breadcrumb|pager)$/;
  const asides = [];
  for (const [p, h] of allHtml) {
    for (const m of h.matchAll(/<nav class="([a-z-]+)"/g)) if (!KNOWN.test(m[1])) asides.push(`${p} nav.${m[1]}`);
    if (/<aside[^>]*>(?:(?!<\/aside>)[\s\S])*<nav\b/.test(h)) asides.push(`${p} navigation inside an aside`);
  }
  const tabs = [...read('works/index.html').matchAll(/<nav class="localnav"[\s\S]*?<\/nav>/g)][0]?.[0].match(/<li>/g)?.length ?? 0;
  // Baymard: a horizontal row of filter types works to 6-8. Past 8 tabs the
  // report's growth rule moves the Works navigation into a sidebar on desktop.
  return { ok: !asides.length && tabs > 0 && tabs <= 8, detail: asides.length ? asides.slice(0, 3).join('; ') : `every navigation region is a known horizontal one; ${tabs} tabs (threshold 8)` };
});

/* ===================== J — placeholders you can see ===================== */
/* 17 September 2026: every NEEDS-INPUT still on a page is flagged in red, and
   the flag goes when the field is filled — because the build wraps the
   placeholder word itself, never a field that has content. */

check('J-01', 'every visible NEEDS-INPUT is flagged, and nothing else is', () => {
  let flagged = 0, unflagged = 0, broken = 0, wrongPlace = 0;
  const pages = [...allHtml, ['/404.html', read('404.html')]];
  for (const [, html] of pages) {
    const parts = html.split(/(<[^>]*>)/);
    let skip = null;
    parts.forEach((part, i) => {
      if (part.startsWith('<')) {
        const m = part.match(/^<(\/?)(title|script|style|textarea)\b/i);
        if (m) skip = m[1] ? null : m[2].toLowerCase();
        if (/="[^"]*<mark/.test(part)) broken++;          // a mark inside an attribute
        return;
      }
      if (!part.includes('NEEDS-INPUT')) return;
      if (skip) { if (/needs-input/.test(parts[i - 1] ?? '')) wrongPlace++; return; }
      if (part === 'NEEDS-INPUT' && parts[i - 1] === '<mark class="needs-input">' && parts[i + 1] === '</mark>') flagged++;
      else unflagged++;
    });
  }
  // and a mark is only ever around the placeholder word
  const stray = pages.filter(([, h]) => /<mark class="needs-input">(?!NEEDS-INPUT<\/mark>)/.test(h)).length;
  return { ok: (RELEASE || flagged > 0) && !unflagged && !broken && !wrongPlace && !stray,
           detail: `${flagged} flagged, ${unflagged} unflagged, ${broken} inside attributes, ${wrongPlace} in title/script, ${stray} pages with a stray mark` };
});

/* ===================== L — the walls and the mat ===================== */
/* 20 September 2026. Three decisions, taken together because they are one
   decision about material: the walls are sage and untextured, cream is the mat
   and nothing else, and the one page that is only prose is set as a book page.
   Report, "The walls, the mat, and a book page". */

check('L-01', 'cream paints the mat, the art, and the bar — and no page surface', () => {
  // The rule in one line: --paper and --paper-deep may back an ARTWORK or sit
  // on the dark bar as a light indicator. They may not paint a ground anyone
  // reads on. Anything new that paints cream has to be named here, which is
  // the point: the list is short and adding to it is a decision.
  const sheets = (src('src/styles/base.css') + src('src/styles/gallery.css'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const allowed = new Set([
    'img',                                  // holds an image box before its bytes arrive
    '.work__img',                           // the painting itself
    '.work__img, .hero__work img',          // the mat
    '.work__video',                         // the same mat, around the video
    '.gallery__thumb',                      // a thumbnail of a work
    '.scale__work',                         // the work in the scale diagram
    '.nav a[aria-current]',                 // on the bar
    '.nav a[aria-current]::after',          // on the bar
    '.lang-rule',                           // on the bar
    '.shopbar__count',                      // on the bar
    ':focus-visible',                       // the halo, which must beat a dark painting
    '.btn', '.skip-link',                   // light label on a filled dark control
    '.hero__work img',                      // the featured painting's own box
    '.shopbar__link:hover, .social__link:hover, .lang-switch:hover', // 12% wash, on the bar
  ]);
  const bad = [];
  for (const m of sheets.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    const paints = [...m[2].matchAll(/(?:^|[;\s])(?:background(?:-color)?|box-shadow):[^;]*var\(--(paper(?:-deep)?)\)/g)];
    if (!paints.length) continue;
    if (!allowed.has(sel)) bad.push(`${sel} paints --${paints[0][1]}`);
  }
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : `cream is painted by ${allowed.size} named rules, all art, bar or focus` };
});

check('L-02', 'every reading ground is the field\'s own hue, held light enough to read', () => {
  // The finding the grounds were moved on: a reading ground fails on
  // LIGHTNESS, not on hue or chroma. So the three of them must be the field's
  // hue (identity) and must stay above the lightness where --muted-ui's 3.0:1
  // goes — which is L* 91.5. check-contrast.mjs solves the ratios themselves.
  const T = Object.fromEntries([...src('src/styles/tokens.css')
    .matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1], m[2]]));
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const ok2 = (h) => {
    const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i + 1, i + 3), 16)));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return [L * 100, (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
  };
  const [, fieldHue] = ok2(T['field']);
  const bad = [];
  const rows = ['wash-pale', 'wash-mid', 'wash-deep', 'wash-lift'].map((k) => {
    const [L, H] = ok2(T[k]);
    if (Math.abs(H - fieldHue) > 2) bad.push(`--${k} is at ${H.toFixed(1)}°, the field is at ${fieldHue.toFixed(1)}°`);
    if (L < 91.5) bad.push(`--${k} is L* ${L.toFixed(1)}, under the 91.5 where --muted-ui fails`);
    return `--${k} L* ${L.toFixed(1)}`;
  });
  // and the ladder must actually be a ladder, or the sections do not separate
  const ordered = /--wash-pale[\s\S]*--wash-mid[\s\S]*--wash-deep/.test(src('src/styles/tokens.css'));
  return { ok: !bad.length && ordered,
           detail: bad.length ? bad.join('; ') : `${rows.join(', ')}, all at ${fieldHue.toFixed(1)}° — the field's own hue` };
});

check('L-03', 'the italic is a real file, and nothing is slanted by the browser', () => {
  const base = src('src/styles/base.css');
  const face = /@font-face\{[^}]*fraunces-italic-latin\.woff2[^}]*font-style:italic[^}]*\}/.test(base.replace(/\s+/g, ''))
    || /fraunces-italic-latin\.woff2/.test(base) && /font-style:italic/.test(base);
  const shipped = exists('fonts/fraunces-italic-latin.woff2');
  const noSynth = /font-synthesis-style:\s*none/.test(base);
  // every italic the site sets must be in a family that has one
  const sheets = (base + src('src/styles/gallery.css')).replace(/\/\*[\s\S]*?\*\//g, '');
  const italics = [...sheets.matchAll(/([^{}]+)\{([^{}]*font-style:italic[^{}]*)\}/g)]
    .map((m) => m[1].trim()).filter((sel) => !/@font-face/.test(sel));
  return { ok: face && shipped && noSynth,
           detail: `face declared ${face}, file shipped ${shipped}, synthesis off ${noSynth}, ${italics.length} rules set italic: ${italics.join(' · ')}` };
});

check('L-04', 'About is set as a book page, in both languages', () => {
  const en = read('about/index.html'), zh = read('zh/about/index.html');
  const css = src('src/styles/gallery.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const bad = [];
  if (!/<section class="page page--about wrap">/.test(en)) bad.push('the English page is not marked page--about');
  if (!/<section class="page page--about wrap">/.test(zh)) bad.push('the Chinese page is not marked page--about');
  // the serif, at the size measured to match the sans it replaces
  if (!/\.page--about \.prose\{[^}]*font-family:var\(--font-display\)[^}]*font-size:var\(--size-read\)/.test(css.replace(/\s+/g, ' ').replace(/ \{/g, '{')))
    bad.push('the prose is not set in the display face at --size-read');
  // the drop cap is English-only and degrades where initial-letter is absent
  if (!/@supports \(initial-letter:3\)/.test(css)) bad.push('the drop cap is not behind an @supports test');
  if (!/html\[lang="en"\] \.page--about[^{]*::first-letter/.test(css)) bad.push('the drop cap is not scoped to English');
  // the Chinese page gets a system serif, not the subset display stack
  if (!/html\[lang\^="zh"\] \.page--about \.prose\{[^}]*--font-read-cjk/.test(css.replace(/\s+/g, ' ').replace(/ \{/g, '{')))
    bad.push('the Chinese page is not set in --font-read-cjk');
  // The quotation is marked for the italic in English and left alone in
  // Chinese. Conditional on the copy still ending a paragraph with one: this
  // is Priscilla's text to change, and an assertion that fails because she
  // rewrote a paragraph would be a check holding the content hostage.
  const about = JSON.parse(src('src/data/site.json')).about.paragraphs;
  const hasQuote = (arr) => arr.some((x) => /\u201C[^\u201C\u201D]+\u201D\s*$/.test(x));
  if (hasQuote(about.en) && !/<em class="quoted">/.test(en))
    bad.push('a paragraph ends in a quotation and it is not marked for the italic');
  if (/<em class="quoted">/.test(zh)) bad.push('the Chinese quotation is marked — there is no CJK italic to set it in');
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : 'serif at --size-read, lede, drop cap (English, @supports), system serif for Chinese, quotation in the real italic' };
});

check('L-05', 'every surface that is read goes through a plate token', () => {
  // 20 September 2026, the plates. The sheet, the three section grounds, the
  // four bands and the lightbox backdrop are the surfaces a reader reads on,
  // and all of them are currently transparent — the sage field, straight
  // through. What this check holds is not the value but the INDIRECTION: no
  // rule may name a wash directly, so the plates can be repainted, one at a
  // time or all at once, from tokens.css and nowhere else. A wash hardcoded
  // into a rule is how a surface ends up unreachable from the switch.
  // Comments stripped from the token file too: the plates block documents how
  // to restore each one by writing the declaration out, semicolon and all, so a
  // reader that keeps comments would find those instructions and call the
  // plates declared even if the real declarations were deleted.
  const tokens = src('src/styles/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const sheets = (src('src/styles/base.css') + src('src/styles/gallery.css'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const flatS = sheets.replace(/\s+/g, '');
  const bad = [];

  const group = ['plate-sheet', 'plate-pale', 'plate-mid', 'plate-deep', 'plate-lightbox'];
  for (const t of group) {
    if (!new RegExp(`--${t}:\\s*[^;]+;`).test(tokens)) bad.push(`--${t} is not declared in tokens.css`);
  }
  // the rules that must go through one
  const painted = {
    '.sheet': /\.sheet\{[^}]*background:var\(--plate-sheet\)/,
    '.ground--pale': /\.ground--pale\{background:var\(--plate-pale\)\}/,
    '.ground--mid': /\.ground--mid\{background:var\(--plate-mid\)\}/,
    '.ground--deep': /\.ground--deep\{background:var\(--plate-deep\)\}/,
    'dialog.lightbox::backdrop': /var\(--plate-lightbox\)/,
  };
  for (const [sel, re] of Object.entries(painted)) {
    if (!re.test(flatS)) bad.push(`${sel} does not paint its plate token`);
  }
  // …and no rule anywhere may paint a wash itself
  for (const m of sheets.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const hits = [...m[2].matchAll(/(?:^|[;\s])background(?:-color|-image)?:[^;]*var\(--(wash-[a-z]+)\)/g)];
    if (hits.length) bad.push(`${m[1].trim().replace(/\s+/g, ' ')} paints --${hits[0][1]} directly`);
  }
  return { ok: !bad.length,
           detail: bad.length ? bad.join('; ')
             : `${group.length} plates, all named in tokens.css; ${Object.keys(painted).length} read surfaces, none naming a wash` };
});

check('L-06', 'every literal copy of the wall colour is still the wall colour', () => {
  /* --field is written out in full in two places that cannot use var(): the
     lightbox backdrop's fallback for engines without color-mix(), and the
     installed app's splash ground in the web manifest, which is JSON. Both
     were correct on the day they were written and both would have gone quietly
     wrong when the wall was re-solved on 20 September 2026 — a lightbox in the
     old sage over a page in the new one, and a splash screen that does not
     match the page it opens. So they are solved against the token. */
  const field = token('field');
  const rgb = [0, 2, 4].map((i) => parseInt(field.slice(i + 1, i + 3), 16));
  const bad = [];

  const g = src('src/styles/gallery.css');
  const m = g.match(/dialog\.lightbox::backdrop\{ background:rgba\((\d+),(\d+),(\d+),\.94\) \}/);
  if (!m) bad.push('no rgba() fallback for the lightbox backdrop');
  else if (m.slice(1, 4).map(Number).join(',') !== rgb.join(',')) {
    bad.push(`the lightbox fallback is rgba(${m.slice(1, 4).join(',')}) and --field is ${field} = rgb(${rgb.join(',')})`);
  }

  const manifest = JSON.parse(read('site.webmanifest'));
  if ((manifest.background_color ?? '').toUpperCase() !== field.toUpperCase()) {
    bad.push(`the manifest's background_color is ${manifest.background_color}, --field is ${field}`);
  }
  return { ok: !bad.length,
           detail: bad.length ? bad.join('; ') : `2 literal copies, both ${field}` };
});

/* ===================== K — readiness ===================== */
/* 17 September 2026 (report, "Readiness"): the site can only go live once
   every critical detail is supplied. These hold the build's half of that; the
   rules themselves are tested in scripts/test-readiness.mjs. */

const readinessJson = JSON.parse(read('readiness.json'));

check('K-01', 'a build that is not a release says so on every page', () => {
  const pages = [...allHtml, ['/404.html', read('404.html')]];
  if (readinessJson.mode === 'release') return { ok: true, detail: 'release build — covered by check-links' };
  const bad = pages.filter(([, h]) => !/class="readiness-ribbon"/.test(h) || !/name="robots" content="noindex/.test(h)).map(([p]) => p);
  const n = readinessJson.blockers;
  const counted = readinessJson.ready || new RegExp(`\\b${n}\\b`).test(home.match(/class="readiness-ribbon"[^>]*>([^<]*)/)?.[1] ?? '');
  return { ok: !bad.length && counted, detail: bad.length ? bad.slice(0, 3).join(' ') : `${pages.length} pages marked preview and noindex; the ribbon states ${n} blockers ${counted}` };
});

check('K-02', 'while the gate is closed, nothing can be bought', () => {
  if (readinessJson.ready) return { ok: true, detail: 'gate open' };
  const live = allHtml.flatMap(([p, h]) => [...h.matchAll(/<a class="btn"(?![^>]*aria-disabled)[^>]*href=/g)].map(() => p));
  const inert = allHtml.reduce((n, [, h]) => n + [...h.matchAll(/<a class="btn" aria-disabled="true"[^>]*data-inert-href="[^"]+"/g)].length, 0);
  return { ok: !live.length && inert > 0, detail: live.length ? `usable on ${[...new Set(live)].slice(0, 3).join(' ')}` : `${inert} purchase controls inert, none usable` };
});

check('K-03', 'a release is refused while blocked — and leaves the last site untouched', () => {
  if (readinessJson.ready) return { ok: true, detail: 'gate open; nothing to refuse' };
  const stamp = statSync(join(DIST, 'index.html')).mtimeMs;
  const r = spawnSync(process.execPath, [join(ROOT, 'build.js')], { env: { ...process.env, RELEASE: '1' }, encoding: 'utf8' });
  const untouched = statSync(join(DIST, 'index.html')).mtimeMs === stamp && JSON.parse(read('readiness.json')).mode === 'preview';
  return { ok: r.status === 1 && /RELEASE REFUSED/.test(r.stderr) && untouched,
           detail: `exit ${r.status}, refused ${/RELEASE REFUSED/.test(r.stderr)}, dist untouched ${untouched}` };
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

check('TOOL', 'the image tool still converts exactly, both directions', () => {
  // scripts/image.py promises that pixel mode keeps every decoded pixel. A
  // promise nobody re-tests is a promise that quietly stops being true, so its
  // own selftest runs here: two fixtures, both directions, byte-exact when the
  // source is opaque and within one unit per channel when it is not — which is
  // renderer premultiplication and is the only slack it is given.
  const r = spawnSync('python3', [join(ROOT, 'scripts/image.py'), 'selftest'], { encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const missing = out.match(/No module named '(\w+)'/);
  if (missing) {
    return { ok: false,
             detail: `${missing[1]} is not installed — pip install pillow numpy cairosvg` };
  }
  const pass = r.status === 0 && /selftest: pass/.test(out);
  const cases = (out.match(/max \d+ \(allowed \d\)/g) ?? []).length;
  const containers = (out.match(/\.\w+\s+container:/g) ?? []).length;
  return { ok: pass && containers >= 5,
           detail: pass ? `${cases} round-trips within tolerance, ${containers} vector containers written`
                        : out.trim().split('\n').pop() };
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
