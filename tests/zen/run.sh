#!/bin/sh
# Zia's tests in the real Zen (see run.py). Needs Zen in /Applications, with Sine set up in
# one of your profiles (its engine is copied, read only).
cd "$(dirname "$0")" && exec "${PYTHON:-python3}" run.py "$@"
