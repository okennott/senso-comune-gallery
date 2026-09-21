# Design review — the site judged as an award entry

20 September 2026. An unguided review of the built site against one question:
would a design jury — Awwwards, FWA, CSS Design Awards, or the editor of a
gallery-sites roundup — stop on this page? Findings are numbered `AW-nn` so
they do not collide with the codes already in `scripts/check-review.mjs`.

## Status, 20 September 2026 — after the work

Ten of the eleven findings are closed. What the pages measure now, against
the numbers in this document:

| | before | after |
|:--|:--|:--|
| Featured painting, 1440 and 1920 | 375 × 460 | 446 × 558 |
| Price to its button | 742 px apart | 58 px, same column |
| Catalogue cell / image / caption, 1440 | 321 / 289 / 321, three left edges | 321 / 321 / 321, one |
| Latest works on a 390px phone | 208 px wide | 307 px |
| Motto, 390 → 1920 | 38.4 px throughout | 26.1 → 39.4 → 53.4 → 54 |
| Work page's own painting | 465 px | 562 px |
| Reading ground | the sage wall, black at 6.14:1 | --wash-pale, black at 16.5:1 |
| Masthead controls that lead nowhere | 3 | 0 |
| Readiness blockers | 57 | 54 |
| Share card | the painting, cropped to a 1.91:1 sliver | composed, 1200 × 630 |

Still open, and why:

- **AW-10** — the prose pages still carry no image. The mechanism is there
  (`masters/`, `npm run build:images`), but there is no photograph to put on
  How to Buy, and an empty mat on a page that does not need one yet is worse
  than white space. It waits on the shoot, with the work photographs.
- ~~**AW-11, the share card**~~ — **built, 21 September 2026.** One 1200 × 630
  card per work, drawn by `scripts/build-images.mjs` from the same master the
  pages use: the sage wall, the painting in its mat, the monogram beside it.
  Every page that carries a card now declares 1200 × 630 and points at it, and
  `check-review` C-03 asserts that on every one of them rather than on the work
  page alone.
- **AW-11, the SAMR line** — left as it is, on purpose. The Chinese sentence
  is the declaration; the English under it is a gloss. Authoritative text
  first is the right order even on an English page.

Every change is held by the project's own gates: `npm run check` (contrast,
links, 99 review assertions, 48 readiness tests) and `npm run check:render`
(275 painting boxes at five widths) pass. Where a finding reversed a recorded
decision — the plates, the band's ornament, the masthead's controls, one name
per work page — the assertion that held the old decision was rewritten to hold
the new one rather than deleted.

## Method

Everything from "The verdict" down describes the site AS REVIEWED, before any
of it was acted on; the status above says what has changed since, and the
numbers in the findings are left as they were measured so the two can be read
against each other.

Built at commit c95a085, served from `dist/`, and laid out in headless Chrome at
390, 1024, 1280, 1440 and 1920 px in both locales. Element boxes were read out
of the DOM rather than estimated from screenshots, so every number below is a
measurement, not an impression.

Six works, all still placeholder images, all still `NEEDS-INPUT` titles. That
limits what can be judged and is addressed at the end.

## The verdict

The craft is here. The composition is not.

Almost everything a jury checks *after* it decides to look — contrast
discipline, bilingual parity, view transitions, real mats, museum-grade
labelling, a scale drawing of the canvas against a wall — is already better
than the field. Almost nothing a jury checks *in order to* decide to look is
working: the first screen, the size of the work, the alignment of the grid.

One sentence: **the system was built to hold paintings, and then configured
never to show one at any size.** At 1920 × 1080 the opening screen offers a
painting whose image box measures 375 × 460 px — 12.5% of the viewport width —
six words of motto, and roughly 1,200 px of empty olive. At 1440 the numbers
are identical, because nothing in the hero scales.

Fix the size of the work and the ground it hangs on, and the rest of this site
is already close.

## What is already award-grade — do not lose any of it

1. **The passe-partout.** Every work arrives in a real mat with a real cast
   shadow, `object-fit:contain`, no border-radius, no transform, and a build
   check that fails if a painting is ever drawn at the wrong ratio. Almost no
   artist site defends the proportions of the object it is selling.
