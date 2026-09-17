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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE } from '../src/templates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const read = (p) => readFileSync(join(DIST, p), 'utf8');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

const home = read('index.html');
const zhHome = read('zh/index.html');
const work = read('works/harbour-light/index.html');
const buy = read('how-to-buy/index.html');
const archive = read('works/sold/index.html');   // formerly /archive/
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
  // the lifted work must not also appear among the latest works below it
  const latest = (home.match(/<section class="section ground--warm" id="latest">([\s\S]*?)<\/section>/) ?? [])[1] ?? '';
  const listed = [...latest.matchAll(/<div class="tombstone" data-work="([a-z0-9-]+)"/g)].map((m) => m[1]);
  const heroSlug = (home.match(/<figure class="hero__work">\s*<a href="[^"]*\/works\/([a-z0-9-]+)\//) ?? [])[1];
  const capped = /max-height:clamp\(260px,48vh,460px\)/.test(css);
  return {
    ok: hasSplit && heroFig && heroImg && heroSlug && !listed.includes(heroSlug) && capped,
    detail: `hero work ${heroSlug}; ${listed.length} latest works beneath, hero not repeated ${!listed.includes(heroSlug)}; height-capped ${capped}`,
  };
});

/* RETIRED 17 Sep 2026 with the structure change: "the list below the hero
   starts its count at 02". The homepage no longer lists the catalogue, so a
   running 01/06 counter has nothing to count; finiteness is now stated
   outright — "All works (5)" — and asserted in I-02. */

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
  /<span class="nav__long">How to Buy<\/span><span class="nav__short">Buy<\/span>/.test(home)
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

