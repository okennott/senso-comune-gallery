#!/usr/bin/env python3
"""Image work for the report's softness plate.

    python3 soft_plate.py canvas <raw> <w> <h> <out.webp>
    python3 soft_plate.py plate  <hover> <glass> <band> <out.png>
    python3 soft_plate.py page   <in.png> <out.png> [width]

soft_shots.mjs drives Chrome and paints the stand-in canvas; everything that
is pixels rather than pages happens here. It used to be sharp, which is the
site's only runtime dependency and is built per platform — a report build
should not fail because an image library was installed for another OS. Pillow
is already required by figures.py, so this costs the toolchain nothing new.
"""
import sys
from PIL import Image, ImageFilter


def canvas(raw, w, h, out):
    im = Image.frombytes("RGB", (int(w), int(h)), open(raw, "rb").read())
    im.filter(ImageFilter.GaussianBlur(1.2)).save(out, "WEBP", quality=82)


def _crop_to(path, left, top, width, height, to_width):
    im = Image.open(path).convert("RGB").crop((left, top, left + width, top + height))
    return im.resize((to_width, round(im.height * to_width / im.width)), Image.LANCZOS)


def plate(hover, glass, band, out):
    # hover on the left; the glass bar and a section boundary stacked right
    left = _crop_to(hover, 1300, 0, 1500, 1800, 980)
    g = _crop_to(glass, 1100, 0, 1700, 360, 1000)
    bd = _crop_to(band, 200, 60, 1700, 920, 1000)
    W = 2000
    H = max(left.height, g.height + 20 + bd.height)
    sheet = Image.new("RGB", (W, H), "#FFFFFF")
    sheet.paste(left, (0, 0))
    sheet.paste(g, (W - 1000, 0))
    sheet.paste(bd, (W - 1000, g.height + 20))
    sheet.save(out, "PNG", optimize=True)


# The report's figure box is about 150 mm wide, so 1772 px is 300 dpi — the
# print standard, and the width every page capture is resampled to. The raw
# capture is 2880 px, which is 488 dpi: two and a half times more data than any
# printer or screen will use, and PNG has to store every pixel of the canvas
# grain to give it to them.
PAGE_WIDTH = 1772


def page(src, out, width=PAGE_WIDTH):
    """A page capture at print resolution, LOSSLESS.

    Lossless because a screenshot is mostly type and UI edges, and because the
    site now has a real texture: a JPEG artefact in a capture of a textured
    page cannot be told apart from the texture, which makes the figure a worse
    witness than the thing it is a witness to. Resampling to 300 dpi is not a
    quality loss — it is the resolution the figure is placed at — and it has
    the useful side effect of RESOLVING the grain rather than leaving it as
    per-pixel noise nothing downstream can compress.
    """
    im = Image.open(src).convert("RGB")
    width = int(width)
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(out, "PNG", optimize=True)


if __name__ == "__main__":
    cmd, *rest = sys.argv[1:]
    {"canvas": canvas, "plate": plate, "page": page}[cmd](*rest)