2. **The five views per work** — front, detail, edge, back, video. *The back of
   the canvas.* This is the single most distinctive idea on the site and it is
   currently a rail of 56 px thumbnails.
3. **The scale drawing.** A measured canvas against a 244 cm wall and a 213 cm
   sofa. Nobody else does this. It is 260 px tall, in the right-hand column,
   below the fold.
4. **The tombstone.** Medium, year, both unit systems, "Unique work · Frame not
   included". Museum labelling, applied consistently.
5. **Bilingual parity.** Two real URL trees, hreflang pairs, a subsetted CJK
   serif, and a locale-specific legal line — not a translation widget.
6. **Contrast held by a build check** that recomputes every pair and fails on a
   regression.
7. **View transitions keyed per work**, so a painting travels from the grid to
   its own page.

Items 2 and 3 are the award. They are the only things on the site a jury has
not seen before. They are also the two things currently rendered smallest.

## Findings

### AW-01 · The opening screen contains almost no art — critical

Measured at 1920 × 1080: ribbon and masthead 110 px, motto band 227 px, the
"Featured work" heading, then an image box of 375 × 460 px. The figure it sits
in is 1,060 px wide, so 685 px — 65% of the featured block — is empty. The same
375 × 460 at 1440. The cap is `--size-hero: 38.4px` for the motto (fixed px)
and `max-height: clamp(260px, 48vh, 460px)` for the painting.

The hero was already moved once to get a painting above the fold (finding
A-01). It got the painting above the fold at thumbnail size.

**Recommendation.** Let one painting own the first screen. A single work at
`min(78vh, 900px)` tall, centred or set against the sage with real margin, the
motto demoted to a line beneath or beside it, and the tombstone under the work
rather than stretched across the page. The motto is a good line; it is not the
thing being sold, and it currently gets the better half of the screen.

### AW-02 · No painting is ever allowed past 352 px — critical

Three fixed ceilings, all in rem or px:

| Rule | Ceiling |
|:--|:--|
| `.hero__work img` | `clamp(260px, 48vh, 460px)` |
| `.works--catalogue .work__img` | `max-height: 22rem` (352 px) |
| `.works--grid .work__img` | `height: 16rem` (256 px) |

Consequences, measured:

- On a 27-inch display a painting is exactly the size it is on a 13-inch
  laptop. The layout grows; the art does not.
- At 390 px the cap works *backwards*. A 40 × 30 cm portrait in a 307 px column
  wants to be 409 px tall, hits the 352 px ceiling, and shrinks to 264 px wide
  — so on the device with the least screen, the painting is given less of it
  than the column already offered.

**Recommendation.** Drive the image box from its column and the viewport, never
from a rem constant: an `aspect-ratio` box the width of the cell, capped with
`max-height: min(78vh, …)`. The comment on `.works--grid` is right that a fixed
height keeps a row's baselines aligned — but that is what `grid-template-rows`
and a shared `aspect-ratio` are for, and it should not cost the work its size.

### AW-03 · The works grid has no alignment line — high

Measured on `/works/` at 1440, four 321 px cells:

| Cell | x | Image x / width | Caption x |
|:--|--:|--:|--:|
| 1 | 183 | 199 / 289 | 183 |
| 2 | 552 | 576 / 273 | 552 |
| 3 | 921 | 951 / 262 | 921 |
| 4 | 183 | 202 / 282 | 183 |

Four different image widths, four different left offsets (16, 24, 30, 19 px),
and every caption beginning 16–30 px to the left of its own painting. The eye
reads down a column of four titles on a straight line and four paintings on no
line at all.

**Recommendation.** Pick one rule and hold it everywhere: either the painting's
left edge shares the caption's left edge, or both are centred in the cell. A
grid of unique objects with different proportions *needs* an alignment
convention; without one it reads as a contact sheet rather than a hang.

### AW-04 · The price and its call to action are 742 px apart — high

`.hero__work .tombstone__row { max-width: none }` stretches the row to the full
1,060 px column. Measured: price at x183 (67 px wide), "Enquire about this
piece" at x992. At 1920 the gap is the same. The two most important elements on
a commercial page are placed at opposite ends of an empty line, and read as
belonging to different things.

