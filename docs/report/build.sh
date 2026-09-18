#!/usr/bin/env bash
# Build the technical report to PDF.
#
#   ./docs/report/build.sh
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
# quietly out of date: the fonts because XeTeX cannot drive the variable axes
# the site uses and needs static instances; the screenshots because the section
# that shows them claims to show what the build produces; the figures so the
# palette and the contrast figures are read from the project's own token file
# rather than transcribed, and the mark is asked of scripts/mark.mjs and
# included as the vector it produces rather than redrawn.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DOC=senso-comune-report

cd "$HERE"

echo "==> fonts"
python3 fonts.py

echo "==> screenshots"
if [ -d "$ROOT/dist" ]; then
  ./shots.sh
else
  echo "  no dist/; keeping the captures already in fig/"
fi

echo "==> figures"
python3 figures.py

echo "==> quarto -> tex"
quarto render "$DOC.qmd" --to latex >/dev/null

echo "==> tectonic, pass 1"
tectonic -X compile --keep-intermediates --outfmt pdf "$DOC.tex" >/dev/null 2>&1 || true

if [ -f "$DOC.idx" ]; then
  echo "==> makeindex"
  makeindex -q "$DOC.idx"
else
  echo "==> no .idx produced; index will be empty"
fi

echo "==> tectonic, pass 2"
tectonic -X compile --keep-intermediates --outfmt pdf "$DOC.tex" 2>&1 \
  | grep -viE "^note: downloading" | grep -iE "^error" && exit 1 || true

# keep the source tree clean; the PDF and the sources are what matter
rm -f "$DOC".{aux,log,toc,lof,lot,out,idx,ilg,ind,tex}

printf '\n%s  —  %s pages, %s\n' \
  "$DOC.pdf" \
  "$(pdfinfo "$DOC.pdf" | awk '/^Pages/{print $2}')" \
  "$(du -h "$DOC.pdf" | cut -f1)"
