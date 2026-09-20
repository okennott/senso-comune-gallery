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
  RELEASE, setReadiness, setFingerprints, hashed,
} from './src/templates.js';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadAndAssess } from './scripts/check-readiness.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const site      = read('src/data/site.json');
const seller    = read('src/data/seller.json');
const artworksF = read('src/data/artworks.json');

const works  = [...artworksF.works].sort((a, b) => a.order - b.order);

/* The catalogue's structure (report, "The site's structure"). Series are rooms
   at /works/series/{id}/; genres are facets. Both are declared in site.json,
   and the build refuses a work that names something undeclared, or a slug that
   would collide with a page under /works/. */
const SERIES = site.series.items;
const SERIES_IDS = new Set(SERIES.map((x) => x.id));
const GENRES = new Set((site.genres?.items ?? []).map((g) => g.id));
const RESERVED = new Set(['series', 'sold']);
{
  const bad = [];
  for (const w of artworksF.works) {
    if (RESERVED.has(w.slug)) bad.push(`${w.slug}: slug is reserved for a page under /works/`);
    if (!SERIES_IDS.has(w.section)) bad.push(`${w.slug}: series "${w.section}" is not declared in site.json → series`);
    for (const g of w.genres ?? []) if (!GENRES.has(g)) bad.push(`${w.slug}: genre "${g}" is not declared in site.json → genres`);
  }
  if (bad.length) { console.error('\n  catalogue structure:\n' + bad.map((b) => `    ✗ ${b}`).join('\n') + '\n'); process.exit(1); }
}

/* True pixel sizes of every view, written by build-images.mjs. A real
   photograph keeps its own proportions; a placeholder has the proportions the
   pipeline gave it. Missing (images not built yet): fall back to squares, and
   say so, rather than guess. */
const VIEWS_FILE = join(ROOT, 'public/img/views.json');
const VIEWS = existsSync(VIEWS_FILE) ? JSON.parse(readFileSync(VIEWS_FILE, 'utf8')) : {};
if (!existsSync(VIEWS_FILE)) console.log('  note: public/img/views.json missing — run: npm run build:images');

/* ------------------------------------------------------------------ *
 * The readiness gate (report, "Readiness").                           *
 *                                                                     *
 * Asked before anything is written. A release build with a blocker   *
 * stops here, printing the full report — and it stops BEFORE dist/ is *
 * cleared, so whatever site was last built is left exactly as it was. *
 * A preview build carries on, and says on every page what is owed.    *
 * ------------------------------------------------------------------ */
const READY = loadAndAssess();
setReadiness(READY);
if (RELEASE && !READY.ready) {
  try { execFileSync(process.execPath, [join(ROOT, 'scripts/check-readiness.mjs')], { stdio: 'inherit' }); } catch {}
  console.error('  RELEASE REFUSED — the readiness gate is closed. Nothing was built; dist/ is untouched.\n');
  process.exit(1);
}

/** A view is shown in a release only if its photograph exists (rule WK-10). */
const viewShown = (w, v) => !RELEASE || VIEWS[`${w.image}-${v.kind}`]?.placeholder === false;
const LOCALES = Object.keys(site.locales);
const ui = site.ui;
const origin = process.env.SITE_URL || site.url;
const entity = seller.entities[seller.activeEntity];

/* ------------------------------------------------------------------ *
 * NEEDS-INPUT audit. The site must not go live with placeholders, so  *
 * the build reports every one rather than silently shipping them.     *
 * ------------------------------------------------------------------ */
/* The placeholder audit moved to the readiness gate: scripts/readiness.mjs. */

/* ------------------------------------------------------------------ */
/* URLs carry the deployment base, but the built files must sit at the artifact
   root — a Pages project site serves the artifact AT /<repo>/, it does not
   expect the files to be nested inside another copy of that folder. */
const stripBase = (p) => (BASE && p.startsWith(BASE) ? p.slice(BASE.length) || '/' : p);

/* Placeholders still owed are marked where a reader can see them: in page
   text only. Inside a tag (alt, aria-label, a meta description), a <title>,
   a script (the structured data) or a style, a <mark> would be broken markup
   or literal text, so those are left alone — and the build's NEEDS-INPUT
   report above still lists every one of them. Because the mark is wrapped
   around the placeholder word itself, supplying the field removes it. */
const FLAG = 'NEEDS-INPUT';
function flagPlaceholders(html) {
  let skip = null;                                  // inside title/script/style
  return html.split(/(<[^>]*>)/).map((part) => {
    if (part.startsWith('<')) {
      const m = part.match(/^<(\/?)(title|script|style|textarea)\b/i);
      if (m) skip = m[1] ? null : m[2].toLowerCase();
      return part;
    }
    return skip || !part.includes(FLAG) ? part
      : part.replaceAll(FLAG, `<mark class="needs-input">${FLAG}</mark>`);
  }).join('');
}

const out = (rel, html) => {
  const file = join(DIST, stripBase(rel));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, flagPlaceholders(html));
};

const altFor = (p) => LOCALES.map((l) => [l, lpath(l, site, p)]);

