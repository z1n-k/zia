  // An essential dragged down into the list: the room opened for it and its drop.

  const listRoom = { rows: null, pitch: 0, sep: null, sepTop: null, sepDelta: 0, first: undefined, folder: null };

  // An essential dragged into the list goes into a folder as a tab does:
  // over a closed folder (its end), between the tabs of an open one, or
  // over an open empty one's slot
  const listRoomFolder = (prev, first, y) => {
    if (!prev) {
      return null;
    }
    if (isFolderEl(prev.node) && isCollapsed(prev.node)) {
      // Once in, it stays until its bottom meets the slot's, as a tab's does (it's drawn
      // centred on the pointer, so half a row past the name, plus the gap): at four
      // tenths it left the folder with its bottom still well inside
      const reach = listRoom.folder === prev.node ? listRoom.pitch / 2 + 2 : listRoom.pitch * 0.4;
      return listMid(y) < prev.top + prev.height + reach ? prev.node : null;
    }
    const label = prev.node.classList?.contains("tab-group-label-container");
    const folder = label ? prev.node.parentElement : prev.node.parentElement?.closest?.(FOLDER_SELECTOR);
    if (!folder || !isFolderEl(folder) || isCollapsed(folder)) {
      return null;
    }
    const firstInside = first && folder.contains(first.node) && first.node !== folder.labelContainerElement;
    if (firstInside) {
      return folder;
    }
    if (label && folder.hasAttribute("zia-empty") && y < prev.top + prev.height * 2) {
      return folder;
    }
    return null;
  };
  const markListRoomFolder = (folder) => {
    if (listRoom.folder === folder) {
      return;
    }
    listRoom.folder?.removeAttribute("zia-drop-slot");
    listRoom.folder = folder || null;
    folder?.setAttribute("zia-drop-slot", "true");
  };
  const openListRoom = () => {
    listRoom.rows = measureRows(null);
    listRoom.sep = currentSeparator();
    listRoom.sepTop = listRoom.sep ? listRoom.sep.getBoundingClientRect().top : null;
    const side = (top) => (listRoom.sepTop == null ? 0 : top > listRoom.sepTop ? 1 : -1);
    const sorted = [...listRoom.rows].sort((a, b) => a.top - b.top);
    let best = Infinity;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].top - sorted[i - 1].top;
      if (side(sorted[i].top) === side(sorted[i - 1].top) && gap > 8 && gap < sorted[i - 1].height * 1.6 && gap < best) {
        best = gap;
      }
    }
    listRoom.pitch = best < Infinity ? best : (sorted[0]?.height || 35) + 4;
    listRoom.sepDelta = 0;
    listRoom.first = undefined;

    listRoom.button = newTabButton();
    // (its bottom: over the last row or the button itself the drop still
    // goes above it, so it makes way; its top left half a gap there)
    listRoom.buttonBottom = listRoom.button?.getBoundingClientRect().bottom ?? null;
    listRoom.buttonDelta = 0;

    unclipAround(listRoom.button || listRoom.rows[listRoom.rows.length - 1]?.node);
  };
  // Where it counts as being, for where it goes: as a dragged tab's, a row past
  // once it's 8px into where that row is shown, pushed down to make room. By the
  // rows' own middles it went into a folder, and out, three quarters of a row early.
  const listAt = (y) => y - (listRoom.pitch / 2 + 8);
  // The cuts a tab coming up past the separator uses, by the dragged row's middle (listAt
  // plus half a tab and 8px): above the separator until four fifths of a tab past its top,
  // and into the closed folder before it only four tenths of a tab into that folder's slot.
  // Cut at the separator's top and the folder's bottom, the place after the last folder
  // (the line right under it) was a sliver: it went into the folder sooner, and skipped it.
  const listMid = (y) => y + listRoom.pitch / 2 + 8;
  const aboveListSep = (y) => listRoom.sepTop != null && listMid(y) < listRoom.sepTop + listRoom.pitch * 0.8;
  const shapeListRoom = (pointerY) => {
    if (!listRoom.rows) {
      openListRoom();
    }
    const y = listAt(pointerY);
    let first = null;
    let prev = null;
    for (const row of listRoom.rows) {
      const down = row.mid > y;
      if (down && !first) {
        first = row;
      }
      if (!down) {
        prev = row;
      }
      const delta = down ? listRoom.pitch : 0;
      if (row.delta !== delta) {
        row.delta = delta;
        place(row.node, delta, false);
      }
    }
    if (listRoom.sep) {
      const delta = aboveListSep(y) ? listRoom.pitch : 0;
      if (listRoom.sepDelta !== delta) {
        listRoom.sepDelta = delta;
        place(listRoom.sep, delta, false);
      }
    }
    if (listRoom.button && listRoom.buttonBottom != null) {
      // New Tab at the top (Zen's option) sits under the separator, where nothing drops above
      // it: it moves with the separator rather than making way as at the foot of the list
      const delta = newTabOnTop() ? listRoom.sepDelta : listRoom.buttonBottom > y ? listRoom.pitch : 0;
      if (listRoom.buttonDelta !== delta) {
        listRoom.buttonDelta = delta;
        place(listRoom.button, delta, false);
      }
    }
    // a tap as the rows make way, or going into or out of a folder, as a tab's drag taps
    const folder = listRoomFolder(prev, first, y) || null;
    if (listRoom.first !== undefined && (first !== listRoom.first || folder !== listRoom.folder)) {
      tap();
    }
    listRoom.first = first;
    markListRoomFolder(folder);
    paintFolders({
      rows: listRoom.rows,
      target: { folder: listRoom.folder, slotTop: prev ? prev.top + prev.height : null },
      pitch: listRoom.pitch,
      height: listRoom.pitch,
      skip: () => false,
      outer: null,
      moving: null,
    });
  };
  const closeListRoom = () => {
    if (!listRoom.rows) {
      return;
    }
    for (const row of listRoom.rows) {
      if (row.delta) {
        row.delta = 0;
        place(row.node, 0, false);
      }
    }
    if (listRoom.sep && listRoom.sepDelta) {
      listRoom.sepDelta = 0;
      place(listRoom.sep, 0, false);
    }
    if (listRoom.button && listRoom.buttonDelta) {
      listRoom.buttonDelta = 0;
      place(listRoom.button, 0, false);
    }
    reclip();
    markListRoomFolder(null);
    clearFolderPaint();
    listRoom.rows = null;
    listRoom.first = undefined;
  };

  const dropIntoListRoom = (tab, y) => {
    const first = listRoom.first || null;
    const sep = listRoom.sep;
    const sepTop = listRoom.sepTop;
    const below = sepTop != null && !aboveListSep(listAt(y));
    const folder = listRoom.folder?.isConnected ? listRoom.folder : null;
    markListRoomFolder(null);
    listRoom.rows = null;
    listRoom.first = undefined;
    // Zen takes the tab out of the essentials in its own time after the drop: it's placed
    // once that's happened (or Zia does it after a second), or Zen's own placing (the end
    // of the list) stuck
    return new Promise((resolve) => {
      let frames = 0;
      const whenOut = () => {
        if (tab.isConnected && tab.hasAttribute("zen-essential")) {
          if (++frames < 60) {
            requestAnimationFrame(whenOut);
            return;
          }
          try {
            window.gZenPinnedTabManager?.removeEssentials?.(tab, false);
          } catch (err) {
            noteError("tab dragging: out of the essentials", err);
          }
        }
        place();
        holdDropped();
        resolve();
      };
      requestAnimationFrame(whenOut);
    });

    // It lands under the pointer, which the browser doesn't see until it next moves: its x
    // (or -) is kept on, as for a dropped tab (nothing under the pointer at the drop counts)
    function holdDropped() {
      if (!tab.isConnected || tab.hasAttribute("zen-essential") || tab.group?.hasAttribute("split-view-group")) {
        return;
      }
      try {
        shownAtDrop = { row: null, buttons: [] };
        heldFolder = null;
        heldPinned = null;
        holdFolderHover(tab);
      } catch (err) {
        noteError("tab dragging: hold the dropped essential", err);
      }
    }

    function place() {
      try {
        if (!tab.isConnected || tab.hasAttribute("zen-essential")) {
          return;
        }
        // A split essential: its split goes straight to the spot
        if (tab.ziaSplit?.id) {
          splitBackToList(tab, (group, tabs) => {
            for (const t of tabs) {
              pinFor(t, !below);
            }
            if (folder) {
              const inside = first && folder.contains(first.node) ? first : null;
              splitIntoFolder(group, folder, { first: false, atEnd: !inside, next: inside });
              return;
            }
            if (first && (below || sepTop == null || first.top < sepTop)) {
              placeBefore(group, topLevel(first));
            } else if (!below && sep) {
              placeBefore(group, sep);
            } else {
              gBrowser.moveTabToEnd?.(group);
            }
          });
          return;
        }
        pinFor(tab, !below);
        if (folder) {
          if (isCollapsed(folder)) {
            parkInFolder(tab, folder);
          } else if (first && folder.contains(first.node) && gBrowser.isTab(first.node)) {
            placeBefore(tab, first.node);
          } else {
            folder.addTabs?.([tab]);
          }
          return;
        }
        if (first && (below || sepTop == null || first.top < sepTop)) {
          placeBefore(tab, topLevel(first));
        } else if (!below && sep) {
          placeBefore(tab, sep);
        } else {
          gBrowser.moveTabToEnd?.(tab);
        }
      } catch (err) {
        console.error("[Zia] Placing the essential in the list failed:", err);
      }
    }
  };

  // The essentials slide from where they were to where a change puts them
  const slideTiles = (change) => {
    const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.();
    const tiles = grid ? [...grid.querySelectorAll(":scope > .tabbrowser-tab")].filter((t) => !t.hasAttribute("zia-essential-proxy")) : [];
    const was = new Map(tiles.map((t) => [t, t.getBoundingClientRect()]));
    change();
    for (const t of tiles) {
      const from = was.get(t);
      const to = t.getBoundingClientRect();
      if (!from.width || !to.width) {
        continue;
      }
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) {
        t.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
    }
  };

  // An essential dragged out over the page (to the split cards) turns into
  // its page's picture, as a tab does, and back into its tile coming back
  // (it stayed a tile out there)
  const essentialThumb = (state, point) => {
    if (!state.thumb || state.thumb.hasAttribute("zia-leaving")) {
      clearTimeout(state.thumbTimer);
      state.thumb?.remove();
      const node = document.createElementNS(XHTML_NS, "div");
      node.id = "zia-drag-thumb";
      fitThumb(node, state.copy.getBoundingClientRect());
      root.appendChild(node);
      node.getBoundingClientRect();
      state.thumb = node;
      state.copy.setAttribute("zia-over-page", "true");
      tap();
    }
    fillPicture(state.thumb, state.tab);
    const size = pictureSize();
    sizeThumb(state.thumb, size.width, size.height);
    state.thumb.style.left = `${Math.round(point.x)}px`;
    state.thumb.style.top = `${Math.round(point.y)}px`;
  };
  const essentialThumbBack = (state) => {
    const node = state.thumb;
    if (!node || node.hasAttribute("zia-leaving")) {
      return;
    }
    node.setAttribute("zia-leaving", "true");
    fitThumb(node, state.copy.getBoundingClientRect());
    state.thumbTimer = setTimeout(() => {
      node.remove();
      if (state.thumb === node) {
        state.thumb = null;
        state.copy?.removeAttribute("zia-over-page");
      }
    }, THUMB_MS);
  };

  const onEssentialOver = (event) => {
    const state = essentialDrag;
    if (!state?.copy?.isConnected) {
      return;
    }
    const point = pointerOf(event);
    if (!point.x && !point.y) {
      return;
    }
    const sideBox = document.getElementById("navigator-toolbox")?.getBoundingClientRect();
    if (sideBox?.width && !event.target?.closest?.("#navigator-toolbox") && (point.x < sideBox.left || point.x > sideBox.right)) {
      essentialThumb(state, point);
      return;
    }
    essentialThumbBack(state);
    tapOnNewTile(point, state.tab);
    const essentials = document.getElementById("zen-essentials");
    const overTiles = !!event.target?.closest?.("#zen-essentials") || inBox(essentials, point) || overAnyTile(point);
    // A row only once below the essentials altogether, so a drag along their last row stays
    // a tile; by their bottom as the drag began (afresh, the grid losing a row moved the line
    // past the pointer and back, flipping between tile and row)
    state.bottom ??= essentialsBottom();
    const asTab = !overTiles && inBox(document.getElementById("navigator-toolbox"), point) && point.y > state.bottom + 8;
    const copy = state.copy;
    if (asTab !== state.asTab) {
      state.asTab = asTab;
      state.rowFor = undefined;
      easeSize(copy, ESSENTIAL_MS);
      // (the others close up behind it out over the list, and open again if it comes back;
      // the only one keeps its cell: given up, the essentials emptied, the list jumped up under
      // the pointer and the row flashed over the first tab)
      const others = [...(essentialsGrid()?.querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])") || [])].some((tile) => tile !== state.tab);
      slideTiles(() => state.tab.toggleAttribute("zia-essential-out", asTab && others));
      const current = copy.getBoundingClientRect();
      moveCopyTo(copy, asTab ? document.getElementById("tabbrowser-tabs") || root : root);
      sizeCopy(copy, current.width, current.height);
      copy.getBoundingClientRect();
      for (const name of ["zen-essential", "pinned"]) {
        if (asTab) {
          copy.removeAttribute(name);
        } else {
          copy.setAttribute(name, "true");
        }
      }
      fadeSplitContent(copy, ESSENTIAL_MS);
      const size = asTab ? plainTabSize() : state.tile;
      sizeCopy(copy, size.width, size.height);
      state.offset = asTab ? { x: 0, y: 0 } : state.offset;
    }
    // (as a row, the width a tab takes where it would go: over a folder, its
    // tabs' narrower width, as a dragged tab does; it stayed full width)
    let row = null;
    if (asTab) {
      shapeListRoom(point.y);
      row = widthFor(listRoom.folder);
      if (row && state.rowFor !== (listRoom.folder || "plain")) {
        state.rowFor = listRoom.folder || "plain";
        sizeCopy(copy, row.right - row.left, plainTabSize().height);
      }
    } else {
      closeListRoom();
    }
    const x = !asTab
      ? point.x - state.offset.x
      : row
        ? (row.left + row.right) / 2
        : (document.getElementById("navigator-toolbox")?.getBoundingClientRect().left || 0) + 8 + plainTabSize().width / 2;
    // (as a row, never over the essentials: turned into a row just below
    // them, it's centred on the pointer, and its top half showed over them)
    const y = asTab ? Math.max(point.y, essentialsBottom() + plainTabSize().height / 2 + 2) : point.y - state.offset.y;
    const shift = copy.ziaHostShift || { x: 0, y: 0 };
    copy.style.setProperty("left", `${Math.round(x - shift.x)}px`, "important");
    copy.style.setProperty("top", `${Math.round(y - shift.y)}px`, "important");
  };

  const dropPastLast = (tab, point) => {
    const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.();
    const tiles = [...(grid || document).querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])")].filter(
      (tile) => tile !== tab && tile.getBoundingClientRect().width > 8
    );
    const last = tiles[tiles.length - 1];
    if (!last || !point) {
      return;
    }
    const box = last.getBoundingClientRect();
    const past = point.y > box.bottom || (point.y >= box.top && point.x > box.left + box.width / 2);
    if (!past) {
      return;
    }
    setTimeout(() => {
      if (tab.isConnected && tab.hasAttribute("zen-essential") && last.isConnected && tab.previousElementSibling !== last) {
        try {
          gBrowser.moveTabAfter(tab, last);
        } catch (err) {
          console.error("[Zia] Could not move the essential to the end:", err);
        }
      }
    }, 0);
  };

  const endEssentialDrag = (event) => {
    const state = essentialDrag;
    essentialDrag = null;
    essentialDragging = false;
    if (!state) {
      return;
    }
    clearTimeout(state.thumbTimer);
    state.thumb?.remove();
    state.thumb = null;
    if (event?.type === "drop") {
      const point = pointerOf(event);
      const essentials = document.getElementById("zen-essentials");
      if (inBox(essentials, point) || event.target?.closest?.("#zen-essentials") || overAnyTile(point)) {
        state.asTab = false;
        dropPastLast(state.tab, point);
      } else if (state.asTab && listRoom.rows) {
        state.placing = dropIntoListRoom(state.tab, point.y);
      }
    }
    if (listRoom.rows) {
      closeListRoom();
    }
    muteZenHaptics(false);
    essentialDropped = event?.type === "drop" ? state.tab : null;
    setTimeout(sweepLeftovers, 400);
    const copy = state.copy;
    const reveal = (now = false) => {
      state.tab.style.visibility = "";
      state.tab.removeAttribute("zia-essential-dragged");
      state.tab.removeAttribute("zia-essential-out");
      // (dropped into the list, the tab's already showing in its place:
      // the copy goes with it, not a frame later)
      if (now === true) {
        copy.remove();
      } else {
        requestAnimationFrame(() => copy.remove());
      }
    };
    // Dropped among the essentials: the tile glides from where it was let
    // go into its place (once that's settled) before the real one shows
    const glideHome = () => {
      // dropped into the list: it shows once it's in its place, not first
      // wherever Zen put it
      if (state.placing) {
        state.placing.finally(() => reveal(true));
        return;
      }
      if (!event || state.asTab || !copy.isConnected || !state.tab.isConnected ||
          !state.tab.hasAttribute("zen-essential") || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        reveal();
        return;
      }
      // Heads for wherever the tile is on each frame, so it still lands
      // right while Zen is sliding the tiles into their new order
      const shift = copy.ziaHostShift || { x: 0, y: 0 };
      // from where it was last drawn under the pointer (its left and top
      // are its centre), not wherever Zen's drop may have knocked it
      const from = copy.getBoundingClientRect();
      const left = parseFloat(copy.style.getPropertyValue("left"));
      const top = parseFloat(copy.style.getPropertyValue("top"));
      const start = Number.isFinite(left) && Number.isFinite(top)
        ? { x: left + shift.x, y: top + shift.y }
        : { x: from.left + from.width / 2, y: from.top + from.height / 2 };
      // the same glide as a dropped tab or folder (LAND_MS, LAND_EASE)
      const began = performance.now();
      copy.style.setProperty("transition", "none", "important");
      const follow = () => {
        if (!copy.isConnected || !state.tab.isConnected) {
          reveal();
          return;
        }
        const box = state.tab.getBoundingClientRect();
        const drawn = state.tab.querySelector(".tab-background")?.getBoundingClientRect() || box;
        const to = { x: box.left + box.width / 2, y: drawn.top + drawn.height / 2 };
        const t = Math.min(1, (performance.now() - began) / LAND_MS);
        const ease = landEase(t);
        copy.style.setProperty("left", `${Math.round(start.x + (to.x - start.x) * ease - shift.x)}px`, "important");
        copy.style.setProperty("top", `${Math.round(start.y + (to.y - start.y) * ease - shift.y)}px`, "important");
        if (t < 1) {
          requestAnimationFrame(follow);
        } else {
          reveal();
        }
      };
      requestAnimationFrame(follow);
    };
    setTimeout(glideHome, 0);
  };

  // its listeners and hooks, added by moveTabsLikeDia (28-tab-dragging.js) in order
  function watchEssentialDrop() {
    window.addEventListener("dragstart", onEssentialStart, true);
    window.addEventListener("dragover", onEssentialOver, true);
    window.addEventListener("drop", endEssentialDrag, true);
    window.addEventListener("dragend", endEssentialDrag, true);

  }

