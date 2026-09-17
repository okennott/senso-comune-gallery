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

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

BASE = "https://raw.githubusercontent.com/google/fonts/main/"
SRC = {
    "fraunces":        "ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
    "fraunces-italic": "ofl/fraunces/Fraunces-Italic%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
    "inter":           "ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf",
    "inter-italic":    "ofl/inter/Inter-Italic%5Bopsz%2Cwght%5D.ttf",
}

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


def main() -> int:
    missing = [c for c in CUTS if not (OUT / c[0]).exists()]
    if not missing:
        print("  report fonts already built")
        return 0

    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        fetched = {}

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
