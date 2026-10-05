/** GLSL for the two liquid renderers. Colours and audio levels arrive as uniforms so every theme reuses the same code. */

const COMMON = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uBg, uA, uB, uC;
uniform float uLight;
uniform vec4 uAudio; // bass, mid, treble, beat

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`

/**
 * Background: a lava-lamp of soft metaballs, a film of liquid along the top edge that
 * lets go of slow drips, and a blob that follows the pointer. Drawn at low resolution.
 */
export const AMBIENT = `${COMMON}
uniform vec3 uMouse; // x, y (in height units), strength

float field = 0.0;
vec2 grad = vec2(0.0);
vec3 tint = vec3(0.0);

void blob(vec2 p, vec2 c, float r, vec3 col) {
  vec2 d = p - c;
  float q = dot(d, d) + 1e-5;
  float w = r * r / q;
  field += w;
  grad += -2.0 * r * r * d / (q * q);
  tint += col * w;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = gl_FragCoord.xy / uRes.y;
  float t = uTime;

  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2(aspect * (0.5 + 0.47 * sin(t * (0.050 + 0.013 * fi) + fi * 2.4)),
                  0.48 + 0.44 * cos(t * (0.041 + 0.017 * fi) + fi * 1.7));
    float r = 0.15 + 0.05 * sin(fi * 5.3) + 0.035 * uAudio.x;
    blob(p, c, r, i % 3 == 0 ? uA : (i % 3 == 1 ? uB : uC));
  }

  // Drips: swell while hanging from the top edge, then let go and accelerate.
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float cycle = t / (8.0 + fi * 2.7) + hash(vec2(fi, 1.0));
    float ph = fract(cycle);
    float x = aspect * (0.06 + 0.88 * hash(vec2(fi, floor(cycle))));
    float hang = smoothstep(0.0, 0.5, ph);
    float fall = max(0.0, ph - 0.5) / 0.5;
    float y = 1.03 - 0.07 * hang - 1.3 * fall * fall;
    float r = 0.022 + 0.034 * hang - 0.016 * fall;
    blob(p, vec2(x, y), r, i % 2 == 0 ? uA : uB);
  }

  // The film the drips hang from.
  float top = 1.035 - p.y;
  float film = 0.0011 / (top * top);
  field += film;
  grad.y += 2.0 * 0.0011 / (top * top * top);
  tint += uA * film;

  blob(p, uMouse.xy, 0.085 * uMouse.z, uC);

  vec3 liquid = tint / max(field, 1e-4);
  float inside = smoothstep(0.86, 1.14, field);

  // Fake depth: treat the field as a height map and light it from the upper left.
  vec3 n = normalize(vec3(-grad / (field * field) * 0.085, 1.0));
  vec3 l = normalize(vec3(-0.45, 0.6, 0.65));
  float diffuse = clamp(dot(n, l), 0.0, 1.0);
  float spec = pow(clamp(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 48.0);

  float strength = mix(0.30, 0.34, uLight);
  vec3 base = uBg * (0.94 + 0.12 * p.y);
  vec3 body = mix(uBg, liquid, strength) * (0.55 + 0.75 * diffuse);
  vec3 col = base + liquid * 0.07 * smoothstep(0.25, 1.0, field) * (1.0 - uLight);
  col = mix(col, body, inside);
  col += (spec * 0.16 + 0.05 * uAudio.w) * inside * mix(liquid, vec3(1.0), 0.5);

  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}
`

/**
 * Now Playing: a ray-marched body of liquid. A core that swells with the bass, satellites that
 * merge in and out of it, drops that neck off and fall into a reflective pool, ripples where they land.
 */
export const SCENE = `${COMMON}
uniform vec2 uCam;     // yaw, pitch
uniform float uShift;  // moves the liquid sideways on screen
uniform float uGloss;
uniform sampler2D uCover;
uniform float uCoverMix;

