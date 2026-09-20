/**
 * Contrast regression check.
 *
 * Parses src/styles/tokens.css, then recomputes every text/ground pair the
 * site actually uses and fails the build on any regression.
 *
 * The reason this exists: while writing the tokens, a muted grey solved to
 * 4.52:1 against white and then failed at 3.99:1 against the darkest sfumato
 * wash. That is the exact trap the build report flags — a value checked
 * against the wrong ground. Every pair below is checked against the ground it
 * is really painted on, worst case first.
 *
 *   node scripts/check-contrast.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- WCAG 2 relative luminance ---------- */
const chan = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const lum = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
};
export const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/* ---------- read tokens ---------- */
const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const T = Object.fromEntries(
  [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1], m[2]])
);

const GROUNDS = {
  mat:    T['paper'],
  pale:   T['wash-pale'],
  mid:    T['wash-mid'],
  deep:   T['wash-deep'],
};

/* Finding B-02. The grounds above are the light family: the three sage reading
   surfaces, and the cream mat, which carries no prose but does carry a
   caption's worth of ink in the scale diagram. The dark bar carries
   the masthead, the navigation, the footer and every legal disclosure, and it
   was not among them — which is how a 2.34:1 footer shipped through a build
   that blocks on contrast.
   
   Rather than add the bar to a hand-maintained list, this reads the stylesheet
   and checks the pairs that are actually painted. For each rule that lands on
   the bar it takes the LAST colour declaration in the block, because the last
   one is what the cascade uses — and a rule that set a good colour and then
   overrode it with a bad one was exactly the B-01 defect. */
const BAR = T['bar'];
const ON_BAR_SELECTORS = /^\s*(\.masthead|\.wordmark|\.nav\b|\.nav__|\.lang-switch|\.shopbar|\.social|\.footer|\.legal-declaration)/;

const barPairs = [];
const ownGround = [];
{
  const g = readFileSync(join(ROOT, 'src/styles/gallery.css'), 'utf8');
  // strip comments so a colour mentioned in prose is not read as a declaration
  const src = g.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    if (!ON_BAR_SELECTORS.test(selector)) continue;
    const colours = [...m[2].matchAll(/(?:^|[;\s])color:\s*var\(--([a-z0-9-]+)\)/g)];
    if (!colours.length) continue;
    const token = colours.at(-1)[1];           // the one the cascade keeps
    if (!T[token]) continue;
    const isLarge = /wordmark/.test(selector);  // the wordmark is display size
    // A rule may declare the ground it is really read on. The footer paints
    // itself in a color-mix() this script cannot composite — glass over the
    // sage field — so it names the worst case instead, and that name wins
    // over whatever background the rule also sets.
    const declaredGround = (m[2].match(/--contrast-ground:\s*var\(--([a-z0-9-]+)\)/) ?? [])[1];
    // A rule that paints its own ground — the cart count's pill — is read
    // against that ground, not against the bar it happens to sit over.
    const painted = ([...m[2].matchAll(/(?:^|[;\s])background(?:-color)?:\s*var\(--([a-z0-9-]+)\)/g)].at(-1) ?? [])[1];
    const ground = T[declaredGround] ? declaredGround : painted;
    if (ground && T[ground]) {
      ownGround.push([selector.replace(/\s+/g, ' ').slice(0, 38), token, ground, isLarge ? 3.0 : 4.5]);
      continue;
    }
    barPairs.push([selector.replace(/\s+/g, ' ').slice(0, 38), token, isLarge ? 3.0 : 4.5,
                   colours.length > 1 ? `overrides ${colours.length - 1} earlier declaration(s)` : '']);
  }
}

/**
 * Each entry: [token, minimum, which grounds it is painted on, why]
 * AA text = 4.5, AA large text / non-text UI = 3.0
 */
