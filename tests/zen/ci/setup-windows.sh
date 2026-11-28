#!/bin/bash
# On GitHub's Windows runner (Git's bash): Zen (the release named in .zen-test's ZEN_TAG, or the
# latest) and Sine, as setup.sh does on the Mac. Zen ships Windows only as an installer, a 7-Zip
# archive whose core/ folder is Zen itself: unpacked, never installed. Sine's bootloader goes
# beside zen.exe; its profile and engine where make-profile.sh takes Sine from.
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
gh release download "$tag" -R zen-browser/desktop -p zen.installer.exe --clobber
7z x -y -o"$dl/x" zen.installer.exe >/dev/null
core=$(dirname "$(find "$dl/x" -iname zen.exe | head -n 1)")
[ -f "$core/zen.exe" ] || { echo "No zen.exe in the installer" >&2; find "$dl/x" -maxdepth 2 | head -40; exit 1; }
cp -R "$core"/. "$app/"
gh release download -R sineorg/bootloader -p program.zip -p profile.zip --clobber
gh release download -R CosmoCreeper/Sine -p engine.zip --clobber
7z x -y -o"$app" program.zip >/dev/null
7z x -y -o"$root/sine" profile.zip >/dev/null
7z x -y -o"$root/sine" engine.zip >/dev/null
echo "Zen $tag: $(ls "$app" | tr '\n' ' ' | head -c 300)"
echo "Sine: $(ls "$root/sine" | tr '\n' ' ')"
[ -d "$root/sine/JS" ] && [ -d "$root/sine/utils" ] || { echo "Sine's JS or utils folder is missing" >&2; ls -R "$root/sine" | head -40; exit 1; }
[ -n "${GITHUB_ENV:-}" ] && echo "ZIA_ZEN=$(cygpath -w "$app")" >> "$GITHUB_ENV"
echo "$app"
