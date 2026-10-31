  // ---------- Thinking orbs: the modes, one per state (see 28r-ultra-orb-engine.js)
  // Used elsewhere: ORB_FRAMES.

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
      const { h2, ro, ux, uy, uz, vx, vy, vz, speed } = orbOrbitPlane(orb, R);
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

  // an orbit's radius, its plane (u, v) and its particles' speed, from its hashes
  function orbOrbitPlane(orb, R) {
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
    return { h2, ro, ux, uy, uz, vx, vy, vz, speed };
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
    const nodes = orbWebNodes(nodeN, t);
    const lines = orbWebLines(nodes, pt, thr, rs, o);
    const dots = [];
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
    orbWebSignals(dots, nodes, pt, t, rs, nodeR, nodeRDepth, o.signals ?? 5);
    return orbFinalize(dots, lines, o.rMin);
  }

  // the constellation's nodes: their sphere directions, wandering on noise
  function orbWebNodes(nodeN, t) {
    const nodes = [];
    for (let i = 0; i < nodeN; i++) {
      const d = orbFibDir(i, nodeN);
      const x = d[0] + 0.3 * (orbNoise(i * 0.31 + 9, t * 0.24) - 0.5) * 2;
      const y = d[1] + 0.3 * (orbNoise(i * 0.53 + 27, t * 0.21) - 0.5) * 2;
      const z = d[2] + 0.3 * (orbNoise(i * 0.77 + 55, t * 0.27) - 0.5) * 2;
      const l = Math.sqrt(x * x + y * y + z * z);
      nodes.push([x / l, y / l, z / l]);
    }
    return nodes;
  }

  // an edge between every two nodes nearer than thr, fainter the longer it is
  function orbWebLines(nodes, pt, thr, rs, o) {
    const nodeN = nodes.length;
    const lines = [];
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
    return lines;
  }

  // the packets, each running from one node to another
  function orbWebSignals(dots, nodes, pt, t, rs, nodeR, nodeRDepth, signals) {
    const nodeN = nodes.length;
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
