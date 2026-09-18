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

printf '\n%s  —  %s pages, %s, %s\n' \
  "$DOC.pdf" \
  "$(pdfinfo "$DOC.pdf" | awk '/^Pages/{print $2}')" \
  "$(du -h "$DOC.pdf" | cut -f1)" \
  "$(pdfinfo "$DOC.pdf" | awk -F'[()]' '/^Page size/{print $2}')"

# --- the press file ---------------------------------------------------------
# BLEED=1 builds a SECOND pdf for the printer: the same document on 230x317mm
# paper with the A4 trim centred in it, the edge artwork carried 3mm past where
# the knife falls, and crop marks showing where that is. The reading PDF stays
# exactly A4, because that is what it is for.
#
# The switch is a sentinel file rather than an environment variable because
# tectonic gives no way to pass a macro in, and preamble.tex reads it with
# \IfFileExists. It is removed again whatever happens.
if [ "${BLEED:-}" = "1" ]; then
  echo "==> press file: bleed and crop marks"
  trap 'rm -f "$HERE/bleed.on"' EXIT
  : > "$HERE/bleed.on"
  quarto render "$DOC.qmd" --to latex >/dev/null
  tectonic -X compile --keep-intermediates --outfmt pdf "$DOC.tex" >/dev/null 2>&1 || true
  [ -f "$DOC.idx" ] && makeindex -q "$DOC.idx"
  tectonic -X compile --keep-intermediates --outfmt pdf "$DOC.tex" 2>&1 \
    | grep -viE "^note: downloading" | grep -iE "^error" && exit 1 || true
  mv "$DOC.pdf" "$DOC-print.pdf"
  rm -f "$HERE/bleed.on" "$DOC".{aux,log,toc,lof,lot,out,idx,ilg,ind,tex}

  # …and put the reading PDF back, because the press file overwrote it.
  quarto render "$DOC.qmd" --to latex >/dev/null
  tectonic -X compile --keep-intermediates --outfmt pdf "$DOC.tex" >/dev/null 2>&1 || true
  [ -f "$DOC.idx" ] && makeindex -q "$DOC.idx"
  tectonic -X compile --outfmt pdf "$DOC.tex" >/dev/null 2>&1 || true
  rm -f "$DOC".{aux,log,toc,lof,lot,out,idx,ilg,ind,tex}

  printf '%s  —  %s pages, %s, %s  (trim 210x297mm, 3mm bleed, crop marks)\n' \
    "$DOC-print.pdf" \
    "$(pdfinfo "$DOC-print.pdf" | awk '/^Pages/{print $2}')" \
    "$(du -h "$DOC-print.pdf" | cut -f1)" \
    "$(pdfinfo "$DOC-print.pdf" | awk '/^Page size/{print $3"x"$5"pt"}')"
fi
