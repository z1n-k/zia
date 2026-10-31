  // The drag's shared state, the system's drag picture blanked, and the rows measured and the
  // drop target found.
  // Used elsewhere: drag, dragCore, endDrag, markEssentialImage, handImageToZen,
  // topRoom, clearTopRoom, blankImage, inLibrary, tabFromEvent, layoutTop, measureRows,
  // clearMoved, place, isFolderEl, headerOf, isCollapsed, emptySlotPitchOf, emptySlotAfterHeader,
  // rowFolder, notARow, topLevel, setDropSlot, updateTarget, watchDragImage.

  const TOP_ROOM_MS = 150;
  // (its easing kept a little past the move, then dropped)
  const TOP_ROOM_CLEAR_MS = 200;

  // The one drag under way, made by begin (07) and dropped by endDrag. It's the drag's
  // shared record: each step of the drag (07-12) notes its part of it there, so it isn't
  // split by file (02's width morph, with a timer of its own, keeps its own state).
  let drag = null;

  // (what outlives a single drag record: the press before it, the frame pending, the rows moved)
  const dragCore = {
    // the tab pressed, before the drag starts
    pending: null,
    raf: 0,
    lastDy: 0,
    moved: new Set(),
  };
  const endDrag = () => {
    drag = null;
    dragCore.pending = null;
  };

  const dragImage = {
    blank: null,
    // What's dragged in the sidebar is drawn by Zia (the row itself, or a copy), so the
    // system's picture is blanked (for an essential, anything: it showed as a window-wide
    // blurred band).
    // A drag in the Library (its spaces' tabs) is Zen's own, with its own picture
    // under the pointer and its drop line: Zia leaves it alone.
    library: false,
    // (handed to Zen mid-drag, by a switch of space: Zen's own picture of the tab, as Zia's
    // rows stay in the space it left, releaseToZen)
    zen: false,
    essential: false,
  };

  // (an essential's drag sets its own, 09 and 10; a switch of space hands the picture to Zen, 12)
  const markEssentialImage = (on) => {
    dragImage.essential = on;
  };
  const handImageToZen = () => {
    dragImage.zen = true;
  };

  // the room made at the top of a closed folder, while there is one (roomAtTop)
  let topRoom = null;

  // its listeners and hooks, added by moveTabsLikeDia (28-tab-dragging.js) in order
  function watchDragImage() {
    window.addEventListener("dragstart", (event) => (dragImage.library = !!inLibrary(event)), true);
    window.addEventListener("dragend", () => (dragImage.library = false), true);
    window.addEventListener("dragstart", () => (dragImage.zen = false), true);
    for (const name of ["setDragImage", "updateDragImage"]) {
      const original = DataTransfer.prototype[name];
      DataTransfer.prototype[name] = function (node, x, y) {
        return blanksDragImage(node) ? original.call(this, blankImage(), 0, 0) : original.call(this, node, x, y);
      };
    }
  }

  const blanksDragImage = (node) =>
    !dragImage.library &&
    !dragImage.zen &&
    (!!(node?.querySelector?.("[drag-image]") || node?.hasAttribute?.("drag-image")) ||
    !!dragImage.essential ||
    !!node?.closest?.("#zen-essentials, .zen-essentials-container") ||
    !!node?.querySelector?.(".tabbrowser-tab[zen-essential]"));

  const blankImage = () => {
    if (!dragImage.blank) {
      dragImage.blank = document.createElement("div");
      dragImage.blank.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
      document.documentElement.appendChild(dragImage.blank);
    }
    return dragImage.blank;
  };

  const inLibrary = (event) => event.composedPath?.().some((node) => node.localName === "zen-library");

  const tabFromEvent = (event) => {
    const seen = [event.explicitOriginalTarget, event.originalTarget, event.target];
    for (const start of seen) {
      let node = start;
      while (node) {
        if (node.classList?.contains("tabbrowser-tab")) {
          return node.hasAttribute("zen-essential") ? null : node;
        }
        if (node.localName === "zen-folder" || node.isZenFolder) {
          return node;
        }
        node = node.parentElement || node.getRootNode?.()?.host;
      }
    }
    return null;
  };

  const measureRows = (keepOpen = null) => {
    const rows = [];
    const seen = new Set();
    for (const item of gBrowser.tabContainer.ariaFocusableItems) {
      if (!isRow(item)) {
        continue;
      }
      const { node, closed } = rowNodeOf(item, keepOpen);
      if (!node || seen.has(node)) {
        continue;
      }
      seen.add(node);
      rows.push(rowOf(item, node, closed, rows.length));
    }
    // Numbered by place in the sidebar, not Firefox's tab count: that can lag a move,
    // and the folders a tab sat under all moved up out of its way
    rows.sort((a, b) => (a.node === b.node ? 0 : a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    rows.forEach((row, i) => {
      row.index = i;
    });
    return rows;
  };

  const isRow = (item) => {
    if (item.hasAttribute?.("zen-essential")) {
      return false;
    }
    // a split essential's own tabs, kept hidden in the list, aren't rows (as 0-high rows
    // between a folder and the next, no tab could be dropped into the folder)
    if (item.hasAttribute?.("zia-split-of") || item.group?.querySelector?.(":scope .tabbrowser-tab[zia-split-of]")) {
      return false;
    }
    // nor the selected tabs folded into the one dragged: hidden, as 0-high rows each step
    // past them moved nothing, and the dragged tab slid over the rows that should part
    return !item.hasAttribute?.("zia-drag-companion");
  };

  const rowNodeOf = (item, keepOpen) => {
    let node = nodeToMove(item);
    // A closed folder is one row, its name and the tab it shows (that tab as a row too
    // moved aside twice and came apart from it, uncovering the tabs it hides).
    let closed = null;
    for (
      let host = node?.closest?.(FOLDER_SELECTOR);
      host;
      host = host.parentElement?.closest?.(FOLDER_SELECTOR)
    ) {
      if (host !== node && (host.hasAttribute("collapsed") || host.collapsed) && !host.contains(keepOpen)) {
        closed = host;
      }
    }
    // (only a folder showing a tab: a plain closed folder is its name, so a tab dragged
    // up past the separator lands below it first)
    if (closed?.hasAttribute("has-active")) {
      node = closed;
    } else {
      const host = node?.closest?.(FOLDER_SELECTOR);
      if (
        host &&
        host !== node &&
        (host.hasAttribute("collapsed") || host.collapsed) &&
        node.classList?.contains("tab-group-label-container") &&
        !host.contains(keepOpen)
      ) {
        node = host;
      }
    }
    return { node, closed };
  };

  const rowOf = (item, node, closed, index) => {
    const box = layoutTop(node);
    // (showing its open tab: the name's height, where a tab can go in above that one)
    const header = closed?.hasAttribute("has-active") && node === closed ? headerOf(closed) : null;
    const head = header ? layoutTop(header).height : 0;
    return {
      item,
      node,
      index,
      top: box.top,
      mid: box.top + box.height / 2,
      height: box.height,
      head: head > 0 && head < box.height - 4 ? head : 0,
      delta: 0,
    };
  };

  const layoutTop = (node) => {
    const box = window.windowUtils.getBoundsWithoutFlushing(node);
    return { top: box.top, height: box.height };
  };

  const place = (node, y, above) => {
    if (!node) {
      return;
    }
    node.style.setProperty("--zia-drag-y", `${Math.round(y)}px`);
    emptySlotFolderOf(node)?.style.setProperty("--zia-slot-y", `${Math.round(y)}px`);
    node.style.removeProperty("top");
    node.style.setProperty("transform", `translateY(${Math.round(y)}px)`, "important");
    node.style.setProperty("position", "relative", "important");
    node.style.setProperty("z-index", above ? "40" : "1", "important");
    if (above) {
      node.setAttribute("zia-dragging", "true");
      node.removeAttribute("zia-shift");
    } else {
      node.setAttribute("zia-shift", "true");
      node.removeAttribute("zia-dragging");
    }
    dragCore.moved.add(node);
  };

  const clearMoved = () => {
    for (const node of dragCore.moved) {
      clearNode(node);
    }
    dragCore.moved.clear();
  };

  const clearNode = (node) => {
    const emptySlotFolder = emptySlotFolderOf(node);
    if (emptySlotFolder) {
      emptySlotFolder.style.removeProperty("--zia-slot-y");
    }
    for (const name of ["top", "position", "z-index", "transform", "--zia-drag-y"]) {
      node.style.removeProperty(name);
    }
    node.removeAttribute("zia-dragging");
    node.removeAttribute("zia-shift");
  };

  // An empty folder's "Drag tabs here" slot is drawn on its tab container,
  // so it follows the folder's header when that moves aside.
  const emptySlotFolderOf = (node) =>
    node?.classList?.contains("tab-group-label-container") && node.parentElement?.hasAttribute("zia-empty")
      ? node.parentElement
      : null;

  const updateTarget = (visualMid) => {
    const { prev, next } = gapRows();
    const below = tabBelowSep();
    const same = (row) => !!row && rowBelowSep(row) === below;
    const roomTop = same(prev) ? prev.top + prev.delta + prev.height + Math.max(0, drag.pitch - drag.height) : null;
    const pf = same(prev) ? rowFolder(prev) : null;
    const nf = same(next) ? rowFolder(next) : null;
    const gap = { visualMid, prev, next, same, roomTop, pf, nf };
    gap.cut = folderCut(gap);
    const { folder, atEnd, first } = withClosedTop(gap, folderAt(gap));
    roomAtTop(first ? folder : null, first);

    const crosses = below === !!drag.tab.pinned;

    // A split is always Zia's to place: Zen won't take one across the separator, dropped
    // it outside a closed or empty folder, and went by what's under the pointer (at the
    // top of the list, below the first folder or back where it came from)
    // (and several selected tabs: Firefox placed them by its measure of the list, which the
    // drag had shifted, and two dragged a few rows down went to the end of it)
    const hand = !!(drag.folder || drag.split || folder || pf || (nf && isFolderStart(next, nf)) || crosses || drag.companions);
    // a tap going into or out of a folder (Zen's own are muted during a drag), not for
    // the one it's in as it starts
    if (drag.target && folder !== drag.target.folder) {
      tap();
    }
    drag.target = { folder, atEnd, first: !!first, prev, next, below, sameNext: same(next), roomTop, hand };
    setDropSlot(folder);
  };

  const gapRows = () => {
    let prev = null;
    let next = null;
    for (const row of drag.rows) {
      if (notARow(row)) {
        continue;
      }
      const above = row.index < drag.index ? !drag.shifted.has(row.node) : drag.shifted.has(row.node);
      if (above) {
        prev = row;
      } else if (!next) {
        next = row;
      }
    }
    return { prev, next };
  };

  const tabBelowSep = () => {
    if (drag.sepTop == null) {
      return false;
    }
    const startedBelow = drag.origin > drag.sepTop;
    return startedBelow ? !drag.sepDelta : !!drag.sepDelta;
  };

  const rowBelowSep = (row) => drag.sepTop != null && row.top > drag.sepTop;

  const rowFolder = (row) => {
    const node = row?.node;
    if (!node) {
      return null;
    }
    if (isFolderEl(node)) {
      return node;
    }
    if (node.classList?.contains("tab-group-label-container")) {
      return isFolderEl(node.parentElement) ? node.parentElement : null;
    }
    return node.parentElement?.closest?.(FOLDER_SELECTOR) || null;
  };

  const isFolderStart = (row, folder) => !!row && !!folder && (row.node === folder || row.node === headerOf(folder));

  const folderCut = ({ prev, next, same, roomTop, pf }) => {
    let cut = roomTop != null ? roomTop + drag.height / 2 - 2 : null;
    if (prev && same(prev)) {
      // the last folder before the separator: its room is a whole tab tall, not the sliver
      // down to the separator
      if (!same(next) && roomTop != null) {
        // Coming up past the separator, the tab lands below the last folder first and goes
        // in once its middle is a little way into the room (half: a band of a few pixels,
        // so it seemed to drop straight in; a third: so tall it seemed not to go in at all;
        // 4 tenths from below, where it counts as past the separator a fifth of the way in).
        // Leaving downward it stays in until its bottom meets the folder's (any earlier left
        // a tiny gap under the folder).
        const fromBelow = drag.sepTop != null && drag.origin > drag.sepTop;
        const inIt = drag.target?.folder === pf;
        cut = roomTop + drag.height * (fromBelow && !inIt ? 0.4 : 0.5);
      } else {
        const down = leaveDown(next, same);
        if (down != null) {
          cut = (leaveUp(prev) + down) / 2;
        }
      }
    }
    return cut;
  };

  const leaveUp = (row) =>
    row.index < drag.index ? row.top + row.height - 8 : row.top - 10;
  const leaveDown = (row, same) => {
    if (!row || !same(row)) {
      return drag.sepTop != null ? drag.sepTop + 2 : null;
    }
    return row.index > drag.index ? row.top + 8 : row.top + row.height + 10;
  };

  const folderAt = ({ visualMid, prev, next, same, pf, nf, cut }) => {
    let folder = null;
    let atEnd = false;
    if (pf && nf === pf && !isFolderStart(next, pf)) {
      folder = pf;
    } else if (pf && cut != null && visualMid < cut) {
      folder = pf;
      atEnd = true;
    } else if (nf && !isFolderStart(next, nf)) {
      folder = nf;
    }
    // Between two rows inside the same open folder: that folder, not the list (it went
    // full width though still inside)
    if (!folder && prev && next && same(prev) && same(next)) {
      folder = sharedFolder(prev, next);
    }
    // Out past the end of a folder inside another that ends there too: the outer one
    // takes it before the list (it went full width for a moment, still inside)
    if (!folder && pf && cut != null && visualMid >= cut) {
      const outer = pf.parentElement?.closest?.(FOLDER_SELECTOR);
      if (outer && !isCollapsed(outer) && outer.contains(prev.node) && !(next && outer.contains(next.node)) && !drag.moving.contains?.(outer)) {
        const down = same(next) ? leaveDown(next, same) : null;
        const outerCut = down != null && down > cut ? (cut + down) / 2 : cut + drag.height / 2;
        if (visualMid < outerCut) {
          folder = outer;
          atEnd = true;
        }
      }
    }
    return { folder, atEnd };
  };

  const sharedFolder = (prev, next) => {
    const holder = (node) => node?.parentElement?.closest?.(FOLDER_SELECTOR) || null;
    let common = holder(prev.node);
    while (common && !common.contains(next.node)) {
      common = holder(common);
    }
    return common && !isCollapsed(common) && !drag.moving.contains?.(common) && !(drag.folder && !canNest(drag.folder, common))
      ? common
      : null;
  };

  const withClosedTop = ({ visualMid, prev, next, same, pf }, picked) => {
    let { folder, atEnd } = picked;
    // Between a closed folder's name and the tab it shows: into it at the top (a tab only;
    // the shown tab moves down to make room, or the name up)
    let first = null;
    const shows = (row) => !!row?.head && isFolderEl(row.node) && isCollapsed(row.node) && same(row);
    if (!drag.folder) {
      if (folder === pf && shows(prev) && visualMid < prev.top + (prev.delta || 0) + prev.head + (prev.height - prev.head) / 2) {
        first = "down";
      } else if (!folder && shows(next) && !drag.shifted.has(next.node) && visualMid > next.top + (next.delta || 0) + next.head / 2) {
        folder = next.node;
        first = "up";
      }
      if (first) {
        atEnd = false;
      }
    }
    if (folder && drag.moving.contains?.(folder)) {
      folder = null;
      first = null;
    }
    // a folder goes into another only where Zen allows that deep
    if (drag.folder && folder && !canNest(drag.folder, folder)) {
      folder = null;
      atEnd = false;
    }
    return { folder, atEnd, first };
  };

  // Room for a tab going in at the top of a closed folder showing its open tab: that
  // tab moves down a tab's height or, coming from above, the folder's name moves up
  const roomAtTop = (folder, way) => {
    const key = folder ? `${way}` : null;
    if (topRoom?.folder === folder && topRoom?.key === key) {
      return;
    }
    if (topRoom) {
      topRoom.node.style.removeProperty("translate");
      topRoom = null;
    }
    if (!folder || !drag) {
      return;
    }
    const node = way === "up" ? headerOf(folder) : folder.querySelector(":scope > .tab-group-container");
    if (!node) {
      return;
    }
    node.style.setProperty("transition", `translate ${TOP_ROOM_MS / 1000}s ease`);
    node.style.setProperty("translate", `0 ${way === "up" ? -drag.pitch : drag.pitch}px`);
    topRoom = { folder, key, node };
  };

  const clearTopRoom = () => {
    if (!topRoom) {
      return;
    }
    const { node } = topRoom;
    topRoom = null;
    node.style.removeProperty("translate");
    // (left to run, not kept: it only drops an easing, on a node no longer moved)
    setTimeout(() => node.style.removeProperty("transition"), TOP_ROOM_CLEAR_MS);
  };

  const setDropSlot = (folder) => {
    if (!drag || drag.dropSlot === folder) {
      return;
    }
    drag.dropSlot?.removeAttribute("zia-drop-slot");
    drag.dropSlot = folder || null;
    folder?.setAttribute("zia-drop-slot", "true");
    // The folder it came from loses its highlight once it's dragged out (Firefox kept
    // it hovered until the mouse next moved, after the drop), and regains it coming back
    for (let home = drag.moving?.parentElement?.closest?.(FOLDER_SELECTOR); home; home = home.parentElement?.closest?.(FOLDER_SELECTOR)) {
      home.toggleAttribute("zia-left", !folder || (folder !== home && !home.contains(folder)));
    }
    // Over an empty folder the tab (or a split's box) covers its slot, so it wears the
    // slot's dashes instead (chrome.css), in the folder's colour.
    const tabs = drag.moving === drag.tab || (drag.split && drag.moving === drag.split) ? [drag.moving] : [];
    const into = !!folder?.hasAttribute("zia-empty");
    const border = into ? getComputedStyle(folder).getPropertyValue("--zia-slot-border") : "";
    for (const tab of tabs) {
      if (into) {
        tab.style.setProperty("--zia-slot-border", border);
      }
      tab.toggleAttribute("zia-into-empty", into);
    }
  };

  const notARow = (row) => row.node === drag.moving || (drag.folder && drag.folder.contains(row.node));

  const topLevel = (row) => (row.node.classList?.contains("tab-group-label-container") ? row.node.parentElement : row.node);

  const isFolderEl = (el) =>
    !!el && (el.localName === "zen-folder" || el.isZenFolder || (el.localName === "tab-group" && !el.hasAttribute("split-view-group")));
  const headerOf = (folder) => folder?.querySelector?.(":scope > .tab-group-label-container") || null;
  const isCollapsed = (folder) => !!folder && (folder.collapsed === true || folder.hasAttribute("collapsed"));

  // An open empty folder's slot takes a tab's room under its header without being a
  // row: its height (measured once per drag) counts toward the folder's size, and a
  // tab dragged in takes its place instead of more room.
  const emptySlotPitchOf = (folder) => {
    if (!drag || !folder?.hasAttribute?.("zia-empty") || isCollapsed(folder)) {
      return 0;
    }
    drag.emptySlotPitch ||= new Map();
    if (!drag.emptySlotPitch.has(folder)) {
      const container = folder.querySelector(":scope > .tab-group-container");
      drag.emptySlotPitch.set(folder, container ? window.windowUtils.getBoundsWithoutFlushing(container).height : 0);
    }
    return drag.emptySlotPitch.get(folder);
  };
  const emptySlotAfterHeader = (row) =>
    row?.node?.classList?.contains("tab-group-label-container") ? emptySlotPitchOf(row.node.parentElement) : 0;
