/**
 * Checks on the project's one language corpus, and on the Chinese report
 * composed from it.
 *
 *   node scripts/check-corpus.mjs        (or: npm run check)
 *
 * Four things are held, and each of them is a way the two languages have
 * already been observed to drift apart in projects like this one:
 *
 *   L-01  the corpus agrees with itself — one English term, one Chinese
 *         rendering, unless the split is listed and argued in lexicon.json.
 *   L-02  the document's furniture words in preamble.tex and in lexicon.json
 *         are the same words. preamble.tex holds the English defaults and the
 *         lexicon holds both sides; if the English halves disagree, the
 *         lexicon is describing a document that no longer exists.
 *   L-03  every translation in the memory still carries the code, the
 *         cross-references, the emphasis and the vocabulary of the English it
 *         translates — and still translates the English that is there now.
 *   L-04  the composed Chinese .qmd is not stale against the source and the
 *         memory, because the PDF is built from it.
 *
 * What is NOT a failure here: a passage with no Chinese yet. That was a
 * decision — the Chinese edition falls back to English, marks the passage and
 * counts it on its title page — so an untranslated report builds, and the count
 * is reported below rather than blocking anything.
 *
 *   --site   L-01 only.
 *
 * scripts/release.mjs runs it that way. L-01 is about the site's own data —
 * two of its zh strings disagreeing is a site defect and must stop a release —
 * while L-02 to L-04 are about a document that is not part of the site. Without
 * the split, publishing the site would depend on the report having been
 * composed recently, which is the wrong way round.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadCorpus, ROOT } from './corpus.mjs';
import { validate, MEM, OUT, STRINGS } from './translate.mjs';

const results = [];
const check = (id, what, fn) => {
  try { const d = fn(); results.push({ id, what, ok: true, detail: d }); }
  catch (e) { results.push({ id, what, ok: false, detail: e.message }); }
};
const rel = (p) => p.replace(`${ROOT}/`, '');

/* ------------------------------------------------------------------ L-01 */

check('L-01', 'the corpus agrees with itself', () => {
  const c = loadCorpus();
  if (c.conflicts.length) {
    const first = c.conflicts.slice(0, 4).map((x) => `[${x.kind}] ${JSON.stringify(x.en.slice(0, 40))} — ${x.detail}`);
    throw new Error(`${c.conflicts.length} conflict(s): ${first.join(' · ')}`);
  }
  return `${c.terms.size} terms, ${c.phrases.size} phrases, ${c.keep.size} kept in Latin, ${c.splits.size} settled split(s)`;
});

const siteOnly = process.argv.includes('--site');

/* ------------------------------------------------------------------ L-02 */

/** `\newcommand{\scfoo}{bar}` from preamble.tex, with a body that may run over
 *  several lines. Nested braces are not expected and would be a reason to stop
 *  parsing TeX with a regular expression rather than to make this cleverer. */
function furnitureDefaults(tex) {
  const out = {};
  for (const m of tex.matchAll(/\\newcommand\{\\sc([A-Za-z]+)\}\{([^{}]*)\}/g)) {
    const key = m[1][0].toLowerCase() + m[1].slice(1);
    out[key] = m[2].replace(/\\space/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return out;
}

if (!siteOnly) check('L-02', 'the furniture words match preamble.tex', () => {
  const c = loadCorpus();
  const tex = readFileSync(join(ROOT, 'docs/report/preamble.tex'), 'utf8');
  const def = furnitureDefaults(tex);
  const bad = [];
  for (const [key, v] of Object.entries(c.furniture)) {
    if (!(key in def)) { bad.push(`\\sc${key} is in the lexicon but not defined in preamble.tex`); continue; }
    const want = v.en.replace(/\s+/g, ' ').trim();
    if (def[key] !== want) bad.push(`\\sc${key}: preamble has ${JSON.stringify(def[key])}, lexicon has ${JSON.stringify(want)}`);
  }
  /* The other direction: a macro the preamble defines and the lexicon does not
     know about would come out in English in the Chinese edition, silently. */
  const known = new Set(Object.keys(c.furniture));
  // Values written per build rather than words carried by the lexicon.
  const skip = new Set(['zhgaps', 'zhtotal', 'dateValue']);
  for (const key of Object.keys(def))
    if (!known.has(key) && !skip.has(key)) bad.push(`\\sc${key} is defined in preamble.tex with no Chinese in the lexicon`);
  if (bad.length) throw new Error(bad.join(' · '));
  return `${Object.keys(c.furniture).length} words, both sides`;
});

/* ------------------------------------------------------------------ L-03 */

const v = siteOnly ? null : validate();

if (!siteOnly) check('L-03', 'the translation memory carries what it translates', () => {
  if (v.findings.length) {
    const first = v.findings.slice(0, 4).map((f) => `${f.id} — ${f.what}: ${f.detail}`);
    throw new Error(`${v.findings.length} finding(s): ${first.join(' · ')}`);
  }
  return `${v.units.length} units — ${v.reviewed.length} reviewed, ${v.draft.length} draft, ${v.owed.length} owed`;
});

/* ------------------------------------------------------------------ L-04 */

if (!siteOnly) check('L-04', 'the composed Chinese edition is current', () => {
  if (!existsSync(OUT)) throw new Error(`${rel(OUT)} has not been composed — run: npm run translate:emit`);
  const out = statSync(OUT).mtimeMs;
  const stale = [join(ROOT, 'docs/report/senso-comune-report.qmd'), MEM, join(ROOT, 'src/data/lexicon.json')]
    .filter((p) => existsSync(p) && statSync(p).mtimeMs > out)
    .map(rel);
  if (stale.length) throw new Error(`newer than ${rel(OUT)}: ${stale.join(', ')} — run: npm run translate:emit`);
  if (!existsSync(STRINGS)) throw new Error(`${rel(STRINGS)} is missing — run: npm run translate:emit`);
  return `${rel(OUT)} is newer than its sources`;
});

/* ------------------------------------------------------------------ */

const failed = results.filter((r) => !r.ok);
console.log(siteOnly ? '\n  corpus (site data only)' : '\n  corpus and translation');
for (const r of results)
  console.log(`    ${r.ok ? '✓' : '✗'} ${r.id}  ${r.what}\n        ${r.detail}`);

if (v?.owed.length) {
  const pct = Math.round((v.owed.length / v.units.length) * 100);
  console.log(`\n    · ${v.owed.length} of ${v.units.length} units (${pct}%) are still English in the Chinese edition.`);
  console.log(`      By decision: they are marked in the PDF and counted on its title page.`);
  console.log(`      Draft them:  npm run translate:assist`);
}

console.log(failed.length ? `\n  ${failed.length} failed\n` : '\n  all passed\n');
process.exit(failed.length ? 1 : 0);
