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
    // (not with "Full address" on, which shows the address as it is, #519; a choice of your own
    // in about:config stays)
    const trimHttps = () => set("browser.urlbar.trimHttps", !Services.prefs.getBoolPref("zia.urlbar.full-url", false));
    trimHttps();
    watchPrefs("zia.urlbar.full-url", trimHttps);
    // answers in the address bar: maths, and units and time zones (Firefox's own)
    set("browser.urlbar.suggest.calculator", true);
    set("browser.urlbar.unitConversion.enabled", true);
    set("browser.urlbar.untrimOnUserInteraction.featureGate", false);
    try {
      Services.prefs.setBoolPref("browser.urlbar.untrimOnUserInteraction", false);
      // (trimHttps was written as your own choice at every start, which outranked the default
      // above, "Full address" included, and any choice of yours: put back once, it's left to
      // the default from then on, #519)
      if (!Services.prefs.getBoolPref("zia.trim-https-reset", false)) {
        Services.prefs.clearUserPref("browser.urlbar.trimHttps");
        Services.prefs.setBoolPref("zia.trim-https-reset", true);
      }
    } catch (err) {
      noteError("zen defaults: set", err);
    }
    for (const feature of FEATURES) {
      set(`zia.features.${feature}`, true);
    }
    // Ultra's effects, on unless switched off (the stylesheet reads it too)
    set("zia.ultra", true);
    // Downloads a model the first time, so it's something to opt into
    set("zia.features.folder-icon-suggest", false);

    for (const name of ZIA_OPTIONS) {
      set(name, true);
    }
    set("zia.tabs.favicon-glow", false);
    set("zia.tabs.no-pin-slash", false);
    set("zia.swipe.dia-arrow", true);
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
    // Zen 1.23 turned its see-through "acrylic" sidebar on for everyone, under Zia's own:
    // off once for anyone who hadn't chosen it (from the next start; zen.theme.acrylic-elements).
    try {
      if (!Services.prefs.getBoolPref("zia.acrylic-reset", false)) {
        if (!Services.prefs.prefHasUserValue("zen.theme.acrylic-elements")) {
          Services.prefs.setBoolPref("zen.theme.acrylic-elements", false);
        }
        Services.prefs.setBoolPref("zia.acrylic-reset", true);
      }
    } catch (err) {
      noteError("zen defaults: acrylic", err);
    }
    // Optional: a playing video goes picture-in-picture as its tab is left (Firefox's own).
    // Zia's setting starts as Firefox's is and passes on a change made in Zia's settings,
    // so one made in Firefox's own stays.
    const FIREFOX_FOR_ZIA = {
      "zia.pip.auto-on-tab-switch": ["media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled", false],
    };
    for (const [zia, [firefox, fallback]] of Object.entries(FIREFOX_FOR_ZIA)) {
      set(zia, Services.prefs.getBoolPref(firefox, fallback));
    }
    watchPrefs(Object.keys(FIREFOX_FOR_ZIA), (_subject, _topic, zia) => {
      Services.prefs.setBoolPref(FIREFOX_FOR_ZIA[zia][0], Services.prefs.getBoolPref(zia));
    });
    set("zia.urlbar.zia-look", true);
    set("zia.glass", false);
    // 2.95.11's "Zen's own address bar" is now "Zia's address bar", the other
    // way round, as the other options are: anyone who'd turned Zen's on
    // keeps it
    try {
      if (Services.prefs.getBoolPref("zia.urlbar.zen-look", false)) {
        Services.prefs.setBoolPref("zia.urlbar.zia-look", false);
      }
      Services.prefs.clearUserPref("zia.urlbar.zen-look");
    } catch (err) {
      noteError("zen defaults: address bar look", err);
    }
    // the ⋯ menu at the end of the toolbar, shown unless it's been switched off
    set("zia.toolbar.menu-button", true);
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

