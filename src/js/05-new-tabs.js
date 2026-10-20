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
      if (compactToolbarHidden()) {
        floatUrlbar();
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
  function isSearchHome(uri) {
    try {
      const home = Services.io.newURI(searchHomeUrl);
      return uri.prePath === home.prePath && uri.filePath === home.filePath;
    } catch (err) {
      return false;
    }
  }

  function clearNewTabAddress(browser, tab, uri) {
    const clear = () => {
      if (gBrowser.selectedTab !== tab || tab.ziaTypedInPage || !tab.ziaBlankAddress) {
        return;
      }
      // (what's in the bar is still the page's own address, not typing)
      const shown = gURLBar.value || "";
      if (shown && (gURLBar.valueIsTyped || !uri.spec.includes(shown.replace(/^https?:\/\//, "").replace(/\/$/, "")))) {
        tab.ziaBlankAddress = false;
        return;
      }
      browser.userTypedValue = "";
      gURLBar.value = "";
    };
    clear();
    requestAnimationFrame(clear);
  }

  function keepNewTabAddressEmpty(browser, location) {
    const tab = gBrowser.getTabForBrowser?.(browser);
    if (!tab?.ziaBlankAddress || !searchHomeUrl || !location) {
      return;
    }
    if (tab.ziaTypedInPage || location.spec === "about:newtab" || location.spec === "about:blank") {
      return;
    }
    // (the search page itself: a search from it, or anywhere else, shows
    // its address as usual from then on)
    if (!isSearchHome(location)) {
      tab.ziaBlankAddress = false;
      return;
    }
    clearNewTabAddress(browser, tab, location);
  }

  // Firefox shows the address a new tab is loading as soon as the load
  // starts, so the search page's sat in the bar until it arrived, a second
  // or two on a slow connection: it's cleared from the start of the load
  function blankLoadingNewTabAddress(browser, request) {
    const tab = gBrowser.getTabForBrowser?.(browser);
    if (!tab?.ziaBlankAddress || tab.ziaTypedInPage || !searchHomeUrl) {
      return;
    }
    let uri = null;
    try {
      uri = request?.QueryInterface(Ci.nsIChannel).originalURI;
    } catch (err) {
      return;
    }
    if (uri && isSearchHome(uri)) {
      clearNewTabAddress(browser, tab, uri);
    }
  }

  // Compact mode with Zen's top toolbar hidden: Zen brings the toolbar out while
  // the address bar has the cursor, so a new tab's, ready to type in, held it out
  // till the tab was left
  function compactToolbarHidden() {
    return (
      root.getAttribute("zen-compact-mode") === "true" &&
      root.getAttribute("zen-single-toolbar") !== "true" &&
      root.getAttribute("zia-urlbar-position") !== "bottom" &&
      Services.prefs.getBoolPref("zen.view.compact.hide-toolbar", false)
    );
  }

  // ...so there it opens floating over the new tab, as Zen's own new tab does,
  // and the toolbar stays hidden (16-compact-mode.css). (Zen's way in: an empty
  // search, which opens the bar's list.)
  function floatUrlbar() {
    try {
      if (!gURLBar.focused || !gURLBar.hasAttribute("breakout-extend")) {
        gURLBar.search("");
      }
    } catch (err) {
      noteError("new tabs: floatUrlbar", err);
    }
  }

  function floatNewTabUrlbar(tab) {
    requestAnimationFrame(() => {
      if (gBrowser.selectedTab === tab && gURLBar.focused && !gURLBar.value) {
        floatUrlbar();
      }
    });
  }

  // A new tab's address bar, empty and with the cursor in it as Firefox leaves it, is let
  // go of unless "New tabs start in the address bar" is on: the page has the typing (its
  // own search box). For any new tab page, an extension's or Zen's as well as the search
  // engine's: left with the cursor, Zen floated the bar over the middle of the page,
  // the toolbar's address field left empty.
  function closeNewTabUrlbar(tab) {
    if (focusAddressBarOnNewTab()) {
      if (searchHomeUrl && newTabSearchEnabled()) {
        keepNewTabUrlbar(tab);
      } else if (compactToolbarHidden()) {
        floatNewTabUrlbar(tab);
      }
      return;
    }
    let touched = false;
    const touch = () => (touched = true);
    gURLBar?.textbox?.addEventListener("mousedown", touch, { once: true });
    gURLBar?.inputField?.addEventListener("input", touch, { once: true });
    const letGo = () => {
      try {
        if (touched || !gURLBar?.focused || gBrowser.selectedTab !== tab || gURLBar.value) {
          return;
        }
        gURLBar.view?.close();
        gURLBar.blur();
        gBrowser.selectedBrowser?.focus();
      } catch (err) {
        noteError("new tabs: closeNewTabUrlbar", err);
      }
    };
    requestAnimationFrame(letGo);
    // (an extension's page, arriving, can put the cursor back in the bar)
    for (const ms of [250, 700]) {
      setTimeout(letGo, ms);
    }
    setTimeout(() => {
      gURLBar?.textbox?.removeEventListener("mousedown", touch);
      gURLBar?.inputField?.removeEventListener("input", touch);
    }, 800);
  }

  function watchNewTabPage() {
    applyNewTabPage();
    gBrowser.tabContainer.addEventListener("TabOpen", (event) => closeNewTabUrlbar(event.target));
    Services.obs.addObserver(applyNewTabPage, "browser-search-engine-modified");
    watchPrefs("zia.newtab.search-engine", applyNewTabPage);
    window.addEventListener("unload", () => Services.obs.removeObserver(applyNewTabPage, "browser-search-engine-modified"));
  }

