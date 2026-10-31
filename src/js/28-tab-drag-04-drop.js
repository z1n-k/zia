  // Where a dropped tab, split or folder lands: placed, pinned, unpinned or parked in a folder.

  // Dropping into an open empty folder uses its slot as the tab's room: rows after the
  // folder move up by the slot's height too, and the slot fades (chrome.css).
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
        const button = newTabOnTop() ? newTabButton() : null;
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

  // The row a drop into a folder goes before, as one of the folder's own
  // (none at its end, or when it's closed)
  const nextInFolder = (folder, box, target) => {
    let next = !target.atEnd && !isCollapsed(folder) && target.next && folder.contains(target.next.node) ? target.next.node : null;
    while (next && next.parentElement !== box) {
      next = next.parentElement;
    }
    return next;
  };

  // A split let go in a folder goes where it was shown (beside the hidden tab Zen
  // keeps in an empty one), and a closed folder shuts on it again
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
    let next = nextInFolder(folder, box, target);
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

  // Several selected tabs let go together: the others (folded into the dragged one) land
  // beside it in the order they had, as Firefox lays out a multiple drop. Firefox's own
  // drop placed them by its measure of the list, which Zia's drag had moved, so they
  // went to its end.
  const finishDrop = (tab, target, party = null) => {
    placeDropped(tab, target);
    const at = party?.indexOf(tab) ?? -1;
    if (at < 0 || !tab.isConnected || tab.group?.hasAttribute("split-view-group")) {
      return;
    }
    const pinned = !target.below;
    let anchor = tab;
    for (const other of party.slice(at + 1)) {
      pinFor(other, pinned);
      placeAfter(other, anchor);
      anchor = other;
    }
    anchor = tab;
    for (const other of party.slice(0, at).reverse()) {
      pinFor(other, pinned);
      placeBefore(other, anchor);
      anchor = other;
    }
  };

  const placeDropped = (tab, target) => {
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
      // (read after pinning, which can give the split a new group)
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
    const sep = currentSeparator();
    if (sep) {
      placeBefore(tab, sep);
    }
  };

  // Zen drops a folder by what's under the pointer, often a closed folder it then nests
  // it in: straight after, it's put where Zia showed it, never inside another folder.
  // (canNest: Zen's own limit on how deep folders go)
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
    // (the folder it comes out of, emptied, shuts itself: without the bounce, as when a
    // tab is taken out, or the line below jolted)
    if (nestedIn) {
      nestedIn.ziaLentUntil = Date.now() + 800;
    }
    const into = target.folder?.isConnected && target.folder !== folder && !folder.contains(target.folder) ? target.folder : null;
    if (into) {
      // (no longer empty: its slot went only on the next frame, and the folder opened
      // round both, twice the room, for a moment)
      into.removeAttribute("zia-empty");
      if (isCollapsed(into)) {
        into.ziaDroppedUntil = Date.now() + 500;
      }
      // Dropped where Zia showed it inside a folder: there, before the row
      // it was shown above (at the end, if none or the folder is closed)
      const box = into.querySelector(":scope > .tab-group-container");
      const next = nextInFolder(into, box, target);
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

  // A closed folder showing the open tab just put in. Zen does it (animateSelect) unless
  // every tab in the folder is the open one: then it opened the folder, flashing open and
  // shut, so it's laid out here as Zen would. False when Zen's own way is fine.
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
    // Zen slides the folder's list down into place, so the tab just dropped blinked out
    // and slid in from above: it's where it landed already
    jumpToEnd(folder);
  };

