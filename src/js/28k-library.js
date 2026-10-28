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
  // Each space's card in the Library light or dark as that space makes the window (Zen's own
  // call for it, from its colour), whatever the space now open: a light space's card had white
  // text in a dark one, and the other way round, its tabs too (24-library.css, #514)
  function inkLibrarySpaces(library) {
    for (const card of library.querySelectorAll(".zen-library-space[data-uuid]")) {
      const space = window.gZenWorkspaces?.getWorkspaceFromId?.(card.dataset.uuid);
      const dark = space ? window.gZenThemePicker?.getGradientForWorkspace?.(space, { getGradient: false })?.isDarkMode : undefined;
      if (typeof dark === "boolean" && card.getAttribute("zia-card-dark") !== String(dark)) {
        card.setAttribute("zia-card-dark", String(dark));
      }
    }
  }

  // How far the page beside the open Library covers its edge, measured as it is (24-library.css
  // keeps the Library clear of it by that much): Zen moves the page aside by its own reckoning
  // of the gaps round it, not Zia's, so it fell short or over by a few pixels, more or less
  // with the sidebar pinned or hidden (#476, #512)
  function fitLibraryToPage(library) {
    const measure = () => {
      if (!library.hasAttribute("open")) {
        return;
      }
      const page = document.getElementById("zen-appcontent-wrapper")?.getBoundingClientRect();
      const box = library.getBoundingClientRect();
      if (!page?.width || !box.width) {
        return;
      }
      const onRight = root.getAttribute("zen-right-side") === "true";
      const overlap = Math.max(0, Math.ceil(onRight ? page.right - box.left : box.right - page.left));
      setStyle(library, "--zia-lib-page-overlap", overlap ? `${overlap}px` : null);
    };
    // (once Zen's opening slide has settled, the page with it)
    for (const ms of [0, 350, 700]) {
      setTimeout(measure, ms);
    }
  }

  function railLibrarySections(library) {
    const column = library.querySelector("#zen-library-sidebar-tabs");
    if (!column) {
      return;
    }
    let rail = column.querySelector(":scope > .zia-library-rail");
    // (none with Zen's own Library look: unstyled but for its glass edge, it sat
    // as an empty box under the sections)
    if (libraryZenLook()) {
      rail?.remove();
      return;
    }
    if (!rail) {
      rail = document.createElementNS(XHTML_NS, "div");
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
    const moved = rail.hasAttribute("placed") && rail.style.transform !== `translateY(${top}px)`;
    rail.hidden = false;
    rail.toggleAttribute("instant", instantly);
    rail.style.height = `${box.height}px`;
    rail.style.transform = `translateY(${top}px)`;
    rail.setAttribute("placed", "true");
    if (instantly) {
      requestAnimationFrame(() => rail.removeAttribute("instant"));
    } else if (moved && ultraOn()) {
      // (with Ultra on, it stretches and squashes on the way, 28s-ultra.js)
      ultraRailSquash(rail);
    }
  }

  // ---------- The Library button's picture of the last download clears itself
  // Zen leaves a small picture of the last download on the Library button
  // until the button is next hovered. It shows as the file flies in, then
  // clears a few seconds later (a download under way keeps its ring).
  function clearLibraryBadgeSoon() {
    const foot = document.getElementById("zen-sidebar-foot-buttons");
    if (!foot) {
      return;
    }
    let timer = null;
    const check = () => {
      clearTimeout(timer);
      if (!foot.hasAttribute("zen-library-badge")) {
        return;
      }
      timer = setTimeout(() => {
        const badge = document.getElementById("library-button-badge");
        if (!badge?.hasAttribute("downloading") && !foot.hasAttribute("zen-library-stack-open")) {
          foot.removeAttribute("zen-library-badge");
        }
      }, 4000);
    };
    new MutationObserver(check).observe(foot, { attributes: true, attributeFilter: ["zen-library-badge"] });
    check();
  }

  // ---------- Clear in the Library's Downloads and History
  // Zen's Library can only remove downloads one by one: Clear does what Firefox's
  // Clear Downloads does (finished ones leave the list and history, the files stay).
  // Zen redraws the section, so it's put back whenever missing. History's Clear
  // opens Firefox's Clear browsing data dialog.
  function dressLibrary() {
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
          const button = document.createElementNS(XHTML_NS, "button");
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
      safely("library: space inks", () => inkLibrarySpaces(watched));
      if (!records.every((record) => record.target.classList?.contains("zia-library-rail"))) {
        safely("library: rail", () => railLibrarySections(watched));
      }
      if (records.some((record) => record.target === watched && record.attributeName === "open") && watched.hasAttribute("open")) {
        safely("library: rows", matchLibraryRowsToTabs);
        safely("library: page overlap", () => fitLibraryToPage(watched));
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
    window.addEventListener("resize", () => watched && safely("library: page overlap", () => fitLibraryToPage(watched)));
    // (and before the downloads fan out above the Library button)
    document.getElementById("zen-library-button")?.addEventListener("mouseenter", () => safely("library: rows", matchLibraryRowsToTabs));
    safely("library: rows", matchLibraryRowsToTabs);
    watchPrefs(LIBRARY_ZEN_LOOK_PREF, () => {
      if (watched) {
        addButtons(watched);
        safely("library: rail", () => railLibrarySections(watched));
      }
    });
  }

