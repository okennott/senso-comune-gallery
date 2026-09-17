"""
The mark's geometry, read out of scripts/mark.mjs rather than retyped.

The report draws the logo it recommends; the site ships it. If the two were
allowed to carry their own copies of the numbers, the report would eventually
be arguing for a mark the site no longer has.
"""
import ast
import pathlib
import re

SRC = pathlib.Path(__file__).resolve().parents[2] / "scripts/mark.mjs"


def _mark():
    body = re.search(r"export const MARK = \{(.*?)\n\};", SRC.read_text(encoding="utf-8"),
                     re.S).group(1)
    out = {}
    for key, val in re.findall(r"^\s*(\w+):\s*([^,]+),", body, re.M):
        val = val.split("/*")[0].strip().strip("'\"")
        try:
            out[key] = ast.literal_eval(val) if not re.search(r"[/*+-]", val) \
                       else eval(val, {"__builtins__": {}})
        except Exception:
            out[key] = val
    return out


MARK = _mark()
_plateH = MARK["plateW"] / MARK["plateRatio"]
_cy = MARK["box"] * (1 - MARK["hang"])
GEOM = {
    "plateH": _plateH,
    "cy": _cy,
    "x": (MARK["box"] - MARK["plateW"]) / 2,
    "y": _cy - _plateH / 2,
}

def check_preamble() -> int:
    """preamble.tex redraws the mark in TikZ, because a footer wants a vector
    it can scale rather than an included file. That is a second copy of the
    geometry, so it is checked rather than trusted."""
    tex = (pathlib.Path(__file__).parent / "preamble.tex").read_text(encoding="utf-8")
    box = MARK["box"]
    # TikZ measures y upward; the SVG measures it down.
    want = {
        "datum":      f"{box - GEOM['cy']:.3f}",
        "plate left": f"({GEOM['x']:.0f},",
        "plate low":  f",{box - GEOM['y'] - GEOM['plateH']:.3f})",
        "plate high": f",{box - GEOM['y']:.3f})",
    }
    bad = [f"{k} ({v})" for k, v in want.items() if v not in tex]
    if bad:
        print("  preamble.tex has drifted from scripts/mark.mjs: " + ", ".join(bad))
        return 1
    print(f"  preamble.tex matches scripts/mark.mjs  "
          f"[datum {want['datum']}, plate {GEOM['x']:.0f}\u2013"
          f"{GEOM['x'] + MARK['plateW']:.0f}]")
    return 0


if __name__ == "__main__":
    import sys
    if "--check-preamble" in sys.argv:
        raise SystemExit(check_preamble())
    print(MARK)
    print(GEOM)
