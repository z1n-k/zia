  // The address shown without its www. (Zen's own trimmed address, gURLBar._zenTrimURL patched).
  // Used elsewhere: hideWwwInUrlbar.

  function hideWwwInUrlbar() {
    const original = gURLBar?._zenTrimURL;
    if (typeof original !== "function" || original.__zia) {
      return;
    }
    const wrapped = function (url) {
      const trimmed = original.call(this, url);
      return typeof trimmed === "string" ? plainAddress(trimmed) : trimmed;
    };
    wrapped.__zia = true;
    gURLBar._zenTrimURL = wrapped;
    try {
      gURLBar.setURI();
    } catch (err) {
      noteError("tab animations and folder bounce: hideWwwInUrlbar", err);
    }
  }

