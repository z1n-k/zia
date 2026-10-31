  // The address shown without its www. (Zen's own trimmed address, gURLBar._zenTrimURL patched).
  // Used elsewhere: hideWwwInUrlbar.
  // From 06: nothing (plainAddress is 03's).

  function hideWwwInUrlbar() {
    const replaced = patchMethod(gURLBar, "_zenTrimURL", (original) => function (url) {
      const trimmed = original.call(this, url);
      return typeof trimmed === "string" ? plainAddress(trimmed) : trimmed;
    });
    if (!replaced) {
      return;
    }
    try {
      gURLBar.setURI();
    } catch (err) {
      // (its old file's name kept, so the log reads the same)
      noteError("tab animations and folder bounce: hideWwwInUrlbar", err);
    }
  }

