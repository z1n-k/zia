// ---------- Zia glow: the shared loop that draws every glow, and ziaGlow() (see
// 28t-ultra-glow-engine.js for its use)
// Used elsewhere: ziaGlow.

// (slower than this between frames for longer than that: drop to every other frame, and try
// full rate again a while on)
const ZIA_GLOW_SLOW_GAP_MS = 22;
const ZIA_GLOW_SLOW_FOR_MS = 500;
const ZIA_GLOW_PROBE_MS = 4000;

const ziaGlowLive = new Set(); // instances the loop draws
const ziaGlowAll = new Set(); // every instance not destroyed, for media-query changes
// The loop's frame, the rate it's settled on, and when it last drew
const ziaGlowLoop = { raf: null, lastFrame: 0, prevTs: 0, halfRate: false, skip: false, slowSince: 0, probeAt: 0 };
let ziaGlowMotionQuery = null;
let ziaGlowListening = false;
let ziaGlowCount = 0;

function ziaGlowReducedMotion() {
  if (!ziaGlowMotionQuery && typeof matchMedia === "function") {
    ziaGlowMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  }
  return !!ziaGlowMotionQuery?.matches;
}

function ziaGlowListen() {
  if (ziaGlowListening) {
    return;
  }
  ziaGlowListening = true;
  ziaGlowReducedMotion();
  ziaGlowMotionQuery?.addEventListener("change", () => {
    for (const g of ziaGlowAll) {
      if (g.playing) {
        ziaGlowWake(g);
      }
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      ziaGlowStop();
    } else {
      ziaGlowStart();
    }
  });
}

// The shared loop: capped at ~60 fps, every other frame on a device that cannot hold
// 60 (probing full rate again after 4s), stopped when nothing is left to draw.
function ziaGlowFrame(ts) {
  ziaGlowLoop.raf = requestAnimationFrame(ziaGlowFrame);
  const gap = ziaGlowLoop.prevTs ? ts - ziaGlowLoop.prevTs : 0;
  ziaGlowLoop.prevTs = ts;
  if (ziaGlowLoop.halfRate) {
    ziaGlowLoop.skip = !ziaGlowLoop.skip;
    if (ziaGlowLoop.skip) {
      return;
    }
    if (ts >= ziaGlowLoop.probeAt) {
      ziaGlowLoop.halfRate = false;
      ziaGlowLoop.slowSince = 0;
    }
  } else if (gap > ZIA_GLOW_SLOW_GAP_MS) {
    if (!ziaGlowLoop.slowSince) {
      ziaGlowLoop.slowSince = ts;
    } else if (ts - ziaGlowLoop.slowSince > ZIA_GLOW_SLOW_FOR_MS) {
      ziaGlowLoop.halfRate = true;
      ziaGlowLoop.skip = false;
      ziaGlowLoop.probeAt = ts + ZIA_GLOW_PROBE_MS;
    }
  } else {
    ziaGlowLoop.slowSince = 0;
  }
  if (ts - ziaGlowLoop.lastFrame < 1000 / 60 - 2) {
    return;
  }
  ziaGlowLoop.lastFrame = ts;

  const reduced = ziaGlowReducedMotion();
  for (const g of ziaGlowLive) {
    if (!g.root.isConnected) {
      ziaGlowLive.delete(g);
      ziaGlowAll.delete(g);
      continue;
    }
    if (!g.visible) {
      ziaGlowLive.delete(g);
      continue;
    }
    if (!g.playing) {
      g.offAt ||= ts;
      // keep following the settling level while the CSS fade-out runs
      if (reduced || ts - g.offAt > ZIA_GLOW_FADE_OUT_MS) {
        ziaGlowLive.delete(g);
        continue;
      }
    }
    const drawn = ziaGlowStep(g, ts, reduced);
    if (reduced && drawn) {
      ziaGlowLive.delete(g); // nothing moves under reduced motion: one still frame
    }
  }
  if (!ziaGlowLive.size) {
    ziaGlowStop();
  }
}

