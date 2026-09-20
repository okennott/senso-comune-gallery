/**
 * Site readiness — the rules that decide whether the site may go live.
 *
 *   import { assess } from './readiness.mjs'
 *
 * A pure function over the data. It reads nothing and writes nothing, so the
 * build, the command-line report and the tests all ask the same question and
 * get the same answer (report, "Readiness").
 *
 * WHY NOT JUST SEARCH FOR "NEEDS-INPUT"
 * A word search passes an empty string, `test@example.com`, a phone number
 * missing its country code, a price of 0, a placeholder photograph, and a
 * disclosure someone "tidied". So every critical field has a rule that checks
 * the VALUE, and the word search stays underneath as a backstop for any field
 * no rule knows about yet.
 *
 * THREE IDEAS
 *   severity   blocker — the release build refuses to run.
 *              warning — reported, never blocks.
 *   when       some fields only matter in some states: Hong Kong registration
 *              numbers only while that entity is active; a transaction ceiling
 *              only once the cart takes payments.
 *   waivable   a blocker may be waived for a stated reason, by a named person,
 *              until a date (readiness-waivers.json). Legal identity, the
 *              registration disclosure, prices and photographs cannot be.
 *              An expired waiver is no waiver.
 *
 * UNDECIDED IS NOT DECLINED
 * An optional field (Instagram, 小红书) may be left out — by setting it to "".
 * Left as NEEDS-INPUT it is undecided, and that blocks: someone has to choose.
 */

export const PLACEHOLDER = 'NEEDS-INPUT';

/** SAMR Order 37, Art. 12. Quoted verbatim from the rule; never paraphrased. */
export const SAMR_ART12 = '个人从事零星小额交易活动，依法不需要办理市场主体登记';

/* ------------------------------------------------------------ validators */

/** The HTML Standard's definition of a valid email address — a deliberate,
 *  practical subset of RFC 5322, and what every browser's type=email uses. */
const EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** Names reserved so they can never be real (RFC 2606, RFC 6761). An address
 *  or site on one of these is an example that was never replaced. */
const RESERVED_DOMAIN = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost)$/i;

/** Text that is a placeholder in all but name. */
const PLACEHOLDERISH = /\b(TODO|TBD|FIXME|XXX+|lorem ipsum|placeholder)\b|^\s*(…|\.\.\.|-|n\/a)\s*$/i;

/** E.164: a country code and at most 15 digits in all. Spaces, dots, dashes
 *  and brackets are allowed for reading; the leading + is not optional. */
const E164 = (s) => /^\+[\d\s().-]+$/.test(s) && (s.replace(/\D/g, '').length >= 8) && (s.replace(/\D/g, '').length <= 15);

/** WeChat ID: 6-20 characters of letters, digits, underscores and hyphens,
 *  beginning with a letter (WeChat Help Center). */
const WECHAT_ID = /^[A-Za-z][A-Za-z0-9_-]{5,19}$/;

const ISO4217 = /^[A-Z]{3}$/;

const isPlaceholder = (v) => v === PLACEHOLDER;
const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const text = (v, min = 1) => typeof v === 'string' && !isPlaceholder(v) && !PLACEHOLDERISH.test(v) && v.trim().length >= min;

const httpsUrl = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !RESERVED_DOMAIN.test(u.hostname) && !/^(\d+\.){3}\d+$/.test(u.hostname);
  } catch { return false; }
};

/* ----------------------------------------------------------------- rules */

/* Each rule: id, area, title, severity, waivable, basis (why it matters),
   fix (what to do), and check(ctx) → [{ path, message }] for every failure.
   `when(ctx)` limits a rule to the states where it applies. */
