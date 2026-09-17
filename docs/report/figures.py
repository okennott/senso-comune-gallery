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
# The logo figure has to SET the candidates, not describe them, so it needs the
# same static cuts the document is set in. fonts.py has already built them by
# the time this runs; a missing file is a build-order bug, not a soft failure.
FONTS = ROOT / "docs/report/fonts"
FRAUNCES = FontProperties(fname=str(FONTS / "Fraunces-Display-SemiBold.ttf"))
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


# ------------------------------------------------------- 7. the logo options
def logo():
    """The six candidates, each drawn twice: once at a size where anyone would
    approve it, and once at 16 px, which is where it will actually spend its
    life. Four of the six die in the second column."""
    from scale_mark import MARK, GEOM   # the site's own geometry, imported

    BAR_ = BAR
    def tile(ax, x, y, s, kind, small=False):
        """Draw candidate `kind` in a square of side `s` at (x, y)."""
        ax.add_patch(Rectangle((x, y), s, s, facecolor=BAR_, edgecolor=MUTED,
                               linewidth=.4, zorder=2))
        k = s / 64.0                       # the marks are drawn in 64-unit space

        if kind == "wordmark":
            ax.text(x + s / 2, y + s / 2, "Senso\nComune\nGallery",
                    fontproperties=FRAUNCES, color=PAPER, fontsize=s * 9.5,
                    ha="center", va="center", linespacing=1.15, zorder=3)

        elif kind == "sc":
            ax.text(x + s / 2, y + s / 2, "SC", fontproperties=FRAUNCES,
                    color=PAPER, fontsize=s * 30, ha="center", va="center", zorder=3)

        elif kind == "pair":
            ax.plot([x + s / 2, x + s / 2], [y, y + s], color=MUTED, lw=.4, zorder=3)
            ax.text(x + s / 4, y + s / 2, "SC", fontproperties=FRAUNCES,
                    color=PAPER, fontsize=s * 15, ha="center", va="center", zorder=3)
            ax.text(x + 3 * s / 4, y + s / 2, "\u5e38",
                    fontproperties=cjk_or_die("\u5e38"),
                    color=PAPER, fontsize=s * 17, ha="center", va="center", zorder=3)

        elif kind == "hatch":
            # Leonardo ran upper-left to lower-right; the measured angle is 43.8 deg.
            box = Rectangle((x, y), s, s, transform=ax.transData)
            for t in np.arange(-1.2, 1.4, 0.22):
                x0, y0 = x + t * s, y + s
                line, = ax.plot([x0, x0 + s * 1.2],
                                [y0, y0 - s * 1.2 * np.tan(np.radians(43.8))],
                                color=PAPER, lw=s * 1.1, zorder=3)
                line.set_clip_path(box)

        elif kind == "sfumato":
            g = np.linspace(-1, 1, 160)
            gx, gy = np.meshgrid(g, g)
            d = np.clip(1 - np.sqrt(gx ** 2 + gy ** 2) * 1.25, 0, 1) ** 1.5
            ax.imshow(d, extent=(x, x + s, y, y + s), cmap=_cream_ramp(),
                      vmin=0, vmax=1, zorder=3, interpolation="bilinear", aspect="auto")

        elif kind == "plate":
            ax.plot([x, x + s], [y + s - GEOM["cy"] * k] * 2,
                    color=FIELD, lw=MARK["datumWidth"] * k * 2.2, zorder=3,
                    solid_capstyle="butt")
            ax.add_patch(Rectangle((x + GEOM["x"] * k, y + s - (GEOM["y"] + GEOM["plateH"]) * k),
                                   MARK["plateW"] * k, GEOM["plateH"] * k,
                                   facecolor=PAPER, edgecolor="none", zorder=4))

    rows = [
        ("wordmark", "Wordmark alone", "Where the site started",
         "Nothing to put in a tab. Illegible below about 90 px, and there is no\n"
         "second lockup for a share card or a WeChat avatar."),
        ("sc", "SC monogram", "What shipped in September",
         "Reads at 16 px. But the wordmark translates, and the Chinese one is not\n"
         "spelled with Latin letters at all. It serves one of the two audiences."),
        ("pair", "One monogram per locale", "The obvious repair",
         "Two marks is two brands. The favicon is chosen by the origin, not by\n"
         "the page, so a bilingual site cannot swap it per locale anyway."),
        ("hatch", "Leonardo\u2019s hatching", "The debt, made literal",
         "Announces the reference the brief asked to be carried quietly, and at\n"
         "16 px it is four grey lines."),
        ("sfumato", "Sfumato disc", "The principle, made literal",
         "A soft edge cannot survive a 32 px ICO, a monochrome fax of an invoice\n"
         "or an embroidered label. It has no outline to fall back to."),
        ("plate", "A work on a wall", "Recommended",
         "Carries no letterforms, so one file serves both locales. Its proportions\n"
         "are the catalogue\u2019s own: a 3:4 portrait hung at 144.78 cm on a 244 cm wall."),
    ]

    BIG, SMALL, PITCH = 0.95, 0.30, 1.26
    TEXT_X = 2.05
    H = len(rows) * PITCH + 0.75

    fig, ax = plt.subplots(figsize=(6.6, 6.6 * H / 10))
    ax.set_xlim(0, 10); ax.set_ylim(0, H); ax.axis("off")
    ax.set_aspect("equal")

    ax.text(0, H - 0.20, "at display size", fontsize=6.0, color=BODY)
    ax.text(1.32 + SMALL / 2, H - 0.20, "16 px", fontsize=6.0, color=BODY, ha="center")

    for i, (kind, name, status, verdict) in enumerate(rows):
        top = H - 0.42 - i * PITCH
        y = top - BIG
        tile(ax, 0.0, y, BIG, kind)
        tile(ax, 1.32, y + (BIG - SMALL) / 2, SMALL, kind, small=True)

        chosen = status == "Recommended"
        if chosen:
            ax.plot([TEXT_X - 0.16, TEXT_X - 0.16], [y + .02, top - .02],
                    color=SANG, lw=2.0, solid_capstyle="butt")

        ax.text(TEXT_X, top - 0.14, name, fontsize=8.4, weight="bold",
                color=INK, va="center")
        ax.text(TEXT_X, top - 0.40, status.upper(), fontsize=6.2,
                color=SANG if chosen else MUTED, va="center")
        ax.text(TEXT_X, top - 0.72, verdict, fontsize=6.9, color=BODY,
                va="center", linespacing=1.5)

    save(fig, "logo")


