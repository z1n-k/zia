  // Glance's genie opening (#619; an option, off by default): the glance grows out of the
  // link that opened it, its top edge running ahead and flaring wide while the bottom
  // follows narrower, so its sides curve, as Dia's Peek and macOS's genie do. Zen still flies
  // its own frame in (and dims the page behind); that frame is hidden while the genie is
  // drawn over it, on a canvas, row by row, and shown again where the genie lands.
  // Used elsewhere: watchGlanceGenie.
  const GLANCE_GENIE_PREF = "zia.glance.genie";
  // (how far the bottom edge's width trails the top's, at most, mid-way: rows between trail
  // less the higher they are, on a curve, so the sides bow)
  const GENIE_LAG = 0.55;
  // (rows drawn: enough for the sides to read as curves at any size)
  const GENIE_ROWS = 64;
  // (Zen's own opening, when its pref can't be read)
  const GENIE_FALLBACK_MS = 400;
  // (the most a genie waits for Zen's frame to land after its own run, before giving up)
  const GENIE_LAND_WAIT_MS = 800;
  // (the genie's fade into the page as it lands)
  const GENIE_FADE_MS = 140;
  // (Zen's frame is 80% of the page area wide and its full height, centred)
  const GLANCE_WIDTH_SHARE = 0.8;

  const genieEase = (t) => 1 - Math.pow(1 - t, 4);

  function genieWanted() {
    return (
      Services.prefs.getBoolPref(GLANCE_GENIE_PREF, false) &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches &&
      !window.gZenUIManager?.testingEnabled
    );
  }

  // Where the glance starts (the link, in the window) and lands (Zen's frame, centred in the
  // page area)
  function genieRects(data, manager) {
    const link = data?.width && data?.height ? data : manager.lastLinkClickData;
    const panels = window.windowUtils.getBoundsWithoutFlushing(gBrowser.tabpanels);
    if (!link?.width || !link?.height || !panels.width || !panels.height) {
      return null;
    }
    const from = { x: panels.left + link.clientX, y: panels.top + link.clientY, w: link.width, h: link.height };
    const w = panels.width * GLANCE_WIDTH_SHARE;
    const to = { x: panels.left + (panels.width - w) / 2, y: panels.top, w, h: panels.height };
    return { from, to, panels };
  }

  // One frame of the genie: the glance grows evenly in height from the link to where it
  // lands, while each row widens a little behind the one above it (all of them land together), so it flares at
  // the top and its sides curve down to a narrower bottom, as Dia's does. Straight top and
  // bottom edges, rounded corners (the radius grows with it, so a small one is never all corner).
  function drawGenie(ctx, { from, to }, t, radius, color) {
    const p = genieEase(t);
    const top = from.y + (to.y - from.y) * p;
    const bottom = from.y + from.h + (to.y + to.h - from.y - from.h) * p;
    const rows = [];
    for (let i = 0; i <= GENIE_ROWS; i++) {
      const v = i / GENIE_ROWS;
      const pw = p * (1 - GENIE_LAG * v ** 1.6 * (1 - p));
      rows.push([from.x + (to.x - from.x) * pw, from.x + from.w + (to.x + to.w - from.x - from.w) * pw, top + (bottom - top) * v]);
    }
    const narrowest = Math.min(...rows.map(([x0, x1]) => x1 - x0));
    const r = Math.max(0, Math.min(radius * p, narrowest / 2, (bottom - top) / 2));
    const [tl, tr] = rows[0];
    const [bl, br] = rows[GENIE_ROWS];
    const sides = rows.filter(([, , y]) => y > top + r && y < bottom - r);
    ctx.beginPath();
    ctx.moveTo(tl + r, top);
    ctx.lineTo(tr - r, top);
    ctx.quadraticCurveTo(tr, top, sides[0]?.[1] ?? tr, top + r);
    for (const [, x1, y] of sides) {
      ctx.lineTo(x1, y);
    }
    ctx.quadraticCurveTo(br, bottom, br - r, bottom);
    ctx.lineTo(bl + r, bottom);
    ctx.quadraticCurveTo(bl, bottom, sides.at(-1)?.[0] ?? bl, bottom - r);
    for (const [x0, , y] of sides.reverse()) {
      ctx.lineTo(x0, y);
    }
    ctx.quadraticCurveTo(tl, top, tl + r, top);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // The colour Zen gives a page that hasn't drawn yet (white, or its dark grey when pages are
  // shown dark), which is what the glance shows as it lands
  function genieColor(wrapper) {
    const probe = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    probe.style.cssText =
      "position: fixed; width: 0; height: 0; color-scheme: env(-moz-content-preferred-color-scheme); background: light-dark(rgb(255, 255, 255), rgb(32, 32, 32))";
    wrapper.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return /^rgb/.test(color) && !/, 0\)$/.test(color) ? color : "rgb(255, 255, 255)";
  }

  function playGenie(manager, rects) {
    const wrapper = manager.browserWrapper;
    const browser = wrapper?.querySelector("browser");
    if (!wrapper || !browser) {
      return;
    }
    const color = genieColor(wrapper);
    const radius = parseFloat(getComputedStyle(wrapper).borderRadius) || parseFloat(getComputedStyle(root).getPropertyValue("--zia-card-radius")) || 8;
    let duration = GENIE_FALLBACK_MS;
    try {
      duration = Services.prefs.getIntPref("zen.glance.animation-duration", GENIE_FALLBACK_MS) || GENIE_FALLBACK_MS;
    } catch (err) {
      // (Zen's pref missing: the fallback above)
    }

    const scale = window.devicePixelRatio || 1;
    const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    canvas.id = "zia-glance-genie";
    const { panels } = rects;
    Object.assign(canvas.style, {
      position: "fixed",
      left: `${panels.left}px`,
      top: `${panels.top}px`,
      width: `${panels.width}px`,
      height: `${panels.height}px`,
      pointerEvents: "none",
      zIndex: "2147483647",
    });
    canvas.width = Math.round(panels.width * scale);
    canvas.height = Math.round(panels.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.translate(-panels.left, -panels.top);
    (document.body || root).appendChild(canvas);
    wrapper.setAttribute("zia-genie", "true");

    const started = performance.now();
    // (Zen's frame shown again under it, and the genie faded off it, so a page that's drawn
    // by then in another colour than the genie's comes through without a flash)
    const finish = () => {
      wrapper.removeAttribute("zia-genie");
      canvas.animate({ opacity: [1, 0] }, { duration: GENIE_FADE_MS, easing: "ease-out" }).finished.then(
        () => canvas.remove(),
        () => canvas.remove()
      );
    };
    const frame = (now) => {
      if (!canvas.isConnected) {
        return;
      }
      const t = Math.min(1, (now - started) / duration);
      ctx.clearRect(panels.left, panels.top, panels.width, panels.height);
      drawGenie(ctx, rects, t, radius, color);
      // (held on its last frame until Zen's own frame has landed under it)
      const landed = t >= 1 && !manager.animatingOpen;
      if (landed || now - started > duration + GENIE_LAND_WAIT_MS || manager.browserWrapper !== wrapper) {
        finish();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function watchGlanceGenie() {
    const manager = window.gZenGlanceManager;
    if (!manager?.openGlance || manager.ziaGenie) {
      return;
    }
    manager.ziaGenie = true;
    const openGlance = manager.openGlance;
    manager.openGlance = function (data, ...rest) {
      const rects = genieWanted() ? genieRects(data, this) : null;
      const wasAnimating = this.animatingOpen;
      const opened = openGlance.call(this, data, ...rest);
      // (only a glance that starts opening now: not one already open, or one opened as a tab)
      if (rects && !wasAnimating && this.animatingOpen) {
        try {
          playGenie(this, rects);
        } catch (err) {
          this.browserWrapper?.removeAttribute("zia-genie");
          document.getElementById("zia-glance-genie")?.remove();
          noteError("glance genie", err);
        }
      }
      return opened;
    };
  }
