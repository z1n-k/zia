  function lastUsedOtherTab(tab) {
    let best = null;
    for (const other of gBrowser.visibleTabs) {
      if (other === tab || other.hasAttribute("zen-empty-tab") || other.hasAttribute("zen-essential") || other.closing) {
        continue;
      }
      if (!best || (other.lastAccessed || 0) > (best.lastAccessed || 0)) {
        best = other;
      }
    }
    return best;
  }

  const NEW_TAB_PAGES = new Set(["about:newtab", "about:home", "about:blank", "about:privatebrowsing"]);

  function tabCardKind(tab) {
    const uri = tab.linkedBrowser?.currentURI;
    const spec = uri?.spec || "";
    if (/^https?:/.test(spec)) {
      return "web";
    }
    if (!spec || NEW_TAB_PAGES.has(spec) || tab.hasAttribute("zen-empty-tab")) {
      return "new";
    }
    return "internal";
  }

  const INTERNAL_PAGE_NAMES = { preferences: "settings", addons: "extensions" };

  function tabCardDomain(tab) {
    try {
      const uri = tab.linkedBrowser?.currentURI;
      if (!uri || isMultiviewURI(uri)) {
        return "";
      }
      if (/^https?$/.test(uri.scheme)) {
        return uri.host.replace(/^www\./, "");
      }
      if (uri.scheme === "about") {
        const name = uri.filePath.split(/[?#]/)[0].toLowerCase();
        return INTERNAL_PAGE_NAMES[name] || name;
      }
      return "";
    } catch (err) {
      return "";
    }
  }

  function buildTabCard(onAction) {
    const card = document.createElementNS(XHTML_NS, "div");
    card.id = "zia-tab-card";
    card.hidden = true;
    const title = document.createElementNS(XHTML_NS, "div");
    title.className = "zia-tab-card-title";
    const sub = document.createElementNS(XHTML_NS, "div");
    sub.className = "zia-tab-card-sub";
    const row = document.createElementNS(XHTML_NS, "div");
    row.id = "zia-tab-card-actions";
    for (const action of TAB_CARD_ACTIONS) {
      const button = document.createElementNS(XHTML_NS, "button");
      button.className = "zia-tab-card-action";
      button.setAttribute("zia-action", action.name);
      button.title = action.label;

      const icon = document.createElementNS(XHTML_NS, "img");
      icon.setAttribute("src", `chrome://sine/content/zia/icons/ui/${action.icon}.svg`);
      icon.setAttribute("alt", "");
      button.appendChild(icon);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        onAction(action);
      });
      row.appendChild(button);
    }
    // (the picture is the box's background, painted from the canvas (-moz-element), which takes
    // the card's squircle: clipped, the screen drew it with a plain round corner, not the card's)
    const shot = document.createElementNS(XHTML_NS, "div");
    shot.className = "zia-tab-card-shot";
    shot.hidden = true;
    const thumb = document.createElementNS(XHTML_NS, "canvas");
    thumb.className = "zia-tab-card-thumb";
    thumb.id = "zia-tab-card-thumb";
    shot.append(thumb);
    card.append(shot, title, sub, row);
    root.appendChild(card);
    return card;
  }

  // the page's picture at the top of the card, as in Dia (zia.cards.page-picture), the open tab's
  // too; set in from the card's edge by TAB_THUMB_INSET (07-hover-cards)
  const TAB_THUMB_RATIO = 0.55;
  const TAB_THUMB_INSET = 2;
  let thumbToken = 0;

  // A tab that's asleep (as most are after a restart: they load when opened) has no page to
  // picture, so each tab's picture is kept as you leave it, in the profile by its address, and
  // a sleeping tab's card shows the last one. Taken when the browser is idle and saved in the
  // background, so it never holds up switching tabs; never kept in a private window.
  const PICTURE_DIR = PathUtils.join(PathUtils.profileDir, "zia-page-pictures");
  const PICTURES_KEPT = 400;
  const PICTURE_RESAVE_MS = 60000;
  const pictureFiles = new Set();
  const pictureMemo = new Map();
  const pictureSaved = new Map();

  // (a 64-bit hash of the address, without its #part, as the file's name)
  function pictureName(url) {
    const text = String(url).split("#")[0];
    let a = 0x811c9dc5;
    let b = 0x5bd1e995;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619);
      b = Math.imul(b ^ c, 2246822507);
    }
    return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}.webp`;
  }

  function tabAddress(tab) {
    const spec = tab?.linkedBrowser?.currentURI?.spec;
    if (spec && spec !== "about:blank") {
      return spec;
    }
    try {
      return window.SessionStore.getLazyTabValue(tab, "url") || "";
    } catch (err) {
      return "";
    }
  }

  const keepsPictureOf = (url) =>
    /^https?:/i.test(url) &&
    Services.prefs.getBoolPref("zia.cards.page-picture", true) &&
    !window.PrivateBrowsingUtils?.isWindowPrivate(window);

  // the saved pictures, listed once; past PICTURES_KEPT, the oldest go
  async function readPictureList() {
    const files = (await IOUtils.getChildren(PICTURE_DIR, { ignoreAbsent: true })).filter((file) => file.endsWith(".webp"));
    for (const file of files) {
      pictureFiles.add(PathUtils.filename(file));
    }
    if (files.length <= PICTURES_KEPT) {
      return;
    }
    const dated = await Promise.all(files.map(async (file) => [file, (await IOUtils.stat(file)).lastModified]));
    dated.sort((x, y) => x[1] - y[1]);
    for (const [file] of dated.slice(0, files.length - PICTURES_KEPT)) {
      pictureFiles.delete(PathUtils.filename(file));
      await IOUtils.remove(file, { ignoreAbsent: true });
    }
  }

  async function savePicture(url, canvas) {
    if (!keepsPictureOf(url)) {
      return;
    }
    pictureSaved.set(url, Date.now());
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob) {
      return;
    }
    const name = pictureName(url);
    await IOUtils.makeDirectory(PICTURE_DIR, { ignoreExisting: true });
    await IOUtils.write(PathUtils.join(PICTURE_DIR, name), new Uint8Array(await blob.arrayBuffer()));
    pictureFiles.add(name);
    pictureMemo.delete(name);
  }

  // (the last few read, held as pictures)
  function loadPicture(url) {
    const name = pictureName(url);
    if (!pictureFiles.has(name)) {
      return Promise.resolve(null);
    }
    if (!pictureMemo.has(name)) {
      const read = IOUtils.read(PathUtils.join(PICTURE_DIR, name))
        .then((bytes) => createImageBitmap(new Blob([bytes], { type: "image/webp" })))
        .catch(() => null);
      pictureMemo.set(name, read);
      if (pictureMemo.size > 24) {
        pictureMemo.delete(pictureMemo.keys().next().value);
      }
    }
    return pictureMemo.get(name);
  }

  function sizeThumbCanvas(canvas) {
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    // (the card's set width: it may still be hidden)
    const width = (parseFloat(getComputedStyle(root).getPropertyValue("--zia-tab-card-width")) || 260) - 2 * TAB_THUMB_INSET;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(width * TAB_THUMB_RATIO * ratio);
  }

  // a loaded tab's page drawn into the canvas, there and then; true if it was
  async function capturePage(canvas, tab) {
    const browser = tab.linkedBrowser;
    try {
      const { PageThumbs } = ChromeUtils.importESModule("resource://gre/modules/PageThumbs.sys.mjs");
      if (typeof PageThumbs?.captureTabPreviewThumbnail === "function" && (await PageThumbs.captureTabPreviewThumbnail(browser, canvas))) {
        return true;
      }
    } catch (err) {
      // (drawn below instead)
    }
    const windowGlobal = browser?.browsingContext?.currentWindowGlobal;
    const width = browser?.clientWidth;
    if (!windowGlobal || !width) {
      return false;
    }
    let picture = null;
    try {
      picture = await windowGlobal.drawSnapshot(new DOMRect(0, 0, width, width * TAB_THUMB_RATIO), canvas.width / width, "white");
    } catch (err) {
      return false;
    }
    const ctx = canvas.getContext("2d");
    const sw = picture.width;
    const sh = Math.min(picture.height, sw * TAB_THUMB_RATIO);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(picture, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height);
    picture.close?.();
    return true;
  }

  // the tab you've just left, pictured once the browser is idle
  function keepPictureOf(tab) {
    if (!tab?.linkedBrowser || tab.hasAttribute("pending") || !tab.linkedPanel || tab.closing) {
      return;
    }
    const url = tabAddress(tab);
    if (!keepsPictureOf(url)) {
      return;
    }
    requestIdleCallback(
      async () => {
        if (!tab.isConnected || tab.selected || tab.hasAttribute("pending") || tabAddress(tab) !== url) {
          return;
        }
        const canvas = document.createElementNS(XHTML_NS, "canvas");
        sizeThumbCanvas(canvas);
        if (await capturePage(canvas, tab)) {
          await savePicture(url, canvas);
        }
      },
      { timeout: 3000 }
    );
  }

  function asleep(tab) {
    return tab.hasAttribute("pending") || !tab.linkedPanel;
  }

  function wantsTabThumb(tab) {
    if (!Services.prefs.getBoolPref("zia.cards.page-picture", true) || !tab.linkedBrowser || tabCardKind(tab) === "new") {
      return false;
    }
    return !asleep(tab) || pictureFiles.has(pictureName(tabAddress(tab)));
  }

  async function drawTabThumb(canvas, tab, token) {
    const stale = () => token !== thumbToken || !canvas.isConnected;
    const ctx = canvas.getContext("2d");
    if (asleep(tab)) {
      const picture = await loadPicture(tabAddress(tab));
      if (picture && !stale()) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
      }
      return;
    }
    const captured = await capturePage(canvas, tab);
    if (stale()) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    // (what's shown is kept too, at most once a minute a page)
    const url = tabAddress(tab);
    if (captured && Date.now() - (pictureSaved.get(url) || 0) > PICTURE_RESAVE_MS) {
      const copy = document.createElementNS(XHTML_NS, "canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      copy.getContext("2d").drawImage(canvas, 0, 0);
      savePicture(url, copy).catch((err) => noteError("hover card: keep picture", err));
    }
  }

  function fillTabCard(card, tab) {
    // a split essential's card is about the half you're in
    const shown = splitCardSource(tab) || tab;
    const isNew = tabCardKind(shown) === "new";
    card.querySelector(".zia-tab-card-title").textContent = shown.label || "New Tab";
    const sub = card.querySelector(".zia-tab-card-sub");
    sub.textContent = isNew ? "" : tabCardDomain(shown);
    sub.hidden = !sub.textContent;

    const thumb = card.querySelector(".zia-tab-card-thumb");
    const token = ++thumbToken;
    thumb.parentElement.hidden = !wantsTabThumb(shown);
    if (!thumb.parentElement.hidden) {
      sizeThumbCanvas(thumb);
      drawTabThumb(thumb, shown, token).catch((err) => noteError("hover card: thumbnail", err));
    }

    const row = card.querySelector("#zia-tab-card-actions");
    row.hidden = isNew;
    for (const button of row.children) {
      const action = TAB_CARD_ACTIONS.find((a) => a.name === button.getAttribute("zia-action"));
      button.hidden = !!action?.hidden?.(tab);
    }
  }

  // keeps the card in the window; returns the top it got
  function moveCard(card, x, y) {
    x = Math.max(TAB_CARD_GAP, Math.min(x, window.innerWidth - card.offsetWidth - TAB_CARD_GAP));
    y = Math.max(TAB_CARD_GAP, Math.min(y, window.innerHeight - card.offsetHeight - TAB_CARD_GAP));
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
    return y;
  }

  function placeTabCard(card, tab) {
    const tile = tab.querySelector(":scope > .tab-stack > .tab-background");
    const tileBox = tile?.getBoundingClientRect();
    const tabBox = tileBox && tileBox.width > 0 && tileBox.height > 0 ? tileBox : tab.getBoundingClientRect();
    const sidebar = document.getElementById("navigator-toolbox")?.getBoundingClientRect() || tabBox;
    const onRight = root.getAttribute("zen-right-side") === "true";
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    let x;
    let y;
    let origin;
    if (tab.hasAttribute("zen-essential")) {
      card.setAttribute("zia-anchor", "essential");
      y = tabBox.bottom - ESSENTIAL_CARD_OVERLAP_Y;
      if (onRight) {
        card.setAttribute("zia-side", "right");
        x = tabBox.left - width + ESSENTIAL_CARD_OVERLAP_X;
        origin = "top right";
      } else {
        card.removeAttribute("zia-side");
        x = tabBox.right - ESSENTIAL_CARD_OVERLAP_X;
        origin = "top left";
      }
    } else {
      card.setAttribute("zia-anchor", "tab");
      card.removeAttribute("zia-side");
      x = onRight ? sidebar.left - width - TAB_CARD_GAP : sidebar.right + TAB_CARD_GAP;
      y = tabBox.top + tabBox.height / 2 - height / 2;
      origin = onRight ? "right center" : "left center";
    }
    moveCard(card, x, y);
    card.style.transformOrigin = origin;
  }

  function tabsInFolder(folder) {
    return (folder.tabs || []).filter((tab) => !tab.hidden && !tab.hasAttribute("zen-empty-tab") && !tab.closing);
  }

  function newTabInFolder(folder) {
    const pinned = folder.tabs?.some((tab) => tab.pinned) ?? true;
    const tab = gBrowser.addTrustedTab("about:newtab", { pinned });
    if (pinned && !tab.pinned) {
      gBrowser.pinTab(tab);
    }

    const collapsed = folder.collapsed || folder.hasAttribute("collapsed");
    if (collapsed && !folder.hasAttribute("has-active")) {
      folder.setAttribute("has-active", "true");
      folder.activeTabs = [];
    }
    folder.addTabs([tab]);
    gBrowser.selectedTab = tab;
    if (collapsed && !folder.collapsed) {
      folder.collapsed = true;
    }
  }

  function buildFolderCard(onPick) {
    const card = document.createElementNS(XHTML_NS, "div");
    card.id = "zia-folder-card";
    card.hidden = true;
    card.addEventListener("click", (event) => {
      const row = event.target.closest?.(".zia-folder-card-row");
      if (!row) {
        return;
      }
      event.stopPropagation();
      const act = event.target.closest?.(".zia-folder-card-act")?.getAttribute("zia-act");
      const tab = row.ziaTab;
      if (act && tab?.isConnected) {
        card.dispatchEvent(new CustomEvent("zia-card-acting"));
        try {
          if (act === "mute") {
            tab.toggleMuteAudio();
          } else if (act === "close") {
            gBrowser.removeTab(tab, { animate: true });
          } else if (act === "unload") {
            tab.querySelector(".tab-reset-button")?.click();
          }
        } catch (err) {
          console.error("[Zia] Folder card button failed:", err);
        }

        for (const delay of [60, 400, 900]) {
          setTimeout(() => {
            if (!card.hidden && card.ziaFolder?.isConnected) {
              fillFolderCard(card, card.ziaFolder);
            }
          }, delay);
        }
        return;
      }
      onPick(row);
    });
    root.appendChild(card);
    return card;
  }

  function folderCardIcon(src, className) {
    const icon = document.createElementNS(XHTML_NS, "img");
    icon.className = className;
    icon.setAttribute("src", src);
    icon.setAttribute("alt", "");
    icon.addEventListener("error", () => icon.setAttribute("src", DEFAULT_TAB_ICON), { once: true });
    return icon;
  }

  function tabButtonIcon(tab, selector, fallback) {
    const button = tab.querySelector(selector);
    const url = button ? getComputedStyle(button).listStyleImage?.match(/^url\("?(.*?)"?\)$/)?.[1] : null;
    return url || `chrome://sine/content/zia/icons/ui/${fallback}.svg`;
  }

  function fillFolderCard(card, folder) {
    card.ziaFolder = folder;
    const color = folder.getAttribute("zia-folder-color");
    setAttr(card, "zia-folder-color", color || null);
    const rows = [];
    for (const tab of tabsInFolder(folder)) {
      const row = document.createElementNS(XHTML_NS, "div");
      row.className = "zia-folder-card-row";
      row.ziaTab = tab;
      row.toggleAttribute("zia-selected", tab.selected);
      row.append(folderCardIcon(gBrowser.getIcon(tab) || DEFAULT_TAB_ICON, "zia-folder-card-icon"));
      if (tab.hasAttribute("soundplaying") || tab.hasAttribute("muted")) {
        const muted = tab.hasAttribute("muted");
        const speaker = folderCardIcon(
          `chrome://sine/content/zia/icons/ui/${muted ? "volume-off" : "volume"}.svg`,
          "zia-folder-card-sound"
        );
        speaker.classList.add("zia-folder-card-act");
        speaker.setAttribute("zia-act", "mute");
        speaker.setAttribute("title", muted ? "Unmute tab" : "Mute tab");
        row.append(speaker);
      }
      const label = document.createElementNS(XHTML_NS, "span");
      label.className = "zia-folder-card-label";
      label.textContent = tab.label || "New Tab";
      row.append(label);

      const unloaded = tab.getAttribute("pending") === "true" && tab.getAttribute("folder-active") !== "true";
      const unload = tab.pinned && !unloaded && canUnload(tab);
      const button = folderCardIcon(
        unload ? tabButtonIcon(tab, ".tab-reset-button", "minus") : tabButtonIcon(tab, ".tab-close-button", "x"),
        "zia-folder-card-act"
      );
      button.setAttribute("zia-act", unload ? "unload" : "close");
      button.setAttribute("title", unload ? "Unload tab" : "Close tab");
      row.append(button);
      rows.push(row);
    }
    const add = document.createElementNS(XHTML_NS, "div");
    add.className = "zia-folder-card-row";
    add.setAttribute("zia-new-tab", "true");
    add.append(newTabButtonIcon());
    const addLabel = document.createElementNS(XHTML_NS, "span");
    addLabel.className = "zia-folder-card-label";
    addLabel.textContent = "New Tab";

    const newTabButton = document.querySelector("#vertical-tabs-newtab-button, #tabs-newtab-button");
    const newTabText = newTabButton?.querySelector(".toolbarbutton-text");
    if (newTabText) {
      const textStyle = getComputedStyle(newTabText);
      addLabel.style.color = textStyle.color;
      addLabel.style.opacity = String(
        (parseFloat(textStyle.opacity) || 1) * (parseFloat(getComputedStyle(newTabButton).opacity) || 1)
      );
    }
    add.append(addLabel);
    rows.push(add);

    const list = document.createElementNS(XHTML_NS, "div");
    list.className = "zia-folder-card-list";
    const inset = tabEdgeInset();
    if (inset) {
      list.style.setProperty("--zia-folder-card-inset", `${inset}px`);
    }
    const scrolled = card.querySelector(".zia-folder-card-list")?.scrollTop || 0;
    list.append(...rows);
    card.replaceChildren(list);
    list.scrollTop = scrolled;
  }

  // a tab's icon inset in the sidebar, which the folder card keeps on all sides
  function tabEdgeInset() {
    try {
      const tab = gBrowser.visibleTabs.find((t) => !t.pinned && !t.hasAttribute("zen-essential") && t.getBoundingClientRect().width);
      const edge = tab?.querySelector(".tab-background")?.getBoundingClientRect();
      // (the icon itself: the box it sits in can reach further out)
      const icon = [".tab-icon-image", ".tab-icon-stack"]
        .map((selector) => tab?.querySelector(selector)?.getBoundingClientRect())
        .find((box) => box?.width);
      const inset = edge && icon?.width ? Math.round((icon.left - edge.left) * 2) / 2 : 0;
      return inset >= 4 && inset <= 16 ? inset : 0;
    } catch (err) {
      noteError("hover cards: tab inset", err);
      return 0;
    }
  }

  function newTabButtonIcon() {
    const button = document.querySelector("#vertical-tabs-newtab-button, #tabs-newtab-button");
    const shown = button?.querySelector(".toolbarbutton-icon");
    const style = shown ? getComputedStyle(shown) : null;
    const url = style?.listStyleImage?.match(/^url\("?(.*?)"?\)$/)?.[1];
    const icon = folderCardIcon(url || "chrome://sine/content/zia/icons/ui/plus.svg", "zia-folder-card-icon");
    if (style) {
      const size = (value) => (parseFloat(value) > 0 ? value : "");
      icon.style.width = size(style.width) || "16px";
      icon.style.height = size(style.height) || "16px";

      const buttonOpacity = parseFloat(getComputedStyle(button).opacity) || 1;
      icon.style.opacity = String((parseFloat(style.opacity) || 1) * buttonOpacity);
      icon.style.fill = style.fill && style.fill !== "none" ? style.fill : getComputedStyle(button).color;
      icon.style.fillOpacity = style.fillOpacity;
    }
    return icon;
  }

  function placeFolderCard(card, label) {
    const box = label.getBoundingClientRect();
    const sidebar = document.getElementById("navigator-toolbox")?.getBoundingClientRect() || box;
    const onRight = root.getAttribute("zen-right-side") === "true";
    const x = onRight ? sidebar.left - card.offsetWidth - TAB_CARD_GAP : sidebar.right + TAB_CARD_GAP;
    // first row level with the folder, so a one-tab card centres on it like a tab's
    const first = card.querySelector(".zia-folder-card-row");
    const middle = first ? first.offsetTop + first.offsetHeight / 2 : card.offsetHeight / 2;
    const y = moveCard(card, x, box.top + box.height / 2 - middle);
    card.style.transformOrigin = `${onRight ? "right" : "left"} ${Math.round(box.top + box.height / 2 - y)}px`;
  }

  function hoveredFolderLabel(target) {
    const label = target?.closest?.(".tab-group-label-container");
    const folder = label?.parentElement;
    return folder?.isZenFolder && folder.collapsed && !folder.hasAttribute("split-view-group") ? label : null;
  }

  function quietZenFolderPopup() {
    const folders = window.gZenFolders;
    if (!folders || typeof folders.openTabsPopup !== "function" || folders.openTabsPopup.ziaWrapped) {
      return;
    }
    const original = folders.openTabsPopup;
    const wrapped = function (...args) {
      return featureOn("tab-hover-cards") ? undefined : original.apply(this, args);
    };
    wrapped.ziaWrapped = true;
    folders.openTabsPopup = wrapped;
  }

  function addTabHoverCards() {
    const toolbox = document.getElementById("navigator-toolbox");
    if (!toolbox) {
      return;
    }
    quietZenFolderPopup();
    readPictureList().catch((err) => noteError("hover card: saved pictures", err));
    gBrowser.tabContainer.addEventListener("TabSelect", (event) => keepPictureOf(event.detail?.previousTab));
    let card = null;
    let folderCard = null;
    let current = null;
    let showTimer = 0;
    let hideTimer = 0;

    const CARD_OUT_MS = 120;
    let closeTimer = 0;
    const cardUp = () => [card, folderCard].some((each) => each && !each.hidden && !each.hasAttribute("zia-closing"));
    const cardHovered = () => [card, folderCard].some((each) => each && !each.hidden && each.matches(":hover"));

    // Compact mode hides the sidebar once the pointer leaves it, and the cards sit
    // outside it: hold it open, as Zen does for its own menus, while on a card.
    let holding = false;
    const holdSidebar = (on) => {
      if (on === holding) {
        return;
      }
      if (on) {
        holding = !toolbox.hasAttribute("has-popup-menu");
        if (holding) {
          toolbox.setAttribute("has-popup-menu", "true");
        }
        return;
      }
      holding = false;
      try {
        const manager = window.gZenCompactModeManager;
        if (manager?.preference) {
          if (toolbox.matches(":hover")) {
            // The card was inside the sidebar. Restore zen-has-hover synchronously
            // before dropping has-popup-menu so there is no gap with zero attributes.
            manager._setElementExpandAttribute?.(toolbox, true, "zen-has-hover");
            toolbox.setAttribute("zen-has-hover", "true");
            toolbox.setAttribute("zen-has-implicit-hover", "true");
          } else {
            const keep = Services.prefs.getIntPref("zen.view.compact.sidebar-keep-hover.duration", 0);
            if (keep > 0) {
              manager.flashElement(toolbox, keep, `has-hover${toolbox.id}`, "zen-has-hover");
            }
          }
        }
      } catch (err) {
        noteError("hover cards: release sidebar", err);
      }
      toolbox.removeAttribute("has-popup-menu");
    };

    const hide = (force = false) => {
      if (force !== true && cardHovered()) {
        return;
      }
      holdSidebar(false);
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      current = null;
      for (const each of [card, folderCard]) {
        if (each && !each.hidden && !each.hasAttribute("zia-closing")) {
          each.removeAttribute("zia-snap");
          each.setAttribute("zia-closing", "true");
        }
      }
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        for (const each of [card, folderCard]) {
          if (each?.hasAttribute("zia-closing")) {
            each.hidden = true;
            each.removeAttribute("zia-closing");
            each.removeAttribute("zia-open");
          }
        }
      }, CARD_OUT_MS);
    };

    const openCard = (shown, other, wasUp) => {
      clearTimeout(closeTimer);
      if (other) {
        other.hidden = true;
        other.removeAttribute("zia-open");
        other.removeAttribute("zia-closing");
      }
      shown.removeAttribute("zia-closing");
      if (wasUp) {
        shown.setAttribute("zia-snap", "true");
        shown.setAttribute("zia-open", "true");
        return;
      }
      shown.removeAttribute("zia-snap");
      shown.removeAttribute("zia-open");
      void shown.offsetWidth;
      shown.setAttribute("zia-open", "true");
    };

    let keepCardUntil = 0;
    const hideSoon = () => {
      clearTimeout(hideTimer);
      const attempt = () => {
        const wait = keepCardUntil - Date.now();
        if (wait > 0) {
          hideTimer = setTimeout(attempt, wait);
          return;
        }
        hide();
      };
      hideTimer = setTimeout(attempt, TAB_CARD_GRACE);
    };
    const onCard = (node) => !!node && (card?.contains(node) || folderCard?.contains(node));

    const watchCard = (node) => {
      node.addEventListener("mouseenter", () => {
        clearTimeout(hideTimer);
        holdSidebar(true);
      });
      node.addEventListener("mouseleave", () => {
        holdSidebar(false);
        hideSoon();
      });
    };

    const showFolder = (label) => {
      if (!folderCard) {
        folderCard = buildFolderCard((row) => {
          const folder = current?.parentElement;
          hide(true);
          try {
            if (row.hasAttribute("zia-new-tab")) {
              if (folder?.isConnected) {
                newTabInFolder(folder);
              }
            } else if (row.ziaTab?.isConnected) {
              gBrowser.selectedTab = row.ziaTab;
            }
          } catch (err) {
            console.error("[Zia] Folder card action failed:", err);
          }
        });
        watchCard(folderCard);
        folderCard.addEventListener("zia-card-acting", () => {
          keepCardUntil = Date.now() + 1200;
          clearTimeout(hideTimer);
        });
      }
      const wasUp = cardUp();
      current = label;
      fillFolderCard(folderCard, label.parentElement);
      folderCard.hidden = false;
      placeFolderCard(folderCard, label);
      openCard(folderCard, card, wasUp);
    };

    const show = (tab) => {
      if (!tab.classList.contains("tabbrowser-tab")) {
        showFolder(tab);
        return;
      }
      const wasUp = cardUp();
      if (!card) {
        card = buildTabCard((action) => {
          const tab = current;
          if (!action.keepsCard) {
            hide(true);
          } else {
            keepCardUntil = Date.now() + 1200;
            if (action.name === "copy") {
              const button = card.querySelector('[zia-action="copy"]');
              if (button) {
                showCopiedIcon(button, button.querySelector("img"));
              }
            }
          }
          if (!tab?.isConnected) {
            return;
          }
          Promise.try(() => action.run(tab)).catch((err) => console.error(`[Zia] ${action.label} failed:`, err));
        });
        watchCard(card);
      }
      current = tab;
      fillTabCard(card, tab);
      card.hidden = false;
      placeTabCard(card, tab);
      openCard(card, folderCard, wasUp);
    };

    toolbox.addEventListener("mouseover", (event) => {
      if (!featureOn("tab-hover-cards")) {
        return;
      }
      const tab = event.target?.closest?.(".tabbrowser-tab") || hoveredFolderLabel(event.target);
      if (!tab || tab.hasAttribute("pending-drag") || gBrowser.tabContainer.hasAttribute("movingtab")) {
        return;
      }
      clearTimeout(hideTimer);
      if (tab === current) {
        return;
      }
      clearTimeout(showTimer);
      if (current) {
        show(tab);
        return;
      }
      showTimer = setTimeout(() => {
        if (tab.isConnected && tab.matches(":hover")) {
          show(tab);
        }
      }, TAB_CARD_DELAY);
    });

    toolbox.addEventListener("mouseout", (event) => {
      const tab = event.target?.closest?.(".tabbrowser-tab, .tab-group-label-container");
      if (!tab) {
        return;
      }
      const to = event.relatedTarget;
      if (to && (tab.contains(to) || onCard(to))) {
        return;
      }
      clearTimeout(showTimer);
      hideSoon();
    });

    toolbox.addEventListener("mousedown", () => hide(), true);
    toolbox.addEventListener("dragstart", () => hide(true), true);
    toolbox.addEventListener("wheel", () => hide(), { passive: true, capture: true });
    for (const type of ["TabSelect", "TabClose"]) {
      gBrowser.tabContainer.addEventListener(type, () => {
        if ((Date.now() < keepCardUntil && folderCard && !folderCard.hidden) || cardHovered()) {
          return;
        }
        hide();
      });
    }
    window.addEventListener("blur", () => {
      if (Date.now() >= keepCardUntil) {
        hide();
      }
    });
  }

