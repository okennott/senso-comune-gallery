#!/usr/bin/env bash
# Build self-hosted, subset webfonts for Senso Comune Gallery.
#
# Why self-host: fonts.googleapis.com is not blocked in mainland China, but it
# measures ~50% *disrupted* on plaintext and resolves to different IPs on
# different Chinese ISPs. For a render-blocking resource that is worse than a
# clean block, because it cannot be debugged from outside China. Self-hosting
# removes the failure mode and is faster everywhere (no second origin).
#
# Axis choices are derived from the original design, not guessed:
#   - index.pdf sets Fraunces opsz at 16.0, 16.8, 21.6, 27.2, 30.4 and 38.4,
#     so the opsz axis is KEPT and narrowed to 14-40. Pinning it would flatten
#     the optical sizing the design depends on.
#   - Fraunces WONK defaults to 1 (not 0). Pinning it to 0 silently changes the
#     letterforms. We pin WONK=1 to match the draft.
#   - Weights used are 400 and 500; we keep 400-700 for headroom.
#
# Measured output: fraunces 50.7 KB + inter 29.1 KB = 79.8 KB total.
#
# Requires: pip install "fonttools[woff]" brotli zopfli
set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/public/fonts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

# Google's own `latin` unicode-range.
LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,\
U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,\
U+2215,U+FEFF,U+FFFD"

FEATURES='kern,liga,clig,calt,ccmp,mark,mkmk,locl'

echo "==> Fetching variable originals (SIL OFL 1.1) from google/fonts"
curl -sL -o "$TMP/Fraunces.ttf" \
  'https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf'
curl -sL -o "$TMP/Inter.ttf" \
  'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf'
curl -sL -o "$OUT/OFL-Fraunces.txt" \
  'https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt'
curl -sL -o "$OUT/OFL-Inter.txt" \
  'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt'

echo "==> Instancing axes"
# Keep opsz live (14-40) and wght (400-700); pin SOFT=0, WONK=1 (the defaults).
fonttools varLib.instancer -q -o "$TMP/fr.ttf" "$TMP/Fraunces.ttf" \
  SOFT=0 WONK=1 opsz=14:40 wght=400:700
# Inter's opsz is not used by the design; pin it at text size.
fonttools varLib.instancer -q -o "$TMP/in.ttf" "$TMP/Inter.ttf" \
  opsz=18 wght=400:600

echo "==> Subsetting to latin + woff2"
# NOTE: Inter emits an OTLOffsetOverflowError warning during subsetting;
# fonttools auto-recovers and the output is valid. Do not panic at it.
pyftsubset "$TMP/fr.ttf" --output-file="$OUT/fraunces-latin.woff2" \
  --flavor=woff2 --with-zopfli --unicodes="$LATIN" \
  --layout-features="$FEATURES" --no-hinting --desubroutinize
pyftsubset "$TMP/in.ttf" --output-file="$OUT/inter-latin.woff2" \
  --flavor=woff2 --with-zopfli --unicodes="$LATIN" \
  --layout-features="$FEATURES" --no-hinting --desubroutinize

echo
for f in "$OUT/fraunces-latin.woff2" "$OUT/inter-latin.woff2"; do
  printf '%-28s %7d bytes  %5.1f KB\n' "$(basename "$f")" \
    "$(stat -c%s "$f")" "$(awk "BEGIN{print $(stat -c%s "$f")/1024}")"
done