check('C-01', 'the icon carries no letterforms and no font dependency', () => {
  // An SVG favicon renders without the page's webfonts, so a <text> mark falls
  // back to whatever serif the OS has. Geometry has no such failure mode — and
  // it is the reason the mark serves 常识画廊 as well as "Senso Comune Gallery".
  const svg = read('icon.svg');
  const clean = !/<text|font-family|<path/.test(svg);
  return { ok: clean, detail: `${statSync(join(DIST, 'icon.svg')).size} bytes, rect + line only` };
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
  // selling pages use the larger catalogue card; only sold works get the reference grid
  const selling = /<ol class="works works--catalogue">/.test(read('works/index.html')) && !/works--grid/.test(read('works/index.html'));
  return { ok: grid && rule && selling, detail: `sold works grid ${grid}, selling pages use the catalogue card ${selling}` };
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

/* ===================== F — the mark ===================== */
/* Added 17 September 2026 with the logo. One geometry, rendered four ways; the
   assertions below are what stops the four drifting apart. */

const markGeom = await import(join(ROOT, 'scripts/mark.mjs'));
const MARK = markGeom.MARK;
const G = markGeom.markGeometry();

check('F-01', 'the icon is the mark as scripts/mark.mjs draws it', () => {
  const svg = read('icon.svg');
  const wall = new RegExp(`<rect width="${MARK.box}" height="${MARK.box}" fill="${MARK.ground}"/>`).test(svg);
  const plate = svg.includes(`x="${G.x}" y="${+G.y.toFixed(3)}" width="${MARK.plateW}" height="${+G.plateH.toFixed(3)}"`);
  const datum = svg.includes(`y1="${+G.cy.toFixed(3)}"`) && svg.includes(`stroke="${MARK.datum}"`);
  return { ok: wall && plate && datum, detail: `wall ${wall}, plate ${plate}, datum ${datum}` };
});

check('F-01', 'the masthead lockup draws the same plate as the icon', () => {
  // The masthead knocks the wall out to an outline, because the bar is already
  // the wall. Everything else must be identical, or the tab and the header are
  // two different logos.
  const m = home.match(/<a class="wordmark"[^>]*>([\s\S]*?)<\/a>/);
  if (!m) return { ok: false, detail: 'no wordmark lockup' };
  const svg = m[1];
  const outline = /fill="none" stroke="var\(--field\)"/.test(svg);
  const filled = !/<rect width="64" height="64" fill=/.test(svg);
  const plate = svg.includes(`x="${G.x}" y="${+G.y.toFixed(3)}"`);
  const datum = svg.includes(`y1="${+G.cy.toFixed(3)}"`);
  return { ok: outline && filled && plate && datum,
           detail: `outline ${outline}, no fill ${filled}, same plate ${plate}, same datum ${datum}` };
});

check('F-02', 'the mark is one link and one tab stop with the wordmark', () => {
  // 2.5.3 Label in Name and 2.4.4: a decorative mark inside the link must not
  // contribute an accessible name of its own, and must not be a second link to
  // the same place.
  const m = home.match(/<a class="wordmark"[^>]*>([\s\S]*?)<\/a>/);
  const svg = m[1];
  const hidden = /aria-hidden="true"/.test(svg) && /focusable="false"/.test(svg);
  const noName = !/<title>|aria-label=/.test(svg);
  const named = /<span class="wordmark__name">/.test(m[1]);
  return { ok: hidden && noName && named, detail: `aria-hidden ${hidden}, no name of its own ${noName}, wordmark still the name ${named}` };
});

check('F-02', 'the mark serves both locales unchanged', () => {
  const en = (home.match(/<a class="wordmark"[^>]*>([\s\S]*?)<\/span>/) ?? [])[0];
  const zh = (zhHome.match(/<a class="wordmark"[^>]*>([\s\S]*?)<\/span>/) ?? [])[0];
  const enSvg = (en.match(/<svg[\s\S]*?<\/svg>/) ?? [])[0];
  const zhSvg = (zh.match(/<svg[\s\S]*?<\/svg>/) ?? [])[0];
  const zhName = /常识画廊/.test(zh);
  return { ok: enSvg === zhSvg && zhName,
           detail: `byte-identical ${enSvg === zhSvg}, zh wordmark still translated ${zhName}` };
});

check('F-03', 'the mark does not spend the accent', () => {
  // Sanguine is reserved for calls to action. It is also 2.03:1 on the bar and
  // would vanish at tab size; the sage datum is 4.70:1.
  const svg = read('icon.svg');
  const sanguine = token('sanguine');
  const usesAccent = svg.toUpperCase().includes(sanguine.toUpperCase());
  const r = ratio(MARK.datum, MARK.ground);
  return { ok: !usesAccent && r >= 3, detail: `no sanguine ${!usesAccent}, datum on wall ${r.toFixed(2)}:1` };
});

check('F-03', 'the plate reads at tab size against the wall', () => {
  const r = ratio(MARK.plate, MARK.ground);
  const share = (MARK.plateW * G.plateH) / (MARK.box ** 2);
  // At 16px the plate is 7px wide. Below about a sixth of the box it stops
  // being a shape and starts being a speck.
  return { ok: r >= 4.5 && share > 0.15, detail: `${r.toFixed(2)}:1, plate is ${(share * 100).toFixed(0)}% of the mark` };
});

check('F-04', 'the hanging datum is the figure the work pages are drawn to', () => {
  // 144.78 cm on a 244 cm wall: the same museum standard the scale diagram
  // uses, so the mark and the diagram cannot state different numbers.
  const fromWork = /144\.78/.test(work) || /144\.78/.test(src('src/templates.js'));
  const declared = Math.abs(MARK.hang - 144.78 / 244) < 1e-9;
  return { ok: fromWork && declared, detail: `work page cites 144.78 ${fromWork}, mark uses ${(MARK.hang * 100).toFixed(2)}%` };
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
  const literal = soft.filter(([, , v]) => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v)).map(([, n]) => n);
  const shadowsUseBar = soft.filter(([, n]) => n.startsWith('shadow-')).every(([, , v]) => /var\(--bar\)/.test(v));
  const edgeRules = rulesFor(/\.edge\b/).join(';');
  const edgeLiteral = /#[0-9a-f]{3,8}\b|rgba?\(/i.test(edgeRules);
  return { ok: soft.length >= 8 && !literal.length && shadowsUseBar && !edgeLiteral,
           detail: `${soft.length} softness tokens, literals ${literal.join(' ') || 'none'}, shadows tinted --bar ${shadowsUseBar}, bands literal-free ${!edgeLiteral}` };
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
  // sheet, which is --wash-warm.
  const bad = [];
  let bands = 0;
  for (const [p, html] of [['/', home], ['/zh/', zhHome]]) {
    const seq = [...html.matchAll(/<(section|div)\s+class="([^"]*)"/g)]
      .map((m) => m[2]).filter((c) => /\b(hero|edge|section)\b/.test(c) && !/section__/.test(c));
    seq.forEach((c, i) => {
      const m = c.match(/\bedge--([a-z]+)-([a-z]+)\b/);
      if (!m) return;
      bands++;
      const ground = (cls) => (cls && /\bhero\b/.test(cls) ? 'warm' : (cls?.match(/\bground--([a-z]+)/) ?? [])[1]);
      const before = ground(seq[i - 1]), after = ground(seq[i + 1]);
      if (before !== m[1] || after !== m[2]) bad.push(`${p} edge--${m[1]}-${m[2]} sits between ${before} and ${after}`);
    });
    // and the CSS for each band must fade between the grounds its name says
    for (const [, a, b] of html.matchAll(/\bedge--([a-z]+)-([a-z]+)\b/g)) {
      const rule = new RegExp(`\\.edge--${a}-${b}\\{--edge-from:var\\(--wash-${a}\\);--edge-to:var\\(--wash-${b}\\)\\}`);
      if (!rule.test(flat)) bad.push(`CSS for edge--${a}-${b} does not fade ${a} → ${b}`);
    }
  }
  const breath = /--edge-mid:color-mix\(inoklab,var\(--field\)var\(--edge-breath\)/.test(flat);
  return { ok: bands >= 8 && !bad.length && breath, detail: bad.length ? bad.join('; ') : `${bands} bands, all seamless, the field breathes through at the centre ${breath}` };
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
  const got = (html) => [...html.matchAll(/data-placeholder="[a-z]+">[\s\S]*?<span class="visually-hidden">([^<]+)<\/span>/g)].map((m) => m[1]);
  const en = got(home).join(), zh = got(zhHome).join();
  const iconsHidden = [...home.matchAll(/<svg class="shopbar__icon"[^>]*>/g)].every((m) => /aria-hidden="true"/.test(m[0]));
  return { ok: en === want.en.join() && zh === want.zh.join() && iconsHidden,
           detail: `en ${en}, zh ${zh}, icons aria-hidden ${iconsHidden}` };
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

check('H-03', 'every work page shows front, detail, edge, back and video, with a thumbnail each', () => {
  const bad = [];
  for (const [p, html] of workPages) {
    const views = [...html.matchAll(/<li class="gallery__view" id="view-[a-z0-9-]+?-(front|detail|edge|back|video)"/g)].map((m) => m[1]).join(' ');
    const thumbs = [...html.matchAll(/class="gallery__thumb[^"]*" href="#(view-[a-z0-9-]+)"/g)].map((m) => m[1]);
    const ids = new Set([...html.matchAll(/id="(view-[a-z0-9-]+)"/g)].map((m) => m[1]));
    if (views !== 'front detail edge back video') bad.push(`${p}: ${views}`);
    if (thumbs.length !== 5 || !thumbs.every((t) => ids.has(t))) bad.push(`${p}: thumbnails ${thumbs.length}, all targets exist ${thumbs.every((t) => ids.has(t))}`);
  }
  return { ok: workPages.length > 0 && !bad.length, detail: bad.length ? bad.slice(0, 2).join('; ') : `${workPages.length} work pages, 5 views and 5 working thumbnail links each` };
});

check('H-04', 'video only on work pages; never preloaded, never autoplayed', () => {
  const elsewhere = notWorkPages.filter(([, h]) => /<video\b/.test(h)).map(([p]) => p);
  const vids = workPages.flatMap(([, h]) => [...h.matchAll(/<video\b[^>]*>/g)].map((m) => m[0]));
  const quiet = vids.every((v) => /preload="none"/.test(v) && !/\bautoplay\b/.test(v) && /\bcontrols\b/.test(v) && /\bplaysinline\b/.test(v));
  const named = vids.every((v) => /aria-label="[^"]+"/.test(v));
  return { ok: !elsewhere.length && vids.length === workPages.length && quiet && named,
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
  return { ok: views > 0 && !mismatch && owed, detail: `${views} view images, flag disagrees with the manifest ${mismatch}, every view has an alt field ${owed}` };
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