const float POOL = -1.5;
const float LAND = 0.927;
vec3 camU, camV, camW;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float ripples(vec2 xz) {
  float h = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float speed = 0.17 + 0.045 * fi;
    float cycle = uTime * speed + fi * 0.37 - LAND;
    float s = fract(cycle);
    vec2 c = (vec2(hash(vec2(fi, floor(cycle))), hash(vec2(floor(cycle), fi + 7.0))) - 0.5) * 0.7;
    float d = length(xz - c);
    float front = s / speed * 1.6;
    h += 0.07 * exp(-s * 5.0) * smoothstep(0.0, 0.04, s) * sin(14.0 * (d - front)) * exp(-1.6 * abs(d - front));
  }
  float d0 = length(xz);
  h += 0.035 * uAudio.x * sin(7.0 * d0 - uTime * 5.0) * exp(-0.45 * d0);
  return h;
}

float map(vec3 p) {
  float t = uTime;
  vec3 cc = vec3(0.0, 0.3 + 0.06 * sin(t * 0.6), 0.0);
  float wobble = sin(p.x * 5.0 + t * 2.1) * sin(p.y * 6.0 - t * 1.7) * sin(p.z * 5.5 + t * 1.3) * (0.012 + 0.05 * uAudio.z);
  float d = length(p - cc) - (0.64 + 0.2 * uAudio.x + 0.05 * uAudio.w) + wobble;

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float a = t * (0.33 + 0.09 * fi) + fi * 1.9;
    float orbit = 0.78 + 0.12 * sin(t * 0.5 + fi) + 0.16 * uAudio.x;
    vec3 c = cc + vec3(cos(a) * orbit, sin(a * 1.3 + fi) * 0.5, sin(a) * orbit);
    float r = 0.2 + 0.05 * sin(fi * 3.1) + 0.14 * (i % 2 == 0 ? uAudio.y : uAudio.z);
    d = smin(d, length(p - c) - r, 0.45);
  }

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cycle = t * (0.17 + 0.045 * fi) + fi * 0.37;
    float ph = fract(cycle);
    vec2 xz = (vec2(hash(vec2(fi, floor(cycle))), hash(vec2(floor(cycle), fi + 7.0))) - 0.5) * 0.7;
    float e = 0.12 * smoothstep(0.0, 0.35, ph) + 0.88 * pow(max(0.0, (ph - 0.3) / 0.7), 2.2);
    vec3 c = vec3(xz.x * smoothstep(0.0, 0.5, ph), mix(cc.y - 0.3, POOL - 0.35, e), xz.y * smoothstep(0.0, 0.5, ph));
    float r = mix(0.19, 0.1, e) * (1.0 - smoothstep(0.93, 1.0, ph));
    vec3 q = p - c;
    q.y *= mix(1.0, 0.72, smoothstep(0.1, 0.6, e));
    d = smin(d, length(q) - r, mix(0.5, 0.22, e));
  }

  return smin(d, p.y - POOL - ripples(p.xz), 0.3);
}

