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
    const value = getComputedStyle(layer).getPropertyValue(name);
    const rootStyle = getComputedStyle(root);
    const tintText = rootStyle.getPropertyValue("--zia-media-bg");
    const baseText = rootStyle.getPropertyValue("--zia-media-card-base");
    // (only when one of them changed: worked out again for nothing, it
    // wrote to the window's root each time, restyling the whole window)
    const key = `${value}|${tintText}|${baseText}`;
    if (key === syncSidebarPaint.key) {
      return;
    }
    syncSidebarPaint.key = key;
    const paint = paintColor(value);
    const tint = resolveColor(tintText);
    const base = resolveColor(baseText);
    if (!paint || !tint || !base) {
      root.style.removeProperty("--zia-media-rest");
      root.style.removeProperty("--zia-media-solid");
      return;
    }

    root.style.setProperty("--zia-media-rest", cssColor(colorOver(tint, paint)));

    root.style.setProperty("--zia-media-solid", cssColor(colorOver(tint, colorOver(paint, base))));
  }

  // Light spaces (23-light-spaces.css): a space whose colour is light, which
  // Zen marks zen-should-be-dark-mode="false", and also a window with no
  // space colour at all in light mode: Zen leaves the mark off then and
  // goes by the window's own light or dark, so Zia drew its dark look, white
  // text on the pale window. Mirrored to :root[zia-light].
  function watchLightSpace() {
    const update = () => {
      const mark = root.getAttribute("zen-should-be-dark-mode");
      let light = mark === "false";
      if (mark === null) {
        try {
          light = window.gZenThemePicker ? !window.gZenThemePicker.isDarkMode : window.matchMedia("(prefers-color-scheme: light)").matches;
        } catch (err) {
          light = false;
        }
      }
      if (root.hasAttribute("zia-light") !== light) {
        root.toggleAttribute("zia-light", light);
      }
    };
    update();
    new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ["zen-should-be-dark-mode", "zen-default-theme"] });
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", update);
    Services.obs.addObserver(update, "zen-theme-change");
    window.addEventListener("unload", () => Services.obs.removeObserver(update, "zen-theme-change"), { once: true });
  }

  function watchSidebarPaint() {
    syncSidebarPaint();
    // Zen writes the backdrop's style on every frame of a swipe between
    // spaces (fading one space's colour into the next), and each write ran
    // this: style worked out several times over and the whole window
    // restyled, every frame, which was much of a swipe's stutter. Once a
    // frame at most now, and not mid-swipe or mid-switch (the colours are on
    // their way somewhere else): once it's over.
    let frame = 0;
    const schedule = () => {
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!root.hasAttribute("animating-background")) {
          syncSidebarPaint();
        }
      });
    };
    const watcher = new MutationObserver(schedule);
    watcher.observe(root, { attributes: true, attributeFilter: ["animating-background"] });
    for (const id of ["zen-browser-background", "zen-toolbar-background"]) {
      const layer = document.getElementById(id);
      if (layer) {
        watcher.observe(layer, { attributes: true, attributeFilter: ["style"] });
      }
    }
    // (a light space has its own, white music card)
    watcher.observe(root, { attributes: true, attributeFilter: ["zen-compact-mode", "zen-should-be-dark-mode", "zia-light"] });
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

