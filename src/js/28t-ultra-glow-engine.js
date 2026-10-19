// Zia glow: a colourful glow along the bottom edge of a card that rises and
// blooms while media plays. A framework-free port of the "glow" look of
// voice-glow 0.3.0 (component VoiceBeam, https://libraries.dev).
// voice-glow is MIT licensed:
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
//
//   const glow = ziaGlow(card, { dark: true });
//   glow.setPlaying(true);   // fades in, follows a synthetic music level
//   glow.setPlaying(false);  // the level settles and the glow fades out
//   glow.setDark(false);     // switch palette and tuning
//   glow.setColors(list);    // the lobes' colours ("rgb(r, g, b)"), or null for the theme's
//   glow.setMotion(m);       // optional: the package's `motion` (see NOTES.md)
//   glow.destroy();
//
// Plain functions in a shared scope: no imports or exports. Needs glow.css.
// Elements are created in the XHTML namespace so it works in a XUL chrome document.

const ZIA_GLOW_XHTML = "http://www.w3.org/1999/xhtml";
const ZIA_GLOW_SVG = "http://www.w3.org/2000/svg";
const ZIA_GLOW_TAU = Math.PI * 2;

// Seven soft ellipses fanned out from the bottom centre, in px for a ~350px host:
// the centre lobe follows the lows, its neighbours the mids, the outer pair the
// highs and the far pair the mids again.
const ZIA_GLOW_LOBES = [
  { x: 0, w: 74, h: 46, band: 0 },
  { x: -36, w: 54, h: 40, band: 1 },
  { x: 36, w: 54, h: 40, band: 1 },
  { x: -72, w: 48, h: 32, band: 2 },
  { x: 72, w: 48, h: 32, band: 2 },
  { x: -108, w: 42, h: 26, band: 1 },
  { x: 108, w: 42, h: 26, band: 1 },
];
const ZIA_GLOW_SPAN = 36 * ZIA_GLOW_LOBES.length; // the flow ring, 252px

// Theme tuning of the "colorful" variant on the "default" (chat input) type, resolved
// the way VoiceBeam resolves it: theme preset, then type style, then light overrides.
const ZIA_GLOW_THEMES = {
  dark: {
    colors: [
      "rgb(255, 70, 120)",
      "rgb(60, 190, 255)",
      "rgb(175, 70, 255)",
      "rgb(60, 220, 130)",
      "rgb(255, 150, 40)",
      "rgb(90, 100, 255)",
      "rgb(40, 200, 190)",
    ],
    band: { core: "255, 255, 255", above: "255, 70, 80", mid: "90, 255, 150", below: "80, 140, 255" },
    strokeOpacity: 1.16,
    innerOpacity: 0.47,
    bloomOpacity: 0.89,
    bloomAlpha: 0.9,
    innerShadow: "rgba(255, 255, 255, 0.1)",
    brightness: 1.15,
    saturation: 1.2,
    strength: 1,
    hueBase: 0,
    hueRange: 24,
    hueDuration: 12,
    reach: 1.2,
    spread: 1.05,
    bandStrength: 1.55,
    coreLight: 0,
  },
  light: {
    colors: [
      "rgb(255, 201, 21)",
      "rgb(126, 196, 255)",
      "rgb(180, 40, 230)",
      "rgb(235, 100, 160)",
      "rgb(255, 176, 122)",
      "rgb(154, 160, 255)",
      "rgb(127, 217, 238)",
    ],
    band: { core: "197, 139, 255", above: "255, 122, 182", mid: "126, 196, 255", below: "45, 255, 171" },
    strokeOpacity: 1.2,
    innerOpacity: 0.85,
    bloomOpacity: 0.5,
    bloomAlpha: 0.7,
    innerShadow: "rgba(0, 0, 0, 0.08)",
    brightness: 0.95,
    saturation: 1.6,
    strength: 0.8,
    hueBase: 5,
    hueRange: 40,
    hueDuration: 8.5,
    reach: 1.8,
    spread: 0.8,
    bandStrength: 1.7,
    coreLight: 1.8,
  },
};

