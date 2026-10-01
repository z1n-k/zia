  function searchEngineHomePage(engine) {
    try {
      if (engine.searchForm) {
        return engine.searchForm;
      }
    } catch (err) {
      noteError("new tabs: searchEngineHomePage", err);
    }
    try {
      const prePath = engine.getSubmission("zia").uri.prePath;
      return prePath ? `${prePath}/` : null;
    } catch (err) {
      return null;
    }
  }

  let searchHomeUrl = null;
  // the address Zia itself made the new tab page, so it only ever undoes
  // its own: a new tab page an extension set is left as it is
  let ziaNewTabUrl = null;

  // An extension's new tab page (Yet another speed dial and the like), if
  // one is in charge, put back after Zia's own is undone
  async function restoreExtensionNewTab(AboutNewTabModule) {
    try {
      const { ExtensionSettingsStore } = ChromeUtils.importESModule("resource://gre/modules/ExtensionSettingsStore.sys.mjs");
      await ExtensionSettingsStore.initialize();
      const setting = ExtensionSettingsStore.getSetting("url_overrides", "newTabURL");
      if (setting?.value) {
        AboutNewTabModule.newTabURL = setting.value;
      }
    } catch (err) {
      noteError("new tabs: restoreExtensionNewTab", err);
    }
  }

  // the new tab page as it is now: Zia's, an extension's, or Zen's own
  function currentNewTabUrl() {
    try {
      const AboutNewTabModule =
        window.AboutNewTab ||
        ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs").AboutNewTab;
      return AboutNewTabModule.newTabURL || "about:newtab";
    } catch (err) {
      return "about:newtab";
    }
  }

  function newTabSearchEnabled() {
    return Services.prefs.getBoolPref("zia.newtab.search-engine", true);
  }

  async function applyNewTabPage() {
    try {
      const AboutNewTabModule =
        window.AboutNewTab ||
        ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs").AboutNewTab;

      if (!newTabSearchEnabled()) {
        searchHomeUrl = null;
        // only Zia's own page is undone (turned off while running); one an
        // extension set stays, and is put back if Zia had replaced it
        if (ziaNewTabUrl && AboutNewTabModule.newTabURL === ziaNewTabUrl) {
          AboutNewTabModule.resetNewTabURL();
          await restoreExtensionNewTab(AboutNewTabModule);
        }
        ziaNewTabUrl = null;
        return;
      }

      const search =
        Services.search ||
        ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs").SearchService;
      await search.init();
      const engine = await search.getDefault();
      searchHomeUrl = (engine && searchEngineHomePage(engine)) || null;
      if (!searchHomeUrl) {
        console.warn("[Zia] Couldn't find the search engine's home page; keeping Zen's new tab page.");
        return;
      }
      try {
        AboutNewTabModule.newTabURL = searchHomeUrl;
        ziaNewTabUrl = searchHomeUrl;
      } catch (err) {
        noteError("new tabs: applyNewTabPage", err);
      }
    } catch (err) {
      console.error("[Zia] Could not set the new tab page:", err);
    }
  }

  function redirectBlankNewTab(browser, location, flags) {
    if (!searchHomeUrl || !newTabSearchEnabled()) {
      return;
    }
    if (flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT) {
      return;
    }
    if (location?.spec !== "about:newtab") {
      return;
    }
    try {
      browser.loadURI(Services.io.newURI(searchHomeUrl), {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        loadFlags: Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY,
      });
    } catch (err) {
      console.error("[Zia] Could not open the search page in the new tab:", err);
    }
  }

  function closeNewTabUrlbar(tab) {
    if (!searchHomeUrl || !newTabSearchEnabled()) {
      return;
    }
    requestAnimationFrame(() => {
      try {
        const urlbar = gURLBar;
        if (!urlbar?.focused) {
          return;
        }
        if (gBrowser.selectedTab !== tab) {
          return;
        }
        urlbar.view?.close();
        urlbar.blur();
        gBrowser.selectedBrowser?.focus();
      } catch (err) {
        noteError("new tabs: closeNewTabUrlbar", err);
      }
    });
  }

  function watchNewTabPage() {
    applyNewTabPage();
    gBrowser.tabContainer.addEventListener("TabOpen", (event) => closeNewTabUrlbar(event.target));
    Services.obs.addObserver(applyNewTabPage, "browser-search-engine-modified");
    Services.prefs.addObserver("zia.newtab.search-engine", applyNewTabPage);
    window.addEventListener("unload", () => {
      Services.obs.removeObserver(applyNewTabPage, "browser-search-engine-modified");
      Services.prefs.removeObserver("zia.newtab.search-engine", applyNewTabPage);
    });
  }

