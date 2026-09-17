/**
 * Build the site for release — the only build that may go live.
 *
 *   npm run build:release        (or: node scripts/release.mjs)
 *
 * Every step must pass, in order, or nothing is published:
 *
 *   1. images      the photographs, and the manifest the gate reads
 *   2. readiness   every critical detail supplied (scripts/readiness.mjs)
 *   3. build       RELEASE=1 — which asks the gate again, and refuses on its own
 *   4. checks      contrast, links (in release mode: no placeholder of any kind
 *                  may survive into the site), review assertions, gate tests
 *   5. rendering   the paintings in a real browser, where Chrome is available
 *
 * Set this as the production host's build command (Cloudflare Pages: build
 * command `node scripts/release.mjs`, output directory `dist`). A failed build
 * is never published there — the previous release stays live — so a closed
 * gate cannot take a working site down, only keep an unready one from going up.
 *
 * Written in Node rather than as an npm script so that RELEASE=1 is set the
 * same way on every platform, Windows included.
 */
import { spawnSync, execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, RELEASE: '1' };
const chrome = process.env.CHROME || ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
  .some((c) => { try { execSync(`command -v ${c}`, { stdio: 'ignore' }); return true; } catch { return false; } });

const steps = [
  ['images',    ['scripts/build-images.mjs']],
  ['readiness', ['scripts/check-readiness.mjs']],
  ['build',     ['build.js']],
  ['contrast',  ['scripts/check-contrast.mjs']],
  ['links',     ['scripts/check-links.mjs']],
  ['review',    ['scripts/check-review.mjs']],
  ['gate tests',['scripts/test-readiness.mjs']],
  ...(chrome ? [['rendering', ['scripts/check-render.mjs']]] : []),
];

console.log('\n  RELEASE BUILD\n');
for (const [name, args] of steps) {
  console.log(`  ── ${name}`);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n  RELEASE STOPPED at "${name}". Nothing may be published from this build.\n`);
    process.exit(r.status || 1);
  }
}
if (!chrome) console.log('  note: no Chrome found — the rendering check was skipped. Run it before publishing.');
console.log('\n  RELEASE READY — dist/ may be published.\n');
