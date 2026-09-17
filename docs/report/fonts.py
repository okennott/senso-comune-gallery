#!/usr/bin/env python3
"""
Build static instances of the gallery's typefaces for the printed report.

    python3 docs/report/fonts.py

The site uses Fraunces and Inter as variable fonts, driven by CSS. XeTeX does
not drive variable axes: handed the raw variable file it takes the default
instance, and Fraunces defaults to wght 900 / opsz 9 — a very heavy display
cut, unusable as body text. So each weight this document needs is instanced
out to a static file first.

Axis choices match the site:
  SOFT=0, WONK=1   the site's values. WONK defaults to 1, not 0; pinning it
                   to 0 would quietly change the letterforms.
  opsz             set per role, because that is the whole point of the axis.
                   The display cuts get a display optical size; the text cuts
                   get a text one.

Idempotent: skips anything already built.
"""
import pathlib
import subprocess
import sys
import tempfile
import urllib.request

from fontTools.ttLib import TTFont

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

BASE = "https://raw.githubusercontent.com/google/fonts/main/"
SRC = {
    "fraunces":        "ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
    "fraunces-italic": "ofl/fraunces/Fraunces-Italic%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
    "inter":           "ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf",
    "inter-italic":    "ofl/inter/Inter-Italic%5Bopsz%2Cwght%5D.ttf",
    "notoserifsc":     "ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf",
}

# The CJK cut. XeTeX drops a glyph the font does not have SILENTLY, which in a
# document that quotes SAMR Order 37 Art. 12 verbatim is a correctness problem,
# not a cosmetic one — the citation would render with the characters simply
# gone. The subset used to be built by hand and cjk-chars.txt was a record of
# what someone had built, with nothing checking it still matched the prose.
# It is now derived FROM the prose on every build.
CJK_FONT = "NotoSerifSC-report.otf"
CJK_CHARS = HERE / "cjk-chars.txt"
DOC = HERE / "senso-comune-report.qmd"
CJK_RANGES = ((0x3000, 0x303F), (0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xFF00, 0xFFEF))
# matplotlib measures the string "lp" against whatever face a text artist uses,
# to find that face's descent for vertical alignment. figures.py sets one
# Chinese character in this font, so without these two the logo figure warns
# about missing glyphs on every build — noise that would eventually mask the
# real missing-glyph warning this whole mechanism exists to raise.
# U+00B7 is there for a different reason: xeCJK classes the middle dot as CJK
# punctuation and, inside a verbatim environment, takes it from the CJK MONO
# face — which is this file. Without it, every dot separating the file names in
# the build-tree listings disappears silently.
# xeCJK routes nothing else here, so none of these are set in running text.
CJK_EXTRA = "lp\u00b7"

# (output name, source key, axis settings)
CUTS = [
    # Display: headings, the title page, pull quotes. Optical size 28 gives
    # the higher contrast and tighter spacing a heading wants.
    ("Fraunces-Display-Regular.ttf",     "fraunces",        "SOFT=0 WONK=1 opsz=28 wght=400"),
    ("Fraunces-Display-SemiBold.ttf",    "fraunces",        "SOFT=0 WONK=1 opsz=28 wght=600"),
    ("Fraunces-Display-Italic.ttf",      "fraunces-italic", "SOFT=0 WONK=1 opsz=28 wght=400"),
    # Text: running prose is Inter, but Fraunces at a text optical size is used
    # for the abstract and for quoted material.
    ("Fraunces-Text-Regular.ttf",        "fraunces",        "SOFT=0 WONK=1 opsz=11 wght=400"),
    ("Fraunces-Text-Italic.ttf",         "fraunces-italic", "SOFT=0 WONK=1 opsz=11 wght=400"),
    # Body.
    ("Inter-Regular.ttf",                "inter",           "opsz=18 wght=400"),
    ("Inter-Medium.ttf",                 "inter",           "opsz=18 wght=500"),
    ("Inter-SemiBold.ttf",               "inter",           "opsz=18 wght=600"),
    ("Inter-Italic.ttf",                 "inter-italic",    "opsz=18 wght=400"),
    ("Inter-SemiBoldItalic.ttf",         "inter-italic",    "opsz=18 wght=600"),
]


