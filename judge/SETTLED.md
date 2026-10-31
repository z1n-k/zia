# Settled decisions (judges must not reopen these)

- Zia stays one Sine mod. No separate tab-drag mod (Olly, 2026-10-31).
- Build stays a plain concatenation of `src/js` and `src/css` into `zia.uc.js` and `chrome.css` (Sine loads one script and one stylesheet).
- UI that reads or writes settings stays in the window DOM, never an iframe page.
- Comment style is Zia's: plain sentences saying why, with asides in parentheses, often a
  parenthesised note that starts with what it qualifies, e.g. "(back into a row quicker than it
  became a tile: as long, it lagged)". Judges don't mark that voice down; they may still flag a
  comment that's unclear, wrong, or far from the code it explains.
- Release flow: one "Release X.Y.Z" commit per PR, no Claude attribution anywhere.
- Behaviour is frozen during the clean-up: no new features, no look changes.
- The tab drag's `drag` record is one drag session shared by the 28-tab-drag-* files, which are
  one module: each field is set only by the files listed in 01's comment, rather than through
  setter functions (decided under Olly's go-ahead to judge what's best, 2026-10-31).