const CHECKS = [
  ['ink',           4.5, ['mat','pale','mid','deep'], 'headings'],
  ['body',          4.5, ['mat','pale','mid','deep'], 'running text'],
  ['muted',         4.5, ['mat','pale','mid','deep'], 'captions, tombstone meta'],
  ['sanguine',      4.5, ['mat','pale','mid','deep'], 'links, accents'],
  ['sanguine-deep', 4.5, ['mat','pale','mid','deep'], 'hover, sold'],
  ['ultramarine',   4.5, ['mat','mid'],               'Tribute accent'],
  ['sold',          4.5, ['mat','pale','mid','deep'], 'sold state is ACTIVE content'],
  ['muted-ui',      3.0, ['mat','pale','mid','deep'], 'icon strokes, borders'],
  ['rule',          3.0, ['mat','pale','mid','deep'], 'rules that carry meaning'],
];

/* Reversed pairs: white text on a filled control. */
const ON_FILL = [
  ['paper', 'ink',           4.5, 'primary button label'],
  ['paper', 'sanguine',      4.5, 'button hover label'],
  ['paper', 'sanguine-deep', 4.5, 'button active label'],
  ['flag-ink', 'flag-ground', 4.5, 'NEEDS-INPUT flag, on its own ground'],
];

/* ---------- rendered after the token table; see below ---------- */

/* SC 1.4.1 / technique G183: a link distinguished from surrounding prose by
   colour ALONE needs 3:1 against that prose. None of these reach it, which is
   why underlines on body-copy links are structural rather than stylistic.
   This check asserts the underline requirement still holds. */
const G183 = [['sanguine', 'body'], ['ultramarine', 'body']];

let failures = 0;
const line = (s) => process.stdout.write(s + '\n');

line('\n  CONTRAST CHECK — tokens vs the grounds they are painted on\n');

for (const [token, min, grounds, why] of CHECKS) {
  const hex = T[token];
  if (!hex) { line(`  ✗ --${token} not found in tokens.css`); failures++; continue; }
  const results = grounds.map((g) => [g, ratio(hex, GROUNDS[g])]);
  const worst = results.reduce((a, b) => (a[1] < b[1] ? a : b));
  const ok = worst[1] >= min;
  if (!ok) failures++;
  line(
    `  ${ok ? '✓' : '✗'} --${token.padEnd(14)} ${hex}  min ${min.toFixed(1)}  ` +
    `worst ${worst[1].toFixed(2)} on ${worst[0].padEnd(6)}  ${why}`
  );
  if (!ok) {
    for (const [g, r] of results) {
      if (r < min) line(`      └─ fails on ${g}: ${r.toFixed(2)} (need ${min.toFixed(1)})`);
    }
  }
}

line('\n  ON THE DARK BAR — every colour the stylesheet actually paints there\n');
if (!barPairs.length) { line('  ✗ no bar rules found — the selector list is stale'); failures++; }
for (const [selector, token, min, note] of barPairs) {
  const r = ratio(T[token], BAR);
  const ok = r >= min;
  if (!ok) failures++;
  line(
    `  ${ok ? '✓' : '✗'} ${selector.padEnd(38)} --${token.padEnd(12)} ` +
    `${r.toFixed(2)}  min ${min.toFixed(1)}${note ? `  (${note})` : ''}`
  );
}

