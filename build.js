/**
 * Senso Comune — site build.
 *
 *   node build.js        →  dist/
 *
 * Generates, per locale:
 *   /                    the editorial scroll
 *   /works/{slug}/       one real document per painting
 *   /returns/ /shipping/ /privacy/ /giving/
 * plus sitemap.xml, robots.txt and availability.json.
 *
 * WHY SEVEN DOCUMENTS AND NOT ONE
 * A `#work-3` fragment is never sent to the server (RFC 3986 §3.5), so it can
 * carry no per-work title, description, canonical, og:image or structured
 * data. On the domestic side that is not an SEO nicety: WeChat renders its
 * link cards from Open Graph tags, so a shared link to a fragment previews the
 * hero rather than the painting. `@view-transition` restores the single-page
 * feel in two lines of CSS.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  esc, t, dims, money, path as lpath, asset, BASE, scaleSvg, jsonLd, layout,
} from './src/templates.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const site      = read('src/data/site.json');
const seller    = read('src/data/seller.json');
const artworksF = read('src/data/artworks.json');

const works  = [...artworksF.works].sort((a, b) => a.order - b.order);
const LOCALES = Object.keys(site.locales);
const ui = site.ui;
const origin = process.env.SITE_URL || site.url;
const entity = seller.entities[seller.activeEntity];

/* ------------------------------------------------------------------ *
 * NEEDS-INPUT audit. The site must not go live with placeholders, so  *
 * the build reports every one rather than silently shipping them.     *
 * ------------------------------------------------------------------ */
const todo = [];
const scan = (obj, trail = '') => {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') { if (obj === 'NEEDS-INPUT') todo.push(trail); return; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => scan(v, `${trail}[${i}]`)); return; }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('$') || k.startsWith('_')) continue;
      scan(v, trail ? `${trail}.${k}` : k);
    }
  }
};
scan(seller, 'seller');
scan(artworksF, 'artworks');
if (site.url.includes('example')) todo.push('site.url');

/* ------------------------------------------------------------------ */
/* URLs carry the deployment base, but the built files must sit at the artifact
   root — a Pages project site serves the artifact AT /<repo>/, it does not
   expect the files to be nested inside another copy of that folder. */
const stripBase = (p) => (BASE && p.startsWith(BASE) ? p.slice(BASE.length) || '/' : p);

const out = (rel, html) => {
  const file = join(DIST, stripBase(rel));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
};

const altFor = (p) => LOCALES.map((l) => [l, lpath(l, site, p)]);

/** Responsive image. width/height are non-negotiable: without them a lazy
 *  image defaults to 0×0, which can convince the browser everything is
 *  in-viewport and load every one at once. They are also the difference
 *  between CLS 0 and CLS 0.4. */
function picture(w, { eager = false, sizes = '(min-width:900px) 900px, calc(100vw - 40px)' } = {}, loc) {
  const widths = [640, 960, 1280, 1600, 2000];
  const srcset = (ext) => widths.map((x) => `${asset(`/img/${w.image}-${x}.${ext}`)} ${x}w`).join(', ');
  // Intrinsic pixel dimensions of the largest variant, in the work's own ratio.
  const iw = 2000;
  const ih = Math.round((w.heightCm / w.widthCm) * 2000);
  return `<picture>
      <source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}">
      <img class="work__img" src="${asset(`/img/${w.image}-1280.webp`)}" srcset="${srcset('webp')}" sizes="${sizes}"
           width="${iw}" height="${ih}" alt="${esc(t(w.alt, loc))}"
           ${eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'}>
    </picture>`;
}

/** Which of the three media nouns the hero line should use for a work.
 *
 *  The nouns are a closed set because they are translated copy, not data —
 *  each one is a string in site.json with an English and a Chinese form. A
 *  medium outside the set is therefore not something this can guess at, and
 *  guessing is how "Gouache on panel" ends up announced as an oil painting.
 *  Unrecognised media are collected and reported by the build instead; adding
 *  one means adding its noun to `ui` and its pattern here, together. */
const MEDIA = [
  [/\boil\b|油画/i,             'mediaOil'],
  [/watercolou?r|水彩/i,        'mediaWater'],
  [/graphite|pencil|铅笔/i,     'mediaPaper'],
];
const unknownMedia = new Set();
function classifyMedium(w) {
  const text = `${t(w.medium, 'en')} ${t(w.medium, 'zh')}`;
  for (const [re, key] of MEDIA) if (re.test(text)) return ui[key];
  unknownMedia.add(`${w.slug}: "${t(w.medium, 'en')}"`);
  return ui.mediaOil;
}

/** The hero's factual line, generated rather than typed: the count, the media
 *  and the span of years all come from artworks.json, so they cannot drift
 *  from what is actually on the site. This is what replaced the category
 *  eyebrow — it grounds the motto instead of labelling it. */
