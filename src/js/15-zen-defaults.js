  function applyZenDefaults() {
    const defaults = Services.prefs.getDefaultBranch("");
    const set = (name, value) => {
      try {
        defaults.setBoolPref(name, value);
      } catch (err) {
        console.error(`[Zia] Could not set default for ${name}:`, err);
      }
    };
    // The icon names cached for the Phosphor icons (before 2.42.0) aren't
    // used any more; the Tabler ones have their own file.
    IOUtils.remove(PathUtils.join(PathUtils.profileDir, "zia-icon-vectors.json"), { ignoreAbsent: true }).catch(() => {});
    set("zen.widget.mac.mono-window-controls", false);
    set("zen.urlbar.replace-newtab", !Services.prefs.getBoolPref("zia.newtab.real-tab", true));
    set("zen.splitView.enable-tab-drop", !Services.prefs.getBoolPref("zia.split.drop-cards", true));
    set("browser.urlbar.trimHttps", true);
    set("browser.urlbar.untrimOnUserInteraction.featureGate", false);
    try {
      Services.prefs.setBoolPref("browser.urlbar.untrimOnUserInteraction", false);
      Services.prefs.setBoolPref("browser.urlbar.trimHttps", true);
    } catch (err) {
      noteError("zen defaults: set", err);
    }

    for (const feature of FEATURES) {
      set(`zia.features.${feature}`, true);
    }
    // Downloads a model the first time, so it's something to opt into
    set("zia.features.folder-icon-suggest", false);

    for (const name of ZIA_OPTIONS) {
      set(name, true);
    }
    set("zia.tabs.favicon-glow", false);
    // Dimming asleep tabs was on by default for a few releases and is now
    // off: switched off once for anyone who had it from then.
    set("zia.tabs.dim-asleep", false);
    try {
      if (!Services.prefs.getBoolPref("zia.tabs.dim-asleep-reset", false)) {
        Services.prefs.clearUserPref("zia.tabs.dim-asleep");
        Services.prefs.setBoolPref("zia.tabs.dim-asleep-reset", true);
      }
    } catch (err) {
      noteError("zen defaults: dim asleep", err);
    }
    set("zia.essentials.fill-row", false);
    set("zia.essentials.split", true);
    set("zia.pip.dia-style", true);
    set("zia.pip.tuck", true);
    set("zia.multiview", true);
    // Dia's picture-in-picture has skip buttons and a progress line, which
    // Firefox only shows with its improved controls.
    set("media.videocontrols.picture-in-picture.improved-video-controls.enabled", true);
    try {
      defaults.setStringPref("zia.urlbar.position", "top");
    } catch (err) {
      noteError("zen defaults: set (2)", err);
    }
  }

