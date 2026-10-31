#!/bin/sh
# A throwaway Zen profile for the harness: Sine's engine, and Zia loaded straight from this
# working copy. Sine's engine is copied once from your own profile (read only) and kept, so a
# Sine update of yours doesn't change what the tests run on; delete ~/Library/Caches/zia-test/sine
# to take the newer one (then re-record the baseline). Your own profile is never written to.
set -eu
here=$(cd "$(dirname "$0")/../.." && pwd)
test_root="$HOME/Library/Caches/zia-test"
profile="${1:-$test_root/template}"
zen_profiles="$HOME/Library/Application Support/zen/Profiles"

case "$profile" in
  "$test_root"/*) ;;
  *) echo "The test profile must be inside $test_root" >&2; exit 1 ;;
esac

sine="$test_root/sine"
if [ ! -d "$sine" ]; then
  source_profile=$(ls -d "$zen_profiles"/*/chrome/JS 2>/dev/null | head -n 1 | sed 's|/chrome/JS$||')
  [ -n "$source_profile" ] || { echo "No Zen profile with Sine found in $zen_profiles" >&2; exit 1; }
  mkdir -p "$sine"
  cp -R "$source_profile/chrome/JS" "$source_profile/chrome/utils" "$sine/"
fi

rm -rf "$profile"
mkdir -p "$profile/chrome/sine-mods"
cp -R "$sine/JS" "$sine/utils" "$profile/chrome/"
ln -s "$here" "$profile/chrome/sine-mods/zia"

# Sine's list of mods: Zia alone, never updated from the store (it would replace the link)
python3 - "$here/theme.json" "$profile/chrome/sine-mods/mods.json" <<'PY'
import json, sys
mod = json.load(open(sys.argv[1]))
mod.update({"no-updates": True, "enabled": True})
json.dump({"zia": mod}, open(sys.argv[2], "w"))
PY

# (the welcome tour marked seen at the version Zia shows it for, so it never opens over a flow)
welcome=$(sed -n 's/.*const WELCOME_VERSION = "\(.*\)";.*/\1/p' "$here/src/js/28f-welcome.js")
cat > "$profile/user.js" <<PREFS
user_pref("zia.welcome.seen", "$welcome");
user_pref("sine.allow-unsafe-js", true);
user_pref("sine.auto-updates", false);
user_pref("sine.engine.auto-update", false);
user_pref("sine.mods-reinstalled", true);
user_pref("sine.fork-id", "zen");
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.startup.page", 0);
user_pref("app.update.enabled", false);
user_pref("app.update.auto", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.enabled", false);
user_pref("zen.welcome-screen.seen", true);
user_pref("zia.welcome.show", false);
user_pref("zia.install-count", false);
PREFS
echo "$profile"