function standfirst(loc) {
  // Spelled out to twelve, then numerals: "Thirteen paintings" is a mouthful
  // and a catalogue that large reads better as a figure anyway. The table is
  // the only place the count is written down, and it is not a limit.
  const NUM_EN = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
                  'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
  const NUM_ZH = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  const n = works.length;
  const count = loc === 'zh'
    ? `${NUM_ZH[n] || n}${t(ui.paintings, loc)}`
    : `${NUM_EN[n] || n} ${t(n === 1 ? ui.painting : ui.paintings, loc)}`;

  // Distinct media, in the order they first appear. classifyMedium reports
  // anything it does not recognise rather than quietly calling it oil.
  const media = [];
  for (const w of works) {
    const s = t(classifyMedium(w), loc);
    if (!media.includes(s)) media.push(s);
  }
  // CJK sets no spaces around a conjunction; Latin does.
  const join = loc === 'zh' ? '、' : ', ';
  const and = loc === 'zh' ? t(ui.andWord, loc) : ` ${t(ui.andWord, loc)} `;
  const mediaStr = media.length > 1
    ? media.slice(0, -1).join(join) + and + media.at(-1)
    : media[0];

  const years = works.map((w) => w.year);
  const lo = Math.min(...years), hi = Math.max(...years);
  const span = lo === hi ? `${lo}` : `${lo}–${hi}`;

  return loc === 'zh'
    ? `${count}，${mediaStr}，${span}。`
    : `${count}, ${mediaStr}, ${span}.`;
}

/** The tombstone. Order: title → year → medium → dimensions → price. */
function tombstone(w, loc, { linked = true, level = 'p' } = {}) {
  const title = esc(t(w.title, loc));
  const href = lpath(loc, site, `/works/${w.slug}/`);
  const titleEl = linked
    ? `<a href="${href}" style="color:inherit;text-decoration:none"><em>${title}</em></a>`
    : `<em>${title}</em>`;

  const notes = [
    w.unique ? esc(t(ui.uniqueWork, loc)) : null,
    w.support === 'canvas' && !w.framed ? esc(t(ui.frameNotIncl, loc)) : null,
  ].filter(Boolean).join(' · ');

  // N-04: sold keeps the price visible and repurposes the CTA slot.
  const action = w.sold
    ? `<a class="link-quiet" href="mailto:${esc(seller.contact.email)}?subject=${encodeURIComponent(t(w.title, loc))}">${esc(t(ui.soldEnquire, loc))}</a>`
    : w.checkoutUrl
      ? `<a class="btn" data-enquire-href="mailto:${esc(seller.contact.email)}" href="${esc(w.checkoutUrl)}" rel="noopener">${esc(t(ui.buy, loc))}<span class="visually-hidden"> — ${title}, ${money(w.priceUSD)}</span></a>`
      // Finding A-02. With no checkout link this control opens a mail client,
      // so it must not say "Buy". Same button, honest promise.
      : `<a class="btn" href="mailto:${esc(seller.contact.email)}?subject=${encodeURIComponent(t(w.title, loc))}">${esc(t(ui.enquireToBuy, loc))}<span class="visually-hidden"> — ${title}, ${money(w.priceUSD)}</span></a>`;

  const priceEl = w.sold
    ? `<p class="price price--sold"><span class="price__struck">${money(w.priceUSD)}</span>${esc(t(ui.sold, loc))}</p>`
    : `<p class="price">${money(w.priceUSD)}</p>`;

  return `<div class="tombstone" data-work="${esc(w.slug)}" data-sold="${w.sold}"
        data-sold-word="${esc(t(ui.sold, loc))}"
        data-sold-label="${esc(t(ui.soldEnquire, loc))}"
        data-sold-announce="${esc(t(ui.sold, loc))} — ${title}">
        <${level} class="tombstone__title">${titleEl}</${level}>
        <p class="tombstone__meta">
          <span>${esc(t(w.medium, loc))}, ${w.year}</span><br>
          <span>${dims(w)}</span>${notes ? `<br><span>${notes}</span>` : ''}
        </p>
        <div class="tombstone__row">
          ${priceEl}
          ${action}
        </div>
      </div>`;
}

/* ------------------------------------------------------------------ *
 * index                                                               *
 * ------------------------------------------------------------------ */
