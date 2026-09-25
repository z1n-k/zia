  function watchCompactTopRow() {
    const navBar = document.getElementById("nav-bar");
    if (!navBar) {
      return;
    }

    function inCompactMode() {
      return root.getAttribute("zen-compact-mode") === "true";
    }

    function windowButtons() {
      return window.gZenVerticalTabsManager?.actualWindowButtons || null;
    }

    function moveTopRow() {
      if (!inCompactMode()) {
        return;
      }
      const titlebar = document.getElementById("titlebar");
      const topButtons = document.getElementById("zen-sidebar-top-buttons");
      if (!titlebar || !topButtons) {
        return;
      }
      if (topButtons.parentElement !== titlebar) {
        titlebar.prepend(topButtons);
      }
      // Windows' minimise, maximise and close stay top right, where Zen puts
      // them; only macOS's traffic lights join the sidebar's top row.
      if (window.gZenVerticalTabsManager?.isWindowsStyledButtons) {
        return;
      }
      const buttons = windowButtons();
      if (buttons && buttons.parentElement !== topButtons) {
        topButtons.prepend(buttons);
      }
    }

    const watcher = new MutationObserver(() => moveTopRow());
    watcher.observe(navBar, { childList: true });

    const toolbox = document.getElementById("navigator-toolbox");
    const SIDEBAR_SHOWN_ATTRS = ["zen-has-hover", "zen-user-show", "zen-has-empty-tab", "flash-popup", "has-popup-menu", "movingtab", "zen-compact-mode-active"];

    function syncPanelOpen() {
      const shown = inCompactMode() && !!toolbox && SIDEBAR_SHOWN_ATTRS.some((name) => toolbox.hasAttribute(name));
      setFlag("zia-panel-open", shown);
    }

    if (toolbox) {
      const panelWatcher = new MutationObserver(syncPanelOpen);
      panelWatcher.observe(toolbox, { attributes: true, attributeFilter: SIDEBAR_SHOWN_ATTRS });
    }

    const modeWatcher = new MutationObserver(() => {
      moveTopRow();
      syncPanelOpen();
    });
    modeWatcher.observe(root, { attributes: true, attributeFilter: ["zen-compact-mode"] });

    moveTopRow();
    syncPanelOpen();
  }

