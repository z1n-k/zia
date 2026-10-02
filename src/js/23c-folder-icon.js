  // Folder icon (on trial): folders without an icon of their own can show a
  // glass folder in their colour (or the space's) that opens and closes with
  // them, instead of Zia's rings. Pick one in Zia's settings.
  const FOLDER_ICON_PREF = "zia.folders.icon-style";

  function addFolderIcon(folder) {
    const box = folder?.querySelector?.(":scope > .tab-group-label-container .tab-group-folder-icon");
    if (!box || box.querySelector(":scope > .zia-fi")) {
      return;
    }
    const icon = document.createElementNS(HTML_NS, "div");
    icon.className = "zia-fi";
    for (const part of ["back", "sheet b", "sheet a", "front"]) {
      const el = document.createElementNS(HTML_NS, "div");
      el.className = `zia-fi-${part.replace(" ", " zia-fi-")}`;
      icon.append(el);
    }
    box.append(icon);
  }

  function addFolderIcons() {
    document.querySelectorAll("zen-folder, tab-group:not([split-view-group])").forEach(addFolderIcon);
  }

  function watchFolderIcon() {
    const show = () => {
      const style = Services.prefs.getStringPref(FOLDER_ICON_PREF, "rings");
      if (style && style !== "rings") {
        root.setAttribute("zia-folder-icon", style);
        addFolderIcons();
      } else {
        root.removeAttribute("zia-folder-icon");
      }
    };
    show();
    Services.prefs.addObserver(FOLDER_ICON_PREF, show);
    window.addEventListener("unload", () => Services.prefs.removeObserver(FOLDER_ICON_PREF, show));
    gBrowser.tabContainer.addEventListener("TabGroupCreate", (event) => addFolderIcon(event.target));
    // folders restored at start-up, and redrawn ones
    setTimeout(addFolderIcons, 1500);
    window.addEventListener("ZenWorkspacesUIUpdate", addFolderIcons);
  }
