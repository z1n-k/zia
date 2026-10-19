/*
 * metal.js: liquid metal lettering for Zia (window.ziaMetalText)
 *
 * A framework-free port of metal-fx 2.0.11's MetalText (https://libraries.dev,
 * "Liquid metal"; the npm package "metal-fx" by Jakub Antalik). The shaders,
 * the "chromatic" preset's dark tuning, the MetalText defaults, the shared
 * renderer (one small WebGL2 canvas, a crop of it copied into each instance at
 * about 15 fps), the glyph mask, the inner-shadow rim and the optional halo
 * are the package's, constant for constant. React is replaced by plain DOM and
 * one shared requestAnimationFrame loop. What changed and why is in NOTES.md
 * next to this file.
 *
 * metal-fx is MIT licensed:
 *
 *   MIT License
 *
 *   Copyright (c) 2026 Jakub Antalik
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software and associated documentation files (the "Software"), to deal
 *   in the Software without restriction, including without limitation the rights
 *   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *   SOFTWARE.
 *
 * The package's NOTICE, which applies to the two shaders below:
 *
 *   metal-fx
 *   Copyright (c) Jakub Antalik
 *
 *   This product includes software developed by Paper Design, Inc.
 *
 *     Paper Shaders (https://github.com/paper-design/shaders)
 *     Copyright (c) Paper Design, Inc.
 *     Licensed under the Apache License, Version 2.0
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *   The `liquidMetal` fragment shader is consumed unmodified from the
 *   `@paper-design/shaders` npm package; the sizing vertex shader is copied
 *   verbatim from `packages/shaders/src/vertex-shader.ts` @ 0.0.80. No changes
 *   were made to either shader's source (nor are any made here).
 *
 * Use (a classic script; no modules, no eval):
 *
 *   const metal = ziaMetalText(document.querySelector(".mark"), { strength: 0.9 });
 *   metal.setPaused(true); metal.refresh(); metal.destroy();
 *
 * The element keeps its text: the text nodes move into an inline-flex wrapper
 * (as <MetalText> renders them), the metal is painted over them inside the
 * glyphs, and destroy() puts the same nodes back. Options, all optional:
 *   strength      0..1, default 0.9 (MetalText multiplies it with metalOpacity)
 *   color         base text colour under the metal; default: the element's
 *   font          CSS `font` shorthand; default: the element's
 *   letterSpacing CSS length or px number; default: the element's
 *   paused        start paused (also forced by prefers-reduced-motion: reduce)
 *   and, as in MetalText: metalOpacity (0.62), shaderScale (2.8),
 *   innerShadow ({ offsetY: 1, blur: 0.5, alpha: 0.9 }, null for none),
 *   glow (false: "the design has none") and glowGain (2.5).
 * Without WebGL2 the element is left alone and the handle does nothing.
 * Nothing here throws.
 */
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (typeof window.ziaMetalText === "function") return;

  const XHTML_NS = "http://www.w3.org/1999/xhtml";

  // Shared GLSL pieces (Paper Shaders), copied verbatim from metal-fx's dist.
  const GLSL_DEFINES = `
#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846
`;
  const GLSL_ROTATE = `
vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}
`;
  const GLSL_GRAIN = `
  color += 1. / 256. * (fract(sin(dot(.014 * gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123) - .5);
`;
  const GLSL_SNOISE = `
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;
  // Paper Shaders' liquidMetal fragment shader, as metal-fx inlines it.
  const FRAG_SHADER = `#version 300 es
precision mediump float;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform vec2 u_resolution;
uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colorTint;

uniform float u_softness;
uniform float u_repetition;
uniform float u_shiftRed;
uniform float u_shiftBlue;
uniform float u_distortion;
uniform float u_contour;
uniform float u_angle;

uniform float u_shape;
uniform bool u_isImage;

in vec2 v_objectUV;
in vec2 v_responsiveUV;
in vec2 v_responsiveBoxGivenSize;
in vec2 v_imageUV;

out vec4 fragColor;

${GLSL_DEFINES}
${GLSL_ROTATE}
${GLSL_SNOISE}

float getColorChanges(float c1, float c2, float stripe_p, vec3 w, float blur, float bump, float tint) {

  float ch = mix(c2, c1, smoothstep(.0, 2. * blur, stripe_p));

  float border = w[0];
  ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

  if (u_isImage == true) {
    bump = smoothstep(.2, .8, bump);
  }
  border = w[0] + .4 * (1. - bump) * w[1];
  ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + .5 * (1. - bump) * w[1];
  ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + w[1];
  ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

  float gradient_t = (stripe_p - w[0] - w[1]) / w[2];
  float gradient = mix(c1, c2, smoothstep(0., 1., gradient_t));
  ch = mix(ch, gradient, smoothstep(border, border + .5 * blur, stripe_p));

  // Tint color is applied with color burn blending
  ch = mix(ch, 1. - min(1., (1. - ch) / max(tint, 0.0001)), u_colorTint.a);
  return ch;
}

float getImgFrame(vec2 uv, float th) {
  float frame = 1.;
  frame *= smoothstep(0., th, uv.y);
  frame *= 1.0 - smoothstep(1. - th, 1., uv.y);
  frame *= smoothstep(0., th, uv.x);
  frame *= 1.0 - smoothstep(1. - th, 1., uv.x);
  return frame;
}

float blurEdge3x3(sampler2D tex, vec2 uv, vec2 dudx, vec2 dudy, float radius, float centerSample) {
  vec2 texel = 1.0 / vec2(textureSize(tex, 0));
  vec2 r = radius * texel;

  float w1 = 1.0, w2 = 2.0, w4 = 4.0;
  float norm = 16.0;
  float sum = w4 * centerSample;

  sum += w2 * textureGrad(tex, uv + vec2(0.0, -r.y), dudx, dudy).r;
  sum += w2 * textureGrad(tex, uv + vec2(0.0, r.y), dudx, dudy).r;
  sum += w2 * textureGrad(tex, uv + vec2(-r.x, 0.0), dudx, dudy).r;
  sum += w2 * textureGrad(tex, uv + vec2(r.x, 0.0), dudx, dudy).r;

  sum += w1 * textureGrad(tex, uv + vec2(-r.x, -r.y), dudx, dudy).r;
  sum += w1 * textureGrad(tex, uv + vec2(r.x, -r.y), dudx, dudy).r;
  sum += w1 * textureGrad(tex, uv + vec2(-r.x, r.y), dudx, dudy).r;
  sum += w1 * textureGrad(tex, uv + vec2(r.x, r.y), dudx, dudy).r;

  return sum / norm;
}

