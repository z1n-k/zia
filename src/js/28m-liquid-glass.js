  // ---------- Zia's glass: the light where it's pressed
  // Pressed: a soft light under the pointer, fading once let go
  // (27-liquid-glass.css), on what has the glass. Marked on the
  // essential or button, with where the press is inside the box
  // that lights up.
  // Used elsewhere: watchLiquidGlass.
  const GLASS_PRESSABLE = [
    // (essentials, not the plain tabs, which have no glass)
    [".tabbrowser-tab[zen-essential]", (hit) => hit, (owner) => owner.querySelector(":scope > .tab-stack > .tab-background")],
    // (not Clear, whose icon is its background picture)
    ["zen-library :is(.zen-library-filter-button, .zen-library-filter-done, .zen-library-filter-chip):not(.zia-library-clear)", (hit) => hit, (owner) => owner],
    // (the chosen Library section lights the tile that slides behind it,
    // so it shines too; another lights its own hover tile, as the sliding
    // one's still behind the old section until the press is let go)
    ["zen-library .zen-library-tab", (hit) => (hit.hasAttribute("active") ? hit.parentNode.querySelector(":scope > .zia-library-rail") : hit), (owner, hit) => hit],
  ];
  const GLASS_SHINE_IN_MS = 60;
  const GLASS_SHINE_OUT_MS = 280;
  // (a quick click still lights up for this long before it fades)
  const GLASS_LIT_MS = 120;

  // What's pressed (the element marked), the box that lights up, and when
  const glassPress = { owner: null, box: null, at: 0 };
  // The light's strength, eased here rather than by a CSS transition: that
  // needs the colours registered with @property, which Zen's stylesheets
  // for mods don't take, so the light only ever snapped off.
  const glassShines = new Map();

  function glassColour(name) {
    const parts = getComputedStyle(root).getPropertyValue(name).match(/[\d.]+/g)?.map(Number) || [255, 255, 255, 0];
    return parts.length > 3 ? parts : [...parts, 1];
  }

  function shineGlass(owner, to, ms, done) {
    const run = glassShines.get(owner) || { level: 0, frame: 0 };
    cancelAnimationFrame(run.frame);
    glassShines.set(owner, run);
    const light = glassColour("--zia-glass-press-light");
    const wash = glassColour("--zia-glass-press-wash");
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
  }

  function placeGlassLight(event) {
    const box = glassPress.box?.getBoundingClientRect();
    if (box) {
      glassPress.owner.style.setProperty("--zia-press-x", `${event.clientX - box.left}px`);
      glassPress.owner.style.setProperty("--zia-press-y", `${event.clientY - box.top}px`);
    }
  }

  // (held, the light follows the pointer, even off the button, and on
  // through a drag: holding and moving a tab or essential starts one,
  // which cancels the pointer, so the light waits for the real release)
  function followGlassPress(event) {
    if (glassPress.owner && (event.clientX || event.clientY)) {
      placeGlassLight(event);
    }
  }

  function pressGlass(event) {
    // (only with Zia's glass on, an option)
    if (event.button !== 0 || !Services.prefs.getBoolPref("zia.glass", false)) {
      return;
    }
    for (const node of event.composedPath()) {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }
      const match = GLASS_PRESSABLE.find(([selector]) => node.matches(selector));
      if (!match) {
        continue;
      }
      const owner = match[1](node);
      const lit = owner && match[2](owner, node);
      if (!lit) {
        return;
      }
      glassPress.owner = owner;
      glassPress.box = lit;
      placeGlassLight(event);
      owner.setAttribute("zia-glass-press", "in");
      glassPress.at = performance.now();
      shineGlass(owner, 1, GLASS_SHINE_IN_MS);
      return;
    }
  }

  function letGoGlass() {
    const owner = glassPress.owner;
    glassPress.owner = null;
    glassPress.box = null;
    if (!owner) {
      return;
    }
    const lit = Math.max(0, GLASS_LIT_MS - (performance.now() - glassPress.at));
    // (not kept: it checks the press is still this one's before it fades)
    setTimeout(() => fadeGlassPress(owner), lit);
  }

  function fadeGlassPress(owner) {
    if (owner.getAttribute("zia-glass-press") !== "in" || glassPress.owner === owner) {
      return;
    }
    owner.setAttribute("zia-glass-press", "out");
    shineGlass(owner, 0, GLASS_SHINE_OUT_MS, () => {
      if (owner.getAttribute("zia-glass-press") === "out") {
        owner.removeAttribute("zia-glass-press");
        for (const name of ["--zia-press-x", "--zia-press-y", "--zia-press-light", "--zia-press-wash"]) {
          owner.style.removeProperty(name);
        }
        glassShines.delete(owner);
      }
    });
  }

  function watchLiquidGlass() {
    const PRESS_EVENTS = [
      ["pointerdown", pressGlass],
      ["pointermove", followGlassPress],
      ["mousemove", followGlassPress],
      ["dragover", followGlassPress],
      ["pointerup", letGoGlass],
      ["mouseup", letGoGlass],
      ["dragend", letGoGlass],
      ["drop", letGoGlass],
      // (the window losing focus mid-press; not a field inside it)
      ["blur", (event) => event.target === window && letGoGlass()],
    ];
    for (const [type, handler] of PRESS_EVENTS) {
      window.addEventListener(type, handler, true);
    }
  }
