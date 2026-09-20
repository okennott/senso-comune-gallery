/**
 * Tests for the readiness gate.
 *
 *   node scripts/test-readiness.mjs        (part of npm run check)
 *
 * A gate is only as good as the proof that it closes. So: build a copy of the
 * real data with every critical detail supplied, confirm the gate OPENS for it,
 * then break one thing at a time and confirm the gate CLOSES — on the right
 * rule, for the right reason. Then the waivers: valid, expired, unsigned, and
 * aimed at a rule that may not be waived.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assess, SAMR_ART12 } from './readiness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const j = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const clone = (x) => structuredClone(x);
const TODAY = new Date('2026-09-17T12:00:00Z');

/* ---------- a dataset with every critical detail supplied ---------- */
function ready() {
  const site = clone(j('src/data/site.json'));
  const seller = clone(j('src/data/seller.json'));
  const artworks = clone(j('src/data/artworks.json'));

  site.url = 'https://sensocomune.art';
  site.placeholders.routes = {};
  seller.contact.email = 'studio@sensocomune.art';
  seller.contact.phone = '+86 138 0013 8000';
  seller.contact.address = { en: '88 Example Road, Xuhui District, Shanghai 200030, China', zh: '中国上海市徐汇区示例路88号 200030' };
  seller.artist.wechatId = 'priscilla_studio';
  seller.artist.instagram = '';            // declined, on purpose
  seller.artist.facebook = '';
  seller.artist.x = '';
  seller.artist.bluesky = '';
  seller.artist.xiaohongshu = '';
  seller.donation.recipient = 'Shanghai Charity Foundation';
  seller.donation.recipientUrl = 'https://www.scf.org.cn/';
  for (const e of Object.values(seller.entities)) e.checkout.maxTransactionUSD = 5000;
  const views = {};
  for (const w of artworks.works) {
    w.title = { en: `Work ${w.order}`, zh: `作品${w.order}` };
    w.alt = { en: 'A harbour at dusk in blue and ochre', zh: '黄昏时分蓝色与赭色的港口' };
    w.description = { en: 'Oil laid thinly over a warm ground, the harbour lights picked out in impasto.', zh: '暖色底子上薄涂油彩，港口灯光以厚涂点出，层次分明而安静。' };
    views[w.image] = { width: 2000, height: 2500, placeholder: false };
    for (const v of w.views) views[`${w.image}-${v.kind}`] = { width: 2000, height: 2000, placeholder: true };
  }
  return { site, seller, artworks, views, waivers: [], today: TODAY };
}

const results = [];
const test = (name, fn) => {
  try { const d = fn(); results.push({ name, ok: d === true || d?.ok, detail: d?.detail ?? '' }); }
  catch (e) { results.push({ name, ok: false, detail: e.message }); }
};
/** Break the ready dataset with `mutate`; the gate must close on `rule`. */
const closes = (name, rule, mutate) => test(`${rule} closes: ${name}`, () => {
  const d = ready(); mutate(d);
  const r = assess(d);
  const hit = r.blockers.some((b) => b.rule === rule);
  return { ok: !r.ready && hit, detail: hit ? '' : `blocked by ${[...new Set(r.blockers.map((b) => b.rule))].join(', ') || 'nothing'}` };
});

/* ---------- it opens ---------- */
test('the gate opens when every critical detail is supplied', () => {
  const r = assess(ready());
  return { ok: r.ready, detail: r.blockers.map((b) => `${b.rule} ${b.path}`).join('; ') };
});
test('views without photographs do not block, and are reported as omitted', () => {
  const r = assess(ready());
  return { ok: r.ready && r.warnings.some((w) => w.rule === 'WK-10'), detail: `${r.warnings.filter((w) => w.rule === 'WK-10').length} omitted views` };
});
/* The portrait, both ways round. Undescribed is fine while there is no
   photograph — nobody can describe one that has not been taken — and is a
   blocker the moment there is, which is also the moment the frame goes live. */
