#!/bin/sh
# On GitHub's Mac: the flows named in .zen-test (FLOWS, ARGS and any ZIA_* settings), with
# what they saw, run.sh's report and any captures (flows write them to
# ~/Library/Caches/zia-test/out) put in ~/zia-ci-out for the artifact.
set -u
here="$(cd "$(dirname "$0")/.." && pwd)"
cfg="$(cd "$here/../.." && pwd)/.zen-test"
out="$HOME/zia-ci-out"
mkdir -p "$out" "$HOME/Library/Caches/zia-test/out"
FLOWS="" ARGS=""
[ -f "$cfg" ] && { set -a; . "$cfg"; set +a; }
# (dark, as the Mac the baselines were recorded on: GitHub's Macs run light; a ZIA_PREFS
# setting of its own comes after, so it wins)
ZIA_PREFS="user_pref(\"ui.systemUsesDarkTheme\", 1); ${ZIA_PREFS:-}"
export ZIA_PREFS
cd "$here"
# shellcheck disable=SC2086
./run.sh $ARGS $FLOWS > "$out/run.txt" 2>&1
echo "exit $?" >> "$out/run.txt"
cp "$HOME"/Library/Caches/zia-test/latest-*.json "$out/" 2>/dev/null || true
cp -R "$HOME/Library/Caches/zia-test/out" "$out/captures" 2>/dev/null || true
cat "$out/run.txt"
