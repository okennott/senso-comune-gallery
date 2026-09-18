# Senso Comune Gallery

Priscilla's gallery site: unique original works, sold to both an international
and a Chinese domestic audience, run by Priscilla herself from mainland China.
Six are catalogued today; the site takes as many as `src/data/artworks.json`
lists, and nothing in the build caps that.

**Phase 1 (complete):** research and review — see the report.
**Phase 2 (in progress):** the site is built, passing its checks and published
as a preview. It cannot go live until every critical detail is supplied
(§2.8): photographs, titles, descriptions and contact details. The buy box and
the cart, search and account pages are still to be built (§2.7).

---

## The report

**[`docs/report/senso-comune-report.pdf`](docs/report/senso-comune-report.pdf)** —
the technical report. A4, typeset with Quarto and XeLaTeX:
table of contents, list of figures, list of tables, numbered parts and an
alphabetical index. This is the one to print, share, or hand to an accountant
or a lawyer.

```bash
npm run report:pdf
```

Figures regenerate from `src/styles/tokens.css` on every build, so the palette
in the document cannot drift from the palette in the site.

**[`docs/brief/`](docs/brief/)** — Priscilla's original nine-page draft,
retired. Nothing builds from it; it is kept because several measurements in the
codebase were taken from it. See [`docs/brief/README.md`](docs/brief/README.md)
for what was taken and what superseded it.

---

# Part 1 — Running the gallery

*This half is for Priscilla. It assumes no technical knowledge beyond editing a
text file, and says where to stop and hand over.*

## 1.1 Adding a painting

Three steps. Nothing else in the site needs touching.

**Step 1 — the photograph.** Put the full-resolution file in `masters/`, named
to match the work:

```
masters/harbour-light.jpg
```

That folder is never committed and never published. The build makes the web
copies from it and caps them at 2000px on the longest edge — enough to look
sharp on any screen, useless for printing a fake.

**Step 2 — the details.** Open `src/data/artworks.json` and copy an existing
block. Every field is used more than once, so nothing is typed twice: the
caption, the scale diagram, the structured data, the link preview and the image
sizes all read from here.

```json
{
  "slug": "harbour-light",
  "order": 1,
  "section": "originals",
  "genres": [],
  "title":   { "en": "Harbour Light", "zh": "港口的光" },
  "year": 2026,
  "medium":  { "en": "Oil on canvas", "zh": "布面油画" },
  "support": "canvas",
  "widthCm": 40,
  "heightCm": 50,
  "depthCm": 3.5,
  "framed": false,
  "unique": true,
  "priceUSD": 180,
  "sold": false,
  "checkoutUrl": "",
  "image": "harbour-light",
  "alt":         { "en": "…", "zh": "…" },
  "description": { "en": "…", "zh": "…" },
  "artistNote":  { "en": "", "zh": "" },
  "views": [
    { "kind": "detail", "alt": { "en": "…", "zh": "…" } },
    { "kind": "edge",   "alt": { "en": "…", "zh": "…" } },
    { "kind": "back",   "alt": { "en": "…", "zh": "…" } },
    { "kind": "video",  "alt": { "en": "…", "zh": "…" } }
  ]
}
```

| Field | What it means |
|:--|:--|
| `slug` | **Permanent.** It is the web address. Changing it breaks any link already shared. `series` and `sold` are reserved. |
| `order` | Tie-break within a year: works are listed newest first, then by this. |
| `section` | The series the work belongs to — an `id` from `site.json` → `series`. Exactly one. |
| `genres` | Subject genres, from `site.json` → `genres`. Any number, or none. |
| `widthCm` / `heightCm` | Measured to the canvas or sheet edge, not to a frame. Inches are calculated. |
| `sold` | See §1.5. Never delete a sold work. |
| `checkoutUrl` | A payment link, once there is one. Empty sends buyers to email instead. |
| `views` | The extra views on the work's page — see §1.2. |

**Step 3 — rebuild.**

```bash
npm run build
```

It prints every field still marked `NEEDS-INPUT`, so the site cannot quietly go
live with placeholders in it. On the pages themselves, every `NEEDS-INPUT` a
reader could see is flagged **in red on a pink ground**; fill in the field and
rebuild, and its flag is gone — nothing to switch off. Placeholders inside alt
text, page titles and link previews cannot be highlighted, and are covered by
the build's list. The new work appears on its series page, on
*Works*, and — if it is among the four newest — on the homepage.

### Adding a series

A series is a room of the catalogue: *Original Works* and *Tribute* today. To
add one, add an entry to `series.items` in `src/data/site.json` and set
`section` on its works. Its page at `/works/series/{id}/`, its tab on *Works* and
its card on the homepage are all generated; no template changes.

```json
{ "id": "landscapes",
  "title": { "en": "Landscapes", "zh": "风景" },
  "intro": { "en": "…", "zh": "…" } }
```

A series may also carry an `epigraph` and a `texture` (Tribute has both). Adding
Chinese text in a title means running `npm run fonts` so the display face covers it.

**A genre is not a series.** Landscape, portrait, still life cut across series: a
landscape made in tribute to van Gogh belongs to *Tribute* and is a landscape.
Declare genres in `site.json` → `genres` and list them on works. The build refuses
a work that names an undeclared series or genre.

### How the structure grows

Decided from six reference sites and published usability research (report,
"The site's structure"). The depth stays at *Works / series / work*; growth goes
across.

