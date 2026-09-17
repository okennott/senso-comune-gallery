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
# Fonts and figures are built first: the fonts because XeTeX cannot drive the
# variable axes the site uses and needs static instances, the figures so the
# palette in the document can never drift from the palette in the site.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DOC=senso-comune-report

cd "$HERE"

echo "==> fonts"
python3 fonts.py

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
