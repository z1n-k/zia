
  // A site's toolbar colour set by hand (right-click the address bar or toolbar):
  // click the page or type a hex. A site with its own colour is never read again,
  // so it can't flicker.
  const MANUAL_COLORS_PREF = "zia.toolbar.manual-colors";
  let manualColors = null;
  let colorPick = null;

  function loadManualColors() {
    if (manualColors) {
      return manualColors;
    }
    manualColors = {};
    try {
      const saved = JSON.parse(Services.prefs.getStringPref(MANUAL_COLORS_PREF, "{}"));
      if (saved && typeof saved === "object") {
        manualColors = saved;
      }
    } catch (err) {
      noteError("toolbar colour: load", err);
    }
    return manualColors;
  }

  function manualSiteColor(browser) {
    const host = browser && siteKey(browser);
    const value = host && loadManualColors()[host];
    return typeof value === "string" ? value.split(",").map(Number) : null;
  }

  function setManualSiteColor(host, rgb) {
    if (!host) {
      return;
    }
    const colors = loadManualColors();
    if (rgb) {
      colors[host] = rgb.slice(0, 3).join(",");
    } else {
      delete colors[host];
    }
    try {
      Services.prefs.setStringPref(MANUAL_COLORS_PREF, JSON.stringify(colors));
    } catch (err) {
      noteError("toolbar colour: save", err);
    }
  }

  function hexOf(rgb) {
    return "#" + rgb.slice(0, 3).map((c) => c.toString(16).padStart(2, "0")).join("");
  }

  function rgbOfHex(text) {
    const hex = text.trim().replace(/^#/, "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
    if (!hex) {
      return null;
    }
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }

  // back to the site's own colour if it has one, or a fresh reading
  function restoreToolbarColor(browser) {
    const manual = manualSiteColor(browser);
    if (manual) {
      showColor(manual);
      colorCache.set(browser, manual);
    } else {
      showColor(colorCache.get(browser) ?? null);
      updateColor();
    }
  }

  async function snapshotPage(browser) {
    const windowGlobal = browser?.browsingContext?.currentWindowGlobal;
    if (!windowGlobal || !browser.clientWidth) {
      return null;
    }
    const backing = browser.getAttribute("transparent") === "true" ? "transparent" : "rgb(255, 255, 255)";
    const bitmap = await windowGlobal.drawSnapshot(null, 1, backing);
    const canvas = document.createElementNS(XHTML_NS, "canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return {
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      width: canvas.width,
      height: canvas.height,
      scale: canvas.width / browser.clientWidth,
      backdrop: chromeBackdrop(browser),
    };
  }

  // The page's colour at a point (relative to the page's top left)
  function colorAt(shot, x, y) {
    const px = Math.min(shot.width - 1, Math.max(0, Math.floor(x * shot.scale)));
    const py = Math.min(shot.height - 1, Math.max(0, Math.floor(y * shot.scale)));
    const i = (py * shot.width + px) * 4;
    let rgb = [shot.data[i], shot.data[i + 1], shot.data[i + 2], shot.data[i + 3]];
    if (rgb[3] < 255) {
      rgb = colorOver(rgb, shot.backdrop);
    }
    return rgb.slice(0, 3);
  }

  async function startColorPick(browser) {
    endColorPick(false);
    const stack = browser?.closest(".browserStack");
    const host = siteKey(browser);
    if (!stack || !host) {
      return;
    }
    let shot = null;
    try {
      shot = await snapshotPage(browser);
    } catch (err) {
      noteError("toolbar colour: snapshot", err);
    }
    if (!shot || browser !== gBrowser.selectedBrowser) {
      return;
    }

    const el = (tag, className) => {
      const node = document.createElementNS(XHTML_NS, tag);
      if (className) {
        node.className = className;
      }
      return node;
    };
    const overlay = el("div");
    overlay.id = "zia-color-pick";
    const loupe = el("div", "zia-color-pick-loupe");
    const swatch = el("div", "zia-color-pick-swatch");
    const loupeHex = el("div", "zia-color-pick-hex");
    loupe.append(swatch, loupeHex);

    const bar = el("div", "zia-color-pick-bar");
    const hint = el("div", "zia-color-pick-hint");
    hint.textContent = `Click the page to color the toolbar for ${host}`;
    const input = el("input", "zia-color-pick-input");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("placeholder", "#hex");
    input.setAttribute("maxlength", "7");
    const saved = manualSiteColor(browser);
    input.value = saved ? hexOf(saved) : "";
    const reset = el("button", "zia-color-pick-reset");
    reset.textContent = "Reset";
    reset.hidden = !saved;
    const cancel = el("button", "zia-color-pick-cancel");
    cancel.textContent = "Cancel";
    bar.append(hint, input, reset, cancel);
    overlay.append(loupe, bar);
    stack.append(overlay);

    colorPick = { browser, overlay, shot, typed: null };

    // (kept for the site picking began on, should the page have moved on)
    const keep = (rgb) => {
      setManualSiteColor(host, rgb);
      endColorPick(true);
    };

    overlay.addEventListener("mousemove", (event) => {
      if (bar.contains(event.target)) {
        loupe.hidden = true;
        return;
      }
      const rect = overlay.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const rgb = colorAt(shot, x, y);
      loupe.hidden = false;
      loupe.style.translate = `${x + 14}px ${y + 14}px`;
      swatch.style.backgroundColor = cssColor(rgb);
      loupeHex.textContent = hexOf(rgb);
      colorPick.typed = null;
      showColor(rgb);
    });
    overlay.addEventListener("mouseleave", () => {
      loupe.hidden = true;
    });
    overlay.addEventListener("mousedown", (event) => {
      if (bar.contains(event.target) || event.button !== 0) {
        return;
      }
      event.preventDefault();
      const rect = overlay.getBoundingClientRect();
      keep(colorAt(shot, event.clientX - rect.left, event.clientY - rect.top));
    });
    input.addEventListener("input", () => {
      const rgb = rgbOfHex(input.value);
      input.toggleAttribute("invalid", !!input.value.trim() && !rgb);
      if (rgb) {
        colorPick.typed = rgb;
        showColor(rgb);
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const rgb = rgbOfHex(input.value);
        if (rgb) {
          keep(rgb);
        }
      }
    });
    reset.addEventListener("click", () => {
      setManualSiteColor(host, null);
      endColorPick(false);
    });
    cancel.addEventListener("click", () => endColorPick(false));
  }

  function endColorPick(kept) {
    if (!colorPick) {
      return;
    }
    const { browser, overlay } = colorPick;
    colorPick = null;
    overlay.remove();
    if (kept) {
      const manual = manualSiteColor(browser);
      colorCache.set(browser, manual);
      if (browser === gBrowser.selectedBrowser) {
        showColor(manual);
      }
    } else if (browser === gBrowser.selectedBrowser) {
      restoreToolbarColor(browser);
    }
  }

  function addToolbarColorMenuItems() {
    const added = new WeakMap();
    document.addEventListener(
      "popupshowing",
      (event) => {
        const menu = event.target;
        if (menu?.localName !== "menupopup") {
          return;
        }
        const trigger = menu.triggerNode;
        // (the address's own menu, Cut, Copy, Paste: not a submenu, nor one
        // of the bar's buttons' menus)
        const onUrlbar = menu.parentElement?.localName !== "menu" &&
          !!trigger?.closest?.("#urlbar :is(moz-input-box, .urlbar-input-box, .urlbar-input)");
        const onToolbar = menu.id === "toolbar-context-menu" && !!trigger?.closest?.("#zen-appcontent-navbar-wrapper, #nav-bar");
        let items = added.get(menu);
        if (!onUrlbar && !onToolbar) {
          if (items) {
            items.separator.hidden = items.pick.hidden = items.reset.hidden = true;
          }
          return;
        }
        if (!items) {
          const separator = document.createXULElement("menuseparator");
          const pick = document.createXULElement("menuitem");
          pick.setAttribute("label", "Toolbar Color for This Site…");
          pick.addEventListener("command", () => startColorPick(gBrowser.selectedBrowser));
          const reset = document.createXULElement("menuitem");
          reset.setAttribute("label", "Reset Toolbar Color");
          reset.addEventListener("command", () => {
            const browser = gBrowser.selectedBrowser;
            setManualSiteColor(siteKey(browser), null);
            restoreToolbarColor(browser);
          });
          menu.append(separator, pick, reset);
          items = { separator, pick, reset };
          added.set(menu, items);
        }
        const browser = gBrowser.selectedBrowser;
        const shown = siteColorOn() && !!siteKey(browser) && !isErrorPage(browser);
        items.separator.hidden = items.pick.hidden = !shown;
        items.reset.hidden = !shown || !manualSiteColor(browser);
      },
      true
    );

    window.addEventListener(
      "keydown",
      (event) => {
        if (colorPick && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          endColorPick(false);
        }
      },
      true
    );
    gBrowser.tabContainer.addEventListener("TabSelect", () => endColorPick(false));
    window.addEventListener("resize", () => endColorPick(false));
  }
