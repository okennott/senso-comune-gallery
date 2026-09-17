/**
 * Templates. Plain template literals — no engine, no framework.
 *
 * The report's architectural conclusion was that everything this site needs is
 * static HTML plus one small build script, and that adopting a framework would
 * contradict its own aesthetic argument. This is that build script's half.
 */

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

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" class="scale__svg">
  <g stroke="currentColor" fill="none" stroke-width="1" opacity=".38">
    <line x1="20" y1="${floor}" x2="${W - 20}" y2="${floor}"/>
    <path d="M${sofaX} ${floor} V${sofaY + 26} q0 -10 10 -10 H${sofaX + sofaW - 10} q10 0 10 10 V${floor}
             M${sofaX + 14} ${sofaY + 26} V${floor - 14} H${sofaX + sofaW - 14} V${sofaY + 26}"/>
  </g>
  <g stroke="currentColor" opacity=".5" stroke-width="1">
    <line x1="${W - 44}" y1="${floor - WALL_CM * PX_PER_CM}" x2="${W - 44}" y2="${floor}"/>
    <line x1="${W - 50}" y1="${floor - WALL_CM * PX_PER_CM}" x2="${W - 38}" y2="${floor - WALL_CM * PX_PER_CM}"/>
    <line x1="${W - 50}" y1="${floor}" x2="${W - 38}" y2="${floor}"/>
  </g>
  <text x="${W - 56}" y="${floor - WALL_CM * PX_PER_CM / 2}" font-size="11" text-anchor="end"
        fill="currentColor" opacity=".7" font-family="var(--font-body)">244 cm · 8 ft</text>
  <rect x="${px}" y="${py}" width="${pw}" height="${ph}"
        fill="var(--wash-warm)" stroke="var(--sanguine)" stroke-width="1.5"/>
  <g stroke="var(--sanguine)" opacity=".55" stroke-width="1">
    <line x1="${px - 16}" y1="${py}" x2="${px - 16}" y2="${py + ph}"/>
    <line x1="${px - 21}" y1="${py}" x2="${px - 11}" y2="${py}"/>
    <line x1="${px - 21}" y1="${py + ph}" x2="${px - 11}" y2="${py + ph}"/>
  </g>
  <text x="${px - 26}" y="${py + ph / 2}" font-size="11" text-anchor="end"
        fill="var(--sanguine)" font-family="var(--font-body)">${w.heightCm} cm</text>
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

/* ---------- document shell ---------- */
export function layout({ site, seller, loc, title, description, body, ogImage, canonical, altLocales, bodyClass = '' }) {
  const L = site.locales[loc];
  const ui = site.ui;
  const origin = site.url;

  const hreflang = altLocales
    .map(([l, href]) => `<link rel="alternate" hreflang="${site.locales[l].lang}" href="${esc(origin + href)}">`)
    .join('\n  ');

  const nav = site.nav
    .map((n) => `<a href="${esc(path(loc, site, '/') + n.href)}">${esc(t(n.label, loc))}</a>`)
    .join('\n      ');

  const other = loc === 'en' ? 'zh' : 'en';
  const otherHref = altLocales.find(([l]) => l === other)?.[1] ?? path(other, site, '/');

  const entity = seller.entities[seller.activeEntity];
  const decl = entity.registration.selfDeclaration;

  return `<!doctype html>
<html lang="${L.lang}" dir="${L.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(origin + canonical)}">
  ${hreflang}
<link rel="alternate" hreflang="x-default" href="${esc(origin + (altLocales.find(([l]) => l === 'en')?.[1] ?? '/'))}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(origin + canonical)}">
<meta property="og:locale" content="${L.lang.replace('-', '_')}">
${ogImage ? `<meta property="og:image" content="${esc(origin + ogImage)}">
<meta property="og:image:width" content="1600">
<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<link rel="preload" href="${asset('/fonts/fraunces-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${asset('/fonts/inter-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('/styles.css')}">
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">${esc(t(ui.skipToContent, loc))}</a>

<header class="masthead">
  <div class="wrap masthead__inner">
    <a class="wordmark" href="${esc(path(loc, site, '/'))}">${esc(t(seller.artist.siteName, loc))}</a>
    <nav class="nav" aria-label="${loc === 'zh' ? '主导航' : 'Main'}">
      ${nav}
    </nav>
    <a class="lang-switch" href="${esc(otherHref)}" lang="${site.locales[other].lang}" rel="alternate">${esc(t(ui.langSwitch, loc))}</a>
  </div>
</header>

<main id="main" tabindex="-1">
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
