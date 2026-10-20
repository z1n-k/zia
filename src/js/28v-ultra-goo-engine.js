/* goo.js: liquid "move" indicator for Zia (Firefox / Zen Browser mod).
 *
 * A framework-free port of the "move" effect of liquid-gooey 0.2.2
 * (https://libraries.dev/gooey, by Jakub Antalik), as used by its
 * tab-indicator recipe: an indicator that travels between tabs with
 * `transition: transform 300ms ease`, its liquid chasing it on a spring,
 * stretching with speed and pulling a droplet tail.
 *
 * Transcribed from the package source (src/ in its source map): the move
 * spring, velocity stretch, trailing-droplet maths and knob mapping
 * (observer.ts writeBlob, LiquidItem.tsx mapMove/zeta, spring.ts), the
 * box-shadow parser (shadow.ts) and how shadows sit on the merged liquid
 * (Gooey.tsx, filter.tsx). The CSS transition the recipe puts on the
 * indicator is simulated, including CSS's reversing rule on retarget.
 *
 * The package's SVG goo filter (feGaussianBlur sigma 6, then an alpha
 * threshold at 5/12) is replaced by the same thing computed analytically:
 * per scanline, the Gaussian-blurred coverage of the shapes and the x where
 * it crosses the threshold, drawn as one SVG path. No filter is rasterised,
 * and a translucent fill works (the filter needs an opaque one). In flight
 * the edge is the package's (~1.3px outside the element); as the liquid
 * comes to rest it eases onto the element's own edge, so it hands over to a
 * real background without a jump. Shadows use box-shadow's blur (sigma =
 * blur/2), as the package intends and the real background draws. NOTES.md
 * has the details and the frame-by-frame comparison with the package.
 *
 * liquid-gooey is under the MIT License:
 *
 * MIT License
 *
 * Copyright (c) 2026 Jakub
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Needs goo.css (static layout, scoped under .zia-goo); only per-frame
 * values (transform, clip-path, the path data) are set inline.
 *
 * Usage (rects are viewport rects, as getBoundingClientRect gives them):
 *   const goo = ziaGoo(layer, { radius: 9.5, background: "...", shadow: "..." });
 *   goo.moveTo(oldTabBg.getBoundingClientRect(), newTabBg.getBoundingClientRect());
 *   goo.destroy();
 *
 * `layer` is an element that scrolls with the tabs and paints under their
 * content; the liquid is drawn in a child anchored at its top-left corner.
 *
 * Options (all optional):
 *   radius      corner radius of the card, px                         (9.5)
 *   background  CSS colour of the liquid; var() works; translucent is fine
 *                                                                     (rgba(255,255,255,.12))
 *   shadow      box-shadow syntax, any number of layers, inset included;
 *               drawn on the merged liquid like the package's `shadow`  (none)
 *   springiness, wobble, stretch, trail: the package's 0..1 "move" knobs.
 *               Defaults are the tab-indicator recipe's
 *               (springiness .5, wobble .5, stretch .6, trail .35).
 *   reach       0..1, how far the tail may trail (MoveOptions.force)  (0.5)
 *   squeeze     cross-axis thinning per unit of stretch (package 0.65) (0.65)
 *   duration    ms the indicator takes from tab to tab                 (300)
 *   easing      [x1,y1,x2,y2] cubic-bezier of that travel              (CSS `ease`)
 *   blur        goo blur sigma, px (the package's <Liquid blur>)       (6)
 *   threshold   goo edge level in flight, 0.3..0.5 (5/12, the package's
 *               filter, ~1.3px outside the element); 0.5 keeps the
 *               element's own edge throughout. At rest it is always 0.5.
 *   bounds      element (the scroll container) or () => DOMRect, read once
 *               per move: overshoot squashes against its top/bottom edge
 *               instead of being clipped flat there                   (none)
 *   onStart()   called synchronously when a move begins: hide the real background
 *   onSettle()  called synchronously in the frame the liquid hides: show it again
 *
 * moveTo(fromRect, toRect, look?) returns a promise: true once settled, false
 * if superseded, stopped or destroyed. A call mid-move retargets the moving liquid
 * (fromRect is then ignored). look = { fromBackground, background } fades the
 * fill between two colours over the travel, for tabs whose backgrounds differ.
 * restyle({ background, shadow }) changes the look (safe mid-move).
 * stop() ends a move at once (hides the liquid, runs onSettle, resolves the
 * promise false), for when the tabs' layout changes under it.
 * While a move runs the layer carries the attribute `zia-goo-moving`, so the
 * hand-over can also be done in CSS alone.
 *
 * Plain functions in a shared scope: everything is prefixed `zg`/`ziaGoo` and
 * declared with var/function only, so loading the file twice is harmless.
 */

var zgXhtmlNs = "http://www.w3.org/1999/xhtml";
var zgSvgNs = "http://www.w3.org/2000/svg";
// One rAF loop shared by every instance in this scope. It sleeps when nothing moves.
var zgShared = zgShared || { live: new Set(), raf: 0, last: 0, win: null };

function zgClamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* observer.ts easingFn(), cubic-bezier branch. */
function zgBezier(x1, y1, x2, y2) {
  return function (t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2;
      const xm = 3 * m * (1 - m) * (1 - m) * x1 + 3 * m * m * (1 - m) * x2 + m * m * m;
      if (xm < t) lo = m;
      else hi = m;
    }
    const u = (lo + hi) / 2;
    return 3 * u * (1 - u) * (1 - u) * y1 + 3 * u * u * (1 - u) * y2 + u * u * u;
  };
}

/* observer.ts springStep/springSteps: semi-implicit Euler over a wall-clock dt,
 * substepped at <= 1/60 s so long frames stay stable. Mutates o[p], o[v]. */
function zgSpring(o, p, v, target, k, c, dt) {
  let n = Math.max(1, Math.ceil(dt * 60));
  const h = dt / n;
  let x = o[p];
  let u = o[v];
  while (n-- > 0) {
    u += (k * (target - x) - c * u) * h;
    x += u * h;
  }
  o[p] = x;
  o[v] = u;
}

