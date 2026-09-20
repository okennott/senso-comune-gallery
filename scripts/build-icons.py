#!/usr/bin/env python3
"""Cut the site's icon set and masthead mark out of the supplied artwork.

    python3 scripts/build-icons.py        (or: npm run icons)

Closes finding C-01 — the site once shipped with no favicon, no home-screen
icon and no theme colour, on a business whose entire acquisition motion is a
link in an Instagram or WeChat bio.

THE SOURCE IS brand/mark-lockup.png, unmodified: the preferred option from
Priscilla's prototype sheet, the monogram as drawn with the wordmark beneath.
Everything below is a crop and a resize of that one file. Nothing is redrawn,
recoloured or traced, and the artwork's own paper is kept as the ground — it
measures #E4DCCC, within a step of the cream the mats are cut from.

Two consequences of the source being a raster, both stated rather than worked
around (report, "The mark"):
  * it is 1536 x 1024, so the monogram is about 500 px square. That is enough
    for a 180 px home-screen icon and a 34 px masthead mark at 2x, and it is
    the ceiling. There is no vector and no larger raster.
  * a pencil drawing with construction lines does not survive 16 px. The
    numbers are in the report; the file is cut anyway, because the artwork is
    the artwork.

Pillow, not sharp: sharp is the site's only runtime dependency and is built
per platform, and an icon build should not fail because it was installed for
another operating system.
"""
import json
import pathlib
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "brand/mark-lockup.png"
PUB = ROOT / "public"

# The three bands of the artwork, measured from the ink rather than typed in:
# the monogram, then SENSO COMUNE, then GALLERY.
INK = 150 * 3          # a pixel is ink if its channels sum below this
PAD = 0.055            # clear space around the monogram, as a share of its side


def bands(dark):
    """Row runs that contain ink, top to bottom."""
    rows = dark.sum(1) > 0
    out, start = [], None
    for i, on in enumerate(rows):
        if on and start is None:
            start = i
        elif not on and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(rows) - 1))
    return out


def monogram(im):
    """The square the monogram occupies, with the sheet's clear space around it."""
    a = np.asarray(im.convert("RGB")).astype(int)
    dark = a.sum(2) < INK
    top, bottom = bands(dark)[0]                 # the first band is the mark
    cols = np.nonzero(dark[top:bottom + 1].sum(0))[0]
    left, right = int(cols.min()), int(cols.max())
    cx, cy = (left + right) / 2, (top + bottom) / 2
    side = max(right - left, bottom - top) * (1 + 2 * PAD)
    box = (round(cx - side / 2), round(cy - side / 2),
           round(cx + side / 2), round(cy + side / 2))
    return im.crop(box), box


def main():
    im = Image.open(SRC).convert("RGB")
    mark, box = monogram(im)
    print(f"    source brand/mark-lockup.png {im.size[0]}x{im.size[1]}"
          f" — monogram at {box}, {mark.size[0]}x{mark.size[1]}")

    def cut(px, name, **kw):
        out = PUB / name
        mark.resize((px, px), Image.LANCZOS).save(out, **kw)
        print(f"    public/{name} — {out.stat().st_size:,} bytes, {px}x{px}")

    # The masthead mark. Served at one size and set by CSS at 1.5em, so 192 px
    # covers a 2x phone and anything a wider header might ask for later.
    cut(192, "logo-mark.png", format="PNG", optimize=True)
    # iOS crops to a rounded rect and never shows transparency; the artwork's
    # own paper is opaque, so nothing here depends on how alpha is handled.
    cut(180, "apple-touch-icon.png", format="PNG", optimize=True)
    cut(32, "icon-32.png", format="PNG", optimize=True)
    # Still asked for by path by a few crawlers and older tabs; 32 px, and
    # cheaper than the 404 they would otherwise log.
    cut(32, "favicon.ico", format="ICO", sizes=[(32, 32)])

    (PUB / "site.webmanifest").write_text(json.dumps({
        "name": "Senso Comune Gallery",
        "short_name": "Senso Comune",
        "icons": [
            {"src": "/icon-32.png", "sizes": "32x32", "type": "image/png"},
            {"src": "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png"},
        ],
        "theme_color": "#3A2B22",
        # the wall the site actually is (--field), not the sheet's stated
        # Primary Sage: a splash screen that does not match the page it opens
        # is the same defect as a stylesheet that does not match its page
        "background_color": "#898D76",
        "display": "browser",
        "start_url": "/",
    }, indent=2) + "\n", encoding="utf8")
    print("    public/site.webmanifest")


if __name__ == "__main__":
    main()