// The package's defaults (voiceDefaults + the component's response defaults).
const ZIA_GLOW_TUNING = {
  threshold: 0.015,
  attack: 0.325,
  release: 0.86,
  idle: 0.18,
  breatheDuration: 5.2,
  bands: true,
  flow: 48,
  bend: 60,
  glowSize: 1,
  bandWidth: 2.15,
  bandPosition: 0.35,
  bandCurve: 1.75,
  bandSpread: 0.87,
  bandSkew: 0.12,
  bandOffset: -27,
  bandTail: 0.59,
  bandTailPosition: 0.67,
  bandTailCurve: 2.4,
  bandTailOverflow: 15,
  bandAberration: 0.89,
  distortion: 0.62,
  distortionDetail: 2.3,
  glowWidth: 0.65,
  glowHeight: 1.25,
  lobeSpacing: 0.85,
  rangeWidth: 0.75,
  rangeHeight: 1,
  softness: 1.07,
  coreSize: 1,
  coreLightWidth: 1,
  coreLightHeight: 1,
  strokeScale: 1,
  innerScale: 1,
  innerHeight: 1,
  bloomScale: 1,
  bloomHeight: 1,
};

// libraries.dev shrinks the glow on narrow hosts with scale = min(1, width / 371).
const ZIA_GLOW_HOST_WIDTH = 371;
const ZIA_GLOW_MIN_SCALE = 0.4;
// The level held under prefers-reduced-motion (a still glow, about mid-height).
const ZIA_GLOW_STEADY = 0.18;
// Fade timings of the package (0.6s in, 0.5s out, CSS "ease"), mirrored in glow.css.
const ZIA_GLOW_FADE_OUT_MS = 520;
const ZIA_GLOW_BAND_POINTS = 56;
const ZIA_GLOW_STILL = { gather: 0, offset: 0, stretch: 0, heldLevel: 0, cornerFollow: 0 };

const ziaGlowLive = new Set(); // instances the loop draws
const ziaGlowAll = new Set(); // every instance not destroyed, for media-query changes
let ziaGlowRaf = null;
let ziaGlowLastFrame = 0;
let ziaGlowPrevTs = 0;
let ziaGlowHalfRate = false;
let ziaGlowSkip = false;
let ziaGlowSlowSince = 0;
let ziaGlowProbeAt = 0;
let ziaGlowMotionQuery = null;
let ziaGlowListening = false;
let ziaGlowCount = 0;

function ziaGlowClamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Noise gate and soft saturation: below the threshold is silence.
function ziaGlowShape(v, threshold) {
  if (v <= threshold) {
    return 0;
  }
  const a = (v - threshold) / Math.max(1e-3, 1 - threshold);
  return ziaGlowClamp((1 - Math.exp(-3 * a)) / (1 - Math.exp(-3)));
}

// Attack / release envelope (seconds are time constants).
function ziaGlowFollow(current, target, dt, attack, release) {
  const tau = target > current ? attack : release;
  return current + (target - current) * (1 - Math.exp(-dt / Math.max(1e-3, tau)));
}

// Wrap into [-span/2, span/2): the lobes cycle through the centre.
function ziaGlowWrap(x, span) {
  const half = span / 2;
  return (((x + half) % span) + span) % span - half;
}

// Lobes shrink to nothing as they reach the ends of the flow ring.
function ziaGlowRingFade(x, span) {
  const k = x / (span / 2 + 4);
  return Math.max(0, 1 - k * k);
}

// The band's organic bell, exp(-(|x| / spread)^curve), skewed and settled to 0 at |x| = 1.
function ziaGlowBell(x, curve, spread, skew) {
  const s = Math.max(0.05, spread * (x < 0 ? 1 - skew : 1 + skew));
  const v = Math.exp(-Math.pow(Math.abs(x) / s, curve));
  const end = Math.exp(-Math.pow(1 / s, curve));
  return Math.max(0, (v - end) / (1 - end));
}

