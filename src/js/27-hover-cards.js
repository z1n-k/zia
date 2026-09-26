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
    card.append(title, sub, row);
    root.appendChild(card);
    return card;
  }

  function fillTabCard(card, tab) {
    // a split essential's card is about the half you're in
    const shown = splitCardSource(tab) || tab;
    const isNew = tabCardKind(shown) === "new";
    card.querySelector(".zia-tab-card-title").textContent = shown.label || "New Tab";
    const sub = card.querySelector(".zia-tab-card-sub");
    sub.textContent = isNew ? "" : tabCardDomain(shown);
    sub.hidden = !sub.textContent;

    const row = card.querySelector("#zia-tab-card-actions");
    row.hidden = isNew;
    for (const button of row.children) {
      const action = TAB_CARD_ACTIONS.find((a) => a.name === button.getAttribute("zia-action"));
      button.hidden = !!action?.hidden?.(tab);
    }
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
      if (onRight) {
        card.setAttribute("zia-side", "right");
        x = tabBox.left - width + ESSENTIAL_CARD_OVERLAP_X;
        y = tabBox.bottom - ESSENTIAL_CARD_OVERLAP_Y;
        origin = "top right";
      } else {
        card.removeAttribute("zia-side");
        x = tabBox.right - ESSENTIAL_CARD_OVERLAP_X;
        y = tabBox.bottom - ESSENTIAL_CARD_OVERLAP_Y;
        origin = "top left";
      }
    } else {
      card.setAttribute("zia-anchor", "tab");
      card.removeAttribute("zia-side");
      x = onRight ? sidebar.left - width - TAB_CARD_GAP : sidebar.right + TAB_CARD_GAP;
      y = tabBox.top + tabBox.height / 2 - height / 2;
      origin = onRight ? "right center" : "left center";
    }
    x = Math.max(TAB_CARD_GAP, Math.min(x, window.innerWidth - width - TAB_CARD_GAP));
    y = Math.max(TAB_CARD_GAP, Math.min(y, window.innerHeight - height - TAB_CARD_GAP));
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
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
    const scrolled = card.querySelector(".zia-folder-card-list")?.scrollTop || 0;
    list.append(...rows);
    card.replaceChildren(list);
    list.scrollTop = scrolled;
  }

  function newTabButtonIcon() {
    const button = document.querySelector("#vertical-tabs-newtab-button, #tabs-newtab-button");
    const shown = button?.querySelector(".toolbarbutton-icon");
    const style = shown ? getComputedStyle(shown) : null;
    const url = style?.listStyleImage?.match(/^url\("?(.*?)"?\)$/)?.[1];
    const icon = folderCardIcon(url || "chrome://sine/content/zia/icons/ui/plus.svg", "zia-folder-card-icon");
    icon.setAttribute("zia-plus", "true");
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
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    let x = onRight ? sidebar.left - width - TAB_CARD_GAP : sidebar.right + TAB_CARD_GAP;
    let y = box.top - FOLDER_CARD_LIFT;
    x = Math.max(TAB_CARD_GAP, Math.min(x, window.innerWidth - width - TAB_CARD_GAP));
    y = Math.max(TAB_CARD_GAP, Math.min(y, window.innerHeight - height - TAB_CARD_GAP));
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
    card.style.transformOrigin = onRight ? "top right" : "top left";
  }

  function hoveredFolderLabel(target) {
    const label = target?.closest?.(".tab-group-label-container");
    const folder = label?.parentElement;
    if (!folder?.isZenFolder || !folder.collapsed || folder.hasAttribute("split-view-group")) {
      return null;
    }
    return label;
  }

  function quietZenFolderPopup() {
    const folders = window.gZenFolders;
    if (!folders || typeof folders.openTabsPopup !== "function" || folders.openTabsPopup.ziaWrapped) {
      return;
    }
    const original = folders.openTabsPopup;
    const wrapped = function (...args) {
      if (featureOn("tab-hover-cards")) {
        return undefined;
      }
      return original.apply(this, args);
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
    let card = null;
    let folderCard = null;
    let current = null;
    let showTimer = 0;
    let hideTimer = 0;

    const CARD_OUT_MS = 120;
    let closeTimer = 0;
    const cardUp = () => [card, folderCard].some((each) => each && !each.hidden && !each.hasAttribute("zia-closing"));
    const cardHovered = () => [card, folderCard].some((each) => each && !each.hidden && each.matches(":hover"));

    // In compact mode the sidebar hides once the pointer leaves it, and the
    // cards sit outside it, so while the pointer is on a card Zia holds the
    // sidebar open the way Zen does while one of its own menus is open.
    // Leaving the card, the sidebar gets Zen's usual moment before it hides.
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
      toolbox.removeAttribute("has-popup-menu");
      try {
        const manager = window.gZenCompactModeManager;
        if (manager?.preference && !toolbox.matches(":hover")) {
          const keep = Services.prefs.getIntPref("zen.view.compact.sidebar-keep-hover.duration", 0);
          if (keep > 0) {
            manager.flashElement(toolbox, keep, `has-hover${toolbox.id}`, "zen-has-hover");
          }
        }
      } catch (err) {
        noteError("hover cards: release sidebar", err);
      }
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
      shown.hidden = false;
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
        folderCard.addEventListener("mouseenter", () => {
          clearTimeout(hideTimer);
          holdSidebar(true);
        });
        folderCard.addEventListener("mouseleave", () => {
          holdSidebar(false);
          hideSoon();
        });
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
          try {
            Promise.resolve(action.run(tab)).catch((err) =>
              console.error(`[Zia] ${action.label} failed:`, err)
            );
          } catch (err) {
            console.error(`[Zia] ${action.label} failed:`, err);
          }
        });
        card.addEventListener("mouseenter", () => {
          clearTimeout(hideTimer);
          holdSidebar(true);
        });
        card.addEventListener("mouseleave", () => {
          holdSidebar(false);
          hideSoon();
        });
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
      const tab = event.target?.closest?.(".tabbrowser-tab") || event.target?.closest?.(".tab-group-label-container");
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
        if ((Date.now() < keepCardUntil && folderCard && !folderCard.hidden) || [card, folderCard].some((each) => each && !each.hidden && each.matches(":hover"))) {
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

