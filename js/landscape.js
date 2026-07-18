// landscape.js — near terrain w/ splatted lawn/gravel/mud, instanced wind-blown
// grass, pine + birch forest, boulders, snow-capped ridge mountains and far-shore
// silhouette forest. Seed 3000. Zero lights, zero colliders (per spec).
// export: createLandscape(ctx) → { group }

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  mulberry32, groundHeight,
  PATH, LAWN, WATER_Y, SUN_DIR, FOG,
} from './config.js';

// ---------------------------------------------------------------- tiny helpers

function sstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

// Deterministic 2D value-noise FBM. Lattice hash constants are derived from a
// mulberry32 stream so every random field in this module traces back to seed 3000.
function makeFbm(seedFloat) {
  const S = (Math.floor(seedFloat * 0xffffffff)) | 0;
  const h = (ix, iz) => {
    let a = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + S) | 0;
    a = Math.imul(a ^ (a >>> 13), 1274126177);
    return ((a ^ (a >>> 16)) >>> 0) / 4294967296;
  };
  const n2 = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = h(ix, iz), b = h(ix + 1, iz), c = h(ix, iz + 1), d = h(ix + 1, iz + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  };
  return (x, z, oct = 4) => {
    let v = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { v += amp * n2(x * f, z * f); amp *= 0.5; f *= 2.03; }
    return v / (1 - Math.pow(0.5, oct));
  };
}

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function canvasTex(THR, canvas, { srgb = false, repeat = null, aniso = 4 } = {}) {
  const t = new THR.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THR.SRGBColorSpace;
  t.wrapS = t.wrapT = THR.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Sobel-ish normal map from a height canvas (red channel).
function normalTexFromHeight(THR, canvas, strength, aniso) {
  const w = canvas.width, h = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  const g = (x, y) => src[((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (g(x + 1, y) - g(x - 1, y)) * strength;
      const dy = (g(x, y + 1) - g(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return canvasTex(THR, out, { aniso });
}

// ---------------------------------------------------------------- canvas paint

// Tiling lawn tile: albedo + height drawn in one pass (multi-hue strokes).
function paintGrassTile(rng, size) {
  const alb = document.createElement('canvas');
  const hgt = document.createElement('canvas');
  alb.width = alb.height = hgt.width = hgt.height = size;
  const a = alb.getContext('2d');
  const hc = hgt.getContext('2d');
  a.fillStyle = '#55642f'; a.fillRect(0, 0, size, size);
  hc.fillStyle = '#404040'; hc.fillRect(0, 0, size, size);
  // soil shadow specks
  for (let i = 0; i < 900; i++) {
    const x = rng() * size, y = rng() * size, r = 0.6 + rng() * 1.6;
    a.fillStyle = `rgba(30,32,14,${0.10 + rng() * 0.16})`;
    a.beginPath(); a.arc(x, y, r, 0, 6.284); a.fill();
    hc.fillStyle = 'rgba(0,0,0,0.25)';
    hc.beginPath(); hc.arc(x, y, r, 0, 6.284); hc.fill();
  }
  // blade strokes — greens drifting into gold
  for (let i = 0; i < 2800; i++) {
    const x = rng() * size, y = rng() * size;
    const len = 3 + rng() * 8;
    const ang = -Math.PI / 2 + (rng() - 0.5) * 0.9;
    const golden = rng() < 0.22;
    const hue = golden ? 46 + rng() * 12 : 68 + rng() * 34;
    const sat = golden ? 34 + rng() * 22 : 28 + rng() * 26;
    const lit = 22 + rng() * 26;
    a.strokeStyle = `hsla(${hue},${sat}%,${lit}%,0.55)`;
    a.lineWidth = 0.7 + rng() * 1.2;
    a.beginPath(); a.moveTo(x, y);
    a.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); a.stroke();
    const hv = Math.floor(90 + rng() * 130);
    hc.strokeStyle = `rgba(${hv},${hv},${hv},0.5)`;
    hc.lineWidth = a.lineWidth;
    hc.beginPath(); hc.moveTo(x, y);
    hc.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); hc.stroke();
  }
  // clover-dark blobs
  for (let i = 0; i < 26; i++) {
    const x = rng() * size, y = rng() * size, r = 4 + rng() * 14;
    a.fillStyle = `rgba(36,52,20,${0.10 + rng() * 0.12})`;
    a.beginPath(); a.arc(x, y, r, 0, 6.284); a.fill();
  }
  // roughness canvas (grass is matte with slight variance)
  const rough = makeCanvas(size >> 1, size >> 1, (r2, w, h) => {
    r2.fillStyle = '#d4d4d4'; r2.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      const v = 190 + Math.floor(rng() * 55);
      r2.fillStyle = `rgba(${v},${v},${v},0.4)`;
      r2.beginPath(); r2.arc(rng() * w, rng() * h, 1 + rng() * 5, 0, 6.284); r2.fill();
    }
  });
  return { alb, hgt, rough };
}

// Macro variation field sampled 0..1 across the whole terrain (r hue drift,
// g dry patches, b mud variance) — breaks tiling at distance.
function paintMacro(fb, size) {
  return makeCanvas(size, size, (c, w, h) => {
    const img = c.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h;
        const i = (y * w + x) * 4;
        d[i] = Math.floor(255 * fb(u * 9 + 3.1, v * 7 + 1.7, 4));
        d[i + 1] = Math.floor(255 * fb(u * 5 + 11.4, v * 4 + 8.2, 4));
        d[i + 2] = Math.floor(255 * fb(u * 13 + 21.0, v * 11 + 17.5, 3));
        d[i + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
  });
}

// Grass-blade clump card (tips at canvas top → uv v=1 = geometry top).
function paintBladeCard(rng, size) {
  return makeCanvas(size, size, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const blades = 11;
    for (let b = 0; b < blades; b++) {
      const x0 = w * (0.10 + 0.80 * (b + rng() * 0.8) / blades);
      const tipX = x0 + (rng() - 0.5) * w * 0.34;
      const tipY = h * (0.02 + rng() * 0.22);
      const cx = x0 + (rng() - 0.5) * w * 0.26;
      const baseW = w * (0.022 + rng() * 0.028);
      const golden = rng() < 0.3;
      const grad = c.createLinearGradient(0, h, 0, tipY);
      grad.addColorStop(0, '#41521c');
      grad.addColorStop(0.55, golden ? '#8f8534' : '#69822c');
      grad.addColorStop(1, golden ? '#cfb45c' : '#9cab48');
      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(x0 - baseW, h);
      c.quadraticCurveTo(cx - baseW * 0.5, h * 0.5, tipX, tipY);
      c.quadraticCurveTo(cx + baseW * 0.5, h * 0.55, x0 + baseW, h);
      c.closePath();
      c.fill();
    }
  });
}

// Pine bark: albedo + height.
function paintBark(rng, w, h) {
  const alb = document.createElement('canvas'); alb.width = w; alb.height = h;
  const hgt = document.createElement('canvas'); hgt.width = w; hgt.height = h;
  const a = alb.getContext('2d'), hc = hgt.getContext('2d');
  a.fillStyle = '#43301f'; a.fillRect(0, 0, w, h);
  hc.fillStyle = '#3c3c3c'; hc.fillRect(0, 0, w, h);
  // vertical plated ridges
  for (let i = 0; i < 150; i++) {
    const x = rng() * w;
    const lw = 2 + rng() * 7;
    const tone = rng();
    a.strokeStyle = tone < 0.6 ? `rgba(112,84,56,${0.28 + rng() * 0.3})`
                               : `rgba(142,110,74,${0.2 + rng() * 0.25})`;
    hc.strokeStyle = `rgba(220,220,220,${0.25 + rng() * 0.3})`;
    a.lineWidth = hc.lineWidth = lw;
    a.beginPath(); hc.beginPath();
    let px = x;
    a.moveTo(px, -8); hc.moveTo(px, -8);
    for (let y = 0; y <= h + 8; y += 22) {
      px += (rng() - 0.5) * 9;
      a.lineTo(px, y); hc.lineTo(px, y);
    }
    a.stroke(); hc.stroke();
  }
  // dark fissures
  for (let i = 0; i < 110; i++) {
    const x = rng() * w;
    a.strokeStyle = `rgba(22,14,8,${0.4 + rng() * 0.4})`;
    hc.strokeStyle = `rgba(10,10,10,${0.5 + rng() * 0.4})`;
    a.lineWidth = hc.lineWidth = 0.8 + rng() * 2.2;
    a.beginPath(); hc.beginPath();
    let px = x;
    const y0 = rng() * h;
    const y1 = y0 + 30 + rng() * 120;
    a.moveTo(px, y0); hc.moveTo(px, y0);
    for (let y = y0; y <= y1; y += 14) {
      px += (rng() - 0.5) * 7;
      a.lineTo(px, y); hc.lineTo(px, y);
    }
    a.stroke(); hc.stroke();
  }
  return { alb, hgt };
}

// Pine foliage sheet: needle streaks + punched holes for a broken silhouette.
function paintFoliage(rng, size) {
  return makeCanvas(size, size, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    // needle mat
    for (let i = 0; i < 1100; i++) {
      const x = rng() * w, y = rng() * h;
      const len = 7 + rng() * 15;
      const ang = Math.PI / 2 + (rng() - 0.5) * 1.15;
      const t = rng();
      const col = t < 0.55 ? `rgba(38,58,32,0.9)` :
                  t < 0.85 ? `rgba(58,84,44,0.85)` : `rgba(96,112,58,0.8)`;
      c.strokeStyle = col;
      c.lineWidth = 1 + rng() * 2.0;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      c.stroke();
    }
    // sun-bleached sprigs
    for (let i = 0; i < 140; i++) {
      const x = rng() * w, y = rng() * h;
      c.strokeStyle = `rgba(148,150,84,${0.25 + rng() * 0.3})`;
      c.lineWidth = 1 + rng();
      c.beginPath(); c.moveTo(x, y);
      c.lineTo(x + (rng() - 0.5) * 10, y + 6 + rng() * 10);
      c.stroke();
    }
    // punch irregular holes
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 70; i++) {
      const x = rng() * w, y = rng() * h, r = 4 + rng() * 15;
      c.beginPath(); c.arc(x, y, r, 0, 6.284); c.fill();
    }
    // ragged top & bottom edge of the sheet
    for (let i = 0; i < 46; i++) {
      const x = rng() * w, r = 6 + rng() * 16;
      c.beginPath(); c.arc(x, (rng() < 0.5 ? 0 : h) + (rng() - 0.5) * 8, r, 0, 6.284); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  });
}

// Birch bark: chalk white w/ lenticel dashes & scars.
function paintBirchBark(rng, w, h) {
  return makeCanvas(w, h, (c) => {
    c.fillStyle = '#e3ded1'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(150,148,138,${0.10 + rng() * 0.14})`;
      c.beginPath();
      c.ellipse(rng() * w, rng() * h, 4 + rng() * 16, 3 + rng() * 8, rng() * 3.14, 0, 6.284);
      c.fill();
    }
    for (let i = 0; i < 24; i++) {  // warm-tan banding
      c.fillStyle = `rgba(196,178,150,${0.08 + rng() * 0.1})`;
      c.fillRect(0, rng() * h, w, 3 + rng() * 12);
    }
    for (let i = 0; i < 110; i++) { // lenticels
      const x = rng() * w, y = rng() * h;
      c.fillStyle = `rgba(38,32,26,${0.5 + rng() * 0.4})`;
      c.beginPath();
      c.ellipse(x, y, 3 + rng() * 11, 0.8 + rng() * 1.4, (rng() - 0.5) * 0.2, 0, 6.284);
      c.fill();
    }
    for (let i = 0; i < 7; i++) {   // branch scars
      const x = rng() * w, y = rng() * h;
      c.fillStyle = 'rgba(30,24,20,0.75)';
      c.beginPath();
      c.moveTo(x - 8 - rng() * 8, y);
      c.quadraticCurveTo(x, y - 9 - rng() * 8, x + 8 + rng() * 8, y);
      c.quadraticCurveTo(x, y + 5 + rng() * 5, x - 8 - rng() * 8, y);
      c.fill();
    }
  });
}

// Golden birch leaf-cluster card.
function paintLeafCluster(rng, size) {
  return makeCanvas(size, size, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < 260; i++) {
      // gaussian-ish concentration toward center
      const a1 = rng() * Math.PI * 2;
      const rr = (rng() + rng()) * 0.5 * w * 0.46;
      const x = cx + Math.cos(a1) * rr;
      const y = cy + Math.sin(a1) * rr * 0.8;
      const t = rng();
      const col = t < 0.35 ? '#c9a13c' : t < 0.6 ? '#b98b2e' : t < 0.85 ? '#d8b45a' : '#8f6e2a';
      c.fillStyle = col;
      c.globalAlpha = 0.85;
      c.save();
      c.translate(x, y);
      c.rotate(rng() * 3.14);
      c.beginPath();
      c.ellipse(0, 0, 3 + rng() * 6, 2 + rng() * 4, 0, 0, 6.284);
      c.fill();
      c.restore();
    }
    c.globalAlpha = 1;
  });
}

// Distant pine silhouette (flat card).
function paintFarPine(rng, w, h) {
  return makeCanvas(w, h, (c) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#20302a';
    // trunk
    c.fillRect(w / 2 - 3, h - 40, 6, 40);
    // 5 ragged tiers
    for (let t = 0; t < 5; t++) {
      const yTop = h * (0.02 + t * 0.17);
      const yBot = h * (0.24 + t * 0.17);
      const half = w * (0.12 + t * 0.085);
      c.beginPath();
      c.moveTo(w / 2, yTop);
      const steps = 7;
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        c.lineTo(w / 2 + half * f + (rng() - 0.5) * 7, yTop + (yBot - yTop) * f + (rng() - 0.5) * 5);
      }
      for (let i = steps; i >= 1; i--) {
        const f = i / steps;
        c.lineTo(w / 2 - half * f + (rng() - 0.5) * 7, yTop + (yBot - yTop) * f + (rng() - 0.5) * 5);
      }
      c.closePath();
      c.fill();
    }
  });
}

// Fallback pebble maps if ctx.tex.gravel is unavailable.
function paintGravelFallback(THR, rng, aniso) {
  const size = 256;
  const alb = document.createElement('canvas'); alb.width = alb.height = size;
  const hgt = document.createElement('canvas'); hgt.width = hgt.height = size;
  const a = alb.getContext('2d'), hc = hgt.getContext('2d');
  a.fillStyle = '#6e6355'; a.fillRect(0, 0, size, size);
  hc.fillStyle = '#202020'; hc.fillRect(0, 0, size, size);
  for (let i = 0; i < 450; i++) {
    const x = rng() * size, y = rng() * size;
    const rx = 2.5 + rng() * 5, ry = rx * (0.6 + rng() * 0.5), rot = rng() * 3.14;
    const v = 96 + Math.floor(rng() * 110);
    const warm = rng() * 24;
    a.fillStyle = `rgb(${v + warm},${v + warm * 0.6},${v})`;
    a.beginPath(); a.ellipse(x, y, rx, ry, rot, 0, 6.284); a.fill();
    const hv = 80 + Math.floor(rng() * 150);
    hc.fillStyle = `rgb(${hv},${hv},${hv})`;
    hc.beginPath(); hc.ellipse(x, y, rx, ry, rot, 0, 6.284); hc.fill();
  }
  const rough = makeCanvas(64, 64, (c, w, h) => { c.fillStyle = '#d9d9d9'; c.fillRect(0, 0, w, h); });
  return {
    map: canvasTex(THR, alb, { srgb: true, aniso }),
    normalMap: normalTexFromHeight(THR, hgt, 2.2, aniso),
    roughnessMap: canvasTex(THR, rough, { aniso }),
  };
}

// ---------------------------------------------------------------- geo builders

// One good pine → { trunkGeo, foliageGeo }. detail = {radial,hseg,layers,coneR,coneH}
function buildPineGeo(rng, fb, d) {
  const H = 7.4;
  // trunk: tapered, bark-noise displaced, root flare, vertex-color cavity shading
  const trunk = new THREE.CylinderGeometry(0.085, 0.30, H, d.radial, d.hseg);
  trunk.translate(0, H / 2, 0);
  {
    const pos = trunk.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const rr = Math.hypot(x, z);
      let shade = 0.8;
      if (rr > 1e-5) {
        const ang = Math.atan2(z, x);
        const bn = fb(Math.cos(ang) * 2.1 + 5, y * 0.9 + Math.sin(ang) * 2.1, 3) - 0.5;
        const flare = 1 + 0.7 * Math.pow(Math.max(0, 1 - y / 1.1), 2);
        const k = flare * (1 + bn * 0.4);
        pos.setX(i, x * k + y * y * 0.004);
        pos.setZ(i, z * k);
        shade = clamp(0.6 + bn * 1.3, 0.32, 1.0);
      }
      col[i * 3] = shade; col[i * 3 + 1] = shade; col[i * 3 + 2] = shade;
    }
    trunk.setAttribute('color', new THREE.BufferAttribute(col, 3));
    trunk.computeVertexNormals();
  }
  // foliage: stacked jittered open cones + closed top spike
  const parts = [];
  for (let i = 0; i < d.layers; i++) {
    const t = i / (d.layers - 1);
    const y0 = 1.55 + t * (H - 1.3);
    const rad = (1 - t) * 2.35 + 0.5;
    const ch = 2.0 - t * 0.55;
    const cone = new THREE.ConeGeometry(rad, ch, d.coneR, d.coneH, true);
    cone.translate((rng() - 0.5) * 0.28, y0, (rng() - 0.5) * 0.28);
    cone.rotateY(rng() * Math.PI * 2);
    parts.push(cone);
  }
  const spike = new THREE.ConeGeometry(0.42, 1.5, d.coneR, 1, false);
  spike.translate(0, H + 0.55, 0);
  parts.push(spike);
  const foliage = mergeGeometries(parts, false);
  {
    const pos = foliage.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = fb(x * 1.35 + 9.2, y * 1.1 + z * 1.35, 3) - 0.5;
      const n2 = fb(z * 1.6 + 3.3, x * 1.6 + y, 2) - 0.5;
      const rr = Math.hypot(x, z);
      if (rr > 1e-5) {
        const k = 1 + n * 0.34;
        pos.setX(i, x * k);
        pos.setZ(i, z * k);
      }
      pos.setY(i, y + n2 * 0.32 - rr * 0.10); // slight branch droop
    }
    foliage.computeVertexNormals();
  }
  return { trunkGeo: trunk, foliageGeo: foliage };
}

// FBM boulder w/ lichen-tinted top (vertex colors).
function buildRockGeo(rng, fb) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const n = fb(v.x * 1.9 + 7.7, (v.y + v.z) * 1.9 + 2.2, 4);
    const r = 1 + (n - 0.5) * 0.85;
    pos.setXYZ(i, v.x * r * 1.28, v.y * r * 0.74, v.z * r * 1.02);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0x6a6157);
  const dark = new THREE.Color(0x4a423a);
  const lichen = new THREE.Color(0x8e9257);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ny = nrm.getY(i);
    const m = fb(pos.getX(i) * 2.4 + 1.1, pos.getZ(i) * 2.4 + 5.5, 3);
    c.copy(base).lerp(dark, m * 0.8);
    const lw = sstep(0.45, 0.85, ny) * sstep(0.4, 0.75, fb(pos.getX(i) * 3.1, pos.getZ(i) * 3.1 + 9, 3));
    c.lerp(lichen, lw * 0.65);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// Slender bent birch trunk.
function buildBirchGeo() {
  const H = 5.4;
  const geo = new THREE.CylinderGeometry(0.055, 0.15, H, 8, 8);
  geo.translate(0, H / 2, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + Math.sin((y / H) * 1.35) * 0.26);
  }
  geo.computeVertexNormals();
  return geo;
}

// Crossed-quad grass tuft (2 planes, baked bend, tips at v=1).
function buildTuftGeo() {
  const mk = (rotY) => {
    const p = new THREE.PlaneGeometry(0.5, 0.62, 1, 2);
    p.translate(0, 0.31, 0);
    const pos = p.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / 0.62;
      pos.setZ(i, pos.getZ(i) + t * t * 0.09); // lean
    }
    p.rotateY(rotY);
    return p;
  };
  const g = mergeGeometries([mk(0.35), mk(0.35 + Math.PI / 2)], false);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- GLSL blocks

const GRAVEL_REP = 'vec2( 152.0, 120.0 )';

const TERRAIN_VERT = `
  vec3 transformed = vec3( position );
  vSplat = aSplat;
  vTerrUv = uv;
  vWPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
`;

const TERRAIN_MAP_FRAG = `
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  vec3 macroS = texture2D( macroMap, vTerrUv ).rgb;
  sampledDiffuseColor.rgb *= mix( vec3( 0.84, 0.92, 0.70 ), vec3( 1.12, 1.05, 0.86 ), macroS.r );
  float dryW = smoothstep( 0.58, 0.86, macroS.g );
  sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, vec3( 0.47, 0.40, 0.235 ), dryW * 0.5 );
  float lawnM = ( 1.0 - smoothstep( 10.8, 11.8, abs( vWPos.x ) ) )
              * smoothstep( 15.0, 16.2, vWPos.z )
              * ( 1.0 - smoothstep( 31.0, 33.0, vWPos.z ) );
  float stripeM = smoothstep( 0.32, 0.5, abs( fract( vWPos.x * 0.3125 ) - 0.5 ) );
  sampledDiffuseColor.rgb *= 1.0 - lawnM * stripeM * 0.06;
  vec3 grav = texture2D( gravelMap, vTerrUv * ${GRAVEL_REP} ).rgb;
  sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, grav, vSplat.r );
  vec3 mudC = vec3( 0.205, 0.155, 0.105 ) * ( 0.75 + 0.5 * macroS.b );
  sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, mudC, vSplat.g );
  sampledDiffuseColor.rgb *= 1.0 - vSplat.b * 0.42;
  diffuseColor *= sampledDiffuseColor;
`;

const TERRAIN_ROUGH_FRAG = `
  float roughnessFactor = roughness;
  #ifdef USE_ROUGHNESSMAP
    vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
    float gRough = texture2D( gravelRoughMap, vTerrUv * ${GRAVEL_REP} ).g;
    float rMix = mix( texelRoughness.g, gRough, vSplat.r );
    rMix = mix( rMix, 0.9, vSplat.g * 0.7 );
    rMix = mix( rMix, 0.34, vSplat.b );
    roughnessFactor *= rMix;
  #endif
`;

const TERRAIN_NORMAL_FRAG = `
  #ifdef USE_NORMALMAP_TANGENTSPACE
    vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
    vec3 gravN = texture2D( gravelNormalMap, vTerrUv * ${GRAVEL_REP} ).xyz * 2.0 - 1.0;
    mapN = normalize( mix( mapN, gravN * vec3( 1.0, 1.0, 0.6 ), vSplat.r ) );
    mapN.xy *= normalScale;
    normal = normalize( tbn * mapN );
  #endif
`;

const GRASS_VERT = `
  vec3 transformed = vec3( position );
  vGrassY = uv.y;
  {
    vec3 ip = vec3( 0.0 );
    #ifdef USE_INSTANCING
      ip = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
    #endif
    float ph = ip.x * 0.37 + ip.z * 0.53;
    float gust = 0.5 + 0.5 * sin( uTime * 0.29 + ip.x * 0.043 + ip.z * 0.061 );
    float sw = sin( uTime * 1.87 + ph ) * 0.05 + sin( uTime * 3.61 + ph * 1.7 ) * 0.026;
    sw *= 0.5 + 1.1 * gust * gust;
    float bendW = uv.y * uv.y;
    vec3 windW = vec3( 0.80, 0.0, 0.45 ) * sw;
    #ifdef USE_INSTANCING
      vec3 wc0 = normalize( instanceMatrix[0].xyz );
      vec3 wc2 = normalize( instanceMatrix[2].xyz );
      transformed += vec3( dot( windW, wc0 ), 0.0, dot( windW, wc2 ) ) * bendW;
    #else
      transformed += windW * bendW;
    #endif
  }
`;

const GRASS_EMIT_FRAG = `
  #include <emissivemap_fragment>
  {
    // translucent backlight — blades glow when the sun is behind them
    vec3 sunVg = normalize( ( viewMatrix * vec4( uSunDirG, 0.0 ) ).xyz );
    vec3 vDirG = normalize( vViewPosition );
    float backG = clamp( dot( -vDirG, sunVg ), 0.0, 1.0 );
    totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 0.90, 0.55 )
      * ( backG * backG * 0.85 + 0.16 ) * ( 0.35 + 0.65 * vGrassY );
    totalEmissiveRadiance += vec3( 0.62, 0.44, 0.16 ) * pow( vGrassY, 3.0 ) * 0.22 * backG;
  }
`;

const FOLIAGE_VERT = `
  vec3 transformed = vec3( position );
  {
    float br = length( position.xz );
    float ph = position.y * 0.7;
    #ifdef USE_INSTANCING
      ph += instanceMatrix[3][0] * 0.31 + instanceMatrix[3][2] * 0.47;
    #endif
    transformed.x += ( sin( uTime * 0.93 + ph ) * 0.6 + sin( uTime * 2.11 + ph * 1.9 ) * 0.25 ) * 0.045 * br;
    transformed.z += cos( uTime * 0.81 + ph * 1.3 ) * 0.03 * br;
  }
`;

const FOLIAGE_EMIT_FRAG = `
  #include <emissivemap_fragment>
  {
    vec3 sunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
    vec3 vDir = normalize( vViewPosition );
    float backF = clamp( dot( -vDir, sunV ), 0.0, 1.0 );
    float rimF = pow( 1.0 - abs( dot( normal, vDir ) ), 2.0 );
    totalEmissiveRadiance += vec3( 0.34, 0.31, 0.10 ) * ( rimF * backF * backF * 0.5 + backF * 0.06 );
  }
`;

// ================================================================ createLandscape

export function createLandscape(ctx) {
  const { THREE: T } = ctx; // engine passes same namespace; local import is canonical
  void T;
  const group = new THREE.Group();
  group.name = 'landscape';

  const q = ctx.quality || {};
  const iScale = q.instanceScale ?? 1;
  const aniso = q.aniso ?? 4;
  const N = (n) => Math.max(1, Math.round(n * iScale));

  // deterministic streams
  const R = (k) => mulberry32(3000 + k);
  const rngTerrain = R(1), rngGrass = R(2), rngPine = R(3), rngPlace = R(4);
  const rngBirch = R(5), rngRock = R(6), rngMtn = R(7), rngFar = R(8), rngPaint = R(10);
  const fbT = makeFbm(rngTerrain());      // terrain detail
  const fbG = makeFbm(rngTerrain());      // geometry (pine/rock) noise
  const fbM = makeFbm(rngMtn());          // mountains
  const fbC = makeFbm(rngPaint());        // canvas macro

  const sunDir = (ctx.sunDir ? ctx.sunDir.clone()
    : new THREE.Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2])).normalize();
  const fogCol = new THREE.Color(FOG.color);

  const timeU = { value: 0 };

  // ---------------------------------------------------------- height functions

  // FBM detail — dead flat inside the walk corridor, grows on the flanks.
  const detail = (x, z) => {
    const m = sstep(14, 22, Math.abs(x)) * sstep(3, 12, z);
    if (m <= 0) return 0;
    return m * ((fbT(x * 0.11, z * 0.11, 4) - 0.5) * 2.0
              + (fbT(x * 0.031 + 4.4, z * 0.031, 3) - 0.5) * 3.2);
  };

  // Forested headlands that curl the shoreline around the lake at both sides.
  const headland = (x, z) => {
    const side = sstep(20, 34, Math.abs(x));
    if (side <= 0) return 0;
    const zf = 1 - sstep(48, 82, z);
    if (zf <= 0) return 0;
    const irr = 0.5 + 1.0 * fbT(x * 0.02 + 7.3, z * 0.02 + 1.9, 3);
    return 5.6 * side * zf * irr;
  };

  // Recess under the built slab (room/terrace/steps) so nothing z-fights.
  const dip = (x, z) =>
    -0.07 * (1 - sstep(10.9, 11.6, Math.abs(x))) * (1 - sstep(13.9, 14.55, z));

  const mainY = (x, z) => groundHeight(x, z) + detail(x, z) + headland(x, z) + dip(x, z);

  // Side landmasses: distant forested arms z≈55–185 at |x|≈34–140. They submerge
  // below the waterline at every border so no seam is ever visible.
  const sideY = (x, z) => {
    const ax = Math.abs(x);
    if (ax < 26 || ax > 146 || z < 40 || z > 190) return -1e9;
    const edge = sstep(30, 46, ax) * (1 - sstep(124, 144, ax))
               * sstep(48, 68, z) * (1 - sstep(156, 186, z));
    const n = fbT(ax * 0.016 + 3.1, z * 0.014 + 6.6, 4);
    let r = 1 - Math.abs(2 * n - 1); r *= r;
    return -3.5 + edge * (7.5 + 13 * r);
  };

  const landY = (x, z) => {
    let m = -1e9;
    if (Math.abs(x) <= 70 && z >= -27 && z <= 83) m = mainY(x, z);
    return Math.max(m, sideY(x, z));
  };

  // ---------------------------------------------------------- shared textures

  const gp = paintGrassTile(rngPaint, q.tier === 'medium' ? 256 : 512);
  const grassMapTex = canvasTex(THREE, gp.alb, { srgb: true, repeat: [56, 44], aniso });
  const grassNormalTex = normalTexFromHeight(THREE, gp.hgt, 1.4, aniso);
  grassNormalTex.repeat.set(56, 44);
  const grassRoughTex = canvasTex(THREE, gp.rough, { repeat: [56, 44], aniso });
  const macroTex = canvasTex(THREE, paintMacro(fbC, 256), { aniso: 2 });

  let gravelSet = null;
  try {
    if (ctx.tex && typeof ctx.tex.gravel === 'function') {
      gravelSet = ctx.tex.gravel({ repeat: [1, 1], seed: 3042 });
    }
  } catch (e) { gravelSet = null; }
  if (!gravelSet || !gravelSet.map) gravelSet = paintGravelFallback(THREE, rngPaint, aniso);

  // ---------------------------------------------------------- 1) near terrain

  const buildPatch = (w, d, sx, sz, cx, cz, hFn) => {
    const g = new THREE.PlaneGeometry(w, d, sx, sz);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, 0, cz);
    const pos = g.attributes.position;
    const splat = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = hFn(x, z);
      pos.setY(i, y);
      // r: gravel path — organic noisy edge
      const edgeJit = (fbT(z * 0.33 + 9.1, x * 0.33, 2) - 0.5) * 0.55;
      const inPathZ = sstep(14.55, 14.95, z) * (1 - sstep(33.9, 34.5, z));
      const inPathX = 1 - sstep(PATH.maxX - 0.08, PATH.maxX + 0.45, Math.abs(x) + edgeJit);
      let r = inPathZ * inPathX;
      // g: shore mud as ground dips toward water
      const mj = (fbT(x * 0.21 + 3.3, z * 0.21, 3) - 0.5) * 0.35;
      let gW = sstep(-1.28 + mj, -1.72 + mj, y) ; // note: decreasing y → weight up
      gW = clamp((y - (-1.28 + mj)) / ((-1.72 + mj) - (-1.28 + mj)), 0, 1);
      gW = gW * gW * (3 - 2 * gW);
      // b: dark damp band hugging the waterline
      const b = 1 - sstep(WATER_Y, WATER_Y + 0.42, y);
      r *= (1 - gW); // mud wins over gravel at the shoreline
      splat[i * 3] = r; splat[i * 3 + 1] = gW; splat[i * 3 + 2] = b;
    }
    g.setAttribute('aSplat', new THREE.BufferAttribute(splat, 3));
    return g;
  };

  const segScale = q.tier === 'medium' ? 0.6 : 1;
  const terrGeos = [
    buildPatch(140, 110, Math.round(220 * segScale), Math.round(180 * segScale), 0, 28, mainY),
    buildPatch(120, 150, 46, 54, 86, 115, (x, z) => Math.max(sideY(x, z), WATER_Y - 1.7)),
    buildPatch(120, 150, 46, 54, -86, 115, (x, z) => Math.max(sideY(x, z), WATER_Y - 1.7)),
  ];
  const terrainGeo = mergeGeometries(terrGeos, false);
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: grassMapTex,
    normalMap: grassNormalTex,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: grassRoughTex,
    roughness: 1.0,
    metalness: 0.0,
  });
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.gravelMap = { value: gravelSet.map };
    shader.uniforms.gravelNormalMap = { value: gravelSet.normalMap };
    shader.uniforms.gravelRoughMap = { value: gravelSet.roughnessMap };
    shader.uniforms.macroMap = { value: macroTex };
    shader.vertexShader =
      'attribute vec3 aSplat;\nvarying vec3 vSplat;\nvarying vec2 vTerrUv;\nvarying vec3 vWPos;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', TERRAIN_VERT);
    shader.fragmentShader =
      'varying vec3 vSplat;\nvarying vec2 vTerrUv;\nvarying vec3 vWPos;\n'
      + 'uniform sampler2D gravelMap;\nuniform sampler2D gravelNormalMap;\n'
      + 'uniform sampler2D gravelRoughMap;\nuniform sampler2D macroMap;\n'
      + shader.fragmentShader
        .replace('#include <map_fragment>', TERRAIN_MAP_FRAG)
        .replace('#include <roughnessmap_fragment>', TERRAIN_ROUGH_FRAG)
        .replace('#include <normal_fragment_maps>', TERRAIN_NORMAL_FRAG);
  };
  terrainMat.customProgramCacheKey = () => 'ag-landscape-terrain';

  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.name = 'terrain';
  terrain.receiveShadow = true;
  group.add(terrain);

  // ---------------------------------------------------------- 2) grass blades

  const bladeTex = canvasTex(THREE, paintBladeCard(rngPaint, 256), { srgb: true, aniso });
  const grassMat = new THREE.MeshLambertMaterial({
    map: bladeTex,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
  });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeU;
    shader.uniforms.uSunDirG = { value: ctx.sunDir.clone().normalize() };
    shader.vertexShader = 'uniform float uTime;\nvarying float vGrassY;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', GRASS_VERT);
    shader.fragmentShader = 'varying float vGrassY;\nuniform vec3 uSunDirG;\n'
      + shader.fragmentShader.replace('#include <emissivemap_fragment>', GRASS_EMIT_FRAG);
  };
  grassMat.customProgramCacheKey = () => 'ag-landscape-grass';

  const grassPlace = [];
  const grassCount = N(14000);
  {
    let guard = grassCount * 40;
    while (grassPlace.length < grassCount && guard-- > 0) {
      const x = (rngGrass() * 2 - 1) * 13.6;
      const z = LAWN.minZ + 0.25 + rngGrass() * (33.4 - LAWN.minZ - 0.25);
      if (Math.abs(x) < PATH.maxX + 0.4 && z < 34.4) continue;        // keep the path clear
      const shoreFade = 1 - sstep(30.6, 33.2, z);
      if (rngGrass() > 0.12 + 0.88 * shoreFade) continue;             // thin out at the shore
      const y = mainY(x, z);
      if (y < -1.55) continue;
      const base = [x, y - 0.02, z, rngGrass() * Math.PI * 2, 0.75 + rngGrass() * 0.6, 1, 0];
      grassPlace.push(base);
      // clumping — a neighbour or two
      const extra = rngGrass() < 0.4 ? 1 + Math.floor(rngGrass() * 2) : 0;
      for (let e = 0; e < extra && grassPlace.length < grassCount; e++) {
        const nx = x + (rngGrass() - 0.5) * 0.6, nz = z + (rngGrass() - 0.5) * 0.6;
        if (Math.abs(nx) < PATH.maxX + 0.4 && nz < 34.4) continue;
        const ny = mainY(nx, nz);
        if (ny < -1.55) continue;
        grassPlace.push([nx, ny - 0.02, nz, rngGrass() * Math.PI * 2, 0.7 + rngGrass() * 0.55, 1, 0]);
      }
    }
    // reed tufts at the waterline (taller, darker — flag idx 1 for tint)
    const reedCount = N(90);
    let rguard = reedCount * 30;
    let reeds = 0;
    while (reeds < reedCount && rguard-- > 0) {
      const side = rngGrass() < 0.5 ? -1 : 1;
      const x = side * (1.9 + rngGrass() * 10.5);
      const z = 32.8 + rngGrass() * 2.5;
      const y = mainY(x, z);
      if (y < -2.05 || y > -1.3) continue;
      grassPlace.push([x, y - 0.02, z, rngGrass() * Math.PI * 2,
        0.8 + rngGrass() * 0.5, 1.7 + rngGrass() * 0.9, 1]);
      reeds++;
    }
  }

  const tuftGeo = buildTuftGeo();
  const grassIM = new THREE.InstancedMesh(tuftGeo, grassMat, grassPlace.length);
  {
    const p = new THREE.Vector3(), qt = new THREE.Quaternion(),
      sc = new THREE.Vector3(), e = new THREE.Euler(), m = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < grassPlace.length; i++) {
      const [x, y, z, ry, s, sy, kind] = grassPlace[i];
      e.set(0, ry, 0); qt.setFromEuler(e);
      p.set(x, y, z); sc.set(s, s * sy, s);
      m.compose(p, qt, sc);
      grassIM.setMatrixAt(i, m);
      if (kind === 1) {
        col.setHSL(0.14 + rngGrass() * 0.03, 0.3, 0.62 + rngGrass() * 0.12); // olive reeds
      } else {
        col.setHSL(0.19 + rngGrass() * 0.07, 0.28 + rngGrass() * 0.14, 0.74 + rngGrass() * 0.2);
      }
      grassIM.setColorAt(i, col);
    }
    grassIM.instanceMatrix.needsUpdate = true;
    if (grassIM.instanceColor) grassIM.instanceColor.needsUpdate = true;
  }
  grassIM.castShadow = false;
  grassIM.receiveShadow = true;
  grassIM.computeBoundingSphere();
  group.add(grassIM);

  // ---------------------------------------------------------- 3) pines

  const bark = paintBark(rngPaint, 256, 512);
  const barkMapTex = canvasTex(THREE, bark.alb, { srgb: true, repeat: [2, 3], aniso });
  const barkNormalTex = normalTexFromHeight(THREE, bark.hgt, 2.0, aniso);
  barkNormalTex.repeat.set(2, 3);
  const foliageTex = canvasTex(THREE, paintFoliage(rngPaint, 256), { srgb: true, repeat: [3, 1], aniso });

  const barkMat = new THREE.MeshStandardMaterial({
    map: barkMapTex,
    normalMap: barkNormalTex,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.92,
    metalness: 0.0,
    vertexColors: true,
  });
  const foliageMat = new THREE.MeshStandardMaterial({
    map: foliageTex,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0.0,
  });
  foliageMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeU;
    shader.uniforms.uSunDir = { value: sunDir };
    shader.vertexShader = 'uniform float uTime;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', FOLIAGE_VERT);
    shader.fragmentShader = 'uniform vec3 uSunDir;\n'
      + shader.fragmentShader.replace('#include <emissivemap_fragment>', FOLIAGE_EMIT_FRAG);
  };
  foliageMat.customProgramCacheKey = () => 'ag-landscape-foliage';

  const farPineGeo = buildPineGeo(rngPine, fbG, { radial: 8, hseg: 5, layers: 6, coneR: 9, coneH: 2 });
  const heroPineGeo = buildPineGeo(rngPine, fbG, { radial: 12, hseg: 8, layers: 7, coneR: 14, coneH: 3 });

  // --- far/mid pine placements (flanks, shore bands, distant side arms)
  const pinePlace = [];
  {
    const push = (x, z, y, s) => pinePlace.push([x, y, z, rngPlace() * Math.PI * 2, s]);
    // lawn flanks — leave the centre vista wide open
    const nFlank = N(50);
    let guard = nFlank * 30, made = 0;
    while (made < nFlank && guard-- > 0) {
      const side = rngPlace() < 0.5 ? -1 : 1;
      const x = side * (10.8 + rngPlace() * 3.6);
      const z = 15 + rngPlace() * 18;
      const y = mainY(x, z);
      if (y < -1.2) continue;
      push(x, z, y - 0.25, 0.65 + rngPlace() * 0.5);
      made++;
    }
    // shore bands / headlands curving away with the coastline
    const nShore = N(330);
    guard = nShore * 40; made = 0;
    while (made < nShore && guard-- > 0) {
      const side = rngPlace() < 0.5 ? -1 : 1;
      const x = side * (13.8 + rngPlace() * 52);
      const z = 24 + rngPlace() * 54;
      const y = landY(x, z);
      if (y < -1.05) continue;
      push(x, z, y - 0.3, 0.7 + rngPlace() * 0.75);
      made++;
    }
    // distant tree line on the side arms (z 55–180)
    const nSide = N(320);
    guard = nSide * 40; made = 0;
    while (made < nSide && guard-- > 0) {
      const side = rngPlace() < 0.5 ? -1 : 1;
      const x = side * (34 + rngPlace() * 96);
      const z = 55 + rngPlace() * 125;
      const y = sideY(x, z);
      if (y < -0.9) continue;
      push(x, z, y - 0.35, 1.0 + rngPlace() * 1.0);
      made++;
    }
  }

  const mkPineIMs = (geoPair, transforms, hero) => {
    const trunkIM = new THREE.InstancedMesh(geoPair.trunkGeo, barkMat, transforms.length);
    const folIM = new THREE.InstancedMesh(geoPair.foliageGeo, foliageMat, transforms.length);
    const p = new THREE.Vector3(), qt = new THREE.Quaternion(),
      sc = new THREE.Vector3(), e = new THREE.Euler(), m = new THREE.Matrix4();
    const cFol = new THREE.Color(), cTrunk = new THREE.Color(), base = new THREE.Color();
    for (let i = 0; i < transforms.length; i++) {
      const [x, y, z, ry, s] = transforms[i];
      e.set((rngPlace() - 0.5) * 0.05, ry, (rngPlace() - 0.5) * 0.05);
      qt.setFromEuler(e);
      p.set(x, y, z);
      const sy = s * (0.9 + rngPlace() * 0.3);
      sc.set(s, sy, s);
      m.compose(p, qt, sc);
      trunkIM.setMatrixAt(i, m);
      folIM.setMatrixAt(i, m);
      // aerial haze grows with distance; hue jitter keeps the stand alive
      const d = Math.hypot(x, z - 10);
      const hz = sstep(45, 190, d) * 0.62;
      base.setHSL(0.28 + (rngPlace() - 0.5) * 0.05, 0.32 + rngPlace() * 0.14, 0.72 + rngPlace() * 0.16);
      cFol.copy(base).lerp(fogCol, hz);
      folIM.setColorAt(i, cFol);
      cTrunk.setHSL(0.07, 0.1, 0.85 + rngPlace() * 0.1).lerp(fogCol, hz * 0.9);
      trunkIM.setColorAt(i, cTrunk);
    }
    trunkIM.instanceMatrix.needsUpdate = folIM.instanceMatrix.needsUpdate = true;
    if (trunkIM.instanceColor) trunkIM.instanceColor.needsUpdate = true;
    if (folIM.instanceColor) folIM.instanceColor.needsUpdate = true;
    trunkIM.castShadow = folIM.castShadow = !!hero;
    trunkIM.receiveShadow = !!hero;
    if (hero) {
      folIM.customDepthMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: foliageTex,
        alphaTest: 0.45,
      });
    }
    trunkIM.computeBoundingSphere();
    folIM.computeBoundingSphere();
    return [trunkIM, folIM];
  };

  group.add(...mkPineIMs(farPineGeo, pinePlace, false));

  // --- hero pines flanking the path & terrace — these throw real shadows
  const heroSpots = [
    [-8.8, 19.0, 1.05], [-10.3, 25.5, 1.2], [-7.0, 30.5, 0.9],
    [7.3, 17.8, 0.95], [9.7, 23.5, 1.15], [6.9, 29.5, 1.0], [11.8, 27.0, 1.25],
  ];
  const heroPlace = heroSpots.map(([x, z, s]) =>
    [x, mainY(x, z) - 0.28, z, rngPlace() * Math.PI * 2, s]);
  group.add(...mkPineIMs(heroPineGeo, heroPlace, true));

  // ---------------------------------------------------------- 4) birches

  const birchTex = canvasTex(THREE, paintBirchBark(rngPaint, 128, 512), { srgb: true, repeat: [1.5, 2], aniso });
  const birchMat = new THREE.MeshStandardMaterial({ map: birchTex, roughness: 0.7, metalness: 0 });
  const leafTex = canvasTex(THREE, paintLeafCluster(rngPaint, 256), { srgb: true, aniso });
  const leafMat = new THREE.MeshLambertMaterial({
    map: leafTex, alphaTest: 0.4, side: THREE.DoubleSide,
  });

  const birchGeo = buildBirchGeo();
  const leafGeo = new THREE.PlaneGeometry(2.0, 1.5);
  const birchPlace = [];
  {
    const nB = N(40);
    let guard = nB * 40, made = 0;
    while (made < nB && guard-- > 0) {
      const side = rngBirch() < 0.5 ? -1 : 1;
      const x = side * (6 + rngBirch() * 24);
      const z = 26.5 + rngBirch() * 7.6;
      const y = landY(x, z);
      if (y < -1.55 || y > 1.4) continue;
      birchPlace.push([x, y - 0.15, z, rngBirch() * Math.PI * 2, 0.8 + rngBirch() * 0.5]);
      made++;
    }
  }
  const birchIM = new THREE.InstancedMesh(birchGeo, birchMat, birchPlace.length);
  const leafIM = new THREE.InstancedMesh(leafGeo, leafMat, birchPlace.length * 3);
  {
    const p = new THREE.Vector3(), qt = new THREE.Quaternion(),
      sc = new THREE.Vector3(), e = new THREE.Euler(), m = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < birchPlace.length; i++) {
      const [x, y, z, ry, s] = birchPlace[i];
      e.set((rngBirch() - 0.5) * 0.1, ry, (rngBirch() - 0.5) * 0.1);
      qt.setFromEuler(e);
      p.set(x, y, z); sc.set(s, s, s);
      m.compose(p, qt, sc);
      birchIM.setMatrixAt(i, m);
      for (let L = 0; L < 3; L++) {
        const li = i * 3 + L;
        const ang = rngBirch() * Math.PI * 2;
        const rad = (0.35 + rngBirch() * 0.85) * s;
        p.set(x + Math.cos(ang) * rad,
          y + (3.3 + rngBirch() * 1.3) * s,
          z + Math.sin(ang) * rad);
        e.set((rngBirch() - 0.5) * 1.1, rngBirch() * Math.PI * 2, (rngBirch() - 0.5) * 0.5);
        qt.setFromEuler(e);
        const ls = (0.8 + rngBirch() * 0.6) * s;
        sc.set(ls, ls, ls);
        m.compose(p, qt, sc);
        leafIM.setMatrixAt(li, m);
        col.setHSL(0.10 + rngBirch() * 0.035, 0.5 + rngBirch() * 0.2, 0.5 + rngBirch() * 0.14);
        leafIM.setColorAt(li, col);
      }
    }
    birchIM.instanceMatrix.needsUpdate = leafIM.instanceMatrix.needsUpdate = true;
    if (leafIM.instanceColor) leafIM.instanceColor.needsUpdate = true;
  }
  birchIM.castShadow = leafIM.castShadow = false;
  birchIM.receiveShadow = true;
  birchIM.computeBoundingSphere();
  leafIM.computeBoundingSphere();
  group.add(birchIM, leafIM);

  // ---------------------------------------------------------- 5) rocks

  const rockGeo = buildRockGeo(rngRock, fbG);
  const rockMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true,
  });
  const rockPlace = [];
  {
    // shoreline scatter (straddling the waterline)
    const nShore = N(88);
    let guard = nShore * 40, made = 0;
    while (made < nShore && guard-- > 0) {
      const side = rngRock() < 0.5 ? -1 : 1;
      const x = side * (2.6 + rngRock() * 32);
      const z = 31.2 + rngRock() * 6.6;
      const y = landY(x, z);
      if (y < -2.5 || y > -0.4) continue;
      rockPlace.push([x, y - 0.12, z, 0.22 + rngRock() * 1.1]);
      made++;
    }
    // slope / headland boulders
    const nSlope = N(32);
    guard = nSlope * 40; made = 0;
    while (made < nSlope && guard-- > 0) {
      const side = rngRock() < 0.5 ? -1 : 1;
      const x = side * (14 + rngRock() * 40);
      const z = 12 + rngRock() * 55;
      const y = landY(x, z);
      if (y < -1.0) continue;
      rockPlace.push([x, y - 0.18, z, 0.3 + rngRock() * 1.15]);
      made++;
    }
  }
  const rockIM = new THREE.InstancedMesh(rockGeo, rockMat, rockPlace.length);
  {
    const p = new THREE.Vector3(), qt = new THREE.Quaternion(),
      sc = new THREE.Vector3(), e = new THREE.Euler(), m = new THREE.Matrix4();
    for (let i = 0; i < rockPlace.length; i++) {
      const [x, y, z, s] = rockPlace[i];
      e.set((rngRock() - 0.5) * 0.5, rngRock() * Math.PI * 2, (rngRock() - 0.5) * 0.5);
      qt.setFromEuler(e);
      p.set(x, y - s * 0.18, z);
      sc.set(s * (0.85 + rngRock() * 0.3), s * (0.8 + rngRock() * 0.35), s * (0.85 + rngRock() * 0.3));
      m.compose(p, qt, sc);
      rockIM.setMatrixAt(i, m);
    }
    rockIM.instanceMatrix.needsUpdate = true;
  }
  rockIM.castShadow = false;
  rockIM.receiveShadow = true;
  rockIM.computeBoundingSphere();
  group.add(rockIM);

  // ---------------------------------------------------------- 6) mountains

  // Ridge height reusable for both displacement and far-forest feet placement.
  const ridgeParams = [
    { zC: 415, depth: 170, amp: 120, snow: 88, haze: 0.10, so: 1.7 },
    { zC: 520, depth: 190, amp: 165, snow: 96, haze: 0.22, so: 5.9 },
    { zC: 645, depth: 210, amp: 205, snow: 106, haze: 0.36, so: 11.3 },
  ];
  const ridgeY = (P, x, z) => {
    const lz = z - P.zC;
    const t = 1 - Math.abs(lz) / (P.depth * 0.5);
    if (t <= 0) return -14;
    const crest = Math.pow(t, 1.4);
    const wob = (fbM(lz * 0.01 + P.so * 2.7, x * 0.001 + P.so, 2) - 0.5) * 160;
    const nx = (x + wob) * 0.0035 + P.so;
    const n = fbM(nx, P.so * 1.7, 4);
    let r = 1 - Math.abs(2 * n - 1); r *= r;
    const massif = 0.5 + 0.5 * fbM((x + wob) * 0.0009 + P.so * 3.1, 4.7 + P.so, 3);
    const prof = r * (0.45 + 0.75 * massif);
    const det = (fbM(x * 0.02 + P.so, z * 0.02, 4) - 0.5) * 14;
    let y = -14 + crest * (prof * P.amp + 12 + det);
    const xFade = 1 - sstep(560, 690, Math.abs(x));
    return -14 + (y + 14) * xFade;
  };

  {
    const mtnMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    const cSnow = new THREE.Color(0xefe9e2);
    const cRock = new THREE.Color(0x6a5f52);
    const cForest = new THREE.Color(0x2c473d);
    const cForestHi = new THREE.Color(0x41583e);
    const amb = new THREE.Color(0x94a7c0).multiplyScalar(0.62);
    const sun = new THREE.Color(0xffd9a8).multiplyScalar(1.55);
    const c = new THREE.Color(), litC = new THREE.Color(), tmp = new THREE.Color();
    for (const P of ridgeParams) {
      const geo = new THREE.PlaneGeometry(1400, P.depth, 220, 26);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, P.zC);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, ridgeY(P, pos.getX(i), pos.getZ(i)));
      }
      geo.computeVertexNormals();
      const nrm = geo.attributes.normal;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const ny = nrm.getY(i);
        const snowJit = (fbM(x * 0.02 + 31, z * 0.02, 3) - 0.5) * 22;
        // base: forest at the feet, exposed rock higher / on steeps
        tmp.copy(cForest).lerp(cForestHi, fbM(x * 0.015 + 9, z * 0.015, 3));
        c.copy(tmp).lerp(cRock, sstep(26, 66, y + snowJit * 0.4));
        const steep = 1 - sstep(0.42, 0.62, ny);
        c.lerp(cRock, steep * 0.5);
        // snow above the line, sticking to gentler slopes
        const snowW = sstep(P.snow - 14, P.snow + 10, y + snowJit) * sstep(0.34, 0.56, ny);
        c.lerp(cSnow, snowW);
        // baked golden-hour lighting (sun beyond the lake — mountains backlit)
        const nX = nrm.getX(i), nZ = nrm.getZ(i);
        const dotS = Math.max(0, nX * sunDir.x + ny * sunDir.y + nZ * sunDir.z);
        litC.copy(amb);
        litC.r += sun.r * dotS; litC.g += sun.g * dotS; litC.b += sun.b * dotS;
        c.multiply(litC);
        c.r = Math.min(c.r, 1.35); c.g = Math.min(c.g, 1.35); c.b = Math.min(c.b, 1.35);
        // aerial perspective — lower slopes drown in valley haze first
        const hazeAmt = Math.min(0.60, P.haze * 0.8 + 0.20 * (1 - sstep(0, 65, y)));
        c.lerp(fogCol, hazeAmt);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geo, mtnMat);
      mesh.name = 'ridge-' + P.zC;
      group.add(mesh);
    }
  }

  // ---------------------------------------------------------- 7) far-shore forest

  {
    const silTex = canvasTex(THREE, paintFarPine(rngPaint, 128, 256), { srgb: true, aniso: 2 });
    const silMat = new THREE.MeshBasicMaterial({
      map: silTex, alphaTest: 0.38, side: THREE.DoubleSide, fog: false,
    });
    const silGeo = new THREE.PlaneGeometry(15, 23);
    silGeo.translate(0, 10.5, 0);
    const count = N(600);
    const farIM = new THREE.InstancedMesh(silGeo, silMat, count);
    const p = new THREE.Vector3(), qt = new THREE.Quaternion(),
      sc = new THREE.Vector3(), e = new THREE.Euler(), m = new THREE.Matrix4();
    const cBase = new THREE.Color(0x22343a);
    const cWarm = new THREE.Color(0xc99a5e);
    const col = new THREE.Color();
    const A = ridgeParams[0];
    let placedN = 0, guard = count * 30;
    while (placedN < count && guard-- > 0) {
      const x = (rngFar() * 2 - 1) * 620;
      let z, y;
      if (rngFar() < 0.68) {         // waterline band on the far shore
        z = 350 + rngFar() * 46;
        y = -3.2;
      } else {                        // climbing the feet of ridge A
        z = 396 + rngFar() * 42;
        const hy = ridgeY(A, x, z);
        if (hy < -2 || hy > 26) continue;
        y = hy - 1.6;
      }
      const s = 0.8 + rngFar() * 0.95;
      e.set(0, Math.PI + (rngFar() - 0.5) * 0.5, 0);
      qt.setFromEuler(e);
      p.set(x, y, z);
      sc.set(s, s * (0.9 + rngFar() * 0.25), s);
      m.compose(p, qt, sc);
      farIM.setMatrixAt(placedN, m);
      col.copy(cBase);
      if (x < -80) col.lerp(cWarm, 0.10 * rngFar());  // sun-side warmth
      col.lerp(fogCol, clamp(0.30 + 0.4 * sstep(350, 445, z) + rngFar() * 0.07, 0, 0.85));
      farIM.setColorAt(placedN, col);
      placedN++;
    }
    farIM.count = placedN;
    farIM.instanceMatrix.needsUpdate = true;
    if (farIM.instanceColor) farIM.instanceColor.needsUpdate = true;
    farIM.castShadow = false;
    farIM.computeBoundingSphere();
    group.add(farIM);
  }

  // ---------------------------------------------------------- housekeeping

  group.traverse((o) => {
    if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); }
  });

  ctx.updates.push((dt, tw) => { timeU.value = tw; });

  return { group };
}
