/**
 * The project's one language corpus.
 *
 *   node scripts/corpus.mjs            print it, with counts and conflicts
 *   node scripts/corpus.mjs --terms    print the term list, en → zh
 *
 * WHY THIS FILE EXISTS
 * The site has been bilingual since it was built, but its Chinese lived as
 * en/zh pairs scattered across four files — site.json, seller.json,
 * artworks.json and the legal-page literals inside build.js. Nothing held them
 * to one vocabulary, and nothing outside the site build could reach them. So a
 * second Chinese artefact (the report) would have invented its own words for
 * things the site already has words for: 作品 or 画作, 购买方式 or 如何购买.
 *
 * This module is the one place the corpus is assembled, and it is assembled by
 * HARVEST rather than by transcription. The site's own strings are the
 * authority for anything the site says; src/data/lexicon.json adds only what
 * the site never says — the report's technical and legal vocabulary, and the
 * terms that must stay in Latin script. Two different Chinese renderings of
 * one English term is an error, not a preference, and it is reported here and
 * failed by scripts/check-corpus.mjs.
 *
 * TERMS vs PHRASES
 * A short entry is a TERM. A long entry is a PHRASE: it is offered as
 * exact-match memory, so a sentence the report shares with the site comes out
 * in the site's own words rather than in new ones.
 *
 * ENFORCED vs OFFERED
 * A term is ENFORCED when a translation that renders its English without its
 * Chinese is a finding. Not every pair can bear that: a one-word UI label is
 * context-bound. `ui.viewOf` is the "of" in "2 of 5" and its Chinese is "/";
 * `sections.works.all` is the "All" of a filter row and its Chinese is 全部.
 * Enforcing either across running prose reports every sentence in the report
 * that contains the word "of", which buries the findings that matter.
 *
 * So the line is drawn by provenance, not by orthography:
 *
 *   enforced   every term in lexicon.json — it was curated to be vocabulary —
 *              and every MULTI-WORD term harvested from the site, which is
 *              distinctive enough to mean one thing ("How to Buy", "All works").
 *   offered    single-word labels harvested from the site. They still seed the
 *              memory on an exact match, and they are still the authority if
 *              the same word is ever added to the lexicon; they simply are not
 *              asserted about a sentence that happens to contain the word.
 *
 * A single-word site label that IS project vocabulary is promoted by naming it
 * in lexicon.json, which is the one place that decision is recorded.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Files walked for en/zh pairs. The first three are parsed as JSON — the whole
   tree is walked, so a pair added anywhere in them is picked up without this
   list changing. build.js is read as TEXT, because its pairs are source
   literals and there is no way to reach them by importing the module. */
const DATA = ['src/data/site.json', 'src/data/seller.json', 'src/data/artworks.json'];
const SRC = ['build.js'];
const LEXICON = 'src/data/lexicon.json';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Placeholders a pair is allowed to carry. `${...}` in a build.js literal is
 *  a value interpolated at build time; the two sides must carry the same
 *  number of them, or the pair is malformed rather than merely untranslated. */
const PARAM = /\$\{[^}]*\}/g;
const deparam = (s) => {
  let n = 0;
  return { text: s.replace(PARAM, () => `⟨${++n}⟩`), params: n };
};

const isPlaceholder = (s) => !s || s === 'NEEDS-INPUT' || s.includes('NEEDS-INPUT');

/** Normalised key for matching. Terms match case-insensitively and without
 *  surrounding punctuation; phrases match on collapsed whitespace only,
 *  because their case and punctuation are part of what is being reused. */
