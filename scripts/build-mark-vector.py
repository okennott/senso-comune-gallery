#!/usr/bin/env python3
"""Vectorize the monogram, so the mark can take a colour.

    python3 scripts/build-mark-vector.py            (or: npm run mark:vector)
    python3 scripts/build-mark-vector.py --check    re-derive and compare

Writes  public/mark-sc.svg   one path, fill="currentColor" — takes any colour
        public/icon.svg      the same path, with a light/dark rule — the tab

Both ship. icon.svg is what a browser tab asks for, and it carries the two
colours outright because a favicon has no cascade to inherit one from.
mark-sc.svg carries no colour at all: inlined in a page it is whatever the
text around it is, and handed to a printer it is a shape rather than a
photograph of one.

WHY
Issue 3 of the report's mark section: the mark the site ships is a photograph
of paper. It cannot take `currentColor`, cannot invert for a dark theme,
cannot be knocked out of a coloured ground — and issue 4, that the SVG favicon
went away with it, is the same sentence in a browser tab. Both are the same
missing object: a SHAPE, rather than a picture of one.

There is no vector source (open item 7), so this makes one from the artwork —
and states exactly what that costs, because a derived file that pretends to be
an original is how a brand loses its own artwork.

WHAT IT IS, AND IS NOT
It is a DERIVATIVE, and it is not the mark. `brand/mark-lockup.png` is still
the artwork, still pinned by hash, still what the icon set and the masthead are
cut from, and nothing here touches it. This file is her drawing reduced to one
colour — which is a reduction the sheet itself specifies, under the name
MONOCHROME (One Color), for exactly the surfaces that cannot carry the drawing.

HOW THE REDUCTION WORKS, AND WHY IT IS NOT A THRESHOLD
The letters are not solid: they are drawn as hatching, so at any single
threshold a stroke comes out striped, and morphology closing the stripes also
closes the counters. What IS solid is the hatch's DENSITY. So the ink is
blurred at the hatch's own pitch first, and the letters are the region where
that density stands above a level:

    ink      (paper - L) / paper          paper = the 85th percentile of L
    density  a Gaussian blur of the ink, radius 0.5% of the crop's side
    letters  density > 0.22 of its maximum, then closed and opened at 7px

Two numbers were solved rather than chosen, by tracing at each and measuring.
0.5% is a little over the hatch's own pitch: under it the stripes survive as
ripples in the outline (0.34% costs eight more curves and leaves a notch in
the S's counter, where the ribbon's lit side falls under the level), and far
over it the thin joins of the S melt into the counter. 0.22 is where the C's
left arm arrives whole without the construction lines arriving with it: by
0.34 the arm starts to break, and under 0.18 the sheet's own construction
circle is inside the letter.

WHAT THE REDUCTION CANNOT RECOVER
Which stroke passes in FRONT. In the drawing the S crosses the C and is told
apart from it by tone and by an outline; one colour has neither, so the two
letters fuse where they cross. Three ways to put the interlock back were tried
and none of them is honest: a light "valley" between the strokes cuts into the
lit side of the S's own ribbon; separating the dark cores never yields two
components, because the strokes stay connected at every threshold that keeps
the letters whole; and the drawing's own outline, which a ridge filter does
recover, cuts cleanly in two places out of four, which reads as damage rather
than as an interlock. The sheet's answer is a DIFFERENT DRAWING — the
Monochrome and Reversed variations, which resolve the overlap by hand — and
they are supplied at about 110px, which is not enough to trace. So the fused
silhouette is what this ships, the cost is stated here and in the report, and
open item 7 gains its second reason: the vector source would settle it.

PILLOW AND NUMPY ONLY, ON PURPOSE
No SciPy, no matplotlib, no tracer binary. The blur is Pillow's, the closing
and opening are its Max/Min filters, the contours are followed on the pixel
lattice below, and the curves are fitted by Schneider's algorithm. That means
`--check` can re-derive the whole file anywhere the rest of the checks run,
which is what keeps the committed SVG provably the drawing's own shape rather
than something somebody once traced by hand and then edited.
"""
from __future__ import annotations

import hashlib
import pathlib
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "brand/mark-lockup.png"
OUT_INLINE = ROOT / "public/mark-sc.svg"
OUT_ICON = ROOT / "public/icon.svg"

# The reduction, in one place. Every number is a fraction of the crop's side,
# so the file the trace came from could be rescanned at another size and the
# same shape would come out.
SIGMA_FRAC = 0.005           # a shade over the hatch's pitch: the blur that makes it tone
LEVEL = 0.22                 # density at which a hatched stroke counts as ink
CLEAN = 7                    # close-then-open kernel, in px at 592
MIN_AREA = 0.004             # a loop smaller than this share of the crop is dirt
SMOOTH = 4                   # passes of 1-2-1 along a contour, to unstair it
RDP_FRAC = 0.0017            # polyline simplification, ~1px at 592
FIT_FRAC = 0.0020            # curve-fitting tolerance, ~1.2px at 592
BOX = 64                     # the viewBox, as scripts/mark.mjs has it

