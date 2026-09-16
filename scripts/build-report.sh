#!/usr/bin/env bash
# Inline the report's webfonts as base64 so docs/build-report.html is fully
# self-contained: no external requests, works offline, works from mainland China.
# Source: docs/source/build-report.src.html (contains a /*@FONTS@*/ placeholder).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 - "$ROOT" <<'PY'
import base64, pathlib, sys
root = pathlib.Path(sys.argv[1])
faces = [
    ("Archivo",        "Archivo-latin.woff2",           "normal", "400 700"),
    ("Source Serif 4", "SourceSerif4-latin-norm.woff2", "normal", "400 600"),
    ("Source Serif 4", "SourceSerif4-latin-ital.woff2", "italic", "400"),
    ("JetBrains Mono", "JetBrainsMono-latin.woff2",     "normal", "400 500"),
]
css = []
for fam, name, style, wght in faces:
    b = (root / "docs" / "fonts" / name).read_bytes()
    css.append(
        f"@font-face{{font-family:'{fam}';font-style:{style};font-weight:{wght};"
        f"font-display:swap;src:url(data:font/woff2;base64,{base64.b64encode(b).decode()}) format('woff2');}}"
    )
src = (root / "docs" / "source" / "build-report.src.html").read_text()
assert "/*@FONTS@*/" in src, "placeholder missing"
out = root / "docs" / "build-report.html"
out.write_text(src.replace("/*@FONTS@*/", "\n".join(css)))
print(f"wrote {out.relative_to(root)} — {out.stat().st_size:,} bytes, 0 external requests")
PY
