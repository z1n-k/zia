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
        AboutNewTabModule.resetNewTabURL();
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