/** Responsive image. Every call site is a work's MAIN image — the one in the
 *  list, the hero, the archive or on its own page — so each carries the
 *  view-transition name that lets the painting travel between those pages.
 *  The lightbox copy is written separately and deliberately unnamed: two
 *  elements with one name on a page abort the transition.
 *
 *  width/height are non-negotiable: without them a lazy
 *  image defaults to 0×0, which can convince the browser everything is
 *  in-viewport and load every one at once. They are also the difference
 *  between CLS 0 and CLS 0.4. */
function picture(w, { eager = false, sizes = '(min-width:900px) 900px, calc(100vw - 40px)', vt = true } = {}, loc) {
  const widths = [640, 960, 1280, 1600, 2000];
  const srcset = (ext) => widths.map((x) => `${asset(`/img/${w.image}-${x}.${ext}`)} ${x}w`).join(', ');
  // Intrinsic pixel dimensions of the largest variant, in the work's own ratio.
  const iw = 2000;
  const ih = Math.round((w.heightCm / w.widthCm) * 2000);
  return `<picture>
      <source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}">
      <img class="work__img"${vt ? ` style="view-transition-name:work-${w.slug};view-transition-class:work"` : ''} src="${asset(`/img/${w.image}-1280.webp`)}" srcset="${srcset('webp')}" sizes="${sizes}"
           width="${iw}" height="${ih}" alt="${esc(t(w.alt, loc))}"
           ${eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'}>
    </picture>`;
}

/** An extra view — detail, edge or back — as a responsive image in the same
 *  mount as the front. No transition name: only the front view carries the
 *  painting between pages (G-05). */
const VIEW_LABEL = { front: 'viewFront', detail: 'viewDetail', edge: 'viewEdge', back: 'viewBack', video: 'viewVideo' };
function viewPicture(w, v, loc, sizes) {
  const key = `${w.image}-${v.kind}`;
  const m = VIEWS[key] ?? { width: 2000, height: 2000, placeholder: true };
  const widths = [640, 960, 1280, 1600, 2000];
  const srcset = (ext) => widths.map((x) => `${asset(`/img/${key}-${x}.${ext}`)} ${x}w`).join(', ');
  return `<picture>
      <source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}">
      <img class="work__img work__img--view" src="${asset(`/img/${key}-1280.webp`)}" srcset="${srcset('webp')}" sizes="${sizes}"
           width="${m.width}" height="${m.height}" alt="${esc(t(v.alt, loc))}" loading="lazy" decoding="async"${m.placeholder ? ' data-placeholder="view"' : ''}>
    </picture>`;
}

/** The gallery on a work's own page: the front, then its extra views, in a
 *  scroll-snap strip that a phone swipes natively, with a thumbnail for every
 *  view. Works with no script: each thumbnail is a link to its view. gallery.js
 *  adds the current-view marker, arrow keys and scrolling without history. */