vec3 normalAt(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0025;
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

float march(vec3 ro, vec3 rd, int steps, float far) {
  float t = 0.0;
  for (int i = 0; i < steps; i++) {
    float d = map(ro + rd * t);
    if (d < 0.0018 * (1.0 + t)) return t;
    t += d * 0.82;
    if (t > far) break;
  }
  return -1.0;
}

// The studio the liquid sits in: coloured softboxes, a key light, and the album art as a glowing panel.
vec3 env(vec3 d) {
  vec3 col = uBg * mix(0.5, 1.25, d.y * 0.5 + 0.5);
  col += uA * 1.2 * pow(max(dot(d, normalize(vec3(-0.8, 0.45, 0.35))), 0.0), 5.0);
  col += uC * 1.1 * pow(max(dot(d, normalize(vec3(0.9, 0.2, -0.4))), 0.0), 7.0);
  col += uB * 0.7 * pow(max(dot(d, normalize(vec3(0.1, -0.35, -1.0))), 0.0), 4.0);
  col += (1.2 + 1.5 * uAudio.w) * pow(max(dot(d, normalize(vec3(0.25, 0.9, 0.35))), 0.0), 28.0);

  vec3 pd = normalize(-camU - camW * 0.55 + camV * 0.1);
  float facing = dot(d, pd);
  if (facing > 0.0 && uCoverMix > 0.0) {
    vec3 pr = normalize(cross(vec3(0.0, 1.0, 0.0), pd));
    vec3 pu = cross(pd, pr);
    vec2 uv = vec2(dot(d, pr), dot(d, pu)) / facing * 0.9;
    float mask = smoothstep(1.0, 0.8, max(abs(uv.x), abs(uv.y)));
    col = mix(col, texture(uCover, uv * 0.5 + 0.5).rgb * 1.5, mask * uCoverMix * 0.85);
  }
  return col;
}

vec3 pigment(vec3 p) {
  float k1 = 0.5 + 0.5 * sin(p.x * 1.3 + p.y * 1.7 + uTime * 0.35);
  float k2 = 0.5 + 0.5 * sin(p.z * 1.9 - p.y * 1.1 - uTime * 0.27 + 1.7);
  return mix(mix(uA, uB, k1), uC, k2 * 0.6);
}

vec3 surface(vec3 p, vec3 n, vec3 rd, vec3 reflected) {
  float pool = smoothstep(POOL + 0.3, POOL + 0.04, p.y);
  vec3 base = pigment(p) * mix(1.0, 0.3, pool);
  float ndv = clamp(dot(n, -rd), 0.0, 1.0);
  float key = clamp(dot(n, normalize(vec3(0.25, 0.9, 0.35))) * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = base * (0.18 + 0.82 * key * key);
  col += base * pow(1.0 - ndv, 2.5) * 0.7;
  float f0 = mix(0.05, 0.55, uGloss);
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - ndv, 5.0);
  return mix(col, reflected, clamp(fresnel + pool * 0.12, 0.0, 1.0));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv.x -= uShift;

  vec3 ta = vec3(0.0, -0.12, 0.0);
  vec3 ro = ta + 6.3 * vec3(sin(uCam.x) * cos(uCam.y), sin(uCam.y), cos(uCam.x) * cos(uCam.y));
  camW = normalize(ta - ro);
  camU = normalize(cross(camW, vec3(0.0, 1.0, 0.0)));
  camV = cross(camU, camW);
  vec3 rd = normalize(uv.x * camU + uv.y * camV + 1.75 * camW);

  // Backdrop: the theme colour with a glow behind the liquid.
  float halo = exp(-3.2 * length(uv - vec2(0.0, 0.12)));
  vec3 backdrop = uBg * (0.92 + 0.16 * (uv.y + 0.5)) + mix(uA, uB, 0.5 + 0.5 * sin(uTime * 0.2)) * halo * (0.16 + 0.3 * uAudio.x) * (1.0 - 0.6 * uLight);
  vec3 col = backdrop;

  float t = march(ro, rd, 72, 19.0);
  if (t > 0.0) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 r = reflect(rd, n);
    vec3 reflected = env(r);
    float t2 = march(p + n * 0.03, r, 26, 7.0);
    if (t2 > 0.0) {
      vec3 p2 = p + n * 0.03 + r * t2;
      vec3 n2 = normalAt(p2);
      reflected = surface(p2, n2, r, env(reflect(r, n2)));
    }
    vec3 lit = surface(p, n, rd, reflected);
    lit = 1.0 - exp(-lit * 1.5);
    float far = max(t - 6.6, 0.0);
    col = mix(backdrop, lit, exp(-0.05 * far * far));
  }

  float vignette = smoothstep(1.35, 0.35, length(uv + vec2(uShift, 0.0)));
  col = mix(uBg, col, mix(0.72, 1.0, vignette));
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}
`
