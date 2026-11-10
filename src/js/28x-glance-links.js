  // ---------- Links in Glance (zia.glance.links, #592): with it on, a plain click on a link
  // opens it in Glance, every link or only those to another site, and Shift+click opens it in
  // a new tab. ZiaChild takes the click in the page; here it's checked again (the setting, a web
  // address, one the page itself may open) and opened. The setting and Glance's own tabs (a
  // glance can't open another: links inside one go on as usual) are shared with the pages.
  // Used elsewhere: watchGlanceLinks.
  const GLANCE_LINKS_PREF = "zia.glance.links";

  function watchGlanceLinks() {
    window.ziaOpenLink = (browser, data) => {
      const mode = Services.prefs.getStringPref(GLANCE_LINKS_PREF, "off");
      if ((mode !== "other" && mode !== "all") || !browser?.isConnected || typeof data?.url !== "string") {
        return;
      }
      try {
        const uri = Services.io.newURI(data.url);
        if (!uri.schemeIs("http") && !uri.schemeIs("https")) {
          return;
        }
        const principal = browser.contentPrincipal;
        Services.scriptSecurityManager.checkLoadURIWithPrincipal(principal, uri, Ci.nsIScriptSecurityManager.STANDARD);
        if (data.tab) {
          const referrerInfo = Cc["@mozilla.org/referrer-info;1"].createInstance(Ci.nsIReferrerInfo);
          referrerInfo.init(Ci.nsIReferrerInfo.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, true, browser.currentURI);
          openLinkIn(uri.spec, "tab", {
            triggeringPrincipal: principal,
            referrerInfo,
            relatedToCurrent: true,
            inBackground: false,
            userContextId: Number(browser.getAttribute("usercontextid")) || 0,
          });
        } else {
          window.gZenGlanceManager?.openGlance({ url: uri.spec, triggeringPrincipal: principal });
        }
      } catch (err) {
        noteError("links in glance: open", err);
      }
    };

    // the setting, for the pages to read (a website's process isn't shown Zia's own settings)
    const shareMode = () => {
      Services.ppmm.sharedData.set("zia:glance-links", Services.prefs.getStringPref(GLANCE_LINKS_PREF, "off"));
      Services.ppmm.sharedData.flush();
    };
    watchPrefs(GLANCE_LINKS_PREF, shareMode);
    shareMode();

    // the browsers showing a glance, in every window, for the pages to read
    const listGlances = () => {
      const ids = [];
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        for (const tab of win.gBrowser?.tabs || []) {
          if (tab.hasAttribute("zen-glance-tab") && tab.linkedBrowser?.browserId) {
            ids.push(tab.linkedBrowser.browserId);
          }
        }
      }
      Services.ppmm.sharedData.set("zia:glance-browsers", ids);
      Services.ppmm.sharedData.flush();
    };
    new MutationObserver(listGlances).observe(gBrowser.tabContainer, { subtree: true, attributes: true, attributeFilter: ["zen-glance-tab"] });
    gBrowser.tabContainer.addEventListener("TabClose", () => setTimeout(listGlances, 0));
    window.addEventListener("unload", () => setTimeout(listGlances, 0), { once: true });
    listGlances();
  }

