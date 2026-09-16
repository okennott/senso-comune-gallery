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
  paper:  T['paper'],
  warm:   T['wash-warm'],
  violet: T['wash-violet'],
  blue:   T['wash-blue'],
};

/**
 * Each entry: [token, minimum, which grounds it is painted on, why]
 * AA text = 4.5, AA large text / non-text UI = 3.0
 */
const CHECKS = [
  ['ink',           4.5, ['paper','warm','violet','blue'], 'headings'],
  ['body',          4.5, ['paper','warm','violet','blue'], 'running text'],
  ['muted',         4.5, ['paper','warm','violet','blue'], 'captions, tombstone meta'],
  ['sanguine',      4.5, ['paper','warm','violet','blue'], 'links, accents'],
  ['sanguine-deep', 4.5, ['paper','warm','violet','blue'], 'hover, sold'],
  ['ultramarine',   4.5, ['paper','violet'],               'Tribute accent'],
  ['sold',          4.5, ['paper','warm','violet','blue'], 'sold state is ACTIVE content'],
  ['muted-ui',      3.0, ['paper','warm','violet','blue'], 'icon strokes, borders'],
  ['rule',          3.0, ['paper','warm','violet','blue'], 'rules that carry meaning'],
];

/* Reversed pairs: white text on a filled control. */
const ON_FILL = [
  ['paper', 'ink',           4.5, 'primary button label'],
  ['paper', 'sanguine',      4.5, 'button hover label'],
  ['paper', 'sanguine-deep', 4.5, 'button active label'],
];

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
