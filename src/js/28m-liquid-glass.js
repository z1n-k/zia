  // ---------- Liquid glass (an option): the bend in essentials
  // Each essential holds a copy of Zen's space background, lined up with the
  // real one, under its tint and icon; liquid-glass/liquid-glass.js (gentpan's
  // liquidglass, MIT) bends that copy at the tile's rim with an SVG
  // displacement map. That's a plain CSS filter on the copy, the one form
  // Firefox draws (bending what's behind with backdrop-filter is Chrome's
  // alone), so the glass bends Zen's own background, never the desktop
  // through a see-through window.
  const LIQUID_GLASS_PREF = "zia.liquid-glass";
  // (just the bend: the rim is Zia's hairlines, in 27-liquid-glass.css)
  const LIQUID_GLASS_OPTICS = { bezel: 0.5, curvature: 4, chroma: 0.05, specular: 0 };

  function watchLiquidGlass() {
    // tile → { copy, glass }
    const lenses = new Map();
    let watchers = null;
    let frame = 0;

    const spaceBackground = () => {
      const compact = root.getAttribute("zen-compact-mode") === "true";
      const layer = document.getElementById(compact ? "zen-toolbar-background" : "zen-browser-background");
      if (!layer) {
        return null;
      }
      const name = compact ? "--zen-main-browser-background-toolbar" : "--zen-main-browser-background";
      let paint = getComputedStyle(layer).getPropertyValue(name).trim();
      if (!paint) {
        return null;
      }
      // (a single colour, as one layer, so it can sit in background-image)
      if (!/gradient\(/.test(paint)) {
        paint = `linear-gradient(${paint}, ${paint})`;
      }
      return { paint, box: layer.getBoundingClientRect() };
    };

    const align = () => {
      frame = 0;
      const back = spaceBackground();
      const tiles = new Set(document.querySelectorAll(".tabbrowser-tab[zen-essential] > .tab-stack > .tab-background"));
      for (const [tile, lens] of lenses) {
        if (!tiles.has(tile)) {
          lens.glass?.destroy();
          lens.copy.remove();
          lenses.delete(tile);
        }
      }
      if (!back) {
        return;
      }
      for (const tile of tiles) {
        let lens = lenses.get(tile);
        if (!lens) {
          const copy = document.createElementNS(XHTML_NS, "div");
          copy.className = "zia-glass-copy";
          tile.parentNode.prepend(copy);
          lens = { copy, glass: null };
          lenses.set(tile, lens);
        }
        const { copy } = lens;
        const stack = tile.parentNode.getBoundingClientRect();
        const box = tile.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) {
          continue;
        }
        const radius = parseFloat(getComputedStyle(tile).borderTopLeftRadius) || 0;
        Object.assign(copy.style, {
          left: `${box.left - stack.left}px`,
          top: `${box.top - stack.top}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
          borderRadius: `${radius}px`,
          backgroundImage: back.paint,
          backgroundSize: `${back.box.width}px ${back.box.height}px`,
          backgroundPosition: `${back.box.left - box.left}px ${back.box.top - box.top}px`,
        });
        const optics = { radius, refraction: Math.round(Math.min(box.width, box.height) * 0.2) };
        if (lens.glass) {
          lens.glass.update(optics);
        } else {
          lens.glass = window.__ziaLiquidGlass.createGlass(copy, { ...LIQUID_GLASS_OPTICS, ...optics, fit: true, clip: true });
        }
      }
    };
    const alignSoon = () => {
      if (!frame) {
        frame = requestAnimationFrame(align);
      }
    };

    // Pressed: a soft light under the pointer, as on Tahoe's buttons, fading
    // once let go (27-liquid-glass.css). Marked on the tab, folder or button,
    // with where the press is inside the box that lights up.
    const PRESSABLE = [
      [".tabbrowser-tab", (hit) => hit, (owner) => owner.querySelector(":scope > .tab-stack > .tab-background")],
      [":is(zen-folder, tab-group:not([split-view-group])) > .tab-group-label-container", (hit) => hit.parentNode, (owner) => owner],
      ["zen-library :is(.zen-library-filter-button, .zen-library-filter-done, .zen-library-filter-chip)", (hit) => hit, (owner) => owner],
    ];
    let pressed = null;
    let pressedBox = null;
    let pressedAt = 0;
    const placeLight = (event) => {
      const box = pressedBox?.getBoundingClientRect();
      if (box) {
        pressed.style.setProperty("--zia-press-x", `${event.clientX - box.left}px`);
        pressed.style.setProperty("--zia-press-y", `${event.clientY - box.top}px`);
      }
    };
    // (held, the light follows the pointer, even off the button)
    const follow = (event) => {
      if (pressed) {
        placeLight(event);
      }
    };
    const press = (event) => {
      if (event.button !== 0) {
        return;
      }
      for (const node of event.composedPath()) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }
        const match = PRESSABLE.find(([selector]) => node.matches(selector));
        if (!match) {
          continue;
        }
        const owner = match[1](node);
        const lit = match[2](owner);
        if (!lit) {
          return;
        }
        pressed = owner;
        pressedBox = lit;
        placeLight(event);
        owner.setAttribute("zia-glass-press", "in");
        pressedAt = performance.now();
        return;
      }
    };
    const letGo = () => {
      const owner = pressed;
      pressed = null;
      pressedBox = null;
      if (!owner) {
        return;
      }
      // (a quick click still lights up for a moment before it fades)
      const lit = Math.max(0, 120 - (performance.now() - pressedAt));
      setTimeout(() => {
        if (owner.getAttribute("zia-glass-press") !== "in" || pressed === owner) {
          return;
        }
        owner.setAttribute("zia-glass-press", "out");
        setTimeout(() => {
          if (owner.getAttribute("zia-glass-press") === "out") {
            owner.removeAttribute("zia-glass-press");
            owner.style.removeProperty("--zia-press-x");
            owner.style.removeProperty("--zia-press-y");
          }
        }, 400);
      }, lit);
    };
    const PRESS_EVENTS = [
      ["pointerdown", press],
      ["pointermove", follow],
      ["pointerup", letGo],
      ["pointercancel", letGo],
      ["dragstart", letGo],
    ];

    const start = () => {
      if (watchers) {
        return;
      }
      if (!window.__ziaLiquidGlass) {
        try {
          Services.scriptloader.loadSubScript("chrome://sine/content/zia/liquid-glass/liquid-glass.js", window);
        } catch (err) {
          console.error("[Zia] Couldn't load liquid glass:", err);
          return;
        }
      }
      const resized = new ResizeObserver(alignSoon);
      const changed = new MutationObserver(alignSoon);
      for (const id of ["zen-browser-background", "zen-toolbar-background"]) {
        const layer = document.getElementById(id);
        if (layer) {
          changed.observe(layer, { attributes: true, attributeFilter: ["style"] });
        }
      }
      changed.observe(root, { attributes: true, attributeFilter: ["zen-compact-mode", "zen-sidebar-expanded", "zia-light"] });
      const tabs = document.getElementById("tabbrowser-tabs") || document.getElementById("navigator-toolbox");
      if (tabs) {
        changed.observe(tabs, { childList: true, subtree: true, attributes: true, attributeFilter: ["zen-essential", "visuallyselected"] });
        resized.observe(tabs);
      }
      const toolbox = document.getElementById("navigator-toolbox");
      toolbox?.addEventListener("transitionend", alignSoon);
      window.addEventListener("resize", alignSoon);
      for (const [type, handler] of PRESS_EVENTS) {
        window.addEventListener(type, handler, true);
      }
      watchers = { resized, changed, toolbox };
      root.setAttribute("zia-liquid-glass", "true");
      align();
    };

    const stop = () => {
      if (!watchers) {
        return;
      }
      watchers.resized.disconnect();
      watchers.changed.disconnect();
      watchers.toolbox?.removeEventListener("transitionend", alignSoon);
      window.removeEventListener("resize", alignSoon);
      for (const [type, handler] of PRESS_EVENTS) {
        window.removeEventListener(type, handler, true);
      }
      letGo();
      watchers = null;
      cancelAnimationFrame(frame);
      frame = 0;
      for (const { copy, glass } of lenses.values()) {
        glass?.destroy();
        copy.remove();
      }
      lenses.clear();
      root.removeAttribute("zia-liquid-glass");
    };

    const apply = () => (Services.prefs.getBoolPref(LIQUID_GLASS_PREF, false) ? start() : stop());
    apply();
    Services.prefs.addObserver(LIQUID_GLASS_PREF, apply);
    window.addEventListener("unload", () => Services.prefs.removeObserver(LIQUID_GLASS_PREF, apply), { once: true });
  }