/* LiquidItem.tsx mapMove() + zeta(): the public 0..1 knobs to raw physics.
 * Knobs at 0.5 give MOVE_DEFAULTS' stiffness 380 / damping 18 exactly. */
function zgTune(o) {
  const zeta = (b) => Math.max(0.12, 1 - 1.1 * zgClamp(b, 0, 1));
  const k = 380 * Math.pow(10, zgClamp(o.springiness ?? 0.5, 0, 1) - 0.5);
  const ez = o.easing || [0.25, 0.1, 0.25, 1];
  return {
    k,
    c: 18 * Math.sqrt(k / 380) * (zeta(o.wobble ?? 0.5) / zeta(0.5)),
    stretch: 0.5 * zgClamp(o.stretch ?? 0.6, 0, 1),
    tail: 0.8 * zgClamp(o.trail ?? 0.35, 0, 1),
    force: zgClamp(o.reach ?? 0.5, 0, 1),
    squeeze: o.squeeze ?? 0.65,
    blur: Math.max(0.5, o.blur ?? 6),
    threshold: zgClamp(o.threshold ?? 5 / 12, 0.3, 0.5),
    radius: o.radius ?? 9.5,
    duration: Math.max(0, o.duration ?? 300),
    ease: zgBezier(ez[0], ez[1], ez[2], ez[3]),
  };
}

function zgBox(b) {
  return { cx: b.cx, cy: b.cy, w: b.w, h: b.h };
}

function zgSame(a, b) {
  return (
    Math.abs(a.cx - b.cx) < 0.5 && Math.abs(a.cy - b.cy) < 0.5 &&
    Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5
  );
}

function zgNewSim(at) {
  return {
    // The virtual indicator: the recipe's CSS-transitioned element.
    from: zgBox(at),
    to: zgBox(at),
    cur: zgBox(at),
    rev: zgBox(at), // CSS "reversing-adjusted start value"
    factor: 1, // CSS "reversing shortening factor"
    t0: -1,
    p: 1,
    vert: true, // scan axis of the goo: rows for vertical travel
    // Liquid body: the centre springs after the indicator; size follows it.
    cx: at.cx, cy: at.cy, vx: 0, vy: 0, w: at.w, h: at.h, sx: 1, sy: 1, speed: 0,
    // Trailing droplet.
    tx: at.cx, ty: at.cy, tvx: 0, tvy: 0, tr: 0, ph: 0, m: 0,
    lx: 0, ly: 0, mx: 0, my: 0, ux: 1, uy: 0,
    // Fill colours faded over the travel (null: the instance background).
    colA: null, colB: null,
  };
}

/* Point the indicator at a new box, as a CSS transition would when its end
 * value changes: from where it is now, over the full duration, unless it is
 * heading back to where it came from, which CSS shortens (css-transitions-1,
 * "reversing shortening factor"). Starts on the next frame. */
function zgRetarget(s, to, T) {
  const running = s.t0 >= 0 && s.p < 1;
  if (running && zgSame(to, s.rev)) {
    const e = T.ease(s.p);
    s.factor = zgClamp(e * s.factor + (1 - s.factor), 0, 1);
    s.rev = zgBox(s.to);
  } else {
    s.factor = 1;
    s.rev = zgBox(s.cur);
  }
  s.from = zgBox(s.cur);
  s.to = zgBox(to);
  s.t0 = -1;
  s.p = 0;
  const dx = to.cx - s.cx;
  const dy = to.cy - s.cy;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) s.vert = Math.abs(dy) >= Math.abs(dx);
}

/* One frame of observer.ts writeBlob(), dyn.move branch. Returns true while moving. */
function zgStep(s, T, now, dt) {
  // 1. The indicator: `transition: transform <duration> <easing>`.
  if (s.t0 < 0) s.t0 = now;
  const dur = T.duration * s.factor;
  s.p = dur > 0 ? zgClamp((now - s.t0) / dur, 0, 1) : 1;
  const e = T.ease(s.p);
  const f = s.from;
  const t = s.to;
  const g = s.cur;
  g.cx = f.cx + (t.cx - f.cx) * e;
  g.cy = f.cy + (t.cy - f.cy) * e;
  g.w = f.w + (t.w - f.w) * e;
  g.h = f.h + (t.h - f.h) * e;

  // 2. Lag + wobble: the liquid centre chases it on the move spring.
  zgSpring(s, "cx", "vx", g.cx, T.k, T.c, dt);
  zgSpring(s, "cy", "vy", g.cy, T.k, T.c, dt);
  s.w = g.w;
  s.h = g.h;
  const speed = Math.hypot(s.vx, s.vy);
  s.speed = speed;

  // 3. Velocity stretch: package = rotate(a) scale(1+st, 1/(1+0.65 st)) rotate(-a)
  //    about the centre. Kept axis-aligned (the shear term is dropped), which
  //    is exact for vertical or horizontal travel.
  const st = speed > 2 ? Math.min(T.stretch, speed * 0.0006) : 0;
  const ux = speed > 0.001 ? s.vx / speed : 1;
  const uy = speed > 0.001 ? s.vy / speed : 0;
  const along = 1 + st;
  const across = 1 / (1 + st * T.squeeze);
  s.sx = ux * ux * along + uy * uy * across;
  s.sy = uy * uy * along + ux * ux * across;
  s.ux = ux;
  s.uy = uy;

  // 4. Trailing droplet: chases the body centre on a laggier spring (170/22),
  //    sized by the side it trails from, its reach clamped by `force`.
  zgSpring(s, "tx", "tvx", s.cx, 170, 22, dt);
  zgSpring(s, "ty", "tvy", s.cy, 170, 22, dt);
  const perp = Math.max(4, Math.abs(ux) * s.h + Math.abs(uy) * s.w);
  const halfAlong = (Math.abs(ux) * s.w + Math.abs(uy) * s.h) / 2;
  const base = perp / 2;
  const lx = s.tx - s.cx;
  const ly = s.ty - s.cy;
  const lag = Math.hypot(lx, ly);
  const maxLag = halfAlong + base * (0.2 + T.force * 1.6);
  if (lag > maxLag) {
    s.tx = s.cx + (lx / lag) * maxLag;
    s.ty = s.cy + (ly / lag) * maxLag;
  }
  // As in the package: the main droplet sits at the clamped lag, the two
  // mid-droplets at 45% / 75% of the lag measured before the clamp.
  s.lx = s.tx - s.cx;
  s.ly = s.ty - s.cy;
  s.mx = lx;
  s.my = ly;
  const onset = zgClamp((speed - 20) / 120, 0, 1);
  s.tr += (base * T.tail * onset - s.tr) * Math.min(1, dt * 10);
  if (s.tr >= 0.3) s.ph += speed * dt * 0.045;

  // 5. Motion amount for the goo's edge level: 1 while the liquid moves or
  //    its tail sticks out of the body, easing to 0 as it comes to rest.
  const out = s.tr >= 0.3 && Math.hypot(s.lx, s.ly) + s.tr > halfAlong;
  const mt = out ? 1 : zgClamp((speed - 2) / 100, 0, 1);
  s.m += (mt - s.m) * Math.min(1, dt * (mt > s.m ? 30 : 15));

  // Settled: the indicator arrived, the liquid on it (0.2px) and at rest, at
  // its own edge, and the tail gone, or only shrinking out of sight inside
  // the body (the package waits for it to vanish; nothing would show).
  return !(
    s.p >= 1 &&
    Math.abs(s.cx - t.cx) < 0.2 &&
    Math.abs(s.cy - t.cy) < 0.2 &&
    speed < 2 &&
    s.m < 0.03 &&
    (s.tr < 0.3 || zgInside(zgShapes(s, T, s.shp || (s.shp = zgShapesBuf()))))
  );
}

