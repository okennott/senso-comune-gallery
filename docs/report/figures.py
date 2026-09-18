#!/usr/bin/env python3
"""
Generate the report's figures as vector PDF.

Every colour and every ratio is read from src/styles/tokens.css rather than
typed here, so the figures cannot drift from the site they document.

    python3 docs/report/figures.py
"""
import re
import pathlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyArrowPatch, FancyBboxPatch
from matplotlib.font_manager import FontProperties
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/report/fig"
OUT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- tokens
css = (ROOT / "src/styles/tokens.css").read_text()
T = dict(re.findall(r"--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;", css))

def _chan(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

def lum(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _chan(r) + 0.7152 * _chan(g) + 0.0722 * _chan(b)

def ratio(a, b):
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)

INK, BODY, PAPER = T["ink"], T["body"], T["paper"]
SANG, FIELD, BAR = T["sanguine"], T["field"], T["bar"]
MUTED, RULE = T["muted"], T["rule"]

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 8,
    "text.color": INK,
    "axes.edgecolor": MUTED,
    "axes.labelcolor": INK,
    "xtick.color": BODY,
    "ytick.color": BODY,
    "savefig.bbox": "tight",
    "savefig.pad_inches": 0.04,
    "pdf.fonttype": 42,
})

def on(bg, light="#FFFFFF", dark=None):
    """The foreground that reads on `bg`. Picked by measurement, not by eye —
    this figure argues that you cannot judge contrast by looking, so it would
    be absurd to choose its own label colours that way."""
    dark = dark or INK
    return light if ratio(light, bg) >= ratio(dark, bg) else dark


# ------------------------------------------------------------ report faces
# Several figures have to SET type rather than describe it, so they need the
# same static cuts the document is set in. fonts.py has already built them by
# the time this runs; a missing file is a build-order bug, not a soft failure.
FONTS = ROOT / "docs/report/fonts"
FRAUNCES = FontProperties(fname=str(FONTS / "Fraunces-Display-SemiBold.ttf"))
UI = FontProperties(fname=str(FONTS / "Inter-Regular.ttf"))
_cjk = FONTS / "NotoSerifSC-report.otf"
CJK = FontProperties(fname=str(_cjk)) if _cjk.exists() else None


def cjk_or_die(ch):
    """matplotlib draws a missing glyph as nothing at all — the same silent
    failure the preamble warns about for XeTeX. Fail here instead."""
    from fontTools.ttLib import TTFont
    if CJK is None or ord(ch) not in TTFont(_cjk).getBestCmap():
        raise SystemExit(
            f"  {ch} is not in the report's CJK subset.\n"
            f"  fonts.py derives it from the .qmd; add the character to the prose "
            f"or the figure cannot set it.")
    return CJK


def save(fig, name):
    fig.savefig(OUT / f"{name}.pdf", facecolor="white")
    plt.close(fig)
    print(f"  fig/{name}.pdf")


