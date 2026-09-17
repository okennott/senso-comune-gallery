/**
 * Templates. Plain template literals — no engine, no framework.
 *
 * The report's architectural conclusion was that everything this site needs is
 * static HTML plus one small build script, and that adopting a framework would
 * contradict its own aesthetic argument. This is that build script's half.
 */

import { markSvg } from '../scripts/mark.mjs';

/* ---------- helpers ---------- */

export const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
           .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Pick a localised value from {en, zh}. */
export const t = (field, loc) =>
  (field && typeof field === 'object' ? (field[loc] ?? field.en ?? '') : (field ?? ''));

/** cm → inches, rounded to the nearest 1/4 and rendered with true fractions. */
export function inches(cm) {
  const raw = cm / 2.54;
  const q = Math.round(raw * 4) / 4;
  const whole = Math.floor(q);
  const frac = q - whole;
  const glyph = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' }[frac] ?? '';
  return `${whole}${glyph}`;
}

/** "50 × 40 cm (19¾ × 15¾ in)" — true multiplication sign, height × width. */
export const dims = (w) =>
  `${w.heightCm} × ${w.widthCm} cm (${inches(w.heightCm)} × ${inches(w.widthCm)} in)`;

export const money = (n, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);

/** Deployment base path. Empty for a domain root (the production target);
 *  set to e.g. "/senso-comune-gallery" for a GitHub Pages project site, which
 *  serves from a subpath rather than the origin root. */
export const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '');

/* PREVIEW=1 marks a build that is not the shop: the GitHub Pages layout
   preview. It must not be indexed — it is full of placeholders and its
   canonicals point at github.io — and robots.txt cannot say so, because
   crawlers only read it at the host root, never under /<repo>/. So every page
   carries the meta tag instead. check-links.mjs asserts it is present exactly
   when PREVIEW is set: a noindex that leaked into production would delist the
   real site without a single error. */
export const PREVIEW = process.env.PREVIEW === '1';

/** Locale-aware path: en has no prefix, zh sits under /zh. */
export const path = (loc, site, p = '/') => {
  const prefix = site.locales[loc].prefix;
  const joined = (BASE + prefix + p).replace(/\/{2,}/g, '/');
  return joined || '/';
};

/** Absolute-from-root asset URL, base-aware. */
export const asset = (p) => (BASE + p).replace(/\/{2,}/g, '/');

/* ---------- scale diagram (N-06) ----------
   Artsy's production "View in Room" is ~120 lines of CSS compositing with no
   AR and no library, calibrated by one hard-coded constant pair, and it leaves
   an "8 ft" bar visible — which reframes it as a diagram rather than a
   photo-real mock-up. That is the on-brand move for a quiet editorial site,
   and it is what this draws.

   Museum hang height is 144.78 cm (57 in) to the centre of the work.        */
const PX_PER_CM = 2;
const WALL_CM = 243.84;          // 8 ft
const SOFA_W_CM = 213;           // typical 3-seat
const SOFA_H_CM = 80;
const EYE_CM = 144.78;           // centre of the work

