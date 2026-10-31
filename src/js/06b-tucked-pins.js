  // Pinned tabs tucked away by clicking the space's name: shut once a tab outside is chosen,
  // their line kept in place, and the names of folders holding the open tab kept meanwhile.
  // Used elsewhere: tuckAwayUnopenedPins, keepSeparatorWhenPinsTuck,
  // keepFolderNamesInCollapsedSpaces.
  // From 06: nothing (it works with Zen's own folder calls).

  // A collapsed space keeps the names of folders its open tab is in
  // (06-folders-and-sidebar.css), from collapsing until it has finished opening.
  const SPACE_OPEN_MS = 700;

  // Pinned tabs tucked away keep showing the open tab among them, as a closed folder
  // does. Once a tab outside is chosen they all shut at the name's speed, and folders
  // that were showing the tab are closed properly once out of sight.
  function tuckAwayUnopenedPins() {
    gBrowser.tabContainer.addEventListener("TabSelect", tuckAwayOnSelect);
  }

  async function tuckAwayOnSelect(event) {
    const tab = event.target;
    if (!tab || (tab.pinned && !tab.hasAttribute("zen-essential"))) {
      return;
    }
    const pins = window.gZenWorkspaces?.activeWorkspaceElement?.collapsiblePins;
    const zen = window.gZenFolders;
    if (!zen || !pins?.collapsed || !pins.hasAttribute("has-active") || pins.contains(tab)) {
      return;
    }
    try {
      // As its "-" does (the tab left open): the tab shown goes, its folder
      // and the pinned tabs shutting round it together
      const shown = [...(pins.groupContainer?.querySelectorAll?.(".tabbrowser-tab[folder-active]") || [])];
      if (shown.length && zen.animateUnload) {
        await Promise.all(
          shown.map((one) => {
            const folder = one.group?.hasAttribute("split-view-group") ? one.group.group : one.group;
            return zen.animateUnload(folder || pins, one);
          })
        );
        return;
      }
      const folders = pins.childActiveGroups || [];
      pins.removeAttribute("has-active");
      pins.activeTabs = [];
      await zen.animateCollapse(pins);
      if (!pins.collapsed || pins.hasAttribute("has-active")) {
        return;
      }
      for (const folder of folders) {
        if (!folder.isConnected || !folder.hasAttribute("has-active")) {
          continue;
        }
        folder.removeAttribute("has-active");
        folder.activeTabs = [];
        for (const shown of folder.querySelectorAll("[folder-active]")) {
          shown.removeAttribute("folder-active");
          (shown.group?.hasAttribute("split-view-group") ? shown.group : shown).style.removeProperty("--zen-folder-indent");
        }
        zen.styleCleanup(folder.allItemsRecursive || folder.allItems || []);
        if (folder.collapsed) {
          folder.groupContainer?.setAttribute("hidden", "true");
          if (folder.groupStartElement) {
            folder.groupStartElement.style.marginTop = "-4px";
          }
        }
      }
    } catch (err) {
      noteError("tuck away pins", err);
    }
  }

  // Pinned tabs tucked away with none shown any more: Zen measured the push while the
  // folders were still squashed, so pushed too little and the separator went with
  // them. Once Zen is done they're pushed their whole height, the separator staying.
  function keepSeparatorWhenPinsTuck() {
    const fix = (pins) => {
      if (!pins?.isConnected || !pins.collapsed || pins.hasAttribute("has-active")) {
        return;
      }
      const start = pins.groupStartElement;
      const box = pins.groupContainer;
      const sep = box?.separatorElement || box?.querySelector?.(".pinned-tabs-container-separator");
      if (!start || !box || box.hasAttribute("hidden")) {
        return;
      }
      if (start.getAnimations().some((a) => a.playState === "running")) {
        requestAnimationFrame(() => fix(pins));
        return;
      }
      const items = pins.allItems || [];
      window.gZenFolders?.styleCleanup?.(items.filter((item) => item.style.height === "0px" || item.style.opacity === "0"));
      start.style.marginTop = "0px";
      const full = box.getBoundingClientRect().height - (sep ? sep.getBoundingClientRect().height : 0);
      start.style.marginTop = `${-(full + 4)}px`;
    };
    // (the moment the list shrinks, before it's drawn: put right later, the separator
    // went and came back)
    const watched = new WeakSet();
    const watch = () => {
      const pins = window.gZenWorkspaces?.activeWorkspaceElement?.collapsiblePins;
      const box = pins?.groupContainer;
      if (!box || watched.has(box)) {
        return;
      }
      watched.add(box);
      new ResizeObserver(() => {
        const sep = box.separatorElement || box.querySelector(".pinned-tabs-container-separator");
        if (sep && sep.getBoundingClientRect().bottom <= box.getBoundingClientRect().top + 1) {
          fix(pins);
        }
      }).observe(box);
    };
    watch();
    window.addEventListener("ZenWorkspacesUIUpdate", watch);
    gBrowser.tabContainer.addEventListener("TabSelect", watch);
    new MutationObserver((records) => {
      for (const record of records) {
        const pins = record.target;
        if (pins === window.gZenWorkspaces?.activeWorkspaceElement?.collapsiblePins && record.oldValue !== null && !pins.hasAttribute("has-active")) {
          requestAnimationFrame(() => fix(pins));
        }
      }
    }).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["has-active"],
    });
  }

  function keepFolderNamesInCollapsedSpaces() {
    const timers = new WeakMap();
    const update = (space) => {
      clearTimeout(timers.get(space));
      if (space.hasAttribute("collapsedpinnedtabs")) {
        space.setAttribute("zia-keep-folder-names", "true");
        return;
      }
      if (space.hasAttribute("zia-keep-folder-names")) {
        timers.set(space, setTimeout(() => {
          if (!space.hasAttribute("collapsedpinnedtabs")) {
            space.removeAttribute("zia-keep-folder-names");
          }
        }, SPACE_OPEN_MS));
      }
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.target.localName === "zen-workspace") {
          update(record.target);
        }
      }
    }).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["collapsedpinnedtabs"],
    });
    for (const space of document.querySelectorAll("zen-workspace[collapsedpinnedtabs]")) {
      update(space);
    }
  }

