// materials.js — procedural PBR texture factory. Every surface in the world is
// generated here on canvases: albedo + height → sobel normal + roughness.
// API frozen by SPEC section 1. Seed base 1000.

import { mulberry32 } from './config.js';

export function createTexFactory(THREE, quality) {
  const HI = quality.tier !== 'medium';
  const A = quality.aniso || 4;

  // ---------------------------------------------------------------- helpers
  function makeCanvas(size, drawFn) {
    const c = document.createElement('canvas');
    c.width = Array.isArray(size) ? size[0] : size;
    c.height = Array.isArray(size) ? size[1] : size;
    drawFn(c.getContext('2d', { willReadFrequently: true }), c.width, c.height);
    return c;
  }

  function tx(canvas, { srgb = false, repeat = [1, 1] } = {}) {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = A;
    t.needsUpdate = true;
    return t;
  }

  // value-noise fbm on a small lattice — cheap and deterministic
  function makeNoise(seed, lat = 64) {
    const rnd = mulberry32(seed);
    const g = new Float32Array(lat * lat);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const at = (x, y) => g[((y % lat + lat) % lat) * lat + ((x % lat + lat) % lat)];
    function vnoise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return at(xi, yi) * (1 - u) * (1 - v) + at(xi + 1, yi) * u * (1 - v) +
             at(xi, yi + 1) * (1 - u) * v + at(xi + 1, yi + 1) * u * v;
    }
    return function fbm(x, y, oct = 4, gain = 0.5, lac = 2.0) {
      let a = 0.5, f = 1, s = 0, n = 0;
      for (let o = 0; o < oct; o++) {
        s += a * vnoise(x * f, y * f); n += a; a *= gain; f *= lac;
      }
      return s / n;
    };
  }

  function normalFromHeight(canvas, strength = 1.0) {
    const w = canvas.width, h = canvas.height;
    const src = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const out = makeCanvas([w, h], () => {});
    const octx = out.getContext('2d', { willReadFrequently: true });
    const img = octx.createImageData(w, h);
    const d = img.data;
    const hv = (x, y) => {
      x = (x + w) % w; y = (y + h) % h;
      return src[(y * w + x) * 4] / 255;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (hv(x - 1, y - 1) + 2 * hv(x - 1, y) + hv(x - 1, y + 1)
                  - hv(x + 1, y - 1) - 2 * hv(x + 1, y) - hv(x + 1, y + 1)) * strength;
        const dy = (hv(x - 1, y - 1) + 2 * hv(x, y - 1) + hv(x + 1, y - 1)
                  - hv(x - 1, y + 1) - 2 * hv(x, y + 1) - hv(x + 1, y + 1)) * strength;
        const len = Math.sqrt(dx * dx + dy * dy + 1);
        const i = (y * w + x) * 4;
        d[i] = ((dx / len) * 0.5 + 0.5) * 255;
        d[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
        d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  // Build a full set from three painter callbacks sharing one size.
  function makeSet(size, { albedo, height, rough }, opts = {}, normalStrength = 1.4) {
    const alC = makeCanvas(size, albedo);
    const htC = makeCanvas(size, height);
    const roC = makeCanvas(size, rough);
    const set = {
      map: tx(alC, { srgb: true, repeat: opts.repeat }),
      normalMap: tx(normalFromHeight(htC, normalStrength), { repeat: opts.repeat }),
      roughnessMap: tx(roC, { repeat: opts.repeat }),
      normalScale: 1.0,
    };
    return set;
  }

  function std(set, overrides = {}) {
    const m = new THREE.MeshStandardMaterial({ envMapIntensity: 0.9, ...overrides });
    if (set) {
      if (set.map) m.map = set.map;
      if (set.normalMap) { m.normalMap = set.normalMap; m.normalScale = new THREE.Vector2(set.normalScale, set.normalScale); }
      if (set.roughnessMap) m.roughnessMap = set.roughnessMap;
      if (set.aoMap) m.aoMap = set.aoMap;
    }
    return m;
  }
  function phys(set, overrides = {}) {
    const m = new THREE.MeshPhysicalMaterial({ envMapIntensity: 0.9, ...overrides });
    if (set) {
      if (set.map) m.map = set.map;
      if (set.normalMap) { m.normalMap = set.normalMap; m.normalScale = new THREE.Vector2(set.normalScale, set.normalScale); }
      if (set.roughnessMap) m.roughnessMap = set.roughnessMap;
      if (set.aoMap) m.aoMap = set.aoMap;
    }
    return m;
  }

  const memo = new Map();
  function memoize(key, fn) {
    if (!memo.has(key)) memo.set(key, fn());
    return memo.get(key);
  }
  const kf = (name, opts) => name + JSON.stringify(opts || {});

  // ------------------------------------------------------------ herringbone
  function herringbone(opts = {}) {
    return memoize(kf('herring', opts), () => {
      const S = HI ? 1024 : 512;
      const rnd = mulberry32(opts.seed ?? 1001);
      const fbm = makeNoise(1002);
      // block layout: 45°-rotated staggered planks. Precompute plank tints.
      const bw = S / 8, bl = bw * 5;           // plank w×l in px
      const planks = [];
      // cover the tile with two diagonal families
      for (let row = -2; row < 20; row++) {
        for (let col = -2; col < 20; col++) {
          const x = col * bl * 0.5, y = row * bw * 2;
          const dirA = (col % 2 === 0);
          planks.push({ x, y: y + (col % 2) * bw, dir: dirA ? 1 : -1, tint: 0.78 + rnd() * 0.44, hue: (rnd() - 0.5) * 14 });
        }
      }
      const drawPlanks = (g, mode) => {
        g.save();
        for (const p of planks) {
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.dir * Math.PI / 4);
          const grad = g.createLinearGradient(0, 0, bl, 0);
          if (mode === 'albedo') {
            const base = [90 * p.tint, 60 * p.tint, 38 * p.tint];
            grad.addColorStop(0, `rgb(${base[0] + p.hue},${base[1] + p.hue * 0.5},${base[2]})`);
            grad.addColorStop(1, `rgb(${base[0] * 0.86 + p.hue},${base[1] * 0.86 + p.hue * 0.5},${base[2] * 0.86})`);
            g.fillStyle = grad;
          } else if (mode === 'height') {
            g.fillStyle = `rgb(${150 + p.tint * 40},${150 + p.tint * 40},${150 + p.tint * 40})`;
          } else {
            g.fillStyle = `rgb(${70 + (1.2 - p.tint) * 60},${70 + (1.2 - p.tint) * 60},${70 + (1.2 - p.tint) * 60})`;
          }
          g.fillRect(-bl * 0.05, 0, bl * 1.1, bw);
          // long grain streaks
          const n = mode === 'albedo' ? 26 : 14;
          for (let i = 0; i < n; i++) {
            const yy = (i / n) * bw + (rnd() - 0.5) * 2;
            g.globalAlpha = 0.05 + rnd() * 0.12;
            if (mode === 'albedo') g.strokeStyle = rnd() > 0.5 ? '#2e1c10' : '#8a6038';
            else if (mode === 'height') g.strokeStyle = rnd() > 0.5 ? '#666' : '#bbb';
            else g.strokeStyle = rnd() > 0.6 ? '#a0a0a0' : '#505050';
            g.lineWidth = 0.6 + rnd() * 1.4;
            g.beginPath();
            g.moveTo(-bl * 0.05, yy);
            for (let xx = 0; xx <= bl * 1.1; xx += bl / 8) {
              g.lineTo(xx, yy + Math.sin(xx * 0.02 + rnd() * 6) * 1.5 * rnd());
            }
            g.stroke();
          }
          g.globalAlpha = 1;
          // seams
          g.strokeStyle = mode === 'albedo' ? 'rgba(20,10,5,0.85)' : (mode === 'height' ? '#000' : 'rgba(160,160,160,0.8)');
          g.lineWidth = mode === 'height' ? 2.2 : 1.6;
          g.strokeRect(-bl * 0.05, 0, bl * 1.1, bw);
          g.restore();
        }
        g.restore();
      };
      const set = makeSet(S, {
        albedo: (g, w, h) => {
          g.fillStyle = '#4a3018'; g.fillRect(0, 0, w, h);
          drawPlanks(g, 'albedo');
          // traffic patina
          const id = g.getImageData(0, 0, w, h), d = id.data;
          for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
            const v = fbm(x / 90, y / 90, 3) - 0.5;
            const i = (y * w + x) * 4;
            d[i] = Math.max(0, d[i] + v * 26); d[i + 1] = Math.max(0, d[i + 1] + v * 22); d[i + 2] = Math.max(0, d[i + 2] + v * 16);
          }
          g.putImageData(id, 0, 0);
        },
        height: (g, w, h) => { g.fillStyle = '#909090'; g.fillRect(0, 0, w, h); drawPlanks(g, 'height'); },
        rough: (g, w, h) => {
          g.fillStyle = 'rgb(82,82,82)'; g.fillRect(0, 0, w, h);
          drawPlanks(g, 'rough');
          for (let i = 0; i < 60; i++) {   // scuffs
            g.globalAlpha = 0.10 + rnd() * 0.1;
            g.strokeStyle = 'rgb(150,150,150)';
            g.lineWidth = 2 + rnd() * 5;
            g.beginPath();
            const x0 = rnd() * S, y0 = rnd() * S, a = rnd() * Math.PI;
            g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * 60 * rnd(), y0 + Math.sin(a) * 60 * rnd());
            g.stroke();
          }
          g.globalAlpha = 1;
        },
      }, opts, 1.2);
      set.baseRoughness = 0.32;
      return set;
    });
  }

  // ---------------------------------------------------------------- planks
  function plank(opts = {}) {
    return memoize(kf('plank', opts), () => {
      const S = 512;
      const rnd = mulberry32(opts.seed ?? 1011);
      const fbm = makeNoise(1012);
      const boards = 7;
      const bh = S / boards;
      const drawBoards = (g, mode) => {
        for (let b = 0; b < boards; b++) {
          const tint = 0.72 + rnd() * 0.5;
          const y = b * bh;
          if (mode === 'albedo') g.fillStyle = `rgb(${118 * tint},${100 * tint},${78 * tint})`;
          else if (mode === 'height') g.fillStyle = `rgb(${140 + tint * 50},${140 + tint * 50},${140 + tint * 50})`.replace(/rgb\((\d+),0,0\)/, (m, v) => `rgb(${v},${v},${v})`);
          else g.fillStyle = 'rgb(190,190,190)';
          g.fillRect(0, y + 2, S, bh - 4);
          for (let i = 0; i < 30; i++) {
            const yy = y + 3 + rnd() * (bh - 6);
            g.globalAlpha = 0.08 + rnd() * 0.14;
            g.strokeStyle = mode === 'albedo' ? (rnd() > 0.5 ? '#5c4a34' : '#9c8a6c') : (mode === 'height' ? (rnd() > 0.5 ? '#777' : '#c8c8c8') : 'rgb(220,220,220)');
            g.lineWidth = 0.7 + rnd();
            g.beginPath(); g.moveTo(0, yy);
            for (let x = 0; x <= S; x += S / 6) g.lineTo(x, yy + (fbm(x / 40 + b * 9, yy / 40, 2) - 0.5) * 5);
            g.stroke();
          }
          g.globalAlpha = 1;
          if (rnd() > 0.55) {  // knot
            const kx = rnd() * S, ky = y + bh * (0.3 + rnd() * 0.4);
            for (let r = 8; r > 0; r -= 1.6) {
              g.globalAlpha = 0.25;
              g.strokeStyle = mode === 'albedo' ? '#41301e' : '#555';
              g.beginPath(); g.ellipse(kx, ky, r * 1.5, r, 0.3, 0, Math.PI * 2); g.stroke();
            }
            g.globalAlpha = 1;
          }
          // gaps
          g.fillStyle = mode === 'albedo' ? 'rgba(18,14,10,0.95)' : (mode === 'height' ? '#000' : 'rgb(230,230,230)');
          g.fillRect(0, y, S, 2.5); g.fillRect(0, y + bh - 2.5, S, 2.5);
        }
      };
      const set = makeSet(S, {
        albedo: (g, w, h) => { g.fillStyle = '#6a5a44'; g.fillRect(0, 0, w, h); drawBoards(g, 'albedo'); },
        height: (g, w, h) => { g.fillStyle = '#888'; g.fillRect(0, 0, w, h); drawBoards(g, 'height'); },
        rough: (g, w, h) => { g.fillStyle = 'rgb(195,195,195)'; g.fillRect(0, 0, w, h); drawBoards(g, 'rough'); },
      }, opts, 1.6);
      set.baseRoughness = 0.75;
      return set;
    });
  }

  // ------------------------------------------------------------- grasscloth
  function grasscloth(opts = {}) {
    return memoize(kf('grass', opts), () => {
      const S = 512;
      const rnd = mulberry32(opts.seed ?? 1021);
      const fbm = makeNoise(1022);
      const weave = (g, mode, w, h) => {
        for (let y = 0; y < h; y += 3) {
          const band = 0.82 + fbm(0, y / 26, 3) * 0.36;
          for (let x = 0; x < w; x += 9) {
            const seg = band * (0.86 + rnd() * 0.28);
            if (mode === 'albedo') {
              const r = 201 * seg, gg = 169 * seg, b = 97 * seg;
              g.fillStyle = `rgb(${r},${gg},${b})`;
            } else if (mode === 'height') {
              const v = 120 + seg * 70 + ((y / 3) % 2) * 18;
              g.fillStyle = `rgb(${v},${v},${v})`;
            } else {
              g.fillStyle = `rgb(${165 + (1.15 - seg) * 40},${165 + (1.15 - seg) * 40},${165 + (1.15 - seg) * 40})`;
            }
            g.fillRect(x + ((y / 3) % 2) * 4, y, 8, 2.4);
          }
        }
        // vertical warp threads
        for (let x = 0; x < w; x += 16) {
          g.globalAlpha = 0.25;
          g.fillStyle = mode === 'albedo' ? '#8a713f' : (mode === 'height' ? '#6a6a6a' : 'rgb(150,150,150)');
          g.fillRect(x, 0, 1.4, h);
          g.globalAlpha = 1;
        }
        // panel seam
        g.fillStyle = mode === 'albedo' ? 'rgba(90,70,36,0.6)' : (mode === 'height' ? '#3a3a3a' : 'rgb(170,170,170)');
        g.fillRect(w - 2, 0, 2, h);
      };
      const branchMotif = (g, w, h) => {
        // faint chinoiserie branches
        g.globalAlpha = 0.08;
        g.strokeStyle = '#5c4520';
        g.lineWidth = 2.2;
        const branch = (x, y, a, len, d) => {
          if (d > 3 || len < 12) return;
          const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
          g.beginPath(); g.moveTo(x, y);
          g.quadraticCurveTo(x + Math.cos(a + 0.4) * len * 0.5, y + Math.sin(a + 0.4) * len * 0.5, x2, y2);
          g.stroke();
          for (let i = 0; i < 3; i++) {
            const t = 0.3 + i * 0.3;
            const bx = x + (x2 - x) * t, by = y + (y2 - y) * t;
            g.beginPath(); g.ellipse(bx, by, 4, 2.4, a + 1.2, 0, Math.PI * 2); g.stroke();
          }
          branch(x2, y2, a - 0.5 + rnd(), len * 0.72, d + 1);
          branch(x2, y2, a + 0.5 - rnd(), len * 0.66, d + 1);
        };
        branch(w * 0.2, h * 0.95, -1.35, 90, 0);
        branch(w * 0.75, h * 0.05, 1.75, 78, 0);
        g.globalAlpha = 1;
      };
      const set = makeSet(S, {
        albedo: (g, w, h) => { g.fillStyle = '#c1a05c'; g.fillRect(0, 0, w, h); weave(g, 'albedo', w, h); branchMotif(g, w, h); },
        height: (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); weave(g, 'height', w, h); },
        rough: (g, w, h) => { g.fillStyle = 'rgb(140,140,140)'; g.fillRect(0, 0, w, h); weave(g, 'rough', w, h); },
      }, opts, 1.0);
      set.baseRoughness = 0.55;
      return set;
    });
  }

  // ---------------------------------------------------------------- plaster
  function plaster(opts = {}) {
    return memoize(kf('plaster', opts), () => {
      const S = 512;
      const rnd = mulberry32(opts.seed ?? 1031);
      const fbm = makeNoise(1032);
      const set = makeSet(S, {
        albedo: (g, w, h) => {
          g.fillStyle = '#e6ddca'; g.fillRect(0, 0, w, h);
          const id = g.getImageData(0, 0, w, h), d = id.data;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const v = (fbm(x / 70, y / 70, 3) - 0.5) * 9 + (fbm(x / 10, y / 300, 2) - 0.5) * 5; // mottle + brush laps
            const i = (y * w + x) * 4;
            d[i] += v; d[i + 1] += v; d[i + 2] += v * 0.9;
          }
          g.putImageData(id, 0, 0);
        },
        height: (g, w, h) => {
          g.fillStyle = '#888'; g.fillRect(0, 0, w, h);
          const id = g.getImageData(0, 0, w, h), d = id.data;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const v = (fbm(x / 40, y / 40, 4) - 0.5) * 14;
            const i = (y * w + x) * 4;
            d[i] += v; d[i + 1] += v; d[i + 2] += v;
          }
          g.putImageData(id, 0, 0);
          for (let i = 0; i < 130; i++) {  // pinholes
            g.fillStyle = 'rgba(40,40,40,0.5)';
            g.beginPath(); g.arc(rnd() * w, rnd() * h, 0.8 + rnd() * 0.8, 0, 7); g.fill();
          }
        },
        rough: (g, w, h) => {
          g.fillStyle = 'rgb(142,142,142)'; g.fillRect(0, 0, w, h);
          for (let i = 0; i < 40; i++) {   // eggshell sheen patches
            g.globalAlpha = 0.12;
            g.fillStyle = 'rgb(115,115,115)';
            g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 30 + rnd() * 70, 20 + rnd() * 40, rnd() * 3, 0, 7); g.fill();
          }
          g.globalAlpha = 1;
        },
      }, opts, 0.55);
      set.baseRoughness = 0.55;
      return set;
    });
  }

  // ----------------------------------------------------------------- marble
  function marble(opts = {}) {
    const tone = opts.tone || 'white';
    return memoize(kf('marble', opts), () => {
      const S = HI ? 1024 : 512;
      const rnd = mulberry32(opts.seed ?? (1041 + tone.length));
      const fbm = makeNoise(1042 + tone.length);
      const vein = (g, col, n, wmin, wmax, alpha) => {
        for (let v = 0; v < n; v++) {
          g.globalAlpha = alpha * (0.5 + rnd() * 0.5);
          g.strokeStyle = col;
          g.lineWidth = wmin + rnd() * (wmax - wmin);
          g.beginPath();
          let x = rnd() * S, y = -20;
          g.moveTo(x, y);
          while (y < S + 20) {
            const a = fbm(x / 120, y / 120, 3) * 3 - 1.5;
            x += Math.sin(a * 2.2) * 26 + (rnd() - 0.5) * 18;
            y += 24 + rnd() * 26;
            g.lineTo(x, y);
            if (rnd() > 0.8) { // branch
              g.moveTo(x, y);
              g.lineTo(x + (rnd() - 0.5) * 90, y + rnd() * 50);
              g.moveTo(x, y);
            }
          }
          g.stroke();
        }
        g.globalAlpha = 1;
      };
      if (tone === 'travertine') {
        const set = makeSet(S, {
          albedo: (g, w, h) => {
            g.fillStyle = '#cbbd9f'; g.fillRect(0, 0, w, h);
            for (let y = 0; y < h; y += 3) { // sediment bands
              const v = (fbm(0.3, y / 60, 4) - 0.5) * 30;
              g.fillStyle = `rgba(${170 + v},${152 + v},${118 + v * 0.8},0.5)`;
              g.fillRect(0, y, w, 3);
            }
            for (let i = 0; i < 500; i++) {
              g.fillStyle = 'rgba(120,104,74,0.35)';
              g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 1 + rnd() * 3.5, 0.7 + rnd() * 1.6, 0, 0, 7); g.fill();
            }
          },
          height: (g, w, h) => {
            g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
            for (let i = 0; i < 520; i++) {  // pits
              g.fillStyle = `rgba(30,30,30,${0.3 + rnd() * 0.5})`;
              g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 1 + rnd() * 4, 0.7 + rnd() * 2, 0, 0, 7); g.fill();
            }
          },
          rough: (g, w, h) => { g.fillStyle = 'rgb(115,115,115)'; g.fillRect(0, 0, w, h); },
        }, opts, 1.1);
        set.baseRoughness = 0.45;
        return set;
      }
      const dark = tone === 'nero';
      const set = makeSet(S, {
        albedo: (g, w, h) => {
          g.fillStyle = dark ? '#15161a' : '#e9e6df'; g.fillRect(0, 0, w, h);
          const id = g.getImageData(0, 0, w, h), d = id.data;
          for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
            const v = (fbm(x / 200, y / 200, 3) - 0.5) * (dark ? 8 : 12);
            const i = (y * w + x) * 4;
            d[i] += v; d[i + 1] += v; d[i + 2] += v;
          }
          g.putImageData(id, 0, 0);
          if (dark) { vein(g, '#cfd3d9', 7, 0.8, 2.6, 0.8); vein(g, '#8f959e', 10, 0.5, 1.2, 0.5); }
          else { vein(g, '#8e8a85', 6, 1.2, 3.4, 0.65); vein(g, '#b8a06c', 4, 0.6, 1.4, 0.4); }
        },
        height: (g, w, h) => { g.fillStyle = '#909090'; g.fillRect(0, 0, w, h); vein(g, '#7c7c7c', 6, 1, 3, 0.5); },
        rough: (g, w, h) => {
          g.fillStyle = 'rgb(46,46,46)'; g.fillRect(0, 0, w, h);
          vein(g, 'rgb(75,75,75)', 8, 1, 3, 0.6);
        },
      }, opts, 0.5);
      set.baseRoughness = 0.18;
      return set;
    });
  }

  // ---------------------------------------------------------------- leather
  function leather(opts = {}) {
    return memoize(kf('leather', opts), () => {
      const S = 512;
      const rnd = mulberry32(opts.seed ?? 1051);
      const fbm = makeNoise(1052);
      // voronoi-ish pebble grain via jittered points
      const pts = [];
      const grid = 42;
      for (let gy = 0; gy < grid; gy++) for (let gx = 0; gx < grid; gx++) {
        pts.push([(gx + rnd()) * S / grid, (gy + rnd()) * S / grid]);
      }
      const set = makeSet(S, {
        albedo: (g, w, h) => {
          g.fillStyle = '#5e1c20'; g.fillRect(0, 0, w, h);
          for (const [x, y] of pts) {
            const r = 4 + rnd() * 5;
            const light = 0.85 + fbm(x / 100, y / 100, 3) * 0.5;
            g.fillStyle = `rgba(${125 * light},${44 * light},${46 * light},0.55)`;
            g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
          }
          const id = g.getImageData(0, 0, w, h), d = id.data;
          for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
            const v = (fbm(x / 160, y / 160, 3) - 0.5) * 22;   // worn patches
            const i = (y * w + x) * 4;
            d[i] += v; d[i + 1] += v * 0.5; d[i + 2] += v * 0.5;
          }
          g.putImageData(id, 0, 0);
        },
        height: (g, w, h) => {
          g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h);
          for (const [x, y] of pts) {
            const r = 4 + rnd() * 5;
            const gr = g.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, '#b4b4b4'); gr.addColorStop(1, '#5a5a5a');
            g.fillStyle = gr;
            g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
          }
        },
        rough: (g, w, h) => {
          g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
          for (const [x, y] of pts) {   // polished grain peaks
            g.fillStyle = 'rgba(150,150,150,0.5)';
            g.beginPath(); g.arc(x, y, 2.4 + rnd() * 2, 0, 7); g.fill();
          }
        },
      }, opts, 1.3);
      set.baseRoughness = 0.5;
      return set;
    });
  }

  // ----------------------------------------------------------------- velvet
  function velvet(opts = {}) {
    return memoize(kf('velvet', opts), () => {
      const S = 256;
      const fbm = makeNoise(1062);
      const set = makeSet(S, {
        albedo: (g, w, h) => {
          g.fillStyle = '#69202a'; g.fillRect(0, 0, w, h);
          const id = g.getImageData(0, 0, w, h), d = id.data;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const v = (fbm(x / 30, y / 90, 3) - 0.5) * 18;
            const i = (y * w + x) * 4;
            d[i] += v; d[i + 1] += v * 0.35; d[i + 2] += v * 0.45;
          }
          g.putImageData(id, 0, 0);
        },
        height: (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); },
        rough: (g, w, h) => {
          g.fillStyle = 'rgb(215,215,215)'; g.fillRect(0, 0, w, h);
          for (let y = 0; y < h; y += 2) {   // directional sheen bands
            const v = 195 + (fbm(0.4, y / 60, 3) - 0.5) * 70;
            g.fillStyle = `rgba(${v},${v},${v},0.6)`;
            g.fillRect(0, y, w, 2);
          }
        },
      }, opts, 0.4);
      set.baseRoughness = 0.85;
      set.sheenTint = 0xd88a94;
      return set;
    });
  }

  // ----------------------------------------------------------------- damask
  function damask(opts = {}) {
    return memoize(kf('damask', opts), () => {
      const S = 512;
      const fbm = makeNoise(1072);
      const motif = (g, w, h, fill) => {
        g.save();
        g.translate(w / 2, h / 2);
        g.fillStyle = fill;
        const petal = (a, len, wd) => {
          g.save(); g.rotate(a);
          g.beginPath();
          g.moveTo(0, 0);
          g.bezierCurveTo(wd, -len * 0.35, wd, -len * 0.75, 0, -len);
          g.bezierCurveTo(-wd, -len * 0.75, -wd, -len * 0.35, 0, 0);
          g.fill();
          g.restore();
        };
        for (let i = 0; i < 8; i++) petal((i / 8) * Math.PI * 2, h * 0.30, w * 0.06);
        for (let i = 0; i < 8; i++) petal((i / 8) * Math.PI * 2 + Math.PI / 8, h * 0.19, w * 0.045);
        g.beginPath(); g.arc(0, 0, w * 0.05, 0, 7); g.fill();
        // corner quarter medallions
        g.restore();
        for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
          g.save(); g.translate(cx, cy);
          g.fillStyle = fill;
          for (let i = 0; i < 8; i++) petal((i / 8) * Math.PI * 2, h * 0.16, w * 0.03);
          g.restore();
        }
      };
      const set = makeSet(S, {
        albedo: (g, w, h) => {
          g.fillStyle = '#b08434'; g.fillRect(0, 0, w, h);
          const id = g.getImageData(0, 0, w, h), d = id.data;
          for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
            const v = (fbm(x / 60, y / 18, 2) - 0.5) * 14;   // satin slub
            const i = (y * w + x) * 4;
            d[i] += v; d[i + 1] += v * 0.8; d[i + 2] += v * 0.5;
          }
          g.putImageData(id, 0, 0);
          motif(g, w, h, 'rgba(140,100,38,0.45)');
        },
        height: (g, w, h) => { g.fillStyle = '#828282'; g.fillRect(0, 0, w, h); motif(g, w, h, '#6e6e6e'); },
        rough: (g, w, h) => { g.fillStyle = 'rgb(105,105,105)'; g.fillRect(0, 0, w, h); motif(g, w, h, 'rgb(175,175,175)'); },
      }, opts, 0.7);
      set.baseRoughness = 0.4;
      return set;
    });
  }

  // -------------------------------------------------------------------- rug
  function rug(opts = {}) {
    return memoize(kf('rug', opts), () => {
      const W = HI ? 1024 : 512, H = Math.round(W * 1.5);
      const rnd = mulberry32(opts.seed ?? 1081);
      const fbm = makeNoise(1082);
      const FIELD = '#7c2128', FIELD2 = '#8d2a30', BORDER = '#2c3350', BORDER2 = '#3a4468',
            IVORY = 'rgba(214,199,166,0.8)', GOLD = '#a8853e';
      const albedoC = makeCanvas([W, H], (g, w, h) => {
        // field
        g.fillStyle = FIELD; g.fillRect(0, 0, w, h);
        // fine field diaper pattern
        for (let y = 0; y < h; y += 26) for (let x = 0; x < w; x += 26) {
          g.fillStyle = ((x + y) / 26) % 2 ? FIELD2 : FIELD;
          g.fillRect(x, y, 26, 26);
          g.fillStyle = 'rgba(224,211,180,0.05)';
          g.beginPath(); g.arc(x + 13, y + 13, 1.4, 0, 7); g.fill();
        }
        const bw = w * 0.085;   // border band width
        // outer guard band
        g.fillStyle = BORDER;
        g.fillRect(0, 0, w, bw * 1.6); g.fillRect(0, h - bw * 1.6, w, bw * 1.6);
        g.fillRect(0, 0, bw * 1.6, h); g.fillRect(w - bw * 1.6, 0, bw * 1.6, h);
        g.fillStyle = GOLD;
        const inset = bw * 1.6;
        g.fillRect(inset, inset, w - inset * 2, 6); g.fillRect(inset, h - inset - 6, w - inset * 2, 6);
        g.fillRect(inset, inset, 6, h - inset * 2); g.fillRect(w - inset - 6, inset, 6, h - inset * 2);
        // border guls
        const gul = (x, y, s, col) => {
          g.save(); g.translate(x, y); g.fillStyle = col;
          g.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const r = i % 2 ? s * 0.5 : s;
            g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
          }
          g.closePath(); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath(); g.arc(0, 0, s * 0.3, 0, 7); g.fill();
          g.restore();
        };
        const step = w / 11;
        for (let x = step / 2; x < w; x += step) {
          gul(x, bw * 0.8, bw * 0.34, IVORY);
          gul(x, h - bw * 0.8, bw * 0.34, IVORY);
        }
        for (let y = step / 2; y < h; y += step) {
          gul(bw * 0.8, y, bw * 0.34, IVORY);
          gul(w - bw * 0.8, y, bw * 0.34, IVORY);
        }
        // central medallion
        const cx = w / 2, cy = h / 2;
        const lobes = 16;
        for (const [rad, col] of [[w * 0.30, IVORY], [w * 0.26, BORDER2], [w * 0.20, IVORY], [w * 0.13, FIELD2]]) {
          g.fillStyle = col;
          g.beginPath();
          for (let i = 0; i <= lobes * 8; i++) {
            const a = (i / (lobes * 8)) * Math.PI * 2;
            const r = rad * (1 + 0.07 * Math.sin(a * lobes));
            const px = cx + Math.cos(a) * r * 0.72, py = cy + Math.sin(a) * r;
            i ? g.lineTo(px, py) : g.moveTo(px, py);
          }
          g.closePath(); g.fill();
        }
        gul(cx, cy, w * 0.055, GOLD);
        // pendant finials
        for (const dy of [-1, 1]) {
          g.strokeStyle = IVORY; g.lineWidth = 5;
          g.beginPath(); g.moveTo(cx, cy + dy * h * 0.30); g.lineTo(cx, cy + dy * h * 0.345); g.stroke();
          gul(cx, cy + dy * h * 0.36, w * 0.035, IVORY);
        }
        // corner spandrels
        for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          g.save();
          g.translate(sx * w, sy * h);
          g.scale(sx ? -1 : 1, sy ? -1 : 1);
          g.fillStyle = IVORY;
          g.beginPath();
          g.moveTo(inset + 8, inset + 8);
          g.quadraticCurveTo(w * 0.30, inset + 8, inset + 8, h * 0.22);
          g.closePath(); g.fill();
          g.fillStyle = BORDER2;
          g.beginPath();
          g.moveTo(inset + 8, inset + 8);
          g.quadraticCurveTo(w * 0.22, inset + 8, inset + 8, h * 0.16);
          g.closePath(); g.fill();
          g.restore();
        }
        // pile mottle + slight abrash bands
        const id = g.getImageData(0, 0, w, h), d = id.data;
        for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
          const v = (fbm(x / 60, y / 60, 3) - 0.5) * 16 + (fbm(0.1, y / 130, 2) - 0.5) * 10;
          const i = (y * w + x) * 4;
          d[i] += v; d[i + 1] += v; d[i + 2] += v;
        }
        g.putImageData(id, 0, 0);
        // fringe strips
        for (const [fy, dir] of [[0, 1], [h, -1]]) {
          g.fillStyle = '#cfc4a6';
          for (let x = 0; x < w; x += 5) {
            g.fillRect(x + rnd() * 2, fy - (dir < 0 ? 14 : 0), 2.2, 14);
          }
        }
      });
      const heightC = makeCanvas([W, H], (g, w, h) => {
        g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 5000; i++) {
          const v = 100 + rnd() * 90;
          g.fillStyle = `rgba(${v},${v},${v},0.5)`;
          g.fillRect(rnd() * w, rnd() * h, 2.5, 2.5);
        }
      });
      const roughC = makeCanvas([W, H], (g, w, h) => { g.fillStyle = 'rgb(232,232,232)'; g.fillRect(0, 0, w, h); });
      const set = {
        map: tx(albedoC, { srgb: true }),
        normalMap: tx(normalFromHeight(heightC, 1.1)),
        roughnessMap: tx(roughC),
        normalScale: 0.8,
        baseRoughness: 0.92,
      };
      return set;
    });
  }

  // ------------------------------------------------------------ brass/bronze
  function metalSet(name, seed, base, streak, tarnish, roughBase, roughStreak) {
    const S = 256;
    const rnd = mulberry32(seed);
    const fbm = makeNoise(seed + 1);
    return makeSetMetal();
    function makeSetMetal() {
      const set = makeSet(S, {
        albedo: (g, w, h) => {
          g.fillStyle = base; g.fillRect(0, 0, w, h);
          for (let y = 0; y < h; y++) {   // brush lines
            g.globalAlpha = 0.05 + rnd() * 0.08;
            g.fillStyle = rnd() > 0.5 ? streak : base;
            g.fillRect(0, y, w, 1);
          }
          g.globalAlpha = 1;
          for (let i = 0; i < 26; i++) {   // tarnish blotches
            g.globalAlpha = 0.05 + rnd() * 0.07;
            g.fillStyle = tarnish;
            g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 8 + rnd() * 26, 5 + rnd() * 14, rnd() * 3, 0, 7); g.fill();
          }
          g.globalAlpha = 1;
        },
        height: (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); },
        rough: (g, w, h) => {
          g.fillStyle = `rgb(${roughBase},${roughBase},${roughBase})`; g.fillRect(0, 0, w, h);
          for (let y = 0; y < h; y += 1) {
            g.globalAlpha = 0.35;
            const v = roughBase + (fbm(0.3, y / 8, 2) - 0.5) * roughStreak * 2;
            g.fillStyle = `rgb(${Math.max(0, Math.min(255, v))},${Math.max(0, Math.min(255, v))},${Math.max(0, Math.min(255, v))})`;
            g.fillRect(0, y, w, 1);
          }
          g.globalAlpha = 1;
        },
      }, {}, 0.35);
      set.baseRoughness = roughBase / 255;
      return set;
    }
  }
  const brass = (opts = {}) => memoize(kf('brass', opts), () => metalSet('brass', 1091, '#c8a24a', '#e0c070', '#8a6b30', 64, 26));
  const bronze = (opts = {}) => memoize(kf('bronze', opts), () => metalSet('bronze', 1096, '#6e5432', '#8a6c42', '#43331e', 92, 30));

  // ------------------------------------------------------------------ stone
  function stone(opts = {}) {
    return memoize(kf('stone', opts), () => {
      const S = 512;
      const rnd = mulberry32(opts.seed ?? 1101);
      const fbm = makeNoise(1102);
      const set = makeSet(S, {
        albedo: (g, w, h) => {
          g.fillStyle = '#c4b89e'; g.fillRect(0, 0, w, h);
          const id = g.getImageData(0, 0, w, h), d = id.data;
          for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
            const v = (fbm(x / 80, y / 80, 4) - 0.5) * 26;
            const i = (y * w + x) * 4;
            d[i] += v; d[i + 1] += v; d[i + 2] += v * 0.9;
          }
          g.putImageData(id, 0, 0);
          for (let i = 0; i < 24; i++) {   // tool marks
            g.globalAlpha = 0.08;
            g.strokeStyle = '#8a7d62';
            g.lineWidth = 1.5;
            const x0 = rnd() * w, y0 = rnd() * h, a = (rnd() - 0.5) * 0.6;
            g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * 90, y0 + Math.sin(a) * 90); g.stroke();
          }
          g.globalAlpha = 1;
          if (opts.joints) {
            g.strokeStyle = 'rgba(90,80,60,0.8)'; g.lineWidth = 5;
            g.strokeRect(0, 0, w, h / 2); g.strokeRect(0, h / 2, w, h / 2);
          }
        },
        height: (g, w, h) => {
          g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
          const id = g.getImageData(0, 0, w, h), d = id.data;
          for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
            const v = (fbm(x / 50, y / 50, 4) - 0.5) * 30;
            const i = (y * w + x) * 4;
            d[i] += v; d[i + 1] += v; d[i + 2] += v;
          }
          g.putImageData(id, 0, 0);
          if (opts.joints) {
            g.strokeStyle = '#2c2c2c'; g.lineWidth = 6;
            g.strokeRect(0, 0, w, h / 2); g.strokeRect(0, h / 2, w, h / 2);
          }
        },
        rough: (g, w, h) => { g.fillStyle = 'rgb(178,178,178)'; g.fillRect(0, 0, w, h); },
      }, opts, 1.3);
      set.baseRoughness = 0.7;
      return set;
    });
  }

  // -------------------------------------------------------- travertine paver
  function travertinePaver(opts = {}) {
    return memoize(kf('paver', opts), () => {
      const S = HI ? 1024 : 512;
      const rnd = mulberry32(opts.seed ?? 1111);
      const fbm = makeNoise(1112);
      const tiles = 2;                      // 2×2 pavers per tile
      const tw2 = S / tiles;
      const set = makeSet(S, {
        albedo: (g, w, h) => {
          for (let ty = 0; ty < tiles; ty++) for (let txx = 0; txx < tiles; txx++) {
            const tint = 0.92 + rnd() * 0.16;
            g.fillStyle = `rgb(${203 * tint},${190 * tint},${162 * tint})`;
            g.fillRect(txx * tw2, ty * tw2, tw2, tw2);
            for (let y = 0; y < tw2; y += 3) {  // banding per paver
              const v = (fbm(txx * 3 + 0.3, (ty * tw2 + y) / 46, 3) - 0.5) * 22;
              g.fillStyle = `rgba(${186 + v},${172 + v},${142 + v},0.5)`;
              g.fillRect(txx * tw2, ty * tw2 + y, tw2, 3);
            }
            for (let i = 0; i < 90; i++) {
              g.fillStyle = 'rgba(140,124,94,0.3)';
              g.beginPath(); g.ellipse(txx * tw2 + rnd() * tw2, ty * tw2 + rnd() * tw2, 1 + rnd() * 3, 0.6 + rnd() * 1.4, 0, 0, 7); g.fill();
            }
          }
          g.strokeStyle = 'rgba(96,86,66,0.9)'; g.lineWidth = 4;
          for (let i = 0; i <= tiles; i++) {
            g.beginPath(); g.moveTo(i * tw2, 0); g.lineTo(i * tw2, h); g.stroke();
            g.beginPath(); g.moveTo(0, i * tw2); g.lineTo(w, i * tw2); g.stroke();
          }
        },
        height: (g, w, h) => {
          g.fillStyle = '#8e8e8e'; g.fillRect(0, 0, w, h);
          for (let i = 0; i < 420; i++) {
            g.fillStyle = `rgba(40,40,40,${0.25 + rnd() * 0.4})`;
            g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 1 + rnd() * 3.5, 0.6 + rnd() * 1.8, 0, 0, 7); g.fill();
          }
          g.strokeStyle = '#1e1e1e'; g.lineWidth = 5;
          for (let i = 0; i <= tiles; i++) {
            g.beginPath(); g.moveTo(i * tw2, 0); g.lineTo(i * tw2, h); g.stroke();
            g.beginPath(); g.moveTo(0, i * tw2); g.lineTo(w, i * tw2); g.stroke();
          }
        },
        rough: (g, w, h) => { g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, w, h); },
      }, opts, 1.2);
      set.baseRoughness = 0.58;
      return set;
    });
  }

  // ----------------------------------------------------------------- gravel
  function gravel(opts = {}) {
    return memoize(kf('gravel', opts), () => {
      const S = 512;
      const rnd = mulberry32(opts.seed ?? 1121);
      const pebbles = [];
      for (let i = 0; i < 520; i++) {
        pebbles.push({ x: rnd() * S, y: rnd() * S, rx: 3 + rnd() * 7, ry: 2.4 + rnd() * 5, a: rnd() * 3, v: 0.55 + rnd() * 0.6 });
      }
      const set = makeSet(S, {
        albedo: (g, w, h) => {
          g.fillStyle = '#6b6156'; g.fillRect(0, 0, w, h);
          for (const p of pebbles) {
            const warm = rnd() > 0.5;
            g.fillStyle = warm ? `rgb(${150 * p.v},${138 * p.v},${118 * p.v})` : `rgb(${128 * p.v},${126 * p.v},${122 * p.v})`;
            g.beginPath(); g.ellipse(p.x, p.y, p.rx, p.ry, p.a, 0, 7); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.10)';
            g.beginPath(); g.ellipse(p.x - p.rx * 0.25, p.y - p.ry * 0.3, p.rx * 0.5, p.ry * 0.4, p.a, 0, 7); g.fill();
          }
        },
        height: (g, w, h) => {
          g.fillStyle = '#5c5c5c'; g.fillRect(0, 0, w, h);
          for (const p of pebbles) {
            const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(p.rx, p.ry));
            gr.addColorStop(0, `rgb(${140 + p.v * 80},${140 + p.v * 80},${140 + p.v * 80})`);
            gr.addColorStop(1, '#3c3c3c');
            g.fillStyle = gr;
            g.beginPath(); g.ellipse(p.x, p.y, p.rx, p.ry, p.a, 0, 7); g.fill();
          }
        },
        rough: (g, w, h) => { g.fillStyle = 'rgb(218,218,218)'; g.fillRect(0, 0, w, h); },
      }, opts, 1.8);
      set.baseRoughness = 0.85;
      return set;
    });
  }

  // ------------------------------------------------------------------ paper
  function paper(opts = {}) {
    return memoize(kf('paper', opts), () => {
      const S = 256;
      const fbm = makeNoise(1132);
      const set = makeSet(S, {
        albedo: (g, w, h) => {
          g.fillStyle = '#efe7d6'; g.fillRect(0, 0, w, h);
          const id = g.getImageData(0, 0, w, h), d = id.data;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const v = (fbm(x / 16, y / 16, 3) - 0.5) * 7;
            const i = (y * w + x) * 4;
            d[i] += v; d[i + 1] += v; d[i + 2] += v;
          }
          g.putImageData(id, 0, 0);
        },
        height: (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); },
        rough: (g, w, h) => { g.fillStyle = 'rgb(205,205,205)'; g.fillRect(0, 0, w, h); },
      }, opts, 0.3);
      set.baseRoughness = 0.8;
      return set;
    });
  }

  return {
    makeCanvas,
    normalFromHeight: (canvas, strength) => tx(normalFromHeight(canvas, strength)),
    std, phys,
    herringbone, plank, grasscloth, plaster, marble, leather, velvet, damask,
    rug, brass, bronze, stone, travertinePaver, gravel, paper,
  };
}
