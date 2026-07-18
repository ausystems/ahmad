// tv.js — media wall (west wall). Seed 10000.
//
// A long low walnut credenza with ribbed sliding doors on a brass plinth,
// dressed with a fabric soundbar, a patinated-bronze ribbon sculpture on a
// nero-marble puck, two cloth coffee-table books with foil-titled covers, a
// face-down remote, and a glazed pot of trailing ivy spilling over the north
// end. Above it: an 85" wall-mounted OLED — thin graphite bezel, matte back
// pack, visible wall-mount shadow gap, protective glass sheet.
//
// The screen is a powered-off panel: a pure-black surface under the protective
// glass, so the room reflects faintly across it. No video, no media, no light
// cast, no interaction — purely architectural.
//
// Light budget: ZERO lights (the screen emits nothing). All glow is emissive.
// Colliders: the console only.
//
// Exports exactly: createTV(ctx) -> { group }

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TV, TIME_WRAP, mulberry32 } from './config.js';

const SEED = 10000;
const TAU = Math.PI * 2;

// Wrap-safe angular speed: n full cycles per TIME_WRAP → sin/cos are seamless
// across the tw wrap.
const W = (n) => (TAU * n) / TIME_WRAP;

// ---------------------------------------------------------------------------
// deterministic value noise (for wood + fabric imperfection)
// ---------------------------------------------------------------------------

