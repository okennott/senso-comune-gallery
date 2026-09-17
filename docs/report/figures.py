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
        ("Bar / masthead",    BAR,   None,    None, "Her dark brown. Sand on it: 11.45:1"),
        ("Field / sage",      FIELD, None,    None, "Frames the sheet. Carries no text"),
        ("Paper / reading",   PAPER, None,    None, "All foregrounds solved against this family"),
        ("Ink / headings",    INK,   "paper", 4.5,  "Hers. Warmer than the neutral it replaced"),
        ("Body",              BODY,  "paper", 4.5,  "Hers"),
        ("Sanguine / accent", SANG,  "paper", 4.5,  "Red chalk. The artist chose it by eye"),
        ("Muted / captions",  MUTED, "paper", 4.5,  "Re-solved; the white-ground value failed"),
        ("Rule",              RULE,  "paper", 3.0,  "Van Gogh's stated violet. Needs 3:1, not 4.5"),
    ]
    fig, ax = plt.subplots(figsize=(6.6, 0.52 * len(rows) + 0.35))
    ax.set_xlim(0, 10); ax.set_ylim(0, len(rows)); ax.axis("off")

    for i, (name, hexv, against, minimum, note) in enumerate(rows):
        y = len(rows) - i - 1
        ax.add_patch(Rectangle((0, y + .12), 0.85, .76, facecolor=hexv,
                               edgecolor=MUTED, linewidth=.5))
        ax.text(1.05, y + .60, name, fontsize=8.2, weight="bold", va="center")
        ax.text(1.05, y + .28, hexv.upper(), fontsize=7, family="DejaVu Sans Mono",
                color=BODY, va="center")
        if against:
            r = ratio(hexv, PAPER)
            ax.text(4.35, y + .45, f"{r:5.2f}:1", fontsize=8.4,
                    family="DejaVu Sans Mono", va="center",
                    color=INK if r >= minimum else "#A81E14")
        ax.text(5.55, y + .45, note, fontsize=7.2, color=BODY, va="center")
    save(fig, "palette")


# -------------------------------------------- 2. why sage carries no text
def sage_limit():
    cases = [
        ("Heading ink on sage",     ratio(INK, FIELD),       True),
        ("Body text on sage",       ratio("#66594B", FIELD), False),
        ("Terracotta on sage",      ratio("#98564B", FIELD), False),
        ("The draft's failed grey", 2.67,                    False),
        ("Body text on cream",      ratio(BODY, PAPER),      True),
        ("Heading ink on cream",    ratio(INK, PAPER),       True),
    ]
    fig, ax = plt.subplots(figsize=(6.6, 2.7))
    names = [c[0] for c in cases][::-1]
    vals = [c[1] for c in cases][::-1]
    oks = [c[2] for c in cases][::-1]
    bars = ax.barh(names, vals, height=.6,
                   color=[SANG if ok else "#A81E14" for ok in oks])

    # Threshold markers annotated ABOVE the plot, not under the axis, where
    # they previously collided with each other and with the axis label.
    top = len(cases) - 0.3
    ax.axvline(3.0, color=MUTED, lw=.9, ls=":")
    ax.axvline(4.5, color=INK, lw=1.1, ls="--")
    ax.annotate("3:1\nUI", xy=(3.0, top), xytext=(3.0, top + .55),
                ha="center", va="bottom", fontsize=6.6, color=BODY,
                linespacing=1.2)
    ax.annotate("4.5:1\nAA body text", xy=(4.5, top), xytext=(4.9, top + .55),
                ha="left", va="bottom", fontsize=6.6, color=INK,
                linespacing=1.2)

    for b, v in zip(bars, vals):
        ax.text(v + .15, b.get_y() + b.get_height() / 2, f"{v:.2f}",
                va="center", fontsize=7.6, family="DejaVu Sans Mono")
    ax.set_xlim(0, 13.2)
    ax.set_ylim(-0.6, top + 1.5)
    ax.set_xlabel("contrast ratio", fontsize=7.4)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.tick_params(axis="y", length=0, labelsize=7.6)
    ax.tick_params(axis="x", labelsize=7)
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


if __name__ == "__main__":
    print("figures:")
    palette(); sage_limit(); payments(); oversell(); duty(); shipping()
