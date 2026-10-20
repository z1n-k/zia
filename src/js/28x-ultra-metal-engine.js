// ---------- Metal surfaces: Paper Shaders' liquidMetal as metal-fx draws it
// The shader of metal-fx 2.0.11 (https://libraries.dev, "Liquid metal"), as
// the welcome tour's metal.js has it, in the package's "silver" preset (its
// plain metal: a white tint and only a touch of colour at the edges, where
// "chromatic" splits it into colours), painted into canvases of Zia's own
// rather than into lettering: one hidden WebGL2 canvas draws each surface in
// turn and it's copied over.
//
//   const metal = ziaMetalSurface(canvas, { speed: 0.1, every: 120 });
//   metal.destroy();
//
// `speed` scales the shader's clock (1 is the package's), `every` is the ms
// between frames (66, about 15 a second, is the package's), `band` takes a
// thin strip through the middle of a squarer render (for a line, whose own
// shape would squeeze the pattern). Still under reduced motion; nothing at
// all without WebGL2. The canvas's own width and height set the resolution.
//
// metal-fx is MIT licensed:
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
// The package's NOTICE, which applies to the two shaders below:
//
//   metal-fx
//   Copyright (c) Jakub Antalik
//
//   This product includes software developed by Paper Design, Inc.
//
//     Paper Shaders (https://github.com/paper-design/shaders)
//     Copyright (c) Paper Design, Inc.
//     Licensed under the Apache License, Version 2.0
//     http://www.apache.org/licenses/LICENSE-2.0
//
//   The `liquidMetal` fragment shader is consumed unmodified from the
//   `@paper-design/shaders` npm package; the sizing vertex shader is copied
//   verbatim from `packages/shaders/src/vertex-shader.ts` @ 0.0.80. No changes
//   were made to either shader's source (nor are any made here).

// Shared GLSL pieces (Paper Shaders), copied verbatim from metal-fx's dist.
const ZIA_METAL_DEFINES = `
#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846
`;
const ZIA_METAL_ROTATE = `
vec2 rotate(vec2 uv, float th) {
return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}
`;
const ZIA_METAL_GRAIN = `
color += 1. / 256. * (fract(sin(dot(.014 * gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123) - .5);
`;
const ZIA_METAL_SNOISE = `
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
const ZIA_METAL_FRAG = `#version 300 es
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

${ZIA_METAL_DEFINES}
${ZIA_METAL_ROTATE}
${ZIA_METAL_SNOISE}

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

${ZIA_METAL_GRAIN}

fragColor = vec4(color, opacity);
}
`;
// Paper Shaders' sizing vertex shader (vertex-shader.ts @ 0.0.80), as metal-fx vendors it.
const ZIA_METAL_VERT = /* glsl */ `#version 300 es
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

// (Paper's defaults, then the silver preset's dark tuning)
const ZIA_METAL_PRESET = {
  colorBack: "#00000000",
  colorTint: "#ffffff66",
  repetition: 1.5,
  softness: 0.05,
  shiftRed: 0.3,
  shiftBlue: 0.3,
  distortion: 0.1,
  contour: 0.4,
  angle: 90,
  shape: 0,
  scale: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  originX: 0.5,
  originY: 0.5,
  worldWidth: 0,
  worldHeight: 0,
  fit: 1,
  shaderOpacity: 0.88,
};
const ZIA_METAL_SIZE = 256;
const ziaMetalSurfaces = new Set();
let ziaMetalGL = null;
let ziaMetalFailed = false;
let ziaMetalFrame = 0;

function ziaMetalHex(hex) {
  const e = hex.replace("#", "");
  const a = e.length >= 8 ? parseInt(e.slice(6, 8), 16) / 255 : 1;
  return [parseInt(e.slice(0, 2), 16) / 255, parseInt(e.slice(2, 4), 16) / 255, parseInt(e.slice(4, 6), 16) / 255, a];
}

