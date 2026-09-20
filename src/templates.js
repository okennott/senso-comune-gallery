/**
 * Templates. Plain template literals — no engine, no framework.
 *
 * The report's architectural conclusion was that everything this site needs is
 * static HTML plus one small build script, and that adopting a framework would
 * contradict its own aesthetic argument. This is that build script's half.
 */

import { readFileSync } from 'node:fs';

/* ---------- helpers ---------- */

export const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
           .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** A field still owed. The build flags it wherever it reaches a page, and the
 *  readiness gate refuses a release build while any remains. */
export const PLACEHOLDER = 'NEEDS-INPUT';

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

/* RELEASE=1 is the only build that is the shop (report, "Readiness").

   Every other build is a PREVIEW, by default and not by opt-in — a gate that
   has to be remembered fails the day it is forgotten. A preview carries
   noindex on every page (robots.txt is not read under a subpath), a ribbon
   saying it is a preview, and, while any critical detail is still owed,
   purchase buttons that cannot be used.

   A release build runs the readiness gate first and refuses to start while
   anything blocks, so an unready site cannot be produced in release form at
   all. check-links asserts both halves: noindex and the ribbon on every
   preview page; neither, and no placeholder anywhere, in a release. */
export const RELEASE = process.env.RELEASE === '1';
export const PREVIEW = !RELEASE;

/* The gate's verdict, set once by build.js before any page is rendered. */
let READINESS = { ready: false, blockers: [] };
export const setReadiness = (r) => { READINESS = r; };
export const readiness = () => READINESS;

/** Locale-aware path: en has no prefix, zh sits under /zh. */
export const path = (loc, site, p = '/') => {
  const prefix = site.locales[loc].prefix;
  const joined = (BASE + prefix + p).replace(/\/{2,}/g, '/');
  return joined || '/';
};

/** Absolute-from-root asset URL, base-aware. */
export const asset = (p) => (BASE + p).replace(/\/{2,}/g, '/');

/* The content-addressed name of each code asset, set once by build.js before
   any page is rendered — same arrangement as the readiness verdict above.
   Empty during a build that has not reached them yet, and hashed() then falls
   back to the plain name, which is the name the file would have had. */
let FINGERPRINTS = {};
export const setFingerprints = (f) => { FINGERPRINTS = f; };

/** Asset URL that changes whenever the file's bytes change. See "the code
    assets, content-addressed" in build.js for why these three are hashed. */
export const hashed = (p) => asset(FINGERPRINTS[p] ?? p);

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
   defaults. The raster icons are cut from brand/mark-lockup.png — Priscilla's
   own artwork — by scripts/build-icons.py.

   THE SVG IS BACK, and it is not a raster in a vector's wrapper, which is why
   it went away: scripts/build-mark-vector.py reduces the drawing to one
   colour and traces THAT, so the tab gets a shape. It is offered first and
   the PNG and .ico stay behind it, so a browser that does not take an SVG
   icon is not left without one. The file carries the site's ink for a light
   tab strip and its paper for a dark one, because a favicon has no page to
   inherit a colour from (report, "The mark, vectorized"). */
const favicon = (asset) => `<link rel="icon" href="${asset('/icon.svg')}" type="image/svg+xml" sizes="any">
<link rel="icon" href="${asset('/icon-32.png')}" type="image/png" sizes="32x32">
<link rel="icon" href="${asset('/favicon.ico')}" sizes="32x32">
<link rel="apple-touch-icon" href="${asset('/apple-touch-icon.png')}">
<link rel="manifest" href="${asset('/site.webmanifest')}">`;

/* The masthead lockup: the monogram as a SHAPE, in the bar's own ink.
   Changed 20 September 2026, by decision.

   It used to be the artwork itself — opaque cream paper, arriving on the dark
   bar as a small mounted plate, which is the site's own device at wordmark
   size. What it could not do is take a colour: a photograph of paper is the
   same photograph whatever it is set in, so the mark could not invert, could
   not follow the bar if the bar ever changes, and carried a cream rectangle
   into a place where nothing else has an edge. The vector traced from that
   same drawing (scripts/build-mark-vector.py) can: it is one path in
   `currentColor`, so it IS the wordmark's colour — --paper, 11.45:1 on the
   bar — and it inherits every future change to it for nothing.

   Inlined rather than linked, because `currentColor` is a cascade and an
   <img> has none. The file is read once at build time and its single path
   is dropped in; nothing is redrawn here.

   Decorative: the link's own text is the accessible name, and a second one
   here would violate 2.5.3 Label in Name. An inline SVG says that with
   aria-hidden and focusable=false rather than with an empty alt. The box is
   sized in CSS and has an explicit viewBox, so the bar cannot reflow. */
