  const URLBAR_POSITION_PREF = "zia.urlbar.position";

  function watchUrlbarPosition() {
    const apply = () => {
      let position = "top";
      try {
        position = Services.prefs.getStringPref(URLBAR_POSITION_PREF, "top");
      } catch (err) {
        noteError("options: apply", err);
      }
      root.setAttribute("zia-urlbar-position", position === "bottom" ? "bottom" : "top");
      requestAnimationFrame(() => {
        rememberClosedText();
        schedulePanes();
      });
    };
    apply();
    Services.prefs.addObserver(URLBAR_POSITION_PREF, apply);
    window.addEventListener("unload", () => Services.prefs.removeObserver(URLBAR_POSITION_PREF, apply));
  }

  // Options in Sine's settings that are on by default (the rest are set
  // one by one in applyZenDefaults), and the ones watched as they change.
  const ZIA_OPTIONS = [
    "zia.urlbar.dia-style",
    "zia.newtab.real-tab",
    "zia.tabs.sound-bars",
    "zia.toolbar.site-color",
    "zia.split.drop-cards",
    "zia.page.rounding",
  ];
  const WATCHED_OPTIONS = ["zia.urlbar.zen-look", "zia.urlbar.dia-style", "zia.newtab.real-tab", "zia.toolbar.site-color", "zia.split.drop-cards"];

  function watchOptions() {
    const urlbar = gURLBar?.textbox || document.getElementById("urlbar");
    const apply = () => {
      // (Zen's own address bar takes Zen's pop-up with it)
      urlbar?.toggleAttribute(
        "zia-classic",
        !Services.prefs.getBoolPref("zia.urlbar.dia-style", true) || Services.prefs.getBoolPref("zia.urlbar.zen-look", false)
      );
      // Off gives Cmd/Ctrl+T back to Zen's floating address bar, and tab
      // drops on the page back to Zen's own split.
      try {
        const defaults = Services.prefs.getDefaultBranch("");
        defaults.setBoolPref("zen.urlbar.replace-newtab", !Services.prefs.getBoolPref("zia.newtab.real-tab", true));
        defaults.setBoolPref("zen.splitView.enable-tab-drop", !Services.prefs.getBoolPref("zia.split.drop-cards", true));
      } catch (err) {
        noteError("options: apply (2)", err);
      }
    };
    const onChange = () => {
      apply();
      appliedColorKey = null;
      updateColor();
    };
    apply();
    for (const name of WATCHED_OPTIONS) {
      Services.prefs.addObserver(name, onChange);
    }
    window.addEventListener("unload", () => {
      for (const name of WATCHED_OPTIONS) {
        Services.prefs.removeObserver(name, onChange);
      }
    });
  }

  const FEATURES = ["media-player", "find-bar", "icon-picker", "undo-close", "folder-icon-suggest", "tab-hover-cards", "tab-numbers"];

  function featureOn(name) {
    try {
      return Services.prefs.getBoolPref(`zia.features.${name}`, true);
    } catch (err) {
      return true;
    }
  }

  function ifOn(feature, name, fn) {
    if (featureOn(feature)) {
      safely(name, fn);
    }
  }


  // The sidebar's text a size smaller (or larger) than Zia's, for a narrow
  // sidebar where long tab names were cut short (an option; 00-variables)
  const TEXT_SIZE_PREF = "zia.sidebar.text-size";

  function watchTextSize() {
    const apply = () => {
      const size = Services.prefs.getStringPref(TEXT_SIZE_PREF, "default");
      if (["small", "smaller", "large"].includes(size)) {
        root.setAttribute("zia-text-size", size);
      } else {
        root.removeAttribute("zia-text-size");
      }
    };
    apply();
    Services.prefs.addObserver(TEXT_SIZE_PREF, apply);
    window.addEventListener("unload", () => Services.prefs.removeObserver(TEXT_SIZE_PREF, apply), { once: true });
  }
