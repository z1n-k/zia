  // The pointer moving over the sidebar (onOver) and Zen's drop fixed to where Zia shows it
  // (fixDrop).

  const acceptSplitDrop = (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  };

  const pointerOf = (event) => ({
    x: event.clientX || (event.screenX ? event.screenX - window.mozInnerScreenX : 0),
    y: event.clientY || (event.screenY ? event.screenY - window.mozInnerScreenY : 0),
  });
  const inBox = (element, point) => {
    if (!element) {
      return false;
    }
    const box = element.getBoundingClientRect();
    return box.width > 0 && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
  };

  const essentialsGrid = () => window.gZenWorkspaces?.getCurrentEssentialsContainer?.() || document.querySelector(".zen-essentials-container");

  // the lowest of a bottom and the essentials' tiles' bottoms
  const tilesBottom = (bottom, grid = essentialsGrid()) => {
    for (const tile of grid?.querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])") || []) {
      bottom = Math.max(bottom, tile.getBoundingClientRect().bottom);
    }
    return bottom;
  };
  const essentialsBottom = () => tilesBottom(document.getElementById("zen-essentials")?.getBoundingClientRect().bottom ?? -Infinity);

  // Over the tiles themselves or just below the last row: the essentials' own box stops
  // a little short of it, so a drag along it kept flipping into a list row.
  const overAnyTile = (point) => {
    const grid = essentialsGrid();
    if (!grid) {
      return false;
    }
    const box = grid.getBoundingClientRect();
    return box.width > 0 && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= tilesBottom(box.bottom, grid) + 6;
  };

  const onOver = (event) => {
    if (!drag?.moving?.isConnected) {
      return;
    }
    // The other selected tabs folded away above the dragged one moved it up a row each,
    // and the drag is measured from that much higher, or it hung below the pointer. Read
    // on the first move, not as they fold: in a scrolled list (compact mode's, often) the
    // list scrolls back a moment later to keep the tab in view, and it hadn't really moved
    // (#396). (Less any move already on the tab itself, Firefox's or Zia's.)
    if (drag.foldedFrom != null) {
      const style = getComputedStyle(drag.moving);
      const shifted = new DOMMatrix(style.transform === "none" ? undefined : style.transform).m42 + (parseFloat(style.translate.split(" ")[1]) || 0);
      const lift = drag.foldedFrom - (drag.moving.getBoundingClientRect().top - shifted);
      drag.foldedFrom = null;
      drag.clientY &&= drag.clientY - lift;
      drag.screenY &&= drag.screenY - lift;
    }
    let dy = null;
    if (event.clientY) {
      dy = event.clientY - drag.clientY;
    } else if (event.screenY && drag.screenY) {
      dy = event.screenY - drag.screenY;
    }
    if (dy === null) {
      return;
    }
    lastDy = dy;
    try {
      const over = event.target;
      const point = pointerOf(event);
      const sideBox = document.getElementById("navigator-toolbox")?.getBoundingClientRect();
      drag.away =
        !drag.folder && !!point.x && !over?.closest?.("#navigator-toolbox") && !!sideBox?.width &&
        (point.x < sideBox.left || point.x > sideBox.right);

      if (drag.away) {
        drag.essentials = false;
        setFlag("zia-drag-over-essentials", false);
        hideProxy();
        if (!drag.folder && !drag.split) {
          showThumb(point.x, point.y);
        }
        return;
      }
      hideThumb();
      const essentials =
        document.getElementById("zen-essentials") ||
        window.gZenWorkspaces?.getCurrentEssentialsContainer?.() ||
        document.querySelector(".zen-essentials-container");
      const grid = essentialsGrid();
      const hasTiles = !!grid?.querySelector(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])");
      const promo = over?.closest?.("zen-essentials-promo") || null;

      // (#zen-essentials can measure 0px tall with the tiles drawn above
      // it, so the space's own grid is measured too)
      let overEssentials =
        !!promo || !!over?.closest?.("#zen-essentials, .zen-essentials-container") || inBox(essentials, point) || inBox(grid, point);

      drag.firstTop = drag.rows?.length ? Math.min(...drag.rows.map((row) => row.top)) : null;
      if (!overEssentials && !hasTiles && drag.firstTop != null) {
        overEssentials = point.y < drag.firstTop + 4;
      }
      drag.hasTiles = hasTiles;
      drag.essentials = !drag.folder && !drag.split && overEssentials && canBeEssential(drag.tab);
      // A two-site split over the essentials becomes a split essential
      // (24b-split-essentials.js)
      drag.splitEssential = !!drag.split && overEssentials && canBecomeSplitEssential(drag.tab);
      if (drag.split && overEssentials && !drag.splitEssential && !drag.splitRefusalNoted) {
        drag.splitRefusalNoted = true;
        console.warn(`[Zia] Split essentials: this split can't go in the essentials: ${splitEssentialRefusal(drag.tab)}`);
      }
      // Zen turns a split down over the essentials, and without a yes
      // there'd be no drop at all
      holdSplitSlot(drag.splitEssential, point);
      if (drag.splitEssential) {
        acceptSplitDrop(event);
        if (point.x) {
          tapOnNewTile(point, null);
          showProxy(point.x, point.y);
        }
      } else if (drag.split) {
        hideProxy();
      }
      // the dragged tab's section stops covering the essentials, so Zen
      // sees them under the pointer and takes the drop
      setFlag("zia-drag-over-essentials", !!(drag.essentials || drag.splitEssential));
      drag.noTiles = drag.essentials && !hasTiles && !promo;
      makeRoom(drag.noTiles ? document.getElementById("zen-essentials") || grid : null);
      if (drag.essentials) {
        fitZenSlot();
      }
      if (drag.essentials && point.x) {
        tapOnTileShift();
        showProxy(point.x, point.y);
      } else if (!drag.essentials && !drag.splitEssential) {
        drag.tileShifts = null;
        hideProxy();
      }
      apply(dy);
    } catch (err) {
      console.error("[Zia] Tab drag failed:", err);
    }
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (drag) {
          apply(lastDy);
        }
      });
    }
  };
  const fixDrop = (event) => {
    const tab = drag?.tab;
    const data = tab?._dragData;
    if (drag?.splitEssential) {
      acceptSplitDrop(event);
      return;
    }
    if (data && drag.essentials && drag.noTiles) {
      data.dropElement = tab;
      data.dropBefore = true;
      return;
    }
    if (!data || !event.clientY || drag.folder || drag.essentials || drag.away) {
      return;
    }
    if (drag.target?.hand) {
      data.dropElement = tab;
      data.dropBefore = true;
      if (typeof tab.elementIndex === "number") {
        data.animDropElementIndex = tab.elementIndex;
      }
      return;
    }
    const y = event.clientY;
    let target = null;
    for (const item of gBrowser.tabContainer.ariaFocusableItems) {
      if (item === tab || item.hasAttribute?.("zen-essential")) {
        continue;
      }
      const node = nodeToMove(item);
      if (!node) {
        continue;
      }
      const box = window.windowUtils.getBoundsWithoutFlushing(node);
      if (y < box.top || y > box.bottom) {
        continue;
      }
      target = { item, node, box };
      break;
    }
    if (!target) {
      return;
    }
    const folder = target.node.closest?.(FOLDER_SELECTOR);
    const header = folder?.querySelector(":scope > .tab-group-label-container");
    const headerBox = header ? window.windowUtils.getBoundsWithoutFlushing(header) : null;
    if (folder && headerBox && y > headerBox.top + headerBox.height * 0.2 && y < headerBox.bottom - headerBox.height * 0.2) {
      const first = folder.tabs?.[0];
      if (first) {
        data.dropElement = first;
        data.dropBefore = true;
        data.animDropElementIndex = first.elementIndex;
        return;
      }
    }
    data.dropElement = target.item;
    data.dropBefore = y < target.box.top + target.box.height / 2;
    if (typeof target.item.elementIndex === "number") {
      data.animDropElementIndex = target.item.elementIndex;
    }
  };

  // Everything let go glides into place the same way: tabs, splits,
  // folders and essentials
  const LAND_MS = 180;
  const LAND_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
  // that curve, for a glide stepped frame by frame
  const landEase = (t) => {
    const bez = (a, b, u) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (bez(0.2, 0.2, mid) < t) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return bez(0.8, 1, (lo + hi) / 2);
  };

