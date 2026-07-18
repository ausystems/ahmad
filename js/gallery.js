// gallery.js — the five website installations. Museum-grade backlit OLED
// panels in chamfered bronze shadow-gap frames on the north & east walls,
// brass picture lights (one SpotLight each — this module's entire 5-light
// budget), engraved paper placards, additive floor light-pools, and a
// walnut/leather museum bench facing the north trio. Seed 9000.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ART_SLOTS, ART_PANEL, mulberry32 } from './config.js';
import { WORKS } from './data.js';

// ---------------------------------------------------------------------------
// pure canvas-text helpers
// ---------------------------------------------------------------------------

const FONT_SERIF = 'Marcellus, Georgia, serif';
const FONT_SANS = 'Archivo, "Helvetica Neue", Arial, sans-serif';

// left-aligned letter-spaced text; returns end x
function drawSpaced(c, text, x, y, ls) {
  let cx = x;
  for (const ch of text) {
    c.fillText(ch, cx, y);
    cx += c.measureText(ch).width + ls;
  }
  return cx - ls;
}

// centered letter-spaced text
function drawSpacedCentered(c, text, cx, y, ls) {
  let w = 0;
  for (const ch of text) w += c.measureText(ch).width + ls;
  w -= ls;
  drawSpaced(c, text, cx - w / 2, y, ls);
}

// greedy 2-line wrap with ellipsis (font must be set on c before calling)
function wrapTwo(c, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  let idx = 0;
  while (idx < words.length && lines.length < 2) {
    const t = line ? line + ' ' + words[idx] : words[idx];
    if (c.measureText(t).width > maxW && line) {
      lines.push(line);
      line = '';
    } else {
      line = t;
      idx++;
    }
  }
  if (line && lines.length < 2) { lines.push(line); line = ''; }
  if (idx < words.length || line) {
    let last = (lines[lines.length - 1] || '') + '…';
    while (c.measureText(last).width > maxW && last.length > 4) {
      last = last.slice(0, -2) + '…';
    }
    lines[lines.length - 1] = last;
  }
  return lines;
}

// shrink a font size until text fits maxW; returns chosen px
function fitSerif(c, text, startPx, maxW) {
  let px = startPx;
  for (;;) {
    c.font = `400 ${px}px ${FONT_SERIF}`;
    if (c.measureText(text).width <= maxW || px <= 20) return px;
    px -= 2;
  }
}

// ---------------------------------------------------------------------------
// createGallery
// ---------------------------------------------------------------------------

