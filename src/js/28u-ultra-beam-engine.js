// Zia border beam: two effects from the border-beam npm package (v1.4.1, MIT
// License, Copyright (c) 2026 Jakub Antalik), without React. beam.css paints
// them; this adds and removes the element they paint, fits it to its host,
// and drives the pulse.
//
//   ziaBeam(el, "line")            a glow travels along el's bottom edge (loading)
//   ziaBeam(el, "pulse")           a glow breathes outside el's edge (highlight)
//   ziaBeam(el, type, false)       fades it out (0.5 s), then removes it
//   ziaBeamFlash(el, type, holdMs) on, then off by itself holdMs later (default
//                                  "pulse", 700 ms: in, hold, out in ~1.2 s)
//   ziaBeamDestroy(el)             removes it at once, no fade
//
// Calling any of them again with the same arguments changes nothing. While
// on, el has zia-beam="line|pulse" and one extra child,
// <div class="zia-beam"> (holding a <div class="zia-beam-bloom">); off, el is
// as it was. el should draw its own rounded corners; if a child draws them,
// set --zia-beam-radius on el (or on el > .zia-beam, so it doesn't inherit
// into another beam inside el). The beam follows el's size by itself; after
// changing el's radius or corner-shape alone, call ziaBeam(el, type) again.
//
// border-beam is MIT licensed:
//
//   MIT License
//
//   Copyright (c) 2026 Jakub Antalik
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.

const ZIA_BEAM_XHTML = "http://www.w3.org/1999/xhtml";
const ziaBeams = new WeakMap(); // el -> state, see ziaBeamAdd
const ziaBeamPulses = new Set(); // the pulse beams the shared loop drives
let ziaBeamFrame = 0;
let ziaBeamLastTick = 0;
let ziaBeamMotionQuery = null;

function ziaBeam(el, type, active = true) {
  const state = ziaBeams.get(el);
  if (!active) {
    if (state) {
      clearTimeout(state.hold);
      state.wanted = null;
      ziaBeamFadeOut(el, state);
    }
    return;
  }
  if (type !== "line" && type !== "pulse") {
    throw new TypeError(`ziaBeam: type is "line" or "pulse", not ${type}`);
  }
  if (state && state.type === type) {
    // Already on (an explicit "on" cancels a flash's pending "off"). If it's
    // fading out, it fades back in once the fade-out ends, as the package does.
    clearTimeout(state.hold);
    state.wanted = type;
    state.wantedHold = 0;
    // (a chance to pick up a new radius or corner-shape on el)
    ziaBeamFit(el, state, state.size);
    if (type === "pulse" && !ziaBeamPulses.has(state) && !state.beam.hasAttribute("fading")) {
      // (el had left the document; the loop let it go)
      ziaBeamPulses.add(state);
      ziaBeamLoop();
    }
    return;
  }
  if (state) {
    // a different type replaces it at once
    ziaBeamRemove(el, state);
  }
  ziaBeamAdd(el, type);
}

// On, then off by itself: the pulse as a one-shot highlight. Called again
// before it's over, it restarts the hold.
function ziaBeamFlash(el, type = "pulse", holdMs = 700) {
  ziaBeam(el, type, true);
  const state = ziaBeams.get(el);
  if (state.beam.hasAttribute("fading")) {
    // it comes back once this fade-out ends; the hold starts then
    state.wantedHold = holdMs;
    return;
  }
  state.hold = setTimeout(() => ziaBeam(el, type, false), holdMs);
}

function ziaBeamDestroy(el) {
  const state = ziaBeams.get(el);
  if (state) {
    ziaBeamRemove(el, state);
  }
}

function ziaBeamAdd(el, type) {
  const beam = document.createElementNS(ZIA_BEAM_XHTML, "div");
  beam.className = "zia-beam";
  beam.setAttribute("aria-hidden", "true");
  const bloom = document.createElementNS(ZIA_BEAM_XHTML, "div");
  bloom.className = "zia-beam-bloom";
  beam.append(bloom);

  const state = {
    type,
    beam,
    wanted: type, // what to bring back after a fade-out (null: nothing)
    wantedHold: 0, // ...and for how long (a flash during a fade-out)
    observer: null,
    timer: 0, // the fade-out's fallback
    hold: 0, // a flash's pending "off"
    size: null, // el's border box, from the ResizeObserver
    shapeKey: "",
  };
  ziaBeams.set(el, state);
  if (getComputedStyle(el).position === "static") {
    el.setAttribute("zia-beam-anchor", "");
  }
  el.setAttribute("zia-beam", type);
  el.append(beam);
  ziaBeamFit(el, state, null);

  // Fits it to el's size, now (the first call comes before the first paint)
  // and whenever el resizes: layout sizes, so a transform on el (say a
  // pop-up's opening scale) doesn't throw it out.
  state.observer = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0];
    if (box) {
      state.size = { width: box.inlineSize, height: box.blockSize };
      ziaBeamFit(el, state, state.size);
    }
  });
  state.observer.observe(el);
  if (type === "pulse") {
    ziaBeamPulses.add(state);
    ziaBeamLoop();
  }
}