# ----------------------------------------------------- 8. the softness limits
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


# ------------------------------------------------ 9. the planned work page
def pdp_wire():
    """Wireframe of the planned work page, desktop and phone. Proportions are
    schematic; the phone masthead widths are the measured ones from the report."""
    fig = plt.figure(figsize=(6.6, 4.9))
    D = fig.add_axes([0.0, 0.0, 0.66, 1.0]); P = fig.add_axes([0.70, 0.0, 0.30, 1.0])
    for ax, w, h in ((D, 100, 100), (P, 42, 100)):
        ax.set_xlim(0, w); ax.set_ylim(0, h); ax.axis("off"); ax.set_aspect("equal")

    def box(ax, x, y, w, h, fc, ec=None, lw=.5, z=2):
        ax.add_patch(Rectangle((x, y), w, h, facecolor=fc, edgecolor=ec or "none", linewidth=lw, zorder=z))
    def txt(ax, x, y, s, fs=5.2, c=None, **k):
        ax.text(x, y, s, fontsize=fs, color=c or INK, zorder=5, **k)
    def tag(ax, x, y, n):
        ax.add_patch(plt.Circle((x, y), 1.55, color=SANG, zorder=6))
        ax.text(x, y - .05, str(n), fontsize=4.6, color="white", ha="center", va="center", zorder=7, weight="bold")

    # ---------------- desktop
    box(D, 0, 0, 100, 100, FIELD)
    box(D, 0, 92, 100, 8, BAR)
    box(D, 4, 94.2, 3.6, 3.6, "none", FIELD, .5); box(D, 5.2, 94.9, 1.3, 1.8, PAPER)
    txt(D, 9, 95.2, "Senso Comune Gallery", 5.4, PAPER)
    txt(D, 33, 95.3, "ORIGINAL WORKS   TRIBUTE   ABOUT   HOW TO BUY    |", 3.6, T["paper-deep"])
    D.text(65.6, 95.3, "\u4e2d\u6587", fontsize=3.8, color=T["paper-deep"], zorder=5, fontproperties=cjk_or_die("\u4e2d"))
    txt(D, 70.5, 95.3, "Search", 3.6, T["muted-ui"], style="italic")
    txt(D, 78.8, 95.3, "\u2661 Saved", 3.6, PAPER)
    txt(D, 86.4, 95.3, "\u25a2 Selection (2)", 3.6, PAPER)
    tag(D, 98.4, 90.4, 1)
    box(D, 3, 3, 94, 86.5, PAPER)
    txt(D, 6, 86, "WORKS / ORIGINAL WORKS / HARBOUR LIGHT", 3.2, MUTED)
    # thumbnail rail
    for i, lab in enumerate(["Front", "Detail", "Edge", "Back", "In scale"]):
        y = 76 - i * 8.2
        box(D, 6, y, 6, 7, T["paper-deep"], MUTED if i == 0 else None, .6)
        box(D, 7.2, y + 1.1, 3.6, 4.8, BODY if i != 4 else PAPER, None)
        if i == 4:
            box(D, 7, y + 1.4, 4, .25, MUTED); box(D, 8.2, y + 3, 1.6, 2.2, BODY)
        txt(D, 9, y - 1.3, lab, 2.8, BODY, ha="center")
    tag(D, 1.5, 76, 2)
    # main view
    box(D, 15, 26, 40, 57, T["paper-deep"]); box(D, 18, 29, 34, 51, "#4A4E60")
    txt(D, 35, 23.3, "\u25c0  2 / 5  \u25b6     View full size", 3.4, BODY, ha="center")
    tag(D, 57.2, 81.5, 3)
    # buy box
    x = 60
    txt(D, x, 81.5, "Harbour Light, 2026", 6.2, INK)
    txt(D, x, 78.3, "Oil on canvas · 50 × 40 × 3.5 cm (19¾ × 15¾ in)", 3.5, BODY)
    txt(D, x, 75.8, "Unique work · Frame not included · Signed on the back", 3.5, BODY)
    txt(D, x, 70.4, "$180", 8.4, INK, weight="bold")
    box(D, x, 63.5, 33, 4.6, INK); txt(D, x + 16.5, 65.3, "ENQUIRE ABOUT THIS PIECE", 3.5, PAPER, ha="center")
    box(D, x, 57.8, 16, 4.2, "none", MUTED, .6); txt(D, x + 8, 59.4, "♡  SAVE", 3.4, INK, ha="center")
    box(D, x + 17, 57.8, 16, 4.2, "none", MUTED, .6); txt(D, x + 25, 59.4, "+  ADD TO SELECTION", 3.1, INK, ha="center")
    tag(D, 98.4, 66, 4)
    for i, s_ in enumerate(["✓ 14-day returns, worldwide", "✓ Packed flat/upright, insured to the price", "✓ Estimate import duty for your country →"]):
        txt(D, x, 53 - i * 2.9, s_, 3.4, BODY)
    tag(D, 98.4, 50, 5)
    for i, s_ in enumerate(["Details", "Shipping & packaging", "Duty & import", "Returns", "Contact"]):
        y = 42 - i * 4.4
        D.plot([x, x + 33], [y + 3.4, y + 3.4], color=T["rule-soft"], lw=.6, zorder=3)
        txt(D, x, y + .9, s_, 3.7, INK); txt(D, x + 32, y + .9, "+", 4.2, INK, ha="right")
    tag(D, 98.4, 40, 6)
    txt(D, x, 17.2, "PayPal · Alipay · WeChat Pay   (from the active entity)", 3.2, MUTED)
    txt(D, x, 14.3, "Share ↗   Copy link", 3.4, BODY)
    tag(D, 98.4, 16, 7)
    D.plot([6, 94], [10.5, 10.5], color=T["rule-soft"], lw=.6)
    txt(D, 6, 7.2, "The work, in the artist's words  ·  More works", 3.6, INK)
    for i in range(3):
        box(D, 58 + i * 12.5, 4.6, 10.5, 4.6, T["paper-deep"])
    tag(D, 98.4, 7, 8)

    # ---------------- phone (390 px)
    box(P, 0, 0, 42, 100, FIELD)
    box(P, 0, 87.6, 42, 12.4, BAR)
    box(P, 2.2, 95.4, 2.9, 2.9, "none", FIELD, .5); box(P, 3.1, 95.9, 1.1, 1.5, PAPER)
    txt(P, 6.2, 96.1, "Senso Comune", 4.4, PAPER)
    txt(P, 29.5, 96.2, "\u2661    \u25a2 2", 4.6, PAPER)
    txt(P, 2.2, 90.3, "WORKS  TRIBUTE  ABOUT  BUY", 3.0, T["paper-deep"])
    P.text(22.6, 90.3, "\u4e2d\u6587", fontsize=3.2, color=T["paper-deep"], zorder=5, fontproperties=cjk_or_die("\u4e2d"))
    tag(P, 40.5, 86.5, 1)
    box(P, 1.5, 1, 39, 85.2, PAPER)
    box(P, 7.5, 47.5, 27, 36.5, T["paper-deep"]); box(P, 9.5, 49.5, 23, 32.5, "#4A4E60")
    txt(P, 21, 45.3, "swipe · 1 / 5", 3.2, BODY, ha="center")
    for i in range(5):
        box(P, 3 + i * 7.6, 37.2, 6.6 if i < 4 else 4.2, 6.6, T["paper-deep"], MUTED if i == 0 else None, .6)
    txt(P, 39.5, 34.5, "more →", 2.8, MUTED, ha="right")
    tag(P, 40.5, 40.5, 2)
    txt(P, 3, 30.2, "Harbour Light, 2026", 5.2, INK)
    txt(P, 3, 27.4, "Oil on canvas · 50 × 40 cm", 3.2, BODY)
    txt(P, 3, 22.4, "$180", 7, INK, weight="bold")
    box(P, 3, 15.8, 36, 4.2, INK); txt(P, 21, 17.4, "ENQUIRE ABOUT THIS PIECE", 3.2, PAPER, ha="center")
    box(P, 3, 10.6, 17.5, 3.9, "none", MUTED, .6); txt(P, 11.7, 12.1, "♡ SAVE", 3.1, INK, ha="center")
    box(P, 21.5, 10.6, 17.5, 3.9, "none", MUTED, .6); txt(P, 30.2, 12.1, "+ SELECTION", 3.1, INK, ha="center")
    txt(P, 3, 6.4, "Details  +", 3.4, INK); txt(P, 3, 3.3, "Shipping & packaging  +", 3.4, INK)
    txt(P, 21, -3.6, "390 px", 5, BODY, ha="center")
    txt(D, 50, -3.6, "1440 px", 5, BODY, ha="center")
    save(fig, "pdp-wire")


# ------------------------------------------------ 10. the site's structure
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
    palette(); sage_limit(); payments(); oversell(); duty(); shipping(); logo(); softness(); pdp_wire(); structure()
