  function safely(name, fn) {
    try {
      fn();
    } catch (err) {
      console.error(`[Zia] ${name} failed:`, err);
    }
  }

  function matchTabCorners() {
    const button = document.querySelector("#vertical-tabs-newtab-button, #tabs-newtab-button");
    if (!button) {
      return;
    }
    const shape = getComputedStyle(button).getPropertyValue("corner-top-left-shape").trim();
    if (shape) {
      root.style.setProperty("--zia-tab-corner", shape);
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
      }, 800);
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

  function watchEdgeGlow() {
    let pending = 0;
    const update = () => {
      pending = 0;
      if (!gBrowser?.selectedTab) {
        return;
      }
      for (const tab of document.querySelectorAll(".tabbrowser-tab[zia-no-glow]")) {
        tab.removeAttribute("zia-no-glow");
      }
      const tab = gBrowser.selectedTab;
      if (!tab || tab.hasAttribute("zen-essential")) {
        return;
      }

      const sections = [
        window.gZenWorkspaces?.pinnedTabsContainer,
        window.gZenWorkspaces?.activeWorkspaceStrip,
      ].filter(Boolean);
      if (sections.length) {
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
        if (rows[0] === tab) {
          tab.setAttribute("zia-no-glow", "true");
        }
        return;
      }
      const mine = tab.getBoundingClientRect();
      if (!mine.height) {
        return;
      }
      let above = false;
      let below = false;
      for (const row of document.querySelectorAll(
        "#tabbrowser-tabs .tabbrowser-tab:not([zen-essential], [zen-empty-tab], [hidden]), #tabbrowser-tabs .tab-group-label-container"
      )) {
        if (row === tab) {
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
        below ||= box.top >= mine.bottom - 1;
      }
      if (!above) {
        tab.setAttribute("zia-no-glow", "true");
      }
    };
    const soon = () => {
      update();
      if (!pending) {
        pending = requestAnimationFrame(update);
      }

      setTimeout(update, 250);
    };
    for (const type of [
      "TabSelect", "TabOpen", "TabClose", "TabMove", "TabPinned", "TabUnpinned", "TabGrouped",
      "TabUngrouped", "TabGroupCollapse", "TabGroupExpand", "TabShow", "TabHide",
    ]) {
      gBrowser.tabContainer.addEventListener(type, soon);
    }
    window.addEventListener("dragend", () => setTimeout(soon, 450), true);

    setInterval(update, 1000);
    soon();
  }

  function start() {
    const urlbar = gURLBar.textbox || document.getElementById("urlbar");

    safely("applyZenDefaults", applyZenDefaults);
    safely("watchOptions", watchOptions);
    safely("watchUrlbarPosition", watchUrlbarPosition);
    safely("watchPipWindows", watchPipWindows);
    safely("watchMultiview", watchMultiview);
    safely("watchNewTabPage", watchNewTabPage);
    safely("createWorkspaceSlot", createWorkspaceSlot);
    safely("watchTabAnimations", watchTabAnimations);
    safely("moveTabsLikeDia", moveTabsLikeDia);
    safely("addFolderBounce", addFolderBounce);
    safely("allowEmojiFolderIcons", allowEmojiFolderIcons);
    safely("hideWwwInUrlbar", hideWwwInUrlbar);
    safely("watchRightEdges", watchRightEdges);
    ifOn("media-player", "watchMediaGlow", watchMediaGlow);
    safely("keepMediaCardsInPlace", keepMediaCardsInPlace);
    safely("watchTabSoundBars", watchTabSoundBars);
    safely("watchSelectedTabGlow", watchSelectedTabGlow);
    safely("watchSplitDrop", watchSplitDrop);
    safely("watchSplitPanes", watchSplitPanes);
    ifOn("find-bar", "watchFindBars", watchFindBars);
    safely("watchSpaceColor", watchSpaceColor);
    safely("animateEssentialsAdds", animateEssentialsAdds);
    ifOn("undo-close", "watchUndoClose", watchUndoClose);
    safely("watchTypedAddress", watchTypedAddress);
    safely("registerScrollActor", registerScrollActor);
    safely("registerPdfActor", registerPdfActor);
    safely("watchScrollInput", watchScrollInput);
    safely("createTitleElement", createTitleElement);
    safely("addDownloadProgress", addDownloadProgress);
    ifOn("icon-picker", "addIconPicker", addIconPicker);
    safely("watchCompactTopRow", watchCompactTopRow);
    safely("watchOldIcons", watchOldIcons);
    safely("watchNewFolders", watchNewFolders);
    safely("watchFolderColors", watchFolderColors);
    safely("addFolderColorPicker", addFolderColorPicker);
    safely("watchGroupColors", watchGroupColors);
    safely("watchFolderCloseButtons", watchFolderCloseButtons);
    safely("watchEmptyFolders", watchEmptyFolders);
    safely("watchEssentialRows", watchEssentialRows);
    safely("watchSidebarPaint", watchSidebarPaint);
    safely("watchWindowButtonsSide", watchWindowButtonsSide);
    safely("addTabHoverCards", addTabHoverCards);

    gBrowser.tabContainer.addEventListener("TabSelect", () => {
      const browser = gBrowser.selectedBrowser;
      if (isLoading(browser) && !isErrorPage(browser)) {
        startLoader(0.25,  true);
      } else {
        cancelLoader();
      }
      snapColorForTab(browser);
      scheduleColor(60);
      scheduleColor(400);
      updateTitle();
    });

    gBrowser.tabContainer.addEventListener("TabAttrModified", (event) => {
      if (event.target === gBrowser.selectedTab) {
        updateTitle();
      }
    });

    const { STATE_START, STATE_STOP, STATE_IS_WINDOW } = Ci.nsIWebProgressListener;
    const { LOCATION_CHANGE_SAME_DOCUMENT, LOCATION_CHANGE_ERROR_PAGE } = Ci.nsIWebProgressListener;

    gBrowser.addTabsProgressListener({
      onStateChange(browser, webProgress, request, stateFlags) {
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
            showErrorColor();
          } else {
            finishLoader();
            scheduleColor(50);
            scheduleColor(800);
            scheduleColor(2000);
            scheduleColor(4500);
          }
          updateTitle();
        }
      },

      onProgressChange(browser, webProgress, request, curSelf, maxSelf, curTotal, maxTotal) {
        if (browser === gBrowser.selectedBrowser && maxTotal > 0) {
          reportRealProgress(curTotal / maxTotal);
        }
      },

      onLocationChange(browser, webProgress, request, location, flags) {
        if (!webProgress.isTopLevel) {
          return;
        }
        redirectBlankNewTab(browser, location, flags);

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
          showErrorColor();
        } else if (flags & LOCATION_CHANGE_SAME_DOCUMENT) {
          scheduleColor(150);
        } else {
          const known = rememberedSiteColor(browser);
          if (known) {
            applyColor(known);
          }
        }
        updateTitle();
      },
    });

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
    setTimeout(rememberClosedText, 800);
    new MutationObserver(alignOpenedUrlbarSoon).observe(urlbar, {
      attributes: true,
      attributeFilter: ["breakout-extend"],
    });
    window.addEventListener("resize", alignOpenedUrlbarSoon);

    safely("keepWholeUrlSelected", () => keepWholeUrlSelected(urlbar));
    safely("matchTabCorners", matchTabCorners);
    safely("addCopyLinkButton", addCopyLinkButton);
    safely("addToastCloseButtons", addToastCloseButtons);
    safely("animateNavButtons", animateNavButtons);
    safely("springReloadHover", springReloadHover);
    safely("watchEdgeGlow", watchEdgeGlow);
    safely("watchColorDrift", watchColorDrift);
    safely("watchPopUpColor", watchPopUpColor);
    safely("quietZenHaptics", quietZenHaptics);
    safely("watchHapticsMute", watchHapticsMute);
    safely("watchUnloadable", watchUnloadable);
    safely("revertTypedTextOnLeave", () => revertTypedTextOnLeave(urlbar));
    safely("neverShowScheme", neverShowScheme);

    updateColor();
    updateTitle();
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
