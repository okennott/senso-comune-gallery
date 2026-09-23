#!/usr/bin/env bash
# Build the technical report to PDF — both editions.
#
#   ./docs/report/build.sh            senso-comune-report.pdf
#                                     senso-comune-report.zh.pdf
#   BLEED=1 ./docs/report/build.sh    …and a press file for each
#
# Quarto's direct PDF path pipes the TeX through stdin, so the .idx file it
# generates is thrown away and the index never gets built. This runs the passes
# explicitly instead:
#
#   1. quarto  -> .tex
#   2. tectonic pass 1  -> .aux, .toc, .lof, .lot, .idx
#   3. makeindex        -> .ind
#   4. tectonic pass 2  -> resolves cross-references and sets the index
#
# Everything the document shows is regenerated first, so that none of it can be
# quietly out of date: the Chinese edition because it is composed from the
# translation memory and must not lag the English source; the fonts because
# XeTeX cannot drive the variable axes the site uses and needs static instances,
# and because the Chinese subset is taken from the composed document; the
# screenshots because the section that shows them claims to show what the build
# produces; the figures so the palette and the contrast figures are read from
# the project's own token file rather than transcribed, and the mark is asked of
# scripts/mark.mjs and included as the vector it produces rather than redrawn.
#
# THE TWO EDITIONS ARE THE SAME BUILD. The Chinese one is not a variant, a
# branch or a later step: it goes through the same four passes, in the same
# loop, and a failure in it fails this script. The only thing that is special
# about it is that its prose comes from docs/report/translations/ instead of
# from the .qmd, and that is done before the loop starts.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DOCS=(senso-comune-report senso-comune-report.zh)

cd "$HERE"

# The order of the four steps below is not arbitrary:
#
#   shots    first, because the Chinese edition points at a Chinese capture
#            wherever one exists, and it can only see the ones on disk when it
#            is composed. Composing first cost a build's lag — the Chinese
#            edition shipped the English screenshots once.
#   compose  next, because the Chinese font subset is taken from the composed
#            document.
#   fonts    next, for the same reason.
#   figures  last; it depends on neither and is the slowest.

echo "==> screenshots"
if [ -d "$ROOT/dist" ]; then
  ./shots.sh
else
  echo "  no dist/; keeping the captures already in fig/"
fi

# --- compose the Chinese edition ------------------------------------------
# Reads the reviewed translation memory and writes senso-comune-report.zh.qmd,
# report-zh-strings.tex and translations/STATUS.md. It never translates and
# never reaches the network: a passage with no Chinese yet falls back to the
# English and is marked.
echo "==> compose the Chinese edition"
node "$ROOT/scripts/translate.mjs" --emit

echo "==> fonts"
python3 fonts.py

echo "==> figures"
python3 figures.py

# --- the four passes, per edition -----------------------------------------
render() {                       # $1 = document basename
  local DOC="$1"
  quarto render "$DOC.qmd" --to latex >/dev/null
  tectonic -X compile --keep-intermediates --outfmt pdf "$DOC.tex" >/dev/null 2>&1 || true

  if [ -f "$DOC.idx" ]; then
    makeindex -q "$DOC.idx"
  else
    echo "  no .idx produced for $DOC; index will be empty"
  fi

  tectonic -X compile --keep-intermediates --outfmt pdf "$DOC.tex" 2>&1 \
    | grep -viE "^note: downloading" | grep -iE "^error" && return 1 || true

  # keep the source tree clean; the PDF and the sources are what matter
  rm -f "$DOC".{aux,log,toc,lof,lot,out,idx,ilg,ind,tex}
}

summary() {                      # $1 = pdf, $2 = optional trailing note
  printf '%s  —  %s pages, %s, %s%s\n' \
    "$1" \
    "$(pdfinfo "$1" | awk '/^Pages/{print $2}')" \
    "$(du -h "$1" | cut -f1)" \
    "$(pdfinfo "$1" | awk -F'[()]' '/^Page size/{print $2}')" \
    "${2:-}"
}

printf '\n'
for DOC in "${DOCS[@]}"; do
  echo "==> $DOC"
  render "$DOC"
  summary "$DOC.pdf"
done

# --- the press files --------------------------------------------------------
# BLEED=1 builds a SECOND pdf per edition for the printer: the same document on
# 230x317mm paper with the A4 trim centred in it, the edge artwork carried 3mm
# past where the knife falls, and crop marks showing where that is. The reading
# PDFs stay exactly A4, because that is what they are for.
#
# The switch is a sentinel file rather than an environment variable because
# tectonic gives no way to pass a macro in, and preamble.tex reads it with
# \IfFileExists. It is removed again whatever happens.
if [ "${BLEED:-}" = "1" ]; then
  printf '\n'
  trap 'rm -f "$HERE/bleed.on"' EXIT
  : > "$HERE/bleed.on"
  for DOC in "${DOCS[@]}"; do
    echo "==> press file: $DOC"
    render "$DOC"
    mv "$DOC.pdf" "$DOC-print.pdf"
    summary "$DOC-print.pdf" "  (trim 210x297mm, 3mm bleed, crop marks)"
  done
  rm -f "$HERE/bleed.on"

  # …and put the reading PDFs back, because the press files overwrote them.
  printf '\n'
  for DOC in "${DOCS[@]}"; do
    echo "==> reading file, restored: $DOC"
    render "$DOC"
    summary "$DOC.pdf"
  done
fi