function zgShapesBuf() {
  return { body: { hw: 0, hh: 0, rx: 0, ry: 0 }, circles: new Float64Array(9), n: 0 };
}

/* The silhouette pieces, relative to the body centre: the stretched rounded
 * rect plus the package's three tail circles (the main droplet with r,
 * mid-droplets at 45% / 75% with 0.62 r / 0.4 r, weaving off-axis). */
function zgShapes(s, T, out) {
  const r0 = Math.min(T.radius, s.w / 2, s.h / 2);
  const b = out.body;
  b.hw = (s.w / 2) * s.sx;
  b.hh = (s.h / 2) * s.sy;
  b.rx = r0 * s.sx;
  b.ry = r0 * s.sy;
  out.n = 0;
  if (s.tr >= 0.3) {
    const wob = s.tr * 0.16;
    const px = -s.uy;
    const py = s.ux;
    const w1 = Math.sin(s.ph) * wob;
    const w2 = Math.sin(s.ph + 2.4) * -wob;
    const c = out.circles;
    c[0] = s.lx; c[1] = s.ly; c[2] = s.tr;
    c[3] = s.mx * 0.45 + px * w1; c[4] = s.my * 0.45 + py * w1; c[5] = s.tr * 0.62;
    c[6] = s.mx * 0.75 + px * w2; c[7] = s.my * 0.75 + py * w2; c[8] = s.tr * 0.4;
    out.n = 3;
  }
  return out;
}

function zgNum(v) {
  return String(Math.round(v * 10) / 10);
}

/* Rounded rect with elliptical corners (geometry.ts roundedRectPath, one radius). */
function zgRectPath(b) {
  const x = -b.hw, y = -b.hh, w = b.hw * 2, h = b.hh * 2, rx = b.rx, ry = b.ry;
  const a = " " + zgNum(rx) + " " + zgNum(ry) + " 0 0 1 ";
  return (
    "M" + zgNum(x + rx) + " " + zgNum(y) +
    "H" + zgNum(x + w - rx) + "A" + a + zgNum(x + w) + " " + zgNum(y + ry) +
    "V" + zgNum(y + h - ry) + "A" + a + zgNum(x + w - rx) + " " + zgNum(y + h) +
    "H" + zgNum(x + rx) + "A" + a + zgNum(x) + " " + zgNum(y + h - ry) +
    "V" + zgNum(y + ry) + "A" + a + zgNum(x + rx) + " " + zgNum(y) + "Z"
  );
}

/* Standard normal CDF and density, tabulated once over [-6, 6]. */
var zgPhiN = 1536;
var zgPhiT = zgPhiT || null;
var zgPdfT = zgPdfT || null;
function zgPhiInit() {
  const n = zgPhiN;
  const P = new Float64Array(n + 2);
  const D = new Float64Array(n + 2);
  const pdf = (z) => Math.exp(-0.5 * z * z) * 0.3989422804014327;
  const dz = 12 / n;
  let acc = 0;
  D[0] = pdf(-6);
  for (let i = 1; i <= n + 1; i++) {
    const z0 = -6 + (i - 1) * dz;
    // Simpson over each cell.
    acc += (dz / 6) * (pdf(z0) + 4 * pdf(z0 + dz / 2) + pdf(z0 + dz));
    P[i] = acc;
    D[i] = pdf(-6 + i * dz);
  }
  for (let i = 0; i <= n + 1; i++) P[i] = Math.min(1, P[i] + 9.865876450377e-10);
  zgPhiT = P;
  zgPdfT = D;
}

/* G(x) on one scanline: the source rows i0, i0+tap, ... (intervals L..R),
 * each blurred across by Phi, summed with the vertical weights W. Writes the
 * value to o[0] and dG/dx to o[1]. */
