  // Zia's icons are Tabler Icons (made by scripts/tabler-icons.py), each in
  // an outline and, for about a thousand of them, a solid style. The search
  // index holds every icon's name, tags and category, so "money" finds cash,
  // coins and wallet.
  //
  // They come as one file, icons/tabler-bundle.js: Sine unpacks a mod file
  // by file, and several thousand icons froze Zen for half a minute on some
  // computers (and as one file they compress to a fraction of the size).
  // Zia makes a zip of them in the profile (once per icon pack, so Zia's own
  // updates don't redo it) and reads icons straight out of it, the way
  // Firefox reads its own, at resource://zia-tabler/.
  // Used elsewhere: ICON_DIR, pointResource, setupIconPack, tablerIcons, watchOldIcons,
  // addIconPicker.
  const ICON_ROOT = "chrome://sine/content/zia/icons";
  const ICON_HOST = "zia-tabler";
  const ICON_DIR = `resource://${ICON_HOST}`;
  const ICON_STYLE_PREF = "zia.icons.style";
  // (old icons moved off a beat after folders and spaces change, all at once)
  const OLD_ICONS_QUEUE_MS = 500;
  // (icons drawn again a beat after the session's folders and spaces are back)
  const ICON_REDRAW_MS = 300;
  // Results are added a screenful at a time as the grid scrolls, so the
  // thousands of icons never load at once.
  const ICON_BATCH = 180;
  const ZIP_DATE = 0x21; // 1 January 1980
  let iconIndex = null;
  let iconPackReady = null;

  function iconPackPath() {
    const holder = {};
    Services.scriptloader.loadSubScript(`${ICON_ROOT}/tabler-pack.js`, holder);
    return PathUtils.join(PathUtils.profileDir, "zia-icons", `tabler-${holder.ZiaTablerPack}.zip`);
  }

  // a resource:// host pointed at a folder or zip, unless it already is
  function pointResource(host, spec) {
    const handler = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    const uri = Services.io.newURI(spec);
    if (!handler.hasSubstitution(host) || handler.getSubstitution(host).spec !== uri.spec) {
      handler.setSubstitution(host, uri);
    }
  }

  function pointAtIconPack(pack) {
    pointResource(ICON_HOST, `jar:${PathUtils.toFileURI(pack)}!/`);
  }

  // Folder and space icons are drawn as Zen restores them, before the rest
  // of Zia starts, so once the pack is there it's pointed at the moment this
  // script loads.
  try {
    const pack = iconPackPath();
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(pack);
    if (file.exists()) {
      pointAtIconPack(pack);
    }
  } catch (err) {
    noteError("icon pack: early", err);
  }

  // Anything that still asked for an icon before the pack was ready (the
  // first start with it) is drawn again.
  function redrawPackIcons() {
    const prefixes = [`${ICON_DIR}/`, "resource://zia-own-icons/"];
    for (const image of document.querySelectorAll("image, img")) {
      for (const name of ["src", "href"]) {
        const url = image.getAttribute(name);
        if (prefixes.some((prefix) => url?.startsWith(prefix))) {
          image.setAttribute(name, "");
          image.setAttribute(name, url);
          if (image.style.opacity === "0") {
            image.style.opacity = "1";
          }
        }
      }
    }
  }

  // The bundle's icons as a zip ({outline,filled}/name.svg and the LICENSE),
  // stored rather than compressed: it's only ever read from the profile.
  let crcTable = null;
  const crc32 = (bytes) => {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        crcTable[n] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  function zipOf(entries) {
    const encoder = new TextEncoder();
    const items = entries.map(([name, text]) => {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(text);
      return { nameBytes, data, crc: crc32(data) };
    });
    let size = 22;
    for (const item of items) {
      size += 30 + 46 + 2 * item.nameBytes.length + item.data.length;
    }
    const zip = zipWriter(size);
    for (const item of items) {
      writeZipEntry(zip, item);
    }
    const directory = zip.at;
    for (const item of items) {
      writeZipDirectoryEntry(zip, item);
    }
    const directorySize = zip.at - directory;
    zip.u32(0x06054b50);
    zip.u16(0);
    zip.u16(0);
    zip.u16(items.length);
    zip.u16(items.length);
    zip.u32(directorySize);
    zip.u32(directory);
    zip.u16(0);
    return zip.out;
  }

  // little-endian numbers and bytes written one after another
  function zipWriter(size) {
    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);
    const zip = {
      out,
      at: 0,
      u16: (v) => {
        view.setUint16(zip.at, v, true);
        zip.at += 2;
      },
      u32: (v) => {
        view.setUint32(zip.at, v, true);
        zip.at += 4;
      },
      bytes: (bytes) => {
        out.set(bytes, zip.at);
        zip.at += bytes.length;
      },
    };
    return zip;
  }

  function writeZipEntry(zip, item) {
    item.offset = zip.at;
    zip.u32(0x04034b50);
    zip.u16(10);
    zip.u16(0);
    zip.u16(0);
    zip.u16(0);
    zip.u16(ZIP_DATE);
    zip.u32(item.crc);
    zip.u32(item.data.length);
    zip.u32(item.data.length);
    zip.u16(item.nameBytes.length);
    zip.u16(0);
    zip.bytes(item.nameBytes);
    zip.bytes(item.data);
  }

  function writeZipDirectoryEntry(zip, item) {
    zip.u32(0x02014b50);
    zip.u16(20);
    zip.u16(10);
    zip.u16(0);
    zip.u16(0);
    zip.u16(0);
    zip.u16(ZIP_DATE);
    zip.u32(item.crc);
    zip.u32(item.data.length);
    zip.u32(item.data.length);
    zip.u16(item.nameBytes.length);
    zip.u16(0);
    zip.u16(0);
    zip.u16(0);
    zip.u16(0);
    zip.u32(0o644 << 16);
    zip.u32(item.offset);
    zip.bytes(item.nameBytes);
  }

  async function packFromBundle() {
    const holder = {};
    Services.scriptloader.loadSubScript(`${ICON_ROOT}/tabler-bundle.js`, holder);
    const { head, icons } = holder.ZiaTablerBundle;
    const entries = [];
    for (const style of Object.keys(icons).sort()) {
      for (const name of Object.keys(icons[style]).sort()) {
        entries.push([`${style}/${name}.svg`, `${head[style]}${icons[style][name]}</svg>`]);
      }
    }
    try {
      entries.push(["LICENSE", await (await fetch(`${ICON_ROOT}/tabler-LICENSE`)).text()]);
    } catch (err) {
      noteError("icon pack: licence", err);
    }
    return zipOf(entries);
  }

  function setupIconPack() {
    iconPackReady ??= (async () => {
      const pack = iconPackPath();
      const dir = PathUtils.parent(pack);
      if (!(await IOUtils.exists(pack))) {
        const bytes = await packFromBundle();
        await IOUtils.makeDirectory(dir, { ignoreExisting: true });
        // written aside first, so another window never reads half a zip
        const part = `${pack}.${Math.random().toString(36).slice(2)}.part`;
        await IOUtils.write(part, bytes);
        await IOUtils.move(part, pack);
      }
      pointAtIconPack(pack);
      // Older packs go (one still open can't be removed on Windows until
      // Zen restarts; it goes next time).
      for (const child of await IOUtils.getChildren(dir)) {
        if (child !== pack && /tabler-[^/\\]*\.zip(\.[a-z0-9]+\.part)?$/.test(child)) {
          IOUtils.remove(child).catch(() => {});
        }
      }
    })();
    iconPackReady.catch((err) => noteError("icon pack", err));
    return iconPackReady;
  }

  function tablerIcons() {
    if (iconIndex) {
      return iconIndex;
    }
    const holder = {};
    try {
      Services.scriptloader.loadSubScript(`${ICON_ROOT}/tabler-names.js`, holder);
    } catch (err) {
      noteError("icon picker: load names", err);
    }
    iconIndex = (holder.ZiaTablerIcons || []).map((row) => {
      const [name, styles, words] = row.split("|");
      return { name, outline: styles.includes("o"), filled: styles.includes("f"), words: words || "" };
    });
    return iconIndex;
  }

  function iconStyle() {
    try {
      return Services.prefs.getStringPref(ICON_STYLE_PREF, "outline") === "filled" ? "filled" : "outline";
    } catch (err) {
      return "outline";
    }
  }

  // Best matches first: the name itself, then words in the name, then tags.
  function searchIcons(icons, text) {
    const terms = text.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (!terms.length) {
      return icons;
    }
    const scored = [];
    for (const icon of icons) {
      const parts = icon.name.split("-");
      let score = 0;
      for (const term of terms) {
        if (parts.includes(term)) {
          score += 3;
        } else if (parts.some((part) => part.startsWith(term))) {
          score += 2;
        } else if (icon.name.includes(term) || icon.words.includes(term)) {
          score += 1;
        } else {
          score = 0;
          break;
        }
      }
      if (score) {
        if (icon.name === terms.join("-")) {
          score += 10;
        } else if (parts[0] === terms[0]) {
          score += 1;
        }
        scored.push({ icon, score });
      }
    }
    return scored.sort((a, b) => b.score - a.score || a.icon.name.length - b.icon.name.length).map((entry) => entry.icon);
  }

  // Folders and spaces that still point at a Phosphor icon (Zia's icons
  // before 2.42.0) switch to the closest Tabler one, and ones pointing at a
  // loose Tabler file (before 2.58.0) to the same icon in the pack.
  const OLD_ICON_DIR = `${ICON_ROOT}/phosphor/`;
  const LOOSE_ICON_DIR = `${ICON_ROOT}/tabler/`;
  let oldIconMap = null;

  function tablerFor(url) {
    if (typeof url === "string" && url.startsWith(LOOSE_ICON_DIR)) {
      return `${ICON_DIR}/${url.slice(LOOSE_ICON_DIR.length)}`;
    }
    if (typeof url !== "string" || !url.startsWith(OLD_ICON_DIR)) {
      return null;
    }
    if (!oldIconMap) {
      const holder = {};
      try {
        Services.scriptloader.loadSubScript(`${ICON_ROOT}/phosphor-to-tabler.js`, holder);
      } catch (err) {
        noteError("icon picker: load old icon map", err);
      }
      oldIconMap = holder.ZiaPhosphorToTabler || {};
    }
    const name = url.slice(OLD_ICON_DIR.length).replace(/\.svg$/, "");
    return `${ICON_DIR}/outline/${oldIconMap[name] || name}.svg`;
  }

  function moveOffOldIcons() {
    for (const folder of document.querySelectorAll("zen-folder")) {
      const icon = tablerFor(folder.iconURL);
      if (icon) {
        try {
          window.gZenFolders?.setFolderUserIcon(folder, icon);
          folder.dispatchEvent(new CustomEvent("TabGroupUpdate", { bubbles: true }));
        } catch (err) {
          noteError("icon picker: move folder icon", err);
        }
      }
    }
    try {
      for (const space of window.gZenWorkspaces?.getWorkspaces?.() || []) {
        const icon = tablerFor(space.icon);
        if (icon) {
          space.icon = icon;
          window.gZenWorkspaces.saveWorkspace(space);
        }
      }
    } catch (err) {
      noteError("icon picker: move space icons", err);
    }
  }

  function watchOldIcons() {
    let queued = false;
    const queue = () => {
      if (!queued) {
        queued = true;
        setTimeout(() => {
          queued = false;
          setupIconPack().finally(moveOffOldIcons);
        }, OLD_ICONS_QUEUE_MS);
      }
    };
    gBrowser.tabContainer.addEventListener("TabGroupCreate", queue);
    window.addEventListener("ZenWorkspacesUIUpdate", queue);
    window.SessionStore?.promiseAllWindowsRestored?.then(queue, queue);
    queue();
    // Icons asked for before the pack was ready are drawn again once it is,
    // including after the session's folders and spaces have come back.
    const redraw = () => {
      redrawPackIcons();
      placeWorkspaceIndicator();
    };
    setupIconPack().then(() => {
      redraw();
      window.SessionStore?.promiseAllWindowsRestored?.then(() => setTimeout(redraw, ICON_REDRAW_MS), () => {});
    }, () => {});
  }

  // Zia's tab in Zen's emoji and icon picker: its elements, whether it's the page shown,
  // the pick under way (Zen's settings for it, whether Zia's page made it, and how to hand it
  // back), and the search's results and how many of them are in the grid
  const iconPicker = {
    panel: null,
    tabs: null,
    tab: null,
    page: null,
    bar: null,
    box: null,
    styleButtons: {},
    grid: null,
    empty: null,
    more: null,
    showing: false,
    picked: false,
    resolvePick: null,
    options: null,
    results: [],
    shown: 0,
    lastQuery: null,
  };

  function addIconPicker() {
    const picker = window.gZenEmojiPicker;
    const panel = document.getElementById("PanelUI-zen-emojis-picker");
    const pages = document.getElementById("PanelUI-zen-emojis-picker-pages");
    const tabs = document.getElementById("PanelUI-zen-emojis-buttons-wrapper");
    const search = document.getElementById("PanelUI-zen-emojis-picker-search");
    if (!picker || !panel || !pages || !tabs) {
      return;
    }
    iconPicker.panel = panel;
    iconPicker.tabs = tabs;

    const tab = document.createXULElement("toolbarbutton");
    iconPicker.tab = tab;
    tab.id = "zia-icons-tab";
    tab.setAttribute("label", "Zia");
    tabs.appendChild(tab);

    buildIconsPage(pages);
    const more = document.createElementNS(XHTML_NS, "div");
    iconPicker.more = more;
    more.id = "zia-icons-more";
    const moreWatcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          addMoreIcons();
        }
      },
      { root: iconPicker.grid, rootMargin: "200px" }
    );
    moreWatcher.observe(more);

    tab.addEventListener("command", showIconsPage);
    panel.addEventListener("command", onIconPickerCommand);
    iconPicker.box.addEventListener("input", renderIcons);
    search?.addEventListener("input", () => {
      if (iconPicker.showing) {
        iconPicker.box.value = search.value;
        renderIcons();
      }
    });
    panel.addEventListener("popupshowing", () => {
      nameZenTab();
      matchZenSearch();
    });
    panel.addEventListener("popupshown", () => {
      nameZenTab();
      matchZenSearch();
      iconPicker.showing = false;
      tab.classList.remove("selected");
      if (search && iconPicker.lastQuery !== null) {
        renderIcons();
      }
    });
    wrapIconPickerOpen(picker);
  }

  function nameZenTab() {
    const zenTab = document.getElementById("PanelUI-zen-emojis-picker-change-svg");
    if (zenTab && zenTab.getAttribute("label") !== "Zen") {
      zenTab.removeAttribute("data-l10n-id");
      zenTab.removeAttribute("data-l10n-args");
      zenTab.setAttribute("label", "Zen");
    }
  }

  function buildIconsPage(pages) {
    const page = document.createXULElement("vbox");
    iconPicker.page = page;
    page.id = "zia-icons-page";
    const bar = document.createElementNS(XHTML_NS, "div");
    iconPicker.bar = bar;
    bar.id = "zia-icons-searchbar";
    const box = document.createElementNS(XHTML_NS, "input");
    iconPicker.box = box;
    box.id = "zia-icons-search";
    box.setAttribute("type", "text");
    box.setAttribute("placeholder", "Search icons");
    bar.append(box, buildIconStyleButtons());
    const grid = document.createElementNS(XHTML_NS, "div");
    iconPicker.grid = grid;
    grid.id = "zia-icons-grid";
    const empty = document.createElementNS(XHTML_NS, "div");
    iconPicker.empty = empty;
    empty.id = "zia-icons-empty";
    empty.textContent = "No icons found";
    empty.hidden = true;
    page.append(bar, grid, empty);
    pages.appendChild(page);
  }

  // Outline or solid, remembered
  function buildIconStyleButtons() {
    const styles = document.createElementNS(XHTML_NS, "div");
    styles.id = "zia-icons-style";
    for (const [value, label] of [["outline", "Outline"], ["filled", "Solid"]]) {
      const button = document.createElementNS(XHTML_NS, "button");
      button.className = "zia-icons-style-option";
      button.textContent = label;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        try {
          Services.prefs.setStringPref(ICON_STYLE_PREF, value);
        } catch (err) {
          noteError("icon picker: save style", err);
        }
        showIconStyle();
        renderIcons();
      });
      iconPicker.styleButtons[value] = button;
      styles.appendChild(button);
    }
    return styles;
  }

  function showIconStyle() {
    const current = iconStyle();
    for (const [value, button] of Object.entries(iconPicker.styleButtons)) {
      button.toggleAttribute("selected", value === current);
    }
  }

  function chooseIcon(url) {
    const { panel, options } = iconPicker;
    iconPicker.picked = true;
    // as Zen does after its own picks: with an icon chosen, the "none"
    // (bin) button can take it off again
    panel.removeAttribute("hide-none-option");
    options?.onSelect?.(url);
    iconPicker.resolvePick?.(url);
    if (options?.closeOnSelect !== false) {
      panel.hidePopup();
    }
  }

  function addMoreIcons() {
    const { results, shown } = iconPicker;
    if (shown >= results.length) {
      return;
    }
    const style = iconStyle();
    const fragment = document.createDocumentFragment();
    for (const icon of results.slice(shown, shown + ICON_BATCH)) {
      const url = `${ICON_DIR}/${style}/${icon.name}.svg`;
      const item = document.createXULElement("toolbarbutton");
      item.className = "toolbarbutton-1 zen-emojis-picker-svg zia-icon-item";
      item.setAttribute("tooltiptext", icon.name.replace(/-/g, " "));
      item.style.listStyleImage = `url(${url})`;
      // Zen's picker takes every click on an icon with its class as one
      // of its own, and would pass on a broken address (it reads an
      // "icon" attribute these don't have) after Zia's
      item.addEventListener("command", (event) => {
        event.stopPropagation();
        chooseIcon(url);
      });
      fragment.appendChild(item);
    }
    iconPicker.shown = Math.min(results.length, shown + ICON_BATCH);
    iconPicker.grid.insertBefore(fragment, iconPicker.more);
  }

  function renderIcons() {
    const { box, grid } = iconPicker;
    const style = iconStyle();
    const query = `${style}:${(box.value || "").trim()}`;
    if (query === iconPicker.lastQuery) {
      return;
    }
    iconPicker.lastQuery = query;
    iconPicker.results = searchIcons(tablerIcons().filter((icon) => icon[style]), box.value || "");
    iconPicker.shown = 0;
    grid.replaceChildren(iconPicker.more);
    grid.scrollTop = 0;
    iconPicker.empty.hidden = iconPicker.results.length > 0;
    addMoreIcons();
  }

  function showIconsPage() {
    iconPicker.showing = true;
    showIconStyle();
    renderIcons();
    iconPicker.box.focus({ preventScroll: true });
    iconPicker.page.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    for (const other of iconPicker.tabs.children) {
      other.classList.toggle("selected", other === iconPicker.tab);
    }
  }

  function onIconPickerCommand(event) {
    if (event.target === iconPicker.tab) {
      return;
    }
    if (event.target.id?.startsWith("PanelUI-zen-emojis-picker-change")) {
      iconPicker.showing = false;
      iconPicker.tab.classList.remove("selected");
    }
  }

  function matchZenSearch() {
    const { box, bar, grid } = iconPicker;
    const zenBox = document.getElementById("PanelUI-zen-emojis-picker-search");
    if (!zenBox) {
      return;
    }
    const from = getComputedStyle(zenBox);
    for (const prop of [
      "appearance", "padding", "border", "borderRadius", "backgroundColor",
      "backgroundImage", "color", "font", "fontSize", "fontFamily",
      "boxShadow", "outline", "minHeight", "height", "lineHeight",
    ]) {
      const value = from[prop];
      if (value && value !== "auto") {
        box.style[prop] = value;
      }
    }
    const rect = zenBox.getBoundingClientRect();
    if (rect.height > 0) {
      box.style.boxSizing = "border-box";
      box.style.height = `${rect.height}px`;
      box.style.minHeight = `${rect.height}px`;
    }
    const header = document.getElementById("PanelUI-zen-emojis-picker-header");
    if (header) {
      const row = getComputedStyle(header);
      for (const prop of ["padding", "gap", "alignItems"]) {
        if (row[prop]) {
          bar.style[prop] = row[prop];
        }
      }
    }
    const zenList = document.getElementById("PanelUI-zen-emojis-picker-svgs");
    if (zenList) {
      const list = getComputedStyle(zenList);
      for (const prop of ["padding", "gap", "gridTemplateColumns"]) {
        if (list[prop]) {
          grid.style[prop] = list[prop];
        }
      }
    }
  }

  function wrapIconPickerOpen(picker) {
    const openPicker = picker.open.bind(picker);
    picker.open = function (anchor, settings = {}) {
      const zenPick = openPicker(anchor, settings);
      if (!zenPick) {
        return zenPick;
      }
      iconPicker.options = settings;
      iconPicker.picked = false;
      const ziaPick = new Promise((resolve) => {
        iconPicker.resolvePick = resolve;
      });
      return Promise.race([
        zenPick.catch((err) => {
          if (iconPicker.picked) {
            return ziaPick;
          }
          throw err;
        }),
        ziaPick,
      ]);
    };
  }
