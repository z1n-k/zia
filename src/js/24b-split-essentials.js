  // Split essentials: a split of two sites kept as one essential, as Dia
  // can. Zen can't hold a split among its essentials yet (splitting with an
  // essential copies it into an ordinary tab), so Zia keeps it like this:
  //
  //  - The essential is an ordinary Zen essential for the left site, which
  //    Zia draws as a split tile (both sites' icons side by side, the glow a
  //    blend of the two) and never shows by itself.
  //  - The split it opens is an ordinary Zen split of two ordinary tabs,
  //    tagged zia-split-of and hidden from the tab list. Clicking the tile
  //    selects it (making it first if there's none), in the space you're in;
  //    clicking a half of the tile goes to that half of the split.
  //  - While it's showing, the tile looks selected, its colour leaning
  //    towards whichever half you're in.
  //
  // Everything is kept in the session (the essential's "zia-split" value,
  // each split tab's "zia-split-of" and "zia-split-side"), so it survives a
  // restart. Take the essential out of the essentials, or close it, and its
  // split becomes an ordinary one in the tab list again; close either tab
  // of the split and both go, until the tile is clicked again. It's all
  // behind zia.essentials.split, and turned off, every split essential goes
  // back to being a plain essential and its split an ordinary one.
  const SPLIT_PREF = "zia.essentials.split";
  const SPLIT_DATA = "zia-split";
  const SPLIT_OF = "zia-split-of";
  const SPLIT_SIDE = "zia-split-side";

  const splitEssentialsOn = () => Services.prefs.getBoolPref(SPLIT_PREF, false);

  function sessionValue(tab, key) {
    try {
      return window.SessionStore?.getCustomTabValue(tab, key) || "";
    } catch (err) {
      return "";
    }
  }

  function setSessionValue(tab, key, value) {
    try {
      if (value) {
        window.SessionStore?.setCustomTabValue(tab, key, value);
      } else {
        window.SessionStore?.deleteCustomTabValue(tab, key);
      }
    } catch (err) {
      noteError("split essentials: session", err);
    }
  }

  function splitDataOf(tab) {
    if (!tab?.hasAttribute?.("zen-essential")) {
      return null;
    }
    if (tab.ziaSplit === undefined) {
      try {
        tab.ziaSplit = JSON.parse(sessionValue(tab, SPLIT_DATA) || "null");
      } catch (err) {
        tab.ziaSplit = null;
      }
    }
    return tab.ziaSplit?.id ? tab.ziaSplit : null;
  }

  function saveSplitData(tab, data) {
    tab.ziaSplit = data;
    setSessionValue(tab, SPLIT_DATA, data ? JSON.stringify(data) : "");
  }

  const splitEssentials = () => gBrowser.tabs.filter((tab) => splitDataOf(tab));

  function pairOf(id) {
    const pair = {};
    for (const tab of gBrowser.tabs) {
      if (!tab.closing && tab.getAttribute(SPLIT_OF) === id) {
        pair[tab.getAttribute(SPLIT_SIDE) === "b" ? "b" : "a"] = tab;
      }
    }
    return pair;
  }

  function essentialFor(tab) {
    const id = tab?.getAttribute?.(SPLIT_OF);
    return id ? splitEssentials().find((essential) => splitDataOf(essential).id === id) || null : null;
  }

  function tagPairTab(tab, id, side) {
    tab.setAttribute(SPLIT_OF, id);
    tab.setAttribute(SPLIT_SIDE, side);
    setSessionValue(tab, SPLIT_OF, id);
    setSessionValue(tab, SPLIT_SIDE, side);
  }

  function untagPairTab(tab) {
    tab.removeAttribute(SPLIT_OF);
    tab.removeAttribute(SPLIT_SIDE);
    setSessionValue(tab, SPLIT_OF, "");
    setSessionValue(tab, SPLIT_SIDE, "");
  }

  const tabIcon = (tab) => tab?.getAttribute("image") || "";
  const tabUrl = (tab) => tab?.linkedBrowser?.currentURI?.spec || "";

  // The tile: the right site's icon beside the essential's own, and its
  // icon for the blended glow (the essential's own is Zen's
  // --zen-essential-tab-icon).
  function drawSplitTile(essential) {
    const data = splitDataOf(essential);
    const content = essential.querySelector(".tab-content");
    let half = content?.querySelector(":scope > .zia-split-half");
    if (!data || !splitEssentialsOn()) {
      half?.remove();
      essential.removeAttribute("zia-split-tile");
      essential.style.removeProperty("--zia-split-icon-b");
      return;
    }
    if (!content) {
      return;
    }
    if (!half) {
      half = document.createXULElement("hbox");
      half.className = "zia-split-half";
      half.append(document.createXULElement("image"));
      const ownIcon = content.querySelector(":scope > .tab-icon-stack");
      if (ownIcon) {
        ownIcon.after(half);
      } else {
        content.prepend(half);
      }
    }
    const icon = data.b?.icon || "chrome://sine/content/zia/icons/tab-default.svg";
    const image = half.firstElementChild;
    if (image.getAttribute("src") !== icon) {
      image.setAttribute("src", icon);
    }
    essential.style.setProperty("--zia-split-icon-b", `url("${icon.replace(/"/g, "%22")}")`);
    essential.setAttribute("zia-split-tile", "true");
  }

  // Selected look while its split is showing, leaning to the half you're in
  function syncSplitSelection() {
    const selected = gBrowser.selectedTab;
    const showing = essentialFor(selected);
    for (const essential of splitEssentials()) {
      const on = essential === showing;
      if (on) {
        essential.setAttribute("zia-split-focus", selected.getAttribute(SPLIT_SIDE) === "b" ? "b" : "a");
      } else {
        essential.removeAttribute("zia-split-focus");
      }
      if (on !== essential.hasAttribute("visuallyselected")) {
        essential._visuallySelected = on;
      }
    }
  }

  function addTabFor(url) {
    return gBrowser.addTab(url || "about:blank", {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      inBackground: true,
      skipAnimation: true,
    });
  }

  // Shows an essential's split, making it first if it's gone
  function openSplitEssential(essential, side = "a") {
    const data = splitDataOf(essential);
    if (!data) {
      return;
    }
    let { a, b } = pairOf(data.id);
    const space = window.gZenWorkspaces?.activeWorkspace;
    if (a && b && a.group && a.group === b.group) {
      if (space && a.getAttribute("zen-workspace-id") !== space) {
        try {
          window.gZenWorkspaces.moveTabsToWorkspace([a, b], space);
        } catch (err) {
          noteError("split essentials: move split", err);
        }
      }
    } else {
      for (const leftover of [a, b]) {
        if (leftover) {
          untagPairTab(leftover);
          gBrowser.removeTab(leftover, { animate: false });
        }
      }
      a = addTabFor(data.a?.url);
      b = addTabFor(data.b?.url);
      tagPairTab(a, data.id, "a");
      tagPairTab(b, data.id, "b");
      window.gZenViewSplitter?.splitTabs([a, b], "vsep", side === "b" ? 1 : 0);
    }
    gBrowser.selectedTab = side === "b" ? b : a;
    syncSplitSelection();
  }

  // A two-site split, not already a split essential's, can become one
  function canBecomeSplitEssential(tab) {
    const group = tab?.group;
    const tabs = group?.hasAttribute("split-view-group") ? group.tabs.filter((t) => !t.closing) : [];
    return splitEssentialsOn() && tabs.length === 2 && !tabs.some((t) => t.hasAttribute(SPLIT_OF) || t.pinned);
  }

  // Turns a two-site split into a split essential: the split itself stays
  // (hidden from the tab list) and becomes the essential's. From its tab's
  // right-click menu, or dragging it onto the essentials.
  function addSplitToEssentials(tab) {
    if (!canBecomeSplitEssential(tab)) {
      return;
    }
    const tabs = tab.group.tabs.filter((t) => !t.closing);
    const [a, b] = tabs;
    const id = `zia-split-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const essential = gBrowser.addTab(tabUrl(a) || "about:blank", {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      inBackground: true,
      skipAnimation: true,
      createLazyBrowser: true,
      title: a.label,
    });
    if (tabIcon(a)) {
      try {
        gBrowser.setIcon(essential, tabIcon(a), null, Services.scriptSecurityManager.getSystemPrincipal());
      } catch (err) {
        noteError("split essentials: icon", err);
      }
    }
    try {
      window.gZenPinnedTabManager?.addToEssentials(essential);
    } catch (err) {
      noteError("split essentials: add", err);
    }
    if (!essential.hasAttribute("zen-essential")) {
      console.warn("[Zia] Split essentials: Zen didn't take the new essential (the essentials may be full)");
      gBrowser.removeTab(essential, { animate: false });
      return;
    }
    saveSplitData(essential, {
      id,
      a: { url: tabUrl(a), title: a.label },
      b: { url: tabUrl(b), title: b.label, icon: tabIcon(b) },
    });
    tagPairTab(a, id, "a");
    tagPairTab(b, id, "b");
    drawSplitTile(essential);
    syncSplitSelection();
  }

  // The split essential is gone (closed, or taken out of the essentials):
  // its split is an ordinary one again.
  function releaseSplit(essential) {
    const data = essential.ziaSplit;
    if (!data?.id) {
      return;
    }
    for (const tab of Object.values(pairOf(data.id))) {
      untagPairTab(tab);
    }
    if (essential.isConnected && !essential.closing) {
      saveSplitData(essential, null);
      drawSplitTile(essential);
      essential.removeAttribute("zia-split-focus");
    }
  }

  function watchSplitEssentials() {
    const container = gBrowser.tabContainer;

    // Clicking the tile shows its split, at the half that was clicked
    container.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || !splitEssentialsOn()) {
        return;
      }
      const essential = event.target.closest?.(".tabbrowser-tab[zia-split-tile]");
      if (!essential || event.target.closest(".tab-close-button, .tab-reset-button, .tab-icon-overlay, .tab-audio-button")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const box = essential.getBoundingClientRect();
      openSplitEssential(essential, event.clientX > box.left + box.width / 2 ? "b" : "a");
    }, true);

    // Reached some other way (a shortcut, a restored selection): the split
    // shows instead of the essential by itself.
    container.addEventListener("TabSelect", (event) => {
      const tab = event.target;
      if (splitEssentialsOn() && splitDataOf(tab)) {
        setTimeout(() => {
          if (gBrowser.selectedTab === tab) {
            openSplitEssential(tab, "a");
          }
        }, 0);
        return;
      }
      syncSplitSelection();
    });

    container.addEventListener("TabClose", (event) => {
      const tab = event.target;
      if (tab.ziaSplit?.id) {
        releaseSplit(tab);
        return;
      }
      // One half closed: the whole split goes, until the tile's clicked again
      const id = tab.getAttribute(SPLIT_OF);
      if (id) {
        const { a, b } = pairOf(id);
        for (const other of [a, b]) {
          if (other && other !== tab) {
            untagPairTab(other);
            gBrowser.removeTab(other, { animate: false });
          }
        }
        setTimeout(syncSplitSelection, 0);
      }
    });

    // Taken out of the essentials
    new MutationObserver((records) => {
      for (const { target } of records) {
        if (target.ziaSplit?.id && !target.hasAttribute("zen-essential")) {
          releaseSplit(target);
        }
      }
    }).observe(container, { subtree: true, attributes: true, attributeFilter: ["zen-essential"] });

    // The right-hand site's icon follows it
    container.addEventListener("TabAttrModified", (event) => {
      const tab = event.target;
      if (tab.getAttribute(SPLIT_SIDE) !== "b" || !event.detail?.changed?.includes("image")) {
        return;
      }
      const essential = essentialFor(tab);
      const data = essential && splitDataOf(essential);
      if (data && tabIcon(tab) && data.b.icon !== tabIcon(tab)) {
        saveSplitData(essential, { ...data, b: { ...data.b, icon: tabIcon(tab) } });
        drawSplitTile(essential);
      }
    });

    // Right-click a tab in a two-site split: Add Split to Essentials
    const menu = document.getElementById("tabContextMenu");
    if (menu) {
      const item = document.createXULElement("menuitem");
      item.id = "zia-context-split-essential";
      item.setAttribute("label", "Add Split to Essentials");
      item.addEventListener("command", () => addSplitToEssentials(window.TabContextMenu?.contextTab));
      (document.getElementById("context_zen-add-essential") || menu.lastElementChild)?.after(item);
      menu.addEventListener("popupshowing", (event) => {
        if (event.target !== menu) {
          return;
        }
        item.hidden = !canBecomeSplitEssential(window.TabContextMenu?.contextTab);
      });
    }

    // After a restart: tags back on from the session; orphans let go
    const restore = () => {
      const on = splitEssentialsOn();
      const ids = new Set();
      for (const tab of gBrowser.tabs) {
        const data = splitDataOf(tab);
        if (data && on) {
          ids.add(data.id);
        } else if (data) {
          releaseSplit(tab);
        }
        drawSplitTile(tab);
      }
      for (const tab of gBrowser.tabs) {
        const id = tab.getAttribute(SPLIT_OF) || sessionValue(tab, SPLIT_OF);
        if (!id) {
          continue;
        }
        if (ids.has(id)) {
          tab.setAttribute(SPLIT_OF, id);
          tab.setAttribute(SPLIT_SIDE, sessionValue(tab, SPLIT_SIDE) || tab.getAttribute(SPLIT_SIDE) || "a");
        } else {
          untagPairTab(tab);
        }
      }
      syncSplitSelection();
    };
    window.SessionStore?.promiseAllWindowsRestored?.then(restore, restore);
    container.addEventListener("TabAddedToEssentials", (event) => drawSplitTile(event.target));
    Services.prefs.addObserver(SPLIT_PREF, restore);
    window.addEventListener("unload", () => Services.prefs.removeObserver(SPLIT_PREF, restore));
  }