**Recommendation.** Cap the tombstone row at the width of the work above it, or
at `--measure-sm`. Price, then button, within a hand's width of each other and
of the painting they refer to.

### AW-05 · The ground system is switched off, and it is the root of much else — critical

`--plate-sheet`, `--plate-pale`, `--plate-mid` and `--plate-deep` are all
`transparent`, and `--edge-breath` is `0%`. So the nine-stop raised-cosine band
in `.edge` interpolates transparent to transparent; all that renders is a 2 px
engraved hairline. `--wash-pale`, `--wash-mid` and `--wash-deep` are computed,
documented, contrast-checked — and unused. `.sheet` is 1,240 px wide holding an
1,100 px `.wrap`, so a 70 px band of shadowed nothing runs down each side with
an edge that corresponds to no content on the page.

The cost is not only rhythm. Your own contrast report states it: on the sage
wall, **pure black reaches 6.14:1**. Everything on the site therefore lives in a
narrow band — running text at 9% headroom, captions at 3%, the accent at 7% and
large sizes only, light text impossible. A palette with no headroom cannot
build a hierarchy. It can only make everything the same weight, which is what
the pages look like.

**Recommendation.** Put the reading surfaces back. On `--wash-pale` the ink is
around 16:1, the terracotta becomes usable at caption size, and the sage
returns to the one job it is genuinely good at: being the wall the plates hang
on. "Quiet" is bought with size and whitespace — the governing rule in
`tokens.css` is correct — but quiet is not the same as flat, and a single
undifferentiated field is the flattest a page can be. If the all-sage decision
is to stand, then the `.edge`/plate machinery should be deleted rather than
left inert, and the `.sheet` box given an edge that means something.

### AW-06 · Type does not scale, and the display sizes are nearly identical — high

Scale: 38.4 / 33.6 / 28.8 / 22.4 / 16.8 / 12.6. The three display steps are
1.14 and 1.17 apart — indistinguishable at a glance — and then drop 1.71 to
body. So h1, h2 and h3 all read as "a heading", with no sense of level, and
nothing in between a heading and running text.

All of it is fixed px. The motto is 38.4 px on a 390 px phone and 38.4 px on a
1920 px display. There is exactly one fluid step in the whole system, at 519 px.

The spacing scale has the same problem: 9.6, 13.7, 16, 24, 48, 96, 144 — three
values crowded under 17 px, then a hole between 24 and 48 and another between
48 and 96. `.section` has 96 px padding and `.section__head` a 96 px bottom
margin, so a section's own heading is 96 px from its own content, on top of the
96 px that separates it from the section above. That is why the pages feel
either cramped or cavernous with nothing in between.

**Recommendation.** Fluid display sizes via `clamp()`, keyed to viewport;
widen the interval between display steps (1.25–1.33) and add one step between
h3 and body; add 32 and 64 to the spacing scale and use them for the inside of
a section, reserving 96 and 144 for the gaps between sections.

### AW-07 · Shop chrome the site does not have — medium

Search, account and cart sit in the masthead. All three carry
`data-placeholder`; none of `/search/`, `/account/` or `/cart/` is built. For a
catalogue of six unique objects sold by enquiry, three e-commerce icons in the
most valuable strip on the site say "store template" — which is precisely the
wrong first signal for a one-artist gallery, and the wrong one for a jury.

**Recommendation.** Remove them until they do something. The masthead then has
room for the wordmark and the language switch to breathe, and the language
switch — genuinely one of the two most important controls here — stops
competing with three dead icons.

### AW-08 · The four-colour rule under the motto — medium

Four decorative swatches, `aria-hidden`, carrying no meaning by design. On a
sage field they read as a progress bar, a palette chip, or a loading state; the
cream one in particular reads as a stray highlight. It is the only unexplained
ornament on a site whose entire argument is that nothing here is unexplained.

**Recommendation.** Cut it, or give it a job — for example, four rules whose
lengths encode the four series counts, which would be an ornament that means
something.

### AW-09 · The pages stop rather than end — medium

