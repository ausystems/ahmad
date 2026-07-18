// sky.js — physically-toned golden-hour atmosphere. Seed 2000.
//
// One inverted sphere carries the whole sky in a single ShaderMaterial:
// Rayleigh-style vertical gradient (teal zenith → warm horizon, saturated
// peach wedge around the sun azimuth), two-lobe Mie forward scatter, an HDR
// sun disc (~0.53°, limb-softened, ~40× so bloom carries it), aerial haze +
// horizon desaturation, a Belt-of-Venus rose band opposite the sun, a faint
// gibbous moon low in the north-east, and two domain-warped FBM cloud layers
// (high wispy cirrus everywhere + a broken low cumulus band opposite the sun)
// with warm sun-lit edges. Cloud drift rides wrap-safe circular phase vectors
// fed from the CPU so the tw clock wrap (TIME_WRAP) never pops the sky.
// Plus 5–8 distant bird sprites circling over the lake, wing-flap via scale
// pulse, all frequencies integer harmonics of the wrap so motion is seamless.
//
// Light budget: ZERO lights (sun/hemi are engine-owned). No colliders.
// Exports exactly: createSky(ctx) -> { group }

import * as THREE from 'three';
import { mulberry32, TIME_WRAP, PALETTE, FOG } from './config.js';

const SEED = 2000;

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

const SKY_VERT = /* glsl */ `
varying vec3 vWorldDir;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // true view ray (keeps the horizon glued when the player walks/climbs)
  vWorldDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAG = /* glsl */ `
varying vec3 vWorldDir;

uniform vec3 uSunDir;      // normalized, scene -> sun
uniform vec3 uMoonDir;     // normalized, scene -> moon (NE, low)
uniform vec2 uDriftA;      // cirrus translation (wrap-safe circle, CPU-fed)
uniform vec2 uDriftB;      // cumulus translation
uniform vec2 uDriftC;      // domain-warp evolution

uniform vec3 uZenith;      // teal-blue zenith
uniform vec3 uHorizon;     // warm horizon cream-gold
uniform vec3 uPeach;       // saturated peach-orange near sun azimuth
uniform vec3 uHaze;        // aerial haze / fog tone
uniform vec3 uSunTint;     // warm sun light color
uniform vec3 uCloudLit;    // sun-warmed cloud face
uniform vec3 uCloudShade;  // cool mauve cloud underside
uniform vec3 uRose;        // Belt of Venus rose