function zgField(L, R, K, W, M, i0, tap, x, isig, o) {
  const P = zgPhiT;
  const D = zgPdfT;
  const sc = zgPhiN / 12;
  let g = 0;
  let d = 0;
  for (let j = -M, i = i0 - M * tap; j <= M; j++, i += tap) {
    const l = L[i];
    const r = R[i];
    if (!(l <= r)) continue;
    const w = W[j + M] * K[i];
    let a = (r - x) * isig;
    let pa;
    let da;
    if (a >= 6) { pa = 1; da = 0; }
    else if (a <= -6) continue; // the whole interval is left of x... and so is its blur
    else {
      const u = (a + 6) * sc;
      const k = u | 0;
      const f = u - k;
      pa = P[k] + (P[k + 1] - P[k]) * f;
      da = D[k] + (D[k + 1] - D[k]) * f;
    }
    const b = (l - x) * isig;
    let pb = 0;
    let db = 0;
    if (b >= 6) continue;
    if (b > -6) {
      const u = (b + 6) * sc;
      const k = u | 0;
      const f = u - k;
      pb = P[k] + (P[k + 1] - P[k]) * f;
      db = D[k] + (D[k + 1] - D[k]) * f;
    }
    g += w * (pa - pb);
    d += w * (db - da);
  }
  o[0] = g;
  o[1] = d * isig;
}

/* Where G crosses th between lo (G >= th) and hi (G < th): safeguarded Newton. */
function zgCross(L, R, K, W, M, i0, tap, lo, hi, x, th, isig, o) {
  if (!(x > Math.min(lo, hi) && x < Math.max(lo, hi))) x = (lo + hi) / 2;
  for (let it = 0; it < 12; it++) {
    zgField(L, R, K, W, M, i0, tap, x, isig, o);
    const e = o[0] - th;
    if (e >= 0) lo = x;
    else hi = x;
    if (Math.abs(e) < 1e-3 || Math.abs(hi - lo) < 0.02) break;
    let nx = o[1] !== 0 ? x - e / o[1] : NaN;
    if (!(nx > Math.min(lo, hi) && nx < Math.max(lo, hi))) nx = (lo + hi) / 2;
    x = nx;
  }
  return x;
}

/* The goo, without a filter. The package blurs the shapes (sigma `blur`) and
 * keeps alpha >= 5/12; here, per scanline across the travel direction, the
 * blurred coverage is evaluated exactly (horizontal blur of each row's
 * interval in closed form via Phi, vertical blur as a Gaussian sum over rows
 * 1px apart) and its two threshold crossings found by Newton's method. Every
 * piece here meets a scanline in one interval, so the silhouette is two
 * functions L(y), R(y); it is drawn as one closed subpath per run of rows,
 * with parabolic caps. The source shapes are unioned in (the filter's own
 * `atop` leaves out what the blur eats at convex corners), so at th = 0.5
 * the edge is exactly the element's. */
