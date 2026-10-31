# Settled decisions (judges must not reopen these)

- Zia stays one Sine mod. No separate tab-drag mod (Olly, 2026-10-31).
- Build stays a plain concatenation of `src/js` and `src/css` into `zia.uc.js` and `chrome.css` (Sine loads one script and one stylesheet).
- UI that reads or writes settings stays in the window DOM, never an iframe page.
- Comment style is Zia's: plain sentences saying why, parentheses for asides.
- Release flow: one "Release X.Y.Z" commit per PR, no Claude attribution anywhere.
- Behaviour is frozen during the clean-up: no new features, no look changes.
