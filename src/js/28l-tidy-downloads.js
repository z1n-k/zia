  // ---------- Rename finished downloads with AI (Tidy Downloads, by Bxthesda and
  // Zylaah, in tidy-downloads/ with their permission). Loaded here, only with the
  // option on: as the mod's own scripts, they ran only after Sine installed Zia.
  const TIDY_DOWNLOADS_SCRIPTS = ["tidy-downloads", "tidy-downloads-models"];

  function loadTidyDownloads() {
    if (!Services.prefs.getBoolPref("zia.features.tidy-downloads", false) || window.__ziaTidyDownloads) {
      return;
    }
    for (const name of TIDY_DOWNLOADS_SCRIPTS) {
      try {
        Services.scriptloader.loadSubScript(`chrome://sine/content/zia/tidy-downloads/${name}.js`, window);
      } catch (err) {
        console.error(`[Zia] Couldn't load Tidy Downloads (${name}):`, err);
        return;
      }
    }
  }

