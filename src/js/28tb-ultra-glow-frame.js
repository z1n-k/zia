  // ---------- Zia glow: one frame of one glow, from its level to its custom properties and
  // band (see 28t-ultra-glow-engine.js)
  // Used elsewhere: ziaGlowStep.

  // (the band's strokes, widest and faintest first: width and alpha)
  const ZIA_GLOW_BAND_PASSES = [
    [1, 0.16],
    [0.72, 0.2],
    [0.46, 0.26],
    [0.22, 0.34],
  ];

  // One frame of one instance: level -> envelope -> geometry -> custom properties.
  function ziaGlowStep(g, ts, reduced) {
    const root = g.root;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (!w || !h) {
      return false;
    }
    const scale = ziaGlowScaleFor(w);
    if (g.dirty || scale !== g.cfg?.scale) {
      ziaGlowBuild(g, scale);
    }
    const cfg = g.cfg;
    ziaGlowOutline(g, w, h);
    const s = g.s;
    const dt = s.lastTs ? Math.min(0.05, (ts - s.lastTs) / 1000) : 1 / 60;
    s.lastTs = ts;
    s.t += dt;
    const t = s.t;
    ziaGlowLevel(g, cfg, t, dt, reduced);
    const v = ziaGlowEnvelope(g, cfg, t, dt, reduced);
    const { e, radius, follow, spot } = ziaGlowPlace(g, cfg, v, w, h);
    const pts = ziaGlowWarp(g, cfg, e, v, w, h, t, dt, reduced);
    ziaGlowDrawBand(g, e, pts, w, h);

    const st = root.style;
    st.setProperty("--zg-glow", v.glow.toFixed(3));
    st.setProperty("--zg-h", v.tall.toFixed(3));
    st.setProperty("--zg-w", v.wide.toFixed(3));
    ziaGlowLobeProps(g, cfg, v, w, radius, spot, follow);
    const hue =
      reduced || cfg.hueRange === 0
        ? 0
        : -cfg.hueRange + cfg.hueRange * (1 - Math.cos((ZIA_GLOW_TAU * t) / cfg.hueDuration));
    st.setProperty("--zg-hue", `${hue.toFixed(2)}deg`);
    return true;
  }

  // The level: synthetic music while playing, silence while paused. The bands are
  // synthesised from it the way VoiceBeam does for a `level` getter.
  function ziaGlowLevel(g, cfg, t, dt, reduced) {
    const s = g.s;
    const d = g.playing ? (reduced ? ZIA_GLOW_STEADY : ziaGlowClamp(ziaGlowMusic(g.music, t))) : 0;
    const raw = reduced
      ? [d, d * 0.72, d * 0.6]
      : [d, d * (0.72 + 0.28 * Math.sin(t * 9.1)), d * (0.6 + 0.4 * Math.sin(t * 13.7 + 2))];
    const level = ziaGlowShape(d, cfg.threshold);
    s.level = reduced ? level : ziaGlowFollow(s.level, level, dt, cfg.attack, cfg.release);
    for (let i = 0; i < 3; i++) {
      const band = ziaGlowShape(raw[i], cfg.threshold * 0.6);
      s.bands[i] = reduced ? band : ziaGlowFollow(s.bands[i], band, dt, cfg.attack, cfg.release * 1.15);
    }
  }

  // The envelope: how tall, wide and bright the glow is from the level and the motion,
  // and the lobes flowing round the ring.
  function ziaGlowEnvelope(g, cfg, t, dt, reduced) {
    const s = g.s;
    const m = ziaGlowMotionOf(g);
    const gather = m.gather;
    const ring = ZIA_GLOW_SPAN * cfg.lobeSpacing;
    const cx = reduced ? 0 : (m.offset * ring) / 2;
    const pull = 1 - gather * 0.6;
    const narrow = 1 - gather * 0.45;
    const stretch = 1 + gather * 0.3 * m.stretch;
    const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin((ZIA_GLOW_TAU * t) / cfg.breatheDuration);
    const voiced = s.level + (1 - s.level) * cfg.idle * breathe;
    const held = Math.max(0, Math.min(1, (gather - 0.25) / 0.75));
    const R = Math.max(voiced, m.heldLevel * held * held * (3 - 2 * held));
    const glow = 0.15 + 0.85 * R;
    const tall = 0.5 + cfg.reach * R;
    const wide = (0.85 + cfg.spread * R) * stretch;
    if (cfg.flow !== 0 && !reduced) {
      s.phase = (((s.phase + cfg.flow * R * dt) % ring) + ring) % ring;
    }
    return { m, gather, ring, cx, pull, narrow, R, glow, tall, wide };
  }

  // The geometry: where the glow's centre sits, how it bends, and the corner it follows.
  function ziaGlowPlace(g, cfg, v, w, h) {
    const st = g.root.style;
    st.setProperty("--zg-cx", `${v.cx.toFixed(1)}px`);
    st.setProperty("--zg-mw", v.narrow.toFixed(3));
    const lift = cfg.bend * v.R;
    st.setProperty("--zg-bh", `${Math.max(0, lift).toFixed(1)}px`);
    const e = {
      cx: v.cx,
      w: v.wide,
      h: v.tall,
      mw: v.narrow,
      lift,
      strength: cfg.bend > 0 ? Math.min(1, lift / cfg.bend) : 0,
      level: g.s.level,
      corner: v.gather,
    };
    const radius = ziaGlowCornerRadius(cfg.radius, w, h);
    const follow = v.gather * v.m.cornerFollow;
    const spot = 30 * cfg.scale * v.wide;
    st.setProperty("--zg-cy", `${(-ziaGlowArc(w / 2 + v.cx * v.wide, w, radius, spot * 1.4, cfg.cornerN) * follow).toFixed(1)}px`);
    return { e, radius, follow, spot };
  }

  // Distortion settles out while the glow is gathered, and is off under reduced motion.
  function ziaGlowWarp(g, cfg, e, v, w, h, t, dt, reduced) {
    const s = g.s;
    s.warp = ziaGlowFollow(s.warp, v.gather > 0.02 ? 0 : 1, dt, 0.35, 0.06);
    const warpOff = !g.displace || cfg.distortion <= 0 || reduced || s.warp < 0.03;
    if (warpOff !== g.warpOff) {
      g.warpOff = warpOff;
      g.root.toggleAttribute("data-warp-off", warpOff);
    }
    const pts = ziaGlowBandPoints(cfg, e, w, h);
    if (!warpOff || cfg.coreLight > 0) {
      ziaGlowClip(g, pts, w, h);
    }
    if (!warpOff) {
      ziaGlowFilterRegion(g, pts, h);
      g.displace.scale.baseVal = cfg.distortion * 120 * cfg.scale * (0.15 + 0.85 * v.R) * s.warp;
      g.shift.dx.baseVal = 8 * cfg.scale * Math.sin(t * 0.9);
      g.shift.dy.baseVal = 4 * cfg.scale * Math.sin(t * 0.6 + 1.3);
    }
    return pts;
  }

  function ziaGlowLobeProps(g, cfg, v, w, radius, spot, follow) {
    const st = g.root.style;
    const s = g.s;
    for (let i = 0; i < ZIA_GLOW_LOBES.length; i++) {
      const lobe = ZIA_GLOW_LOBES[i];
      const x = ziaGlowWrap(lobe.x * cfg.lobeSpacing + s.phase, v.ring);
      const gain = cfg.bands ? 0.6 + 0.7 * s.bands[lobe.band] : 1;
      st.setProperty(`--zg-x${i}`, `${(x * v.pull).toFixed(1)}px`);
      st.setProperty(`--zg-l${i}`, (gain * ziaGlowRingFade(x, v.ring)).toFixed(3));
      const lx = w / 2 + (v.cx + x * v.pull) * v.wide;
      st.setProperty(`--zg-y${i}`, `${(-ziaGlowArc(lx, w, radius, spot, cfg.cornerN) * follow).toFixed(1)}px`);
    }
  }

  // The band line: a bell over the glow's range, ends rising into the corners.
  function ziaGlowBandPoints(cfg, e, w, h) {
    const cx = w / 2 + e.cx * e.w;
    const half = 170 * cfg.rangeWidth * e.w * e.mw;
    const cap = h * 0.82 * Math.min(1, cfg.scale);
    const peak = Math.min(cap, (64 * cfg.rangeHeight * e.h + e.lift) * cfg.bandPosition);
    const base = h - cfg.bandOffset;
    const c = Math.min(1, e.corner * 4);
    const tail = cfg.bandTail * (1 - c * c * (3 - 2 * c));
    const hasTail = tail > 1e-3;
    const over = hasTail ? cfg.bandTailOverflow : 0;
    const x0 = hasTail ? -over : cx - half;
    const x1 = hasTail ? w + over : cx + half;
    const radius = ziaGlowCornerRadius(cfg.radius, w, h);
    const pts = [];
    for (let i = 0; i <= ZIA_GLOW_BAND_POINTS; i++) {
      const x = x0 + ((x1 - x0) * i) / ZIA_GLOW_BAND_POINTS;
      const u = Math.max(-1, Math.min(1, (x - cx) / Math.max(1, half)));
      const reach = (x < cx ? cx : w - cx) + over;
      const d =
        ziaGlowBell(u, cfg.bandCurve, cfg.bandSpread, cfg.bandSkew) +
        ziaGlowTail(Math.abs(x - cx), reach, tail, cfg.bandTailPosition, cfg.bandTailCurve);
      const lift = e.corner > 0 ? ziaGlowArc(x, w, radius, 0, cfg.cornerN) * e.corner : 0;
      pts.push([x, base - peak * d - lift]);
    }
    return pts;
  }

  // Clip polygons above / below the band line: only the glow under it warps.
  function ziaGlowClip(g, pts, w, h) {
    const px = (v) => v.toFixed(1) + "px";
    const line = pts.map(([x, y]) => `${px(x)} ${px(y)}`);
    g.root.style.setProperty("--zg-clip-below", `polygon(0 ${px(h)}, ${line.join(", ")}, ${px(w)} ${px(h)})`);
    g.root.style.setProperty(
      "--zg-clip-above",
      `polygon(0 0, ${px(w)} 0, ${px(w)} ${px(h)}, ${line.reverse().join(", ")}, 0 ${px(h)})`
    );
  }

  // Narrow the filter region to the strip under the band line.
  function ziaGlowFilterRegion(g, pts, h) {
    let top = h;
    for (const p of pts) {
      if (p[1] < top) {
        top = p[1];
      }
    }
    const y = Math.max(0, Math.min(0.9, Math.floor((top - 6) / h / 0.05) * 0.05));
    if (y === g.filterTop) {
      return;
    }
    g.filterTop = y;
    const bottom = 1 + Math.max(0.1, 12 / h);
    g.filter.setAttribute("x", "-10%");
    g.filter.setAttribute("width", "120%");
    g.filter.setAttribute("y", `${(y * 100).toFixed(0)}%`);
    g.filter.setAttribute("height", `${((bottom - y) * 100).toFixed(1)}%`);
  }

  // The band canvas: a soft halo and four chromatic fringes along the line.
  function ziaGlowDrawBand(g, e, pts, w, h) {
    const { canvas, ctx, cfg } = g;
    if (!ctx) {
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const strength = Math.min(1, 0.6 * cfg.bandStrength * e.strength);
    if (strength < 5e-3 || cfg.bandWidth <= 0) {
      return;
    }
    const width = cfg.bandWidth * (1 + 0.35 * e.level);
    const split = cfg.bandAberration * (0.35 + 0.65 * e.level);
    const dy = (4 + 12 * split) * cfg.scale;
    const dx = 4 * split * cfg.scale;
    const alpha = (cfg.dark ? 0.42 : 0.4) * strength;
    const line = 14 * width;
    const blur = ((3.5 * cfg.bandWidth) / 2) * dpr;
    const colors = cfg.bandColors;
    const fringes = [
      { rgb: colors.above, a: 1, ox: dx, oy: -dy },
      { rgb: colors.mid, a: 0.55, ox: dx * 0.35, oy: -dy * 0.35 },
      { rgb: colors.below, a: 1, ox: -dx, oy: dy },
      { rgb: colors.core, a: 0.9, ox: 0, oy: 0 },
    ];
    const x0 = pts[0][0];
    const x1 = pts[pts.length - 1][0];
    const k = cfg.bandTail > 0 ? 0.015 : 0.18;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = `blur(${(blur * 3).toFixed(1)}px)`;
    ctx.strokeStyle = ziaGlowBandPaint(ctx, x0, x1, k, colors.core, alpha * 0.3);
    ctx.lineWidth = line * 2.2;
    ziaGlowTrace(ctx, pts, 0, 0);
    ctx.stroke();
    ctx.filter = `blur(${blur.toFixed(1)}px)`;
    for (const f of fringes) {
      for (const [lw, la] of ZIA_GLOW_BAND_PASSES) {
        ctx.strokeStyle = ziaGlowBandPaint(ctx, x0, x1, k, f.rgb, alpha * f.a * la);
        ctx.lineWidth = Math.max(0.6, line * lw);
        ziaGlowTrace(ctx, pts, f.ox, f.oy);
        ctx.stroke();
      }
    }
    ctx.filter = "none";
  }

  // One stroke's colour: faded in at its start and out at its end.
  function ziaGlowBandPaint(ctx, x0, x1, k, rgb, a) {
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, `rgba(${rgb}, 0)`);
    grad.addColorStop(k, `rgba(${rgb}, ${a.toFixed(3)})`);
    grad.addColorStop(1 - k, `rgba(${rgb}, ${a.toFixed(3)})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    return grad;
  }

  function ziaGlowTrace(ctx, pts, ox, oy) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0] + ox, pts[i][1] + oy);
    }
  }

  function ziaGlowMotionOf(g) {
    const m = typeof g.motion === "function" ? g.motion() : g.motion;
    if (!m) {
      return ZIA_GLOW_STILL;
    }
    return {
      gather: ziaGlowClamp(m.gather || 0),
      offset: m.offset || 0,
      stretch: ziaGlowClamp(m.stretch || 0),
      heldLevel: ziaGlowClamp(m.heldLevel || 0),
      cornerFollow: ziaGlowClamp(m.cornerFollow || 0),
    };
  }