function renderIndex(loc) {
  const S = site.sections;
  const available = works.filter((w) => !w.sold);
  const sold = works.filter((w) => w.sold);

  const listFor = (group, startIndex) => `<ol class="works" start="${startIndex + 1}">
      ${group.map((w, i) => {
        const n = String(startIndex + i + 1).padStart(2, '0');
        const total = String(works.length).padStart(2, '0');
        return `<li class="work" id="work-${w.slug}">
        <figure class="work__figure">
          <span class="work__index" aria-hidden="true">${n} / ${total}</span>
          <a href="${lpath(loc, site, `/works/${w.slug}/`)}" style="display:block">
            ${picture(w, { eager: startIndex + i === 0 }, loc)}
          </a>
        </figure>
        ${tombstone(w, loc, { level: 'h3' })}
      </li>`;
      }).join('\n      ')}
    </ol>`;

  const originals = available.filter((w) => w.section === 'originals');
  const tributes  = available.filter((w) => w.section === 'tribute');

  // Finding A-01. The first available original is lifted into the hero so the
  // opening screen contains a painting; the list below it then starts at 02.
  const heroWork = originals[0] ?? null;
  const listed   = heroWork ? originals.slice(1) : originals;

  const heroFigure = heroWork ? `
  <figure class="hero__work">
    <a href="${lpath(loc, site, `/works/${heroWork.slug}/`)}">
      ${picture(heroWork, { eager: true, sizes: '(min-width:900px) 40vw, calc(100vw - 40px)' }, loc)}
    </a>
    <figcaption>
      <span class="work__index work__index--static" aria-hidden="true">01 / ${String(works.length).padStart(2, '0')}</span>
      ${tombstone(heroWork, loc, { level: 'h2' })}
    </figcaption>
  </figure>` : '';

  const body = `
<section class="hero wrap${heroWork ? ' hero--split' : ''}">
  <div class="hero__lede">
    <h1 class="visually-hidden">${esc(t(seller.artist.siteName, loc))}</h1>
    <p class="hero__motto">${esc(t(site.hero.title, loc))}</p>
    <p class="hero__standfirst">${esc(standfirst(loc))}<br>${esc(t(site.hero.standfirstTail, loc))}</p>
    <a class="link-quiet" href="#works">${esc(t(site.hero.cta, loc))}</a>
  </div>${heroFigure}
</section>

<div class="edge edge--warm" aria-hidden="true"></div>

<section class="section ground--warm" id="works">
  <div class="wrap">
    <div class="section__head">
      <h2>${esc(t(S.works.title, loc))}</h2>
      <p class="section__intro">${esc(t(S.works.intro, loc))}</p>
    </div>
    ${listFor(listed, heroWork ? 1 : 0)}
  </div>
</section>

<div class="edge edge--violet" aria-hidden="true"></div>

<section class="section ground--violet hatch" id="tribute">
  <div class="wrap">
    <div class="section__head">
      <h2>${esc(t(S.tribute.title, loc))}</h2>
      <div>
        <blockquote class="epigraph">
          ${esc(t(S.tribute.epigraph.quote, loc))}
          <cite>— ${esc(S.tribute.epigraph.attribution)}</cite>
        </blockquote>
        <p class="section__intro">${esc(t(S.tribute.intro, loc))}</p>
      </div>
    </div>
    ${listFor(tributes, originals.length)}
  </div>
</section>

${sold.length ? `<p class="wrap archive-link">
  <a class="link-quiet" href="${lpath(loc, site, '/archive/')}">${esc(t(S.archive.linkLabel, loc))} (${sold.length})</a>
</p>` : ''}

<div class="edge edge--blue" aria-hidden="true"></div>

<section class="section ground--blue" id="about">
  <div class="wrap">
    <div class="section__head">
      <h2>${esc(t(S.about.title, loc))}</h2>
      <div class="prose measure">
        ${t(site.about.paragraphs, loc).slice(0, 2).map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
        <p><a class="link-quiet" href="${lpath(loc, site, '/about/')}">${loc === 'zh' ? '继续阅读' : 'Read the rest'}</a></p>
      </div>
    </div>
  </div>
</section>

<section class="section wrap" id="buy">
  <div class="section__head">
    <h2>${esc(t(S.buy.title, loc))}</h2>
    <div class="prose measure">
      <ol class="steps">
        ${t(site.buy.steps, loc).map((s) => `<li><span>${esc(s)}</span></li>`).join('\n        ')}
      </ol>
      <p style="margin-top:var(--space-5)">${esc(t(entity.checkout.note, loc))}</p>
      <p><strong>${esc(t(ui.returnsShort, loc))}.</strong></p>
      <p><a class="link-quiet" href="${lpath(loc, site, '/how-to-buy/')}">${loc === 'zh' ? '完整购买说明' : 'Everything about buying'}</a></p>
    </div>
  </div>
</section>`;

  return layout({
    site, seller, loc,
    title: `${t(seller.artist.siteName, loc)}`,
    description: t(site.sections.works.intro, loc),
    body,
    ogImage: `/img/${works[0].image}-1600.webp`,
    canonical: lpath(loc, site, '/'),
    altLocales: altFor('/'),
  });
}

/* ------------------------------------------------------------------ *
 * work detail                                                         *
 * ------------------------------------------------------------------ */
