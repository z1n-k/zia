  // Compact mode: the sidebar's top row (and macOS's window buttons) moved up into the title bar,
  // the panel marked open while the sidebar's out, and the top bar cut away under the sidebar.
  // Used elsewhere: watchCompactTopRow.

  const SIDEBAR_SHOWN_ATTRS = ["zen-has-hover", "zen-user-show", "zen-has-empty-tab", "flash-popup", "has-popup-menu", "movingtab", "zen-compact-mode-active"];
  const compactTop = {
    toolbox: null,
    coverFrame: 0,
    coverStill: 0,
    coverLast: "",
  };
  const inCompactMode = () => root.getAttribute("zen-compact-mode") === "true";

  function watchCompactTopRow() {
    const navBar = document.getElementById("nav-bar");
    if (!navBar) {
      return;
    }
    new MutationObserver(moveTopRow).observe(navBar, { childList: true });

    const toolbox = document.getElementById("navigator-toolbox");
    compactTop.toolbox = toolbox;
    if (toolbox) {
      new MutationObserver(syncPanelOpen).observe(toolbox, { attributes: true, attributeFilter: SIDEBAR_SHOWN_ATTRS });
    }
    window.addEventListener("resize", followCover);
    const urlbar = document.getElementById("urlbar");
    if (urlbar) {
      urlbar.addEventListener("focus", followCover, true);
      urlbar.addEventListener("blur", followCover, true);
      new MutationObserver(followCover).observe(urlbar, { attributes: true, attributeFilter: ["breakout-extend"] });
    }
    new MutationObserver(() => {
      moveTopRow();
      syncPanelOpen();
    }).observe(root, { attributes: true, attributeFilter: ["zen-compact-mode"] });

    moveTopRow();
    syncPanelOpen();
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
    const buttons = window.gZenVerticalTabsManager?.actualWindowButtons;
    if (buttons && buttons.parentElement !== topButtons) {
      topButtons.prepend(buttons);
    }
  }

  function syncPanelOpen() {
    const { toolbox } = compactTop;
    const shown = inCompactMode() && !!toolbox && SIDEBAR_SHOWN_ATTRS.some((name) => toolbox.hasAttribute(name));
    setFlag("zia-panel-open", shown);
    followCover();
  }

  // The top toolbar stays up while the sidebar is out, cut away only where
  // the sidebar covers it (see-through, the address showed through it).
  // It follows the sidebar as it slides, frame by frame, until it settles.
  function coveredBars() {
    const { toolbox } = compactTop;
    return [
      document.getElementById("zen-appcontent-navbar-container"),
      document.getElementById("urlbar"),
    ].filter((el) => el && !toolbox?.contains(el));
  }

  function cutUnderSidebar(el, over) {
    let start = 0;
    let end = 0;
    if (over && el.getAttribute("breakout-extend") !== "true") {
      const box = el.getBoundingClientRect();
      const across = over.bottom > box.top && over.top < box.bottom && over.right > box.left && over.left < box.right;
      if (across) {
        const onLeft = over.left + over.width / 2 < window.innerWidth / 2;
        start = onLeft ? Math.min(box.width, Math.max(0, over.right - box.left)) : 0;
        end = onLeft ? 0 : Math.min(box.width, Math.max(0, box.right - over.left));
      }
    }
    const clip = start || end ? `inset(0 ${Math.ceil(end)}px 0 ${Math.ceil(start)}px)` : "";
    if (el.style.clipPath !== clip) {
      el.style.clipPath = clip;
    }
    return clip;
  }

  function cutCoveredBars() {
    const { toolbox } = compactTop;
    compactTop.coverFrame = 0;
    // (shown, or sliding in or out: hidden, it's off screen and unseen)
    const out = inCompactMode() && toolbox && getComputedStyle(toolbox).visibility !== "hidden";
    let over = null;
    if (out) {
      // (the sidebar's own card: the toolbox's padding round it is clear)
      const box = toolbox.getBoundingClientRect();
      const style = getComputedStyle(toolbox);
      const left = box.left + (parseFloat(style.paddingLeft) || 0);
      const right = box.right - (parseFloat(style.paddingRight) || 0);
      over = { left, right, top: box.top, bottom: box.bottom, width: Math.max(0, right - left) };
    }
    const now = coveredBars().map((el) => cutUnderSidebar(el, over && over.width ? over : null)).join("|");
    compactTop.coverStill = now === compactTop.coverLast ? compactTop.coverStill + 1 : 0;
    compactTop.coverLast = now;
    if (compactTop.coverStill < 8) {
      compactTop.coverFrame = requestAnimationFrame(cutCoveredBars);
    }
  }

  function followCover() {
    compactTop.coverStill = 0;
    if (!compactTop.coverFrame) {
      compactTop.coverFrame = requestAnimationFrame(cutCoveredBars);
    }
  }