# ---------------------------------------------------- 1. palette specimen
def palette():
    # (label, hex, ground, minimum it must meet, note).  The minimum differs by
    # role: text needs 4.5:1, a rule or border needs 3:1.  Flagging a rule red
    # for missing a threshold that does not apply to it would be a lie.
    rows = [
        ("Bar / masthead",    BAR,   None,    None, "Hers. Sand on it: 11.45:1"),
        ("Field / sage",      FIELD, None,    None, "Frames the sheet"),
        ("Paper / reading",   PAPER, None,    None, "Every foreground solved here"),
        ("Ink / headings",    INK,   "paper", 4.5,  "Hers. Warmer than the neutral"),
        ("Body",              BODY,  "paper", 4.5,  "Hers"),
        ("Sanguine / accent", SANG,  "paper", 4.5,  "Red chalk. Chosen by eye"),
        ("Muted / captions",  MUTED, "paper", 4.5,  "The white-ground value failed"),
        ("Rule",              RULE,  "paper", 3.0,  "Needs 3:1, not 4.5"),
    ]
    # The swatch is wide enough to carry its own name and value, so the colour
    # and the number that describes it are never read apart. A hex printed in a
    # caption beside a chip is a claim; printed ON the chip it is a specimen,
    # and a value that failed on its own ground would be visibly unreadable.
    SW_X, SW_W = 0.0, 3.85          # swatch
    NOTE_X = 4.05                   # note
    MT_X, MT_W = 7.20, 1.90         # the ratio meter
    NUM_X = 10.0                    # ratios in a fixed column: a number set at
                                    # the end of its own bar lands on whichever
                                    # threshold rule it happens to be near

    fig, ax = plt.subplots(figsize=(6.6, 0.60 * len(rows) + 0.70))
    ax.set_xlim(0, 10); ax.set_ylim(0, len(rows) + 0.85); ax.axis("off")

    # meter scale: 1:1 to 12:1, with both thresholds ruled the full height
    def mx(r):
        return MT_X + MT_W * min(max(r - 1, 0), 11) / 11

    for t, c, ls in ((3.0, MUTED, ":"), (4.5, INK, "--")):
        ax.plot([mx(t), mx(t)], [0.16, len(rows) + .02], color=c, lw=.8, ls=ls, zorder=1)
    ax.text(mx(3.0) - .04, len(rows) + .40, "3:1", ha="right", fontsize=6.2, color=BODY)
    ax.text(mx(4.5) + .04, len(rows) + .40, "4.5:1", ha="left", fontsize=6.2, color=INK)
    ax.text(MT_X, len(rows) + .66, "contrast on cream", fontsize=6.6, color=BODY)

    for i, (name, hexv, against, minimum, note) in enumerate(rows):
        y = len(rows) - i - 1
        fg = on(hexv)

        ax.add_patch(Rectangle((SW_X, y + .10), SW_W, .80, facecolor=hexv,
                               edgecolor=MUTED, linewidth=.5, zorder=2))
        ax.text(SW_X + .20, y + .50, name, fontsize=8.0, weight="bold",
                color=fg, va="center", zorder=3)
        ax.text(SW_X + SW_W - .20, y + .50, hexv.upper(), fontsize=7.8,
                family="DejaVu Sans Mono", color=fg, va="center", ha="right", zorder=3)

        ax.text(NOTE_X, y + .50, note, fontsize=7.0, color=BODY, va="center")

        if against:
            r = ratio(hexv, PAPER)
            passes = r >= minimum
            c = hexv if passes else "#A81E14"
            ax.add_patch(Rectangle((MT_X, y + .39), mx(r) - MT_X, .22,
                                   facecolor=c, edgecolor="none", zorder=2))
            ax.text(NUM_X, y + .50, f"{r:.2f}", fontsize=7.2, ha="right",
                    family="DejaVu Sans Mono", va="center",
                    color=INK if passes else "#A81E14", zorder=3)
        else:
            # A ground carries no foreground of its own, so it has no ratio to
            # report. Leaving the row blank would read as a failure.
            ax.text(NUM_X, y + .50, "no text on it", fontsize=6.8, color=MUTED,
                    va="center", ha="right", style="italic")
    save(fig, "palette")


# -------------------------------------------- 2. why sage carries no text
def sage_limit():
    # (label, foreground, ground, minimum). Each row is drawn as a SPECIMEN —
    # the actual foreground set on the actual ground — beside its measurement,
    # because the whole point of the section is that the number and the
    # impression disagree. A reader who cannot see the failure here is being
    # shown exactly the problem the section describes.
    DRAFT_GREY = "#A19E97"
    cases = [
        ("Heading ink on sage",     INK,       FIELD, 3.0),
        ("Body text on sage",       BODY,      FIELD, 4.5),
        ("Terracotta on sage",      "#98564B", FIELD, 4.5),
        ("The draft's failed grey", DRAFT_GREY, "#FFFFFF", 4.5),
        ("Body text on cream",      BODY,      PAPER, 4.5),
        ("Heading ink on cream",    INK,       PAPER, 4.5),
    ]

    SP_X, SP_W = 0.0, 2.15          # specimen chip
    LB_X = 2.35                     # label
    MT_X, MT_W = 5.55, 3.30         # bar
    NUM_X = 10.0

    fig, ax = plt.subplots(figsize=(6.6, 0.62 * len(cases) + 0.80))
    ax.set_xlim(0, 10); ax.set_ylim(-0.62, len(cases) + 0.95); ax.axis("off")

    def mx(r):
        return MT_X + MT_W * min(max(r - 1, 0), 11) / 11

    for t, c, ls in ((3.0, MUTED, ":"), (4.5, INK, "--")):
        ax.plot([mx(t), mx(t)], [-0.02, len(cases) + .02], color=c, lw=.9, ls=ls, zorder=1)
    ax.text(mx(3.0) - .05, len(cases) + .38, "3:1 UI", ha="right", fontsize=6.4, color=BODY)
    ax.text(mx(4.5) + .05, len(cases) + .38, "4.5:1 AA body text", ha="left",
            fontsize=6.4, color=INK)

    for i, (name, fg, bg, minimum) in enumerate(cases):
        y = len(cases) - i - 1
        r = ratio(fg, bg)
        passes = r >= minimum

        ax.add_patch(Rectangle((SP_X, y + .08), SP_W, .84, facecolor=bg,
                               edgecolor=MUTED, linewidth=.5, zorder=2))
        ax.text(SP_X + SP_W / 2, y + .50, "Original Works", fontsize=8.2,
                color=fg, va="center", ha="center", zorder=3)

        ax.text(LB_X, y + .50, name, fontsize=7.6, color=INK, va="center")
        if not passes:
            ax.text(LB_X, y + .19, "fails", fontsize=6.4, color="#A81E14", va="center")

        ax.add_patch(Rectangle((MT_X, y + .39), mx(r) - MT_X, .22,
                               facecolor=fg if passes else "#A81E14",
                               edgecolor="none", zorder=2))
        ax.text(NUM_X, y + .50, f"{r:.2f}", fontsize=7.4, ha="right",
                family="DejaVu Sans Mono", va="center", zorder=3,
                color=INK if passes else "#A81E14")

    ax.text(0, -0.52,
            "Rows 1–3 are Priscilla's mockup as drawn. Row 4 is the draft's own failure, "
            "on white, for scale.\nThe specimen is a real navigation label, set at the size it "
            "is set at on the site.",
            fontsize=6.8, color=BODY, va="bottom", linespacing=1.5)
    save(fig, "sage-limit")


