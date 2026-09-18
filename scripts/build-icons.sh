#!/usr/bin/env bash
# Build the site's icon set and masthead mark from the supplied artwork.
#
#   ./scripts/build-icons.sh        (or: npm run icons)
#
# One line of shell around scripts/build-icons.py, which is where the work and
# the reasoning are. Kept as a script because `npm run icons` is in everyone's
# fingers and because build.sh and CI call it by this name.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "==> icons, from brand/mark-lockup.png"
python3 "$ROOT/scripts/build-icons.py"
