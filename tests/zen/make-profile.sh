#!/bin/sh
# A throwaway Zen profile for the harness: Sine's engine, and Zia loaded straight from this
# working copy. Sine's engine is copied once from your own profile (read only) and kept, so a
# Sine update of yours doesn't change what the tests run on; delete ~/Library/Caches/zia-test/sine
# to take the newer one (then re-record the baseline). Your own profile is never written to.
set -eu
here=$(cd "$(dirname "$0")/../.." && pwd)
test_root="$HOME/Library/Caches/zia-test"
profile="$1"
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
# (ZIA_OFF=1: Zen and Sine without Zia, to tell Zia's doing from Zen's)
if [ "${ZIA_OFF:-}" != 1 ]; then
  ln -s "$here" "$profile/chrome/sine-mods/zia"
fi
# (ZIA_ATG=<folder>: Advanced Tab Groups, a Sine mod, loaded beside Zia from that folder, for
# bugs that need both; its source isn't kept here: download it from the Sine store's repository)
if [ -n "${ZIA_ATG:-}" ]; then
  [ -f "$ZIA_ATG/theme.json" ] || { echo "ZIA_ATG has no theme.json: $ZIA_ATG" >&2; exit 1; }
  ln -s "$ZIA_ATG" "$profile/chrome/sine-mods/atg"
fi

# Sine's list of mods: Zia (and any mod above), never updated from the store (it would replace
# the link)
python3 - "$profile/chrome/sine-mods" "$here/theme.json" <<'PY'
import json, os, sys
mods_dir, zia_theme = sys.argv[1], sys.argv[2]
mods = {}
for name, theme in (("zia", zia_theme), ("atg", os.path.join(mods_dir, "atg", "theme.json"))):
    if os.path.exists(os.path.join(mods_dir, name)):
        mod = json.load(open(theme))
        mod.update({"id": name, "no-updates": True, "enabled": True})
        mods[name] = mod
json.dump(mods, open(os.path.join(mods_dir, "mods.json"), "w"))
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
# (ZIA_PREFS='user_pref("a", true); ...': prefs of a reporter's, for a flow that needs them from
# the first start)
if [ -n "${ZIA_PREFS:-}" ]; then
  printf '%s\n' "$ZIA_PREFS" >> "$profile/user.js"
fi
echo "$profile"