# ------------------------------------------------ 3. payment routing tree
def payments():
    fig, ax = plt.subplots(figsize=(6.6, 3.5))
    ax.set_xlim(0, 10); ax.set_ylim(0, 6); ax.axis("off")

    def box(x, y, w, h, text, fc="white", ec=None, bold=False, fs=7.6):
        ax.add_patch(FancyBboxPatch((x, y), w, h,
                     boxstyle="round,pad=0.04,rounding_size=0.04",
                     facecolor=fc, edgecolor=ec or MUTED, linewidth=.8))
        ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
                fontsize=fs, weight="bold" if bold else "normal",
                linespacing=1.45)

    def arrow(x1, y1, x2, y2, label=None, color=None):
        ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2),
                     arrowstyle="-|>", mutation_scale=8,
                     color=color or MUTED, linewidth=.9))
        if label:
            ax.text((x1 + x2) / 2 + .12, (y1 + y2) / 2, label, fontsize=6.6,
                    color=BODY, ha="left", va="center")

    box(3.3, 5.1, 3.4, .75, "Seller resident in\nmainland China", bold=True, fc="#F3EBDD")

    arrow(5, 5.1, 5, 4.5)
    box(2.6, 3.6, 4.8, .85,
        "Stripe: mainland China absent from\nsupported business countries",
        fc="#FBEAE8", ec="#A81E14")

    arrow(5, 3.6, 5, 3.0)
    box(2.6, 2.1, 4.8, .85,
        "Airwallex: mainland entities excluded from\ncard acquiring; no individual accounts",
        fc="#FBEAE8", ec="#A81E14")

    arrow(3.9, 2.1, 2.35, 1.55)
    box(0.05, 0.45, 4.6, 1.0,
        "LAUNCH  ·  individual\nNo registration under CNY 100k/yr\nPayPal + Alipay + WeChat, no cards",
        fc="#E4F2EA", ec="#14653F", bold=False, fs=7.0)

    arrow(6.1, 2.1, 7.65, 1.55)
    box(5.35, 0.45, 4.6, 1.0,
        "GROW  ·  HK sole proprietorship\nBusiness Registration certificate only\nCards + Alipay + WeChat, one checkout",
        fc="#E8EEFA", ec="#1B4DB1", fs=7.0)

    ax.text(5, 0.10, "one string in seller.json switches between them",
            ha="center", fontsize=6.8, color=BODY, style="italic")
    save(fig, "payments")


# --------------------------------------------- 4. oversell defence layers
def oversell():
    layers = [
        ("Platform limit",     "deactivates on completion, not on session start", "#FBF2DF", "#8A5600"),
        ("CMS flag + rebuild", "can fail silently; nobody is watching",            "#FBF2DF", "#8A5600"),
        ("CDN edge",           "serves 'available' for minutes after",             "#FBEAE8", "#A81E14"),
        ("Client-side check",  "survives a stale cache, a failed build, bfcache",  "#E4F2EA", "#14653F"),
    ]
    row_h, gap, base = 0.80, 0.22, 1.05   # base clears the footnote below
    fig, ax = plt.subplots(figsize=(6.6, 2.75))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, len(layers) * (row_h + gap) + base + 0.15)
    ax.axis("off")

    for i, (name, note, fc, ec) in enumerate(layers):
        y = (len(layers) - 1 - i) * (row_h + gap) + base
        ax.add_patch(FancyBboxPatch((0.25, y), 3.15, row_h,
                     boxstyle="round,pad=0.03,rounding_size=0.04",
                     facecolor=fc, edgecolor=ec, linewidth=.9))
        # label centred in its own box; the note lives OUTSIDE it, so the two
        # can no longer overlap however long the note is
        ax.text(1.825, y + row_h / 2, name, ha="center", va="center",
                fontsize=8.2, weight="bold")
        ax.annotate("", xy=(4.15, y + row_h / 2), xytext=(3.55, y + row_h / 2),
                    arrowprops=dict(arrowstyle="-|>", color=MUTED, lw=.9))
        ax.text(4.35, y + row_h / 2, note, ha="left", va="center",
                fontsize=7.4, color=BODY)

    ax.text(0.25, 0.62,
            "No platform in this price range guarantees atomicity. The bottom layer is the cheapest,\n"
            "and the only one that survives the other three failing.",
            fontsize=6.9, color=BODY, linespacing=1.5, va="top")
    save(fig, "oversell")


