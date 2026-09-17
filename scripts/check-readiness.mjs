/**
 * Is the site ready to go live?
 *
 *   node scripts/check-readiness.mjs            exit 1 unless ready
 *   node scripts/check-readiness.mjs --report   always exit 0 (for previews)
 *   node scripts/check-readiness.mjs --json     machine-readable
 *
 * Reads the data and the image manifest, asks scripts/readiness.mjs, and prints
 * what is still owed — grouped by area, each with the field, what is wrong,
 * how to fix it and why it matters. In GitHub Actions the same report is
 * written to the run's summary page, because a gate that fails where nobody
 * looks is not much of a gate.
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assess } from './readiness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const j = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const args = new Set(process.argv.slice(2));

export function loadAndAssess(today = new Date()) {
  const viewsFile = join(ROOT, 'public/img/views.json');
  return assess({
    site: j('src/data/site.json'),
    seller: j('src/data/seller.json'),
    artworks: j('src/data/artworks.json'),
    // no manifest means no images have been built: every photograph counts as missing
    views: existsSync(viewsFile) ? JSON.parse(readFileSync(viewsFile, 'utf8')) : {},
    waivers: j('src/data/readiness-waivers.json').waivers ?? [],
    today,
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const r = loadAndAssess();

  if (args.has('--json')) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    process.exit(!r.ready && !args.has('--report') ? 1 : 0);
  }

  const lines = [];
  const say = (s = '') => lines.push(s);
  const byArea = (list) => list.reduce((m, x) => ((m[x.area] ??= []).push(x), m), {});

  say(`\n  READINESS — ${r.ready ? 'READY TO GO LIVE' : 'NOT READY'}`);
  say(`  ${r.rules} rules · ${r.blockers.length} blocker${r.blockers.length === 1 ? '' : 's'} · ${r.waived.length} waived · ${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}\n`);

  for (const [area, items] of Object.entries(byArea(r.blockers))) {
    say(`  ${area.toUpperCase()}  (${items.length})`);
    const rules = [...new Set(items.map((x) => x.rule))];
    for (const id of rules) {
      const group = items.filter((x) => x.rule === id);
      say(`    ✗ ${id}  ${group[0].title}`);
      for (const x of group.slice(0, 8)) say(`        ${x.path} — ${x.message}`);
      if (group.length > 8) say(`        … and ${group.length - 8} more`);
      say(`        fix:  ${group[0].fix}`);
      say(`        why:  ${group[0].basis}`);
    }
    say();
  }
  if (r.invalidWaivers.length) {
    say('  WAIVERS THAT DO NOT COUNT');
    for (const w of r.invalidWaivers) say(`    ✗ ${w.rule}${w.path ? ` ${w.path}` : ''} — ${w.why}`);
    say();
  }
  if (r.waived.length) {
    say('  ACCEPTED RISKS (waived)');
    for (const x of r.waived) say(`    · ${x.rule} ${x.path} — ${x.waiver.reason} (${x.waiver.approvedBy}, until ${x.waiver.expires})`);
    say();
  }
  if (r.warnings.length) {
    say('  WARNINGS (never block)');
    for (const id of [...new Set(r.warnings.map((x) => x.rule))]) {
      const group = r.warnings.filter((x) => x.rule === id);
      say(`    ! ${id}  ${group[0].title} (${group.length})`);
    }
    say();
  }
  say(r.ready
    ? '  Every critical detail is supplied. `npm run build:release` may run.\n'
    : '  The release build will refuse to run until every blocker is resolved or validly waived.\n');
  console.log(lines.join('\n'));

  // GitHub Actions: the same report on the run's summary page
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [`## Readiness: ${r.ready ? '✅ ready to go live' : '⛔ not ready'}`, '',
      `${r.rules} rules · **${r.blockers.length} blockers** · ${r.waived.length} waived · ${r.warnings.length} warnings`, '',
      ...(r.blockers.length ? ['| Rule | Field | Problem |', '|:--|:--|:--|',
        ...r.blockers.map((x) => `| ${x.rule} | \`${x.path}\` | ${x.message.replace(/\|/g, '\\|')} |`)] : []), ''];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n'));
  }

  process.exit(!r.ready && !args.has('--report') ? 1 : 0);
}