// Matches the beam to el: its corner radius, border width and corner-shape,
// its outline as clip paths (the line's clip, the pulse's hole, the stroke's
// ring), and the pulse's glow size (the package scales it by width / 350 and
// height / 140, clamped to 0.35..4). Runs on start, when el resizes, and when
// ziaBeam(el, type) is called again; never per frame.
function ziaBeamFit(el, state, size) {
  const style = getComputedStyle(el);
  const beam = state.beam;
  beam.style.setProperty("--zb-r-auto", `${parseFloat(style.borderTopLeftRadius) || 0}px`);
  beam.style.setProperty("--zb-border", style.borderTopWidth);
  const corner = ziaBeamCornerShape(style);
  if (corner.n === 2) {
    beam.style.removeProperty("--zb-corner");
  } else {
    beam.style.setProperty("--zb-corner", corner.shape);
  }

  const width = size?.width || 0;
  const height = size?.height || 0;
  if (!width || !height) {
    return;
  }
  if (state.type === "pulse") {
    const scale = (value) => Math.max(0.35, Math.min(4, value)).toFixed(3);
    beam.style.setProperty("--zb-sx", scale(width / 350));
    beam.style.setProperty("--zb-sy", scale(height / 140));
  }
  // (the beam's own radius: --zia-beam-radius, else el's)
  const radius = parseFloat(getComputedStyle(beam).borderTopLeftRadius) || 0;
  const key = `${width} ${height} ${radius} ${corner.n}`;
  if (key === state.shapeKey) {
    return;
  }
  state.shapeKey = key;
  const outline = ziaBeamOutline(width, height, radius, corner.n);
  // With a corner-shape, the stroke's 1px ring as a path too: its mask makes
  // the ring, but Firefox masks round whatever the corner-shape. (The ring as
  // the package draws it: the stroke box's radius, the line's 1px less, and
  // the same less its 1px padding inside.)
  if (corner.n === 2) {
    beam.style.removeProperty("--zb-ring");
  } else {
    const ringRadius = state.type === "line" ? Math.max(0, radius - 1) : radius;
    const ring = `${ziaBeamOutline(width, height, ringRadius, corner.n)} ${ziaBeamOutline(width, height, ringRadius, corner.n, 1)}`;
    beam.style.setProperty("--zb-ring", `path(evenodd, "${ring}")`);
  }
  if (state.type === "line") {
    beam.style.setProperty("--zb-outline", `path("${outline}")`);
  } else {
    // everything but el: a frame well past the halo, el's outline cut out
    const far = 400;
    const frame = `M${-far} ${-far}H${width + far}V${height + far}H${-far}Z`;
    beam.style.setProperty("--zb-hole", `path(evenodd, "${frame} ${outline}")`);
  }
}

// The corner-shape el's corners are drawn with, and its exponent: CSS draws
// superellipse(K) as |x|^n + |y|^n = 1 with n = 2^K (round is K = 1).
function ziaBeamCornerShape(style) {
  const shape = (style.getPropertyValue("corner-top-left-shape") || style.getPropertyValue("corner-shape") || "round")
    .trim()
    .split(/\s+(?![^(]*\))/)[0];
  let k = { round: 1, squircle: 2, bevel: 0, square: 8 }[shape];
  const m = /^superellipse\(([^)]*)\)$/.exec(shape);
  if (m) {
    k = parseFloat(m[1]);
    if (!Number.isFinite(k)) {
      k = m[1].trim().startsWith("-") ? 0 : 8;
    }
  }
  return { shape, n: 2 ** Math.max(0, Math.min(8, k ?? 1)) };
}

