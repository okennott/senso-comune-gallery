# Senso Comune Gallery

A small gallery site for a solo painter: six unique original works, sold to both
an international and a Chinese domestic audience, run by a non-technical owner
based in mainland China.

**Phase 1 (complete): research and review.**
**Phase 2 (next): design, build and test.**

---

## The report

**[`docs/build-report.html`](docs/build-report.html)** — open it in a browser.

Thirty-eight findings against the original design draft, each scoped to a cost,
an effort and a specific change. It is a single self-contained file: fonts
embedded as base64, **zero external requests**, so it works offline and works
from mainland China. 265 KB.

Rebuild it after editing the source with:

```bash
./scripts/build-report.sh          # docs/source/build-report.src.html -> docs/build-report.html
```

### The six blocking findings

| # | Finding |
|---|---|
| A-01 | Every call to action is `#A19E97` at **2.67:1** — fails WCAG AA *and* the 3:1 large-text floor. No font size rescues it. |
| N-01 | A one-page site cannot link to one painting. A `#work-3` fragment never reaches the server, so no per-work title, preview image or structured data can exist. |
| B-01 | **Stripe is unavailable to a mainland-China seller** — the whole account, not just PayPal. Airwallex excludes mainland entities from card acquiring and will not open accounts for individuals at all. |
| B-03 | `vercel.app` and `workers.dev` measure **100% blocked** from mainland China. `pages.dev` measures 0%. |
| B-05 | A unique pre-existing painting gets **no returns exception** under either Chinese or EU law. Uniqueness is not personalisation. |
| B-06 | Instagram is the draft's only contact channel, and it is blocked in mainland China — as well as being insufficient under EU consumer law. |

---

## Layout

```
docs/
  build-report.html          the deliverable — self-contained, open in a browser
  source/
    build-report.src.html    editable source (contains a /*@FONTS@*/ placeholder)
    index.pdf                the original nine-page design draft
  fonts/                     subset woff2 used by the report
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
  and motion, never announced. The organising idea is that Leonardo's *sfumato*
  — "without lines or borders, in the manner of smoke" — and the Chinese 没骨
  ("boneless") tradition of painting without contour are the same idea reached
  independently, which for a Chinese painter addressing both audiences is a
  structural principle rather than a motif.

---

## Open before Phase 2 starts

1. **Does the site take payment online, and under what entity?** Launching as an
   individual is viable — under CNY 100,000/year turnover there is no
   registration requirement, no FX quota consumed and no VAT. A Hong Kong sole
   proprietorship unlocks Airwallex card acquiring *plus* Alipay and WeChat Pay
   from one checkout. This decision gates all checkout work.
2. **CJK webfont strategy.** A full CJK face is 5–10 MB against 80 KB for the
   Latin pair. Unresolved.
3. **US import treatment of China-origin art in 2026.** HS 9701 is normally
   duty-free; whether current tariff action reaches it determines what the site
   can tell US buyers.

---

## Notes

Contrast ratios throughout were computed with the WCAG 2 relative-luminance
formula against the draft's **declared** fill values, extracted from the PDF
content stream rather than sampled from a render.

Nothing in the report is legal advice. The consumer-law, foreign-exchange, tax
and charitable-solicitation findings identify issues for a qualified professional
in the relevant jurisdiction.
