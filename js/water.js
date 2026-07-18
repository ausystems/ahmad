// water.js — the lake. A single big shader plane at WATER_Y: three scrolling
// FBM-derived normal layers (two fine ripple sets at offset angles + one long
// low swell), an analytic shore-depth field baked from groundHeight() into a
// 128² data texture (drives shallows color, shore-parallel wavelets and the
// noise-broken foam edge), planar-reflection sampling from ctx.lakeReflection
// with an analytic golden-hour sky fallback, and the hero feature: a sun
// glitter path that stretches toward the viewer (anisotropic slope damping
// across the sun azimuth, tight ~600 + broad ~40 specular lobes, HDR to ~6 so
// the bloom pass sparkles it). Shoreline foam + dock-piling foam rings.
// Seed 4000. All shader clocks wrap-safe against TIME_WRAP.
// Exports: createWater(ctx) → { group }

import * as THREE from 'three';
import {
  WATER_Y,
  TIME_WRAP,
  SUN_DIR,
  PALETTE,
  mulberry32,
  groundHeight,
} from './config.js';

// ---------------------------------------------------------------------------
// deterministic tileable value-noise (lattice hashed through a shuffled perm
// table; integer lattice frequencies so every octave tiles the texture)
// ---------------------------------------------------------------------------

function buildPerm(rng) {
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  return p;
}

function latticeVal(perm, x, y) {
  return perm[(perm[x & 255] + y) & 255] / 255;
}

// Tileable value noise: u,v in [0,1), f = integer cells across the tile.
function vnoise(perm, u, v, f, off) {
  const x = u * f;
  const y = v * f;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % f) + f) % f;
  const x1 = (x0 + 1) % f;
  const y0 = ((yi % f) + f) % f;
  const y1 = (y0 + 1) % f;
  const a = latticeVal(perm, x0 + off, y0 + off);
  const b = latticeVal(perm, x1 + off, y0 + off);
  const c = latticeVal(perm, x0 + off, y1 + off);
  const d = latticeVal(perm, x1 + off, y1 + off);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---------------------------------------------------------------------------
// bake: seamless water normal map (rgb = tangent normal, a = independent foam
// / breakup / mottle noise). DataTexture, not canvas — avoids premultiplied-
// alpha crushing the normal channels.
// ---------------------------------------------------------------------------

function bakeWaterNormalTexture(rng, S, aniso) {
  const permH = buildPerm(rng);
  const permR = buildPerm(rng);
  const permA = buildPerm(rng);

  const h = new Float32Array(S * S);
  const a = new Float32Array(S * S);
  const inv = 1 / S;

  for (let y = 0; y < S; y++) {
    const v = y * inv;
    for (let x = 0; x < S; x++) {
      const u = x * inv;

      // 5-octave FBM height — the ripple field
      let sum = 0;
      let amp = 0.5;
      let norm = 0;
      let f = 4;
      for (let o = 0; o < 5; o++) {
        sum += vnoise(permH, u, v, f, o * 37) * amp;
        norm += amp;
        amp *= 0.55;
        f *= 2;
      }
      let hv = sum / norm;

      // sharpen a fraction of the crests (ridged blend → less mushy water)
      let rg = vnoise(permR, u, v, 8, 11);
      rg = 1 - Math.abs(2 * rg - 1);
      hv = hv * 0.82 + rg * rg * 0.18;
      h[y * S + x] = hv;

      // independent 4-octave noise for foam breakup / glint gating / mottle
      let fa = 0;
      amp = 0.5;
      norm = 0;
      f = 6;
      for (let o = 0; o < 4; o++) {
        fa += vnoise(permA, u, v, f, o * 53) * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2;
      }
      a[y * S + x] = fa / norm;
    }
  }

  // Sobel height→normal with wrap-around so the tile stays seamless
  const data = new Uint8Array(S * S * 4);
  const k = S / 150; // slope strength (scaled so 256/512 tiers match)
  const id = (x, y) => ((y + S) % S) * S + ((x + S) % S);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const tl = h[id(x - 1, y - 1)];
      const tc = h[id(x, y - 1)];
      const tr = h[id(x + 1, y - 1)];
      const ml = h[id(x - 1, y)];
      const mr = h[id(x + 1, y)];
      const bl = h[id(x - 1, y + 1)];
      const bc = h[id(x, y + 1)];
      const br = h[id(x + 1, y + 1)];
      const gx = tr + 2 * mr + br - tl - 2 * ml - bl;
      const gy = bl + 2 * bc + br - tl - 2 * tc - tr;
      let nx = -gx * k;
      let ny = -gy * k;
      let nz = 1;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= il;
      ny *= il;
      nz *= il;
      const i4 = (y * S + x) * 4;
      data[i4] = Math.round(nx * 127.5 + 127.5);
      data[i4 + 1] = Math.round(ny * 127.5 + 127.5);
      data[i4 + 2] = Math.round(nz * 127.5 + 127.5);
      data[i4 + 3] = Math.round(Math.min(1, Math.max(0, a[y * S + x])) * 255);
    }
  }

  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// bake: shore depth field. 128² over x −72…72, z 30…80 (per spec), signed
