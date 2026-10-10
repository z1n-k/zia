  // Folders show a glass folder in their colour
  // (or the space's) holding a sheet of paper for each tab in it, up to
  // three: an empty folder is just the folder. It opens and closes with the
  // folder, and a tab dropped in drops a sheet in with it. A folder given
  // an icon of its own wears it on the glass front (or, right-clicked,
  // shows it alone).
  //
  // Past three it becomes a glass archive box: the folder shrinks and blurs
  // away and the box grows into focus. For each tab added the lid opens, a
  // sheet drops in and the lid shuts; for each one taken out a sheet rises
  // out. The box shows up to eight sheets; past that a sheet still goes in
  // or out each time, without the pile growing. Its lid stays open while
  // the folder is.
  const FOLDER_ICON_MAX_SHEETS = 3;
  const FOLDER_BOX_MAX_SHEETS = 8;
  const FOLDER_ICON_DROP_MS = 650;
  // the box's timings (ms): the morph, a sheet's way in, the lid open around it
  const FOLDER_BOX_MORPH_MS = 560;
  const FOLDER_BOX_LID_LEAD_MS = 120;
  const FOLDER_BOX_SHEET_MS = 600;
  const FOLDER_BOX_LID_MS = FOLDER_BOX_LID_LEAD_MS + FOLDER_BOX_SHEET_MS + 120;

  function folderIconBox(folder) {
    return folder?.querySelector?.(":scope > .tab-group-label-container .tab-group-folder-icon");
  }

  function folderIconPart(parent, className) {
    const el = document.createElementNS(XHTML_NS, "div");
    el.className = className;
    parent.append(el);
    return el;
  }

  function addFolderIcon(folder) {
    const box = folderIconBox(folder);
    if (!box || box.querySelector(":scope > .zia-fi")) {
      return;
    }
    const icon = document.createElementNS(XHTML_NS, "div");
    icon.className = "zia-fi";
    // the folder, back to front: its back, the sheets, the glass front
    const fold = folderIconPart(icon, "zia-fi-fold");
    for (const part of ["back", "sheet zia-fi-s3", "sheet zia-fi-s2", "sheet zia-fi-s1", "front"]) {
      folderIconPart(fold, `zia-fi-${part}`);
    }
    // the folder's own icon, on the front of each (it tips with the front)
    folderIconMark(fold.querySelector(".zia-fi-front"));
    // the box, back to front: its inside, the pile, a passing sheet, the
    // glass front, the lid
    const archive = folderIconPart(icon, "zia-fb");
    folderIconPart(archive, "zia-fb-back");
    for (let i = 0; i < FOLDER_BOX_MAX_SHEETS; i++) {
      folderIconPart(archive, "zia-fb-sheet").style.setProperty("--i", i);
    }
    folderIconPart(archive, "zia-fb-pass");
    folderIconMark(folderIconPart(archive, "zia-fb-front"));
    folderIconPart(archive, "zia-fb-lid");
    box.append(icon);
  }

  function folderIconMark(front) {
    const mark = document.createElementNS(XHTML_NS, "img");
    mark.className = "zia-fi-mark";
    mark.alt = "";
    front.append(mark);
  }

  // A folder's own icon (Zen keeps it in its folder picture, an SVG
  // <image>), shown alone in the folder's place; or, a folder at a time
  // (right-click it, Show Icon on Folder), worn on the glass folder's
  // front. Kept by folder id, as its colour is.
  const FOLDER_ICON_ON_FOLDER_PREF = "zia.folder-icon-on-folder";

  function readIconOnFolder() {
    try {
      return JSON.parse(Services.prefs.getStringPref(FOLDER_ICON_ON_FOLDER_PREF, "{}")) || {};
    } catch (err) {
      return {};
    }
  }

  function setIconOnFolder(folder, on) {
    if (!folder?.id) {
      return;
    }
    const map = readIconOnFolder();
    if (on) {
      map[folder.id] = true;
    } else {
      delete map[folder.id];
    }
    try {
      Services.prefs.setStringPref(FOLDER_ICON_ON_FOLDER_PREF, JSON.stringify(map));
    } catch (err) {
      noteError("folder icon: save icon on folder", err);
    }
    folder.toggleAttribute("zia-icon-on-folder", on);
  }

  function restoreIconOnFolder() {
    const map = readIconOnFolder();
    for (const folder of document.querySelectorAll("zen-folder")) {
      folder.toggleAttribute("zia-icon-on-folder", !!map[folder.id]);
    }
  }

  function folderHasOwnIcon(folder) {
    return !!folderIconBox(folder)?.querySelector("svg .icon image")?.getAttribute("href");
  }

  function addIconOnFolderMenuItem() {
    let item = null;
    document.addEventListener(
      "popupshowing",
      (event) => {
        const menu = event.target;
        if (menu?.id !== "zenFolderActions") {
          return;
        }
        const folder = folderFromNode(menu.triggerNode || event.explicitOriginalTarget);
        if (!item) {
          item = document.createXULElement("menuitem");
          item.id = "zia-folder-icon-on-folder";
          item.setAttribute("type", "checkbox");
          // (Zia ticks it from the folder, not the menu: a menu tick is
          // there for any "checked", even "false")
          item.setAttribute("autocheck", "false");
          item.setAttribute("label", "Show Icon on Folder");
          item.addEventListener("command", () => {
            const folder = item.ziaFolder;
            setIconOnFolder(folder, !folder?.hasAttribute("zia-icon-on-folder"));
          });
          const after = document.getElementById("zia-folder-color-menu") || document.getElementById("context_zenFolderRename");
          if (after?.parentElement === menu) {
            after.after(item);
          } else {
            menu.appendChild(item);
          }
        }
        // only for a folder with an icon of its own
        const shown = !!folder?.isZenFolder && folderHasOwnIcon(folder);
        item.hidden = !shown;
        item.ziaFolder = shown ? folder : null;
        setAttr(item, "checked", shown && folder.hasAttribute("zia-icon-on-folder") ? "true" : null);
      },
      true
    );
  }

  function syncFolderMark(folder) {
    const box = folderIconBox(folder);
    const href = box?.querySelector("svg .icon image")?.getAttribute("href") || null;
    const icon = box?.querySelector(":scope > .zia-fi");
    if (!icon) {
      return;
    }
    folder.toggleAttribute("zia-fi-marked", !!href);
    for (const mark of icon.querySelectorAll(".zia-fi-mark")) {
      if (mark.getAttribute("src") !== href) {
        setAttr(mark, "src", href);
      }
    }
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

  // An animation attribute put on afresh, after a delay, and taken off once
  // it's run, so the same one can play again next time
  function replayFolderIcon(el, attr, delay, length) {
    clearTimeout(el.ziaReplayOff);
    el.removeAttribute(attr);
    void el.offsetWidth;
    el.style.animationDelay = `${delay}ms`;
    el.setAttribute(attr, "");
    el.ziaReplayOff = setTimeout(() => el.removeAttribute(attr), delay + length + 60);
  }

  function countFolderBox(folder, count, before) {
    const icon = folderIconBox(folder)?.querySelector(":scope > .zia-fi");
    if (!icon) {
      return;
    }
    const shown = count > FOLDER_ICON_MAX_SHEETS ? Math.min(count, FOLDER_BOX_MAX_SHEETS) : 0;
    const wasShown = before > FOLDER_ICON_MAX_SHEETS ? Math.min(before, FOLDER_BOX_MAX_SHEETS) : 0;
    const full = count > FOLDER_ICON_MAX_SHEETS;
    const wasFull = before > FOLDER_ICON_MAX_SHEETS;
    // how full the box looks: none at four, all of it at eight
    icon.style.setProperty("--fb-full", full ? ((shown - FOLDER_ICON_MAX_SHEETS - 1) / (FOLDER_BOX_MAX_SHEETS - FOLDER_ICON_MAX_SHEETS - 1)).toFixed(3) : "0");
    const sheets = [...icon.querySelectorAll(".zia-fb-sheet")];
    const quiet = before === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quiet) {
      folder.toggleAttribute("zia-fi-full", full);
      sheets.forEach((sheet, i) => sheet.toggleAttribute("zia-on", i < shown));
      return;
    }
    const up = full && !wasFull;
    const down = !full && wasFull;
    const adding = count > before;
    // the box comes in once the folder has gone; going back, its last sheet
    // comes out first
    const start = up ? FOLDER_BOX_MORPH_MS : 0;
    if (up || down) {
      const wait = down ? FOLDER_BOX_LID_LEAD_MS + FOLDER_BOX_SHEET_MS : 0;
      const [out, into] = up ? [".zia-fi-fold", ".zia-fb"] : [".zia-fb", ".zia-fi-fold"];
      setTimeout(() => folder.toggleAttribute("zia-fi-full", full), wait);
      replayFolderIcon(icon.querySelector(out), "zia-morph-out", wait, 200);
      replayFolderIcon(icon.querySelector(into), "zia-morph-in", wait + 140, 420);
    }
    if (full || down) {
      // the lid opens for the sheet (it's already open with the folder open)
      replayFolderIcon(icon, "zia-fb-peek", start, FOLDER_BOX_LID_MS);
    }
    sheets.forEach((sheet, i) => {
      const on = i < shown;
      const was = sheet.hasAttribute("zia-on");
      // going back to the folder, the sheets it'll hold stay in the box
      // until it's gone
      if (down && was && i < count) {
        clearTimeout(sheet.ziaKeep);
        sheet.ziaKeep = setTimeout(() => sheet.toggleAttribute("zia-on", folder.ziaFolderItems > FOLDER_ICON_MAX_SHEETS && i < Math.min(folder.ziaFolderItems, FOLDER_BOX_MAX_SHEETS)), FOLDER_BOX_LID_LEAD_MS + FOLDER_BOX_SHEET_MS + 200);
        return;
      }
      clearTimeout(sheet.ziaKeep);
      sheet.toggleAttribute("zia-on", on);
      if (on && !was && (!up || i === shown - 1)) {
        replayFolderIcon(sheet, "zia-fall", start + FOLDER_BOX_LID_LEAD_MS, FOLDER_BOX_SHEET_MS);
      } else if (!on && was) {
        replayFolderIcon(sheet, "zia-rise", 100, 500);
      }
    });
    // past eight, a sheet still passes in or out
    if (full && wasFull && shown === wasShown) {
      replayFolderIcon(icon.querySelector(".zia-fb-pass"), adding ? "zia-in" : "zia-out", FOLDER_BOX_LID_LEAD_MS, FOLDER_BOX_SHEET_MS);
    }
  }

  function countFolderSheets(folder) {
    addFolderIcon(folder);
    syncFolderMark(folder);
    const items = folderItemCount(folder);
    const itemsBefore = folder.ziaFolderItems ?? null;
    folder.ziaFolderItems = items;
    if (itemsBefore !== items) {
      countFolderBox(folder, items, itemsBefore);
    }
    const count = Math.min(FOLDER_ICON_MAX_SHEETS, items);
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

  // Counted once the folders have stopped changing: while Zen drops a tab
  // in, the folder holds an extra child for a moment, and counting then
  // put down two sheets before settling on one, the sheet jumping wider.
  const FOLDER_ICON_SETTLE_MS = 150;

  function watchFolderIcon() {
    let timer = null;
    const recount = () => {
      clearTimeout(timer);
      timer = setTimeout(countAllFolderSheets, FOLDER_ICON_SETTLE_MS);
    };
    for (const type of ["TabGroupCreate", "TabGrouped", "TabUngrouped", "TabOpen", "TabClose", "TabMove", "TabGroupRemoved"]) {
      gBrowser.tabContainer.addEventListener(type, recount);
    }
    window.addEventListener("ZenWorkspacesUIUpdate", recount);
    // tabs moved in and out by Zen's own drag and drop, without an event;
    // and a folder given an icon, or its icon changed
    new MutationObserver(recount).observe(gBrowser.tabContainer, { subtree: true, childList: true, attributes: true, attributeFilter: ["href"] });
    // (the old per-folder "icon only" choice is the default now)
    Services.prefs.clearUserPref("zia.folder-icon-only");
    restoreIconOnFolder();
    setTimeout(restoreIconOnFolder, 1500);
    gBrowser.tabContainer.addEventListener("TabGroupCreate", (event) => {
      event.target?.toggleAttribute?.("zia-icon-on-folder", !!readIconOnFolder()[event.target.id]);
    });
    addIconOnFolderMenuItem();
    countAllFolderSheets();
    // folders restored at start-up
    setTimeout(countAllFolderSheets, 1500);
  }
