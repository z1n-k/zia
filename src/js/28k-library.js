  // ---------- Zen's Library: Clear in Downloads, and rows measured off the tabs
  // Off with "Zen's own Library look" (zia.library.zen-look): Zia leaves the
  // Library as Zen draws it (24-library.css is off then too).
  const LIBRARY_ZEN_LOOK_PREF = "zia.library.zen-look";
  const libraryZenLook = () => Services.prefs.getBoolPref(LIBRARY_ZEN_LOOK_PREF, false);

  // The Library's rows (and the downloads that fan out above its button)
  // take the tabs' own padding before the icon and gap after it, measured
  // off a tab as the Bookmarks and History panels' rows are
  // (28h-sidebar-panels.js)
  function matchLibraryRowsToTabs() {
    const sizes = tabMeasurements();
    if (!sizes) {
      return;
    }
    root.style.setProperty("--zia-lib-row-pad", sizes["--zia-row-pad"]);
    root.style.setProperty("--zia-lib-icon-gap", sizes["--zia-row-icon-gap"]);
  }

  // ---------- Clear in the Library's Downloads
  // Zen's Library lists every download but has no way to empty the list,
  // only to remove them one by one. A Clear button beside the filter does
  // what Firefox's own Clear Downloads does: the finished, failed and
  // cancelled ones leave the list and history (the files stay on disk,
  // and one still downloading stays). The section is drawn by Zen when
  // first shown and again after it's been put away, so the button is put
  // back whenever it's missing.
  function dressLibrary() {
    const XHTML = "http://www.w3.org/1999/xhtml";

    const clearDownloads = () => {
      try {
        window.DownloadsCommon.getData(window, true).removeFinished();
      } catch (err) {
        console.warn("[Zia] Couldn't clear the downloads:", err);
      }
      if (!window.PrivateBrowsingUtils?.isWindowPrivate(window)) {
        PlacesUtils.history
          .removeVisitsByFilter({ transition: PlacesUtils.history.TRANSITIONS.DOWNLOAD })
          .catch((err) => console.warn("[Zia] Couldn't clear the downloads' history:", err));
      }
    };

    const addButtons = (library) => {
      if (libraryZenLook()) {
        for (const button of library.querySelectorAll(".zia-library-clear")) {
          button.remove();
        }
        return;
      }
      for (const header of library.querySelectorAll("zen-library-downloads-section .zen-library-search-header")) {
        if (header.querySelector(".zia-library-clear")) {
          continue;
        }
        const button = document.createElementNS(XHTML, "button");
        button.className = "zen-library-filter-button zia-library-clear";
        button.setAttribute("aria-label", "Clear downloads");
        button.title = "Clear downloads (the files stay)";
        button.addEventListener("click", clearDownloads);
        header.appendChild(button);
      }
    };

    // the Library is only made the first time it's opened
    let watched = null;
    const sectionWatcher = new MutationObserver((records) => {
      addButtons(watched);
      if (records.some((record) => record.target === watched && record.attributeName === "open") && watched.hasAttribute("open")) {
        safely("library: rows", matchLibraryRowsToTabs);
      }
    });
    const watchLibrary = () => {
      const library = document.querySelector("zen-library");
      if (!library || library === watched) {
        return;
      }
      watched = library;
      sectionWatcher.disconnect();
      sectionWatcher.observe(library, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
      addButtons(library);
    };
    const toolbox = document.getElementById("navigator-toolbox");
    if (toolbox?.parentNode) {
      new MutationObserver(watchLibrary).observe(toolbox.parentNode, { childList: true });
    }
    watchLibrary();
    // (and before the downloads fan out above the Library button)
    document.getElementById("zen-library-button")?.addEventListener("mouseenter", () => safely("library: rows", matchLibraryRowsToTabs));
    safely("library: rows", matchLibraryRowsToTabs);
    Services.prefs.addObserver(LIBRARY_ZEN_LOOK_PREF, () => watched && addButtons(watched));
  }