test('a portrait with no photograph does not block, and is reported as omitted', () => {
  const r = assess(ready());
  return { ok: r.ready && r.warnings.some((w) => w.rule === 'ID-08'), detail: r.warnings.filter((w) => w.rule === 'ID-08').map((w) => w.path).join('') };
});
test('the portrait\'s alt is not caught by the placeholder backstop while it is owed', () => {
  const d = ready();
  const r = assess(d);
  return { ok: r.ready && d.site.about.portrait.alt.en === 'NEEDS-INPUT'
               && !r.blockers.some((b) => b.path.startsWith('site.about.portrait')),
           detail: r.blockers.filter((b) => b.path.includes('portrait')).map((b) => `${b.rule} ${b.path}`).join('; ') };
});
closes('a real portrait, still undescribed', 'ID-07', (d) => {
  d.views.portrait = { width: 960, height: 1200, placeholder: false };
});
test('a described portrait passes, and stops being reported as omitted', () => {
  const d = ready();
  d.views.portrait = { width: 960, height: 1200, placeholder: false };
  d.site.about.portrait.alt = { en: 'Priscilla at the studio window', zh: '画室窗前的 Priscilla' };
  const r = assess(d);
  return { ok: r.ready && !r.warnings.some((w) => w.rule === 'ID-08'), detail: r.blockers.map((b) => `${b.rule} ${b.path}`).join('; ') };
});

test('the inactive entity\'s missing numbers do not block', () => {
  const d = ready(); // hk-sole-prop still has NEEDS-INPUT registration numbers
  return assess(d).ready && d.seller.entities['hk-sole-prop'].registration.businessRegistrationNo === 'NEEDS-INPUT';
});