function ziaGlowStart() {
  if (ziaGlowLoop.raf == null && ziaGlowLive.size && !document.hidden) {
    ziaGlowLoop.lastFrame = 0;
    ziaGlowLoop.prevTs = 0;
    ziaGlowLoop.slowSince = 0;
    ziaGlowLoop.raf = requestAnimationFrame(ziaGlowFrame);
  }
}

function ziaGlowStop() {
  if (ziaGlowLoop.raf != null) {
    cancelAnimationFrame(ziaGlowLoop.raf);
    ziaGlowLoop.raf = null;
  }
}

function ziaGlowWake(g) {
  if (g.destroyed) {
    return;
  }
  ziaGlowAll.add(g);
  if (!ziaGlowLive.has(g)) {
    g.s.lastTs = 0;
    ziaGlowLive.add(g);
  }
  ziaGlowStart();
}

function ziaGlow(container, { dark = true, cornerShape = "" } = {}) {
  ziaGlowListen();
  const doc = container.ownerDocument;
  const id = `zia-glow-distort-${++ziaGlowCount}`;
  const { root, inner, innerWarp, stroke, bloom, bloomWarp, canvas, coreFill, filter, turbulence, shift, displace } =
    ziaGlowLayers(doc, id);
  container.append(root);

  const g = {
    container,
    root,
    inner,
    innerWarp,
    stroke,
    bloom,
    bloomWarp,
    canvas,
    ctx: canvas.getContext("2d"),
    coreFill,
    filter,
    turbulence,
    shift,
    displace,
    filterTop: -1,
    warpOff: true,
    dark: !!dark,
    cornerShape,
    colors: null,
    colorKey: "",
    outlineKey: "",
    dirty: true,
    cfg: null,
    playing: false,
    offAt: 0,
    visible: true,
    destroyed: false,
    motion: null,
    music: ziaGlowMusicNew(),
    s: { level: 0, bands: [0, 0, 0], phase: 0, t: 0, lastTs: 0, warp: 1 },
  };

  ziaGlowObserve(g);
  return ziaGlowHandle(g);
}

// Layers, back to front as VoiceBeam stacks them: inner light (and its warp mirror),
// edge stroke, bloom (and its warp mirror), band canvas, epicentre.
function ziaGlowLayers(doc, id) {
  const root = ziaGlowElement(doc, "zia-glow");
  root.setAttribute("aria-hidden", "true");
  root.toggleAttribute("data-warp-off", true);
  const inner = ziaGlowElement(doc, "zia-glow-layer zia-glow-inner");
  const innerWarp = ziaGlowElement(doc, "zia-glow-layer zia-glow-inner zia-glow-warp");
  const stroke = ziaGlowElement(doc, "zia-glow-layer zia-glow-stroke");
  const bloom = ziaGlowElement(doc, "zia-glow-layer zia-glow-bloom");
  const bloomWarp = ziaGlowElement(doc, "zia-glow-layer zia-glow-bloom zia-glow-warp");
  const canvas = ziaGlowElement(doc, "zia-glow-layer zia-glow-band", "canvas");
  const core = ziaGlowElement(doc, "zia-glow-layer zia-glow-core");
  const coreFill = ziaGlowElement(doc, "");
  core.append(coreFill);
  const { svg, filter, turbulence, shift, displace } = ziaGlowDistortion(doc, id);
  innerWarp.style.setProperty("filter", `var(--zg-tone) url(#${id})`);
  bloomWarp.style.setProperty("filter", `blur(var(--zg-blur)) var(--zg-tone) url(#${id})`);
  root.append(inner, innerWarp, stroke, bloom, bloomWarp, canvas, core, svg);
  return { root, inner, innerWarp, stroke, bloom, bloomWarp, canvas, coreFill, filter, turbulence, shift, displace };
}