const MARK_PATH = (() => {
  const svg = readFileSync(new URL('../public/mark-sc.svg', import.meta.url), 'utf8');
  const d = svg.match(/<path[^>]*\sd="([^"]+)"/)?.[1];
  if (!d) throw new Error('public/mark-sc.svg has no path — run: npm run mark:vector');
  return d;
})();
const MASTHEAD_MARK = () =>
  `<svg class="wordmark__mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path fill="currentColor" d="${MARK_PATH}"/></svg>`;

/* The shop bar's icons: 24-unit, one stroke weight, drawn in currentColor so
   they take the bar's text colour and are checked with it. */
const icon = (d) => `<svg class="shopbar__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const SHOP_ICONS = {
  search:  icon('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
  account: icon('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>'),
  cart:    icon('<path d="M5.5 8h13l-1.1 12H6.6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
};

/* ---------- social channels ----------
   A link-in-bio business is found through its profiles, so the footer carries
   them as marks rather than as a list of words: five 24-unit line drawings in
   the same stroke idiom as the shop bar, in currentColor, on 48px targets.

   They are DRAWINGS, not the companies' logo files: one weight, one grid, no
   brand colour, so the row reads as one set and as part of this site. Each is
   a link with a visually-hidden name, because an icon has no accessible name
   of its own and voice control needs a word to match.

   `url` builds the address from a handle, so a handle can never be mistyped
   into someone else's profile. WeChat and 小红书 have no profile URL derivable
   from a handle, so their marks go to the contact page, where it is printed.

   Channels are declared in seller.artist. A channel set to "" is left out
   altogether — declined on purpose. A channel whose handle is still owed has
   no address yet, so its mark points at a dead route from
   site.placeholders.social and the click lands on the 404 page: the same
   arrangement decision D1 uses for search, account and cart, and the same one
   check-links.mjs polices — the route must be declared, and must still be
   dead. Supplying the handle turns the mark into the real link and takes it
   out of the placeholder set by itself, which readiness rule ID-06 requires
   of every channel before a release build will run. */
const smark = (d) => `<svg class="social__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;

const SOCIAL = [
  { key: 'instagram', name: 'Instagram',
    url: (h) => `https://instagram.com/${h}`,
    mark: smark(`<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5"/><circle cx="12" cy="12" r="4"/>${dot(17.1, 6.9, 0.95)}`) },
  { key: 'facebook', name: 'Facebook',
    url: (h) => `https://facebook.com/${h}`,
    mark: smark('<path d="M14.4 21v-8h2.5l.5-3h-3V8.3c0-.9.3-1.4 1.6-1.4h1.6V4.2A22 22 0 0 0 15.3 4C13 4 11.4 5.4 11.4 8v2H8.9v3h2.5v8"/>') },
  { key: 'x', name: 'X',
    url: (h) => `https://x.com/${h}`,
    mark: smark('<path d="M4.4 4.2l15.2 15.6"/><path d="M19.6 4.2L4.4 19.8"/>') },
  { key: 'bluesky', name: 'Bluesky',
    url: (h) => `https://bsky.app/profile/${h}`,
    mark: smark('<path d="M12 14.4c-1.5-2.7-4.2-6.1-6-7-1.6-.8-2.5.1-2.5 1.9 0 1.9.4 4.3 1 5.1.7.9 2 1.1 3.5.9.4 0 .5.3.2.5-1.2.6-1.8 1.6-.6 3 1.3 1.5 3.3 1 4.4-1.2"/><path d="M12 14.4c1.5-2.7 4.2-6.1 6-7 1.6-.8 2.5.1 2.5 1.9 0 1.9-.4 4.3-1 5.1-.7.9-2 1.1-3.5.9-.4 0-.5.3-.2.5 1.2.6 1.8 1.6.6 3-1.3 1.5-3.3 1-4.4-1.2"/>') },
  { key: 'xiaohongshu', name: '小红书', href: '/contact/',
    mark: smark('<path d="M3.6 5.6h5.1c1.3 0 2.4.7 3.3 1.7.9-1 2-1.7 3.3-1.7h5.1v11.9h-5.1c-1.3 0-2.4.7-3.3 1.7-.9-1-2-1.7-3.3-1.7H3.6z"/><path d="M12 7.3v11.9"/>') },
  { key: 'wechatId', name: 'WeChat', placeholder: 'wechat', href: '/contact/',
    mark: smark(`<path d="M9.2 4.6c-3.4 0-6.2 2.3-6.2 5.1 0 1.6.9 3.1 2.3 4.1l-.7 2 2.5-1.2c.6.2 1.3.3 2.1.3"/>${dot(7.3, 8.6, 0.85)}${dot(11.1, 8.6, 0.85)}<path d="M21 14.4c0-2.5-2.4-4.5-5.4-4.5s-5.4 2-5.4 4.5 2.4 4.5 5.4 4.5c.6 0 1.2-.1 1.8-.2l2.2 1-.6-1.6c1.2-.8 2-2.1 2-3.7z"/>${dot(13.9, 13.5, 0.75)}${dot(17.3, 13.5, 0.75)}`) },
];

