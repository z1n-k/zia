
  // Firefox's own sidebar panels (Bookmarks, History, Synced Tabs) are
  // pages of their own inside the panel, which Zia's chrome.css doesn't
  // reach: zia-sidebar.css is loaded into each as it opens. The panel's
  // frame is styled in chrome.css. On unless switched off in settings.
  const SIDEBAR_PANELS_PREF = "zia.sidebar-panels.style";
  // fresh each session, so an updated Zia's styles aren't served from cache
  const SIDEBAR_SHEET = `chrome://sine/content/zia/zia-sidebar.css?${Date.now()}`;

  function watchSidebarPanels() {
    const on = () => Services.prefs.getBoolPref(SIDEBAR_PANELS_PREF, true);
    const styled = new WeakSet();
    const style = () => {
      const win = document.getElementById("sidebar")?.contentWindow;
      const doc = win?.document;
      if (!doc || doc.documentURI === "about:blank") {
        return;
      }
      try {
        // switched off with a panel open: its styles go straight away
        if (!on()) {
          if (styled.has(doc)) {
            win.windowUtils.removeSheetUsingURIString(SIDEBAR_SHEET, win.windowUtils.AUTHOR_SHEET);
            styled.delete(doc);
          }
        } else if (!styled.has(doc)) {
          win.windowUtils.loadSheetUsingURIString(SIDEBAR_SHEET, win.windowUtils.AUTHOR_SHEET);
          styled.add(doc);
        }
      } catch (err) {
        noteError("sidebar panels: style", err);
      }
    };
    const markPlain = () => {
      setFlag("zia-panels-plain", !on());
      style();
    };
    markPlain();
    Services.prefs.addObserver(SIDEBAR_PANELS_PREF, markPlain);
    window.addEventListener("unload", () => Services.prefs.removeObserver(SIDEBAR_PANELS_PREF, markPlain));
    // each panel's page loads into the same #sidebar browser
    document.getElementById("sidebar")?.addEventListener("load", style, true);
  }