function renderWork(w, loc) {
  const i = works.findIndex((x) => x.slug === w.slug);
  const prev = works[i - 1];
  const next = works[i + 1];
  const desc = t(w.description, loc);
  const note = t(w.artistNote, loc);

  const body = `
<article class="detail wrap">
  <p class="eyebrow"><a href="${lpath(loc, site, '/')}#works" style="color:inherit">${esc(t(ui.backToWorks, loc))}</a></p>

  <div class="detail__grid">
    <div>
      <figure class="work__figure" style="margin:0">
        <button class="work__zoom" command="show-modal" commandfor="lb-${esc(w.slug)}"
                style="all:unset;display:block;cursor:zoom-in"
                aria-label="${esc(t(ui.viewFull, loc))}">
          ${picture(w, { eager: true, sizes: '(min-width:900px) 60vw, calc(100vw - 40px)' }, loc)}
        </button>
      </figure>

      ${w.details?.length ? `<div class="details-row">
        ${w.details.map((d, n) => `<figure>
          <img src="${asset(`/img/${esc(d.image)}-960.webp`)}" width="960" height="960" loading="lazy" decoding="async"
               alt="${esc(t(d.alt, loc))}">
          <figcaption>${esc(t(ui.detailCrop, loc))} ${n + 1}</figcaption>
        </figure>`).join('\n        ')}
      </div>` : ''}

      ${desc ? `<div class="detail__desc prose" style="margin-top:var(--space-5)">
        ${desc.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
        ${note ? `<div class="artist-note">
          <span class="artist-note__label">${esc(t(ui.artistNote, loc))}</span>
          <p style="margin:0">${esc(note)}</p>
        </div>` : ''}
      </div>` : ''}
    </div>

    <aside class="detail__aside">
      ${tombstone(w, loc, { linked: false, level: 'h1' })}
      <figure class="scale">
        ${scaleSvg(w, ui, loc)}
        <figcaption>${esc(t(ui.scaleCaption, loc))} ${esc(t(ui.measuredNote, loc))}</figcaption>
      </figure>
      ${!w.sold ? `<p style="margin-top:var(--space-4)">
        <a class="link-quiet" href="mailto:${esc(seller.contact.email)}?subject=${encodeURIComponent(t(w.title, loc))}">${esc(t(ui.enquire, loc))}</a>
      </p>` : ''}
      <p class="detail__buyinfo">
        <a href="${lpath(loc, site, '/how-to-buy/')}">${esc(t(ui.returnsShort, loc))} · ${esc(t(site.sections.buy.title, loc))}</a>
      </p>
    </aside>
  </div>

  <nav class="pager" aria-label="${loc === 'zh' ? '作品导航' : 'Works'}">
    ${prev ? `<a rel="prev" href="${lpath(loc, site, `/works/${prev.slug}/`)}">← ${esc(t(ui.prevWork, loc))}</a>` : '<span></span>'}
    ${next ? `<a rel="next" href="${lpath(loc, site, `/works/${next.slug}/`)}">${esc(t(ui.nextWork, loc))} →</a>` : '<span></span>'}
  </nav>
</article>

<dialog class="lightbox" id="lb-${esc(w.slug)}">
  <form method="dialog" style="margin:0;position:relative">
    <button class="lightbox__close" value="close">${esc(t(ui.closeDialog, loc))}</button>
  </form>
  <img src="${asset(`/img/${w.image}-2000.webp`)}" alt="${esc(t(w.alt, loc))}" width="2000"
       height="${Math.round((w.heightCm / w.widthCm) * 2000)}">
</dialog>

${jsonLd(w, site, seller, loc, origin)}`;

  return layout({
    site, seller, loc,
    title: `${t(w.title, loc)} — ${t(seller.artist.siteName, loc)}`,
    description: desc ? desc.slice(0, 180) : `${t(w.medium, loc)}, ${w.year}. ${dims(w)}.`,
    body,
    ogImage: `/img/${w.image}-1600.webp`,
    ogImageAlt: t(w.alt, loc),
    ogImageHeight: Math.round((w.heightCm / w.widthCm) * 1600),
    product: { amount: w.priceUSD, currency: artworksF.currency, sold: w.sold },
    canonical: lpath(loc, site, `/works/${w.slug}/`),
    altLocales: altFor(`/works/${w.slug}/`),
  });
}

/* ------------------------------------------------------------------ *
 * archive — sold works, on their own page                             *
 *                                                                     *
 * Off the homepage because it interrupts the shape of what is for     *
 * sale, and because it is the one section that grows without limit.   *
 * The pages stay live with availability SoldOut and the price stays   *
 * visible: a sold price is quiet proof the work sold AT that number.  *
 * ------------------------------------------------------------------ */
function renderArchive(loc) {
  const S = site.sections;
  const sold = works.filter((w) => w.sold);

  const body = `
<section class="section wrap" id="archive">
  <div class="section__head">
    <h1>${esc(t(S.archive.title, loc))}</h1>
    <p class="section__intro">${esc(t(S.archive.intro, loc))}</p>
  </div>
  <ol class="works works--grid">
    ${sold.map((w) => `<li class="work">
      <figure class="work__figure">
        <a href="${lpath(loc, site, `/works/${w.slug}/`)}" style="display:block">
          ${picture(w, { sizes: '(min-width:900px) 22vw, (min-width:560px) 45vw, calc(100vw - 40px)' }, loc)}
        </a>
      </figure>
      ${tombstone(w, loc, { level: 'h2' })}
    </li>`).join('\n    ')}
  </ol>
  <p style="margin-top:var(--space-6)">
    <a class="link-quiet" href="${lpath(loc, site, '/')}#works">${esc(t(ui.backToWorks, loc))}</a>
  </p>
</section>`;

  return layout({
    site, seller, loc,
    title: `${t(S.archive.title, loc)} — ${t(seller.artist.siteName, loc)}`,
    description: t(S.archive.intro, loc),
    body,
    ogImage: sold.length ? `/img/${sold[0].image}-1600.webp` : null,
    canonical: lpath(loc, site, '/archive/'),
    altLocales: altFor('/archive/'),
  });
}

/* ------------------------------------------------------------------ *
 * about + how to buy, promoted to real pages                          *
 *                                                                     *
 * They stay on the homepage as short sections, because at this size   *
 * the single scroll is the right shape. But a buyer reading a work    *
 * page could not see how buying works without going back, and neither *
 * section could be linked or shared on its own. The homepage now      *
 * carries a summary; the full text lives here. No duplication: the    *
 * pages say more than the sections do.                                *
 *                                                                     *
 * THRESHOLD: this holds while the homepage stays one comfortable      *
 * scroll. Past roughly a dozen works, cut the sections to a line and  *
 * a link, and let /works/ carry the grid. Nothing here caps the       *
 * count — the decision is editorial, not structural.                  *
 * ------------------------------------------------------------------ */
function renderAbout(loc) {
  const paras = t(site.about.paragraphs, loc);
  const body = `
<section class="page wrap">
  <h1>${esc(t(site.sections.about.title, loc))}</h1>
  <div class="prose measure">
    ${paras.map((x) => `<p>${esc(x)}</p>`).join('\n    ')}
    <p><a href="${lpath(loc, site, '/giving/')}">${loc === 'zh' ? '查看捐赠记录' : 'See the giving record'}</a> · <a href="${lpath(loc, site, '/how-to-buy/')}">${esc(t(site.sections.buy.title, loc))}</a></p>
  </div>
</section>`;
  return layout({
    site, seller, loc,
    title: `${t(site.sections.about.title, loc)} — ${t(seller.artist.siteName, loc)}`,
    description: paras[0].slice(0, 180),
    body, ogImage: null, bodyClass: 'prose-page',
    canonical: lpath(loc, site, '/about/'),
    altLocales: altFor('/about/'),
  });
}

/* Finding A-03. How to Buy asked the reader to get in touch three times and
   gave no address; the only contact details were in the footer. Every value
   here comes from seller.contact, so there is one source of truth and the
   NEEDS-INPUT audit still sees them. */
function contactPanel(loc) {
  const C = site.buy.contact;
  const A = seller.artist;
  const rows = [
    [t(C.emailLabel, loc),  seller.contact.email, `mailto:${seller.contact.email}`],
    [t(C.phoneLabel, loc),  seller.contact.phone, `tel:${String(seller.contact.phone).replace(/[^+\d]/g, '')}`],
    [t(C.wechatLabel, loc), A.wechatId, null],
    [t(C.xhsLabel, loc),    A.xiaohongshu, null],
  ].filter(([, v]) => v);

  return `<aside class="contact" aria-labelledby="contact-h">
    <h2 id="contact-h">${esc(t(C.title, loc))}</h2>
    <p class="contact__intro">${esc(t(C.intro, loc))}</p>
    <dl class="contact__list">
      ${rows.map(([label, value, href]) => `<div>
        <dt>${esc(label)}</dt>
        <dd>${href ? `<a href="${esc(href)}">${esc(value)}</a>` : esc(value)}</dd>
      </div>`).join('\n      ')}
    </dl>
  </aside>`;
}

function renderHowToBuy(loc) {
  const body = `
<section class="page wrap">
  <h1>${esc(t(site.sections.buy.title, loc))}</h1>
  <div class="prose measure">
    <ol class="steps">
      ${t(site.buy.steps, loc).map((s) => `<li><span>${esc(s)}</span></li>`).join('\n      ')}
    </ol>
    <p style="margin-top:var(--space-5)">${esc(t(entity.checkout.note, loc))}</p>
    <h2>${loc === 'zh' ? '退货' : 'Returns'}</h2>
    <p>${loc === 'zh'
        ? `所有作品均可在收到后 ${R.windowDays} 天内无理由退货，全球适用。`
        : `Every work can be returned within ${R.windowDays} days of arriving, for any reason or none, anywhere in the world.`}
      <a href="${lpath(loc, site, '/returns/')}">${loc === 'zh' ? '完整退货政策' : 'Full returns policy'}</a></p>
    <h2>${loc === 'zh' ? '配送与关税' : 'Shipping and duties'}</h2>
    <p>${esc(t(SH.usImportNote, loc))}
      <a href="${lpath(loc, site, '/shipping/')}">${loc === 'zh' ? '完整配送说明' : 'Full shipping details'}</a></p>
    <h2>${loc === 'zh' ? '无障碍协助' : 'If the site gets in your way'}</h2>
    <p>${esc(t(site.buy.accessNote, loc))}</p>
  </div>
  ${contactPanel(loc)}
</section>`;
  return layout({
    site, seller, loc,
    title: `${t(site.sections.buy.title, loc)} — ${t(seller.artist.siteName, loc)}`,
    description: t(site.buy.steps, loc)[0].slice(0, 180),
    body, ogImage: null, bodyClass: 'prose-page',
    canonical: lpath(loc, site, '/how-to-buy/'),
    altLocales: altFor('/how-to-buy/'),
  });
}

/* ------------------------------------------------------------------ *
 * prose pages                                                         *
 * ------------------------------------------------------------------ */
const R = seller.returns;
const SH = seller.shipping;

const PAGES = {
  '/returns/': {
    title: { en: 'Returns', zh: '退货政策' },
    blocks: (loc) => [
      { h: { en: 'Fourteen days, worldwide', zh: '全球十四天' },
        p: {
          en: `You may return any painting within ${R.windowDays} days of receiving it, for any reason or none. This is offered worldwide rather than per-country: it over-satisfies the seven-day right Chinese law gives you and matches the fourteen-day right EU law gives you, so nobody has to work out which applies to them.`,
          zh: `您可在收到作品后 ${R.windowDays} 天内退货，无需说明理由。本政策全球统一适用：既超出中国法律规定的七天，也符合欧盟法律规定的十四天，您无需判断适用哪一种。`,
        } },
      { h: { en: 'Condition', zh: '商品完好' },
        p: {
          en: 'The work must come back in the condition it arrived: original packaging and protective materials, certificate of authenticity included, not re-framed, not re-varnished, no new hanging hardware. Opening the packaging to look at it is expected and does not affect your right to return.',
          zh: '作品须以寄出时的状态退回：原包装与保护材料、随附证书齐全，未另行装框、未重新上光、未加装挂件。为查验而拆开包装属正常情形，不影响退货权利。',
        } },
      { h: { en: 'Postage and refund', zh: '运费与退款' },
        p: {
          en: `Return postage is paid by the buyer. Once the work is back with me and intact, I refund the full price to your original payment method within ${R.refundWithinDays} days.`,
          zh: `退货运费由买方承担。作品完好退回后，我会在 ${R.refundWithinDays} 天内按原付款方式全额退款。`,
        } },
      { h: { en: 'Commissions', zh: '委托创作' },
        p: {
          en: 'A painting made to your brief is the one exception, under both Chinese and EU law, and I will say so clearly before you commit to one. Everything currently on this site is a pre-existing work and is returnable.',
          zh: '按您的要求专门创作的作品是唯一例外（中国与欧盟法律均如此），我会在您确认前明确告知。本站目前所有作品均为既有作品，可退。',
        } },
    ],
  },

  '/shipping/': {
    title: { en: 'Shipping & duties', zh: '配送与关税' },
    blocks: (loc) => [
      { h: { en: 'How the work travels', zh: '包装与寄送' },
        p: {
          en: 'Works on paper ship flat — sandwiched between acid-free boards with glassine over the image, never rolled in a tube, which cracks the sizing. Canvases ship upright with foam corners and rigid board front and back, with the bubble wrap outside the boards so nothing touches the paint. Everything goes with a tracking number.',
          zh: '纸本作品平寄——以无酸卡纸夹护、表面覆硫酸纸，绝不卷入纸筒（卷曲会使纸张胶层开裂）。布面作品直立包装，四角加护，前后加硬板，气泡膜置于硬板之外，不接触颜料层。所有包裹均提供追踪号。',
        } },
      { h: { en: 'Import duties', zh: '进口关税' },
        p: {
          en: `Shipments go ${SH.incoterm}: I pay the freight, and any import duty, tax or customs handling in your country is payable by you to the carrier on delivery. Those charges are not mine to collect or to waive, so here is what to expect.`,
          zh: `所有包裹按 ${SH.incoterm} 条款寄送：运费由我承担；贵国的进口关税、税费及清关手续费由您在收货时支付给承运商。这些费用不由我代收或减免，以下为预期情况。`,
        } },
      { h: { en: 'United States', zh: '美国' }, p: SH.usImportNote },
      { h: { en: 'United Kingdom', zh: '英国' }, p: SH.ukImportNote },
      { h: { en: 'European Union', zh: '欧盟' }, p: SH.euImportNote },
    ],
  },

  '/privacy/': {
    title: { en: 'Privacy', zh: '隐私政策' },
    blocks: (loc) => [
      { h: { en: 'What I collect, and why', zh: '收集的信息及用途' },
        p: {
          en: 'Only what an order needs: your email address, and your name, shipping address and phone number when you buy something. The legal basis is that this is necessary to conclude and perform our contract — so there is no consent box to tick at checkout, and there is nothing to opt into.',
          zh: '仅收集订单所需信息：您的电子邮箱，以及购买时的姓名、收件地址与电话。法律依据是订立与履行合同所必需——因此结账时没有需要勾选的同意框，也没有需要选择加入的项目。',
        } },
      { h: { en: 'Where it is stored', zh: '存储地点' },
        p: {
          en: 'This site is hosted outside mainland China, so your details are transferred and stored overseas. The transfer is necessary to perform the order, and the volume is far below the thresholds that would require a regulatory mechanism.',
          zh: '本网站托管于中国大陆境外，因此您的信息会被传输并存储于境外。该传输为履行订单所必需，且数据量远低于需要办理监管手续的门槛。',
        } },
      { h: { en: 'How long, and your rights', zh: '保存期限与您的权利' },
        p: {
          en: 'Order records are kept for as long as tax record-keeping requires, then deleted. You can ask me at any time what I hold, to correct it, or to delete it — email me and I will do it. If you join the mailing list, that is separate, entirely optional, and one click to leave.',
          zh: '订单记录保存至税务记录要求的期限届满后删除。您可随时要求查询、更正或删除我所持有的信息——发邮件给我即可。若您订阅邮件列表，该项完全独立、可自愿选择，并可一键退订。',
        } },
    ],
  },

  '/giving/': {
    title: { en: 'Giving', zh: '捐赠记录' },
    blocks: (loc) => [
      { h: { en: 'The pledge', zh: '承诺' },
        p: {
          en: `I personally donate ${seller.donation.percentOfProfit}% of my profits from this shop to ${seller.donation.recipient}, ${seller.donation.cadence}. It is a pledge I make, not a charge added to your order — your purchase is not itself a charitable donation and is not tax-deductible to you.`,
          zh: `我个人将本店利润的 ${seller.donation.percentOfProfit}% ${seller.donation.cadence === 'quarterly' ? '按季度' : ''}捐赠给 ${seller.donation.recipient}。这是我个人的承诺，而非附加在您订单上的费用——您的购买本身不构成慈善捐赠，也不可用于税前抵扣。`,
        } },
      { h: { en: 'Receipts', zh: '捐赠凭证' },
        p: {
          en: 'Every donation is logged below with its date, the period it covers, and the amount. The running total is what makes the pledge checkable rather than decorative.',
          zh: '每笔捐赠均在下方登记，包含日期、所属期间与金额。累计总额使这一承诺可被核验，而非流于形式。',
        } },
    ],
    after: (loc) => `<table style="width:100%;border-collapse:collapse;margin-top:var(--space-4);font-size:var(--size-caption)">
      <thead><tr>
        <th style="text-align:left;padding:8px 0;border-bottom:1px solid var(--rule)">${loc === 'zh' ? '日期' : 'Date'}</th>
        <th style="text-align:left;padding:8px 0;border-bottom:1px solid var(--rule)">${loc === 'zh' ? '期间' : 'Period'}</th>
        <th style="text-align:right;padding:8px 0;border-bottom:1px solid var(--rule)">${loc === 'zh' ? '金额' : 'Amount'}</th>
      </tr></thead>
      <tbody><tr><td colspan="3" style="padding:16px 0;color:var(--muted)">${loc === 'zh' ? '首次捐赠将在第一个季度结束后记录于此。' : 'The first donation will be recorded here after the first quarter.'}</td></tr></tbody>
    </table>`,
  },
};

function renderPage(p, def, loc) {
  const blocks = def.blocks(loc).map((b) => `
    <h2>${esc(t(b.h, loc))}</h2>
    <p>${esc(t(b.p, loc))}</p>`).join('\n');

  const body = `
<section class="page wrap">
  <h1>${esc(t(def.title, loc))}</h1>
  <div class="prose measure">
    ${blocks}
    ${def.after ? def.after(loc) : ''}
  </div>
</section>`;

  return layout({
    site, seller, loc,
    title: `${t(def.title, loc)} — ${t(seller.artist.siteName, loc)}`,
    description: t(def.blocks(loc)[0].p, loc).slice(0, 180),
    body,
    ogImage: null,
    bodyClass: 'prose-page',
    canonical: lpath(loc, site, p),
    altLocales: altFor(p),
  });
}

/* ------------------------------------------------------------------ *
 * write everything                                                    *
 * ------------------------------------------------------------------ */
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

let pageCount = 0;
for (const loc of LOCALES) {
  out(join(lpath(loc, site, '/'), 'index.html'), renderIndex(loc)); pageCount++;
  for (const w of works) {
    out(join(lpath(loc, site, `/works/${w.slug}/`), 'index.html'), renderWork(w, loc)); pageCount++;
  }
  if (works.some((w) => w.sold)) {
    out(join(lpath(loc, site, '/archive/'), 'index.html'), renderArchive(loc)); pageCount++;
  }
  out(join(lpath(loc, site, '/about/'), 'index.html'), renderAbout(loc)); pageCount++;
  out(join(lpath(loc, site, '/how-to-buy/'), 'index.html'), renderHowToBuy(loc)); pageCount++;
  for (const [p, def] of Object.entries(PAGES)) {
    out(join(lpath(loc, site, p), 'index.html'), renderPage(p, def, loc)); pageCount++;
  }
}

/* client-side availability check */
cpSync(join(ROOT, 'src/scripts/availability.js'), join(DIST, 'availability.js'));

/* one stylesheet, concatenated in cascade order. Font urls are rewritten for
   the deployment base so the same source works at a root and at a subpath. */
const cjkCss = existsSync(join(ROOT, 'public/fonts/fonts-cjk.css'))
  ? readFileSync(join(ROOT, 'public/fonts/fonts-cjk.css'), 'utf8')
  : '';
const css = [cjkCss, ...['tokens', 'base', 'gallery']
    .map((f) => readFileSync(join(ROOT, `src/styles/${f}.css`), 'utf8'))]
  .join('\n')
  .replace(/url\('\/fonts\//g, `url('${asset('/fonts/')}`);
writeFileSync(join(DIST, 'styles.css'), css);

/* fonts */
mkdirSync(join(DIST, 'fonts'), { recursive: true });
for (const f of ['fraunces-latin.woff2', 'inter-latin.woff2',
                 'notoserifsc-subset.woff2',
                 'OFL-Fraunces.txt', 'OFL-Inter.txt']) {
  const src = join(ROOT, 'public/fonts', f);
  if (existsSync(src)) cpSync(src, join(DIST, 'fonts', f));
}

/* Finding C-01. The icon set, built by scripts/build-icons.sh. Copied by name
   rather than by globbing public/, so a stray file there cannot ship. */
for (const f of ['icon.svg', 'favicon.ico', 'apple-touch-icon.png', 'site.webmanifest']) {
  const src = join(ROOT, 'public', f);
  if (existsSync(src)) cpSync(src, join(DIST, f));
  else console.log(`  note: public/${f} missing — run: npm run icons`);
}

/* images, if the build has produced any yet */
if (existsSync(join(ROOT, 'public/img'))) {
  cpSync(join(ROOT, 'public/img'), join(DIST, 'img'), { recursive: true });
}

/* availability.json — the client-side sold check.
   This is the only layer that survives a stale CDN page, a silently failed
   rebuild, or a bfcache restore, which is why the report rates it the highest
   value per hour in the whole back end. */
writeFileSync(join(DIST, 'availability.json'), JSON.stringify(
  Object.fromEntries(works.map((w) => [w.slug, { sold: !!w.sold, price: w.priceUSD }])), null, 2));

/* sitemap */
const urls = [];
for (const loc of LOCALES) {
  urls.push(lpath(loc, site, '/'));
  works.forEach((w) => urls.push(lpath(loc, site, `/works/${w.slug}/`)));
  if (works.some((w) => w.sold)) urls.push(lpath(loc, site, '/archive/'));
  urls.push(lpath(loc, site, '/about/'), lpath(loc, site, '/how-to-buy/'));
  Object.keys(PAGES).forEach((p) => urls.push(lpath(loc, site, p)));
}
writeFileSync(join(DIST, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${origin}${u}</loc></url>`).join('\n')}
</urlset>`);

/* robots.txt — block the AI training crawlers that honour it, while keeping
   the AI *search* bots allowed, since those are referral traffic rather than
   training. Google-Extended and Applebot-Extended govern training only and
   cost nothing in search visibility. */
writeFileSync(join(DIST, 'robots.txt'),
`User-agent: *
Allow: /

${['GPTBot','ChatGPT-User','ClaudeBot','Claude-User','Google-Extended','Applebot-Extended','CCBot','Bytespider','PerplexityBot','meta-externalagent','Amazonbot']
  .map((b) => `User-agent: ${b}\nDisallow: /`).join('\n\n')}

Sitemap: ${origin}/sitemap.xml
`);

/* headers — long, immutable caching on hashed assets */
writeFileSync(join(DIST, '_headers'),
`/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/img/*
  Cache-Control: public, max-age=31536000, immutable
/availability.json
  Cache-Control: public, max-age=60
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`);

/* ------------------------------------------------------------------ */
console.log(`\n  built ${pageCount} pages → dist/`);
console.log(`  ${works.length} works · ${LOCALES.length} locales · entity: ${seller.activeEntity}`);
if (!entity.checkout.supportsCards) {
  console.log(`  note: '${seller.activeEntity}' cannot take cards. Switch activeEntity to`);
  console.log(`        'hk-sole-prop' in src/data/seller.json when the HK entity exists.`);
}
if (unknownMedia.size) {
  console.log(`\n  ${unknownMedia.size} work${unknownMedia.size > 1 ? 's use a medium' : ' uses a medium'} the hero line does not know:`);
  for (const m of unknownMedia) console.log(`    · ${m}`);
  console.log(`  It is being described as oil. Add the noun to site.json 'ui' and`);
  console.log(`  its pattern to MEDIA in build.js, in both locales.`);
}
if (todo.length) {
  console.log(`\n  ${todo.length} field${todo.length > 1 ? 's' : ''} still NEEDS-INPUT:`);
  for (const p of todo.slice(0, 40)) console.log(`    · ${p}`);
  if (todo.length > 40) console.log(`    … and ${todo.length - 40} more`);
  console.log('');
} else {
  console.log('\n  no placeholders remaining.\n');
}
