  // The proxy (the copy of a dragged tab that follows the pointer over the essentials, as a
  // tile) and the room made for it, and the copies a drag floats: clones of a tab, the proxy
  // or an essential's copy (09), each marked zia-essential-proxy, the name CSS knows them by.
  // Used elsewhere: proxy, clearProxy, showProxy, hideProxy, landProxy, liveCopies, removeCopy,
  // cloneCopy, easeSize, fadeSplitContent, fitSplitHalves, makeRoom, canBeEssential, fitZenSlot,
  // splitSlot, holdSplitSlot.

  const PROXY_MS = 140;
  // (back into a row quicker than it became a tile: as long, it lagged)
  const PROXY_BACK_MS = 100;
  // (removed only once its glide has ended, a frame or so after)
  const PROXY_LAND_SLACK_MS = 20;
  const PROXY_LAND_MS = PROXY_MS + PROXY_LAND_SLACK_MS;
  const SPLIT_SLOT_SLIDE_MS = 180;

  // the proxy, its timer back to a row, and the tab it's landing as (its offset from the
  // pointer and whether it's leaving are kept on the node itself, ziaOffset and ziaLeaving:
  // a node leaving or landing outlives proxy.node, which is free for the next at once)
  const proxy = { node: null, leaveTimer: 0, landing: null };

  // the essentials opened for a first essential (makeRoom), and the split slot (holdSplitSlot)
  let roomFor = null;
  let splitSlot = null;

  // A drag's copies are clones of the tab, so Zen could take one for a real tab: taking
  // an essential out mid-drag, it moved the copy into the list and put it back after the
  // drop (a duplicate row). A copy is live until removed; one put back after is taken out.
  const liveCopies = new WeakSet();

  const showProxy = (x, y) => {
    clearTimeout(proxy.leaveTimer);
    if (!proxy.node && !createProxy(x, y)) {
      return;
    }
    proxy.node.ziaLeaving = false;
    easeSize(proxy.node, PROXY_MS);
    if (!drag.moving.hasAttribute("zia-to-essential")) {
      tap();
    }
    drag.moving.setAttribute("zia-to-essential", "true");
    const tile = tileSize();

    // (and back into a tile, headed back over the essentials)
    if (!proxy.node.hasAttribute("zen-essential")) {
      proxy.node.setAttribute("zen-essential", "true");
      proxy.node.setAttribute("pinned", "true");
      if (drag.split) {
        fitSplitHalves(proxy.node, tile.stackHeight, tile.half, tile.width);
      }
      fadeSplitContent(proxy.node, PROXY_MS);
    }
    sizeCopy(proxy.node, tile.width, tile.height);
    moveProxy(x, y);
  };

  // the proxy made from the dragged row (false if there's nothing to make it from)
  const createProxy = (x, y) => {
    const host = root;
    if (!host || !drag?.tab) {
      return false;
    }
    proxy.node = cloneCopy(drag.tab);
    proxy.node.setAttribute("zen-essential", "true");
    proxy.node.setAttribute("pinned", "true");
    proxy.node.id = "zia-essential-proxy";
    const row = drag.moving.getBoundingClientRect();
    sizeCopy(proxy.node, row.width, row.height);
    host.appendChild(proxy.node);
    if (drag.split) {
      // a split starts as its row (both sites, icon and title), and
      // morphs into its tile (showProxy)
      dressSplitProxy(proxy.node, drag.tab);
      proxy.node.removeAttribute("zen-essential");
      proxy.node.removeAttribute("pinned");
    }
    try {
      window.gZenPinnedTabManager?.setEssentialTabIcon?.(proxy.node);
    } catch (err) {
      noteError("tab dragging: showProxy", err);
    }
    moveProxy(x, y);

    const box = proxy.node.getBoundingClientRect();
    proxy.node.ziaOffset = { x: box.left + box.width / 2 - x, y: box.top + box.height / 2 - y };
    return true;
  };

  const moveProxy = (x, y) => {
    const off = proxy.node.ziaOffset || { x: 0, y: 0 };
    proxy.node.style.setProperty("left", `${Math.round(x - off.x)}px`, "important");
    proxy.node.style.setProperty("top", `${Math.round(y - off.y)}px`, "important");
  };

  const tileSize = () => {
    const usable = (el) => {
      const box = el?.isConnected ? window.windowUtils.getBoundsWithoutFlushing(el) : null;
      return box && box.width > 8 && box.height > 8 ? box : null;
    };

    const ownGrid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.();
    const real = [...(ownGrid || document).querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])")].find(
      (tile) => usable(tile)
    );
    const realBox = usable(real);
    if (realBox) {
      const bg = usable(real.querySelector(".tab-background")) || realBox;
      const stack = usable(real.querySelector(".tab-stack")) || realBox;
      // a split essential's half, if there's one, measured as it is
      const half = usable(
        (ownGrid || document).querySelector(".tabbrowser-tab[zen-essential][zia-split-tile]:not([zia-essential-proxy]) .zia-split-half")
      );
      return { width: realBox.width, height: bg.height, stackHeight: stack.height, half };
    }
    const box = usable(gBrowser.tabContainer.tabDragAndDrop?._fakeEssentialTab);
    if (box) {
      return { width: box.width, height: box.height };
    }

    const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.() || document.getElementById("zen-essentials");
    const width = grid?.clientWidth ? (grid.clientWidth - 3 * 8) / 4 : 56;
    return { width, height: Math.round(width * 0.75) };
  };

  const hideProxy = () => {
    if (!proxy.node || proxy.node.ziaLeaving || !drag?.moving) {
      return;
    }
    proxy.node.ziaLeaving = true;
    // (back to its row, not a tile stretched to a row's size, as a split does)
    if (proxy.node.hasAttribute("zen-essential")) {
      const current = proxy.node.getBoundingClientRect();
      proxy.node.removeAttribute("zen-essential");
      proxy.node.removeAttribute("pinned");
      sizeCopy(proxy.node, current.width, current.height);
      proxy.node.getBoundingClientRect();
      fadeSplitContent(proxy.node, PROXY_BACK_MS);
    }
    const leaving = proxy.node;
    const moving = drag.moving;
    glideProxyBack(leaving, moving);
    proxy.leaveTimer = setTimeout(() => {
      if (proxy.node === leaving && leaving.ziaLeaving) {
        leaving.remove();
        proxy.node = null;
        moving.removeAttribute("zia-to-essential");
      }
    }, PROXY_BACK_MS);
  };

  // Eased frame by frame to wherever its row is now: Zen slides the list
  // up as its cell in the essentials goes, so the row's place moves as
  // the tile travels (sent to where it was, it landed off and jumped)
  const glideProxyBack = (leaving, moving) => {
    const from = leaving.getBoundingClientRect();
    const began = performance.now();
    leaving.style.setProperty("transition", "none", "important");
    // (each frame checks it's still this proxy leaving, so the loop is never cancelled)
    const step = (now) => {
      if (proxy.node !== leaving || !leaving.ziaLeaving) {
        return;
      }
      const t = Math.min(1, (now - began) / PROXY_BACK_MS);
      const k = 1 - (1 - t) * (1 - t);
      const row = moving.getBoundingClientRect();
      const at = (a, b) => a + (b - a) * k;
      sizeCopy(leaving, at(from.width, row.width), at(from.height, row.height));
      moveProxy(at(from.left + from.width / 2, row.left + row.width / 2), at(from.top + from.height / 2, row.top + row.height / 2));
      if (t < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  };

  const landProxy = (tab) => {
    const tile = proxy.node;
    proxy.node = null;
    clearTimeout(proxy.leaveTimer);
    if (!tile) {
      return;
    }
    proxy.landing = tab;
    const done = () => {
      tile.remove();
      tab.removeAttribute("zia-to-essential");
      if (proxy.landing === tab) {
        proxy.landing = null;
      }
    };

    const whenEssential = (then, tries = 0) => {
      if (tab.isConnected && tab.hasAttribute("zen-essential")) {
        then();
      } else if (tries < 30) {
        requestAnimationFrame(() => whenEssential(then, tries + 1));
      } else {
        done();
      }
    };
    // (none of its timers or frames is kept: they're what removes the landing tile, and
    // each runs once, or up to 30 frames, so they always end)
    setTimeout(() => whenEssential(() => glideProxyOnto(tile, tab, done)), 0);
  };

  // the landing tile glides onto the essential it became, and goes once there
  const glideProxyOnto = (tile, tab, done) => {
    tab.removeAttribute("zia-essential-enter");
    for (const animation of tab.querySelector(".tab-stack")?.getAnimations?.() || []) {
      if (animation.effect?.getComputedTiming().endTime !== Infinity) {
        animation.finish();
      }
    }
    const own = tab.getBoundingClientRect();
    const drawn = tab.querySelector(".tab-background")?.getBoundingClientRect() || own;
    const box = { left: own.left, width: own.width, top: drawn.top, height: drawn.height };
    const off = tile.ziaOffset || { x: 0, y: 0 };
    tile.style.setProperty("transition", `all ${PROXY_MS}ms ease-out`, "important");
    tile.style.setProperty("left", `${Math.round(box.left + box.width / 2 - off.x)}px`, "important");
    tile.style.setProperty("top", `${Math.round(box.top + box.height / 2 - off.y)}px`, "important");
    sizeCopy(tile, box.width, box.height);
    setTimeout(done, PROXY_LAND_MS);
  };

  const clearProxy = () => {
    clearTimeout(proxy.leaveTimer);
    proxy.node?.remove();
    proxy.node = null;
    document.querySelectorAll("[zia-to-essential]").forEach((node) => {
      if (node !== proxy.landing) {
        node.removeAttribute("zia-to-essential");
      }
    });
  };

  const makeRoom = (container) => {
    if (roomFor === container) {
      return;
    }
    roomFor?.removeAttribute("zia-make-room");
    roomFor = container || null;
    if (roomFor) {
      roomFor.style.setProperty("--zia-room", `${Math.round(tileSize().height + 8)}px`);
      roomFor.setAttribute("zia-make-room", "true");
    }
  };

  const canBeEssential = (tab) => {
    try {
      return window.gZenPinnedTabManager?.canEssentialBeAdded?.(tab) ?? true;
    } catch (err) {
      return false;
    }
  };

  const fitZenSlot = () => fitTileSlot(gBrowser.tabContainer.tabDragAndDrop?._fakeEssentialTab);

  // A cell in the essentials (Zen's own for a dragged tab, or the split slot) sized as the
  // tiles are spaced. (Marked fitted on the node itself: Zen makes its cell afresh each
  // drag, so the mark goes with it.)
  const fitTileSlot = (slot) => {
    if (!slot?.isConnected || slot.ziaFitted) {
      return;
    }
    const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.();
    const tiles = [...(grid || document).querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])")]
      .map((tile) => tile.getBoundingClientRect())
      .filter((box) => box.width > 8);
    if (!tiles.length) {
      return;
    }
    const first = tiles[0];
    const across = tiles.find((box) => Math.abs(box.top - first.top) < 2 && box.left > first.left + 2);
    const down = tiles.find((box) => box.top > first.top + 2);
    const stepX = across ? across.left - first.left : first.width + 7;
    const stepY = down ? down.top - first.top : first.height + (stepX - first.width);
    const own = slot.getBoundingClientRect();
    const width = stepX - 4;
    const height = stepY - 4;
    slot.style.setProperty("width", `${width}px`, "important");
    slot.style.setProperty("min-width", `${width}px`, "important");
    slot.style.setProperty("max-width", `${width}px`, "important");
    slot.style.setProperty("height", `${height}px`, "important");
    slot.style.setProperty("min-height", `${height}px`, "important");
    slot.style.setProperty("margin-inline-end", `${Math.min(0, (own.width || first.width) - width)}px`, "important");
    slot.style.setProperty("margin-block-end", `${Math.min(0, first.height - height)}px`, "important");
    slot.ziaFitted = true;
  };

  // Zen opens a cell for a tab dragged over the essentials but turns a split down there,
  // so Zia opens the same cell for a split essential, where the pointer is (always at the
  // end, the others never moved aside); over a tile it takes that tile's side, swapping.
  const holdSplitSlot = (on, point = null) => {
    const grid = on ? window.gZenWorkspaces?.getCurrentEssentialsContainer?.() : null;
    if (!grid) {
      splitSlot?.remove();
      splitSlot = null;
      return;
    }
    if (!splitSlot || splitSlot.parentElement !== grid) {
      splitSlot?.remove();
      splitSlot = document.createXULElement("vbox");
      splitSlot.setAttribute("zia-split-slot", "true");
      grid.appendChild(splitSlot);
      fitTileSlot(splitSlot);
    }
    if (!point?.x && !point?.y) {
      return;
    }
    const cells = [...grid.children];
    // (not one still sliding: it's drawn where it was, under the pointer,
    // and swapped straight back, over and over)
    const tile = cells.find(
      (cell) =>
        cell !== splitSlot &&
        cell.classList?.contains("tabbrowser-tab") &&
        !cell.hasAttribute("zia-essential-proxy") &&
        !cell.getAnimations().some((a) => a.id === "zia-slot-slide") &&
        inBox(cell, point)
    );
    if (tile) {
      swapSplitSlot(cells, tile);
    }
  };

  // (the tiles slide to their new places with a tap, as Zen's do: they jumped silently)
  const swapSplitSlot = (cells, tile) => {
    const tiles = cells.filter((cell) => cell !== splitSlot && cell.classList?.contains("tabbrowser-tab") && !cell.hasAttribute("zia-essential-proxy"));
    const was = new Map(tiles.map((cell) => [cell, cell.getBoundingClientRect()]));
    if (cells.indexOf(splitSlot) < cells.indexOf(tile)) {
      tile.after(splitSlot);
    } else {
      tile.before(splitSlot);
    }
    tap();
    for (const cell of tiles) {
      const from = was.get(cell);
      const to = cell.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        continue;
      }
      const slide = cell.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: SPLIT_SLOT_SLIDE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      slide.id = "zia-slot-slide";
    }
  };

  // A floating copy of a tab, without the drag's own marks on it (among
  // them what a drop just before left: a lock that pins position, so the
  // copy stuck where it started and the drag was trapped)
  const cloneCopy = (tab) => {
    const copy = trackCopy(tab.cloneNode(true));
    copy.removeAttribute("id");
    for (const name of [
      "dragtarget", "pending-drag", "multiselected", "zen-pinned-changed", "folder-active",
      "zia-drop-lock", "zia-landing", "zia-hover-held", "zia-held-pinned", "zia-shift", "zia-dragging", "zia-to-essential",
    ]) {
      copy.removeAttribute(name);
    }
    copy.setAttribute("zia-essential-proxy", "true");
    floatCopy(copy);
    return copy;
  };

  const trackCopy = (node) => {
    liveCopies.add(node);
    node.remove = function () {
      removeCopy(this);
    };
    return node;
  };

  // Once in the list the copy was in the browser's cached tabs, which a removal doesn't
  // refresh: closing the selected tab then picked the copy, failed, and wouldn't close
  const removeCopy = (node) => {
    liveCopies.delete(node);
    Element.prototype.remove.call(node);
    try {
      gBrowser.tabContainer._invalidateCachedTabs?.();
      gBrowser.tabContainer._invalidateCachedVisibleTabs?.();
    } catch (err) {
      noteError("tab dragging: forget the copy", err);
    }
  };

  // a copy floating over everything, drawn from its middle (left, top)
  const floatCopy = (node) => {
    node.style.cssText = "";
    for (const [name, value] of [
      ["position", "fixed"],
      ["margin", "0"],
      ["z-index", "2147483646"],
      ["pointer-events", "none"],
      ["transform", "none"],
      ["translate", "-50% -50%"],
    ]) {
      node.style.setProperty(name, value, "important");
    }
  };

  // its size eased (the drag's own rules turn transitions off)
  const easeSize = (node, ms) =>
    node.style.setProperty(
      "transition",
      ["width", "height", "min-width", "max-width", "min-height", "max-height"].map((name) => `${name} ${ms}ms ease-out`).join(", "),
      "important"
    );

  // A copy changing between a row and a tile hides what's in it while the box morphs
  // (an icon stretched a row wide, a split's icons sliding, looked broken), then blurs
  // into focus once it's the new shape, as Dia's morphs do
  const fadeSplitContent = (node, ms) => {
    if (!node) {
      return;
    }
    const blur = matchMedia("(prefers-reduced-motion: reduce)").matches ? "blur(0px)" : "blur(6px)";
    node.querySelector(".tab-content")?.animate(
      [
        { opacity: 0, filter: blur },
        { opacity: 0, filter: blur, offset: 0.45 },
        { opacity: 1, filter: "blur(0px)" },
      ],
      { duration: Math.round(ms * 1.5), easing: "ease-out" }
    );
  };

  // A split tile's halves fill an essential's inner box less 8px all round; a copy
  // isn't that size, so its halves get the real ones' size, centred. With none to measure,
  // worked out as the tile does it: 4:5, at most half its box less 3px (left to the
  // copy's own narrower box, each landed 2px wider)
  const fitSplitHalves = (node, stackHeight, half = null, tileWidth = 0) => {
    if (half) {
      node.style.setProperty("--zia-split-half-height", `${half.height}px`);
      node.style.setProperty("--zia-split-half-width", `${half.width}px`);
    } else if (stackHeight > 16) {
      const height = stackHeight - 16;
      node.style.setProperty("--zia-split-half-height", `${height}px`);
      if (tileWidth > 16) {
        node.style.setProperty("--zia-split-half-width", `${Math.min(height * 0.8, (tileWidth - 16) / 2 - 3)}px`);
      }
    }
  };