| When | Then |
|:--|:--|
| Two or more genres are in use | Add a horizontal genre filter row to *Works* |
| The Works tabs, or filter types, pass eight | Move the Works navigation to a left column on desktop. Until then there is no sidebar, and a check fails at nine tabs so it cannot happen unnoticed |
| More than six series | The homepage shows six series cards and a link to all |
| About gains pages (CV, exhibitions, press) | Give About a row of tabs, as Works has |
| The cart takes payments | Move *How to Buy* from the header to the footer |

## 1.2 Photographing the work

The images are the product. Two things matter more than camera quality.

**Shoot in RAW, and put a colour reference in one frame.** One frame per
lighting session with a grey card or a ColorChecker in shot, then correct every
other frame from that session against it. JPEG bakes the white balance in and
throws away the data needed to fix it — this is not a quality argument, it is
whether the correction is possible at all.

**Two diffused lights at 45°**, equal power, equal distance, about 1.5× the
work's diagonal away. Test on a white card first and look for hotspots. For
framed paper work, **take the glass out** — cross-polarising is a fallback for
glass that cannot be removed, and it shifts colour.

The phone-only version is legitimate: ProRAW or Expert RAW, a large
north-facing window with no direct sun, a white board on the shadow side, and a
$6 grey card. One caveat that matters — window light changes hour to hour, so
shoot all the works in one session or the set will not match.

**The other views.** Every work page shows five views: the front, then a
detail, the edge, the back and a short video. Until a photograph exists, each
extra view is a labelled placeholder at a sensible proportion. To replace one,
drop the file into `masters/` under the work's image name and rebuild — no
other change:

| View | File | How to shoot it |
|:--|:--|:--|
| Detail | `masters/harbour-light-detail.jpg` | Raking light, at a glancing angle, so impasto casts real micro-shadow. A flat-lit close-up conveys nothing a crop wouldn't |
| Edge | `masters/harbour-light-edge.jpg` | The side of the stretcher at about 45°, showing depth and how the canvas wraps. It is what a buyer of an unframed work needs to see |
| Back | `masters/harbour-light-back.jpg` | Square-on, even light: signature, inscription, date, hanging hardware |
| Video | `masters/harbour-light-video.mp4` | Ten to twenty seconds, phone upright, light moving slowly across the surface. Sound is removed |

Then write what each view shows in `views[].alt` for that work in
`src/data/artworks.json`, in both languages — the build lists every one still
owed. To drop a view for one work, delete its entry there.

A photograph keeps its own proportions: the pipeline records the true size of
every file in `public/img/views.json` and the page is built from that. **Video
needs ffmpeg** on the machine that builds (`brew install ffmpeg`, or your
package manager): it is converted to H.264 at up to 1080 px, with the sound
track removed and the first frame taken as the poster. Without ffmpeg the
placeholder stays, and the build says so.

## 1.3 Writing the description

Three layers per work, and they do different jobs.

**`alt` — about fifteen words.** A sentence fragment, no full stop. Medium, the
dominant visual event, the palette. This is what a blind buyer hears first.

> Oil on canvas: a vertical field of layered blue-grey bands broken by a pale
> horizontal seam

There is **no 125-character limit** — that is folklore. Fifteen words is the
museum convention and it is the number to aim at.

**`description` — 80 to 250 words.** Observation only. Composition read in one
consistent direction, left and right qualified from the viewer's position, the
palette in familiar colour names, and — the part most people skip — the
**surface and handling**: brushwork, thickness, edges, finish. Give scale by
something bodily: *"about the height of an interior door."*

**`artistNote` — optional, and always last.** This is the one place
interpretation belongs, and it is labelled so the reader knows the difference.
Priscilla is the only person who can state intent as fact rather than guess —
but intent is an *addition* to a description, never a substitute for one.

> **Artist's note:** the third in a series recording water levels on a wall of
> the estuary boathouse where I grew up.

**On using AI to draft these.** Fine as a first pass, never as the shipped text.
A model can report palette, format and apparent handling. It cannot know the
true medium, the real dimensions, the title or the intent. A wrong description
is worse than none, because it burns trust in the channel.

## 1.4 Handling an enquiry

Enquiries arrive by email, Instagram, WeChat or Xiaohongshu. Email is the one
that is legally required to exist and the one that works everywhere — Instagram
is blocked inside mainland China and WeChat is awkward outside it.

A reply usually needs three things:

1. **More pictures.** The most common request before buying art online is more
   images — hanging on a wall, detail shots, the edges, the back. Keep a folder
   of extras per work so this is a two-minute reply.
2. **The size, made real.** Every work page already carries a scale diagram
   against a 244 cm wall and a 213 cm sofa. Point at it.
3. **What they will pay at the border.** See §1.7. Say it before they commit,
   not after.

If someone says any part of the site stopped them buying, that is the sentence
in *How to Buy* doing its job: take the order by email, describe the work, and
arrange payment and shipping personally.

## 1.5 Taking an order

On the current setup — launching as an individual — there is no automatic
checkout. Payment is arranged directly: PayPal for international buyers, Alipay
or WeChat Pay domestically.

The sequence that keeps the records straight:

1. **Confirm the work is still available** before quoting.
2. **Collect the shipping address in writing** with the order, not afterwards.
3. **Send the payment link or QR.**
4. **Mark it sold the moment the payment clears** — see below.
5. **Send the confirmation:** what was bought, the price paid, the address it is
   going to, and when it will ship.

