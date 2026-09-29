  // Zia lets you make a folder before it has any tabs (Dia doesn't), so an
  // empty one says so: open, it shows a dashed "Drag tabs here" slot, which
  // steps aside for a tab dragged into it (chrome.css).
  // Zen keeps a hidden placeholder tab in every empty folder, so a folder
  // counts as empty when that's all it holds.
  function isEmptyFolder(folder) {
    const container = folder.querySelector(":scope > .tab-group-container");
    if (!container) {
      return false;
    }
    return ![...container.children].some(
      (child) =>
        child.localName === "zen-folder" ||
        // (a split in it too: it kept its slot, showing under the split)
        child.localName === "tab-group" ||
        (child.classList.contains("tabbrowser-tab") && !child.hasAttribute("zen-empty-tab"))
    );
  }

  // The slot is sized from a real tab in the sidebar (its background, the gaps
  // around it and how far it's inset in a folder), so it's exactly where the
  // first tab will sit, and a tab dragged in replaces it without anything
  // moving. Measured from a tab inside an open folder when there is one.
  const FOLDER_SLOT_INSET = { start: 14, end: 5 };
  let slotSize = "";
  function measureFolderSlot() {
    const visible = (tab) => tab.getBoundingClientRect().height > 8 && !tab.hasAttribute("zen-empty-tab");
    const inFolder = [...document.querySelectorAll("zen-folder:not([collapsed]) > .tab-group-container > .tabbrowser-tab")].find(visible);
    const tab =
      inFolder || [...document.querySelectorAll("#tabbrowser-tabs .tabbrowser-tab:not([zen-essential])")].find(visible);
    const bg = tab?.querySelector(":scope > .tab-stack > .tab-background");
    if (!tab || !bg) {
      return;
    }
    const t = tab.getBoundingClientRect();
    const b = bg.getBoundingClientRect();
    const style = getComputedStyle(tab);
    const top = (parseFloat(style.marginTop) || 0) + (b.top - t.top);
    const bottom = (parseFloat(style.marginBottom) || 0) + (t.bottom - b.bottom);
    let start;
    let end;
    if (inFolder) {
      const box = tab.parentElement.getBoundingClientRect();
      start = b.left - box.left;
      end = box.right - b.right;
    } else {
      start = FOLDER_SLOT_INSET.start + (b.left - t.left);
      end = FOLDER_SLOT_INSET.end + (t.right - b.right);
    }
    // Same gap on the right as at the bottom, inside an open empty folder's box
    const probe = document.querySelector("zen-folder[zia-empty]:not([collapsed])");
    const container = probe?.querySelector(":scope > .tab-group-container");
    if (probe && container) {
      const box = getComputedStyle(probe, "::before");
      const folderBox = probe.getBoundingClientRect();
      const inner = container.getBoundingClientRect();
      const boxRight = folderBox.right - (parseFloat(box.right) || 0);
      const boxBottom = folderBox.bottom - (parseFloat(box.bottom) || 0);
      // (the list's own padding below the slot is part of that gap)
      const gap = boxBottom - (inner.bottom - (parseFloat(getComputedStyle(container).paddingBottom) || 0) - bottom);
      if (gap > 0 && gap < 20) {
        end = inner.right - (boxRight - gap);
      }
    }
    const next = [top, bottom, start, end, b.height].map((n) => `${Math.round(n * 2) / 2}px`).join(" ");
    if (next === slotSize) {
      return;
    }
    slotSize = next;
    const [mt, mb, ms, me, h] = next.split(" ");
    for (const [name, value] of [["--zia-slot-mt", mt], ["--zia-slot-mb", mb], ["--zia-slot-ms", ms], ["--zia-slot-me", me], ["--zia-slot-h", h]]) {
      root.style.setProperty(name, value);
    }
  }

  // A folder emptied by moving its last tab out collapses; an open empty
  // folder (new, or opened by hand) shows the slot.
  const wasEmpty = new WeakMap();

  function markEmptyFolders() {
    let open = false;
    for (const folder of document.querySelectorAll("zen-folder")) {
      const empty = isEmptyFolder(folder);
      folder.toggleAttribute("zia-empty", empty);
      if (empty && wasEmpty.get(folder) === false && !folder.hasAttribute("collapsed")) {
        try {
          folder.collapsed = true;
        } catch (err) {
          noteError("folder empty: collapse", err);
        }
      }
      wasEmpty.set(folder, empty);
      open ||= empty && !folder.hasAttribute("collapsed");
    }
    if (open) {
      measureFolderSlot();
    }
  }

  function watchEmptyFolders() {
    const tabs = document.getElementById("tabbrowser-tabs");
    if (!tabs) {
      return;
    }
    let frame = 0;
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          markEmptyFolders();
        });
      }
    };
    new MutationObserver(schedule).observe(tabs, { childList: true, subtree: true });
    // An empty folder opens by sliding its slot down into view, as a folder
    // does its tabs. Emptied (its last tab dragged out) and shut, Zen had
    // measured it with no slot showing, so it was only 4px up out of view
    // and opened with a snap. It's put a slot's height up before Zen opens it.
    window.addEventListener(
      "TabGroupExpand",
      (event) => {
        const folder = event.target;
        if (folder?.localName !== "zen-folder" || !folder.hasAttribute("zia-empty")) {
          return;
        }
        const start = folder.groupStartElement;
        if (!start) {
          return;
        }
        const vars = getComputedStyle(document.documentElement);
        const px = (name, fallback) => parseFloat(vars.getPropertyValue(name)) || fallback;
        const room = px("--zia-slot-h", 35) + px("--zia-slot-mt", 2) + px("--zia-slot-mb", 2);
        if ((parseFloat(getComputedStyle(start).marginTop) || 0) > -room) {
          start.style.marginTop = `${-(room + 4)}px`;
        }
      },
      true
    );
    for (const type of ["TabGroupCreate", "TabGrouped", "TabUngrouped", "TabClose", "TabMove", "TabGroupExpand"]) {
      gBrowser.tabContainer.addEventListener(type, schedule);
    }
    window.addEventListener("ZenWorkspacesUIUpdate", schedule);
    // The sidebar's width changes a tab's size
    new ResizeObserver(schedule).observe(tabs);
    schedule();
  }

