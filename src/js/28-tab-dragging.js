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
        if (!node || seen.has(node)) {
          continue;
        }
        seen.add(node);
        const box = layoutTop(node);
        rows.push({
          item,
          node,
          index: item.elementIndex ?? rows.length,
          top: box.top,
          mid: box.top + box.height / 2,
          height: box.height,
          delta: 0,
        });
      }
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
      // Over an empty folder the tab covers its slot, so the tab carries the
      // slot's dashes instead (chrome.css), in the folder's colour.
      const tab = drag.moving === drag.tab ? drag.tab : null;
      const into = !!tab && !!folder?.hasAttribute("zia-empty");
      if (into) {
        tab.style.setProperty("--zia-slot-border", getComputedStyle(folder).getPropertyValue("--zia-slot-border"));
      }
      tab?.toggleAttribute("zia-into-empty", into);
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
        const down = !same(next) && slotTop != null ? slotTop + drag.height + 10 : leaveDown(next);
        if (down != null) {
          cut = (leaveUp(prev) + down) / 2;
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
      if (folder && drag.moving.contains?.(folder)) {
        folder = null;
      }
      // a folder is only ever moved among the rows, never into a folder
      if (drag.folder) {
        folder = null;
        atEnd = false;
      }

      const crosses = below === !!drag.tab.pinned;

      // Zen won't take a split across the separator itself, so Zia does
      const hand = drag.folder
        ? true
        : drag.split ? crosses && !folder : !!folder || !!pf || (!!nf && isFolderStart(next, nf)) || crosses;
      drag.target = { folder, atEnd, prev, next, below, sameNext: same(next), slotTop, hand };
      setDropSlot(folder);
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
        } else {
          let origBottom = -Infinity;
          let shownBottom = -Infinity;
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
            }
          }
          if (into && target.slotTop != null) {
            shownBottom = Math.max(shownBottom, target.slotTop + drag.height);
          }
          if (Number.isFinite(origBottom) && Number.isFinite(shownBottom)) {
            grow = shownBottom - origBottom;
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

    const morphWidth = (folder) => {
      const key = folder || "plain";
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
        drag.target = null;
        setDropSlot(null);
        takeEmptySlot();
        paintFolders();
        return;
      }

      let rowsMoved = false;
      for (const row of drag.rows) {
        if (notARow(row)) {
          continue;
        }
        const was = drag.shifted.has(row.node);
        let shift = false;
        if (row.index > drag.index) {
          shift = visualMid > row.top + (was ? -10 : 8);
        } else if (row.index < drag.index) {
          shift = visualMid < row.top + row.height - (was ? -10 : 8);
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
        // Coming up from below, it's over once it's half a tab past the
        // separator, and stays over until it's back past where the
        // separator has moved to: the tab-sized space that opens is the
        // last folder's end (top half) and the gap after it (bottom half)
        const upTo = drag.sepDelta ? drag.sepTop + drag.pitch + 2 : drag.sepTop + drag.pitch / 2;
        if (startedBelow && visualMid < upTo) {
          sepDelta = drag.pitch;
        } else if (!startedBelow && visualMid > drag.sepTop + 2) {
          sepDelta = -drag.pitch;
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
          if (tab.group && !before.closest?.("tab-group")) {
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
        parkInFolder(tab, folder);
        return;
      }
      if (folder && target.atEnd) {
        const last = target.prev?.item;
        if (last && gBrowser.isTab(last) && folder.contains(last)) {
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
      const next = target.next && target.sameNext && !target.below ? outermostRow(target.next.node) : null;
      if (next && next !== folder && !folder.contains(next)) {
        placeBefore(folder, next);
      } else if (currentSeparator()) {
        placeBefore(folder, currentSeparator());
      }
      if (folder.parentElement?.closest?.("zen-folder")) {
        console.warn("[Zia] The dropped folder is still inside another folder");
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

    const parkInFolder = (tab, folder) => {
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
      try {
        if (!isCollapsed(folder)) {
          folder.collapsed = true;
        } else if (tab.selected) {
          window.gZenFolders?.animateSelect?.(folder);
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

    const showProxy = (x, y) => {
      clearTimeout(proxyLeaveTimer);
      if (!proxy) {
        const host = root;
        if (!host || !drag?.tab) {
          return;
        }
        proxy = drag.tab.cloneNode(true);
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
          // a split starts as the tile itself, not squeezed from its row
          dressSplitProxy(proxy, drag.tab);
          const tile = tileSize();
          sizeProxy(proxy, tile.bgWidth || tile.width, tile.bgHeight || tile.height);
          fitSplitHalves(proxy, tile.stackHeight, tile.half);
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

      sizeProxy(proxy, tile.bgWidth || tile.width, tile.bgHeight || tile.height);
      moveProxy(x, y);
    };

    const hideProxy = () => {
      if (!proxy || proxy.ziaLeaving || !drag?.moving) {
        return;
      }
      proxy.ziaLeaving = true;
      const row = drag.moving.getBoundingClientRect();
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

    const fitZenSlot = () => {
      const slot = gBrowser.tabContainer.tabDragAndDrop?._fakeEssentialTab;
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
        let best = Infinity;
        for (const row of rows) {
          if (Math.abs(row.index - mine.index) !== 1 || side(row.top) !== side(mine.top)) {
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
            const gap = sorted[i].top - sorted[i - 1].top;
            if (side(sorted[i].top) === side(sorted[i - 1].top) && fits(gap) && gap < best) {
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
        if (drag.splitEssential) {
          acceptSplitDrop(event);
          if (point.x) {
            tapOnNewTile(point, null);
            showProxy(point.x, point.y);
          }
        } else if (drag.split) {
          hideProxy();
        }
        drag.noTiles = drag.essentials && !hasTiles && !promo;
        makeRoom(drag.noTiles ? document.getElementById("zen-essentials") || grid : null);
        if (drag.essentials) {
          fitZenSlot();
        }
        if (drag.essentials && point.x) {
          tapOnNewTile(point, null);
          showProxy(point.x, point.y);
        } else if (!drag.essentials && !drag.splitEssential) {
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
      const sample = [...gBrowser.visibleTabs].find(
        (tab) => !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab") && tab.getBoundingClientRect().height > 8
      );
      const bg = sample?.querySelector(".tab-background")?.getBoundingClientRect();
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
      const copy = tab.cloneNode(true);
      copy.removeAttribute("id");
      for (const name of ["dragtarget", "pending-drag", "multiselected", "zen-pinned-changed"]) {
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

    const listRoom = { rows: null, pitch: 0, sep: null, sepTop: null, sepDelta: 0, first: undefined };
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
      listRoom.buttonTop = listRoom.button?.getBoundingClientRect().top ?? null;
      listRoom.buttonDelta = 0;

      unclipAround(listRoom.button || listRoom.rows[listRoom.rows.length - 1]?.node);
    };
    const shapeListRoom = (y) => {
      if (!listRoom.rows) {
        openListRoom();
      }
      let first = null;
      for (const row of listRoom.rows) {
        const down = row.mid > y;
        if (down && !first) {
          first = row;
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
      if (listRoom.button && listRoom.buttonTop != null) {
        const delta = listRoom.buttonTop > y ? listRoom.pitch : 0;
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
      listRoom.rows = null;
      listRoom.first = undefined;
    };

    const dropIntoListRoom = (tab, y) => {
      const first = listRoom.first || null;
      const sep = listRoom.sep;
      const sepTop = listRoom.sepTop;
      const below = sepTop != null && y > sepTop;
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
          resolve();
        };
        requestAnimationFrame(whenOut);
      });

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
      const asTab = !overTiles && inBox(document.getElementById("navigator-toolbox"), point) && point.y > essentialsBottom() + 8;
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
        if (asTab) {
          const current = copy.getBoundingClientRect();
          moveCopyTo(copy, document.getElementById("tabbrowser-tabs") || root);
          sizeCopy(copy, current.width, current.height);
          copy.getBoundingClientRect();
          copy.removeAttribute("zen-essential");
          copy.removeAttribute("pinned");
          const size = plainTabSize();
          sizeCopy(copy, size.width, size.height);
        } else {
          const current = copy.getBoundingClientRect();
          moveCopyTo(copy, root);
          sizeCopy(copy, current.width, current.height);
          copy.getBoundingClientRect();
          copy.setAttribute("zen-essential", "true");
          copy.setAttribute("pinned", "true");
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
      copy.style.setProperty("top", `${Math.round(point.y - (asTab ? 0 : state.offset.y) - shift.y)}px`, "important");
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
      const reveal = () => {
        state.tab.style.visibility = "";
        state.tab.removeAttribute("zia-essential-dragged");
        requestAnimationFrame(() => copy.remove());
      };
      // Dropped among the essentials: the tile glides from where it was let
      // go into its place (once that's settled) before the real one shows
      const glideHome = () => {
        // dropped into the list: it shows once it's in its place, not first
        // wherever Zen put it
        if (state.placing) {
          state.placing.finally(reveal);
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

    window.addEventListener(
      "drop",
      (event) => {
        const tab = drag?.tab;
        heldFolder = null;

        if (tab && drag.splitEssential) {
          event.preventDefault();
          event.stopPropagation();
          let essential = null;
          try {
            essential = addSplitToEssentials(tab);
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
        } else if (drag.folder && !drag.away && drag.target) {
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
          heldFolder = target.folder || null;
          pendingFinish = true;
          setTimeout(() => {
            try {
              finishDrop(tab, target);
              repinLanding?.();
              refitHeld?.();
            } catch (err) {
              console.error("[Zia] Tab drop failed:", err);
            }
            pendingFinish = false;
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
      for (const node of held) {
        node.setAttribute("zia-hover-held", "true");
      }
      for (const button of buttons) {
        button.setAttribute("zia-held-shown", "true");
      }
      // A tab dropped into a folder is pinned there, and shows a - where it
      // had an x (and the other way round, pulled out): the x it had was
      // kept on until the pointer moved, then swapped for the -
      refitHeld = () => {
        buttons = buttons.map((button) => {
          const tab = button.closest(".tabbrowser-tab");
          const kind = tab?.pinned ? ".tab-reset-button" : ".tab-close-button";
          const right = tab?.isConnected && !button.matches(kind) ? tab.querySelector(kind) : null;
          if (!right) {
            return button;
          }
          button.removeAttribute("zia-held-shown");
          right.setAttribute("zia-held-shown", "true");
          return right;
        });
      };
      let timer = 0;
      const check = () => {
        if (!held.some((node) => node.matches(":hover"))) {
          release();
        }
      };
      const release = () => {
        refitHeld = null;
        for (const node of held) {
          node.removeAttribute("zia-hover-held");
        }
        for (const button of buttons) {
          button.removeAttribute("zia-held-shown");
        }
        window.removeEventListener("mousemove", check, true);
        clearTimeout(timer);
      };
      window.addEventListener("mousemove", check, true);
      timer = setTimeout(release, 4000);
    };

    let droppedFrom = null;
    let isRealDrop = false;
    let pendingFinish = false;
    let heldFolder = null;
    let repinLanding = null;
    let refitHeld = null;
    window.addEventListener("drop", () => (isRealDrop = true), true);
    window.addEventListener("dragstart", () => (isRealDrop = false), true);

    const settle = () => {
      const droppedTab = drag?.tab || essentialDropped || null;
      if (drag?.moving && !drag.essentials && !drag.away && droppedFrom === null && isRealDrop) {
        const from = drag.moving.getBoundingClientRect();
        // (and where its background showed: a tab over a folder is drawn
        // narrower, indented like the folder's tabs)
        const bg = drag.bg?.isConnected ? drag.bg : null;
        droppedFrom = { node: drag.moving, top: from.top, left: from.left, tab: drag.tab, bg, bgLeft: bg?.getBoundingClientRect().left };
      }
      essentialDropped = null;
      if (drag?.bg) {
        const { bg, content } = drag;
        setTimeout(() => requestAnimationFrame(() => unmorphWidth(droppedTab, bg, content)), 0);
      }
      drag = null;
      pending = null;
      document.documentElement.removeAttribute("zia-dragging-tab");
      muteZenHaptics(false);
      reclip();
      document.querySelectorAll("[zia-drop-slot]").forEach((folder) => folder.removeAttribute("zia-drop-slot"));
      document.querySelectorAll("[zia-into-empty]").forEach((tab) => {
        tab.removeAttribute("zia-into-empty");
        tab.style.removeProperty("--zia-slot-border");
      });
      clearFolderPaint();
      dropProxy();
      hideThumb(true);
      document.querySelectorAll("[zia-drag-away]").forEach((node) => node.removeAttribute("zia-drag-away"));
      makeRoom(null);
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
        const glideIn = () => {
          if (pendingFinish) {
            pin();
            requestAnimationFrame(glideIn);
            return;
          }
          repinLanding = null;
          refitHeld?.();
          node.style.removeProperty("transform");
          // The narrower look goes before the glide, which then starts the
          // background where it showed: dropped in a folder, it went a
          // step left as the glide began and slid back
          if (landing.bg) {
            unmorphWidth(landing.tab);
          }
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
      const wipe = () => {
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
          strip?.removeAttribute("zia-settling");
          for (const node of locked) {
            node.style.removeProperty("top");
            node.removeAttribute("zia-drop-lock");
          }
        }
      };
      clearTimeout(lockTimer);
      wipe();
    };
    window.addEventListener("drop", settle, true);
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