// The band's ends rising again into the corners.
function ziaGlowTail(dist, reach, amount, position, curve) {
  if (amount <= 0 || reach <= 0) {
    return 0;
  }
  const start = reach * Math.max(0, Math.min(0.98, position));
  if (dist <= start) {
    return 0;
  }
  const k = Math.min(1, (dist - start) / Math.max(1, reach - start));
  return amount * Math.pow(k, Math.max(0.5, curve));
}

function ziaGlowCornerRadius(radius, w, h) {
  return Math.max(0, Math.min(radius, w / 2, h / 2));
}

// How far a corner of radius r lifts the bottom edge at x: a quarter of
// |x|^n + |y|^n = 1, a circle at n = 2.
function ziaGlowArc(x, w, r, inset = 0, n = 2) {
  if (r <= 0) {
    return 0;
  }
  const d = Math.min(x, w - x) - inset;
  if (d >= r) {
    return 0;
  }
  if (d <= 0) {
    return r;
  }
  const k = (r - d) / r;
  return r - r * Math.pow(Math.max(0, 1 - Math.pow(k, n)), 1 / n);
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

// A believable, gentle "music is playing" level (0..1, before the gate and envelope):
// a slow phrase swell, a slower sway, a soft beat and a wandering random energy.
function ziaGlowMusicNew() {
  const r = Math.random;
  return {
    swell: r() * ZIA_GLOW_TAU,
    sway: r() * ZIA_GLOW_TAU,
    beat: (92 + r() * 34) / 60, // 92-126 bpm
    from: r(),
    to: r(),
    at: 0,
    dur: 0.6,
  };
}

function ziaGlowMusic(m, t) {
  if (t >= m.at + m.dur || t < m.at) {
    m.from = m.to;
    m.to = Math.random();
    m.at = t;
    m.dur = 0.35 + Math.random() * 0.85;
  }
  const k = (1 - Math.cos(Math.PI * Math.min(1, (t - m.at) / m.dur))) / 2;
  const energy = m.from + (m.to - m.from) * k;
  const swell = 0.5 + 0.5 * Math.sin(t * 0.83 + m.swell); // ~7.6s phrases
  const sway = 0.5 + 0.5 * Math.sin(t * 2.1 + m.sway); // ~3s
  const beat = Math.pow(0.5 + 0.5 * Math.cos(ZIA_GLOW_TAU * m.beat * t), 6);
  return 0.08 + 0.08 * swell + 0.04 * sway + 0.05 * beat + 0.08 * energy;
}

function ziaGlowScaleFor(width) {
  const s = Math.min(1, width / ZIA_GLOW_HOST_WIDTH);
  return Math.max(ZIA_GLOW_MIN_SCALE, Math.round(s * 50) / 50);
}

function ziaGlowRadiusOf(container) {
  const r = parseFloat(getComputedStyle(container).borderTopLeftRadius);
  return r > 0 ? r : 16;
}

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

// Per theme and scale: the CSS the layers paint with. Everything that moves is a
// custom property on the root that the loop writes each frame.
function ziaGlowBuild(g, scale) {
  const T = g.dark ? ZIA_GLOW_THEMES.dark : ZIA_GLOW_THEMES.light;
  const P = ZIA_GLOW_TUNING;
  const colors = g.colors || T.colors;
  const F = scale;
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
  g.cfg = cfg;
  g.dirty = false;

  const r1 = (v) => Math.round(v * 10) / 10;
  const glowWidth = P.glowWidth * F;
  const glowHeight = P.glowHeight * F;
  const coreSize = P.coreSize * F;
  const glowSize = P.glowSize * F;
  const fade = Math.round(Math.max(40, Math.min(95, 70 * P.softness)));
  const edge = r1(28 * F);
  const shadow = r1(9 * F);
  const at = "calc(50% + var(--zg-cx) * var(--zg-w))";

  const lobes = (alpha, sw, sh, y, stop) =>
    ZIA_GLOW_LOBES.map((lobe, i) => {
      const color =
        alpha >= 1 ? colors[i] : colors[i].replace("rgb(", "rgba(").replace(")", `, ${alpha.toFixed(2)})`);
      return (
        `radial-gradient(ellipse calc(${Math.round(lobe.w * sw)}px * var(--zg-w)) ` +
        `calc(${Math.round(lobe.h * sh)}px * var(--zg-h) * var(--zg-l${i})) ` +
        `at calc(50% + (var(--zg-cx) + var(--zg-x${i})) * var(--zg-w)) calc(100% + ${y}px + var(--zg-y${i})), ` +
        `${color} 0%, transparent ${stop}%)`
      );
    }).join(", ");

  // The visible range: a centred ellipse whose top humps up with the bend.
  const range = (rw, rh, mid, rim) =>
    `radial-gradient(ellipse calc(${r1(rw * cfg.rangeWidth)}px * var(--zg-w) * var(--zg-mw)) ` +
    `calc(${r1(rh * cfg.rangeHeight)}px * var(--zg-h) + var(--zg-bh)) at ${at} calc(100% + var(--zg-cy)), ` +
    `white 0%, rgba(255, 255, 255, 0.5) ${mid}%${rim > 0 ? `, rgba(255, 255, 255, ${rim}) 85%` : ""}, transparent 100%)`;

  // The hot spot in the stroke: white on dark, an ink core on light.
  const spot = g.dark
    ? `radial-gradient(ellipse calc(${r1(30 * coreSize)}px * var(--zg-w)) calc(${r1(30 * coreSize)}px * var(--zg-h)) ` +
      `at ${at} calc(100% + 2px + var(--zg-cy)), rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0.14) 30%, transparent 65%)`
    : `radial-gradient(ellipse calc(${r1(40 * coreSize)}px * var(--zg-w)) calc(${r1(30 * coreSize)}px * var(--zg-h)) ` +
      `at ${at} calc(100% + 2px + var(--zg-cy)), rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.22) 35%, transparent 70%)`;

  const strokeBg = `${spot}, ${lobes(1, glowWidth * P.strokeScale, glowHeight * P.strokeScale, 2, fade)}`;
  const strokeMask = range(170, 64, 45, 0);
  const innerBg = lobes(
    0.46,
    glowWidth * 0.9 * P.innerScale,
    glowHeight * 0.9 * P.innerScale * P.innerHeight,
    0,
    fade
  );
  const innerMask =
    `${range(170, 64, 45, 0.3)}, ` +
    `linear-gradient(white, transparent ${edge}px, transparent calc(100% - ${edge}px), white), ` +
    `linear-gradient(to right, white, transparent ${edge}px, transparent calc(100% - ${edge}px), white)`;
  const bloomBg = lobes(
    T.bloomAlpha,
    glowWidth * 1.15 * P.bloomScale,
    glowHeight * 1.5 * P.bloomScale * P.bloomHeight,
    0,
    Math.min(95, fade + 2)
  );
  const bloomMask = range(200, 130, 35, 0);

  const set = (el, prop, value) => el && el.style.setProperty(prop, value);
  set(g.stroke, "background", strokeBg);
  set(g.stroke, "mask-image", strokeMask);
  for (const el of [g.inner, g.innerWarp]) {
    set(el, "background", innerBg);
    set(el, "mask-image", innerMask);
  }
  for (const el of [g.bloom, g.bloomWarp]) {
    set(el, "background", bloomBg);
    set(el, "mask-image", bloomMask);
  }

  const root = g.root.style;
  root.setProperty(
    "--zg-tone",
    `hue-rotate(calc(${T.hueBase}deg + var(--zg-hue))) brightness(${T.brightness.toFixed(2)}) saturate(${T.saturation.toFixed(2)})`
  );
  root.setProperty("--zg-blur", `${r1(Math.max(0.5, Math.round(10 * glowSize * 100) / 100))}px`);
  root.setProperty("--zg-shadow", `inset 0 0 ${shadow}px 1px ${T.innerShadow}`);
  root.setProperty("--zg-stroke-k", T.strokeOpacity.toFixed(2));
  root.setProperty("--zg-inner-k", T.innerOpacity.toFixed(2));
  root.setProperty("--zg-bloom-k", T.bloomOpacity.toFixed(2));
  root.setProperty("--zg-strength", String(T.strength));

  // The epicentre: a white wash at the source under the band line (light theme).
  const light = Math.max(0, Math.min(3, cfg.coreLight));
  g.root.toggleAttribute("data-core", light > 0);
  if (light > 0) {
    const w = Math.max(0, Math.min(2, light - 1));
    const a = Math.min(1, w);
    const b = Math.max(0, w - 1);
    const grow = 1 + 0.3 * w;
    const solid = r1(45 * a + 27 * b);
    const mid = r1(40 + 25 * a + 15 * b);
    const midAlpha = Math.min(1, 0.55 + 0.35 * a + 0.1 * b).toFixed(2);
    const end = r1(72 + 14 * a + 8 * b);
    set(
      g.coreFill,
      "background",
      `radial-gradient(ellipse calc(${r1(120 * P.coreLightWidth * grow * F)}px * var(--zg-w)) ` +
        `calc(${r1(70 * P.coreLightHeight * grow * F)}px * var(--zg-h) + var(--zg-bh)) at ${at} calc(100% + var(--zg-cy)), ` +
        `white 0%, white ${solid}%, rgba(255, 255, 255, ${midAlpha}) ${mid}%, transparent ${end}%)`
    );
    root.setProperty("--zg-core-blur", `${r1(Math.max(0.5, Math.round(8 * glowSize * 100) / 100))}px`);
    root.setProperty("--zg-core-k", (Math.min(1, light) * (1.6 + 1.4 * w)).toFixed(2));
  }

  if (g.turbulence) {
    const detail = P.distortionDetail / F;
    g.turbulence.setAttribute("baseFrequency", `${(0.012 * detail).toFixed(4)} ${(0.05 * detail).toFixed(4)}`);
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
  const passes = [
    [1, 0.16],
    [0.72, 0.2],
    [0.46, 0.26],
    [0.22, 0.34],
  ];
  const fringes = [
    { rgb: colors.above, a: 1, ox: dx, oy: -dy },
    { rgb: colors.mid, a: 0.55, ox: dx * 0.35, oy: -dy * 0.35 },
    { rgb: colors.below, a: 1, ox: -dx, oy: dy },
    { rgb: colors.core, a: 0.9, ox: 0, oy: 0 },
  ];
  const x0 = pts[0][0];
  const x1 = pts[pts.length - 1][0];
  const k = cfg.bandTail > 0 ? 0.015 : 0.18;
  const paint = (rgb, a) => {
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, `rgba(${rgb}, 0)`);
    grad.addColorStop(k, `rgba(${rgb}, ${a.toFixed(3)})`);
    grad.addColorStop(1 - k, `rgba(${rgb}, ${a.toFixed(3)})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    return grad;
  };
  const trace = (ox, oy) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0] + ox, pts[i][1] + oy);
    }
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = `blur(${(blur * 3).toFixed(1)}px)`;
  ctx.strokeStyle = paint(colors.core, alpha * 0.3);
  ctx.lineWidth = line * 2.2;
  trace(0, 0);
  ctx.stroke();
  ctx.filter = `blur(${blur.toFixed(1)}px)`;
  for (const f of fringes) {
    for (const [lw, la] of passes) {
      ctx.strokeStyle = paint(f.rgb, alpha * f.a * la);
      ctx.lineWidth = Math.max(0.6, line * lw);
      trace(f.ox, f.oy);
      ctx.stroke();
    }
  }
  ctx.filter = "none";
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

  // The level: synthetic music while playing, silence while paused. The bands are
  // synthesised from it the way VoiceBeam does for a `level` getter.
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

  const st = root.style;
  st.setProperty("--zg-cx", `${cx.toFixed(1)}px`);
  st.setProperty("--zg-mw", narrow.toFixed(3));
  const lift = cfg.bend * R;
  st.setProperty("--zg-bh", `${Math.max(0, lift).toFixed(1)}px`);
  const e = {
    cx,
    w: wide,
    h: tall,
    mw: narrow,
    lift,
    strength: cfg.bend > 0 ? Math.min(1, lift / cfg.bend) : 0,
    level: s.level,
    corner: gather,
  };
  const radius = ziaGlowCornerRadius(cfg.radius, w, h);
  const follow = gather * m.cornerFollow;
  const spot = 30 * cfg.scale * wide;
  st.setProperty("--zg-cy", `${(-ziaGlowArc(w / 2 + cx * wide, w, radius, spot * 1.4, cfg.cornerN) * follow).toFixed(1)}px`);

  // Distortion settles out while the glow is gathered, and is off under reduced motion.
  s.warp = ziaGlowFollow(s.warp, gather > 0.02 ? 0 : 1, dt, 0.35, 0.06);
  const warpOff = !g.displace || cfg.distortion <= 0 || reduced || s.warp < 0.03;
  if (warpOff !== g.warpOff) {
    g.warpOff = warpOff;
    root.toggleAttribute("data-warp-off", warpOff);
  }
  const pts = ziaGlowBandPoints(cfg, e, w, h);
  if (!warpOff || cfg.coreLight > 0) {
    ziaGlowClip(g, pts, w, h);
  }
  if (!warpOff) {
    ziaGlowFilterRegion(g, pts, h);
    g.displace.scale.baseVal = cfg.distortion * 120 * cfg.scale * (0.15 + 0.85 * R) * s.warp;
    g.shift.dx.baseVal = 8 * cfg.scale * Math.sin(t * 0.9);
    g.shift.dy.baseVal = 4 * cfg.scale * Math.sin(t * 0.6 + 1.3);
  }
  ziaGlowDrawBand(g, e, pts, w, h);

  st.setProperty("--zg-glow", glow.toFixed(3));
  st.setProperty("--zg-h", tall.toFixed(3));
  st.setProperty("--zg-w", wide.toFixed(3));
  for (let i = 0; i < ZIA_GLOW_LOBES.length; i++) {
    const lobe = ZIA_GLOW_LOBES[i];
    const x = ziaGlowWrap(lobe.x * cfg.lobeSpacing + s.phase, ring);
    const gain = cfg.bands ? 0.6 + 0.7 * s.bands[lobe.band] : 1;
    st.setProperty(`--zg-x${i}`, `${(x * pull).toFixed(1)}px`);
    st.setProperty(`--zg-l${i}`, (gain * ziaGlowRingFade(x, ring)).toFixed(3));
    const lx = w / 2 + (cx + x * pull) * wide;
    st.setProperty(`--zg-y${i}`, `${(-ziaGlowArc(lx, w, radius, spot, cfg.cornerN) * follow).toFixed(1)}px`);
  }
  const hue =
    reduced || cfg.hueRange === 0
      ? 0
      : -cfg.hueRange + cfg.hueRange * (1 - Math.cos((ZIA_GLOW_TAU * t) / cfg.hueDuration));
  st.setProperty("--zg-hue", `${hue.toFixed(2)}deg`);
  return true;
}

// The shared loop: capped at ~60 fps, every other frame on a device that cannot hold
// 60 (probing full rate again after 4s), stopped when nothing is left to draw.
function ziaGlowFrame(ts) {
  ziaGlowRaf = requestAnimationFrame(ziaGlowFrame);
  const gap = ziaGlowPrevTs ? ts - ziaGlowPrevTs : 0;
  ziaGlowPrevTs = ts;
  if (ziaGlowHalfRate) {
    ziaGlowSkip = !ziaGlowSkip;
    if (ziaGlowSkip) {
      return;
    }
    if (ts >= ziaGlowProbeAt) {
      ziaGlowHalfRate = false;
      ziaGlowSlowSince = 0;
    }
  } else if (gap > 22) {
    if (!ziaGlowSlowSince) {
      ziaGlowSlowSince = ts;
    } else if (ts - ziaGlowSlowSince > 500) {
      ziaGlowHalfRate = true;
      ziaGlowSkip = false;
      ziaGlowProbeAt = ts + 4000;
    }
  } else {
    ziaGlowSlowSince = 0;
  }
  if (ts - ziaGlowLastFrame < 1000 / 60 - 2) {
    return;
  }
  ziaGlowLastFrame = ts;

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
  if (ziaGlowRaf == null && ziaGlowLive.size && !document.hidden) {
    ziaGlowLastFrame = 0;
    ziaGlowPrevTs = 0;
    ziaGlowSlowSince = 0;
    ziaGlowRaf = requestAnimationFrame(ziaGlowFrame);
  }
}

function ziaGlowStop() {
  if (ziaGlowRaf != null) {
    cancelAnimationFrame(ziaGlowRaf);
    ziaGlowRaf = null;
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
  const make = (cls, tag = "div") => {
    const el = doc.createElementNS(ZIA_GLOW_XHTML, tag);
    if (cls) {
      el.className = cls;
    }
    return el;
  };
  const svgEl = (tag, attrs) => {
    const el = doc.createElementNS(ZIA_GLOW_SVG, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  };

  // Layers, back to front as VoiceBeam stacks them: inner light (and its warp mirror),
  // edge stroke, bloom (and its warp mirror), band canvas, epicentre.
  const root = make("zia-glow");
  root.setAttribute("aria-hidden", "true");
  root.toggleAttribute("data-warp-off", true);
  const inner = make("zia-glow-layer zia-glow-inner");
  const innerWarp = make("zia-glow-layer zia-glow-inner zia-glow-warp");
  const stroke = make("zia-glow-layer zia-glow-stroke");
  const bloom = make("zia-glow-layer zia-glow-bloom");
  const bloomWarp = make("zia-glow-layer zia-glow-bloom zia-glow-warp");
  const canvas = make("zia-glow-layer zia-glow-band", "canvas");
  const core = make("zia-glow-layer zia-glow-core");
  const coreFill = make("");
  core.append(coreFill);

  // The distortion: drifting fractal noise, green pinned to 0.5 so only x displaces.
  const svg = svgEl("svg", { width: "0", height: "0", class: "zia-glow-defs" });
  const filter = svgEl("filter", {
    id,
    x: "-20%",
    y: "-20%",
    width: "140%",
    height: "140%",
    "color-interpolation-filters": "sRGB",
  });
  const turbulence = svgEl("feTurbulence", {
    type: "fractalNoise",
    baseFrequency: "0.04 0.17",
    numOctaves: "2",
    seed: "7",
    result: "noise",
  });
  const shift = svgEl("feOffset", { in: "noise", dx: "0", dy: "0", result: "moved" });
  const matrix = svgEl("feColorMatrix", {
    in: "moved",
    type: "matrix",
    values: "1 0 0 0 0  0 0 0 0 0.5  0 0 0 0 0  0 0 0 0 1",
    result: "map",
  });
  const displace = svgEl("feDisplacementMap", {
    in: "SourceGraphic",
    in2: "map",
    scale: "0",
    xChannelSelector: "R",
    yChannelSelector: "G",
  });
  filter.append(turbulence, shift, matrix, displace);
  svg.append(filter);
  innerWarp.style.setProperty("filter", `var(--zg-tone) url(#${id})`);
  bloomWarp.style.setProperty("filter", `blur(var(--zg-blur)) var(--zg-tone) url(#${id})`);

  root.append(inner, innerWarp, stroke, bloom, bloomWarp, canvas, core, svg);
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
    g.io.observe(root);
  }
  // A still frame (reduced motion) is redrawn when the card is resized.
  if (typeof ResizeObserver === "function") {
    g.ro = new ResizeObserver(() => {
      if (g.playing && ziaGlowReducedMotion()) {
        ziaGlowWake(g);
      }
    });
    g.ro.observe(root);
  }

  return {
    setPlaying(on) {
      on = !!on;
      if (g.destroyed || on === g.playing) {
        return;
      }
      g.playing = on;
      g.offAt = 0;
      root.toggleAttribute("data-on", on);
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
      if (g.destroyed) {
        return;
      }
      g.destroyed = true;
      g.io?.disconnect();
      g.ro?.disconnect();
      ziaGlowLive.delete(g);
      ziaGlowAll.delete(g);
      root.remove();
      if (!ziaGlowLive.size) {
        ziaGlowStop();
      }
    },
  };
}
