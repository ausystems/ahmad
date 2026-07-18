// engine.js — renderer, HDR post pipeline, planar reflections, env probes,
// quality autoscaling. Authored by hand; modules never touch anything in here
// except through ctx fields documented in the spec.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { CAMERA, FOG, SUN, SUN_DIR, HEMI, WATER_Y, TIME_WRAP } from './config.js';

// ---------------------------------------------------------------------------
// Cinematic grade: exposure → white balance → ACES (Hill fit) → lift/gamma/gain
// → vibrance → vignette, with radial chromatic aberration sampled pre-tonemap.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.34 },
    uCA: { value: 0.0007 },
    uVignette: { value: 0.30 },
    uSat: { value: 1.05 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uExposure, uCA, uVignette, uSat;
    varying vec2 vUv;

    const mat3 ACESIn = mat3(
      0.59719, 0.07600, 0.02840,
      0.35458, 0.90834, 0.13383,
      0.04823, 0.01566, 0.83777);
    const mat3 ACESOut = mat3(
      1.60475, -0.10208, -0.00327,
     -0.53108,  1.10813, -0.07276,
     -0.07367, -0.00605,  1.07602);
    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 aces(vec3 c) { return clamp(ACESOut * RRTAndODTFit(ACESIn * c), 0.0, 1.0); }

    vec3 srgb(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }

    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      // chromatic aberration — radial, subtle, HDR-domain
      vec2 caOff = d * r2 * uCA * 14.0;
      vec3 hdr;
      hdr.r = texture2D(tDiffuse, vUv + caOff).r;
      hdr.g = texture2D(tDiffuse, vUv).g;
      hdr.b = texture2D(tDiffuse, vUv - caOff).b;

      hdr *= uExposure;
      // golden-hour white balance: nudge warm, protect blues
      hdr = hdr * mat3(1.035, 0.0, 0.0,  0.0, 1.0, 0.0,  0.0, 0.0, 0.972);

      vec3 col = aces(hdr);

      // lift / gamma / gain — teal-shadow, warm-highlight film grade
      vec3 lift = vec3(0.010, 0.013, 0.020);
      vec3 gain = vec3(1.015, 1.000, 0.972);
      col = clamp(col * (1.0 - lift) + lift, 0.0, 1.0) * gain;
      col = pow(col, vec3(1.0 / 1.020, 1.0, 1.0 / 0.995));

      // vibrance-ish saturation
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);

      // vignette
      float vig = 1.0 - uVignette * smoothstep(0.15, 0.72, r2);
      col *= vig;

      gl_FragColor = vec4(srgb(clamp(col, 0.0, 1.0)), 1.0);
    }
  `,
};

// Final pass: film grain + letterbox + fade, applied after AA so grain stays crisp.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.028 },
    uLetterbox: { value: 0.0 },
    uFade: { value: 1.0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uLetterbox, uFade;
    uniform vec2 uRes;
    varying vec2 vUv;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float g = hash(vUv * uRes + fract(uTime * 61.7) * 917.0) - 0.5;
      col += g * uGrain * (0.35 + 0.65 * (1.0 - l));   // grain lives in the shadows
      col += (hash(vUv * uRes * 0.5 + 31.7) - 0.5) / 255.0; // dither
      float bar = 0.5 * uLetterbox * 0.24;
      float lb = step(bar, vUv.y) * step(vUv.y, 1.0 - bar);
      col *= lb * uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// ---------------------------------------------------------------------------
// Planar reflector: renders the scene mirrored about a horizontal plane into a
// low-res HDR target. Sampling contract for consumers (floor material
// injection & the water shader): uv = vec2(1.0 - screenUv.x, screenUv.y).
// The mirrored view matrix (improper rotation) makes on-plane points land on
// identical screen pixels; flipping X in the projection restores winding, so
// only the x-flip remains when sampling.
export class PlanarReflector {
  constructor(planeY, res) {
    this.planeY = planeY;
    this.target = new THREE.WebGLRenderTarget(res, res, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.target.texture.name = 'planarReflection';
    this.camera = new THREE.PerspectiveCamera();
    this.camera.matrixAutoUpdate = false;
    this.camera.matrixWorldAutoUpdate = false;
    this.enabled = true;
    this.hide = [];         // meshes hidden during this reflection render
    this.layerMask = null;  // optional layers override
    this._R = new THREE.Matrix4();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    this._q = new THREE.Vector4();
    this._clip = new THREE.Vector4();
  }

  setSize(res) {
    this.target.setSize(res, res);
  }

  render(renderer, scene, mainCam) {
    if (!this.enabled) return;
    const y = this.planeY;
    // reflection matrix about plane y = planeY  (R = T(y) * S(1,-1,1) * T(-y))
    this._R.set(
      1, 0, 0, 0,
      0, -1, 0, 2 * y,
      0, 0, 1, 0,
      0, 0, 0, 1);

    const cam = this.camera;
    mainCam.updateMatrixWorld();
    // V_virtual = V_main * R  →  matrixWorld = R⁻¹ * mainCam.matrixWorld = R * matrixWorld (R self-inverse)
    cam.matrixWorld.multiplyMatrices(this._R, mainCam.matrixWorld);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();

    // projection: copy main, flip X to restore winding
    cam.projectionMatrix.copy(mainCam.projectionMatrix);
    cam.projectionMatrix.elements[0] *= -1;
    cam.projectionMatrix.elements[8] *= -1;

    // Lengyel oblique near plane: clip everything below the mirror plane
    const p = this._plane;
    const vNormal = p.normal.clone().transformDirection(cam.matrixWorldInverse);
    const vPoint = new THREE.Vector3(0, y, 0).applyMatrix4(cam.matrixWorldInverse);
    const clip = this._clip.set(vNormal.x, vNormal.y, vNormal.z, -vPoint.dot(vNormal));
    const pr = cam.projectionMatrix.elements;
    const q = this._q;
    q.x = (Math.sign(clip.x) + pr[8]) / pr[0];
    q.y = (Math.sign(clip.y) + pr[9]) / pr[5];
    q.z = -1.0;
    q.w = (1.0 + pr[10]) / pr[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pr[2] = clip.x; pr[6] = clip.y; pr[10] = clip.z + 1.0; pr[14] = clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

    if (this.layerMask !== null) cam.layers.mask = this.layerMask;

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    const hidden = [];
    for (const m of this.hide) if (m && m.visible) { m.visible = false; hidden.push(m); }
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadow;
    for (const m of hidden) m.visible = true;
  }
}

// ---------------------------------------------------------------------------
export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,               // SMAA in the chain
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.toneMapping = THREE.NoToneMapping;    // grade pass owns tonemapping
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);

  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
  camera.position.set(0, 1.7, 3.2);
  camera.layers.enable(1);

  // ------------------------------------------------------------- light rig
  const sunDir = new THREE.Vector3(...SUN_DIR).normalize();
  const sun = new THREE.DirectionalLight(SUN.color, SUN.intensity);
  sun.position.copy(sunDir).multiplyScalar(120).add(new THREE.Vector3(0, 0, 14));
  sun.target.position.set(0, 0, 14);
  sun.castShadow = true;
  sun.shadow.camera.left = -34; sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34; sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 40; sun.shadow.camera.far = 240;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(HEMI.sky, HEMI.ground, HEMI.intensity);
  scene.add(hemi);

  // ------------------------------------------------------------- quality
  function detectTier() {
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      if (mobile) return 'medium';
      if (/Apple M|RTX|Radeon Pro|RX 6|RX 7|Arc/i.test(gpu)) return 'ultra';
      return 'high';
    } catch (e) { return 'high'; }
  }

  const TIERS = {
    ultra:  { pixelRatio: Math.min(devicePixelRatio, 2), shadowSize: 4096, reflectorRes: 1024, lakeRes: 512, aniso: 16, instanceScale: 1.0, dof: false, gtao: true },
    high:   { pixelRatio: Math.min(devicePixelRatio, 1.75), shadowSize: 2048, reflectorRes: 512, lakeRes: 384, aniso: 8, instanceScale: 0.7, dof: false, gtao: true },
    medium: { pixelRatio: Math.min(devicePixelRatio, 1.25), shadowSize: 1024, reflectorRes: 384, lakeRes: 256, aniso: 4, instanceScale: 0.45, dof: false, gtao: false },
  };
  const tier = detectTier();
  const quality = { tier, ...TIERS[tier] };
  quality.aniso = Math.min(quality.aniso, renderer.capabilities.getMaxAnisotropy());

  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);

  // ------------------------------------------------------------- composer
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
    window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 0 }));

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  let gtaoPass = null;
  if (quality.gtao) {
    try {
      gtaoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
      gtaoPass.output = GTAOPass.OUTPUT.Default;
      gtaoPass.updateGtaoMaterial({
        radius: 0.32, distanceExponent: 1.2, thickness: 1.0,
        scale: 1.15, samples: quality.tier === 'ultra' ? 16 : 8,
        distanceFallOff: 1.0, screenSpaceRadius: false,
      });
      gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
      gtaoPass.blendIntensity = 0.9;
      composer.addPass(gtaoPass);
    } catch (e) {
      console.warn('GTAO unavailable, skipping', e);
      gtaoPass = null;
    }
  }

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.55, 1.05);
  composer.addPass(bloomPass);

  const gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);

  const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
  composer.addPass(smaaPass);

  const finalPass = new ShaderPass(FinalShader);
  finalPass.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
  composer.addPass(finalPass);

  // ------------------------------------------------------------- reflections
  const floorReflector = new PlanarReflector(0.0, quality.reflectorRes);
  floorReflector.camera.layers.set(1);       // hero objects only
  const lakeReflector = new PlanarReflector(WATER_Y, quality.lakeRes);
  lakeReflector.camera.layers.set(1);

  // Inject planar reflection sampling into the (MeshStandardMaterial) floor.
  function attachFloorReflector(mesh) {
    floorReflector.hide.push(mesh);
    const mat = mesh.material;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.tPlanarReflect = { value: floorReflector.target.texture };
      shader.uniforms.uReflStrength = { value: 0.42 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vScreenPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvScreenPos = gl_Position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>',
          '#include <common>\nuniform sampler2D tPlanarReflect;\nuniform float uReflStrength;\nvarying vec4 vScreenPos;')
        .replace('#include <opaque_fragment>', /* glsl */`
          {
            vec2 screenUv = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;
            vec2 reflUv = vec2(1.0 - screenUv.x, screenUv.y);
            // perturb by the surface normal's xz wobble so grain breaks the mirror
            reflUv += normal.xz * 0.035;
            vec3 reflCol = texture2D(tPlanarReflect, clamp(reflUv, 0.001, 0.999)).rgb;
            float gloss = 1.0 - roughnessFactor;
            vec3 V = normalize(vViewPosition);
            float fres = pow(1.0 - abs(dot(normalize(normal), V)), 3.0);
            float k = uReflStrength * gloss * gloss * (0.25 + 0.75 * fres);
            outgoingLight += reflCol * k;
          }
          #include <opaque_fragment>`);
      mat.userData.shader = shader;
    };
    mat.needsUpdate = true;
  }

  // ------------------------------------------------------------- env probe
  let envRT = null;
  function probeEnvironment(position) {
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(0.12, 900, cubeRT);
    cubeCam.position.copy(position);
    scene.add(cubeCam);
    cubeCam.update(renderer, scene);
    scene.remove(cubeCam);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromCubemap(cubeRT.texture);
    pmrem.dispose();
    cubeRT.dispose();
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.85;
  }

  // Promote big/important meshes to layer 1 so reflection cameras see them.
  function assignReflectionLayers() {
    scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (o.userData.noReflect) return;
      if (o.userData.forceReflect) { o.layers.enable(1); return; }
      const g = o.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingSphere) return;
      const s = o.getWorldScale(new THREE.Vector3());
      const r = g.boundingSphere.radius * Math.max(s.x, s.y, s.z);
      if (o.isInstancedMesh || r > 0.55) o.layers.enable(1);
    });
  }

  // ------------------------------------------------------------- resize
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    if (gtaoPass) gtaoPass.setSize(w, h);
    bloomPass.setSize(w, h);
    smaaPass.setSize(w, h);
    finalPass.uniforms.uRes.value.set(w, h);
  }
  window.addEventListener('resize', onResize);

  // ------------------------------------------------------------- autoscale
  let fpsAccum = 0, fpsFrames = 0, fpsWindow = 0, scaleLocked = false;
  function autoscale(dt) {
    if (scaleLocked) return;
    fpsAccum += dt; fpsFrames++;
    fpsWindow += dt;
    if (fpsWindow < 4) return;
    const fps = fpsFrames / fpsAccum;
    fpsAccum = 0; fpsFrames = 0; fpsWindow = 0;
    if (fps < 42 && quality.tier !== 'medium') {
      const next = quality.tier === 'ultra' ? 'high' : 'medium';
      applyTier(next);
    } else if (fps >= 55) {
      scaleLocked = true;          // steady — stop probing
    }
  }
  function applyTier(tierName) {
    Object.assign(quality, { tier: tierName }, TIERS[tierName]);
    quality.aniso = Math.min(TIERS[tierName].aniso, renderer.capabilities.getMaxAnisotropy());
    renderer.setPixelRatio(quality.pixelRatio);
    sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    floorReflector.setSize(quality.reflectorRes);
    lakeReflector.setSize(quality.lakeRes);
    if (gtaoPass) gtaoPass.enabled = quality.gtao;
    onResize();
    console.info('[engine] quality →', tierName);
  }

  // ------------------------------------------------------------- render
  function render(dt, t) {
    floorReflector.render(renderer, scene, camera);
    lakeReflector.render(renderer, scene, camera);
    finalPass.uniforms.uTime.value = t % TIME_WRAP;
    composer.render(dt);
    autoscale(dt);
  }

  return {
    renderer, scene, camera, sun, hemi, sunDir, quality,
    composer, gradePass, finalPass, bloomPass,
    floorReflector, lakeReflector,
    attachFloorReflector, probeEnvironment, assignReflectionLayers,
    onResize, render, applyTier,
    setLetterbox(v) { finalPass.uniforms.uLetterbox.value = v; },
    setFade(v) { finalPass.uniforms.uFade.value = v; },
  };
}
