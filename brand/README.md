# brand/

The identity as Priscilla supplied it, unmodified. These two files are the
source; everything the site and the report show is derived from them, so there
is one original and no second copy anyone can edit by accident.

| File | What it is |
|:--|:--|
| `brand-sheet.png` | The full prototype sheet: construction, hatching detail, the four variations, clear space and minimum size, the brand colours and the two lockups. Reproduced in the report, §"The mark". |
| `mark-lockup.png` | The preferred option — the monogram as drawn, with the wordmark beneath. This is the artwork the site uses. |

They arrived at `dist/archive/logo/`, which is build output and is gitignored,
so they were moved here to be kept.

Both are 1536 × 1024 px. That is the whole supply: there is no vector source
and no larger raster, which is the constraint behind most of what the report's
mark section has to say, and is open item 7 in it. Do not regenerate or "clean
up" these files — a derived copy replacing an original is how a brand loses its
own artwork. Both are **pinned by hash** in `scripts/check-review.mjs` (F-01),
so re-exporting either one fails `npm run check` and has to be a decision.

Everything downstream is a crop and a resize of these two, and nothing is
redrawn, traced or recoloured:

| Cut by | Into | What |
|:--|:--|:--|
| `scripts/build-icons.py` (`npm run icons`) | `public/` | `icon-32.png`, `favicon.ico`, `apple-touch-icon.png`, `logo-mark.png` for the masthead, and the manifest |
| `docs/report/figures.py` | `docs/report/fig/` | both plates as supplied, the variations panel, the monogram for the running footer, the horizontal lockup for the title page, and the size plate |