**Marking a work sold.** One field:

```json
"sold": true
```

Then `npm run build`. The page stays live, the price stays visible, and the buy
control becomes *"Sold — tell me when new work is listed"*. **Never delete a
sold work.** Its address is what someone shared, the price is quiet proof the
work sold at that number, and the archive grows more convincing over time.

**If two people buy the same piece at once** — unlikely, but not impossible on
a day something gets attention — the published policy settles it: the first
completed payment stands, the second is refunded in full within 24 hours.
Refunding is cheaper than engineering around it.

## 1.6 Packing and shipping

**Works on paper ship flat. Never rolled.** Rolling cracks the sizing and can
crease or smear the media. Acid-free board, glassine over the image, second
board, poly bag, rigid flat mailer. Tubes are for very large *unstretched*
canvas only.

**Stretched canvas ships upright. Never flat.** Glassine against the paint,
foam corners, rigid board on both faces, and the bubble wrap **outside** the
boards so nothing touches the surface. Two inches of clearance in the box.

Cold is a real hazard: linseed oil stiffens and can crack below freezing. Worth
thinking about for winter shipping.

Budget **$25–50 in materials per shipment**, and buy two or three box sizes
matching the usual formats rather than sourcing per sale. Packing takes 15–20
minutes once the right box is to hand.

One reassurance: the much-discussed "$1,000 artwork cap" on carrier insurance
does not bind here. Every carrier's cap sits above this entire inventory.

**Include a certificate.** A signed one-page certificate with a photograph of
the work embedded in it is standard at this price and costs nothing to produce.
The embedded photograph is what stops a certificate being detached and reused.

## 1.7 What the buyer pays at the border

Shipments go **DAP** — Priscilla pays the freight, the buyer pays any import
duty and clearance on delivery. That is the right default, because it means
never having to calculate or remit foreign tax. But it has to be said *before*
checkout: surprise customs bills are a leading cause of cross-border art
complaints.

| Destination | What they pay |
|:--|:--|
| **United States** | **≈7.5% Section 301 duty** plus customs handling — roughly 8–12% above the price. Original paintings carry no *base* duty, but China-origin works are covered by Section 301 and the $800 de minimis exemption is suspended, so every painting needs a customs entry. **Do not say "duty-free."** |
| **United Kingdom** | No import duty, and the reduced VAT rate for original art. Verified, and origin-neutral. |
| **European Union** | Import VAT at the destination country's rate for works of art. The exact per-country rates are **not yet confirmed** — do not publish specific numbers. |

The wording for all three lives in `src/data/seller.json` under `shipping`.

## 1.8 Returns

**Every work can be returned within 14 days, anywhere in the world, for any
reason or none.** This is not a generosity — it is the law in both markets, and
a unique painting gets no exception under either. Uniqueness is not
personalisation; the test is whether the *buyer* specified it.

What can legitimately be required:

- The work comes back in the condition it went out — original packaging,
  certificate included, not re-framed, not re-varnished, no new hardware.
  Opening the packaging to look at it is expected and does not affect the right.
- Return postage is the buyer's, **provided the site says so in advance** —
  which it does.
- Refund within 7 days of the work arriving back.

**Commissions are the one genuine exception** under both regimes. If Priscilla
paints to a buyer's brief, say so clearly before they commit.

## 1.9 The quarterly donation

The pledge is **10% of profits, quarterly, to a named organisation** — framed as
a personal pledge rather than a charge added to each order, which is a
materially different representation and a much safer one.

What makes it credible is not the wording but the record. Each quarter:

1. Total the profit for the period.
2. Send the donation.
3. Add a row to the giving page: date, period covered, amount.

The running cumulative total is the part people actually trust.

## 1.10 Records to keep

Light, but not optional. Keep per sale:

- The order confirmation and the shipping address
- Proof of payment
- The shipping receipt and tracking number
- A copy of the certificate

That set is what a bank asks for on an inbound foreign payment, and what a tax
office would ask for later. Under the current setup there is no business
registration requirement, no foreign-exchange quota consumed and no VAT — but
the records are what demonstrate that, so keep them.

**Three things to avoid,** because they turn an ordinary sale into a problem:
routing proceeds as a gift or family remittance; splitting a payment to stay
under a threshold; and informal currency swaps. The last is the one that
carries a penalty onto a personal credit file.

---

# Part 2 — Running the code

*This half is for whoever maintains the site.*

## 2.1 Build

```bash
npm install
npm run build        # a PREVIEW: images, then every page → dist/ (noindex, ribbon)
npm run check        # contrast, structure, design review; all three block the build
npm run preview      # one built page as a single self-contained file
npm run fonts        # rebuild the webfonts, Latin and Chinese
npm run mark         # re-cut the interim construction's letters (report only)
npm run image        # vectorize / rasterize, with the fidelity stated
npm run icons        # rebuild the favicon, home-screen icon and manifest
npm run check:render # paintings keep their proportions in a real browser (needs Chrome)
npm run readiness    # what is still owed before the site may go live
npm run build:release # the only build that may go live; refuses while anything is owed
npm run report       # rebuild the technical report (PDF)
```

`build` and `check` are the two that matter. `check` is not advisory — all
three scripts exit non-zero and have each caught real regressions, listed in
§2.5.

## 2.2 Repository layout

