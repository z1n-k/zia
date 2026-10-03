#!/bin/sh
# Readies a release: sets theme.json's version and updatedAt (Sine looks at
# updatedAt to tell whether a mod has changed, so it moves with every
# release), names the changelog's Unreleased section, and rebuilds.
#   scripts/release.sh 2.85.1
set -eu
cd "$(dirname "$0")/.."

version="${1:?usage: scripts/release.sh X.Y.Z}"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
today="$(date -u +%Y-%m-%d)"

sed -i.bak \
  -e "s/\"version\": \"[^\"]*\"/\"version\": \"$version\"/" \
  -e "s/\"updatedAt\": \"[^\"]*\"/\"updatedAt\": \"$now\"/" \
  theme.json
rm theme.json.bak

grep -q '^## \[Unreleased\]' CHANGELOG.md || { echo "CHANGELOG.md has no [Unreleased] section" >&2; exit 1; }
sed -i.bak "s/^## \[Unreleased\].*/## [$version] — $today/" CHANGELOG.md
rm CHANGELOG.md.bak

scripts/build.sh
echo "Zia $version, updated $now"
