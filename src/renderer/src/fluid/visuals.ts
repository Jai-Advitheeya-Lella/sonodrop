/**
 * The visualisers: each one is a fragment shader painting from the same inputs.
 * To add one, write a shader body and append it to VISUALS — it appears in the picker automatically.
 *
 * Inputs: uRes, uTime, uBg / uA / uB / uC (theme colours), uLight (1 on light themes),
 * uAudio (bass, mid, treble, beat), band(x) and wave(x) for the spectrum and waveform at x in 0..1.
 */
const HEAD = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uBg, uA, uB, uC;
uniform float uLight;
uniform vec4 uAudio;
uniform sampler2D uFeed;

const float PI = 3.14159265;
float band(float x) { return texture(uFeed, vec2(clamp(x, 0.0, 1.0), 0.25)).r; }
float wave(float x) { return texture(uFeed, vec2(clamp(x, 0.0, 1.0), 0.75)).r * 2.0 - 1.0; }
// Folds any x back and forth across 0..1, so a pattern can repeat along the spectrum without a seam.
float fold(float x) { return abs(fract(x * 0.5) * 2.0 - 1.0); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
// Light themes get pigment on paper; dark themes get light on black.
vec3 paint(vec3 base, vec3 ink, float amount) { return mix(base, ink, clamp(amount, 0.0, 1.0)); }
vec3 finish(vec3 col) { return col + (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0; }
`

const INK = `
// Ink dropped in water: plumes folding into each other, pushed around by the bass.
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.11;
  vec2 q = vec2(fbm(uv * 1.5 + t), fbm(uv * 1.5 - t + 5.2));
  vec2 r = vec2(fbm(uv * 1.3 + 3.0 * q + vec2(1.7, 9.2) + t * 1.3), fbm(uv * 1.3 + 3.0 * q + vec2(8.3, 2.8) - t));
  float f = fbm(uv * 1.1 + (2.0 + 2.6 * uAudio.x) * r);

  vec3 col = uBg;
  col = paint(col, uA, smoothstep(0.3, 0.8, f) * 0.95);
  col = paint(col, uB, smoothstep(0.35, 0.95, length(q)) * 0.75);
  col = paint(col, uC, smoothstep(0.25, 0.8, r.x * r.y * 2.4) * 0.8);
  // Fine veins where the pigment thins out.
  float veins = abs(fract(f * 7.0 + uAudio.y * 0.6) - 0.5);
  col *= 0.8 + 0.28 * smoothstep(0.0, 0.22, veins);
  col += (uLight > 0.5 ? -0.05 : 0.09) * uAudio.w;
  outColor = vec4(finish(col), 1.0);
}`

const AURORA = `
// Curtains of light: each ribbon's height follows a slice of the spectrum.
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float aspect = uRes.x / uRes.y;
  float x = uv.x / aspect + 0.5;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float lift = band(fold(x * 1.1 + fi * 0.38)) * 0.34;
    float y = -0.3 + fi * 0.09 + lift
            + 0.10 * sin(uv.x * 1.9 + uTime * (0.25 + 0.07 * fi) + fi * 1.3)
            + 0.05 * sin(uv.x * 5.1 - uTime * 0.35 + fi * 2.1);
    float d = uv.y - y;
    // Sharp underneath, a long fade upwards, and vertical rays shimmering through it.
    float curtain = d > 0.0 ? exp(-d * (3.2 - 1.4 * uAudio.x)) : exp(d * 42.0);
    float rays = 0.55 + 0.45 * noise(vec2(uv.x * 26.0 + fi * 9.0, uTime * 0.6 + fi));
    vec3 tint = mix(mix(uA, uB, fi / 4.0), uC, 0.5 + 0.5 * sin(fi * 1.7 + uTime * 0.2));
    glow += tint * curtain * rays * (0.34 + 0.2 * uAudio.y);
  }
  float stars = step(0.9965, hash(floor(gl_FragCoord.xy / 2.0))) * (0.4 + 0.6 * uAudio.z);
  vec3 col = mix(uBg + glow + stars * (1.0 - uLight), uBg * (1.0 - 0.75 * clamp(glow, 0.0, 1.0)) + glow * 0.55, uLight);
  outColor = vec4(finish(col), 1.0);
}`

const MANDALA = `
// A spirograph that redraws itself: mirrored rings of petals, one ring per slice of the spectrum.
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float petals = 6.0 + 2.0 * mod(fi, 3.0);
    float spin = uTime * (0.08 + 0.03 * fi) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0);
    float level = band(0.04 + fi * 0.13);
    float radius = 0.07 + 0.055 * fi + 0.02 * uAudio.x
                 + (0.012 + 0.07 * level) * cos((a + spin) * petals)
                 + 0.012 * sin((a - spin) * petals * 2.0 + uTime);
    float d = abs(r - radius);
    vec3 tint = mix(mix(uA, uB, fi / 6.0), uC, 0.5 + 0.5 * sin(fi * 2.1 + uTime * 0.3));
    glow += tint * (0.0016 / (d + 0.0014)) * (0.35 + 0.9 * level);
  }
  glow += mix(uA, uC, 0.5) * 0.02 / (r + 0.05) * (0.4 + uAudio.x);
  glow *= smoothstep(0.62, 0.3, r);
  vec3 col = mix(uBg + glow, uBg * (1.0 - 0.8 * clamp(glow, 0.0, 1.0)) + glow * 0.5, uLight);
  outColor = vec4(finish(col), 1.0);
}`

const SILK = `
// The waveform, woven: a dozen threads drawn from the same signal, each a little out of step.
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float aspect = uRes.x / uRes.y;
  float x = uv.x / aspect + 0.5;
  float envelope = sin(PI * clamp(x, 0.0, 1.0));
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 14; i++) {
    float fi = float(i) / 13.0;
    float signal = wave(fold(x * 1.4 + fi * 0.42));
    float y = (fi - 0.5) * 0.42 * (0.55 + 0.45 * sin(uTime * 0.25 + x * 2.4 + fi * 5.0))
            + signal * envelope * (0.07 + 0.2 * fi)
            + 0.035 * sin(x * 7.0 + uTime * 0.8 + fi * 9.0);
    float d = abs(uv.y - y);
    vec3 tint = mix(mix(uA, uB, fi), uC, 0.5 + 0.5 * sin(fi * 7.0 + uTime * 0.3));
    glow += tint * (0.0011 / (d + 0.0012)) * (0.35 + 0.65 * envelope);
  }
  glow *= 0.8 + 0.6 * uAudio.w;
  vec3 col = mix(uBg + glow, uBg * (1.0 - 0.8 * clamp(glow, 0.0, 1.0)) + glow * 0.5, uLight);
  outColor = vec4(finish(col), 1.0);
}`

const RAIN = `
// Rain on a still pond, seen from above. Each part of the spectrum owns a patch of water.
float pond(vec2 p) {
  float h = 0.0;
  vec2 cell = floor(p);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 id = cell + vec2(i, j);
    float seed = hash(id);
    float cycle = uTime * (0.35 + 0.3 * seed) + seed * 9.0;
    float age = fract(cycle);
    vec2 centre = id + 0.2 + 0.6 * vec2(hash(id + floor(cycle)), hash(id * 1.7 + floor(cycle)));
    float d = length(p - centre);
    float radius = age * 1.1;
    float strength = (1.0 - age) * (1.0 - age) * (0.25 + 1.6 * band(seed));
    h += strength * sin(34.0 * (d - radius)) * smoothstep(0.22, 0.0, abs(d - radius));
  }
  return h;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 p = uv * 3.2 + vec2(0.0, uTime * 0.03);
  float e = 0.012;
  float h = pond(p);
  vec3 n = normalize(vec3(pond(p - vec2(e, 0.0)) - pond(p + vec2(e, 0.0)), pond(p - vec2(0.0, e)) - pond(p + vec2(0.0, e)), 0.11));
  // The pond floor: slow colour, bent by the ripples above it.
  vec2 bent = uv + n.xy * 0.09;
  float depth = fbm(bent * 1.6 + uTime * 0.04);
  vec3 col = mix(uBg, mix(uA, uB, depth), 0.32 + 0.3 * depth);
  col = mix(col, uC, smoothstep(0.55, 0.9, fbm(bent * 2.3 - uTime * 0.05)) * 0.45);
  float spec = pow(max(dot(n, normalize(vec3(-0.4, 0.5, 0.75))), 0.0), 26.0);
  col += spec * (0.55 + 0.6 * uAudio.w) * mix(vec3(1.0), uA, 0.3);
  col += h * 0.05;
  outColor = vec4(finish(col), 1.0);
}`

export interface Visual {
  id: string
  name: string
  blurb: string
  shader: string
}

export const VISUALS: Visual[] = [
  { id: 'ink', name: 'Ink', blurb: 'Pigment unfolding in water', shader: HEAD + INK },
  { id: 'aurora', name: 'Aurora', blurb: 'Curtains of light', shader: HEAD + AURORA },
  { id: 'mandala', name: 'Mandala', blurb: 'A spirograph that listens', shader: HEAD + MANDALA },
  { id: 'silk', name: 'Silk', blurb: 'The waveform, woven', shader: HEAD + SILK },
  { id: 'rain', name: 'Rain', blurb: 'Drops on a still pond', shader: HEAD + RAIN }
]

export const visualById = (id: string): Visual => VISUALS.find((v) => v.id === id) ?? VISUALS[0]
