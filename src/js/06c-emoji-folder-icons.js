  // Emoji as folder icons: Zen's picker offers folders only its own icons, so Zia opens it with
  // emoji too, drawn as an icon (gZenEmojiPicker.open patched).
  // Used elsewhere: allowEmojiFolderIcons.

  function allowEmojiFolderIcons() {
    const picker = window.gZenEmojiPicker;
    if (!picker || typeof picker.open !== "function" || picker.open.__zia) {
      return;
    }
    const original = picker.open;
    const patched = function (anchor, options = {}) {
      if (options?.onlySvgIcons && anchor?.closest?.("zen-folder")) {
        options = { ...options, onlySvgIcons: false, emojiAsSVG: true };
      }
      return original.call(this, anchor, options);
    };
    patched.__zia = true;
    picker.open = patched;
  }