function zgGooPath(sh, T, buf, vert, th) {
  if (!zgPhiT) zgPhiInit();
  const b = sh.body;
  const c = sh.circles;
  const nc = sh.n;
  // Scan space: rows run across the travel direction.
  const hw = vert ? b.hw : b.hh;
  const hh = vert ? b.hh : b.hw;
  const rx = vert ? b.rx : b.ry;
  const ry = vert ? b.ry : b.rx;
  const C = buf.C || (buf.C = new Float64Array(9));
  for (let k = 0; k < nc; k++) {
    C[k * 3] = vert ? c[k * 3] : c[k * 3 + 1];
    C[k * 3 + 1] = vert ? c[k * 3 + 1] : c[k * 3];
    C[k * 3 + 2] = c[k * 3 + 2];
  }
  const sig = T.blur;
  const isig = 1 / sig;
  const uni = th >= 0.5 - 1e-9; // the shortcut below holds only there
  let top = -hh;
  let bot = hh;
  for (let k = 0; k < nc; k++) {
    top = Math.min(top, C[k * 3 + 1] - C[k * 3 + 2]);
    bot = Math.max(bot, C[k * 3 + 1] + C[k * 3 + 2]);
  }
  // Rows ~0.5px apart, aligned so the body's own top and bottom are rows.
  const h = (2 * hh) / Math.max(2, Math.round(hh * 4));
  const pad = 1 + Math.ceil((sig * 0.6 * (0.5 - th) * 12) / h);
  const k0 = Math.floor((top + hh) / h) - pad;
  const k1 = Math.ceil((bot + hh) / h) + pad;
  const tap = Math.max(1, Math.round(1 / h)); // vertical blur sampled every ~1px
  const M = Math.ceil((3 * sig) / (tap * h));
  const ext = M * tap;
  const n = k1 - k0 + 1;
  const N = n + 2 * ext;
  if (!buf.L || buf.L.length < N) {
    const size = N + 256;
    buf.L = new Float64Array(size);
    buf.R = new Float64Array(size);
    buf.GL = new Float64Array(size);
    buf.GR = new Float64Array(size);
    buf.Gc = new Float64Array(size);
    buf.K = new Float64Array(size);
  }
  if (!buf.W || buf.W.length < 2 * M + 1) buf.W = new Float64Array(2 * M + 65);
  const L = buf.L, R = buf.R, K = buf.K, GL = buf.GL, GR = buf.GR, Gc = buf.Gc, W = buf.W;
  const o = buf.o || (buf.o = new Float64Array(2));
  const yOf = (i) => -hh + (k0 - ext + i) * h;

  // Source profile: the union's interval on each row.
  const inner = hh - ry;
  for (let i = 0; i < N; i++) {
    const y = yOf(i);
    let l = Infinity;
    let r = -Infinity;
    const ay = Math.abs(y);
    if (ay <= hh + 1e-6) {
      let e = hw;
      if (ay > inner && ry > 0) {
        const q = (ay - inner) / ry;
        e = hw - rx + rx * Math.sqrt(Math.max(0, 1 - q * q));
      }
      l = -e;
      r = e;
    }
    for (let k = 0; k < nc; k++) {
      const dy = y - C[k * 3 + 1];
      const cr = C[k * 3 + 2];
      if (dy * dy <= cr * cr) {
        const e = Math.sqrt(cr * cr - dy * dy);
        const cx = C[k * 3];
        if (cx - e < l) l = cx - e;
        if (cx + e > r) r = cx + e;
      }
    }
    L[i] = l;
    R[i] = r;
    // A row exactly on the body's flat top or bottom edge sits on a jump in
    // coverage: half weight, as the trapezoid rule has it.
    K[i] = Math.abs(ay - hh) < 1e-6 ? 0.5 : 1;
  }
  let ws = 0;
  for (let j = -M; j <= M; j++) {
    const yy = j * tap * h;
    W[j + M] = Math.exp(-(yy * yy) / (2 * sig * sig));
    ws += W[j + M];
  }
  for (let j = 0; j <= 2 * M; j++) W[j] /= ws;

  // Level set on every `tap`-th row (~1px), interpolated between; then the
  // source unioned in on every row (~0.5px), which keeps corners exact.
  Gc[ext - 1] = 0;
  Gc[ext + n] = 0;
  let pR1 = NaN, pR2 = NaN, pL1 = NaN, pL2 = NaN;
  const evalRow = (i) => {
    // Mass-weighted centre of the rows in reach, where G peaks, and their extent.
    let sw = 0;
    let sx = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = -M, q = i - ext; j <= M; j++, q += tap) {
      if (!(L[q] <= R[q])) continue;
      const m = W[j + M] * (R[q] - L[q] + 1e-3);
      sw += m;
      sx += m * (L[q] + R[q]);
      if (L[q] < lo) lo = L[q];
      if (R[q] > hi) hi = R[q];
    }
    let cl = Infinity;
    let cr = -Infinity;
    Gc[i] = 0;
    if (sw > 0) {
      const xc = sx / (2 * sw);
      // A side where this row reaches furthest of all rows in reach has
      // G <= 0.5 at its own edge: with the union, the edge is the answer.
      const own = uni && L[i] <= R[i];
      const domR = own && R[i] >= hi;
      const domL = own && L[i] <= lo;
      zgField(L, R, K, W, M, i, tap, xc, isig, o);
      Gc[i] = o[0];
      if (o[0] >= th) {
        cr = domR ? R[i] : zgCross(L, R, K, W, M, i, tap, xc, hi + 6 * sig, 2 * pR1 - pR2, th, isig, o);
        cl = domL ? L[i] : zgCross(L, R, K, W, M, i, tap, xc, lo - 6 * sig, 2 * pL1 - pL2, th, isig, o);
      }
    }
    GL[i] = cl;
    GR[i] = cr;
    if (cl <= cr) {
      pR2 = isFinite(pR1) ? pR1 : cr;
      pL2 = isFinite(pL1) ? pL1 : cl;
      pR1 = cr;
      pL1 = cl;
    } else {
      pR1 = pR2 = pL1 = pL2 = NaN;
    }
  };
  const lastRow = ext + n - 1;
  for (let i = ext; i <= lastRow; i += tap) evalRow(i);
  if ((lastRow - ext) % tap) evalRow(lastRow);
  for (let i = ext; i <= lastRow; i++) {
    const a = (i - ext) % tap;
    if (a === 0 || i === lastRow) continue;
    const i0 = i - a;
    const i1 = Math.min(i0 + tap, lastRow);
    const f = a / (i1 - i0);
    const in0 = GL[i0] <= GR[i0];
    const in1 = GL[i1] <= GR[i1];
    if (in0 && in1) {
      Gc[i] = Gc[i0] + (Gc[i1] - Gc[i0]) * f;
      GL[i] = GL[i0] + (GL[i1] - GL[i0]) * f;
      GR[i] = GR[i0] + (GR[i1] - GR[i0]) * f;
    } else if (in0 || in1) {
      // The end of a piece: worked out, not interpolated.
      pR1 = pR2 = pL1 = pL2 = NaN;
      evalRow(i);
    } else {
      Gc[i] = Gc[i0] + (Gc[i1] - Gc[i0]) * f;
      GL[i] = Infinity;
      GR[i] = -Infinity;
    }
  }
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = ext; i <= lastRow; i++) {
    if (L[i] <= R[i]) {
      if (L[i] < GL[i]) GL[i] = L[i];
      if (R[i] > GR[i]) GR[i] = R[i];
    }
    if (GL[i] <= GR[i]) {
      if (GL[i] < minX) minX = GL[i];
      if (GR[i] > maxX) maxX = GR[i];
    }
  }

  // Caps: the true end of a run lies between its last row and the empty one
  // beyond. Shapes ending in that gap end it; otherwise interpolate G there.
  const capY = (iIn, iOut) => {
    const yIn = yOf(iIn);
    const yOut = yOf(iOut);
    const dir = yOut > yIn ? 1 : -1;
    let best = yIn;
    const edge = (y) => {
      if ((y - yIn) * dir > 0 && (yOut - y) * dir > 0 && (y - best) * dir > 0) best = y;
    };
    {
      edge(dir > 0 ? hh : -hh);
      for (let k = 0; k < nc; k++) edge(C[k * 3 + 1] + dir * C[k * 3 + 2]);
    }
    const gi = Gc[iIn];
    const go = Gc[iOut];
    if (gi >= th && go < th && gi > go) edge(yIn + ((yOut - yIn) * (gi - th)) / (gi - go));
    return best;
  };

  // Emit: right side down, bottom cap, left side up, top cap; each side
  // simplified to within 0.1px.
  const P = vert
    ? (x, y) => zgNum(x) + " " + zgNum(y)
    : (x, y) => zgNum(y) + " " + zgNum(x);
  let d = "";
  let i = ext;
  const last = ext + n - 1;
  let minY = Infinity;
  let maxY = -Infinity;
  while (i <= last) {
    while (i <= last && !(GL[i] <= GR[i])) i++;
    const a = i;
    while (i <= last && GL[i] <= GR[i]) i++;
    const z = i - 1;
    if (z < a) continue;
    const ya = yOf(a);
    const yz = yOf(z);
    const yTop = capY(a, a - 1);
    const yBot = capY(z, z + 1);
    if (yTop < minY) minY = yTop;
    if (yBot > maxY) maxY = yBot;
    d += "M" + P(GR[a], ya);
    d += zgSide(GR, a, z, 1, yOf(0), h, P);
    if (yBot > yz + 0.05) d += "Q" + P((GL[z] + GR[z]) / 2, 2 * yBot - yz) + " " + P(GL[z], yz);
    else d += "L" + P(GL[z], yz);
    d += zgSide(GL, z, a, -1, yOf(0), h, P);
    if (yTop < ya - 0.05) d += "Q" + P((GL[a] + GR[a]) / 2, 2 * yTop - ya) + " " + P(GR[a], ya);
    d += "Z";
  }
  const bd = buf.bounds || (buf.bounds = {});
  if (vert) { bd.l = minX; bd.r = maxX; bd.t = minY; bd.b = maxY; }
  else { bd.l = minY; bd.r = maxY; bd.t = minX; bd.b = maxX; }
  return d;
}