export function scaleSvg(w, ui, loc) {
  const H = WALL_CM * PX_PER_CM + 40;
  const W = 620;
  const floor = WALL_CM * PX_PER_CM + 20;

  const pw = w.widthCm * PX_PER_CM;
  const ph = w.heightCm * PX_PER_CM;
  const px = (W - pw) / 2;
  const py = floor - EYE_CM * PX_PER_CM - ph / 2;

  const sofaW = SOFA_W_CM * PX_PER_CM;
  const sofaH = SOFA_H_CM * PX_PER_CM;
  const sofaX = (W - sofaW) / 2;
  const sofaY = floor - sofaH;

  const label = t(ui.scaleCaption, loc);

  /* Finding B-03. This is the answer to Baymard's finding that 42% of buyers
     try to judge size from the page images — and it was drawn at 1.73:1 on
     cream, with 11px labels at 3.05:1. Both are below the floor for an
     informational graphic (SC 1.4.11 wants 3:1) and well below what anyone
     reads on a phone outdoors.

     The opacities are gone. Every value is now a token the contrast check
     already asserts: --muted-ui at 3.24:1 for structure, --muted at 4.90:1 for
     labels, --sanguine at 5.64:1 for the painting itself, which is the one
     thing in the drawing that should draw the eye. Type and family come from
     the stylesheet, because var() in an SVG presentation attribute is not
     reliable across engines. */
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" class="scale__svg">
  <g class="scale__struct" fill="none">
    <line x1="20" y1="${floor}" x2="${W - 20}" y2="${floor}"/>
    <path d="M${sofaX} ${floor} V${sofaY + 26} q0 -10 10 -10 H${sofaX + sofaW - 10} q10 0 10 10 V${floor}
             M${sofaX + 14} ${sofaY + 26} V${floor - 14} H${sofaX + sofaW - 14} V${sofaY + 26}"/>
    <line x1="${W - 44}" y1="${floor - WALL_CM * PX_PER_CM}" x2="${W - 44}" y2="${floor}"/>
    <line x1="${W - 50}" y1="${floor - WALL_CM * PX_PER_CM}" x2="${W - 38}" y2="${floor - WALL_CM * PX_PER_CM}"/>
    <line x1="${W - 50}" y1="${floor}" x2="${W - 38}" y2="${floor}"/>
  </g>
  <text class="scale__label" x="${W - 56}" y="${floor - WALL_CM * PX_PER_CM / 2}" text-anchor="end">244 cm · 8 ft</text>
  <rect class="scale__work" x="${px}" y="${py}" width="${pw}" height="${ph}"/>
  <g class="scale__dim" fill="none">
    <line x1="${px - 16}" y1="${py}" x2="${px - 16}" y2="${py + ph}"/>
    <line x1="${px - 21}" y1="${py}" x2="${px - 11}" y2="${py}"/>
    <line x1="${px - 21}" y1="${py + ph}" x2="${px - 11}" y2="${py + ph}"/>
  </g>
  <text class="scale__label scale__label--work" x="${px - 26}" y="${py + ph / 2}" text-anchor="end">${w.heightCm} cm</text>
</svg>`;
}


/* ---------- structured data (N-01) ----------
   schema.org/VisualArtwork carries both the art metadata and the sale.
   availability SoldOut is semantically correct for a unique work — OutOfStock
   implies a restock is possible.

   Note Artsy's own code deletes the entire Offer when the price is hidden,
   which is one more reason the price stays visible.                          */
export function jsonLd(w, site, seller, loc, origin) {
  const url = origin + path(loc, site, `/works/${w.slug}/`);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'VisualArtwork',
    name: t(w.title, loc),
    url,
    image: `${origin}/img/${w.image}-1600.webp`,
    dateCreated: String(w.year),
    artMedium: t(w.medium, loc),
    artform: 'Painting',
    artworkSurface: w.support,
    width:  { '@type': 'QuantitativeValue', value: w.widthCm,  unitCode: 'CMT' },
    height: { '@type': 'QuantitativeValue', value: w.heightCm, unitCode: 'CMT' },
    creator: { '@type': 'Person', name: t(seller.artist.name, loc) },
    offers: {
      '@type': 'Offer',
      price: w.priceUSD,
      priceCurrency: 'USD',
      availability: w.sold ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      url,
      seller: { '@type': 'Person', name: t(seller.artist.name, loc) },
    },
  };
  if (w.description && t(w.description, loc)) data.description = t(w.description, loc);
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

/* Open Graph wants language_TERRITORY, not a BCP-47 tag: "zh-CN" -> "zh_CN",
   and a bare "en" has no territory to give, so it takes the common default. */
const OG_LOCALE = { en: 'en_US', 'zh-CN': 'zh_CN' };
const ogLocale = (lang) => OG_LOCALE[lang] ?? lang.replace('-', '_');

/* Finding C-01. The tab, the home-screen icon and the browser chrome were all
   defaults. The mark is geometry, not letterforms, so one file serves both
   locales - see scripts/mark.mjs for why an "SC" monogram could not. */
const favicon = (asset) => `<link rel="icon" href="${asset('/icon.svg')}" type="image/svg+xml">
<link rel="icon" href="${asset('/favicon.ico')}" sizes="32x32">
<link rel="apple-touch-icon" href="${asset('/apple-touch-icon.png')}">
<link rel="manifest" href="${asset('/site.webmanifest')}">`;

/* The masthead sits ON the bar, which is the same colour the mark's wall would
   be, so the wall is drawn as an outline instead of a fill. Decorative: the
   link's own text is the accessible name, and a second one here would violate
   2.5.3 Label in Name. */
const MASTHEAD_MARK = markSvg({ wall: 'outline', tokens: true, className: 'wordmark__mark' });

/* The shop bar's icons: 24-unit, one stroke weight, drawn in currentColor so
   they take the bar's text colour and are checked with it. */
const icon = (d) => `<svg class="shopbar__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const SHOP_ICONS = {
  search:  icon('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
  account: icon('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>'),
  cart:    icon('<path d="M5.5 8h13l-1.1 12H6.6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
};

/* The long and short forms of the name, as the navigation does it (B-04):
   both are in the markup, CSS shows one, and whichever is visible is the
   link's accessible name. When the two are the same, as in Chinese, once. */
const wordmarkName = (seller, loc) => {
  const long = t(seller.artist.siteName, loc);
  const short = t(seller.artist.siteNameShort ?? seller.artist.siteName, loc);
  return long === short
    ? esc(long)
    : `<span class="wordmark__long">${esc(long)}</span><span class="wordmark__short">${esc(short)}</span>`;
};

/* ---------- document shell ---------- */
export function layout({ site, seller, loc, title, description, body, ogImage, ogImageAlt,
                         ogImageHeight, product, canonical, altLocales, bodyClass = '', noindex = false }) {
  const L = site.locales[loc];
  const ui = site.ui;
  const origin = process.env.SITE_URL || site.url;   // same source build.js uses for the sitemap

  const hreflang = altLocales
    .map(([l, href]) => `<link rel="alternate" hreflang="${site.locales[l].lang}" href="${esc(origin + href)}">`)
    .join('\n  ');

  // Nav entries are either same-page anchors ("#works") or real paths
  // ("/about/"). Anchors hang off the locale root; paths go through path().
  const navHref = (h) => (h.startsWith('#') ? path(loc, site, '/') + h : path(loc, site, h));
  // Finding B-04. Both labels ship; CSS shows one and hides the other, so the
  // accessible name is whichever is visible and SC 2.5.3 holds at either width.
  const nav = site.nav
    .map((n) => {
      const long = esc(t(n.label, loc));
      const abbr = esc(t(n.labelShort ?? n.label, loc));
      return `<a href="${esc(navHref(n.href))}">` +
             `<span class="nav__long">${long}</span>` +
             `<span class="nav__short">${abbr}</span></a>`;
    })
    .join('\n      ');

  /* Decision D1: search, account and cart. The destinations do not exist yet,
     so each link is marked data-placeholder and lands on the 404 page; the
     routes are declared in site.json, and check-links fails the build if a
     marked link starts resolving without the marker being removed. The icons
     are aria-hidden: each link's name is the word, which is what a screen
     reader announces and what voice control needs to match. */
  const shopLinks = Object.entries(site.placeholders.routes).map(([role, route]) => {
    const label = esc(t(ui[role], loc));
    const count = role === 'cart'
      ? `<span class="shopbar__count" data-cart-count hidden>0</span>` : '';
    return `<li><a class="shopbar__link" href="${esc(path(loc, site, route))}" data-placeholder="${role}">` +
           `${SHOP_ICONS[role]}<span class="visually-hidden">${label}</span>${count}</a></li>`;
  }).join('\n      ');

  const other = loc === 'en' ? 'zh' : 'en';
  const otherHref = altLocales.find(([l]) => l === other)?.[1] ?? path(other, site, '/');

  const entity = seller.entities[seller.activeEntity];
  const decl = entity.registration.selfDeclaration;

  return `<!doctype html>
<html lang="${L.lang}" dir="${L.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${PREVIEW || noindex ? '\n<meta name="robots" content="noindex, nofollow">' : ''}
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(origin + canonical)}">
  ${hreflang}
<link rel="alternate" hreflang="x-default" href="${esc(origin + (altLocales.find(([l]) => l === 'en')?.[1] ?? '/'))}">` : ''}
<meta property="og:type" content="${product ? 'product' : 'website'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${canonical ? `<meta property="og:url" content="${esc(origin + canonical)}">` : ''}
<meta property="og:site_name" content="${esc(t(seller.artist.siteName, loc))}">
<meta property="og:locale" content="${ogLocale(L.lang)}">
${altLocales.filter(([l]) => l !== loc).map(([l]) => `<meta property="og:locale:alternate" content="${ogLocale(site.locales[l].lang)}">`).join('\n')}
${product ? `<meta property="product:price:amount" content="${product.amount}">
<meta property="product:price:currency" content="${esc(product.currency)}">
<meta property="product:availability" content="${product.sold ? 'oos' : 'instock'}">` : ''}
${ogImage ? `<meta property="og:image" content="${esc(origin + ogImage)}">
<meta property="og:image:width" content="1600">
<meta property="og:image:height" content="${ogImageHeight ?? 1600}">
<meta property="og:image:alt" content="${esc(ogImageAlt ?? description)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image:alt" content="${esc(ogImageAlt ?? description)}">` : '<meta name="twitter:card" content="summary">'}
${favicon(asset)}
<meta name="theme-color" content="#3A2B22">
${loc === 'zh'
  ? `<link rel="preload" href="${asset('/fonts/notoserifsc-subset.woff2')}" as="font" type="font/woff2" crossorigin>`
  : `<link rel="preload" href="${asset('/fonts/fraunces-latin.woff2')}" as="font" type="font/woff2" crossorigin>`}
<link rel="preload" href="${asset('/fonts/inter-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('/styles.css')}">
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">${esc(t(ui.skipToContent, loc))}</a>

<header class="masthead">
  <div class="wrap masthead__inner">
    <a class="wordmark" href="${esc(path(loc, site, '/'))}">${MASTHEAD_MARK}<span class="wordmark__name">${wordmarkName(seller, loc)}</span></a>
    <nav class="nav" aria-label="${loc === 'zh' ? '主导航' : 'Main'}">
      ${nav}
    </nav>
    <span class="lang-rule" aria-hidden="true"></span>
    <a class="lang-switch" href="${esc(otherHref)}" lang="${site.locales[other].lang}" rel="alternate">${esc(t(ui.langSwitch, loc))}</a>
    <ul class="shopbar">
      ${shopLinks}
    </ul>
  </div>
</header>

<main id="main" tabindex="-1" class="sheet">
${body}
</main>

<div id="availability-live" role="status" aria-live="polite" class="visually-hidden"></div>

<footer class="footer">
  <div class="wrap footer__grid">
    <div>
      <p>${esc(t(seller.artist.siteName, loc))} — ${esc(t(site.footer.rights, loc))}</p>
      <p>
        ${esc(t(seller.contact.address, loc))}<br>
        <a href="mailto:${esc(seller.contact.email)}">${esc(seller.contact.email)}</a><br>
        <a href="tel:${esc(String(seller.contact.phone).replace(/\s+/g, ''))}">${esc(seller.contact.phone)}</a>
      </p>
    </div>
    <ul>
      ${site.footer.links.map((l) => `<li><a href="${esc(path(loc, site, l.href))}">${esc(t(l.label, loc))}</a></li>`).join('\n      ')}
    </ul>
    <ul>
      <li><a href="https://instagram.com/${esc(seller.artist.instagram)}" rel="me noopener">Instagram</a></li>
      <li><span>WeChat: ${esc(seller.artist.wechatId)}</span></li>
      <li><span>小红书: ${esc(seller.artist.xiaohongshu)}</span></li>
    </ul>
  </div>
  ${decl ? `<div class="wrap"><p class="legal-declaration" lang="zh-CN">${esc(decl.zh)}</p>
  <p class="legal-declaration" style="border:0;margin-top:0;padding-top:0">${esc(decl.en)}</p></div>` : ''}
</footer>
<script src="${asset('/availability.js')}" defer></script>
</body>
</html>`;
}
