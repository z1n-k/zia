  // Emoji as folder icons: Zen's picker offers folders only its own icons, so Zia opens it with
  // emoji too, drawn as an icon (gZenEmojiPicker.open patched).
  // Used elsewhere: allowEmojiFolderIcons.
  // From 06: nothing.

  function allowEmojiFolderIcons() {
    patchMethod(window.gZenEmojiPicker, "open", (original) => function (anchor, options = {}) {
      if (options?.onlySvgIcons && anchor?.closest?.("zen-folder")) {
        options = { ...options, onlySvgIcons: false, emojiAsSVG: true };
      }
      return original.call(this, anchor, options);
    });
  }