Three kinds of thing live here: **data** that Priscilla edits, **code** that
turns it into a site, and **documents** about the project. Nothing is
duplicated between them — where a number appears twice, one of the two is
reading it from the other.

```
.
├── src/                          the site's inputs — edit these
│   ├── data/
│   │   ├── artworks.json           the works. Single source of truth: every
│   │   │                           number is used by the caption, the scale
│   │   │                           diagram, the JSON-LD offer, the Open Graph
│   │   │                           card and the image srcset. Not a fixed
│   │   │                           length — add an entry and rebuild.
│   │   ├── seller.json             identity, both entity profiles, returns,
│   │   │                           donation, shipping and import notes
│   │   └── site.json               navigation, page copy, UI strings, en + zh
│   ├── styles/
│   │   ├── tokens.css              palette, type scale, spacing, motion, all
│   │   │                           of it solved against contrast
│   │   ├── base.css                the cream sheet, sfumato bands, hatching
│   │   └── gallery.css             masthead, tombstone, scale diagram, lightbox
│   ├── scripts/
│   │   ├── availability.js         ~40 lines, client-side sold check; the only
│   │   │                           layer that survives a stale CDN page
│   │   └── gallery.js              work-page views: current marker, arrow keys,
│   │                               no history per view. The gallery works
│   │                               without it
│   └── templates.js                document shell, tombstone, scale diagram,
│                                   JSON-LD, locale-aware paths
│
├── build.js                      the whole generator. Every page, both
│                                 locales, from the three data files. Plain
│                                 Node, no framework; sharp is the one runtime
│                                 dependency. Reports NEEDS-INPUT on exit.
│
├── brand/                        the identity as supplied, unmodified
│   ├── mark-lockup.png             the preferred option — the monogram as
│   │                               drawn, with the wordmark beneath. The site
│   │                               and the report both derive from this file
│   │                               and nothing else, and it is pinned by hash
│   ├── brand-sheet.png             the full prototype sheet, reproduced in
│   │                               the report
│   └── README.md                   why these are originals, not derivatives
│
├── scripts/                      build and verification tools
│   ├── build-icons.py              the icon set and the masthead mark, cut
│   │                               from brand/mark-lockup.png by crop and
│   │                               resize alone. Nothing is redrawn
│   ├── image.py                    raster → vector and vector → raster, with
│   │                               the fidelity said out loud: pixel (exact
│   │                               geometry), embed (the bytes in a wrapper)
│   │                               or trace (an approximation). Writes
│   │                               .svg .svgz .pdf .ps .eps, and reads them
│   │                               back to .png .webp .jpg .tif. Its own
│   │                               selftest runs in npm run check
│   ├── mark.mjs                    the INTERIM construction — an SC built from
│   │                               Fraunces outlines, superseded by the
│   │                               artwork and kept only so the report can
│   │                               show what it settled
│   ├── build-mark-paths.py         cuts that construction's S and C out of
│   │                               Fraunces. Output is committed
│   │                               (mark-paths.js), so a build needs only Node
│   ├── mark-paths.js               GENERATED. Re-run with npm run mark
│   ├── build-images.mjs            sRGB-tagged AVIF 4:4:4 + WebP, five widths,
│   │                               capped at 2000px
│   ├── build-fonts.sh              Latin subsets — 79.8 KB for both families
│   ├── build-fonts-cjk.py          Chinese display face, subset to the ~100
│   │                               glyphs that appear, 34 KB from 24 MB
│   ├── build-icons.sh              one line of shell around build-icons.py
│   ├── check-contrast.mjs          every token against its worst-case ground,
│   │                               including the dark bar, read from the CSS
│   ├── check-links.mjs             dead links, missing alt, missing width or
│   │                               height, heading order, landmarks, hreflang,
│   │                               CJK subset coverage
│   ├── check-review.mjs            70 assertions over 46 findings: the design
│   │                               review, the mark, softness, the shop bar,
│   │                               the structure, the flags and the gate,
│   │                               against built pages
│   ├── check-render.mjs            lays pages out in headless Chrome; fails if
│   │                               a painting is distorted, rounded or
│   │                               transformed. Needs Chrome, so CI runs it
│   └── preview.mjs                 one page as a single self-contained file
│
├── public/                       copied to the site as-is
│   ├── fonts/                      the subset woff2 files, their @font-face
│   │                               CSS, and both OFL licences
│   ├── placeholders/
│   │   └── work-video.mp4          4.8 KB, shared by every work until its own
│   │                               video exists; committed, so CI needs no ffmpeg
│   └── icon-32.png                 built by build-icons.sh, alongside
│                                   favicon.ico, apple-touch-icon.png,
│                                   logo-mark.png and
│                                   site.webmanifest
│
├── docs/                         one folder per document, each with its
│   │                             own build
│   ├── brief/                      Priscilla's original nine-page draft —
│   │                               retired. Nothing builds from it; kept
│   │                               because measurements were taken from it.
│   │                               Its README says which, and what replaced it.
│   └── report/                     the printable technical report
│       ├── senso-comune-report.pdf   built: A4, indexed
│       ├── senso-comune-report.qmd   the source
│       ├── preamble.tex              typesetting: fonts, heads, callouts, and
│       │                             the mark, included as the vector
│       │                             scripts/mark.mjs produces
│       ├── figures.py                vector figures, read from tokens.css
│       ├── fonts.py                  static cuts of Fraunces and Inter, plus
│       │                             the Chinese subset — derived from the
│       │                             .qmd, so the prose cannot outgrow it
│       ├── shots.sh                  the page screenshots, taken from dist/
│       ├── soft_shots.mjs            the softness plate: forced hover and glass
│       │                             states, on a synthetic stand-in canvas
│       │                             (cjk-chars.txt is an intermediate and is
│       │                              not in the repo; the staleness test is
│       │                              the committed font's own coverage, so a
│       │                              fresh clone builds offline)
│       ├── fig/                      the figures and page screenshots
│       ├── fonts/                    committed, so it builds offline
│       └── build.sh                  fonts → mark → shots → figures → quarto
│                                     → tectonic ×2 → makeindex → tectonic
│
├── .github/workflows/pages.yml   preview deploy, for layout review only, at
│                                 okennott.github.io/senso-comune-gallery/.
│                                 Built as a preview, so every page is
│                                 noindex; checked under the same variables.
│                                 Production is Cloudflare Pages: GitHub's
│                                 terms exclude commercial sites, and
│                                 github.io is not somewhere to point a
│                                 Chinese buyer.
├── README.md                     this file
├── package.json                  scripts and the one dependency
├── package-lock.json             committed, so a rebuild resolves the same
│                                 sharp and the same platform binaries
├── .gitignore                    dist, image derivatives and masters
└── Priscilla.code-workspace      editor workspace
```

