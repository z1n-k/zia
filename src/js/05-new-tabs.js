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

  const aboutNewTab = () => window.AboutNewTab || ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs").AboutNewTab;

  // the new tab page as it is now: Zia's, an extension's, or Zen's own
  function currentNewTabUrl() {
    try {
      return aboutNewTab().newTabURL || "about:newtab";
    } catch (err) {
      return "about:newtab";
    }
  }

  function newTabSearchEnabled() {
    return Services.prefs.getBoolPref("zia.newtab.search-engine", true);
  }

  async function applyNewTabPage() {
    try {
      const AboutNewTabModule = aboutNewTab();
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

  // Optional: Cmd/Ctrl+T leaves the address bar ready to type in, with the
  // search page showing behind it (off: the page's own search box)
  const focusAddressBarOnNewTab = () => Services.prefs.getBoolPref("zia.newtab.focus-address-bar", false);

  function keepNewTabUrlbar(tab) {
    const focus = () => {
      if (gBrowser.selectedTab !== tab || tab.ziaTypedInPage) {
        return;
      }
      if (!gURLBar.focused) {
        gURLBar.focus();
        gURLBar.select();
      }
    };
    // the search page loading after can pull focus to its own box: put it
    // back, until something's been typed or clicked in the page
    tab.ziaBlankAddress = true;
    tab.linkedBrowser?.addEventListener("mousedown", () => (tab.ziaTypedInPage = true), { once: true });
    requestAnimationFrame(focus);
    for (const ms of [250, 700, 1500]) {
      setTimeout(() => {
        if (document.activeElement === tab.linkedBrowser) {
          focus();
        }
      }, ms);
    }
  }

  // The search page arriving in a new tab put its address in the address
  // bar, already open to type in, so it had to be deleted first (Zen 1.23
  // writes a page's address in as it loads, even with the bar in use). It's
  // kept empty instead, until something's typed there or in the page.
  function keepNewTabAddressEmpty(browser, location) {
    const tab = gBrowser.getTabForBrowser?.(browser);
    if (!tab?.ziaBlankAddress || !searchHomeUrl || !location) {
      return;
    }
    if (tab.ziaTypedInPage || location.spec === "about:newtab" || location.spec === "about:blank") {
      return;
    }
    let home = null;
    try {
      home = Services.io.newURI(searchHomeUrl);
    } catch (err) {
      return;
    }
    // (the search page itself: a search from it, or anywhere else, shows
    // its address as usual from then on)
    if (location.prePath !== home.prePath || location.filePath !== home.filePath) {
      tab.ziaBlankAddress = false;
      return;
    }
    const clear = () => {
      if (gBrowser.selectedTab !== tab || tab.ziaTypedInPage || !tab.ziaBlankAddress) {
        return;
      }
      // (what's in the bar is still the page's own address, not typing)
      const shown = gURLBar.value || "";
      if (shown && (gURLBar.valueIsTyped || !location.spec.includes(shown.replace(/^https?:\/\//, "").replace(/\/$/, "")))) {
        tab.ziaBlankAddress = false;
        return;
      }
      browser.userTypedValue = "";
      gURLBar.value = "";
    };
    clear();
    requestAnimationFrame(clear);
  }

  function closeNewTabUrlbar(tab) {
    if (!searchHomeUrl || !newTabSearchEnabled()) {
      return;
    }
    if (focusAddressBarOnNewTab()) {
      keepNewTabUrlbar(tab);
      return;
    }
    requestAnimationFrame(() => {
      try {
        if (!gURLBar?.focused || gBrowser.selectedTab !== tab) {
          return;
        }
        gURLBar.view?.close();
        gURLBar.blur();
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
    watchPrefs("zia.newtab.search-engine", applyNewTabPage);
    window.addEventListener("unload", () => Services.obs.removeObserver(applyNewTabPage, "browser-search-engine-modified"));
  }

