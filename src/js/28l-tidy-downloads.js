  // ---------- Rename finished downloads with AI (Tidy Downloads)
  // Tidy Downloads, by Bxthesda and Zylaah, is in tidy-downloads/ (used with
  // their permission). Zia loads its scripts itself, in their order, only
  // with "Rename finished downloads with AI" on: listed as the mod's own
  // scripts instead, they only ran once Sine had installed or updated Zia,
  // not after its files were swapped by hand.
  const TIDY_DOWNLOADS_SCRIPTS = [
    "tidy-downloads-utils",
    "tidy-downloads-store",
    "tidy-downloads-downloads-adapter",
    "tidy-downloads-toasts",
    "tidy-downloads-fileops",
    "tidy-downloads-ai-rename",
    "tidy-downloads-download-ui",
    "tidy-downloads-tooltip",
    "tidy-downloads",
    "tidy-downloads-ai-models",
  ];

  function loadTidyDownloads() {
    if (!Services.prefs.getBoolPref("zia.features.tidy-downloads", false) || window.__zenTidyDownloadsBundleExecuted) {
      return;
    }
    for (const name of TIDY_DOWNLOADS_SCRIPTS) {
      try {
        Services.scriptloader.loadSubScript(`chrome://sine/content/zia/tidy-downloads/${name}.uc.js`, window);
      } catch (err) {
        console.error(`[Zia] Couldn't load Tidy Downloads (${name}):`, err);
        return;
      }
    }
  }