// A w x h box's outline with corners of radius r, inset by `inset` (the
// corners' radius shrinking with it, as CSS's inner border edge does), as a
// path: arcs when round, else each corner's superellipse in 16 steps.
function ziaBeamOutline(w, h, r, n, inset = 0) {
  const f = (v) => +v.toFixed(2);
  const [x0, y0, x1, y1] = [inset, inset, w - inset, h - inset];
  r = Math.max(0, Math.min(r - inset, (x1 - x0) / 2, (y1 - y0) / 2));
  if (!r) {
    return `M${f(x0)} ${f(y0)}H${f(x1)}V${f(y1)}H${f(x0)}Z`;
  }
  if (n === 2) {
    const a = `A${f(r)} ${f(r)} 0 0 1`;
    return (
      `M${f(x0 + r)} ${f(y0)}H${f(x1 - r)}${a} ${f(x1)} ${f(y0 + r)}V${f(y1 - r)}${a} ${f(x1 - r)} ${f(y1)}` +
      `H${f(x0 + r)}${a} ${f(x0)} ${f(y1 - r)}V${f(y0 + r)}${a} ${f(x0 + r)} ${f(y0)}Z`
    );
  }
  const e = 2 / n;
  const points = [];
  for (const [cx, cy, a0] of [
    [x0 + r, y0 + r, Math.PI],
    [x1 - r, y0 + r, 1.5 * Math.PI],
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, 0.5 * Math.PI],
  ]) {
    for (let i = 0; i <= 16; i++) {
      const a = a0 + (Math.PI / 2) * (i / 16);
      const c = Math.cos(a);
      const s = Math.sin(a);
      points.push(`${f(cx + r * Math.sign(c) * Math.abs(c) ** e)} ${f(cy + r * Math.sign(s) * Math.abs(s) ** e)}`);
    }
  }
  return `M${points.join("L")}Z`;
}

function ziaBeamFadeOut(el, state) {
  const beam = state.beam;
  if (beam.hasAttribute("fading")) {
    return;
  }
  // Where the fade-in has got to (1 once it's done). The package fades out
  // from full whatever it was; this picks the fade-out up at the same level.
  const level = parseFloat(getComputedStyle(beam).getPropertyValue("--zia-beam-opacity"));
  if (ziaBeamMotion().matches || !beam.isConnected || !(level > 0.01)) {
    // nothing to fade: reduced motion (nothing showed), off-document, or
    // turned off before it got going
    ziaBeamFadeDone(el, state);
    return;
  }
  if (level < 0.99) {
    beam.style.setProperty("--zb-fade-delay", `${(-0.5 * ziaBeamEaseInverse(1 - level)).toFixed(3)}s`);
  }
  beam.addEventListener("animationend", (event) => {
    if (event.target === beam && event.animationName === "zia-beam-fade-out") {
      ziaBeamFadeDone(el, state);
    }
  });
  // (in case the fade never runs or ends, say el is hidden)
  state.timer = setTimeout(() => ziaBeamFadeDone(el, state), 700);
  beam.setAttribute("fading", "");
}

function ziaBeamFadeDone(el, state) {
  if (ziaBeams.get(el) !== state) {
    return;
  }
  ziaBeamRemove(el, state);
  if (state.wanted) {
    ziaBeamAdd(el, state.wanted);
    if (state.wantedHold) {
      ziaBeamFlash(el, state.wanted, state.wantedHold);
    }
  }
}

// The progress at which CSS's "ease" (cubic-bezier(0.25, 0.1, 0.25, 1))
// reaches y, by bisection.
function ziaBeamEaseInverse(y) {
  const bezier = (t, p1, p2) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bezier(mid, 0.1, 1) < y) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return bezier((lo + hi) / 2, 0.25, 0.25);
}

function ziaBeamRemove(el, state) {
  clearTimeout(state.timer);
  clearTimeout(state.hold);
  state.observer?.disconnect();
  ziaBeamPulses.delete(state);
  if (!ziaBeamPulses.size && ziaBeamFrame) {
    cancelAnimationFrame(ziaBeamFrame);
    ziaBeamFrame = 0;
  }
  state.beam.remove();
  if (ziaBeams.get(el) === state) {
    ziaBeams.delete(el);
    el.removeAttribute("zia-beam");
    el.removeAttribute("zia-beam-anchor");
  }
}

