  // ---------- Folders brought back after being deleted
  // Firefox keeps a deleted folder as a plain tab group, and Reopen Closed
  // Tab (Cmd/Ctrl+Shift+T, or Zia's Cmd/Ctrl+Z) brings it back as one. It
  // looked like the folder (Zia draws plain groups the same) but wasn't
  // Zen's: it wouldn't collapse, Zia's folder animations passed it by, and
  // having no icon it was named afresh by the local model. A group coming
  // back with the id of a folder deleted this session is made into a folder
  // again, with its name, icon, colour and tabs, and isn't named.
  const DELETED_FOLDER_KEEP_MS = 30 * 60 * 1000;
  const deletedFolders = new Map();

  // (back in any form: a folder you deleted is never named afresh)
  function wasDeletedFolder(group) {
    return !!group?.id && deletedFolders.has(group.id);
  }

  function isReopenedFolder(group) {
    return wasDeletedFolder(group) && !group.isZenFolder && group.localName === "tab-group" && !group.hasAttribute("split-view-group");
  }

  function rememberDeletedFolder(folder) {
    if (!folder?.isZenFolder || !folder.id) {
      return;
    }
    const now = Date.now();
    for (const [id, saved] of deletedFolders) {
      if (now - saved.at > DELETED_FOLDER_KEEP_MS) {
        deletedFolders.delete(id);
      }
    }
    deletedFolders.set(folder.id, {
      at: now,
      label: folder.label,
      icon: folder.iconURL || "",
      color: readFolderColors()[folder.id] || null,
      workspaceId: folder.getAttribute("zen-workspace-id") || undefined,
    });
  }

  function remakeReopenedFolder(group) {
    const saved = deletedFolders.get(group.id);
    if (!saved || !group.isConnected || group.isZenFolder) {
      return;
    }
    deletedFolders.delete(group.id);
    const tabs = [...(group.tabs || [])].filter((tab) => tab.isConnected);
    if (!tabs.length || !window.gZenFolders?.createFolder) {
      return;
    }
    // (the new folder announces itself too: it isn't named either)
    window.ziaReopeningUntil = Date.now() + 3000;
    try {
      const label = group.label || saved.label;
      const workspaceId = saved.workspaceId || group.getAttribute("zen-workspace-id") || undefined;
      group.ungroupTabs?.();
      const folder = window.gZenFolders.createFolder(tabs, { label, workspaceId });
      const made = folder?.isZenFolder ? folder : tabs[0]?.group?.isZenFolder ? tabs[0].group : null;
      if (!made) {
        return;
      }
      if (saved.icon) {
        window.gZenFolders.setFolderUserIcon?.(made, saved.icon);
      }
      if (saved.color) {
        setFolderColor(made, saved.color);
      }
    } catch (err) {
      console.warn("[Zia] Couldn't make the reopened folder a folder again:", err);
    }
  }

  function watchReopenedFolders() {
    gBrowser.tabContainer.addEventListener("TabGroupRemoved", (event) => rememberDeletedFolder(event.target));
    gBrowser.tabContainer.addEventListener("TabGroupCreate", (event) => {
      const group = event.target;
      if (isReopenedFolder(group)) {
        // (once Firefox has put all its tabs back in it)
        requestAnimationFrame(() => requestAnimationFrame(() => safely("remakeReopenedFolder", () => remakeReopenedFolder(group))));
      }
    });
  }

