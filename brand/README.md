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
mark section has to say. Do not regenerate or "clean up" these files — a
derived copy replacing an original is how a brand loses its own artwork.

Derivatives are cut by `scripts/build-icons.sh` (`npm run icons`) into
`public/`, and by `docs/report/figures.py` into `docs/report/fig/`.