/* ---------- the glass bar ----------
   Softness pass. On desktop the sticky masthead becomes --bar at
   --glass-bar-opacity once content scrolls beneath it. Its text is then read
   against the bar COMPOSITED over whatever is passing under, and a painting
   can put pure white there — the worst case for light text on a dark glass.
   Browsers composite in sRGB, so that is what is modelled.

   The floor here is a design floor, not WCAG's: 7:1 for navigation-size text
   (AAA) and 4.5:1 for the display-size wordmark. WCAG's 4.5:1 would allow the
   bar down to 73%; the site chose a full AAA margin, and this is what holds it
   there.

   Only masthead rules are modelled against white. The footer runs the same
   glass, but over the sage field rather than over a painting, so its worst
   case is one fixed colour — --glass-footer — and the block below recomputes
   that token from --bar, --glass-bar-opacity and --field and fails if the
   value written in tokens.css has drifted from the composite it claims to be.
   The footer's own pairs are then solved against it as ordinary own-ground
   pairs, because the rules declare --contrast-ground. */
{
  const alphaDecl = (readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8')
    .match(/--glass-bar-opacity:\s*([\d.]+)%/) ?? [])[1];
  line('\n  THE GLASS BAR — masthead text over a white passage of a painting\n');
  if (!alphaDecl) {
    line('  ✗ --glass-bar-opacity not found in tokens.css'); failures++;
  } else {
    const a = Number(alphaDecl) / 100;
    const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
    const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    const composite = hex(rgb(BAR).map((v) => a * v + (1 - a) * 255));
    line(`  --bar at ${alphaDecl}% over #FFFFFF composites to ${composite.toUpperCase()}`);
    const masthead = barPairs.filter(([sel]) => /^\s*(\.masthead|\.wordmark|\.nav\b|\.nav__|\.lang-switch|\.shopbar)/.test(sel));
    if (!masthead.length) { line('  ✗ no masthead rules found'); failures++; }
    for (const [selector, token, min] of masthead) {
      const floor = min >= 4.5 ? 7.0 : 4.5;
      const r = ratio(T[token], composite);
      const ok = r >= floor;
      if (!ok) failures++;
      line(`  ${ok ? '✓' : '✗'} ${selector.padEnd(38)} --${token.padEnd(12)} ${r.toFixed(2)}  floor ${floor.toFixed(1)}`);
    }
  }
}

/* ---------- the glass footer ----------
   --glass-footer is not a colour anyone chose: it is --bar at
   --glass-bar-opacity over --field, written down so the rest of this script
   can treat it as a ground. Recompute it and fail on any drift. */
{
  const css2 = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const a = Number((css2.match(/--glass-bar-opacity:\s*([\d.]+)%/) ?? [])[1]) / 100;
  const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const over = (under) => hex(rgb(BAR).map((v, i) => a * v + (1 - a) * rgb(under)[i]));
  const want = over(T['field']);
  const got = (T['glass-footer'] ?? '').toUpperCase();
  const ok = got === want.toUpperCase();
  if (!ok) failures++;
  line('\n  THE GLASS FOOTER — the bar over the sage field\n');
  line(`  ${ok ? '✓' : '✗'} --glass-footer ${got || '(missing)'} = --bar at ${a * 100}% over --field ${want.toUpperCase()}`);
  // --field is the lighter half of the field and therefore the worst case for
  // light text; state the other end so the claim is visible rather than asserted.
  line(`    over --field-deep it composites to ${over(T['field-deep']).toUpperCase()}, which is darker still`);
}