# ----------------------------------------------- 5. what a US buyer pays
def duty():
    price = 300.0
    parts = [("Painting",               price,        SANG),
             ("Section 301 duty, 7.5%", price * .075, "#A81E14"),
             ("CBP fees",               8.0,          MUTED),
             ("Carrier brokerage",      12.0,         T["field-deep"])]
    total = sum(v for _, v, _ in parts)

    fig, ax = plt.subplots(figsize=(6.6, 2.35))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.2)
    ax.axis("off")

    ax.text(0.2, 3.85, "A $300 painting, China origin, delivered to the United States",
            fontsize=7.6, color=BODY)

    # the bar
    left = 0.2
    span = 9.6
    for name, val, c in parts:
        w = span * val / total
        ax.add_patch(Rectangle((left, 2.75), w, .62, facecolor=c,
                               edgecolor="white", linewidth=.9))
        if w > 0.9:
            ax.text(left + w / 2, 3.06, f"${val:,.0f}", ha="center", va="center",
                    color="white", fontsize=7.8, weight="bold")
        left += w

    # A keyed list UNDER the bar rather than labels at cumulative x, which
    # collided as soon as a segment was narrower than its own caption.
    for i, (name, val, c) in enumerate(parts):
        y = 2.10 - i * 0.44
        ax.add_patch(Rectangle((0.2, y - .055), .30, .22, facecolor=c,
                               edgecolor=MUTED, linewidth=.4))
        ax.text(0.68, y + .055, name, fontsize=7.4, color=INK, va="center")
        ax.text(4.55, y + .055, f"${val:,.2f}", fontsize=7.4, va="center",
                ha="right", family="DejaVu Sans Mono", color=BODY)

    ax.plot([0.2, 4.55], [0.30, 0.30], color=MUTED, lw=.7)
    ax.text(0.68, 0.10, "total to the buyer", fontsize=7.8, weight="bold", va="center")
    ax.text(4.55, 0.10, f"${total:,.2f}", fontsize=7.8, weight="bold",
            va="center", ha="right", family="DejaVu Sans Mono")
    save(fig, "duty")


# ------------------------------------------------------ 6. shipping paths
def shipping():
    paper = ["acid-free\nboard", "glassine over\nthe image", "second\nboard",
             "poly bag", "rigid flat\nmailer"]
    canvas = ["glassine on\nthe paint", "foam\ncorners", "rigid board\nboth faces",
              "bubble OUTSIDE\nthe boards", "box, 2in\nclearance"]

    fig, ax = plt.subplots(figsize=(6.6, 2.9))
    ax.set_xlim(0, 10); ax.set_ylim(0, 5.0); ax.axis("off")

    def strip(y, items, fc):
        # width and pitch derived from the count, so captions can never
        # overrun into the neighbouring box however many steps there are
        pitch = 9.6 / len(items)
        w = pitch - 0.18
        for i, s in enumerate(items):
            x = 0.2 + i * pitch
            ax.add_patch(FancyBboxPatch((x, y), w, .72,
                         boxstyle="round,pad=0.02,rounding_size=0.03",
                         facecolor=fc, edgecolor=MUTED, linewidth=.55))
            ax.text(x + w / 2, y + .36, s, ha="center", va="center",
                    fontsize=6.4, linespacing=1.3)
            if i < len(items) - 1:
                ax.annotate("", xy=(x + pitch - 0.14, y + .36),
                            xytext=(x + w + 0.02, y + .36),
                            arrowprops=dict(arrowstyle="-|>", color=MUTED, lw=.6))

    ax.text(0.2, 4.55, "Works on paper", fontsize=8.6, weight="bold")
    ax.text(0.2, 4.22, "flat, never rolled — rolling cracks the sizing",
            fontsize=7, color=BODY)
    strip(3.30, paper, "#F3EBDD")

    ax.text(0.2, 2.62, "Stretched canvas", fontsize=8.6, weight="bold")
    ax.text(0.2, 2.29, "upright, never flat — and never below freezing",
            fontsize=7, color=BODY)
    strip(1.37, canvas, "#EDE4D3")

    ax.text(0.2, 0.62, "Materials run $25–50 per shipment. Every carrier's artwork "
                       "declared-value cap\nsits above this inventory.",
            fontsize=6.9, color=BODY, linespacing=1.5, va="top")
    save(fig, "shipping")


