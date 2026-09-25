  const FOLDER_DEFAULT_COLOR = "white";

  const FOLDER_COLORS = [
    ["white", "#fbfbfb"],
    ["green", "#008b5d"],
    ["blue", "#007fbd"],
    ["purple", "#625da5"],
    ["amber", "#c98400"],
    ["pink", "#bd556b"],
    ["red", "#cc4a55"],
    ["orange", "#c95125"],
  ];

  const FOLDER_COLOR_PREF = "zia.folder-colors";

  function readFolderColors() {
    try {
      return JSON.parse(Services.prefs.getStringPref(FOLDER_COLOR_PREF, "{}")) || {};
    } catch (err) {
      return {};
    }
  }

  function writeFolderColors(map) {
    try {
      Services.prefs.setStringPref(FOLDER_COLOR_PREF, JSON.stringify(map));
    } catch (err) {
      console.error("[Zia] Could not save the folder colours:", err);
    }
  }

  function folderColorOf(value) {
    if (!value) {
      return null;
    }
    if (typeof value === "string") {
      return value;
    }
    return value.color || null;
  }

  function paintFolder(folder, value) {
    if (!folder) {
      return;
    }
    const color = folderColorOf(value);
    if (color) {
      folder.setAttribute("zia-folder-color", color);
    } else {
      folder.removeAttribute("zia-folder-color");
    }
  }

  function setFolderColor(folder, color) {
    if (!folder?.id) {
      return;
    }
    const map = readFolderColors();
    if (color) {
      map[folder.id] = color;
    } else {
      delete map[folder.id];
    }
    writeFolderColors(map);
    paintFolder(folder, color);
  }

  function restoreFolderColors() {
    const map = readFolderColors();
    for (const folder of document.querySelectorAll("zen-folder")) {
      if (map[folder.id]) {
        paintFolder(folder, map[folder.id]);
      }
    }
  }

  function folderFromNode(node) {
    if (!node) {
      return null;
    }
    if (gBrowser.isTabGroupLabel?.(node)) {
      return node.group;
    }
    if (gBrowser.isTabGroupLabel?.(node.parentElement)) {
      return node.parentElement.group;
    }
    if (node.parentElement?.isZenFolder && node.classList?.contains("tab-group-label-container")) {
      return node.parentElement;
    }
    return node.closest?.("zen-folder") || null;
  }

  function colorDotIcon(hex) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="${hex}"/></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function buildFolderColorMenu() {
    const submenu = document.createXULElement("menu");
    submenu.id = "zia-folder-color-menu";
    submenu.setAttribute("label", "Folder Color");
    const popup = document.createXULElement("menupopup");
    for (const [name, hex] of FOLDER_COLORS) {
      const item = document.createXULElement("menuitem");
      item.className = "menuitem-iconic";
      item.setAttribute("type", "radio");
      item.setAttribute("name", "zia-folder-color");
      item.setAttribute("label", name[0].toUpperCase() + name.slice(1));
      item.setAttribute("image", colorDotIcon(hex));
      item.setAttribute("zia-color", name);
      item.addEventListener("command", () => {
        const folder = submenu.ziaFolder;

        const same = folder?.getAttribute("zia-folder-color") === name;
        const clear = name === FOLDER_DEFAULT_COLOR || same;
        setFolderColor(folder, clear ? null : name);
      });
      popup.appendChild(item);
    }
    submenu.appendChild(popup);
    return submenu;
  }

  function addFolderColorPicker() {
    let submenu = null;

    document.addEventListener(
      "popupshowing",
      (event) => {
        const menu = event.target;
        if (menu?.id !== "zenFolderActions") {
          return;
        }

        const trigger = menu.triggerNode || event.explicitOriginalTarget;
        const folder = folderFromNode(trigger);
        if (!folder?.isZenFolder) {
          if (submenu) {
            submenu.hidden = true;
          }
          return;
        }

        if (!submenu) {
          submenu = buildFolderColorMenu();

          const rename = document.getElementById("context_zenFolderRename");
          if (rename?.parentElement === menu) {
            menu.insertBefore(submenu, rename);
          } else {
            menu.appendChild(submenu);
          }
        }

        submenu.hidden = false;
        submenu.ziaFolder = folder;

        const current = folder.getAttribute("zia-folder-color") || FOLDER_DEFAULT_COLOR;
        for (const item of submenu.querySelector("menupopup").children) {
          item.toggleAttribute("checked", item.getAttribute("zia-color") === current);
        }
      },
      true
    );
  }

  function watchFolderColors() {
    restoreFolderColors();

    setTimeout(restoreFolderColors, 1500);
    gBrowser.tabContainer.addEventListener("TabGroupCreate", (event) => {
      const saved = readFolderColors()[event.target?.id];
      if (saved) {
        paintFolder(event.target, saved);
      }
    });
  }

  const GROUP_COLOR_TOKEN = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/i;

  // Advanced Tab Groups' picker colours are gradients, which color-mix can't take: the group gets the first stop
  function paintGroupSwatch(group) {
    if (group?.localName !== "tab-group" || group.hasAttribute("split-view-group")) {
      return;
    }
    const color = getComputedStyle(group).getPropertyValue("--tab-group-color").trim();
    const stop = color.includes("gradient") ? color.match(GROUP_COLOR_TOKEN)?.[0] : null;
    const swatch = stop ? `rgb(from ${stop} r g b)` : "";
    if (group.style.getPropertyValue("--zia-group-swatch") === swatch) {
      return;
    }
    if (swatch) {
      group.style.setProperty("--zia-group-swatch", swatch);
    } else {
      group.style.removeProperty("--zia-group-swatch");
    }
  }

  function watchGroupColors() {
    const paintAll = () => document.querySelectorAll("tab-group:not([split-view-group])").forEach(paintGroupSwatch);
    for (const type of ["TabGroupCreate", "TabGroupUpdate"]) {
      gBrowser.tabContainer.addEventListener(type, (event) => paintGroupSwatch(event.target));
    }
    // Advanced Tab Groups recolours by writing --tab-group-color inline, without an event
    new MutationObserver((records) => {
      for (const record of records) {
        paintGroupSwatch(record.target);
      }
    }).observe(gBrowser.tabContainer, { subtree: true, attributes: true, attributeFilter: ["style"] });
    paintAll();
    setTimeout(paintAll, 1500);
  }

  function addFolderCloseButton(folder) {
    if (!folder?.isZenFolder) {
      return;
    }
    const header = folder.querySelector(":scope > .tab-group-label-container");
    if (!header || header.querySelector(":scope > .zia-folder-close")) {
      return;
    }
    const button = document.createXULElement("image");
    button.className = "zia-folder-close";
    button.setAttribute("role", "button");
    button.setAttribute("keyNav", "false");
    button.setAttribute("tooltiptext", "Delete Folder");

    button.addEventListener("mousedown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();

      const removal =
        typeof folder.delete === "function"
          ? folder.delete()
          : gBrowser.removeTabGroup(folder, { isUserTriggered: true });
      Promise.resolve(removal).catch((err) => console.error("[Zia] Couldn't delete the folder:", err));
    });

    header.appendChild(button);
  }