- **Work page.** The pager contains an empty `<span></span>` and a single
  right-aligned "Next work →". No previous, no route back to Works, no other
  works in the same series, no other works at the same price. The page ends on
  a rule and one link.
- **Tribute.** Two works in a three-column grid; the third column is empty, and
  then the page stops.
- **Home.** A 5,100 px scroll for six works, ending in "All works (5) →" set in
  caption-sized type.

**Recommendation.** Give every leaf page a closing move: three more works from
the same series or year, then the catalogue link. This is also the cheapest
available fix for time-on-site, which is the metric behind most "best of"
roundups.

### AW-10 · The prose pages have no image — medium

How to Buy is 2,400 px of single-column text with not one picture, and Returns,
Shipping and Privacy are the same. A page that explains a painting is packed
flat between acid-free boards is a page that wants the photograph of a painting
packed flat between acid-free boards — and you already photograph edges and
backs, so the vocabulary exists.

The "Reach me directly" frosted plate on that page is the one surface on the
site with a real ground, and it is visibly the best-looking block in the build.
That is the argument for AW-05 in miniature.

### AW-11 · Small and concrete — low

- **`og:image` dimensions are wrong on four page types.** `build.js:718`
  computes `ogImageHeight` for work pages; lines 527, 552, 584 and 617 (home,
  works, series, sold) omit it, so the template emits `1600 × 1600` for a file
  that is `1600 × 2000`. Separately, a 4:5 portrait under
  `twitter:card=summary_large_image` is cropped to a 1.91:1 sliver — the share
  card is a first impression and deserves a dedicated 1200 × 630 render.
- **The `sizes` attribute overstates the box by 50%.** The featured image
  declares `(min-width:900px) 40vw` — 576 px at 1440 — against a measured 375 px
  box, so the browser fetches a larger file than it can use.
- **"Enquire about this piece" wraps to two lines** in a 210–250 px card. Use
  "Enquire" inside grids and keep the long label for the work page.
- **The filter counts collide with their labels.** `ALL 5 ORIGINAL WORKS 3
  TRIBUTE 2` — same size, same weight, hard against the words. Set the counts
  in the caption size and the muted ink.
- **The Chinese SAMR declaration prints in the English footer** above its own
  English translation, on every English page.
- **`styles.css` is 116 KB unminified,** and a measurable share of it is the
  plate and edge system that currently renders nothing.

## What could not be judged

Every painting is a placeholder and every title is `NEEDS-INPUT`. This review
is of the system, not of the pictures. Two things will change the moment real
work lands, and both should be re-checked then:

1. **Colour.** A sage ground is a strong opinion about what it surrounds. It
   will flatter some palettes and fight others, and six real paintings is the
   only test of that. Keep the reversible switch.
2. **The flags.** `NEEDS-INPUT` is `#9B1C16` on `#F8D3CD` at 5.91:1 — higher
   contrast than any real content on the page, set in the display face at
   heading size. In a preview build it is correctly the loudest thing on every
   screen; it also means none of these screenshots shows the real visual
   balance of a page. Worth one look at a release build with the ribbon and
   flags off before any of these recommendations is judged.

## Sequence

Roughly in order of return per hour of work:

1. **AW-05** — turn the plates back on. It is a token change, it is already
   contrast-tested, and it unlocks the hierarchy the rest of the findings need.
2. **AW-02** and **AW-01** — let the work scale, and give the first screen to
   one painting. These two are the whole difference between "careful" and
   "stopped scrolling".
3. **AW-03** and **AW-04** — the alignment line, and the price beside its
   button. Small, mechanical, and they are what a jury means by "tight".
4. **AW-06** — fluid type and the missing spacing steps.
5. **AW-07**, **AW-08** — take out what is not doing a job.
6. **AW-09**, **AW-10** — endings and pictures on the prose pages.
7. **AW-11** — the list of small ones, including the share card.

Then the real move, once the paintings are real: **build the site around the
five views and the scale drawing.** Front, detail, edge, back, on a wall,
measured. It is the one thing here nobody else is doing, it is the honest
answer to "what am I actually buying", and at present it is a 56 px thumbnail
rail next to a 375 px painting.
