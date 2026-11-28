#!/bin/sh
# On GitHub's Mac (or Windows runner): the flows named in .zen-test (FLOWS, ARGS and any ZIA_* settings), with
# what they saw, run.sh's report and any captures (flows write them to
# ~/Library/Caches/zia-test/out) put in ~/zia-ci-out for the artifact.
set -u
here="$(cd "$(dirname "$0")/.." && pwd)"
cfg="$(cd "$here/../.." && pwd)/.zen-test"
out="$HOME/zia-ci-out"
mkdir -p "$out" "$HOME/Library/Caches/zia-test/out"
FLOWS="" ARGS=""
[ -f "$cfg" ] && { set -a; . "$cfg"; set +a; }
# (dark and with motion, as the Mac the baselines were recorded on: GitHub's Macs run light
# with Reduce motion on; a ZIA_PREFS
# setting of its own comes after, so it wins)
ZIA_PREFS="user_pref(\"ui.systemUsesDarkTheme\", 1); user_pref(\"ui.prefersReducedMotion\", 0); ${ZIA_PREFS:-}"
export ZIA_PREFS
# (Windows: python3 is a Store stub there; python is the real one)
if ! python3 -c 1 >/dev/null 2>&1; then PYTHON=python; export PYTHON; fi
# (Windows: the runner's own console sits over the desktop; minimised, so captures see Zen)
if command -v powershell.exe >/dev/null 2>&1; then
  powershell.exe -NoProfile -Command "(New-Object -ComObject Shell.Application).MinimizeAll()" || true
  sleep 1
fi
# (ZIA_DISPLAY: the Mac's screen set before Zen starts, for sharper captures: "WxH" for a
# resolution displayplacer lists, or "list" to only record what it offers, in captures/display.txt)
if [ -n "${ZIA_DISPLAY:-}" ] && [ "$(uname)" = Darwin ]; then
  mkdir -p "$HOME/Library/Caches/zia-test/out"
  dlog="$HOME/Library/Caches/zia-test/out/display.txt"
  HOMEBREW_NO_AUTO_UPDATE=1 brew install -q displayplacer > "$dlog" 2>&1
  displayplacer list >> "$dlog" 2>&1
  # (the Dock out of the way, for captures that run to the screen's foot)
  defaults write com.apple.dock autohide -bool true
  defaults write com.apple.dock autohide-delay -float 1000
  killall Dock 2>/dev/null || true
  if [ "$ZIA_DISPLAY" != list ]; then
    id=$(displayplacer list | sed -n 's/^Persistent screen id: //p' | head -n 1)
    displayplacer "id:$id res:$ZIA_DISPLAY scaling:${ZIA_DISPLAY_SCALING:-off}" >> "$dlog" 2>&1 || true
    sleep 2
    system_profiler SPDisplaysDataType >> "$dlog" 2>&1
  fi
fi
cd "$here"
# shellcheck disable=SC2086
./run.sh $ARGS $FLOWS > "$out/run.txt" 2>&1
echo "exit $?" >> "$out/run.txt"
cp "$HOME"/Library/Caches/zia-test/latest-*.json "$out/" 2>/dev/null || true
cp -R "$HOME/Library/Caches/zia-test/out" "$out/captures" 2>/dev/null || true
cat "$out/run.txt"
