  // A drag starting: begin, and the pointer's taps, clicks and folder snaps around it.

  const begin = (target, event) => {
    if (!target || target.hasAttribute?.("zen-essential")) {
      return;
    }
    const folder = target.localName === "zen-folder" || target.isZenFolder ? target : null;

    // an open folder that the drag caught before it shut: shut now
    if (folder && !isCollapsed(folder)) {
      snapShut(folder);
    }
    const split = !folder && target.group?.hasAttribute?.("split-view-group") ? target.group : null;
    const moving = folder || split || target;
    // Several tabs selected: the others fold into the one dragged (out of the list, the
    // rows closing up, a count on it), as macOS drags several things; Firefox moves them
    // all on the drop, and they show again there. (Only the dragged one moved, and the
    // rest jumped across on the drop.)
    let companions = 0;
    // (where the dragged tab was before those above it folded away, for the first move to
    // measure how far it rose, #396)
    let foldedFrom = null;
    if (!folder && !split && target.multiselected) {
      const startTop = target.getBoundingClientRect().top;
      const others = gBrowser.selectedTabs.filter((tab) => tab !== target && !tab.hasAttribute("zen-essential") && tab.isConnected);
      // (the rows round them close up smoothly as they fold away, rather than at once)
      const before = new Map();
      if (others.length) {
        for (const item of gBrowser.tabContainer.ariaFocusableItems) {
          const node = nodeToMove(item);
          if (node && node !== target && !others.includes(item) && !before.has(node)) {
            before.set(node, node.getBoundingClientRect().top);
          }
        }
      }
      // (the list let out of its box before they fold: the rows closing up overflow it a
      // moment, it looked scrollable, stayed clipped, and cut the dragged tab off, #396)
      unclipAround(target);
      for (const tab of others) {
        tab.setAttribute("zia-drag-companion", "true");
      }
      if (others.length) {
        target.setAttribute("zia-drag-count", String(others.length + 1));
        companions = others.length;
        foldedFrom = startTop;
        for (const [node, top] of before) {
          const now = node.getBoundingClientRect().top;
          if (Math.abs(top - now) > 0.5) {
            node.animate([{ translate: `0 ${top - now}px` }, { translate: "0 0" }], { duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
          }
        }
      }
    }
    const rows = measureRows(folder ? null : target);
    const mine = rows.find((row) => row.item === target || row.node === moving || (folder && folder.contains(row.node)));
    const box = layoutTop(moving);
    const sep = currentSeparator();

    if (sep && !folder && (sep.hidden || sep.closest?.("[hide-separator]") || !sep.getBoundingClientRect().height)) {
      sep.setAttribute("zia-sep-open", "true");
    }
    const sepTop = sep ? sep.getBoundingClientRect().top : null;
    const side = (top) => (sepTop == null ? 0 : top > sepTop ? 1 : -1);
    let pitch = box.height;

    if (!folder && mine) {
      const fits = (gap) => gap > 8 && gap < box.height * 1.6;
      // (only between two side-by-side rows in the same list: a folder's name-to-tab gap and
      // its padding made the step short or long, and everything snapped the rest on the drop)
      const head = (row) => !!row.node?.classList?.contains("tab-group-label-container");
      const pair = (a, b) => !head(a) && !head(b) && a.node?.parentElement === b.node?.parentElement && side(a.top) === side(b.top);
      let best = Infinity;
      for (const row of rows) {
        if (Math.abs(row.index - mine.index) !== 1 || !pair(row, mine)) {
          continue;
        }
        const gap = Math.abs(row.top - mine.top);
        if (fits(gap) && gap < best) {
          best = gap;
        }
      }
      if (best === Infinity) {
        const sorted = [...rows].sort((a, b) => a.top - b.top);
        for (let i = 1; i < sorted.length; i++) {
          if (!pair(sorted[i - 1], sorted[i])) {
            continue;
          }
          const gap = sorted[i].top - sorted[i - 1].top;
          if (fits(gap) && gap < best) {
            best = gap;
          }
        }
      }
      if (best < Infinity) {
        pitch = best;
      }
    }
    document.documentElement.setAttribute("zia-dragging-tab", "true");
    muteZenHaptics(true);

    // a split's row narrows into a folder as a tab does, by its box
    const bg = folder ? null : split ? split.querySelector(":scope > .tab-group-container") : bgOf(target);
    const content = folder || split ? null : contentOf(target);
    const margins = (node) => {
      const style = node ? getComputedStyle(node) : null;
      return { start: parseFloat(style?.marginInlineStart) || 0, end: parseFloat(style?.marginInlineEnd) || 0 };
    };
    unclipAround(moving);
    noLanding();
    drag = {
      split,
      bg,
      content,
      bgBox: bg ? bg.getBoundingClientRect() : null,
      bgBase: margins(bg),
      contentBase: margins(content),
      widthKey: target.group && isFolderEl(target.group) ? target.group : "plain",
      tab: target,
      folder,
      moving,
      rows,
      origin: box.top,
      height: box.height,
      index: mine?.index ?? 0,
      pitch,
      shifted: new Set(),
      sepTop,
      sepDelta: 0,
      clientY: event.clientY || dragCore.pending?.clientY || 0,
      screenY: event.screenY || dragCore.pending?.screenY || 0,
      companions,
      foldedFrom,
      space: window.gZenWorkspaces?.activeWorkspace,
    };
    dragCore.lastDy = 0;
    lendOut(split || (folder ? null : target));
    for (const row of rows) {
      if (row.node === moving || (folder && folder.contains(row.node))) {
        continue;
      }
      place(row.node, 0, false);
    }
  };

  // An open folder is shut the moment it starts to be dragged (before the drag begins,
  // its animations jumped to their end so the list is closed at once), and dragged as a
  // closed folder. A plain click still just closes it.
  let snapping = null;
  const snapShut = (folder) => {
    try {
      folder.collapsed = true;
    } catch (err) {
      noteError("tab dragging: shut folder", err);
      return;
    }
    jumpToEnd(folder);
    folder.getBoundingClientRect();
  };

  const onStart = (event) => {
    if (inLibrary(event)) {
      return;
    }
    const tab = tabFromEvent(event);
    if (tab) {
      begin(tab, event);
      return;
    }
    const inSidebar = event.target?.closest?.("#navigator-toolbox, #tabbrowser-tabs");
    if (inSidebar && dragCore.pending?.tab) {
      begin(dragCore.pending.tab, event);
    }
  };

  // its listeners and hooks, added by moveTabsLikeDia (28-tab-dragging.js) in order
  function watchDragStart() {
    window.addEventListener(
      "mousedown",
      (event) => {
        if (event.button !== 0) {
          return;
        }
        const tab = tabFromEvent(event);
        dragCore.pending = tab ? { tab, clientY: event.clientY, screenY: event.screenY } : null;
      },
      true
    );
    window.addEventListener("mousedown", (event) => {
      snapping = null;
      if (event.button !== 0 || !featureOn("dia-tab-drag")) {
        return;
      }
      const label = event.target?.closest?.(".tab-group-label-container");
      const folder = label?.closest?.("zen-folder");
      if (!folder || label.parentElement !== folder || isCollapsed(folder)) {
        return;
      }
      snapping = { folder, x: event.screenX, y: event.screenY, shut: false };
    }, true);
    window.addEventListener("mousemove", (event) => {
      if (!snapping || snapping.shut) {
        return;
      }
      if (!(event.buttons & 1)) {
        snapping = null;
        return;
      }
      if (Math.hypot(event.screenX - snapping.x, event.screenY - snapping.y) < 2) {
        return;
      }
      snapping.shut = true;
      snapShut(snapping.folder);
    }, true);
    // shut already: the click that would have shut it isn't let reopen it
    window.addEventListener("click", (event) => {
      const shut = snapping?.shut && snapping.folder.contains(event.target);
      snapping = null;
      if (shut) {
        event.stopPropagation();
        event.preventDefault();
      }
    }, true);
    window.addEventListener("dragstart", onStart, true);
    document.getElementById("tabbrowser-tabs")?.addEventListener("dragstart", onStart, true);

  }