export function createGallery(ctx) {
  const group = new THREE.Group();
  group.name = 'gallery';

  const T = ctx.tex || null;
  const ANISO = (ctx.quality && ctx.quality.aniso) || 4;
  const isMedium = !!(ctx.quality && ctx.quality.tier === 'medium');
  const rngRoot = mulberry32(9000);

  // ------------------------------------------------------------- dimensions
  const SW = ART_PANEL.w;            // 2.30 screen width
  const SH = ART_PANEL.h;            // 1.44 screen height
  const BEZEL = 0.05;                // black bezel around the OLED
  const bodyW = SW + BEZEL * 2;      // 2.40 matte-black panel body
  const bodyH = SH + BEZEL * 2;      // 1.54
  const GAP = 0.02;                  // shadow gap body → frame lip (per side)
  const holeW = bodyW + GAP * 2;     // 2.44 frame inner opening
  const holeH = bodyH + GAP * 2;     // 1.58
  const FACE = 0.10;                 // bronze frame face width
  const outerW = holeW + FACE * 2;   // 2.64 frame outer
  const outerH = holeH + FACE * 2;   // 1.78
  const WALL_Z = -0.03;              // wall inner face in panel-local space
  const hoodY = outerH / 2 + 0.26;   // picture-light hood height (local)
  const hoodZ = 0.30;
  const hoodLen = 1.42;

  // ------------------------------------------------------------- materials
  function safeSet(name, opts) {
    try { return T && typeof T[name] === 'function' ? T[name](opts) : null; }
    catch (e) { return null; }
  }
  function stdMat(set, ov, fallback) {
    try { if (T && typeof T.std === 'function') return T.std(set, ov); }
    catch (e) { /* fall through */ }
    return new THREE.MeshStandardMaterial(Object.assign({}, fallback || {}, ov || {}));
  }
  function physMat(set, ov, fallback) {
    try { if (T && typeof T.phys === 'function') return T.phys(set, ov); }
    catch (e) { /* fall through */ }
    return new THREE.MeshPhysicalMaterial(Object.assign({}, fallback || {}, ov || {}));
  }

  const bronzeSet = safeSet('bronze', { repeat: [2.4, 2.4], seed: 9101 });
  const brassSet = safeSet('brass', { repeat: [2, 2], seed: 9102 });
  const leatherSet = safeSet('leather', { repeat: [2, 1], seed: 9103 });
  const paperSet = safeSet('paper', { repeat: [1, 1], seed: 9104 });

  const mBronze = stdMat(bronzeSet,
    { metalness: 1.0, envMapIntensity: 1.2 },
    { color: 0x6e5432, metalness: 1.0, roughness: 0.42 });
  const mBrass = stdMat(brassSet,
    { metalness: 1.0, envMapIntensity: 1.3 },
    { color: 0xc8a24a, metalness: 1.0, roughness: 0.3 });
  // matte-black anodized aluminum — the OLED chassis
  const mBlack = physMat(null, {
    color: 0x17181a, metalness: 0.86, roughness: 0.52,
    clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.8,
  }, { color: 0x17181a, metalness: 0.86, roughness: 0.52 });

  // protective glass: full transmission on high tiers, cheap transparency on medium
  const mGlass = isMedium
    ? new THREE.MeshPhysicalMaterial({
        color: 0xf2f7f2, transparent: true, opacity: 0.10, roughness: 0.04,
        metalness: 0, envMapIntensity: 1.5, depthWrite: false,
      })
    : physMat(null, {
        color: 0xf2f7f2, transmission: 1.0, thickness: 0.008, ior: 1.5,
        roughness: 0.02, metalness: 0, envMapIntensity: 1.35,
        transparent: true, depthWrite: false,
      }, {
        color: 0xf2f7f2, transmission: 1.0, thickness: 0.008, ior: 1.5,
        roughness: 0.02, metalness: 0, transparent: true, depthWrite: false,
      });

  // warm emissive strip inside the picture-light hood (no Light — free glow)
  const mStrip = new THREE.MeshStandardMaterial({
    color: 0x0b0b0c, emissive: 0xffd9a0, emissiveIntensity: 2.1,
    roughness: 0.5, metalness: 0.2,
  });

  // ------------------------------------------------------------- glow decals
  function radialCanvas(size, inner, outer) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(size / 2, size / 2, size * 0.02, size / 2, size / 2, size * 0.5);
    g.addColorStop(0, inner);
    g.addColorStop(0.55, outer);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
    return cv;
  }
  const haloTex = new THREE.CanvasTexture(radialCanvas(256, 'rgba(255,216,150,0.95)', 'rgba(255,190,110,0.25)'));
  haloTex.colorSpace = THREE.SRGBColorSpace;
  const poolTex = new THREE.CanvasTexture(radialCanvas(256, 'rgba(255,226,180,0.95)', 'rgba(255,205,140,0.22)'));
  poolTex.colorSpace = THREE.SRGBColorSpace;

  const mHalo = new THREE.MeshBasicMaterial({
    map: haloTex, transparent: true, opacity: 0.30,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const mPool = new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, opacity: 0.10,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  // ------------------------------------------------------------- geo helpers
  const _euler = new THREE.Euler();
  const _quat = new THREE.Quaternion();
  function mat4(x, y, z, rx, ry, rz, sx, sy, sz) {
    _euler.set(rx || 0, ry || 0, rz || 0);
    _quat.setFromEuler(_euler);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), _quat,
      new THREE.Vector3(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz),
    );
  }
  // clone → non-indexed → transform → collect (merge-safe across geometry types)
  function bake(list, geo, m) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    list.push(g);
  }
  function mergedMesh(list, material, opts) {
    const o = opts || {};
    const geo = mergeGeometries(list, false);
    if (!geo) return null;
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = !!o.cast;
    mesh.receiveShadow = o.receive !== false;
    if (o.order) mesh.renderOrder = o.order;
    return mesh;
  }

  // chamfered rectangular frame ring (extruded, beveled both faces)
  function ringGeo(ow, oh, iw, ih, depth, bevel) {
    const s = new THREE.Shape();
    s.moveTo(-ow / 2, -oh / 2);
    s.lineTo(ow / 2, -oh / 2);
    s.lineTo(ow / 2, oh / 2);
    s.lineTo(-ow / 2, oh / 2);
    s.closePath();
    const h = new THREE.Path();
    h.moveTo(-iw / 2, -ih / 2);
    h.lineTo(-iw / 2, ih / 2);
    h.lineTo(iw / 2, ih / 2);
    h.lineTo(iw / 2, -ih / 2);
    h.closePath();
    s.holes.push(h);
    return new THREE.ExtrudeGeometry(s, {
      depth, steps: 1, bevelEnabled: true,
      bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
    });
  }

  // shared unit geometries
  const geoUnitPlane = new THREE.PlaneGeometry(1, 1);
  const geoScreen = new THREE.PlaneGeometry(SW, SH);
  const geoGlass = new RoundedBoxGeometry(holeW - 0.03, holeH - 0.03, 0.008, 2, 0.0025);
  const geoPaper = new THREE.PlaneGeometry(0.216, 0.136);

  // ------------------------------------------------------------- placeholder
  function makePlaceholderTexture(work, index) {
    const rng = mulberry32(9300 + index * 71);
    const W = 1024, H = 640;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(W / 2, H * 0.46, 60, W / 2, H * 0.5, W * 0.62);
    g.addColorStop(0, '#111318');
    g.addColorStop(1, '#07080a');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // film of noise so the black never reads flat
    for (let i = 0; i < 500; i++) {
      c.fillStyle = `rgba(210,180,120,${(rng() * 0.03).toFixed(3)})`;
      c.fillRect(rng() * W, rng() * H, 1.5, 1.5);
    }
    // gold hairline plate borders
    c.strokeStyle = 'rgba(200,162,74,0.22)';
    c.lineWidth = 2;
    c.strokeRect(26, 26, W - 52, H - 52);
    c.strokeStyle = 'rgba(200,162,74,0.10)';
    c.lineWidth = 1;
    c.strokeRect(36, 36, W - 72, H - 72);
    // monogram
    c.textAlign = 'left';
    c.fillStyle = 'rgba(212,178,98,0.16)';
    c.font = `400 236px ${FONT_SERIF}`;
    const aw = c.measureText('A.').width;
    c.fillText('A.', (W - aw) / 2, H * 0.52);
    // work title, faint
    c.fillStyle = 'rgba(212,178,98,0.30)';
    c.font = `400 34px ${FONT_SERIF}`;
    drawSpacedCentered(c, work.title.toUpperCase(), W / 2, H * 0.735, 6);
    // studio line
    c.fillStyle = 'rgba(212,178,98,0.20)';
    c.font = `600 21px ${FONT_SANS}`;
    drawSpacedCentered(c, 'SKYBOUND SCALING®', W / 2, H * 0.81, 4);
    // plate number
    c.fillStyle = 'rgba(212,178,98,0.35)';
    c.font = `600 20px ${FONT_SANS}`;
    c.fillText(`№ 0${index + 1}`, 44, 66);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ANISO;
    return t;
  }

  // ------------------------------------------------------------- placard
  const paperImg = paperSet && paperSet.map && paperSet.map.image ? paperSet.map.image : null;

  function makePlacardTexture(work, index) {
    const rng = mulberry32(9400 + index * 53);
    const W = 800, H = 504;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    if (paperImg) {
      try { c.drawImage(paperImg, 0, 0, W, H); }
      catch (e) { c.fillStyle = '#ece2cb'; c.fillRect(0, 0, W, H); }
    } else {
      c.fillStyle = '#ece2cb';
      c.fillRect(0, 0, W, H);
    }
    // warm cast + stock tooth
    c.fillStyle = 'rgba(240,226,196,0.18)';
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 650; i++) {
      c.fillStyle = `rgba(96,80,56,${(rng() * 0.05).toFixed(3)})`;
      c.fillRect(rng() * W, rng() * H, 1.3, 1.3);
    }
    // edge vignette
    const vg = c.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(70,55,35,0)');
    vg.addColorStop(1, 'rgba(70,55,35,0.15)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
    // double hairline plate border
    c.strokeStyle = 'rgba(125,98,44,0.40)';
    c.lineWidth = 2;
    c.strokeRect(17, 17, W - 34, H - 34);
    c.strokeStyle = 'rgba(125,98,44,0.18)';
    c.lineWidth = 1;
    c.strokeRect(25, 25, W - 50, H - 50);

    const X = 62;
    // eyebrow
    c.fillStyle = 'rgba(122,96,40,0.9)';
    c.font = `600 20px ${FONT_SANS}`;
    drawSpaced(c, 'AHMAD — WEB DESIGN', X, 76, 5);
    c.fillStyle = 'rgba(122,96,40,0.5)';
    c.fillRect(X, 92, 74, 2);

    // title (serif, shrink-to-fit)
    c.fillStyle = '#2e2718';
    const px = fitSerif(c, work.title, 58, W - X * 2);
    c.font = `400 ${px}px ${FONT_SERIF}`;
    c.fillText(work.title, X, 164);

    // domain
    c.fillStyle = 'rgba(122,96,40,0.95)';
    c.font = `600 22px ${FONT_SANS}`;
    drawSpaced(c, work.domain.toUpperCase(), X, 204, 3);

    // medium
    c.fillStyle = '#6a5d49';
    c.font = `400 22px ${FONT_SANS}`;
    c.fillText(work.medium, X, 242);

    // red sold dot + price line
    c.fillStyle = '#7a2026';
    c.beginPath();
    c.arc(X + 7, 280, 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,235,225,0.35)';
    c.beginPath();
    c.arc(X + 5, 277.5, 2.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#3c3121';
    c.font = `600 23px ${FONT_SANS}`;
    c.fillText(`SOLD — ${work.price}`, X + 26, 288);

    // hairline
    c.fillStyle = 'rgba(90,74,50,0.35)';
    c.fillRect(X, 316, W - X * 2, 1);

    // excerpt, two lines
    c.fillStyle = '#5d5243';
    c.font = `italic 400 22px ${FONT_SANS}`;
    const lines = wrapTwo(c, work.statement, W - X * 2);
    if (lines[0]) c.fillText(lines[0], X, 354);
    if (lines[1]) c.fillText(lines[1], X, 388);

    // footer
    c.fillStyle = 'rgba(112,96,66,0.85)';
    c.font = `600 17px ${FONT_SANS}`;
    drawSpaced(c, `№ 0${index + 1} / SKYBOUND SCALING®`, X, 452, 3);

    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ANISO;
    return t;
  }

  // ------------------------------------------------------------- panel loop
  const loader = new THREE.TextureLoader();
  const screenStates = [];
  const haloGeos = [];
  const poolGeos = [];
  const stripGeos = [];

  WORKS.forEach((work, i) => {
    const slot = ART_SLOTS[i];
    if (!slot) return;
    const rng = mulberry32(9000 + i * 613);
    const eastWall = Math.abs(slot.rotY) > 0.01;

    const pg = new THREE.Group();
    pg.name = `art-${work.id}`;
    pg.position.set(slot.pos[0], slot.pos[1], slot.pos[2]);
    pg.rotation.y = slot.rotY;
    group.add(pg);

    const slotM = mat4(slot.pos[0], slot.pos[1], slot.pos[2], 0, slot.rotY, 0);

    const bronzeGeos = [];
    const brassGeos = [];
    const blackGeos = [];

    // hairline installation imperfection: a whisper of roll per panel
    const tiltZ = (rng() - 0.5) * 0.004;

    // --- bronze shadow-gap frame (front face ~z 0.053, chamfered both ends)
    bake(bronzeGeos, ringGeo(outerW, outerH, holeW, holeH, 0.05, 0.007),
      mat4(0, 0, -0.004, 0, 0, tiltZ));
    // recessed brass lip just inside the bronze — the two-tone sliver
    bake(brassGeos, ringGeo(holeW + 0.036, holeH + 0.036, holeW - 0.006, holeH - 0.006, 0.028, 0.003),
      mat4(0, 0, -0.002, 0, 0, tiltZ));

    // --- matte-black chassis + oversize back plate closing the shadow gap
    bake(blackGeos, new RoundedBoxGeometry(bodyW, bodyH, 0.06, 3, 0.007), mat4(0, 0, 0, 0, 0, tiltZ));
    bake(blackGeos, new RoundedBoxGeometry(bodyW + 0.12, bodyH + 0.12, 0.016, 2, 0.004),
      mat4(0, 0, -0.024, 0, 0, tiltZ));

    // --- the OLED itself: emissiveMap carries the work
    const placeholder = makePlaceholderTexture(work, i);
    const mScreen = new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xffffff, emissiveIntensity: 0.85,
      emissiveMap: placeholder, roughness: 0.92, metalness: 0,
    });
    const screen = new THREE.Mesh(geoScreen, mScreen);
    screen.position.z = 0.031;
    screen.rotation.z = tiltZ;
    screen.receiveShadow = true;
    pg.add(screen);

    const st = { mat: mScreen, state: 'placeholder', k: 0, next: null, i };
    screenStates.push(st);
    loader.load(work.img, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = ANISO;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      // cover-fit: center-crop whatever aspect arrives onto the 16:10 glass
      const iw = t.image && t.image.width ? t.image.width : 1;
      const ih = t.image && t.image.height ? t.image.height : 1;
      const ia = iw / ih;
      const pa = SW / SH;
      if (ia > pa) {
        t.repeat.set(pa / ia, 1);
        t.offset.set((1 - pa / ia) / 2, 0);
      } else {
        t.repeat.set(1, ia / pa);
        t.offset.set(0, (1 - ia / pa) / 2);
      }
      st.next = t;
      st.state = 'out';
    }, undefined, () => { /* image missing → placeholder stays, gracefully */ });

    // --- protective glass, recessed inside the frame lip
    const glass = new THREE.Mesh(geoGlass, mGlass);
    glass.position.z = 0.044;
    glass.rotation.z = tiltZ;
    glass.renderOrder = 3;
    pg.add(glass);

    // --- picture light: wall rosettes → curved bronze arms → cylindrical hood
    const armX = 0.52;
    for (const sx of [-1, 1]) {
      const ax = armX * sx + (rng() - 0.5) * 0.01;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(ax, hoodY + 0.17, WALL_Z + 0.008),
        new THREE.Vector3(ax, hoodY + 0.20, hoodZ * 0.55),
        new THREE.Vector3(ax, hoodY + 0.028, hoodZ - 0.005),
      );
      bake(bronzeGeos, new THREE.TubeGeometry(curve, 20, 0.011, 10, false), null);
      bake(bronzeGeos, new THREE.CylinderGeometry(0.03, 0.038, 0.02, 16),
        mat4(ax, hoodY + 0.17, WALL_Z + 0.01, Math.PI / 2, 0, 0));
    }
    bake(bronzeGeos, new THREE.CylinderGeometry(0.048, 0.048, hoodLen, 24),
      mat4(0, hoodY, hoodZ, 0, 0, Math.PI / 2));
    // finial caps on the hood ends
    for (const sx of [-1, 1]) {
      bake(bronzeGeos, new THREE.CylinderGeometry(0.02, 0.036, 0.03, 16),
        mat4(sx * (hoodLen / 2 + 0.014), hoodY, hoodZ, 0, 0, sx * Math.PI / 2));
    }
    // warm emissive slit under the hood (merged at root, shared material)
    bake(stripGeos, geoUnitPlane,
      slotM.clone().multiply(mat4(0, hoodY - 0.05, hoodZ, -Math.PI / 2, 0, 0, hoodLen * 0.92, 0.07, 1)));

    // --- the SpotLight: this panel's single allocated light
    const spot = new THREE.SpotLight(0xffe2b8, 20, 6.5, 0.62, 0.85, 2);
    spot.castShadow = false;
    spot.position.set(0, hoodY - 0.04, hoodZ + 0.02);
    const tgt = new THREE.Object3D();
    tgt.position.set(0, -0.4, WALL_Z + 0.002);   // 0.4m below panel center, on the wall
    pg.add(tgt);
    spot.target = tgt;
    pg.add(spot);

    // --- warm halo wash behind the panel (merged at root)
    bake(haloGeos, geoUnitPlane,
      slotM.clone().multiply(mat4(0, 0, WALL_Z + 0.003, 0, 0, 0, outerW + 0.75, outerH + 0.65, 1)));

    // --- floor light-pool decal (east wall pools pushed past the consoles)
    const poolZ = eastWall ? 1.22 : 0.95;
    const poolW = (eastWall ? 2.0 : 2.5) * (0.95 + rng() * 0.1);
    const poolD = (eastWall ? 1.45 : 1.7) * (0.95 + rng() * 0.1);
    bake(poolGeos, geoUnitPlane,
      slotM.clone().multiply(mat4(0, -slot.pos[1] + 0.006, poolZ, -Math.PI / 2, 0, 0, poolW, poolD, 1)));

    // --- placard: brass-framed card right of the panel, centered at y 1.55
    const plX = outerW / 2 + 0.30;
    const plY = 1.55 - slot.pos[1];
    const plTilt = (rng() - 0.5) * 0.012;
    bake(blackGeos, new RoundedBoxGeometry(0.244, 0.164, 0.006, 2, 0.002),
      mat4(plX, plY, -0.017, 0, 0, plTilt));
    bake(brassGeos, ringGeo(0.24, 0.16, 0.218, 0.138, 0.010, 0.002),
      mat4(plX, plY, -0.014, 0, 0, plTilt));
    const placardTex = makePlacardTexture(work, i);
    const mPlacard = new THREE.MeshStandardMaterial({
      map: placardTex, emissive: 0xffffff, emissiveMap: placardTex,
      emissiveIntensity: 0.15, roughness: 0.85, metalness: 0,
    });
    const placard = new THREE.Mesh(geoPaper, mPlacard);
    placard.position.set(plX, plY, -0.009);
    placard.rotation.z = plTilt;
    placard.receiveShadow = true;
    pg.add(placard);

    // --- merge & mount this panel's static metalwork
    const bronzeMesh = mergedMesh(bronzeGeos, mBronze, { receive: true });
    if (bronzeMesh) pg.add(bronzeMesh);
    const brassMesh = mergedMesh(brassGeos, mBrass, { receive: true });
    if (brassMesh) pg.add(brassMesh);
    const blackMesh = mergedMesh(blackGeos, mBlack, { receive: true });
    if (blackMesh) pg.add(blackMesh);

    // --- interaction: the whole installation is the hit target
    ctx.interactables.push({
      object: pg,
      label: `View — ${work.title}`,
      onActivate: () => {
        ctx.events.dispatchEvent(new CustomEvent('activate-art', { detail: work }));
      },
    });
  });

  // root-level merged decals / glow
  const haloMesh = mergedMesh(haloGeos, mHalo, { receive: false, order: 1 });
  if (haloMesh) group.add(haloMesh);
  const poolMesh = mergedMesh(poolGeos, mPool, { receive: false, order: 1 });
  if (poolMesh) group.add(poolMesh);
  const stripMesh = mergedMesh(stripGeos, mStrip, { receive: false });
  if (stripMesh) group.add(stripMesh);

  // ------------------------------------------------------------- bench
  // walnut + oxblood leather museum bench facing the north trio
  (function buildBench() {
    const rngB = mulberry32(9700);
    const bench = new THREE.Group();
    bench.name = 'gallery-bench';
    bench.position.set(0, 0, -2.9);
    bench.rotation.y = (rngB() - 0.5) * 0.02;   // nudged, not machine-placed
    group.add(bench);

    // walnut maps drawn here (factory has no plain-walnut generator)
    const wCan = document.createElement('canvas');
    wCan.width = wCan.height = 512;
    {
      const c = wCan.getContext('2d');
      const g = c.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, '#5e402a');
      g.addColorStop(0.5, '#57391f');
      g.addColorStop(1, '#5c3d26');
      c.fillStyle = g;
      c.fillRect(0, 0, 512, 512);
      // long grain streaks
      for (let i = 0; i < 150; i++) {
        const y = rngB() * 512;
        const light = rngB() > 0.5;
        c.strokeStyle = light
          ? `rgba(140,100,60,${(0.04 + rngB() * 0.10).toFixed(3)})`
          : `rgba(38,22,12,${(0.05 + rngB() * 0.12).toFixed(3)})`;
        c.lineWidth = 0.6 + rngB() * 2.2;
        c.beginPath();
        c.moveTo(-8, y);
        for (let x = 0; x <= 512; x += 64) {
          c.lineTo(x, y + Math.sin(x * 0.011 + i) * (1.5 + rngB() * 3));
        }
        c.stroke();
      }
      // cathedral figure arcs
      for (let i = 0; i < 7; i++) {
        const cxp = rngB() * 512, cyp = rngB() * 512;
        c.strokeStyle = `rgba(30,18,10,${(0.05 + rngB() * 0.06).toFixed(3)})`;
        c.lineWidth = 1.5;
        for (let r = 14; r < 90; r += 11 + rngB() * 8) {
          c.beginPath();
          c.ellipse(cxp, cyp, r * 2.1, r * 0.5, 0, Math.PI * 1.1, Math.PI * 1.9);
          c.stroke();
        }
      }
      // pores
      for (let i = 0; i < 1400; i++) {
        c.fillStyle = `rgba(25,15,8,${(rngB() * 0.08).toFixed(3)})`;
        c.fillRect(rngB() * 512, rngB() * 512, 1 + rngB() * 3, 0.8);
      }
    }
    const walnutTex = new THREE.CanvasTexture(wCan);
    walnutTex.colorSpace = THREE.SRGBColorSpace;
    walnutTex.wrapS = walnutTex.wrapT = THREE.RepeatWrapping;
    walnutTex.anisotropy = ANISO;
    let walnutNrm = null;
    try {
      if (T && typeof T.normalFromHeight === 'function') walnutNrm = T.normalFromHeight(wCan, 0.35);
    } catch (e) { walnutNrm = null; }

    const mWalnut = new THREE.MeshStandardMaterial({
      map: walnutTex, roughness: 0.38, metalness: 0, envMapIntensity: 0.9,
    });
    if (walnutNrm) {
      mWalnut.normalMap = walnutNrm;
      mWalnut.normalScale = new THREE.Vector2(0.5, 0.5);
    }
    const mLeather = stdMat(leatherSet, { envMapIntensity: 0.8 },
      { color: 0x6d1f24, roughness: 0.5, metalness: 0 });
    const mWelt = stdMat(leatherSet, { color: 0x8a8a8a, envMapIntensity: 0.7 },
      { color: 0x471317, roughness: 0.55, metalness: 0 });

    const woodGeos = [];
    const brassG = [];
    // trestle ends on brass sled glides
    for (const sx of [-1, 1]) {
      bake(woodGeos, new RoundedBoxGeometry(0.09, 0.40, 0.40, 3, 0.012), mat4(sx * 0.66, 0.214, 0));
      bake(brassG, new RoundedBoxGeometry(0.10, 0.014, 0.36, 2, 0.005), mat4(sx * 0.66, 0.007, 0));
    }
    // stretcher + apron rail
    bake(woodGeos, new RoundedBoxGeometry(1.30, 0.06, 0.05, 2, 0.01), mat4(0, 0.15, 0));
    bake(woodGeos, new RoundedBoxGeometry(1.66, 0.06, 0.45, 3, 0.012), mat4(0, 0.444, 0));

    const woodMesh = mergedMesh(woodGeos, mWalnut, { cast: true, receive: true });
    if (woodMesh) bench.add(woodMesh);
    const glideMesh = mergedMesh(brassG, mBrass, { receive: true });
    if (glideMesh) bench.add(glideMesh);

    // cushion with sat-in compression + hand noise
    const cushGeo = new RoundedBoxGeometry(1.60, 0.10, 0.42, 4, 0.03);
    {
      const pos = cushGeo.attributes.position;
      const v = new THREE.Vector3();
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k);
        if (v.y > 0.028) {
          const fx = Math.max(0, 1 - Math.abs(v.x) / 0.82);
          const fz = Math.max(0, 1 - Math.abs(v.z) / 0.23);
          const dip = 0.013 * Math.sin(Math.min(1, fx * 1.5) * Math.PI * 0.5) * fz;
          pos.setY(k, v.y - dip + (rngB() - 0.5) * 0.0014);
        }
      }
      cushGeo.computeVertexNormals();
    }
    const cushion = new THREE.Mesh(cushGeo, mLeather);
    cushion.position.y = 0.524;
    cushion.castShadow = true;
    cushion.receiveShadow = true;
    bench.add(cushion);

    // welt cord seam hugging the cushion's upper edge
    const ws = new THREE.Shape();
    const ww = 1.585, wd = 0.405, wr = 0.05;
    ws.moveTo(-ww / 2 + wr, -wd / 2);
    ws.lineTo(ww / 2 - wr, -wd / 2);
    ws.quadraticCurveTo(ww / 2, -wd / 2, ww / 2, -wd / 2 + wr);
    ws.lineTo(ww / 2, wd / 2 - wr);
    ws.quadraticCurveTo(ww / 2, wd / 2, ww / 2 - wr, wd / 2);
    ws.lineTo(-ww / 2 + wr, wd / 2);
    ws.quadraticCurveTo(-ww / 2, wd / 2, -ww / 2, wd / 2 - wr);
    ws.lineTo(-ww / 2, -wd / 2 + wr);
    ws.quadraticCurveTo(-ww / 2, -wd / 2, -ww / 2 + wr, -wd / 2);
    const wpts = ws.getPoints(56).map((p) => new THREE.Vector3(p.x, 0.552, p.y));
    const weltCurve = new THREE.CatmullRomCurve3(wpts, true, 'catmullrom', 0.05);
    const welt = new THREE.Mesh(new THREE.TubeGeometry(weltCurve, 140, 0.008, 8, true), mWelt);
    welt.receiveShadow = true;
    bench.add(welt);

    // bench collider
    ctx.colliders.push({
      min: { x: -0.88, y: 0, z: -3.9 + 0.74 },
      max: { x: 0.88, y: 0.62, z: -2.9 + 0.26 },
    });
  })();

  // ------------------------------------------------------------- update
  // screen life-cycle: placeholder breath → dip → crossfade to the live work.
  // breathing freq π*0.4 rad/s = 180 exact periods per TIME_WRAP → wrap-safe.
  ctx.updates.push((dt, tw) => {
    for (let i = 0; i < screenStates.length; i++) {
      const s = screenStates[i];
      if (s.state === 'placeholder') {
        s.mat.emissiveIntensity =
          0.78 + 0.14 * (0.5 + 0.5 * Math.sin(tw * Math.PI * 0.4 + s.i * 1.9));
      } else if (s.state === 'out') {
        s.k += dt * 4.5;
        s.mat.emissiveIntensity = Math.max(0.12, 0.8 * (1 - s.k));
        if (s.k >= 1) {
          s.mat.emissiveMap = s.next;
          s.mat.needsUpdate = true;
          s.state = 'in';
          s.k = 0;
        }
      } else if (s.state === 'in') {
        s.k = Math.min(1, s.k + dt * 1.6);
        const e = 1 - Math.pow(1 - s.k, 3);
        s.mat.emissiveIntensity = 0.12 + (1.35 - 0.12) * e;
        if (s.k >= 1) s.state = 'live';
      }
    }
  });

  // keep a couple of root rng draws so the stream stays versioned/stable if
  // future edits append randomized dressing without reordering panel seeds
  rngRoot(); rngRoot();

  return { group };
}