// -- deterministic value noise --------------------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(127.09, 311.77));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm4(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = r * p * 2.03 + vec2(9.7, 3.1);
    a *= 0.5;
  }
  return v;
}

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 dir = normalize(vWorldDir);
  float h = dir.y;
  float hz = clamp(h, 0.0, 1.0);
  float sunCos = clamp(dot(dir, uSunDir), -1.0, 1.0);

  // horizontal azimuth relationship to the sun
  vec2 dH = normalize(dir.xz + vec2(1e-4, 0.0));
  vec2 sH = normalize(uSunDir.xz);
  float azim = clamp(dot(dH, sH), -1.0, 1.0);
  float azAng = acos(azim);

  // ---- Rayleigh-style vertical gradient ---------------------------------
  float mid = pow(1.0 - hz, 5.2);
  float low = pow(1.0 - hz, 7.0);
  vec3 col = mix(uZenith, uHorizon, mid);

  // saturated peach-orange wedge hugging the sun azimuth:
  // broad warm wash + tight (~6 deg) saturated core
  float warmBroad = pow(max(azim, 0.0), 5.0) * low;
  float warmCore = (1.0 - smoothstep(0.06, 0.22, azAng)) * pow(1.0 - hz, 3.2);
  col = mix(col, uPeach, clamp(warmBroad * 0.55 + warmCore * 0.75, 0.0, 1.0));

  // Belt of Venus: faint rose band opposite the sun, just above the horizon,
  // with the cooler earth-shadow sliver right beneath it
  float anti = pow(max(-azim, 0.0), 3.0);
  float belt = anti * (1.0 - smoothstep(0.05, 0.16, abs(h - 0.055)));
  col = mix(col, uRose, belt * 0.22);
  float eShadow = anti * (1.0 - smoothstep(0.005, 0.05, hz));
  col = mix(col, uZenith * 0.55, eShadow * 0.18);

  // ---- Mie forward scatter: tight golden lobe + broad ambient lobe ------
  float g1 = 0.78;
  float mie1 = (1.0 - g1 * g1) / (12.566 * pow(1.0 + g1 * g1 - 2.0 * g1 * sunCos, 1.5));
  float g2 = 0.30;
  float mie2 = (1.0 - g2 * g2) / (12.566 * pow(1.0 + g2 * g2 - 2.0 * g2 * sunCos, 1.5));
  col += uSunTint * (mie1 * 0.28 + mie2 * 0.11);

  // ---- aerial haze band + horizon-line desaturation ----------------------
  float hazeBand = pow(1.0 - clamp(abs(h), 0.0, 1.0), 12.0);
  col = mix(col, uHaze, hazeBand * 0.36);
  float des = pow(1.0 - clamp(abs(h), 0.0, 1.0), 16.0);
  col = mix(col, vec3(lum(col)), des * 0.20);

  // below horizon: settle into deep warm haze (terrain/water covers this)
  col = mix(col, uHaze * 0.85, smoothstep(0.0, -0.10, h));

  // ---- faint gibbous moon, low in the north-east -------------------------
  {
    float mCos = dot(dir, uMoonDir);
    float sinM = length(cross(dir, uMoonDir));
    if (mCos > 0.0 && sinM < 0.0125) {           // coherent branch, cheap
      float mAngR = 0.0082;                       // ~0.94 deg apparent
      vec3 mU = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
      vec3 mV = cross(mU, uMoonDir);
      vec2 ml = vec2(dot(dir, mU), dot(dir, mV)) / mAngR;
      float mR = length(ml);
      float mDisc = 1.0 - smoothstep(0.82, 1.0, mR);
      float maria = fbm4(ml * 2.3 + vec2(41.7, 13.9));
      float mAlb = 1.0 - smoothstep(0.48, 0.72, maria) * 0.32;
      // gibbous: dark limb offset away from the sun side
      float litSide = 1.0 - smoothstep(0.30, 1.45, length(ml - vec2(-0.55, 0.18)));
      vec3 mCol = vec3(0.87, 0.89, 0.95) * mAlb * (0.30 + 0.75 * litSide);
      col = mix(col, mCol, mDisc * 0.5);
    }
  }

  // ---- clouds -------------------------------------------------------------
  float cover = 0.0;   // total occlusion used to attenuate the sun disc
  float fwd = max(sunCos, 0.0);

  // high wispy cirrus — anisotropically stretched, domain-warped streaks
  if (h > 0.015) {
    float ch = smoothstep(0.015, 0.10, h) * (0.55 + 0.45 * (1.0 - smoothstep(0.45, 0.95, h)));
    vec2 base = dir.xz / (h + 0.10);
    mat2 windRot = mat2(0.921, -0.389, 0.389, 0.921);
    vec2 cuv = (windRot * base) * vec2(0.22, 0.62);
    vec2 warp = vec2(
      fbm4(base * 0.33 + uDriftC),
      fbm4(base * 0.33 + vec2(17.9, 4.2) - uDriftC));
    float cir = fbm4(cuv + uDriftA + (warp - 0.5) * 1.7);
    float cirD = smoothstep(0.50, 0.80, cir) * ch;
    // second, finer streak set layered over the first
    float cir2 = fbm4(cuv * 2.6 + uDriftA * 1.5 + vec2(31.0, 7.0) + (warp - 0.5) * 0.8);
    cirD = max(cirD, smoothstep(0.58, 0.86, cir2) * ch * 0.7);
    // thin ice burns off right at the sun — keeps the disc edge soft
    cirD *= 1.0 - 0.72 * pow(fwd, 8.0);

    // thin ice cloud: mostly translucent, strongly sun-warmed near the sun
    float cirLight = 0.55 + 0.45 * pow(fwd, 2.0);
    vec3 cirCol = mix(uCloudShade, uCloudLit, cirLight);
    // silver lining: edge gradient boosted toward the sun direction
    float lining = cirD * (1.0 - cirD) * 4.0 * pow(fwd, 6.0);
    cirCol += uSunTint * lining * 1.6;

    float aC = cirD * 0.55;
    col = mix(col, cirCol, aC);
    cover += aC;
  }

  // broken low cumulus band near the horizon, opposite the sun (north)
  float bandMask = (1.0 - smoothstep(-0.45, 0.25, azim))
                 * smoothstep(0.015, 0.06, h)
                 * (1.0 - smoothstep(0.15, 0.34, h));
  if (bandMask > 0.002) {
    vec2 kbase = dir.xz / (h + 0.16);
    vec2 kuv = kbase * 0.055;
    vec2 kwarp = vec2(
      fbm4(kuv * 2.3 + uDriftC * 0.7 + vec2(5.1, 0.0)),
      fbm4(kuv * 2.3 - uDriftC * 0.7 + vec2(29.3, 8.8)));
    float cum = fbm4(kuv * 2.9 + uDriftB + (kwarp - 0.5) * 2.1);
    float cumD = smoothstep(0.46, 0.74, cum) * bandMask;

    // shadowed mauve undersides low, warmer crowns higher up; golden rims
    float crown = smoothstep(0.05, 0.22, h);
    vec3 cumCol = mix(uCloudShade * 0.85, mix(uCloudShade, uCloudLit, 0.75), crown);
    float rim = cumD * (1.0 - cumD) * 4.0;
    cumCol += uSunTint * rim * 0.35;         // sun-grazed top edges
    cumCol += uRose * rim * 0.18;            // counter-sun rose kiss

    float aK = cumD * 0.9;
    col = mix(col, cumCol, aK);
    cover = clamp(cover + aK, 0.0, 1.0);
  }

  // ---- sun disc (~0.53 deg) with limb softening, HDR for bloom -----------
  float sinS = length(cross(dir, uSunDir));
  float discR = 0.00465;
  float disc = (1.0 - smoothstep(discR * 0.62, discR, sinS)) * step(0.0, sunCos);
  float limb = 1.0 - smoothstep(0.0, discR, sinS);   // 1 center -> 0 rim
  col += uSunTint * disc * (28.0 + 12.0 * limb) * (1.0 - cover * 0.85);
  // tight warm halo hugging the disc
  float halo = pow(clamp(1.0 - sinS * 22.0, 0.0, 1.0), 3.0);
  col += uSunTint * halo * 1.9 * (1.0 - cover * 0.6);

  // ordered-noise dither to kill gradient banding pre-grade
  col += (hash21(dir.xy * 480.0 + dir.zx * 913.0) - 0.5) * 0.004;

  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function lin(hex) {
  // sRGB hex -> linear working space (ColorManagement default in r170)
  return new THREE.Color(hex);
}

function sstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Distant-bird glyph: soft gull "V" drawn white, tinted by the material.
function makeBirdTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 64);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineCap = 'round';

  // layered strokes: crisp core over a soft halo so the sprite mips cleanly
  g.lineWidth = 9;
  g.globalAlpha = 0.35;
  g.beginPath();
  g.moveTo(8, 24);
  g.quadraticCurveTo(38, 46, 64, 36);
  g.quadraticCurveTo(90, 46, 120, 24);
  g.stroke();

  g.lineWidth = 5.5;
  g.globalAlpha = 1.0;
  g.beginPath();
  g.moveTo(10, 26);
  g.quadraticCurveTo(39, 45, 64, 36);
  g.quadraticCurveTo(89, 45, 118, 26);
  g.stroke();

  // body + head hint
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.ellipse(64, 37, 7.5, 4.5, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(70, 35, 3.2, 2.6, 0, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

// ---------------------------------------------------------------------------
// createSky
// ---------------------------------------------------------------------------

export function createSky(ctx) {
  const rng = mulberry32(SEED);
  const group = new THREE.Group();
  group.name = 'sky';

  const sunDir = ctx.sunDir.clone().normalize();
  // moon opposite the sun: low in the north-east (sun sits south, slightly west)
  const moonDir = new THREE.Vector3(0.52, 0.16, -0.84).normalize();

  // ---- sky dome -----------------------------------------------------------
  const uniforms = {
    uSunDir: { value: sunDir },
    uMoonDir: { value: moonDir },
    uDriftA: { value: new THREE.Vector2(0, 0) },
    uDriftB: { value: new THREE.Vector2(0, 0) },
    uDriftC: { value: new THREE.Vector2(0, 0) },
    uZenith: { value: lin(PALETTE.skyZenith) },      // #2e5e8f teal-blue
    uHorizon: { value: lin(PALETTE.skyHorizon) },    // #f7c987 warm cream-gold
    uPeach: { value: lin(0xff9a4d) },                // saturated peach-orange
    uHaze: { value: lin(FOG.color) },                // #e6cfa8 aerial haze
    uSunTint: { value: lin(0xffe3bd) },              // warm sun light
    uCloudLit: { value: lin(0xffe2bc) },             // golden-lit cloud face
    uCloudShade: { value: lin(0x776f85) },           // cool mauve underside
    uRose: { value: lin(0xd9848b) },                 // Belt of Venus
  };

  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1200, 64, 40), skyMat);
  skyMesh.name = 'skyDome';
  skyMesh.renderOrder = -1000;   // paint first; everything else covers it
  skyMesh.frustumCulled = false;
  group.add(skyMesh);

  // ---- distant birds over the lake ---------------------------------------
  // 7 gulls circling at y 40–80. All angular rates are integer harmonics of
  // the wrap (omega = 2*pi*k / TIME_WRAP) so tw wrapping never snaps them.
  const W = (Math.PI * 2) / TIME_WRAP;
  const birdTex = makeBirdTexture();
  const birdMat = new THREE.SpriteMaterial({
    map: birdTex,
    color: lin(0x2a241d),        // dark warm silhouette
    transparent: true,
    depthWrite: false,
    opacity: 0.92,
    fog: true,                   // let distance haze soften them
  });

  const birds = [];
  const BIRD_COUNT = 7;
  for (let i = 0; i < BIRD_COUNT; i++) {
    const sprite = new THREE.Sprite(birdMat);
    const s = 1.7 + rng() * 1.5;
    sprite.scale.set(s, s * 0.55, 1);
    group.add(sprite);
    birds.push({
      sprite,
      s,
      // circle center out over the water (shore is z=35)
      cx: (rng() - 0.5) * 130,
      cz: 75 + rng() * 105,
      y0: 42 + rng() * 36,
      r: 14 + rng() * 26,
      // orbit: 18–39 revolutions per wrap -> 23–50 s per lap
      omega: (rng() < 0.5 ? 1 : -1) * W * (18 + Math.floor(rng() * 22)),
      phase: rng() * Math.PI * 2,
      // wing flap ~2.7–3.7 Hz
      flapOmega: W * (2400 + Math.floor(rng() * 900)),
      flapPhase: rng() * Math.PI * 2,
      // glide gate: flap in bouts, soar between
      gateOmega: W * (25 + Math.floor(rng() * 40)),
      gatePhase: rng() * Math.PI * 2,
      // lazy altitude bob
      bobOmega: W * (6 + Math.floor(rng() * 8)),
      bobPhase: rng() * Math.PI * 2,
      bobAmp: 1.6 + rng() * 2.2,
    });
  }

  // ---- cloud drift phases -------------------------------------------------
  // Clouds ride circular paths in noise space: perfectly continuous across
  // the tw wrap, locally indistinguishable from a straight slow drift.
  const driftA = { k: 1, r: 1.35, p: rng() * Math.PI * 2 };  // cirrus
  const driftB = { k: 1, r: 0.85, p: rng() * Math.PI * 2 };  // cumulus
  const driftC = { k: 2, r: 0.60, p: rng() * Math.PI * 2 };  // warp evolution

  // ---- per-frame update ---------------------------------------------------
  ctx.updates.push((dt, tw) => {
    const aA = driftA.p + W * driftA.k * tw;
    uniforms.uDriftA.value.set(Math.cos(aA) * driftA.r, Math.sin(aA) * driftA.r);
    const aB = driftB.p + W * driftB.k * tw;
    uniforms.uDriftB.value.set(Math.cos(aB) * driftB.r, Math.sin(aB) * driftB.r);
    const aC = driftC.p + W * driftC.k * tw;
    uniforms.uDriftC.value.set(Math.cos(aC) * driftC.r, Math.sin(aC) * driftC.r);

    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      const ang = b.phase + b.omega * tw;
      b.sprite.position.set(
        b.cx + Math.cos(ang) * b.r,
        b.y0 + Math.sin(b.bobPhase + b.bobOmega * tw) * b.bobAmp,
        b.cz + Math.sin(ang) * b.r
      );
      // flap bouts: gate eases flapping in/out; soaring holds wings spread
      const gate = sstep(0.15, 0.5, 0.5 + 0.5 * Math.sin(b.gatePhase + b.gateOmega * tw));
      const flap = Math.abs(Math.sin(b.flapPhase + b.flapOmega * tw));
      const sy = b.s * ((1 - gate) * 0.6 + gate * (0.25 + 0.75 * flap));
      b.sprite.scale.set(b.s, sy, 1);
    }
  });

  return { group };
}
