#!/bin/sh
# ESLint on the built script, Stylelint on src/css (see eslint.config.mjs, .stylelintrc.json:
# Firefox's own media queries, XUL elements and override order are allowed for)
set -eu
cd "$(dirname "$0")/.."
npx eslint zia.uc.js
npx stylelint "src/css/*.css"
