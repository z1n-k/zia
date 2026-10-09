  function animateEssentialsAdds() {
    const manager = window.gZenPinnedTabManager;
    if (!manager || typeof manager.addToEssentials !== "function" || manager.addToEssentials.__zia) {
      return;
    }
    let fromMenu = false;
    const original = manager.addToEssentials;
    const patched = function (tab, ...rest) {
      fromMenu = !tab;
      try {
        return original.call(this, tab, ...rest);
      } finally {
        setTimeout(() => (fromMenu = false), 0);
      }
    };
    patched.__zia = true;
    manager.addToEssentials = patched;

    window.addEventListener("TabAddedToEssentials", (event) => {
      if (!fromMenu || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      const tab = event.detail?.tab || event.target;
      const tile = tab?.querySelector?.(".tab-stack") || tab;
      if (tile?.style) {
        tile.style.opacity = "0";
      }

      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!tile?.animate) {
            tile?.style?.removeProperty?.("opacity");
            return;
          }

          tile.style.willChange = "transform, opacity, filter";
          const animation = tile.animate(
            [
              { transform: "scale(0.75)", filter: "blur(5px)", opacity: 0 },
              { transform: "scale(1)", filter: "blur(0px)", opacity: 1 },
            ],
            { duration: 820, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
          );
          tile.style.removeProperty("opacity");
          const cleanUp = () => tile.style.removeProperty("will-change");
          animation.finished.then(cleanUp, cleanUp);
        })
      );
    });
  }

  const UNDO_WINDOW_MS = 10000;
  const undoState = { closedAt: 0, closed: [] };

  // The page a tab shows, read from its saved state so it works for tabs that
  // haven't loaded yet.
  function savedUrlOf(tab) {
    try {
      const state = JSON.parse(window.SessionStore.getTabState(tab));
      const entry = state.entries?.[(state.index || state.entries.length) - 1];
      if (entry?.url) {
        return entry.url;
      }
    } catch (err) {
      noteError("essentials and undo: savedUrlOf", err);
    }
    return tab.linkedBrowser?.currentURI?.spec || "";
  }

  // Where a closing tab lived, so undo can put it back in its folder or split.
  function closedTabRecord(tab) {
    const record = { url: savedUrlOf(tab), folder: null, split: null };
    let folder = tab.group;
    if (folder?.hasAttribute("split-view-group")) {
      const data = window.gZenViewSplitter?._data?.find((entry) => entry.tabs?.includes(tab));
      record.split = { key: folder.id || "split", gridType: data?.gridType };
      folder = folder.group;
    }
    if (folder?.isZenFolder) {
      record.folder = { id: folder.id, label: folder.label, workspaceId: folder.getAttribute("zen-workspace-id") || undefined };
    }
    return record;
  }

  // Firefox's own "reopen closed tab" brings back everything one close action
  // took away (a whole folder, a split, several tabs at once), not just one tab.
  function reopenLastClose() {
    // folders coming back keep their names (zia.uc.js, folder names)
    window.ziaReopeningUntil = Date.now() + 3000;
    try {
      window.undoCloseTab();
    } catch (err) {
      noteError("essentials and undo: reopenLastClose", err);
    }
  }

  // Tabs that came back loose from a split or a deleted folder go back into one.
  function regroupReopened(opened, closed) {
    const pending = [...closed];
    const matched = [];
    for (const tab of opened) {
      if (!tab.isConnected || tab.hasAttribute("zen-empty-tab")) {
        continue;
      }
      const url = savedUrlOf(tab);
      const index = pending.findIndex((record) => record.url === url);
      if (index >= 0) {
        matched.push({ tab, record: pending.splice(index, 1)[0] });
      }
    }

    const splits = new Map();
    for (const { tab, record } of matched) {
      if (record.split && !tab.group?.hasAttribute("split-view-group")) {
        const entry = splits.get(record.split.key) || { tabs: [], gridType: record.split.gridType };
        entry.tabs.push(tab);
        splits.set(record.split.key, entry);
      }
    }
    for (const { tabs, gridType } of splits.values()) {
      if (tabs.length >= 2) {
        try {
          window.gZenViewSplitter?.splitTabs(tabs, gridType, 0);
        } catch (err) {
          console.warn("[Zia] Undo close: couldn't put the split back together.", err);
        }
      }
    }

    const folders = new Map();
    for (const { tab, record } of matched) {
      const inFolder = tab.group?.isZenFolder || tab.group?.group?.isZenFolder;
      if (record.folder && !inFolder) {
        const entry = folders.get(record.folder.id) || { tabs: [], seen: new Set(), folder: record.folder };
        // A split goes into the folder as one item, so add just one of its tabs.
        const key = tab.group?.hasAttribute("split-view-group") ? tab.group : tab;
        if (!entry.seen.has(key)) {
          entry.seen.add(key);
          entry.tabs.push(tab);
        }
        folders.set(record.folder.id, entry);
      }
    }
    for (const { tabs, folder } of folders.values()) {
      try {
        const existing = document.getElementById(folder.id);
        if (existing?.isZenFolder) {
          existing.addTabs(tabs);
        } else {
          window.gZenFolders?.createFolder(tabs, { label: folder.label, workspaceId: folder.workspaceId });
        }
      } catch (err) {
        console.warn("[Zia] Undo close: couldn't put the folder back.", err);
      }
    }
  }

  // Every tab that just closed comes back: first as Cmd/Ctrl+Shift+T does
  // (all one close took away), then one at a time until they're all back.
  // (Counting closes by when they happened, several tabs closed together
  // were sometimes taken for one close, sometimes for several, as Zen
  // closes them a moment apart, and only some came back.)
  function undoClosedTabs() {
    const closed = undoState.closed;
    const wanted = Math.max(1, closed.length);
    undoState.closed = [];
    undoState.closedAt = 0;

    const opened = [];
    const onOpen = (event) => opened.push(event.target);
    gBrowser.tabContainer.addEventListener("TabOpen", onOpen);
    try {
      reopenLastClose();
      for (let i = 0; opened.length < wanted && i < wanted; i++) {
        const before = opened.length;
        try {
          window.ziaReopeningUntil = Date.now() + 3000;
          window.SessionStore?.undoCloseTab?.(window, 0);
        } catch (err) {
          noteError("essentials and undo: reopen one", err);
          break;
        }
        if (opened.length === before) {
          break;
        }
      }
    } finally {
      gBrowser.tabContainer.removeEventListener("TabOpen", onOpen);
    }
    // Give Zen a moment to finish restoring before regrouping.
    setTimeout(() => safely("regroupReopened", () => regroupReopened(opened, closed)), 250);
  }

  function watchUndoClose() {
    gBrowser.tabContainer.addEventListener("TabClose", (event) => {
      const tab = event.target;
      const url = tab.linkedBrowser?.currentURI?.spec || "";
      if (tab.hasAttribute("zen-empty-tab") || url === "about:blank" || url === "about:newtab") {
        return;
      }
      const now = Date.now();
      if (now - undoState.closedAt > 1000) {
        undoState.closed = [];
      }
      undoState.closedAt = now;
      try {
        undoState.closed.push(closedTabRecord(tab));
      } catch (err) {
        noteError("essentials and undo: watchUndoClose", err);
      }
    });

    window.addEventListener(
      "keydown",
      (event) => {
        if (Date.now() - undoState.closedAt > UNDO_WINDOW_MS || event.defaultPrevented) {
          return;
        }
        const accel = AppConstants.platform === "macosx" ? event.metaKey : event.ctrlKey;
        if (!accel || event.shiftKey || event.altKey || event.key.toLowerCase() !== "z") {
          return;
        }
        const target = event.composedTarget || event.target;
        if (target?.localName === "input" || target?.localName === "textarea" || target?.isContentEditable) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        undoClosedTabs();
      },
      true
    );
  }