/** The footer's channel row. Nothing is drawn when every channel is declined. */
export function socialRow(site, seller, loc) {
  const items = SOCIAL.filter((c) => seller.artist[c.key]).map((c) => {
    const handle = seller.artist[c.key];
    const owed = handle === PLACEHOLDER;
    const dead = site.placeholders?.social?.[c.placeholder ?? c.key];
    const href = owed ? path(loc, site, dead)
      : c.href ? path(loc, site, c.href)
      : c.url(encodeURIComponent(handle));
    const attrs = owed ? ` data-placeholder="${c.placeholder ?? c.key}"` : (c.href ? '' : ' rel="me noopener"');
    return `<li><a class="social__link" href="${esc(href)}"${attrs}>` +
           `${c.mark}<span class="visually-hidden">${esc(c.name)}</span></a></li>`;
  });
  return items.length
    ? `<ul class="social" aria-label="${loc === 'zh' ? '社交账号' : 'Elsewhere'}">\n      ${items.join('\n      ')}\n    </ul>`
    : '';
}

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
                         ogImageHeight, product, canonical, altLocales, bodyClass = '',
                         noindex = false, current = null, strip = '' }) {
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
      // The section this page belongs to is marked: "page" on the section's own
      // page, "true" beneath it (a work, a series). The CSS already styled
      // aria-current; nothing ever set it.
      const here = n.id === current
        ? ` aria-current="${canonical === path(loc, site, n.href) ? 'page' : 'true'}"` : '';
      return `<a href="${esc(navHref(n.href))}"${here}>` +
             `<span class="nav__long">${long}</span>` +
             `<span class="nav__short">${abbr}</span></a>`;
    })
    .join('\n      ');

  /* Decision D1: search, account and cart. The destinations do not exist yet,
     so each link is marked data-placeholder and lands on the 404 page; the
     routes are declared in site.json, and check-links fails the build if a
     marked link starts resolving without the marker being removed. The icons
     are aria-hidden: each link's name is the word, which is what a screen
     reader announces and what voice control needs to match.

     The route list is EMPTY since AW-07, so this builds nothing and the bar
     does not appear; site.json says why, and putting a route back puts its
     control back with everything below still true of it. */
  const shopLinks = Object.entries(site.placeholders.routes).map(([role, route]) => {
    const label = esc(t(ui[role], loc));
    const count = role === 'cart'
      ? `<span class="shopbar__count" data-cart-count hidden>0</span>` : '';
    return `<li><a class="shopbar__link" href="${esc(path(loc, site, route))}" data-placeholder="${role}">` +
           `${SHOP_ICONS[role]}<span class="visually-hidden">${label}</span>${count}</a></li>`;
  }).join('\n      ');
  /* No routes, no bar. An empty <ul> is a list of nothing that a screen reader
     still announces, and three icons' worth of masthead held open for it. */
  const shopbar = shopLinks ? `<ul class="shopbar">\n      ${shopLinks}\n    </ul>` : '';

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
<link rel="stylesheet" href="${hashed('/styles.css')}">
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">${esc(t(ui.skipToContent, loc))}</a>

${PREVIEW ? `<div class="readiness-ribbon" role="note">${esc(t(READINESS.ready ? site.readiness.previewReady : site.readiness.previewBlocked, loc).replace('{n}', READINESS.blockers.length))}</div>` : ''}
<header class="masthead">
  <div class="wrap masthead__inner">
    <a class="wordmark" href="${esc(path(loc, site, '/'))}">${MASTHEAD_MARK()}<span class="wordmark__name">${wordmarkName(seller, loc)}</span></a>
    <nav class="nav" aria-label="${loc === 'zh' ? '主导航' : 'Main'}">
      ${nav}
    </nav>
    <span class="lang-rule" aria-hidden="true"></span>
    <a class="lang-switch" href="${esc(otherHref)}" lang="${site.locales[other].lang}" rel="alternate">${esc(t(ui.langSwitch, loc))}</a>
    ${shopbar}
  </div>
</header>
${strip}
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
    ${socialRow(site, seller, loc)}
  </div>
  ${decl ? `<div class="wrap"><p class="legal-declaration" lang="zh-CN">${esc(decl.zh)}</p>
  <p class="legal-declaration" style="border:0;margin-top:0;padding-top:0">${esc(decl.en)}</p></div>` : ''}
</footer>
<script src="${hashed('/availability.js')}" defer></script>
</body>
</html>`;
}