Three directories are not in the repository:

| Directory | What it is | Why it is not here |
|:--|:--|:--|
| `dist/` | the built site | regenerated by `npm run build` from scratch |
| `public/img/` | every image width, format and placeholder, and `views.json` | regenerated from `masters/` |
| `public/video/` | the web versions of work videos | regenerated from `masters/`, with ffmpeg |
| `masters/` | the full-resolution photographs | see below |

**`masters/` never goes in the repository.** It is gitignored by name, along
with every raw and layered format — `.dng`, `.CR2`, `.NEF`, `.ARW`, `.psd`,
`.tif`. The 2000px cap in `build-images.mjs` is the only image protection that
actually works; committing the originals would hand them over and defeat it.
Back that folder up somewhere that is not this repository, because nothing here
can reconstruct it.

## 2.3 The entity switch

`src/data/seller.json` holds both commercial routes. Changing one string —

```json
"activeEntity": "individual"   →   "hk-sole-prop"
```

— switches the published legal disclosure, the invoicing language, the checkout
provider and the returns basis together. No template knows which entity is
active.

A Hong Kong sole proprietorship needs only a Business Registration certificate,
and unlocks Airwallex card acquiring *plus* Alipay and WeChat Pay from one
checkout. ⚠️ Airwallex approves its Payments product separately from account
opening, and reviews the live site as part of that. Ask before incorporating.

## 2.4 Fonts

**Latin** — Fraunces and Inter, self-hosted. `fonts.googleapis.com` is not
blocked in mainland China, but it measures ~50% *disrupted* over plaintext and
resolves to different IPs on different ISPs. For a render-blocking resource
that is worse than a clean block, because it fails intermittently and cannot be
debugged from outside the country.

| Build | Bytes |
|:--|--:|
| Fraunces, `opsz` 14–40, `wght` 400–700, `SOFT=0 WONK=1` | 51,868 |
| Inter, `opsz` 18, `wght` 400–600 | 29,856 |
| **Total, both families, latin subset** | **81,724** |

Two axis choices to preserve: the draft uses **six optical sizes** (16.0 →
38.4), so Fraunces' `opsz` must stay live — pinning it saves 19 KB and flattens
the optical sizing. And `WONK` **defaults to 1, not 0**; pinning it to 0 changes
the letterforms to save 140 bytes.

**Chinese** — the display face only, subset to the ~100 characters that appear
in headings, work titles and UI labels: **34 KB from a 24 MB face**.
`unicode-range` gates the fetch, so an English page never downloads it. A
character added before the next build falls through to the system face rather
than rendering as tofu. Chinese body prose is deliberately *not* webfont-served:
the system face is native, already on the device, and free across a border.

Do not use the Chinese Google Fonts mirrors: `fonts.geekzu.org` now
302-redirects back to Google, `useso.com` is dead, `fonts.font.im` serves TTF at
roughly double the bytes, and `fonts.loli.net` is a Cloudflare-fronted proxy
that adds an unaudited third party able to inject arbitrary CSS.

## 2.5 Checks

Five, and every one blocks. `npm run check` runs the first four anywhere;
`npm run check:render` needs Chrome, and GitHub runs it on every preview. A
release runs all five (§2.8).

`check-contrast.mjs` recomputes every colour token against **the darkest ground
it is ever painted on**. Checking against white instead is the trap that caught
this project three times, twice in tokens written specifically to avoid it.

It reads the pairs the stylesheet actually paints rather than a hand-kept list,
and takes the **last** colour declaration in each rule, because that is what
the cascade uses. A rule that set a good colour and then overrode it with a bad
one is exactly how the footer shipped at 2.34:1.

`check-links.mjs` verifies dead links, missing `alt`, missing `width` or
`height`, heading order, landmark counts, hreflang reciprocity, and that the
CJK subset still covers every character set in the display face — a new Chinese
work title otherwise renders one glyph in the system font, mid-heading, with
nothing reporting it.