export const RULES = [

  /* ---------- identity and contact ---------- */
  {
    id: 'ID-01', area: 'Identity and contact', severity: 'blocker', waivable: false,
    title: 'A real email address',
    basis: 'EU Consumer Rights Directive, Art. 6(1)(c); E-Commerce Directive, Art. 5(1)(c)',
    fix: 'Set seller.contact.email to the address buyers will write to.',
    check: ({ seller }) => {
      const e = seller.contact?.email;
      if (!text(e)) return [{ path: 'seller.contact.email', message: 'missing' }];
      if (!EMAIL.test(e)) return [{ path: 'seller.contact.email', message: `"${e}" is not a valid email address` }];
      if (RESERVED_DOMAIN.test(e.split('@')[1])) return [{ path: 'seller.contact.email', message: `"${e}" uses a reserved example domain` }];
      return [];
    },
  },
  {
    id: 'ID-02', area: 'Identity and contact', severity: 'blocker', waivable: false,
    title: 'A telephone number in international form',
    basis: 'EU Consumer Rights Directive, Art. 6(1)(c); ITU-T E.164',
    fix: 'Set seller.contact.phone with its country code, e.g. "+86 138 0000 0000".',
    check: ({ seller }) => {
      const p = seller.contact?.phone;
      if (!text(String(p ?? ''))) return [{ path: 'seller.contact.phone', message: 'missing' }];
      if (!E164(String(p))) return [{ path: 'seller.contact.phone', message: `"${p}" is not an international number (+, country code, at most 15 digits)` }];
      return [];
    },
  },
  {
    id: 'ID-03', area: 'Identity and contact', severity: 'blocker', waivable: false,
    title: 'A geographical address, in both languages',
    basis: 'EU Consumer Rights Directive, Art. 6(1)(c)',
    fix: 'Set seller.contact.address.en and .zh to the address the business is run from.',
    check: ({ seller }) => ['en', 'zh'].flatMap((l) => (text(seller.contact?.address?.[l], 8)
      ? [] : [{ path: `seller.contact.address.${l}`, message: 'missing or too short to be an address' }])),
  },
  {
    id: 'ID-04', area: 'Identity and contact', severity: 'blocker', waivable: false,
    title: 'The trader and the site are named',
    basis: 'EU Consumer Rights Directive, Art. 6(1)(b)',
    fix: 'Set seller.artist.name and seller.artist.siteName in both languages.',
    check: ({ seller }) => [['name', seller.artist?.name], ['siteName', seller.artist?.siteName]]
      .flatMap(([k, v]) => ['en', 'zh'].filter((l) => !text(v?.[l])).map((l) => ({ path: `seller.artist.${k}.${l}`, message: 'missing' }))),
  },
  {
    id: 'ID-05', area: 'Identity and contact', severity: 'blocker', waivable: true,
    title: 'A WeChat ID for buyers in mainland China',
    basis: 'The domestic contact channel: Instagram is unreachable in mainland China (report, Summary)',
    fix: 'Set seller.artist.wechatId: 6-20 letters, digits, _ or -, starting with a letter.',
    check: ({ seller }) => {
      const w = seller.artist?.wechatId;
      if (!text(w)) return [{ path: 'seller.artist.wechatId', message: 'missing' }];
      if (!WECHAT_ID.test(w)) return [{ path: 'seller.artist.wechatId', message: `"${w}" is not a valid WeChat ID` }];
      return [];
    },
  },
  {
    id: 'ID-06', area: 'Identity and contact', severity: 'blocker', waivable: true,
    title: 'Optional channels are decided: supplied, or left out on purpose',
    basis: 'Undecided is not declined: an empty string removes the channel from the site',
    fix: 'Set each of seller.artist.instagram, .facebook, .x, .bluesky and .xiaohongshu to the handle, or to "" to leave that channel off. Until then its mark in the footer links to the site\'s 404 page.',
    check: ({ seller }) => ['instagram', 'facebook', 'x', 'bluesky', 'xiaohongshu'].flatMap((k) => {
      const v = seller.artist?.[k];
      if (v === '') return [];
      if (isPlaceholder(v) || v === undefined) return [{ path: `seller.artist.${k}`, message: 'undecided — supply it, or set "" to leave it off' }];
      if (!/^[\w.-]{2,40}$/.test(v)) return [{ path: `seller.artist.${k}`, message: `"${v}" does not look like a handle` }];
      return [];
    }),
  },

  {
    /* The portrait is the one photograph on the site that is not a painting.
       It is editorial, not legal, so nothing here blocks a release: the
       release build simply leaves the frame out while there is no master
       (build.js, portraitShown), exactly as WK-10 leaves out an unshot view,
       and this rule is the line in the report that says so. What DOES block
       is a portrait that ships undescribed — the moment the photograph is
       real, so is 1.1.1. */
    id: 'ID-07', area: 'Identity and contact', severity: 'blocker', waivable: false,
    title: 'The artist\'s portrait is described',
    basis: 'WCAG 2.2, 1.1.1 Non-text Content',
    fix: 'Set site.about.portrait.alt.en and .zh to what the photograph shows.',
    owns: [/^site\.about\.portrait\.alt\./],
    when: ({ views }) => views.portrait?.placeholder === false,
    check: ({ site }) => ['en', 'zh'].filter((l) => !text(site.about?.portrait?.alt?.[l], 3))
      .map((l) => ({ path: `site.about.portrait.alt.${l}`, message: 'missing' })),
  },
  {
    id: 'ID-08', area: 'Identity and contact', severity: 'warning', waivable: true,
    title: 'A portrait without a photograph is left out of the live site',
    basis: 'The release build shows the frame only when the photograph exists; an empty mat is not a portrait',
    fix: 'Add masters/portrait.jpg and run npm run build:images to show it.',
    check: ({ views }) => (views.portrait?.placeholder === false ? []
      : [{ path: 'masters/portrait.jpg', message: 'the portrait frame will be omitted from About' }]),
  },

  /* ---------- legal ---------- */
  {
    id: 'LG-01', area: 'Legal', severity: 'blocker', waivable: false,
    title: 'The registration disclosure is exactly the rule\'s wording',
    basis: 'PRC E-Commerce Law, Art. 15 (shown continuously on the homepage); SAMR Order 37, Art. 12',
    fix: 'Restore selfDeclaration.zh in seller.json to the verbatim text. It is quoted from the rule and may not be paraphrased.',
    when: ({ entity }) => entity.id === 'individual',
    check: ({ entity }) => (entity.registration?.selfDeclaration?.zh === SAMR_ART12
      ? [] : [{ path: 'seller.entities.individual.registration.selfDeclaration.zh', message: 'differs from SAMR Order 37 Art. 12' }]),
  },
  {
    id: 'LG-02', area: 'Legal', severity: 'blocker', waivable: false,
    title: 'Hong Kong registration numbers, while that entity is active',
    basis: 'PRC E-Commerce Law, Art. 15 — business licence information shown on the homepage',
    fix: 'Set businessRegistrationNo and businessLicenceNo for hk-sole-prop.',
    when: ({ entity }) => entity.id === 'hk-sole-prop',
    check: ({ entity }) => ['businessRegistrationNo', 'businessLicenceNo']
      .filter((k) => !text(String(entity.registration?.[k] ?? ''), 4))
      .map((k) => ({ path: `seller.entities.hk-sole-prop.registration.${k}`, message: 'missing' })),
  },
  {
    id: 'LG-03', area: 'Legal', severity: 'blocker', waivable: false,
    title: 'Returns are open for at least 14 days',
    basis: 'EU Consumer Rights Directive, Art. 9(1): a 14-day withdrawal period',
    fix: 'Set seller.returns.windowDays to 14 or more.',
    check: ({ seller }) => (Number(seller.returns?.windowDays) >= 14
      ? [] : [{ path: 'seller.returns.windowDays', message: `${seller.returns?.windowDays} days is below the 14-day minimum` }]),
  },
  {
    id: 'LG-04', area: 'Legal', severity: 'blocker', waivable: false,
    owns: [/^seller\.donation\.(recipient|recipientUrl)$/],
    title: 'A published donation pledge names its recipient',
    basis: 'A public charitable claim with no named recipient cannot be verified by the buyer it persuades',
    fix: 'Set seller.donation.recipient and a https recipientUrl, or set percentOfProfit to 0.',
    when: ({ seller }) => Number(seller.donation?.percentOfProfit) > 0,
    check: ({ seller }) => [
      ...(text(seller.donation.recipient, 2) ? [] : [{ path: 'seller.donation.recipient', message: 'missing' }]),
      ...(httpsUrl(seller.donation.recipientUrl) ? [] : [{ path: 'seller.donation.recipientUrl', message: 'missing or not a https address' }]),
    ],
  },

  /* ---------- the site ---------- */
  {
    id: 'ST-01', area: 'The site', severity: 'blocker', waivable: false,
    title: 'The site\'s real address',
    basis: 'Every canonical link, link preview and the sitemap are built from it',
    fix: 'Set site.url in site.json to the live https origin, with no path.',
    check: ({ site }) => {
      try {
        const u = new URL(site.url);
        if (u.protocol !== 'https:') return [{ path: 'site.url', message: 'must be https' }];
        if (RESERVED_DOMAIN.test(u.hostname)) return [{ path: 'site.url', message: `"${u.hostname}" is a reserved example domain` }];
        if (u.pathname !== '/' || u.search || u.hash) return [{ path: 'site.url', message: 'must be an origin only, with no path' }];
        return [];
      } catch { return [{ path: 'site.url', message: 'not a valid address' }]; }
    },
  },
  {
    id: 'SH-01', area: 'The site', severity: 'blocker', waivable: true,
    title: 'No header control leads to a page that does not exist',
    basis: 'Search, account and cart are placeholders by decision (report, Part 6, decision D1): each click lands on the 404',
    fix: 'Build the page and remove its route from site.json → placeholders.routes, or waive this until it is built.',
    check: ({ site }) => Object.entries(site.placeholders?.routes ?? {})
      .map(([role, route]) => ({ path: `site.placeholders.routes.${role}`, message: `${route} is still a placeholder` })),
  },

  /* ---------- works and prices ---------- */
  {
    id: 'WK-01', area: 'Works and prices', severity: 'blocker', waivable: false,
    title: 'At least one work is for sale',
    basis: 'A shop with nothing to sell is not ready',
    fix: 'Add a work, or set sold to false on one that is available.',
    check: ({ works }) => (works.some((w) => !w.sold) ? [] : [{ path: 'artworks.works', message: 'no available works' }]),
  },
  {
    id: 'WK-02', area: 'Works and prices', severity: 'blocker', waivable: false,
    title: 'Every work has a title in both languages',
    basis: 'EU Consumer Rights Directive, Art. 6(1)(a): main characteristics',
    fix: 'Set title.en and title.zh.',
    check: ({ works }) => works.flatMap((w, i) => ['en', 'zh'].filter((l) => !text(w.title?.[l]))
      .map((l) => ({ path: `artworks.works[${i}].title.${l}`, message: `${w.slug}: missing` }))),
  },
  {
    id: 'WK-03', area: 'Works and prices', severity: 'blocker', waivable: false,
    title: 'Every photograph has a text alternative in both languages',
    basis: 'WCAG 2.2, 1.1.1 Non-text Content',
    fix: 'Set alt.en and alt.zh: what the painting shows, in about 15 words.',
    check: ({ works }) => works.flatMap((w, i) => ['en', 'zh'].filter((l) => !text(w.alt?.[l], 3))
      .map((l) => ({ path: `artworks.works[${i}].alt.${l}`, message: `${w.slug}: missing` }))),
  },
  {
    id: 'WK-04', area: 'Works and prices', severity: 'blocker', waivable: true,
    title: 'Every work is described in both languages',
    basis: 'The description is what a buyer reads instead of standing in front of the work',
    fix: 'Set description.en and description.zh (80-250 words of observation).',
    check: ({ works }) => works.flatMap((w, i) => ['en', 'zh'].filter((l) => !text(w.description?.[l], 20))
      .map((l) => ({ path: `artworks.works[${i}].description.${l}`, message: `${w.slug}: missing or too short` }))),
  },
  {
    id: 'WK-05', area: 'Works and prices', severity: 'blocker', waivable: false,
    title: 'Every price is a real amount, in a real currency',
    basis: 'EU Consumer Rights Directive, Art. 6(1)(e): the total price',
    fix: 'Set priceUSD to a positive amount, and artworks.currency to an ISO 4217 code.',
    check: ({ works, artworks }) => [
      ...(ISO4217.test(artworks.currency ?? '') ? [] : [{ path: 'artworks.currency', message: `"${artworks.currency}" is not an ISO 4217 code` }]),
      ...works.flatMap((w, i) => (Number.isFinite(w.priceUSD) && w.priceUSD > 0
        ? [] : [{ path: `artworks.works[${i}].priceUSD`, message: `${w.slug}: ${w.priceUSD} is not a positive amount` }])),
    ],
  },
  {
    id: 'WK-06', area: 'Works and prices', severity: 'blocker', waivable: false,
    title: 'Every work has real dimensions and a plausible year',
    basis: 'EU Consumer Rights Directive, Art. 6(1)(a); the scale diagram is drawn from them',
    fix: 'Set widthCm and heightCm to positive numbers, and year to the year it was made.',
    check: ({ works, today }) => works.flatMap((w, i) => [
      ...['widthCm', 'heightCm'].filter((k) => !(Number(w[k]) > 0)).map((k) => ({ path: `artworks.works[${i}].${k}`, message: `${w.slug}: not a positive size` })),
      ...((w.year >= 1900 && w.year <= today.getFullYear()) ? [] : [{ path: `artworks.works[${i}].year`, message: `${w.slug}: ${w.year} is not a plausible year` }]),
    ]),
  },
  {
    id: 'WK-07', area: 'Works and prices', severity: 'blocker', waivable: false,
    title: 'A payment link, where given, is a real https address',
    basis: 'A buyer\'s payment must not go to a malformed or unencrypted address',
    fix: 'Set checkoutUrl to the provider\'s https link, or to "" to sell by enquiry.',
    check: ({ works }) => works.flatMap((w, i) => (w.checkoutUrl === '' || httpsUrl(w.checkoutUrl)
      ? [] : [{ path: `artworks.works[${i}].checkoutUrl`, message: `${w.slug}: "${w.checkoutUrl}" is not a https address` }])),
  },
  {
    id: 'WK-08', area: 'Photography', severity: 'blocker', waivable: false,
    title: 'Every work for sale has its real photograph',
    basis: 'The photograph is the product; a placeholder card is not a painting',
    fix: 'Put the photograph in masters/{image}.jpg and run npm run build:images.',
    check: ({ works, views }) => works.filter((w) => !w.sold).flatMap((w) => (views[w.image] && views[w.image].placeholder === false
      ? [] : [{ path: `masters/${w.image}.jpg`, message: `${w.slug}: still a placeholder` }])),
  },
  {
    id: 'WK-09', area: 'Photography', severity: 'blocker', waivable: false,
    title: 'Every view that has a photograph is described',
    basis: 'WCAG 2.2, 1.1.1 Non-text Content',
    fix: 'Set views[].alt.en and .zh for each view whose file exists.',
    check: ({ works, views }) => works.flatMap((w, i) => (w.views ?? []).flatMap((v, k) => {
      const real = views[`${w.image}-${v.kind}`]?.placeholder === false;
      return real ? ['en', 'zh'].filter((l) => !text(v.alt?.[l], 3))
        .map((l) => ({ path: `artworks.works[${i}].views[${k}].alt.${l}`, message: `${w.slug} ${v.kind}: missing` })) : [];
    })),
  },
  {
    id: 'WK-10', area: 'Photography', severity: 'warning', waivable: true,
    title: 'Views without a photograph are left out of the live site',
    basis: 'The release build shows only views whose files exist; a placeholder view never goes live',
    fix: 'Add masters/{image}-{kind}.jpg (or -video.mp4) to show that view.',
    check: ({ works, views }) => works.flatMap((w) => (w.views ?? [])
      .filter((v) => views[`${w.image}-${v.kind}`]?.placeholder !== false)
      .map((v) => ({ path: `masters/${w.image}-${v.kind}.${v.kind === 'video' ? 'mp4' : 'jpg'}`, message: `${w.slug}: ${v.kind} will be omitted` }))),
  },

  /* ---------- payments ---------- */
  {
    id: 'PY-01', area: 'Payments', severity: 'blocker', waivable: false,
    title: 'The active entity offers a way to pay, and says so',
    basis: 'EU Consumer Rights Directive, Art. 6(1)(g): arrangements for payment',
    fix: 'Give the active entity at least one checkout method and a note in both languages.',
    check: ({ entity }) => [
      ...((entity.checkout?.methods ?? []).length ? [] : [{ path: `seller.entities.${entity.id}.checkout.methods`, message: 'none' }]),
      ...['en', 'zh'].filter((l) => !text(entity.checkout?.note?.[l], 10)).map((l) => ({ path: `seller.entities.${entity.id}.checkout.note.${l}`, message: 'missing' })),
    ],
  },
  {
    id: 'PY-02', area: 'Payments', severity: 'blocker', waivable: false,
    owns: [/^seller\.entities\.[\w-]+\.checkout\.maxTransactionUSD$/],
    title: 'A transaction ceiling, once the cart takes payments',
    basis: 'Decision D3: any number of works, limited by the largest single transaction the route accepts',
    fix: 'Set checkout.maxTransactionUSD on the active entity to the provider\'s confirmed figure.',
    when: ({ site }) => !('cart' in (site.placeholders?.routes ?? {})),
    check: ({ entity }) => (Number(entity.checkout?.maxTransactionUSD) > 0
      ? [] : [{ path: `seller.entities.${entity.id}.checkout.maxTransactionUSD`, message: 'missing' }]),
  },
  {
    id: 'PY-03', area: 'Payments', severity: 'warning', waivable: true,
    title: 'Some works can be paid for directly',
    basis: 'With no payment links, every sale goes through an enquiry',
    fix: 'Add a checkoutUrl to works as payment links are created.',
    check: ({ works }) => (works.filter((w) => !w.sold).some((w) => w.checkoutUrl)
      ? [] : [{ path: 'artworks.works[].checkoutUrl', message: 'no available work has a payment link — enquiry only' }]),
  },

  /* ---------- the backstop ---------- */
  {
    id: 'GN-01', area: 'Anything else', severity: 'blocker', waivable: false,
    title: 'No placeholder text anywhere the site reads',
    basis: 'A backstop for fields no specific rule covers yet',
    fix: 'Replace the value, or set an optional field to "".',
    check: (ctx) => {
      const found = [];
      // Paths a conditional rule governs belong to that rule, whether or not it
      // applies right now — otherwise the backstop would block on a field its
      // own rule has deliberately set aside (a transaction ceiling before there
      // is a cart).
      const owned = RULES.flatMap((r) => r.owns ?? []);
      const walk = (v, path) => {
        if (owned.some((re) => re.test(path))) return;
        // a view with no photograph is left out of the release (WK-10), so what
        // it would have said does not block
        const vm = path.match(/^artworks\.works\[(\d+)\]\.views\[(\d+)\]/);
        if (vm) {
          const w = ctx.works[vm[1]], view = w?.views?.[vm[2]];
          if (view && ctx.views[`${w.image}-${view.kind}`]?.placeholder !== false) return;
        }
        if (typeof v === 'string') {
          if (isPlaceholder(v) || PLACEHOLDERISH.test(v)) found.push({ path, message: `"${v.slice(0, 40)}"` });
          return;
        }
        if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
        if (v && typeof v === 'object') {
          for (const [k, x] of Object.entries(v)) {
            if (k.startsWith('$')) continue;                       // comments
            if (path === 'seller.entities' && k !== ctx.entity.id) continue;   // inactive entity
            walk(x, `${path}.${k}`);
          }
        }
      };
      walk(ctx.site, 'site'); walk(ctx.seller, 'seller'); walk(ctx.artworks, 'artworks');
      return found;
    },
  },
];

