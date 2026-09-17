# The original draft

`senso-comune-draft.pdf` — nine pages, from Priscilla. It was the whole brief
for this project and it was the file called `index.pdf` in the repository root
until the site was built. It is retired: nothing reads it, nothing builds from
it, and it is not the current design. It is kept because several decisions in
the codebase are measurements taken from it, and a measurement without its
source is just a number somebody typed.

## What was taken from it

| Taken | Where it lives now |
|:--|:--|
| Six Fraunces optical sizes — 16.0, 16.8, 21.6, 27.2, 30.4, 38.4 px | `public/fonts/fonts.css`, `scripts/build-fonts.sh` |
| The type scale those sizes imply | `src/styles/tokens.css` |
| Column geometry — 444 pt, 72.5% of page width | `src/styles/gallery.css` |
| 0.8 pt rules | `src/styles/tokens.css` |
| Fraunces + Inter as the two families | `public/fonts/` |
| The failing palette, including `#A19E97` at 2.67:1 | recorded in the report, not in the site |

## What superseded it

- **The palette.** Priscilla later published a live mockup with a sage-green
  revision, which the site follows instead. The draft's own palette failed
  contrast at every call to action.
- **The structure.** The draft was one scrolling page. The site gives every
  work, series and policy its own page in both languages, because a one-page
  site cannot link to a single painting, and a link to a single painting is how
  the work is actually shared.
- **The eyebrow.** "ORIGINAL OIL & PAPER WORKS" above the van Gogh quote was
  cut; the quote is now in his own words from letter 143, attributed beneath it.

## Where to read the reasoning

- [`../report/senso-comune-report.pdf`](../report/senso-comune-report.pdf) —
  the technical report: what it costs, what it requires, what is unresolved.

Do not edit this PDF. If Priscilla sends a new draft, add it here beside this
one with its date in the filename, and record what changed.
