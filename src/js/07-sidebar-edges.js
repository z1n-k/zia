  // The tabs' and folders' edges lined up with the essentials' (measured, and set as --zia-*-fix
  // variables, tried again while things are still sliding), and the tab list's scrollbar hidden.
  // Used elsewhere: watchRightEdges, hideTabListScrollbars.

  const EDGE_MAX_FIX = 24;
  const EDGE_RETRY_MS = 100;
  const EDGE_MAX_RETRIES = 30;
  const EDGE_AFTER_SWITCH_MS = [350, 800];
  const EDGE_AFTER_START_MS = [600, 2000];
  const edgeAlign = {
    frame: null,
    retryTimer: null,
    retries: 0,
  };

  function visibleRect(el) {
    const rect = el?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function isSliding(el) {
    for (let node = el; node && node.id !== "navigator-toolbox"; node = node.parentElement) {
      const style = getComputedStyle(node);
      const transform = style.transform || "none";
      const moved =
        transform !== "none" &&
        !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(transform) &&
        !/^matrix3d\(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1\)$/.test(transform);
      const translate = style.translate || "none";
      if (moved || !/^(none|0px( 0px)?( 0px)?)$/.test(translate)) {
        return true;
      }
    }
    return false;
  }

  function retryEdgeAlignSoon() {
    if (edgeAlign.retryTimer || edgeAlign.retries >= EDGE_MAX_RETRIES) {
      return;
    }
    edgeAlign.retries++;
    edgeAlign.retryTimer = setTimeout(() => {
      edgeAlign.retryTimer = null;
      scheduleEdgeAlign(true);
    }, EDGE_RETRY_MS);
  }

  const halfPx = (value) => `${Math.round(value * 2) / 2}px`;

  function alignRightEdges() {
    edgeAlign.frame = null;
    const sidebar = document.getElementById("navigator-toolbox");
    if (!sidebar || document.documentElement.getAttribute("zen-sidebar-expanded") !== "true") {
      return;
    }

    const essentials = essentialsEdges();
    if (essentials.right === null) {
      for (const name of ["--zia-tab-right-fix", "--zia-folder-right-fix", "--zia-folder-left-fix"]) {
        root.style.removeProperty(name);
      }
      alignFolderBottoms(gZenWorkspaces?.activeWorkspaceElement || sidebar);
      return;
    }

    const space = gZenWorkspaces?.activeWorkspaceElement || sidebar;
    if ((isSliding(space) || isSliding(essentials.tile)) && edgeAlign.retries < EDGE_MAX_RETRIES) {
      retryEdgeAlignSoon();
      return;
    }
    let suspicious = false;
    const tab = [...space.querySelectorAll(".tabbrowser-tab:not([zen-essential])")].find(
      (t) => !t.closest(FOLDER_SELECTOR) && visibleRect(t.querySelector(".tab-background"))
    );
    // (a tab still opening is measured once it's in place: measured as it
    // came in, the tabs kept a wrong right edge until the sidebar was
    // resized)
    if (tab && (isSliding(tab) || tab.getAnimations().length) && edgeAlign.retries < EDGE_MAX_RETRIES) {
      retryEdgeAlignSoon();
      return;
    }
    if (tab && !alignTabEdge(tab, essentials)) {
      suspicious = true;
    }
    if (!alignFolderEdges(space, essentials)) {
      suspicious = true;
    }
    if (!alignFolderBottoms(space)) {
      suspicious = true;
    }

    if (suspicious) {
      retryEdgeAlignSoon();
    } else {
      edgeAlign.retries = 0;
    }
  }

  // The essentials' outer edges, and the first tile, of those on screen
  function essentialsEdges() {
    let right = null;
    let left = null;
    let tile = null;
    // only the essentials on screen: other spaces' are kept too, some shifted
    // aside, and measuring those pushed the tabs out past the sidebar's edge
    const grid = window.gZenWorkspaces?.getCurrentEssentialsContainer?.() || document.getElementById("zen-essentials");
    for (const bg of grid?.querySelectorAll(".tabbrowser-tab[zen-essential] > .tab-stack > .tab-background") || []) {
      const rect = bg.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) === false ? null : visibleRect(bg);
      if (rect) {
        tile ||= bg;
        right = Math.max(right ?? -Infinity, rect.right);
        left = Math.min(left ?? Infinity, rect.left);
      }
    }
    return { right, left, tile };
  }

  // false where the fix is too big to trust (measured mid-move)
  function alignTabEdge(tab, essentials) {
    const rect = visibleRect(tab.querySelector(".tab-background"));
    const currentFix = parseFloat(root.style.getPropertyValue("--zia-tab-right-fix")) || 0;
    const fix = rect.right + currentFix - essentials.right;
    if (Math.abs(fix) <= EDGE_MAX_FIX) {
      root.style.setProperty("--zia-tab-right-fix", halfPx(fix));
      return true;
    }
    return false;
  }

  function alignFolderEdges(space, essentials) {
    const folder = [...space.querySelectorAll(FOLDER_SELECTOR)].find((f) => !f.parentElement?.closest(FOLDER_SELECTOR) && visibleRect(f));
    if (!folder) {
      return true;
    }
    const rect = visibleRect(folder);
    const rightFix = rect.right - essentials.right;
    const leftFix = essentials.left - rect.left;
    if (Math.abs(rightFix) <= EDGE_MAX_FIX && Math.abs(leftFix) <= EDGE_MAX_FIX) {
      root.style.setProperty("--zia-folder-right-fix", halfPx(rightFix));
      root.style.setProperty("--zia-folder-left-fix", halfPx(leftFix));
      return true;
    }
    return false;
  }

  function alignFolderBottoms(space) {
    let ok = true;
    for (const folder of space.querySelectorAll(FOLDER_SELECTOR)) {
      const rect = visibleRect(folder);
      const open = folder.hasAttribute("collapsed") === false;
      const container = folder.querySelector(":scope > .tab-group-container");
      let last = null;
      if (rect && open && container) {
        const items = [...container.children].filter(
          (el) => (isFolder(el) || el.classList.contains("tabbrowser-tab")) && visibleRect(el)
        );
        last = items[items.length - 1];
      }
      const current = parseFloat(folder.style.getPropertyValue("--zia-folder-bottom-extra")) || 0;
      if (!isFolder(last)) {
        if (current) {
          folder.style.removeProperty("--zia-folder-bottom-extra");
        }
        continue;
      }
      const gap = parseFloat(getComputedStyle(folder).getPropertyValue("--zia-folder-inner-gap")) || 5;
      const innerInset = parseFloat(getComputedStyle(last, "::before").bottom) || 0;
      const innerBoxBottom = last.getBoundingClientRect().bottom - innerInset;
      const outerInset = parseFloat(getComputedStyle(folder, "::before").bottom) || 0;
      const baseInset = outerInset + current;
      const wantedInset = rect.bottom - (innerBoxBottom + gap);
      const extra = Math.round((baseInset - wantedInset) * 2) / 2;
      if (Math.abs(extra) > EDGE_MAX_FIX) {
        ok = false;
        continue;
      }
      if (extra !== current) {
        folder.style.setProperty("--zia-folder-bottom-extra", `${extra}px`);
      }
    }
    return ok;
  }

  function scheduleEdgeAlign(isRetry = false) {
    if (isRetry !== true) {
      edgeAlign.retries = 0;
    }
    if (!edgeAlign.frame) {
      edgeAlign.frame = requestAnimationFrame(alignRightEdges);
    }
  }

  function scheduleEdgeAlignAfterSwitch() {
    scheduleEdgeAlign();
    // (not kept: each only asks for a measure, which scheduleEdgeAlign folds into one frame)
    for (const ms of EDGE_AFTER_SWITCH_MS) {
      setTimeout(scheduleEdgeAlign, ms);
    }
  }

  function watchRightEdges() {
    const sidebar = document.getElementById("navigator-toolbox");
    if (!sidebar) {
      return;
    }
    new ResizeObserver(scheduleEdgeAlign).observe(sidebar);
    const essentials = document.getElementById("zen-essentials");
    if (essentials) {
      new ResizeObserver(scheduleEdgeAlign).observe(essentials);
      new MutationObserver(scheduleEdgeAlign).observe(essentials, { childList: true, subtree: true });
    }
    new MutationObserver(scheduleEdgeAlign).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["zen-sidebar-expanded"],
    });
    const tabs = document.getElementById("tabbrowser-tabs");
    if (tabs) {
      new MutationObserver(scheduleEdgeAlign).observe(tabs, {
        subtree: true,
        attributes: true,
        attributeFilter: ["collapsed"],
      });
    }
    gBrowser.tabContainer.addEventListener("TabSelect", () => scheduleEdgeAlign());
    for (const type of ["TabOpen", "TabClose"]) {
      gBrowser.tabContainer.addEventListener(type, () => scheduleEdgeAlignAfterSwitch());
    }
    const onSpaceSwitch = () => scheduleEdgeAlignAfterSwitch();
    for (const type of ["TabGroupExpand", "TabGroupCollapse", "TabGrouped", "TabUngrouped"]) {
      window.addEventListener(type, onSpaceSwitch);
    }
    watchPrefs("zen.workspaces.active", onSpaceSwitch);
    window.addEventListener("ZenWorkspacesUIUpdate", onSpaceSwitch);
    scheduleEdgeAlign();
    // (not kept, as after a switch: each only asks for a measure)
    for (const ms of EDGE_AFTER_START_MS) {
      setTimeout(scheduleEdgeAlign, ms);
    }
  }

  // No scrollbar down the tab list: Zen gives each space's list its own
  // (shown once it overflows), inside its scroll box, where the stylesheet's
  // "no scrollbars" didn't reach. Set on the scroll box itself, for every
  // space, including ones made later.
  function hideTabListScrollbars() {
    const toolbox = document.getElementById("navigator-toolbox");
    if (!toolbox) {
      return;
    }
    const apply = () => {
      for (const box of document.querySelectorAll("zen-workspace arrowscrollbox, #tabbrowser-arrowscrollbox")) {
        const inner = box.scrollbox || box.shadowRoot?.querySelector('[part~="scrollbox"]');
        if (inner && inner.style.getPropertyValue("scrollbar-width") !== "none") {
          inner.style.setProperty("scrollbar-width", "none", "important");
        }
      }
    };
    let frame = null;
    new MutationObserver(() => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = null;
          apply();
        });
      }
    }).observe(toolbox, { childList: true, subtree: true });
    apply();
  }