function makeValueNoise(rng) {
  const N = 256;
  const lat = new Float32Array(N * N);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const at = (x, y) => lat[((y & 255) << 8) | (x & 255)];
  return function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function fbm(noise, x, y, oct) {
  let a = 0, amp = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { a += amp * noise(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return a;
}

// centered letter-tracked text (canvas letterSpacing is not universal)
function trackedText(c, str, cx, cy, track) {
  const prev = c.textAlign;
  c.textAlign = 'left';
  const ws = [];
  let total = 0;
  for (const ch of str) { const w = c.measureText(ch).width; ws.push(w); total += w; }
  total += track * Math.max(0, str.length - 1);
  let x = cx - total / 2;
  let i = 0;
  for (const ch of str) { c.fillText(ch, x, cy); x += ws[i++] + track; }
  c.textAlign = prev;
}

// ---------------------------------------------------------------------------
// createTV
// ---------------------------------------------------------------------------

export function createTV(ctx) {
  const tex = ctx.tex;
  const quality = ctx.quality;
  const aniso = quality.aniso || 4;
  const rng = mulberry32(SEED);
  const noise = makeValueNoise(mulberry32(SEED + 1));

  const group = new THREE.Group();
  group.name = 'tvWall';
  group.position.set(TV.pos[0], 0, TV.pos[2]);
  group.rotation.y = TV.rotY;
  // local frame: +z into the room, +x runs along the wall (world −z), wall
  // inner face sits at local z = −0.03.

  const WALL_Z = -0.03;
  const texSize = quality.tier === 'medium' ? 256 : 512;

  function canvasTex(cnv, srgb, rx, ry) {
    const t = new THREE.CanvasTexture(cnv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = aniso;
    return t;
  }

  // -------------------------------------------------------------------------
  // walnut veneer — one painter, feature lists shared across albedo/height/
  // roughness so the maps agree; a rotated variant gives vertical door grain
  // -------------------------------------------------------------------------

  function buildWalnutFeatures(S) {
    const k = S / 512;
    const streaks = [];
    const nStreaks = Math.round(230 * k);
    for (let i = 0; i < nStreaks; i++) {
      streaks.push({
        y0: rng() * S,
        amp: (1.5 + rng() * 5.5) * k,
        amp2: (0.5 + rng() * 2.0) * k,
        freq: 0.004 + rng() * 0.01,
        ph: rng() * TAU,
        ph2: rng() * TAU,
        w: (0.5 + rng() * 1.9) * k,
        light: rng() < 0.3,
        a: 0.04 + rng() * 0.1,
      });
    }
    const arcs = [];
    for (let g = 0; g < 5; g++) {
      const cx = rng() * S, cy = rng() * S;
      const n = 7 + Math.floor(rng() * 5);
      for (let j = 0; j < n; j++) {
        arcs.push({
          cx, cy,
          rx: (46 + j * 13 + rng() * 8) * k,
          ry: (10 + j * 3.4 + rng() * 4) * k,
          rot: (rng() - 0.5) * 0.35,
          a: 0.03 + rng() * 0.04,
        });
      }
    }
    const pores = [];
    const nPores = Math.round(2100 * k * k);
    for (let i = 0; i < nPores; i++) {
      pores.push({ x: rng() * S, y: rng() * S, l: (1 + rng() * 2.5) * k, a: 0.05 + rng() * 0.08 });
    }
    const patches = [];
    for (let i = 0; i < 9; i++) {
      patches.push({ x: rng() * S, y: rng() * S, r: S * (0.12 + rng() * 0.22), dark: rng() < 0.5, a: 0.04 + rng() * 0.04 });
    }
    return { streaks, arcs, pores, patches };
  }

  function paintWalnut(F, S, vertical, mode, c) {
    // mode: 'albedo' | 'height' | 'rough'
    c.save();
    if (vertical) {
      c.translate(S / 2, S / 2);
      c.rotate(Math.PI / 2);
      c.translate(-S / 2, -S / 2);
    }
    const pad = 48;
    if (mode === 'albedo') {
      const g = c.createLinearGradient(0, 0, S, S * 0.3);
      g.addColorStop(0, '#563a22');
      g.addColorStop(0.5, '#5f4128');
      g.addColorStop(1, '#523823');
      c.fillStyle = g;
      c.fillRect(-pad, -pad, S + pad * 2, S + pad * 2);
      for (const p of F.patches) {
        const rg = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        rg.addColorStop(0, p.dark ? `rgba(28,16,8,${p.a})` : `rgba(150,104,60,${p.a})`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = rg;
        c.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    } else if (mode === 'height') {
      c.fillStyle = '#808080';
      c.fillRect(-pad, -pad, S + pad * 2, S + pad * 2);
    } else {
      c.fillStyle = '#606060'; // satin base ≈ 0.38
      c.fillRect(-pad, -pad, S + pad * 2, S + pad * 2);
      for (const p of F.patches) {
        const rg = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        rg.addColorStop(0, p.dark ? `rgba(140,140,140,${p.a * 2})` : `rgba(70,70,70,${p.a * 2.4})`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = rg;
        c.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    }
    // grain streaks
    c.lineCap = 'round';
    for (const s of F.streaks) {
      if (mode === 'albedo') {
        c.strokeStyle = s.light ? `rgba(172,120,68,${s.a * 0.8})` : `rgba(30,17,8,${s.a})`;
      } else if (mode === 'height') {
        c.strokeStyle = `rgba(58,58,58,${Math.min(0.45, s.a * 1.6)})`;
      } else {
        c.strokeStyle = `rgba(146,146,146,${s.a * 1.1})`;
      }
      c.lineWidth = mode === 'height' ? s.w * 0.8 : s.w;
      c.beginPath();
      for (let x = -pad; x <= S + pad; x += 14) {
        const y = s.y0 + s.amp * Math.sin(s.ph + x * s.freq) + s.amp2 * Math.sin(s.ph2 + x * s.freq * 2.7);
        if (x === -pad) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    // cathedral figure
    for (const a of F.arcs) {
      c.strokeStyle = mode === 'albedo' ? `rgba(34,20,10,${a.a})`
        : mode === 'height' ? `rgba(64,64,64,${a.a * 1.4})`
        : `rgba(132,132,132,${a.a})`;
      c.lineWidth = 1.1;
      c.save();
      c.translate(a.cx, a.cy);
      c.rotate(a.rot);
      c.beginPath();
      c.ellipse(0, 0, a.rx, a.ry, 0, 0, TAU);
      c.stroke();
      c.restore();
    }
    // pores
    for (const p of F.pores) {
      c.fillStyle = mode === 'albedo' ? `rgba(24,13,6,${p.a})`
        : mode === 'height' ? `rgba(40,40,40,${p.a * 2})`
        : `rgba(150,150,150,${p.a})`;
      c.fillRect(p.x, p.y, 1, p.l);
    }
    c.restore();
  }

  function makeWalnutSet(vertical, rx, ry) {
    const F = buildWalnutFeatures(texSize);
    const albedo = tex.makeCanvas(texSize, (c, s) => paintWalnut(F, s, vertical, 'albedo', c));
    const height = tex.makeCanvas(texSize, (c, s) => paintWalnut(F, s, vertical, 'height', c));
    const rough = tex.makeCanvas(texSize, (c, s) => paintWalnut(F, s, vertical, 'rough', c));
    const map = canvasTex(albedo, true, rx, ry);
    const normalMap = tex.normalFromHeight(height, 0.7);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(rx, ry);
    normalMap.anisotropy = aniso;
    const roughnessMap = canvasTex(rough, false, rx, ry);
    return { map, normalMap, roughnessMap };
  }

  const walnutH = makeWalnutSet(false, 1.6, 0.9);   // carcass / top (long grain)
  const walnutV = makeWalnutSet(true, 1.2, 1.0);    // doors + ribs (vertical grain)

  const walnutHMat = new THREE.MeshStandardMaterial({
    map: walnutH.map, normalMap: walnutH.normalMap, roughnessMap: walnutH.roughnessMap,
    normalScale: new THREE.Vector2(0.55, 0.55), roughness: 1.0, metalness: 0.0,
    envMapIntensity: 0.9,
  });
  const walnutVMat = new THREE.MeshStandardMaterial({
    map: walnutV.map, normalMap: walnutV.normalMap, roughnessMap: walnutV.roughnessMap,
    normalScale: new THREE.Vector2(0.55, 0.55), roughness: 1.0, metalness: 0.0,
    envMapIntensity: 0.9,
  });

  // factory metals / stone / paper
  const brassMat = tex.std(tex.brass({ repeat: [4, 0.5], seed: SEED + 7 }), {
    metalness: 1.0, roughness: 0.34, envMapIntensity: 1.15,
  });
  const bronzeMat = tex.std(tex.bronze({ repeat: [3, 3], seed: SEED + 8 }), {
    metalness: 1.0, roughness: 0.44, envMapIntensity: 1.05,
  });
  const neroMat = tex.std(tex.marble({ tone: 'nero', repeat: [1, 1], seed: SEED + 9 }), {
    envMapIntensity: 1.0,
  });

  // -------------------------------------------------------------------------
  // CONSOLE — 2.6 m credenza, ribbed sliding doors, brass plinth
  // -------------------------------------------------------------------------

  const CON = {
    len: 2.6, backZ: -0.01, frontZ: 0.44,
    plinthH: 0.07, bodyTop: 0.60, topY: 0.63,
  };

  const walnutHGeos = [];
  const walnutVGeos = [];
  const brassGeos = [];

  function pushAt(list, geo, x, y, z, ry) {
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    list.push(geo);
  }

  // carcass body (0.07 → 0.60), depth −0.01 → 0.44
  pushAt(walnutHGeos, new RoundedBoxGeometry(CON.len, 0.53, 0.45, 2, 0.008), 0, 0.335, 0.215, 0);
  // overhanging top slab (0.60 → 0.63) covering the proud doors
  pushAt(walnutHGeos, new RoundedBoxGeometry(CON.len + 0.04, 0.03, 0.50, 2, 0.007), 0, 0.615, 0.235, 0);
  // brass plinth, inset
  pushAt(brassGeos, new RoundedBoxGeometry(CON.len - 0.16, 0.07, 0.36, 1, 0.008), 0, 0.035, 0.20, 0);

  // sliding doors — A recessed, B proud & slid 30 mm (track look)
  const doorW = 1.27, doorH = 0.46;
  pushAt(walnutVGeos, new RoundedBoxGeometry(doorW, doorH, 0.018, 1, 0.004), -0.635, 0.335, 0.450, 0);
  pushAt(walnutVGeos, new RoundedBoxGeometry(doorW, doorH, 0.018, 1, 0.004), 0.665, 0.335, 0.463, 0);
  // brass sliding tracks
  pushAt(brassGeos, new RoundedBoxGeometry(CON.len - 0.06, 0.012, 0.016, 1, 0.003), 0, 0.578, 0.458, 0);
  pushAt(brassGeos, new RoundedBoxGeometry(CON.len - 0.06, 0.012, 0.016, 1, 0.003), 0, 0.092, 0.458, 0);
  // finger pulls at meeting stiles
  pushAt(brassGeos, new RoundedBoxGeometry(0.013, 0.34, 0.007, 1, 0.0025), -0.045, 0.335, 0.462, 0);
  pushAt(brassGeos, new RoundedBoxGeometry(0.013, 0.34, 0.007, 1, 0.0025), 0.075, 0.335, 0.475, 0);

  const consoleWood = new THREE.Mesh(mergeGeometries(walnutHGeos), walnutHMat);
  consoleWood.castShadow = true;
  consoleWood.receiveShadow = true;
  group.add(consoleWood);

  const consoleDoors = new THREE.Mesh(mergeGeometries(walnutVGeos), walnutVMat);
  consoleDoors.receiveShadow = true;
  group.add(consoleDoors);

  const consoleBrass = new THREE.Mesh(mergeGeometries(brassGeos), brassMat);
  consoleBrass.receiveShadow = true;
  group.add(consoleBrass);

  // ribbed door faces — instanced vertical half-round ribs w/ per-rib tint
  {
    const ribR = 0.006, ribH = doorH - 0.03;
    const ribGeo = new THREE.CylinderGeometry(ribR, ribR, ribH, 7, 1, false, -Math.PI / 2, Math.PI);
    const doors = [
      { x0: -0.635 - doorW / 2 + 0.028, z: 0.459 },
      { x0: 0.665 - doorW / 2 + 0.028, z: 0.472 },
    ];
    const pitch = 0.0185;
    const perDoor = Math.floor((doorW - 0.056) / pitch) + 1;
    const ribs = new THREE.InstancedMesh(ribGeo, walnutVMat, perDoor * doors.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    let idx = 0;
    for (const d of doors) {
      for (let i = 0; i < perDoor; i++) {
        p.set(d.x0 + i * pitch, 0.335, d.z + (rng() - 0.5) * 0.0006);
        sc.set(1, 0.994 + rng() * 0.006, 1);
        q.identity();
        m.compose(p, q, sc);
        ribs.setMatrixAt(idx, m);
        const v = 0.94 + rng() * 0.1;
        ribs.setColorAt(idx, col.setRGB(v, v * (0.985 + rng() * 0.03), v * 0.97));
        idx++;
      }
    }
    ribs.instanceMatrix.needsUpdate = true;
    if (ribs.instanceColor) ribs.instanceColor.needsUpdate = true;
    ribs.receiveShadow = true;
    group.add(ribs);
  }

  // console collider (world space: local z → world x, local x → world −z)
  ctx.colliders.push({
    min: { x: TV.pos[0] + WALL_Z - 0.005, y: 0, z: TV.pos[2] - (CON.len / 2 + 0.03) },
    max: { x: TV.pos[0] + 0.50, y: 1.0, z: TV.pos[2] + (CON.len / 2 + 0.03) },
  });

  // soft contact shadow on the parquet under the console front
  {
    const shadowCanvas = tex.makeCanvas(128, (c, s) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, s, s);
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(30,24,18,0.42)');
      g.addColorStop(0.6, 'rgba(30,24,18,0.18)');
      g.addColorStop(1, 'rgba(30,24,18,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    });
    const t = new THREE.CanvasTexture(shadowCanvas);
    const mat = new THREE.MeshBasicMaterial({
      map: t, blending: THREE.MultiplyBlending, transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.72), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.004, 0.26);
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  // -------------------------------------------------------------------------
  // SOUNDBAR — fabric wrap with visible weave
  // -------------------------------------------------------------------------
  {
    const S = 256;
    const weaveJit = [];
    for (let i = 0; i < 220; i++) weaveJit.push(rng());
    const fabricAlbedo = tex.makeCanvas(S, (c, s) => {
      c.fillStyle = '#111318';
      c.fillRect(0, 0, s, s);
      let j = 0;
      for (let y = 0; y < s; y += 3) {
        const v = 14 + weaveJit[(j++) % weaveJit.length] * 9;
        c.fillStyle = `rgb(${v | 0},${(v + 1) | 0},${(v + 4) | 0})`;
        c.fillRect(0, y, s, 1);
      }
      for (let x = 0; x < s; x += 3) {
        const v = 12 + weaveJit[(j++) % weaveJit.length] * 9;
        c.fillStyle = `rgba(${v | 0},${(v + 1) | 0},${(v + 4) | 0},0.55)`;
        c.fillRect(x, 0, 1, s);
      }
      for (let i = 0; i < 900; i++) {
        const x = (fbm(noise, i * 0.13, 7.7, 2) * 1.7 * s) % s;
        const y = (fbm(noise, 3.1, i * 0.17, 2) * 1.7 * s) % s;
        c.fillStyle = `rgba(200,205,215,${0.02 + (i % 5) * 0.008})`;
        c.fillRect(Math.abs(x), Math.abs(y), 1, 1);
      }
    });
    const fabricHeight = tex.makeCanvas(S, (c, s) => {
      c.fillStyle = '#808080';
      c.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 3) { c.fillStyle = 'rgba(60,60,60,0.5)'; c.fillRect(0, y + 2, s, 1); }
      for (let x = 0; x < s; x += 3) { c.fillStyle = 'rgba(96,96,96,0.5)'; c.fillRect(x + 2, 0, 1, s); }
    });
    const fMap = canvasTex(fabricAlbedo, true, 9, 1.2);
    const fNorm = tex.normalFromHeight(fabricHeight, 0.55);
    fNorm.wrapS = fNorm.wrapT = THREE.RepeatWrapping;
    fNorm.repeat.set(9, 1.2);
    const fabricMat = new THREE.MeshStandardMaterial({
      map: fMap, normalMap: fNorm, roughness: 0.88, metalness: 0.0, envMapIntensity: 0.6,
    });
    const bar = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.075, 0.095, 3, 0.03), fabricMat);
    bar.position.set(0, CON.topY + 0.0385, 0.30);
    bar.receiveShadow = true;
    group.add(bar);
    // dark aluminum end caps
    const capMat = new THREE.MeshStandardMaterial({ color: 0x24262b, metalness: 0.85, roughness: 0.4 });
    const capGeo = new THREE.CylinderGeometry(0.0335, 0.0335, 0.012, 20);
    const caps = [];
    for (const sx of [-1, 1]) {
      const g = capGeo.clone();
      g.rotateZ(Math.PI / 2);
      g.translate(sx * 0.551, 0, 0);
      caps.push(g);
    }
    const capMesh = new THREE.Mesh(mergeGeometries(caps), capMat);
    capMesh.position.copy(bar.position);
    group.add(capMesh);
    // status pinprick
    const barLed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0016, 0.0016, 0.004, 8),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0xffbb66, emissiveIntensity: 0.9, roughness: 0.4 })
    );
    barLed.rotation.x = Math.PI / 2;
    barLed.position.set(0.50, CON.topY + 0.038, 0.349);
    group.add(barLed);
  }

  // -------------------------------------------------------------------------
  // BRONZE RIBBON SCULPTURE on a nero puck (south end of the console)
  // -------------------------------------------------------------------------
  {
    const pts = [new THREE.Vector3(0.062, 0.016, 0.014)];
    const NP = 46;
    for (let i = 0; i <= NP; i++) {
      const a = i / NP;
      const ang = a * Math.PI * 1.92 - 0.42;
      const r = 0.082 * (1 - 0.22 * Math.sin(a * Math.PI));
      pts.push(new THREE.Vector3(
        Math.cos(ang) * r,
        0.112 + Math.sin(ang) * 0.098,
        Math.sin(a * Math.PI * 2) * 0.028
      ));
    }
    pts.push(new THREE.Vector3(-0.048, 0.016, -0.02));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const tube = new THREE.TubeGeometry(curve, 100, 0.0125, 10, false);
    const sculpt = new THREE.Mesh(tube, bronzeMat);
    // nero puck plinth with chamfered edge (lathe)
    const prof = [
      new THREE.Vector2(0.0, 0),
      new THREE.Vector2(0.062, 0),
      new THREE.Vector2(0.066, 0.004),
      new THREE.Vector2(0.066, 0.016),
      new THREE.Vector2(0.062, 0.02),
      new THREE.Vector2(0.0, 0.02),
    ];
    const puck = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), neroMat);
    const sGroup = new THREE.Group();
    sGroup.add(puck, sculpt);
    sGroup.position.set(-0.95, CON.topY, 0.20);
    sGroup.rotation.y = rng() * TAU;
    group.add(sGroup);
  }

  // -------------------------------------------------------------------------
  // COFFEE-TABLE BOOKS ×2 with foil-title decals
  // -------------------------------------------------------------------------
  {
    const pageCanvas = tex.makeCanvas(128, (c, s) => {
      c.fillStyle = '#e6dcc2';
      c.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 2) {
        c.fillStyle = `rgba(120,100,70,${0.10 + (fbm(noise, 3, y * 0.4, 2)) * 0.22})`;
        c.fillRect(0, y, s, 1);
      }
    });
    const pageMat = new THREE.MeshStandardMaterial({
      map: canvasTex(pageCanvas, true, 1, 1), roughness: 0.9, metalness: 0,
    });

    function clothMat(hex) {
      const base = new THREE.Color(hex);
      const cnv = tex.makeCanvas(128, (c, s) => {
        c.fillStyle = `#${base.getHexString()}`;
        c.fillRect(0, 0, s, s);
        for (let i = 0; i < 2400; i++) {
          const x = rng() * s, y = rng() * s;
          c.fillStyle = rng() < 0.5 ? 'rgba(255,245,225,0.05)' : 'rgba(10,8,6,0.07)';
          c.fillRect(x, y, 1, 1);
        }
      });
      return new THREE.MeshStandardMaterial({
        map: canvasTex(cnv, true, 2, 2), roughness: 0.82, metalness: 0, envMapIntensity: 0.6,
      });
    }

    function titleDecal(str, wPx) {
      const cnv = document.createElement('canvas');
      cnv.width = 256; cnv.height = 96;
      const c = cnv.getContext('2d');
      c.clearRect(0, 0, 256, 96);
      c.fillStyle = 'rgba(214,182,110,0.95)';
      c.font = `400 ${wPx}px Marcellus, Georgia, serif`;
      c.textBaseline = 'middle';
      trackedText(c, str, 128, 44, 7);
      c.fillRect(128 - 42, 70, 84, 1.6);
      const t = new THREE.CanvasTexture(cnv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      return new THREE.MeshStandardMaterial({
        map: t, transparent: true, depthWrite: false, metalness: 0.65, roughness: 0.38,
      });
    }

    function buildBook(w, d, tPages, clothHex, title, fontPx) {
      const g = new THREE.Group();
      const cover = 0.0035;
      const cGeos = [];
      // bottom + top boards
      let bg = new RoundedBoxGeometry(w, cover, d, 1, 0.0015);
      bg.translate(0, cover / 2, 0); cGeos.push(bg);
      bg = new RoundedBoxGeometry(w, cover, d, 1, 0.0015);
      bg.translate(0, cover + tPages + cover / 2, 0); cGeos.push(bg);
      // spine wrap on −x edge
      bg = new RoundedBoxGeometry(0.007, tPages + cover * 2, d, 1, 0.0025);
      bg.translate(-w / 2 + 0.0015, (tPages + cover * 2) / 2, 0); cGeos.push(bg);
      const clothMesh = new THREE.Mesh(mergeGeometries(cGeos), clothMat(clothHex));
      clothMesh.receiveShadow = true;
      g.add(clothMesh);
      // page block
      const pages = new THREE.Mesh(new RoundedBoxGeometry(w - 0.01, tPages, d - 0.008, 1, 0.0018), pageMat);
      pages.position.set(0.004, cover + tPages / 2, 0);
      g.add(pages);
      // foil title on the front board
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.62, w * 0.62 * 0.375), titleDecal(title, fontPx));
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(0.006, cover * 2 + tPages + 0.0006, 0);
      g.add(decal);
      return g;
    }

    const bookA = buildBook(0.355, 0.265, 0.024, 0x24382c, 'MENDOZA', 40);
    bookA.position.set(0.85, CON.topY, 0.20);
    bookA.rotation.y = -0.16;
    group.add(bookA);
    const bookB = buildBook(0.305, 0.235, 0.019, 0x3c2a2a, 'NOCTURNES', 30);
    bookB.position.set(0.845, CON.topY + 0.031, 0.205);
    bookB.rotation.y = 0.19;
    group.add(bookB);
  }

  // remote, face-down near the books
  {
    const remote = new THREE.Mesh(
      new RoundedBoxGeometry(0.044, 0.014, 0.148, 2, 0.006),
      new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.5, metalness: 0.15 })
    );
    remote.position.set(0.56, CON.topY + 0.007, 0.355);
    remote.rotation.y = 0.42;
    group.add(remote);
  }

  // -------------------------------------------------------------------------
  // TRAILING IVY in a glazed pot (north end, spilling over the side)
  // -------------------------------------------------------------------------
  {
    const ivy = new THREE.Group();
    ivy.position.set(1.12, CON.topY, 0.14);
    group.add(ivy);

    // glazed pot
    const potProf = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.046, 0.0),
      new THREE.Vector2(0.06, 0.008),
      new THREE.Vector2(0.068, 0.05),
      new THREE.Vector2(0.065, 0.09),
      new THREE.Vector2(0.058, 0.114),
      new THREE.Vector2(0.061, 0.122),
      new THREE.Vector2(0.056, 0.126),
      new THREE.Vector2(0.05, 0.116),
      new THREE.Vector2(0.05, 0.108),
    ];
    const pot = new THREE.Mesh(
      new THREE.LatheGeometry(potProf, 30),
      new THREE.MeshPhysicalMaterial({
        color: 0x263a3c, roughness: 0.34, metalness: 0.0,
        clearcoat: 0.7, clearcoatRoughness: 0.28, envMapIntensity: 1.0,
      })
    );
    pot.receiveShadow = true;
    ivy.add(pot);
    const soil = new THREE.Mesh(
      new THREE.CircleGeometry(0.049, 20),
      new THREE.MeshStandardMaterial({ color: 0x231a11, roughness: 1.0 })
    );
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.112;
    ivy.add(soil);

    // vines: 4 spill over the +x end of the console, 2 crawl along the top
    const vineGroup = new THREE.Group();
    ivy.add(vineGroup);
    const curves = [];
    const tubeGeos = [];
    for (let v = 0; v < 6; v++) {
      const spill = v < 4;
      const dA = spill ? (rng() - 0.5) * 1.0 : Math.PI + (rng() - 0.5) * 0.8;
      const dx = Math.cos(dA), dz = Math.sin(dA);
      const rimA = dA + (rng() - 0.5) * 0.6;
      const pts = [new THREE.Vector3(Math.cos(rimA) * 0.03, 0.112, Math.sin(rimA) * 0.03)];
      if (spill) {
        const drop = 0.34 + rng() * 0.2;
        pts.push(new THREE.Vector3(dx * (0.09 + rng() * 0.03), 0.10 + rng() * 0.02, dz * 0.09 + (rng() - 0.5) * 0.03));
        pts.push(new THREE.Vector3(dx * (0.17 + rng() * 0.03), 0.028, dz * 0.14 + (rng() - 0.5) * 0.04));
        pts.push(new THREE.Vector3(dx * (0.22 + rng() * 0.03), -0.14 - rng() * 0.05, dz * 0.17 + (rng() - 0.5) * 0.05));
        pts.push(new THREE.Vector3(dx * (0.25 + rng() * 0.04), -drop, dz * 0.19 + (rng() - 0.5) * 0.06));
      } else {
        pts.push(new THREE.Vector3(dx * (0.08 + rng() * 0.03), 0.09, dz * 0.07 + (rng() - 0.5) * 0.04));
        pts.push(new THREE.Vector3(dx * (0.18 + rng() * 0.04), 0.02, dz * 0.12 + (rng() - 0.5) * 0.06));
        pts.push(new THREE.Vector3(dx * (0.30 + rng() * 0.06), 0.006, dz * 0.16 + (rng() - 0.5) * 0.07));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      curves.push(curve);
      tubeGeos.push(new THREE.TubeGeometry(curve, 36, 0.0034, 6, false));
    }
    const stems = new THREE.Mesh(
      mergeGeometries(tubeGeos),
      new THREE.MeshStandardMaterial({ color: 0x3c4d28, roughness: 0.72 })
    );
    vineGroup.add(stems);

    // leaf texture
    const leafCanvas = tex.makeCanvas(128, (c, s) => {
      c.clearRect(0, 0, s, s);
      const k = s / 128;
      c.save();
      c.scale(k, k);
      const g = c.createLinearGradient(0, 8, 0, 120);
      g.addColorStop(0, '#5c8a3e');
      g.addColorStop(0.55, '#3c6229');
      g.addColorStop(1, '#2c4a20');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(64, 122);
      c.bezierCurveTo(40, 108, 8, 92, 12, 66);
      c.bezierCurveTo(15, 44, 34, 40, 40, 30);
      c.bezierCurveTo(46, 16, 56, 8, 64, 5);
      c.bezierCurveTo(72, 8, 82, 16, 88, 30);
      c.bezierCurveTo(94, 40, 113, 44, 116, 66);
      c.bezierCurveTo(120, 92, 88, 108, 64, 122);
      c.closePath();
      c.fill();
      // veins
      c.strokeStyle = 'rgba(190,215,150,0.55)';
      c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(64, 118); c.lineTo(64, 12); c.stroke();
      c.lineWidth = 1.0;
      for (const [tx, ty] of [[22, 62], [106, 62], [42, 32], [86, 32]]) {
        c.beginPath(); c.moveTo(64, 96); c.quadraticCurveTo((64 + tx) / 2, (96 + ty) / 2 - 8, tx, ty); c.stroke();
      }
      c.strokeStyle = 'rgba(20,34,14,0.5)';
      c.lineWidth = 2;
      c.stroke();
      c.restore();
    });
    const leafTex = new THREE.CanvasTexture(leafCanvas);
    leafTex.colorSpace = THREE.SRGBColorSpace;
    leafTex.anisotropy = aniso;
    const leafMat = new THREE.MeshStandardMaterial({
      map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide,
      roughness: 0.58, metalness: 0, envMapIntensity: 0.7,
    });
    const leafGeo = new THREE.PlaneGeometry(0.056, 0.052, 2, 1);
    {
      // center crease + tip cup
      const lp = leafGeo.attributes.position;
      for (let i = 0; i < lp.count; i++) {
        if (Math.abs(lp.getX(i)) < 1e-6) lp.setZ(i, 0.007);
      }
      leafGeo.computeVertexNormals();
      leafGeo.translate(0, 0.024, 0); // pivot at the stem
    }
    const perVine = 14;
    const leafCount = Math.max(24, Math.round(perVine * 6 * (quality.instanceScale || 1)));
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);
    const dummy = new THREE.Object3D();
    const lCol = new THREE.Color();
    for (let i = 0; i < leafCount; i++) {
      const curve = curves[i % curves.length];
      const t = 0.14 + rng() * 0.85;
      const pos = curve.getPoint(Math.min(1, t));
      dummy.position.copy(pos);
      dummy.rotation.set(
        0.55 + (rng() - 0.5) * 1.3,
        rng() * TAU,
        (rng() - 0.5) * 1.1
      );
      const s = 0.72 + rng() * 0.55;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
      leaves.setColorAt(i, lCol.setHSL(0.26 + (rng() - 0.5) * 0.045, 0.42 + rng() * 0.18, 0.34 + rng() * 0.16));
    }
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    vineGroup.add(leaves);

    // near-imperceptible idle sway of the vines only (wrap-safe harmonics)
    ctx.updates.push((dt, tw) => {
      vineGroup.rotation.z = 0.004 * Math.sin(tw * W(700)) + 0.002 * Math.sin(tw * W(1130));
      vineGroup.rotation.x = 0.003 * Math.sin(tw * W(560) + 1.7);
    });
  }

  // -------------------------------------------------------------------------
  // THE TV — mount, back pack, bezel, screen, glass, glint, LED
  // -------------------------------------------------------------------------

  const tvGroup = new THREE.Group();
  tvGroup.position.set(0, TV.pos[1], 0);
  group.add(tvGroup);

  const SCREEN_W = TV.w, SCREEN_H = TV.h;

  // wall AO blot behind the panel (multiply decal seats it on the grasscloth)
  {
    const aoCanvas = tex.makeCanvas(128, (c, s) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, s, s);
      const g = c.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s * 0.5);
      g.addColorStop(0, 'rgba(26,22,16,0.34)');
      g.addColorStop(0.75, 'rgba(26,22,16,0.12)');
      g.addColorStop(1, 'rgba(26,22,16,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    });
    const t = new THREE.CanvasTexture(aoCanvas);
    const blot = new THREE.Mesh(
      new THREE.PlaneGeometry(SCREEN_W + 0.5, SCREEN_H + 0.42),
      new THREE.MeshBasicMaterial({ map: t, blending: THREE.MultiplyBlending, transparent: true, depthWrite: false })
    );
    blot.position.set(0, 0, WALL_Z + 0.002);
    blot.renderOrder = 1;
    tvGroup.add(blot);
  }

  // wall-mount: plate + two arms bridging the shadow gap to the wall
  {
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.6, metalness: 0.4 });
    const geos = [];
    let g = new RoundedBoxGeometry(0.62, 0.38, 0.024, 1, 0.004);
    g.translate(0, 0, -0.009);
    geos.push(g);
    for (const sx of [-1, 1]) {
      g = new RoundedBoxGeometry(0.05, 0.30, 0.014, 1, 0.003);
      g.translate(sx * 0.22, 0, -0.023);
      geos.push(g);
    }
    tvGroup.add(new THREE.Mesh(mergeGeometries(geos), darkMat));
  }

  // back pack (matte dark) — floats off the wall: the shadow gap
  {
    const back = new THREE.Mesh(
      new RoundedBoxGeometry(SCREEN_W + 0.02, SCREEN_H + 0.02, 0.032, 2, 0.006),
      new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.65, metalness: 0.1 })
    );
    back.position.set(0, 0, 0.022);
    tvGroup.add(back);
  }

  // bezel — extruded frame with a 3 mm bevel (2 cm face)
  {
    const outerW = SCREEN_W + 0.036, outerH = SCREEN_H + 0.036;
    const shape = new THREE.Shape();
    shape.moveTo(-outerW / 2, -outerH / 2);
    shape.lineTo(outerW / 2, -outerH / 2);
    shape.lineTo(outerW / 2, outerH / 2);
    shape.lineTo(-outerW / 2, outerH / 2);
    shape.closePath();
    const hole = new THREE.Path();
    const hw = SCREEN_W / 2 - 0.002, hh = SCREEN_H / 2 - 0.002;
    hole.moveTo(-hw, -hh);
    hole.lineTo(hw, -hh);
    hole.lineTo(hw, hh);
    hole.lineTo(-hw, hh);
    hole.closePath();
    shape.holes.push(hole);
    const bezelGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.009, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.0025, bevelSegments: 2,
    });
    bezelGeo.translate(0, 0, 0.040);
    const bezel = new THREE.Mesh(
      bezelGeo,
      new THREE.MeshStandardMaterial({ color: 0x1a1b1d, metalness: 0.88, roughness: 0.32, envMapIntensity: 1.1 })
    );
    tvGroup.add(bezel);
  }

  // chin wordmark — hairline silver "SKYBOUND"
  {
    const cnv = document.createElement('canvas');
    cnv.width = 256; cnv.height = 40;
    const c = cnv.getContext('2d');
    c.clearRect(0, 0, 256, 40);
    c.fillStyle = 'rgba(206,210,218,0.8)';
    c.font = '500 17px Archivo, sans-serif';
    c.textBaseline = 'middle';
    trackedText(c, 'SKYBOUND', 128, 21, 7);
    const t = new THREE.CanvasTexture(cnv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    const chip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.085, 0.0133),
      new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, metalness: 0.7, roughness: 0.35 })
    );
    chip.position.set(0, -SCREEN_H / 2 - 0.0105, 0.0530);
    tvGroup.add(chip);
  }

  // -------------------------------------------------------------------------
  // screen — a powered-off OLED: pure-black panel under protective glass, so
  // the room reflects faintly across it. No video, no media, no light, no
  // interaction; purely architectural.
  // -------------------------------------------------------------------------

  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 0.16,
    metalness: 0.0,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat);
  screen.position.set(0, 0, 0.0405);
  tvGroup.add(screen);

  // protective glass — window/room reflections live here so the black screen
  // reads as real glass rather than a flat void
  const glassMat = quality.tier === 'medium'
    ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff, transparent: true, opacity: 0.06,
        roughness: 0.05, metalness: 0, envMapIntensity: 1.4, depthWrite: false,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0xffffff, transmission: 1.0, thickness: 0.004,
        roughness: 0.03, metalness: 0, ior: 1.5, envMapIntensity: 1.3,
      });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W - 0.004, SCREEN_H - 0.004), glassMat);
  glass.position.set(0, 0, 0.0465);
  glass.renderOrder = 2;
  tvGroup.add(glass);

  return { group };
}
