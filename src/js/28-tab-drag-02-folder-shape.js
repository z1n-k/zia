  // Folders tinted and their width morphed while a tab is dragged over or out of them.
  // Used elsewhere: paintFolders, clearFolderPaint, bgOf, contentOf, widthFor, unmorphFolder,
  // morphWidth, settleDroppedWidth, easeOutWidth.

  const FOLDER_TAB_INSET = { start: 14.5, end: 5 };
  const MORPH_PROPS = ["--zia-morph-bg-start", "--zia-morph-bg-end", "--zia-morph-content-start", "--zia-morph-content-end"];
  const FOLDER_MORPH_MS = 140;
  const WIDTH_WAIT_MS = 200;
  const MORPH_OUT_MS = 450;

  const paintedFolders = new Set();

  const foldersOf = (rows) => {
    const folders = new Set();
    for (const row of rows) {
      for (let f = rowFolder(row); f; f = f.parentElement?.closest?.(FOLDER_SELECTOR)) {
        folders.add(f);
      }
    }
    return folders;
  };

  const closedFolderShape = (f, into, pitch) => {
    let top = 0;
    let grow = into ? pitch : 0;
    if (into && topRoom?.folder === f && topRoom.key === "up") {
      top = -pitch;
      grow = 0;
    }
    return { top, grow };
  };

  const openFolderShape = (f, into, { rows, target, height, skip }) => {
    let top = 0;
    let grow = 0;
    let origBottom = -Infinity;
    let shownBottom = -Infinity;
    let showsTab = false;
    for (const row of rows) {
      if (row.node === f || !f.contains(row.node)) {
        continue;
      }
      const slot = slotAfterHeader(row);
      origBottom = Math.max(origBottom, row.top + row.height + slot);
      if (row.node === headerOf(f)) {
        top = row.delta || 0;
      }
      if (!skip(row)) {
        const intoThisSlot = slot && into && target.folder === row.node.parentElement;
        shownBottom = Math.max(shownBottom, row.top + (row.delta || 0) + row.height + (intoThisSlot ? 0 : slot));
        showsTab ||= row.node !== headerOf(f);
      }
    }
    if (into && target.slotTop != null) {
      shownBottom = Math.max(shownBottom, target.slotTop + height);
      showsTab = true;
    }
    if (Number.isFinite(origBottom) && Number.isFinite(shownBottom)) {
      grow = shownBottom - origBottom;
    }
    // closed, its open tab dragged out, it loses the padding below that tab too
    // (chrome.css): the box closed up less that and snapped the rest on the drop
    if (isCollapsed(f) && !showsTab) {
      grow -= parseFloat(getComputedStyle(f).getPropertyValue("--zia-folder-inner-gap")) || 0;
    }
    return { top, grow };
  };

  // Folders' boxes stretched round the room made for what's dragged: a tab, or
  // (listRoom) an essential brought down into the list, whose folders didn't open
  const paintFolders = (
    { rows, target, pitch, height, skip, outer, moving } =
      { rows: drag.rows, target: drag.target, pitch: drag.pitch, height: drag.height, skip: notARow, outer: drag.folder, moving: drag.moving }
  ) => {
    for (const f of foldersOf(rows)) {
      if (outer && (f === outer || outer.contains(f))) {
        continue;
      }
      const into = !!target?.folder && (target.folder === f || f.contains(target.folder));
      const { top, grow } =
        isCollapsed(f) && !f.contains(moving) ? closedFolderShape(f, into, pitch) : openFolderShape(f, into, { rows, target, height, skip });
      f.style.setProperty("--zia-drag-bg-top", `${Math.round(top)}px`);
      f.style.setProperty("--zia-drag-bg-grow", `${Math.round(grow)}px`);
      if (!f.hasAttribute("zia-bg-shift")) {
        f.setAttribute("zia-bg-shift", "true");
      }
      paintedFolders.add(f);
    }
  };

  const clearFolderPaint = () => {
    clearTopRoom();
    for (const f of paintedFolders) {
      f.removeAttribute("zia-bg-shift");
      f.style.removeProperty("--zia-drag-bg-top");
      f.style.removeProperty("--zia-drag-bg-grow");
    }
    paintedFolders.clear();
  };

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
      (tab) => tab !== drag?.tab && !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab") && showing(tab) &&
        (inside ? true : !tab.group || tab.group.hasAttribute("split-view-group") ? !inside : true)
    );
  const widthFor = (folder) => {
    if (folder) {
      const own = sampleTab(folder);
      if (own && own.group === folder) {
        return showing(own);
      }
      let inset = FOLDER_TAB_INSET;
      const other = [...gBrowser.visibleTabs].find(
        (tab) => tab !== drag?.tab && tab.group && isFolderEl(tab.group) && !tab.group.group && showing(tab)
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
      (tab) => tab !== drag?.tab && !tab.group && !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab") && showing(tab)
    );
    if (plain) {
      return showing(plain);
    }
    const anyFolder = document.querySelector("#tabbrowser-tabs zen-folder");
    return anyFolder ? folderBox(anyFolder) : null;
  };

  // A dragged folder narrows the same way over a folder it would go into, to the
  // width of folders already inside one (its margins, eased)
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
    const startedIn = moving.parentElement?.closest?.(FOLDER_SELECTOR) || null;
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
      const t = Math.min(1, (now - began) / FOLDER_MORPH_MS);
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
    // (out of a folder inside another into none waits a moment: passing to the outer
    // one it counted as in none for a sliver and went full width in between)
    if (key !== "plain" || drag.widthKey === "plain") {
      clearTimeout(drag.widthTimer);
      drag.widthTimer = 0;
    } else if (!drag.widthGo && drag.widthKey && drag.widthKey !== "plain" && drag.widthKey.parentElement?.closest?.(FOLDER_SELECTOR)) {
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
        }, WIDTH_WAIT_MS);
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

  // a dropped tab and, if it's in a split, the split: whichever wears the look
  const morphNodes = (tab) => [tab, tab?.group?.hasAttribute?.("split-view-group") ? tab.group : null];

  // Dropped, its narrower look goes straight to the row's own and the landing glide
  // starts from there: eased while the glide moved the row the other way (a folder's
  // indent changing), the two didn't cancel and it bulged sideways. Only a width that
  // differs from the one it was let go at eases, by its right edge.
  const settleDroppedWidth = (tab, width) => {
    const node = morphNodes(tab).find((n) => n?.hasAttribute?.("zia-morph"));
    if (!node) {
      return;
    }
    const split = node.localName === "tab-group";
    const box = split ? node.querySelector(":scope > .tab-group-container") : node.querySelector(".tab-background");
    const content = split ? null : node.querySelector(".tab-content");
    node.setAttribute("zia-morph-done", "true");
    node.removeAttribute("zia-morph");
    for (const name of MORPH_PROPS) {
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
    for (const node of morphNodes(tab)) {
      if (!node?.hasAttribute?.("zia-morph")) {
        continue;
      }
      node.setAttribute("zia-morph-out", "true");
      node.removeAttribute("zia-morph");
      for (const name of MORPH_PROPS) {
        node.style.removeProperty(name);
      }
      clearTimeout(node.ziaMorphOutTimer);
      node.ziaMorphOutTimer = setTimeout(() => node.removeAttribute("zia-morph-out"), MORPH_OUT_MS);
    }
  };