`check-render.mjs` is the only check that needs a browser. The softness pass put
every painting in a mat — padding, a shadow and `border-box` inside layouts that
already cap heights — and that is exactly where an image box can quietly stop
matching the painting's proportions. It lays the built pages out in Chrome at
1440, 900, 390, 360 and 320 px and fails if any painting's box drifts more than 1%
from its own ratio, or carries a radius or a transform. It also fails if the
masthead overflows, takes more than two rows or has a control under 44 px, and if
either half of van Gogh's line — the Dutch original or the translation under it
— is re-wrapped, the attribution leaves the quote's right edge, or the featured
work comes before the quote.

Headless Chrome never lays a window out narrower than 500px — ask for 390 and
you get a 500px layout cropped to 390. Phone widths are therefore laid out in
an iframe of exactly that width, with scrollbars hidden as a phone's are, and
the check asserts the content width it actually received. `docs/report/shots.sh`
takes the phone screenshot the same way.

`check-review.mjs` holds 74 assertions over 48 findings — the September 2026
design review, the mark, softness, the shop bar and views, the structure, the
red flags and the readiness gate — written against the built site, so a fix that stops being
applied fails here rather than being noticed in a screenshot months later. It
also asserts that every `var(--token)` in the stylesheet resolves: a fix that
referenced a token which did not exist fell back to inherited size, and a test
that only matched the CSS text called it green.

`test-readiness.mjs` proves the readiness gate with 44 tests: it opens on data
with every critical detail supplied, and closes on the named rule when any one
of them is broken (§2.8).

They are a floor, not a pass. Automated testing decides roughly 13–30% of
accessibility criteria and catches almost none of the focus-order failures that
block people outright.

## 2.6 Decisions already made

- **Works is the catalogue; series are rooms; there is no sidebar.** The header
  goes to four real pages — Works, About, How to Buy, Contact — and never jumps down
  the homepage. Every available work is on `/works/`, each series has a page, and
  sold works are at `/works/sold/` (the old `/archive/` redirects). The homepage
  shows four latest works and a card per series, not the whole catalogue. Six
  reference sites agree on all of this except *How to Buy* in the header, which
  stays until the cart works.
- **The logo is Priscilla's own SC monogram, used as drawn.** The wordmark
  still translates — *Senso Comune Gallery* and 常识画廊 — and a favicon is
  chosen by origin, not by page, so the mark cannot say a different name per
  locale. It does not: a monogram is a device that stands beside a name, not a
  translation of one, which is what finding C-04's closure settled. The
  artwork is `brand/mark-lockup.png`, kept unmodified and pinned by hash;
  `npm run icons` cuts the icon set and the masthead mark out of it by crop
  and resize alone. Three costs come with a drawn mark and are set out in the
  report rather than worked around: there is no vector and the raster is
  1536 × 1024; it does not survive 16 px; and it cannot take `currentColor`.
  The Fraunces construction that stood in before it arrived is kept in
  `scripts/mark.mjs` for the report's figure only.
- **One canvas, on the surfaces that frame.** The ground of the artwork was
  measured — a cold-press cotton-rag sheet, 1/f spectrum, luminance σ 4.87 of
  255 — and reproduced as a single tile in `tokens.css` (`--canvas-grain`).
  It is neutral grey with a mean of exactly 0.5 and is composited with
  `background-blend-mode: soft-light`, whose identity at 0.5 is what makes it
  incapable of changing a colour: the largest mean drift measured on any
  ground is 0.9 of 255. It goes on the field and the mats, and on nothing that
  is read — `--muted-ui` on `--wash-blue` is exactly 3.00:1 against a 3.0
  floor, so the reading grounds have no room to be modulated at all. The bands
  take the same tile at 30 %, as a dither rather than a texture: a nine-rem
  fade in eight bits steps without one. `check-contrast` prints that allowance
  every build and fails if a reading ground is ever textured.
- **Softness without new colour.** Mats, radii, shadows, glass and section
  boundaries are all expressed through existing tokens; shadows are `--bar` at
  a few percent. The masthead's glass stops at 88% because the navigation must
  hold 7:1 over a white passage of a painting (the usual 60–70% fails WCAG
  outright), and it only turns to glass once content scrolls beneath it. The
  footer runs the same glass over the sage field, where the worst case is one
  computable colour — `--glass-footer`, recomputed by the contrast check on
  every run — and the contact panel is a frosted plate, which is safe because
  cream over cream is always lighter than the wash beneath it.
  Paintings are never rounded, zoomed or stretched. The report's Softness
  section lists every option considered, adopted and optional.
- **The work page and the shop bar.** Decisions D1–D5 (report, Part 6): search,
  account and cart in the header, as placeholders until built; detail, edge,
  back and video views on every work; any number of works in one order, within
  availability and the payment route's limit; no search threshold; video on work
  pages only. The views and the shop bar are built; the buy box and the pages
  behind the shop bar are not (§2.7).
- **Cloudflare Pages.** The only host with no bill, no pause and no terms
  problem. `vercel.app` and `workers.dev` measure 100% blocked from mainland
  China; `pages.dev` measures 0%.
- **No ICP filing**, because nothing is hosted inside mainland China. Individual
  备案 forbids profit-generating sites and the commercial licence cannot be held
  by an individual at all — hosting overseas is what keeps the door open.
- **A page for everything that is shared,** in both languages.
  `@view-transition` keeps the calm of a single page in two lines of CSS.
- **`.com`, not `.cn`.** A `.cn` adds a real-name verification obligation that
  can silently `serverHold` the domain, for benefits unusable without mainland
  hosting.
