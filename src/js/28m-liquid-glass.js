  // ---------- Zia's glass: the light where it's pressed
  function watchLiquidGlass() {
    // Pressed: a soft light under the pointer, fading once let go
    // (27-liquid-glass.css), on what has the glass. Marked on the
    // essential, folder or button, with where the press is inside the box
    // that lights up.
    const PRESSABLE = [
      // (essentials, not the plain tabs, which have no glass)
      [".tabbrowser-tab[zen-essential]", (hit) => hit, (owner) => owner.querySelector(":scope > .tab-stack > .tab-background")],
      [":is(zen-folder, tab-group:not([split-view-group])) > .tab-group-label-container", (hit) => hit.parentNode, (owner) => owner],
      // (not Clear, whose icon is its background picture)
      ["zen-library :is(.zen-library-filter-button, .zen-library-filter-done, .zen-library-filter-chip):not(.zia-library-clear)", (hit) => hit, (owner) => owner],
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

    for (const [type, handler] of PRESS_EVENTS) {
      window.addEventListener(type, handler, true);
    }
  }
