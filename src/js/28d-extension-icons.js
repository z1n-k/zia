
  // Extension icons: right-click an extension's button (in the toolbar or
  // the extensions panel) to give it an icon of your own, an SVG from your
  // computer or one of Zia's icons. An SVG takes the toolbar's colour, as
  // Zia's own icons do, unless it keeps its own colours. Extensions that
  // change their icon themselves (on or off, per site) are noted, since a
  // custom icon hides that.
  const EXT_ICONS_PREF = "zia.extensionIcons";
  const EXT_CHANGING_PREF = "zia.extensionIcons.changing";
  const EXT_SVG_MAX = 300 * 1024;
  let extIcons = null;
  let extChanging = null;
  let extSheet = null;

  function readJSONPref(name, fallback) {
    try {
      return JSON.parse(Services.prefs.getStringPref(name, "")) || fallback;
    } catch (err) {
      return fallback;
    }
  }

  function extIconMap() {
    if (!extIcons) {
      extIcons = readJSONPref(EXT_ICONS_PREF, {});
    }
    return extIcons;
  }

  function saveExtIcons() {
    try {
      Services.prefs.setStringPref(EXT_ICONS_PREF, JSON.stringify(extIconMap()));
    } catch (err) {
      noteError("extension icons: save", err);
    }
  }

  function changingSet() {
    if (!extChanging) {
      extChanging = new Set(readJSONPref(EXT_CHANGING_PREF, []));
    }
    return extChanging;
  }

  function extIconsDir() {
    return PathUtils.join(PathUtils.profileDir, "zia-icons", "extensions");
  }

  // Uploaded icons are read through resource://, like Zia's own: Firefox
  // only lets an SVG take the toolbar's colour from there, not from a file
  const EXT_ICON_HOST = "zia-extension-icons";
  function pointAtExtIcons() {
    const handler = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    const dir = Services.io.newURI(`${PathUtils.toFileURI(extIconsDir())}/`);
    if (!handler.hasSubstitution(EXT_ICON_HOST) || handler.getSubstitution(EXT_ICON_HOST).spec !== dir.spec) {
      handler.setSubstitution(EXT_ICON_HOST, dir);
    }
  }

  function extIconUrl(entry) {
    if (!entry.uploaded) {
      return entry.url;
    }
    const name = entry.own ? entry.file : entry.tinted || entry.file;
    return name ? `resource://${EXT_ICON_HOST}/${encodeURIComponent(name)}` : "";
  }

  // The custom icons as one stylesheet: each overrides the image Firefox
  // gives the button (in the toolbar and the panel, light and dark)
  function applyExtIcons() {
    const rules = [];
    for (const [id, entry] of Object.entries(extIconMap())) {
      const url = extIconUrl(entry);
      if (!url) {
        continue;
      }
      const selector = `.webextension-browser-action[data-extensionid="${id.replace(/["\\]/g, "\\$&")}"]`;
      const image = `url("${url.replace(/["\\]/g, "\\$&")}")`;
      rules.push(`${selector} {
        --webextension-toolbar-image: ${image} !important;
        --webextension-toolbar-image-dark: ${image} !important;
        --webextension-menupanel-image: ${image} !important;
        --webextension-menupanel-image-dark: ${image} !important;
      }`);
      if (!entry.own) {
        rules.push(`${selector}, ${selector} .toolbarbutton-icon {
          -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity !important;
          fill: var(--toolbarbutton-icon-fill, currentColor) !important;
          stroke: var(--toolbarbutton-icon-fill, currentColor) !important;
        }`);
      }
    }
    const utils = window.windowUtils;
    if (extSheet) {
      try {
        utils.removeSheetUsingURIString(extSheet, utils.AUTHOR_SHEET);
      } catch (err) {
        noteError("extension icons: remove sheet", err);
      }
      extSheet = null;
    }
    extSheet = `data:text/css;charset=utf-8,${encodeURIComponent(rules.join("\n"))}`;
    try {
      utils.loadSheetUsingURIString(extSheet, utils.AUTHOR_SHEET);
    } catch (err) {
      noteError("extension icons: load sheet", err);
    }
  }

  // Only the drawing is kept: no scripts, links out, embedded pages or
  // pictures, or event handlers
  function cleanSvg(text) {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.localName !== "svg" || doc.getElementsByTagName("parsererror").length) {
      return null;
    }
    for (const el of [...svg.querySelectorAll("script, foreignObject, iframe, object, embed, audio, video, image, feImage")]) {
      el.remove();
    }
    const outside = /url\(\s*['"]?\s*(?!#)/i;
    for (const el of [svg, ...svg.querySelectorAll("*")]) {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (name.startsWith("on") || ((name === "href" || name === "xlink:href") && !value.startsWith("#")) || outside.test(value)) {
          el.removeAttribute(attr.name);
        }
      }
    }
    for (const style of svg.querySelectorAll("style")) {
      style.textContent = style.textContent.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*['"]?\s*(?!#)[^)]*\)/gi, "none");
    }
    if (!svg.hasAttribute("viewBox")) {
      const width = parseFloat(svg.getAttribute("width"));
      const height = parseFloat(svg.getAttribute("height"));
      if (width > 0 && height > 0) {
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      }
    }
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    return svg;
  }

  // Its colours become the toolbar's (what Zia's own icons use)
  function tintSvg(svg) {
    const copy = svg.cloneNode(true);
    const keep = /^(none|transparent)$/i;
    for (const el of [copy, ...copy.querySelectorAll("*")]) {
      for (const prop of ["fill", "stroke"]) {
        const value = el.getAttribute(prop);
        if (value && !keep.test(value.trim())) {
          el.setAttribute(prop, "context-fill");
        }
      }
      const inline = el.getAttribute("style");
      if (inline) {
        el.setAttribute("style", inline.replace(/(^|;)\s*(fill|stroke)\s*:\s*(?!none|transparent)[^;]+/gi, "$1$2: context-fill"));
      }
    }
    for (const style of copy.querySelectorAll("style")) {
      style.textContent = style.textContent.replace(/\b(fill|stroke)\s*:\s*(?!none|transparent)[^;}]+/gi, "$1: context-fill");
    }
    if (!copy.hasAttribute("fill")) {
      copy.setAttribute("fill", "context-fill");
    }
    return copy;
  }

  async function removeExtIconFiles(entry) {
    if (!entry?.uploaded) {
      return;
    }
    for (const name of [entry.file, entry.tinted]) {
      if (name && !/[\\/]/.test(name)) {
        try {
          await IOUtils.remove(PathUtils.join(extIconsDir(), name), { ignoreAbsent: true });
        } catch (err) {
          noteError("extension icons: remove file", err);
        }
      }
    }
  }

  async function setExtIcon(id, entry) {
    const old = extIconMap()[id];
    if (entry) {
      extIconMap()[id] = entry;
    } else {
      delete extIconMap()[id];
    }
    saveExtIcons();
    applyExtIcons();
    if (old && old.file !== entry?.file) {
      await removeExtIconFiles(old);
    }
  }

  // A custom icon hides an extension's own changes to its icon: said first
  function okToCover(id) {
    if (!changingSet().has(id)) {
      return true;
    }
    const prompts = Services.prompt;
    const pressed = prompts.confirmEx(
      window,
      "This extension changes its own icon",
      "It uses its icon to show what it's doing (on or off, or something for the site you're on). A custom icon will hide that.",
      prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING + prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_CANCEL + prompts.BUTTON_POS_1_DEFAULT,
      "Use it anyway",
      null,
      null,
      null,
      {}
    );
    return pressed === 0;
  }

  // Asks for an SVG and cleans it: null when cancelled or unusable (said)
  function askForSvg(then) {
    const picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    picker.init(window.browsingContext, "Choose an SVG icon", Ci.nsIFilePicker.modeOpen);
    picker.appendFilter("SVG images", "*.svg");
    picker.open(async (result) => {
      if (result !== Ci.nsIFilePicker.returnOK || !picker.file) {
        then(null);
        return;
      }
      try {
        const path = picker.file.path;
        if (!/\.svg$/i.test(path)) {
          Services.prompt.alert(window, "Only SVG icons", "Choose an .svg file: it can take the toolbar's colour, as Zia's own icons do.");
          then(null);
          return;
        }
        const info = await IOUtils.stat(path);
        if (info.size > EXT_SVG_MAX) {
          Services.prompt.alert(window, "That SVG is too big", "Icons need to be under 300 KB.");
          then(null);
          return;
        }
        const svg = cleanSvg(await IOUtils.readUTF8(path));
        if (!svg) {
          Services.prompt.alert(window, "That isn't an SVG Zia can read", "Choose another .svg file.");
        }
        then(svg);
      } catch (err) {
        console.error("[Zia] Could not use that icon:", err);
        then(null);
      }
    });
  }

  // Writes the SVG as it is and tinted, returning the two file names
  async function saveSvgIcon(dir, base, svg) {
    const serialize = (node) => new XMLSerializer().serializeToString(node);
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    await IOUtils.writeUTF8(PathUtils.join(dir, `${base}.svg`), serialize(svg));
    await IOUtils.writeUTF8(PathUtils.join(dir, `${base}.tinted.svg`), serialize(tintSvg(svg)));
    return { file: `${base}.svg`, tinted: `${base}.tinted.svg` };
  }

  function chooseExtSvg(id) {
    if (!okToCover(id)) {
      return;
    }
    askForSvg(async (svg) => {
      if (!svg) {
        return;
      }
      try {
        const names = await saveSvgIcon(extIconsDir(), `${id.replace(/[^\w.-]+/g, "_")}-${Date.now()}`, svg);
        pointAtExtIcons();
        await setExtIcon(id, { ...names, own: !!extIconMap()[id]?.own, uploaded: true });
      } catch (err) {
        console.error("[Zia] Could not use that icon:", err);
      }
    });
  }

  // Your own SVGs for folders and spaces (the icon picker's "Your SVG…"):
  // kept in the profile and read, tinted like Zia's icons, through
  // resource://, pointed at as this script loads, since Zen draws folder
  // and space icons as it restores them, before the rest of Zia starts.
  const OWN_ICON_HOST = "zia-own-icons";
  function ownIconsDir() {
    return PathUtils.join(PathUtils.profileDir, "zia-icons", "own");
  }
  function pointAtOwnIcons() {
    const handler = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    const dir = Services.io.newURI(`${PathUtils.toFileURI(ownIconsDir())}/`);
    if (!handler.hasSubstitution(OWN_ICON_HOST) || handler.getSubstitution(OWN_ICON_HOST).spec !== dir.spec) {
      handler.setSubstitution(OWN_ICON_HOST, dir);
    }
  }
  try {
    pointAtOwnIcons();
  } catch (err) {
    noteError("own icons: early", err);
  }

  // Asks for an SVG and gives its (tinted) address, or null
  function chooseOwnSvg() {
    return new Promise((resolve) => {
      askForSvg(async (svg) => {
        if (!svg) {
          resolve(null);
          return;
        }
        try {
          const { tinted } = await saveSvgIcon(ownIconsDir(), `icon-${Date.now()}`, svg);
          pointAtOwnIcons();
          resolve(`resource://${OWN_ICON_HOST}/${encodeURIComponent(tinted)}`);
        } catch (err) {
          console.error("[Zia] Could not use that icon:", err);
          resolve(null);
        }
      });
    });
  }

  function pickExtIcon(id, anchor) {
    const icons = window.gZenEmojiPicker;
    if (!icons?.open || !okToCover(id)) {
      return;
    }
    // Opened from the extensions menu, the picker hangs off its toolbar
    // button instead: the menu closes when the picker is clicked, and the
    // picker would close with it.
    const inMenu = anchor?.closest?.("panel, menupopup");
    const shown = anchor?.isConnected && !inMenu && anchor.getBoundingClientRect().width > 0;
    const at = shown ? anchor : document.getElementById("unified-extensions-button") || document.getElementById("nav-bar");
    // The picker stays open, and each icon clicked goes on the button
    // straight away; the bin puts the extension's own icon back
    const onSelect = (url) => {
      if (url === null) {
        setExtIcon(id, null);
      } else if (typeof url === "string" && /^(chrome|resource):/.test(url)) {
        setExtIcon(id, { url, own: false, uploaded: false });
      }
    };
    try {
      Promise.resolve(icons.open(at, { onlySvgIcons: true, allowNone: !!extIconMap()[id], closeOnSelect: false, onSelect })).catch(() => {});
    } catch (err) {
      noteError("extension icons: open the picker", err);
    }
  }

  // Which extensions change their icon: seen when the image Firefox gives
  // the button changes after it's first drawn
  const watchedExtButtons = new WeakSet();
  function extImageOf(button) {
    return (button.getAttribute("style") || "").match(/--webextension-toolbar-image:\s*([^;]+);/)?.[1]?.trim() || "";
  }
  function watchExtButtons() {
    for (const button of document.querySelectorAll(".webextension-browser-action[data-extensionid]")) {
      if (watchedExtButtons.has(button)) {
        continue;
      }
      watchedExtButtons.add(button);
      let first = extImageOf(button);
      new MutationObserver(() => {
        const now = extImageOf(button);
        if (!now || now === first) {
          return;
        }
        if (!first) {
          first = now;
          return;
        }
        const id = button.getAttribute("data-extensionid");
        if (id && !changingSet().has(id)) {
          changingSet().add(id);
          try {
            Services.prefs.setStringPref(EXT_CHANGING_PREF, JSON.stringify([...changingSet()]));
          } catch (err) {
            noteError("extension icons: note a change", err);
          }
        }
      }).observe(button, { attributes: true, attributeFilter: ["style"] });
    }
  }

  function addExtIconMenus() {
    for (const menuId of ["toolbar-context-menu", "unified-extensions-context-menu"]) {
      const menu = document.getElementById(menuId);
      if (!menu || menu.querySelector(".zia-ext-icon-menu")) {
        continue;
      }
      const separator = document.createXULElement("menuseparator");
      separator.className = "zia-ext-icon-separator";
      const item = document.createXULElement("menu");
      item.className = "zia-ext-icon-menu";
      item.setAttribute("label", "Change icon");
      const popup = document.createXULElement("menupopup");
      const note = document.createXULElement("menuitem");
      note.setAttribute("label", "This extension changes its own icon");
      note.setAttribute("disabled", "true");
      note.className = "zia-ext-icon-note";
      const noteSeparator = document.createXULElement("menuseparator");
      const upload = document.createXULElement("menuitem");
      upload.setAttribute("label", "Choose an SVG…");
      const choose = document.createXULElement("menuitem");
      choose.setAttribute("label", "Pick from Zia's icons…");
      const keepSeparator = document.createXULElement("menuseparator");
      const keep = document.createXULElement("menuitem");
      keep.setAttribute("type", "checkbox");
      keep.setAttribute("label", "Keep the SVG's own colours");
      const reset = document.createXULElement("menuitem");
      reset.setAttribute("label", "Reset to the original icon");
      popup.append(note, noteSeparator, upload, choose, keepSeparator, keep, reset);
      item.append(popup);
      menu.append(separator, item);

      let target = null;
      menu.addEventListener("popupshowing", (event) => {
        if (event.target !== menu) {
          return;
        }
        target = menu.triggerNode?.closest?.("[data-extensionid]") || null;
        const id = target?.getAttribute("data-extensionid");
        const show = !!id;
        item.hidden = separator.hidden = !show;
        if (!show) {
          return;
        }
        watchExtButtons();
        const entry = extIconMap()[id];
        const changes = changingSet().has(id);
        note.hidden = noteSeparator.hidden = !changes;
        keep.hidden = !entry?.uploaded;
        keep.setAttribute("checked", String(!!entry?.own));
        reset.disabled = !entry;
      });
      const idOf = () => target?.getAttribute("data-extensionid");
      const buttonOf = () => (target?.matches?.(".webextension-browser-action") ? target : target?.querySelector?.(".webextension-browser-action")) || target;
      upload.addEventListener("command", () => idOf() && chooseExtSvg(idOf()));
      choose.addEventListener("command", () => idOf() && pickExtIcon(idOf(), buttonOf()));
      keep.addEventListener("command", () => {
        const id = idOf();
        const entry = id && extIconMap()[id];
        if (entry) {
          setExtIcon(id, { ...entry, own: keep.getAttribute("checked") === "true" });
        }
      });
      reset.addEventListener("command", () => idOf() && setExtIcon(idOf(), null));
    }
  }

  function watchExtensionIcons() {
    try {
      pointAtExtIcons();
    } catch (err) {
      noteError("extension icons: point at folder", err);
    }
    applyExtIcons();
    addExtIconMenus();
    watchExtButtons();
    try {
      CustomizableUI.addListener({
        onWidgetAfterDOMChange: () => watchExtButtons(),
        onWidgetAdded: () => requestAnimationFrame(watchExtButtons),
        onWidgetCreated: () => requestAnimationFrame(watchExtButtons),
      });
    } catch (err) {
      noteError("extension icons: listen", err);
    }
    document.getElementById("unified-extensions-panel")?.addEventListener("popupshowing", watchExtButtons);
    setTimeout(watchExtButtons, 3000);
  }