- **No AR, no deep zoom, no image CDN, no donation SaaS, no watermarks, no
  right-click blocking, no accessibility overlay.** Reasoning in the report.
- **Design direction:** a debt to Leonardo and van Gogh carried in colour,
  ground and motion, never announced. Leonardo's instruction to paint "without
  strokes or lines, in the manner of smoke" and the Chinese 没骨 ("boneless")
  tradition of painting without contour are the same idea reached
  independently — which, for a Chinese painter addressing both audiences, is a
  structural principle rather than a motif. It resolves to one decision: **a
  site with no hard edges.**

  Three things worth knowing before anyone edits the palette:

  - Priscilla's oxblood `#8B4A3C` (6.68:1) is, within measurement error,
    **sanguine — the red chalk Leonardo drew in** (6.33:1). The homage was
    already there, arrived at by eye. Don't change it.
  - **Do not sample colours off the paintings.** The *Bedroom* wall as it
    survives today is 2.78:1 and the *Sunflowers* chrome yellow 2.70:1 — both
    within a hair of the `#A19E97` failure the whole review opens with.
  - **Leonardo never wrote the word *sfumato***, and did not invent the idea.
    His one documented proportional system, on the *Vitruvian Man* sheet, is
    whole-number fractions (1/10, 1/8, 1/6, 1/4, 1/7), not φ.

---

## 2.7 Scripting still needed

Decisions of 17 September 2026 (report, Part 6). The masthead shows **search,
account and cart** on every page, and every work page shows **detail, edge,
back and video** views. The views are complete and only wait for files (§1.2).
The three shop controls are real links with real names whose **destinations do
not exist yet**: each is marked `data-placeholder`, declared in
`src/data/site.json` → `placeholders.routes`, and lands on the bilingual 404
page. `check-links` fails the build if a marked link starts resolving, so
building one of these pages always means removing its placeholder entry in the
same change.

What each one still needs, in the order it should be built:

### Cart — `/cart/`

**Decision:** a customer may buy as many works as they want in one order,
limited only by availability and by the largest single transaction the payment
route accepts.

- **State.** An array of work slugs in `localStorage` under `sc.cart`. No
  quantities: every work is unique. Every read and write wrapped in try/catch —
  storage can be blocked, and the cart must degrade to "enquire" rather than
  break.
- **Badge.** The masthead already carries `<span data-cart-count hidden>`. A
  script sets its text to the number of works and removes `hidden` when it is
  above zero, and updates the cart link's accessible name to match
  ("Cart, 2 works" / "购物车，2 件").
- **Add to cart.** A secondary control on each work page beneath the primary
  action, absent when the work is sold. The price must stay the boldest element
  (finding N-03).
- **Availability.** On opening the cart and again before paying, fetch
  `availability.json`; a work sold since it was added is shown as sold and
  excluded from the total, never silently dropped. Adding a work does not
  reserve it, and the page says so.
- **Transaction ceiling.** Each entity declares `checkout.maxTransactionUSD` in
  `src/data/seller.json`, currently `NEEDS-INPUT` — the figure must come from
  the provider for the payment method in use. A cart whose total exceeds it must
  not submit one payment above it: it either splits into payments that each fit,
  or explains the ceiling and asks the buyer to divide the order.
- **Paying.** On the `individual` route each work has its own payment link, so a
  cart of several works is paid work by work, or by one invoiced enquiry. One
  payment for several works needs a hosted checkout that takes several line
  items; whether the `hk-sole-prop` provider offers that is not established
  (report, open item 6).
- **Overselling.** Every layer in report §5.3 has to treat a cart as a
  possible second buyer. The published rule stands: the first completed payment
  wins, and the second is refunded within 24 hours.
- **Legal.** Order confirmation with every work, the total, the 14-day return
  and the seller's identity (report §4.1–4.2).

### Search — `/search/`

**Decision:** no catalogue threshold — search is present from the first work —
provided the query and the searchable text are correctly scoped.

- **What is searchable.** For each work, in the page's language: title, medium,
  support, year, section name and description. Not the artist's note, the legal
  pages, the seller data or anything in the footer. A field that is still
  `NEEDS-INPUT` is left out of the index, never indexed as text. Sold works are
  included and shown as sold.
- **The index.** Written by the build as `search-index.en.json` and
  `search-index.zh.json`, one small object per work. No third-party service:
  nothing leaves the browser, and nothing needs to cross the border.
- **The query.** Unicode NFKC first (full-width digits and Latin become
  ordinary ones), then trimmed, whitespace collapsed, case-folded, and Latin
  accents stripped on both sides so *etude* finds *Étude*. Chinese is matched as
  a substring, which needs no word segmentation. At least one Chinese character
  or two Latin ones; at most 100 characters. The query is text, never a pattern:
  no regular expressions built from input, and escaped wherever it is shown back.
- **The page.** A `GET` form (`?q=`) so a search can be linked and the back
  button works. Without scripts, the page lists every work; with them, it
  filters. Results show thumbnail, title, medium, year and price or sold. An
  empty result says what was searched for and links to all works.
- **The control.** The masthead link becomes the way in; the page takes focus
  in its field on arrival.

### Account — `/account/`

No decision beyond showing the control. Nothing in buying a work requires an
account — the payment provider keeps the buyer's record — so this is the last
of the three, and it needs more than a script:

