  // ---------- Rename finished downloads with AI (Tidy Downloads)
  // Tidy Downloads, by Bxthesda and Zylaah, is in tidy-downloads/ (used with
  // their permission). Zia loads it itself, only with "Rename finished
  // downloads with AI" on: listed as the mod's own scripts instead, they only
  // ran once Sine had installed or updated Zia, not after its files were
  // swapped by hand.
  // (the renaming, then the model lists for its settings)
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