# The site's two grounds, for the tab icon only: a favicon has no cascade to
# inherit currentColor from, so the one surface the site does not own is given
# the two colours it could be seen on. Everything else takes currentColor.
INK_LIGHT = "#3A2B22"        # --bar, on a light tab strip
INK_DARK = "#F3EBDD"         # --paper, on a dark one


# ----------------------------------------------------------- the reduction

def monogram(im: Image.Image):
    """The square the monogram occupies, with the sheet's clear space around
    it — the same crop scripts/build-icons.py cuts, imported rather than
    re-derived so the vector and the icons cannot frame the mark differently."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("build_icons", ROOT / "scripts/build-icons.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.monogram(im)


def letters(mark: Image.Image) -> np.ndarray:
    """The one-colour reduction: True where the drawing is a letter."""
    g = np.asarray(mark.convert("L")).astype(float)
    paper = np.percentile(g, 85)                 # the sheet, not the darkest pixel
    ink = np.clip((paper - g) / paper, 0, 1)
    side = mark.size[0]
    blurred = Image.fromarray((ink * 255).astype(np.uint8)) \
                   .filter(ImageFilter.GaussianBlur(radius=SIGMA_FRAC * side))
    d = np.asarray(blurred).astype(float)
    m = d > LEVEL * d.max()
    b = Image.fromarray(np.where(m, 255, 0).astype(np.uint8))
    b = b.filter(ImageFilter.MaxFilter(CLEAN)).filter(ImageFilter.MinFilter(CLEAN))  # close
    b = b.filter(ImageFilter.MinFilter(CLEAN)).filter(ImageFilter.MaxFilter(CLEAN))  # open
    return fill_holes(np.asarray(b) > 127)


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """Close the pockets the hatching leaves inside a stroke.

    The lit side of the S's ribbon is hatched so sparsely that a pocket of it
    falls under the level and comes out as a hole in the middle of the letter.
    It is not a counter - it is a place where the drawing is pale - so it is
    filled: flood the background in from the corner, and whatever background
    the flood could not reach was never outside the letter.
    """
    from PIL import ImageDraw
    # Padded, so the flood starts on background whatever the crop's corner
    # happens to hold - a speck of grain there would otherwise flood the
    # letters instead and fill the whole field.
    # .copy(): an image made straight from a numpy buffer shares it, and
    # floodfill writes nothing into a shared read-only one - silently.
    bg = Image.fromarray(np.pad(np.where(mask, 0, 255).astype(np.uint8), 1,
                                constant_values=255)).copy()
    ImageDraw.floodfill(bg, (0, 0), 128)
    return mask | (np.asarray(bg)[1:-1, 1:-1] == 255)


# ------------------------------------------------------------- the contours

def contours(mask: np.ndarray):
    """Closed loops along the boundary of the mask, on the pixel lattice.

    Crack following: every edge between an ink pixel and a background pixel is
    walked with the ink on the left, so each loop comes out oriented and the
    loops are exactly the outlines — no marching-squares interpolation, no
    library. Points are lattice corners, which is where the boundary is.
    """
    m = np.pad(mask, 1)
    # Each ink pixel contributes the edges of its own square that face
    # background, oriented so the ink is always on the left. Consistent
    # orientation is the whole trick: the edges then chain into closed loops
    # by themselves, with no neighbourhood rules and no interpolation.
    #
    #   background above -> walk the top edge    right to left
    #   background left  -> walk the left edge   top to bottom
    #   background below -> walk the bottom edge left to right
    #   background right -> walk the right edge  bottom to top
    edges = {}
    ys, xs = np.nonzero(m)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if not m[y - 1, x]:
            edges.setdefault((x + 1, y), []).append((x, y))
        if not m[y, x - 1]:
            edges.setdefault((x, y), []).append((x, y + 1))
        if not m[y + 1, x]:
            edges.setdefault((x, y + 1), []).append((x + 1, y + 1))
        if not m[y, x + 1]:
            edges.setdefault((x + 1, y + 1), []).append((x + 1, y))
    loops = []
    while edges:
        start = next(iter(edges))
        loop = [start]
        p = start
        while True:
            outs = edges.get(p)
            if not outs:
                break
            q = outs.pop(0)
            if not outs:
                del edges[p]
            loop.append(q)
            p = q
            if p == start:
                break
        if len(loop) > 8:
            loops.append(np.array(loop, dtype=float) - 1.0)   # undo the pad
    # A construction tick that survived the reduction, or a speck of paper
    # grain, arrives as a loop of a few hundred square pixels. The letters are
    # tens of thousands. Shoelace area, and the small ones are dirt.
    area = lambda P: abs(np.dot(P[:-1, 0], P[1:, 1]) - np.dot(P[1:, 0], P[:-1, 1])) / 2
    floor = MIN_AREA * mask.size
    return [L for L in loops if area(L) > floor]


# --------------------------------------------------- simplify, then fit

def rdp(pts: np.ndarray, eps: float) -> np.ndarray:
    """Ramer-Douglas-Peucker, iterative so a 4000-point loop cannot blow the
    Python stack."""
    keep = np.zeros(len(pts), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = pts[i], pts[j]
        ab = b - a
        L = float(np.hypot(*ab))
        seg = pts[i:j + 1] - a
        d = (np.hypot(*seg.T) if L < 1e-9
             else np.abs(seg[:, 0] * ab[1] - seg[:, 1] * ab[0]) / L)
        k = int(np.argmax(d))
        if d[k] > eps:
            keep[i + k] = True
            stack.append((i, i + k))
            stack.append((i + k, j))
    return pts[keep]


def _q(c, t):
    mt = 1 - t
    return ((mt ** 3)[:, None] * c[0] + (3 * mt ** 2 * t)[:, None] * c[1]
            + (3 * mt * t ** 2)[:, None] * c[2] + (t ** 3)[:, None] * c[3])


def _params(pts):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    return d / d[-1] if d[-1] > 0 else np.linspace(0, 1, len(pts))


def _unit(v):
    n = float(np.hypot(*v))
    return v / n if n > 1e-12 else v


def _fit(pts, t1, t2, u):
    mt = 1 - u
    A0 = (3 * mt ** 2 * u)[:, None] * t1
    A1 = (3 * mt * u ** 2)[:, None] * t2
    c00 = (A0 * A0).sum(); c01 = (A0 * A1).sum(); c11 = (A1 * A1).sum()
    tmp = pts - ((mt ** 3)[:, None] * pts[0] + (3 * mt ** 2 * u)[:, None] * pts[0]
                 + (3 * mt * u ** 2)[:, None] * pts[-1] + (u ** 3)[:, None] * pts[-1])
    x0 = (A0 * tmp).sum(); x1 = (A1 * tmp).sum()
    det = c00 * c11 - c01 * c01
    span = float(np.hypot(*(pts[-1] - pts[0])))
    if abs(det) < 1e-12:
        a1 = a2 = span / 3
    else:
        a1 = (x0 * c11 - c01 * x1) / det
        a2 = (c00 * x1 - x0 * c01) / det
        # A least-squares solve on a near-straight span can throw a handle off
        # the page; a handle longer than the span is never what it wanted.
        if a1 < 1e-6 or a2 < 1e-6 or a1 > span or a2 > span:
            a1 = a2 = span / 3
    return np.array([pts[0], pts[0] + a1 * t1, pts[-1] + a2 * t2, pts[-1]])


def _reparam(pts, c, u):
    mt = 1 - u
    d1 = 3 * ((mt ** 2)[:, None] * (c[1] - c[0]) + (2 * mt * u)[:, None] * (c[2] - c[1])
              + (u ** 2)[:, None] * (c[3] - c[2]))
    d2 = 6 * (mt[:, None] * (c[2] - 2 * c[1] + c[0]) + u[:, None] * (c[3] - 2 * c[2] + c[1]))
    diff = _q(c, u) - pts
    num = (diff * d1).sum(1)
    den = (d1 * d1).sum(1) + (diff * d2).sum(1)
    return np.clip(np.where(np.abs(den) < 1e-12, u, u - num / den), 0, 1)


def fit_curve(pts, t1, t2, err, depth=0):
    """Schneider: fit one cubic, reparameterize, and split at the worst point
    if it still will not hold the tolerance."""
    if len(pts) == 2:
        span = float(np.hypot(*(pts[-1] - pts[0]))) / 3
        return [np.array([pts[0], pts[0] + span * t1, pts[-1] + span * t2, pts[-1]])]
    u = _params(pts)
    c = _fit(pts, t1, t2, u)
    e = np.hypot(*(_q(c, u) - pts).T)
    i = int(np.argmax(e))
    if e[i] < err:
        return [c]
    if e[i] < err * 4 and depth < 12:
        for _ in range(12):
            u = _reparam(pts, c, u)
            c = _fit(pts, t1, t2, u)
            e = np.hypot(*(_q(c, u) - pts).T)
            i = int(np.argmax(e))
            if e[i] < err:
                return [c]
    if i <= 0 or i >= len(pts) - 1:
        i = len(pts) // 2
    tc = _unit(pts[i - 1] - pts[i + 1])
    return (fit_curve(pts[:i + 1], t1, tc, err, depth + 1)
            + fit_curve(pts[i:], -tc, t2, err, depth + 1))


def smooth(P: np.ndarray, passes: int = SMOOTH) -> np.ndarray:
    """Take the staircase off a lattice contour.

    Crack following returns axis-aligned steps, and a curve fitted to a
    staircase spends its curves apologizing for the corners. A few passes of a
    1-2-1 average along the loop turn those steps into the chamfers a
    half-pixel-accurate contour would have had. Measured on this mark: the
    same shape falls from 142 curves to 77, and the fidelity goes UP.
    """
    Q = P[:-1] if np.allclose(P[0], P[-1]) else P
    for _ in range(passes):
        Q = (np.roll(Q, 1, 0) + 2 * Q + np.roll(Q, -1, 0)) / 4
    return np.vstack([Q, Q[0]])


def trace(mask: np.ndarray, side: int):
    loops = []
    for loop in contours(mask):
        pts = rdp(smooth(loop), RDP_FRAC * side)
        if len(pts) < 4:
            continue
        if np.allclose(pts[0], pts[-1]):
            pts = pts[:-1]
        pts = np.vstack([pts, pts[0]])
        loops.append(fit_curve(pts, _unit(pts[1] - pts[0]), _unit(pts[-2] - pts[-1]),
                               FIT_FRAC * side))
    return loops


def path_d(loops, scale, dp=3):
    def f(v):
        return ("%.*f" % (dp, v)).rstrip("0").rstrip(".") or "0"
    out = []
    for curves in loops:
        p = curves[0][0] * scale
        out.append(f"M{f(p[0])} {f(p[1])}")
        for c in curves:
            _, c1, c2, c3 = c * scale
            out.append(f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(c3[0])} {f(c3[1])}")
        out.append("Z")
    return "".join(out)


# ------------------------------------------------------------------ output

def build():
    im = Image.open(SRC).convert("RGB")
    mark, box = monogram(im)
    side = mark.size[0]
    mask = letters(mark)
    loops = trace(mask, side)
    d = path_d(loops, BOX / side)
    sha = hashlib.sha256(SRC.read_bytes()).hexdigest()
    note = (f"the SC monogram, reduced to one colour and traced from "
            f"brand/mark-lockup.png (sha256 {sha[:16]}) by scripts/build-mark-vector.py. "
            f"A DERIVATIVE: the artwork is the artwork. See the report, §The mark.")
    inline = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {BOX} {BOX}">\n'
              f'<!-- {note} -->\n'
              f'<path fill="currentColor" d="{d}"/>\n'
              f'</svg>\n')
    icon = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {BOX} {BOX}">\n'
            f'<!-- {note} -->\n'
            f'<style>path{{fill:{INK_LIGHT}}}'
            f'@media(prefers-color-scheme:dark){{path{{fill:{INK_DARK}}}}}</style>\n'
            f'<path d="{d}"/>\n'
            f'</svg>\n')
    return inline, icon, mask, loops, side


def fidelity(loops, mask, side):
    """Render the path back and measure it against the reduction it came from.

    A trace that is not measured is a drawing somebody once made. cairosvg is
    already a dependency of scripts/image.py and of the checks that run it.
    """
    import io
    import cairosvg
    d = path_d(loops, 1.0)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {mask.shape[0]}">'
           f'<path fill="#000" d="{d}"/></svg>')
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=side, output_height=mask.shape[0])
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    flat = Image.alpha_composite(Image.new("RGBA", im.size, (255, 255, 255, 255)), im)
    a = np.asarray(flat.convert("L")) < 128
    return float((a & mask).sum() / (a | mask).sum())


def main(argv):
    check = "--check" in argv
    inline, icon, mask, loops, side = build()
    curves = sum(len(l) for l in loops)
    if check:
        bad = [p for p, want in ((OUT_INLINE, inline), (OUT_ICON, icon))
               if not p.exists() or p.read_text(encoding="utf8") != want]
        if bad:
            print("  the committed vector is NOT what the drawing gives:")
            for p in bad:
                print(f"    ✗ {p.relative_to(ROOT)}")
            print("  run: python3 scripts/build-mark-vector.py")
            return 1
        print(f"  mark vector: re-derived from the artwork and identical — "
              f"{len(loops)} loop(s), {curves} curves, IoU {fidelity(loops, mask, side):.4f}")
        return 0
    OUT_INLINE.write_text(inline, encoding="utf8")
    OUT_ICON.write_text(icon, encoding="utf8")
    print(f"    source brand/mark-lockup.png — monogram {side}px, "
          f"reduction {mask.mean() * 100:.1f}% ink")
    print(f"    {len(loops)} loop(s), {curves} curves, "
          f"IoU against the reduction {fidelity(loops, mask, side):.4f}")
    for p in (OUT_INLINE, OUT_ICON):
        print(f"    {p.relative_to(ROOT)} — {p.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