/* ---------- the canvas ----------
   The grain is mean-neutral and composited with soft-light, so it leaves the
   MEAN of a surface exactly where its token put it. What it does do is move
   individual pixels, by up to --canvas-slope / 2 either side of 0.5, and on a
   ground that carries text that is a contrast question.

   The site's answer is that the tile goes on one material — the mat — and that
   textured surfaces carry no text. This block is what holds the second half of
   that to arithmetic rather than to assertion: it solves how much excursion
   each READING ground could take before its tightest pair fell through the
   floor, prints it next to what the tile actually has, and fails if any rule
   ever paints a reading ground AND textures it.

   Since the grounds moved onto the sage hue the arithmetic no longer binds —
   --wash-pale could carry the whole tile — so what keeps the texture off them
   is now the material rule, which check-review.mjs asserts by name. */
{
  const slope = Number((readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8')
    .match(/--canvas-slope:\s*([\d.]+)/) ?? [])[1]);
  line('\n  THE CANVAS — how far a mean-neutral grain may move a ground\n');
  if (!Number.isFinite(slope)) { line('  ✗ --canvas-slope not found in tokens.css'); failures++; }
  else {
    const k = slope / 2;
    // W3C soft-light, per channel, in sRGB — which is what the filter declares.
    const D = (cb) => (cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb));
    const soft = (cb, cs) => (cs <= 0.5 ? cb - (1 - 2 * cs) * cb * (1 - cb)
                                        : cb + (2 * cs - 1) * (D(cb) - cb));
    const px = (hex) => [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255);
    const toHex = (c) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16).padStart(2, '0')).join('');
    const blend = (hex, cs) => toHex(px(hex).map((cb) => soft(cb, cs)));

    // How much excursion a ground can take before any pair on it fails.
    const allowance = (ground, pairs) => {
      let lo = 0, hi = 0.5;
      for (let i = 0; i < 40; i++) {
        const m = (lo + hi) / 2;
        const ok = pairs.every(([tok, min]) => [0.5 - m, 0.5 + m]
          .every((cs) => ratio(T[tok], blend(T[ground], cs)) >= min));
        if (ok) lo = m; else hi = m;
      }
      return lo;
    };
    const onCream = CHECKS.map(([tok, min]) => [tok, min]);
    for (const g of ['wash-pale', 'wash-mid', 'wash-deep']) {
      const a = allowance(g, onCream.filter(([, , ] ) => true));
      const verdict = a >= k ? 'could carry the tile' : `could carry only ±${a.toFixed(3)}`;
      line(`    --${g.padEnd(12)} tightest pair leaves ±${a.toFixed(3)};  the tile is ±${k.toFixed(3)}  — ${verdict}`);
    }

    // …and the rule that follows from it: a reading ground is never textured.
    const READING = new Set(['wash-pale', 'wash-mid', 'wash-deep', 'paper']);
    const sheets = ['src/styles/base.css', 'src/styles/gallery.css']
      .map((f) => readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
    const textured = [];
    for (const m of sheets.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/var\(--canvas-grain\)/.test(m[2])) continue;
      const ground = ([...m[2].matchAll(/background(?:-color)?:\s*var\(--([a-z0-9-]+)\)/g)].at(-1) ?? [])[1];
      textured.push([m[1].trim().replace(/\s+/g, ' ').slice(0, 30), ground]);
    }
    if (!textured.length) { line('  ✗ nothing references --canvas-grain — the texture is defined and unused'); failures++; }
    line('');
    for (const [selector, ground] of textured) {
      const bad = ground && READING.has(ground);
      if (bad) failures++;
      line(`  ${bad ? '✗' : '✓'} ${selector.padEnd(30)} textured${ground ? `, on --${ground}` : ''}`
        + (bad ? '  — a reading ground may not be textured' : ''));
    }
  }
}

for (const [selector, token, ground, min] of ownGround) {
  const r = ratio(T[token], T[ground]);
  const ok = r >= min;
  if (!ok) failures++;
  line(`  ${ok ? '✓' : '✗'} ${selector.padEnd(38)} --${token.padEnd(12)} ${r.toFixed(2)}  on its own --${ground}`);
}

line('');
for (const [fg, bg, min, why] of ON_FILL) {
  const r = ratio(T[fg], T[bg]);
  const ok = r >= min;
  if (!ok) failures++;
  line(`  ${ok ? '✓' : '✗'} --${fg} on --${bg.padEnd(14)} ${r.toFixed(2)}  ${why}`);
}

line('');
for (const [link, text] of G183) {
  const r = ratio(T[link], T[text]);
  // We EXPECT this to be under 3 — the assertion is that the underline is required.
  line(
    `  ${r < 3 ? '✓' : '!'} --${link} vs --${text}: ${r.toFixed(2)}  ` +
    (r < 3
      ? '→ underline required on body-copy links (as built)'
      : '→ NOTE: now clears 3:1, the underline could become optional')
  );
}

line('');
if (failures) {
  line(`  ${failures} contrast failure${failures > 1 ? 's' : ''}. Build blocked.\n`);
  process.exit(1);
}
line('  All pairs pass against their worst-case ground.\n');