# ------------------------------------------------------------ 7. the mark
# The report shows the artwork Priscilla supplied, and shows it as supplied:
# brand/brand-sheet.png and brand/mark-lockup.png are cropped and recompressed
# for the page and not otherwise touched. The Fraunces construction that stood
# in before they arrived is kept as a figure of its own — the alternative on
# the record, not a second live logo.

BRAND = ROOT / "brand"


def _mark_svgs(jobs):
    """Ask Node for a batch of renderings of the CONSTRUCTION. jobs: {name: options}."""
    import json, subprocess
    src = (
        'const {markSvg} = await import(process.argv[1]);'
        'const jobs = JSON.parse(process.argv[2]);'
        'const out = {};'
        'for (const [k, o] of Object.entries(jobs)) out[k] = markSvg(o);'
        'process.stdout.write(JSON.stringify(out));'
    )
    r = subprocess.run(["node", "--input-type=module", "-e", src,
                        str(ROOT / "scripts/mark.mjs"), json.dumps(jobs)],
                       capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def _monogram():
    """The monogram square, cut from the artwork by the same rule the icon
    build uses — imported rather than reimplemented, so the report's mark and
    the browser tab's are the same crop of the same file."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("bi", ROOT / "scripts/build-icons.py")
    bi = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bi)
    from PIL import Image
    return bi.monogram(Image.open(BRAND / "mark-lockup.png").convert("RGB"))[0]


def mark_assets():
    """What the page furniture sets: the mark in the running footer and on the
    title bar. Both are the artwork, cut once at 256 px — a plate of cream in
    the bar, which is the site's own device at type size."""
    _monogram().resize((256, 256), Image.LANCZOS).save(OUT / "mark.png", optimize=True)
    print(f"    fig/mark.png — {(OUT / 'mark.png').stat().st_size:,} bytes")

    # The two plates, as supplied. JPEG at 95 with no chroma subsampling —
    # visually lossless for continuous tone, and the right codec for it: these
    # are photographs of paper, where PNG stores every fibre and pays for it.
    # The page captures go the other way and stay lossless (soft_plate.page),
    # because they are type and UI edges, not photographs.
    for name, width in (("brand-sheet", 1536), ("mark-lockup", 1200)):
        im = Image.open(BRAND / f"{name}.png").convert("RGB")
        if im.width != width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.save(OUT / f"{name}.jpg", quality=95, subsampling=0, optimize=True, progressive=True)
        print(f"    fig/{name}.jpg — {(OUT / f'{name}.jpg').stat().st_size:,} bytes, {im.width}x{im.height}")

    # The variations row, cropped from the sheet. At the size the whole sheet
    # fits an A4 column its own labels are unreadable, and this is the panel
    # the mark section's second issue turns on: the variations are a DIFFERENT
    # drawing from the preferred one — solid letters, no construction lines.
    sheet = Image.open(BRAND / "brand-sheet.png").convert("RGB")
    sheet.crop((958, 600, 1525, 800)).resize((1701, 600), Image.LANCZOS).save(
        OUT / "mark-variations.jpg", quality=95, subsampling=0, optimize=True, progressive=True)
    print(f"    fig/mark-variations.jpg — {(OUT / 'mark-variations.jpg').stat().st_size:,} bytes")


def mark_construction():
    """The Fraunces construction: what the site carried between the decision to
    use a monogram and the arrival of the drawing. Kept because the argument it
    settles — that a mark has to survive the size it is seen at most — is the
    argument the artwork has to answer too."""
    import io
    import cairosvg

    svgs = _mark_svgs({
        "primary":  {"variant": "primary"},
        "reversed": {"variant": "reversed"},
        "black":    {"variant": "black"},
        "hatched":  {"variant": "reversed", "hatch": True},
        "small":    {"variant": "reversed"},
    })

    def raster(svg, px, ground):
        buf = cairosvg.svg2png(bytestring=svg.encode("utf8"),
                               output_width=px, output_height=px)
        im = Image.open(io.BytesIO(buf)).convert("RGBA")
        g = tuple(int(ground.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
        flat = Image.new("RGBA", im.size, g)
        flat.alpha_composite(im)
        return np.asarray(flat.convert("RGB"))

    top = [("primary", "Primary — --field on the sheet", PAPER),
           ("reversed", "Reversed — the tab, the masthead", PAPER),
           ("black", "One colour — print", PAPER),
           ("hatched", "Hatched — 45\u00b0, above ~96 px", PAPER)]
    bottom = [(180, "180 px — the home screen"),
              (32, "32 px — favicon.ico"),
              (16, "16 px — the browser tab")]

    fig, axes = plt.subplots(2, 4, figsize=(7.0, 4.0))
    for ax in axes.ravel():
        ax.set_axis_off()

    for ax, (key, label, ground) in zip(axes[0], top):
        ax.imshow(raster(svgs[key], 600, ground), interpolation="antialiased")
        ax.set_title(label, fontproperties=UI, fontsize=6, color=MUTED, pad=5)

    for ax, (px, label) in zip(axes[1], bottom):
        img = Image.fromarray(raster(svgs["small"], px, PAPER)).resize(
            (300, 300), Image.NEAREST)
        ax.imshow(np.asarray(img), interpolation="nearest")
        ax.set_title(label, fontproperties=UI, fontsize=6, color=MUTED, pad=5)
    axes[1][3].text(0.0, 0.5,
                    "All three are the same file, cut at\nthe size they are labelled with and\n"
                    "then enlarged. The hatching is gone\nby 32 px; by 16 px the S is a\n"
                    "suggestion and the C carries the mark.",
                    fontproperties=UI, fontsize=6, color=BODY,
                    ha="left", va="center", linespacing=1.6,
                    transform=axes[1][3].transAxes)

    save(fig, "mark-construction")


def mark_sizes():
    """The adopted artwork at the three sizes it is cut to, each enlarged from
    the file that actually ships. This is the evidence for everything the mark
    section says about a drawn mark at icon sizes."""
    mono = _monogram()
    sizes = [(180, "180 px — the home screen"),
             (32, "32 px — favicon.ico and the tab"),
             (16, "16 px — the tab on a dense display")]
    fig, axes = plt.subplots(1, 4, figsize=(7.0, 2.2))
    for ax in axes:
        ax.set_axis_off()
    for ax, (px, label) in zip(axes, sizes):
        small = mono.resize((px, px), Image.LANCZOS).resize((360, 360), Image.NEAREST)
        ax.imshow(np.asarray(small), interpolation="nearest")
        ax.set_title(label, fontproperties=UI, fontsize=6, color=MUTED, pad=5)
    axes[3].text(0.0, 0.5,
                 "The same crop of the same file at\neach size, then enlarged. The\n"
                 "construction lines go first, then the\nhatching; at 16 px what is left is a\n"
                 "shape that reads as a monogram\nrather than as two letters.",
                 fontproperties=UI, fontsize=6, color=BODY,
                 ha="left", va="center", linespacing=1.6,
                 transform=axes[3].transAxes)
    save(fig, "mark-sizes")


def softness():
    """Two measured limits, both read from tokens.css. Left: how translucent the
    masthead may be before its text fails over a white passage of a painting.
    Right: the lightness profile down a section boundary, before and after."""
    import math
    css_all = (ROOT / "src/styles/tokens.css").read_text()
    glass = float(re.search(r"--glass-bar-opacity:\s*([\d.]+)%", css_all).group(1)) / 100
    breath = float(re.search(r"--edge-breath:\s*([\d.]+)%", css_all).group(1)) / 100
    PD, WARM, VIOLET, BLUE = T["paper-deep"], T["wash-warm"], T["wash-violet"], T["wash-blue"]

    def rgb(h): return [int(h.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)]
    def hexc(c): return "#" + "".join(f"{round(v):02X}" for v in c)
    def over_white(a): return hexc([a * v + (1 - a) * 255 for v in rgb(BAR)])

    # OKLab, for the boundary panel: lightness is what the eye reads as a band
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + .055) / 1.055) ** 2.4
    def oklab(h):
        r, g, b = (lin(v) for v in rgb(h))
        l = (.4122214708 * r + .5363325363 * g + .0514459929 * b) ** (1 / 3)
        m = (.2119034982 * r + .6806995451 * g + .1073969566 * b) ** (1 / 3)
        s_ = (.0883024619 * r + .2817188376 * g + .6299787005 * b) ** (1 / 3)
        return (.2104542553 * l + .7936177850 * m - .0040720468 * s_,
                1.9779984951 * l - 2.4285922050 * m + .4505937099 * s_,
                .0259040371 * l + .7827717662 * m - .8086757660 * s_)
    def mix(a, b, t): return tuple(x * (1 - t) + y * t for x, y in zip(a, b))
    def dE(a, b): return 100 * math.dist(a, b)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(6.6, 2.75),
                                   gridspec_kw={"width_ratios": [1, 1.12], "wspace": .34})

    # ---- left: glass opacity vs worst-case contrast
    alphas = [a / 100 for a in range(50, 101)]
    ax1.axhspan(0, 4.5, color="#A81E14", alpha=.07, lw=0)
    ax1.plot([a * 100 for a in alphas], [ratio(PD, over_white(a)) for a in alphas],
             color=INK, lw=1.3)
    for t, c, ls, lab in ((4.5, "#A81E14", "--", "4.5:1  WCAG AA"), (7.0, INK, ":", "7:1  the site's floor")):
        ax1.axhline(t, color=c, lw=.8, ls=ls)
        ax1.text(51, t + .18, lab, fontsize=6.3, color=c)
    r_glass = ratio(PD, over_white(glass))
    ax1.plot([glass * 100], [r_glass], "o", color=SANG, ms=4.5, zorder=5)
    ax1.annotate(f"{glass * 100:.0f}%: {r_glass:.2f}:1", xy=(glass * 100, r_glass),
                 xytext=(glass * 100 - 25, r_glass + 1.7), fontsize=6.8, color=SANG,
                 arrowprops=dict(arrowstyle="-", color=SANG, lw=.6))
    ax1.axvspan(60, 70, color=MUTED, alpha=.10, lw=0)
    ax1.text(65, 1.0, "usual\nglass", ha="center", fontsize=6.0, color=BODY, linespacing=1.1)
    ax1.set_xlim(50, 100); ax1.set_ylim(0, 11.5)
    ax1.set_xlabel("bar opacity, %", fontsize=7)
    ax1.set_ylabel("nav text over white", fontsize=7)
    ax1.set_title("How glassy the bar may be", fontsize=7.8, loc="left", color=INK)

    # ---- right: lightness down a boundary, 0 = section above, 1 = section below
    xs = [i / 200 for i in range(201)]
    # before: the old warm band faded warm -> violet, then the Works ground
    # snapped back to warm; the plotted seam is where the band ended.
    before = [dE(oklab(WARM), mix(oklab(WARM), oklab(VIOLET), x)) for x in xs] + [0.0]
    xb = xs + [1.0]
    # after: the stops exactly as base.css declares them, read out of the rule
    edge = (ROOT / "src/styles/base.css").read_text()
    weights = {n: (float(k), 1 - float(f) / 100) for n, k, f in re.findall(
        r"--edge-(\d):\s*color-mix\(in oklab,var\(--field\) calc\(var\(--edge-breath\) \* ([\d.]+)\),"
        r"color-mix\(in oklab,var\(--edge-from\) (\d+)%", edge)}
    weights["mid"] = (1.0, .5)
    grad = re.search(r"\.edge\{.*?background:linear-gradient\(in oklab,(.*?)\);", edge, re.S).group(1)
    F = oklab(FIELD)
    stops = []
    for name, pct in re.findall(r"var\(--edge-([a-z0-9]+)\)\s+(\d+)%", grad):
        x = int(pct) / 100
        k = 0.0 if name in ("from", "to") else weights[name][0]
        stops.append((x, mix(oklab(WARM), F, breath * k)))   # a warm -> warm band
    if len(stops) != 9:
        raise SystemExit(f"  expected nine boundary stops in base.css, read {len(stops)}")
    def at(x):
        for (x0, c0), (x1, c1) in zip(stops, stops[1:]):
            if x0 <= x <= x1: return mix(c0, c1, (x - x0) / (x1 - x0))
    after = [dE(oklab(WARM), at(x)) for x in xs]

    ax2.axhspan(0, 2, color=MUTED, alpha=.10, lw=0)
    ax2.text(.02, 1.15, "under ~2: not seen", fontsize=6.0, color=BODY)
    ax2.plot(xb, before, color="#A81E14", lw=1.1, label="before")
    ax2.plot([1, 1], [before[-2], 0], color="#A81E14", lw=2.2, solid_capstyle="butt")
    ax2.annotate("hard seam", xy=(1, before[-2] / 2), xytext=(.63, 3.2), fontsize=6.4,
                 color="#A81E14", arrowprops=dict(arrowstyle="-", color="#A81E14", lw=.6))
    ax2.plot(xs, after, color=FIELD, lw=2.0, label=f"after: the field at {breath * 100:.0f}%")
    peak = max(after)
    ax2.text(.57, peak - .1, f"dE {peak:.1f}", ha="left", fontsize=6.6, color=T["field-deep"])
    ax2.set_xlim(0, 1.04); ax2.set_ylim(0, 7.8)
    ax2.set_xticks([0, .5, 1]); ax2.set_xticklabels(["section above", "band", "section below"])
    ax2.set_ylabel("dE from the ground (OKLab)", fontsize=7)
    ax2.set_title("A section boundary, top to bottom", fontsize=7.8, loc="left", color=INK)
    ax2.legend(fontsize=6.2, frameon=False, loc="upper left", bbox_to_anchor=(0, 1.0))

    for ax in (ax1, ax2):
        for sp in ("top", "right"): ax.spines[sp].set_visible(False)
        ax.tick_params(labelsize=6.4)
    save(fig, "softness")


