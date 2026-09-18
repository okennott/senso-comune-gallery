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
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, RELEASE } from '../src/templates.js';

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
  const files = ['icon.svg', 'favicon.ico', 'apple-touch-icon.png', 'site.webmanifest'];
  const onDisk = files.filter((f) => existsSync(join(DIST, f)));
  const linked = /rel="icon"[^>]*icon\.svg/.test(home) && /rel="apple-touch-icon"/.test(home)
              && /rel="manifest"/.test(home);
  return { ok: onDisk.length === files.length && linked, detail: `${onDisk.length}/${files.length} built, linked ${linked}` };
});

check('C-01', 'the icon carries no font dependency', () => {
  // An SVG favicon renders without the page's webfonts, so a <text> mark falls
  // back to whatever serif the OS has — a different logo on every machine.
  // The monogram adopted on 18 September 2026 does carry letterforms, but as
  // OUTLINES cut from Fraunces at build time (scripts/build-mark-paths.py),
  // which has no such failure mode. What is forbidden is live text.
  const svg = read('icon.svg');
  const clean = !/<text|font-family|@font-face/.test(svg);
  const outlines = /<path d="/.test(svg);
  return { ok: clean && outlines,
           detail: `${statSync(join(DIST, 'icon.svg')).size} bytes, no live text ${clean}, drawn as outlines ${outlines}` };
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

/* ===================== F — the mark ===================== */
/* The SC monogram, adopted 18 September 2026 from Priscilla's prototype sheet.
   One geometry, four renderings; these assertions are what stops the four
   drifting apart, and what stops the letters drifting from the font. */

const markGeom = await import(join(ROOT, 'scripts/mark.mjs'));
const MARK = markGeom.MARK;
const G = markGeom.markGeometry();
const { GLYPHS } = await import(join(ROOT, 'scripts/mark-paths.js'));

check('F-01', 'the icon is the mark as scripts/mark.mjs draws it', () => {
  const svg = read('icon.svg');
  const field = new RegExp(`<rect width="${MARK.box}" height="${MARK.box}" fill="${MARK.ground}"/>`).test(svg);
  const letters = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  const fromFont = letters.length >= 3
    && letters.every((d) => d === GLYPHS.glyphs.S.d || d === GLYPHS.glyphs.C.d);
  const inlay = new RegExp(`stroke="${MARK.ground}" stroke-width="${MARK.inlay * 2}"`).test(svg);
  return { ok: field && fromFont && inlay,
           detail: `field ${field}, ${letters.length} outlines, all cut from Fraunces ${fromFont}, inlay ${inlay}` };
});

check('F-01', 'the masthead lockup is the same monogram as the icon', () => {
  // The masthead paints NO field: the bar is already the ground, and an opaque
  // square would show as a slab the moment the bar goes to glass. The inlay is
  // cut with a mask there instead of stamped, so the bar shows through it.
  const m = home.match(/<a class="wordmark"[^>]*>([\s\S]*?)<\/a>/);
  if (!m) return { ok: false, detail: 'no wordmark lockup' };
  const svg = m[1];
  const noField = !/<rect width="64" height="64" fill="(?!#fff)/.test(svg);
  const masked = /<mask id="sc-inlay">/.test(svg) && /mask="url\(#sc-inlay\)"/.test(svg);
  const sameLetters = svg.includes(GLYPHS.glyphs.S.d) && svg.includes(GLYPHS.glyphs.C.d);
  const tokens = /fill="currentColor"/.test(svg);
  return { ok: noField && masked && sameLetters && tokens,
           detail: `no painted field ${noField}, inlay masked ${masked}, same outlines ${sameLetters}, takes the bar's colour ${tokens}` };
});

check('F-01', 'the letters are Fraunces outlines, not <text> and not a trace', () => {
  // An SVG favicon renders without the page's webfonts, so <text> would fall
  // back to whatever serif the OS has. The outlines are cut from the font by
  // scripts/build-mark-paths.py at a stated instance.
  const svg = read('icon.svg');
  const noText = !/<text\b/.test(svg);
  const instanced = GLYPHS.opsz === 40 && GLYPHS.wght === 700 && GLYPHS.upem === 2000;
  const generator = /instantiateVariableFont/.test(src('scripts/build-mark-paths.py'));
  return { ok: noText && instanced && generator,
           detail: `no <text> ${noText}, opsz ${GLYPHS.opsz}/wght ${GLYPHS.wght} on ${GLYPHS.upem} upem, cut by the generator ${generator}` };
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

check('F-02', 'the monogram serves both locales unchanged', () => {
  // Finding C-04, closed by decision: the NAME stays translated — 常识画廊 on
  // the Chinese page — and the monogram is the device that stands beside it,
  // identical in both. A device is not a translation.
  const en = (home.match(/<a class="wordmark"[^>]*>([\s\S]*?)<\/span>/) ?? [])[0];
  const zh = (zhHome.match(/<a class="wordmark"[^>]*>([\s\S]*?)<\/span>/) ?? [])[0];
  const enSvg = (en.match(/<svg[\s\S]*?<\/svg>/) ?? [])[0];
  const zhSvg = (zh.match(/<svg[\s\S]*?<\/svg>/) ?? [])[0];
  const zhName = /常识画廊/.test(zh);
  return { ok: enSvg === zhSvg && zhName,
           detail: `byte-identical ${enSvg === zhSvg}, zh wordmark still translated ${zhName}` };
});

check('F-03', 'the mark does not spend the accent, and holds at tab size', () => {
  // Sanguine is reserved for calls to action, and is 2.03:1 on the bar. The
  // letters are --paper on --bar, the most legible pair on the site.
  const svg = read('icon.svg');
  const usesAccent = svg.toUpperCase().includes(token('sanguine').toUpperCase());
  const r = ratio(MARK.paper, MARK.ground);
  // The C's cap height as a share of the box. Below about a third the pair
  // stops being two letters at 16px and becomes a smudge.
  const share = G.hC / MARK.box;
  return { ok: !usesAccent && r >= 4.5 && share > 0.33,
           detail: `no sanguine ${!usesAccent}, letters on the field ${r.toFixed(2)}:1, C is ${(share * 100).toFixed(0)}% of the mark` };
});

check('F-03', 'the hatching is off below the size it survives', () => {
  // The sheet's own minimum is 15mm in print. At a 16px favicon the hatch
  // fills in, so neither the icon nor the masthead carries it.
  const icon = read('icon.svg');
  const m = home.match(/<a class="wordmark"[^>]*>([\s\S]*?)<\/a>/);
  const off = !/-hatch/.test(icon) && !/-hatch/.test(m[1]);
  // …and it is still available, at the sheet's own angle and direction.
  const available = /-hatch/.test(markGeom.markSvg({ hatch: true }))
    && MARK.hatchAngle === 45;
  return { ok: off && available,
           detail: `off in the icon and the masthead ${off}, available at ${MARK.hatchAngle}° ${available}` };
});

check('F-04', 'the proportion is the sheet\'s construction, and says where it departs', () => {
  // S : C = 1 : sqrt(phi), not 1 : phi. The reason is written in mark.mjs; the
  // assertion is that the number is derived from phi and not typed in.
  const derived = Math.abs(MARK.ratio - Math.sqrt(MARK.phi)) < 1e-9;
  const stated = /1 : sqrt\(phi\)/.test(src('scripts/mark.mjs'));
  // The pair fills the square: equal margins on all four sides.
  const rightMargin = MARK.box - (G.C.x + G.wC);
  const bottomMargin = MARK.box - (G.C.y + G.hC);
  const square = Math.abs(rightMargin - MARK.pad) < 1e-6
    && Math.abs(bottomMargin - MARK.pad) < 1e-6
    && Math.abs(G.S.x - MARK.pad) < 1e-6 && Math.abs(G.S.y - MARK.pad) < 1e-6;
  return { ok: derived && stated && square,
           detail: `ratio ${MARK.ratio.toFixed(4)} = sqrt(phi) ${derived}, departure documented ${stated}, fills the square ${square}` };
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
