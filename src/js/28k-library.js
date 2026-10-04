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

  // ---------- Media's tiles catch the light
  // Over a picture in the Library's Media, the tile leans a little towards
  // the cursor, its fine edge lights up nearest it, and the picture on it
  // lifts a touch, its shadow falling the other way (24-library.css draws
  // it from where the cursor is, set here). Still for anyone whose system
  // asks for less motion.
  function liftMediaUnderCursor(library) {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const TILT = 8;
    let current = null;
    const settle = (item) => {
      if (!item) {
        return;
      }
      item.removeAttribute("zia-lifting");
      for (const name of ["--zia-lift-rx", "--zia-lift-ry", "--zia-lift-sx", "--zia-lift-sy", "--zia-lift-mx", "--zia-lift-my", "--zia-lift"]) {
        item.style.removeProperty(name);
      }
    };
    library.addEventListener("pointermove", (event) => {
      const item = event.target.closest?.(".zen-library-media-item");
      if (item !== current) {
        settle(current);
        current = item;
      }
      if (!item || still.matches || libraryZenLook()) {
        return;
      }
      const box = item.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
      const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
      item.setAttribute("zia-lifting", "true");
      item.style.setProperty("--zia-lift", "1");
      item.style.setProperty("--zia-lift-ry", `${((x - 0.5) * 2 * TILT).toFixed(2)}deg`);
      item.style.setProperty("--zia-lift-rx", `${((0.5 - y) * 2 * TILT).toFixed(2)}deg`);
      item.style.setProperty("--zia-lift-sx", `${(-(x - 0.5) * 8).toFixed(1)}px`);
      item.style.setProperty("--zia-lift-sy", `${(-(y - 0.5) * 8).toFixed(1)}px`);
      item.style.setProperty("--zia-lift-mx", `${(x * 100).toFixed(1)}%`);
      item.style.setProperty("--zia-lift-my", `${(y * 100).toFixed(1)}%`);
    });
    library.addEventListener("pointerleave", () => {
      settle(current);
      current = null;
    });
  }

  // ---------- The chosen section's tile slides between sections
  // One lit tile behind the section buttons, moved to the chosen one, so
  // choosing another slides it there along the column, with Zia's spring,
  // rather than one going out and the other coming on (24-library.css).
  function railLibrarySections(library) {
    const column = library.querySelector("#zen-library-sidebar-tabs");
    if (!column) {
      return;
    }
    let rail = column.querySelector(":scope > .zia-library-rail");
    if (!rail) {
      rail = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      rail.className = "zia-library-rail";
      column.appendChild(rail);
      new ResizeObserver(() => placeRail(column, rail, true)).observe(column);
    }
    placeRail(column, rail, !rail.hasAttribute("placed"));
  }

  function placeRail(column, rail, instantly) {
    const tab = column.querySelector(".zen-library-tab[active]");
    if (!tab) {
      rail.hidden = true;
      return;
    }
    const box = tab.getBoundingClientRect();
    const top = box.top - column.getBoundingClientRect().top + column.scrollTop;
    if (!box.height) {
      return;
    }
    rail.hidden = false;
    rail.toggleAttribute("instant", instantly);
    rail.style.height = `${box.height}px`;
    rail.style.transform = `translateY(${top}px)`;
    rail.setAttribute("placed", "true");
    if (instantly) {
      requestAnimationFrame(() => rail.removeAttribute("instant"));
    }
  }

  // ---------- Clear in the Library's Downloads and History
  // Zen's Library lists every download but has no way to empty the list,
  // only to remove them one by one. A Clear button beside the filter does
  // what Firefox's own Clear Downloads does: the finished, failed and
  // cancelled ones leave the list and history (the files stay on disk,
  // and one still downloading stays). The section is drawn by Zen when
  // first shown and again after it's been put away, so the button is put
  // back whenever it's missing. History's Clear opens Firefox's own Clear
  // browsing data and cookies dialog, browsing history ticked, to choose
  // what goes.
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

    const clearHistory = () => {
      try {
        if (window.Sanitizer?.showUI) {
          window.Sanitizer.showUI(window);
        } else {
          document.getElementById("Tools:Sanitize")?.doCommand();
        }
      } catch (err) {
        console.warn("[Zia] Couldn't open Clear browsing data:", err);
      }
    };

    const CLEARS = [
      ["zen-library-downloads-section", "Clear downloads", "Clear downloads (the files stay)", clearDownloads],
      ["zen-library-history-section", "Clear history", "Clear history…", clearHistory],
    ];

    const addButtons = (library) => {
      if (libraryZenLook()) {
        for (const button of library.querySelectorAll(".zia-library-clear")) {
          button.remove();
        }
        return;
      }
      for (const [section, label, title, clear] of CLEARS) {
        for (const header of library.querySelectorAll(`${section} .zen-library-search-header`)) {
          if (header.querySelector(".zia-library-clear")) {
            continue;
          }
          const button = document.createElementNS(XHTML, "button");
          button.className = "zen-library-filter-button zia-library-clear";
          button.setAttribute("aria-label", label);
          button.title = title;
          button.addEventListener("click", clear);
          header.appendChild(button);
        }
      }
    };

    // the Library is only made the first time it's opened
    let watched = null;
    const sectionWatcher = new MutationObserver((records) => {
      addButtons(watched);
      if (!records.every((record) => record.target.classList?.contains("zia-library-rail"))) {
        safely("library: rail", () => railLibrarySections(watched));
      }
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
      sectionWatcher.observe(library, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "active"] });
      addButtons(library);
      safely("library: lift media", () => liftMediaUnderCursor(library));
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

