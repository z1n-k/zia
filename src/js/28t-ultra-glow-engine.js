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
//
// This file: the constants, the maths and the synthetic music. The look per theme and
// size is in 28ta-ultra-glow-look.js, one frame in 28tb-ultra-glow-frame.js, and the
// shared loop and ziaGlow() in 28tc-ultra-glow-loop.js.
// Used elsewhere: the ZIA_GLOW_ constants, ziaGlowClamp, ziaGlowShape,
// ziaGlowFollow, ziaGlowWrap, ziaGlowRingFade, ziaGlowBell, ziaGlowTail, ziaGlowCornerRadius,
// ziaGlowArc, ziaGlowMusicNew, ziaGlowMusic, ziaGlowScaleFor, ziaGlowRadiusOf.

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
