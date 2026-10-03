  // Zen's Library (Zen 1.23): its Downloads gets a Clear button, as
  // Firefox's own downloads list has, which clears the finished downloads
  // (and their history), leaving any still going. Zen builds the Library
  // after the sidebar the first time it opens, and each section as it's
  // shown, so Zia watches for those.
  function libraryDownloadsCommon() {
    if (window.DownloadsCommon) {
      return window.DownloadsCommon;
    }
    for (const url of ["moz-src:///browser/components/downloads/DownloadsCommon.sys.mjs", "resource:///modules/DownloadsCommon.sys.mjs"]) {
      try {
        return ChromeUtils.importESModule(url).DownloadsCommon;
      } catch (err) {
        // the other place
      }
    }
    return null;
  }

  function clearFinishedDownloads() {
    const common = libraryDownloadsCommon();
    if (!common) {
      return;
    }
    common.getData(window, true).removeFinished();
    // (as Firefox's own Clear Downloads does: their entries in history too)
    if (!PrivateBrowsingUtils.isWindowPrivate(window)) {
      PlacesUtils.history
        .removeVisitsByFilter({ transition: PlacesUtils.history.TRANSITIONS.DOWNLOAD })
        .catch((err) => noteError("library: clear download history", err));
    }
  }

  function addDownloadsClearButton(section) {
    const header = section.querySelector(".zen-library-search-header");
    if (!header || header.querySelector(".zia-library-clear")) {
      return;
    }
    const button = document.createElementNS(HTML_NS, "button");
    button.className = "zen-library-filter-button zia-library-clear";
    button.textContent = "Clear";
    button.title = "Clear finished downloads";
    button.addEventListener("click", () => {
      try {
        clearFinishedDownloads();
      } catch (err) {
        console.error("[Zia] Couldn't clear the downloads:", err);
      }
    });
    header.append(button);
  }

  function watchLibrary() {
    const toolbox = document.getElementById("navigator-toolbox");
    if (!toolbox?.parentElement) {
      return;
    }
    let library = null;
    let sectionWatch = null;
    const findSections = () => {
      for (const section of library?.querySelectorAll("zen-library-downloads-section") || []) {
        addDownloadsClearButton(section);
      }
    };
    const findLibrary = () => {
      const found = toolbox.parentElement.querySelector(":scope > zen-library");
      if (!found || found === library) {
        return;
      }
      library = found;
      sectionWatch?.disconnect();
      sectionWatch = new MutationObserver(findSections);
      sectionWatch.observe(library, { childList: true, subtree: true });
      findSections();
    };
    new MutationObserver(findLibrary).observe(toolbox.parentElement, { childList: true });
    findLibrary();
  }