float lst(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

void main() {

  const float firstFrameOffset = 2.8;
  float t = .3 * (u_time + firstFrameOffset);

  vec2 uv = v_imageUV;
  vec2 dudx = dFdx(v_imageUV);
  vec2 dudy = dFdy(v_imageUV);
  vec4 img = textureGrad(u_image, uv, dudx, dudy);

  if (u_isImage == false) {
    uv = v_objectUV + .5;
    uv.y = 1. - uv.y;
  }

  float cycleWidth = u_repetition;
  float edge = 0.;
  float contOffset = 1.;

  vec2 rotatedUV = uv - vec2(.5);
  float angle = (-u_angle + 70.) * PI / 180.;
  float cosA = cos(angle);
  float sinA = sin(angle);
  rotatedUV = vec2(
  rotatedUV.x * cosA - rotatedUV.y * sinA,
  rotatedUV.x * sinA + rotatedUV.y * cosA
  ) + vec2(.5);

  if (u_isImage == true) {
    float edgeRaw = img.r;
    edge = blurEdge3x3(u_image, uv, dudx, dudy, 6., edgeRaw);
    edge = pow(edge, 1.6);
    edge *= mix(0.0, 1.0, smoothstep(0.0, 0.4, u_contour));
  } else {
    if (u_shape < 1.) {
      // full-fill on canvas
      vec2 borderUV = v_responsiveUV + .5;
      float ratio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
      vec2 mask = min(borderUV, 1. - borderUV);
      vec2 pixel_thickness = min(250. / v_responsiveBoxGivenSize, vec2(.5));
      float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
      float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
      maskX = pow(maskX, .25);
      maskY = pow(maskY, .25);
      edge = clamp(1. - maskX * maskY, 0., 1.);

      uv = v_responsiveUV;
      if (ratio > 1.) {
        uv.y /= ratio;
      } else {
        uv.x *= ratio;
      }
      uv += .5;
      uv.y = 1. - uv.y;

      cycleWidth *= 2.;
      contOffset = 1.5;

    } else if (u_shape < 2.) {
      // circle
      vec2 shapeUV = uv - .5;
      shapeUV *= .67;
      edge = pow(clamp(3. * length(shapeUV), 0., 1.), 18.);
    } else if (u_shape < 3.) {
      // daisy
      vec2 shapeUV = uv - .5;
      shapeUV *= 1.68;

      float r = length(shapeUV) * 2.;
      float a = atan(shapeUV.y, shapeUV.x) + .2;
      r *= (1. + .05 * sin(3. * a + 2. * t));
      float f = abs(cos(a * 3.));
      edge = smoothstep(f, f + .7, r);
      edge *= edge;

      uv *= .8;
      cycleWidth *= 1.6;

    } else if (u_shape < 4.) {
      // diamond
      vec2 shapeUV = uv - .5;
      shapeUV = rotate(shapeUV, .25 * PI);
      shapeUV *= 1.42;
      shapeUV += .5;
      vec2 mask = min(shapeUV, 1. - shapeUV);
      vec2 pixel_thickness = vec2(.15);
      float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
      float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
      maskX = pow(maskX, .25);
      maskY = pow(maskY, .25);
      edge = clamp(1. - maskX * maskY, 0., 1.);
    } else if (u_shape < 5.) {
      // metaballs
      vec2 shapeUV = uv - .5;
      shapeUV *= 1.3;
      edge = 0.;
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float speed = 1.5 + 2./3. * sin(fi * 12.345);
        float angle = -fi * 1.5;
        vec2 dir1 = vec2(cos(angle), sin(angle));
        vec2 dir2 = vec2(cos(angle + 1.57), sin(angle + 1.));
        vec2 traj = .4 * (dir1 * sin(t * speed + fi * 1.23) + dir2 * cos(t * (speed * 0.7) + fi * 2.17));
        float d = length(shapeUV + traj);
        edge += pow(1.0 - clamp(d, 0.0, 1.0), 4.0);
      }
      edge = 1. - smoothstep(.65, .9, edge);
      edge = pow(edge, 4.);
    }

    edge = mix(smoothstep(.9 - 2. * fwidth(edge), .9, edge), edge, smoothstep(0.0, 0.4, u_contour));

  }

  float opacity = 0.;
  if (u_isImage == true) {
    opacity = img.g;
    float frame = getImgFrame(v_imageUV, 0.);
    opacity *= frame;
  } else {
    opacity = 1. - smoothstep(.9 - 2. * fwidth(edge), .9, edge);
    if (u_shape < 2.) {
      edge = 1.2 * edge;
    } else if (u_shape < 5.) {
      edge = 1.8 * pow(edge, 1.5);
    }
  }

  float diagBLtoTR = rotatedUV.x - rotatedUV.y;
  float diagTLtoBR = rotatedUV.x + rotatedUV.y;

  vec3 color = vec3(0.);
  vec3 color1 = vec3(.98, 0.98, 1.);
  vec3 color2 = vec3(.1, .1, .1 + .1 * smoothstep(.7, 1.3, diagTLtoBR));

  vec2 grad_uv = uv - .5;

  float dist = length(grad_uv + vec2(0., .2 * diagBLtoTR));
  grad_uv = rotate(grad_uv, (.25 - .2 * diagBLtoTR) * PI);
  float direction = grad_uv.x;

  float bump = pow(1.8 * dist, 1.2);
  bump = 1. - bump;
  bump *= pow(uv.y, .3);


  float thin_strip_1_ratio = .12 / cycleWidth * (1. - .4 * bump);
  float thin_strip_2_ratio = .07 / cycleWidth * (1. + .4 * bump);
  float wide_strip_ratio = (1. - thin_strip_1_ratio - thin_strip_2_ratio);

  float thin_strip_1_width = cycleWidth * thin_strip_1_ratio;
  float thin_strip_2_width = cycleWidth * thin_strip_2_ratio;

  float noise = snoise(uv - t);

  edge += (1. - edge) * u_distortion * noise;

  direction += diagBLtoTR;
  float contour = 0.;
  direction -= 2. * noise * diagBLtoTR * (smoothstep(0., 1., edge) * (1.0 - smoothstep(0., 1., edge)));
  direction *= mix(1., 1. - edge, smoothstep(.5, 1., u_contour));
  direction -= 1.7 * edge * smoothstep(.5, 1., u_contour);
  direction += .2 * pow(u_contour, 4.) * (1.0 - smoothstep(0., 1., edge));

  bump *= clamp(pow(uv.y, .1), .3, 1.);
  direction *= (.1 + (1.1 - edge) * bump);

  direction *= (.4 + .6 * (1.0 - smoothstep(.5, 1., edge)));
  direction += .18 * (smoothstep(.1, .2, uv.y) * (1.0 - smoothstep(.2, .4, uv.y)));
  direction += .03 * (smoothstep(.1, .2, 1. - uv.y) * (1.0 - smoothstep(.2, .4, 1. - uv.y)));

  direction *= (.5 + .5 * pow(uv.y, 2.));
  direction *= cycleWidth;
  direction -= t;


  float colorDispersion = (1. - bump);
  colorDispersion = clamp(colorDispersion, 0., 1.);
  float dispersionRed = colorDispersion;
  dispersionRed += .03 * bump * noise;
  dispersionRed += 5. * (smoothstep(-.1, .2, uv.y) * (1.0 - smoothstep(.1, .5, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, 1., bump)));
  dispersionRed -= diagBLtoTR;

  float dispersionBlue = colorDispersion;
  dispersionBlue *= 1.3;
  dispersionBlue += (smoothstep(0., .4, uv.y) * (1.0 - smoothstep(.1, .8, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, .8, bump)));
  dispersionBlue -= .2 * edge;

  dispersionRed *= (u_shiftRed / 20.);
  dispersionBlue *= (u_shiftBlue / 20.);

  float blur = 0.;
  float rExtraBlur = 0.;
  float gExtraBlur = 0.;
  if (u_isImage == true) {
    float softness = 0.05 * u_softness;
    blur = softness + .5 * smoothstep(1., 10., u_repetition) * smoothstep(.0, 1., edge);
    float smallCanvasT = 1.0 - smoothstep(100., 500., min(u_resolution.x, u_resolution.y));
    blur += smallCanvasT * smoothstep(.0, 1., edge);
    rExtraBlur = softness * (0.05 + .1 * (u_shiftRed / 20.) * bump);
    gExtraBlur = softness * 0.05 / max(0.001, abs(1. - diagBLtoTR));
  } else {
    blur = u_softness / 15. + .3 * contour;
  }

  vec3 w = vec3(thin_strip_1_width, thin_strip_2_width, wide_strip_ratio);
  w[1] -= .02 * smoothstep(.0, 1., edge + bump);
  float stripe_r = fract(direction + dispersionRed);
  float r = getColorChanges(color1.r, color2.r, stripe_r, w, blur + fwidth(stripe_r) + rExtraBlur, bump, u_colorTint.r);
  float stripe_g = fract(direction);
  float g = getColorChanges(color1.g, color2.g, stripe_g, w, blur + fwidth(stripe_g) + gExtraBlur, bump, u_colorTint.g);
  float stripe_b = fract(direction - dispersionBlue);
  float b = getColorChanges(color1.b, color2.b, stripe_b, w, blur + fwidth(stripe_b), bump, u_colorTint.b);

  color = vec3(r, g, b);
  color *= opacity;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  ${GLSL_GRAIN}

  fragColor = vec4(color, opacity);
}
`;
  // Paper Shaders' sizing vertex shader (vertex-shader.ts @ 0.0.80), as metal-fx vendors it.
  const VERT_SHADER = /* glsl */ `#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_imageAspectRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

out vec2 v_objectUV;
out vec2 v_objectBoxSize;
out vec2 v_responsiveUV;
out vec2 v_responsiveBoxGivenSize;
out vec2 v_patternUV;
out vec2 v_patternBoxSize;
out vec2 v_imageUV;

vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
  vec2 box = vec2(0.);
  // fit = none
  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
  float noFitBoxWidth = box.x;
  if (u_fit == 1.) { // fit = contain
    box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);
  } else if (u_fit == 2.) { // fit = cover
    box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);
  }
  box.y = box.x / boxRatio;
  return vec3(box, noFitBoxWidth);
}