function gallery(w, loc) {
  const sizes = '(min-width:900px) 55vw, calc(100vw - 40px)';
  const views = [{ kind: 'front' }, ...(w.views ?? []).filter((v) => viewShown(w, v))];
  const id = (kind) => `view-${w.slug}-${kind}`;
  const label = (kind) => t(ui[VIEW_LABEL[kind]], loc);
  const n = views.length;

  const slide = (v, i) => {
    const pos = `${label(v.kind)}, ${i + 1} ${t(ui.viewOf, loc)} ${n}`;
    if (v.kind === 'front') {
      return `<li class="gallery__view" id="${id('front')}" aria-label="${esc(pos)}">
        <figure class="work__figure" style="margin:0">
          <button class="work__zoom" command="show-modal" commandfor="lb-${esc(w.slug)}"
                  style="all:unset;display:block;cursor:zoom-in"
                  aria-label="${esc(t(ui.viewFull, loc))}">
            ${picture(w, { eager: true, sizes }, loc)}
          </button>
        </figure>
      </li>`;
    }
    if (v.kind === 'video') {
      const key = `${w.image}-video`;
      const m = VIEWS[key] ?? { width: 2000, height: 2500, placeholder: true, video: '/placeholders/work-video.mp4' };
      // preload="none": nothing is fetched until the visitor presses play,
      // which matters across the border more than anywhere else on the site.
      return `<li class="gallery__view" id="${id('video')}" aria-label="${esc(pos)}">
        <video class="work__video" controls preload="none" playsinline width="${m.width}" height="${m.height}"
               poster="${asset(`/img/${key}-1280.webp`)}" aria-label="${esc(`${label('video')}: ${t(v.alt, loc)}`)}"${m.placeholder ? ' data-placeholder="video"' : ''}>
          <source src="${asset(m.video)}" type="video/mp4">
          <p>${esc(t(v.alt, loc))}</p>
        </video>
      </li>`;
    }
    return `<li class="gallery__view" id="${id(v.kind)}" aria-label="${esc(pos)}">
        <figure class="work__figure" style="margin:0">
          <button class="work__zoom" command="show-modal" commandfor="lb-${esc(w.slug)}-${v.kind}"
                  style="all:unset;display:block;cursor:zoom-in"
                  aria-label="${esc(`${t(ui.viewFull, loc)}: ${label(v.kind)}`)}">
            ${viewPicture(w, v, loc, sizes)}
          </button>
        </figure>
      </li>`;
  };

  const thumb = (v) => {
    const key = v.kind === 'front' ? w.image : `${w.image}-${v.kind}`;
    return `<li><a class="gallery__thumb${v.kind === 'video' ? ' gallery__thumb--video' : ''}" href="#${id(v.kind)}">
          <img src="${asset(`/img/${key}-160.webp`)}" srcset="${asset(`/img/${key}-160.webp`)} 160w, ${asset(`/img/${key}-320.webp`)} 320w"
               sizes="80px" width="160" height="160" alt="" loading="lazy" decoding="async">
          <span class="visually-hidden">${esc(label(v.kind))}</span>
        </a></li>`;
  };

  return `<div class="gallery" data-gallery>
      <ol class="gallery__views" aria-label="${esc(t(ui.views, loc))}" tabindex="0">
      ${views.map(slide).join('\n      ')}
      </ol>
      <ol class="gallery__thumbs" aria-label="${esc(t(ui.chooseView, loc))}">
        ${views.map(thumb).join('\n        ')}
      </ol>
    </div>`;
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
  // While the readiness gate is closed a purchase control cannot be used: no
  // href, so it is neither a link nor focusable; aria-disabled so it is still
  // announced for what it will be. The address it will carry is kept in
  // data-inert-href, so its wording can be checked before the site is ready.
  const inert = (html) => (READY.ready ? html : html
    .replace(/<a class="btn"([^>]*?) href="([^"]*)"/, '<a class="btn" aria-disabled="true"$1 data-inert-href="$2"')
    .replace(/<\/span><\/a>$/, ` · ${esc(t(site.readiness.notOnSale, loc))}</span></a>`));

  const action = w.sold
    ? `<a class="link-quiet" href="mailto:${esc(seller.contact.email)}?subject=${encodeURIComponent(t(w.title, loc))}">${esc(t(ui.soldEnquire, loc))}</a>`
    : w.checkoutUrl
      ? `<a class="btn" data-enquire-href="mailto:${esc(seller.contact.email)}" href="${esc(w.checkoutUrl)}" rel="noopener">${esc(t(ui.buy, loc))}<span class="visually-hidden"> — ${title}, ${money(w.priceUSD)}</span></a>`
      // Finding A-02. With no checkout link this control opens a mail client,
      // so it must not say "Buy". Same button, honest promise.
      : `<a class="btn" href="mailto:${esc(seller.contact.email)}?subject=${encodeURIComponent(t(w.title, loc))}">${esc(t(ui.enquireToBuy, loc))}<span class="visually-hidden"> — ${title}, ${money(w.priceUSD)}</span></a>`;

  const actionEl = w.sold ? action : inert(action);

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
          ${actionEl}
        </div>
      </div>`;
}

/* ------------------------------------------------------------------ *
 * catalogue pieces                                                    *
 * ------------------------------------------------------------------ */

/** Newest first, then the catalogue's own order. */
const byNewest = (a, b) => (b.year - a.year) || (a.order - b.order);
const seriesOf = (id) => SERIES.find((x) => x.id === id);
const seriesPath = (id) => `/works/series/${id}/`;

/** A grid of works: image in its mat, the tombstone beneath. The same card on
 *  the homepage, the Works page and every series page. */
function catalogue(list, loc, { level = 'h2', eagerFirst = false } = {}) {
  return `<ol class="works works--catalogue">
    ${list.map((w, i) => `<li class="work">
      <figure class="work__figure">
        <a href="${lpath(loc, site, `/works/${w.slug}/`)}" style="display:block">
          ${picture(w, { eager: eagerFirst && i === 0, sizes: '(min-width:1100px) 340px, (min-width:600px) 45vw, calc(100vw - 60px)' }, loc)}
        </a>
      </figure>
      ${tombstone(w, loc, { level })}
    </li>`).join('\n    ')}
  </ol>`;
}

/** Local navigation for the Works section: All, each series, Sold. Horizontal
 *  while there are few enough tabs to read as one row (report: Baymard's
 *  threshold for horizontal filtering is 6-8 types). */
function worksNav(loc, active) {
  const sold = works.filter((w) => w.sold).length;
  const tabs = [
    ['all', '/works/', t(site.sections.works.all, loc), works.filter((w) => !w.sold).length],
    ...SERIES.map((x) => [x.id, seriesPath(x.id), t(x.title, loc), works.filter((w) => !w.sold && w.section === x.id).length]),
    ...(sold ? [['sold', '/works/sold/', t(site.sections.archive.title, loc), sold]] : []),
  ];
  return `<nav class="localnav" aria-label="${esc(t(site.sections.works.title, loc))}">
    <ul>
      ${tabs.map(([id, href, label, n]) => `<li><a href="${lpath(loc, site, href)}"${id === active ? ' aria-current="page"' : ''}>${esc(label)} <span class="localnav__count">${n}</span></a></li>`).join('\n      ')}
    </ul>
  </nav>`;
}

/** Breadcrumbs from the second level down (report: NN/g — deeper pages).
 *  The last item is the current page and is not a link. A work's canonical
 *  path runs through its one series. */
function breadcrumb(loc, trail) {
  const items = [[t(ui.home, loc), '/'], ...trail];
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, href], i) => ({
      '@type': 'ListItem', position: i + 1, name,
      ...(href ? { item: origin + lpath(loc, site, href) } : {}),
    })),
  };
  return `<nav class="breadcrumb" aria-label="${esc(t(ui.breadcrumb, loc))}">
    <ol>
      ${items.map(([name, href], i) => i < items.length - 1
        ? `<li><a href="${lpath(loc, site, href)}">${esc(name)}</a></li>`
        : `<li><span aria-current="page">${esc(name)}</span></li>`).join('\n      ')}
    </ol>
  </nav>
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
}

