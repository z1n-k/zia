#!/bin/sh
# On GitHub's Mac: Zen (the release named in .zen-test's ZEN_TAG, or the latest) and Sine set
# up by hand, as Sine's manual install describes: the bootloader's program.zip inside Zen.app,
# its profile.zip and Sine's engine.zip where make-profile.sh takes Sine from.
set -eu
root="$HOME/Library/Caches/zia-test"
cfg="$(cd "$(dirname "$0")/../../.." && pwd)/.zen-test"
[ -f "$cfg" ] && { set -a; . "$cfg"; set +a; }
tag="${ZEN_TAG:-}"
[ -n "$tag" ] || tag=$(gh release view -R zen-browser/desktop --json tagName -q .tagName)
app="$root/zen/$tag"
dl="${RUNNER_TEMP:-/tmp}/zen-dl"
mkdir -p "$app" "$root/sine" "$dl"
cd "$dl"
gh release download "$tag" -R zen-browser/desktop -p zen.macos-universal.dmg --clobber
hdiutil attach -nobrowse -readonly -mountpoint "$dl/mnt" zen.macos-universal.dmg >/dev/null
cp -R "$dl/mnt/Zen.app" "$app/"
hdiutil detach "$dl/mnt" >/dev/null
gh release download -R sineorg/bootloader -p program.zip -p profile.zip --clobber
gh release download -R CosmoCreeper/Sine -p engine.zip --clobber
unzip -oq program.zip -d "$app/Zen.app/Contents/Resources"
unzip -oq profile.zip -d "$root/sine"
unzip -oq engine.zip -d "$root/sine"
# (Zen.app changed, so signed again for this Mac alone)
xattr -cr "$app/Zen.app"
codesign --force --deep --sign - "$app/Zen.app" >/dev/null 2>&1 || true
echo "Zen $tag: $("$app/Zen.app/Contents/MacOS/zen" --version 2>/dev/null || true)"
echo "Sine: $(ls "$root/sine" | tr '\n' ' ')"
[ -d "$root/sine/JS" ] && [ -d "$root/sine/utils" ] || { echo "Sine's JS or utils folder is missing" >&2; ls -R "$root/sine" | head -40; exit 1; }
[ -n "${GITHUB_ENV:-}" ] && echo "ZIA_ZEN=$app" >> "$GITHUB_ENV"
echo "$app"
