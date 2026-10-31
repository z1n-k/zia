  // An essential dragged: its copy, the tiles shifting, and leftovers swept up.
  // Used elsewhere: essentialDrag, takeEssentialDrag, noteEssentialDropped, takeEssentialDropped,
  // ESSENTIAL_MS, onEssentialStart, sizeCopy, moveCopyTo, plainTabSize, sweepLeftovers,
  // tapOnTileShift, tapOnNewTile, watchEssentialStart.

  const ESSENTIAL_MS = 140;
  // (a move with no button held this long after the drag began: it ended unseen)
  const ESSENTIAL_GRACE_MS = 300;
  const TAP_AGAIN_MS = 300;

  // (what keepPlacement keeps on a copy)
  const PLACEMENT = [
    "position", "left", "top", "translate", "transform", "margin", "z-index",
    "width", "height", "min-width", "max-width", "min-height", "max-height",
  ];

  // (the tile last under the pointer, when it's over the essentials but on no tile)
  const OVER_GAP = {};

  // the essential being dragged (endEssentialDrag), and the one just dropped (settle)
  let essentialDrag = null;
  let essentialDropped = null;

  // (taken by the drag's end, 10, and the settle after it, 12)
  const takeEssentialDrag = () => {
    const state = essentialDrag;
    essentialDrag = null;
    return state;
  };
  const noteEssentialDropped = (tab) => {
    essentialDropped = tab;
  };
  const takeEssentialDropped = () => {
    const tab = essentialDropped;
    essentialDropped = null;
    return tab;
  };

  // the tile the pointer was last over, and where and when it last tapped
  const tileTap = { under: null, point: null, at: 0 };

  // its listeners and hooks, added by moveTabsLikeDia (28-tab-dragging.js) in order
  function watchEssentialStart() {
    window.addEventListener("mousedown", sweepOnPress, true);
    new MutationObserver(removeStrayCopies).observe(document.getElementById("navigator-toolbox") || document.documentElement, {
      childList: true,
      subtree: true,
    });
    new MutationObserver(keepGridColumns).observe(document.getElementById("navigator-toolbox") || document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-hack-type"],
      attributeOldValue: true,
    });
    window.addEventListener("mousemove", endUnseenEssentialDrag, true);
  }

  const sweepOnPress = () => {
    if (!drag && !essentialDrag) {
      sweepLeftovers();
    }
  };

  const removeStrayCopies = (records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && node.hasAttribute("zia-essential-proxy") && !liveCopies.has(node)) {
          removeCopy(node);
        }
      }
    }
  };

  // Zen's placeholder for a tab dragged over the essentials is a cell, and Zen sets the
  // grid's columns by cell count (eight essentials and it went three to a row) but shifts
  // the tiles by the old columns, past the sidebar's edge: the columns are kept meanwhile.
  const keepGridColumns = (records) => {
    for (const { target: grid, oldValue } of records) {
      const zenSlot = grid.querySelector(":scope > vbox:not(.tabbrowser-tab)");
      if (!zenSlot) {
        continue;
      }
      if (grid.ziaColumns?.zenSlot !== zenSlot) {
        grid.ziaColumns = { zenSlot, value: oldValue };
      }
      const value = grid.ziaColumns.value;
      if (grid.getAttribute("data-hack-type") !== value) {
        if (value === null) {
          grid.removeAttribute("data-hack-type");
        } else {
          grid.setAttribute("data-hack-type", value);
        }
      }
    }
  };

  const endUnseenEssentialDrag = (event) => {
    if (essentialDrag && event.buttons === 0 && Date.now() - (essentialDrag.startedAt || 0) > ESSENTIAL_GRACE_MS) {
      endEssentialDrag();
    }
  };

  const onEssentialStart = (event) => {
    const tab = event.target?.closest?.(".tabbrowser-tab[zen-essential]");
    if (!tab || tab.hasAttribute("zia-essential-proxy") || !featureOn("dia-tab-drag") || inLibrary(event)) {
      return;
    }
    markEssentialImage(true);
    try {
      event.dataTransfer?.setDragImage(blankImage(), 0, 0);
    } catch (err) {
      noteError("tab dragging: essential drag picture", err);
    }
    if (essentialDrag) {
      essentialDrag.copy?.remove();
      essentialDrag.tab?.removeAttribute("zia-essential-dragged");
      essentialDrag = null;
    }
    sweepLeftovers();
    const tile = tab.getBoundingClientRect();
    const drawn = tab.querySelector(".tab-background")?.getBoundingClientRect() || tile;
    const copy = floatEssentialCopy(tab, tile, drawn);
    const point = pointerOf(event);
    tab.setAttribute("zia-essential-dragged", "true");
    noLanding();

    muteZenHaptics(true);
    // The drag starts on its own tile (which tileUnder skips), so the very
    // first neighbour it moves onto taps too.
    tileTap.under = tab;
    tileTap.point = null;
    essentialDrag = {
      tab,
      copy,
      tile: { width: tile.width, height: drawn.height },
      offset: { x: point.x - (tile.left + tile.width / 2), y: point.y - (drawn.top + drawn.height / 2) },
      asTab: false,
      startedAt: Date.now(),
    };
  };

  // the essential's copy, floating where its tile is drawn
  const floatEssentialCopy = (tab, tile, drawn) => {
    const copy = cloneCopy(tab);
    sizeCopy(copy, tile.width, drawn.height);
    fitSplitHalves(copy, 0, tab.querySelector(".zia-split-half")?.getBoundingClientRect() || null);
    copy.style.setProperty("left", `${Math.round(tile.left + tile.width / 2)}px`, "important");
    copy.style.setProperty("top", `${Math.round(drawn.top + drawn.height / 2)}px`, "important");
    root.appendChild(copy);
    try {
      window.gZenPinnedTabManager?.setEssentialTabIcon?.(copy);
    } catch (err) {
      noteError("tab dragging: onEssentialStart", err);
    }
    dressSplitCopy(copy, tab);
    return copy;
  };

  const sweepLeftovers = () => {
    const keep = new Set([essentialDrag?.copy, proxy.node].filter(Boolean));
    for (const node of document.querySelectorAll(".tabbrowser-tab[zia-essential-proxy]")) {
      if (!keep.has(node)) {
        node.remove();
      }
    }
    if (!essentialDrag) {
      for (const tab of document.querySelectorAll(".tabbrowser-tab[zia-essential-dragged]")) {
        tab.removeAttribute("zia-essential-dragged");
        tab.style.visibility = "";
      }
    }
    if (!drag) {
      for (const tab of document.querySelectorAll(".tabbrowser-tab[zia-to-essential]")) {
        if (tab !== proxy.landing) {
          tab.removeAttribute("zia-to-essential");
        }
      }
    }
  };

  // A tab over the essentials taps as Zen moves the tiles aside for it (by the tile under
  // the pointer, it tapped crossing tiles that didn't move and missed some that did)
  const tapOnTileShift = () => {
    // (read a step later, once Zen's own dragover has moved them; not kept, as it checks the
    // drag is still over the essentials)
    setTimeout(() => {
      if (!drag?.essentials) {
        if (drag) {
          drag.tileShifts = null;
        }
        return;
      }
      const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.();
      const tiles = grid ? [...grid.children].filter((cell) => cell.classList?.contains("tabbrowser-tab") && !cell.hasAttribute("zia-essential-proxy") && cell !== drag.tab) : [];
      const shifts = tiles.map((cell) => `${cell.style.transform}${cell.style.translate}`).join("|");
      if (drag.tileShifts != null && shifts !== drag.tileShifts) {
        tap();
      }
      drag.tileShifts = shifts;
    }, 0);
  };

  const tapOnNewTile = (point, skip) => {
    const tile = tileUnder(point, skip);
    if (tile && tile !== tileTap.under && tileTap.under !== null) {
      const box = tile.getBoundingClientRect();
      // half a tile on from the last tap, or long enough after: edge jitter doesn't tap twice,
      // but heading back over the same edge does
      const far =
        !tileTap.point ||
        Math.abs(point.x - tileTap.point.x) >= box.width / 2 ||
        Math.abs(point.y - tileTap.point.y) >= box.height / 2 ||
        Date.now() - tileTap.at > TAP_AGAIN_MS;
      if (far) {
        tap();
        tileTap.point = { x: point.x, y: point.y };
        tileTap.at = Date.now();
      }
    }
    if (tile) {
      tileTap.under = tile;
      tileTap.point ||= { x: point.x, y: point.y };
    } else if (skip && inBox(window.gZenWorkspaces?.getCurrentEssentialsContainer?.(), point)) {
      // over the essentials but on no tile (the drop's gap, or its own spot): the next tile is
      // a new one, so moving back onto the tile that just slid aside taps again
      tileTap.under = OVER_GAP;
    }
  };

  const tileUnder = (point, skip) => {
    const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.();
    for (const tile of (grid || document).querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])")) {
      if (tile !== skip && inBox(tile, point)) {
        return tile;
      }
    }
    return null;
  };

  const sizeCopy = (node, width, height) => {
    node.ziaSize = { width, height };
    for (const [name, value] of [
      ["width", width],
      ["height", height],
      ["min-width", width],
      ["max-width", width],
      ["min-height", height],
      ["max-height", height],
    ]) {
      node.style.setProperty(name, `${Math.round(value)}px`, "important");
    }
    keepPlacement(node);
  };

  // Zen clears the size and place of every essential when a drop lands:
  // a floating copy with none stretches across the window and falls to
  // its bottom. Whatever of those it loses, it gets straight back.
  // (The guard and the size it keeps are on the copy itself, ziaPlacementGuard and ziaSize,
  // as are its host's shift, ziaHostShift, and the grid's columns, ziaColumns: each goes
  // with its node.)
  const keepPlacement = (node) => {
    if (node.ziaPlacementGuard) {
      return;
    }
    const seen = {};
    const note = () => {
      for (const name of PLACEMENT) {
        const value = node.style.getPropertyValue(name);
        if (value) {
          seen[name] = value;
        }
      }
    };
    note();
    node.ziaPlacementGuard = new MutationObserver(() => {
      for (const name of PLACEMENT) {
        if (seen[name] && !node.style.getPropertyValue(name)) {
          node.style.setProperty(name, seen[name], "important");
        }
      }
      if (node.style.getPropertyValue("width") !== `${Math.round(node.ziaSize.width)}px`) {
        sizeCopy(node, node.ziaSize.width, node.ziaSize.height);
      }
      note();
    });
    node.ziaPlacementGuard.observe(node, { attributes: true, attributeFilter: ["style"] });
  };

  const moveCopyTo = (copy, host) => {
    if (!host || copy.parentNode === host) {
      return;
    }
    const box = copy.getBoundingClientRect();
    const want = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    host.appendChild(copy);
    copy.ziaHostShift = { x: 0, y: 0 };
    copy.style.setProperty("left", `${Math.round(want.x)}px`, "important");
    copy.style.setProperty("top", `${Math.round(want.y)}px`, "important");
    const now = copy.getBoundingClientRect();
    copy.ziaHostShift = { x: now.left + now.width / 2 - want.x, y: now.top + now.height / 2 - want.y };
    copy.style.setProperty("left", `${Math.round(want.x - copy.ziaHostShift.x)}px`, "important");
    copy.style.setProperty("top", `${Math.round(want.y - copy.ziaHostShift.y)}px`, "important");
  };

  const plainTabSize = () => {
    // (a tab on its own in the list: half of a split, or a tab in a
    // folder, is narrower, and an essential dragged off came out that size)
    const sample = [...gBrowser.visibleTabs].find(
      (tab) => !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab") && !tab.group && tab.getBoundingClientRect().height > 8
    );
    const splitBox = sample
      ? null
      : [...document.querySelectorAll("#tabbrowser-tabs tab-group[split-view-group] > .tab-group-container")].find(
          (box) => !box.closest(FOLDER_SELECTOR) && box.getBoundingClientRect().height > 8
        );
    const bg = (sample?.querySelector(".tab-background") || splitBox)?.getBoundingClientRect();
    if (bg?.width) {
      return { width: bg.width, height: bg.height };
    }
    const sidebar = document.getElementById("navigator-toolbox")?.getBoundingClientRect();
    return { width: (sidebar?.width || 240) - 16, height: 35 };
  };
