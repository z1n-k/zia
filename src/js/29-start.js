  // Zia's start: every feature wired up in turn once the window is ready, each on its own so
  // one failing leaves the rest working. Also here: Zen's haptics muted for a drag, the pinned
  // tabs' line, tabs that can't unload, the sidebar kept from scrolling sideways, and the
  // selected tab's edge glow.
  // Used elsewhere: safely, zenHaptic, HAPTIC_PREF, hapticsWereOn, muteZenHaptics, canUnload,
  // currentSeparator.

  // (a drag's haptics put back this long after the pointer's let go, if it never finished)
  const HAPTICS_SETTLE_MS = 800;
  const EDGE_GLOW_RECHECK_MS = 250;
  const EDGE_GLOW_AFTER_DRAG_MS = 450;
  const EDGE_GLOW_POLL_MS = 1000;
  const SELECT_COLOR_CHECKS_MS = [60, 400];
  const LOADED_COLOR_CHECKS_MS = [50, 800, 2000, 4500];
  const SAME_PAGE_COLOR_CHECK_MS = 150;
  const CLOSED_TEXT_FIRST_MS = 800;

  function safely(name, fn) {
    try {
      fn();
    } catch (err) {
      console.error(`[Zia] ${name} failed:`, err);
    }
  }

  let zenHaptic = null;

  // Zen buzzes on its own drag events, which would double up with Zia's taps,
  // so its haptics are switched off for the length of a drag. That's a saved
  // pref, so Zia marks when it's done so (MUTE_MARK) and undoes its own change
  // rather than writing one: a drag that never finishes cleanly (Zen quit
  // mid-drag, a cancelled drop) is put right shortly after the pointer is
  // released, or on the next launch at the latest.
  const HAPTIC_PREF = "zen.haptic-feedback.enabled";
  const MUTE_MARK = "zia.haptics.muted";
  const REPAIRED_MARK = "zia.haptics.repaired";
  let hapticsWereOn = null;
  let hapticsHadUserValue = false;
  function restoreHaptics(hadUserValue) {
    if (hadUserValue) {
      Services.prefs.setBoolPref(HAPTIC_PREF, true);
    } else {
      Services.prefs.clearUserPref(HAPTIC_PREF);
      if (!Services.prefs.getBoolPref(HAPTIC_PREF, true)) {
        Services.prefs.setBoolPref(HAPTIC_PREF, true);
      }
    }
    Services.prefs.clearUserPref(MUTE_MARK);
  }
  function muteZenHaptics(muted) {
    try {
      if (muted && hapticsWereOn === null) {
        hapticsWereOn = Services.prefs.getBoolPref(HAPTIC_PREF, true);
        hapticsHadUserValue = Services.prefs.prefHasUserValue(HAPTIC_PREF);
        if (hapticsWereOn) {
          Services.prefs.setBoolPref(MUTE_MARK, true);
          Services.prefs.setBoolPref(HAPTIC_PREF, false);
        }
      } else if (!muted && hapticsWereOn !== null) {
        const was = hapticsWereOn;
        hapticsWereOn = null;
        if (was) {
          restoreHaptics(hapticsHadUserValue);
        }
      }
    } catch (err) {
      noteError("start: muteZenHaptics", err);
    }
  }

  function watchHapticsMute() {
    // Left muted by a drag that didn't finish (or a quit mid-drag)
    try {
      if (Services.prefs.getBoolPref(MUTE_MARK, false) && hapticsWereOn === null) {
        restoreHaptics(false);
      }
      // Before 2.40.1 the mute wasn't marked, so a drag that didn't finish left
      // haptics off with no trace. Put them back once. Anyone who turns them
      // off again afterwards is left alone.
      if (!Services.prefs.getBoolPref(REPAIRED_MARK, false)) {
        Services.prefs.setBoolPref(REPAIRED_MARK, true);
        if (hapticsWereOn === null && !Services.prefs.getBoolPref(HAPTIC_PREF, true)) {
          restoreHaptics(false);
        }
      }
    } catch (err) {
      noteError("start: watchHapticsMute", err);
    }
    let timer = 0;
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const dragging =
          root.hasAttribute("zia-dragging-tab") || !!document.querySelector(".tabbrowser-tab[zia-essential-dragged]");
        if (hapticsWereOn !== null && !dragging) {
          muteZenHaptics(false);
        }
      }, HAPTICS_SETTLE_MS);
    };
    for (const type of ["dragend", "drop", "mouseup"]) {
      window.addEventListener(type, settle, true);
    }
  }

  function quietZenHaptics() {
    const service = Services.zen;
    if (typeof service?.playHapticFeedback === "function") {
      zenHaptic = () => service.playHapticFeedback();
    }
  }

  function canUnload(tab) {
    return tab?.linkedBrowser?.isRemoteBrowser !== false;
  }

  function watchUnloadable() {
    const mark = (tab) => {
      if (!tab?.isConnected) {
        return;
      }
      tab.toggleAttribute("zia-no-unload", tab.pinned && !tab.hasAttribute("zen-essential") && !canUnload(tab));
    };
    const markAll = () => gBrowser.tabs.forEach(mark);
    for (const type of ["TabOpen", "TabPinned", "TabUnpinned", "TabSelect", "TabAttrModified"]) {
      gBrowser.tabContainer.addEventListener(type, (event) => mark(event.target));
    }
    gBrowser.addTabsProgressListener({
      onLocationChange(browser) {
        mark(gBrowser.getTabForBrowser(browser));
      },
    });
    markAll();
  }

  function currentSeparator() {
    const own = window.gZenWorkspaces?.pinnedTabsContainer?.querySelector?.(".pinned-tabs-container-separator");
    if (own) {
      return own;
    }
    const all = document.querySelectorAll(".pinned-tabs-container-separator");
    for (const sep of all) {
      const box = sep.getBoundingClientRect();
      if (box.width > 0 && sep.checkVisibility?.({ visibilityProperty: true }) !== false) {
        return sep;
      }
    }
    return all[0] || null;
  }

  // The sidebar only ever scrolls up and down. Where its tab list is a few
  // pixels wider than the sidebar (on Linux), selecting a tab scrolled it
  // sideways into view too, so the tabs shifted over against the page and
  // the essentials were cut off on both sides. Any sideways scroll goes
  // straight back.
  function keepSidebarUnscrolledSideways() {
    const toolbox = document.getElementById("navigator-toolbox");
    const LISTS = "#zen-tabs-wrapper, .workspace-arrowscrollbox, #tabbrowser-arrowscrollbox, .zen-essentials-container";
    toolbox?.addEventListener("scroll", (event) => {
      const target = event.target;
      if (!target?.matches?.(LISTS)) {
        return;
      }
      for (const el of [target, target.scrollbox]) {
        if (el?.scrollLeft) {
          el.scrollLeft = 0;
        }
      }
    }, { capture: true, passive: true });
  }

  function watchEdgeGlow() {
    let pending = 0;
    const update = () => {
      pending = 0;
      if (!gBrowser?.selectedTab) {
        return;
      }
      for (const el of document.querySelectorAll("[zia-no-glow]")) {
        el.removeAttribute("zia-no-glow");
      }
      const tab = gBrowser.selectedTab;
      if (tab.hasAttribute("zen-essential")) {
        return;
      }
      // (a split glows as a whole: at the top, it's the split that goes
      // without, whichever of its tabs is open)
      const split = tab.group?.hasAttribute?.("split-view-group") ? tab.group : null;
      const glowing = split || tab;
      const sections = [
        window.gZenWorkspaces?.pinnedTabsContainer,
        window.gZenWorkspaces?.activeWorkspaceStrip,
      ].filter(Boolean);
      if (sections.length) {
        const rows = shownRowsIn(sections);
        if (rows[0] === tab || (split && split.contains(rows[0]))) {
          glowing.setAttribute("zia-no-glow", "true");
        }
        return;
      }
      const mine = glowing.getBoundingClientRect();
      if (!mine.height) {
        return;
      }
      if (!hasRowAbove(tab, split, mine)) {
        glowing.setAttribute("zia-no-glow", "true");
      }
    };
    const soon = () => {
      update();
      if (!pending) {
        pending = requestAnimationFrame(update);
      }
      // (not kept: each change gets its own late look, cancelled it'd miss a later layout)
      setTimeout(update, EDGE_GLOW_RECHECK_MS);
    };
    for (const type of [
      "TabSelect", "TabOpen", "TabClose", "TabMove", "TabPinned", "TabUnpinned", "TabGrouped",
      "TabUngrouped", "TabGroupCollapse", "TabGroupExpand", "TabShow", "TabHide",
    ]) {
      gBrowser.tabContainer.addEventListener(type, soon);
    }
    // (not kept: a drag's own late look, as each change gets one)
    window.addEventListener("dragend", () => setTimeout(soon, EDGE_GLOW_AFTER_DRAG_MS), true);

    // (runs as long as the window: the catch-all for changes no event reports)
    setInterval(update, EDGE_GLOW_POLL_MS);
    soon();
  }

  function shownRowsIn(sections) {
    const rows = [];
    for (const section of sections) {
      for (const row of section.querySelectorAll(
        ".tabbrowser-tab:not([zen-essential], [zen-empty-tab], [hidden]), .tab-group-label-container"
      )) {
        const box = row.getBoundingClientRect();
        if (box.height > 4 && row.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false) {
          rows.push(row);
        }
      }
    }
    return rows;
  }

  function hasRowAbove(tab, split, mine) {
    let above = false;
    for (const row of document.querySelectorAll(
      "#tabbrowser-tabs .tabbrowser-tab:not([zen-essential], [zen-empty-tab], [hidden]), #tabbrowser-tabs .tab-group-label-container"
    )) {
      if (row === tab || (split && split.contains(row))) {
        continue;
      }
      const box = row.getBoundingClientRect();
      if (!box.height || !box.width || box.right <= mine.left || box.left >= mine.right) {
        continue;
      }
      if (row.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) {
        continue;
      }
      above ||= box.bottom <= mine.top + 1;
    }
    return above;
  }

  // Each phase starts its features in the order they've always started (applyZenDefaults
  // first of all: the others read the defaults it sets)
  function start() {
    if (isLittleZenWindow()) {
      return;
    }
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");

    startSettingsAndPages();
    startTabsAndFolders();
    startMediaAndSplits();
    startPanelsAndAddressBar();
    startIconsFoldersAndEssentials();
    watchTabSwitch();
    watchPageLoads();
    watchUrlbarText(urlbar);
    startRemainingFeatures(urlbar);

    updateColor();
    updateTitle();
  }

  function startSettingsAndPages() {
    safely("applyZenDefaults", applyZenDefaults);
    safely("setupIconPack", setupIconPack);
    safely("watchOptions", watchOptions);
    safely("watchUrlbarPosition", watchUrlbarPosition);
    safely("watchPipWindows", watchPipWindows);
    safely("watchMultiview", watchMultiview);
    safely("watchNewTabPage", watchNewTabPage);
    safely("createWorkspaceSlot", createWorkspaceSlot);
  }

  function startTabsAndFolders() {
    safely("watchTabAnimations", watchTabAnimations);
    safely("closeSplitTabsInPlace", closeSplitTabsInPlace);
    safely("moveTabsLikeDia", moveTabsLikeDia);
    safely("hideTabListScrollbars", hideTabListScrollbars);
    safely("addFolderBounce", addFolderBounce);
    safely("keepFolderNamesInCollapsedSpaces", keepFolderNamesInCollapsedSpaces);
    safely("tuckAwayUnopenedPins", tuckAwayUnopenedPins);
    safely("revealOpenSubfolders", revealOpenSubfolders);
    safely("keepSeparatorWhenPinsTuck", keepSeparatorWhenPinsTuck);
    safely("keepTabsHiddenAfterActiveLeaves", keepTabsHiddenAfterActiveLeaves);
    safely("openKeptFolderNames", openKeptFolderNames);
    safely("nameNewGroupsInPlace", nameNewGroupsInPlace);
    safely("hintNameFields", hintNameFields);
    safely("holdSidebarAfterNaming", holdSidebarAfterNaming);
    safely("allowEmojiFolderIcons", allowEmojiFolderIcons);
    safely("addFolderBookmarkItem", addFolderBookmarkItem);
    safely("addSettingsMenuItem", addSettingsMenuItem);
    safely("hideWwwInUrlbar", hideWwwInUrlbar);
    safely("watchRightEdges", watchRightEdges);
  }

  function startMediaAndSplits() {
    ifOn("media-player", "watchMediaGlow", watchMediaGlow);
    ifOn("media-player", "cardForPositionlessMedia", cardForPositionlessMedia);
    safely("keepMediaCardsInPlace", keepMediaCardsInPlace);
    safely("watchTabSoundBars", watchTabSoundBars);
    safely("watchSelectedTabGlow", watchSelectedTabGlow);
    safely("watchSplitDrop", watchSplitDrop);
    safely("watchSplitPanes", watchSplitPanes);
    ifOn("find-bar", "watchFindBars", watchFindBars);
    safely("watchSpaceColor", watchSpaceColor);
    safely("animateEssentialsAdds", animateEssentialsAdds);
    ifOn("undo-close", "watchUndoClose", watchUndoClose);
    ifOn("tab-numbers", "watchTabNumbers", watchTabNumbers);
  }

  function startPanelsAndAddressBar() {
    safely("watchWelcome", watchWelcome);
    safely("watchGlanceThumbs", watchGlanceThumbs);
    safely("watchButtonTooltips", watchButtonTooltips);
    safely("watchTipCards", watchTipCards);
    safely("watchSidebarPanels", watchSidebarPanels);
    safely("watchTypedAddress", watchTypedAddress);
    safely("setupAddressBarCommands", setupAddressBarCommands);
    safely("registerScrollActor", registerScrollActor);
    safely("registerPdfActor", registerPdfActor);
    safely("watchScrollInput", watchScrollInput);
    safely("createTitleElement", createTitleElement);
    safely("watchTitleOnly", watchTitleOnly);
    safely("watchCenteredAddress", watchCenteredAddress);
    safely("watchCenteredBar", watchCenteredBar);
    safely("watchScreenshotButtons", watchScreenshotButtons);
    safely("watchUltra", watchUltra);
    safely("addDownloadProgress", addDownloadProgress);
    safely("flyFirstDownloadToButton", flyFirstDownloadToButton);
    safely("flyDownloadRows", flyDownloadRows);
    safely("watchDownloadDialog", watchDownloadDialog);
  }

  function startIconsFoldersAndEssentials() {
    ifOn("icon-picker", "addIconPicker", addIconPicker);
    safely("watchCompactTopRow", watchCompactTopRow);
    safely("watchOldIcons", watchOldIcons);
    safely("watchNewFolders", watchNewFolders);
    safely("watchReopenedFolders", watchReopenedFolders);
    safely("keepRoomForEssentials", keepRoomForEssentials);
    safely("watchFolderColors", watchFolderColors);
    safely("watchFolderIcon", watchFolderIcon);
    safely("addFolderColorPicker", addFolderColorPicker);
    safely("watchGroupColors", watchGroupColors);
    safely("watchFolderCloseButtons", watchFolderCloseButtons);
    safely("watchEmptyFolders", watchEmptyFolders);
    safely("watchEssentialRows", watchEssentialRows);
    safely("watchSplitEssentials", watchSplitEssentials);
    safely("watchLightSpace", watchLightSpace);
    safely("watchSidebarPaint", watchSidebarPaint);
    safely("watchWindowButtonsSide", watchWindowButtonsSide);
    safely("addTabHoverCards", addTabHoverCards);
  }

  function watchTabSwitch() {
    gBrowser.tabContainer.addEventListener("TabSelect", () => {
      const browser = gBrowser.selectedBrowser;
      if (isLoading(browser) && !isErrorPage(browser)) {
        startLoader(0.25,  true);
      } else {
        cancelLoader();
      }
      snapColorForTab(browser);
      for (const ms of SELECT_COLOR_CHECKS_MS) {
        scheduleColor(ms);
      }
      updateTitle();
    });

    gBrowser.tabContainer.addEventListener("TabAttrModified", (event) => {
      if (event.target === gBrowser.selectedTab) {
        updateTitle();
      }
    });
  }

  function watchPageLoads() {
    gBrowser.addTabsProgressListener({
      onStateChange: onPageStateChange,

      onProgressChange(browser, webProgress, request, curSelf, maxSelf, curTotal, maxTotal) {
        if (browser === gBrowser.selectedBrowser && maxTotal > 0) {
          reportRealProgress(curTotal / maxTotal);
        }
      },

      onLocationChange: onPageLocationChange,
    });
  }

  function onPageStateChange(browser, webProgress, request, stateFlags) {
    const { STATE_START, STATE_STOP, STATE_IS_WINDOW } = Ci.nsIWebProgressListener;
    if (webProgress.isTopLevel && stateFlags & STATE_START) {
      blankLoadingNewTabAddress(browser, request);
    }
    if (!webProgress.isTopLevel || !(stateFlags & STATE_IS_WINDOW)) {
      return;
    }
    if (browser !== gBrowser.selectedBrowser) {
      return;
    }
    if (stateFlags & STATE_START) {
      scrollPositions.delete(browser);
      startLoader();
      colorRequestId++;
    } else if (stateFlags & STATE_STOP) {
      if (isErrorPage(browser)) {
        cancelLoader();
        showColor(ERROR_PAGE_COLOR);
      } else {
        finishLoader();
        for (const ms of LOADED_COLOR_CHECKS_MS) {
          scheduleColor(ms);
        }
      }
      updateTitle();
    }
  }

  function onPageLocationChange(browser, webProgress, request, location, flags) {
    const { LOCATION_CHANGE_SAME_DOCUMENT, LOCATION_CHANGE_ERROR_PAGE } = Ci.nsIWebProgressListener;
    if (!webProgress.isTopLevel) {
      return;
    }
    redirectBlankNewTab(browser, location, flags);
    keepNewTabAddressEmpty(browser, location);

    if (flags & LOCATION_CHANGE_ERROR_PAGE) {
      errorBrowsers.add(browser);
    } else if (!(flags & LOCATION_CHANGE_SAME_DOCUMENT)) {
      errorBrowsers.delete(browser);
      scrollPositions.delete(browser);
    }
    if (browser !== gBrowser.selectedBrowser) {
      return;
    }
    if (flags & LOCATION_CHANGE_ERROR_PAGE) {
      cancelLoader();
      showColor(ERROR_PAGE_COLOR);
    } else if (flags & LOCATION_CHANGE_SAME_DOCUMENT) {
      scheduleColor(SAME_PAGE_COLOR_CHECK_MS);
    } else {
      const known = rememberedSiteColor(browser);
      if (known) {
        applyColor(known);
      }
    }
    updateTitle();
  }

  function watchUrlbarText(urlbar) {
    new MutationObserver(updateTitle).observe(urlbar, {
      attributes: true,
      attributeFilter: ["pageproxystate"],
    });

    urlbar.addEventListener("mouseenter", rememberClosedText);
    urlbar.addEventListener(
      "mousedown",
      () => {
        rememberClosedText();
        clickedUrlbarAt = Date.now();
      },
      true
    );
    gBrowser.tabContainer.addEventListener("TabSelect", () => requestAnimationFrame(rememberClosedText));
    window.addEventListener("resize", () => requestAnimationFrame(rememberClosedText));
    // (not kept: one look once the address bar has settled after start-up)
    setTimeout(rememberClosedText, CLOSED_TEXT_FIRST_MS);
    new MutationObserver(alignOpenedUrlbarSoon).observe(urlbar, {
      attributes: true,
      attributeFilter: ["breakout-extend"],
    });
    window.addEventListener("resize", alignOpenedUrlbarSoon);
  }

  // (after the tab and page listeners above, as they always have)
  function startRemainingFeatures(urlbar) {
    safely("keepWholeUrlSelected", () => keepWholeUrlSelected(urlbar));
    safely("addCopyLinkButton", addCopyLinkButton);
    safely("addToastCloseButtons", addToastCloseButtons);
    safely("suckInEssentialGlances", suckInEssentialGlances);
    safely("animateNavButtons", animateNavButtons);
    safely("springReloadHover", springReloadHover);
    safely("watchEdgeGlow", watchEdgeGlow);
    safely("watchExtensionIcons", watchExtensionIcons);
    safely("keepSidebarUnscrolledSideways", keepSidebarUnscrolledSideways);
    safely("watchColorDrift", watchColorDrift);
    safely("watchPopUpColor", watchPopUpColor);
    safely("addToolbarColorMenuItems", addToolbarColorMenuItems);
    safely("quietZenHaptics", quietZenHaptics);
    safely("watchHapticsMute", watchHapticsMute);
    safely("watchUnloadable", watchUnloadable);
    safely("watchPageFullscreen", watchPageFullscreen);
    safely("watchSwipeArrow", watchSwipeArrow);
    safely("revertTypedTextOnLeave", () => revertTypedTextOnLeave(urlbar));
    safely("neverShowScheme", neverShowScheme);
    safely("dressLibrary", dressLibrary);
    safely("clearLibraryBadgeSoon", clearLibraryBadgeSoon);
    safely("loadTidyDownloads", loadTidyDownloads);
    safely("watchLiquidGlass", watchLiquidGlass);
    safely("fixSettingsConditions", fixSettingsConditions);
    safely("watchInstallCount", watchInstallCount);
  }

  if (window.gBrowserInit?.delayedStartupFinished) {
    start();
  } else {
    const observer = (subject) => {
      if (subject === window) {
        Services.obs.removeObserver(observer, "browser-delayed-startup-finished");
        start();
      }
    };
    Services.obs.addObserver(observer, "browser-delayed-startup-finished");
  }
})();
