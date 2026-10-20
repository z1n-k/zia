  // ---------- ziaImgFx: Ultra's pixel-mosaic loader (the hover card's page preview)
  /*
   * A framework-free port of img-fx 0.5.1 (https://libraries.dev; npm
   * "img-fx", the Libraries.dev "Image" loader by Jakub Antalik, a React
   * component on three.js) to raw WebGL2 (WebGL1 fallback), no three.js.
   * The GLSL, the presets (both tunings), the palette, the engine constants
   * and the reveal / hide pipeline are copied from the package's
   * dist/index.es.js; see NOTES.md for what was ported and what changed.
   *
   * MIT License
   *
   * Copyright (c) 2026 Jakub Antalik
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
   * ziaImgFx(host, { preset, strength, dark, radius, palette, cardBg, minChurnMs, revealSeconds })
   *   -> { reveal(source, { onDone }), hide(), setDark(dark), destroy(), element }
   *
   * revealSeconds: the dissolve's length in place of the preset's (3s for
   * pixels-organic), its parts kept in proportion: a hover card's preview
   * wants it quicker.
   *
   * palette: optional CSS colours (a few) that re-tint the mosaic's colour
   * field in place of the preset's own, fed to the shader's seven colour
   * uniforms as the package's colors override (see ziaImgRetint).
   *
   * The loader churns at once. reveal() snapshots a canvas, ImageBitmap or
   * loaded <img> and dissolves into it as the package's
   * triggerReveal({ hold: "manual" }) does (object-fit: cover), then holds it;
   * hide() fades back to the churn as triggerHide() does. A host that can't
   * hold children (canvas, img, video...) gets the loader as its next sibling,
   * laid over its box; any other host gets it appended inside, filling it.
   */

  const ZIA_IMG_NS = "http://www.w3.org/1999/xhtml";

  // The presets, verbatim from the package (dist: mt / vt / xt)
  const ZIA_IMG_PRESETS = {
    "pixels-organic": {
      name: "pixels-organic",
      modes: {
        dark: {
          theme: "dark",
          effectIndex: 22,
          colors: ["#0f0f0f", "#4a4949", "#b9b9b9", "#0f0f0f", "#d8d8d8", "#0f0f0f", "#2f2f2f"],
          alphas: [1, 1, 1, 1, 1, 1, 1],
          cardBg: "#0f0f0f",
          dotMode: 1,
          pixelConfig: {
            cellSize: 0.22,
            gap: 0.14,
            dotOpacity: 0.68,
            dotSize: 0.8,
            dotSoftness: 0.1,
            hlScale: 0.8,
            fillOpacity: 0.44,
            edgeFade: 24,
            fadeStr: 1
          },
          dotConfig: {
            cellSize: 0.58,
            gap: 0,
            dotOpacity: 1,
            dotSize: 0.22,
            dotSoftness: 0.1,
            hlScale: 0.26,
            fillOpacity: 0,
            edgeFade: 34,
            fadeStr: 0.34
          },
          direction: 0,
          speed: 0.3,
          intensity: 1,
          scale: 1,
          softness: 0.76,
          distortion: 0.3,
          complexity: 0.2,
          shape: 0.52,
          blur: 1,
          highlight: 0.2,
          vignette: 0.26,
          vigOpacity: 1,
          shaderOpacity: 1,
          revealConfig: {
            duration: 3,
            easing: "easeOutCubic",
            maskShape: "shaderColor4",
            softness: 0.5,
            blur: 0,
            pixDuration: 2.65,
            pixEasing: "easeOutCubic",
            dotDuration: 2.05,
            dotEasing: "easeOutCubic"
          },
          effect: "Chromium Flow"
        },
        light: {
          theme: "light",
          effectIndex: 22,
          colors: ["#e3e3e3", "#ffffff", "#f5f5f5", "#f5f5f5", "#080808", "#f5f5f5", "#f5f5f5"],
          alphas: [1, 1, 1, 1, 1, 1, 1],
          cardBg: "#f5f5f5",
          dotMode: 1,
          pixelConfig: {
            cellSize: 0.22,
            gap: 0.14,
            dotOpacity: 0.68,
            dotSize: 0.8,
            dotSoftness: 0.1,
            hlScale: 0.8,
            fillOpacity: 0.18,
            edgeFade: 20,
            fadeStr: 1
          },
          dotConfig: {
            cellSize: 0.58,
            gap: 0,
            dotOpacity: 1,
            dotSize: 0.22,
            dotSoftness: 0.1,
            hlScale: 0.26,
            fillOpacity: 0,
            edgeFade: 34,
            fadeStr: 0.34
          },
          direction: 25,
          speed: 0.3,
          intensity: 0.85,
          scale: 1,
          softness: 0.76,
          distortion: 0.3,
          complexity: 0.2,
          shape: 0.52,
          blur: 1,
          highlight: 0.7,
          vignette: 0,
          vigOpacity: 0,
          shaderOpacity: 1,
          revealConfig: {
            duration: 3,
            easing: "easeOutCubic",
            maskShape: "shaderColor4",
            softness: 0.5,
            blur: 0,
            pixDuration: 2.55,
            pixEasing: "easeOutCubic",
            dotDuration: 2.05,
            dotEasing: "easeOutCubic"
          },
          effect: "Chromium Flow"
        }
      }
    },
    "pixels-mechanic": {
      name: "pixels-mechanic",
      modes: {
        dark: {
          theme: "dark",
          effectIndex: 11,
          colors: ["#949494", "#2d2d2d", "#333333", "#3a3a3a", "#0b0b0b", "#060606", "#2f2f2f"],
          alphas: [1, 1, 1, 1, 1, 1, 1],
          cardBg: "#0f0f0f",
          dotMode: 1,
          pixelConfig: {
            cellSize: 0.22,
            gap: 0.14,
            dotOpacity: 0.68,
            dotSize: 0.8,
            dotSoftness: 0.1,
            hlScale: 0.8,
            fillOpacity: 0.44,
            edgeFade: 24,
            fadeStr: 1
          },
          dotConfig: {
            cellSize: 0.58,
            gap: 0,
            dotOpacity: 1,
            dotSize: 0.22,
            dotSoftness: 0.1,
            hlScale: 0.26,
            fillOpacity: 0,
            edgeFade: 34,
            fadeStr: 0.34
          },
          direction: 0,
          speed: 0.7,
          intensity: 1,
          scale: 1.4,
          softness: 0.76,
          distortion: 0.3,
          flicker: 0.5,
          complexity: 0.2,
          shape: 0.52,
          blur: 1,
          highlight: 0.32,
          vignette: 0.26,
          vigOpacity: 1,
          shaderOpacity: 1,
          revealConfig: {
            duration: 3,
            easing: "easeOutCubic",
            maskShape: "shaderColor4",
            softness: 0.5,
            blur: 0,
            pixDuration: 2.65,
            pixEasing: "easeOutCubic",
            dotDuration: 2.05,
            dotEasing: "easeOutCubic"
          },
          effect: "Nebula"
        },
        light: {
          theme: "light",
          effectIndex: 11,
          colors: ["#e0e0e0", "#fdfdfd", "#f2f2f2", "#0a0a0a", "#dcdcdc", "#f5f5f5", "#f5f5f5"],
          alphas: [1, 1, 1, 1, 1, 1, 1],
          cardBg: "#f5f5f5",
          dotMode: 1,
          pixelConfig: {
            cellSize: 0.22,
            gap: 0.14,
            dotOpacity: 0.68,
            dotSize: 0.8,
            dotSoftness: 0.1,
            hlScale: 0.8,
            fillOpacity: 0.18,
            edgeFade: 20,
            fadeStr: 1
          },
          dotConfig: {
            cellSize: 0.58,
            gap: 0,
            dotOpacity: 1,
            dotSize: 0.22,
            dotSoftness: 0.1,
            hlScale: 0.26,
            fillOpacity: 0,
            edgeFade: 34,
            fadeStr: 0.34
          },
          direction: 25,
          speed: 0.55,
          intensity: 0.85,
          scale: 0.9,
          softness: 0.76,
          distortion: 0.3,
          flicker: 0.5,
          complexity: 0.2,
          shape: 0.52,
          blur: 1,
          highlight: 0.92,
          vignette: 0,
          vigOpacity: 0,
          shaderOpacity: 1,
          revealConfig: {
            duration: 3,
            easing: "easeOutCubic",
            maskShape: "shaderColor3",
            softness: 0.5,
            blur: 0,
            pixDuration: 2.6,
            pixEasing: "easeOutCubic",
            dotDuration: 2.05,
            dotEasing: "easeOutCubic"
          },
          effect: "Nebula"
        }
      }
    },
    "sweep-gradient": {
      name: "sweep-gradient",
      modes: {
        dark: {
          theme: "dark",
          effectIndex: 25,
          colors: ["#0f0f0f", "#0f0f0f", "#282828", "#3a3a3a", "#525252", "#0f0f0f", "#0f0f0f"],
          alphas: [1, 1, 1, 1, 1, 1, 1],
          cardBg: "#0f0f0f",
          dotMode: 1,
          pixelConfig: {
            cellSize: 0.22,
            gap: 0.14,
            dotOpacity: 0.68,
            dotSize: 0.8,
            dotSoftness: 0.1,
            hlScale: 0.8,
            fillOpacity: 0.44,
            edgeFade: 24,
            fadeStr: 1
          },
          dotConfig: {
            cellSize: 0.58,
            gap: 0,
            dotOpacity: 1,
            dotSize: 0.22,
            dotSoftness: 0.1,
            hlScale: 0.26,
            fillOpacity: 0,
            edgeFade: 34,
            fadeStr: 0.34
          },
          direction: 0,
          speed: 2.65,
          intensity: 1,
          scale: 1,
          softness: 0.76,
          distortion: 0.3,
          flicker: 0.5,
          complexity: 0.2,
          shape: 0.52,
          blur: 1,
          highlight: 0.32,
          vignette: 0.26,
          vigOpacity: 1,
          shaderOpacity: 1,
          sweepEase: 1,
          revealConfig: {
            duration: 3,
            easing: "easeOutCubic",
            maskShape: "gradientSweep",
            softness: 0.5,
            blur: 0,
            pixDuration: 2.65,
            pixEasing: "easeOutCubic",
            dotDuration: 2.05,
            dotEasing: "easeOutCubic"
          },
          effect: "Gradient Sweep"
        },
        light: {
          theme: "light",
          effectIndex: 25,
          colors: ["#f5f5f5", "#f5f5f5", "#ededed", "#eaeaea", "#d2d2d2", "#f5f5f5", "#f5f5f5"],
          alphas: [1, 1, 1, 1, 1, 1, 1],
          cardBg: "#f5f5f5",
          dotMode: 1,
          pixelConfig: {
            cellSize: 0.22,
            gap: 0.14,
            dotOpacity: 0.68,
            dotSize: 0.8,
            dotSoftness: 0.1,
            hlScale: 0.8,
            fillOpacity: 0.18,
            edgeFade: 20,
            fadeStr: 1
          },
          dotConfig: {
            cellSize: 0.58,
            gap: 0,
            dotOpacity: 1,
            dotSize: 0.22,
            dotSoftness: 0.1,
            hlScale: 0.26,
            fillOpacity: 0,
            edgeFade: 34,
            fadeStr: 0.34
          },
          direction: 0,
          speed: 2.65,
          intensity: 0.85,
          scale: 1,
          softness: 0.76,
          distortion: 0.3,
          flicker: 0.5,
          complexity: 0.2,
          shape: 0.52,
          blur: 1,
          highlight: 0.92,
          vignette: 0,
          vigOpacity: 0,
          shaderOpacity: 1,
          sweepEase: 1,
          revealConfig: {
            duration: 3,
            easing: "easeOutCubic",
            maskShape: "gradientSweep",
            softness: 0.5,
            blur: 0,
            pixDuration: 2.6,
            pixEasing: "easeOutCubic",
            dotDuration: 2.05,
            dotEasing: "easeOutCubic"
          },
          effect: "Gradient Sweep"
        }
      }
    },
  };

  // The shaders, verbatim from the package (dist: bt / _t)
  const ZIA_IMG_VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
  const ZIA_IMG_FRAG = /* glsl */ `
  uniform vec2 u_resolution;
  uniform float u_dpr;
  uniform float u_time;
  uniform vec3 u_color1, u_color2, u_color3, u_color4, u_color5, u_color6, u_color7, u_cardBg;
  uniform float u_alpha1, u_alpha2, u_alpha3, u_alpha4, u_alpha5, u_alpha6, u_alpha7;
  uniform float u_speed, u_intensity, u_scale, u_direction;
  uniform float u_softness, u_distortion, u_complexity, u_shape, u_flicker;
  uniform float u_vignette, u_vigOpacity, u_blur, u_highlight, u_shaderOpacity;
  uniform float u_cellSize, u_gap, u_dotSize, u_dotSoftness, u_dotOpacity, u_hlScale, u_fillOpacity, u_edgeFade, u_fadeStr;
  uniform float u_dotMode;
  uniform int u_effect;
  uniform int u_sweepEase;

  // Reference card edge length (CSS px) at which the original preset cellSize
  // gives the canonical cell count. Cell PIXEL size stays constant across card
  // sizes by scaling gridSize proportionally to (currentCssDim / REF_DIM).
  const float REF_DIM = 320.0;

  /** Anisotropic cell count: returns the number of cells along x and y so that
   *  each cell stays SQUARE in screen space regardless of the card's aspect
   *  ratio. A 600×300 card gets twice as many cells horizontally as vertically;
   *  cells stay the same physical size as on a 300×300 card. */
  vec2 gridCounts(float baseCount) {
    vec2 cssRes = u_resolution / max(u_dpr, 0.0001);
    return max(vec2(2.0), floor(baseCount * cssRes / REF_DIM));
  }

  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec2 mod289v2(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289((x * 34.0 + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289v2(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x_) - 0.5;
    vec3 ox = floor(x_ + 0.5);
    vec3 a0 = x_ - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float fbm(vec2 p, float oct) {
    float val = 0.0, amp = 0.5;
    int n = int(oct);
    for (int i = 0; i < 4; i++) {
      if (i >= n) break;
      val += amp * snoise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return val;
  }

  float nfbm(vec2 p) { return fbm(p, 2.0 + u_complexity * 2.0); }

  vec3 palette(float t) {
    t = clamp(t, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    float k = 64.0;
    float w1 = u_alpha1 * exp(-k * t * t);
    float w2 = u_alpha2 * exp(-k * (t - 0.25) * (t - 0.25));
    float w3 = u_alpha3 * exp(-k * (t - 0.5)  * (t - 0.5));
    float w4 = u_alpha4 * exp(-k * (t - 0.75) * (t - 0.75));
    float w5 = u_alpha5 * exp(-k * (t - 1.0)  * (t - 1.0));
    float total = w1 + w2 + w3 + w4 + w5 + 0.0001;
    return (u_color1*w1 + u_color2*w2 + u_color3*w3 + u_color4*w4 + u_color5*w5) / total;
  }

  vec3 softBlend(float a, float b, float c) {
    a = clamp(a, 0.0, 1.0); a *= a;
    b = clamp(b, 0.0, 1.0); b *= b;
    c = clamp(c, 0.0, 1.0); c *= c;
    float d = clamp(a * 0.7 + c * 0.3, 0.0, 1.0); d *= d;
    float e = clamp(b * 0.5 + c * 0.5, 0.0, 1.0); e *= e;
    a *= u_alpha1; b *= u_alpha2; c *= u_alpha3; d *= u_alpha4; e *= u_alpha5;
    float total = a + b + c + d + e;
    float floorW = max(0.001 - total, 0.0);
    vec3 fallback = (u_color1 + u_color2 + u_color3 + u_color4 + u_color5) * 0.2;
    return (u_color1 * a + u_color2 * b + u_color3 * c + u_color4 * d + u_color5 * e + fallback * floorW) / (total + floorW);
  }

  vec2 warp(vec2 p, float t) {
    float str = u_distortion * 2.0;
    return vec2(
      nfbm(p + vec2(t * 0.1, 0.0)),
      nfbm(p + vec2(0.0, t * 0.12) + 5.0)
    ) * str;
  }

  float sweepEase(float x) {
    if (u_sweepEase == 1) return x * x * (3.0 - 2.0 * x);
    if (u_sweepEase == 2) {
      float p = 1.0 - x;
      return 1.0 - p * p * p;
    }
    if (u_sweepEase == 3) {
      return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) * 0.5;
    }
    if (u_sweepEase == 4) return 1.0 - pow(2.0, -10.0 * x) * (1.0 - x);
    return x;
  }

  float blob(vec2 p, vec2 center, float radius) {
    float r = radius * (0.5 + u_shape * 0.8);
    float soft = 0.05 + u_softness * 0.4;
    return smoothstep(r + soft, r - soft * 0.5, length(p - center));
  }

  vec3 computeEffect(vec2 uv, float aspect, float t, float dist, float soft, float cpx, float shp) {
    vec2 p = (uv - 0.5) * u_scale;
    p.x *= aspect;
    p += vec2(cos(u_direction), sin(u_direction)) * t * 0.15;
    vec3 col = vec3(0.0);

    if (u_effect == 0) {
      float val = sin(p.x * 3.0 + t) * 0.5 + 0.5;
      val += sin(p.y * 2.0 + t * 0.7) * 0.3;
      val += sin((p.x + p.y) * (1.0 + cpx * 3.0) - t * 0.5) * 0.2;
      vec2 w = warp(p, t);
      val += (w.x + w.y) * 0.15;
      col = palette(clamp(val * u_intensity, 0.0, 1.0));

    } else if (u_effect == 1) {
      float freq = 3.0 + cpx * 8.0;
      float val = 0.0;
      val += sin(p.x * freq + t);
      val += sin(p.y * freq + t * 1.3);
      val += sin((p.x + p.y) * freq * 0.7 + t * 0.7);
      val += sin(length(p) * freq * 0.8 - t * 1.5);
      vec2 w = warp(p, t);
      val += (w.x + w.y) * dist;
      val = val * 0.2 * u_intensity + 0.5;
      col = palette(clamp(val, 0.0, 1.0));

    } else if (u_effect == 2) {
      vec2 q = vec2(nfbm(p + t * 0.3), nfbm(p + vec2(5.2, 1.3) + t * 0.2));
      float val = nfbm(p + q * (1.0 + dist * 3.0) + t * 0.1);
      val = val * u_intensity * 0.5 + 0.5;
      col = palette(clamp(val, 0.0, 1.0));

    } else if (u_effect == 3) {
      float d = length(p);
      float val = sin(d * (3.0 + cpx * 6.0) - t * 2.0) * 0.5 + 0.5;
      val *= exp(-d * (0.3 + shp * 1.0));
      val += sin(atan(p.y, p.x) * (1.5 + cpx * 2.0) + t) * 0.15;
      col = palette(clamp(val * u_intensity, 0.0, 1.0));

    } else if (u_effect == 4) {
      vec2 q = vec2(nfbm(p * (0.5 + shp * 0.6) + vec2(t * 0.12, t * 0.08)), nfbm(p * (0.5 + shp * 0.6) + vec2(t * 0.09, -t * 0.11)));
      vec2 r = vec2(nfbm(p + q * (1.0 + dist * 2.0) + vec2(1.7, 9.2) + t * 0.06), nfbm(p + q * (1.0 + dist * 2.0) + vec2(8.3, 2.8) - t * 0.08));
      float val = nfbm(p + r * 2.0);
      float lo = -0.3 - soft * 0.5;
      float hi = 0.5 + soft * 0.5;
      val = smoothstep(lo, hi, val * u_intensity);
      col = palette(val);

    } else if (u_effect == 5) {
      float n1 = nfbm(vec2(p.x * 0.5 + t * 0.15, p.y * (1.0 + cpx * 1.5)));
      float n2 = nfbm(vec2(p.x * 0.3 - t * 0.1, p.y * (0.8 + cpx * 1.0) + 3.0));
      float band = sin(p.y * 3.0 + n1 * (1.0 + dist * 2.0) + t * 0.3) * 0.5 + 0.5;
      float shimmer = sin(p.y * 4.0 + n2 * 1.5 - t * 0.2) * 0.5 + 0.5;
      float w1 = band * (0.5 + 0.5 * sin(p.x * 1.5 + t * 0.2 + n1));
      float w2 = shimmer * (0.5 + 0.5 * cos(p.x * 1.0 - t * 0.15 + n2));
      float w3 = nfbm(p * 0.5 + t * 0.05) * 0.5 + 0.5;
      col = softBlend(w1 * u_intensity, w2 * u_intensity, w3 * 0.6 * u_intensity);

    } else if (u_effect == 6) {
      vec2 wp = warp(p * 1.2, t);
      float blobR = 0.15 + shp * 0.2;
      float b1 = blob(p, vec2(sin(t * 0.3) * 0.3, cos(t * 0.2) * 0.4) + wp * 0.2, blobR);
      float b2 = blob(p, vec2(cos(t * 0.25) * 0.4, sin(t * 0.35) * 0.3 - 0.2) + wp * 0.15, blobR * 1.2);
      float b3 = blob(p, vec2(-sin(t * 0.2) * 0.3, -cos(t * 0.3) * 0.35) + wp * 0.18, blobR);
      float bg = nfbm(p * 0.5 + t * 0.05) * 0.3 + 0.15;
      col = softBlend((b1 + bg * 0.5) * u_intensity, (b2 + bg * 0.3) * u_intensity, (b3 + bg * 0.4) * u_intensity);

    } else if (u_effect == 7) {
      float sz = 0.4 + shp * 0.6;
      float sigma = sz * sz * 2.0;
      vec2 a1 = vec2(-0.45 + sin(t * 0.07) * 0.06, 0.45 + cos(t * 0.09) * 0.05);
      vec2 a2 = vec2(0.45 + cos(t * 0.08) * 0.06, 0.45 + sin(t * 0.06) * 0.05);
      vec2 a3 = vec2(0.0 + sin(t * 0.05) * 0.1, 0.0 + cos(t * 0.07) * 0.1);
      vec2 a4 = vec2(-0.4 + cos(t * 0.06) * 0.07, -0.3 + sin(t * 0.08) * 0.06);
      vec2 a5 = vec2(0.4 + sin(t * 0.07) * 0.06, -0.4 + cos(t * 0.05) * 0.06);
      float g1 = exp(-dot(p - a1, p - a1) / sigma);
      float g2 = exp(-dot(p - a2, p - a2) / sigma);
      float g3 = exp(-dot(p - a3, p - a3) / sigma);
      float g4 = exp(-dot(p - a4, p - a4) / sigma);
      float g5 = exp(-dot(p - a5, p - a5) / sigma);
      float nudge = dist > 0.01 ? snoise(p * (0.5 + cpx) + t * 0.04) * dist * 0.08 : 0.0;
      float w1 = (g1 + g4 + nudge) * u_intensity;
      float w2 = (g2 + g5 + nudge) * u_intensity;
      float w3 = (g3 + nudge) * u_intensity;
      col = softBlend(w1, w2, w3);

    } else if (u_effect == 8) {
      vec2 w1 = vec2(nfbm(p * (0.7 + cpx * 0.5) + t * 0.1), nfbm(p * (0.7 + cpx * 0.5) + vec2(3.3, 7.7) + t * 0.08));
      vec2 w2 = vec2(nfbm(p * 0.6 + w1 * (1.0 + dist) + t * 0.06), nfbm(p * 0.6 + w1 * (1.0 + dist) + vec2(1.7, 4.2) - t * 0.07));
      float f1 = nfbm(p + w2 * 1.5);
      float f2 = nfbm(p + w2 * 1.5 + vec2(4.1, 2.3));
      float f3 = nfbm(p + w2 * 1.5 + vec2(7.5, 6.1));
      col = softBlend((f1 * 0.5 + 0.5) * u_intensity, (f2 * 0.5 + 0.5) * u_intensity, (f3 * 0.5 + 0.5) * u_intensity);

    } else if (u_effect == 9) {
      vec2 sw = vec2(sin(p.y * 2.0 + t * 0.3) * 0.15 + snoise(p * 1.5 + t * 0.15) * dist * 0.3, cos(p.x * 1.8 + t * 0.25) * 0.15 + snoise(p * 1.5 + vec2(5.0, 0.0) + t * 0.12) * dist * 0.3);
      vec2 wp = p + sw;
      float caustic = (snoise(wp * (1.5 + cpx * 2.0) + t * 0.2) * 0.5 + 0.5) + (snoise(wp * (2.0 + cpx * 2.0) - t * 0.15) * 0.5 + 0.5) * 0.5;
      caustic = caustic / 1.5;
      float depth = nfbm(vec2(p.x * 0.3, p.y * 0.8) + t * 0.05) * 0.5 + 0.5;
      col = softBlend(depth * u_intensity, (1.0 - depth) * u_intensity, caustic * u_intensity);

    } else if (u_effect == 10) {
      float angle = 0.6 + shp * 1.2;
      float ca = cos(angle), sa = sin(angle);
      vec2 rp = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
      float n1 = nfbm(rp * 0.8 + t * 0.12) * (1.0 + dist * 2.0);
      float n2 = nfbm(rp * 0.6 + vec2(3.0, 0.0) + t * 0.1) * (1.0 + dist * 1.5);
      float wave = sin(rp.x * (2.0 + cpx * 2.0) + n1 + t * 0.3);
      float wave2 = sin(rp.x * (1.5 + cpx * 1.5) + n2 - t * 0.2);
      float ribbon1 = exp(-2.0 * (rp.y - wave * 0.35) * (rp.y - wave * 0.35)) * u_intensity;
      float ribbon2 = exp(-2.0 * (rp.y - 0.15 - wave2 * 0.3) * (rp.y - 0.15 - wave2 * 0.3)) * u_intensity;
      float bg = nfbm(p * 0.4 + t * 0.03) * 0.5 + 0.5;
      col = softBlend(ribbon1, ribbon2, bg * 0.5 * u_intensity);

    } else if (u_effect == 11) {
      vec2 q = vec2(nfbm(p * 0.5 + vec2(t * 0.05, 0.0)), nfbm(p * 0.5 + vec2(0.0, t * 0.07)));
      vec2 r = vec2(nfbm(p * 0.6 + q * (1.0 + dist * 1.5) + vec2(1.7, 9.2) + t * 0.03), nfbm(p * 0.6 + q * (1.0 + dist * 1.5) + vec2(8.3, 2.8) + t * 0.04));
      float f = nfbm(p + r * 1.5);
      float f2 = nfbm(p * 0.7 + r + vec2(3.0, 7.0));
      col = softBlend((f * 0.5 + 0.5) * u_intensity, (f2 * 0.5 + 0.5) * u_intensity, (nfbm(p * 0.4 - t * 0.02) * 0.5 + 0.5) * u_intensity);

    } else if (u_effect == 12) {
      vec2 w = warp(p * 0.5, t * 0.7);
      float fold1 = sin(p.x * (1.5 + cpx * 2.0) + w.x * 1.5 + t * 0.2) * 0.5 + 0.5;
      float fold2 = sin(p.y * (1.2 + cpx * 1.5) + w.y * 1.5 - t * 0.15) * 0.5 + 0.5;
      float fold3 = sin((p.x - p.y) * (0.8 + cpx * 0.8) + (w.x + w.y) + t * 0.1) * 0.5 + 0.5;
      col = softBlend(fold1 * u_intensity, fold2 * u_intensity, fold3 * 0.7 * u_intensity);

    } else if (u_effect == 13) {
      float spread = 0.25 + shp * 0.35;
      vec2 w = warp(p, t * 0.5);
      vec2 c1 = vec2(sin(t * 0.08) * spread, cos(t * 0.11) * spread) + w * 0.15;
      vec2 c2 = vec2(cos(t * 0.09) * spread * 1.3, sin(t * 0.07) * spread) + w * 0.12;
      vec2 c3 = vec2(-sin(t * 0.1) * spread, -cos(t * 0.08) * spread * 1.2) + w * 0.1;
      float falloff = 0.3 + soft * 0.7;
      float d1 = 1.0 - smoothstep(0.0, falloff, length(p - c1 + w * dist * 0.3));
      float d2 = 1.0 - smoothstep(0.0, falloff, length(p - c2 + w * dist * 0.25));
      float d3 = 1.0 - smoothstep(0.0, falloff, length(p - c3 + w * dist * 0.2));
      float detail = nfbm(p * 2.0 + t * 0.05) * cpx * 0.3;
      col = softBlend((d1 + detail) * u_intensity, (d2 + detail) * u_intensity, (d3 + detail) * u_intensity);

    } else if (u_effect == 14) {
      vec2 w = warp(p * 0.6, t * 0.6);
      float angle = atan(p.y + w.y * dist, p.x + w.x * dist);
      float radius = length(p);
      float field1 = sin(angle * (2.0 + cpx * 4.0) + radius * (3.0 + cpx * 3.0) + t * 0.4 + nfbm(p + t * 0.1) * dist * 2.0) * 0.5 + 0.5;
      float field2 = sin(angle * (1.5 + cpx * 2.5) - radius * 2.0 - t * 0.3 + nfbm(p * 0.6 + t * 0.08) * dist * 1.5) * 0.5 + 0.5;
      float bg = nfbm(p * 0.3 + t * 0.03) * 0.5 + 0.5;
      col = softBlend(field1 * u_intensity, field2 * u_intensity, bg * 0.5 * u_intensity);

    } else if (u_effect == 15) {
      vec2 drift = vec2(t * 0.06, t * 0.03);
      float c1 = nfbm((p + drift) * (0.4 + cpx * 0.5)) * 0.5 + 0.5;
      float c2 = nfbm((p + drift + vec2(3.7, 1.2)) * (0.35 + cpx * 0.4)) * 0.5 + 0.5;
      float c3 = nfbm((p + drift + vec2(7.1, 4.5)) * (0.3 + cpx * 0.35)) * 0.5 + 0.5;
      vec2 w = warp(p * 0.2, t * 0.4);
      c1 += w.x * dist * 0.3;
      c2 += w.y * dist * 0.25;
      col = softBlend(c1 * u_intensity, c2 * u_intensity, c3 * u_intensity);

    } else if (u_effect == 16) {
      vec2 w = warp(vec2(p.x * 0.3, p.y * 0.6), t * 0.5);
      float c1 = sin(p.x * (1.5 + cpx * 2.0) + w.x * (1.0 + dist * 2.0) + t * 0.15) * 0.5 + 0.5;
      float c2 = sin(p.x * (1.0 + cpx * 1.5) + w.y * (1.0 + dist * 1.5) - t * 0.12 + 2.0) * 0.5 + 0.5;
      float c3 = sin(p.x * (0.8 + cpx * 1.0) + (w.x + w.y) * 0.5 * (1.0 + dist) + t * 0.08 + 4.0) * 0.5 + 0.5;
      float fade = nfbm(vec2(p.x * 0.3, p.y * 0.5) + t * 0.03) * 0.5 + 0.5;
      col = softBlend(c1 * fade * u_intensity, c2 * fade * u_intensity, c3 * (1.0 - fade * 0.4) * u_intensity * 0.7);

    } else if (u_effect == 17) {
      vec2 w = warp(p * 0.8, t * 0.6);
      vec2 w2 = warp(p * 0.5 + w * 0.4, t * 0.4);
      float r1 = (snoise((p + w * dist * 0.5) * (1.5 + cpx * 2.0) + t * 0.1) * 0.5 + 0.5) * u_intensity;
      float r2 = (snoise((p + w2 * dist * 0.4) * (1.2 + cpx * 1.5) + t * 0.08 + 3.0) * 0.5 + 0.5) * u_intensity;
      float r3 = (snoise((p + (w + w2) * dist * 0.3) * (0.8 + cpx * 1.0) - t * 0.06 + 7.0) * 0.5 + 0.5) * u_intensity;
      col = softBlend(r1, r2, r3);

    } else if (u_effect == 18) {
      vec2 w = warp(p * 0.5, t * 0.5);
      float blobSize = 0.2 + shp * 0.3;
      float total1 = 0.0, total2 = 0.0;
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        vec2 c1 = vec2(sin(t * 0.1 + fi * 2.1) * 0.4, cos(t * 0.13 + fi * 1.7) * 0.35) + w * dist * 0.15;
        vec2 c2 = vec2(cos(t * 0.12 + fi * 1.9) * 0.35, sin(t * 0.09 + fi * 2.3) * 0.4) + w * dist * 0.12;
        total1 += blobSize * blobSize / (dot(p - c1, p - c1) + 0.02);
        total2 += blobSize * blobSize / (dot(p - c2, p - c2) + 0.02);
      }
      total1 = clamp(total1 * 0.25, 0.0, 1.0);
      total2 = clamp(total2 * 0.25, 0.0, 1.0);
      float total3 = nfbm(p + w * dist * 0.3 + t * 0.05) * 0.5 + 0.5;
      col = softBlend(total1 * u_intensity, total2 * u_intensity, total3 * 0.7 * u_intensity);

    } else if (u_effect == 19) {
      vec2 w = warp(p * 0.4, t * 0.4);
      float angle = atan(p.y, p.x);
      float radius = length(p);
      float s1 = sin(angle * (1.5 + cpx * 2.0) + radius * (3.0 + cpx * 3.0) + t * 0.3 + w.x * dist * 1.5) * 0.5 + 0.5;
      float s2 = sin(angle * (1.2 + cpx * 1.5) - radius * (2.5 + cpx * 2.5) - t * 0.25 + w.y * dist * 1.5 + 1.5) * 0.5 + 0.5;
      float s3 = sin((angle + 3.14) * (0.8 + cpx) + radius * (2.0 + cpx * 2.0) + t * 0.15 + (w.x + w.y) * dist) * 0.5 + 0.5;
      float fade = exp(-radius * (0.5 - shp * 0.3));
      col = softBlend(s1 * fade * u_intensity, s2 * fade * u_intensity, s3 * fade * 0.7 * u_intensity);

    } else if (u_effect == 20) {
      vec2 w = warp(p * 0.5, t * 0.4);
      vec2 wp = p + w * (0.4 + dist * 0.6);
      float scale = 0.6 + cpx * 0.8;
      float h  = nfbm(wp * scale + t * 0.08);
      float eps = 0.06;
      float hx = nfbm((wp + vec2(eps, 0.0)) * scale + t * 0.08) - h;
      float hy = nfbm((wp + vec2(0.0, eps)) * scale + t * 0.08) - h;
      vec3 n = normalize(vec3(-hx * 6.0, -hy * 6.0, 1.0));
      vec3 lightDir = normalize(vec3(0.55, 0.65, 0.8));
      float light = max(dot(n, lightDir), 0.0);
      float spec = pow(light, 6.0 + shp * 26.0);
      float diffuse = light * 0.6 + 0.35;
      float fres = pow(1.0 - max(n.z, 0.0), 2.0);
      float w1 = (diffuse + spec * 0.5) * u_intensity;
      float w2 = (h * 0.5 + 0.5 + spec * 0.3 + fres * 0.3) * u_intensity;
      float w3 = (spec * 1.4 + fres * 0.5) * u_intensity;
      col = softBlend(w1, w2, w3);

    } else if (u_effect == 21) {
      vec2 w = warp(p * 0.4, t * 0.3);
      float angle = 0.2 + shp * 1.3;
      float ca = cos(angle), sa = sin(angle);
      vec2 rp = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
      float band = sin(rp.y * (3.0 + cpx * 5.0) + w.x * (1.0 + dist * 2.5) + t * 0.35);
      float ridge = 1.0 - abs(band);
      ridge = pow(ridge, 5.0 + shp * 10.0);
      float band2 = sin(rp.y * (2.0 + cpx * 3.0) + w.y * (0.8 + dist * 2.0) - t * 0.22 + 1.4);
      float ridge2 = 1.0 - abs(band2);
      ridge2 = pow(ridge2, 3.0 + shp * 8.0);
      float bg = nfbm(p * 0.45 + t * 0.05) * 0.5 + 0.5;
      float w1 = (ridge * 1.4 + bg * 0.25) * u_intensity;
      float w2 = (ridge2 * 1.0 + bg * 0.45) * u_intensity;
      float w3 = (ridge * 0.5 + ridge2 * 0.5) * u_intensity * 0.8;
      col = softBlend(w1, w2, w3);

    } else if (u_effect == 22) {
      vec2 w  = warp(p * 0.7, t * 0.5);
      vec2 w2 = warp(p * 0.4 + w * 0.3, t * 0.3);
      vec2 wp = p + w * (0.4 + dist * 0.6);
      float n1 = snoise(wp * (1.4 + cpx * 1.6) + t * 0.14);
      float n2 = snoise((wp + w2 * dist * 0.4) * (2.0 + cpx * 2.0) + vec2(3.0, 7.0) - t * 0.1);
      float ridge1 = 1.0 - abs(n1);
      ridge1 = pow(ridge1, 5.0 + shp * 12.0);
      float ridge2 = 1.0 - abs(n2);
      ridge2 = pow(ridge2, 4.0 + shp * 10.0);
      float base = (n1 + n2) * 0.25 + 0.5;
      float w1 = (base * 0.6 + ridge1 * 1.2) * u_intensity;
      float w2c = ((1.0 - base) * 0.6 + ridge2 * 1.0) * u_intensity;
      float w3 = (ridge1 * 0.8 + ridge2 * 0.6) * u_intensity;
      col = softBlend(w1, w2c, w3);

    } else if (u_effect == 23) {
      float angle = 0.1 + shp * 1.4;
      float ca = cos(angle), sa = sin(angle);
      vec2 rp = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
      vec2 stretch = vec2(rp.x * (5.0 + cpx * 4.0), rp.y * (0.35 + cpx * 0.3));
      vec2 sw = warp(stretch * 0.3, t * 0.3) * dist;
      float n1 = snoise(stretch + sw + t * 0.08);
      float n2 = snoise(stretch * 1.4 + vec2(2.0, 5.0) + sw - t * 0.06);
      float streak = 1.0 - abs(n1);
      streak = pow(streak, 6.0 + shp * 12.0);
      float streak2 = 1.0 - abs(n2);
      streak2 = pow(streak2, 4.0 + shp * 8.0);
      float bg = nfbm(p * 0.4 + t * 0.04) * 0.4 + 0.4;
      float w1 = (streak * 1.4 + bg * 0.3) * u_intensity;
      float w2 = (streak2 * 0.9 + bg * 0.5) * u_intensity;
      float w3 = (streak * 0.7 + streak2 * 0.4) * u_intensity * 0.8;
      col = softBlend(w1, w2, w3);

    } else if (u_effect == 24) {
      vec2 w1 = warp(p * 0.55, t * 0.4);
      vec2 w2 = warp(p * 0.7 + w1 * 0.4, t * 0.3);
      vec2 wp = p + (w1 + w2) * (0.4 + dist * 0.7);

      float scale = 0.65 + cpx * 0.7;
      float n1 = nfbm(wp * scale + vec2(0.0, 0.0) + t * 0.10);
      float n2 = nfbm(wp * scale + vec2(3.7, 5.2) - t * 0.07);
      float n3 = nfbm(wp * scale + vec2(7.1, 2.3) + t * 0.06);
      float n4 = nfbm(wp * scale + vec2(1.8, 8.4) - t * 0.08);
      float n5 = nfbm(wp * scale + vec2(4.9, 1.1) + t * 0.05);
      float n6 = nfbm(wp * scale + vec2(6.3, 7.8) - t * 0.09);
      float n7 = nfbm(wp * scale + vec2(2.4, 4.6) + t * 0.04);

      float pw = 2.5 + shp * 5.0;
      n1 = pow(clamp(n1, 0.0, 1.0), pw);
      n2 = pow(clamp(n2, 0.0, 1.0), pw);
      n3 = pow(clamp(n3, 0.0, 1.0), pw);
      n4 = pow(clamp(n4, 0.0, 1.0), pw);
      n5 = pow(clamp(n5, 0.0, 1.0), pw);
      n6 = pow(clamp(n6, 0.0, 1.0), pw);
      n7 = pow(clamp(n7, 0.0, 1.0), pw);

      float intens = 0.5 + u_intensity * 0.9;
      float a1 = n1 * u_alpha1 * intens;
      float a2 = n2 * u_alpha2 * intens;
      float a3 = n3 * u_alpha3 * intens;
      float a4 = n4 * u_alpha4 * intens;
      float a5 = n5 * u_alpha5 * intens;
      float a6 = n6 * u_alpha6 * intens;
      float a7 = n7 * u_alpha7 * intens;
      float total = a1 + a2 + a3 + a4 + a5 + a6 + a7 + 0.001;
      col = (u_color1 * a1 + u_color2 * a2 + u_color3 * a3 + u_color4 * a4
           + u_color5 * a5 + u_color6 * a6 + u_color7 * a7) / total;

    } else if (u_effect == 25) {
      float d = (uv.x + (1.0 - uv.y)) * 0.5;
      float w = 0.9 / max(u_scale, 0.25);
      float cyc = t * 0.08;
      float pA = mix(-w, 1.0 + w, sweepEase(fract(cyc)));
      float pB = mix(-w, 1.0 + w, sweepEase(fract(cyc + 0.5)));
      float band = max(
        clamp(1.0 - abs(d - pA) / w, 0.0, 1.0),
        clamp(1.0 - abs(d - pB) / w, 0.0, 1.0)
      );
      float v = band * u_intensity;

      vec2 ggs = gridCounts(6.0 + u_cellSize * 74.0);
      if (u_dotMode > 1.5) {
        ggs = max(vec2(2.0), floor(ggs * (1.0 - u_gap * 0.8)));
      }
      vec2 cell = floor(uv * ggs);
      float clk = t * 1.6;
      // Wrap the stepped clock to keep sin() arguments small. u_time grows
      // unbounded over a session; on mediump-float GPUs (older Android, some
      // iOS) large hash inputs lose precision and the flicker bands/freezes.
      // mod(x, 1024) keeps the crossfade continuous across the wrap
      // (step 1023 fades into step 0, whose hash is the next s0).
      float step0 = mod(floor(clk), 1024.0);
      float step1 = mod(step0 + 1.0, 1024.0);
      float fz = smoothstep(0.0, 1.0, fract(clk));
      float cellSeed = dot(cell, vec2(127.1, 311.7));
      float r1 = fract(sin(cellSeed + step0 * 17.23) * 43758.5453);
      float r2 = fract(sin(cellSeed + step1 * 17.23) * 43758.5453);
      float rnd = mix(r1, r2, fz);
      v += (rnd - 0.5) * u_flicker * 0.9 * (0.15 + band * 0.85);

      col = palette(clamp(v, 0.0, 1.0));
    }

    return col;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    float t = u_time * u_speed;
    float dist = u_distortion;
    float soft = u_softness;
    float cpx = u_complexity;
    float shp = u_shape;

    vec2 sampleUV = uv;
    if (u_dotMode > 0.5) {
      vec2 gs = gridCounts(6.0 + u_cellSize * 74.0);
      if (u_dotMode > 1.5) {
        gs = max(vec2(2.0), floor(gs * (1.0 - u_gap * 0.8)));
      }
      sampleUV = (floor(uv * gs) + vec2(0.5)) / gs;
    }

    vec3 col;
    if (u_blur < 0.01) {
      col = computeEffect(sampleUV, aspect, t, dist, soft, cpx, shp);
    } else {
      float r = u_blur * 0.02;
      col  = computeEffect(sampleUV, aspect, t, dist, soft, cpx, shp) * 0.4;
      col += computeEffect(sampleUV + vec2( r,  0.0), aspect, t, dist, soft, cpx, shp) * 0.15;
      col += computeEffect(sampleUV + vec2(-r,  0.0), aspect, t, dist, soft, cpx, shp) * 0.15;
      col += computeEffect(sampleUV + vec2( 0.0,  r), aspect, t, dist, soft, cpx, shp) * 0.15;
      col += computeEffect(sampleUV + vec2( 0.0, -r), aspect, t, dist, soft, cpx, shp) * 0.15;
    }

    vec3 baseCol = col;
    if (u_dotMode < 0.5) {
      col = pow(col, vec3(1.3));
    }

    // CSS-pixel distance to the nearest edge — keeps the vignette / edge-fade
    // bands a consistent physical width on every side of any aspect ratio.
    vec2 cssRes = u_resolution / max(u_dpr, 0.0001);
    vec2 cssCoord = uv * cssRes;
    float edgeDistPx = min(
      min(cssCoord.x, cssRes.x - cssCoord.x),
      min(cssCoord.y, cssRes.y - cssCoord.y)
    );
    float vigRangePx = 40.0 * (1.0 + u_vignette * 3.0);
    float vig = (edgeDistPx * edgeDistPx) / (vigRangePx * vigRangePx);
    vig = smoothstep(0.0, 1.0, vig);
    col *= mix(1.0, vig, u_vignette * u_vigOpacity);

    float colorAlpha = (u_alpha1 + u_alpha2 + u_alpha3 + u_alpha4 + u_alpha5) / 5.0;
    if (colorAlpha < 0.999) {
      vec3 c1d = col - u_color1, c2d = col - u_color2, c3d = col - u_color3, c4d = col - u_color4, c5d = col - u_color5;
      float prox1 = exp(-8.0 * dot(c1d, c1d));
      float prox2 = exp(-8.0 * dot(c2d, c2d));
      float prox3 = exp(-8.0 * dot(c3d, c3d));
      float prox4 = exp(-8.0 * dot(c4d, c4d));
      float prox5 = exp(-8.0 * dot(c5d, c5d));
      float pTotal = prox1 + prox2 + prox3 + prox4 + prox5 + 0.0001;
      colorAlpha = (prox1*u_alpha1 + prox2*u_alpha2 + prox3*u_alpha3 + prox4*u_alpha4 + prox5*u_alpha5) / pTotal;
    }
    float alpha = colorAlpha;

    if (u_dotMode > 0.5) {
      vec2 gridSize = gridCounts(6.0 + u_cellSize * 74.0);
      if (u_dotMode > 1.5) {
        gridSize = max(vec2(2.0), floor(gridSize * (1.0 - u_gap * 0.8)));
      }
      // cellLocal is in [0,1] within each cell. Because gridSize was chosen so
      // that cell PIXEL size is square, distance / mask math here works in
      // screen-square units even though we're operating in normalised cell uv.
      vec2 cellLocal = fract(uv * gridSize);

      float hlFactor = 0.0;
      if (u_highlight > 0.01 || u_hlScale > 0.01) {
        vec2 cellCenter = (floor(uv * gridSize) + vec2(0.5)) / gridSize;
        vec2 cp2 = (cellCenter - 0.5) * u_scale;
        cp2.x *= aspect;
        float lw = sin(cp2.x * 3.0 + t * 1.5) * 0.5 + 0.5;
        lw *= sin(cp2.y * 2.5 - t * 1.1) * 0.5 + 0.5;
        lw += (snoise(cp2 * 2.0 + t * 0.6) * 0.5 + 0.5) * 0.3;
        hlFactor = clamp(lw, 0.0, 1.0);
        hlFactor *= hlFactor;
      }

      float scaleBoost = 1.0 + smoothstep(0.2, 0.8, hlFactor) * u_hlScale * 1.2;

      float mask = 1.0;
      if (u_dotMode < 1.5) {
        float gapW = u_gap * 0.35 / scaleBoost;
        if (gapW > 0.003) {
          mask = step(gapW, cellLocal.x) * step(gapW, 1.0 - cellLocal.x)
               * step(gapW, cellLocal.y) * step(gapW, 1.0 - cellLocal.y);
        }
      } else {
        // Render the circular dot mask in screen-pixel space rather than
        // cell-local UV. We map the cell-local offset to actual pixels
        // (cellPx = u_resolution / gridSize), then apply a 1-pixel AA
        // floor to the smoothstep edge so the dot rim is crisp and
        // properly anti-aliased even at u_dotSoftness near 0. The user
        // softness slider still scales linearly on top of the floor.
        // No fwidth() / GL_OES_standard_derivatives needed - dPx is
        // already in pixel units, so a fixed 1-px edge IS pixel-perfect.
        // gridCounts() already keeps cells square in screen space, so
        // pxOffset traces true circles (not ellipses) on any aspect.
        vec2 cellPx = u_resolution / gridSize;
        vec2 pxOffset = (cellLocal - 0.5) * cellPx;
        float dPx = length(pxOffset);
        float minCellPx = min(cellPx.x, cellPx.y);
        float radiusPx = u_dotSize * 0.5 * minCellPx * scaleBoost;
        // 0.5-px AA floor (1-px total smoothstep ramp) keeps the rim
        // pixel-perfect at u_dotSoftness=0 while letting the user softness
        // value dominate at the bundled preset defaults (e.g. softness=0.1
        // on a ~28-px cell yields softPx=0.56 -> ~1.1-px ramp, matching
        // the original cell-local behaviour). A larger floor (e.g. 1.0)
        // would widen low-softness dots and visually lighten dot presets.
        float aaPx = 0.5;
        float softPx = u_dotSoftness * 0.2 * minCellPx;
        float edgePx = max(aaPx, softPx);
        mask = 1.0 - smoothstep(radiusPx - edgePx, radiusPx + edgePx, dPx);
      }

      if (u_highlight > 0.01) {
        float hl = hlFactor * u_highlight;
        col = col * (1.0 + hl * 2.5) + vec3(hl * hl * 0.3);
      }

      if (u_edgeFade > 0.5 && u_fadeStr > 0.005) {
        float ef = smoothstep(0.0, u_edgeFade, edgeDistPx);
        mask *= mix(1.0, ef, u_fadeStr);
      }

      float baseOpacity = (u_dotMode < 1.5) ? u_fillOpacity : 0.0;
      alpha = colorAlpha * mix(baseOpacity, u_dotOpacity, mask);

      float bgLum  = dot(u_cardBg, vec3(0.299, 0.587, 0.114));
      float colLum = dot(baseCol, vec3(0.299, 0.587, 0.114));
      alpha *= smoothstep(0.0, 0.33, abs(colLum - bgLum));
    }

    gl_FragColor = vec4(col, alpha * u_shaderOpacity);
  }
`;

  // the package's engine constants (dist: He, Me, Ct, Nt, qt, De, Vt) and its cycle's revealFadeOutMs
  const ZIA_IMG_FRAME_MS = 1e3 / 10;
  const ZIA_IMG_MAX_DPR = 1.25;
  const ZIA_IMG_MAX_CANVAS_DPR = 2;
  const ZIA_IMG_SAMPLE = 64;
  const ZIA_IMG_SAMPLE_DOTS = 96;
  const ZIA_IMG_REF_DIM = 320;
  const ZIA_IMG_COVER_INSET = 6e-3;
  const ZIA_IMG_HIDE_MS = 300;
  // this port's own: the reduced-motion / no-WebGL crossfade, and how long the
  // shared context outlives its last loader (so each hover doesn't recompile)
  const ZIA_IMG_FADE_MS = 200;
  const ZIA_IMG_KEEP_GL_MS = 30e3;
  // hosts that can't hold rendered children: the loader goes over them, as a sibling
  const ZIA_IMG_REPLACED = /^(canvas|img|video|iframe|embed|object|picture|svg|input|textarea|select)$/i;
  const ZIA_IMG_MASK_SLOT = { shaderColor1: 0, shaderColor2: 1, shaderColor3: 2, shaderColor4: 3, shaderColor5: 4 };

  // the package's easings (dist: Ke / Pe)
  const ZIA_IMG_EASE = {
    linear: (e) => e,
    smoothstep: (e) => e * e * (3 - 2 * e),
    easeOutCubic: (e) => 1 - Math.pow(1 - e, 3),
    easeOutQuint: (e) => 1 - Math.pow(1 - e, 5),
    easeInOutCubic: (e) => (e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2),
    easeOutExpo: (e) => (e === 1 ? 1 : 1 - Math.pow(2, -10 * e)),
    easeOutBack: (e) => 1 + (1.70158 + 1) * Math.pow(e - 1, 3) + 1.70158 * Math.pow(e - 1, 2),
  };

  function ziaImgEase(key, t) {
    return (ZIA_IMG_EASE[key] ?? ZIA_IMG_EASE.smoothstep)(Math.max(0, Math.min(1, t)));
  }

  function ziaImgEl(tag) {
    return document.createElementNS(ZIA_IMG_NS, tag);
  }

  function ziaImgOpacity(el, v) {
    const s = String(v);
    if (el.style.opacity !== s) {
      el.style.opacity = s;
    }
  }

  // ---- colours (dist: be / ze)

  let ziaImgColorCtx;

  function ziaImgParseColor(e) {
    if (typeof e !== "string" || e.length === 0) {
      return [0, 0, 0];
    }
    if (e[0] === "#") {
      let l = e.slice(1);
      if (l.length === 3) {
        l = l[0] + l[0] + l[1] + l[1] + l[2] + l[2];
      }
      if ((l.length === 6 || l.length === 8) && /^[0-9a-fA-F]+$/.test(l)) {
        return [parseInt(l.slice(0, 2), 16) / 255, parseInt(l.slice(2, 4), 16) / 255, parseInt(l.slice(4, 6), 16) / 255];
      }
    }
    if (ziaImgColorCtx === undefined) {
      const c = ziaImgEl("canvas");
      c.width = 1;
      c.height = 1;
      ziaImgColorCtx = c.getContext("2d");
    }
    const t = ziaImgColorCtx;
    if (!t) {
      return [0, 0, 0];
    }
    t.fillStyle = "#000000";
    t.fillStyle = e;
    const a = t.fillStyle;
    t.fillStyle = "#ffffff";
    t.fillStyle = e;
    if (a !== t.fillStyle) {
      return [0, 0, 0];
    }
    if (a[0] === "#") {
      return [parseInt(a.slice(1, 3), 16) / 255, parseInt(a.slice(3, 5), 16) / 255, parseInt(a.slice(5, 7), 16) / 255];
    }
    const i = a.match(/^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/);
    if (i) {
      const l = (c) => Math.max(0, Math.min(255, c)) / 255;
      return [l(parseFloat(i[1])), l(parseFloat(i[2])), l(parseFloat(i[3]))];
    }
    return [0, 0, 0];
  }

  // a palette slot, swapped for the card colour where it was the preset's card colour
  function ziaImgPresetColor(inst, slot) {
    const a = inst.preset;
    const [n, o, i] = ziaImgParseColor(a.colors[slot]);
    if (inst.cardBgOverride == null) {
      return [n, o, i];
    }
    const [l, c, f] = ziaImgParseColor(a.cardBg);
    const s = (h) => Math.round(h * 255);
    return s(n) === s(l) && s(o) === s(c) && s(i) === s(f) ? ziaImgParseColor(inst.cardBgOverride) : [n, o, i];
  }

  // a slot's colour as the shader gets it: the per-slot override where there
  // is one (the package's colors prop / Instance.colorsOverride, dist: It), else
  // the preset's (dist: ze)
  function ziaImgSlotColor(inst, slot) {
    const o = inst.colorsOverride && inst.colorsOverride[slot];
    return o || ziaImgPresetColor(inst, slot);
  }

  // Zia's palette option: a few CSS colours spread over the preset's 7 shader
  // slots the way the package re-tints its colour field from an image
  // (triggerRegenerate's tint, dist: la): the colours and the preset's slots
  // are each ranked by luminance (0.299 / 0.587 / 0.114), and the slot of rank
  // u takes the colour at quantile 0.05 + 0.9 * u / 6. The result is fed as
  // the colors override (dist: Ht), so the animation, the cell grid and the
  // card colour the shader reasons against stay the preset's.
  function ziaImgRetint(preset, palette) {
    const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    const px = [];
    for (const v of palette) {
      if (typeof v === "string" && v) {
        px.push(ziaImgParseColor(v));
      }
    }
    if (px.length === 0) {
      return null;
    }
    px.sort((a, b) => lum(a) - lum(b));
    const slots = preset.colors
      .map((c, slot) => ({ slot, lum: lum(ziaImgParseColor(c)) }))
      .sort((a, b) => a.lum - b.lum);
    const out = new Array(slots.length);
    for (let u = 0; u < slots.length; u++) {
      const g = 0.05 + (0.9 * u) / Math.max(1, slots.length - 1);
      out[slots[u].slot] = px[Math.min(px.length - 1, Math.round(g * (px.length - 1)))];
    }
    return out;
  }

  // ---- the shared engine: one WebGL context, one program, one rAF loop (dist: Mt / lt / it / st / Ee)

  let ziaImgShared = null;

  function ziaImgGLOk(eng) {
    return !!(eng.gl && eng.prog && !eng.contextLost);
  }

  function ziaImgCompile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      if (!gl.isContextLost()) {
        console.warn("ziaImgFx: shader failed to compile", gl.getShaderInfoLog(sh));
      }
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  // (re)builds the program and state; what three's WebGLRenderer + ShaderMaterial set up
  function ziaImgInitGL(eng) {
    eng.prog = null;
    const gl = eng.gl;
    if (!gl || gl.isContextLost()) {
      return false;
    }
    // three's ShaderMaterial wrapping: GLSL ES 3.00 with gl_FragColor mapped to
    // an output, and highp (its default precision) for floats and ints
    const hi = eng.gl2 || gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision > 0;
    const precision = `precision ${hi ? "highp" : "mediump"} float;\nprecision ${hi ? "highp" : "mediump"} int;\n`;
    const vs = eng.gl2
      ? `#version 300 es\n#define attribute in\n#define varying out\n${precision}attribute vec3 position;\n${ZIA_IMG_VERT}`
      : `${precision}attribute vec3 position;\n${ZIA_IMG_VERT}`;
    const fs = eng.gl2
      ? `#version 300 es\n#define varying in\nlayout(location = 0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n${precision}${ZIA_IMG_FRAG}`
      : `${precision}${ZIA_IMG_FRAG}`;
    const v = ziaImgCompile(gl, gl.VERTEX_SHADER, vs);
    const f = v && ziaImgCompile(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) {
      return false;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.bindAttribLocation(prog, 0, "position");
    gl.linkProgram(prog);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (!gl.isContextLost()) {
        console.warn("ziaImgFx: program failed to link", gl.getProgramInfoLog(prog));
      }
      gl.deleteProgram(prog);
      return false;
    }
    // three's PlaneGeometry(2, 2) under the pass-through vertex shader: the whole viewport
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(prog);
    // transparent, depthTest/depthWrite off, NormalBlending with a straight-alpha
    // material (three: SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA),
    // over a clear to (0, 0, 0, 0) inside the scissored viewport
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    eng.prog = prog;
    eng.buf = buf;
    eng.loc = Object.create(null);
    eng.uv = Object.create(null);
    eng.lastInstance = null;
    return true;
  }

  function ziaImgLoc(eng, name) {
    if (!(name in eng.loc)) {
      eng.loc[name] = eng.gl.getUniformLocation(eng.prog, name);
    }
    return eng.loc[name];
  }

  // uniform setters that skip unchanged values (three's uniform cache does the same)
  function ziaImgU1(eng, name, v, int) {
    if (eng.uv[name] === v) {
      return;
    }
    eng.uv[name] = v;
    const loc = ziaImgLoc(eng, name);
    if (loc) {
      if (int) {
        eng.gl.uniform1i(loc, v);
      } else {
        eng.gl.uniform1f(loc, v);
      }
    }
  }

  function ziaImgUN(eng, name, v) {
    const c = eng.uv[name];
    if (c && c.length === v.length && c.every((x, i) => x === v[i])) {
      return;
    }
    eng.uv[name] = v.slice();
    const loc = ziaImgLoc(eng, name);
    if (loc) {
      if (v.length === 2) {
        eng.gl.uniform2f(loc, v[0], v[1]);
      } else {
        eng.gl.uniform3f(loc, v[0], v[1], v[2]);
      }
    }
  }

  function ziaImgEngine() {
    let eng = ziaImgShared;
    if (eng) {
      if (eng.keepTimer) {
        clearTimeout(eng.keepTimer);
        eng.keepTimer = 0;
      }
      return eng;
    }
    const glCanvas = ziaImgEl("canvas");
    glCanvas.width = 8;
    glCanvas.height = 8;
    eng = ziaImgShared = {
      glCanvas,
      gl: null,
      gl2: false,
      prog: null,
      buf: null,
      loc: null,
      uv: null,
      pixelRatio: Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_DPR),
      instances: new Set(),
      rafId: 0,
      lastFrameMs: 0,
      lastTickMs: performance.now(),
      churning: false,
      lastInstance: null,
      contextLost: false,
      keepTimer: 0,
      reduceQuery: null,
      listeners: [],
    };
    // three's context attributes, but not "high-performance" (that wakes a
    // laptop's discrete GPU for a hover card), and no depth buffer (unused)
    const attrs = {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    };
    try {
      eng.gl = glCanvas.getContext("webgl2", attrs);
      eng.gl2 = !!eng.gl;
      if (!eng.gl) {
        eng.gl = glCanvas.getContext("webgl", attrs);
      }
      ziaImgInitGL(eng);
    } catch (err) {
      eng.prog = null;
    }
    const listen = (target, type, fn) => {
      target.addEventListener(type, fn, false);
      eng.listeners.push([target, type, fn]);
    };
    listen(glCanvas, "webglcontextlost", (event) => {
      event.preventDefault();
      eng.contextLost = true;
      // a dissolve can't go on without the shader: show its image
      for (const inst of eng.instances) {
        inst.reveal.finishNow();
      }
    });
    listen(glCanvas, "webglcontextrestored", () => {
      eng.contextLost = false;
      ziaImgInitGL(eng);
      for (const inst of eng.instances) {
        inst.uniformsDirty = true;
        ziaImgRenderNow(eng, inst);
      }
      ziaImgKick(eng);
    });
    listen(document, "visibilitychange", () => {
      for (const inst of eng.instances) {
        ziaImgUpdateVisible(eng, inst);
      }
    });
    eng.reduceQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (eng.reduceQuery) {
      listen(eng.reduceQuery, "change", () => {
        for (const inst of eng.instances) {
          inst.reduced = eng.reduceQuery.matches;
          if (inst.reduced) {
            inst.reveal.finishNow();
          }
          ziaImgRenderNow(eng, inst);
        }
        ziaImgKick(eng);
      });
    }
    return eng;
  }

  function ziaImgRelease(eng) {
    if (eng.instances.size || eng.keepTimer || eng !== ziaImgShared) {
      return;
    }
    eng.keepTimer = setTimeout(() => {
      eng.keepTimer = 0;
      if (eng.instances.size || eng !== ziaImgShared) {
        return;
      }
      ziaImgShared = null;
      if (eng.rafId) {
        cancelAnimationFrame(eng.rafId);
        eng.rafId = 0;
      }
      for (const [target, type, fn] of eng.listeners) {
        target.removeEventListener(type, fn, false);
      }
      eng.listeners = [];
      const gl = eng.gl;
      if (gl && !gl.isContextLost()) {
        if (eng.prog) {
          gl.deleteProgram(eng.prog);
        }
        if (eng.buf) {
          gl.deleteBuffer(eng.buf);
        }
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      eng.gl = null;
      eng.prog = null;
      eng.glCanvas.width = 1;
      eng.glCanvas.height = 1;
    }, ZIA_IMG_KEEP_GL_MS);
  }

  // the package's uniforms from a preset block (dist: It)
  function ziaImgApplyPreset(eng, inst) {
    const a = inst.preset;
    ziaImgU1(eng, "u_effect", a.effectIndex, true);
    ziaImgU1(eng, "u_speed", a.speed);
    ziaImgU1(eng, "u_intensity", a.intensity);
    ziaImgU1(eng, "u_scale", a.scale);
    ziaImgU1(eng, "u_direction", (a.direction * Math.PI) / 180);
    ziaImgU1(eng, "u_softness", a.softness);
    ziaImgU1(eng, "u_distortion", a.distortion);
    ziaImgU1(eng, "u_complexity", a.complexity);
    ziaImgU1(eng, "u_shape", a.shape);
    ziaImgU1(eng, "u_flicker", a.flicker ?? 0);
    ziaImgU1(eng, "u_vignette", a.vignette);
    ziaImgU1(eng, "u_vigOpacity", a.vigOpacity);
    ziaImgU1(eng, "u_blur", a.blur);
    ziaImgU1(eng, "u_highlight", a.highlight);
    ziaImgU1(eng, "u_shaderOpacity", a.shaderOpacity);
    ziaImgU1(eng, "u_dotMode", a.dotMode);
    ziaImgU1(eng, "u_sweepEase", a.sweepEase != null ? Math.floor(a.sweepEase) : 0, true);
    const o = a.dotMode === 1 ? a.pixelConfig : a.dotConfig;
    ziaImgU1(eng, "u_cellSize", o.cellSize);
    ziaImgU1(eng, "u_gap", o.gap);
    ziaImgU1(eng, "u_dotSize", o.dotSize);
    ziaImgU1(eng, "u_dotSoftness", o.dotSoftness);
    ziaImgU1(eng, "u_dotOpacity", o.dotOpacity);
    ziaImgU1(eng, "u_hlScale", o.hlScale);
    ziaImgU1(eng, "u_fillOpacity", o.fillOpacity);
    ziaImgU1(eng, "u_edgeFade", o.edgeFade);
    ziaImgU1(eng, "u_fadeStr", o.fadeStr);
    if (!inst.colors) {
      inst.colors = [];
      for (let s = 0; s < 7; s++) {
        inst.colors.push(ziaImgSlotColor(inst, s));
      }
      inst.colors.push(ziaImgParseColor(inst.cardBgOverride ?? a.cardBg));
    }
    for (let s = 0; s < 7; s++) {
      ziaImgUN(eng, `u_color${s + 1}`, inst.colors[s]);
      ziaImgU1(eng, `u_alpha${s + 1}`, a.alphas[s]);
    }
    ziaImgUN(eng, "u_cardBg", inst.colors[7]);
    inst.uniformsDirty = false;
  }

  // grows the GL canvas to the biggest loader showing (dist: lt)
  function ziaImgGrow(eng, also) {
    const pr = Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_DPR);
    if (pr !== eng.pixelRatio) {
      eng.pixelRatio = pr;
      eng.lastInstance = null;
    }
    let t = 0;
    let a = 0;
    for (const h of eng.instances) {
      if (h !== also && (!h.visible || h.paused)) {
        continue;
      }
      if (h.cssWidth > t) {
        t = h.cssWidth;
      }
      if (h.cssHeight > a) {
        a = h.cssHeight;
      }
    }
    if (t <= 0 || a <= 0) {
      return;
    }
    const n = eng.pixelRatio;
    const o = Math.max(1, Math.floor(t * n));
    const i = Math.max(1, Math.floor(a * n));
    const l = eng.glCanvas.width;
    const c = eng.glCanvas.height;
    if (o <= l && i <= c) {
      return;
    }
    const f = Math.max(t, l / Math.max(n, 1e-4));
    const s = Math.max(a, c / Math.max(n, 1e-4));
    eng.glCanvas.width = Math.floor(f * n);
    eng.glCanvas.height = Math.floor(s * n);
  }

  function ziaImgDraw(eng) {
    const gl = eng.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // one loader's frame: the shader into the shared canvas's bottom-left corner,
  // copied (nearest-neighbour) into the loader's own 2D canvas (dist: it)
  function ziaImgRender(eng, t, a) {
    if (!ziaImgGLOk(eng)) {
      return;
    }
    const gl = eng.gl;
    const n = Math.max(1, Math.floor(t.cssWidth * t.dpr));
    const o = Math.max(1, Math.floor(t.cssHeight * t.dpr));
    const vw = Math.round(Math.max(1, t.cssWidth) * eng.pixelRatio);
    const vh = Math.round(Math.max(1, t.cssHeight) * eng.pixelRatio);
    gl.viewport(0, 0, vw, vh);
    gl.scissor(0, 0, vw, vh);
    ziaImgUN(eng, "u_resolution", [n, o]);
    ziaImgU1(eng, "u_dpr", t.dpr || 1);
    if (eng.lastInstance !== t || t.uniformsDirty) {
      ziaImgApplyPreset(eng, t);
      eng.lastInstance = t;
    }
    ziaImgU1(eng, "u_time", t.accumulatedTime);
    ziaImgDraw(eng);
    const f = Math.max(1, Math.floor(t.cssWidth * t.canvasDpr));
    const s = Math.max(1, Math.floor(t.cssHeight * t.canvasDpr));
    if (t.canvas.width !== f || t.canvas.height !== s) {
      t.canvas.width = f;
      t.canvas.height = s;
    }
    t.ctx.clearRect(0, 0, f, s);
    const h = eng.glCanvas.height - o;
    t.ctx.imageSmoothingEnabled = false;
    t.ctx.drawImage(eng.glCanvas, 0, h, n, o, 0, 0, f, s);
    if (t.shownAtMs < 0) {
      t.shownAtMs = a;
    }
    t.reveal.afterShaderFrame(eng, t, a);
    if (t.reveal.isActive()) {
      eng.lastInstance = null;
    }
  }

  // a frame now, outside the loop (dist: Be)
  function ziaImgRenderNow(eng, inst) {
    if (inst.destroyed || !ziaImgGLOk(eng) || !inst.visible || inst.cssWidth < 1 || inst.cssHeight < 1) {
      return;
    }
    ziaImgGrow(eng, inst);
    ziaImgRender(eng, inst, performance.now());
  }

  // whether the loop has to draw this loader's shader (not while its image is
  // held over it, nor for a still or a crossfade)
  function ziaImgChurns(inst) {
    return (
      !inst.destroyed &&
      inst.visible &&
      !inst.paused &&
      !inst.reduced &&
      inst.cssWidth >= 1 &&
      inst.cssHeight >= 1 &&
      inst.reveal.churns()
    );
  }

  function ziaImgUpdateVisible(eng, inst) {
    const v = inst.inView && !document.hidden;
    if (v === inst.visible) {
      return;
    }
    inst.visible = v;
    if (v) {
      ziaImgRenderNow(eng, inst);
      ziaImgKick(eng);
    }
  }

  function ziaImgTryStart(eng, inst, now) {
    const p = inst.pending;
    // (a reveal asked for during a hide waits for it to finish)
    if (!p || inst.destroyed || inst.reveal.isActive()) {
      return;
    }
    if (inst.minChurnMs > 0 && (inst.shownAtMs < 0 || now - inst.shownAtMs < inst.minChurnMs)) {
      return;
    }
    inst.pending = null;
    inst.reveal.startReveal({
      image: p.image,
      simple: inst.reduced || !ziaImgGLOk(eng),
      onRevealComplete: p.onDone,
    });
    ziaImgKick(eng);
  }

  // the loop: crossfades every frame, shader frames under the fps cap (dist: st)
  function ziaImgTick(now) {
    const eng = ziaImgShared;
    if (!eng) {
      return;
    }
    eng.rafId = 0;
    let again = false;
    try {
      for (const inst of eng.instances) {
        if (inst.pending) {
          if (inst.shownAtMs < 0 && inst.visible && inst.cssWidth >= 1 && inst.cssHeight >= 1 && !ziaImgGLOk(eng)) {
            inst.shownAtMs = now;
          }
          ziaImgTryStart(eng, inst, now);
          if (inst.pending && inst.visible) {
            again = true;
          }
        }
        if (inst.reveal.stepSimple(now)) {
          again = true;
        }
      }
      const list = [];
      if (ziaImgGLOk(eng)) {
        for (const inst of eng.instances) {
          if (ziaImgChurns(inst)) {
            list.push(inst);
          }
        }
      }
      if (!list.length) {
        eng.churning = false;
      } else {
        again = true;
        if (!eng.churning) {
          eng.churning = true;
          eng.lastTickMs = now;
          eng.lastFrameMs = now;
        } else {
          const t = now - eng.lastFrameMs;
          if (t >= ZIA_IMG_FRAME_MS) {
            eng.lastFrameMs = now - (t % ZIA_IMG_FRAME_MS);
            const a = (now - eng.lastTickMs) / 1e3;
            eng.lastTickMs = now;
            for (const inst of list) {
              inst.accumulatedTime += a;
            }
            ziaImgGrow(eng, null);
            for (const inst of list) {
              const d = Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_DPR);
              if (inst.dpr !== d) {
                inst.dpr = d;
                inst.canvasDpr = Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_CANVAS_DPR);
              }
              if (!inst.destroyed) {
                try {
                  ziaImgRender(eng, inst, now);
                } catch (err) {
                  if (!eng.warned) {
                    eng.warned = true;
                    console.error("ziaImgFx: frame failed", err);
                  }
                }
              }
            }
          }
        }
      }
    } finally {
      if (again && eng === ziaImgShared && !eng.rafId) {
        eng.rafId = requestAnimationFrame(ziaImgTick);
      }
    }
  }

  // starts the loop if it's stopped (dist: Ee)
  function ziaImgKick(eng) {
    if (!eng || eng !== ziaImgShared || eng.rafId) {
      return;
    }
    eng.lastTickMs = performance.now();
    eng.lastFrameMs = eng.lastTickMs;
    eng.churning = ziaImgGLOk(eng) && [...eng.instances].some(ziaImgChurns);
    eng.rafId = requestAnimationFrame(ziaImgTick);
  }

  // ---- the reveal (dist: Qe, he, ct, ut, ft, Xt, jt, aa)

  // object-fit: cover, less a 0.6% inset on each side (dist: Qe)
  function ziaImgCoverRect(e, t, a) {
    const n = t / Math.max(1, a);
    const o = e.width / Math.max(1, e.height);
    let i = 0;
    let l = 0;
    let c = e.width;
    let f = e.height;
    if (o > n) {
      c = e.height * n;
      i = (e.width - c) / 2;
    } else {
      f = e.width / n;
      l = (e.height - f) / 2;
    }
    const s = Math.min(c, f) * ZIA_IMG_COVER_INSET;
    if (c - 2 * s > 1 && f - 2 * s > 1) {
      i += s;
      l += s;
      c -= 2 * s;
      f -= 2 * s;
    }
    return { sx: i, sy: l, sw: c, sh: f };
  }

  // the image, cover-fitted at the canvas's size, cached (dist: he)
  function ziaImgCover(e, a, n, o) {
    let i = e.coverA;
    if (!i) {
      const l = ziaImgEl("canvas");
      i = e.coverA = { canvas: l, ctx: l.getContext("2d"), img: null, w: 0, h: 0 };
    }
    if (i.img !== a || i.w !== n || i.h !== o) {
      i.canvas.width = n;
      i.canvas.height = o;
      i.w = n;
      i.h = o;
      i.img = a;
      const { sx: l, sy: c, sw: f, sh: s } = ziaImgCoverRect(a, n, o);
      i.ctx.clearRect(0, 0, n, o);
      i.ctx.imageSmoothingEnabled = true;
      i.ctx.imageSmoothingQuality = "high";
      i.ctx.drawImage(a, l, c, f, s, 0, 0, n, o);
    }
    return i.canvas;
  }

  function ziaImgRevealTiming(e) {
    const t = e.revealConfig;
    return e.dotMode === 2
      ? { duration: Math.max(0.05, t.dotDuration), easingKey: t.dotEasing }
      : { duration: Math.max(0.05, t.duration), easingKey: t.easing };
  }

  function ziaImgEnsureSample(e, t) {
    if (!e.sampleCanvas) {
      e.sampleCanvas = ziaImgEl("canvas");
      e.sampleCtx = e.sampleCanvas.getContext("2d", { willReadFrequently: true });
    }
    if (e.sampleCanvas.width !== t || e.sampleCanvas.height !== t) {
      e.sampleCanvas.width = t;
      e.sampleCanvas.height = t;
      e.sampleImgData = null;
      e.sampleDataCache = null;
      e.sampleFrameCounter = 0;
    }
    if (!e.maskGrad) {
      e.maskGrad = ziaImgEl("canvas");
      e.maskGradCtx = e.maskGrad.getContext("2d");
    }
    if (e.maskGrad.width !== t || e.maskGrad.height !== t) {
      e.maskGrad.width = t;
      e.maskGrad.height = t;
      e.maskImgData = null;
    }
    if (!e.maskImgData && e.maskGradCtx) {
      e.maskImgData = e.maskGradCtx.createImageData(t, t);
    }
  }

  // the shader re-rendered smooth (no mosaic), shrunk to o x o and read back:
  // the colour field the dissolve mask is made from (dist: ft)
  function ziaImgSampleShader(e, eng, a, n, o) {
    const prevMode = eng.uv.u_dotMode;
    const prevFill = eng.uv.u_fillOpacity;
    const c = a.preset.dotMode;
    const f = c < 1.5 ? 0 : 1;
    ziaImgU1(eng, "u_dotMode", f);
    ziaImgU1(eng, "u_fillOpacity", f > 0.5 ? (c === 1 ? a.preset.pixelConfig.fillOpacity : a.preset.dotConfig.fillOpacity) : 0);
    ziaImgDraw(eng);
    const s = Math.max(1, Math.floor(a.cssWidth * a.dpr));
    const h = Math.max(1, Math.floor(a.cssHeight * a.dpr));
    const u = Math.max(0, eng.glCanvas.height - h);
    if (!e.sampleGpuCanvas) {
      e.sampleGpuCanvas = ziaImgEl("canvas");
      e.sampleGpuCtx = e.sampleGpuCanvas.getContext("2d");
    }
    const g = e.sampleGpuCanvas;
    const m = e.sampleGpuCtx;
    if (g.width !== o || g.height !== o) {
      g.width = o;
      g.height = o;
    }
    m.clearRect(0, 0, o, o);
    m.drawImage(eng.glCanvas, 0, u, s, h, 0, 0, o, o);
    n.clearRect(0, 0, o, o);
    n.drawImage(g, 0, 0);
    ziaImgU1(eng, "u_dotMode", prevMode);
    ziaImgU1(eng, "u_fillOpacity", prevFill);
    e.sampleImgData = n.getImageData(0, 0, o, o);
    e.sampleDataCache = e.sampleImgData.data;
    return e.sampleDataCache;
  }

  // the cell hash (dist: inside Xt / ta)
  function ziaImgHash(U, z) {
    const q = Math.sin(U * 127.1 + z * 17.23) * 43758.5453;
    return q - Math.floor(q);
  }

  // one dissolve frame into the overlay (dist: Xt)
  function ziaImgRevealFrame(e, eng, a, n) {
    if (!e.image) {
      return;
    }
    const o = a.preset;
    const i = a.canvas.width;
    const l = a.canvas.height;
    if (n.canvas.width !== i || n.canvas.height !== l) {
      n.canvas.width = i;
      n.canvas.height = l;
    }
    n.clearRect(0, 0, i, l);
    const { duration: c, easingKey: f } = ziaImgRevealTiming(o);
    const s = (performance.now() - e.revealStartMs) / 1e3;
    const h = Math.min(s / c, 1);
    const u = ziaImgEase(f, h);
    const g = e.image;
    const I = o.revealConfig.blur;
    const filter = h < 1 && I > 0 && I * (1 - u) > 0.1 ? `blur(${(I * (1 - u)).toFixed(1)}px)` : "none";
    if (n.canvas.style.filter !== filter) {
      n.canvas.style.filter = filter;
    }
    if (h >= 1) {
      n.imageSmoothingEnabled = true;
      n.imageSmoothingQuality = "high";
      n.drawImage(ziaImgCover(e, g, i, l), 0, 0);
      return;
    }
    const w = o.dotMode === 2 ? ZIA_IMG_SAMPLE_DOTS : ZIA_IMG_SAMPLE;
    ziaImgEnsureSample(e, w);
    const M = o.revealConfig.maskShape;
    const d = o.revealConfig.softness;
    const x = M.startsWith("shader");
    let C = null;
    let y = null;
    if (x) {
      const T = e.sampleFrameCounter++;
      C = e.sampleDataCache == null || (T & 1) === 0 ? ziaImgSampleShader(e, eng, a, e.sampleCtx, w) : e.sampleDataCache;
      if (ZIA_IMG_MASK_SLOT[M] != null) {
        // (the package reads the preset colour here even under a colors
        // override; with Zia's palette the dissolve follows the re-tinted
        // slot instead, or every cell would reveal in the same last third)
        y = ziaImgSlotColor(a, ZIA_IMG_MASK_SLOT[M]);
      }
    }
    const _ = 1 - u * (1 + d);
    const W = M === "gradientSweep";
    let j = 0;
    let S = 0;
    let G = 2;
    const V = o.flicker ?? 0;
    let ae = null;
    let H = null;
    let R = 0;
    let X = 0;
    let A = 0;
    if (V > 3e-3) {
      G = Math.max(2, Math.floor(6 + o.pixelConfig.cellSize * 74));
      const T = a.accumulatedTime * Math.max(o.speed, 2) * 1.6;
      const Z = Math.floor(T);
      R = Z % 1024;
      X = (R + 1) % 1024;
      A = T - Z;
      A = A * A * (3 - 2 * A);
      H = ziaImgHash;
      const E = G * G;
      if (!e.gsFlickerTable || e.gsFlickerTable.length !== E) {
        e.gsFlickerTable = new Float32Array(E);
      }
      ae = e.gsFlickerTable;
      for (let U = 0; U < E; U++) {
        const z = ziaImgHash(U, R) * (1 - A) + ziaImgHash(U, X) * A;
        ae[U] = (z - 0.5) * V * 1.6;
      }
    }
    if (W) {
      j = 0.9 / Math.max(o.scale, 0.25);
      S = -j + u * (1 + 2 * j);
    }
    const ce = e.maskImgData.data;
    for (let T = 0; T < w; T++) {
      for (let Z = 0; Z < w; Z++) {
        let N;
        if (x && C) {
          const z = (T * w + Z) * 4;
          const q = C[z] / 255;
          const se = C[z + 1] / 255;
          const r = C[z + 2] / 255;
          if (y) {
            const D = q - y[0];
            const K = se - y[1];
            const le = r - y[2];
            N = Math.exp(-8 * (D * D + K * K + le * le));
          } else {
            N = (C[z] * 0.299 + C[z + 1] * 0.587 + C[z + 2] * 0.114) / 255;
          }
        } else {
          // (the package's geometric masks, dist: Qt, aren't used by any preset)
          N = W ? 0 : -1;
        }
        let E;
        if (W) {
          const z = Z / (w - 1);
          const q = T / (w - 1);
          const se = (z + q) * 0.5;
          E = (S + j - se) / (2 * j);
        } else {
          E = (N - _) / d;
        }
        if (ae && E > -0.5 && E < 1.5) {
          const z = E < 0 ? 0 : E > 1 ? 1 : E;
          const q = z * (1 - z) * 4;
          if (q > 1e-3) {
            const se = Z / (w - 1);
            const r = T / (w - 1);
            // (on the last row this indexes past the table, as in the package:
            // NaN, so those mask pixels go clear while the band crosses them)
            const D = Math.floor(r * G) * G + Math.floor(se * G);
            E += ae[D] * q;
          }
        }
        if (E < 0) {
          E = 0;
        } else if (E > 1) {
          E = 1;
        }
        E = E * E * (3 - 2 * E);
        const U = (T * w + Z) * 4;
        ce[U] = 255;
        ce[U + 1] = 255;
        ce[U + 2] = 255;
        ce[U + 3] = (E * 255 + 0.5) | 0;
      }
    }
    e.maskGradCtx.putImageData(e.maskImgData, 0, 0);
    if (o.dotMode === 1) {
      // the gradient sweep's mask already flickers along its band, so its dissolve doesn't
      ziaImgPixelReveal(e, n, g, o, s, i, l, a, W ? 0 : V, H, R, X, A);
    } else {
      // (dotMode 2's pixel reveal, dist: $t, isn't used by any preset)
      n.imageSmoothingEnabled = true;
      n.imageSmoothingQuality = "high";
      n.drawImage(ziaImgCover(e, g, i, l), 0, 0);
      n.globalCompositeOperation = "destination-in";
      n.drawImage(e.maskGrad, 0, 0, i, l);
      n.globalCompositeOperation = "source-over";
    }
  }

  // the image in cells: each cell pixelated until its random moment, then
  // sharp, and the whole masked cell by cell (dist: jt)
  function ziaImgPixelReveal(e, t, a, c, f, s, h, u, g, m, v, b, P) {
    const w = 6 + c.pixelConfig.cellSize * 74;
    const oe = Math.max(1, u.cssWidth);
    const ie = Math.max(1, u.cssHeight);
    const F = Math.max(2, Math.floor((w * oe) / ZIA_IMG_REF_DIM));
    const M = Math.max(2, Math.floor((w * ie) / ZIA_IMG_REF_DIM));
    const d = F * M;
    const x = Math.max(0.05, c.revealConfig.pixDuration);
    const C = Math.max(0, Math.min(1, f / x));
    const y = ziaImgEase(c.revealConfig.pixEasing, C);
    if (!e.pixCanvas) {
      e.pixCanvas = ziaImgEl("canvas");
      e.pixCtx = e.pixCanvas.getContext("2d");
    }
    const k = e.pixCanvas;
    const _ = e.pixCtx;
    if (k.width !== F || k.height !== M) {
      k.width = F;
      k.height = M;
    }
    if (!e.pixDrop) {
      e.pixDrop = ziaImgEl("canvas");
      e.pixDropCtx = e.pixDrop.getContext("2d");
    }
    const W = e.pixDrop;
    const j = e.pixDropCtx;
    if (W.width !== F || W.height !== M || !e.pixDropImgData) {
      W.width = F;
      W.height = M;
      e.pixDropImgData = j.createImageData(F, M);
      const R = e.pixDropImgData.data;
      for (let X = 0; X < R.length; X += 4) {
        R[X] = 255;
        R[X + 1] = 255;
        R[X + 2] = 255;
      }
    }
    const S = 0.07;
    const G = 1 / (2 * S);
    if (!e.pixDropPattern || e.pixDropPatternW !== F || e.pixDropPatternH !== M || e.pixDropRevealStart !== e.revealStartMs) {
      e.pixDropPattern = new Float32Array(d);
      const R = S;
      const X = 1 - 2 * S;
      for (let A = 0; A < e.pixDropPattern.length; A++) {
        e.pixDropPattern[A] = R + Math.random() * X;
      }
      e.pixDropPatternW = F;
      e.pixDropPatternH = M;
      e.pixDropRevealStart = e.revealStartMs;
    }
    const V = e.pixDropImgData.data;
    const ae = e.pixDropPattern;
    const H = g > 3e-3 && m != null;
    for (let R = 0; R < ae.length; R++) {
      const X = ae[R];
      let A = 0.5 + (X - y) * G;
      A = A < 0 ? 0 : A > 1 ? 1 : A;
      if (H) {
        const pe = 1 - Math.abs(y - X) * 6.25;
        if (pe > 0) {
          const ce = m(R, v) * (1 - P) + m(R, b) * P;
          A += (ce - 0.5) * g * 1.6 * pe;
          A = A < 0 ? 0 : A > 1 ? 1 : A;
        }
      }
      V[R * 4 + 3] = (A * 255 + 0.5) | 0;
    }
    j.putImageData(e.pixDropImgData, 0, 0);
    const cover = ziaImgCover(e, a, s, h);
    _.globalCompositeOperation = "source-over";
    _.clearRect(0, 0, F, M);
    _.imageSmoothingEnabled = true;
    _.imageSmoothingQuality = "high";
    _.drawImage(cover, 0, 0, s, h, 0, 0, F, M);
    _.globalCompositeOperation = "destination-in";
    _.imageSmoothingEnabled = false;
    _.drawImage(W, 0, 0);
    _.globalCompositeOperation = "source-over";
    t.imageSmoothingEnabled = true;
    t.imageSmoothingQuality = "high";
    t.drawImage(cover, 0, 0);
    t.imageSmoothingEnabled = false;
    t.drawImage(k, 0, 0, F, M, 0, 0, s, h);
    t.imageSmoothingEnabled = true;
    _.globalCompositeOperation = "source-over";
    _.clearRect(0, 0, F, M);
    _.imageSmoothingEnabled = true;
    _.imageSmoothingQuality = "high";
    _.drawImage(e.maskGrad, 0, 0, F, M);
    t.imageSmoothingEnabled = false;
    t.globalCompositeOperation = "destination-in";
    t.drawImage(k, 0, 0, F, M, 0, 0, s, h);
    t.imageSmoothingEnabled = true;
    t.globalCompositeOperation = "source-over";
  }

  // the overlay's state machine: idle -> reveal -> hold -> hide -> idle (dist: aa).
  // "simple" runs a reveal / hide as a plain crossfade, every frame: for
  // reduced motion, and when there's no WebGL
  function ziaImgCreateReveal(inst, canvas, setShaderOpacity) {
    const t = canvas.getContext("2d");
    // the two canvases' fade levels now, so a hide starts from wherever the
    // dissolve had got to (from the hold, as in the package: 0 and 1)
    let shaderLevel = 1;
    let overlayLevel = 1;
    const setShader = (v) => {
      shaderLevel = v;
      setShaderOpacity(v);
    };
    const setOverlay = (v) => {
      overlayLevel = v;
      ziaImgOpacity(t.canvas, v);
    };
    const a = {
      active: false,
      phase: "idle",
      simple: false,
      revealStartMs: 0,
      holdStartMs: 0,
      hideStartMs: 0,
      hideDurationMs: ZIA_IMG_HIDE_MS,
      hideShaderFrom: 0,
      hideOverlayFrom: 1,
      image: null,
      onRevealComplete: null,
      sampleCanvas: null,
      sampleCtx: null,
      sampleImgData: null,
      sampleDataCache: null,
      sampleFrameCounter: 0,
      maskGrad: null,
      maskGradCtx: null,
      maskImgData: null,
      gsFlickerTable: null,
      pixCanvas: null,
      pixCtx: null,
      pixDrop: null,
      pixDropCtx: null,
      pixDropImgData: null,
      pixDropPattern: null,
      pixDropPatternW: 0,
      pixDropPatternH: 0,
      pixDropRevealStart: -1,
      coverA: null,
      holdPaintedImg: null,
      holdPaintedW: 0,
      holdPaintedH: 0,
      sampleGpuCanvas: null,
      sampleGpuCtx: null,
    };

    function done() {
      const cb = a.onRevealComplete;
      a.onRevealComplete = null;
      if (cb) {
        try {
          cb();
        } catch (err) {
          console.error(err);
        }
      }
    }

    // the whole image, as the hold phase paints it
    function paintFull() {
      const m = Math.max(1, Math.floor(inst.cssWidth * inst.canvasDpr));
      const v = Math.max(1, Math.floor(inst.cssHeight * inst.canvasDpr));
      if (t.canvas.width !== m || t.canvas.height !== v) {
        t.canvas.width = m;
        t.canvas.height = v;
        a.holdPaintedImg = null;
      }
      if (t.canvas.style.filter !== "none") {
        t.canvas.style.filter = "none";
      }
      if (a.holdPaintedImg !== a.image || a.holdPaintedW !== m || a.holdPaintedH !== v) {
        t.clearRect(0, 0, m, v);
        t.globalCompositeOperation = "source-over";
        t.globalAlpha = 1;
        t.imageSmoothingEnabled = true;
        t.imageSmoothingQuality = "high";
        t.drawImage(ziaImgCover(a, a.image, m, v), 0, 0);
        a.holdPaintedImg = a.image;
        a.holdPaintedW = m;
        a.holdPaintedH = v;
      }
    }

    function endHide() {
      a.active = false;
      a.phase = "idle";
      a.simple = false;
      setOverlay(1);
      t.clearRect(0, 0, t.canvas.width, t.canvas.height);
      setShader(1);
      a.image = null;
      a.coverA = null;
      a.holdPaintedImg = null;
    }

    return {
      afterShaderFrame(eng, c, f) {
        if (!a.active) {
          if (t.canvas.style.filter && t.canvas.style.filter !== "none") {
            t.canvas.style.filter = "none";
          }
          return;
        }
        if (a.simple) {
          return;
        }
        const { duration: s, easingKey: h } = ziaImgRevealTiming(c.preset);
        if (a.phase === "reveal" && a.image) {
          const g = (f - a.revealStartMs) / 1e3;
          const m = Math.min(g / s, 1);
          const v = ziaImgEase(h, m);
          setShader(1 - v);
          ziaImgRevealFrame(a, eng, c, t);
          if (m >= 1) {
            a.phase = "hold";
            a.holdStartMs = f;
            setShader(0);
            done();
          }
        } else if (a.phase === "hold" && a.image) {
          paintFull();
          setShader(0);
        } else if (a.phase === "hide") {
          const g = f - a.hideStartMs;
          const m = Math.min(g / Math.max(1, a.hideDurationMs), 1);
          setOverlay(a.hideOverlayFrom * (1 - m));
          setShader(a.hideShaderFrom + (1 - a.hideShaderFrom) * m);
          if (m >= 1) {
            endHide();
          }
        }
      },
      // the reduced-motion / no-WebGL crossfades; true while one runs
      stepSimple(now) {
        if (!a.active || !a.simple) {
          return false;
        }
        if (a.phase === "reveal") {
          if (inst.cssWidth < 1 || inst.cssHeight < 1) {
            return true;
          }
          paintFull();
          const k = Math.min(1, (now - a.revealStartMs) / ZIA_IMG_FADE_MS);
          setOverlay(k);
          setShader(1 - k);
          if (k >= 1) {
            a.phase = "hold";
            a.holdStartMs = now;
            setShader(0);
            done();
            return false;
          }
          return true;
        }
        if (a.phase === "hide") {
          const m = Math.min((now - a.hideStartMs) / Math.max(1, a.hideDurationMs), 1);
          setOverlay(a.hideOverlayFrom * (1 - m));
          setShader(a.hideShaderFrom + (1 - a.hideShaderFrom) * m);
          if (m >= 1) {
            endHide();
            return false;
          }
          return true;
        }
        return false;
      },
      startReveal(l) {
        a.image = l.image;
        a.onRevealComplete = l.onRevealComplete || null;
        a.revealStartMs = performance.now();
        a.phase = "reveal";
        a.active = true;
        a.simple = !!l.simple;
        a.sampleFrameCounter = 0;
        a.sampleDataCache = null;
        a.holdPaintedImg = null;
        setOverlay(a.simple ? 0 : 1);
      },
      startHide(ms, simple) {
        if (!a.active || a.phase === "hide") {
          return false;
        }
        a.hideStartMs = performance.now();
        // (the package jumps the shader to 0 here even mid-dissolve: a pop)
        a.hideShaderFrom = shaderLevel;
        a.hideOverlayFrom = overlayLevel;
        if (a.phase === "hold") {
          // the package's loop kept the (hidden) shader's clock running while
          // the image was held; this one skips those frames, so it catches up
          inst.accumulatedTime += Math.max(0, a.hideStartMs - a.holdStartMs) / 1e3;
        }
        a.phase = "hide";
        a.hideDurationMs = ms;
        if (simple) {
          a.simple = true;
        }
        return true;
      },
      // jumps a running dissolve to its end, or a hide to idle
      finishNow() {
        if (!a.active || !a.image) {
          if (a.active && a.phase === "hide") {
            endHide();
          }
          return;
        }
        if (a.phase === "reveal") {
          a.simple = true;
          a.phase = "hold";
          a.holdStartMs = performance.now();
          setOverlay(1);
          paintFull();
          setShader(0);
          done();
        } else if (a.phase === "hide") {
          endHide();
        }
      },
      repaintHold() {
        if (a.active && a.phase === "hold" && a.image && inst.cssWidth >= 1 && inst.cssHeight >= 1) {
          paintFull();
        }
      },
      churns() {
        return !(a.active && (a.simple || a.phase === "hold"));
      },
      isActive() {
        return a.active;
      },
      phase() {
        return a.phase;
      },
      dispose() {
        a.active = false;
        a.phase = "idle";
        a.onRevealComplete = null;
        for (const key of Object.keys(a)) {
          if (a[key] && typeof a[key] === "object") {
            a[key] = null;
          }
        }
      },
    };
  }

  // a copy of the source's pixels now, so a later redraw of it can't change the reveal
  function ziaImgSnapshot(src) {
    if (!src) {
      return null;
    }
    let w = 0;
    let h = 0;
    if (src.localName === "img") {
      if (!src.complete) {
        return null;
      }
      w = src.naturalWidth;
      h = src.naturalHeight;
    } else if (src.localName === "video") {
      w = src.videoWidth;
      h = src.videoHeight;
    } else {
      w = src.width;
      h = src.height;
    }
    w = Math.floor(w);
    h = Math.floor(h);
    if (!(w > 0 && h > 0)) {
      return null;
    }
    const c = ziaImgEl("canvas");
    c.width = w;
    c.height = h;
    try {
      c.getContext("2d").drawImage(src, 0, 0, w, h);
    } catch (err) {
      return null;
    }
    return c;
  }

  function ziaImgFx(host, opts) {
    opts = opts || {};
    if (!host || !host.ownerDocument) {
      throw new TypeError("ziaImgFx: needs a host element");
    }
    const eng = ziaImgEngine();
    const name = Object.hasOwn(ZIA_IMG_PRESETS, opts.preset) ? opts.preset : "pixels-organic";
    const fixedRadius = Number.isFinite(opts.radius) ? Math.max(0, opts.radius) : null;
    let dark = opts.dark !== false;
    // (the preset with its dissolve stretched or squeezed to revealSeconds)
    const tuned = (preset) => {
      const want = Number(opts.revealSeconds);
      const r = preset.revealConfig;
      if (!(want > 0) || !r?.duration) {
        return preset;
      }
      const k = want / r.duration;
      return { ...preset, revealConfig: { ...r, duration: want, pixDuration: r.pixDuration * k, dotDuration: r.dotDuration * k } };
    };

    const layer = ziaImgEl("div");
    layer.className = "zia-imgfx";
    layer.setAttribute("aria-hidden", "true");
    const shaderCanvas = ziaImgEl("canvas");
    shaderCanvas.className = "zia-imgfx-shader";
    const overlay = ziaImgEl("canvas");
    overlay.className = "zia-imgfx-overlay";
    layer.append(shaderCanvas, overlay);

    // over a replaced element (Zia's thumbnail <canvas>): its next sibling, on
    // its box; anything else: inside it, filling it
    const over = ZIA_IMG_REPLACED.test(host.localName || "");
    let hostPosition = null;
    if (over) {
      layer.setAttribute("zia-imgfx-over", "");
      host.after(layer);
    } else {
      if (getComputedStyle(host).position === "static") {
        hostPosition = host.style.position;
        host.style.position = "relative";
      }
      host.appendChild(layer);
    }

    const inst = {
      canvas: shaderCanvas,
      ctx: shaderCanvas.getContext("2d"),
      cssWidth: 0,
      cssHeight: 0,
      dpr: Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_DPR),
      canvasDpr: Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_CANVAS_DPR),
      preset: tuned(ZIA_IMG_PRESETS[name].modes[dark ? "dark" : "light"]),
      cardBgOverride: typeof opts.cardBg === "string" && opts.cardBg ? opts.cardBg : null,
      palette: Array.isArray(opts.palette) ? opts.palette.slice() : null,
      colorsOverride: null,
      colors: null,
      strength: Math.max(0, Math.min(1, Number.isFinite(opts.strength) ? opts.strength : 1)),
      inView: true,
      visible: !document.hidden,
      paused: false,
      reduced: !!eng.reduceQuery?.matches,
      uniformsDirty: true,
      reveal: null,
      accumulatedTime: Math.random() * 1e3,
      shownAtMs: -1,
      pending: null,
      minChurnMs: Math.max(0, Number(opts.minChurnMs) || 0),
      destroyed: false,
    };
    inst.colorsOverride = inst.palette && ziaImgRetint(inst.preset, inst.palette);
    // strength is the shader canvas's opacity, under the reveal's own fade
    const setShaderOpacity = (v) => ziaImgOpacity(shaderCanvas, v * inst.strength);
    setShaderOpacity(1);
    inst.reveal = ziaImgCreateReveal(inst, overlay, setShaderOpacity);

    const paintCard = () => {
      layer.style.backgroundColor = inst.cardBgOverride ?? inst.preset.cardBg;
    };
    paintCard();

    let radius = -1;
    function sync() {
      if (inst.destroyed) {
        return;
      }
      let w;
      let h;
      if (over) {
        // (its padding box, inside its borders: a thumbnail's bottom rule stays visible)
        w = host.clientWidth;
        h = host.clientHeight;
        layer.style.left = `${host.offsetLeft + host.clientLeft}px`;
        layer.style.top = `${host.offsetTop + host.clientTop}px`;
        layer.style.width = `${w}px`;
        layer.style.height = `${h}px`;
      } else {
        w = host.clientWidth;
        h = host.clientHeight;
      }
      let r = fixedRadius;
      if (r == null) {
        const value = getComputedStyle(host).borderTopLeftRadius;
        const n = parseFloat(value);
        r = Number.isFinite(n) && n > 0 ? (value.endsWith("%") ? (n / 100) * Math.min(w, h) : n) : 0;
      }
      if (r !== radius) {
        radius = r;
        layer.style.borderRadius = `${r}px`;
      }
      const d = Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_DPR);
      if (w === inst.cssWidth && h === inst.cssHeight && d === inst.dpr) {
        return;
      }
      inst.cssWidth = w;
      inst.cssHeight = h;
      inst.dpr = d;
      inst.canvasDpr = Math.min(window.devicePixelRatio || 1, ZIA_IMG_MAX_CANVAS_DPR);
      if (w >= 1 && h >= 1) {
        if (!ziaImgGLOk(eng) && inst.shownAtMs < 0 && inst.visible) {
          inst.shownAtMs = performance.now();
        }
        ziaImgRenderNow(eng, inst);
        inst.reveal.repaintHold();
      }
      ziaImgKick(eng);
    }

    const ro = new ResizeObserver(sync);
    ro.observe(host);
    let io = null;
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(
        (entries) => {
          inst.inView = entries[entries.length - 1].isIntersecting;
          ziaImgUpdateVisible(eng, inst);
        },
        { rootMargin: "64px" },
      );
      io.observe(layer);
    }
    eng.instances.add(inst);
    sync();
    ziaImgKick(eng);

    return {
      element: layer,
      // dissolves into a snapshot of source (canvas, ImageBitmap, loaded <img>),
      // then holds it; false if it can't (nothing to show, or an image is
      // already dissolving in or shown: as the package, hide() first). Asked
      // during a hide, it starts when the hide ends; asked again before it
      // starts (minChurnMs), the newer source replaces the older
      reveal(source, options) {
        if (inst.destroyed || (inst.reveal.isActive() && inst.reveal.phase() !== "hide")) {
          return false;
        }
        const image = ziaImgSnapshot(source);
        if (!image) {
          return false;
        }
        inst.pending = { image, onDone: options && typeof options.onDone === "function" ? options.onDone : null };
        sync();
        ziaImgTryStart(eng, inst, performance.now());
        ziaImgKick(eng);
        return true;
      },
      hide() {
        if (inst.destroyed) {
          return;
        }
        inst.pending = null;
        // (the shader canvas sits at opacity 0 while held: the loop draws a
        // fresh frame before it fades back in)
        inst.reveal.startHide(ZIA_IMG_HIDE_MS, inst.reduced || !ziaImgGLOk(eng));
        ziaImgKick(eng);
      },
      setDark(value) {
        if (inst.destroyed || !!value === dark) {
          return;
        }
        dark = !!value;
        inst.preset = tuned(ZIA_IMG_PRESETS[name].modes[dark ? "dark" : "light"]);
        inst.colorsOverride = inst.palette && ziaImgRetint(inst.preset, inst.palette);
        inst.colors = null;
        inst.uniformsDirty = true;
        paintCard();
        ziaImgRenderNow(eng, inst);
      },
      destroy() {
        if (inst.destroyed) {
          return;
        }
        inst.destroyed = true;
        inst.pending = null;
        ro.disconnect();
        io?.disconnect();
        eng.instances.delete(inst);
        if (eng.lastInstance === inst) {
          eng.lastInstance = null;
        }
        inst.reveal.dispose();
        layer.remove();
        if (hostPosition !== null) {
          host.style.position = hostPosition;
        }
        ziaImgRelease(eng);
      },
    };
  }
