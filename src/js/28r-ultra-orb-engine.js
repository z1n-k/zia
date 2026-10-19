  // ---------- Thinking orbs: a small dotted 3D orb on a 2D canvas
  // A framework-free port of the canvas engine in thinking-orbs 0.3.2
  // (https://libraries.dev/orbs), for the tab's loading spinner. The
  // geometry, projection, presets and painter are the package's, line for
  // line (the one change: a one-device-pixel floor on dots, which only
  // matters under a device pixel ratio of 5/3; see ORB_MIN_DEVICE_R); the
  // React component around them is replaced by ziaOrb() and one shared
  // animation loop.
  //
  // thinking-orbs is MIT licensed:
  //
  //   MIT License
  //
  //   Copyright (c) 2026 Jakub Antalik
  //
  //   Permission is hereby granted, free of charge, to any person obtaining a
  //   copy of this software and associated documentation files (the
  //   "Software"), to deal in the Software without restriction, including
  //   without limitation the rights to use, copy, modify, merge, publish,
  //   distribute, sublicense, and/or sell copies of the Software, and to
  //   permit persons to whom the Software is furnished to do so, subject to
  //   the following conditions:
  //
  //   The above copyright notice and this permission notice shall be included
  //   in all copies or substantial portions of the Software.
  //
  //   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
  //   OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  //   MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
  //   IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
  //   CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
  //   TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
  //   SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  //
  // Use:
  //   const orb = ziaOrb(document.createElementNS(XHTML_NS, "canvas"), { state: "searching", size: 16 });
  //   box.append(orb.canvas);
  //   orb.setState("connecting"); orb.setDark(false); orb.destroy();
  //
  // Options: state (one of ORB_STATES, default "working"); size in CSS px
  // (default 64; 64, 32 and 20 are the package's tunings, sizes between
  // are interpolated the way the package made its 32, and anything under
  // 20 is the 20 tuning drawn at that size); dark (true: light dots for a
  // dark background, false: dark dots for a light one, left out: follow
  // prefers-color-scheme); and, as in the package, speed (a multiplier),
  // color (an ink tint, "#rgb", "#rrggbb" or "rgb()") and label (the
  // canvas's aria-label; it's left alone if the canvas is aria-hidden).
  //
  // A canvas that's out of the document when the loop next runs is dropped
  // (destroy() isn't needed for it); setState() or setDark() on a handle
  // whose canvas is back in the document picks it up again.

  // ----- geometry helpers (engine/core)
  function orbLerp(a, b, f) {
    return a + (b - a) * f;
  }

  function orbFrac(x) {
    return x - Math.floor(x);
  }

  // deterministic hash in [0, 1)
  function orbHash(a, b) {
    const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return h - Math.floor(h);
  }

  // value noise on a 2D lattice: smooth, deterministic, cheap
  function orbNoise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let fx = x - xi;
    let fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = orbHash(xi, yi);
    const b = orbHash(xi + 1, yi);
    const c = orbHash(xi, yi + 1);
    const d = orbHash(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // stable directions on a unit sphere (Fibonacci lattice)
  function orbFibDir(i, n) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - (2 * (i + 0.5)) / n;
    const rad = Math.sqrt(1 - y * y);
    const a = i * golden;
    return [rad * Math.cos(a), y, rad * Math.sin(a)];
  }

  // shortest signed angular distance, wrapped to (-pi, pi]
  function orbAngleDelta(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }

  // shared spin (yaw) + tilt + orthographic projection
  function orbProjector(yaw, tilt, cx, cy, scale) {
    const st = Math.sin(tilt);
    const ct = Math.cos(tilt);
    const sy = Math.sin(yaw);
    const cyw = Math.cos(yaw);
    return (x, y, z) => {
      const x1 = x * cyw + z * sy;
      const z1 = -x * sy + z * cyw;
      const y1 = y * ct - z1 * st;
      const z2 = y * st + z1 * ct;
      return [cx + x1 * scale, cy - y1 * scale, z2];
    };
  }

  // dot radii were tuned for a 300px frame; sub-linear scaling keeps small
  // orbs legible
  function orbRadiusScale(size, pow) {
    return (size / 300) ** pow;
  }

  // drop invisible marks, clamp radii to the mode's floor, and z-sort
  // far to near into draw order
  function orbFinalize(dots, lines, rMin = 0.3) {
    const visible = [];
    for (const d of dots) {
      if ((d.a ?? 1) < 0.02) {
        continue;
      }
      d.r = Math.max(rMin, d.r);
      visible.push(d);
    }
    visible.sort((a, b) => a.z - b.z);
    return { dots: visible, lines: lines.filter((l) => (l.a ?? 1) >= 0.02) };
  }

  // ----- painter: matte grayscale dots; on a dark background the ink value
  // is mirrored (1 - white) so near dots read bright
  function orbInk(w, alpha, dark, tint) {
    if (!tint) {
      const g = Math.round((dark ? 1 - w : w) * 255);
      return `rgba(${g},${g},${g},${alpha})`;
    }
    const ramp = (c) => Math.round(dark ? c * (1 - w) : c + (255 - c) * w);
    return `rgba(${ramp(tint.r)},${ramp(tint.g)},${ramp(tint.b)},${alpha})`;
  }

  // lines first, so the nodes sit on top of their edges. (minR, in CSS px,
  // is this port's: see ORB_MIN_DEVICE_R.)
  function orbPaintFrame(ctx, frame, dark, tint, minR = 0) {
    for (const l of frame.lines) {
      const w = Math.min(1, Math.max(0, l.white));
      ctx.strokeStyle = orbInk(w, l.a ?? 1, dark, tint);
      ctx.lineWidth = l.w;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
    }
    for (const d of frame.dots) {
      const w = Math.min(1, Math.max(0, d.white));
      ctx.fillStyle = orbInk(w, d.a ?? 1, dark, tint);
      ctx.beginPath();
      ctx.arc(d.x, d.y, Math.max(d.r, minR), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // "#rgb", "#rrggbb" or "rgb()/rgba()" to {r, g, b}, else undefined
  function orbParseTint(color) {
    if (!color) {
      return undefined;
    }
    const hex = String(color).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) {
        h = h.replace(/./g, (c) => c + c);
      }
      const n = parseInt(h, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const fn = String(color).trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (fn) {
      return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]) };
    }
    return undefined;
  }

  // ----- modes: pure geometry over (size, t, opts), one per state

  // weaving: three strands plait around the sphere
  function orbFrameBraid(size, t, o) {
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.76;
    const pt = orbProjector(t * 0.4, 0.3, cx, cy, 1);
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const dots = [];
    const ghostN = o.ghostN ?? 150;
    for (let i = 0; i < ghostN; i++) {
      const d = orbFibDir(i, ghostN);
      const [px, py, z] = pt(d[0] * R, d[1] * R, d[2] * R);
      const depth = (z / R + 1) / 2;
      dots.push({ x: px, y: py, z, r: 0.8 * rs, white: 0.78, a: 0.1 + 0.22 * depth });
    }
    const strandN = o.strandN ?? 52;
    const turns = o.turns ?? 3;
    for (let s = 0; s < 3; s++) {
      const phase = (s / 3) * 2 * Math.PI;
      for (let i = 0; i < strandN; i++) {
        const u = (orbFrac(i / strandN + t * 0.045) * 2 - 1) * 0.96;
        const surf = Math.sqrt(Math.max(0, 1 - u * u));
        const endFade = Math.min(1, (1 - Math.abs(u)) / 0.1);
        const a = u * Math.PI * turns + phase;
        const weave = 1 + 0.075 * Math.sin(u * Math.PI * turns * 2 + phase * 2 + t * 0.8);
        const rr = surf * R * weave;
        const [px, py, zr] = pt(Math.cos(a) * rr, u * R * weave, Math.sin(a) * rr);
        const depth = (zr / R + 1) / 2;
        dots.push({
          x: px,
          y: py,
          z: zr,
          r: ((o.rBase ?? 1.2) + (o.rDepth ?? 1.8) * depth) * rs,
          white: 0.55 - 0.45 * depth,
          a: endFade * (0.45 + 0.55 * depth),
        });
      }
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // solving: the scramble-then-solve schedule and the quarter-turn moves
  function orbSolveCycle(time, count, slotDur, rest) {
    const cyc = 2 * count * slotDur + rest;
    const tc = time % cyc;
    const amount = new Array(count).fill(0);
    let active = -1;
    if (tc < 2 * count * slotDur) {
      const slot = Math.floor(tc / slotDur);
      const p = (tc - slot * slotDur) / slotDur;
      const cl = Math.min(1, p / 0.7);
      const ep = 1 - (1 - cl) ** 3;
      if (slot < count) {
        for (let i = 0; i < slot; i++) {
          amount[i] = 1;
        }
        amount[slot] = ep;
        active = slot;
      } else {
        const u = 2 * count - 1 - slot;
        for (let i = 0; i < u; i++) {
          amount[i] = 1;
        }
        amount[u] = 1 - ep;
        active = u;
      }
    }
    return { amount, active };
  }

  function orbApplyMoves(pt3, moves, sc) {
    let [x, y, z] = pt3;
    let inActive = false;
    for (let i = 0; i < moves.length; i++) {
      if (sc.amount[i] <= 0) {
        continue;
      }
      const mv = moves[i];
      const coord = mv.axis === 0 ? x : mv.axis === 1 ? y : z;
      if (coord < mv.lo || coord >= mv.hi) {
        continue;
      }
      if (i === sc.active) {
        inActive = true;
      }
      const a = mv.ang * sc.amount[i];
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      if (mv.axis === 0) {
        const y2 = y * ca - z * sa;
        z = y * sa + z * ca;
        y = y2;
      } else if (mv.axis === 1) {
        const x2 = x * ca + z * sa;
        z = -x * sa + z * ca;
        x = x2;
      } else {
        const x2 = x * ca - y * sa;
        y = x * sa + y * ca;
        x = x2;
      }
    }
    return [x, y, z, inActive];
  }

  function orbMakeMoves(count) {
    const moves = [];
    for (let i = 0; i < count; i++) {
      const axis = Math.min(2, Math.floor(orbHash(i, 2.3) * 3));
      const lo = -1 + 0.5 * Math.min(3, Math.floor(orbHash(i, 5.9) * 4));
      const dir = orbHash(i, 7.7) < 0.5 ? 1 : -1;
      moves.push({ axis, lo, hi: lo + 0.5, ang: (dir * Math.PI) / 2 });
    }
    return moves;
  }

  // searching: a scan meridian sweeps a dotted globe
  function orbFrameGlobe(size, t, o) {
    const spin = 0.5;
    const cx = size / 2;
    const cy = size / 2;
    const radius = (size / 2) * 0.82;
    const tilt = 0.4 + 0.06 * Math.sin(t * 0.35);
    const pt = orbProjector(t * spin, tilt, cx, cy, radius);
    const scan = t * (spin + (1.7 - spin) * (o.scanMul ?? 1));
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const dimBase = o.dimBase ?? 1;
    const dots = [];
    const latRings = o.latRings ?? 17;
    const lonDensity = o.lonDensity ?? 44;
    for (let li = 0; li <= latRings; li++) {
      const lat = -Math.PI / 2 + (li / latRings) * Math.PI;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);
      const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
      for (let lj = 0; lj < lonCount; lj++) {
        const lon = (lj / lonCount) * 2 * Math.PI;
        const [px, py, z] = pt(cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon));
        const depth = (z + 1) / 2;
        const d = orbAngleDelta(lon + t * spin, scan);
        const boost = Math.exp(-(d * d) / 0.18) * Math.max(0, z);
        dots.push({
          x: px,
          y: py,
          z,
          r: ((o.rBase ?? 0.6) + (o.rDepth ?? 1.7) * depth + (o.rBoost ?? 1) * boost) * rs,
          white: (o.inkFar ?? 0.62) - (o.inkSpan ?? 0.54) * depth,
          // (dimBase under 1 fades the un-scanned dots so the meridian reads)
          a: dimBase + (1 - dimBase) * Math.min(1, boost),
        });
      }
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // solving: bands scramble in quarter turns, then click back
  function orbFrameRubik(size, t, o) {
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.82;
    const pt = orbProjector(t * 0.55, 0.35 + 0.1 * Math.sin(t * 0.9), cx, cy, R);
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const moveCount = o.moveCount ?? 14;
    const moves = orbMakeMoves(moveCount);
    const sc = orbSolveCycle(t, moveCount, 0.42, 1.2);
    const dots = [];
    const latRings = o.latRings ?? 15;
    const lonDensity = o.lonDensity ?? 40;
    for (let li = 0; li <= latRings; li++) {
      const lat = -Math.PI / 2 + (li / latRings) * Math.PI;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);
      const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
      for (let lj = 0; lj < lonCount; lj++) {
        const lon = (lj / lonCount) * 2 * Math.PI;
        const [x, y, z, inActive] = orbApplyMoves([cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon)], moves, sc);
        const [px, py, zr] = pt(x, y, z);
        const depth = (zr + 1) / 2;
        dots.push({
          x: px,
          y: py,
          z: zr,
          r: ((o.rBase ?? 0.6) + (o.rDepth ?? 1.7) * depth + (inActive ? (o.rActive ?? 0.3) : 0)) * rs,
          white: (o.inkFar ?? 0.62) - (o.inkSpan ?? 0.54) * depth - (inActive ? 0.14 : 0),
        });
      }
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // listening: a waveform rolls through latitude rings
  function orbFrameWave(size, t, o) {
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.874;
    const pt = orbProjector(t * 0.18, 0.38, cx, cy, 1);
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const dots = [];
    const rings = o.rings ?? 15;
    const lonDensity = o.lonDensity ?? 40;
    for (let ri = 0; ri <= rings; ri++) {
      const lat = -Math.PI / 2 + (ri / rings) * Math.PI;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);
      const w = 0.62 * Math.sin(t * 2.1 - ri * 0.52) + 0.38 * Math.sin(t * 1.27 + ri * 0.83);
      const rr = R * (0.88 + 0.105 * w);
      const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
      for (let lj = 0; lj < lonCount; lj++) {
        const lon = (lj / lonCount) * 2 * Math.PI;
        const [px, py, z] = pt(cosLat * Math.cos(lon) * rr, sinLat * rr, cosLat * Math.sin(lon) * rr);
        const depth = (z / R + 1) / 2;
        const crest = Math.max(0, w);
        dots.push({
          x: px,
          y: py,
          z,
          r: ((o.rBase ?? 0.6) + (o.rDepth ?? 1.7) * depth) * (1 + 0.4 * crest) * rs,
          white: 0.66 - 0.56 * depth - 0.1 * crest,
        });
      }
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // shaping: a dotted outline morphs circle, triangle, square
  function orbSmooth(x) {
    return x * x * (3 - 2 * x);
  }

  function orbPolyPath(verts) {
    const V = verts.length;
    const L = [];
    let total = 0;
    for (let i = 0; i < V; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % V];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      L.push(l);
      total += l;
    }
    return (f) => {
      let target = f * total;
      let i = 0;
      while (target > L[i] && i < V - 1) {
        target -= L[i];
        i++;
      }
      const a = verts[i];
      const b = verts[(i + 1) % V];
      const ff = L[i] ? Math.min(1, target / L[i]) : 0;
      return [a[0] + (b[0] - a[0]) * ff, a[1] + (b[1] - a[1]) * ff];
    };
  }

  const ORB_SHAPES = [
    (f) => {
      const a = -Math.PI / 2 + f * 2 * Math.PI;
      return [Math.cos(a) * 0.24, Math.sin(a) * 0.24];
    },
    orbPolyPath([
      [0, -0.26],
      [0.24, 0.16],
      [-0.24, 0.16],
    ]),
    orbPolyPath([
      [0, -0.2],
      [0.2, -0.2],
      [0.2, 0.2],
      [-0.2, 0.2],
      [-0.2, -0.2],
    ]),
  ];
  const ORB_SHAPE_HOLD = 1.4;
  const ORB_SHAPE_MORPH = 0.9;

  function orbFrameMorph(size, t, o) {
    const SEG = ORB_SHAPE_HOLD + ORB_SHAPE_MORPH;
    const K = ORB_SHAPES.length;
    const tc = t % (SEG * K);
    const held = o.shape != null && o.shape >= 0 && o.shape < K ? Math.floor(o.shape) : -1;
    const k = held >= 0 ? held : Math.floor(tc / SEG);
    const local = held >= 0 ? t % SEG : tc - k * SEG;
    const m = held >= 0 ? 0 : local > ORB_SHAPE_HOLD ? orbSmooth((local - ORB_SHAPE_HOLD) / ORB_SHAPE_MORPH) : 0;
    const sprd = o.spread ?? 1;
    const pA = ORB_SHAPES[k];
    const pB = held >= 0 ? pA : ORB_SHAPES[(k + 1) % K];
    const M = 160;
    const pts = [];
    for (let i = 0; i < M; i++) {
      const f = i / M;
      const a = pA(f);
      const b = pB(f);
      pts.push([(a[0] + (b[0] - a[0]) * m) * sprd, (a[1] + (b[1] - a[1]) * m) * sprd]);
    }
    const L = [];
    let total = 0;
    for (let i = 0; i < M; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % M];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      L.push(l);
      total += l;
    }
    const n = Math.max(6, Math.round(34 * (o.iconD ?? 1)));
    const re = (o.rDot ?? 0.021) * 1.35 * sprd;
    const pulse = 1 + 0.02 * Math.sin(local * 3.1);
    const dots = [];
    const c2 = size / 2;
    let seg = 0;
    let acc = 0;
    for (let k2 = 0; k2 < n; k2++) {
      const target = (k2 / n) * total;
      while (acc + L[seg] < target && seg < M - 1) {
        acc += L[seg];
        seg++;
      }
      const a = pts[seg];
      const b = pts[(seg + 1) % M];
      const f = L[seg] ? Math.min(1, (target - acc) / L[seg]) : 0;
      const x = (a[0] + (b[0] - a[0]) * f) * pulse;
      const y = (a[1] + (b[1] - a[1]) * f) * pulse;
      dots.push({
        x: c2 + x * size,
        y: c2 + y * size,
        z: 0,
        r: Math.max(0.35, re * size),
        white: 0.1,
      });
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // working: particles on tilted orbits
  function orbFrameOrbits(size, t, o) {
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.82;
    const pt = orbProjector(t * 0.12, 0.3, cx, cy, 1);
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const dots = [];
    const orbitN = o.orbitN ?? 12;
    const ghostN = o.ghostN ?? 40;
    const particles = o.particles ?? 3;
    for (let orb = 0; orb < orbitN; orb++) {
      const h1 = orbHash(orb, 1.7);
      const h2 = orbHash(orb, 5.2);
      const h3 = orbHash(orb, 8.9);
      const ro = R * (0.45 + 0.52 * h1);
      const th = h1 * 2 * Math.PI;
      const phi = Math.acos(2 * h2 - 1);
      const nx = Math.sin(phi) * Math.cos(th);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(th);
      let ux = -ny;
      let uy = nx;
      const uz = 0;
      const ul = Math.max(1e-6, Math.sqrt(ux * ux + uy * uy));
      ux /= ul;
      uy /= ul;
      const vx = ny * uz - nz * uy;
      const vy = nz * ux - nx * uz;
      const vz = nx * uy - ny * ux;
      const speed = (0.25 + 0.55 * h3) * (h3 > 0.5 ? 1 : -1);
      for (let k = 0; k < ghostN; k++) {
        const a = (k / ghostN) * 2 * Math.PI;
        const [px, py, z] = pt(
          (ux * Math.cos(a) + vx * Math.sin(a)) * ro,
          (uy * Math.cos(a) + vy * Math.sin(a)) * ro,
          (uz * Math.cos(a) + vz * Math.sin(a)) * ro,
        );
        const depth = (z / ro + 1) / 2;
        dots.push({
          x: px,
          y: py,
          z,
          r: (o.ghostR ?? 0.9) * rs,
          white: 0.72,
          a: (o.ghostA ?? 0.5) * (0.4 + 0.6 * depth),
        });
      }
      for (let m = 0; m < particles; m++) {
        const a = t * speed + (m / particles) * 2 * Math.PI + h2 * 6;
        const [px, py, z] = pt(
          (ux * Math.cos(a) + vx * Math.sin(a)) * ro,
          (uy * Math.cos(a) + vy * Math.sin(a)) * ro,
          (uz * Math.cos(a) + vz * Math.sin(a)) * ro,
        );
        const depth = (z / ro + 1) / 2;
        dots.push({
          x: px,
          y: py,
          z,
          r: ((o.partR ?? 1.2) + (o.partRDepth ?? 1.6) * depth) * rs,
          white: 0.3 - 0.22 * depth,
        });
      }
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // composing: an undulating multi-band sash; breathing (faceOn): the same
  // sash turned face-on, undulating in its radius, with no ghost sphere
  function orbFrameRibbon(size, t, o) {
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.78;
    const spin = o.spin ?? 1;
    const camTilt = 0.3;
    const pt = orbProjector(t * 0.1 * spin, camTilt, cx, cy, 1);
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const dots = [];
    const ghostN = o.ghostN ?? 150;
    for (let i = 0; i < ghostN; i++) {
      const d = orbFibDir(i, ghostN);
      const [px, py, z] = pt(d[0] * R, d[1] * R, d[2] * R);
      const depth = (z / R + 1) / 2;
      dots.push({ x: px, y: py, z, r: 0.8 * rs, white: 0.78, a: 0.1 + 0.22 * depth });
    }
    const ya = t * 0.24 * spin;
    const ta = o.faceOn ? -camTilt : 0.55 + 0.3 * Math.sin(t * 0.18) * spin;
    const ux = Math.cos(ya);
    const uy = 0;
    const uz = Math.sin(ya);
    const vx = -uz * Math.sin(ta);
    const vy = Math.cos(ta);
    const vz = ux * Math.sin(ta);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const wobAmp = 0.23 * (o.wobMul ?? 1);
    const baseR = o.faceOn ? R / (1 + 0.85 * wobAmp) : R;
    const baseLanes = o.lanes ?? 5;
    const segs = o.segs ?? 88;
    const lanes = Math.max(1, Math.round(baseLanes * (o.bandMul ?? 1)));
    for (let w = 0; w < lanes; w++) {
      const laneOff = (w - (lanes - 1) / 2) * 0.075;
      const edge = Math.abs(w - (lanes - 1) / 2) / Math.max(1, (lanes - 1) / 2);
      for (let k = 0; k < segs; k++) {
        const a = (k / segs) * 2 * Math.PI;
        const wob = (0.16 * Math.sin(a * 3 - t * 1.7 + w * 0.22) + 0.07 * Math.sin(a * 5 + t * 1.1)) * (o.wobMul ?? 1);
        const radial = o.faceOn ? 1 + wob : 1;
        const off = o.faceOn ? laneOff : laneOff + wob;
        const x = ux * Math.cos(a) + vx * Math.sin(a) + nx * off;
        const y = uy * Math.cos(a) + vy * Math.sin(a) + ny * off;
        const z = uz * Math.cos(a) + vz * Math.sin(a) + nz * off;
        const l = Math.sqrt(x * x + y * y + z * z);
        const rr = baseR * radial;
        const [px, py, zr] = pt((x / l) * rr, (y / l) * rr, (z / l) * rr);
        const depth = (zr / R + 1) / 2;
        dots.push({
          x: px,
          y: py,
          z: zr,
          r: ((o.rBase ?? 1.1) + (o.rDepth ?? 1.7) * depth) * (1 - 0.25 * edge) * rs,
          white: 0.52 - 0.44 * depth + 0.18 * edge,
          a: 0.4 + 0.6 * depth,
        });
      }
    }
    return orbFinalize(dots, [], o.rMin);
  }

  // connecting: a constellation wires itself, packets running the edges
  function orbFrameWeb(size, t, o) {
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.8 * (o.spread ?? 1);
    const pt = orbProjector(t * 0.12, 0.32, cx, cy, R);
    const rs = orbRadiusScale(size, o.rsPow ?? 0.6);
    const nodeN = o.nodeN ?? 30;
    const thr = o.thr ?? 0.72;
    const nodeR = o.nodeR ?? 1.4;
    const nodeRDepth = o.nodeRDepth ?? 1.8;
    const nodes = [];
    for (let i = 0; i < nodeN; i++) {
      const d = orbFibDir(i, nodeN);
      const x = d[0] + 0.3 * (orbNoise(i * 0.31 + 9, t * 0.24) - 0.5) * 2;
      const y = d[1] + 0.3 * (orbNoise(i * 0.53 + 27, t * 0.21) - 0.5) * 2;
      const z = d[2] + 0.3 * (orbNoise(i * 0.77 + 55, t * 0.27) - 0.5) * 2;
      const l = Math.sqrt(x * x + y * y + z * z);
      nodes.push([x / l, y / l, z / l]);
    }
    const lines = [];
    const dots = [];
    for (let i = 0; i < nodeN; i++) {
      for (let j = i + 1; j < nodeN; j++) {
        const dx = nodes[i][0] - nodes[j][0];
        const dy = nodes[i][1] - nodes[j][1];
        const dz = nodes[i][2] - nodes[j][2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist >= thr) {
          continue;
        }
        const [x1, y1, z1] = pt(nodes[i][0], nodes[i][1], nodes[i][2]);
        const [x2, y2, z2] = pt(nodes[j][0], nodes[j][1], nodes[j][2]);
        const depth = ((z1 + z2) / 2 + 1) / 2;
        lines.push({
          x1,
          y1,
          x2,
          y2,
          white: 0.42,
          a: (1 - dist / thr) * (0.3 + 0.55 * depth),
          w: Math.max(0.6, (o.lineW ?? 0.8) * rs),
        });
      }
    }
    for (let i = 0; i < nodeN; i++) {
      const [px, py, z] = pt(nodes[i][0], nodes[i][1], nodes[i][2]);
      const depth = (z + 1) / 2;
      const pulse = 1 + 0.25 * Math.sin(t * 1.4 + i * 2.7);
      dots.push({
        x: px,
        y: py,
        z,
        r: (nodeR + nodeRDepth * depth) * pulse * rs,
        white: 0.55 - 0.45 * depth,
      });
    }
    const signals = o.signals ?? 5;
    for (let s = 0; s < signals; s++) {
      const seg = Math.floor(t * 0.55 + s * 7.31);
      const a = Math.floor(orbHash(seg, s * 3.1 + 1.7) * nodeN);
      const b = Math.floor(orbHash(seg, s * 5.7 + 4.2) * nodeN);
      if (a === b) {
        continue;
      }
      const f = orbFrac(t * 0.55 + s * 7.31);
      const x = orbLerp(nodes[a][0], nodes[b][0], f);
      const y = orbLerp(nodes[a][1], nodes[b][1], f);
      const z = orbLerp(nodes[a][2], nodes[b][2], f);
      const l = Math.max(1e-6, Math.sqrt(x * x + y * y + z * z));
      const [px, py, zr] = pt(x / l, y / l, z / l);
      const depth = (zr + 1) / 2;
      dots.push({
        x: px,
        y: py,
        z: zr,
        r: (nodeR * 1.5 + nodeRDepth * depth) * rs,
        white: 0.05,
        a: 0.5 + 0.5 * depth,
      });
    }
    return orbFinalize(dots, lines, o.rMin);
  }

  const ORB_FRAMES = {
    orbits: orbFrameOrbits,
    globe: orbFrameGlobe,
    rubik: orbFrameRubik,
    wave: orbFrameWave,
    web: orbFrameWeb,
    braid: orbFrameBraid,
    ribbon: orbFrameRibbon,
    // (ring is ribbon's geometry; its faceOn profile flag switches it)
    ring: orbFrameRibbon,
    morph: orbFrameMorph,
  };

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
  const ORB_STATES = Object.keys(ORB_STATE_MODE);

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