/* ---------- it closes, on the right rule ---------- */
closes('email left as placeholder', 'ID-01', (d) => { d.seller.contact.email = 'NEEDS-INPUT'; });
closes('email emptied', 'ID-01', (d) => { d.seller.contact.email = ''; });
closes('email on a reserved example domain', 'ID-01', (d) => { d.seller.contact.email = 'hello@example.com'; });
closes('email malformed', 'ID-01', (d) => { d.seller.contact.email = 'studio at sensocomune'; });
closes('phone without country code', 'ID-02', (d) => { d.seller.contact.phone = '138 0013 8000'; });
closes('phone too long for E.164', 'ID-02', (d) => { d.seller.contact.phone = '+86 1380013800012345'; });
closes('address in one language only', 'ID-03', (d) => { d.seller.contact.address.zh = ''; });
closes('WeChat ID starting with a digit', 'ID-05', (d) => { d.seller.artist.wechatId = '9priscilla'; });
closes('WeChat ID too short', 'ID-05', (d) => { d.seller.artist.wechatId = 'pris'; });
closes('Instagram left undecided', 'ID-06', (d) => { d.seller.artist.instagram = 'NEEDS-INPUT'; });
closes('Bluesky left undecided', 'ID-06', (d) => { d.seller.artist.bluesky = 'NEEDS-INPUT'; });
closes('the SAMR declaration paraphrased', 'LG-01', (d) => { d.seller.entities.individual.registration.selfDeclaration.zh = SAMR_ART12.replace('依法', ''); });
closes('Hong Kong entity active without its numbers', 'LG-02', (d) => { d.seller.activeEntity = 'hk-sole-prop'; });
closes('returns shortened to 7 days', 'LG-03', (d) => { d.seller.returns.windowDays = 7; });
closes('a pledge with no recipient', 'LG-04', (d) => { d.seller.donation.recipient = ''; });
closes('a pledge linking over http', 'LG-04', (d) => { d.seller.donation.recipientUrl = 'http://www.scf.org.cn/'; });
closes('the site on an example domain', 'ST-01', (d) => { d.site.url = 'https://sensocomune.example'; });
closes('the site over http', 'ST-01', (d) => { d.site.url = 'http://sensocomune.art'; });
closes('a header control still a placeholder', 'SH-01', (d) => { d.site.placeholders.routes = { cart: '/cart/' }; });
closes('every work sold', 'WK-01', (d) => { d.artworks.works.forEach((w) => { w.sold = true; }); });
closes('a title left as TODO', 'WK-02', (d) => { d.artworks.works[0].title.en = 'TODO'; });
closes('alt text as an ellipsis', 'WK-03', (d) => { d.artworks.works[2].alt.zh = '…'; });
closes('a description with lorem ipsum', 'WK-04', (d) => { d.artworks.works[1].description.en = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'; });
closes('a price of zero', 'WK-05', (d) => { d.artworks.works[0].priceUSD = 0; });
closes('a currency that is not ISO 4217', 'WK-05', (d) => { d.artworks.currency = 'Dollars'; });
closes('a negative width', 'WK-06', (d) => { d.artworks.works[0].widthCm = -40; });
closes('a work dated next year', 'WK-06', (d) => { d.artworks.works[0].year = 2027; });
closes('a payment link over http', 'WK-07', (d) => { d.artworks.works[0].checkoutUrl = 'http://paypal.me/priscilla'; });
closes('a work for sale still showing its placeholder photograph', 'WK-08', (d) => { d.views[d.artworks.works[0].image].placeholder = true; });
closes('a real view photograph with no description', 'WK-09', (d) => { const w = d.artworks.works[0]; d.views[`${w.image}-detail`].placeholder = false; });
closes('no way to pay on the active entity', 'PY-01', (d) => { d.seller.entities.individual.checkout.methods = []; });
closes('the cart live with no transaction ceiling', 'PY-02', (d) => { d.seller.entities.individual.checkout.maxTransactionUSD = 'NEEDS-INPUT'; });
closes('a placeholder in a field no rule names', 'GN-01', (d) => { d.site.about.paragraphs.en[0] = 'NEEDS-INPUT'; });

/* ---------- conditions ---------- */
test('the transaction ceiling is not required while the cart is a placeholder', () => {
  const d = ready(); d.site.placeholders.routes = { cart: '/cart/' };
  d.seller.entities.individual.checkout.maxTransactionUSD = 'NEEDS-INPUT';
  const r = assess(d);
  return { ok: !r.blockers.some((b) => b.rule === 'PY-02' || b.path.endsWith('maxTransactionUSD')), detail: r.blockers.map((b) => b.rule).join(',') };
});
test('a pledge of 0% needs no recipient', () => {
  const d = ready(); d.seller.donation.percentOfProfit = 0; d.seller.donation.recipient = 'NEEDS-INPUT'; d.seller.donation.recipientUrl = 'NEEDS-INPUT';
  return assess(d).ready;
});

/* ---------- waivers ---------- */
const waiver = (x) => ({ rule: 'SH-01', reason: 'Search ships next release', approvedBy: 'Priscilla', expires: '2026-12-31', ...x });
test('a valid waiver opens the gate for that blocker, and is reported', () => {
  const d = ready(); d.site.placeholders.routes = { search: '/search/' }; d.waivers = [waiver()];
  const r = assess(d);
  return { ok: r.ready && r.waived.length === 1, detail: `ready ${r.ready}, waived ${r.waived.length}` };
});
test('an expired waiver does not', () => {
  const d = ready(); d.site.placeholders.routes = { search: '/search/' }; d.waivers = [waiver({ expires: '2026-09-16' })];
  const r = assess(d);
  return { ok: !r.ready && r.invalidWaivers[0]?.why.startsWith('expired'), detail: r.invalidWaivers[0]?.why };
});
test('an unsigned waiver does not', () => {
  const d = ready(); d.site.placeholders.routes = { search: '/search/' }; d.waivers = [waiver({ approvedBy: '' })];
  return !assess(d).ready;
});
test('a waiver aimed at a rule that cannot be waived closes the gate itself', () => {
  const d = ready(); d.waivers = [waiver({ rule: 'WK-05' })];
  const r = assess(d);
  return { ok: !r.ready && r.invalidWaivers[0]?.why === 'this rule cannot be waived', detail: r.invalidWaivers[0]?.why };
});
test('a waiver scoped to one path does not cover another', () => {
  const d = ready(); d.site.placeholders.routes = { search: '/search/', cart: '/cart/' };
  d.waivers = [waiver({ path: 'site.placeholders.routes.search' })];
  const r = assess(d);
  return { ok: !r.ready && r.blockers.some((b) => b.path === 'site.placeholders.routes.cart'), detail: r.blockers.map((b) => b.path).join(',') };
});

/* ---------- the live data is honestly not ready ---------- */
test('today\'s data does not pass', () => !assess({
  site: j('src/data/site.json'), seller: j('src/data/seller.json'), artworks: j('src/data/artworks.json'),
  views: j('public/img/views.json'), waivers: j('src/data/readiness-waivers.json').waivers, today: TODAY,
}).ready);

/* ---------- report ---------- */
let failed = 0;
console.log('\n  READINESS GATE — it opens only when it should\n');
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok || !r.detail ? '' : `  — ${r.detail}`}`);
}
console.log(`\n  ${results.length} tests.`);
if (failed) { console.log(`  ${failed} FAILED.\n`); process.exit(1); }
console.log('  All pass.\n');