/* ------------------------------------------------------------- assessment */

/**
 * @returns {{ ready, blockers, warnings, waived, invalidWaivers, rules }}
 *   ready — true only when no un-waived blocker remains.
 */
export function assess({ site, seller, artworks, views = {}, waivers = [], today = new Date() }) {
  const entity = { id: seller.activeEntity, ...seller.entities[seller.activeEntity] };
  const works = artworks.works ?? [];
  const ctx = { site, seller, artworks, works, views, entity, today };

  const day = today.toISOString().slice(0, 10);
  const invalidWaivers = [];
  const liveWaivers = waivers.filter((w) => {
    const rule = RULES.find((r) => r.id === w.rule);
    const why = !rule ? 'no such rule'
      : !rule.waivable ? 'this rule cannot be waived'
      : !w.reason || !w.approvedBy ? 'a waiver needs a reason and a name'
      : !/^\d{4}-\d{2}-\d{2}$/.test(w.expires ?? '') ? 'a waiver needs an expiry date (YYYY-MM-DD)'
      : w.expires < day ? `expired on ${w.expires}` : null;
    if (why) invalidWaivers.push({ ...w, why });
    return !why;
  });

  const blockers = [], warnings = [], waived = [];
  for (const rule of RULES) {
    if (rule.when && !rule.when(ctx)) continue;
    for (const f of rule.check(ctx)) {
      const item = { rule: rule.id, area: rule.area, title: rule.title, basis: rule.basis, fix: rule.fix, ...f };
      if (rule.severity === 'warning') { warnings.push(item); continue; }
      const w = liveWaivers.find((x) => x.rule === rule.id && (!x.path || x.path === f.path));
      if (w) waived.push({ ...item, waiver: w });
      else blockers.push(item);
    }
  }
  // The backstop reports only what no specific rule already has: one problem,
  // one line, with the more useful message.
  const named = new Set([...blockers, ...waived, ...warnings].filter((x) => x.rule !== 'GN-01').map((x) => x.path));
  const dedupe = (list) => list.filter((x) => x.rule !== 'GN-01' || !named.has(x.path));
  const b = dedupe(blockers), w = dedupe(waived);
  return { ready: b.length === 0 && invalidWaivers.length === 0, blockers: b, warnings, waived: w, invalidWaivers, rules: RULES.length };
}
