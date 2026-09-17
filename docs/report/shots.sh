#!/usr/bin/env bash
# Screenshot the built site for the report's figures.
#
#   ./docs/report/shots.sh
#
# The captures in fig/cap-*.png used to be taken by hand, which meant the
# report's "The site as built" section was only as current as the last time
# somebody remembered. It is a section that claims "what is shown is what
# npm run build produces", so it has to be produced by npm run build.
#
# Chrome will not load a page's stylesheet over file:// when the href is
# root-relative, so dist/ is served over a real origin first.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PORT="${PORT:-8749}"
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || true)}"

[ -n "$CHROME" ] || { echo "  no Chrome on PATH; set CHROME=..." >&2; exit 1; }
[ -d "$ROOT/dist" ] || { echo "  no dist/; run: node build.js" >&2; exit 1; }

python3 -m http.server "$PORT" --directory "$ROOT/dist" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 0.25
done

shoot() {  # name route width height scale
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor="$5" --window-size="$3,$4" \
    --virtual-time-budget=6000 \
    --screenshot="$HERE/fig/cap-$1.png" "http://127.0.0.1:$PORT$2" 2>/dev/null
  printf '  fig/cap-%s.png  %s  %sx%s @%sx\n' "$1" "$2" "$3" "$4" "$5"
}

# The two widths the layout is verified at, and nothing in between: 1440 is the
# desktop breakpoint the grid is designed for, 390 the narrowest phone in
# common use and the width every mobile finding was measured at.
shoot home "/"                              1440 900  2
shoot work "/works/harbour-light/"          1440 900  2
shoot sold "/works/long-afternoon/"         1440 620  2
shoot buy  "/how-to-buy/"                   1440 900  2
shoot mob  "/"                               390 844  2

# The softness plate needs a painting to show a mat, a mount shadow or glass
# on, and forced states a plain screenshot cannot reach. See soft_shots.mjs.
node "$HERE/soft_shots.mjs" "http://127.0.0.1:$PORT"
