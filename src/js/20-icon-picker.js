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
  const ICON_ROOT = "chrome://sine/content/zia/icons";
  const ICON_HOST = "zia-tabler";
  const ICON_DIR = `resource://${ICON_HOST}`;
  const ICON_STYLE_PREF = "zia.icons.style";
  let iconIndex = null;
  let iconPackReady = null;

  function iconPackPath() {
    const holder = {};
    Services.scriptloader.loadSubScript(`${ICON_ROOT}/tabler-pack.js`, holder);
    return PathUtils.join(PathUtils.profileDir, "zia-icons", `tabler-${holder.ZiaTablerPack}.zip`);
  }

  function pointAtIconPack(pack) {
    const handler = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    const jar = Services.io.newURI(`jar:${PathUtils.toFileURI(pack)}!/`);
    if (!handler.hasSubstitution(ICON_HOST) || handler.getSubstitution(ICON_HOST).spec !== jar.spec) {
      handler.setSubstitution(ICON_HOST, jar);
    }
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
    const prefix = `${ICON_DIR}/`;
    for (const image of document.querySelectorAll("image, img")) {
      for (const name of ["src", "href"]) {
        const url = image.getAttribute(name);
        if (url?.startsWith(prefix)) {
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
    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);
    let at = 0;
    const u16 = (v) => {
      view.setUint16(at, v, true);
      at += 2;
    };
    const u32 = (v) => {
      view.setUint32(at, v, true);
      at += 4;
    };
    const DATE = 0x21; // 1 January 1980
    for (const item of items) {
      item.offset = at;
      u32(0x04034b50);
      u16(10);
      u16(0);
      u16(0);
      u16(0);
      u16(DATE);
      u32(item.crc);
      u32(item.data.length);
      u32(item.data.length);
      u16(item.nameBytes.length);
      u16(0);
      out.set(item.nameBytes, at);
      at += item.nameBytes.length;
      out.set(item.data, at);
      at += item.data.length;
    }
    const directory = at;
    for (const item of items) {
      u32(0x02014b50);
      u16(20);
      u16(10);
      u16(0);
      u16(0);
      u16(0);
      u16(DATE);
      u32(item.crc);
      u32(item.data.length);
      u32(item.data.length);
      u16(item.nameBytes.length);
      u16(0);
      u16(0);
      u16(0);
      u16(0);
      u32(0o644 << 16);
      u32(item.offset);
      out.set(item.nameBytes, at);
      at += item.nameBytes.length;
    }
    const directorySize = at - directory;
    u32(0x06054b50);
    u16(0);
    u16(0);
    u16(items.length);
    u16(items.length);
    u32(directorySize);
    u32(directory);
    u16(0);
    return out;
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
        }, 500);
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
      window.SessionStore?.promiseAllWindowsRestored?.then(() => setTimeout(redraw, 300), () => {});
    }, () => {});
  }

  function addIconPicker() {
    const picker = window.gZenEmojiPicker;
    const panel = document.getElementById("PanelUI-zen-emojis-picker");
    const pages = document.getElementById("PanelUI-zen-emojis-picker-pages");
    const tabs = document.getElementById("PanelUI-zen-emojis-buttons-wrapper");
    const search = document.getElementById("PanelUI-zen-emojis-picker-search");
    if (!picker || !panel || !pages || !tabs) {
      return;
    }

    const tab = document.createXULElement("toolbarbutton");
    tab.id = "zia-icons-tab";
    tab.setAttribute("label", "Zia");
    tabs.appendChild(tab);

    function nameZenTab() {
      const zenTab = document.getElementById("PanelUI-zen-emojis-picker-change-svg");
      if (zenTab && zenTab.getAttribute("label") !== "Zen") {
        zenTab.removeAttribute("data-l10n-id");
        zenTab.removeAttribute("data-l10n-args");
        zenTab.setAttribute("label", "Zen");
      }
    }

    const HTML = "http://www.w3.org/1999/xhtml";
    const page = document.createXULElement("vbox");
    page.id = "zia-icons-page";
    const bar = document.createElementNS(HTML, "div");
    bar.id = "zia-icons-searchbar";
    const box = document.createElementNS(HTML, "input");
    box.id = "zia-icons-search";
    box.setAttribute("type", "text");
    box.setAttribute("placeholder", "Search icons");
    // Outline or solid, remembered
    const styles = document.createElementNS(HTML, "div");
    styles.id = "zia-icons-style";
    const styleButtons = {};
    for (const [value, label] of [["outline", "Outline"], ["filled", "Solid"]]) {
      const button = document.createElementNS(HTML, "button");
      button.className = "zia-icons-style-option";
      button.textContent = label;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        try {
          Services.prefs.setStringPref(ICON_STYLE_PREF, value);
        } catch (err) {
          noteError("icon picker: save style", err);
        }
        showStyle();
        render();
      });
      styleButtons[value] = button;
      styles.appendChild(button);
    }
    bar.append(box, styles);
    const grid = document.createElementNS(HTML, "div");
    grid.id = "zia-icons-grid";
    const empty = document.createElementNS(HTML, "div");
    empty.id = "zia-icons-empty";
    empty.textContent = "No icons found";
    empty.hidden = true;
    page.append(bar, grid, empty);
    pages.appendChild(page);

    function showStyle() {
      const current = iconStyle();
      for (const [value, button] of Object.entries(styleButtons)) {
        button.toggleAttribute("selected", value === current);
      }
    }

    let showing = false;
    let picked = false;
    let resolvePick = null;
    let options = null;

    function choose(url) {
      picked = true;
      options?.onSelect?.(url);
      resolvePick?.(url);
      if (options?.closeOnSelect !== false) {
        panel.hidePopup();
      }
    }

    // Results are added a screenful at a time as the grid scrolls, so the
    // thousands of icons never load at once.
    const BATCH = 180;
    let results = [];
    let shown = 0;
    let lastQuery = null;
    const more = document.createElementNS(HTML, "div");
    more.id = "zia-icons-more";
    const moreWatcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          addMore();
        }
      },
      { root: grid, rootMargin: "200px" }
    );
    moreWatcher.observe(more);

    function addMore() {
      if (shown >= results.length) {
        return;
      }
      const style = iconStyle();
      const fragment = document.createDocumentFragment();
      for (const icon of results.slice(shown, shown + BATCH)) {
        const url = `${ICON_DIR}/${style}/${icon.name}.svg`;
        const item = document.createXULElement("toolbarbutton");
        item.className = "toolbarbutton-1 zen-emojis-picker-svg zia-icon-item";
        item.setAttribute("tooltiptext", icon.name.replace(/-/g, " "));
        item.style.listStyleImage = `url(${url})`;
        item.addEventListener("command", () => choose(url));
        fragment.appendChild(item);
      }
      shown = Math.min(results.length, shown + BATCH);
      grid.insertBefore(fragment, more);
    }

    function render() {
      const style = iconStyle();
      const query = `${style}:${(box.value || "").trim()}`;
      if (query === lastQuery) {
        return;
      }
      lastQuery = query;
      results = searchIcons(tablerIcons().filter((icon) => icon[style]), box.value || "");
      shown = 0;
      grid.replaceChildren(more);
      grid.scrollTop = 0;
      empty.hidden = results.length > 0;
      addMore();
    }

    function show() {
      showing = true;
      showStyle();
      render();
      box.focus({ preventScroll: true });
      page.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      tab.classList.add("selected");
      for (const other of tabs.children) {
        if (other !== tab) {
          other.classList.remove("selected");
        }
      }
    }

    tab.addEventListener("command", show);

    panel.addEventListener("command", (event) => {
      if (event.target === tab) {
        return;
      }
      if (event.target.id?.startsWith("PanelUI-zen-emojis-picker-change")) {
        showing = false;
        tab.classList.remove("selected");
      }
    });

    function matchZenSearch() {
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

    box.addEventListener("input", render);

    search?.addEventListener("input", () => {
      if (showing) {
        box.value = search.value;
        render();
      }
    });

    panel.addEventListener("popupshowing", () => {
      nameZenTab();
      matchZenSearch();
    });

    panel.addEventListener("popupshown", () => {
      nameZenTab();
      matchZenSearch();
      showing = false;
      tab.classList.remove("selected");
      if (search && lastQuery !== null) {
        render();
      }
    });

    const openPicker = picker.open.bind(picker);
    picker.open = function (anchor, settings = {}) {
      const zenPick = openPicker(anchor, settings);
      if (!zenPick) {
        return zenPick;
      }
      options = settings;
      picked = false;
      const ziaPick = new Promise((resolve) => {
        resolvePick = resolve;
      });

      return Promise.race([
        zenPick.catch((err) => {
          if (picked) {
            return ziaPick;
          }
          throw err;
        }),
        ziaPick,
      ]);
    };
  }