// The distortion: drifting fractal noise, green pinned to 0.5 so only x displaces.
function ziaGlowDistortion(doc, id) {
  const svg = ziaGlowSvgElement(doc, "svg", { width: "0", height: "0", class: "zia-glow-defs" });
  const filter = ziaGlowSvgElement(doc, "filter", {
    id,
    x: "-20%",
    y: "-20%",
    width: "140%",
    height: "140%",
    "color-interpolation-filters": "sRGB",
  });
  const turbulence = ziaGlowSvgElement(doc, "feTurbulence", {
    type: "fractalNoise",
    baseFrequency: "0.04 0.17",
    numOctaves: "2",
    seed: "7",
    result: "noise",
  });
  const shift = ziaGlowSvgElement(doc, "feOffset", { in: "noise", dx: "0", dy: "0", result: "moved" });
  const matrix = ziaGlowSvgElement(doc, "feColorMatrix", {
    in: "moved",
    type: "matrix",
    values: "1 0 0 0 0  0 0 0 0 0.5  0 0 0 0 0  0 0 0 0 1",
    result: "map",
  });
  const displace = ziaGlowSvgElement(doc, "feDisplacementMap", {
    in: "SourceGraphic",
    in2: "map",
    scale: "0",
    xChannelSelector: "R",
    yChannelSelector: "G",
  });
  filter.append(turbulence, shift, matrix, displace);
  svg.append(filter);
  return { svg, filter, turbulence, shift, displace };
}

function ziaGlowElement(doc, cls, tag = "div") {
  const el = doc.createElementNS(ZIA_GLOW_XHTML, tag);
  if (cls) {
    el.className = cls;
  }
  return el;
}

function ziaGlowSvgElement(doc, tag, attrs) {
  const el = doc.createElementNS(ZIA_GLOW_SVG, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

function ziaGlowObserve(g) {
  // Offscreen (a collapsed or slid-out sidebar): leave the loop until it shows again.
  if (typeof IntersectionObserver === "function") {
    g.io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          g.visible = entry.isIntersecting;
        }
        if (g.visible && g.playing) {
          ziaGlowWake(g);
        }
      },
      { rootMargin: "256px" }
    );
    g.io.observe(g.root);
  }
  // A still frame (reduced motion) is redrawn when the card is resized.
  if (typeof ResizeObserver === "function") {
    g.ro = new ResizeObserver(() => {
      if (g.playing && ziaGlowReducedMotion()) {
        ziaGlowWake(g);
      }
    });
    g.ro.observe(g.root);
  }
}

function ziaGlowHandle(g) {
  return {
    setPlaying(on) {
      on = !!on;
      if (g.destroyed || on === g.playing) {
        return;
      }
      g.playing = on;
      g.offAt = 0;
      g.root.toggleAttribute("data-on", on);
      ziaGlowWake(g);
    },
    setDark(on) {
      on = !!on;
      if (g.destroyed || on === g.dark) {
        return;
      }
      g.dark = on;
      g.dirty = true;
      if (g.playing) {
        ziaGlowWake(g);
      }
    },
    // The lobes' colours, "rgb(r, g, b)" strings repeated round the seven, with the
    // band's fringes from the first three; null for the theme's own.
    setColors(list) {
      list = Array.isArray(list) && list.length ? list : null;
      const key = list ? list.join("|") : "";
      if (g.destroyed || key === g.colorKey) {
        return;
      }
      g.colorKey = key;
      g.colors = list ? ZIA_GLOW_LOBES.map((_, i) => list[i % list.length]) : null;
      g.dirty = true;
      if (g.playing) {
        ziaGlowWake(g);
      }
    },
    // VoiceBeam's `motion`: { gather, offset, stretch, heldLevel, cornerFollow },
    // or a getter sampled every frame, or null for the glow at rest.
    setMotion(motion) {
      g.motion = motion || null;
      if (g.playing) {
        ziaGlowWake(g);
      }
    },
    destroy() {
      ziaGlowDestroy(g);
    },
  };
}

function ziaGlowDestroy(g) {
  if (g.destroyed) {
    return;
  }
  g.destroyed = true;
  g.io?.disconnect();
  g.ro?.disconnect();
  ziaGlowLive.delete(g);
  ziaGlowAll.delete(g);
  g.root.remove();
  if (!ziaGlowLive.size) {
    ziaGlowStop();
  }
}
