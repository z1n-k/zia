  // A closed folder showing its open tab: the other tabs kept out of sight as it lets go of
  // that tab, folders inside it opened where they are, and open inner folders revealed.
  // Used elsewhere: keepTabsHiddenAfterActiveLeaves, openKeptFolderNames, revealOpenSubfolders.

  const OPEN_IN_CLOSED = "zia-open-in-closed";
  // (while one shuts: its tabs still let show, for the shrink)
  const CLOSING_IN_CLOSED = "zia-closing-in-closed";
  const IN_CLOSED_MS = 200;
  const IN_CLOSED_SETTLE_MS = IN_CLOSED_MS + 40;
  // (the other tabs' fade, before the folder lets go of them)
  const WAS_ACTIVE_MS = 170;
  const REVEALING_MS = 500;
  const FOLDER_RESIZE_MS = 220;

  // A closed folder showing its selected tab keeps the other tabs see-through. When Zen
  // stops showing the tab (unloaded, or a tab chosen elsewhere), they showed piled on one
  // row as it shut: the folder keeps its layout while they fade, then shrinks shut.
  function keepTabsHiddenAfterActiveLeaves() {
    const tabs = gBrowser.tabContainer;
    if (!tabs) {
      return;
    }
    new MutationObserver(onFolderActiveChange).observe(tabs, { subtree: true, attributes: true, attributeFilter: ["has-active"], attributeOldValue: true });
    window.addEventListener("TabGroupExpand", onFolderShowingTabExpand, true);
  }

  // (which tab it shows, and which folders in it keep their names: Zen
  // may clear its own marks for them as it lets go)
  function unmarkKeptTab(folder) {
    for (const el of folder.querySelectorAll("[zia-kept-tab], [zia-keeps-name]")) {
      el.removeAttribute("zia-kept-tab");
      el.removeAttribute("zia-keeps-name");
    }
  }

  function markKeptTab(folder) {
    unmarkKeptTab(folder);
    for (const tab of folder.querySelectorAll('.tabbrowser-tab:is([selected], [folder-active="true"])')) {
      tab.setAttribute("zia-kept-tab", "true");
      for (let el = tab.parentElement?.closest(FOLDER_SELECTOR); el && el !== folder; el = el.parentElement?.closest(FOLDER_SELECTOR)) {
        el.setAttribute("zia-keeps-name", "true");
      }
    }
  }

  function clearWasActive(folder) {
    clearTimeout(folder.ziaWasActiveTimer);
    folder.removeAttribute("zia-was-active");
    unmarkKeptTab(folder);
  }

  // Faded out, the folder lets go of them: Zen had already pulled them
  // out of sight, all at once, and the folder's box shrinks to match
  function settleAfterActiveLeaves(folder) {
    const container = folder.groupContainer;
    const before = container?.getBoundingClientRect().height ?? 0;
    clearWasActive(folder);
    if (!container || container.ziaHold || !folder.hasAttribute("collapsed")) {
      return;
    }
    const after = container.getBoundingClientRect().height;
    if (before - after < 0.5) {
      return;
    }
    animateFolderHeight(container, before, after, { duration: FOLDER_RESIZE_MS, easing: "cubic-bezier(0.42, 0, 0.58, 1)" });
  }

  function onFolderActiveChange(records) {
    for (const { target, oldValue } of records) {
      if (!isFolder(target)) {
        continue;
      }
      if (target.hasAttribute("has-active")) {
        if (target.hasAttribute("collapsed")) {
          clearWasActive(target);
          markKeptTab(target);
        }
        continue;
      }
      if (oldValue === null || !target.hasAttribute("collapsed")) {
        // (opening, the names stay while it does: gone at once, the tab
        // under one jumped up and back down)
        if (!target.hasAttribute("zia-revealing")) {
          unmarkKeptTab(target);
        }
        continue;
      }
      target.setAttribute("zia-was-active", "true");
      clearTimeout(target.ziaWasActiveTimer);
      target.ziaWasActiveTimer = setTimeout(() => settleAfterActiveLeaves(target), WAS_ACTIVE_MS);
    }
  }

  function onFolderShowingTabExpand(event) {
    const folder = event.target;
    if (folder?.hasAttribute?.("zia-was-active")) {
      clearWasActive(folder);
    }
    // Opening a folder that showed just its open tab, it's marked for a
    // moment, so the inner folder names it kept stay while it opens
    if (isFolder(folder) && folder.hasAttribute("has-active")) {
      folder.setAttribute("zia-revealing", "true");
      clearTimeout(folder.ziaRevealTimer);
      folder.ziaRevealTimer = setTimeout(() => {
        folder.removeAttribute("zia-revealing");
        if (!folder.hasAttribute("has-active")) {
          unmarkKeptTab(folder);
        }
      }, REVEALING_MS);
    }
  }

  // Clicking the name of a folder kept inside a closed folder (it holds the tab the
  // closed one shows) opens it where it is: its tabs show under its name, and the rest
  // of the closed folder stays hidden (zia-open-in-closed, 06-folders-and-sidebar.css).
  // The folders round it had opened too, bringing back every other folder in them.
  // Clicked again, it closes back to the tab it shows.
  function openKeptFolderNames() {
    window.addEventListener("click", onKeptFolderNameClick, true);
    // Closed again, or a folder round it opened or closed, or the closed folder no
    // longer showing a tab, it's back to how Zen has it
    window.addEventListener("TabGroupCollapse", onOpenInClosedCollapse, true);
    window.addEventListener("TabGroupExpand", onOpenInClosedExpand, true);
    const tabs = gBrowser.tabContainer;
    if (tabs) {
      new MutationObserver((records) => {
        for (const { target } of records) {
          if (isFolder(target) && !target.hasAttribute("has-active")) {
            unmarkOpenInClosed(target);
          }
        }
      }).observe(tabs, { subtree: true, attributes: true, attributeFilter: ["has-active"] });
    }
  }

  function inShowingClosedFolder(folder) {
    for (let el = folder.parentElement?.closest(FOLDER_SELECTOR); el; el = el.parentElement?.closest(FOLDER_SELECTOR)) {
      if (el.hasAttribute("collapsed") && el.hasAttribute("has-active")) {
        return true;
      }
    }
    return false;
  }

  function unmarkOpenInClosed(folder) {
    for (const el of folder.querySelectorAll(`[${OPEN_IN_CLOSED}]`)) {
      el.removeAttribute(OPEN_IN_CLOSED);
    }
  }

  // Its tabs come and go as it opens and shuts (all but the one it keeps showing).
  // Zen's grow and shrink go nowhere for them, as it's the closed folder's rules
  // that hide them, not Zen: shutting, they dropped to nothing at once and faded on
  // top of the tab shown; opening again, they were there at once. So Zia moves them,
  // each tab's height and fade together, measured now and started before the next
  // paint, over whatever Zen starts.
  function passingItems(folder) {
    return [...(folder.groupContainer?.children || [])].filter(
      (item) =>
        (item.matches(".tabbrowser-tab:not([zen-empty-tab])") || item.matches("tab-group[split-view-group]")) &&
        !item.matches('[selected], [visuallyselected], [folder-active="true"], [zia-kept-tab]') &&
        !item.querySelector?.('.tabbrowser-tab:is([selected], [folder-active="true"])')
    );
  }

  function swingKeptFolder(folder, opening) {
    const items = passingItems(folder).map((item) => {
      const style = item.style;
      const saved = [style.height, style.minHeight];
      style.height = "";
      style.minHeight = "";
      const height = item.getBoundingClientRect().height;
      [style.height, style.minHeight] = saved;
      return { item, height };
    });
    const moving = [];
    requestAnimationFrame(() => {
      for (const { item, height } of items) {
        if (!height) {
          continue;
        }
        // (opening, from under whatever hid them shut, below)
        if (opening) {
          for (const prop of ["height", "min-height", "opacity"]) {
            item.style.removeProperty(prop);
          }
        }
        const open = { height: `${height}px`, minHeight: `${height}px`, opacity: 1 };
        const shut = { height: "0px", minHeight: "0px", opacity: 0 };
        moving.push(item.animate(opening ? [shut, open] : [open, shut], { duration: IN_CLOSED_MS, easing: "ease-in-out", fill: opening ? "none" : "forwards" }));
      }
    });
    return moving;
  }

  function onKeptFolderNameClick(event) {
    if (event.button !== 0) {
      return;
    }
    const label = event.target?.closest?.(".tab-group-label-container");
    const folder = label?.parentElement;
    if (!isFolder(folder) || folder.hasAttribute(OPEN_IN_CLOSED) || !folder.querySelector('.tabbrowser-tab:is([selected], [folder-active="true"])')) {
      return;
    }
    if (event.target.closest(".tab-group-label-container toolbarbutton, .tab-close-button, .tab-reset-button, [anonid], button")) {
      return;
    }
    if (!inShowingClosedFolder(folder)) {
      return;
    }
    const box = folder.groupContainer;
    const before = box?.getBoundingClientRect().height ?? 0;
    folder.setAttribute(OPEN_IN_CLOSED, "true");
    // (open already, hidden with the rest as the folder round it closed: shown as
    // it is, rather than Zen closing it, growing to its height)
    if (!folder.hasAttribute("collapsed")) {
      event.stopPropagation();
      event.preventDefault();
      const hidden = (folder.allItems || []).filter((item) => item.style.height === "0px" || item.style.opacity === "0");
      if (hidden.length) {
        window.gZenFolders?.styleCleanup?.(hidden);
      }
      const after = box?.getBoundingClientRect().height ?? 0;
      if (Math.abs(after - before) > 0.5) {
        animateFolderHeight(box, before, after, { duration: FOLDER_RESIZE_MS, easing: "cubic-bezier(0.42, 0, 0.58, 1)" });
      }
    }
  }

  function onOpenInClosedCollapse(event) {
    const folder = event.target;
    if (!isFolder(folder)) {
      return;
    }
    unmarkOpenInClosed(folder);
    if (!folder.hasAttribute(OPEN_IN_CLOSED)) {
      return;
    }
    // (the closed folder's rules take them once they've shrunk away)
    folder.setAttribute(CLOSING_IN_CLOSED, "true");
    const moving = swingKeptFolder(folder, false);
    clearTimeout(folder.ziaClosingTimer);
    folder.ziaClosingTimer = setTimeout(() => {
      folder.removeAttribute(CLOSING_IN_CLOSED);
      if (folder.hasAttribute("collapsed")) {
        folder.removeAttribute(OPEN_IN_CLOSED);
      }
      // shut as Zen leaves the tabs it hides, held so in their own style: left to
      // the closed folder's rules alone, they sprang back to full height for a
      // moment as the folder round it next opened, the tab shown dropping down
      for (const animation of moving) {
        try {
          animation.commitStyles();
        } catch (err) {}
        animation.cancel();
      }
    }, IN_CLOSED_SETTLE_MS);
  }

  function onOpenInClosedExpand(event) {
    const folder = event.target;
    if (!isFolder(folder)) {
      return;
    }
    unmarkOpenInClosed(folder);
    if (folder.hasAttribute(OPEN_IN_CLOSED)) {
      clearTimeout(folder.ziaClosingTimer);
      folder.removeAttribute(CLOSING_IN_CLOSED);
      swingKeptFolder(folder, true);
    }
  }

  // A folder opening round an open inner folder: Zen reveals only its own rows, so
  // the inner folder's tabs stayed hidden until tidied, then snapped in.
  function revealOpenSubfolders() {
    window.addEventListener(
      "TabGroupExpand",
      (event) => {
        const folder = event.target;
        if (folder?.localName !== "zen-folder") {
          return;
        }
        for (const inner of folder.querySelectorAll("zen-folder:not([collapsed]):not([has-active])")) {
          const hidden = (inner.allItems || []).filter((item) => item.style.height === "0px" || item.style.opacity === "0");
          if (hidden.length) {
            window.gZenFolders?.styleCleanup?.(hidden);
          }
        }
      },
      true
    );
  }

