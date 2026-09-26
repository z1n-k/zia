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
      followCover();
    }

    // The top toolbar stays up while the sidebar is out, cut away only where
    // the sidebar covers it (see-through, the address showed through it).
    // It follows the sidebar as it slides, frame by frame, until it settles.
    const covered = () => [
      document.getElementById("zen-appcontent-navbar-container"),
      document.getElementById("urlbar"),
    ].filter((el) => el && !toolbox?.contains(el));
    function cutUnder(el, over) {
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
    let coverFrame = 0;
    let coverStill = 0;
    let coverLast = "";
    function cover() {
      coverFrame = 0;
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
      const now = covered().map((el) => cutUnder(el, over && over.width ? over : null)).join("|");
      coverStill = now === coverLast ? coverStill + 1 : 0;
      coverLast = now;
      if (coverStill < 8) {
        coverFrame = requestAnimationFrame(cover);
      }
    }
    function followCover() {
      coverStill = 0;
      if (!coverFrame) {
        coverFrame = requestAnimationFrame(cover);
      }
    }

    if (toolbox) {
      const panelWatcher = new MutationObserver(syncPanelOpen);
      panelWatcher.observe(toolbox, { attributes: true, attributeFilter: SIDEBAR_SHOWN_ATTRS });
    }

    window.addEventListener("resize", followCover);
    document.getElementById("urlbar")?.addEventListener("focus", followCover, true);
    document.getElementById("urlbar")?.addEventListener("blur", followCover, true);
    if (document.getElementById("urlbar")) {
      new MutationObserver(followCover).observe(document.getElementById("urlbar"), { attributes: true, attributeFilter: ["breakout-extend"] });
    }

    const modeWatcher = new MutationObserver(() => {
      moveTopRow();
      syncPanelOpen();
    });
    modeWatcher.observe(root, { attributes: true, attributeFilter: ["zen-compact-mode"] });

    moveTopRow();
    syncPanelOpen();
  }