/* ------------------------------------------------------------------ *
 * index                                                               *
 * ------------------------------------------------------------------ */
function renderIndex(loc) {
  const S = site.sections;
  const available = works.filter((w) => !w.sold);

  // Finding A-01 stands: a painting in the hero. It is the first available
  // work of the first series.
  const heroWork = available.find((w) => w.section === SERIES[0].id) ?? available[0] ?? null;

  // The homepage used to show every work at full size, one per screen — fine
  // for six, impossible for sixty. It now shows the newest few, the series as
  // rooms, and sends everything else to /works/ (report, "The site's structure").
  const LATEST = 4;
  const latest = available.filter((w) => w !== heroWork).sort(byNewest).slice(0, LATEST);

  const heroFigure = heroWork ? `
  <section class="hero__feature" aria-labelledby="featured-h">
    <h2 id="featured-h" class="hero__label">${esc(t(S.featured.title, loc))}</h2>
    <figure class="hero__work">
      <a href="${lpath(loc, site, `/works/${heroWork.slug}/`)}">
        ${picture(heroWork, { eager: true, sizes: '(min-width:900px) 40vw, calc(100vw - 40px)' }, loc)}
      </a>
      <figcaption>
        ${tombstone(heroWork, loc, { level: 'h3' })}
      </figcaption>
    </figure>
  </section>` : '';

  const seriesCards = SERIES.map((x) => {
    const inSeries = works.filter((w) => w.section === x.id);
    const cover = inSeries.find((w) => !w.sold) ?? inSeries[0];
    const n = inSeries.filter((w) => !w.sold).length;
    return `<li class="series-card">
      <a class="series-card__link" href="${lpath(loc, site, seriesPath(x.id))}">
        ${cover ? `<span class="series-card__cover">${picture(cover, { vt: false, sizes: '(min-width:900px) 360px, calc(100vw - 60px)' }, loc)}</span>` : ''}
        <span class="series-card__text">
          <span class="series-card__title">${esc(t(x.title, loc))}</span>
          <span class="series-card__count">${n} ${esc(t(S.works.count, loc))}</span>
          <span class="series-card__intro">${esc(t(x.intro, loc))}</span>
          <span class="link-quiet series-card__more">${esc(t(S.works.viewSeries, loc))}</span>
        </span>
      </a>
    </li>`;
  }).join('\n    ');

  const body = `
<section class="hero wrap${heroWork ? ' hero--split' : ''}">
  <div class="hero__lede">
    <h1 class="visually-hidden">${esc(t(seller.artist.siteName, loc))}</h1>
    <figure class="hero__quote">
      <blockquote cite="${esc(site.hero.original.source)}"><p class="hero__original" lang="${esc(site.hero.original.lang)}">${site.hero.original.text.split('\n').map(esc).join('<br>')}</p><p class="hero__motto">${t(site.hero.title, loc).split('\n').map(esc).join('<br>')}</p></blockquote>
      <figcaption class="hero__cite">— ${esc(t(site.hero.attribution, loc))}</figcaption>
    </figure>
    <a class="link-quiet" href="${lpath(loc, site, site.hero.ctaHref)}">${esc(t(site.hero.cta, loc))}</a>
  </div>${heroFigure}
</section>

<!-- Every band is named by the two grounds it joins, and nothing sits on the
     bare sheet between a band and its section. -->
<div class="edge edge--pale-pale" aria-hidden="true"></div>

<section class="section ground--pale" id="latest">
  <div class="wrap">
    <div class="section__head">
      <h2>${esc(t(S.latest.title, loc))}</h2>
      <p class="section__intro">${esc(t(S.latest.intro, loc))}</p>
    </div>
    ${catalogue(latest, loc, { level: 'h3' })}
    <p class="section__more"><a class="link-quiet" href="${lpath(loc, site, '/works/')}">${esc(t(S.works.allWorks, loc))} (${available.length})</a></p>
  </div>
</section>

<div class="edge edge--pale-mid" aria-hidden="true"></div>

<section class="section ground--mid" id="series">
  <div class="wrap">
    <div class="section__head">
      <h2>${esc(t(S.seriesIndex.title, loc))}</h2>
      <p class="section__intro">${esc(t(S.seriesIndex.intro, loc))}</p>
    </div>
    <ul class="series-cards">
    ${seriesCards}
    </ul>
  </div>
</section>

<div class="edge edge--mid-deep" aria-hidden="true"></div>

<section class="section ground--deep" id="about">
  <div class="wrap">
    <div class="section__head">
      <div class="section__aside">
        <h2>${esc(t(S.about.title, loc))}</h2>
        ${portraitFrame(loc, 'section')}
      </div>
      <div class="prose measure">
        ${t(site.about.paragraphs, loc).slice(0, 2).map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
        <p><a class="link-quiet" href="${lpath(loc, site, '/about/')}">${loc === 'zh' ? '继续阅读' : 'Read the rest'}</a></p>
      </div>
    </div>
  </div>
</section>

<div class="edge edge--deep-pale" aria-hidden="true"></div>

<section class="section ground--pale wrap" id="buy">
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
 * the catalogue: Works, each series, sold works                       *
 * ------------------------------------------------------------------ */
function renderWorks(loc) {
  const S = site.sections;
  const available = works.filter((w) => !w.sold).sort(byNewest);
  const body = `
<section class="section wrap catalogue-page">
  <div class="section__head">
    <h1>${esc(t(S.works.title, loc))}</h1>
    <p class="section__intro">${esc(t(S.works.intro, loc))}</p>
  </div>
  ${worksNav(loc, 'all')}
  ${catalogue(available, loc, { eagerFirst: true })}
</section>`;
  return layout({
    site, seller, loc, current: 'works',
    title: `${t(S.works.title, loc)} — ${t(seller.artist.siteName, loc)}`,
    description: t(S.works.intro, loc), body,
    ogImage: available[0] ? `/img/${available[0].image}-1600.webp` : null,
    canonical: lpath(loc, site, '/works/'), altLocales: altFor('/works/'),
  });
}

function renderSeries(x, loc) {
  const inSeries = works.filter((w) => w.section === x.id);
  const available = inSeries.filter((w) => !w.sold).sort(byNewest);
  const sold = inSeries.filter((w) => w.sold).length;
  // A series keeps its own character: the epigraph and texture that used to
  // mark its homepage section now mark its room.
  const body = `
<section class="section wrap catalogue-page${x.texture === 'hatch' ? ' hatch' : ''}">
  ${breadcrumb(loc, [[t(site.sections.works.title, loc), '/works/'], [t(x.title, loc), null]])}
  <div class="section__head">
    <h1>${esc(t(x.title, loc))}</h1>
    <div>
      ${x.epigraph ? `<blockquote class="epigraph">
        ${esc(t(x.epigraph.quote, loc))}
        <cite>— ${esc(x.epigraph.attribution)}</cite>
      </blockquote>` : ''}
      <p class="section__intro">${esc(t(x.intro, loc))}</p>
    </div>
  </div>
  ${worksNav(loc, x.id)}
  ${catalogue(available, loc, { eagerFirst: true })}
  ${sold ? `<p class="section__more"><a class="link-quiet" href="${lpath(loc, site, '/works/sold/')}">${esc(t(site.sections.archive.linkLabel, loc))} (${sold})</a></p>` : ''}
</section>`;
  return layout({
    site, seller, loc, current: 'works',
    title: `${t(x.title, loc)} — ${t(seller.artist.siteName, loc)}`,
    description: t(x.intro, loc), body,
    ogImage: available[0] ? `/img/${available[0].image}-1600.webp` : null,
    canonical: lpath(loc, site, seriesPath(x.id)), altLocales: altFor(seriesPath(x.id)),
  });
}

/** Sold works — formerly /archive/. A reference list, deliberately smaller
 *  than the selling grid (finding D-02): big means for sale. */
function renderSold(loc) {
  const S = site.sections;
  const sold = works.filter((w) => w.sold).sort(byNewest);
  const body = `
<section class="section wrap catalogue-page" id="archive">
  ${breadcrumb(loc, [[t(S.works.title, loc), '/works/'], [t(S.archive.title, loc), null]])}
  <div class="section__head">
    <h1>${esc(t(S.archive.title, loc))}</h1>
    <p class="section__intro">${esc(t(S.archive.intro, loc))}</p>
  </div>
  ${worksNav(loc, 'sold')}
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
</section>`;
  return layout({
    site, seller, loc, current: 'works',
    title: `${t(S.archive.title, loc)} — ${t(seller.artist.siteName, loc)}`,
    description: t(S.archive.intro, loc), body,
    ogImage: sold.length ? `/img/${sold[0].image}-1600.webp` : null,
    canonical: lpath(loc, site, '/works/sold/'), altLocales: altFor('/works/sold/'),
  });
}

/** The old address of sold works. A static host cannot always send a real
 *  redirect (GitHub Pages cannot; Cloudflare Pages reads _redirects), so this
 *  page does it for both: an immediate refresh, a canonical to the new page,
 *  and a visible link for anyone whose browser ignores the refresh. */
function redirectStub(loc, to) {
  const href = lpath(loc, site, to);
  return `<!doctype html>
<html lang="${site.locales[loc].lang}">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${href}">
<link rel="canonical" href="${esc(origin + href)}">
<title>${esc(t(site.sections.archive.title, loc))}</title>
</head>
<body><p><a href="${href}">${esc(t(site.sections.archive.title, loc))}</a></p></body>
</html>`;
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
  ${breadcrumb(loc, [[t(site.sections.works.title, loc), '/works/'], [t(seriesOf(w.section).title, loc), seriesPath(w.section)], [t(w.title, loc), null]])}

  <div class="detail__grid">
    <div>
      ${gallery(w, loc)}

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
${(w.views ?? []).filter((v) => v.kind !== 'video' && viewShown(w, v)).map((v) => {
  const key = `${w.image}-${v.kind}`;
  const m = VIEWS[key] ?? { width: 2000, height: 2000 };
  return `<dialog class="lightbox" id="lb-${esc(w.slug)}-${v.kind}">
  <form method="dialog" style="margin:0;position:relative">
    <button class="lightbox__close" value="close">${esc(t(ui.closeDialog, loc))}</button>
  </form>
  <img src="${asset(`/img/${key}-2000.webp`)}" alt="${esc(t(v.alt, loc))}" width="${m.width}" height="${m.height}" loading="lazy">
</dialog>`;
}).join('\n')}
<script src="${hashed('/gallery.js')}" defer></script>

${jsonLd(w, site, seller, loc, origin)}`;

  return layout({
    current: 'works',
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
/* ------------------------------------------------------------------ *
 * The artist's portrait                                               *
 *                                                                     *
 * About is the one part of the site that is a person rather than a    *
 * catalogue, and it carried no face. The portrait is mounted the way  *
 * a painting is — the same cream mat, the same mount shadow, the same *
 * board grain — because that is the site's device for an object on a  *
 * wall, and a photograph of the artist is an object like any other.   *
 * It is NOT a work: it is not in artworks.json, has no price, no      *
 * lightbox and no view transition, and it is never zoomable.          *
 *                                                                     *
 * WHERE IT SITS, in each of the two places About is featured:         *
 *   the homepage section — in the heading column under the h2, so it  *
 *     stands beside the prose at every width that column is beside    *
 *     it, and above the prose on a phone, with no new breakpoint;     *
 *   the About page — as a frontispiece over the title. That page's    *
 *     mount is 660px around a 34rem measure (finding D-01) and there  *
 *     is no room beside the column for a plate. A book puts the       *
 *     portrait on the leaf facing the title; this is that leaf.       *
 *                                                                     *
 * WHILE THERE IS NO PHOTOGRAPH the frame holds the image pipeline's   *
 * placeholder card, so the layout is real and can be judged at every  *
 * width. A RELEASE build leaves the frame out altogether rather than  *
 * ship an empty mat — readiness ID-08, the arrangement WK-10 already  *
 * uses for a work's unshot views. Supplying masters/portrait.jpg and  *
 * running the image build is the whole of turning it on.              *
 * ------------------------------------------------------------------ */
const PORTRAIT_WIDTHS = [320, 640, 960];
const portraitShown = () => !RELEASE || VIEWS.portrait?.placeholder === false;

/** @param {'section'|'page'} where  the homepage section, or the About page. */
function portraitFrame(loc, where) {
  if (!portraitShown()) return '';
  const m = VIEWS.portrait ?? { width: 960, height: 1200, placeholder: true };
  const srcset = (ext) => PORTRAIT_WIDTHS.map((x) => `${asset(`/img/portrait-${x}.${ext}`)} ${x}w`).join(', ');
  // The plate is capped in CSS at 13.5rem in the section and 15rem on the
  // page; the widths above cover both at 3x. A length, not a percentage:
  // the box never tracks the viewport.
  const sizes = where === 'page' ? '15rem' : '13.5rem';
  return `<figure class="portrait portrait--${where}">
      <picture>
        <source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}">
        <img class="portrait__img" src="${asset('/img/portrait-640.webp')}" srcset="${srcset('webp')}" sizes="${sizes}"
             width="${m.width}" height="${m.height}" alt="${esc(t(site.about.portrait.alt, loc))}"
             loading="lazy" decoding="async"${m.placeholder ? ' data-placeholder="portrait"' : ''}>
      </picture>
      <figcaption class="portrait__cap">${esc(t(seller.artist.name, loc))}</figcaption>
    </figure>`;
}

/* The About page is the one page that is only prose, so it is the one page
   set as a page of a book rather than as a screen: the display face, a lede,
   a drop cap and a real italic. See "About, set as a book page" in the report.

   This is the only markup the treatment needs. A quotation that ends a
   paragraph — van Gogh, in the third — is given an <em> so it can be set in
   the italic the site now ships, instead of sitting in the running text
   distinguished by nothing but its quotation marks. English only: the Chinese
   text quotes with 「」, and a slanted CJK face is not an italic. Run over
   ESCAPED text, so it can only ever match the marks the escaper leaves alone. */
const quoted = (html, loc) => (loc !== 'en' ? html
  : html.replace(/(\u201C[^\u201C\u201D]+\u201D)\s*$/, '<em class="quoted">$1</em>'));

function renderAbout(loc) {
  const paras = t(site.about.paragraphs, loc);
  const body = `
<section class="page page--about wrap">
  ${portraitFrame(loc, 'page')}
  <h1>${esc(t(site.sections.about.title, loc))}</h1>
  <div class="prose measure">
    ${paras.map((x) => `<p>${quoted(esc(x), loc)}</p>`).join('\n    ')}
    <p><a href="${lpath(loc, site, '/giving/')}">${loc === 'zh' ? '查看捐赠记录' : 'See the giving record'}</a> · <a href="${lpath(loc, site, '/how-to-buy/')}">${esc(t(site.sections.buy.title, loc))}</a></p>
  </div>
</section>`;
  return layout({
    site, seller, loc, current: 'about',
    title: `${t(site.sections.about.title, loc)} — ${t(seller.artist.siteName, loc)}`,
    description: paras[0].slice(0, 180),
    /* about-page narrows the mount: the serif column is 34rem, and D-01's
       860px sheet was cut for a 62ch sans column. */
    body, ogImage: null, bodyClass: 'prose-page about-page',
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

function renderContact(loc) {
  const S = site.sections.contact;
  const body = `
<section class="page wrap">
  <h1>${esc(t(S.title, loc))}</h1>
  <div class="prose measure">
    <p>${esc(t(S.intro, loc))}</p>
  </div>
  ${contactPanel(loc)}
</section>`;
  return layout({
    site, seller, loc, current: 'contact',
    title: `${t(S.title, loc)} — ${t(seller.artist.siteName, loc)}`,
    description: t(S.intro, loc).slice(0, 180),
    body, ogImage: null, bodyClass: 'prose-page',
    canonical: lpath(loc, site, '/contact/'), altLocales: altFor('/contact/'),
  });
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
    site, seller, loc, current: 'buy',
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

/* ---------- the code assets, content-addressed ----------
   The stylesheet and the two scripts are written FIRST, because every page
   then has to name them, and the name each one gets contains a hash of its
   own bytes.

   Why the plain names were not safe. A page and its stylesheet are fetched
   separately and cached separately, and each host decides for how long.
   GitHub Pages — the preview target — sends `max-age=600` on both and does
   not read _headers, so for ten minutes after a deploy a returning visitor
   can be handed yesterday's /styles.css with today's /index.html. That is not
   a stale site but a wrong one: the two halves disagree, and the disagreement
   looks exactly like a change that did not ship. It was mistaken for one on
   20 September 2026.

   A name that contains the bytes cannot be served for other bytes. Old page,
   old stylesheet, together, until the page expires; new page, new stylesheet,
   at once. Nothing here shortens the ten minutes — no file in this repository
   can, on a host that ignores _headers — but the page a visitor gets is at
   every moment the page as it was built. On the production host it also earns
   the three of them a year in cache, immutable (see _headers below).       */
const fingerprint = (name, body) => {
  const h = createHash('sha256').update(body).digest('hex').slice(0, 8);
  const stamped = name.replace(/\.(\w+)$/, `.${h}.$1`);
  writeFileSync(join(DIST, stamped), body);
  return `/${stamped}`;
};

/* one stylesheet, concatenated in cascade order. Font urls are rewritten for
   the deployment base so the same source works at a root and at a subpath. */
const cjkCss = existsSync(join(ROOT, 'public/fonts/fonts-cjk.css'))
  ? readFileSync(join(ROOT, 'public/fonts/fonts-cjk.css'), 'utf8')
  : '';
const css = [cjkCss, ...['tokens', 'base', 'gallery']
    .map((f) => readFileSync(join(ROOT, `src/styles/${f}.css`), 'utf8'))]
  .join('\n')
  .replace(/url\('\/fonts\//g, `url('${asset('/fonts/')}`);

/* the lightbox, and the client-side availability check */
const ASSETS = {
  '/styles.css':      fingerprint('styles.css', css),
  '/gallery.js':      fingerprint('gallery.js', readFileSync(join(ROOT, 'src/scripts/gallery.js'))),
  '/availability.js': fingerprint('availability.js', readFileSync(join(ROOT, 'src/scripts/availability.js'))),
};
setFingerprints(ASSETS);

let pageCount = 0;
/* The 404. GitHub Pages and Cloudflare Pages both serve /404.html for any
   missing path, including the search, account and cart placeholders, before
   anything knows the visitor's language — so it speaks both. Not indexed, no
   canonical, not in the sitemap. */
{
  const NF = site.notFound;
  const both = (field, tag, cls = '') => LOCALES.map((l) =>
    `<${tag}${cls ? ` class="${cls}"` : ''} lang="${site.locales[l].lang}">${esc(t(field, l))}</${tag}>`).join('\n    ');
  const body = `
<section class="section wrap notfound">
  <div class="prose measure">
    <h1>${LOCALES.map((l) => `<span lang="${site.locales[l].lang}" class="notfound__title">${esc(t(NF.title, l))}</span>`).join(' ')}</h1>
    ${both(NF.body, 'p')}
    <p>${LOCALES.map((l) => `<a class="link-quiet" lang="${site.locales[l].lang}" href="${lpath(l, site, '/')}">${esc(t(NF.home, l))}</a>`).join('<br>')}</p>
  </div>
</section>`;
  out('/404.html', layout({
    site, seller, loc: 'en', title: `${t(NF.title, 'en')} · ${t(NF.title, 'zh')} — ${t(seller.artist.siteName, 'en')}`,
    description: t(NF.body, 'en'), body, canonical: null, altLocales: altFor('/'),
    bodyClass: 'prose-page', noindex: true,
  }));
}

for (const loc of LOCALES) {
  out(join(lpath(loc, site, '/'), 'index.html'), renderIndex(loc)); pageCount++;
  for (const w of works) {
    out(join(lpath(loc, site, `/works/${w.slug}/`), 'index.html'), renderWork(w, loc)); pageCount++;
  }
  out(join(lpath(loc, site, '/works/'), 'index.html'), renderWorks(loc)); pageCount++;
  for (const x of SERIES) {
    out(join(lpath(loc, site, seriesPath(x.id)), 'index.html'), renderSeries(x, loc)); pageCount++;
  }
  if (works.some((w) => w.sold)) {
    out(join(lpath(loc, site, '/works/sold/'), 'index.html'), renderSold(loc)); pageCount++;
  }
  // the old address of sold works keeps working
  out(join(lpath(loc, site, '/archive/'), 'index.html'), redirectStub(loc, '/works/sold/'));
  out(join(lpath(loc, site, '/contact/'), 'index.html'), renderContact(loc)); pageCount++;
  out(join(lpath(loc, site, '/about/'), 'index.html'), renderAbout(loc)); pageCount++;
  out(join(lpath(loc, site, '/how-to-buy/'), 'index.html'), renderHowToBuy(loc)); pageCount++;
  for (const [p, def] of Object.entries(PAGES)) {
    out(join(lpath(loc, site, p), 'index.html'), renderPage(p, def, loc)); pageCount++;
  }
}

cpSync(join(ROOT, 'public/placeholders'), join(DIST, 'placeholders'), { recursive: true });
if (existsSync(join(ROOT, 'public/video'))) {
  cpSync(join(ROOT, 'public/video'), join(DIST, 'video'), { recursive: true });
}

/* fonts */
mkdirSync(join(DIST, 'fonts'), { recursive: true });
for (const f of ['fraunces-latin.woff2', 'fraunces-italic-latin.woff2',
                 'inter-latin.woff2', 'notoserifsc-subset.woff2',
                 'OFL-Fraunces.txt', 'OFL-Inter.txt']) {
  const src = join(ROOT, 'public/fonts', f);
  if (existsSync(src)) cpSync(src, join(DIST, 'fonts', f));
}

/* Finding C-01. The icon set, built by scripts/build-icons.sh. Copied by name
   rather than by globbing public/, so a stray file there cannot ship. */
for (const f of ['icon-32.png', 'favicon.ico', 'apple-touch-icon.png', 'logo-mark.png', 'site.webmanifest']) {
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
  urls.push(lpath(loc, site, '/works/'), lpath(loc, site, '/contact/'));
  SERIES.forEach((x) => urls.push(lpath(loc, site, seriesPath(x.id))));
  if (works.some((w) => w.sold)) urls.push(lpath(loc, site, '/works/sold/'));
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

/* redirects — Cloudflare Pages reads this file and answers with a real 301.
   GitHub Pages ignores it; the stub page at the old address covers that host. */
writeFileSync(join(DIST, '_redirects'),
  LOCALES.map((l) => `${lpath(l, site, '/archive/')} ${lpath(l, site, '/works/sold/')} 301`).join('\n') + '\n');

/* headers — long, immutable caching on hashed assets */
/* Read by Cloudflare Pages, the production target; GitHub Pages ignores it and
   sends max-age=600 on everything, which is the whole reason the three code
   assets carry a hash in their names (see "the code assets" above). Because
   the name changes with the bytes, they can be kept for a year and never
   revalidated — a page only ever asks for the one it was built with. */
writeFileSync(join(DIST, '_headers'),
`/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/img/*
  Cache-Control: public, max-age=31536000, immutable
/styles.*.css
  Cache-Control: public, max-age=31536000, immutable
/gallery.*.js
  Cache-Control: public, max-age=31536000, immutable
/availability.*.js
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
console.log(READY.ready
  ? `\n  readiness: READY — ${READY.rules} rules pass${READY.waived.length ? `, ${READY.waived.length} waived` : ''}`
  : `\n  readiness: NOT READY — ${READY.blockers.length} blockers. This is a preview build.\n  See what is owed: npm run readiness`);

/* The verdict travels with the site: a release carries proof it passed, and
   the waivers it passed with. */
writeFileSync(join(DIST, 'readiness.json'), JSON.stringify({
  mode: RELEASE ? 'release' : 'preview',
  ready: READY.ready,
  rules: READY.rules,
  blockers: READY.blockers.length,
  waived: READY.waived.map((x) => ({ rule: x.rule, path: x.path, reason: x.waiver.reason, approvedBy: x.waiver.approvedBy, expires: x.waiver.expires })),
}, null, 2) + '\n');
console.log('');
