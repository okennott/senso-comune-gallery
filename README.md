# Senso Comune Gallery

A small gallery site for a solo painter: six unique original works, sold to both
an international and a Chinese domestic audience, run by a non-technical owner
based in mainland China.

**Phase 1 (complete):** research and review — see the report.
**Phase 2 (in progress):** the site is built and passing its checks. What
remains is content, not code: photographs, titles, descriptions and the
contact details.

---

## The reports

There are two, for two audiences.

**[`docs/report/senso-comune-report.pdf`](docs/report/senso-comune-report.pdf)** —
the printable technical report. 24 pages, A4, typeset with Quarto and XeLaTeX:
table of contents, list of figures, list of tables, numbered parts and an
alphabetical index. This is the one to print, share, or hand to an accountant
or a lawyer. Rebuild it with:

```bash
./docs/report/build.sh
```

It runs the passes explicitly — Quarto to TeX, a first LaTeX pass, `makeindex`,
then a second pass — because Quarto's direct PDF route pipes through stdin and
throws the index away. Figures regenerate from `src/styles/tokens.css` on every
build, so the palette in the document cannot drift from the palette in the site.

**[`docs/build-report.html`](docs/build-report.html)** — the same findings as a
web page, for reading on screen.

Twenty-nine findings against the original design draft, each scoped to a cost,
an effort and a specific change. It is a single self-contained file: fonts
embedded as base64, **zero external requests**, so it works offline and works
from mainland China. 279 KB.

Rebuild it after editing the source with:

```bash
./scripts/build-report.sh          # docs/source/build-report.src.html -> docs/build-report.html
```

### The seven that would sink it

| # | Finding |
|---|---|
| A-01 | Every call to action is `#A19E97` at **2.67:1** — fails WCAG AA *and* the 3:1 large-text floor. No font size rescues it. |
| N-01 | A one-page site cannot link to one painting. A `#work-3` fragment never reaches the server, so no per-work title, preview image or structured data can exist. |
| B-01 | **Stripe is unavailable to a mainland-China seller** — the whole account, not just PayPal. Airwallex excludes mainland entities from card acquiring and will not open accounts for individuals at all. |
| B-03 | `vercel.app` and `workers.dev` measure **100% blocked** from mainland China. `pages.dev` measures 0%. |
| B-05 | A unique pre-existing painting gets **no returns exception** under either Chinese or EU law. Uniqueness is not personalisation. |
| B-06 | Instagram is the draft's only contact channel, and it is blocked in mainland China — as well as being insufficient under EU consumer law. |
| B-08 | **China-origin paintings are not duty-free into the US.** Section 301 List 4A adds **+7.5%** on HTSUS 9701.91.00, and the $800 de minimis exemption is suspended, so every painting needs a customs entry. |

---

## Layout

```
docs/
  build-report.html          the deliverable — self-contained, open in a browser
  source/
    build-report.src.html    editable source (contains a /*@FONTS@*/ placeholder)
  fonts/                     subset woff2 used by the report
index.pdf                    the original nine-page design draft
scripts/
  build-fonts.sh             builds the gallery's self-hosted webfonts
  build-report.sh            inlines fonts into the report
public/
  fonts/                     the gallery's fonts — built, 79.8 KB for both families
src/                         (phase 2)
```

---

## Why the fonts are self-hosted

The draft uses **Fraunces** and **Inter** from Google Fonts. Measured from
mainland China, `fonts.googleapis.com` is **not blocked** — but it is ~50%
*disrupted* over plaintext and resolves to different IPs on different Chinese
ISPs. For a render-blocking resource that is worse than a clean block, because
it fails intermittently and cannot be debugged from outside the country.

Both faces are SIL OFL, so self-hosting is permitted. `scripts/build-fonts.sh`
reproduces the build:

| Build | Bytes |
|---|---|
| Fraunces, `opsz` 14–40, `wght` 400–700, `SOFT=0 WONK=1` | 51,868 |
| Inter, `opsz` 18, `wght` 400–600 | 29,856 |
| **Total, both families, latin subset** | **81,724** (79.8 KB) |

Two things the axis choices protect, both found by actually running the build:

- The draft sets Fraunces at **six optical sizes** — 16.0, 16.8, 21.6, 27.2,
  30.4, 38.4 — so `opsz` must stay live. Pinning it saves 19 KB and flattens the
  optical sizing the design depends on.
- Fraunces' `WONK` axis **defaults to 1, not 0**. Pinning it to 0 changes the
  letterforms to save 140 bytes.

Do not use the Chinese Google Fonts mirrors: `fonts.geekzu.org` now 302-redirects
back to Google, `useso.com` is dead, `fonts.font.im` serves TTF at roughly double
the bytes, and `fonts.loli.net` is itself a Cloudflare-fronted proxy that adds an
unaudited third party able to inject arbitrary CSS.