/* Polyline through X[from..to] (row k at y0 + k*step), dropping every point
 * that lies within 0.1px of the chord between its kept neighbours. Linear
 * time: the chord slopes that keep every skipped point within tolerance
 * form an interval, narrowed point by point. */
function zgSide(X, from, to, dir, y0, step, P) {
  let out = "";
  let a = from;
  let lo = -Infinity;
  let hi = Infinity;
  for (let k = from + dir; dir > 0 ? k <= to : k >= to; k += dir) {
    const span = (k - a) * dir;
    const slope = (X[k] - X[a]) / span;
    if (slope < lo || slope > hi) {
      a = k - dir;
      out += "L" + P(X[a], y0 + a * step);
      lo = (X[k] - 0.1 - X[a]) * dir / (k - a);
      hi = (X[k] + 0.1 - X[a]) * dir / (k - a);
      continue;
    }
    const l = (X[k] - 0.1 - X[a]) / span;
    const h = (X[k] + 0.1 - X[a]) / span;
    if (l > lo) lo = l;
    if (h < hi) hi = h;
  }
  return to === from ? out : out + "L" + P(X[to], y0 + to * step);
}

/* shadow.ts parseShadow(): box-shadow syntax to layers. */
function zgParseShadow(input) {
  if (!input || !input.trim() || input.trim() === "none") return [];
  const split = (str, sep) => {
    const parts = [];
    let depth = 0;
    let cur = "";
    for (const ch of str) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (depth === 0 && (sep === "," ? ch === "," : /\s/.test(ch))) {
        if (cur.trim()) parts.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  };
  const LENGTH = /^[+-]?(\d+\.?\d*|\.\d+)(px)?$/;
  const out = [];
  for (const layer of split(input, ",")) {
    const tokens = split(layer, " ");
    if (!tokens.length) continue;
    const nums = [];
    const color = [];
    for (const tok of tokens) {
      if (tok === "inset") continue;
      if (nums.length < 4 && LENGTH.test(tok)) nums.push(parseFloat(tok));
      else color.push(tok);
    }
    out.push({
      x: nums[0] || 0,
      y: nums[1] || 0,
      blur: nums[2] || 0,
      spread: nums[3] || 0,
      color: color.join(" ") || "rgba(0, 0, 0, 0.35)",
      inset: tokens.includes("inset"),
    });
  }
  return out;
}

/* Shadow layers, as CSS box-shadow draws them and the package's filter
 * passes do on its (opaque) liquid: outer layers only outside the edge,
 * inset layers only inside it, the first layer on top. Each is a copy of the
 * liquid's path, grown by its spread (a stroke of 2x spread with round
 * joins), offset, and blurred by CSS blur(blur/2), the GPU half of the
 * package's own split; clip-path keeps outer layers off the inside of a
 * translucent fill and inset layers inside the edge. */
function zgBuildShadows(inst, shadow) {
  const doc = inst.wrap.ownerDocument;
  for (const box of [inst.outerBox, inst.innerBox]) box.textContent = "";
  inst.shadows = [];
  const layers = zgParseShadow(shadow || "");
  let ext = 2;
  for (let i = layers.length - 1; i >= 0; i--) {
    const s = layers[i];
    const spread = Math.max(0, s.spread);
    const svg = doc.createElementNS(zgSvgNs, "svg");
    svg.setAttribute("class", "zia-goo-shadow");
    svg.setAttribute("width", "1");
    svg.setAttribute("height", "1");
    if (s.x || s.y) svg.style.transform = "translate(" + s.x + "px, " + s.y + "px)";
    if (s.blur > 0) svg.style.filter = "blur(" + s.blur / 2 + "px)";
    const path = doc.createElementNS(zgSvgNs, "path");
    svg.appendChild(path);
    (s.inset ? inst.innerBox : inst.outerBox).appendChild(svg);
    path.style.fill = s.color;
    if (s.inset) path.setAttribute("fill-rule", "evenodd");
    if (spread > 0) {
      // Fill and stroke overlap: paint them opaque and fade the whole layer,
      // so the overlap does not count twice.
      // (computed colours come as rgb()/rgba(), or as color(srgb r g b / a)
      // for color-mix() and friends)
      const cs = inst.win.getComputedStyle(path).fill || "";
      const m =
        /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(cs) ||
        /color\(\s*srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/.exec(cs);
      let color = s.color;
      if (m) {
        const k = m[0].startsWith("color(") ? 255 : 1;
        const ch = (i) => Math.round(zgClamp(parseFloat(m[i]) * k, 0, 255));
        color = "rgb(" + ch(1) + ", " + ch(2) + ", " + ch(3) + ")";
        const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        svg.style.opacity = String(a);
      }
      path.style.fill = color;
      path.style.stroke = color;
      path.style.strokeWidth = String(spread * 2);
      path.style.strokeLinejoin = "round";
    }
    ext = Math.max(ext, Math.max(Math.abs(s.x), Math.abs(s.y)) + s.blur * 1.5 + spread + 2);
    inst.shadows.push({ path, inset: s.inset });
  }
  inst.shadowExt = ext;
  inst.hasOuter = inst.shadows.some((s) => !s.inset);
  inst.hasInset = inst.shadows.some((s) => s.inset);
  inst.outerBox.style.display = inst.hasOuter ? "" : "none";
  inst.innerBox.style.display = inst.hasInset ? "" : "none";
  inst.lastD = null;
}

function zgLocal(rect, origin) {
  return {
    cx: rect.left - origin.left + rect.width / 2,
    cy: rect.top - origin.top + rect.height / 2,
    w: rect.width,
    h: rect.height,
  };
}

/* Optional `bounds` (the scroll container): where the overshoot would run past
 * its top/bottom edge, the liquid squashes against the edge (down to 60% of
 * its height, then stops) instead of being clipped flat by the scrollport. */
function zgSquash(sh, cy, bd) {
  const b = sh.body;
  let top = cy - b.hh;
  let bot = cy + b.hh;
  const minH = b.hh * 2 * 0.6;
  if (top < bd.top) {
    top = bd.top;
    if (bot < top + minH) bot = top + minH;
  } else if (bot > bd.bottom) {
    bot = bd.bottom;
    if (top > bot - minH) top = bot - minH;
  } else {
    return cy;
  }
  const ncy = (top + bot) / 2;
  const shift = cy - ncy;
  b.hh = (bot - top) / 2;
  b.ry = Math.min(b.ry, b.hh);
  for (let k = 0; k < sh.n; k++) sh.circles[k * 3 + 1] += shift;
  return ncy;
}

/* True when every droplet lies inside the body's straight-sided part: the
 * union is then the (convex) body itself, and so is its goo. */
function zgInside(sh) {
  const b = sh.body;
  const c = sh.circles;
  for (let k = 0; k < sh.n; k++) {
    const r = c[k * 3 + 2];
    if (Math.abs(c[k * 3]) + r > b.hw - b.rx || Math.abs(c[k * 3 + 1]) + r > b.hh) {
      if (Math.abs(c[k * 3]) + r > b.hw || Math.abs(c[k * 3 + 1]) + r > b.hh - b.ry) return false;
    }
  }
  return true;
}

function zgRender(inst) {
  const s = inst.s;
  const T = inst.T;
  const sh = zgShapes(s, T, inst.shapes);
  const cy = inst.bounds ? zgSquash(sh, s.cy, inst.bounds) : s.cy;
  let d;
  let bd;
  // The goo's edge level eases from 0.5 at rest (the element's own edge) to
  // the package's 5/12 (~1.3px outside it) while the liquid moves.
  const th = 0.5 - (0.5 - T.threshold) * s.m;
  if (th < 0.4999 || !zgInside(sh)) {
    d = zgGooPath(sh, T, inst.buf, s.vert, th);
    bd = inst.buf.bounds;
  } else {
    const b = sh.body;
    d = zgRectPath(b);
    bd = { l: -b.hw, r: b.hw, t: -b.hh, b: b.hh };
  }
  if (d !== inst.lastD) {
    inst.path.setAttribute("d", d);
    for (const sp of inst.shadows) {
      if (!sp.inset) sp.path.setAttribute("d", d);
    }
    if (inst.shadows.length) {
      const e = inst.shadowExt;
      const box =
        "M" + zgNum(bd.l - e) + " " + zgNum(bd.t - e) + "H" + zgNum(bd.r + e) +
        "V" + zgNum(bd.b + e) + "H" + zgNum(bd.l - e) + "Z";
      if (inst.hasOuter) inst.outerBox.style.clipPath = 'path(evenodd, "' + box + d + '")';
      if (inst.hasInset) {
        inst.innerBox.style.clipPath = 'path("' + d + '")';
        for (const sp of inst.shadows) {
          if (sp.inset) sp.path.setAttribute("d", box + d);
        }
      }
    }
    inst.lastD = d;
  }
  if (s.colB !== null) {
    const pct = Math.round(inst.T.ease(s.p) * 1000) / 10;
    const fill = pct >= 100 ? s.colB : "color-mix(in srgb, " + s.colB + " " + pct + "%, " + s.colA + ")";
    if (fill !== inst.lastFill) {
      inst.path.style.fill = fill;
      inst.lastFill = fill;
    }
  }
  const tr = "translate(" + s.cx.toFixed(2) + "px, " + cy.toFixed(2) + "px)";
  if (tr !== inst.lastT) {
    inst.mover.style.transform = tr;
    inst.lastT = tr;
  }
}

/* End a move. Hand-over: onSettle() runs in the same task that hides the
 * liquid, so the real background and the liquid swap in one paint. */
function zgFinish(inst, arrived) {
  zgShared.live.delete(inst);
  if (!inst.active) return;
  inst.active = false;
  inst.wrap.style.display = "none";
  inst.layer.removeAttribute("zia-goo-moving");
  inst.lastD = inst.lastT = inst.lastFill = null;
  const done = inst.done;
  inst.done = null;
  try {
    if (inst.onSettle) inst.onSettle();
  } finally {
    if (done) done(arrived);
  }
}

function zgTick(inst, now, dt) {
  const moving = zgStep(inst.s, inst.T, now, dt);
  zgRender(inst);
  if (!moving) zgFinish(inst, true);
  return moving;
}

function zgFrame(now) {
  const S = zgShared;
  S.raf = 0;
  const dt = S.last ? zgClamp((now - S.last) / 1000, 1 / 240, 0.25) : 1 / 60;
  S.last = now;
  for (const inst of S.live) {
    try {
      if (!zgTick(inst, now, dt)) S.live.delete(inst);
    } catch (e) {
      // Never leave the real background hidden.
      zgFinish(inst, false);
      console.error("[ziaGoo]", e);
    }
  }
  if (S.live.size) S.raf = S.win.requestAnimationFrame(zgFrame);
  else S.last = 0;
}

function zgWake(inst) {
  const S = zgShared;
  S.live.add(inst);
  if (!S.raf) {
    S.win = inst.win;
    S.last = 0;
    S.raf = S.win.requestAnimationFrame(zgFrame);
  }
}

function ziaGoo(layer, opts) {
  opts = Object.assign({}, opts);
  const doc = layer.ownerDocument;
  const win = doc.defaultView;
  const T = zgTune(opts);
  const el = (ns, tag, cls) => {
    const e = doc.createElementNS(ns, tag);
    if (cls) e.setAttribute("class", cls);
    return e;
  };

  // layer > wrap (anchored at the layer's top-left; hidden while idle)
  //       > mover (translated to the liquid's centre)
  //         > outerBox (clipped to outside the liquid) > one svg per outer shadow
  //         > svg > path (the liquid)
  //         > innerBox (clipped to the liquid) > one svg per inset shadow
  // (classes: goo.css; display is toggled inline so a missing stylesheet
  // can never leave the liquid showing while idle)
  const wrap = el(zgXhtmlNs, "div", "zia-goo");
  wrap.style.display = "none";
  wrap.setAttribute("aria-hidden", "true");
  const mover = el(zgXhtmlNs, "div", "zia-goo-mover");
  const outerBox = el(zgXhtmlNs, "div", "zia-goo-shadows zia-goo-outer");
  const innerBox = el(zgXhtmlNs, "div", "zia-goo-shadows zia-goo-inner");
  const svg = el(zgSvgNs, "svg", "zia-goo-fill");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("width", "1");
  svg.setAttribute("height", "1");
  const path = el(zgSvgNs, "path");
  svg.appendChild(path);
  mover.append(outerBox, svg, innerBox);
  wrap.appendChild(mover);
  layer.appendChild(wrap);

  const reduce = win.matchMedia ? win.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const inst = {
    win, layer, wrap, mover, outerBox, innerBox, path, T,
    background: opts.background || "rgba(255,255,255,.12)",
    shadows: [],
    shadowExt: 2,
    hasOuter: false,
    hasInset: false,
    s: null,
    bounds: null,
    active: false,
    done: null,
    lastD: null,
    lastT: null,
    lastFill: null,
    buf: {},
    shapes: zgShapesBuf(),
    onStart: opts.onStart,
    onSettle: opts.onSettle,
  };
  path.style.fill = inst.background;
  zgBuildShadows(inst, opts.shadow);

  function moveTo(fromRect, toRect, look) {
    if (!inst.layer || !toRect) return Promise.resolve(false);
    if (inst.done) {
      // A retarget supersedes the pending promise; the motion itself continues.
      const prev = inst.done;
      inst.done = null;
      prev(false);
    }
    // Reduced motion, or nothing to travel from: jump. The real background
    // is already on the new tab, so the liquid simply stays hidden.
    if ((reduce && reduce.matches) || (!fromRect && !inst.active)) {
      zgFinish(inst, true);
      return Promise.resolve(true);
    }
    // Measure the origin once per move. wrap sits at the layer's (0,0) and
    // scrolls with it, so later scrolling needs no re-measure.
    if (!inst.active) wrap.style.display = "block";
    const origin = wrap.getBoundingClientRect();
    const to = zgLocal(toRect, origin);
    // Edges the liquid may not run past, never tighter than the tabs themselves
    // (a tab half scrolled out must still hand over at its real size).
    inst.bounds = null;
    if (opts.bounds) {
      const r = typeof opts.bounds === "function" ? opts.bounds() : opts.bounds.getBoundingClientRect();
      if (r) {
        const ends = [to];
        if (inst.active) ends.push({ cy: inst.s.cy, h: inst.s.h });
        else if (fromRect) ends.push(zgLocal(fromRect, origin));
        let top = r.top - origin.top;
        let bottom = r.bottom - origin.top;
        for (const e of ends) {
          top = Math.min(top, e.cy - e.h / 2);
          bottom = Math.max(bottom, e.cy + e.h / 2);
        }
        inst.bounds = { top, bottom };
      }
    }
    let s = inst.s;
    if (inst.active) {
      // Retarget mid-flight: the indicator restarts from where it is now (as a
      // CSS transition would); the liquid keeps its momentum.
      zgRetarget(s, to, T);
    } else {
      const from = zgLocal(fromRect, origin);
      if (zgSame(from, to)) {
        wrap.style.display = "none";
        return Promise.resolve(true);
      }
      s = inst.s = zgNewSim(from);
      zgRetarget(s, to, T);
    }
    // Colours: fade from the current fill to look.background, if given.
    const target = (look && look.background) || null;
    const start = inst.active
      ? s.colB !== null ? win.getComputedStyle(path).fill : inst.background
      : (look && look.fromBackground) || inst.background;
    const end = target || inst.background;
    if (start !== end) {
      s.colA = start;
      s.colB = end;
    } else {
      s.colA = s.colB = null;
      path.style.fill = end;
      inst.lastFill = null;
    }
    if (!inst.active) {
      inst.active = true;
      layer.setAttribute("zia-goo-moving", "");
      if (inst.onStart) inst.onStart();
      zgRender(inst); // painted at `from` in the same frame the real background hides
    }
    const promise = new Promise((resolve) => (inst.done = resolve));
    zgWake(inst);
    return promise;
  }

  function restyle(o) {
    if (!inst.layer || !o) return;
    if (o.background) {
      inst.background = o.background;
      if (!inst.s || inst.s.colB === null) path.style.fill = o.background;
    }
    if (o.shadow !== undefined) {
      zgBuildShadows(inst, o.shadow);
      if (inst.active) zgRender(inst);
    }
  }

  // End a move now: the liquid hides and onSettle() runs (the real
  // background comes back where it is); the pending promise resolves false.
  function stop() {
    if (inst.layer) zgFinish(inst, false);
  }

  function destroy() {
    if (!inst.layer) return;
    zgFinish(inst, false);
    wrap.remove();
    inst.layer = null;
    inst.s = null;
    inst.buf = {};
  }

  return { moveTo, restyle, stop, destroy };
}