// The pulse's breathing, from the package's pulse-outside: each value eases
// between a and b on a raised cosine (1 - cos 2πt) / 2 over its own period
// (seconds), some after a delay. The package's knobs: sp spread, dr drift (px),
// op dimming, gh height swell, and the base, size and swell periods bs, ss, ghs.
function ziaBeamOscillators(sp, dr, op, gh, bs, ss, ghs) {
  // [property, a, b, period, delay, unit]
  return [
    ["--zb-bw1", 1 - sp, 1 + sp * 1.1, ss * 0.9, 0, ""],
    ["--zb-bh1", 1 + sp * 0.9, 1 - sp * 0.85, ss * 1.26, 0, ""],
    ["--zb-bx1", -dr, dr * 0.9, bs * 1.6, 0, "px"],
    ["--zb-by1", dr * 0.55, -dr * 0.7, bs * 1.6, 0, "px"],
    ["--zb-bw2", 1 + sp, 1 - sp * 0.85, ss * 1.1, 0, ""],
    ["--zb-bh2", 1 - sp * 0.8, 1 + sp * 1.05, ss * 0.81, 0, ""],
    ["--zb-bx2", dr * 0.8, -dr * 0.9, bs * 1.88, 0, "px"],
    ["--zb-by2", -dr, dr * 0.65, bs * 1.88, 0, "px"],
    ["--zb-bw3", 1 - sp * 0.6, 1 + sp * 1.15, ss * 0.98, 0, ""],
    ["--zb-bh3", 1 + sp * 0.75, 1 - sp, ss * 1.4, 0, ""],
    ["--zb-bx3", -dr * 0.6, dr, bs * 1.45, 0, "px"],
    ["--zb-by3", -dr * 0.85, dr * 0.45, bs * 1.45, 0, "px"],
    ["--zb-bgh", 1 - gh, 1 + gh, ghs, 0, ""],
    ["--zb-bop-tl", 1 - op, 1, bs, 0, ""],
    ["--zb-bop-tr", 1 - op, 1, bs * 1.32, bs * 0.28, ""],
    ["--zb-bop-bl", 1 - op, 1, bs * 0.84, bs * 0.55, ""],
    ["--zb-bop-br", 1 - op, 1, bs * 1.58, bs * 0.83, ""],
  ];
}

// (the package's tuning at its default 2.3 s duration)
const ZIA_BEAM_PULSE = {
  dark: ziaBeamOscillators(0.28, 14, 0.46, 0.16, 2.3, 6.4, 2.4),
  light: ziaBeamOscillators(0.36, 19, 0, 0.58, 3.7, 4.6, 3.8),
};
const ZIA_BEAM_HUE_PERIOD = 14;

// One requestAnimationFrame loop for every pulse, capped near 30 fps like the
// package's. It only writes custom properties on each beam's own div (no
// layout reads) and stops when no pulse is on or motion is reduced.
function ziaBeamLoop() {
  if (!ziaBeamFrame && ziaBeamPulses.size && !ziaBeamMotion().matches) {
    ziaBeamLastTick = 0;
    ziaBeamFrame = requestAnimationFrame(ziaBeamTick);
  }
}

function ziaBeamTick(now) {
  if (!ziaBeamPulses.size) {
    ziaBeamFrame = 0;
    return;
  }
  ziaBeamFrame = requestAnimationFrame(ziaBeamTick);
  if (now - ziaBeamLastTick < 1000 / 30 - 2) {
    return;
  }
  ziaBeamLastTick = now;
  const seconds = now / 1000;
  const hue = `${(((seconds / ZIA_BEAM_HUE_PERIOD) % 1) * 360).toFixed(2)}deg`;
  for (const state of ziaBeamPulses) {
    if (!state.beam.isConnected) {
      // el left the document; ziaBeam(el, "pulse") picks it up again
      ziaBeamPulses.delete(state);
      continue;
    }
    const style = state.beam.style;
    const oscillators = state.beam.closest("[zia-light]") ? ZIA_BEAM_PULSE.light : ZIA_BEAM_PULSE.dark;
    for (const [name, a, b, period, delay, unit] of oscillators) {
      const value = a + ((b - a) * (1 - Math.cos((2 * Math.PI * (seconds - delay)) / period))) / 2;
      style.setProperty(name, unit ? `${value.toFixed(2)}${unit}` : value.toFixed(4));
    }
    style.setProperty("--zb-hue", hue);
  }
}

function ziaBeamMotion() {
  if (!ziaBeamMotionQuery) {
    ziaBeamMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    ziaBeamMotionQuery.addEventListener("change", () => {
      if (!ziaBeamMotionQuery.matches) {
        ziaBeamLoop();
      } else if (ziaBeamFrame) {
        // (beam.css hides the beams)
        cancelAnimationFrame(ziaBeamFrame);
        ziaBeamFrame = 0;
      }
    });
  }
  return ziaBeamMotionQuery;
}
