  // ---------- Thinking orbs: the presets, state to mode and the tuned sizes
  // (see 28r-ultra-orb-engine.js)
  // Used elsewhere: ORB_STATE_MODE, ORB_LABELS, orbResolve.

  // ----- presets: state to mode, base profiles, and the tuned sizes
  const ORB_STATE_MODE = {
    working: "orbits",
    searching: "globe",
    solving: "rubik",
    listening: "wave",
    connecting: "web",
    weaving: "braid",
    composing: "ribbon",
    breathing: "ring",
    shaping: "morph",
  };

  const ORB_LABELS = {
    working: "Working…",
    searching: "Searching…",
    solving: "Solving…",
    listening: "Listening…",
    connecting: "Connecting…",
    weaving: "Weaving…",
    composing: "Composing…",
    breathing: "Thinking…",
    shaping: "Shaping…",
  };

  const ORB_BASE_PROFILES = {
    globe: { latRings: 17, lonDensity: 44, rBase: 0.6, rDepth: 1.7, rBoost: 1, inkFar: 0.62, inkSpan: 0.54, rsPow: 0.6, rMin: 0.3 },
    orbits: { orbitN: 12, ghostN: 40, ghostR: 0.9, ghostA: 0.5, particles: 3, partR: 1.2, partRDepth: 1.6, rsPow: 0.6, rMin: 0.3 },
    rubik: { latRings: 15, lonDensity: 40, moveCount: 14, rBase: 0.6, rDepth: 1.7, rActive: 0.3, inkFar: 0.62, inkSpan: 0.54, rsPow: 0.6, rMin: 0.3 },
    wave: { rings: 15, lonDensity: 40, rBase: 0.6, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    web: { nodeN: 30, thr: 0.72, signals: 5, nodeR: 1.4, nodeRDepth: 1.8, lineW: 0.8, rsPow: 0.6, rMin: 0.3 },
    braid: { strandN: 52, turns: 3, ghostN: 150, rBase: 1.2, rDepth: 1.8, rsPow: 0.6, rMin: 0.3 },
    ribbon: { lanes: 5, segs: 88, ghostN: 150, rBase: 1.1, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    ring: { lanes: 5, segs: 88, ghostN: 0, faceOn: 1, rBase: 1.1, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    morph: { rDot: 0.021, iconD: 1, rMin: 0.25 },
  };

  // per mode and size: speed, a dot-count multiplier, a dot-size multiplier
  // and extra opts. 64 and 20 are hand-tuned; 32 is interpolated from them
  // in log space (orbPreset does the same for other sizes between).
  const ORB_PRESETS = {
    orbits: {
      64: { speed: 1.885, count: 1, size: 1 },
      32: { speed: 2.9072, count: 0.4251, size: 1.6849 },
      20: { speed: 3.9, count: 0.238, size: 2.4 },
    },
    globe: {
      64: { speed: 2.015, count: 0.42, size: 1.15, extra: { scanMul: 4.08, dimBase: 0.45 } },
      32: { speed: 2.3803, count: 0.1839, size: 1.4769, extra: { scanMul: 4.2301, dimBase: 0.45 } },
      20: { speed: 2.665, count: 0.105, size: 1.75, extra: { scanMul: 4.335, dimBase: 0.45 } },
    },
    rubik: {
      64: { speed: 1.82, count: 0.35, size: 1.05 },
      32: { speed: 1.8964, count: 0.1537, size: 1.4951 },
      20: { speed: 1.95, count: 0.088, size: 1.9 },
    },
    wave: {
      64: { speed: 4.388, count: 0.341, size: 1 },
      32: { speed: 4.1512, count: 0.169, size: 1.3232 },
      20: { speed: 3.998, count: 0.105, size: 1.6 },
    },
    web: {
      64: { speed: 3.315, count: 1.35, size: 0.95 },
      32: { speed: 5.0104, count: 0.4942, size: 1.2571 },
      20: { speed: 6.63, count: 0.25, size: 1.52 },
    },
    braid: {
      64: { speed: 1.625, count: 0.5, size: 1 },
      32: { speed: 2.2234, count: 0.2056, size: 1.2011 },
      20: { speed: 2.75, count: 0.1125, size: 1.36 },
    },
    ribbon: {
      64: { speed: 2.34, count: 0.25, size: 0.85, extra: { spin: 0, bandMul: 3.9, wobMul: 1 } },
      32: { speed: 2.7776, count: 0.0969, size: 0.9766, extra: { spin: 0, bandMul: 4.49, wobMul: 1 } },
      20: { speed: 3.12, count: 0.051, size: 1.073, extra: { spin: 0, bandMul: 4.94, wobMul: 1 } },
    },
    ring: {
      64: { speed: 3.24, count: 0.25, size: 0.956, extra: { spin: 0, bandMul: 3.627, wobMul: 0.368 } },
      32: { speed: 3.5517, count: 0.0678, size: 1.31, extra: { spin: 0, bandMul: 3.8265, wobMul: 0.4751 } },
      20: { speed: 3.78, count: 0.028, size: 1.622, extra: { spin: 0, bandMul: 3.968, wobMul: 0.565 } },
    },
    morph: {
      64: { speed: 2.405, count: 0.702, size: 0.395, extra: { spread: 1.45 } },
      32: { speed: 2.2057, count: 0.5937, size: 0.6916, extra: { spread: 1.45 } },
      20: { speed: 2.08, count: 0.53, size: 1.011, extra: { spread: 1.45 } },
    },
  };

  const ORB_COUNT_PAIRS = [
    ["latRings", "lonDensity"],
    ["rings", "lonDensity"],
    ["lanes", "segs"],
  ];
  const ORB_COUNT_KEYS = ["orbitN", "ghostN", "nodeN", "strandN", "signals"];
  const ORB_RADIUS_KEYS = ["rBase", "rDepth", "rActive", "rDot", "ghostR", "partR", "partRDepth", "nodeR", "nodeRDepth"];

  // grid pairs scale by the square root so their product tracks the scale
  function orbScaleCounts(opts, scale) {
    const out = { ...opts };
    const done = new Set();
    const rt = Math.sqrt(scale);
    for (const [a, b] of ORB_COUNT_PAIRS) {
      if (out[a] != null && out[b] != null && !done.has(a) && !done.has(b)) {
        out[a] = Math.max(2, Math.round(out[a] * rt));
        out[b] = Math.max(2, Math.round(out[b] * rt));
        done.add(a);
        done.add(b);
      }
    }
    for (const k of ORB_COUNT_KEYS) {
      const v = out[k];
      if (v != null && v !== 0 && !done.has(k)) {
        out[k] = Math.max(1, Math.round(v * scale));
      }
    }
    if (out.iconD != null) {
      out.iconD = Math.max(0.02, out.iconD * scale);
    }
    return out;
  }

  function orbScaleRadii(opts, scale) {
    const out = { ...opts };
    for (const k of ORB_RADIUS_KEYS) {
      if (out[k] != null) {
        out[k] *= scale;
      }
    }
    out.rSizeMul = (out.rSizeMul ?? 1) * scale;
    return out;
  }

  // the tuned preset for a size: 64, 32 and 20 as shipped, others between
  // 20 and 64 interpolated in log space as the package made its 32 (those
  // knobs are ratios), 20's tuning below 20 and 64's above 64
  function orbPreset(mode, size) {
    const table = ORB_PRESETS[mode];
    if (table[size]) {
      return table[size];
    }
    if (size <= 20) {
      return table[20];
    }
    if (size >= 64) {
      return table[64];
    }
    const f = Math.log(size / 64) / Math.log(20 / 64);
    const mix = (a, b) => (a > 0 && b > 0 ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * f) : a + (b - a) * f);
    const big = table[64];
    const small = table[20];
    const preset = { speed: mix(big.speed, small.speed), count: mix(big.count, small.count), size: mix(big.size, small.size) };
    if (big.extra) {
      preset.extra = {};
      for (const key of Object.keys(big.extra)) {
        preset.extra[key] = mix(big.extra[key], small.extra[key]);
      }
    }
    return preset;
  }

  const orbResolvedCache = new Map();

  // a (state, size) pair to its mode, speed and fully scaled draw options
  function orbResolve(state, size) {
    const key = `${state}-${size}`;
    const hit = orbResolvedCache.get(key);
    if (hit) {
      return hit;
    }
    const mode = ORB_STATE_MODE[state];
    const preset = orbPreset(mode, size);
    let opts = { ...ORB_BASE_PROFILES[mode] };
    if (preset.count !== 1) {
      opts = orbScaleCounts(opts, preset.count);
    }
    if (preset.size !== 1) {
      opts = orbScaleRadii(opts, preset.size);
    }
    if (preset.extra) {
      opts = { ...opts, ...preset.extra };
    }
    const resolved = { mode, speed: preset.speed, opts };
    orbResolvedCache.set(key, resolved);
    return resolved;
  }
