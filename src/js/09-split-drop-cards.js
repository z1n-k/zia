  const TAB_DROP_TYPE = "application/x-moz-tabbrowser-tab";
  const HTML = "http://www.w3.org/1999/xhtml";
  const MAGNET_SHARE = 0.32;
  const MAGNET_PULL_X = 0.55;
  const MAGNET_PULL_Y = 0.35;

  const ZONE_EDGE = 44;
  const ZONE_ACTIVE_W = 350;
  const ZONE_ACTIVE_H = 580;

  const splitDrop = {
    overlay: null,
    zones: {},
    tab: null,
    target: null,
    lastSelect: null,
    dragStartedAt: 0,
    side: null,
    thumb: null,
    dragImageSet: false,
  };

  function draggedTabOf(event) {
    const dt = event.dataTransfer;
    if (!dt || !dt.types.includes(TAB_DROP_TYPE)) {
      return null;
    }
    try {
      return dt.mozGetDataAt(TAB_DROP_TYPE, 0) || null;
    } catch (err) {
      return null;
    }
  }

  const PRESS_SELECT_MS = 1500;

  function splitTargetFor(tab) {
    const last = splitDrop.lastSelect;
    const selectedByThisDrag =
      last &&
      last.tab === tab &&
      gBrowser.selectedTab === tab &&
      splitDrop.dragStartedAt - last.time < PRESS_SELECT_MS &&
      splitDrop.dragStartedAt >= last.time;
    const previous = last?.previous;
    if (selectedByThisDrag && previous && !previous.closing && previous.isConnected && !previous.hidden) {
      return previous;
    }
    return gBrowser.selectedTab;
  }

  function canSplitWith(tab, current = gBrowser.selectedTab) {
    const splitter = window.gZenViewSplitter;
    if (!splitter || !tab || !current || tab.closing || tab.hasAttribute("zen-empty-tab")) {
      return false;
    }
    if (tab.hasAttribute("zen-live-folder-item-id")) {
      return false;
    }

    if (tab === current && current.splitView) {
      return false;
    }

    if (tab !== current && tab.splitView && current.splitView && tab.group && tab.group === current.group) {
      return false;
    }
    const group = splitter._data?.find?.((g) => g.tabs.includes(current));
    return !(group && group.tabs.length >= (splitter.MAX_TABS || 4));
  }

  function makeZone(side) {
    const zone = document.createElementNS(HTML, "div");
    zone.className = "zia-split-zone";
    zone.setAttribute("side", side);
    const inner = document.createElementNS(HTML, "div");
    inner.className = "zia-split-zone-inner";
    const icon = document.createElementNS(HTML, "div");
    icon.className = "zia-split-zone-icon";
    const label = document.createElementNS(HTML, "div");
    label.className = "zia-split-zone-label";
    label.textContent = side === "left" ? "Add left split" : "Add right split";
    inner.append(icon, label);
    zone.appendChild(inner);
    return zone;
  }

  function ensureSplitOverlay() {
    if (splitDrop.overlay) {
      return splitDrop.overlay;
    }
    const overlay = document.createElementNS(HTML, "div");
    overlay.id = "zia-split-drop";
    splitDrop.zones.left = makeZone("left");
    splitDrop.zones.right = makeZone("right");
    overlay.append(splitDrop.zones.left, splitDrop.zones.right);

    overlay.addEventListener("dragover", onSplitDragOver);
    overlay.addEventListener("drop", onSplitDrop);
    overlay.addEventListener("dragleave", (event) => {
      if (!event.relatedTarget) {
        hideSplitDrop();
      }
    });
    document.documentElement.appendChild(overlay);
    splitDrop.overlay = overlay;
    return overlay;
  }

  const DRAG_PICTURE_W = 200;
  const DRAG_PICTURE_H = 125;
  let blankDragImage = null;
  const lastCursor = { x: 0, y: 0 };

  let lastBlankAt = 0;

  function hideSystemDragImage(dt, force = true) {
    if (!dt || (!force && Date.now() - lastBlankAt < 250)) {
      return;
    }
    lastBlankAt = Date.now();
    try {
      if (!blankDragImage) {
        blankDragImage = document.createElementNS(HTML, "canvas");
        blankDragImage.id = "zia-split-blank-drag-image";
        blankDragImage.width = 32;
        blankDragImage.height = 32;
        blankDragImage.getContext("2d").clearRect(0, 0, 32, 32);
        document.documentElement.appendChild(blankDragImage);
      }
      dt.updateDragImage(blankDragImage, 16, 16);
      splitDrop.dragImageSet = true;
    } catch (err) {
      noteError("split drop cards: hideSystemDragImage", err);
    }
  }

  function movePicture(x, y) {
    lastCursor.x = x;
    lastCursor.y = y;
    const canvas = splitDrop.thumb;
    if (canvas?.hasAttribute("following")) {
      canvas.style.translate = `${Math.round(x - DRAG_PICTURE_W / 2)}px ${Math.round(y - DRAG_PICTURE_H / 2)}px`;
    }
  }

  async function makeDragPicture(tab) {
    const width = DRAG_PICTURE_W;
    const height = DRAG_PICTURE_H;
    const canvas = splitDrop.thumb || document.createElementNS(HTML, "canvas");
    canvas.id = "zia-split-drag-picture";
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (!canvas.isConnected) {
      document.documentElement.appendChild(canvas);
    }
    splitDrop.thumb = canvas;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, width - 1, height - 1, 7);
    ctx.clip();
    ctx.fillStyle = "#1f1f1f";
    ctx.fillRect(0, 0, width, height);
    try {
      const browser = tab.linkedBrowser;
      const pageW = browser?.clientWidth;
      const pageH = browser?.clientHeight;
      if (!browser?.drawSnapshot || !pageW || !pageH) {
        throw new Error("page not drawable");
      }
      const cover = Math.max(width / pageW, height / pageH);
      const cropW = width / cover;
      const cropH = height / cover;

      const scroll = scrollPositions.get(browser) || { x: 0, y: 0 };
      const bitmap = await browser.drawSnapshot(
        scroll.x + (pageW - cropW) / 2,
        scroll.y,
        cropW,
        cropH,
        cover * ratio,
        "rgb(31, 31, 31)"
      );
      if (!bitmap) {
        throw new Error("no snapshot");
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
    } catch (err) {
      console.warn("[Zia] Drag picture: couldn't draw the page, showing its icon instead.", err);
      const icon = new Image();
      icon.src = tab.getAttribute("image") || "";
      await icon.decode().catch(() => {});
      if (icon.naturalWidth) {
        ctx.drawImage(icon, width / 2 - 12, height / 2 - 12, 24, 24);
      }
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, width - 1, height - 1, 7);
    ctx.stroke();
    return canvas;
  }

  function showSplitDrop(tab, event) {
    const overlay = ensureSplitOverlay();
    const box = gBrowser.tabbox.getBoundingClientRect();
    overlay.style.setProperty("--zia-drop-left", `${box.left}px`);
    overlay.style.setProperty("--zia-drop-top", `${box.top}px`);
    overlay.style.setProperty("--zia-drop-width", `${box.width}px`);
    overlay.style.setProperty("--zia-drop-height", `${box.height}px`);
    splitDrop.tab = tab;
    splitDrop.side = null;
    splitDrop.dragImageSet = false;

    const picture = makeDragPicture(tab);
    const target = splitDrop.target;
    let switched = false;
    const showTarget = () => {
      if (switched) {
        return;
      }
      switched = true;
      if (target && splitDrop.tab === tab && overlay.hasAttribute("open") && gBrowser.selectedTab !== target) {
        gBrowser.selectedTab = target;
      }
    };
    picture.finally(showTarget);
    setTimeout(showTarget, 450);
    overlay.setAttribute("open", "true");

    requestAnimationFrame(() => {
      if (overlay.hasAttribute("open")) {
        overlay.setAttribute("shown", "true");
      }
    });

    const dt = event.dataTransfer;
    picture.then((canvas) => {
      if (splitDrop.tab !== tab || !overlay.hasAttribute("open")) {
        return;
      }
      splitDrop.dataTransfer = dt;
      hideSystemDragImage(dt);
      canvas.setAttribute("following", "true");
      movePicture(lastCursor.x, lastCursor.y);
    });
  }

  function hideSplitDrop(event) {
    const overlay = splitDrop.overlay;
    if (!overlay?.hasAttribute("open")) {
      return;
    }
    overlay.removeAttribute("shown");
    overlay.removeAttribute("open");
    splitDrop.thumb?.removeAttribute("following");
    setDropSide(null);
    if (splitDrop.dragImageSet && event?.dataTransfer) {
      try {
        const original = gBrowser.tabContainer.tabDragAndDrop?.originalDragImageArgs;
        if (original) {
          event.dataTransfer.updateDragImage(...original);
        }
      } catch (err) {
        noteError("split drop cards: hideSplitDrop", err);
      }
    }
    splitDrop.tab = null;
    splitDrop.target = null;
    splitDrop.dataTransfer = null;
    splitDrop.dragImageSet = false;
  }

  function setDropSide(side, cursorX = 0, cursorY = 0) {
    splitDrop.side = side;
    const overlay = splitDrop.overlay;
    if (!overlay) {
      return;
    }
    overlay.toggleAttribute("has-side", !!side);
    for (const [name, zone] of Object.entries(splitDrop.zones)) {
      const active = name === side;
      zone.toggleAttribute("active", active);
      if (!active) {
        zone.style.setProperty("--zia-zone-tx", "0px");
        zone.style.setProperty("--zia-zone-ty", "0px");
        continue;
      }

      const box = overlay.getBoundingClientRect();
      const w = Math.min(ZONE_ACTIVE_W, box.width * 0.45);
      const h = Math.min(ZONE_ACTIVE_H, box.height * 0.86);
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      let tx;
      if (name === "left") {
        const baseCentre = box.left + ZONE_EDGE + w / 2;
        tx = clamp((cursorX - baseCentre) * MAGNET_PULL_X, 8 - (box.left + ZONE_EDGE), box.width / 2 - ZONE_EDGE - w);
      } else {
        const baseCentre = box.right - ZONE_EDGE - w / 2;
        tx = clamp((cursorX - baseCentre) * MAGNET_PULL_X, -(box.width / 2 - ZONE_EDGE - w), window.innerWidth - 8 - (box.right - ZONE_EDGE));
      }
      const room = Math.max(0, box.height / 2 - h / 2 - 8);
      const ty = clamp((cursorY - (box.top + box.height / 2)) * MAGNET_PULL_Y, -room, room);
      zone.style.setProperty("--zia-zone-tx", `${tx.toFixed(1)}px`);
      zone.style.setProperty("--zia-zone-ty", `${ty.toFixed(1)}px`);
    }
  }

  function sideAt(event) {
    const box = gBrowser.tabbox.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
      return null;
    }
    const x = event.clientX - box.left;
    if (x < box.width * MAGNET_SHARE) {
      return "left";
    }
    if (x > box.width * (1 - MAGNET_SHARE)) {
      return "right";
    }
    return null;
  }

  function followDrag(event) {
    movePicture(event.clientX, event.clientY);
    if (splitDrop.thumb?.hasAttribute("following")) {
      hideSystemDragImage(event.dataTransfer, false);
    }
    const side = sideAt(event);
    if (side !== splitDrop.side && side) {
      Services.zen?.playHapticFeedback?.();
    }
    setDropSide(side, event.clientX, event.clientY);
  }

  function onSplitDragOver(event) {
    if (!splitDrop.tab) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  }

  function onSplitDrop(event) {
    const tab = splitDrop.tab;
    const target = splitDrop.target;
    const side = splitDrop.side;
    event.preventDefault();
    event.stopPropagation();
    hideSplitDrop(event);
    if (!tab || !side) {
      return;
    }

    setTimeout(() => {
      try {
        splitTabToSide(tab, side, target);
      } catch (err) {
        console.error("[Zia] Split on drop failed:", err);
      }
    }, 0);
  }

  function splitTabToSide(tab, side, onTab = gBrowser.selectedTab) {
    const splitter = window.gZenViewSplitter;
    const glance = window.gZenGlanceManager;
    const base = onTab && !onTab.closing ? onTab : gBrowser.selectedTab;
    let target = glance?.getTabOrGlanceParent?.(base) ?? base;
    let dragged = glance?.getTabOrGlanceParent?.(tab) ?? tab;

    if (dragged === target) {
      const url = searchHomeUrl && newTabSearchEnabled() ? searchHomeUrl : "about:newtab";
      const newTab = gBrowser.addTrustedTab(url, { inBackground: true });
      const left = side === "left";
      splitter.splitTabs(left ? [target, newTab] : [newTab, target], "vsep", left ? 1 : 0);
      gBrowser.selectedTab = newTab;
      return;
    }

    const pair = [dragged, target];
    const anyEssential = pair.some((t) => t.hasAttribute("zen-essential"));
    const somePinned = pair.some((t) => t.pinned) && !pair.every((t) => t.pinned);
    if (anyEssential || somePinned) {
      [dragged, target] = pair.map((t) => (t.pinned ? gBrowser.duplicateTab(t, true) : t));
    }

    const left = side === "left";
    splitter.splitTabs(left ? [dragged, target] : [target, dragged], "vsep", left ? 0 : 1);
    gBrowser.selectedTab = dragged;
  }

  function watchSplitDrop() {
    if (!window.gZenViewSplitter || !gBrowser.tabbox) {
      return;
    }
    window.addEventListener(
      "dragover",
      (event) => {
        const open = splitDrop.overlay?.hasAttribute("open");
        if (!open && !Services.prefs.getBoolPref("zia.split.drop-cards", true)) {
          return;
        }
        const overPage = isOverPage(event);
        if (open) {
          if (overPage) {
            gBrowser.tabContainer.tabDragAndDrop?.clearSpaceSwitchTimer?.();
          }
          followDrag(event);
          return;
        }
        if (!overPage) {
          return;
        }
        const tab = draggedTabOf(event);
        const target = tab && splitTargetFor(tab);
        if (tab && canSplitWith(tab, target)) {
          splitDrop.target = target;
          gBrowser.tabContainer.tabDragAndDrop?.clearSpaceSwitchTimer?.();
          showSplitDrop(tab, event);
          followDrag(event);
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );
    window.addEventListener("dragend", hideSplitDrop, true);

    gBrowser.tabContainer.addEventListener("TabSelect", (event) => {
      splitDrop.lastSelect = { tab: event.target, previous: event.detail?.previousTab || null, time: Date.now() };
    });
    window.addEventListener("dragstart", () => (splitDrop.dragStartedAt = Date.now()), true);
    window.addEventListener(
      "drop",
      (event) => {
        if (!event.target?.closest?.("#zia-split-drop")) {
          hideSplitDrop(event);
        }
      },
      true
    );
  }

