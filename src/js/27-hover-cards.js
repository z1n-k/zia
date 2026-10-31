  // Hover cards: the card a tab hovered in the sidebar gets (its title, domain, picture and
  // buttons), and the one a closed folder gets (its tabs, to choose from). Firefox's and Zen's
  // own pop-ups give way to them.
  // Used elsewhere: TAB_CARD_DELAY, TAB_CARD_GAP, DEFAULT_TAB_ICON, lastUsedOtherTab, tabCardKind,
  // addTabHoverCards.
  const TAB_CARD_DELAY = 600;
  const TAB_CARD_GRACE = 120;
  const TAB_CARD_GAP = 8;

  // (how far an essential's card tucks under its corner: with the squircle
  // corners on both, 6px brings the card's corner to the tile's)
  const ESSENTIAL_CARD_OVERLAP_X = 6;
  const ESSENTIAL_CARD_OVERLAP_Y = 2;
  const DEFAULT_TAB_ICON = "chrome://sine/content/zia/icons/tab-default.svg";
  const TAB_CARD_OUT_MS = 120;
  // (a card kept up this long after one of its buttons, as what it did shows)
  const TAB_CARD_KEEP_MS = 1200;
  // (a folder card filled again as a button's change lands)
  const FOLDER_CARD_REFILL_MS = [60, 400, 900];

  const TAB_CARD_ACTIONS = [
    {
      name: "essential",
      icon: "card-pin",
      label: "Add to Essentials",
      // a split goes in whole, as a split essential: Zen can't make one of
      // its tabs an essential (it left the other stranded, without a title)
      run: (tab) => (inSplit(tab) ? addSplitToEssentials(tab) : gZenPinnedTabManager?.addToEssentials(tab)),
      hidden: (tab) => tab.hasAttribute("zen-essential") || tab.pinned || (inSplit(tab) && !canBecomeSplitEssential(tab)),
    },
    {
      name: "unpin",
      icon: "card-pinned-off",
      label: "Unpin",
      run: (tab) => {
        if (tab.hasAttribute("zen-essential")) {
          gZenPinnedTabManager?.removeEssentials(tab);
        } else {
          gBrowser.unpinTab(tab);
        }
      },
      hidden: (tab) => !tab.hasAttribute("zen-essential") && !tab.pinned,
    },
    {
      name: "split",
      icon: "card-split",
      label: "Add to Split",
      run: (tab) => {
        const other = tab === gBrowser.selectedTab ? lastUsedOtherTab(tab) : gBrowser.selectedTab;
        if (other) {
          gZenViewSplitter?.splitTabs(tab === gBrowser.selectedTab ? [tab, other] : [other, tab]);
        }
      },
      hidden: (tab) => !lastUsedOtherTab(tab),
    },
    {
      name: "copy",
      icon: "card-paperclip",
      label: "Copy link",
      run: (tab) => copyLink(tab),
      hidden: (tab) => tabCardKind(tab) !== "web",
      keepsCard: true,
    },
  ];

  // The cards (each built the first time it's needed), the tab or folder shown, their
  // timers, whether the sidebar is held open for them, and till when a card stays up
  const hoverCards = {
    toolbox: null,
    card: null,
    folderCard: null,
    current: null,
    showTimer: 0,
    hideTimer: 0,
    closeTimer: 0,
    holding: false,
    keepCardUntil: 0,
  };

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
    const thumb = document.createElementNS(XHTML_NS, "canvas");
    thumb.className = "zia-tab-card-thumb";
    thumb.hidden = true;
    card.append(thumb, title, sub, row);
    root.appendChild(card);
    return card;
  }

  // the page's picture when Firefox's hover previews are on (Zia's card replaces Firefox's)
  const TAB_THUMB_RATIO = 0.55;
  let thumbToken = 0;

  function wantsTabThumb(tab) {
    return (
      Services.prefs.getBoolPref("browser.tabs.hoverPreview.enabled", false) &&
      Services.prefs.getBoolPref("browser.tabs.hoverPreview.showThumbnails", true) &&
      !tab.selected &&
      !tab.hasAttribute("pending") &&
      !!tab.linkedPanel &&
      tabCardKind(tab) !== "new"
    );
  }

  async function drawTabThumb(canvas, tab, token) {
    const browser = tab.linkedBrowser;
    let captured = false;
    try {
      const { PageThumbs } = ChromeUtils.importESModule(
        "resource://gre/modules/PageThumbs.sys.mjs",
      );
      if (typeof PageThumbs?.captureTabPreviewThumbnail === "function") {
        // captureTabPreviewThumbnail draws directly onto the canvas and returns
        // true on success, false on failure — it does not return an image object.
        captured = await PageThumbs.captureTabPreviewThumbnail(browser, canvas);
      }
    } catch (err) {
      captured = false;
    }
    if (!captured) {
      // Fallback: drawSnapshot returns an ImageBitmap-like object we draw ourselves.
      let picture = null;
      const windowGlobal = browser?.browsingContext?.currentWindowGlobal;
      const width = browser?.clientWidth;
      if (windowGlobal && width) {
        try {
          picture = await windowGlobal.drawSnapshot(
            new DOMRect(0, 0, width, width * TAB_THUMB_RATIO),
            canvas.width / width,
            "white",
          );
        } catch (err) {
          picture = null;
        }
      }
      if (!picture || token !== thumbToken || !canvas.isConnected) {
        picture?.close?.();
        return;
      }
      const ctx = canvas.getContext("2d");
      const sw = picture.width;
      const sh = Math.min(picture.height, sw * TAB_THUMB_RATIO);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(picture, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height);
      picture.close?.();
    } else if (token !== thumbToken || !canvas.isConnected) {
      // captureTabPreviewThumbnail succeeded but the card is stale — clear it.
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
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
    thumb.hidden = !wantsTabThumb(shown);
    if (!thumb.hidden) {
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      // (the card's set width: it's still hidden here)
      const width = parseFloat(getComputedStyle(root).getPropertyValue("--zia-tab-card-width")) || 260;
      thumb.width = Math.round(width * ratio);
      thumb.height = Math.round(width * TAB_THUMB_RATIO * ratio);
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

        // (not cancelled: each checks the card is still up)
        for (const delay of FOLDER_CARD_REFILL_MS) {
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
    const rows = tabsInFolder(folder).map(folderCardRow);
    rows.push(folderCardNewTabRow());

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

  function folderCardRow(tab) {
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
    return row;
  }

  function folderCardNewTabRow() {
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
    return add;
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
    hoverCards.toolbox = toolbox;
    quietZenFolderPopup();
    toolbox.addEventListener("mouseover", onHoverCardOver);
    toolbox.addEventListener("mouseout", onHoverCardOut);
    toolbox.addEventListener("mousedown", () => hideHoverCards(), true);
    toolbox.addEventListener("dragstart", () => hideHoverCards(true), true);
    toolbox.addEventListener("wheel", () => hideHoverCards(), { passive: true, capture: true });
    for (const type of ["TabSelect", "TabClose"]) {
      gBrowser.tabContainer.addEventListener(type, onHoverCardTabChange);
    }
    window.addEventListener("blur", () => {
      if (Date.now() >= hoverCards.keepCardUntil) {
        hideHoverCards();
      }
    });
  }

  function hoverCardUp() {
    return [hoverCards.card, hoverCards.folderCard].some((each) => each && !each.hidden && !each.hasAttribute("zia-closing"));
  }

  function hoverCardHovered() {
    return [hoverCards.card, hoverCards.folderCard].some((each) => each && !each.hidden && each.matches(":hover"));
  }

  // Compact mode hides the sidebar once the pointer leaves it, and the cards sit
  // outside it: hold it open, as Zen does for its own menus, while on a card.
  function holdSidebarOpen(on) {
    const toolbox = hoverCards.toolbox;
    if (on === hoverCards.holding) {
      return;
    }
    if (on) {
      hoverCards.holding = !toolbox.hasAttribute("has-popup-menu");
      if (hoverCards.holding) {
        toolbox.setAttribute("has-popup-menu", "true");
      }
      return;
    }
    hoverCards.holding = false;
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
  }

  function hideHoverCards(force = false) {
    if (force !== true && hoverCardHovered()) {
      return;
    }
    holdSidebarOpen(false);
    clearTimeout(hoverCards.showTimer);
    clearTimeout(hoverCards.hideTimer);
    hoverCards.current = null;
    for (const each of [hoverCards.card, hoverCards.folderCard]) {
      if (each && !each.hidden && !each.hasAttribute("zia-closing")) {
        each.removeAttribute("zia-snap");
        each.setAttribute("zia-closing", "true");
      }
    }
    clearTimeout(hoverCards.closeTimer);
    hoverCards.closeTimer = setTimeout(() => {
      for (const each of [hoverCards.card, hoverCards.folderCard]) {
        if (each?.hasAttribute("zia-closing")) {
          each.hidden = true;
          each.removeAttribute("zia-closing");
          each.removeAttribute("zia-open");
        }
      }
    }, TAB_CARD_OUT_MS);
  }

  function openHoverCard(shown, other, wasUp) {
    clearTimeout(hoverCards.closeTimer);
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
  }

  function hideHoverCardsSoon() {
    clearTimeout(hoverCards.hideTimer);
    const attempt = () => {
      const wait = hoverCards.keepCardUntil - Date.now();
      if (wait > 0) {
        hoverCards.hideTimer = setTimeout(attempt, wait);
        return;
      }
      hideHoverCards();
    };
    hoverCards.hideTimer = setTimeout(attempt, TAB_CARD_GRACE);
  }

  function isOnHoverCard(node) {
    return !!node && (hoverCards.card?.contains(node) || hoverCards.folderCard?.contains(node));
  }

  function watchHoverCard(node) {
    node.addEventListener("mouseenter", () => {
      clearTimeout(hoverCards.hideTimer);
      holdSidebarOpen(true);
    });
    node.addEventListener("mouseleave", () => {
      holdSidebarOpen(false);
      hideHoverCardsSoon();
    });
  }

  function pickFolderCardRow(row) {
    const folder = hoverCards.current?.parentElement;
    hideHoverCards(true);
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
  }

  function showFolderCard(label) {
    if (!hoverCards.folderCard) {
      hoverCards.folderCard = buildFolderCard(pickFolderCardRow);
      watchHoverCard(hoverCards.folderCard);
      hoverCards.folderCard.addEventListener("zia-card-acting", () => {
        hoverCards.keepCardUntil = Date.now() + TAB_CARD_KEEP_MS;
        clearTimeout(hoverCards.hideTimer);
      });
    }
    const folderCard = hoverCards.folderCard;
    const wasUp = hoverCardUp();
    hoverCards.current = label;
    fillFolderCard(folderCard, label.parentElement);
    folderCard.hidden = false;
    placeFolderCard(folderCard, label);
    openHoverCard(folderCard, hoverCards.card, wasUp);
  }

  function runTabCardAction(action) {
    const tab = hoverCards.current;
    if (!action.keepsCard) {
      hideHoverCards(true);
    } else {
      hoverCards.keepCardUntil = Date.now() + TAB_CARD_KEEP_MS;
      if (action.name === "copy") {
        const button = hoverCards.card.querySelector('[zia-action="copy"]');
        if (button) {
          showCopiedIcon(button, button.querySelector("img"));
        }
      }
    }
    if (!tab?.isConnected) {
      return;
    }
    Promise.try(() => action.run(tab)).catch((err) => console.error(`[Zia] ${action.label} failed:`, err));
  }

  function showHoverCard(tab) {
    if (!tab.classList.contains("tabbrowser-tab")) {
      showFolderCard(tab);
      return;
    }
    const wasUp = hoverCardUp();
    if (!hoverCards.card) {
      hoverCards.card = buildTabCard(runTabCardAction);
      watchHoverCard(hoverCards.card);
    }
    const card = hoverCards.card;
    hoverCards.current = tab;
    fillTabCard(card, tab);
    card.hidden = false;
    placeTabCard(card, tab);
    openHoverCard(card, hoverCards.folderCard, wasUp);
  }

  function onHoverCardOver(event) {
    if (!featureOn("tab-hover-cards")) {
      return;
    }
    const tab = event.target?.closest?.(".tabbrowser-tab") || hoveredFolderLabel(event.target);
    if (!tab || tab.hasAttribute("pending-drag") || gBrowser.tabContainer.hasAttribute("movingtab")) {
      return;
    }
    clearTimeout(hoverCards.hideTimer);
    if (tab === hoverCards.current) {
      return;
    }
    clearTimeout(hoverCards.showTimer);
    if (hoverCards.current) {
      showHoverCard(tab);
      return;
    }
    hoverCards.showTimer = setTimeout(() => {
      if (tab.isConnected && tab.matches(":hover")) {
        showHoverCard(tab);
      }
    }, TAB_CARD_DELAY);
  }

  function onHoverCardOut(event) {
    const tab = event.target?.closest?.(".tabbrowser-tab, .tab-group-label-container");
    if (!tab) {
      return;
    }
    const to = event.relatedTarget;
    if (to && (tab.contains(to) || isOnHoverCard(to))) {
      return;
    }
    clearTimeout(hoverCards.showTimer);
    hideHoverCardsSoon();
  }

  function onHoverCardTabChange() {
    if ((Date.now() < hoverCards.keepCardUntil && hoverCards.folderCard && !hoverCards.folderCard.hidden) || hoverCardHovered()) {
      return;
    }
    hideHoverCards();
  }
