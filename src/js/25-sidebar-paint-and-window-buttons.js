  function resolveColor(text) {
    if (!text) {
      return null;
    }
    let probe = document.getElementById("zia-color-probe");
    if (!probe) {
      probe = document.createElementNS(XHTML_NS, "div");
      probe.id = "zia-color-probe";
      probe.hidden = true;
      root.appendChild(probe);
    }
    probe.style.color = "";
    probe.style.color = text.trim();
    if (!probe.style.color) {
      return null;
    }
    return parseColor(getComputedStyle(probe).color);
  }

  const COLOR_TOKEN = /(?:rgba?|hsla?|color-mix|light-dark|oklch|oklab|lab|lch|color)\((?:[^()]|\([^()]*\))*\)|#[0-9a-fA-F]{3,8}\b|\btransparent\b/g;

  function paintColor(value) {
    if (!/gradient\(/.test(value)) {
      return resolveColor(value);
    }
    const stops = (value.match(COLOR_TOKEN) || []).map(resolveColor).filter(Boolean);
    if (!stops.length) {
      return null;
    }
    return [0, 1, 2, 3].map((i) => Math.round(stops.reduce((sum, c) => sum + c[i], 0) / stops.length));
  }

  function syncSidebarPaint() {
    const compact = root.getAttribute("zen-compact-mode") === "true";
    const layer = document.getElementById(compact ? "zen-toolbar-background" : "zen-browser-background");
    if (!layer) {
      return;
    }
    const name = compact ? "--zen-main-browser-background-toolbar" : "--zen-main-browser-background";
    const paint = paintColor(getComputedStyle(layer).getPropertyValue(name));
    const rootStyle = getComputedStyle(root);
    const tint = resolveColor(rootStyle.getPropertyValue("--zia-media-bg"));
    const base = resolveColor(rootStyle.getPropertyValue("--zia-media-card-base"));
    if (!paint || !tint || !base) {
      root.style.removeProperty("--zia-media-rest");
      root.style.removeProperty("--zia-media-solid");
      return;
    }

    root.style.setProperty("--zia-media-rest", cssColor(colorOver(tint, paint)));

    root.style.setProperty("--zia-media-solid", cssColor(colorOver(tint, colorOver(paint, base))));
  }

  function watchSidebarPaint() {
    syncSidebarPaint();
    const watcher = new MutationObserver(syncSidebarPaint);
    for (const id of ["zen-browser-background", "zen-toolbar-background"]) {
      const layer = document.getElementById(id);
      if (layer) {
        watcher.observe(layer, { attributes: true, attributeFilter: ["style"] });
      }
    }
    // (a light space has its own, white music card)
    watcher.observe(root, { attributes: true, attributeFilter: ["zen-compact-mode", "zen-should-be-dark-mode"] });
  }

  function keepWindowButtonsInSidebar() {
    const manager = window.gZenVerticalTabsManager;
    if (!manager || manager.isWindowsStyledButtons) {
      return;
    }
    const wanted =
      root.getAttribute("zen-right-side") === "true" &&
      root.getAttribute("zen-compact-mode") !== "true" &&
      root.hasAttribute("zen-sidebar-expanded");
    if (!wanted) {
      return;
    }
    const buttons = manager.actualWindowButtons;
    const topButtons = document.getElementById("zen-sidebar-top-buttons");
    if (buttons && topButtons && buttons.parentNode !== topButtons) {
      topButtons.prepend(buttons);
    }
  }

  function watchWindowButtonsSide() {
    const soon = () => setTimeout(keepWindowButtonsInSidebar, 0);
    soon();
    setTimeout(keepWindowButtonsInSidebar, 1000);
    const watcher = new MutationObserver(soon);
    watcher.observe(root, {
      attributes: true,
      attributeFilter: ["zen-right-side", "zen-compact-mode", "zen-sidebar-expanded", "zen-single-toolbar"],
    });
    const navBar = document.getElementById("nav-bar");
    if (navBar) {
      watcher.observe(navBar, { childList: true });
    }
  }

