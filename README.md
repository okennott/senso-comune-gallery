# Senso Comune Gallery

Priscilla's gallery site: unique original works, sold to both an international
and a Chinese domestic audience, run by Priscilla herself from mainland China.
Six are catalogued today; the site takes as many as `src/data/artworks.json`
lists, and nothing in the build caps that.

**Phase 1 (complete):** research and review — see the reports.
**Phase 2 (in progress):** the site is built and passing its checks. What
remains is content, not code: photographs, titles, descriptions and contact
details.

---

## The reports

There are two, for two audiences.

**[`docs/report/senso-comune-report.pdf`](docs/report/senso-comune-report.pdf)** —
the printable technical report. 25 pages, A4, typeset with Quarto and XeLaTeX:
table of contents, list of figures, list of tables, numbered parts and an
alphabetical index. This is the one to print, share, or hand to an accountant
or a lawyer.

```bash
npm run report:pdf
```

Figures regenerate from `src/styles/tokens.css` on every build, so the palette
in the document cannot drift from the palette in the site.

**[`docs/build-report/index.html`](docs/build-report/index.html)** — the same
findings as a web page, for reading on screen. One self-contained file, no
external requests, so it opens offline and from behind the Great Firewall.

```bash
npm run report:html
```

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
  "details": []
}
```

| Field | What it means |
|:--|:--|
| `slug` | **Permanent.** It is the web address. Changing it breaks any link already shared. |
| `order` | Position on the page, 1 first. |
| `section` | `originals` or `tribute`. |
| `widthCm` / `heightCm` | Measured to the canvas or sheet edge, not to a frame. Inches are calculated. |
| `sold` | See §1.5. Never delete a sold work. |
| `checkoutUrl` | A payment link, once there is one. Empty sends buyers to email instead. |
| `details` | Optional close-up crops — see §1.2. |

**Step 3 — rebuild.**

```bash
npm run build
```

It prints every field still marked `NEEDS-INPUT`, so the site cannot quietly go
live with placeholders in it.

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

**Detail crops.** One raking-light close-up per work does more than any
paragraph: shoot the texture at a glancing angle so impasto casts real
micro-shadow. A flat-lit close-up conveys nothing a crop wouldn't. Add them as:

```json
"details": [
  { "image": "harbour-light-detail-1",
    "alt": { "en": "Raking light across the impasto, upper left", "zh": "…" } }
]
```

…and put `masters/harbour-light-detail-1.jpg` alongside the main file.

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
npm run build        # images, then every page → dist/
npm run check        # contrast, structure, design review; all three block the build
npm run preview      # one built page as a single self-contained file
npm run fonts        # rebuild the webfonts, Latin and Chinese
npm run icons        # rebuild the favicon, home-screen icon and manifest
npm run report       # rebuild both reports (report:pdf, report:html)
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
│   │   └── availability.js         ~40 lines, client-side sold check; the only
│   │                               layer that survives a stale CDN page
│   └── templates.js                document shell, tombstone, scale diagram,
│                                   JSON-LD, locale-aware paths
│
├── build.js                      the whole generator. Every page, both
│                                 locales, from the three data files. Plain
│                                 Node, no framework; sharp is the one runtime
│                                 dependency. Reports NEEDS-INPUT on exit.
│
├── scripts/                      build and verification tools
│   ├── build-images.mjs            sRGB-tagged AVIF 4:4:4 + WebP, five widths,
│   │                               capped at 2000px
│   ├── build-fonts.sh              Latin subsets — 79.8 KB for both families
│   ├── build-fonts-cjk.py          Chinese display face, subset to the ~100
│   │                               glyphs that appear, 34 KB from 24 MB
│   ├── build-icons.sh              favicon, home-screen icon and manifest —
│   │                               the mark is real Fraunces outlines, so it
│   │                               survives being rendered without webfonts
│   ├── check-contrast.mjs          every token against its worst-case ground,
│   │                               including the dark bar, read from the CSS
│   ├── check-links.mjs             dead links, missing alt, missing width or
│   │                               height, heading order, landmarks, hreflang,
│   │                               CJK subset coverage
│   ├── check-review.mjs            one assertion per design-review finding
│   └── preview.mjs                 one page as a single self-contained file
│
├── public/                       copied to the site as-is
│   ├── fonts/                      the subset woff2 files, their @font-face
│   │                               CSS, and both OFL licences
│   └── icon.svg                    built by build-icons.sh, alongside
│                                   favicon.ico, apple-touch-icon.png and
│                                   site.webmanifest
│
├── docs/                         one folder per document, each with its
│   │                             own build
│   ├── brief/                      Priscilla's original nine-page draft —
│   │                               retired. Nothing builds from it; kept
│   │                               because measurements were taken from it.
│   │                               Its README says which, and what replaced it.
│   ├── build-report/               the research findings as a web page
│   │   ├── index.html                built: one file, 0 external requests
│   │   ├── src.html                  the source
│   │   ├── fonts/                    inlined as base64 at build time
│   │   └── build.sh
│   └── report/                     the printable technical report
│       ├── senso-comune-report.pdf   built: A4, indexed, ~25 pages
│       ├── senso-comune-report.qmd   the source
│       ├── preamble.tex              typesetting: fonts, heads, callouts
│       ├── figures.py                vector figures, read from tokens.css
│       ├── fonts.py                  static cuts of Fraunces and Inter
│       ├── fig/                      the figures and page screenshots
│       ├── fonts/                    committed, so it builds offline
│       └── build.sh                  fonts → figures → quarto → tectonic ×2
│                                     → makeindex → tectonic
│
├── .github/workflows/pages.yml   preview deploy, for layout review only.
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
| `public/img/` | every image width, format and placeholder | regenerated from `masters/` |
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

All three block the build, and all three have earned it.

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

`check-review.mjs` holds one assertion per finding from the September 2026
design review, written against the built site, so a fix that stops being
applied fails here rather than being noticed in a screenshot months later. It
also asserts that every `var(--token)` in the stylesheet resolves: a fix that
referenced a token which did not exist fell back to inherited size, and a test
that only matched the CSS text called it green.

Between them they caught a muted grey that passed on white and failed on the
darkest wash, work pages shipping with no `<h1>` at all, a mobile override
that made the navigation invisible once the dark bar was adopted, and the
footer contrast failure above.

They are a floor, not a pass. Automated testing decides roughly 13–30% of
accessibility criteria and catches almost none of the focus-order failures that
block people outright.

## 2.6 Decisions already made

- **Cloudflare Pages.** The only host with no bill, no pause and no terms
  problem. `vercel.app` and `workers.dev` measure 100% blocked from mainland
  China; `pages.dev` measures 0%.
- **No ICP filing**, because nothing is hosted inside mainland China. Individual
  备案 forbids profit-generating sites and the commercial licence cannot be held
  by an individual at all — hosting overseas is what keeps the door open.
- **Seven documents per language, not one.** `@view-transition` restores the
  single-page feel in two lines of CSS.
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

## Still open

Five items, and every one needs a person outside this project.

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

**Content** is the other outstanding half: a photograph, title and description
for each catalogued work, and the contact details. The email and phone are not optional —
they are the consumer-law requirement. `npm run build` lists every field.

---

## Notes

Contrast ratios were computed with the WCAG 2 relative-luminance formula against
the draft's **declared** fill values, extracted from the PDF content stream
rather than sampled from a render.

Nothing in the reports is legal advice. The consumer-law, foreign-exchange, tax
and charitable-solicitation findings identify issues for a qualified
professional in the relevant jurisdiction.
