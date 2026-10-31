# Zia code cleanliness: rubric

Agreed with Olly on 2026-10-31. Changes only with his OK (a change starts a fresh score history).

## Reference class

Well-kept code that reshapes the browser's own interface. Benchmarks:

- Zen's own source, `src/zen` (`ZenFolders.mjs`, `drag-and-drop/ZenDragAndDrop.js`)
- Firefox's tab strip drag and drop (`browser/components/tabbrowser/content/drag-and-drop.js`)
- Natsumi Browser (greeeen-dev/natsumi-browser)
- Advanced Tab Groups (Vertex-Mods/Advanced-Tab-Groups)

Score = (baseline share passed × 8) + (leap share passed × 2).

## Baseline tier (8 points)

### B1. Behaviour unchanged (gate: any FAIL here caps the round at 5.0)
1. `scripts/build.sh --check` passes.
2. The Zen harness (`tests/zen/run.sh`) passes every flow, on the refactored build, with the same results as the baseline recorded before the refactor.
3. No user-visible change: no setting, preference name, attribute name used by CSS, or CHANGELOG-worthy behaviour differs, unless it's listed in the item as an intended fix.
4. Every Zen function Zia patched before is still patched, with the same guard against patching twice.

### B2. Size
1. No file in `src/js` over 800 lines.
2. No file in `src/css` over 800 lines.
3. No function over 60 lines (nested functions counted on their own).
4. Each file's name says its one job, and its first comment says what it owns.

### B3. State
1. No file has more than 5 top-level mutable bindings (`let`, or `const` objects reassigned through).
2. Drag, folder-motion and similar state lives in named objects, each with one reset function.
3. No function writes state owned by another file.

### B4. Coupling
1. Each file's functions used by other files are listed in its header comment.
2. No file calls another file's function that isn't listed there.
3. No cycles: file A needing B needing A only where documented as deliberate.

### B5. Timing
1. Every `setTimeout`/`setInterval`/`requestAnimationFrame` id that can outlive its event is stored and cancelled in one clean-up path.
2. No bare millisecond values over 16 outside named constants.

### B6. Patching Zen and Firefox
1. Every replacement of a Zen or Firefox method goes through one helper (`patchMethod` or similar) that marks the patch and keeps the original.
2. No direct `X.prototype.y = ` or `obj.method = function` outside that helper.

### B7. Readability
1. Names are consistent: one word per idea (no `room`/`gap`/`space` for the same thing).
2. Comments explain why, not what; no commented-out code.
3. An unused-code check (`scripts/check-unused.sh`) finds no unused functions or constants.

### B8. Tooling
1. ESLint (flat config, recommended rules plus the project's) runs in CI and passes.
2. Stylelint runs in CI on `src/css` and passes.
3. The unused-code check runs in CI and passes.

### B9. CSS
1. No selector block repeated in the same file with the same selector and conflicting declarations.
2. Every `--zia-*` variable is defined in one place (light/dark/space overrides excepted).
3. No dead rules: every class or id Zia's own CSS targets exists in Zia's JS or in Zen.
4. Each `!important` beats a Zen or Firefox rule (spot-checked with a comment per block, not per line).

## Leap tier (2 points)

### L1. Real-Zen test suite
1. `tests/zen/run.sh` starts Zen with a throwaway profile, Sine and the working copy of Zia, and never touches Olly's profile.
2. It covers: tab drag within the list, into and out of a folder, into essentials, to another space, onto a split; folder open/close; space name click; new tab address bar; Zia Settings opening.
3. A full run takes under 5 minutes and reports pass/fail per flow.
4. None of the benchmarks has a suite that drives the real browser with the mod loaded.

### L2. Zen-update early warning
1. Each file declares the Zen and Firefox internals it relies on (globals, methods, element ids, attributes).
2. `scripts/check-zen.sh <tag>` checks a Zen release's source for each and lists what's missing or renamed.
3. Run against 1.23.4b → 1.24b, it would have flagged a real change Zia had to follow.

### L3. Generated code map
1. `scripts/map.sh` writes `docs/MAP.md` from the code: every file, what it owns, what it patches, the prefs it reads.
2. CI fails if `docs/MAP.md` is out of date.