function ziaMetalSetup() {
  if (ziaMetalGL || ziaMetalFailed) {
    return ziaMetalGL;
  }
  try {
    const canvas = document.createElementNS(XHTML_NS, "canvas");
    canvas.width = ZIA_METAL_SIZE;
    canvas.height = ZIA_METAL_SIZE;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) {
      throw new Error("no WebGL2");
    }
    const compile = (type, src) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || "shader");
      }
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, ZIA_METAL_VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, ZIA_METAL_FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "program");
    }
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    // (the shader samples an image it isn't given here: a 1px stand-in)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    const u = (name) => gl.getUniformLocation(program, name);
    const p = ZIA_METAL_PRESET;
    gl.uniform1i(u("u_image"), 0);
    gl.uniform4fv(u("u_colorBack"), ziaMetalHex(p.colorBack));
    gl.uniform4fv(u("u_colorTint"), ziaMetalHex(p.colorTint));
    for (const key of ["repetition", "softness", "shiftRed", "shiftBlue", "distortion", "contour", "angle", "shape", "originX", "originY", "worldWidth", "worldHeight", "fit", "scale", "rotation", "offsetX", "offsetY"]) {
      gl.uniform1f(u(`u_${key}`), p[key]);
    }
    gl.uniform1i(u("u_isImage"), 0);
    gl.uniform1f(u("u_imageAspectRatio"), 1);
    gl.uniform1f(u("u_pixelRatio"), 1);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      ziaMetalGL = null;
    });
    ziaMetalGL = { canvas, gl, resolution: u("u_resolution"), time: u("u_time") };
  } catch (err) {
    ziaMetalFailed = true;
    noteError("metal: set up", err);
  }
  return ziaMetalGL;
}

function ziaMetalDraw(s, now) {
  const R = ziaMetalSetup();
  const { width: w, height: h } = s.canvas;
  if (!R || !w || !h) {
    return;
  }
  const { gl } = R;
  // its shape, at most ZIA_METAL_SIZE on its longer side; a band is a strip
  // through a render a sixth as tall as it's wide
  const k = ZIA_METAL_SIZE / Math.max(w, s.band ? 0 : h, 1);
  const vw = Math.max(1, Math.round(Math.min(w * k, ZIA_METAL_SIZE)));
  const vh = s.band ? Math.round(vw / 6) : Math.max(1, Math.round(Math.min(h * k, ZIA_METAL_SIZE)));
  gl.viewport(0, 0, vw, vh);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform2f(R.resolution, vw, vh);
  gl.uniform1f(R.time, ((now - s.t0) / 1000) * s.speed);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  const sh = s.band ? Math.max(1, Math.round(vh / 12)) : vh;
  const sy = R.canvas.height - vh + Math.round((vh - sh) / 2);
  s.ctx.clearRect(0, 0, w, h);
  s.ctx.globalAlpha = ZIA_METAL_PRESET.shaderOpacity;
  s.ctx.drawImage(R.canvas, 0, sy, vw, sh, 0, 0, w, h);
}

function ziaMetalTick(now) {
  ziaMetalFrame = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const s of ziaMetalSurfaces) {
    if (!s.canvas.isConnected) {
      continue;
    }
    if (now >= s.next) {
      ziaMetalDraw(s, now);
      s.next = now + s.every;
      s.drawn = true;
    }
  }
  const moving = [...ziaMetalSurfaces].some((s) => !reduced || !s.drawn);
  if (moving && !document.hidden && !ziaMetalFailed) {
    ziaMetalFrame = requestAnimationFrame(ziaMetalTick);
  }
}

function ziaMetalWake() {
  if (!ziaMetalFrame && ziaMetalSurfaces.size) {
    ziaMetalFrame = requestAnimationFrame(ziaMetalTick);
  }
}

function ziaMetalSurface(canvas, { speed = 1, every = 66, band = false } = {}) {
  const ctx = canvas.getContext("2d");
  const s = { canvas, ctx, speed, every, band, t0: performance.now() - Math.random() * 60000, next: 0, drawn: false };
  if (ctx) {
    ziaMetalSurfaces.add(s);
    ziaMetalWake();
  }
  return {
    destroy() {
      ziaMetalSurfaces.delete(s);
    },
  };
}

document.addEventListener("visibilitychange", ziaMetalWake);
