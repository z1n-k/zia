  // ---------- Clear in the Library's Downloads
  // Zen's Library lists every download but has no way to empty the list,
  // only to remove them one by one. A Clear button beside the filter does
  // what Firefox's own Clear Downloads does: the finished, failed and
  // cancelled ones leave the list and history (the files stay on disk,
  // and one still downloading stays). The section is drawn by Zen when
  // first shown and again after it's been put away, so the button is put
  // back whenever it's missing.
  function addLibraryClearDownloads() {
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

    const addButtons = (root) => {
      for (const header of root.querySelectorAll("zen-library-downloads-section .zen-library-search-header")) {
        if (header.querySelector(".zia-library-clear")) {
          continue;
        }
        const button = document.createElementNS(XHTML, "button");
        button.className = "zen-library-filter-button zia-library-clear";
        button.textContent = "Clear";
        button.title = "Clear the list (the files stay)";
        button.addEventListener("click", clearDownloads);
        header.appendChild(button);
      }
    };

    // the Library is only made the first time it's opened
    let watched = null;
    const sectionWatcher = new MutationObserver(() => addButtons(watched));
    const watchLibrary = () => {
      const library = document.querySelector("zen-library");
      if (!library || library === watched) {
        return;
      }
      watched = library;
      sectionWatcher.disconnect();
      sectionWatcher.observe(library, { childList: true, subtree: true });
      addButtons(library);
    };
    const toolbox = document.getElementById("navigator-toolbox");
    if (toolbox?.parentNode) {
      new MutationObserver(watchLibrary).observe(toolbox.parentNode, { childList: true });
    }
    watchLibrary();
  }