# ------------------------------------------------- 9. the site's structure
def structure():
    """The site map before and after the restructure. Drawn from site.json so the
    'after' tree is the navigation and series the build actually generates."""
    import json
    site = json.loads((ROOT / "src/data/site.json").read_text(encoding="utf-8"))
    series = [x["title"]["en"] for x in site["series"]["items"]]
    nav = [n["label"]["en"] for n in site["nav"]]

    fig, (L, R) = plt.subplots(1, 2, figsize=(6.6, 3.9), gridspec_kw={"width_ratios": [1, 1.25], "wspace": .08})
    for ax in (L, R):
        ax.set_xlim(0, 10); ax.set_ylim(0, 10); ax.axis("off")

    def node(ax, x, y, text, w=2.5, fc=PAPER, ec=MUTED, tc=INK, fs=5.0, dash=False, bold=False):
        ax.add_patch(FancyBboxPatch((x - w / 2, y - .32), w, .64, boxstyle="round,pad=0.02,rounding_size=0.06",
                     facecolor=fc, edgecolor=ec, linewidth=.7, linestyle="--" if dash else "-", zorder=3))
        ax.text(x, y, text, ha="center", va="center", fontsize=fs, color=tc, zorder=4, weight="bold" if bold else "normal")
    def edge(ax, x1, y1, x2, y2, c=MUTED, ls="-"):
        ax.plot([x1, x1, x2, x2], [y1 - .32, (y1 + y2) / 2, (y1 + y2) / 2, y2 + .32], color=c, lw=.6, ls=ls, zorder=1)

    # ---- before
    L.text(0, 9.6, "Before", fontsize=8, weight="bold", color=INK)
    node(L, 5, 8.6, "Home — every work, full size", w=7.4, bold=True)
    for i, (lab, ls) in enumerate([("#works", "--"), ("#tribute", "--"), ("About", "-"), ("How to Buy", "-")]):
        x = 1.3 + i * 2.47
        node(L, x, 6.9, lab, w=2.35, dash=ls == "--", fc="#FBEAE8" if ls == "--" else PAPER, ec="#A81E14" if ls == "--" else MUTED)
        edge(L, 5, 8.6, x, 6.9, c="#A81E14" if ls == "--" else MUTED, ls=ls)
    L.text(5, 5.95, "two menu items were jumps down the homepage", ha="center", fontsize=5.2, color="#A81E14", style="italic")
    node(L, 2.3, 4.6, "6 work pages", w=3.2); edge(L, 1.3, 6.9, 2.3, 4.6)
    node(L, 7.0, 4.6, "Archive (footer only)", w=4.6, dash=True)
    L.text(5, 3.5, "No page lists the works.\nNo room for a series\nor a genre to grow into.", ha="center", va="top", fontsize=5.4, color=BODY, linespacing=1.4)

    # ---- after
    R.text(0, 9.6, "After", fontsize=8, weight="bold", color=INK)
    node(R, 5, 8.6, "Home — hero, latest four, series, about, buying", w=9.4, bold=True)
    xs = [1.35, 3.8, 6.25, 8.7]
    for x, lab in zip(xs, nav):
        node(R, x, 6.9, lab, w=2.3, fc=T["paper-deep"])
        edge(R, 5, 8.6, x, 6.9)
    subs = ["All"] + series + ["Sold works"]
    for i, lab in enumerate(subs):
        y = 5.35 - i * .95
        node(R, 2.4, y, lab, w=2.9, fc=PAPER, ec=SANG if lab in series else MUTED)
        R.plot([.6, .6, 2.4 - 1.45], [6.58, y, y], color=MUTED, lw=.6, zorder=1)
    R.text(4.1, 4.4, "a series is one entry in site.json:\nits page, tab and homepage card\nare generated", fontsize=5.2, color=SANG, va="center", linespacing=1.35)
    wy = 5.35 - len(subs) * .95 - .25
    node(R, 2.4, wy, "work pages — URLs unchanged", w=4.3, fc=PAPER)
    R.plot([.6, .6, 2.4 - 2.15], [5.35 - (len(subs) - 1) * .95, wy, wy], color=MUTED, lw=.6, zorder=1)
    R.text(4.9, 1.45, "search · account · cart → placeholder 404", fontsize=5.2, color=BODY, style="italic")
    R.text(4.9, .9, "/archive/ → /works/sold/ (301 and stub)", fontsize=5.2, color=BODY, style="italic")
    save(fig, "structure")


def _cream_ramp():
    from matplotlib.colors import LinearSegmentedColormap
    return LinearSegmentedColormap.from_list("cream", [BAR, PAPER])


if __name__ == "__main__":
    print("figures:")
    palette(); sage_limit(); payments(); oversell(); duty(); shipping()
    mark_assets(); mark_construction(); mark_sizes(); softness(); structure()
