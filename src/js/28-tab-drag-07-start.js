  // A drag starting: begin, and the pointer's taps, clicks and folder snaps around it.
  // Used elsewhere: begin, watchDragStart.

  // (the rows round the folded tabs closing up)
  const FOLD_CLOSE_MS = 160;

  // An open folder is shut the moment it starts to be dragged (before the drag begins,
  // its animations jumped to their end so the list is closed at once), and dragged as a
  // closed folder. A plain click still just closes it.
  let snapping = null;

  // its listeners and hooks, added by moveTabsLikeDia (28-tab-dragging.js) in order
  function watchDragStart() {
    window.addEventListener("mousedown", notePress, true);
    window.addEventListener("mousedown", noteFolderPress, true);
    window.addEventListener("mousemove", snapOnMove, true);
    window.addEventListener("click", swallowSnapClick, true);
    window.addEventListener("dragstart", onStart, true);
    document.getElementById("tabbrowser-tabs")?.addEventListener("dragstart", onStart, true);
  }

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

  const notePress = (event) => {
    if (event.button !== 0) {
      return;
    }
    const tab = tabFromEvent(event);
    dragCore.pending = tab ? { tab, clientY: event.clientY, screenY: event.screenY } : null;
  };

  const noteFolderPress = (event) => {
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
  };

  const snapOnMove = (event) => {
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
  };

  // shut already: the click that would have shut it isn't let reopen it
  const swallowSnapClick = (event) => {
    const shut = snapping?.shut && snapping.folder.contains(event.target);
    snapping = null;
    if (shut) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

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
    const { companions, foldedFrom } =
      !folder && !split && target.multiselected ? foldCompanions(target) : { companions: 0, foldedFrom: null };
    const { rows, mine, box, sepTop, pitch } = measureStart(target, folder, moving);
    document.documentElement.setAttribute("zia-dragging-tab", "true");
    muteZenHaptics(true);

    // a split's row narrows into a folder as a tab does, by its box
    const bg = folder ? null : split ? split.querySelector(":scope > .tab-group-container") : bgOf(target);
    const content = folder || split ? null : contentOf(target);
    unclipAround(moving);
    noLanding();
    drag = {
      split,
      ...widthLook(bg, content),
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
    resetWidthMorph(target.group && isFolderEl(target.group) ? target.group : "plain");
    dragCore.lastDy = 0;
    lendOut(split || (folder ? null : target));
    resetRows(rows, moving, folder);
  };

  // the rows, the dragged one among them, its box and the step the rows move by
  const measureStart = (target, folder, moving) => {
    const rows = measureRows(folder ? null : target);
    const mine = rows.find((row) => row.item === target || row.node === moving || (folder && folder.contains(row.node)));
    const box = layoutTop(moving);
    const sepTop = openSeparator(folder);
    const pitch = !folder && mine ? rowPitch(rows, mine, box.height, sepTop) : box.height;
    return { rows, mine, box, sepTop, pitch };
  };

  // the background and content a drag narrows, and where they start (morphWidth)
  const widthLook = (bg, content) => ({
    bg,
    content,
    bgBox: bg ? bg.getBoundingClientRect() : null,
    bgBase: marginsOf(bg),
    contentBase: marginsOf(content),
  });

  // Several tabs selected: the others fold into the one dragged (out of the list, the
  // rows closing up, a count on it), as macOS drags several things; Firefox moves them
  // all on the drop, and they show again there. (Only the dragged one moved, and the
  // rest jumped across on the drop.)
  const foldCompanions = (target) => {
    let companions = 0;
    // (where the dragged tab was before those above it folded away, for the first move to
    // measure how far it rose, #396)
    let foldedFrom = null;
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
          node.animate([{ translate: `0 ${top - now}px` }, { translate: "0 0" }], { duration: FOLD_CLOSE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        }
      }
    }
    return { companions, foldedFrom };
  };

  // the separator's top, opened first if it's hidden
  const openSeparator = (folder) => {
    const sep = currentSeparator();
    if (sep && !folder && (sep.hidden || sep.closest?.("[hide-separator]") || !sep.getBoundingClientRect().height)) {
      sep.setAttribute("zia-sep-open", "true");
    }
    return sep ? sep.getBoundingClientRect().top : null;
  };

  // The step between rows, for the rows to move by: the dragged row's own height unless a
  // closer pair of rows shows a tighter one
  const rowPitch = (rows, mine, height, sepTop) => {
    const side = (top) => (sepTop == null ? 0 : top > sepTop ? 1 : -1);
    const fits = (gap) => gap > 8 && gap < height * 1.6;
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
    return best < Infinity ? best : height;
  };

  const marginsOf = (node) => {
    const style = node ? getComputedStyle(node) : null;
    return { start: parseFloat(style?.marginInlineStart) || 0, end: parseFloat(style?.marginInlineEnd) || 0 };
  };

  // every row but what's dragged, held where it is for the rows' moves to start from
  const resetRows = (rows, moving, folder) => {
    for (const row of rows) {
      if (row.node === moving || (folder && folder.contains(row.node))) {
        continue;
      }
      place(row.node, 0, false);
    }
  };

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
