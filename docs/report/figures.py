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
        ("Heading ink on sage",     ratio(INK, FIELD),      True),
        ("Body text on sage",       ratio("#66594B", FIELD), False),
        ("Terracotta on sage",      ratio("#98564B", FIELD), False),
        ("The draft's failed grey", 2.67,                    False),
        ("Body text on cream",      ratio(BODY, PAPER),      True),
        ("Heading ink on cream",    ratio(INK, PAPER),       True),
    ]
    fig, ax = plt.subplots(figsize=(6.6, 2.5))
    names = [c[0] for c in cases][::-1]
    vals = [c[1] for c in cases][::-1]
    oks = [c[2] for c in cases][::-1]
    bars = ax.barh(names, vals, height=.6,
                   color=[SANG if ok else "#A81E14" for ok in oks])
    ax.axvline(4.5, color=INK, lw=1.1, ls="--")
    ax.text(4.62, -0.72, "4.5:1  AA body text", fontsize=7, color=INK)
    ax.axvline(3.0, color=MUTED, lw=.9, ls=":")
    ax.text(3.1, -0.72, "3:1", fontsize=7, color=BODY)
    for b, v in zip(bars, vals):
        ax.text(v + .12, b.get_y() + b.get_height() / 2, f"{v:.2f}",
                va="center", fontsize=7.6, family="DejaVu Sans Mono")
    ax.set_xlim(0, 13); ax.set_xlabel("contrast ratio")
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.tick_params(axis="y", length=0)
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

    arrow(3.9, 2.1, 2.3, 1.5)
    box(0.15, 0.5, 4.1, .95,
        "LAUNCH  ·  individual\nNo registration under CNY 100k/yr\nPayPal + Alipay + WeChat, no cards",
        fc="#E4F2EA", ec="#14653F", bold=False)

    arrow(6.1, 2.1, 7.7, 1.5)
    box(5.75, 0.5, 4.1, .95,
        "GROW  ·  HK sole proprietorship\nBusiness Registration certificate only\nCards + Alipay + WeChat, one checkout",
        fc="#E8EEFA", ec="#1B4DB1")

    ax.text(5, 0.12, "one string in seller.json switches between them",
            ha="center", fontsize=6.8, color=BODY, style="italic")
    save(fig, "payments")


# --------------------------------------------- 4. oversell defence layers
def oversell():
    fig, ax = plt.subplots(figsize=(6.6, 2.9))
    ax.set_xlim(0, 10); ax.set_ylim(0, 5); ax.axis("off")

    layers = [
        ("Platform limit", "deactivates on completion,\nnot on session start", "#FBF2DF", "#8A5600"),
        ("CMS flag + rebuild", "can fail silently;\nnobody is watching", "#FBF2DF", "#8A5600"),
        ("CDN edge", "serves 'available' for\nminutes after", "#FBEAE8", "#A81E14"),
        ("Client-side check", "survives stale cache,\nfailed build, bfcache", "#E4F2EA", "#14653F"),
    ]
    for i, (name, note, fc, ec) in enumerate(layers):
        y = 4.1 - i * 1.05
        ax.add_patch(FancyBboxPatch((0.3, y), 4.2, .85,
                     boxstyle="round,pad=0.04,rounding_size=0.04",
                     facecolor=fc, edgecolor=ec, linewidth=.9))
        ax.text(2.4, y + .55, name, ha="center", fontsize=8, weight="bold")
        ax.text(2.4, y + .25, note, ha="center", fontsize=6.6, color=BODY,
                linespacing=1.3)
        ax.text(5.0, y + .42, "→", fontsize=11, color=MUTED, va="center")
        ax.text(5.5, y + .42, note.replace("\n", " "), fontsize=6.8,
                color=BODY, va="center")

    ax.text(0.3, 0.08,
            "No platform in this price range guarantees atomicity. The bottom layer is the cheapest\n"
            "and the only one that survives the other three failing.",
            fontsize=6.9, color=BODY, linespacing=1.5)
    save(fig, "oversell")


# ----------------------------------------------- 5. what a US buyer pays
def duty():
    fig, ax = plt.subplots(figsize=(6.6, 2.2))
    price = 300
    parts = [("Painting", price, SANG),
             ("Section 301 duty  7.5%", price * .075, "#A81E14"),
             ("CBP fees", 8, MUTED),
             ("Carrier brokerage", 12, T["field-deep"])]
    left = 0
    for name, val, c in parts:
        ax.barh([0], [val], left=left, color=c, height=.5,
                edgecolor="white", linewidth=.8)
        if val > 10:
            ax.text(left + val / 2, 0, f"${val:,.0f}", ha="center", va="center",
                    color="white", fontsize=7.6, weight="bold")
        left += val
    ax.set_xlim(0, left * 1.02); ax.set_ylim(-.9, .9); ax.axis("off")

    x = 0
    for i, (name, val, c) in enumerate(parts):
        ax.text(x, -.42, name, fontsize=6.9, color=BODY, ha="left")
        ax.text(x, -.62, f"${val:,.2f}", fontsize=6.9, family="DejaVu Sans Mono",
                color=INK, ha="left")
        x += val
    ax.text(left, .48, f"total to the buyer  ${left:,.2f}", ha="right",
            fontsize=8, weight="bold")
    ax.text(0, .72, "A $300 painting, China origin, delivered to the United States",
            fontsize=7.4, color=BODY)
    save(fig, "duty")


# ------------------------------------------------------ 6. shipping paths
def shipping():
    fig, ax = plt.subplots(figsize=(6.6, 2.4))
    ax.set_xlim(0, 10); ax.set_ylim(0, 4); ax.axis("off")

    ax.text(0.2, 3.6, "Works on paper", fontsize=8.4, weight="bold")
    ax.text(0.2, 3.25, "flat, never rolled — rolling cracks the sizing", fontsize=7, color=BODY)
    for i, s in enumerate(["acid-free board", "glassine over image",
                           "second board", "poly bag", "rigid flat mailer"]):
        x = 0.2 + i * 1.95
        ax.add_patch(Rectangle((x, 2.55), 1.75, .5, facecolor="#F3EBDD",
                               edgecolor=MUTED, linewidth=.6))
        ax.text(x + .875, 2.8, s, ha="center", va="center", fontsize=6.5)

    ax.text(0.2, 1.9, "Stretched canvas", fontsize=8.4, weight="bold")
    ax.text(0.2, 1.55, "upright, never flat — and never below freezing", fontsize=7, color=BODY)
    for i, s in enumerate(["glassine on paint", "foam corners",
                           "rigid board both faces", "bubble OUTSIDE boards",
                           "box, 2in clearance"]):
        x = 0.2 + i * 1.95
        ax.add_patch(Rectangle((x, .85), 1.75, .5, facecolor="#EDE4D3",
                               edgecolor=MUTED, linewidth=.6))
        ax.text(x + .875, 1.1, s, ha="center", va="center", fontsize=6.5)

    ax.text(0.2, .35, "Materials run $25–50 per shipment. Every carrier's artwork "
                      "declared-value cap sits above this inventory.",
            fontsize=6.9, color=BODY)
    save(fig, "shipping")


if __name__ == "__main__":
    print("figures:")
    palette(); sage_limit(); payments(); oversell(); duty(); shipping()
