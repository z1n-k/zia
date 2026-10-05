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
    // once let go (27-liquid-glass.css), on what has the glass. Marked on the
    // essential, folder or button,
    // with where the press is inside the box that lights up.
    const PRESSABLE = [
      // (essentials, not the plain tabs, which have no glass)
      [".tabbrowser-tab[zen-essential]", (hit) => hit, (owner) => owner.querySelector(":scope > .tab-stack > .tab-background")],
      [":is(zen-folder, tab-group:not([split-view-group])) > .tab-group-label-container", (hit) => hit.parentNode, (owner) => owner],
      ["zen-library :is(.zen-library-filter-button, .zen-library-filter-done, .zen-library-filter-chip)", (hit) => hit, (owner) => owner],
      // (the chosen Library section lights the tile that slides behind it,
      // so it shines too; another lights its own hover tile, as the sliding
      // one's still behind the old section until the press is let go)
      ["zen-library .zen-library-tab", (hit) => (hit.hasAttribute("active") ? hit.parentNode.querySelector(":scope > .zia-library-rail") : hit), (owner, hit) => hit],
    ];
    let pressed = null;
    let pressedBox = null;
    let pressedAt = 0;
    // The light's strength, eased here rather than by a CSS transition: that
    // needs the colours registered with @property, which Zen's stylesheets
    // for mods don't take, so the light only ever snapped off.
    const shines = new Map();
    const rgba = (name) => {
      const parts = getComputedStyle(root).getPropertyValue(name).match(/[\d.]+/g)?.map(Number) || [255, 255, 255, 0];
      return parts.length > 3 ? parts : [...parts, 1];
    };
    const shine = (owner, to, ms, done) => {
      const run = shines.get(owner) || { level: 0, frame: 0 };
      cancelAnimationFrame(run.frame);
      shines.set(owner, run);
      const light = rgba("--zia-glass-press-light");
      const wash = rgba("--zia-glass-press-wash");
      const from = run.level;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        // (ease out)
        run.level = from + (to - from) * (1 - (1 - t) ** 3);
        const paint = ([r, g, b, a]) => `rgba(${r}, ${g}, ${b}, ${a * run.level})`;
        owner.style.setProperty("--zia-press-light", paint(light));
        owner.style.setProperty("--zia-press-wash", paint(wash));
        if (t < 1) {
          run.frame = requestAnimationFrame(step);
        } else {
          run.frame = 0;
          done?.();
        }
      };
      run.frame = requestAnimationFrame(step);
    };
    const placeLight = (event) => {
      const box = pressedBox?.getBoundingClientRect();
      if (box) {
        pressed.style.setProperty("--zia-press-x", `${event.clientX - box.left}px`);
        pressed.style.setProperty("--zia-press-y", `${event.clientY - box.top}px`);
      }
    };
    // (held, the light follows the pointer, even off the button, and on
    // through a drag: holding and moving a tab or essential starts one,
    // which cancels the pointer, so the light waits for the real release)
    const follow = (event) => {
      if (pressed && (event.clientX || event.clientY)) {
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
        const lit = owner && match[2](owner, node);
        if (!lit) {
          return;
        }
        pressed = owner;
        pressedBox = lit;
        placeLight(event);
        owner.setAttribute("zia-glass-press", "in");
        pressedAt = performance.now();
        shine(owner, 1, 60);
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
        shine(owner, 0, 280, () => {
          if (owner.getAttribute("zia-glass-press") === "out") {
            owner.removeAttribute("zia-glass-press");
            for (const name of ["--zia-press-x", "--zia-press-y", "--zia-press-light", "--zia-press-wash"]) {
              owner.style.removeProperty(name);
            }
            shines.delete(owner);
          }
        });
      }, lit);
    };
    const PRESS_EVENTS = [
      ["pointerdown", press],
      ["pointermove", follow],
      ["mousemove", follow],
      ["dragover", follow],
      ["pointerup", letGo],
      ["mouseup", letGo],
      ["dragend", letGo],
      ["drop", letGo],
      // (the window losing focus mid-press; not a field inside it)
      ["blur", (event) => event.target === window && letGo()],
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

