  // ---------- Thinking orbs: the orbs on screen, the one loop that draws them, and ziaOrb()
  // (see 28r-ultra-orb-engine.js for its use and options)
  // Used elsewhere: ziaOrb.

  // ----- the orbs on screen, and the one loop that draws them
  const ORB_XHTML = "http://www.w3.org/1999/xhtml";
  // (the frame the package shows under prefers-reduced-motion)
  const ORB_STILL_T = 0.6;
  // The one change to the package's look: no dot is drawn smaller than one
  // device pixel across. The package floors dots at 0.3 CSS px, which on a
  // 1x screen is a 0.6px smudge, so at 16 and 20 px the globe-like states
  // (searching, listening, weaving, composing) went faint. At a device
  // pixel ratio of 5/3 or more this floor is under the package's and changes
  // nothing. Set it to 0 for the package's dots everywhere.
  const ORB_MIN_DEVICE_R = 0.5;
  const orbLive = new Set();
  const orbByCanvas = new WeakMap();
  let orbLoop = 0;
  let orbHooked = false;
  let orbReduceQuery = null;
  let orbDarkQuery = null;
  let orbSeen = null;

  function orbStill() {
    return !!orbReduceQuery?.matches;
  }

  // (as in the package: dark when there's no media query to ask)
  function orbSystemDark() {
    return orbDarkQuery ? orbDarkQuery.matches : true;
  }

  // device pixel ratio, capped at 2 as in the package
  function orbDpr() {
    return Math.min(2, window.devicePixelRatio || 1);
  }

  // listeners shared by every orb, set up with the first
  function orbHook() {
    if (orbHooked) {
      return;
    }
    orbHooked = true;
    if (typeof matchMedia === "function") {
      orbReduceQuery = matchMedia("(prefers-reduced-motion: reduce)");
      orbDarkQuery = matchMedia("(prefers-color-scheme: dark)");
      orbReduceQuery.addEventListener("change", orbRedrawAll);
      orbDarkQuery.addEventListener("change", orbRedrawAll);
      orbWatchDpr();
    }
    document.addEventListener("visibilitychange", orbWake);
    // (orbs scrolled or folded out of view rest, as in the package)
    if (typeof IntersectionObserver === "function") {
      orbSeen = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const orb = orbByCanvas.get(entry.target);
          if (orb) {
            orb.visible = entry.isIntersecting;
          }
        }
        orbWake();
      });
    }
  }

  // redraw at the new sharpness when the window moves to another screen or
  // is zoomed (the loop would catch it, but not for a still orb)
  function orbWatchDpr() {
    const query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener(
      "change",
      () => {
        orbWatchDpr();
        orbRedrawAll();
      },
      { once: true },
    );
  }

  function orbRedrawAll() {
    const now = performance.now();
    for (const orb of orbLive) {
      if (orb.canvas.isConnected) {
        orbDraw(orb, now);
      } else {
        orbDrop(orb);
      }
    }
    orbWake();
  }

  // start the loop if something on screen needs it
  function orbWake() {
    if (orbLoop || document.hidden || orbStill()) {
      return;
    }
    for (const orb of orbLive) {
      if (orb.visible || !orb.canvas.isConnected) {
        orbLoop = requestAnimationFrame(orbTick);
        return;
      }
    }
  }

  function orbTick(now) {
    orbLoop = 0;
    if (document.hidden || orbStill()) {
      return;
    }
    // (orbs in the same state and size share one frame, and with the same
    // ink a painted copy of it)
    const frames = new Map();
    const copies = new Map();
    let drawing = false;
    for (const orb of orbLive) {
      if (!orb.canvas.isConnected) {
        orbDrop(orb);
        continue;
      }
      if (!orb.visible) {
        continue;
      }
      drawing = true;
      orbDraw(orb, now, frames, copies);
    }
    if (drawing) {
      orbLoop = requestAnimationFrame(orbTick);
    }
  }

  // one frame onto the orb's canvas: the package's shared clock (seconds
  // times the preset's speed), or its still frame under reduced motion
  function orbDraw(orb, now, frames, copies) {
    const { canvas, ctx } = orb;
    if (!ctx) {
      return;
    }
    const dpr = orbDpr();
    if (orb.dpr !== dpr) {
      orb.dpr = dpr;
      canvas.width = Math.round(orb.size * dpr);
      canvas.height = Math.round(orb.size * dpr);
    }
    const dark = orb.dark ?? orbSystemDark();
    const shape = `${orb.state}|${orb.size}|${orb.speed}`;
    const look = `${shape}|${dark}|${orb.tintKey}|${dpr}`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const twin = copies?.get(look);
    if (twin) {
      ctx.drawImage(twin, 0, 0);
      return;
    }
    let frame = frames?.get(shape);
    if (!frame) {
      const t = orbStill() ? ORB_STILL_T : (now / 1000) * orb.speed;
      frame = ORB_FRAMES[orb.mode](orb.size, t, orb.opts);
      frames?.set(shape, frame);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    orbPaintFrame(ctx, frame, dark, orb.tint, ORB_MIN_DEVICE_R / dpr);
    copies?.set(look, canvas);
  }

  function orbDrop(orb) {
    orbLive.delete(orb);
    orbSeen?.unobserve(orb.canvas);
    orb.live = false;
    orb.dropped = true;
  }

  // (re)join the loop and draw now, as the package does on every change
  function orbShow(orb) {
    if (orb.gone) {
      return;
    }
    if (!orb.live) {
      if (orb.dropped && !orb.canvas.isConnected) {
        // (dropped, and still out of the document)
        return;
      }
      orb.live = true;
      orb.visible = true;
      orbLive.add(orb);
      orbSeen?.observe(orb.canvas);
    }
    orbDraw(orb, performance.now());
    orbWake();
  }

  function orbApplyState(orb, state) {
    const resolved = orbResolve(state, orb.size);
    orb.state = state;
    orb.mode = resolved.mode;
    orb.opts = resolved.opts;
    orb.speed = resolved.speed * orb.pace;
    if (orb.canvas.getAttribute("aria-hidden") !== "true") {
      orb.canvas.setAttribute("role", "img");
      orb.canvas.setAttribute("aria-label", orb.label || ORB_LABELS[state]);
    }
  }

  // ziaOrb(canvas, { state, size, dark, speed, color, label })
  //   -> { canvas, setState(name), setDark(bool or null), destroy() }
  function ziaOrb(canvas, options = {}) {
    canvas ||= document.createElementNS(ORB_XHTML, "canvas");
    orbHook();
    orbByCanvas.get(canvas)?.handle.destroy();
    const size = Number(options.size) > 0 ? Number(options.size) : 64;
    const orb = {
      canvas,
      ctx: canvas.getContext("2d"),
      size,
      dark: typeof options.dark === "boolean" ? options.dark : null,
      pace: Number(options.speed) > 0 ? Number(options.speed) : 1,
      tint: orbParseTint(options.color),
      tintKey: options.color ? String(options.color) : "",
      label: options.label || "",
      dpr: 0,
      visible: true,
      live: false,
      dropped: false,
      gone: false,
    };
    orbApplyState(orb, ORB_STATE_MODE[options.state] ? options.state : "working");
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.style.display = "block";
    orb.handle = {
      canvas,
      setState(name) {
        if (!ORB_STATE_MODE[name]) {
          return;
        }
        if (name !== orb.state) {
          orbApplyState(orb, name);
        }
        orbShow(orb);
      },
      // (true: light dots for a dark background, false: dark dots for a
      // light one, null: follow prefers-color-scheme)
      setDark(value) {
        orb.dark = typeof value === "boolean" ? value : null;
        orbShow(orb);
      },
      destroy() {
        orb.gone = true;
        orbDrop(orb);
        if (orbByCanvas.get(canvas) === orb) {
          orbByCanvas.delete(canvas);
        }
      },
    };
    orbByCanvas.set(canvas, orb);
    orbShow(orb);
    return orb.handle;
  }