// water depth (WATER_Y − groundHeight) encoded (d+1)/7 → r channel. Linear
// filtering gives a smooth analytic shoreline; clamp-to-edge means everything
// past z 80 reads deep and the near side sits under the lawn anyway.
// ---------------------------------------------------------------------------

const SHORE_TEX = { x0: -72, xw: 144, z0: 30, zw: 50, n: 128 };

function bakeShoreDepthTexture() {
  const { x0, xw, z0, zw, n } = SHORE_TEX;
  const d = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = z0 + ((j + 0.5) / n) * zw;
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i + 0.5) / n) * xw;
      const depth = WATER_Y - groundHeight(x, z); // + in water, − on land
      const enc = Math.max(0, Math.min(1, (depth + 1) / 7));
      d[j * n + i] = Math.round(enc * 255);
    }
  }
  const tex = new THREE.DataTexture(d, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// createWater
// ---------------------------------------------------------------------------

export function createWater(ctx) {
  const rng = mulberry32(4000);
  const quality = ctx.quality || {};
  const S = quality.tier === 'medium' ? 256 : 512;
  const aniso = quality.aniso || 4;

  const normalTex = bakeWaterNormalTexture(rng, S, aniso);
  const shoreTex = bakeShoreDepthTexture();

  // 1×1 black placeholder so tReflection is never an unbound sampler
  const blackTex = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType
  );
  blackTex.needsUpdate = true;

  const sunDir = (ctx.sunDir && ctx.sunDir.isVector3)
    ? ctx.sunDir.clone().normalize()
    : new THREE.Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]).normalize();

  // Dock pilings (spec: x ±1.05, z 36.5 / 40 / 43.8) — foam rings + ripples
  const pilings = [
    new THREE.Vector2(-1.05, 36.5), new THREE.Vector2(1.05, 36.5),
    new THREE.Vector2(-1.05, 40.0), new THREE.Vector2(1.05, 40.0),
    new THREE.Vector2(-1.05, 43.8), new THREE.Vector2(1.05, 43.8),
  ];

  // ---- wrap-safe shader clock rates -------------------------------------
  // Every sin(uTime·ω) uses ω quantized to k·2π/TIME_WRAP so the tw wrap at
  // 900s lands exactly on a whole number of cycles (no pop). Texture scroll
  // is driven by uDrift, accumulated in JS and wrapped mod 1 — every layer
  // multiplies uDrift by INTEGER factors so the wrap is invisible too.
  const W = (Math.PI * 2) / TIME_WRAP;
  const quant = (w) => Math.max(1, Math.round(w / W)) * W;
  const OMW = quant(1.9); // shore-parallel wavelet travel
  const OMA = quant(1.35); // arriving foam arcs
  const OMP = quant(1.15); // piling foam pulse
  const OMR = quant(2.4); // piling ring ripples
  const OMT = quant(2.7); // glitter twinkle
  const fmt = (n) => n.toFixed(7);

  const su = 1 / SHORE_TEX.xw;
  const sv = 1 / SHORE_TEX.zw;

  const uniforms = Object.assign(
    THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    {
      tNormal: { value: normalTex },
      tShore: { value: shoreTex },
      tReflection: { value: blackTex },
      uHasRefl: { value: 0 },
      uTime: { value: 0 },
      uDrift: { value: new THREE.Vector2(rng() * 0.5, rng() * 0.5) },
      uSunDir: { value: sunDir },
      uDeepCol: { value: new THREE.Color(0x1a3a42) },
      uShallowCol: { value: new THREE.Color(0x4a5a3e) },
      uFoamCol: { value: new THREE.Color(0xe3ece4) },
      uZenithCol: { value: new THREE.Color(PALETTE.skyZenith) },
      uHorizonCol: { value: new THREE.Color(PALETTE.skyHorizon) },
      uSunCol: { value: new THREE.Color(0xffdcae) },
      uPilings: { value: pilings },
    }
  );

  const vertexShader = /* glsl */ `
    varying vec3 vWorldPos;
    varying vec4 vClipPos;
    #include <fog_pars_vertex>
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      vClipPos = gl_Position;
      #include <fog_vertex>
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform sampler2D tNormal;
    uniform sampler2D tShore;
    uniform sampler2D tReflection;
    uniform float uHasRefl;
    uniform float uTime;
    uniform vec2 uDrift;
    uniform vec3 uSunDir;
    uniform vec3 uDeepCol;
    uniform vec3 uShallowCol;
    uniform vec3 uFoamCol;
    uniform vec3 uZenithCol;
    uniform vec3 uHorizonCol;
    uniform vec3 uSunCol;
    uniform vec2 uPilings[6];
    varying vec3 vWorldPos;
    varying vec4 vClipPos;
    #include <fog_pars_fragment>

    vec3 tapN(vec2 uv) {
      return texture2D(tNormal, uv).rgb * 2.0 - 1.0;
    }
    float tapA(vec2 uv) {
      return texture2D(tNormal, uv).a;
    }

    // compact golden-hour sky — reflection fallback when no planar RT yet
    vec3 skyReflect(vec3 R) {
      float up = clamp(R.y, 0.0, 1.0);
      vec3 sky = mix(uHorizonCol, uZenithCol, pow(up, 0.34));
      sky = mix(sky, uHorizonCol * vec3(1.04, 0.97, 0.88), exp(up * -11.0) * 0.35);
      float sunAmt = max(dot(R, uSunDir), 0.0);
      sky += uSunCol * (pow(sunAmt, 4.0) * 0.32 + pow(sunAmt, 48.0) * 1.5);
      sky += uSunCol * smoothstep(0.99985, 0.99996, sunAmt) * 22.0;
      return sky;
    }

    void main() {
      vec2 wuv = vWorldPos.xz;
      vec3 toCam = cameraPosition - vWorldPos;
      float dist = length(toCam);
      vec3 V = toCam / max(dist, 0.001);
      float fadeFine = exp(dist * -0.011);
      float fadeMid  = exp(dist * -0.0035);

      // ---- three scrolling FBM normal layers ---------------------------
      // L1: fine ripples, streak-stretched along z (wind lanes)
      vec2 uv1 = vec2(wuv.x * 0.4808, wuv.y * 0.3077) + uDrift * 2.0;
      // L2: fine ripples rotated ~22°, drifting on an offset heading
      vec2 uv2 = mat2(0.9272, 0.3746, -0.3746, 0.9272) * wuv * 0.2564
               + vec2(uDrift.x * -3.0, uDrift.y);
      // L3: long low swell, slow slide, decorrelated drift
      vec2 uv3 = wuv * 0.03846 + vec2(uDrift.y, -uDrift.x);
      vec3 n1 = tapN(uv1);
      vec3 n2 = tapN(uv2);
      vec3 n3 = tapN(uv3);
      float w1 = 0.80 * (0.30 + 0.70 * fadeFine);
      float w2 = 0.60 * (0.30 + 0.70 * fadeFine);
      float w3 = 0.55 * (0.40 + 0.60 * fadeMid);
      vec2 slope = (n1.xy / max(n1.z, 0.30)) * w1
                 + (n2.xy / max(n2.z, 0.30)) * w2
                 + (n3.xy / max(n3.z, 0.30)) * w3;

      // ---- analytic shore depth field ----------------------------------
      vec2 shoreUV = vec2((vWorldPos.x + 72.0) * ${fmt(su)},
                          (vWorldPos.z - 30.0) * ${fmt(sv)});
      float d0 = texture2D(tShore, shoreUV).r * 7.0 - 1.0;
      float dX = texture2D(tShore, shoreUV + vec2(${fmt(1.4 * su)}, 0.0)).r * 7.0 - 1.0;
      float dZ = texture2D(tShore, shoreUV + vec2(0.0, ${fmt(1.4 * sv)})).r * 7.0 - 1.0;
      vec2 gradD = vec2(dX - d0, dZ - d0) * ${fmt(1 / 1.4)};
      // fade shore effects before the terrain plane ends (x ±70)
      float sideMask = 1.0 - smoothstep(63.0, 70.0, abs(vWorldPos.x));

      // gentle shore-parallel wavelets riding in on the depth gradient
      float foamA = tapA(wuv * 0.24 + uDrift * 3.0);
      float shoreW = (1.0 - smoothstep(0.15, 3.2, d0)) * sideMask;
      vec2 waveDir = gradD / max(length(gradD), 0.02);
      float wPhase = d0 * 5.2 + uTime * ${fmt(OMW)} + foamA * 2.2;
      slope += waveDir * cos(wPhase) * 0.16 * shoreW;

      // ---- dock pilings: foam rings, contact AO, radiating ripples -----
      float pilingFoam = 0.0;
      float pilingAO = 0.0;
      for (int i = 0; i < 6; i++) {
        vec2 dp = wuv - uPilings[i];
        float pd = length(dp);
        if (pd < 2.5) {
          float pulse = 0.72 + 0.28 * sin(uTime * ${fmt(OMP)} + float(i) * 2.4);
          pilingFoam += 1.0 - smoothstep(0.07, 0.12 + 0.26 * pulse, pd);
          pilingAO += 1.0 - smoothstep(0.14, 0.62, pd);
          slope += (dp / max(pd, 0.05))
                 * sin(pd * 16.0 - uTime * ${fmt(OMR)} + float(i) * 1.7)
                 * 0.05 * exp(pd * -1.9);
        }
      }
      pilingAO = clamp(pilingAO, 0.0, 1.0);

      vec3 N = normalize(vec3(slope.x, 1.0, slope.y));

      // ---- shoreline foam ----------------------------------------------
      float foamFine = tapA(wuv * 0.85 - uDrift * 2.0);
      float band = 1.0 - smoothstep(0.03, 0.34 + 0.30 * foamA, d0);
      float arcs = smoothstep(0.58, 0.92,
                     0.5 + 0.5 * sin(d0 * 6.5 + uTime * ${fmt(OMA)} + foamA * 3.5))
                 * (1.0 - smoothstep(0.9, 2.6, d0));
      float foamShore = clamp(band * 1.2 + arcs * 0.5, 0.0, 1.0);
      foamShore *= smoothstep(0.34, 0.62, mix(foamFine, foamA, 0.35) + band * 0.18);
      foamShore *= sideMask;
      float foam = clamp(
        foamShore + clamp(pilingFoam, 0.0, 1.0)
                    * clamp(foamFine * 1.6 + 0.25, 0.0, 1.0),
        0.0, 1.0);

      // ---- water body color --------------------------------------------
      float shoreFac = (1.0 - smoothstep(0.05, 2.8, d0)) * sideMask;
      float mott = tapA(wuv * 0.017 + uDrift);
      vec3 base = mix(uDeepCol, uShallowCol, shoreFac * 0.9);
      base *= 0.88 + 0.24 * mott;          // slow drifting mottle
      base *= 0.72 + 0.28 * N.y;           // ripple self-shading
      base *= 1.0 - 0.28 * pilingAO;       // wet shadow around the piles
      float sunDif = max(dot(N, uSunDir), 0.0);
      base += uSunCol * (0.05 * shoreFac * sunDif); // sunlit shallows lift

      // ---- fresnel -----------------------------------------------------
      float cosT = clamp(dot(V, N), 0.0, 1.0);
      float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

      // ---- reflection: planar RT (screen-space + distortion) or sky ----
      vec3 Rv = reflect(-V, N);
      Rv.y = max(Rv.y, 0.015);
      vec3 skyCol = skyReflect(normalize(Rv));
      vec2 sUV = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
      vec2 rUV = sUV + N.xz * 0.04;
      float edge = smoothstep(0.0, 0.05, rUV.x) * (1.0 - smoothstep(0.95, 1.0, rUV.x))
                 * smoothstep(0.0, 0.05, rUV.y) * (1.0 - smoothstep(0.95, 1.0, rUV.y));
      rUV = clamp(rUV, vec2(0.001), vec2(0.999));
      vec3 rtCol = texture2D(tReflection, rUV).rgb;
      vec3 reflCol = mix(skyCol, rtCol, uHasRefl * edge * 0.92);
      reflCol *= vec3(0.92, 0.98, 0.96); // slight water absorption tint

      // ---- sun glitter path toward the viewer --------------------------
      // extra micro-detail slope + damping of the slope component ACROSS
      // the sun azimuth → glints spread along the sun-viewer axis, i.e. the
      // classic elongated glitter lane.
      vec3 nG = tapN(wuv * 0.87 + uDrift * 5.0);
      vec2 slopeG = slope * 1.12
                  + (nG.xy / max(nG.z, 0.30)) * (0.15 + 0.85 * fadeFine) * 0.9;
      vec2 sunAz = normalize(uSunDir.xz);
      float along = dot(slopeG, sunAz);
      slopeG = sunAz * along + (slopeG - sunAz * along) * 0.45;
      vec3 Ns = normalize(vec3(slopeG.x, 1.0, slopeG.y));
      float sd = max(dot(reflect(-V, Ns), uSunDir), 0.0);
      float gate = tapA(wuv * 0.6 + vec2(uDrift.y * -2.0, uDrift.x * 2.0));
      gate = smoothstep(0.35, 0.85,
               gate + 0.22 * sin(uTime * ${fmt(OMT)}
                                 + (vWorldPos.x + vWorldPos.z * 0.7) * 2.6));
      float glitter = pow(sd, 600.0) * (2.0 + 3.6 * gate)   // sparkling core
                    + pow(sd, 40.0) * 0.5;                  // broad warm lane
      glitter *= 0.25 + 0.75 * F;

      // ---- compose -----------------------------------------------------
      vec3 col = mix(base, reflCol, F);
      col += uSunCol * glitter * (1.0 - foam);
      vec3 foamLit = uFoamCol * (0.55 + 0.55 * sunDif);
      col = mix(col, foamLit, foam * 0.92);

      gl_FragColor = vec4(col, 1.0);
      #include <fog_fragment>
    }
  `;

  const material = new THREE.ShaderMaterial({
    name: 'LakeWater',
    uniforms,
    vertexShader,
    fragmentShader,
    fog: true,
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
  });

  // One big plane: 1400×1000 centered (0, +430) — past the dock, under the
  // mountains, off into the fog. Light subdivision keeps interpolants sweet.
  const geo = new THREE.PlaneGeometry(1400, 1000, 32, 24);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(0, WATER_Y, 430);
  mesh.name = 'lake';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.updateMatrixWorld();

  const group = new THREE.Group();
  group.name = 'water';
  group.add(mesh);

  // ---- update: drift pan + late pickup of the planar reflection RT ------
  const drift = uniforms.uDrift.value;
  let lastRT; // undefined ≠ null → first frame always syncs
  ctx.updates.push((dt, tw) => {
    uniforms.uTime.value = tw;
    // overall drift phase, wrapped mod 1 (texture-repeat safe; all layer
    // offsets are integer multiples of this vector)
    drift.x = (drift.x + dt * 0.0036) % 1;
    drift.y = (drift.y + dt * 0.0089) % 1;
    const rt = ctx.lakeReflection || null;
    if (rt !== lastRT) {
      lastRT = rt;
      uniforms.tReflection.value = rt || blackTex;
      uniforms.uHasRefl.value = rt ? 1 : 0;
    }
  });

  return { group };
}