export const termKey = (s) => s.toLowerCase().replace(/\s+/g, ' ').replace(/^[\s"'“”‘’(]+|[\s"'“”‘’).,;:!?]+$/g, '').trim();
export const phraseKey = (s) => s.replace(/\s+/g, ' ').trim();

/** A term is short enough to be a name for something rather than a statement
 *  about it. The sentence test matters more than the word count: "Fourteen
 *  days, worldwide" is a heading and a term; a clause with a full stop in the
 *  middle of it is not. */
const isTerm = (en) =>
  en.length <= 48 && en.split(/\s+/).length <= 6 && !/[.!?;]/.test(en) && !en.includes('\n');

function walkJson(node, path, hit) {
  if (Array.isArray(node)) return node.forEach((v, i) => walkJson(v, `${path}[${i}]`, hit));
  if (!node || typeof node !== 'object') return;
  if (typeof node.en === 'string') {
    if (typeof node.zh === 'string') hit(node.en, node.zh, path);
    return;                                   // a pair is a leaf; do not walk into it
  }
  for (const k of Object.keys(node)) if (!k.startsWith('$')) walkJson(node[k], `${path}.${k}`, hit);
}

/* en: <string literal> , zh: <string literal>  — in that order, which is the
   order every pair in build.js is written in. The three quote styles are all
   used there. A literal containing its own quote character is not matched and
   is not silently half-matched: the pattern requires the closing quote to be
   followed by the `zh` key. */
const LIT = String.raw`(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|` + '`((?:[^`\\\\]|\\\\.)*)`)';
const PAIR_RE = new RegExp(String.raw`\ben:\s*${LIT}\s*,\s*zh:\s*${LIT}`, 'g');
const pick = (m, i) => m[i] ?? m[i + 1] ?? m[i + 2];
const unescape = (s) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');

function walkSource(text, file, hit) {
  for (const m of text.matchAll(PAIR_RE)) {
    const en = unescape(pick(m, 1)), zh = unescape(pick(m, 4));
    const line = text.slice(0, m.index).split('\n').length;
    hit(en, zh, `${file}:${line}`);
  }
}

export function loadCorpus() {
  const lex = JSON.parse(read(LEXICON));
  const terms = new Map();                    // termKey  -> entry
  const phrases = new Map();                  // phraseKey -> entry
  const conflicts = [];
  const counts = {};
  /* Settled dual renderings (lexicon.json → splits). A split listed there is
     not a conflict: the alternate is recorded on the entry, so a check can
     accept either without accepting anything unlisted. */
  const splits = new Map((lex.splits ?? []).map((x) => [termKey(x.en), x]));

  const add = (en0, zh0, from, authority, file) => {
    const a = deparam(en0.trim()), b = deparam(zh0.trim());
    const en = a.text, zh = b.text;
    if (isPlaceholder(en) || isPlaceholder(zh) || !zh) return;
    if (a.params !== b.params) {
      conflicts.push({ kind: 'params', en, from, detail: `en carries ${a.params} placeholder(s), zh carries ${b.params}` });
      return;
    }
    if (zh === en) return;                    // a term that is the same in both, e.g. 小红书 or a name
    const bag = isTerm(en) ? terms : phrases;
    const key = isTerm(en) ? termKey(en) : phraseKey(en);
    /* See ENFORCED vs OFFERED above. */
    const enforce = authority === 1 || en.trim().split(/\s+/).length > 1;
    const prev = bag.get(key);
    if (prev && prev.zh !== zh) {
      const settled = splits.get(key);
      if (settled?.zh?.includes(zh) && settled.zh.includes(prev.zh)) {
        prev.alt = [...new Set([...(prev.alt ?? []), zh])];   // on the record, not a finding
        return;
      }
      /* The site wins over the lexicon; two site strings disagreeing with each
         other is the case that has to be settled by hand — by fixing one of
         them, or by listing the pair under `splits` with the reason. */
      if (prev.authority === authority) conflicts.push({ kind: 'split', en, zh, from, detail: `already ${JSON.stringify(prev.zh)} from ${prev.from}` });
      if (prev.authority <= authority) return;
    }
    /* Naming a harvested label in the lexicon is how it is promoted to
       enforced, so a second call for the same term carries that across even
       when the site keeps authority over the wording. */
    if (prev) { prev.enforce = prev.enforce || enforce; if (prev.authority <= authority) return; }
    bag.set(key, { en, zh, from, params: a.params, authority, enforce });
    counts[file] = (counts[file] ?? 0) + 1;
  };

  /* authority: 0 = the site's own strings, 1 = the lexicon. The site is what a
     buyer actually reads, so it decides the word. */
  for (const f of DATA) walkJson(JSON.parse(read(f)), '', (en, zh, p) => add(en, zh, `${f}${p}`, 0, f));
  for (const f of SRC) walkSource(read(f), f, (en, zh, p) => add(en, zh, p, 0, f));
  /* An entry carrying only a `$note` is a comment in the list, not a term. */
  for (const e of lex.terms ?? []) if (e.en) add(e.en, e.zh, LEXICON, 1, LEXICON);

  /* A term cannot be both kept in Latin and given a Chinese rendering: the
     protector would freeze it and the corpus would demand it be translated, so
     one of the two lists is wrong. */
  for (const k of lex.keep ?? []) {
    const e = terms.get(termKey(k));
    if (e) conflicts.push({ kind: 'keep-vs-term', en: k, from: LEXICON,
      detail: `kept in Latin here, but ${JSON.stringify(e.zh)} in ${e.from}` });
  }

  return {
    terms, phrases, conflicts, counts, splits,
    keep: new Set(lex.keep ?? []),
    furniture: lex.furniture ?? {},
    notes: lex.notes ?? {},
  };
}

/** Every corpus term that occurs in a string, longest first so that
 *  "how to buy" is preferred over "buy". Word-boundary matched on the Latin
 *  side; a term inside a longer word does not count.
 *
 *  `enforced` restricts the result to the terms that can be asserted about
 *  prose — which is what a check wants, and also what a drafting prompt wants,
 *  since a glossary line reading "of → /" is worse than no glossary line. */
export function termsIn(text, corpus, { enforced = false } = {}) {
  const lower = text.toLowerCase();
  const found = [];
  for (const [key, e] of corpus.terms) {
    if (!key) continue;
    if (enforced && !e.enforce) continue;
    const i = lower.indexOf(key);
    if (i < 0) continue;
    /* A hyphen counts as part of the word: "sage-ground" is a compound naming
       one surface, not the term "ground" used in prose, and `--wash-deep` is
       not the term "wash". Masking catches most of these before they get here;
       this catches the ones written out in the prose itself. */
    const before = lower[i - 1], after = lower[i + key.length];
    if ((before && /[a-z0-9_-]/.test(before)) || (after && /[a-z0-9_-]/.test(after))) continue;
    found.push(e);
  }
  return found.sort((a, b) => b.en.length - a.en.length);
}

/* Content words, for measuring how close two English sentences are. Short and
   structural words carry no signal: every sentence in the report has "the" in
   it, and a phrase matched on that is noise. */
const STOP = new Set(('a an and are as at be been but by for from has have in into is it its of on or that the their them there these this to was were which will with what when where'
  + ' you your not no than then so too very can cannot could would should may might do does did done make made one two three').split(' '));
const words = (s) => new Set(s.toLowerCase().match(/[a-z][a-z'-]{2,}/g)?.filter((w) => !STOP.has(w)) ?? []);

/** The site's own sentences that are ABOUT the same thing as `text`, best
 *  first. Not a translation of it — a sample of how this project's Chinese
 *  already talks about it, which is what keeps a new paragraph's register and
 *  vocabulary the same as the site's instead of merely correct.
 *
 *  The report quotes no sentence of the site verbatim, so the exact-match seed
 *  fires nowhere; this is the form the phrase layer actually takes. */
export function relatedPhrases(text, corpus, { limit = 3, min = 3 } = {}) {
  const w = words(text);
  if (w.size < min) return [];
  const scored = [];
  for (const e of corpus.phrases.values()) {
    const other = words(e.en);
    let shared = 0;
    for (const x of w) if (other.has(x)) shared++;
    /* Scored on overlap against the SHORTER of the two, so a long policy
       paragraph does not out-score a tight one just by being long. */
    if (shared >= min) scored.push({ e, score: shared / Math.min(w.size, other.size) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.e);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const c = loadCorpus();
  if (process.argv.includes('--terms')) {
    for (const e of [...c.terms.values()].sort((a, b) => a.en.localeCompare(b.en)))
      console.log(`${e.enforce ? '!' : ' '} ${e.en.padEnd(42)} ${e.zh.padEnd(20)} ${e.from}`);
  } else {
    const enf = [...c.terms.values()].filter((e) => e.enforce).length;
    console.log(`\n  corpus: ${c.terms.size} terms (${enf} enforced), ${c.phrases.size} phrases, ${c.keep.size} kept in Latin, ${c.splits.size} settled split(s)`);
    console.log('  harvested from:');
    for (const [f, n] of Object.entries(c.counts).sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${f}`);
    if (c.conflicts.length) {
      console.log(`\n  ${c.conflicts.length} conflict(s):`);
      for (const x of c.conflicts) console.log(`    ✗ [${x.kind}] ${JSON.stringify(x.en.slice(0, 50))}\n        ${x.detail}\n        at ${x.from}`);
    } else console.log('\n  no conflicts');
    console.log('');
  }
}