- **A back end.** Sign-in, sessions and password or link recovery cannot be
  done on a static site. This is the first part of the site that would need a
  server or a hosted identity service.
- **Personal data.** An account makes Priscilla a data controller under PIPL
  and GDPR for what it stores (report §4.3): a privacy notice update, a lawful
  basis, deletion on request, and the cross-border transfer rules for data held
  outside mainland China.
- **What it would hold.** Orders, saved works and delivery addresses. Saved
  works do not need an account and can ship first, in `localStorage`, beside
  the cart.
- **Sign-in options.** Email link is the simplest to operate. WeChat sign-in
  requires registering an application with WeChat Open Platform, which has its
  own verification requirements.

## 2.8 Going live: the readiness gate

The site can only go live once every critical detail is supplied. That is
enforced, not remembered.

**Two kinds of build.**

| | Preview — `npm run build` | Release — `npm run build:release` |
|:--|:--|:--|
| When | Any time, including now | Only when the gate is open |
| Indexed by search engines | No — noindex on every page | Yes |
| Marked on every page | A ribbon: *Preview — not open for sales. N critical details are still owed* | Nothing |
| Buy and enquire buttons | Drawn, but unusable while anything is owed | Live |
| Views without a photograph | Shown as labelled placeholders | Left out |
| `NEEDS-INPUT` | Flagged in red | Cannot exist — the release checks fail on a single one |

A preview is the default; there is no way to forget to mark a build as not
ready. A release has to be asked for, and asks the gate twice: once before
building, and again inside the build itself, which refuses and leaves `dist/`
untouched. **See what is owed:**

```bash
npm run readiness
```

It lists every blocker by area — identity and contact, legal, the site, works
and prices, photography, payments — with the field, what is wrong, how to fix
it, and the rule or law it rests on.

**What it checks is the value, not just the word.** `NEEDS-INPUT` is only the
backstop. An empty email, an address on `example.com`, a phone number without
its country code, a price of 0, a returns window under 14 days, a Chinese
registration declaration someone edited, a painting still showing its
placeholder photograph, a payment link over `http` — each is its own rule.
Optional channels (Instagram, Facebook, X, Bluesky, 小红书) are either a handle
or `""`, which leaves the channel off the site; left as `NEEDS-INPUT` they are
*undecided*, and that blocks. Until a handle exists the channel's mark in the
footer links to a dead route from `placeholders.social` and lands on the 404
page, so nothing ever points at a profile that is not Priscilla's.

**Some rules only apply sometimes.** Hong Kong registration numbers only while
that entity is active; a transaction ceiling only once the cart takes payments;
a donation recipient only while the pledge is above 0%.

**Waivers.** A blocker that can wait may be waived in
`src/data/readiness-waivers.json` — with a reason, the name of whoever accepts
the risk, and an expiry date, after which the gate closes again. Every live
waiver is printed in every report and recorded in the release's
`readiness.json`. Legal identity and disclosure, returns, prices, dimensions,
photographs and payment links cannot be waived: a waiver naming one keeps the
gate shut.

**Today** the gate reports 57 blockers. The largest group is the works'
titles, descriptions and alt text; one that needs a decision rather than
typing is the search, account and cart placeholders (rule SH-01), which block a
release until those pages exist or a waiver is signed for them.

**Where it stands in front of the public.** The production host's build command
should be `node scripts/release.mjs`, output directory `dist` (Cloudflare Pages:
*Settings → Builds*). A failed build is not published there — the last release
stays live — but the host fails quietly, so the *Release check* workflow runs the
same command on GitHub, by hand or on a `v*` tag, and fails red with the report.
The preview workflow adds the report to every run's summary.

**Tested both ways.** `scripts/test-readiness.mjs` (in `npm run check`) builds a
copy of the data with everything supplied and proves the gate opens, then breaks
one thing at a time — 32 ways — and proves it closes on the right rule, and tests
the waivers. Review assertions K-01 to K-03 prove every preview page says so,
nothing can be bought while blocked, and a release attempt is refused without
touching the last built site.

## Still open

Six items, and every one needs a person outside this project.

1. **Cultural-relics export appraisal.** Confirm a living artist's new work is
   not 文物 before the first export. Chinese government sources were unreachable
   during research.
2. **EU reduced art VAT rates.** Directive (EU) 2022/542 changed art VAT from
   2025. Do not publish per-country rates until confirmed.
3. **Carrier costs and insurance from China.** No verified figures yet; needed
   before the shipping page is final.
4. **Export declaration for a ~$300 painting.** Also determines what document
   supports the bank's foreign-exchange check.
5. **Airwallex and a HK sole proprietorship.** The entity list verified covers
   account opening only. Ask before incorporating.
6. **Several works in one payment, and the largest single transaction.** Not
   established on either route. Ask the provider in writing before the cart is
   built; the figure becomes `maxTransactionUSD`.

**Content** is the other outstanding half: a photograph, title and description
for each catalogued work, and the contact details. The email and phone are not optional —
they are the consumer-law requirement. `npm run readiness` lists every field still owed.

---

## Notes

Contrast ratios were computed with the WCAG 2 relative-luminance formula against
the draft's **declared** fill values, extracted from the PDF content stream
rather than sampled from a render.

Nothing in the report is legal advice. The consumer-law, foreign-exchange, tax
and charitable-solicitation findings identify issues for a qualified
professional in the relevant jurisdiction.