---

## Decisions already made

- **Host on Cloudflare Pages.** Only option with no bill, no pause and no terms
  problem. Hosting *on* Pages is also the compliant route under Cloudflare's CDN
  terms, which otherwise reserve the right to limit serving "a disproportionate
  percentage of pictures".
- **No ICP filing**, because nothing is hosted inside mainland China. This
  matters: individual 备案 forbids profit-generating sites, and the commercial
  ICP licence cannot be held by an individual at all.
- **Seven documents, not one** — `/` keeps the editorial scroll; `/works/{slug}`
  × 6 carry their own metadata. `@view-transition { navigation: auto }` restores
  the single-page feel in two lines.
- **`.com`, not `.cn`.** A `.cn` adds a real-name verification obligation that
  can silently `serverHold` the domain, in exchange for benefits unusable without
  mainland hosting.
- **No AR, no deep zoom, no image CDN, no donation SaaS, no watermarks, no
  right-click blocking, no accessibility overlay.** Reasoning in the report.
- **Design direction:** a debt to Leonardo and van Gogh carried in colour, ground
  and motion, never announced. The organising idea is that Leonardo's instruction
  to paint "without strokes or lines, in the manner of smoke" and the Chinese 没骨
  ("boneless") tradition of painting without contour are the same idea reached
  independently — which, for a Chinese painter addressing both audiences, is a
  structural principle rather than a motif. It resolves to one decision: **a site
  with no hard edges.**

  Three things fell out of the research that are worth knowing before anyone
  edits the palette:

  - The artist's existing oxblood `#8B4A3C` (6.68:1) is, within measurement
    error, **sanguine — the red chalk Leonardo drew in** (6.33:1). The homage was
    already there, arrived at by eye. Don't change it.
  - **Do not sample colours off the paintings.** The *Bedroom* wall as it
    survives today is 2.78:1 and the *Sunflowers* chrome yellow 2.70:1 — both
    within a hair of the `#A19E97` failure this whole report opens with.
  - **Leonardo never wrote the word *sfumato***, and did not invent the idea —
    Cennino Cennini described blending shadows "like smoke" a century earlier.
    The one proportional system in Leonardo's own hand, on the *Vitruvian Man*
    sheet, is whole-number fractions (1/10, 1/8, 1/6, 1/4, 1/7), not φ.

---

## The entity switch

**Decided: launch as an individual.** Under CNY 100,000/year turnover there is
no business-registration requirement (SAMR Order 37 Art. 8 ¶3), no foreign-
exchange quota consumed, no balance-of-payments filing, and no VAT.

The Hong Kong path is not blocked by that choice. `src/data/seller.json` holds
both entity profiles; changing one string —

```json
"activeEntity": "individual"   →   "activeEntity": "hk-sole-prop"
```

— switches the published legal disclosure, the invoicing language, the checkout
provider and the returns basis together. No template knows which entity is
active. A HK sole proprietorship needs only a Business Registration
certificate, and unlocks Airwallex card acquiring *plus* Alipay and WeChat Pay
from one checkout.

⚠️ Airwallex approves its Payments product separately from account opening, and
reviews the live site as part of that. Ask before incorporating.

## Still open

1. **Content.** Titles, descriptions, alt text, contact details, the donation
   recipient, and the six photographs. `npm run build` lists every one.
2. **CJK webfont strategy.** A full CJK face is 5–10 MB against 80 KB for the
   Latin pair. The build currently falls back to a system CJK stack
   (PingFang / Hiragino / Microsoft YaHei), which costs nothing and looks
   acceptable, but is not a decision so much as a deferral.
3. **Exporting the work from China.** Three linked questions are unresolved
   because the Chinese government sources were unreachable: whether a living
   artist's new work needs a cultural-relics export appraisal (文物出境审核),
   what carriers charge and insure from China, and what an individual actually
   files for a US$300 painting — which also determines what document supports
   the bank's foreign-exchange authenticity check.
4. **EU reduced art VAT rates.** France 5.5% / Germany 7% / Italy 5% could not be
   verified, and Council Directive (EU) 2022/542 changed art VAT from 2025. The
   **UK is verified** — 0% duty, ERGA OMNES, so origin-neutral, with the reduced
   VAT rate present.

---

## Notes

Contrast ratios throughout were computed with the WCAG 2 relative-luminance
formula against the draft's **declared** fill values, extracted from the PDF
content stream rather than sampled from a render.

Nothing in the report is legal advice. The consumer-law, foreign-exchange, tax
and charitable-solicitation findings identify issues for a qualified professional
in the relevant jurisdiction.
