  // Folders without an icon of their own show a glass folder in their colour
  // (or the space's) holding a sheet of paper for each tab in it, up to
  // three: an empty folder is just the folder. It opens and closes with the
  // folder, and a tab dropped in drops a sheet in with it.
  const FOLDER_ICON_MAX_SHEETS = 3;
  const FOLDER_ICON_DROP_MS = 650;

  function folderIconBox(folder) {
    return folder?.querySelector?.(":scope > .tab-group-label-container .tab-group-folder-icon");
  }

  function addFolderIcon(folder) {
    const box = folderIconBox(folder);
    if (!box || box.querySelector(":scope > .zia-fi")) {
      return;
    }
    const icon = document.createElementNS(HTML_NS, "div");
    icon.className = "zia-fi";
    // back to front: the folder's back, the sheets, the glass front
    for (const part of ["back", "sheet zia-fi-s3", "sheet zia-fi-s2", "sheet zia-fi-s1", "front"]) {
      const el = document.createElementNS(HTML_NS, "div");
      el.className = `zia-fi-${part}`;
      icon.append(el);
    }
    box.append(icon);
  }

  // What's in a folder: its tabs (a split counts once) and folders
  function folderItemCount(folder) {
    const container = folder.querySelector(":scope > .tab-group-container");
    if (!container) {
      return 0;
    }
    return [...container.children].filter(
      (el) =>
        (el.classList.contains("tabbrowser-tab") && !el.hasAttribute("zen-empty-tab")) ||
        el.localName === "zen-folder" ||
        el.localName === "tab-group"
    ).length;
  }

  function countFolderSheets(folder) {
    addFolderIcon(folder);
    const count = Math.min(FOLDER_ICON_MAX_SHEETS, folderItemCount(folder));
    const before = folder.hasAttribute("zia-fi-count") ? Number(folder.getAttribute("zia-fi-count")) : null;
    if (before === count) {
      return;
    }
    folder.setAttribute("zia-fi-count", String(count));
    if (before === null) {
      return;
    }
    // a sheet more than before: it drops in. A sheet fewer: the top one
    // lifts out and away, as if pulled from the folder with the tab.
    clearTimeout(folder.ziaFolderDropTimer);
    folder.removeAttribute("zia-fi-drop");
    folder.removeAttribute("zia-fi-lift");
    if (count > before) {
      folder.setAttribute("zia-fi-drop", String(count));
    } else {
      folder.setAttribute("zia-fi-lift", String(before));
    }
    folder.ziaFolderDropTimer = setTimeout(() => {
      folder.removeAttribute("zia-fi-drop");
      folder.removeAttribute("zia-fi-lift");
    }, FOLDER_ICON_DROP_MS);
  }

  function countAllFolderSheets() {
    document.querySelectorAll("zen-folder, tab-group:not([split-view-group])").forEach(countFolderSheets);
  }

  function watchFolderIcon() {
    let queued = false;
    const recount = () => {
      if (queued) {
        return;
      }
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        countAllFolderSheets();
      });
    };
    for (const type of ["TabGroupCreate", "TabGrouped", "TabUngrouped", "TabOpen", "TabClose", "TabMove", "TabGroupRemoved"]) {
      gBrowser.tabContainer.addEventListener(type, recount);
    }
    window.addEventListener("ZenWorkspacesUIUpdate", recount);
    // tabs moved in and out by Zen's own drag and drop, without an event
    new MutationObserver(recount).observe(gBrowser.tabContainer, { subtree: true, childList: true });
    countAllFolderSheets();
    // folders restored at start-up
    setTimeout(countAllFolderSheets, 1500);
  }
