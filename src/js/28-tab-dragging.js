  function nodeToMove(element) {
    if (!element) {
      return null;
    }
    if (element.hasAttribute?.("split-view-group") || element.group?.hasAttribute?.("split-view-group")) {
      return element.group || element;
    }
    if (gBrowser.isTab(element)) {
      return element;
    }
    if (gBrowser.isTabGroupLabel?.(element)) {
      return element.closest(".tab-group-label-container") || element;
    }
    if (gBrowser.isTabGroup?.(element)) {
      return element.labelContainerElement || element;
    }
    return element;
  }

  function moveTabsLikeDia() {
    const moved = new Set();
    let blank = null;
    let drag = null;
    let pending = null;
    let raf = 0;
    let lastDy = 0;

    const blankImage = () => {
      if (!blank) {
        blank = document.createElement("div");
        blank.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
        document.documentElement.appendChild(blank);
      }
      return blank;
    };

    const setDragImage = DataTransfer.prototype.setDragImage;
    const updateDragImage = DataTransfer.prototype.updateDragImage;
    // What's dragged in the sidebar has Zia's own stand-in, so the system's
    // snapshot picture is blanked: a tab's, and while an essential is
    // dragged, anything (it showed as a blurred band the width of the
    // window, the whole essentials row in it).
    const isTabGhost = (node) =>
      !!(node?.querySelector?.("[drag-image]") || node?.hasAttribute?.("drag-image")) ||
      !!essentialDragging ||
      !!node?.closest?.("#zen-essentials, .zen-essentials-container") ||
      !!node?.querySelector?.(".tabbrowser-tab[zen-essential]");
    let essentialDragging = false;
    DataTransfer.prototype.setDragImage = function (node, x, y) {
      if (isTabGhost(node)) {
        return setDragImage.call(this, blankImage(), 0, 0);
      }
      return setDragImage.call(this, node, x, y);
    };
    DataTransfer.prototype.updateDragImage = function (node, x, y) {
      if (isTabGhost(node)) {
        return updateDragImage.call(this, blankImage(), 0, 0);
      }
      return updateDragImage.call(this, node, x, y);
    };

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

    const layoutTop = (node) => {
      const box = window.windowUtils.getBoundsWithoutFlushing(node);
      return { top: box.top, height: box.height };
    };

    const measureRows = (keepOpen = null) => {
      const rows = [];
      const seen = new Set();
      for (const item of gBrowser.tabContainer.ariaFocusableItems) {
        if (item.hasAttribute?.("zen-essential")) {
          continue;
        }
        // a split essential's own tabs are kept hidden in the list: not rows
        // (as rows of no height they came between a folder and the next row,
        // and no tab could be dropped into the folder)
        if (item.hasAttribute?.("zia-split-of") || item.group?.querySelector?.(":scope .tabbrowser-tab[zia-split-of]")) {
          continue;
        }
        let node = nodeToMove(item);
        // A closed folder is one row, the whole of it: its name and the tab
        // it shows, if any. (The tab it shows was a row of its own too, so
        // it moved aside twice, once with its folder and once more, and came
        // apart from it; the tabs it hides could be uncovered.)
        let closed = null;
        for (
          let host = node?.closest?.("zen-folder, tab-group:not([split-view-group])");
          host;
          host = host.parentElement?.closest?.("zen-folder, tab-group:not([split-view-group])")
        ) {
          if (host !== node && (host.hasAttribute("collapsed") || host.collapsed) && !host.contains(keepOpen)) {
            closed = host;
          }
        }
        // (only a folder showing a tab: a plain closed folder is its name,
        // as before, and a tab dragged up past the separator lands below
        // it first)
        if (closed?.hasAttribute("has-active")) {
          node = closed;
        } else {
          const host = node?.closest?.("zen-folder, tab-group:not([split-view-group])");
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
        if (!node || seen.has(node)) {
          continue;
        }
        seen.add(node);
        const box = layoutTop(node);
        // (a closed folder showing its open tab: its name's height, where a
        // tab can go in above the one it shows)
        const header = closed?.hasAttribute("has-active") && node === closed ? headerOf(closed) : null;
        const head = header ? layoutTop(header).height : 0;
        rows.push({
          item,
          node,
          index: rows.length,
          top: box.top,
          mid: box.top + box.height / 2,
          height: box.height,
          head: head > 0 && head < box.height - 4 ? head : 0,
          delta: 0,
        });
      }
      // Numbered by where they are in the sidebar, not Firefox's count of
      // tabs: that count can lag a move for a moment, and a tab dragged a
      // little then counted as above the folders it sat under, which all
      // moved up out of its way
      rows.sort((a, b) => (a.node === b.node ? 0 : a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      rows.forEach((row, i) => {
        row.index = i;
      });
      return rows;
    };

    // An empty folder's "Drag tabs here" slot is drawn on its tab container,
    // so it follows the folder's header when that moves aside.
    const slotFolderOf = (node) =>
      node?.classList?.contains("tab-group-label-container") && node.parentElement?.hasAttribute("zia-empty")
        ? node.parentElement
        : null;

    const clearNode = (node) => {
      const slotFolder = slotFolderOf(node);
      if (slotFolder) {
        slotFolder.style.removeProperty("--zia-slot-y");
      }
      node.style.removeProperty("top");
      node.style.removeProperty("position");
      node.style.removeProperty("z-index");
      node.style.removeProperty("transform");
      node.style.removeProperty("--zia-drag-y");
      node.removeAttribute("zia-dragging");
      node.removeAttribute("zia-shift");
    };

    const clearMoved = () => {
      for (const node of moved) {
        clearNode(node);
      }
      moved.clear();
    };

    const place = (node, y, above) => {
      if (!node) {
        return;
      }
      node.style.setProperty("--zia-drag-y", `${Math.round(y)}px`);
      slotFolderOf(node)?.style.setProperty("--zia-slot-y", `${Math.round(y)}px`);
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
      moved.add(node);
    };

    const isFolderEl = (el) =>
      !!el && (el.localName === "zen-folder" || el.isZenFolder || (el.localName === "tab-group" && !el.hasAttribute("split-view-group")));
    const headerOf = (folder) => folder?.querySelector?.(":scope > .tab-group-label-container") || null;
    const isCollapsed = (folder) => !!folder && (folder.collapsed === true || folder.hasAttribute("collapsed"));

    // An open empty folder's "Drag tabs here" slot takes a tab's room under its
    // header without being a row. Its height, measured once per drag (the
    // layout never changes mid-drag), counts toward the folder's size, and a
    // tab dragged into the folder takes its place instead of more room.
    const slotPitchOf = (folder) => {
      if (!drag || !folder?.hasAttribute?.("zia-empty") || isCollapsed(folder)) {
        return 0;
      }
      drag.slotPitch ||= new Map();
      if (!drag.slotPitch.has(folder)) {
        const container = folder.querySelector(":scope > .tab-group-container");
        drag.slotPitch.set(folder, container ? window.windowUtils.getBoundsWithoutFlushing(container).height : 0);
      }
      return drag.slotPitch.get(folder);
    };
    const slotAfterHeader = (row) =>
      row?.node?.classList?.contains("tab-group-label-container") ? slotPitchOf(row.node.parentElement) : 0;

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
      return node.parentElement?.closest?.("zen-folder, tab-group:not([split-view-group])") || null;
    };
    const isFolderStart = (row, folder) => !!row && !!folder && (row.node === folder || row.node === headerOf(folder));
    const notARow = (row) => row.node === drag.moving || (drag.folder && drag.folder.contains(row.node));
    const rowBelowSep = (row) => drag.sepTop != null && row.top > drag.sepTop;
    const tabBelowSep = () => {
      if (drag.sepTop == null) {
        return false;
      }
      const startedBelow = drag.origin > drag.sepTop;
      return startedBelow ? !drag.sepDelta : !!drag.sepDelta;
    };

    const topLevel = (row) => (row.node.classList?.contains("tab-group-label-container") ? row.node.parentElement : row.node);

    const setDropSlot = (folder) => {
      if (!drag || drag.slot === folder) {
        return;
      }

      drag.slot?.removeAttribute("zia-drop-slot");
      drag.slot = folder || null;
      folder?.setAttribute("zia-drop-slot", "true");
      // The folder it came from loses its highlight as soon as it's dragged
      // out (Firefox keeps it hovered until the mouse next moves, so it
      // lingered after the drop), and gets it back dragged into it again
      for (let home = drag.moving?.parentElement?.closest?.("zen-folder, tab-group:not([split-view-group])"); home; home = home.parentElement?.closest?.("zen-folder, tab-group:not([split-view-group])")) {
        home.toggleAttribute("zia-left", !folder || (folder !== home && !home.contains(folder)));
      }
      // Over an empty folder the tab covers its slot, so the tab carries the
      // slot's dashes instead (chrome.css), in the folder's colour.
      // (a split too: its box, round both its tabs, wears them)
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

    // The room for a tab going in at the top of a closed folder showing its
    // open tab: that tab (and the folder's contents) move down a tab's
    // height, or, coming from above, the folder's name moves up
    let topRoom = null;
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
      node.style.setProperty("transition", "translate 0.15s ease");
      node.style.setProperty("translate", `0 ${way === "up" ? -drag.pitch : drag.pitch}px`);
      topRoom = { folder, key, node };
    };

    const updateTarget = (visualMid) => {
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
      const below = tabBelowSep();
      const same = (row) => !!row && rowBelowSep(row) === below;
      const slotTop = same(prev) ? prev.top + prev.delta + prev.height + Math.max(0, drag.pitch - drag.height) : null;
      const pf = same(prev) ? rowFolder(prev) : null;
      const nf = same(next) ? rowFolder(next) : null;

      const leaveUp = (row) =>
        row.index < drag.index ? row.top + row.height - 8 : row.top - 10;
      const leaveDown = (row) => {
        if (!row || !same(row)) {
          return drag.sepTop != null ? drag.sepTop + 2 : null;
        }
        return row.index > drag.index ? row.top + 8 : row.top + row.height + 10;
      };
      let cut = slotTop != null ? slotTop + drag.height / 2 - 2 : null;
      if (prev && same(prev)) {
        // the last folder before the separator has no row after it: its
        // slot is a whole tab tall, not the sliver down to the separator
        if (!same(next) && slotTop != null) {
          // Coming up past the separator, the tab lands below the last
          // folder first, and goes in once its middle is a little way into
          // the slot that opens there. (Halfway left a band of a few
          // pixels, so it seemed to drop straight in; the top third left
          // one so tall it seemed not to go in at the folder's edge; only
          // over the folder's own end, it went in sitting over the folder's
          // name, with the room made for it empty below.)
          // (from below, it counts as past the separator a fifth of the way
          // into the space that opens, so there's a gap before this point;
          // lower, and it went in sitting over the folder's name)
          // Leaving it, going down, it stays in until its bottom meets the
          // folder's (the room made for it): at the same point it went in,
          // it left a little early, a tiny gap under the folder.
          const fromBelow = drag.sepTop != null && drag.origin > drag.sepTop;
          const inIt = drag.target?.folder === pf;
          cut = slotTop + drag.height * (fromBelow && !inIt ? 0.4 : 0.5);
        } else {
          const down = leaveDown(next);
          if (down != null) {
            cut = (leaveUp(prev) + down) / 2;
          }
        }
      }
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
      // Between two rows inside the same open folder (past a folder inside
      // it, before the next one's name, say): that folder, not the list
      // (it went full width, though it was still inside the folder)
      if (!folder && prev && next && same(prev) && same(next)) {
        const holder = (node) => node?.parentElement?.closest?.("zen-folder, tab-group:not([split-view-group])") || null;
        let common = holder(prev.node);
        while (common && !common.contains(next.node)) {
          common = holder(common);
        }
        if (common && !isCollapsed(common) && !drag.moving.contains?.(common) && !(drag.folder && !canNest(drag.folder, common))) {
          folder = common;
        }
      }
      // Out past the end of a folder inside another that ends there too:
      // the outer one takes it first, then the list (it went straight to
      // the list, full width for a moment, though still in the outer one)
      if (!folder && pf && cut != null && visualMid >= cut) {
        const outer = pf.parentElement?.closest?.("zen-folder, tab-group:not([split-view-group])");
        if (outer && !isCollapsed(outer) && outer.contains(prev.node) && !(next && outer.contains(next.node)) && !drag.moving.contains?.(outer)) {
          const down = same(next) ? leaveDown(next) : null;
          const outerCut = down != null && down > cut ? (cut + down) / 2 : cut + drag.height / 2;
          if (visualMid < outerCut) {
            folder = outer;
            atEnd = true;
          }
        }
      }
      // Between a closed folder's name and the tab it shows: into it, at
      // the top (a tab only; the one it shows moves down to make room, or
      // the name up)
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
      roomAtTop(first ? folder : null, first);

      const crosses = below === !!drag.tab.pinned;

      // A split is always Zia's to place: Zen won't take one across the
      // separator, dropped it outside a closed or empty folder, and went by
      // what's under the pointer (the room made for it), so at the top of
      // the list it went below the first folder or back where it came from
      const hand = drag.folder
        ? true
        : drag.split ? true : !!folder || !!pf || (!!nf && isFolderStart(next, nf)) || crosses;
      // A tap on going into a folder, open or closed, or out of one (Zen's
      // own taps are muted during a drag). Not for the one it's in as it
      // starts.
      if (drag.target && folder !== drag.target.folder) {
        tap();
      }
      drag.target = { folder, atEnd, first: !!first, prev, next, below, sameNext: same(next), slotTop, hand };
      setDropSlot(folder);
      // (zia.debug.drag in about:config: each decision, for a bug report)
      if (window.ziaDragDebug) {
        const name = (row) => (row ? `${row.node.localName}${row.node.label ? `"${row.node.label}"` : ""}@${Math.round(row.top + (row.delta || 0))}+${Math.round(row.height)}` : "-");
        const line = `mid=${Math.round(visualMid)} prev=${name(prev)} next=${name(next)} pf=${pf?.label || "-"} nf=${nf?.label || "-"} slotTop=${slotTop == null ? "-" : Math.round(slotTop)} cut=${cut == null ? "-" : Math.round(cut)} below=${below} sepTop=${drag.sepTop == null ? "-" : Math.round(drag.sepTop)} → ${folder ? `INTO "${folder.label}"${atEnd ? " atEnd" : ""}${first ? " first" : ""}` : "list"}`;
        if (window.ziaDragDebug.at(-1) !== line) {
          window.ziaDragDebug.push(line);
        }
      }
    };

    const paintedFolders = new Set();
    const paintFolders = () => {
      const target = drag.target;
      const folders = new Set();
      for (const row of drag.rows) {
        for (let f = rowFolder(row); f; f = f.parentElement?.closest?.("zen-folder, tab-group:not([split-view-group])")) {
          folders.add(f);
        }
      }
      for (const f of folders) {
        if (drag.folder && (f === drag.folder || drag.folder.contains(f))) {
          continue;
        }
        const into = !!target?.folder && (target.folder === f || f.contains(target.folder));
        let top = 0;
        let grow = 0;
        if (isCollapsed(f) && !f.contains(drag.moving)) {
          grow = into ? drag.pitch : 0;
          if (into && topRoom?.folder === f && topRoom.key === "up") {
            top = -drag.pitch;
            grow = 0;
          }
        } else {
          let origBottom = -Infinity;
          let shownBottom = -Infinity;
          let showsTab = false;
          for (const row of drag.rows) {
            if (row.node === f || !f.contains(row.node)) {
              continue;
            }
            const slot = slotAfterHeader(row);
            origBottom = Math.max(origBottom, row.top + row.height + slot);
            if (row.node === headerOf(f)) {
              top = row.delta || 0;
            }
            if (!notARow(row)) {
              const intoThisSlot = slot && into && target.folder === row.node.parentElement;
              shownBottom = Math.max(shownBottom, row.top + (row.delta || 0) + row.height + (intoThisSlot ? 0 : slot));
              showsTab ||= row.node !== headerOf(f);
            }
          }
          if (into && target.slotTop != null) {
            shownBottom = Math.max(shownBottom, target.slotTop + drag.height);
            showsTab = true;
          }
          if (Number.isFinite(origBottom) && Number.isFinite(shownBottom)) {
            grow = shownBottom - origBottom;
          }
          // Closed, its open tab dragged out of it, it loses the padding below
          // that tab too (chrome.css): the box closed up to the name less
          // that, and snapped the rest of the way on the drop
          if (isCollapsed(f) && !showsTab) {
            grow -= parseFloat(getComputedStyle(f).getPropertyValue("--zia-folder-inner-gap")) || 0;
          }
        }
        f.style.setProperty("--zia-drag-bg-top", `${Math.round(top)}px`);
        f.style.setProperty("--zia-drag-bg-grow", `${Math.round(grow)}px`);
        if (!f.hasAttribute("zia-bg-shift")) {
          f.setAttribute("zia-bg-shift", "true");
        }
        paintedFolders.add(f);
      }
    };

    const clearFolderPaint = () => {
      if (topRoom) {
        const { node } = topRoom;
        topRoom = null;
        node.style.removeProperty("translate");
        setTimeout(() => node.style.removeProperty("transition"), 200);
      }
      for (const f of paintedFolders) {
        f.removeAttribute("zia-bg-shift");
        f.style.removeProperty("--zia-drag-bg-top");
        f.style.removeProperty("--zia-drag-bg-grow");
      }
      paintedFolders.clear();
    };

    const FOLDER_TAB_INSET = { start: 14.5, end: 5 };
    const bgOf = (tab) => tab?.querySelector?.(":scope > .tab-stack > .tab-background");
    const contentOf = (tab) => tab?.querySelector?.(":scope > .tab-stack > .tab-content");
    const showing = (tab) => {
      if (tab?.visible === false || tab?.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) {
        return null;
      }
      const bg = bgOf(tab);
      const box = bg?.getBoundingClientRect();
      return box && box.width > 20 && box.height > 8 ? box : null;
    };
    const folderBox = (folder) => {
      const box = folder.getBoundingClientRect();
      const before = getComputedStyle(folder, "::before");
      return { left: box.left + (parseFloat(before.left) || 0), right: box.right - (parseFloat(before.right) || 0) };
    };
    const sampleTab = (inside) =>
      [...(inside?.tabs || gBrowser.visibleTabs)].find(
        (tab) => tab !== drag.tab && !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab") && showing(tab) &&
          (inside ? true : !tab.group || tab.group.hasAttribute("split-view-group") ? !inside : true)
      );
    const widthFor = (folder) => {
      if (folder) {
        const own = sampleTab(folder);
        if (own && own.group === folder) {
          const box = showing(own);
          return { left: box.left, right: box.right };
        }
        let inset = FOLDER_TAB_INSET;
        const other = [...gBrowser.visibleTabs].find(
          (tab) => tab !== drag.tab && tab.group && isFolderEl(tab.group) && !tab.group.group && showing(tab)
        );
        if (other) {
          const box = showing(other);
          const fb = folderBox(other.group);
          inset = { start: box.left - fb.left, end: fb.right - box.right };
        }
        const fb = folderBox(folder);
        return { left: fb.left + inset.start, right: fb.right - inset.end };
      }
      const plain = [...gBrowser.visibleTabs].find(
        (tab) => tab !== drag.tab && !tab.group && !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab") && showing(tab)
      );
      if (plain) {
        const box = showing(plain);
        return { left: box.left, right: box.right };
      }
      const anyFolder = document.querySelector("#tabbrowser-tabs zen-folder");
      return anyFolder ? folderBox(anyFolder) : null;
    };

    // A dragged folder narrows the same way over a folder it would go into,
    // to the width of the folders already inside one (its margins, eased)
    const morphFolderWidth = (into) => {
      const moving = drag.folder;
      const key = into || "plain";
      if (drag.widthKey === key) {
        return;
      }
      drag.widthKey = key;
      if (!drag.folderBase) {
        const style = getComputedStyle(moving);
        drag.folderBase = {
          box: folderBox(moving),
          start: parseFloat(style.marginInlineStart) || 0,
          end: parseFloat(style.marginInlineEnd) || 0,
        };
      }
      const base = drag.folderBase;
      // (back among the rows it started in, it's its own width again)
      const startedIn = moving.parentElement?.closest?.("zen-folder, tab-group:not([split-view-group])") || null;
      const want = into || startedIn ? widthFor(into) : null;
      let start = want ? want.left - base.box.left : 0;
      let end = want ? base.box.right - want.right : 0;
      if (Math.abs(start) > 60 || Math.abs(end) > 60) {
        start = 0;
        end = 0;
      }
      moving.setAttribute("zia-morph-folder", "true");
      // eased frame by frame (the drag's own rules turn transitions off)
      const from = drag.folderShown || { start: base.start, end: base.end };
      const to = { start: base.start + start, end: base.end + end };
      const began = performance.now();
      const id = (drag.folderMorphId = (drag.folderMorphId || 0) + 1);
      const draw = (at) => {
        moving.style.setProperty("margin-inline-start", `${at.start}px`, "important");
        moving.style.setProperty("margin-inline-end", `${at.end}px`, "important");
        if (drag) {
          drag.folderShown = at;
        }
      };
      const step = (now) => {
        if (!drag || drag.folder !== moving || drag.folderMorphId !== id || !moving.hasAttribute("zia-morph-folder")) {
          return;
        }
        const t = Math.min(1, (now - began) / 140);
        const k = 1 - Math.pow(1 - t, 3);
        draw({ start: from.start + (to.start - from.start) * k, end: from.end + (to.end - from.end) * k });
        if (t < 1) {
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
    };
    const unmorphFolder = (folder) => {
      if (!folder?.hasAttribute?.("zia-morph-folder")) {
        return;
      }
      folder.removeAttribute("zia-morph-folder");
      for (const name of ["margin-inline-start", "margin-inline-end"]) {
        folder.style.removeProperty(name);
      }
    };

    const morphWidth = (folder) => {
      if (drag.folder) {
        morphFolderWidth(folder);
        return;
      }
      const key = folder || "plain";
      // (out of a folder inside another into no folder waits a moment:
      // passing to the outer one, it counted as in none for a sliver of the
      // way and went full width in between. Out of any other folder it goes
      // at once, as it narrowed going in)
      if (key !== "plain" || drag.widthKey === "plain") {
        clearTimeout(drag.widthTimer);
        drag.widthTimer = 0;
      } else if (!drag.widthGo && drag.widthKey && drag.widthKey !== "plain" && drag.widthKey.parentElement?.closest?.("zen-folder, tab-group:not([split-view-group])")) {
        if (!drag.widthTimer) {
          const current = drag;
          drag.widthTimer = setTimeout(() => {
            if (drag !== current) {
              return;
            }
            drag.widthTimer = 0;
            drag.widthGo = true;
            morphWidth(null);
            drag.widthGo = false;
          }, 200);
        }
        return;
      }
      if (drag.widthKey === key || !drag.bg) {
        return;
      }
      drag.widthKey = key;
      const want = widthFor(folder);
      let start = want ? want.left - drag.bgBox.left : 0;
      let end = want ? drag.bgBox.right - want.right : 0;

      if (Math.abs(start) > 40 || Math.abs(end) > 40) {
        start = 0;
        end = 0;
      }

      const tab = drag.split || drag.tab;
      tab.style.setProperty("--zia-morph-bg-start", `${drag.bgBase.start + start}px`);
      tab.style.setProperty("--zia-morph-bg-end", `${drag.bgBase.end + end}px`);
      tab.style.setProperty("--zia-morph-content-start", `${drag.contentBase.start + start}px`);
      tab.style.setProperty("--zia-morph-content-end", `${drag.contentBase.end + end}px`);
      tab.setAttribute("zia-morph", "true");
    };

    // The narrower look a dragged row takes over a folder eases out to the
    // row's own width once it's dropped (both edges): let go at once, a row
    // whose own place differed from the look (the look is worked out from
    // the rows around it, and was out by a few pixels in an empty folder)
    // jumped, and a closed folder that gives the row its indent a moment
    // later showed it full width in between
    // Dropped, its narrower look (margins inside its row) goes straight to
    // the row's own, and the landing glide starts from there: the row itself
    // changes as it goes into a folder or out of one (the folder's indent),
    // and eased out while the glide moved the row the other way, the two
    // didn't cancel, so it bulged sideways and drifted back. Only a width
    // that differs from the one it was let go at eases, by its right edge.
    const settleDroppedWidth = (tab, width) => {
      const node = [tab, tab?.group?.hasAttribute?.("split-view-group") ? tab.group : null].find((n) => n?.hasAttribute?.("zia-morph"));
      if (!node) {
        return;
      }
      const split = node.localName === "tab-group";
      const box = split ? node.querySelector(":scope > .tab-group-container") : node.querySelector(".tab-background");
      const content = split ? null : node.querySelector(".tab-content");
      node.setAttribute("zia-morph-done", "true");
      node.removeAttribute("zia-morph");
      for (const name of ["--zia-morph-bg-start", "--zia-morph-bg-end", "--zia-morph-content-start", "--zia-morph-content-end"]) {
        node.style.removeProperty(name);
      }
      const own = box?.getBoundingClientRect();
      const off = own && width > 0 ? own.width - width : 0;
      if (Math.abs(off) >= 0.5 && Math.abs(off) < 60) {
        const bs = getComputedStyle(box);
        const cs = content ? getComputedStyle(content) : null;
        node.style.setProperty("--zia-morph-bg-start", bs.marginInlineStart);
        node.style.setProperty("--zia-morph-bg-end", `${(parseFloat(bs.marginInlineEnd) || 0) + off}px`);
        if (cs) {
          node.style.setProperty("--zia-morph-content-start", cs.marginInlineStart);
          node.style.setProperty("--zia-morph-content-end", `${(parseFloat(cs.marginInlineEnd) || 0) + off}px`);
        }
        node.setAttribute("zia-morph", "true");
        box.getBoundingClientRect();
        node.removeAttribute("zia-morph-done");
        easeOutWidth(tab);
        return;
      }
      box?.getBoundingClientRect();
      node.removeAttribute("zia-morph-done");
    };

    const easeOutWidth = (tab) => {
      for (const node of [tab, tab?.group?.hasAttribute?.("split-view-group") ? tab.group : null]) {
        if (!node?.hasAttribute?.("zia-morph")) {
          continue;
        }
        node.setAttribute("zia-morph-out", "true");
        node.removeAttribute("zia-morph");
        for (const name of ["--zia-morph-bg-start", "--zia-morph-bg-end", "--zia-morph-content-start", "--zia-morph-content-end"]) {
          node.style.removeProperty(name);
        }
        clearTimeout(node.ziaMorphOutTimer);
        node.ziaMorphOutTimer = setTimeout(() => node.removeAttribute("zia-morph-out"), 450);
      }
    };

    const unmorphWidth = (tab) => {
      for (const node of [tab, tab?.group?.hasAttribute("split-view-group") ? tab.group : null]) {
        if (!node?.hasAttribute("zia-morph")) {
          continue;
        }
        node.setAttribute("zia-morph-done", "true");
        node.removeAttribute("zia-morph");
        for (const name of ["--zia-morph-bg-start", "--zia-morph-bg-end", "--zia-morph-content-start", "--zia-morph-content-end"]) {
          node.style.removeProperty(name);
        }
        node.getBoundingClientRect();
        node.removeAttribute("zia-morph-done");
      }
    };

    const newTabButton = () =>
      window.gZenWorkspaces?.activeWorkspaceElement?.newTabButton ||
      document.querySelector("#tabs-newtab-button, #vertical-tabs-newtab-button");

    let lastTap = 0;
    // Zia's own tap. Only if haptics are on in Zen; while a drag has them
    // muted, they're let through for just this one.
    const tap = () => {
      const muted = hapticsWereOn !== null;
      if (muted ? !hapticsWereOn : !Services.prefs.getBoolPref(HAPTIC_PREF, true)) {
        return;
      }
      const now = Date.now();

      if (now - lastTap < 140) {
        return;
      }
      lastTap = now;
      try {
        if (muted) {
          Services.prefs.setBoolPref(HAPTIC_PREF, true);
        }
        zenHaptic?.();
      } catch (err) {
        noteError("tab dragging: tap", err);
      } finally {
        if (muted) {
          Services.prefs.setBoolPref(HAPTIC_PREF, false);
        }
      }
    };

    const placeSep = (sepDelta) => {
      const sep = currentSeparator();
      if (sep && drag.sepDelta !== sepDelta) {
        drag.sepDelta = sepDelta;
        drag.sepShownY = sepDelta;
        place(sep, sepDelta, false);

        const onTop = Services.prefs.getBoolPref("zen.view.show-newtab-button-top", false);
        const button = onTop ? newTabButton() : null;
        if (button) {
          place(button, sepDelta, false);
        }
      }
    };

    // A dragged folder whose height has changed since the list was measured
    // (it shut after the drag began): the list is measured again, or every
    // row would be moved by the old height and the drop land in the wrong
    // place.
    const remeasureFolderDrag = (folder) => {
      const strip = document.getElementById("tabbrowser-tabs");
      // measured where they sit, not partway through sliding back
      strip?.setAttribute("zia-measuring", "true");
      for (const row of drag.rows) {
        if (row.node !== folder && !folder.contains(row.node)) {
          place(row.node, 0, false);
          row.delta = 0;
          row.shownY = 0;
        }
      }
      placeSep(0);
      const kept = folder.style.getPropertyValue("transform");
      const keptPriority = folder.style.getPropertyPriority("transform");
      folder.style.removeProperty("transform");
      // (a real layout read first: the measuring below reads it unflushed)
      folder.getBoundingClientRect();
      const rows = measureRows(null);
      const box = layoutTop(folder);
      folder.style.setProperty("transform", kept, keptPriority);
      strip?.removeAttribute("zia-measuring");
      const mine = rows.find((row) => row.node === folder || folder.contains(row.node));
      const sep = currentSeparator();
      drag.rows = rows;
      drag.origin = box.top;
      drag.height = box.height;
      drag.pitch = box.height;
      drag.index = mine?.index ?? drag.index;
      drag.shifted = new Set();
      drag.sepTop = sep ? sep.getBoundingClientRect().top : null;
    };

    const apply = (dy) => {
      const moving = drag?.moving;
      if (!moving?.isConnected || !drag.rows) {
        return;
      }
      if (drag.folder && !drag.essentials && Math.abs(drag.folder.getBoundingClientRect().height - drag.height) > 3) {
        remeasureFolderDrag(drag.folder);
      }
      const visualMid = drag.origin + dy + drag.height / 2;
      place(moving, dy, true);

      // New Tab at the foot of the list, when the list closes up (only if the
      // row taken out was above it)
      const shiftNewTab = (by) => {
        if (Services.prefs.getBoolPref("zen.view.show-newtab-button-top", false)) {
          return;
        }
        const button = newTabButton();
        if (!button) {
          return;
        }
        drag.newTabTop ??= button.getBoundingClientRect().top;
        const want = by && drag.origin < drag.newTabTop ? by : 0;
        if ((drag.newTabShift || 0) !== want) {
          drag.newTabShift = want;
          place(button, want, false);
        }
      };
      // over the essentials (a tab or a split): the list closes up behind it
      if (drag.essentials || drag.splitEssential) {
        for (const row of drag.rows) {
          if (notARow(row)) {
            continue;
          }
          const gone = row.index > drag.index;
          if (gone) {
            drag.shifted.add(row.node);
          } else {
            drag.shifted.delete(row.node);
          }
          const delta = gone ? -drag.pitch : 0;
          if ((row.shownY ?? row.delta) !== delta) {
            row.delta = delta;
            row.shownY = delta;
            place(row.node, delta, false);
          }
        }
        if (drag.sepTop != null) {
          placeSep(drag.origin > drag.sepTop ? 0 : -drag.pitch);
        }
        // (New Tab under the list too: it stayed, leaving a gap above it
        // until the drop)
        shiftNewTab(-drag.pitch);
        drag.target = null;
        setDropSlot(null);
        takeEmptySlot();
        paintFolders();
        return;
      }

      shiftNewTab(0);
      let rowsMoved = false;
      for (const row of drag.rows) {
        if (notARow(row)) {
          continue;
        }
        const was = drag.shifted.has(row.node);
        let shift = false;
        // (a closed folder showing a tab moves aside only once the tab is
        // past its name: over the tab it shows, the tab goes in above it)
        if (row.index > drag.index) {
          shift = visualMid > row.top + (row.head || 0) + (was ? -10 : 8);
        } else if (row.index < drag.index) {
          shift = visualMid < row.top + (row.head || row.height) - (was ? -10 : 8);
        }
        if (shift) {
          drag.shifted.add(row.node);
        } else {
          drag.shifted.delete(row.node);
        }
        const delta = shift ? (row.index > drag.index ? -drag.pitch : drag.pitch) : 0;
        if (row.delta === delta) {
          continue;
        }
        row.delta = delta;
        row.shownY = delta;
        place(row.node, delta, false);
        rowsMoved = true;
      }
      if (drag.sepTop != null) {
        const startedBelow = drag.origin > drag.sepTop;
        let sepDelta = 0;
        // Coming up from below, it's over the separator once it's a fifth
        // of the way into the tab-sized space that opens (not halfway:
        // the gap below the last folder then comes before the tab goes in,
        // and it goes in still sitting in the space made for it)
        // Back down, it's back under just past that same point (a few
        // pixels' give, so it doesn't flicker): once a whole tab past, the
        // space it had left sat empty above it for a moment.
        const upTo = drag.sepTop + drag.pitch * 0.8 + (drag.sepDelta ? 4 : 0);
        if (startedBelow && visualMid < upTo) {
          sepDelta = drag.pitch;
        } else if (!startedBelow && visualMid > drag.sepTop + 2) {
          sepDelta = -drag.pitch;
        }
        // crossing the separator taps like a row moving does
        if (drag.sepDelta !== sepDelta && (drag.sepDelta || sepDelta)) {
          rowsMoved = true;
        }
        placeSep(sepDelta);
      }
      if (rowsMoved) {
        tap();
      }
      updateTarget(visualMid);
      takeEmptySlot();
      paintFolders();
      morphWidth(drag.target?.folder || null);
    };

    // Dropping into an open empty folder uses its slot as the tab's room, so
    // everything after the folder moves up by the slot's height on top of the
    // usual shift, and the slot itself fades (chrome.css).
    const takeEmptySlot = () => {
      const folder = drag.target?.folder;
      const pitch = slotPitchOf(folder);
      const headerRow = pitch ? drag.rows.find((row) => row.node === headerOf(folder)) : null;
      const after = (row) => !!headerRow && row.index > headerRow.index && !folder.contains(row.node);
      for (const row of drag.rows) {
        if (notARow(row)) {
          continue;
        }
        const want = (row.delta || 0) + (after(row) ? -pitch : 0);
        if ((row.shownY ?? row.delta ?? 0) !== want) {
          place(row.node, want, false);
        }
        row.shownY = want;
      }
      const sep = currentSeparator();
      if (sep && drag.sepTop != null) {
        const sepAfter = !!headerRow && drag.sepTop > headerRow.top;
        const want = (drag.sepDelta || 0) + (sepAfter ? -pitch : 0);
        if ((drag.sepShownY ?? drag.sepDelta ?? 0) !== want) {
          place(sep, want, false);
          const button = Services.prefs.getBoolPref("zen.view.show-newtab-button-top", false) ? newTabButton() : null;
          if (button) {
            place(button, want, false);
          }
        }
        drag.sepShownY = want;
      }
    };

    const pinFor = (tab, pinned) => {
      try {
        if (pinned && !tab.pinned) {
          gBrowser.pinTab(tab);
        } else if (!pinned && tab.pinned) {
          gBrowser.unpinTab(tab);
        }
      } catch (err) {
        noteError("tab dragging: pinFor", err);
      }
    };

    const placeBefore = (tab, before) => {
      if (!tab || !before?.parentNode || tab === before) {
        return;
      }
      try {
        if (typeof gBrowser.moveTabBefore === "function" && (gBrowser.isTab(before) || isFolderEl(before) || before.localName === "tab-group")) {
          gBrowser.moveTabBefore(tab, before);
        }
      } catch (err) {
        noteError("tab dragging: placeBefore", err);
      }
      if (tab.nextElementSibling !== before) {
        try {
          // (a tab only: a split's own group is the split itself)
          if (gBrowser.isTab(tab) && tab.group && !before.closest?.("tab-group")) {
            gBrowser.ungroupTab?.(tab);
          }
        } catch (err) {
          noteError("tab dragging: placeBefore (2)", err);
        }
        before.parentNode.insertBefore(tab, before);
      }
    };

    const placeAfter = (tab, after) => {
      try {
        gBrowser.moveTabAfter(tab, after);
      } catch (err) {
        noteError("tab dragging: placeAfter", err);
      }
      if (after.nextElementSibling !== tab) {
        after.after(tab);
      }
    };

    // A split let go in a folder: where it was shown (first, before the row
    // it was shown above, or last; beside the hidden tab Zen keeps in an
    // empty one), and a closed folder shuts on it again
    const splitIntoFolder = (split, folder, target) => {
      folder.removeAttribute("zia-drop-slot");
      const box = folder.querySelector(":scope > .tab-group-container");
      if (!box) {
        return;
      }
      const items = [...box.children].filter(
        (item) => item !== split && ((gBrowser.isTab(item) && !item.hasAttribute("zen-empty-tab")) || isFolderEl(item) || item.localName === "tab-group")
      );
      // (a closed folder is marked as showing a tab before the split goes in,
      // as for a tab: with the open tab in the split, Zen opened the folder)
      const shut = isCollapsed(folder);
      const selected = [...split.tabs].some((t) => t.selected);
      const hadActive = folder.hasAttribute("has-active");
      if (shut && !hadActive) {
        folder.setAttribute("has-active", "true");
        folder.activeTabs = [];
      }
      let next = !target.atEnd && !isCollapsed(folder) && target.next && folder.contains(target.next.node) ? target.next.node : null;
      while (next && next.parentElement !== box) {
        next = next.parentElement;
      }
      if (target.first && items.length) {
        next = items[0];
      }
      if (next && next !== split) {
        placeBefore(split, next);
      } else if (items.length) {
        placeAfter(split, items.at(-1));
      } else {
        const empty = box.querySelector(":scope > .tabbrowser-tab[zen-empty-tab]");
        if (empty) {
          placeAfter(split, empty);
        }
      }
      if (split.parentElement !== box) {
        box.appendChild(split);
      }
      if (!shut) {
        return;
      }
      if (!hadActive && !selected) {
        folder.removeAttribute("has-active");
        folder.activeTabs = [];
      }
      try {
        if (!isCollapsed(folder)) {
          folder.collapsed = true;
        } else if (selected) {
          const open = [...split.tabs].filter((t) => t.selected);
          if (!showOpenTabShut(folder, open)) {
            window.gZenFolders?.animateSelect?.(folder);
          }
        } else {
          window.gZenFolders?.on_TabGroupCollapse?.({ target: folder });
        }
      } catch (err) {
        noteError("tab dragging: split into a closed folder", err);
      }
      jumpToEnd(folder);
    };

    const finishDrop = (tab, target) => {
      if (!tab?.isConnected) {
        return;
      }
      // A split crossing the separator: both its tabs pinned (or not), then
      // the split as a whole goes to the spot
      const split = tab.group?.hasAttribute("split-view-group") ? tab.group : null;
      if (split) {
        for (const t of [...split.tabs]) {
          pinFor(t, !target.below);
        }
        const group = tab.group || split;
        const folder = target.folder?.isConnected && !split.contains(target.folder) ? target.folder : null;
        if (folder) {
          splitIntoFolder(split, folder, target);
          return;
        }
        if (target.next && target.sameNext) {
          placeBefore(group, topLevel(target.next));
        } else if (!target.below && currentSeparator()) {
          placeBefore(group, currentSeparator());
        } else {
          try {
            gBrowser.moveTabToEnd?.(group);
          } catch (err) {
            noteError("tab dragging: finishDrop (split)", err);
          }
        }
        return;
      }
      if (target.below && tab.group && !tab.group.hasAttribute("split-view-group")) {
        try {
          gBrowser.ungroupTab?.(tab);
        } catch (err) {
          noteError("tab dragging: finishDrop", err);
        }
      }
      pinFor(tab, !target.below);
      const folder = target.folder;
      if (folder && isCollapsed(folder)) {
        parkInFolder(tab, folder, target.first);
        return;
      }
      if (folder && target.atEnd) {
        const last = target.prev?.item;
        // (a tab of this folder's own: the row above can be in a folder
        // inside it, which the tab isn't going into)
        if (last && gBrowser.isTab(last) && last.group === folder) {
          placeAfter(tab, last);
        } else {
          folder.addTabs?.([tab]);
        }
        return;
      }
      if (target.next && target.sameNext) {
        placeBefore(tab, topLevel(target.next));
        return;
      }
      if (target.below) {
        try {
          gBrowser.moveTabToEnd?.(tab);
        } catch (err) {
          noteError("tab dragging: finishDrop (2)", err);
        }
        return;
      }
      if (!target.below) {
        const sep = currentSeparator();
        if (sep) {
          placeBefore(tab, sep);
        }
      }
    };

    // Zen drops a folder by what's under the pointer, which with the rows
    // slid about is often a closed folder it then nests it in. Straight
    // after, the folder is put where Zia showed it: among the rows, before
    // the one it was shown above, and never inside another folder.
    // Zen's own limit on how deep folders go
    const canNest = (folder, into) => {
      try {
        const inside = into.querySelector(":scope > .tab-group-container > .tabbrowser-tab") || into.labelElement || into;
        return window.gZenFolders?.canDropElement?.(folder, inside) ?? true;
      } catch (err) {
        return true;
      }
    };
    const outermostRow = (node) => {
      let row = topLevel({ node });
      for (let up = row.parentElement?.closest?.("zen-folder"); up; up = up.parentElement?.closest?.("zen-folder")) {
        row = up;
      }
      return row;
    };
    const finishFolderDrop = (folder, target) => {
      if (!folder?.isConnected || !target) {
        return;
      }
      const nestedIn = folder.parentElement?.closest?.("zen-folder") || null;
      const into = target.folder?.isConnected && target.folder !== folder && !folder.contains(target.folder) ? target.folder : null;
      if (into) {
        // Dropped where Zia showed it inside a folder: there, before the row
        // it was shown above (at the end, if none or the folder is closed)
        const box = into.querySelector(":scope > .tab-group-container");
        let next = !target.atEnd && !isCollapsed(into) && target.next && into.contains(target.next.node) ? target.next.node : null;
        while (next && next.parentElement !== box) {
          next = next.parentElement;
        }
        if (next && next !== folder) {
          placeBefore(folder, next);
        } else if (box) {
          const last = [...box.children].reverse().find((item) => item !== folder && (gBrowser.isTab(item) || isFolderEl(item)));
          if (last) {
            placeAfter(folder, last);
          }
          if (folder.parentElement !== box) {
            box.appendChild(folder);
          }
        }
        // a closed one keeps showing only its open tab
        if (isCollapsed(into)) {
          try {
            window.gZenFolders?.on_TabGroupCollapse?.({ target: into });
          } catch (err) {
            noteError("tab dragging: folder into a closed folder", err);
          }
          jumpToEnd(into);
        }
      } else {
        const next = target.next && target.sameNext && !target.below ? outermostRow(target.next.node) : null;
        if (next && next !== folder && !folder.contains(next)) {
          placeBefore(folder, next);
        } else if (currentSeparator()) {
          placeBefore(folder, currentSeparator());
        }
        if (folder.parentElement?.closest?.("zen-folder")) {
          console.warn("[Zia] The dropped folder is still inside another folder");
        }
      }
      // a closed folder it was taken back out of fits its new contents
      if (nestedIn && nestedIn !== folder.parentElement?.closest?.("zen-folder") && isCollapsed(nestedIn)) {
        try {
          window.gZenFolders?.on_TabGroupCollapse?.({ target: nestedIn });
        } catch (err) {
          noteError("tab dragging: refold folder", err);
        }
      }
    };

    // A folder's animations straight to their last moment (not past it:
    // Zen only leaves its end styles once they've finished)
    const jumpToEnd = (folder) => {
      for (const anim of folder.getAnimations?.({ subtree: true }) || []) {
        try {
          const end = anim.effect?.getComputedTiming?.().endTime;
          if (anim.id !== "zia-land" && end > 1) {
            anim.currentTime = end - 1;
          }
        } catch (err) {
          noteError("tab dragging: folder animations", err);
        }
      }
    };

    // A closed folder showing the open tab that's just gone in. Zen shows it
    // itself (animateSelect), except when every tab in the folder is the
    // open one: then it opens the folder, which flashed open and shut again.
    // Just then it's laid out as Zen lays out a closed folder showing its
    // open tab. Returns false when Zen's own way is fine.
    const showOpenTabShut = (folder, open) => {
      const zen = window.gZenFolders;
      const others = (folder.tabs || []).filter(
        (t) => !t.hasAttribute("zen-empty-tab") && !open.includes(t) && !(t.group?.hasAttribute?.("split-view-group") && open.some((o) => o.group === t.group))
      );
      if (others.length || !zen?.setFolderIndentation || folder.group) {
        return false;
      }
      folder.setAttribute("has-active", "true");
      folder.activeTabs = open;
      const container = folder.groupContainer || folder.querySelector(":scope > .tab-group-container");
      container?.removeAttribute("hidden");
      const start = folder.groupStartElement;
      if (start) {
        start.style.marginTop = "0px";
      }
      for (const tab of open) {
        zen.setFolderIndentation([tab], folder, true, false);
      }
      return true;
    };

    const parkInFolder = (tab, folder, first = false) => {
      folder?.removeAttribute("zia-drop-slot");
      if (!tab || !folder) {
        return;
      }
      if (!folder.contains(tab)) {
        const hadActive = folder.hasAttribute("has-active");
        if (!hadActive) {
          folder.setAttribute("has-active", "true");
          folder.activeTabs = [];
        }
        try {
          folder.addTabs?.([tab]);
        } catch (err) {
          console.error("[Zia] Could not add the tab to the folder:", err);
        }
        if (!hadActive && !tab.selected) {
          folder.removeAttribute("has-active");
          folder.activeTabs = [];
        }
      }
      // (let go between its name and the tab it shows: first in it)
      if (first) {
        const container = folder.querySelector(":scope > .tab-group-container");
        const head = [...(container?.children || [])].find(
          (el) => el !== tab && (gBrowser.isTab(el) || isFolderEl(el) || el.localName === "tab-group")
        );
        if (head) {
          placeBefore(tab, head);
        }
      }
      try {
        if (!isCollapsed(folder)) {
          folder.collapsed = true;
        } else if (tab.selected) {
          if (!showOpenTabShut(folder, [tab])) {
            window.gZenFolders?.animateSelect?.(folder);
          }
        } else {
          window.gZenFolders?.on_TabGroupCollapse?.({ target: folder });
        }
      } catch (err) {
        console.error("[Zia] Could not settle the folder:", err);
      }
      // Zen slides the folder's list down into place (it starts pushed up
      // out of sight), so the tab just dropped there blinked out and slid
      // in from above: it's where it landed already
      jumpToEnd(folder);
    };

    let proxy = null;
    let proxyLeaveTimer = 0;
    let landingTab = null;
    const PROXY_MS = 140;

    // The copies a drag shows are clones of the tab, so Zen can take one for
    // a real tab: taking an essential out of the essentials mid-drag, it moved
    // the copy into the list too, and after the drop put it back there (a
    // duplicate row where the tab was let go, until the next click). A copy
    // is live from when it's made until it's removed; one put back after
    // that is taken straight out again (see the watch after sweepLeftovers)
    const liveCopies = new WeakSet();
    // Once in the list, the copy was also in the browser's remembered list
    // of tabs, which a removal doesn't refresh: closing the selected tab
    // then picked the copy (no page behind it) to switch to, failed, and the
    // tab (or the window) wouldn't close until another tab was chosen
    const dropCopy = (node) => {
      liveCopies.delete(node);
      Element.prototype.remove.call(node);
      try {
        gBrowser.tabContainer._invalidateCachedTabs?.();
        gBrowser.tabContainer._invalidateCachedVisibleTabs?.();
      } catch (err) {
        noteError("tab dragging: forget the copy", err);
      }
    };
    const trackCopy = (node) => {
      liveCopies.add(node);
      node.remove = function () {
        dropCopy(this);
      };
      return node;
    };

    let roomFor = null;
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

    // A split tile's halves fill an essential's inner box but 8px all round,
    // and a stand-in isn't that box's size: its halves are given the real
    // ones' height (their width follows), centred, to match them exactly
    const fitSplitHalves = (node, stackHeight, half = null) => {
      if (half) {
        node.style.setProperty("--zia-split-half-height", `${half.height}px`);
        node.style.setProperty("--zia-split-half-width", `${half.width}px`);
      } else if (stackHeight > 16) {
        node.style.setProperty("--zia-split-half-height", `${stackHeight - 16}px`);
      }
    };

    // sized like the essential copy, and kept that way when Zen clears widths
    const sizeProxy = (node, width, height) => sizeCopy(node, width, height);

    const moveProxy = (x, y) => {
      const off = proxy.ziaOffset || { x: 0, y: 0 };
      proxy.style.setProperty("left", `${Math.round(x - off.x)}px`, "important");
      proxy.style.setProperty("top", `${Math.round(y - off.y)}px`, "important");
    };

    // A stand-in changing shape between a row and a tile (a split's, or any
    // essential's): what's in it is hidden while the box morphs, and shows
    // again once it's the new shape (an essential's icon stretched across a
    // row's width, or a split's icons slid about, looked broken)
    const fadeSplitContent = (node, ms) => {
      if (!node) {
        return;
      }
      node.querySelector(".tab-content")?.animate(
        [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }],
        { duration: Math.round(ms * 1.5), easing: "ease-out" }
      );
    };

    const showProxy = (x, y) => {
      clearTimeout(proxyLeaveTimer);
      if (!proxy) {
        const host = root;
        if (!host || !drag?.tab) {
          return;
        }
        proxy = trackCopy(drag.tab.cloneNode(true));
        proxy.removeAttribute("id");
        for (const name of [
          "zia-dragging", "zia-shift", "zia-drop-lock", "zia-to-essential", "multiselected", "dragtarget", "pending-drag",

          "zen-pinned-changed", "folder-active", "zen-folder-active",
        ]) {
          proxy.removeAttribute(name);
        }
        proxy.setAttribute("zen-essential", "true");
        proxy.setAttribute("pinned", "true");
        proxy.setAttribute("zia-essential-proxy", "true");
        proxy.id = "zia-essential-proxy";
        proxy.style.cssText = "";
        for (const [name, value] of [
          ["position", "fixed"],
          ["margin", "0"],
          ["z-index", "2147483646"],
          ["pointer-events", "none"],
          ["transform", "none"],
          ["translate", "-50% -50%"],
        ]) {
          proxy.style.setProperty(name, value, "important");
        }
        const row = drag.moving.getBoundingClientRect();
        sizeProxy(proxy, row.width, row.height);
        host.appendChild(proxy);
        if (drag.split) {
          // a split starts as its row (both sites, icon and title), and
          // morphs into its tile below
          dressSplitProxy(proxy, drag.tab);
          proxy.removeAttribute("zen-essential");
          proxy.removeAttribute("pinned");
        }
        try {
          window.gZenPinnedTabManager?.setEssentialTabIcon?.(proxy);
        } catch (err) {
          noteError("tab dragging: showProxy", err);
        }
        moveProxy(x, y);

        const box = proxy.getBoundingClientRect();
        proxy.ziaOffset = { x: box.left + box.width / 2 - x, y: box.top + box.height / 2 - y };
      }
      proxy.ziaLeaving = false;
      const props = ["width", "height", "min-width", "max-width", "min-height", "max-height"];
      proxy.style.setProperty("transition", props.map((name) => `${name} ${PROXY_MS}ms ease-out`).join(", "), "important");
      if (!drag.moving.hasAttribute("zia-to-essential")) {
        tap();
      }
      drag.moving.setAttribute("zia-to-essential", "true");
      const tile = tileSize();

      // (and back into a tile, headed back over the essentials)
      if (!proxy.hasAttribute("zen-essential")) {
        proxy.setAttribute("zen-essential", "true");
        proxy.setAttribute("pinned", "true");
        if (drag.split) {
          fitSplitHalves(proxy, tile.stackHeight, tile.half);
        }
        fadeSplitContent(proxy, PROXY_MS);
      }
      sizeProxy(proxy, tile.bgWidth || tile.width, tile.bgHeight || tile.height);
      moveProxy(x, y);
    };

    const hideProxy = () => {
      if (!proxy || proxy.ziaLeaving || !drag?.moving) {
        return;
      }
      proxy.ziaLeaving = true;
      const row = drag.moving.getBoundingClientRect();
      // (it goes back to its row, not a tile stretched to a row's size:
      // a tab as a split does)
      if (proxy.hasAttribute("zen-essential")) {
        const current = proxy.getBoundingClientRect();
        proxy.removeAttribute("zen-essential");
        proxy.removeAttribute("pinned");
        sizeProxy(proxy, current.width, current.height);
        proxy.getBoundingClientRect();
        fadeSplitContent(proxy, PROXY_MS);
      }
      proxy.style.setProperty("transition", `all ${PROXY_MS}ms ease-out`, "important");
      sizeProxy(proxy, row.width, row.height);
      moveProxy(row.left + row.width / 2, row.top + row.height / 2);
      const leaving = proxy;
      const moving = drag.moving;
      proxyLeaveTimer = setTimeout(() => {
        if (proxy === leaving && leaving.ziaLeaving) {
          leaving.remove();
          proxy = null;
          moving.removeAttribute("zia-to-essential");
        }
      }, PROXY_MS);
    };

    const landProxy = (tab) => {
      const tile = proxy;
      proxy = null;
      clearTimeout(proxyLeaveTimer);
      if (!tile) {
        return;
      }
      landingTab = tab;
      const done = () => {
        tile.remove();
        tab.removeAttribute("zia-to-essential");
        if (landingTab === tab) {
          landingTab = null;
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
      setTimeout(
        () =>
          whenEssential(() => {
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
            sizeProxy(tile, box.width, box.height);
            setTimeout(done, PROXY_MS + 20);
          }),
        0
      );
    };

    const fitZenSlot = () => fitSlot(gBrowser.tabContainer.tabDragAndDrop?._fakeEssentialTab);
    const fitSlot = (slot) => {
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

    // Zen opens a cell for a tab dragged over the essentials (a new row when
    // the last is full), but turns a split down there, so a split essential
    // on its way in had no room made for it: Zia opens the same cell
    let splitSlot = null;
    // (where the pointer is, as Zen's is: it was always at the end, so the
    // other tiles never moved aside. Over a tile, the cell goes to that
    // tile's side it's coming from, so it swaps places with it.)
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
        fitSlot(splitSlot);
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
      if (!tile) {
        return;
      }
      // (the tiles slide to their new places, as Zen's do for a tab, and it
      // taps: they jumped, silently)
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
        const slide = cell.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        slide.id = "zia-slot-slide";
      }
    };

    const dropProxy = () => {
      clearTimeout(proxyLeaveTimer);
      proxy?.remove();
      proxy = null;
      document.querySelectorAll("[zia-to-essential]").forEach((node) => {
        if (node !== landingTab) {
          node.removeAttribute("zia-to-essential");
        }
      });
    };

    const THUMB_MS = 150;
    let thumb = null;
    let thumbTimer = 0;

    const pictureSource = () => {
      const source = document.getElementById("zia-split-drag-picture");
      return source?.width ? source : null;
    };
    const pictureSize = () => {
      const source = pictureSource();
      const width = parseFloat(source?.style.width) || DRAG_PICTURE_W;
      const height = parseFloat(source?.style.height) || DRAG_PICTURE_H;
      return { width, height };
    };

    const fillThumb = () => {
      if (!thumb) {
        return;
      }
      const source = pictureSource();
      if (source) {
        let canvas = thumb.querySelector("canvas");
        if (!canvas) {
          canvas = document.createElementNS(XHTML_NS, "canvas");
          thumb.replaceChildren(canvas);
        }
        if (canvas.width !== source.width || canvas.height !== source.height) {
          canvas.width = source.width;
          canvas.height = source.height;
        }
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0);
        thumb.removeAttribute("zia-card");
      } else if (!thumb.firstChild && drag?.tab) {
        const icon = document.createElementNS(XHTML_NS, "img");
        icon.setAttribute("src", gBrowser.getIcon(drag.tab) || DEFAULT_TAB_ICON);
        thumb.replaceChildren(icon);
        thumb.setAttribute("zia-card", "true");
      }
    };

    const sizeThumb = (node, width, height) => {
      node.style.width = `${Math.round(width)}px`;
      node.style.height = `${Math.round(height)}px`;
    };

    const showThumb = (x, y) => {
      clearTimeout(thumbTimer);
      if (!thumb) {
        thumb = document.createElementNS(XHTML_NS, "div");
        thumb.id = "zia-drag-thumb";
        const row = (bgOf(drag.tab) || drag.moving).getBoundingClientRect();
        sizeThumb(thumb, row.width, row.height);
        thumb.style.left = `${Math.round(row.left + row.width / 2)}px`;
        thumb.style.top = `${Math.round(row.top + row.height / 2)}px`;
        root.appendChild(thumb);
        thumb.getBoundingClientRect();
      }
      fillThumb();
      thumb.removeAttribute("zia-leaving");
      const size = pictureSize();
      sizeThumb(thumb, size.width, size.height);
      thumb.style.left = `${Math.round(x)}px`;
      thumb.style.top = `${Math.round(y)}px`;
      if (!drag.moving.hasAttribute("zia-drag-away")) {
        tap();
      }
      drag.moving.setAttribute("zia-drag-away", "true");
    };

    const hideThumb = (instant = false) => {
      if (!thumb || thumb.hasAttribute("zia-leaving")) {
        return;
      }
      const leaving = thumb;
      const moving = drag?.moving;
      const done = () => {
        leaving.remove();
        if (thumb === leaving) {
          thumb = null;
        }
        moving?.removeAttribute("zia-drag-away");
      };
      if (instant || !moving?.isConnected) {
        done();
        return;
      }
      leaving.setAttribute("zia-leaving", "true");
      const row = (bgOf(drag.tab) || moving).getBoundingClientRect();
      sizeThumb(leaving, row.width, row.height);
      leaving.style.left = `${Math.round(row.left + row.width / 2)}px`;
      leaving.style.top = `${Math.round(row.top + row.height / 2)}px`;
      thumbTimer = setTimeout(done, THUMB_MS);
    };

    const noLanding = () => {
      const dnd = gBrowser.tabContainer.tabDragAndDrop;
      if (!dnd || dnd._landDragImageOnElements?.ziaQuiet) {
        return;
      }
      const original = dnd._landDragImageOnElements;
      const quiet = function (elements, ...rest) {
        try {
          for (const element of elements || []) {
            const { width, height } = element.getBoundingClientRect();
            this.ZenDragAndDropService.addDropLandingRect(
              Math.round(element.screenX),
              Math.round(element.screenY),
              Math.round(width),
              Math.round(height)
            );
          }
          this._landingElements = [];
        } catch (err) {
          return original?.call(this, elements, ...rest);
        }
        return undefined;
      };
      quiet.ziaQuiet = true;
      dnd._landDragImageOnElements = quiet;
    };

    // A closed folder whose one showing tab is dragged out of it is marked,
    // so the room it kept for that tab closes smoothly once the tab lands
    // (06-tab-animations: Zen's easing, not the spring, whose few-pixel
    // steps showed as a stutter on so short a distance)
    const lendOut = (row) => {
      const home = row?.parentElement?.closest?.("zen-folder");
      if (!home || !isCollapsed(home) || !home.hasAttribute("has-active")) {
        return;
      }
      const showing = (home.activeTabs || []).filter((t) => t?.isConnected);
      if (showing.some((t) => t !== row && !row.contains?.(t))) {
        return;
      }
      home.setAttribute("zia-lent", "true");
    };
    // As the tab leaves it, the folder's box is held where it ended through
    // the drag, then eased to its own height: its room went in one step (a
    // snap), and held by its whole height it showed more first (part of that
    // is hidden under its box's inset), opening a little before closing
    let lentHomes = [];
    const holdLent = () => {
      const homes = lentHomes;
      lentHomes = [];
      for (const home of homes) {
        let held = home.ziaHeldHeight;
        const boxBottom = home.ziaBoxBottom;
        const below = home.ziaBelow;
        home.ziaHeldHeight = home.ziaBoxBottom = home.ziaBelow = null;
        if (!home.isConnected || !(held > 0) || boxBottom == null) {
          continue;
        }
        // held so what's below stays where it was seen
        if (below?.node?.isConnected && !below.node.hasAttribute("zia-landing")) {
          const height = home.getBoundingClientRect().height;
          held = Math.max(0, height + below.top - below.node.getBoundingClientRect().top);
        }
        // its whole height (what's below stays put) and its box's bottom
        // where it was (the box doesn't grow): as the tab leaves, the
        // folder's padding and box inset change, and held by either alone,
        // the other moved (the box opening a little, or the folders below
        // snapping a few pixels)
        home.style.setProperty("height", `${held}px`, "important");
        const inset = home.getBoundingClientRect().top + held - boxBottom;
        home.style.setProperty("--zia-hold-inset", `${inset}px`);
        home.setAttribute("zia-holding", "true");
        setTimeout(() => {
          home.style.removeProperty("height");
          home.removeAttribute("zia-holding");
          home.style.removeProperty("--zia-hold-inset");
          if (!home.isConnected) {
            return;
          }
          // (closed and showing no tab, it ends as its name alone: Zen is
          // still shutting it then, its list with the padding and any folder
          // in it showing a few pixels more, so it eased open to that and
          // snapped back once Zen was done)
          const shut = isCollapsed(home) && !home.hasAttribute("has-active") && !home.querySelector(".tabbrowser-tab[selected]");
          const own = shut && headerOf(home) ? headerOf(home).getBoundingClientRect().height : home.getBoundingClientRect().height;
          const ownInset = parseFloat(getComputedStyle(home, "::before").bottom) || 0;
          const timing = { duration: 200, easing: "cubic-bezier(0.25, 1, 0.5, 1)" };
          if (shut) {
            // ...and it's held at that until Zen has shut its list (let go
            // sooner, it showed Zen's list part shut, a few pixels taller)
            const easing = home.animate([{ height: `${held}px` }, { height: `${own}px` }], { ...timing, fill: "forwards" });
            const until = performance.now() + 1000;
            const release = () => {
              const list = home.querySelector(":scope > .tab-group-container");
              const busy = home.getAnimations({ subtree: true }).some((a) => a !== easing && a.playState === "running");
              if (home.isConnected && performance.now() < until && (busy || (list && !list.hidden) || easing.playState === "running")) {
                requestAnimationFrame(release);
                return;
              }
              easing.cancel();
            };
            requestAnimationFrame(release);
          } else if (Math.abs(own - held) >= 0.5) {
            home.animate([{ height: `${held}px` }, { height: `${own}px` }], timing);
          }
          if (Math.abs(ownInset - inset) >= 0.5) {
            for (const pseudoElement of ["::before", "::after"]) {
              home.animate([{ bottom: `${inset}px` }, { bottom: `${ownInset}px` }], { ...timing, pseudoElement });
            }
          }
        }, 60);
      }
    };

    // What shows next below a folder (for holdLent: where it was seen)
    const shownAfter = (home) => {
      const strip = document.getElementById("tabbrowser-tabs");
      for (let at = home; at && at !== strip && strip?.contains(at); at = at.parentElement) {
        for (let next = at.nextElementSibling; next; next = next.nextElementSibling) {
          if (next.hasAttribute("zia-landing") || next.hasAttribute("zia-dragging")) {
            continue;
          }
          if (next.getBoundingClientRect().height > 0) {
            return next;
          }
        }
      }
      return null;
    };

    const unlend = () => {
      for (const home of document.querySelectorAll("zen-folder[zia-lent]")) {
        home.ziaLentUntil = Date.now() + 800;
        home.removeAttribute("zia-lent");
        // where its box ended through the drag (its visible bottom), for
        // holdLent once the tab has left it
        home.ziaBoxBottom = home.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(home, "::before").bottom) || 0);
        home.ziaHeldHeight = home.getBoundingClientRect().height;
        // and where what's below it was seen: the tab's room is still in
        // the folder here, but the rows around it were shifted to show it
        // gone, so held by its height, what's below dropped a row first
        const below = shownAfter(home);
        home.ziaBelow = below ? { node: below, top: below.getBoundingClientRect().top } : null;
        lentHomes.push(home);
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
        // (only between two rows side by side in the same list: a folder's
        // tabs sit the inner gap closer to its name than to each other, and
        // its padding lies between its last tab and whatever's below, so
        // either gap made the step short or long, and everything below
        // snapped the rest of the way on the drop)
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
        clientY: event.clientY || pending?.clientY || 0,
        screenY: event.screenY || pending?.screenY || 0,
      };
      lastDy = 0;
      lendOut(split || (folder ? null : target));
      for (const row of rows) {
        if (row.node === moving || (folder && folder.contains(row.node))) {
          continue;
        }
        place(row.node, 0, false);
      }
    };

    window.addEventListener(
      "mousedown",
      (event) => {
        if (event.button !== 0) {
          return;
        }
        const tab = tabFromEvent(event);
        pending = tab ? { tab, clientY: event.clientY, screenY: event.screenY } : null;
      },
      true
    );

    // An open folder is shut the moment it starts to be dragged (before the
    // drag itself begins, and without Zen's folding animation), and is
    // dragged and dropped as a closed folder. A plain click on it still just
    // closes it.
    let snapping = null;
    // Shut at once: Zen's folding animations jump to their last frame, so
    // the list has its closed layout straight away
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

    const onStart = (event) => {
      const tab = tabFromEvent(event);
      if (tab) {
        begin(tab, event);
        return;
      }
      const inSidebar = event.target?.closest?.("#navigator-toolbox, #tabbrowser-tabs");
      if (inSidebar && pending?.tab) {
        begin(pending.tab, event);
      }
    };
    window.addEventListener("dragstart", onStart, true);
    document.getElementById("tabbrowser-tabs")?.addEventListener("dragstart", onStart, true);

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

    const essentialsBottom = () => {
      let bottom = document.getElementById("zen-essentials")?.getBoundingClientRect().bottom ?? -Infinity;
      const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.() || document.querySelector(".zen-essentials-container");
      for (const tile of grid?.querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])") || []) {
        bottom = Math.max(bottom, tile.getBoundingClientRect().bottom);
      }
      return bottom;
    };

    // Over the essentials' tiles themselves (or just below the last row):
    // the essentials' own box stops a little short of the last row's
    // bottom, so a drag along it kept flipping into a list row.
    const overAnyTile = (point) => {
      const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.() || document.querySelector(".zen-essentials-container");
      if (!grid) {
        return false;
      }
      const box = grid.getBoundingClientRect();
      let bottom = box.bottom;
      for (const tile of grid.querySelectorAll(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])")) {
        bottom = Math.max(bottom, tile.getBoundingClientRect().bottom);
      }
      return box.width > 0 && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= bottom + 6;
    };

    let debugLast = "";
    const debugDrag = (event, point, sidebar, essentials) => {
      if (!Services.prefs.getBoolPref("zia.debug.drag", false)) {
        return;
      }
      const target = event.target;
      const name = (el) => (el ? `${el.localName}${el.id ? "#" + el.id : ""}` : "none");
      const box = (el) => {
        const b = el?.getBoundingClientRect?.();
        return b ? `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}` : "none";
      };
      const sep = currentSeparator();
      const line = `over ${name(target)} | away ${!!drag.away} | essentials ${!!drag.essentials} | can ${canBeEssential(drag.tab)} | tiles ${drag.hasTiles} | sep ${sep ? name(sep.parentElement) : "none"} ${drag.sepTop == null ? "-" : Math.round(drag.sepTop)} moved ${drag.sepDelta || 0}`;
      if (line !== debugLast) {
        debugLast = line;
        console.log(
          `[Zia drag] ${line} | firstTop ${drag.firstTop == null ? "-" : Math.round(drag.firstTop)} pitch ${Math.round(drag.pitch || 0)} | client ${event.clientX},${event.clientY} screen ${event.screenX},${event.screenY} point ${Math.round(point.x)},${Math.round(point.y)} | sidebar ${box(sidebar)} | essentials ${name(essentials)} ${box(essentials)} | proxy ${!!proxy}`
        );
      }
    };

    const onOver = (event) => {
      if (!drag?.moving?.isConnected) {
        return;
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
        const sidebar = document.getElementById("navigator-toolbox");

        const sideBox = sidebar?.getBoundingClientRect();
        drag.away =
          !drag.folder && !!point.x && !over?.closest?.("#navigator-toolbox") && !!sideBox?.width &&
          (point.x < sideBox.left || point.x > sideBox.right);

        if (drag.away) {
          debugDrag(event, point, sidebar, null);
          drag.essentials = false;
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
        const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.() || document.querySelector(".zen-essentials-container");
        const hasTiles = !!grid?.querySelector(".tabbrowser-tab[zen-essential]:not([zia-essential-proxy])");
        const promo = over?.closest?.("zen-essentials-promo") || null;

        let overEssentials = !!promo || !!over?.closest?.("#zen-essentials") || inBox(essentials, point);

        drag.firstTop = drag.rows?.length ? Math.min(...drag.rows.map((row) => row.top)) : null;
        if (!overEssentials && !hasTiles && drag.firstTop != null) {
          overEssentials = point.y < drag.firstTop + 4;
        }
        drag.hasTiles = hasTiles;
        debugDrag(event, point, sidebar, essentials);
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
        // (window.ziaDragDebug: how a dragged split looks, for a bug report)
        if (drag.split && Array.isArray(window.ziaDragDebug)) {
          const m = drag.moving;
          const look = (el) => {
            if (!el) {
              return "-";
            }
            const cs = getComputedStyle(el);
            const b = el.getBoundingClientRect();
            return `op=${cs.opacity} vis=${cs.visibility} disp=${cs.display} ${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}`;
          };
          const attrs = (el) => [...(el?.attributes || [])].map((a) => a.name).filter((n) => n.startsWith("zia") || ["movingtab", "dragtarget", "hidden", "collapsed"].includes(n)).join(",");
          const half = m?.querySelector?.(".tabbrowser-tab");
          const line = `split over=${overEssentials} splitEss=${drag.splitEssential} proxy=${proxy ? (proxy.ziaLeaving ? "leaving" : "on") : "none"} | group[${attrs(m)}] ${look(m)} | box ${look(m?.querySelector?.(":scope > .tab-group-container"))} | tab[${attrs(half)}] ${look(half)}`;
          if (window.ziaDragDebug.at(-1) !== line) {
            window.ziaDragDebug.push(line);
          }
        }
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
      const folder = target.node.closest?.("zen-folder, tab-group:not([split-view-group])");
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

    let essentialDrag = null;
    let essentialDropped = null;
    const ESSENTIAL_MS = 140;

    // Zen clears the size and place of every essential when a drop lands:
    // a floating copy with none stretches across the window and falls to
    // its bottom. Whatever of those it loses, it gets straight back.
    const PLACEMENT = [
      "position", "left", "top", "translate", "transform", "margin", "z-index",
      "width", "height", "min-width", "max-width", "min-height", "max-height",
    ];
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
            (box) => !box.closest("zen-folder, tab-group:not([split-view-group])") && box.getBoundingClientRect().height > 8
          );
      const bg = (sample?.querySelector(".tab-background") || splitBox)?.getBoundingClientRect();
      if (bg?.width) {
        return { width: bg.width, height: bg.height };
      }
      const sidebar = document.getElementById("navigator-toolbox")?.getBoundingClientRect();
      return { width: (sidebar?.width || 240) - 16, height: 35 };
    };

    const sweepLeftovers = () => {
      const keep = new Set([essentialDrag?.copy, proxy].filter(Boolean));
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
          if (tab !== landingTab) {
            tab.removeAttribute("zia-to-essential");
          }
        }
      }
    };
    window.addEventListener("mousedown", () => {
      if (!drag && !essentialDrag) {
        sweepLeftovers();
      }
    }, true);
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1 && node.hasAttribute("zia-essential-proxy") && !liveCopies.has(node)) {
            dropCopy(node);
          }
        }
      }
    }).observe(document.getElementById("navigator-toolbox") || document.documentElement, { childList: true, subtree: true });

    window.addEventListener("mousemove", (event) => {
      if (essentialDrag && event.buttons === 0 && Date.now() - (essentialDrag.startedAt || 0) > 300) {
        endEssentialDrag();
      }
    }, true);

    const onEssentialStart = (event) => {
      const tab = event.target?.closest?.(".tabbrowser-tab[zen-essential]");
      if (!tab || tab.hasAttribute("zia-essential-proxy") || !featureOn("dia-tab-drag")) {
        return;
      }
      essentialDragging = true;
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
      const copy = trackCopy(tab.cloneNode(true));
      copy.removeAttribute("id");
      // (and what a drop just before left on the tile: a lock that pins
      // position, so the copy stuck where it started and the drag was
      // trapped)
      for (const name of [
        "dragtarget", "pending-drag", "multiselected", "zen-pinned-changed",
        "zia-drop-lock", "zia-landing", "zia-hover-held", "zia-held-pinned", "zia-shift", "zia-dragging",
      ]) {
        copy.removeAttribute(name);
      }
      copy.setAttribute("zia-essential-proxy", "true");
      copy.style.cssText = "";
      for (const [name, value] of [
        ["position", "fixed"],
        ["margin", "0"],
        ["z-index", "2147483646"],
        ["pointer-events", "none"],
        ["transform", "none"],
        ["translate", "-50% -50%"],
      ]) {
        copy.style.setProperty(name, value, "important");
      }
      sizeCopy(copy, tile.width, drawn.height);
      fitSplitHalves(copy, 0, tab.querySelector(".zia-split-half")?.getBoundingClientRect() || null);
      const point = pointerOf(event);
      copy.style.setProperty("left", `${Math.round(tile.left + tile.width / 2)}px`, "important");
      copy.style.setProperty("top", `${Math.round(drawn.top + drawn.height / 2)}px`, "important");
      root.appendChild(copy);
      try {
        window.gZenPinnedTabManager?.setEssentialTabIcon?.(copy);
      } catch (err) {
        noteError("tab dragging: onEssentialStart", err);
      }
      dressSplitCopy(copy, tab);
      tab.setAttribute("zia-essential-dragged", "true");
      noLanding();

      muteZenHaptics(true);
      // The drag starts on its own tile (which tileUnder skips), so the very
      // first neighbour it moves onto taps too.
      lastTileUnder = tab;
      lastTapPoint = null;
      essentialDrag = {
        tab,
        copy,
        tile: { width: tile.width, height: drawn.height },
        offset: { x: point.x - (tile.left + tile.width / 2), y: point.y - (drawn.top + drawn.height / 2) },
        asTab: false,
        startedAt: Date.now(),
      };
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

    // A tab over the essentials taps as Zen moves the tiles aside for it,
    // as a split does when its cell moves: by the tile under the pointer
    // it tapped crossing tiles that didn't move, and missed some that did
    const tapOnTileShift = () => {
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

    const OVER_GAP = {};
    let lastTileUnder = null;
    let lastTapPoint = null;
    let lastTapAt = 0;
    const tapOnNewTile = (point, skip) => {
      const tile = tileUnder(point, skip);
      if (tile && tile !== lastTileUnder && lastTileUnder !== null) {
        const box = tile.getBoundingClientRect();
        // Half a tile on from the last tap, or long enough after it: so
        // jitter on a tile's edge doesn't tap twice, but changing your mind
        // and heading back over the same edge does.
        const far =
          !lastTapPoint ||
          Math.abs(point.x - lastTapPoint.x) >= box.width / 2 ||
          Math.abs(point.y - lastTapPoint.y) >= box.height / 2 ||
          Date.now() - lastTapAt > 300;
        if (far) {
          tap();
          lastTapPoint = { x: point.x, y: point.y };
          lastTapAt = Date.now();
        }
      }
      if (tile) {
        lastTileUnder = tile;
        lastTapPoint ||= { x: point.x, y: point.y };
      } else if (skip && inBox(window.gZenWorkspaces?.getCurrentEssentialsContainer?.(), point)) {
        // Over the essentials but on no tile: the gap opened for the drop, or
        // the dragged essential's own spot. Whatever tile comes next is a new
        // one, so changing your mind and moving back onto the tile that just
        // slid aside taps again.
        lastTileUnder = OVER_GAP;
      }
    };

    const listRoom = { rows: null, pitch: 0, sep: null, sepTop: null, sepDelta: 0, first: undefined, folder: null };

    // An essential dragged into the list goes into a folder as a tab does:
    // over a closed folder (its end), between the tabs of an open one, or
    // over an open empty one's slot
    const listRoomFolder = (prev, first, y) => {
      if (!prev) {
        return null;
      }
      if (isFolderEl(prev.node) && isCollapsed(prev.node)) {
        return y < prev.top + prev.height ? prev.node : null;
      }
      const label = prev.node.classList?.contains("tab-group-label-container");
      const folder = label ? prev.node.parentElement : prev.node.parentElement?.closest?.("zen-folder, tab-group:not([split-view-group])");
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
    const shapeListRoom = (y) => {
      if (!listRoom.rows) {
        openListRoom();
      }
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
        const delta = listRoom.sepTop != null && listRoom.sepTop > y ? listRoom.pitch : 0;
        if (listRoom.sepDelta !== delta) {
          listRoom.sepDelta = delta;
          place(listRoom.sep, delta, false);
        }
      }
      if (listRoom.button && listRoom.buttonBottom != null) {
        const delta = listRoom.buttonBottom > y ? listRoom.pitch : 0;
        if (listRoom.buttonDelta !== delta) {
          listRoom.buttonDelta = delta;
          place(listRoom.button, delta, false);
        }
      }
      if (first !== listRoom.first) {
        if (listRoom.first !== undefined) {
          tap();
        }
        listRoom.first = first;
      }
      markListRoomFolder(listRoomFolder(prev, first, y));
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
      listRoom.rows = null;
      listRoom.first = undefined;
    };

    const dropIntoListRoom = (tab, y) => {
      const first = listRoom.first || null;
      const sep = listRoom.sep;
      const sepTop = listRoom.sepTop;
      const below = sepTop != null && y > sepTop;
      const folder = listRoom.folder?.isConnected ? listRoom.folder : null;
      markListRoomFolder(null);
      listRoom.rows = null;
      listRoom.first = undefined;
      // Zen takes the tab out of the essentials in its own time after the
      // drop: it's placed once that's happened (or Zia does it, if Zen
      // hasn't within a second), else Zen's own placing (the end of the
      // list, below the separator) was what stuck
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

      // It lands under the pointer, which the browser doesn't see until it
      // next moves: so its x (or -) is kept on, as for a dropped tab, not
      // missing until then (nothing under the pointer at the drop counts:
      // the tab wasn't there yet)
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

    const onEssentialOver = (event) => {
      const state = essentialDrag;
      if (!state?.copy?.isConnected) {
        return;
      }
      const point = pointerOf(event);
      if (!point.x && !point.y) {
        return;
      }
      tapOnNewTile(point, state.tab);
      const essentials = document.getElementById("zen-essentials");
      const overTiles = !!event.target?.closest?.("#zen-essentials") || inBox(essentials, point) || overAnyTile(point);
      // a row only once the pointer is below the essentials altogether, so
      // a drag along their last row stays a tile
      // (the essentials' bottom as the drag began: out over the list, its
      // cell goes and the grid can lose a row, and measured afresh the line
      // moved up past the pointer and back, so it flipped between tile and
      // row, the others closing up and opening again)
      state.bottom ??= essentialsBottom();
      const asTab = !overTiles && inBox(document.getElementById("navigator-toolbox"), point) && point.y > state.bottom + 8;
      const copy = state.copy;
      if (asTab !== state.asTab) {
        state.asTab = asTab;
        copy.style.setProperty(
          "transition",
          ["width", "height", "min-width", "max-width", "min-height", "max-height"]
            .map((name) => `${name} ${ESSENTIAL_MS}ms ease-out`)
            .join(", "),
          "important"
        );
        // (the other essentials close up behind it once it's out over the
        // list, sliding, and open again if it comes back: it left a gap)
        slideTiles(() => state.tab.toggleAttribute("zia-essential-out", asTab));
        if (asTab) {
          const current = copy.getBoundingClientRect();
          moveCopyTo(copy, document.getElementById("tabbrowser-tabs") || root);
          sizeCopy(copy, current.width, current.height);
          copy.getBoundingClientRect();
          copy.removeAttribute("zen-essential");
          copy.removeAttribute("pinned");
          fadeSplitContent(copy, ESSENTIAL_MS);
          const size = plainTabSize();
          sizeCopy(copy, size.width, size.height);
        } else {
          const current = copy.getBoundingClientRect();
          moveCopyTo(copy, root);
          sizeCopy(copy, current.width, current.height);
          copy.getBoundingClientRect();
          copy.setAttribute("zen-essential", "true");
          copy.setAttribute("pinned", "true");
          fadeSplitContent(copy, ESSENTIAL_MS);
          sizeCopy(copy, state.tile.width, state.tile.height);
        }

        state.offset = asTab ? { x: 0, y: 0 } : state.offset;
      }
      if (asTab) {
        shapeListRoom(point.y);
      } else {
        closeListRoom();
      }
      const x = asTab
        ? (document.getElementById("navigator-toolbox")?.getBoundingClientRect().left || 0) + 8 + plainTabSize().width / 2
        : point.x - state.offset.x;
      const shift = copy.ziaHostShift || { x: 0, y: 0 };
      copy.style.setProperty("left", `${Math.round(x - shift.x)}px`, "important");
      // (as a row, never over the essentials: turned into a row just below
      // them, it's centred on the pointer, and its top half showed over them)
      const y = asTab ? Math.max(point.y, essentialsBottom() + plainTabSize().height / 2 + 2) : point.y - state.offset.y;
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
        const ms = LAND_MS;
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
          const t = Math.min(1, (performance.now() - began) / ms);
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

    window.addEventListener("dragstart", onEssentialStart, true);
    window.addEventListener("dragover", onEssentialOver, true);
    window.addEventListener("drop", endEssentialDrag, true);
    window.addEventListener("dragend", endEssentialDrag, true);

    window.addEventListener("dragover", onOver, true);
    document.getElementById("tabbrowser-tabs")?.addEventListener("dragover", onOver, true);
    window.addEventListener("dragover", fixDrop);
    // Firefox moves the dragged tab too, after Zia, and stops it at the last
    // tab: under the list (past New Tab) its move won, so the tab stopped
    // there while Zen's drag picture of it went on with the pointer, two of
    // it showing. Zia's move is put back once Firefox has had its go.
    window.addEventListener("dragover", () => {
      const moving = drag?.moving;
      if (!moving?.isConnected || drag.away || drag.essentials || drag.splitEssential) {
        return;
      }
      if (moving.style.getPropertyPriority("transform") !== "important") {
        place(moving, lastDy, true);
      }
    });

    window.addEventListener(
      "drop",
      (event) => {
        const tab = drag?.tab;
        heldFolder = null;
        heldPinned = null;

        if (tab && drag.splitEssential) {
          event.preventDefault();
          event.stopPropagation();
          let essential = null;
          // (it goes where the cell was opened for it)
          const before = splitSlot?.isConnected ? splitSlot.nextElementSibling : null;
          try {
            essential = addSplitToEssentials(tab);
            if (essential && before?.hasAttribute?.("zen-essential") && before !== essential) {
              gBrowser.moveTabBefore(essential, before);
            }
          } catch (err) {
            console.error("[Zia] Could not make a split essential:", err);
          }
          if (essential) {
            // hidden where it lands until the tile flying to it gets there
            essential.setAttribute("zia-to-essential", "true");
            landProxy(essential);
          } else {
            hideProxy();
          }
          return;
        }
        if (tab && !drag.essentials && !drag.folder && !drag.split) {
          const point = pointerOf(event);
          const over = event.target;
          if (
            over?.closest?.("#zen-essentials, .zen-essentials-container") ||
            inBox(document.getElementById("zen-essentials"), point) ||
            inBox(window.gZenWorkspaces?.getCurrentEssentialsContainer?.(), point)
          ) {
            drag.essentials = true;
            drag.target = null;
          }
        }
        if (tab && drag.essentials) {
          if (drag.noTiles) {
            setTimeout(() => {
              try {
                window.gZenPinnedTabManager?.addToEssentials?.(tab);
              } catch (err) {
                console.error("[Zia] Could not add the first essential:", err);
              }
            }, 0);
          }
          landProxy(tab);
        } else if (drag?.folder && !drag.away && drag.target) {
          const folder = drag.folder;
          const target = drag.target;
          pendingFinish = true;
          setTimeout(() => {
            try {
              finishFolderDrop(folder, target);
            } catch (err) {
              console.error("[Zia] Folder drop failed:", err);
            }
            pendingFinish = false;
          }, 0);
        } else if (tab && !drag.folder && !drag.away && drag.target?.hand) {
          const target = drag.target;
          // Zia places it, so Zen's own drop doesn't run: told to drop it
          // where it already was, Zen still took a tab in a closed folder
          // out of it, and it showed in the list for a frame before Zia put
          // it back (the favicon flashing left of where it lands)
          if (!tab.multiselected) {
            event.preventDefault();
            event.stopPropagation();
          }
          heldFolder = target.folder || null;
          heldPinned = !target.below;
          pendingFinish = true;
          // Put in place as the drop settles, in the same step (see settle):
          // left for a moment after, the room made for it in a folder had
          // closed and it showed outside the folder, full width, for a frame
          // or two (it waited for Zen's drop, which doesn't run for these)
          const run = () => {
            try {
              finishDrop(tab, target);
              // (its width put right as it moves: the row's new width showed
              // first otherwise, 14px narrower)
              refitLanding?.();
              repinLanding?.();
              refitHeld?.();
            } catch (err) {
              console.error("[Zia] Tab drop failed:", err);
            }
            pendingFinish = false;
          };
          finishNow = run;
          setTimeout(() => {
            if (finishNow === run) {
              finishNow = null;
              run();
            }
          }, 0);
        }
        const dnd = gBrowser.tabContainer.tabDragAndDrop;
        if (dnd) {
          dnd._dontAnimateTabMove = true;
        }
      },
      true
    );
    let lockTimer = 0;
    let blockAnimUntil = 0;
    const ui = window.gZenUIManager;
    if (ui?.elementAnimate && !ui.elementAnimate.ziaTabLock) {
      const originalAnimate = ui.elementAnimate.bind(ui);
      const wrappedAnimate = function (ele, ...args) {
        if (Date.now() < blockAnimUntil && ele?.closest?.("#tabbrowser-tabs")) {
          ele.style.removeProperty("transform");
          return Promise.resolve();
        }
        return originalAnimate(ele, ...args);
      };
      wrappedAnimate.ziaTabLock = true;
      ui.elementAnimate = wrappedAnimate;
    }
    const MOVEMENT = new Set(["transform", "translate"]);
    const movesOnly = (anim) => {
      try {
        const frames = anim.effect?.getKeyframes?.() || [];
        const props = new Set();
        for (const frame of frames) {
          for (const key of Object.keys(frame)) {
            if (!["offset", "computedOffset", "easing", "composite"].includes(key)) {
              props.add(key);
            }
          }
        }
        return props.size > 0 && [...props].every((prop) => MOVEMENT.has(prop));
      } catch (err) {
        return false;
      }
    };

    const unclipped = [];
    const unclipAround = (node) => {
      const stop = document.getElementById("navigator-toolbox");
      const remember = (el, props) => {
        unclipped.push([el, props.map((prop) => [prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)])]);
      };
      const lift = (el) => {
        const style = getComputedStyle(el);
        const clips =
          ["hidden", "auto", "scroll", "clip"].includes(style.overflowY) || /paint|strict|content/.test(style.contain);
        const scrolls = el.scrollTop > 0 || el.scrollHeight > el.clientHeight + 1;
        if (!clips || scrolls) {
          return;
        }
        remember(el, ["overflow", "overflow-x", "overflow-y", "contain"]);
        el.style.setProperty("overflow", "visible", "important");
        el.style.setProperty("overflow-x", "visible", "important");
        el.style.setProperty("overflow-y", "visible", "important");
        el.style.setProperty("contain", "none", "important");
      };
      let el = node?.parentNode;
      while (el && el !== stop && el !== document.documentElement) {
        if (el.nodeType === 1) {
          lift(el);
          const inner = el.shadowRoot?.querySelector?.('[part~="scrollbox"]');
          if (inner) {
            lift(inner);
          }
        }
        el = el.parentNode || el.host;
      }
    };
    const reclip = () => {
      while (unclipped.length) {
        const [el, props] = unclipped.pop();
        for (const [prop, value, priority] of props) {
          if (value) {
            el.style.setProperty(prop, value, priority);
          } else {
            el.style.removeProperty(prop);
          }
        }
      }
    };

    // What's just dropped (a folder or a tab) keeps its hover look (box, ×)
    // until the pointer really leaves it: the drag's own look ends a frame
    // before the browser sees the pointer is still over it, and the box and
    // × blinked off and on in between.
    // Firefox forgets what's under the pointer after a drop until it next
    // moves, and Zen shows a row's x and - only while it's hovered: so the
    // ones showing as it's let go are noted, and kept on while settling
    let shownAtDrop = { row: null, buttons: [] };
    window.addEventListener("drop", (event) => {
      shownAtDrop = { row: null, buttons: [] };
      const point = pointerOf(event);
      const row = document.elementsFromPoint(point.x, point.y)
        .map((el) => el.closest?.(".tabbrowser-tab:not([zia-essential-proxy]), zen-folder, tab-group"))
        .find(Boolean);
      if (!row) {
        return;
      }
      // a split shows the x of both its tabs while it's hovered
      const split = row.closest?.("tab-group[split-view-group]");
      const rows = split ? [...split.querySelectorAll(".tabbrowser-tab")] : [row];
      const buttons = rows.flatMap((one) => [...one.querySelectorAll(".tab-close-button, .tab-reset-button")]).filter((button) => {
        if (!rows.includes(button.closest(".tabbrowser-tab, zen-folder, tab-group"))) {
          return false;
        }
        const box = button.getBoundingClientRect();
        return box.width > 0 && getComputedStyle(button).display !== "none";
      });
      shownAtDrop = { row: row.closest(".tabbrowser-tab") || null, buttons };
    }, true);

    const holdFolderHover = (folder) => {
      const held = [folder];
      // a tab dropped into a folder: the folder keeps its hover box too
      if (heldFolder?.isConnected && !held.includes(heldFolder)) {
        held.push(heldFolder);
      }
      heldFolder = null;
      if (shownAtDrop.row && shownAtDrop.row !== folder && shownAtDrop.row.isConnected) {
        held.push(shownAtDrop.row);
      }
      let buttons = shownAtDrop.buttons.filter((button) => button.isConnected);
      shownAtDrop = { row: null, buttons: [] };
      // The dragged tab itself isn't found under the pointer (it lets the
      // pointer through while it's dragged), so its button wasn't noted:
      // a tab dropped into a folder showed nothing between losing its x
      // and the browser finding the pointer on it again for the -
      // (a split's tabs all: it shows the x of both while it's hovered, and
      // with one held, it flashed on the one and off again)
      const dropSplit = gBrowser.isTab(folder) && folder.group?.hasAttribute?.("split-view-group") ? folder.group : null;
      if (gBrowser.isTab(folder) && !buttons.some((button) => (dropSplit || folder).contains(button))) {
        for (const tab of dropSplit ? [...dropSplit.querySelectorAll(".tabbrowser-tab")] : [folder]) {
          const own = tab.querySelector(tab.pinned ? ".tab-reset-button" : ".tab-close-button");
          if (own) {
            buttons.push(own);
          }
        }
      }
      for (const node of held) {
        node.setAttribute("zia-hover-held", "true");
      }
      for (const button of buttons) {
        button.setAttribute("zia-held-shown", "true");
      }
      // A tab dropped into a folder is pinned there, and shows a - where it
      // had an x (and the other way round, pulled out): the x it had was
      // kept on until the pointer moved, then swapped for the -
      // (as soon as it's let go: the drop says where it's going, so its x
      // wasn't left showing until the tab was actually pinned)
      refitHeld = (pinned) => {
        buttons = buttons.map((button) => {
          const tab = button.closest(".tabbrowser-tab");
          const want = pinned ?? tab?.pinned;
          tab?.toggleAttribute("zia-held-pinned", !!want && !tab.pinned);
          const kind = want ? ".tab-reset-button" : ".tab-close-button";
          const right = tab?.isConnected && !button.matches(kind) ? tab.querySelector(kind) : null;
          if (!right) {
            return button;
          }
          button.removeAttribute("zia-held-shown");
          right.setAttribute("zia-held-shown", "true");
          return right;
        });
      };
      if (heldPinned != null) {
        refitHeld(heldPinned);
      }
      heldPinned = null;
      let timer = 0;
      // Over a node by where the pointer is, not by :hover: Zen tidies a
      // folder a moment after a drop, and Firefox forgets what's hovered
      // until the pointer next moves, so a move just then let the hold go
      // and the folder's box (and so the tab over it) flashed darker
      const over = (node, event) => {
        if (node.matches(":hover")) {
          return true;
        }
        if (!event?.clientX && !event?.clientY) {
          return false;
        }
        const box = node.getBoundingClientRect();
        return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      };
      const check = (event) => {
        if (!held.some((node) => node.isConnected && over(node, event))) {
          release();
          return;
        }
        // A button is held only while the pointer is on its own tab: moved
        // on to the next tab in the same folder (still over the folder, so
        // still held), both tabs showed their -
        buttons = buttons.filter((button) => {
          const tab = button.closest(".tabbrowser-tab");
          // (a split's x's are held while it's hovered, either tab)
          const host = tab?.closest("tab-group[split-view-group]") || tab;
          if (host && over(host, event)) {
            return true;
          }
          button.removeAttribute("zia-held-shown");
          tab?.removeAttribute("zia-held-pinned");
          if (tab && held.includes(tab)) {
            tab.removeAttribute("zia-hover-held");
          }
          return false;
        });
      };
      const release = () => {
        if (releaseHeld === release) {
          releaseHeld = null;
        }
        refitHeld = null;
        for (const node of held) {
          node.removeAttribute("zia-hover-held");
        }
        for (const button of buttons) {
          button.removeAttribute("zia-held-shown");
          button.closest(".tabbrowser-tab")?.removeAttribute("zia-held-pinned");
        }
        window.removeEventListener("mousemove", check, true);
        clearTimeout(timer);
      };
      window.addEventListener("mousemove", check, true);
      timer = setTimeout(release, 4000);
      releaseHeld?.();
      releaseHeld = release;
    };

    let droppedFrom = null;
    let isRealDrop = false;
    let pendingFinish = false;
    let heldFolder = null;
    let repinLanding = null;
    let refitLanding = null;
    let finishNow = null;
    let refitHeld = null;
    let heldPinned = null;
    let dragGen = 0;
    let releaseHeld = null;
    window.addEventListener("drop", () => (isRealDrop = true), true);
    window.addEventListener("dragstart", () => (isRealDrop = false), true);

    const settle = () => {
      const droppedTab = drag?.tab || essentialDropped || null;
      if (drag?.moving && !drag.essentials && !drag.away && droppedFrom === null && isRealDrop) {
        const from = drag.moving.getBoundingClientRect();
        // (and where its background showed: a tab over a folder is drawn
        // narrower, indented like the folder's tabs)
        const bg = drag.bg?.isConnected ? drag.bg : null;
        const bgBox = bg?.getBoundingClientRect();
        droppedFrom = { node: drag.moving, top: from.top, left: from.left, tab: drag.tab, bg, bgLeft: bgBox?.left, bgWidth: bgBox?.width };
      }
      essentialDropped = null;
      if (drag?.folder) {
        const dropped = drag.folder;
        // (a landing one goes just before its glide, which measures it)
        setTimeout(() => {
          if (!dropped.hasAttribute("zia-landing")) {
            unmorphFolder(dropped);
          }
        }, 0);
      }
      if (drag?.bg) {
        const { bg, content } = drag;
        setTimeout(() => requestAnimationFrame(() => easeOutWidth(droppedTab)), 0);
      }
      drag = null;
      pending = null;
      document.documentElement.removeAttribute("zia-dragging-tab");
      muteZenHaptics(false);
      reclip();
      document.querySelectorAll("[zia-drop-slot]").forEach((folder) => folder.removeAttribute("zia-drop-slot"));
      if (document.querySelector("[zia-left]")) {
        // (until the mouse moves, when Firefox works out what's hovered)
        window.addEventListener("mousemove", () => document.querySelectorAll("[zia-left]").forEach((folder) => folder.removeAttribute("zia-left")), { once: true, capture: true });
      }
      unlend();
      document.querySelectorAll("[zia-into-empty]").forEach((tab) => {
        tab.removeAttribute("zia-into-empty");
        tab.style.removeProperty("--zia-slot-border");
      });
      clearFolderPaint();
      dropProxy();
      hideThumb(true);
      document.querySelectorAll("[zia-drag-away]").forEach((node) => node.removeAttribute("zia-drag-away"));
      makeRoom(null);
      holdSplitSlot(false);
      document.querySelectorAll("[zia-sep-open]").forEach((node) => node.removeAttribute("zia-sep-open"));

      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      blockAnimUntil = Date.now() + 400;
      const dnd = gBrowser.tabContainer.tabDragAndDrop;
      if (dnd) {
        dnd._dontAnimateTabMove = true;
        if (!dnd.handle_drop_transition?.ziaNeutered) {
          const skip = function () {
            this._dontAnimateTabMove = true;
          };
          skip.ziaNeutered = true;
          dnd.handle_drop_transition = skip;
        }
      }
      const strip = document.getElementById("tabbrowser-tabs");

      const landing = droppedFrom;
      droppedFrom = null;
      strip?.setAttribute("zia-settling", "true");
      const locked = new Set(moved);
      clearMoved();
      for (const node of locked) {
        node.style.removeProperty("transform");
        node.setAttribute("zia-drop-lock", "true");
      }
      if (landing?.node?.isConnected) {
        const node = landing.node;
        holdFolderHover(node);

        node.setAttribute("zia-landing", "true");
        const held = node.getBoundingClientRect();
        node.style.setProperty("transform", `translate(${landing.left - held.left}px, ${landing.top - held.top}px)`, "important");
        // Firefox clears every tab's transform as its drag ends, so the tab
        // painted a frame at its new spot before the glide pulled it back
        // to where it was let go: it's pinned there again each frame, and
        // straight after the drop moves it (into a folder, say)
        const pin = () => {
          if (!node.isConnected) {
            return;
          }
          node.style.removeProperty("transform");
          const at = node.getBoundingClientRect();
          node.style.setProperty("transform", `translate(${landing.left - at.left}px, ${landing.top - at.top}px)`, "important");
        };
        repinLanding = pin;
        refitLanding = landing.bg ? () => settleDroppedWidth(landing.tab, landing.bgWidth) : null;
        const glideIn = () => {
          if (pendingFinish) {
            pin();
            requestAnimationFrame(glideIn);
            return;
          }
          repinLanding = null;
          refitLanding = null;
          refitHeld?.();
          node.style.removeProperty("transform");
          // The narrower look goes before the glide, which then starts the
          // background where it showed: dropped in a folder, it went a
          // step left as the glide began and slid back
          if (landing.bg) {
            settleDroppedWidth(landing.tab, landing.bgWidth);
          }
          unmorphFolder(node);
          const to = node.getBoundingClientRect();
          const dy = landing.top - to.top;
          const dx = landing.bg?.isConnected ? landing.bgLeft - landing.bg.getBoundingClientRect().left : landing.left - to.left;
          if (!node.isConnected || node.hasAttribute("zen-essential") || (Math.abs(dy) < 2 && Math.abs(dx) < 2) || !to.height) {
            // kept a moment, past Firefox's own drop animation (see chrome.css)
            setTimeout(() => node.removeAttribute("zia-landing"), gBrowser.isTab(node) ? 0 : 400);
            return;
          }
          const glide = node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
            duration: LAND_MS,
            easing: LAND_EASE,
          });
          glide.id = "zia-land";
          const end = () => setTimeout(() => node.removeAttribute("zia-landing"), gBrowser.isTab(node) ? 0 : 250);
          glide.finished.then(end, end);
        };
        requestAnimationFrame(glideIn);
      }
      // A new drag started straight after (within the settling time) is
      // left alone: the wipe undid the offsets Zen gives the other
      // essentials to open a gap, so none opened
      const gen = dragGen;
      const unlock = () => {
        strip?.removeAttribute("zia-settling");
        for (const node of locked) {
          node.style.removeProperty("top");
          node.removeAttribute("zia-drop-lock");
        }
      };
      const wipe = () => {
        if (gen !== dragGen) {
          unlock();
          return;
        }
        strip?.querySelectorAll(".tabbrowser-tab, .tab-group-label-container, tab-group, zen-folder").forEach((node) => {
          const appearing = node === droppedTab && !node.group;
          for (const anim of node.getAnimations()) {
            if (anim.id === "zia-land") {
              continue;
            }
            if (movesOnly(anim) || appearing) {
              anim.cancel();
            }
          }
          if (node.style.transform && !node.hasAttribute("zia-landing")) {
            node.style.transform = "";
          }

          // Firefox hides what's dragged until its own drop animation ends;
          // for a folder that's a part inside it, so the whole folder
          // vanished for a moment after landing
          if (node.style.visibility === "hidden" && (locked.has(node) || node === droppedTab || droppedTab?.contains?.(node))) {
            node.style.visibility = "";
          }
        });
        if (Date.now() < blockAnimUntil) {
          requestAnimationFrame(wipe);
        } else {
          unlock();
        }
      };
      clearTimeout(lockTimer);
      wipe();
      // the drop's own placing, now its landing is set up
      if (finishNow) {
        const run = finishNow;
        finishNow = null;
        run();
      }
      holdLent();
    };
    window.addEventListener("drop", settle, true);
    window.addEventListener("dragstart", () => {
      // (and what the last drop kept showing: dragged straight back into
      // the essentials, a tab kept its x on the tile)
      releaseHeld?.();
      dragGen++;
      blockAnimUntil = 0;
    }, true);
    window.addEventListener("dragend", () => {
      settle();
      setTimeout(settle, 0);
    });

    // A drag that ends somewhere this window can't see (dropped in another
    // window or on the desktop, or its tab moved or closed mid-drag) never
    // sends dragend here, which left the drag state on, and with it every
    // tab's close button hidden until Zen restarted. No mouse moves arrive
    // during a drag, so an ordinary move with no button held means none is
    // going on any more: tidy up whatever was left.
    let lastTidy = 0;
    window.addEventListener(
      "mousemove",
      (event) => {
        if (event.buttons || event.timeStamp - lastTidy < 500) {
          return;
        }
        lastTidy = event.timeStamp;
        if (drag || document.documentElement.hasAttribute("zia-dragging-tab")) {
          settle();
        }
        const strip = document.getElementById("tabbrowser-tabs");
        if (strip?.hasAttribute("zia-settling") && Date.now() > blockAnimUntil + 1000) {
          strip.removeAttribute("zia-settling");
        }
        for (const tab of document.querySelectorAll(".tabbrowser-tab[zia-essential-dragged]")) {
          if (!essentialDrag) {
            tab.removeAttribute("zia-essential-dragged");
            tab.style.visibility = "";
          }
        }
      },
      true
    );
  }

