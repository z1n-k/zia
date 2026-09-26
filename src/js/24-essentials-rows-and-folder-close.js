  // Optional: the last essential stretches across whatever's left of its row.
  // The grid can't span "to the end of the row" by itself, so Zia counts the
  // columns and sets the span.
  const FILL_ROW_PREF = "zia.essentials.fill-row";

  // The grid's own columns, worked out as the grid does (as many as fit at
  // the tiles' least width). Its computed column list also holds the extra
  // columns a span wider than the grid creates; counting those grew the
  // span, which made more of them, until tiles were squeezed into slivers.
  function gridColumns(grid) {
    const style = getComputedStyle(grid);
    const width = grid.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    const gap = parseFloat(style.columnGap) || 0;
    const least = parseFloat(getComputedStyle(root).getPropertyValue("--zia-essential-min-width")) || 54;
    return Math.max(1, Math.floor((width + gap) / (least + gap)));
  }

  function fillEssentialRows() {
    const on = Services.prefs.getBoolPref(FILL_ROW_PREF, false) && root.getAttribute("zen-sidebar-expanded") === "true";
    const wanted = new Map();
    if (on) {
      for (const grid of document.querySelectorAll(".zen-essentials-container")) {
        const tabs = [...grid.children].filter((tab) =>
          tab.matches?.(".tabbrowser-tab[zen-essential]:not([hidden], [zia-essential-proxy])")
        );
        const columns = gridColumns(grid);
        const empty = columns - (tabs.length % columns || columns);
        if (tabs.length && columns > 1 && empty > 0) {
          wanted.set(tabs[tabs.length - 1], empty + 1);
        }
      }
    }
    for (const tab of document.querySelectorAll(".tabbrowser-tab[zia-fill-row]")) {
      if (!wanted.has(tab)) {
        tab.removeAttribute("zia-fill-row");
        tab.style.removeProperty("grid-column");
      }
    }
    for (const [tab, span] of wanted) {
      if (tab.style.getPropertyValue("grid-column") !== `span ${span}`) {
        tab.style.setProperty("grid-column", `span ${span}`);
      }
      tab.setAttribute("zia-fill-row", "true");
    }
  }

  function watchEssentialRows() {
    const essentials = document.getElementById("zen-essentials");
    if (!essentials) {
      return;
    }
    let frame = 0;
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          fillEssentialRows();
        });
      }
    };
    new MutationObserver(schedule).observe(essentials, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "zen-essential"],
    });
    new ResizeObserver(schedule).observe(essentials);
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ["zen-sidebar-expanded"] });
    window.addEventListener("ZenWorkspacesUIUpdate", schedule);
    Services.prefs.addObserver(FILL_ROW_PREF, schedule);
    window.addEventListener("unload", () => Services.prefs.removeObserver(FILL_ROW_PREF, schedule));
    schedule();
  }

  function watchFolderCloseButtons() {
    const addAll = () => {
      for (const folder of document.querySelectorAll("zen-folder")) {
        addFolderCloseButton(folder);
      }
    };
    addAll();

    setTimeout(addAll, 1500);
    gBrowser.tabContainer.addEventListener("TabGroupCreate", (event) => addFolderCloseButton(event.target));
  }