void main() {
  gl_Position = a_position;

  vec2 uv = gl_Position.xy * .5;
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * 3.14159265358979323846 / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);


  // ===================================================

  float fixedRatio = 1.;
  vec2 fixedRatioBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );

  v_objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;
  vec2 objectWorldScale = u_resolution.xy / v_objectBoxSize;

  v_objectUV = uv;
  v_objectUV *= objectWorldScale;
  v_objectUV += boxOrigin * (objectWorldScale - 1.);
  v_objectUV += graphicOffset;
  v_objectUV /= u_scale;
  v_objectUV = graphicRotation * v_objectUV;

  // ===================================================

  v_responsiveBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
  vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;
  vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;

  v_responsiveUV = uv;
  v_responsiveUV *= responsiveBoxScale;
  v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.);
  v_responsiveUV += graphicOffset;
  v_responsiveUV /= u_scale;
  v_responsiveUV.x *= responsiveRatio;
  v_responsiveUV = graphicRotation * v_responsiveUV;
  v_responsiveUV.x /= responsiveRatio;

  // ===================================================

  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
  vec2 patternBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;

  vec3 boxSizeData = getBoxSize(patternBoxRatio, patternBoxGivenSize);
  v_patternBoxSize = boxSizeData.xy;
  float patternBoxNoFitBoxWidth = boxSizeData.z;
  vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;

  v_patternUV = uv;
  v_patternUV += graphicOffset / patternBoxScale;
  v_patternUV += boxOrigin;
  v_patternUV -= boxOrigin / patternBoxScale;
  v_patternUV *= u_resolution.xy;
  v_patternUV /= u_pixelRatio;
  if (u_fit > 0.) {
    v_patternUV *= (patternBoxNoFitBoxWidth / v_patternBoxSize.x);
  }
  v_patternUV /= u_scale;
  v_patternUV = graphicRotation * v_patternUV;
  v_patternUV += boxOrigin / patternBoxScale;
  v_patternUV -= boxOrigin;
  // x100 is a default multiplier between vertex and fragmant shaders
  // we use it to avoid UV presision issues
  v_patternUV *= .01;

  // ===================================================

  vec2 imageBoxSize;
  if (u_fit == 1.) { // contain
    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else if (u_fit == 2.) { // cover
    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else {
    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);
  }
  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;

  v_imageUV = uv;
  v_imageUV *= imageBoxScale;
  v_imageUV += boxOrigin * (imageBoxScale - 1.);
  v_imageUV += graphicOffset;
  v_imageUV /= u_scale;
  v_imageUV.x *= u_imageAspectRatio;
  v_imageUV = graphicRotation * v_imageUV;
  v_imageUV.x /= u_imageAspectRatio;

  v_imageUV += .5;
  v_imageUV.y = 1. - v_imageUV.y;
}`;

  // ---------------------------------------------------------------- presets
  // Paper's liquidMetal defaults as metal-fx spells them (`Se`), then the
  // chromatic preset's dark block. MetalText always asks for "chromatic"; the
  // dark side is pinned here because Zia's stage is near-black.
  const PAPER_DEFAULTS = {
    colorBack: "#00000000",
    speed: 1,
    repetition: 1.5,
    softness: 0.05,
    shiftRed: 0.3,
    shiftBlue: 0.3,
    distortion: 0.1,
    contour: 0.4,
    angle: 90,
    shape: 0, // SHAPE_NONE
    scale: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    originX: 0.5,
    originY: 0.5,
    worldWidth: 0,
    worldHeight: 0,
    fit: 1 // FIT_CONTAIN
  };
  // Cool blue burn with the dispersion pushed well past Paper's default (the
  // package's note: the R/B channel split is the only knob that produces
  // colour separation in this shader).
  const CHROMATIC_DARK = Object.assign({}, PAPER_DEFAULTS, {
    colorTint: "#88ccff2e", shiftRed: 0.75, shiftBlue: 0.75, repetition: 2, softness: 0.09, shaderOpacity: 1
  });

  // METAL_TEXT_DEFAULTS, "tuned on the demo's 'Plan Pro' card".
  const TEXT_DEFAULTS = Object.freeze({
    metalOpacity: 0.62,
    shaderScale: 2.8,
    glowGain: 2.5,
    innerShadow: Object.freeze({ offsetY: 1, blur: 0.5, alpha: 0.9 })
  });

  // Engine constants (the package's names in brackets).
  const FRAME_MS = 66;        // [qa] shader frames are at least this far apart (~15 fps)
  const GLOW_READ_MS = 1500;  // [Qa] how often the glow re-reads the shader's pixels
  const GL_CSS_PX = 96;       // [Ja] the shared GL canvas is this many CSS px square
  const GL_DPR_MAX = 2;       // [tr] ...at up to 2x
  const CROP_W = 140;         // [fa] a 140 x 40 box sees the whole GL canvas at shaderScale 1
  const CROP_H = 40;          // [ha]
  const TEXT_RADIUS = 4;      // MetalText's borderRadius
  // Port-only: keep the compiled program a moment after the last instance goes,
  // so a slide that re-renders its heading doesn't rebuild the GL context.
  const RENDERER_LINGER_MS = 1000;
  // Port-only: if no metal frame has been painted by then (a GL that never
  // draws), show the plain text rather than keep it hidden.
  const REVEAL_FALLBACK_MS = 1000;

  const UNIFORMS = [
    // Fragment stage (Paper liquidMetal)
    "u_resolution", "u_time", "u_pixelRatio", "u_colorBack", "u_colorTint", "u_repetition", "u_softness",
    "u_shiftRed", "u_shiftBlue", "u_distortion", "u_contour", "u_angle", "u_shape", "u_isImage", "u_image",
    // Vertex stage (Paper sizing)
    "u_originX", "u_originY", "u_worldWidth", "u_worldHeight", "u_fit", "u_scale", "u_rotation",
    "u_offsetX", "u_offsetY", "u_imageAspectRatio"
  ];

  let warned = false;
  function warn(msg, err) {
    if (warned) return;
    warned = true;
    try { console.warn("ziaMetalText: " + msg, err || ""); } catch (e) { /* no console */ }
  }

  function hexToRgba(hex) { // [vo]
    let e = hex.replace("#", "");
    if (e.length === 3 || e.length === 4) e = e.split("").map((o) => o + o).join("");
    const a = e.length >= 8 ? parseInt(e.slice(6, 8), 16) / 255 : 1;
    return [parseInt(e.slice(0, 2), 16) / 255, parseInt(e.slice(2, 4), 16) / 255, parseInt(e.slice(4, 6), 16) / 255, a];
  }

  // ------------------------------------------------------------- GL program
  function compile(gl, type, src) { // [wo]
    const s = gl.createShader(type);
    if (!s) throw new Error("gl.createShader returned null");
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error("shader compile failed: " + (log || "(no info log)"));
    }
    return s;
  }
  function link(gl, vs, fs) { // [hr]
    const p = gl.createProgram();
    if (!p) throw new Error("gl.createProgram returned null");
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error("program link failed: " + (log || "(no info log)"));
    }
    return p;
  }
  function setupGL(gl) { // [yo]
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const program = link(gl, compile(gl, gl.VERTEX_SHADER, VERT_SHADER), compile(gl, gl.FRAGMENT_SHADER, FRAG_SHADER));
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("gl.createBuffer returned null");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uniforms = {};
    for (const name of UNIFORMS) uniforms[name] = gl.getUniformLocation(program, name);
    const tex = gl.createTexture();
    if (tex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (uniforms.u_image) gl.uniform1i(uniforms.u_image, 0);
    }
    return { program, buffer, uniforms, dummyTexture: tex };
  }

  // -------------------------------------------------------- shared renderer
  let R = null;             // [x] the one GL canvas, program and loop
  let glUnavailable = false;
  let probe = null;
  let lastFrameT = 0;       // [Ro]
  let lastGlowRead = 0;     // [Mo]

  function makeContext(size) {
    // OffscreenCanvas + transferToImageBitmap when there is one (Firefox 105+),
    // else a plain canvas that keeps its buffer, exactly as the package picks.
    if (typeof OffscreenCanvas !== "undefined") {
      try {
        const oc = new OffscreenCanvas(size, size);
        const gl = oc.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
        if (gl && typeof oc.transferToImageBitmap === "function") return { canvas: oc, gl, offscreen: true };
        // (port: fall through to a DOM canvas instead of giving up)
      } catch (e) { /* fall through */ }
    }
    try {
      const c = document.createElementNS(XHTML_NS, "canvas");
      c.width = size;
      c.height = size;
      const gl = c.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
      if (gl) return { canvas: c, gl, offscreen: false };
    } catch (e) { /* none */ }
    return null;
  }

  function loseContext(gl) {
    try {
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    } catch (e) { /* gone already */ }
  }

  function getRenderer() { // [Kn]
    if (R) {
      if (R.lingerTimer) { clearTimeout(R.lingerTimer); R.lingerTimer = 0; }
      return R;
    }
    if (glUnavailable) return null;
    const dpr = Math.min(GL_DPR_MAX, window.devicePixelRatio || 1);
    const size = Math.round(GL_CSS_PX * dpr);
    const made = makeContext(size);
    if (!made) { glUnavailable = true; probe = false; return null; }
    let prog;
    try {
      prog = setupGL(made.gl);
    } catch (e) {
      warn("WebGL2 setup failed, leaving the text plain.", e);
      loseContext(made.gl);
      glUnavailable = true;
      return null;
    }
    const r = {
      glCanvas: made.canvas,
      gl: made.gl,
      program: prog.program,
      buffer: prog.buffer,
      uniforms: prog.uniforms,
      dummyTexture: prog.dummyTexture,
      preset: CHROMATIC_DARK,
      presetDirty: true,
      contextLost: false,
      useOffscreen: made.offscreen,
      frameBitmap: null,
      startMs: performance.now(),
      pausedMs: 0,
      rafId: 0,
      dpr,
      instances: [],
      frameCount: 0,
      glowUsers: 0,
      glowPixels: new Uint8Array(size * size * 4),
      glowPixelsW: size,
      glowPixelsH: size,
      failures: 0,
      lingerTimer: 0
    };
    r.onLost = (ev) => { // [c]
      ev.preventDefault();
      if (R === r) r.contextLost = true;
    };
    r.onRestored = () => { // [u]
      if (R !== r) return;
      try {
        const d = setupGL(r.gl);
        r.program = d.program; r.buffer = d.buffer; r.uniforms = d.uniforms; r.dummyTexture = d.dummyTexture;
        r.presetDirty = true;
        r.contextLost = false;
        if (r.instances.length > 0) startLoop();
      } catch (e) { warn("WebGL2 restore failed.", e); }
    };
    try {
      r.glCanvas.addEventListener("webglcontextlost", r.onLost, false);
      r.glCanvas.addEventListener("webglcontextrestored", r.onRestored, false);
    } catch (e) { /* no events on this canvas */ }
    document.addEventListener("visibilitychange", onVisibility);
    R = r;
    probe = true;
    return r;
  }

  function teardown() { // [xr]
    const r = R;
    if (!r) return;
    R = null;
    if (r.rafId) cancelAnimationFrame(r.rafId);
    if (r.lingerTimer) clearTimeout(r.lingerTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    try {
      r.glCanvas.removeEventListener("webglcontextlost", r.onLost, false);
      r.glCanvas.removeEventListener("webglcontextrestored", r.onRestored, false);
    } catch (e) { /* ignore */ }
    try {
      if (r.frameBitmap) r.frameBitmap.close();
      r.gl.deleteBuffer(r.buffer);
      r.gl.deleteProgram(r.program);
      if (r.dummyTexture) r.gl.deleteTexture(r.dummyTexture);
    } catch (e) { /* ignore */ }
    loseContext(r.gl);
  }

  function scheduleTeardown() {
    const r = R;
    if (!r || r.lingerTimer) return;
    r.lingerTimer = setTimeout(() => {
      r.lingerTimer = 0;
      if (R === r && r.instances.length === 0) teardown();
    }, RENDERER_LINGER_MS);
  }

  function onVisibility() { // the package's visibilitychange handler
    if (!R || R.contextLost) return;
    if (document.hidden) stopLoop();
    else if (R.instances.length > 0) startLoop();
  }

  function uploadPreset() { // [Or]
    const gl = R.gl, u = R.uniforms, n = R.preset, c = R.glCanvas;
    if (u.u_resolution) gl.uniform2f(u.u_resolution, c.width, c.height);
    if (u.u_pixelRatio) gl.uniform1f(u.u_pixelRatio, R.dpr);
    if (u.u_colorBack) gl.uniform4fv(u.u_colorBack, hexToRgba(n.colorBack));
    if (u.u_colorTint) gl.uniform4fv(u.u_colorTint, hexToRgba(n.colorTint));
    if (u.u_repetition) gl.uniform1f(u.u_repetition, n.repetition);
    if (u.u_softness) gl.uniform1f(u.u_softness, n.softness);
    if (u.u_shiftRed) gl.uniform1f(u.u_shiftRed, n.shiftRed);
    if (u.u_shiftBlue) gl.uniform1f(u.u_shiftBlue, n.shiftBlue);
    if (u.u_distortion) gl.uniform1f(u.u_distortion, n.distortion);
    if (u.u_contour) gl.uniform1f(u.u_contour, n.contour);
    if (u.u_angle) gl.uniform1f(u.u_angle, n.angle);
    if (u.u_shape) gl.uniform1f(u.u_shape, n.shape);
    if (u.u_isImage) gl.uniform1i(u.u_isImage, 0);
    if (u.u_imageAspectRatio) gl.uniform1f(u.u_imageAspectRatio, 1);
    if (u.u_originX) gl.uniform1f(u.u_originX, n.originX);
    if (u.u_originY) gl.uniform1f(u.u_originY, n.originY);
    if (u.u_worldWidth) gl.uniform1f(u.u_worldWidth, n.worldWidth);
    if (u.u_worldHeight) gl.uniform1f(u.u_worldHeight, n.worldHeight);
    if (u.u_fit) gl.uniform1f(u.u_fit, n.fit);
    if (u.u_scale) gl.uniform1f(u.u_scale, n.scale);
    if (u.u_rotation) gl.uniform1f(u.u_rotation, n.rotation);
    if (u.u_offsetX) gl.uniform1f(u.u_offsetX, n.offsetX);
    if (u.u_offsetY) gl.uniform1f(u.u_offsetY, n.offsetY);
    R.presetDirty = false;
  }

  function renderFrame(t) { // [Lr]
    const gl = R.gl, u = R.uniforms, c = R.glCanvas;
    const time = (t - R.startMs - R.pausedMs) / 1e3 * R.preset.speed;
    gl.viewport(0, 0, c.width, c.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (R.presetDirty) uploadPreset();
    if (u.u_time) gl.uniform1f(u.u_time, time);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    R.frameCount++;
  }

  // The glow picks its spot by the metal's brightness: a readback of the GL
  // canvas, at most every 1.5 s. (The package reads it whether or not any
  // instance has a glow; the port only when one does.)
  function readGlowPixels() { // [vr]
    const t = performance.now();
    if (t - lastGlowRead < GLOW_READ_MS) return;
    lastGlowRead = t;
    const gl = R.gl, w = R.glCanvas.width, h = R.glCanvas.height;
    if (R.glowPixelsW !== w || R.glowPixelsH !== h) {
      R.glowPixelsW = w; R.glowPixelsH = h; R.glowPixels = new Uint8Array(w * h * 4);
    }
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, R.glowPixels);
  }

  const glPt = { bx: 0, by: 0 };
  function toGlPixel(inst, x, y) { // [ln] instance CSS px -> GL canvas px (rows bottom-up)
    if (!R) { glPt.bx = 0; glPt.by = 0; return glPt; }
    const a = R.glCanvas.width, i = R.glCanvas.height, r = inst.dpr;
    const l = inst.cssWidth * r, s = inst.cssHeight * r, c = CROP_W * r, u = CROP_H * r;
    let d = l * (a / c) / inst.shaderScale, h = s * (i / u) / inst.shaderScale;
    if (d > a) d = a;
    if (h > i) h = i;
    const f = (a - d) / 2, p = (i - h) / 2, g = f + x / inst.cssWidth * d, v = p + y / inst.cssHeight * h;
    glPt.bx = Math.round(g);
    glPt.by = Math.round(i - 1 - v);
    return glPt;
  }
  const winAvg = { r: 0, g: 0, b: 0, lum: 0, count: 0 };
  function windowAverage(px, w, h, cx, cy, rad) { // [ga]
    const r = Math.max(1, rad | 0), l = Math.max(0, cx - r), s = Math.min(w, cx + r + 1), c = Math.max(0, cy - r), u = Math.min(h, cy + r + 1);
    winAvg.r = 0; winAvg.g = 0; winAvg.b = 0; winAvg.lum = 0; winAvg.count = 0;
    for (let d = c; d < u; d++) {
      const row = d * w;
      for (let f = l; f < s; f++) {
        const p = (row + f) * 4;
        winAvg.r += px[p]; winAvg.g += px[p + 1]; winAvg.b += px[p + 2];
        winAvg.lum += (0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]) / 255;
        winAvg.count++;
      }
    }
    return winAvg;
  }
  function lumAt(inst, x, y, rad) { // [Fn]
    if (!R) return 0;
    const a = toGlPixel(inst, x, y), i = windowAverage(R.glowPixels, R.glowPixelsW, R.glowPixelsH, a.bx, a.by, rad);
    return i.count > 0 ? i.lum / i.count : 0;
  }
  const avgRgb = { r: 255, g: 255, b: 255 };
  function colorAt(inst, x, y, rad) { // [xa]
    if (!R) { avgRgb.r = 255; avgRgb.g = 255; avgRgb.b = 255; return avgRgb; }
    const a = toGlPixel(inst, x, y), i = windowAverage(R.glowPixels, R.glowPixelsW, R.glowPixelsH, a.bx, a.by, rad);
    if (i.count === 0) { avgRgb.r = 255; avgRgb.g = 255; avgRgb.b = 255; }
    else { avgRgb.r = i.r / i.count; avgRgb.g = i.g / i.count; avgRgb.b = i.b / i.count; }
    return avgRgb;
  }

  // ------------------------------------------------------------- compositing
  function freeze(inst) { // [wa] the frame a paused instance keeps showing
    if (!R) return null;
    const src = R.frameBitmap || R.glCanvas, w = R.glCanvas.width, h = R.glCanvas.height;
    if (w < 1 || h < 1) return null;
    let c = inst.frozen;
    if (!c) { c = inst.doc.createElementNS(XHTML_NS, "canvas"); inst.frozen = c; }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext("2d");
    if (!ctx) { inst.frozen = null; return null; }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0);
    return c;
  }

  // [un], the masked path MetalText takes: a centred crop of the GL frame,
  // stretched over the instance canvas at metal opacity, kept only inside the
  // glyphs (destination-in). The package re-paints the glyphs every frame from
  // live layout; the port paints them once per measure into inst.maskCanvas and
  // composites that (the same pixels; no style or layout reads per frame).
  function composite(inst) {
    if (!R) return;
    const src = (inst.paused ? inst.frozen || freeze(inst) : null) || R.frameBitmap || R.glCanvas;
    const n = inst.dpr, o = inst.canvas.width, a = inst.canvas.height;
    if (o < 1 || a < 1) return;
    const i = Math.max(1, Math.round(inst.cssWidth * n)), r = Math.max(1, Math.round(inst.cssHeight * n));
    const s = src.width, c = src.height, u = CROP_W * n, d = CROP_H * n;
    let h = i * (s / u) / inst.shaderScale, f = r * (c / d) / inst.shaderScale;
    if (h > s) h = s;
    if (f > c) f = c;
    const p = Math.max(0, (s - h) / 2), g = Math.max(0, (c - f) / 2), v = inst.opacityMul * R.preset.shaderOpacity, m = inst.ctx;
    m.clearRect(0, 0, o, a);
    if (v < 1) m.globalAlpha = v;
    m.drawImage(src, p, g, h, f, 0, 0, o, a);
    if (v < 1) m.globalAlpha = 1;
    m.save();
    m.globalCompositeOperation = "destination-in";
    m.drawImage(inst.maskCanvas, 0, 0);
    m.restore();
    m.globalCompositeOperation = "source-over";
    if (inst.onFirstCopy) {
      const cb = inst.onFirstCopy;
      inst.onFirstCopy = null;
      cb();
    }
  }

  // ------------------------------------------------------------------ loop
  function startLoop() { // [Ae]
    if (!R || R.rafId !== 0) return;
    R.rafId = requestAnimationFrame(tick);
  }
  function stopLoop() { // [Qn]
    if (!R) return;
    if (R.rafId !== 0) cancelAnimationFrame(R.rafId);
    R.rafId = 0;
  }

  // Instances whose wrapper has left the document (a re-rendered slide) are
  // destroyed here; one that has never been in the document is just skipped.
  function sweep() {
    if (!R) return;
    for (const inst of R.instances.slice()) {
      const c = inst.root.isConnected;
      if (c) inst.seen = true;
      else if (inst.seen) { destroyInstance(inst); continue; }
      inst.connected = c;
    }
  }

  function tick(t) { // [ya]
    const r = R;
    if (!r) return;
    r.rafId = 0;
    if (r.contextLost) return;
    try {
      sweep();
      if (R !== r) return;
      let need = false;
      for (const o of r.instances) {
        if (o.connected && o.visible && (!o.paused || !o.everCopied)) { need = true; break; }
      }
      if (!need) return;
      r.rafId = requestAnimationFrame(tick);
      if (t - lastFrameT < FRAME_MS) {
        // between shader frames only a glow that is mid-fade ticks
        for (const o of r.instances) {
          if (o.glow && o.glowFast && o.visible && !o.paused) o.glowFast = !!glowTick(o.glow, o, t, o.opacityMul * o.glowGain);
        }
        return;
      }
      lastFrameT = t;
      renderFrame(t);
      if (r.glowUsers > 0) readGlowPixels();
      if (r.useOffscreen) {
        if (r.frameBitmap) r.frameBitmap.close();
        r.frameBitmap = r.glCanvas.transferToImageBitmap();
      }
      for (const o of r.instances.slice()) {
        if (o.visible && o.connected && !(o.paused && o.everCopied)) {
          composite(o);
          o.everCopied = true;
        }
      }
      for (const o of r.instances) {
        if (o.glow && o.visible && !o.paused) o.glowFast = !!glowTick(o.glow, o, t, o.opacityMul * o.glowGain);
      }
      r.failures = 0;
    } catch (e) {
      engineError(e);
    }
  }

  // A loop that keeps failing gives up: every instance goes back to plain text.
  function engineError(e) {
    warn("rendering failed.", e);
    if (!R) return;
    if (++R.failures < 30) return;
    glUnavailable = true;
    for (const inst of R.instances.slice()) destroyInstance(inst);
    teardown();
  }

  // ------------------------------------------------------------ gaussian blur
  // [Jr, ti, ei, fn] three box blurs approximating a gaussian, in place.
  function boxesForGauss(sigma, n) {
    const ideal = Math.sqrt(12 * sigma * sigma / n + 1);
    let o = Math.floor(ideal);
    if (o % 2 === 0) o--;
    const a = o + 2, i = (12 * sigma * sigma - n * o * o - 4 * n * o - 3 * n) / (-4 * o - 4), m = Math.round(i), sizes = [];
    for (let s = 0; s < n; s++) sizes.push(s < m ? o : a);
    return sizes;
  }
  function boxBlurH(t, e, n, o, a) {
    const i = 1 / (a + a + 1);
    for (let r = 0; r < o; r++) {
      const l = r * n;
      let s = 0;
      for (let c = -a; c <= a; c++) s += t[l + Math.min(n - 1, Math.max(0, c))];
      for (let c = 0; c < n; c++) {
        e[l + c] = s * i;
        const u = l + Math.max(0, c - a), d = l + Math.min(n - 1, c + a + 1);
        s += t[d] - t[u];
      }
    }
  }
  function boxBlurV(t, e, n, o, a) {
    const i = 1 / (a + a + 1);
    for (let r = 0; r < n; r++) {
      let l = 0;
      for (let s = -a; s <= a; s++) l += t[Math.min(o - 1, Math.max(0, s)) * n + r];
      for (let s = 0; s < o; s++) {
        e[s * n + r] = l * i;
        const c = Math.max(0, s - a) * n + r, u = Math.min(o - 1, s + a + 1) * n + r;
        l += t[u] - t[c];
      }
    }
  }
  function gaussBlur(data, w, h, sigma) {
    if (sigma <= 0.05) return data;
    const tmp = new Float32Array(data.length);
    for (const size of boxesForGauss(sigma, 3)) {
      const rad = (size - 1) / 2;
      boxBlurH(data, tmp, w, h, rad);
      boxBlurV(tmp, data, w, h, rad);
    }
    return data;
  }

  // ------------------------------------------------------------------ glyphs
  let scratch = null;
  function scratch2d() {
    if (!scratch) {
      const c = document.createElementNS(XHTML_NS, "canvas");
      c.width = 1; c.height = 1;
      scratch = c.getContext("2d");
    }
    return scratch;
  }

  // A canvas font the engine takes. CSS Fonts 4 weights like 650 are fine in
  // current engines; an engine that rejects one gets the nearest hundred.
  function canvasFont(ctx, cs) {
    const font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    ctx.font = "7px zia-metal-sentinel";
    const before = ctx.font;
    ctx.font = font;
    if (ctx.font !== before) return font;
    const w = Math.min(900, Math.max(100, Math.round((parseFloat(cs.fontWeight) || 400) / 100) * 100));
    const alt = cs.fontStyle + " " + w + " " + cs.fontSize + " " + cs.fontFamily;
    ctx.font = alt;
    return alt;
  }

  // Where [oo] (paintTextRun) puts the text: the DOM's own font, at the text
  // run's left edge, with the baseline centred in the run's box by the font's
  // ascent/descent. Read in layout (untransformed) px: a transformed ancestor
  // (a slide mid-transition) is divided out, and re-measured when it settles.
  // The port adds the element's letter-spacing (MetalText forces 0).
  function textGeometry(inst) {
    const win = inst.win, root = inst.root, text = inst.text;
    const rr = root.getBoundingClientRect();
    const rcs = win.getComputedStyle(root);
    let w = parseFloat(rcs.width), h = parseFloat(rcs.height);
    if (!(w >= 0)) w = rr.width;
    if (!(h >= 0)) h = rr.height;
    let kx = w > 0 && rr.width > 0 ? rr.width / w : 1, ky = h > 0 && rr.height > 0 ? rr.height / h : 1;
    const transformed = Math.abs(kx - 1) > 1e-3 || Math.abs(ky - 1) > 1e-3;
    if (!transformed) { w = rr.width; h = rr.height; kx = 1; ky = 1; }
    const cs = win.getComputedStyle(text);
    const range = inst.doc.createRange();
    range.selectNodeContents(text);
    const tr = range.getBoundingClientRect();
    if (range.detach) range.detach();
    let str = text.textContent || "";
    if (cs.textTransform === "uppercase") str = str.toUpperCase();
    else if (cs.textTransform === "lowercase") str = str.toLowerCase();
    const ctx = scratch2d();
    const font = canvasFont(ctx, cs);
    const m = ctx.measureText(str);
    const size = parseFloat(cs.fontSize) || 0;
    const asc = m.fontBoundingBoxAscent != null ? m.fontBoundingBoxAscent : size * 0.9;
    const desc = m.fontBoundingBoxDescent != null ? m.fontBoundingBoxDescent : size * 0.2;
    const top = (tr.top - rr.top) / ky, th = tr.height / ky;
    return {
      w, h, transformed, font, text: str,
      ls: cs.letterSpacing && cs.letterSpacing !== "normal" ? cs.letterSpacing : "0px",
      x: (tr.left - rr.left) / kx,
      y: top + (th - (asc + desc)) / 2 + asc
    };
  }

  function sameGeometry(a, b) {
    return !!a && !!b && a.w === b.w && a.h === b.h && a.x === b.x && a.y === b.y &&
      a.font === b.font && a.text === b.text && a.ls === b.ls;
  }

  // ctx in device px, origin at the wrapper's top-left (as paintTextRun).
  function paintText(ctx, g, dpr) {
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.font = g.font;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const ls = parseFloat(g.ls) || 0;
    if ("letterSpacing" in ctx) {
      ctx.letterSpacing = ls !== 0 ? g.ls : "0px";
      ctx.fillText(g.text, g.x, g.y);
    } else if (ls === 0) {
      ctx.fillText(g.text, g.x, g.y);
    } else {
      // no canvas letterSpacing (Firefox < 115): place each character where
      // the spaced run puts it
      const chars = Array.from(g.text);
      let prefix = "";
      for (let i = 0; i < chars.length; i++) {
        ctx.fillText(chars[i], g.x + ctx.measureText(prefix).width + i * ls, g.y);
        prefix += chars[i];
      }
    }
    ctx.restore();
  }

  // [us] the inner shadow: glyph alpha minus the same alpha shifted down by
  // offsetY leaves the top rim of every glyph; blurred, kept inside the
  // glyphs, drawn white on a canvas above the metal.
  function paintRim(inst, g) {
    const o = inst.innerShadow, b = inst.rim;
    if (!o || !b) return;
    const a = inst.win.devicePixelRatio || 1;
    const r = Math.max(1, Math.round(g.w * a)), l = Math.max(1, Math.round(g.h * a));
    const s = inst.doc.createElementNS(XHTML_NS, "canvas");
    s.width = r; s.height = l;
    const c = s.getContext("2d", { willReadFrequently: true }), u = b.getContext("2d");
    if (!c || !u) return;
    c.fillStyle = "#fff";
    paintText(c, g, a);
    const d = c.getImageData(0, 0, r, l).data, h = r * l, f = new Float32Array(h);
    for (let w = 0, M = 3; w < h; w++, M += 4) f[w] = d[M] / 255;
    const p = Math.max(1, Math.round(o.offsetY * a)) * r, sh = new Float32Array(h);
    for (let w = 0; w < h; w++) {
      const M = w >= p ? f[w - p] : 0;
      sh[w] = Math.max(0, f[w] - M);
    }
    const v = gaussBlur(sh, r, l, o.blur * a);
    b.width = r;
    b.height = l;
    b.style.width = g.w + "px";
    b.style.height = g.h + "px";
    const m = u.createImageData(r, l), px = m.data;
    for (let w = 0, M = 0; w < h; w++, M += 4) {
      px[M] = 255; px[M + 1] = 255; px[M + 2] = 255;
      px[M + 3] = Math.round(Math.min(1, v[w] * f[w] * o.alpha) * 255);
    }
    u.putImageData(m, 0, 0);
  }

  // -------------------------------------------------------------------- glow
  // MetalText's optional halo (`glow`, off by default): metal-fx's glow in its
  // point mode, dark theme. It sits on the brightest part of the metal inside
  // the glyphs, wanders a little, fades over to a brighter spot when one
  // appears, and is kept to the glyphs plus a soft blurred edge.
  const G = Object.freeze({ // [Ma] GLOW_DEFAULTS
    haloOpMul: 2, extraIntensity: 3.51, peakOp: 0.85, baseOp: 0.34, inset: 1.5, extraOutward: 1,
    wanderRange: 15, wanderLerp: 75e-4, fadeRate: 875e-5, lumLo: 0.08, lumHi: 0.32, minDwellMs: 1500,
    relocFadeMs: 300, relocFadeOutMs: 450, pointGain: 2.5, haloHalfLen: 7.8, extraHalfLen: 9.13952 / 3,
    haloStrokeXl: 26.4, haloStrokeLg: 15.6, haloStrokeMd: 7.2, haloStrokeSm: 3,
    haloBlurXl: 8.4, haloBlurLg: 4.8, haloBlurMd: 2.1, haloBlurSm: 0.9,
    haloOpXl: 0.385, haloOpLg: 0.595, haloOpMd: 0.7, haloOpSm: 0.7,
    extraStrokeOuter: 4 / 3, extraStrokeCore: 2 / 3, extraBlurOuter: 2 / 3, extraBlurCore: 1.35 / 3,
    extraFadeR: 13 / 3, extraOpOuter: 0.85
  });
  const RELOC_MARGIN = 0.05;              // [li]
  const TICK_MS = 1e3 / 15;               // [No]
  const WANDER_MS = 120 * (1e3 / 15);     // [ci]
  const TINT_HOLD_MS = 2e3;               // [Uo]
  const TINT_MS = 400;                    // [An]
  const ENV_STEP_MAX = 34;                // [hi]
  const MOVE_EPS = 0.25, ANG_EPS = 0.01, OP_EPS = 4e-3; // [Je, mi, Do]
  const MASK_PEAK = 0.5, MASK_BLUR = 3.5; // [pi, gi]
  const REF_W = 140, REF_H = 40, REF_R = 20; // [Ia, Oa, La]

  const EASE = { linear: (t) => t, smoothstep: (t) => t * t * (3 - 2 * t) }; // [Bn]
  function tween(from, to, dur, ease) { return { from, to, dur, ease: ease || EASE.linear, startMs: -1, val: from, done: false }; } // [Oe]
  function startTween(t, now) { t.startMs = now; t.val = t.from; t.done = false; } // [Le]
  function tweenAt(t, now) { // [Co]
    if (t.done || t.startMs < 0) return t.val;
    const n = Math.min(1, (now - t.startMs) / t.dur);
    t.val = t.from + (t.to - t.from) * t.ease(n);
    if (n >= 1) t.done = true;
    return t.val;
  }
  function rangeStep(a, b, x) { // [Po]
    if (a === b) return x < a ? 0 : 1;
    const o = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return o * o * (3 - 2 * o);
  }
  function perimeter(w, h, r) { // [eo] (rn for a pill)
    const o = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    return 2 * Math.max(0, w - 2 * o) + 2 * Math.max(0, h - 2 * o) + 2 * Math.PI * o;
  }

  function strokeAlpha(half, width, w, h, dpr, x, y) { // [ni]
    const c = document.createElementNS(XHTML_NS, "canvas");
    c.width = w; c.height = h;
    const s = c.getContext("2d", { willReadFrequently: true }), out = new Float32Array(w * h);
    if (!s) return out;
    s.scale(dpr, dpr);
    s.strokeStyle = "#fff";
    s.lineCap = "round";
    s.lineJoin = "round";
    s.lineWidth = width;
    s.beginPath();
    s.moveTo(x - half, y);
    s.lineTo(x + half, y);
    s.stroke();
    const px = s.getImageData(0, 0, w, h).data;
    for (let d = 0, a = 3; d < out.length; d++, a += 4) out[d] = px[a] / 255;
    return out;
  }
  function makeSprite(layers, half, scale, dpr, fadeR) { // [Ea]
    let ext = 0;
    for (const g of layers) ext = Math.max(ext, (g.stroke / 2 + 3 * g.blur) * scale);
    const r = Math.ceil(ext) + 1, l = 2 * half + 2 * r, s = 2 * r, c = Math.ceil(l * dpr), u = Math.ceil(s * dpr), d = new Float32Array(c * u);
    for (const g of layers) {
      let v = strokeAlpha(half, g.stroke * scale, c, u, dpr, r, r);
      v = gaussBlur(v, c, u, g.blur * scale * dpr);
      const m = g.opacity;
      for (let b = 0; b < d.length; b++) {
        const w = v[b] * m;
        d[b] = d[b] + w * (1 - d[b]);
      }
    }
    if (fadeR > 0) {
      const gx = r * dpr, gy = r * dpr, m = fadeR * scale * dpr;
      for (let b = 0; b < u; b++) {
        for (let w = 0; w < c; w++) {
          const M = Math.hypot(w + 0.5 - gx, b + 0.5 - gy) / m;
          let y;
          if (M <= 0.3) y = 1;
          else if (M <= 0.65) y = 1 - (M - 0.3) / 0.35 * 0.75;
          else if (M < 1) y = 0.25 * (1 - (M - 0.65) / 0.35);
          else y = 0;
          d[b * c + w] *= y;
        }
      }
    }
    const h = document.createElementNS(XHTML_NS, "canvas");
    h.width = c; h.height = u;
    const f = h.getContext("2d"), p = new Uint8ClampedArray(c * u);
    for (let g = 0; g < d.length; g++) p[g] = Math.round(Math.min(1, d[g]) * 255);
    if (f) {
      const img = f.createImageData(c, u), v = img.data;
      for (let m = 0, b = 0; m < d.length; m++, b += 4) { v[b] = 255; v[b + 1] = 255; v[b + 2] = 255; v[b + 3] = p[m]; }
      f.putImageData(img, 0, 0);
    }
    return { canvas: h, alpha: p, w: l, h: s, ax: r, ay: r };
  }
  const sprites = new Map(); // [an]
  function spriteKey() { // [ka]
    return [G.haloStrokeXl, G.haloStrokeLg, G.haloStrokeMd, G.haloStrokeSm, G.haloBlurXl, G.haloBlurLg, G.haloBlurMd, G.haloBlurSm,
      G.haloOpXl, G.haloOpLg, G.haloOpMd, G.haloOpSm, G.extraStrokeOuter, G.extraStrokeCore, G.extraBlurOuter, G.extraBlurCore,
      G.extraFadeR, G.extraOpOuter].join(",");
  }
  function haloSprite(half, scale, dpr) { // [oi]
    const key = "h|" + half.toFixed(2) + "|" + scale + "|" + dpr + "|" + spriteKey();
    let a = sprites.get(key);
    if (!a) {
      a = makeSprite([
        { stroke: G.haloStrokeXl, blur: G.haloBlurXl, opacity: G.haloOpXl },
        { stroke: G.haloStrokeLg, blur: G.haloBlurLg, opacity: G.haloOpLg },
        { stroke: G.haloStrokeMd, blur: G.haloBlurMd, opacity: G.haloOpMd },
        { stroke: G.haloStrokeSm, blur: G.haloBlurSm, opacity: G.haloOpSm }
      ], half, scale, dpr, 0);
      sprites.set(key, a);
    }
    return a;
  }
  function extraSprite(half, scale, dpr) { // [ai]
    const key = "e|" + half.toFixed(2) + "|" + scale + "|" + dpr + "|" + spriteKey();
    let a = sprites.get(key);
    if (!a) {
      a = makeSprite([
        { stroke: G.extraStrokeOuter, blur: G.extraBlurOuter, opacity: G.extraOpOuter },
        { stroke: G.extraStrokeCore, blur: G.extraBlurCore, opacity: 1 }
      ], half, scale, dpr, G.extraFadeR);
      sprites.set(key, a);
    }
    return a;
  }
  function tinted(sprite, r, g, b, cache) { // [Bo]
    const key = r << 16 | g << 8 | b;
    if (cache.canvas && cache.tint === key && cache.src === sprite) return cache.canvas;
    let c = cache.canvas, img = cache.img;
    if (!c || !img || cache.src !== sprite) {
      c = document.createElementNS(XHTML_NS, "canvas");
      c.width = sprite.canvas.width;
      c.height = sprite.canvas.height;
      const x = c.getContext("2d");
      img = x ? x.createImageData(c.width, c.height) : null;
    }
    const ctx = c.getContext("2d");
    if (ctx && img) {
      const u = img.data, d = sprite.alpha;
      for (let h = 0, f = 0; h < d.length; h++, f += 4) { u[f] = r; u[f + 1] = g; u[f + 2] = b; u[f + 3] = d[h]; }
      ctx.putImageData(img, 0, 0);
    }
    cache.canvas = c; cache.img = img; cache.tint = key; cache.src = sprite;
    return c;
  }
  const rgbOut = [255, 255, 255];
  function parseRgb(s) { // [zo] "#rrggbb" or "rgb(r,g,b)"
    if (s[0] === "#") {
      rgbOut[0] = parseInt(s.slice(1, 3), 16); rgbOut[1] = parseInt(s.slice(3, 5), 16); rgbOut[2] = parseInt(s.slice(5, 7), 16);
      return rgbOut;
    }
    let e = 4, n = 0, o = 0;
    while (e < s.length && o < 3) {
      const a = s.charCodeAt(e++);
      if (a >= 48 && a <= 57) n = n * 10 + (a - 48);
      else if (a === 44 || a === 41) { rgbOut[o++] = n; n = 0; }
    }
    return rgbOut;
  }

  // [Ho] with MetalText's mask: sample points every 2 device px inside the
  // glyphs, and the glyph alpha plus a blurred skirt (peak 0.5) as the clip.
  function createGlow(inst, host) {
    const n = inst.cssWidth, o = inst.cssHeight, scale = 1, dpr = Math.min(3, inst.win.devicePixelRatio || 1);
    const ratio = perimeter(n, o, inst.cornerRadius) / perimeter(REF_W, REF_H, REF_R);
    const halo = haloSprite(Math.max(1, G.haloHalfLen * ratio), scale, dpr);
    const extra = extraSprite(Math.max(0.6, G.extraHalfLen * ratio), scale, dpr);
    const margin = Math.ceil(Math.max(halo.ay, extra.ay) + G.extraOutward * ratio * scale + 2);
    const mk = (tag) => inst.doc.createElementNS(XHTML_NS, tag);
    const wrap = mk("span"), env = mk("span"), canvas = mk("canvas");
    // .metal-fx-glow-svg (dark): opacity 0.7, no blend mode
    wrap.style.cssText = "position:absolute;display:block;inset:0;left:0;top:0;width:100%;height:100%;overflow:visible;z-index:3;pointer-events:none;opacity:0.7";
    env.style.cssText = "position:absolute;display:block;inset:0;left:0;top:0;pointer-events:none;opacity:0";
    const W = n + 2 * margin, H = o + 2 * margin;
    canvas.width = Math.ceil(W * dpr);
    canvas.height = Math.ceil(H * dpr);
    canvas.style.cssText = "position:absolute;left:" + -margin + "px;top:" + -margin + "px;width:" + W + "px;height:" + H + "px;pointer-events:none";
    env.appendChild(canvas);
    wrap.appendChild(env);
    host.appendChild(wrap);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    // sample points [et]: the run painted white at the device pixel ratio over
    // the wrapper's box. (White, as the package paints it here: text engines
    // antialias white and black glyphs differently, so the black per-frame
    // mask would not give the same edge.)
    const J = inst.win.devicePixelRatio || 1, mc = mk("canvas"), points = [];
    mc.width = Math.max(1, Math.round(n * J));
    mc.height = Math.max(1, Math.round(o * J));
    const mcx = mc.getContext("2d"); // (a default context, as the package's: it rasterises like the metal canvas)
    if (!mcx) return null;
    mcx.fillStyle = "#fff";
    paintText(mcx, inst.geom, J);
    const mpx = mcx.getImageData(0, 0, mc.width, mc.height).data, step = Math.max(1, Math.round(2 * J));
    for (let y = step >> 1; y < mc.height; y += step) {
      for (let x = step >> 1; x < mc.width; x += step) {
        if (mpx[(y * mc.width + x) * 4 + 3] > 128) points.push({ x: x / J, y: y / J, arc: points.length });
      }
    }
    if (points.length === 0) return null;

    // the clip: the mask drawn into the glow canvas, plus its blur at half peak
    const M = mk("canvas");
    M.width = canvas.width; M.height = canvas.height;
    const y = M.getContext("2d", { willReadFrequently: true });
    let maskAlpha = null;
    if (y) {
      y.scale(dpr, dpr);
      y.drawImage(mc, margin, margin, n, o);
      const C = y.getImageData(0, 0, M.width, M.height).data, N = M.width * M.height, E = new Float32Array(N);
      for (let S = 0, B = 3; S < N; S++, B += 4) E[S] = C[B] / 255;
      const P = gaussBlur(Float32Array.from(E), M.width, M.height, MASK_BLUR * dpr);
      let peak = 0;
      for (let S = 0; S < N; S++) if (P[S] > peak) peak = P[S];
      const k = peak > 0 ? MASK_PEAK / peak : 0, F = new Uint8ClampedArray(N);
      for (let S = 0; S < N; S++) F[S] = Math.round(Math.max(E[S], P[S] * k) * 255);
      maskAlpha = F;
    }
    return {
      wrap, env, canvas, ctx, maskAlpha, maskReady: !!maskAlpha, margin, dpr, halo, extra,
      haloTint: { canvas: null, img: null, tint: -1, src: null },
      extraTint: { canvas: null, img: null, tint: -1, src: null },
      width: n, height: o, cornerRadius: inst.cornerRadius, perim: points,
      currentIdx: 0, appearedAt: 0, glowOpacity: 0, relocTween: null, relocNextIdx: -1, relocMul: 0, envClock: 0,
      lastTickMs: 0, wanderS: 0, wanderTargetS: 0, wanderFrames: 0,
      tintFrom: { r: 255, g: 255, b: 255 }, tintTarget: { r: 255, g: 255, b: 255 }, tintTween: null, tintHoldUntil: 0,
      dX: NaN, dY: NaN, dAng: NaN, dEX: NaN, dEY: NaN, dHOp: NaN, dEOp: NaN, dHaloTint: "", dExtraTint: "",
      dirty: true, dEnv: -1
    };
  }

  function copyGlowState(a, b) { // [yi] a rebuilt glow carries on where the old one was
    b.currentIdx = Math.min(a.currentIdx, Math.max(0, b.perim.length - 1));
    b.appearedAt = a.appearedAt; b.glowOpacity = a.glowOpacity; b.relocTween = a.relocTween; b.relocNextIdx = a.relocNextIdx;
    b.relocMul = a.relocMul; b.envClock = a.envClock; b.lastTickMs = a.lastTickMs; b.wanderS = a.wanderS;
    b.wanderTargetS = a.wanderTargetS; b.wanderFrames = a.wanderFrames; b.tintFrom = a.tintFrom; b.tintTarget = a.tintTarget;
    b.tintTween = a.tintTween; b.tintHoldUntil = a.tintHoldUntil; b.dEnv = a.relocMul;
    b.env.style.opacity = a.relocMul.toFixed(3);
  }

  // [bi] one glow step (point mode, dark theme; the cursor catch-light is off
  // in the package unless configured, and has no pointer here). Returns true
  // while a fade is running, so the loop ticks it every animation frame.
  function glowTick(t, inst, now, gain) {
    const s = t.perim;
    if (s.length === 0) return false;
    const c = 2;
    let u = -1, d = t.currentIdx, h = 0;
    for (let k = 0; k < s.length; k++) {
      const Q = lumAt(inst, s[k].x, s[k].y, c);
      if (Q > u) { u = Q; d = k; }
      if (k === t.currentIdx) h = Q;
    }
    const f = t.appearedAt > 0 && now - t.appearedAt < G.minDwellMs;
    const p = G.baseOp + (G.peakOp - G.baseOp) * rangeStep(G.lumLo, G.lumHi, h);
    const g = !f && u - h > RELOC_MARGIN;
    const M = t.lastTickMs > 0 ? Math.min(200, Math.max(0.5, now - t.lastTickMs)) : TICK_MS;
    t.lastTickMs = now;
    t.envClock += Math.min(M, ENV_STEP_MAX);
    const y = (k) => 1 - Math.pow(1 - k, M / TICK_MS);
    const appear = () => {
      t.appearedAt = now; t.wanderS = 0; t.wanderTargetS = 0; t.wanderFrames = 0;
      t.relocTween = tween(0, 1, Math.max(1, G.relocFadeMs), EASE.smoothstep);
      startTween(t.relocTween, t.envClock);
    };
    const leave = (k) => {
      t.relocNextIdx = k;
      t.relocTween = tween(1, 0, Math.max(1, G.relocFadeOutMs), EASE.smoothstep);
      startTween(t.relocTween, t.envClock);
    };
    if (t.relocTween && t.relocTween.done && t.relocTween.to === 0) {
      const k = t.relocNextIdx;
      if (k < 0) { t.appearedAt = 0; t.relocTween = null; } // (the cursor hand-offs; unreachable here)
      else {
        t.currentIdx = k;
        const Q = lumAt(inst, s[k].x, s[k].y, c);
        t.glowOpacity = G.baseOp + (G.peakOp - G.baseOp) * rangeStep(G.lumLo, G.lumHi, Q);
        appear();
      }
    }
    if (!t.relocTween || t.relocTween.done) {
      if (t.appearedAt === 0) { t.currentIdx = d; t.glowOpacity = p; appear(); }
      else if (g) leave(d);
    }
    t.glowOpacity += (p - t.glowOpacity) * y(G.fadeRate);
    t.glowOpacity = Math.max(0, Math.min(1, t.glowOpacity));
    t.relocMul = t.relocTween ? tweenAt(t.relocTween, t.envClock) : 1;
    const F = perimeter(t.width, t.height, t.cornerRadius) / perimeter(REF_W, REF_H, REF_R), S = G.wanderRange * F;
    t.wanderFrames += M;
    if (t.wanderFrames >= WANDER_MS) { t.wanderTargetS = (Math.random() * 2 - 1) * S; t.wanderFrames = 0; }
    t.wanderS += (t.wanderTargetS - t.wanderS) * y(G.wanderLerp);
    const pt = s[t.currentIdx];
    const B = pt.x + t.wanderS, K = pt.y, nt = 0, U = B, _ = K;
    const V = colorAt(inst, B, K, c);
    if (t.tintTween) {
      if (t.tintTween.done && now >= t.tintHoldUntil) {
        t.tintFrom = { r: t.tintTarget.r, g: t.tintTarget.g, b: t.tintTarget.b };
        t.tintTarget = { r: V.r, g: V.g, b: V.b };
        t.tintTween = tween(0, 1, TINT_MS);
        startTween(t.tintTween, now);
        t.tintHoldUntil = now + TINT_HOLD_MS;
      }
    } else {
      t.tintFrom = { r: V.r, g: V.g, b: V.b };
      t.tintTarget = { r: V.r, g: V.g, b: V.b };
      t.tintTween = tween(0, 1, TINT_MS);
      startTween(t.tintTween, now);
      t.tintHoldUntil = now + TINT_HOLD_MS;
    }
    tweenAt(t.tintTween, now);
    const Z = t.tintTween.val;
    const kr = t.tintFrom.r + (t.tintTarget.r - t.tintFrom.r) * Z, kg = t.tintFrom.g + (t.tintTarget.g - t.tintFrom.g) * Z,
      kb = t.tintFrom.b + (t.tintTarget.b - t.tintFrom.b) * Z, q = Math.max(kr, kg, kb) || 1;
    const O = "rgb(" + Math.round(255 * (kr / q)) + "," + Math.round(255 * (kg / q)) + "," + Math.round(255 * (kb / q)) + ")";
    const D = "#ffffff";
    const $ = Math.max(0, Math.min(1, gain)) * G.pointGain;
    const W = Math.min(1, t.glowOpacity * G.haloOpMul * $), et = Math.min(1, t.glowOpacity * G.extraIntensity * $);
    if (Math.abs(t.relocMul - t.dEnv) > 2e-3) {
      const k = t.relocMul >= 0.998 && t.dEnv < 0.998;
      t.dEnv = t.relocMul;
      t.env.style.opacity = t.relocMul.toFixed(3);
      if (k) t.dirty = true;
    }
    const fading = !!(t.relocTween && !t.relocTween.done);
    const moved = !(Math.abs(B - t.dX) < MOVE_EPS && Math.abs(K - t.dY) < MOVE_EPS && Math.abs(nt - t.dAng) < ANG_EPS &&
      Math.abs(U - t.dEX) < MOVE_EPS && Math.abs(_ - t.dEY) < MOVE_EPS);
    const faded = !(Math.abs(W - t.dHOp) < OP_EPS && Math.abs(et - t.dEOp) < OP_EPS);
    const retinted = O !== t.dHaloTint || D !== t.dExtraTint;
    if (t.dirty || moved || faded || retinted) {
      t.dX = B; t.dY = K; t.dAng = nt; t.dEX = U; t.dEY = _; t.dHOp = W; t.dEOp = et; t.dHaloTint = O; t.dExtraTint = D;
      t.dirty = false;
      drawGlow(t, B, K, nt, U, _, W, et, O, D);
    }
    return fading;
  }

  function drawGlow(t, e, n, o, a, i, r, l, s, c) { // [wi] point mode
    const u = t.ctx, d = t.canvas, h = t.dpr, f = t.margin;
    u.setTransform(1, 0, 0, 1, 0, 0);
    u.globalCompositeOperation = "source-over";
    u.globalAlpha = 1;
    u.clearRect(0, 0, d.width, d.height);
    if ((r <= 2e-3 && l <= 2e-3) || !t.maskReady) return;
    let p = null, g = null;
    if (r > 2e-3) { const v = parseRgb(s); p = tinted(t.halo, v[0], v[1], v[2], t.haloTint); }
    if (l > 2e-3) {
      if (c === "#ffffff") g = t.extra.canvas;
      else { const v = parseRgb(c); g = tinted(t.extra, v[0], v[1], v[2], t.extraTint); }
    }
    u.save();
    u.scale(h, h);
    if (p) {
      u.save(); u.translate(e + f, n + f); u.rotate(o); u.globalAlpha = r;
      u.drawImage(p, -t.halo.ax, -t.halo.ay, t.halo.w, t.halo.h); u.restore();
    }
    if (g) {
      u.save(); u.translate(a + f, i + f); u.rotate(o); u.globalAlpha = l;
      u.drawImage(g, -t.extra.ax, -t.extra.ay, t.extra.w, t.extra.h); u.restore();
    }
    u.restore();
    const m = t.maskAlpha;
    if (!m) return;
    const b = u.getImageData(0, 0, d.width, d.height), w = b.data;
    for (let M = 0, y = 3; M < m.length; M++, y += 4) {
      const C = m[M];
      if (C !== 255) {
        if (C === 0) { w[y] = 0; continue; }
        w[y] = (w[y] * C + 127) / 255;
      }
    }
    u.putImageData(b, 0, 0);
  }

  function rebuildGlow(inst) {
    const old = inst.glow;
    inst.glow = null;
    while (inst.glowHost.firstChild) inst.glowHost.removeChild(inst.glowHost.firstChild);
    const g = createGlow(inst, inst.glowHost);
    if (g && old) copyGlowState(old, g);
    inst.glow = g;
  }

  // --------------------------------------------------------------- instances
  const byElement = new WeakMap();
  const NOOP = Object.freeze({ setPaused() {}, refresh() {}, destroy() {} });
  // elements that never show children (void and replaced ones) get no metal
  const NO_TEXT = /^(img|input|textarea|select|canvas|video|audio|iframe|object|embed|svg|math|br|hr|area|base|col|link|meta|source|track|wbr)$/i;

  // The wrapper is MetalFx's root as MetalText leaves it ("bare": no fill, no
  // rims): inline-flex, isolated, hidden until the first metal frame. Every
  // part states its position, so page rules like `.stage * { position:
  // absolute }` can't move it.
  const ROOT_CSS = "position:relative;display:inline-flex;align-items:center;justify-content:center;isolation:isolate;" +
    "overflow:visible;background:transparent;margin:0;padding:0;border:0;border-radius:4px;opacity:0;visibility:hidden;transition:none";
  const CANVAS_CSS = "position:absolute;inset:0;left:0;top:0;width:100%;height:100%;display:block;z-index:6;pointer-events:none;" +
    "border-radius:inherit;margin:0;padding:0;border:0";
  const GLOW_HOST_CSS = "position:absolute;display:block;inset:0;left:0;top:0;pointer-events:none;z-index:7;border-radius:inherit";
  const CONTENT_CSS = "position:relative;z-index:5;display:inline-flex;align-items:center;justify-content:center;width:100%;" +
    "pointer-events:none;margin:0;padding:0;border:0";
  const TEXT_CSS = "position:static;white-space:nowrap;pointer-events:auto;margin:0;padding:0;border:0";
  const RIM_CSS = "position:absolute;left:0;top:0;pointer-events:none;z-index:8;margin:0;padding:0;border:0";

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }

  function reveal(inst) {
    if (inst.revealed || inst.dead) return;
    inst.revealed = true;
    if (inst.revealTimer) { clearTimeout(inst.revealTimer); inst.revealTimer = 0; }
    const s = inst.root.style;
    s.opacity = "1";
    s.visibility = "visible";
    s.transition = "opacity 0.15s ease-out";
  }

  function applyPaused(inst) { // [pe] { paused }
    const p = inst.userPaused || inst.reduced;
    if (p === inst.paused) return;
    inst.paused = p;
    if (p) freeze(inst);
    else {
      inst.frozen = null;
      if (R && !R.contextLost) startLoop();
    }
  }

  // Layout -> canvas sizes, glyph mask, rim and glow. Cheap when nothing moved.
  function measure(inst, force) {
    if (inst.dead) return;
    if (!inst.root.isConnected) {
      if (inst.seen) destroyInstance(inst);
      return;
    }
    inst.seen = true;
    inst.connected = true;
    const g = textGeometry(inst);
    const dpr = inst.win.devicePixelRatio || 1;
    inst.transformed = g.transformed;
    if (!force && dpr === inst.dpr && sameGeometry(g, inst.geom)) return;
    inst.geom = g;
    const cssW = Math.max(1, Math.round(g.w)), cssH = Math.max(1, Math.round(g.h));
    inst.cssWidth = cssW;
    inst.cssHeight = cssH;
    inst.cornerRadius = Math.min(TEXT_RADIUS, Math.min(cssW, cssH) / 2);
    inst.root.style.borderRadius = inst.cornerRadius + "px";
    inst.dpr = dpr; // [cn]
    const cw = Math.max(1, Math.round(cssW * dpr)), ch = Math.max(1, Math.round(cssH * dpr));
    if (inst.canvas.width !== cw) inst.canvas.width = cw;
    if (inst.canvas.height !== ch) inst.canvas.height = ch;
    const mc = inst.maskCanvas, mx = inst.maskCtx;
    if (mc.width !== cw) mc.width = cw;
    if (mc.height !== ch) mc.height = ch;
    mx.setTransform(1, 0, 0, 1, 0, 0);
    mx.clearRect(0, 0, cw, ch);
    mx.fillStyle = "#000";
    paintText(mx, g, dpr);
    paintRim(inst, g);
    if (inst.glowHost) rebuildGlow(inst);
    if (inst.everCopied) composite(inst);
    else if (R && !R.contextLost) startLoop(); // (first measure after a late insert)
  }

  function create(el, opts) {
    const doc = el.ownerDocument || document;
    const win = doc.defaultView || window;
    sweep();
    const prev = byElement.get(el);
    if (prev) destroyInstance(prev);
    const r = getRenderer();
    if (!r) return null;
    // A renderer with no instances starts its clock again, as the package's
    // (which is rebuilt from scratch) does.
    if (r.instances.length === 0) r.startMs = performance.now();

    const strength = num(opts.strength, 0.9);
    const metalOpacity = num(opts.metalOpacity, TEXT_DEFAULTS.metalOpacity);
    let innerShadow = TEXT_DEFAULTS.innerShadow;
    if (opts.innerShadow === null || opts.innerShadow === false) innerShadow = null;
    else if (opts.innerShadow && typeof opts.innerShadow === "object") {
      const o = opts.innerShadow;
      innerShadow = {
        offsetY: num(o.offsetY, TEXT_DEFAULTS.innerShadow.offsetY),
        blur: num(o.blur, TEXT_DEFAULTS.innerShadow.blur),
        alpha: num(o.alpha, TEXT_DEFAULTS.innerShadow.alpha)
      };
    }

    const mk = (tag) => doc.createElementNS(XHTML_NS, tag);
    const saved = Array.prototype.slice.call(el.childNodes);
    const root = mk("span"), canvas = mk("canvas"), content = mk("span"), text = mk("span");
    root.setAttribute("data-zia-metal", "");
    root.style.cssText = ROOT_CSS;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = CANVAS_CSS;
    content.style.cssText = CONTENT_CSS;
    text.style.cssText = TEXT_CSS;
    if (opts.font) text.style.font = String(opts.font);
    if (opts.color) text.style.color = String(opts.color);
    if (opts.letterSpacing != null && opts.letterSpacing !== "") {
      text.style.letterSpacing = typeof opts.letterSpacing === "number" ? opts.letterSpacing + "px" : String(opts.letterSpacing);
    }
    let glowHost = null;
    if (opts.glow) {
      glowHost = mk("span");
      glowHost.setAttribute("aria-hidden", "true");
      glowHost.style.cssText = GLOW_HOST_CSS;
    }
    let rim = null;
    if (innerShadow) {
      rim = mk("canvas");
      rim.setAttribute("aria-hidden", "true");
      rim.style.cssText = RIM_CSS;
    }
    const parts = { el, doc, win, r, opts, saved, root, canvas, content, text, rim, glowHost, innerShadow, strength, metalOpacity };
    let inst = null;
    try {
      for (const n of saved) text.appendChild(n);
      content.appendChild(text);
      root.appendChild(canvas);
      if (glowHost) root.appendChild(glowHost);
      root.appendChild(content);
      if (rim) root.appendChild(rim);
      el.appendChild(root);
      inst = start(parts);
    } catch (e) {
      inst = byElement.get(el);
      if (inst && inst.root === root) destroyInstance(inst);
      else putBack(el, root, saved);
      throw e;
    }
    if (!inst) putBack(el, root, saved);
    return inst;
  }

  // The wrapper is in place: canvases, the instance, its observers, the loop.
  function start(p) {
    const { el, doc, win, r, opts, saved, root, canvas, content, text, rim, glowHost, innerShadow } = p;
    const ctx = canvas.getContext("2d", { alpha: true });
    const maskCanvas = doc.createElementNS(XHTML_NS, "canvas");
    const maskCtx = maskCanvas.getContext("2d");
    if (!ctx || !maskCtx) return null;

    const mqMotion = win.matchMedia ? win.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const inst = {
      el, doc, win, root, canvas, ctx, content, text, rim, glowHost, maskCanvas, maskCtx, saved,
      cssWidth: 1, cssHeight: 1, cornerRadius: 0, dpr: 0, geom: null, transformed: false,
      shaderScale: num(opts.shaderScale, TEXT_DEFAULTS.shaderScale),
      opacityMul: clamp01(p.strength * p.metalOpacity), // MetalFx strength = strength * metalOpacity
      glowGain: Math.max(0, num(opts.glowGain, TEXT_DEFAULTS.glowGain)),
      innerShadow,
      visible: true, connected: root.isConnected, seen: root.isConnected,
      userPaused: !!opts.paused, reduced: !!(mqMotion && mqMotion.matches), paused: false,
      everCopied: false, frozen: null, onFirstCopy: null, revealed: false,
      glow: null, glowFast: false, dead: false,
      ro: null, io: null, mqDpr: null, listeners: [], revealTimer: 0
    };
    inst.paused = inst.userPaused || inst.reduced;
    inst.onFirstCopy = () => reveal(inst);
    byElement.set(el, inst);
    r.instances.push(inst);
    if (glowHost) r.glowUsers++;
    measure(inst, true);

    const on = (target, type, fn, o) => {
      try { target.addEventListener(type, fn, o); inst.listeners.push([target, type, fn, o]); } catch (e) { /* old API */ }
    };
    const guard = (fn) => function () { try { fn.apply(null, arguments); } catch (e) { warn("update failed.", e); } };
    const remeasure = guard(() => { measure(inst, false); });

    if (typeof ResizeObserver !== "undefined") {
      inst.ro = new ResizeObserver(remeasure);
      inst.ro.observe(root);
    }
    if (typeof IntersectionObserver !== "undefined") {
      inst.io = new IntersectionObserver(guard((entries) => {
        for (const e of entries) {
          inst.visible = e.isIntersecting; // [Rr]
          if (e.isIntersecting && R && !R.contextLost) startLoop();
        }
      }), { rootMargin: "64px" });
      inst.io.observe(root);
    }
    if (mqMotion) on(mqMotion, "change", guard(() => { inst.reduced = mqMotion.matches; applyPaused(inst); }));
    const armDpr = () => {
      if (inst.mqDpr) {
        try { inst.mqDpr[0].removeEventListener("change", inst.mqDpr[1]); } catch (e) { /* ignore */ }
        inst.mqDpr = null;
      }
      if (inst.dead || !win.matchMedia) return;
      const mq = win.matchMedia("(resolution: " + (win.devicePixelRatio || 1) + "dppx)");
      const fn = guard(() => { if (!inst.dead) { measure(inst, true); armDpr(); } });
      try { mq.addEventListener("change", fn); inst.mqDpr = [mq, fn]; } catch (e) { /* old API */ }
    };
    armDpr();
    if (doc.fonts) {
      on(doc.fonts, "loadingdone", remeasure);
      try { doc.fonts.ready.then(() => { if (!inst.dead) remeasure(); }, () => {}); } catch (e) { /* no promise */ }
    }
    // measured under a transform (a slide mid-transition): measure again when
    // whatever was moving it settles
    const settled = guard((e) => {
      if (inst.transformed && e.target && e.target.contains && e.target.contains(root)) measure(inst, false);
    });
    on(doc, "transitionend", settled, true);
    on(doc, "animationend", settled, true);

    // (port) a frame should have come by now if the wrapper is on screen; if
    // the GL has not drawn one, show the plain text rather than nothing.
    // Off screen or in a hidden tab it simply waits, as the package does.
    const fallback = () => {
      inst.revealTimer = 0;
      if (inst.dead || inst.revealed) return;
      if (inst.visible && inst.connected && !doc.hidden) reveal(inst);
      else inst.revealTimer = setTimeout(fallback, REVEAL_FALLBACK_MS);
    };
    inst.revealTimer = setTimeout(fallback, REVEAL_FALLBACK_MS);
    if (!r.contextLost) startLoop();
    return inst;
  }

  // The element's own nodes back where the wrapper is (or at the end if the
  // wrapper never made it in).
  function putBack(el, root, saved) {
    if (root.parentNode === el) {
      for (const n of saved) el.insertBefore(n, root);
      el.removeChild(root);
    } else {
      if (root.parentNode) root.parentNode.removeChild(root);
      for (const n of saved) el.appendChild(n);
    }
  }

  function destroyInstance(inst) { // [Mr] plus the React unmount
    if (inst.dead) return;
    inst.dead = true;
    try { if (inst.ro) inst.ro.disconnect(); } catch (e) { /* ignore */ }
    try { if (inst.io) inst.io.disconnect(); } catch (e) { /* ignore */ }
    try { if (inst.mqDpr) inst.mqDpr[0].removeEventListener("change", inst.mqDpr[1]); } catch (e) { /* ignore */ }
    for (const l of inst.listeners) {
      try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (e) { /* ignore */ }
    }
    inst.listeners.length = 0;
    if (inst.revealTimer) clearTimeout(inst.revealTimer);
    if (R) {
      const i = R.instances.indexOf(inst);
      if (i !== -1) {
        R.instances.splice(i, 1);
        if (inst.glowHost) R.glowUsers--;
      }
      if (R.instances.length === 0) {
        stopLoop();
        scheduleTeardown();
      }
    }
    if (byElement.get(inst.el) === inst) byElement.delete(inst.el);
    // the element gets its own nodes back, where the wrapper was; if someone
    // else has since replaced the wrapper, the element is theirs and is left be
    const root = inst.root, el = inst.el;
    try {
      if (root.parentNode === el) {
        for (const n of inst.saved) el.insertBefore(n, root);
        el.removeChild(root);
      } else if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
    } catch (e) { /* ignore */ }
    if (R && R.instances.length === 0) scheduleTeardown();
    for (const c of [inst.canvas, inst.maskCanvas, inst.rim, inst.frozen, inst.glow && inst.glow.canvas]) {
      if (c) { c.width = 0; c.height = 0; }
    }
    inst.frozen = null;
    inst.glow = null;
  }

  function handle(inst) {
    return Object.freeze({
      setPaused(on) {
        try { if (!inst.dead) { inst.userPaused = !!on; applyPaused(inst); } } catch (e) { warn("setPaused failed.", e); }
      },
      refresh() {
        try {
          if (inst.dead) return;
          measure(inst, true);
          if (R && !R.contextLost) startLoop();
        } catch (e) { warn("refresh failed.", e); }
      },
      destroy() {
        try { destroyInstance(inst); } catch (e) { warn("destroy failed.", e); }
      }
    });
  }

  function ziaMetalText(el, opts) {
    try {
      if (!el || el.nodeType !== 1 || NO_TEXT.test(el.localName || "") || !/\S/.test(el.textContent || "")) return NOOP;
      const inst = create(el, opts && typeof opts === "object" ? opts : {});
      if (inst) return handle(inst);
    } catch (e) {
      warn("could not start, leaving the text plain.", e);
      try {
        const inst = byElement.get(el);
        if (inst) destroyInstance(inst);
      } catch (e2) { /* ignore */ }
    }
    try { if (R && R.instances.length === 0) scheduleTeardown(); } catch (e) { /* ignore */ }
    return NOOP;
  }

  // True when WebGL2 is there (a throwaway probe the first time, as the
  // package's isMetalFxSupported).
  ziaMetalText.supported = function () {
    try {
      if (R) return true;
      if (glUnavailable) return false;
      if (probe === null) {
        const c = document.createElementNS(XHTML_NS, "canvas");
        const gl = c.getContext("webgl2");
        probe = !!gl;
        if (gl) loseContext(gl);
      }
      return probe;
    } catch (e) {
      return false;
    }
  };

  window.ziaMetalText = ziaMetalText;
})();