def cjk_in_document() -> str:
    """Every CJK codepoint the report actually sets, in codepoint order."""
    text = DOC.read_text(encoding="utf-8")
    found = {c for c in text
             if any(lo <= ord(c) <= hi for lo, hi in CJK_RANGES)}
    return "".join(sorted(found))


def cjk_missing() -> str:
    """Characters the document sets that the committed subset cannot draw.
    The test is the FONT, not cjk-chars.txt: that file is a build intermediate
    and is not in the repository, so keying off it would make a fresh clone
    refetch 25 MB of Noto over the network to rebuild a font it already has."""
    want = cjk_in_document() + CJK_EXTRA
    dst = OUT / CJK_FONT
    if not dst.exists():
        return want
    cmap = TTFont(dst).getBestCmap()
    return "".join(c for c in want if ord(c) not in cmap)


def build_cjk(tmp: pathlib.Path) -> bool:
    """Subset Noto Serif SC to exactly the characters the report sets. 11.6 MB
    of font for fifty is not a trade worth making, and neither is shipping a
    subset that no longer covers the text."""
    want = cjk_in_document() + CJK_EXTRA
    added = cjk_missing()
    dst = OUT / CJK_FONT
    src = tmp / "notoserifsc.ttf"
    print(f"  fetching notoserifsc")
    urllib.request.urlretrieve(BASE + SRC["notoserifsc"], src)

    # Instance to Regular FIRST. Noto Serif SC's variable default is wght 200,
    # so subsetting the raw file yields an ExtraLight that XeTeX will happily
    # set the statutory quotations in, two weights lighter than everything
    # around them, with no error anywhere.
    static = tmp / "notoserifsc-400.ttf"
    subprocess.run(
        [sys.executable, "-m", "fontTools.varLib.instancer",
         "-q", "-o", str(static), str(src), "wght=400"],
        check=True, stdout=subprocess.DEVNULL,
    )
    subprocess.run(
        [sys.executable, "-m", "fontTools.subset", str(static),
         f"--text={want}", "--flavor=", f"--output-file={dst}",
         "--layout-features=", "--no-hinting", "--desubroutinize"],
        check=True, stdout=subprocess.DEVNULL,
    )
    # instancer leaves the variable default's family name behind, so the file
    # still calls itself ExtraLight. XeTeX picks this font by path and does not
    # care, but matplotlib and every font dialog do.
    font = TTFont(dst)
    for rec in font["name"].names:
        if rec.nameID in (1, 16) and "ExtraLight" in str(rec):
            rec.string = "Noto Serif SC"
        elif rec.nameID == 17:
            rec.string = "Regular"
    font.save(dst)

    weight = font["OS/2"].usWeightClass
    if weight != 400:
        raise SystemExit(f"  CJK subset came out at wght {weight}, not 400")
    CJK_CHARS.write_text(want + "\n", encoding="utf-8")
    print(f"  {CJK_FONT:32s} {dst.stat().st_size:8,} bytes   "
          f"[{len(want)} characters]" + (f"  +{added}" if added else ""))
    return True


def main() -> int:
    missing = [c for c in CUTS if not (OUT / c[0]).exists()]
    cjk_stale = bool(cjk_missing())

    if not missing and not cjk_stale:
        print("  report fonts already built")
        return 0

    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        fetched = {}

        if cjk_stale:
            build_cjk(tmp)

        for name, key, axes in missing:
            if key not in fetched:
                src = tmp / f"{key}.ttf"
                print(f"  fetching {key}")
                urllib.request.urlretrieve(BASE + SRC[key], src)
                fetched[key] = src

            dst = OUT / name
            subprocess.run(
                [sys.executable, "-m", "fontTools.varLib.instancer",
                 "-q", "-o", str(dst), str(fetched[key]), *axes.split()],
                check=True, stdout=subprocess.DEVNULL,
            )
            print(f"  {name:32s} {dst.stat().st_size:8,} bytes   [{axes}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
