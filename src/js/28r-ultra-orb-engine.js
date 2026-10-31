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
  // Options: state (one of ORB_STATE_MODE's, default "working"); size in CSS px
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
  //
  // This file: the geometry helpers and the painter. The modes are in
  // 28ra-ultra-orb-modes.js, the presets in 28rb-ultra-orb-presets.js, and
  // the orbs on screen, their loop and ziaOrb() in 28rc-ultra-orb-loop.js.
  // Used elsewhere: orbLerp, orbFrac, orbHash, orbNoise, orbFibDir, orbAngleDelta,
  // orbProjector, orbRadiusScale, orbFinalize, orbPaintFrame, orbParseTint.

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
