  // ---------- Zia glow: its look per theme and size, and the host's outline it's cut to
  // (see 28t-ultra-glow-engine.js)
  // Used elsewhere: ziaGlowBuild, ziaGlowOutline.

  // (where the glow's centre is, in the gradients)
  const ZIA_GLOW_AT = "calc(50% + var(--zg-cx) * var(--zg-w))";

  // Per theme and scale: the CSS the layers paint with. Everything that moves is a
  // custom property on the root that the loop writes each frame.
  function ziaGlowBuild(g, scale) {
    const T = g.dark ? ZIA_GLOW_THEMES.dark : ZIA_GLOW_THEMES.light;
    const P = ZIA_GLOW_TUNING;
    const F = scale;
    const cfg = ziaGlowConfig(g, T, P, F);
    g.cfg = cfg;
    g.dirty = false;
    ziaGlowPaintLayers(g, cfg, T, P, F);
    ziaGlowPaintRoot(g, T, P, F);
    ziaGlowPaintCore(g, cfg, P, F);
    if (g.turbulence) {
      const detail = P.distortionDetail / F;
      g.turbulence.setAttribute("baseFrequency", `${(0.012 * detail).toFixed(4)} ${(0.05 * detail).toFixed(4)}`);
    }
  }

  function ziaGlowConfig(g, T, P, F) {
    const cfg = {
      dark: g.dark,
      scale: F,
      radius: ziaGlowRadiusOf(g.container),
      cornerShape: ziaGlowCornerShapeOf(g.container, g.cornerShape),
      threshold: P.threshold,
      attack: P.attack,
      release: P.release,
      idle: P.idle,
      breatheDuration: P.breatheDuration,
      bands: P.bands,
      flow: P.flow * F,
      bend: P.bend * F,
      reach: T.reach,
      spread: T.spread,
      lobeSpacing: P.lobeSpacing * F,
      rangeWidth: P.rangeWidth * F,
      rangeHeight: P.rangeHeight * F,
      bandStrength: T.bandStrength,
      bandWidth: P.bandWidth * F,
      bandPosition: P.bandPosition,
      bandCurve: P.bandCurve,
      bandSpread: P.bandSpread,
      bandSkew: P.bandSkew,
      bandOffset: P.bandOffset * F,
      bandTail: P.bandTail,
      bandTailPosition: P.bandTailPosition,
      bandTailCurve: P.bandTailCurve,
      bandTailOverflow: P.bandTailOverflow * F,
      bandAberration: P.bandAberration,
      bandColors: g.colors ? ziaGlowBandFrom(g.colors, T) : T.band,
      distortion: g.displace ? P.distortion : 0,
      coreLight: T.coreLight,
      // (a narrower drift for colours given, so they stay the picture's)
      hueRange: g.colors ? Math.min(10, T.hueRange) : T.hueRange,
      hueDuration: T.hueDuration,
    };
    cfg.cornerN = ziaGlowCornerExp(cfg.cornerShape);
    return cfg;
  }

  function ziaGlowPaintLayers(g, cfg, T, P, F) {
    const colors = g.colors || T.colors;
    const glowWidth = P.glowWidth * F;
    const glowHeight = P.glowHeight * F;
    const coreSize = P.coreSize * F;
    const fade = Math.round(Math.max(40, Math.min(95, 70 * P.softness)));
    const edge = ziaGlowTenth(28 * F);
    const strokeBg = `${ziaGlowSpot(g.dark, coreSize)}, ${ziaGlowLobes(colors, 1, glowWidth * P.strokeScale, glowHeight * P.strokeScale, 2, fade)}`;
    const strokeMask = ziaGlowRange(cfg, 170, 64, 45, 0);
    const innerBg = ziaGlowLobes(
      colors,
      0.46,
      glowWidth * 0.9 * P.innerScale,
      glowHeight * 0.9 * P.innerScale * P.innerHeight,
      0,
      fade
    );
    const innerMask =
      `${ziaGlowRange(cfg, 170, 64, 45, 0.3)}, ` +
      `linear-gradient(white, transparent ${edge}px, transparent calc(100% - ${edge}px), white), ` +
      `linear-gradient(to right, white, transparent ${edge}px, transparent calc(100% - ${edge}px), white)`;
    const bloomBg = ziaGlowLobes(
      colors,
      T.bloomAlpha,
      glowWidth * 1.15 * P.bloomScale,
      glowHeight * 1.5 * P.bloomScale * P.bloomHeight,
      0,
      Math.min(95, fade + 2)
    );
    const bloomMask = ziaGlowRange(cfg, 200, 130, 35, 0);

    ziaGlowSet(g.stroke, "background", strokeBg);
    ziaGlowSet(g.stroke, "mask-image", strokeMask);
    for (const el of [g.inner, g.innerWarp]) {
      ziaGlowSet(el, "background", innerBg);
      ziaGlowSet(el, "mask-image", innerMask);
    }
    for (const el of [g.bloom, g.bloomWarp]) {
      ziaGlowSet(el, "background", bloomBg);
      ziaGlowSet(el, "mask-image", bloomMask);
    }
  }

  function ziaGlowTenth(v) {
    return Math.round(v * 10) / 10;
  }

  function ziaGlowSet(el, prop, value) {
    return el && el.style.setProperty(prop, value);
  }

  function ziaGlowLobes(colors, alpha, sw, sh, y, stop) {
    return ZIA_GLOW_LOBES.map((lobe, i) => {
      const color =
        alpha >= 1 ? colors[i] : colors[i].replace("rgb(", "rgba(").replace(")", `, ${alpha.toFixed(2)})`);
      return (
        `radial-gradient(ellipse calc(${Math.round(lobe.w * sw)}px * var(--zg-w)) ` +
        `calc(${Math.round(lobe.h * sh)}px * var(--zg-h) * var(--zg-l${i})) ` +
        `at calc(50% + (var(--zg-cx) + var(--zg-x${i})) * var(--zg-w)) calc(100% + ${y}px + var(--zg-y${i})), ` +
        `${color} 0%, transparent ${stop}%)`
      );
    }).join(", ");
  }

  // The visible range: a centred ellipse whose top humps up with the bend.
  function ziaGlowRange(cfg, rw, rh, mid, rim) {
    return (
      `radial-gradient(ellipse calc(${ziaGlowTenth(rw * cfg.rangeWidth)}px * var(--zg-w) * var(--zg-mw)) ` +
      `calc(${ziaGlowTenth(rh * cfg.rangeHeight)}px * var(--zg-h) + var(--zg-bh)) at ${ZIA_GLOW_AT} calc(100% + var(--zg-cy)), ` +
      `white 0%, rgba(255, 255, 255, 0.5) ${mid}%${rim > 0 ? `, rgba(255, 255, 255, ${rim}) 85%` : ""}, transparent 100%)`
    );
  }

  // The hot spot in the stroke: white on dark, an ink core on light.
  function ziaGlowSpot(dark, coreSize) {
    return dark
      ? `radial-gradient(ellipse calc(${ziaGlowTenth(30 * coreSize)}px * var(--zg-w)) calc(${ziaGlowTenth(30 * coreSize)}px * var(--zg-h)) ` +
          `at ${ZIA_GLOW_AT} calc(100% + 2px + var(--zg-cy)), rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0.14) 30%, transparent 65%)`
      : `radial-gradient(ellipse calc(${ziaGlowTenth(40 * coreSize)}px * var(--zg-w)) calc(${ziaGlowTenth(30 * coreSize)}px * var(--zg-h)) ` +
          `at ${ZIA_GLOW_AT} calc(100% + 2px + var(--zg-cy)), rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.22) 35%, transparent 70%)`;
  }

  function ziaGlowPaintRoot(g, T, P, F) {
    const glowSize = P.glowSize * F;
    const shadow = ziaGlowTenth(9 * F);
    const root = g.root.style;
    root.setProperty(
      "--zg-tone",
      `hue-rotate(calc(${T.hueBase}deg + var(--zg-hue))) brightness(${T.brightness.toFixed(2)}) saturate(${T.saturation.toFixed(2)})`
    );
    root.setProperty("--zg-blur", `${ziaGlowTenth(Math.max(0.5, Math.round(10 * glowSize * 100) / 100))}px`);
    root.setProperty("--zg-shadow", `inset 0 0 ${shadow}px 1px ${T.innerShadow}`);
    root.setProperty("--zg-stroke-k", T.strokeOpacity.toFixed(2));
    root.setProperty("--zg-inner-k", T.innerOpacity.toFixed(2));
    root.setProperty("--zg-bloom-k", T.bloomOpacity.toFixed(2));
    root.setProperty("--zg-strength", String(T.strength));
  }

  // The epicentre: a white wash at the source under the band line (light theme).
  function ziaGlowPaintCore(g, cfg, P, F) {
    const glowSize = P.glowSize * F;
    const light = Math.max(0, Math.min(3, cfg.coreLight));
    g.root.toggleAttribute("data-core", light > 0);
    if (light > 0) {
      const w = Math.max(0, Math.min(2, light - 1));
      const a = Math.min(1, w);
      const b = Math.max(0, w - 1);
      const grow = 1 + 0.3 * w;
      const solid = ziaGlowTenth(45 * a + 27 * b);
      const mid = ziaGlowTenth(40 + 25 * a + 15 * b);
      const midAlpha = Math.min(1, 0.55 + 0.35 * a + 0.1 * b).toFixed(2);
      const end = ziaGlowTenth(72 + 14 * a + 8 * b);
      ziaGlowSet(
        g.coreFill,
        "background",
        `radial-gradient(ellipse calc(${ziaGlowTenth(120 * P.coreLightWidth * grow * F)}px * var(--zg-w)) ` +
          `calc(${ziaGlowTenth(70 * P.coreLightHeight * grow * F)}px * var(--zg-h) + var(--zg-bh)) at ${ZIA_GLOW_AT} calc(100% + var(--zg-cy)), ` +
          `white 0%, white ${solid}%, rgba(255, 255, 255, ${midAlpha}) ${mid}%, transparent ${end}%)`
      );
      g.root.style.setProperty("--zg-core-blur", `${ziaGlowTenth(Math.max(0.5, Math.round(8 * glowSize * 100) / 100))}px`);
      g.root.style.setProperty("--zg-core-k", (Math.min(1, light) * (1.6 + 1.4 * w)).toFixed(2));
    }
  }

  // The host's corner-shape: the one given, else its own.
  function ziaGlowCornerShapeOf(container, given) {
    const style = getComputedStyle(container);
    return (given || style.getPropertyValue("corner-bottom-left-shape") || style.getPropertyValue("corner-shape") || "")
      .trim()
      .split(/\s+(?![^(]*\))/)[0];
  }

  // Its exponent: CSS draws corner-shape superellipse(K) as |x|^n + |y|^n = 1 with
  // n = 2^K (round is K = 1, squircle K = 2).
  function ziaGlowCornerExp(shape) {
    const named = { round: 1, squircle: 2, bevel: 0, square: 8 };
    let k = named[shape];
    const m = shape.match(/^superellipse\(\s*([^)]*)\)$/);
    if (m) {
      k = parseFloat(m[1]);
      if (!Number.isFinite(k)) {
        k = /^-/.test(m[1].trim()) ? 0 : 8;
      }
    }
    return Math.pow(2, Math.max(0, Math.min(8, k ?? 1)));
  }

  // The host's outline as a path, inset by `inset`: its corners as CSS draws them.
  function ziaGlowOutlinePath(w, h, r, n, inset) {
    const x0 = inset;
    const y0 = inset;
    const x1 = w - inset;
    const y1 = h - inset;
    const rr = Math.max(0, Math.min(r - inset, (x1 - x0) / 2, (y1 - y0) / 2));
    const e = 2 / n;
    const f = (v) => v.toFixed(2);
    const pts = [];
    for (const [cx, cy, a0] of [
      [x0 + rr, y0 + rr, Math.PI],
      [x1 - rr, y0 + rr, 1.5 * Math.PI],
      [x1 - rr, y1 - rr, 0],
      [x0 + rr, y1 - rr, 0.5 * Math.PI],
    ]) {
      for (let i = 0; i <= 16; i++) {
        const a = a0 + (Math.PI / 2) * (i / 16);
        const c = Math.cos(a);
        const s = Math.sin(a);
        pts.push(
          `${f(cx + rr * Math.sign(c) * Math.pow(Math.abs(c), e))} ${f(cy + rr * Math.sign(s) * Math.pow(Math.abs(s), e))}`
        );
      }
    }
    return `M ${pts.join(" L ")} Z`;
  }

  // The glow is clipped to the host's outline, and its edge stroke drawn along it,
  // as paths: Firefox clips overflow (and masks) to a round corner whatever the
  // corner-shape, and the glow came out rounder than a squircle card.
  function ziaGlowOutline(g, w, h) {
    const { radius, cornerN } = g.cfg;
    const key = `${w} ${h} ${radius} ${cornerN}`;
    if (key === g.outlineKey) {
      return;
    }
    g.outlineKey = key;
    const outer = ziaGlowOutlinePath(w, h, radius, cornerN, 0);
    const inner = ziaGlowOutlinePath(w, h, radius, cornerN, 1);
    g.root.style.setProperty("--zg-outline", `path("${outer}")`);
    g.root.style.setProperty("--zg-ring", `path(evenodd, "${outer} ${inner}")`);
  }

  // The band's fringes in the lobes' colours (light themes tint the core too).
  function ziaGlowBandFrom(colors, T) {
    const rgb = (c) => (String(c).match(/\d+(\.\d+)?/g) || [255, 255, 255]).slice(0, 3).join(", ");
    return {
      core: T === ZIA_GLOW_THEMES.dark ? T.band.core : rgb(colors[0]),
      above: rgb(colors[0]),
      mid: rgb(colors[1]),
      below: rgb(colors[2]),
    };
  }
