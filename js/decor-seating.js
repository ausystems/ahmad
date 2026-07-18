// decor-seating.js — persian rug, tufted chesterfield, wingbacks, marble
// coffee table with props, floor lamp, side table, plants. Seed 7000.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RUG_RECT, mulberry32 } from './config.js';

export function createDecorSeating(ctx) {
  const { tex } = ctx;
  const rnd = mulberry32(7001);
  const group = new THREE.Group();
  group.name = 'decor-seating';

  const cx = (RUG_RECT.minX + RUG_RECT.maxX) / 2;   // ≈ -4.4
  const cz = (RUG_RECT.minZ + RUG_RECT.maxZ) / 2;   // 0

  const mLeather = tex.std(tex.leather({ repeat: [2.2, 2.2] }), { roughness: 0.85, envMapIntensity: 0.6 });
  mLeather.normalScale.set(0.6, 0.6);
  const mLeatherDark = tex.std(tex.leather({ repeat: [3, 3] }), { color: 0xb08a8e, roughness: 0.55 });
  const mVelvet = tex.std(tex.velvet({ repeat: [2.5, 2.5] }), { roughness: 0.9 });
  const mWalnut = tex.std(tex.plank({ repeat: [0.8, 0.8] }), { color: 0x64452c, roughness: 0.45 });
  const mBrass = tex.std(tex.brass(), { metalness: 1, roughness: 0.3, envMapIntensity: 1.4 });
  const mNero = tex.std(tex.marble({ tone: 'nero' }), { roughness: 0.15, envMapIntensity: 1.4 });

  const collider = (x1, y1, z1, x2, y2, z2) => ctx.colliders.push({
    min: { x: Math.min(x1, x2), y: Math.min(y1, y2), z: Math.min(z1, z2) },
    max: { x: Math.max(x1, x2), y: Math.max(y1, y2), z: Math.max(z1, z2) },
  });

  // ---------------------------------------------------------------- rug
  {
    const set = tex.rug();
    const mRug = tex.std(set, { roughness: 0.95 });
    const rug = new THREE.Mesh(new RoundedBoxGeometry(3.6, 0.024, 5.2, 2, 0.01), mRug);
    rug.position.set(cx, 0.012, cz);
    rug.rotation.y = Math.PI / 2;   // long axis along x (rug texture is 2:3)
    rug.receiveShadow = true;
    // corner curl
    const pos = rug.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.hypot(x - 1.7, z - 2.45);
      if (d < 0.5) pos.setY(i, pos.getY(i) + (0.5 - d) * 0.1);
    }
    rug.geometry.computeVertexNormals();
    group.add(rug);
  }

  // ------------------------------------------------- tufting helper
  // displaces a grid of button dimples + diamond crease shading into a geometry
  function tuft(geo, rows, cols, depth, faceAxis = 'z') {
    const pos = geo.attributes.position;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const ax = faceAxis === 'z' ? 'x' : 'z';
    const w = bb.max[ax] - bb.min[ax], h = bb.max.y - bb.min.y;
    for (let i = 0; i < pos.count; i++) {
      const u = ((faceAxis === 'z' ? pos.getX(i) : pos.getZ(i)) - bb.min[ax]) / w;
      const v = (pos.getY(i) - bb.min.y) / h;
      // only the front face bulges
      const fz = faceAxis === 'z' ? pos.getZ(i) : pos.getX(i);
      const front = faceAxis === 'z' ? (fz > (bb.max.z - 0.02)) : (fz > (bb.max.x - 0.02));
      if (!front) continue;
      let d = 0;
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          const bu = (c + (r % 2) * 0.5) / cols, bv = (r + 0.5) / (rows + 1);
          if (bu > 1) continue;
          const dist = Math.hypot((u - bu) * cols * 0.9, (v - bv) * (rows + 1));
          d = Math.max(d, Math.max(0, 1 - dist) ** 1.6);
        }
      }
      const puff = Math.sin(u * Math.PI * cols * 2) * Math.sin(v * Math.PI * (rows + 1)) * 0.15;
      const off = -d * depth + Math.abs(puff) * depth * 0.25;
      if (faceAxis === 'z') pos.setZ(i, pos.getZ(i) + off);
      else pos.setX(i, pos.getX(i) + off);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function nailheads(parent, x0, x1, y, z, n) {
    const geo = new THREE.SphereGeometry(0.0085, 6, 5);
    const inst = new THREE.InstancedMesh(geo, mBrass, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.setPosition(x0 + ((x1 - x0) * i) / (n - 1), y, z);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    parent.add(inst);
  }

  // ---------------------------------------------------------------- chesterfield
  {
    const sofa = new THREE.Group();
    sofa.position.set(cx + 1.1, 0, cz);
    sofa.rotation.y = -Math.PI / 2;    // faces -x → the TV wall
    group.add(sofa);
    const W = 2.3, D = 0.95;

    // base frame + seat deck
    const base = new THREE.Mesh(new RoundedBoxGeometry(W, 0.24, D, 3, 0.04), mLeather);
    base.position.y = 0.22;
    base.castShadow = true;
    sofa.add(base);
    // seat cushions ×3, visibly compressed
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new RoundedBoxGeometry(W / 3 - 0.03, 0.17, D - 0.24, 4, 0.05), mLeather);
      c.position.set(-W / 3 + i * (W / 3), 0.41, 0.05);
      c.scale.y = 0.92 - (i === 1 ? 0.06 : 0);       // middle sat-in
      c.castShadow = true;
      sofa.add(c);
    }
    // tufted back
    const backGeo = tuft(new RoundedBoxGeometry(W, 0.62, 0.2, 12, 0.05), 2, 7, 0.028, 'z');
    const back = new THREE.Mesh(backGeo, mLeather);
    back.position.set(0, 0.72, -D / 2 + 0.1);
    back.castShadow = true;
    sofa.add(back);
    // rolled arms — tufted quarter-cylinders
    for (const side of [-1, 1]) {
      const armGeo = tuft(new RoundedBoxGeometry(0.24, 0.5, D, 10, 0.06), 1, 3, 0.02, 'x');
      const arm = new THREE.Mesh(armGeo, mLeather);
      arm.position.set(side * (W / 2 + 0.1), 0.5, 0);
      arm.castShadow = true;
      sofa.add(arm);
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, D - 0.06, 12), mLeather);
      roll.rotation.x = Math.PI / 2;
      roll.position.set(side * (W / 2 + 0.1), 0.76, 0);
      roll.castShadow = true;
      sofa.add(roll);
      nailheads(sofa, side * (W / 2 + 0.02), side * (W / 2 + 0.2), 0.62, D / 2 - 0.015, 9);
    }
    // nailhead rows along the front base
    nailheads(sofa, -W / 2 + 0.05, W / 2 - 0.05, 0.32, D / 2 + 0.002, 42);
    // bun feet
    for (const [fx, fz] of [[-W / 2 + 0.12, D / 2 - 0.1], [W / 2 - 0.12, D / 2 - 0.1], [-W / 2 + 0.12, -D / 2 + 0.1], [W / 2 - 0.12, -D / 2 + 0.1]]) {
      const foot = new THREE.Mesh(new THREE.LatheGeometry(
        [[0, 0], [0.05, 0.005], [0.058, 0.05], [0.04, 0.09], [0, 0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 10), mWalnut);
      foot.position.set(fx, 0, fz);
      sofa.add(foot);
    }
    // velvet lumbar pillows with piping
    for (const [px, lean] of [[-0.7, 0.12], [0.75, -0.2]]) {
      const pGeo = new RoundedBoxGeometry(0.46, 0.34, 0.13, 6, 0.05);
      const pp = pGeo.attributes.position;
      for (let i = 0; i < pp.count; i++) {      // center pinch
        const u = pp.getX(i) / 0.23, v = pp.getY(i) / 0.17;
        pp.setZ(i, pp.getZ(i) * (1 - 0.28 * Math.exp(-(u * u + v * v) * 1.6)));
      }
      pGeo.computeVertexNormals();
      const pillow = new THREE.Mesh(pGeo, mVelvet);
      pillow.position.set(px, 0.62, -D / 2 + 0.28);
      pillow.rotation.set(-0.28, lean, lean * 0.4);
      pillow.castShadow = true;
      sofa.add(pillow);
      const pipe = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.008, 6, 24), mVelvet);
      pipe.scale.set(0.88, 0.65, 1);
      pipe.position.copy(pillow.position);
      pipe.rotation.copy(pillow.rotation);
      sofa.add(pipe);
    }
    collider(cx + 1.1 - 0.55, 0, cz - 1.25, cx + 1.1 + 0.55, 0.95, cz + 1.25);
  }

  // ---------------------------------------------------------------- wingbacks
  for (const [wz, ang] of [[-1.55, 0.5], [1.55, -0.5]]) {
    const chair = new THREE.Group();
    chair.position.set(cx - 0.4, 0, cz + wz);
    chair.rotation.y = -Math.PI / 2 + ang;
    group.add(chair);
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.16, 0.6, 4, 0.05), mVelvet);
    seat.position.y = 0.44;
    seat.scale.y = 0.9;
    seat.castShadow = true;
    chair.add(seat);
    const base2 = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.22, 0.6, 3, 0.04), mVelvet);
    base2.position.y = 0.28;
    chair.add(base2);
    // barrel back + wings via lathe segment
    const backProf = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      backProf.push(new THREE.Vector2(0.34 - t * 0.03, 0.5 + t * 0.62));
    }
    const backM = new THREE.Mesh(new THREE.LatheGeometry(backProf, 14, Math.PI * 0.78, Math.PI * 1.44), mVelvet);
    backM.position.set(0, 0, 0.05);
    backM.rotation.y = -Math.PI / 2 - Math.PI * 0.22;
    backM.castShadow = true;
    chair.add(backM);
    // seat cushion crown
    const crown = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.1, 0.54, 4, 0.045), mVelvet);
    crown.position.y = 0.52;
    crown.castShadow = true;
    chair.add(crown);
    // cabriole front legs + straight rear
    for (const [lx, lz, front] of [[-0.24, -0.24, true], [0.24, -0.24, true], [-0.24, 0.24, false], [0.24, 0.24, false]]) {
      if (front) {
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          pts.push(new THREE.Vector3(lx + Math.sin(t * Math.PI) * 0.045 * (lx > 0 ? 1 : -1), 0.28 * (1 - t), lz - Math.sin(t * Math.PI * 0.5) * 0.05));
        }
        const leg = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.022, 8), mWalnut);
        leg.castShadow = true;
        chair.add(leg);
      } else {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.28, 8), mWalnut);
        leg.position.set(lx, 0.14, lz);
        chair.add(leg);
      }
    }
    // one chair gets a folded cream throw over the arm
    if (wz > 0) {
      const throwGeo = new THREE.PlaneGeometry(0.42, 0.6, 16, 16);
      const tp = throwGeo.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const x = tp.getX(i), y = tp.getY(i);
        tp.setZ(i, Math.sin(x * 18) * 0.014 + Math.sin(y * 9) * 0.02);
      }
      throwGeo.computeVertexNormals();
      const mThrow = tex.std(null, { color: 0xe8dfc8, roughness: 0.85, side: THREE.DoubleSide });
      const thr = new THREE.Mesh(throwGeo, mThrow);
      thr.position.set(0.3, 0.72, 0);
      thr.rotation.set(Math.PI / 2 - 0.35, 0.1, 0.5);
      thr.castShadow = true;
      chair.add(thr);
    }
    collider(cx - 0.4 - 0.45, 0, cz + wz - 0.45, cx - 0.4 + 0.45, 1.15, cz + wz + 0.45);
  }

  // ---------------------------------------------------------------- coffee table
  {
    const t = new THREE.Group();
    t.position.set(cx - 0.35, 0, cz);
    group.add(t);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.035, 36), mNero);
    top.position.y = 0.42;
    top.castShadow = true;
    t.add(top);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.012, 8, 40), mNero);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.435;
    t.add(edge);
    // fluted pedestal
    const flutes = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.38, 8), mWalnut);
      f.position.set(Math.cos(a) * 0.1, 0.21, Math.sin(a) * 0.1);
      flutes.add(f);
    }
    t.add(flutes);
    const footD = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.05, 24), mWalnut);
    footD.position.y = 0.025;
    t.add(footD);

    // silver tray
    const mSilver = tex.std(null, { color: 0xd8d8dc, metalness: 1, roughness: 0.15, envMapIntensity: 1.6 });
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.02, 28), mSilver);
    tray.position.set(-0.12, 0.45, 0.1);
    t.add(tray);
    // champagne bucket + bottle
    const bucket = new THREE.Mesh(new THREE.LatheGeometry(
      [[0.001, 0], [0.09, 0.01], [0.11, 0.1], [0.1, 0.18], [0.115, 0.2]].map(([r, y]) => new THREE.Vector2(r, y)), 18), mBrass);
    bucket.position.set(-0.12, 0.455, 0.1);
    bucket.castShadow = true;
    t.add(bucket);
    const mIce = new THREE.MeshPhysicalMaterial({ color: 0xeef6ff, transmission: 0.7, roughness: 0.4, thickness: 0.02 });
    for (let i = 0; i < 6; i++) {
      const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 0), mIce);
      const a = rnd() * Math.PI * 2;
      ice.position.set(-0.12 + Math.cos(a) * 0.05, 0.65, 0.1 + Math.sin(a) * 0.05);
      t.add(ice);
    }
    const mBottle = new THREE.MeshPhysicalMaterial({ color: 0x12290f, transmission: 0.35, roughness: 0.1, envMapIntensity: 1.4 });
    const bottle = new THREE.Mesh(new THREE.LatheGeometry(
      [[0.001, 0], [0.045, 0.005], [0.048, 0.14], [0.03, 0.2], [0.014, 0.24], [0.014, 0.3], [0.02, 0.31]].map(([r, y]) => new THREE.Vector2(r, y)), 16), mBottle);
    bottle.position.set(-0.12, 0.5, 0.1);
    bottle.rotation.z = 0.18;
    bottle.castShadow = true;
    t.add(bottle);
    const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.05, 10), mBrass);
    foil.position.set(-0.175, 0.81, 0.1);
    foil.rotation.z = 0.18;
    t.add(foil);
    // coupe glasses
    const mGlass2 = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.95, roughness: 0.03, thickness: 0.005, envMapIntensity: 1.5 });
    for (const [gx, gz] of [[0.16, 0.28], [0.3, 0.12]]) {
      const coupe = new THREE.Mesh(new THREE.LatheGeometry(
        [[0.001, 0], [0.035, 0.003], [0.004, 0.01], [0.004, 0.09], [0.05, 0.11], [0.055, 0.15]].map(([r, y]) => new THREE.Vector2(r, y)), 14), mGlass2);
      coupe.position.set(gx, 0.44, gz);
      t.add(coupe);
    }
    // books stack
    const bookCols = [0x2e3440, 0x6d1f24, 0xc8b89a];
    const titles = ['SKYBOUND', 'TORONTO', 'PROCESS'];
    for (let i = 0; i < 3; i++) {
      const bc = tex.makeCanvas([256, 64], (g, w, h) => {
        g.fillStyle = `#${bookCols[i].toString(16).padStart(6, '0')}`;
        g.fillRect(0, 0, w, h);
        g.fillStyle = i === 2 ? '#3a3428' : '#d8c9a0';
        g.font = '600 26px Archivo, sans-serif';
        g.textAlign = 'center';
        g.fillText(titles[i], w / 2, h / 2 + 9);
      });
      const bt = new THREE.CanvasTexture(bc);
      bt.colorSpace = THREE.SRGBColorSpace;
      const mats = [
        tex.std(null, { color: 0xf2ead8, roughness: 0.8 }),           // pages x+
        new THREE.MeshStandardMaterial({ map: bt, roughness: 0.65 }), // spine x-
        new THREE.MeshStandardMaterial({ color: bookCols[i], roughness: 0.65 }),
        new THREE.MeshStandardMaterial({ color: bookCols[i], roughness: 0.65 }),
        tex.std(null, { color: 0xf2ead8, roughness: 0.8 }),
        tex.std(null, { color: 0xf2ead8, roughness: 0.8 }),
      ];
      const book = new THREE.Mesh(new RoundedBoxGeometry(0.3 - i * 0.03, 0.028, 0.22 - i * 0.02, 2, 0.006), mats);
      book.position.set(0.12, 0.455 + i * 0.029, -0.24);
      book.rotation.y = (i - 1) * 0.28;
      book.castShadow = true;
      t.add(book);
    }
    // fruit bowl + oranges
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(
      [[0.001, 0], [0.06, 0.005], [0.115, 0.05], [0.13, 0.09]].map(([r, y]) => new THREE.Vector2(r, y)), 20), mNero);
    bowl.position.set(-0.05, 0.53, -0.28);   // atop the books? no — beside
    bowl.position.set(-0.28, 0.45, -0.18);
    t.add(bowl);
    const mOrange = tex.std(null, { color: 0xd97a2a, roughness: 0.55, emissive: 0x53200a, emissiveIntensity: 0.12 });
    const mPear = tex.std(null, { color: 0xa8a04a, roughness: 0.6, emissive: 0x2c2a0e, emissiveIntensity: 0.1 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mOrange);
      o.position.set(-0.28 + Math.cos(a) * 0.055, 0.5 + (i % 2) * 0.03, -0.18 + Math.sin(a) * 0.055);
      t.add(o);
    }
    for (const [px2, pz2] of [[-0.24, -0.12], [-0.33, -0.22]]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mPear);
      p.scale.y = 1.35;
      p.position.set(px2, 0.54, pz2);
      t.add(p);
    }
    const stray = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mOrange);
    stray.position.set(0.05, 0.475, 0.16);
    t.add(stray);
    collider(cx - 0.35 - 0.58, 0, cz - 0.58, cx - 0.35 + 0.58, 0.6, cz + 0.58);
  }

  // ---------------------------------------------------------------- floor lamp
  {
    const lamp = new THREE.Group();
    lamp.position.set(cx + 1.9, 0, cz - 1.7);
    group.add(lamp);
    const mBronze = tex.std(tex.bronze(), { metalness: 1, roughness: 0.4 });
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.03, 20), mBronze);
    foot.position.y = 0.015;
    lamp.add(foot);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.5, 10), mBronze);
    stem.position.y = 0.78;
    lamp.add(stem);
    const armPts = [new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0.08, 1.62, 0.06), new THREE.Vector3(0.22, 1.66, 0.14)];
    const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(armPts), 10, 0.013, 8), mBronze);
    lamp.add(arm);
    // pleated crimson shade
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t2 = i / 10;
      pts.push(new THREE.Vector2(0.1 + t2 * 0.085 + Math.sin(t2 * 46) * 0.004, 0.3 - t2 * 0.3));
    }
    const mShade = new THREE.MeshStandardMaterial({
      color: 0x8e2430, roughness: 0.75, side: THREE.DoubleSide,
      emissive: 0xff5a3a, emissiveIntensity: 0.5,
    });
    const shade = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mShade);
    shade.position.set(0.22, 1.56, 0.14);
    shade.castShadow = true;
    lamp.add(shade);
    const pl = new THREE.PointLight(0xff9a55, 14, 7, 2);
    pl.position.set(0.22, 1.5, 0.14);
    lamp.add(pl);
    collider(cx + 1.9 - 0.2, 0, cz - 1.7 - 0.2, cx + 1.9 + 0.2, 1.8, cz - 1.7 + 0.2);
  }

  // ---------------------------------------------------------------- side table + decanter
  {
    const st = new THREE.Group();
    st.position.set(cx - 1.15, 0, cz);
    group.add(st);
    const top2 = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 24), mWalnut);
    top2.position.y = 0.55;
    top2.castShadow = true;
    st.add(top2);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 24, 1, true), mWalnut);
    skirt.position.y = 0.5;
    st.add(skirt);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.52, 8), mWalnut);
      leg.position.set(Math.cos(a) * 0.17, 0.26, Math.sin(a) * 0.17);
      leg.rotation.z = Math.cos(a) * 0.1;
      leg.rotation.x = -Math.sin(a) * 0.1;
      st.add(leg);
    }
    const mCrystal = new THREE.MeshPhysicalMaterial({ color: 0xfff8ee, transmission: 0.92, roughness: 0.05, thickness: 0.04, ior: 1.6, envMapIntensity: 1.8 });
    const dec = new THREE.Mesh(new THREE.LatheGeometry(
      [[0.001, 0], [0.055, 0.005], [0.065, 0.07], [0.04, 0.13], [0.016, 0.16], [0.016, 0.22], [0.028, 0.235]].map(([r, y]) => new THREE.Vector2(r, y)), 8), mCrystal);
    dec.position.set(-0.05, 0.57, 0.02);
    dec.castShadow = true;
    st.add(dec);
    const whisky = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.045, 8), new THREE.MeshPhysicalMaterial({ color: 0xb8641e, transmission: 0.8, roughness: 0.1 }));
    whisky.position.set(-0.05, 0.6, 0.02);
    st.add(whisky);
    const glass3 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 10, 1, true), mCrystal);
    glass3.position.set(0.12, 0.61, -0.08);
    st.add(glass3);
    collider(cx - 1.15 - 0.28, 0, cz - 0.28, cx - 1.15 + 0.28, 0.7, cz + 0.28);
  }

  // ---------------------------------------------------------------- monstera
  {
    const plant = new THREE.Group();
    plant.position.set(-7.8, 0, 4.3);
    group.add(plant);
    const mPot = tex.std(tex.brass(), { metalness: 1, roughness: 0.35 });
    const pot = new THREE.Mesh(new THREE.LatheGeometry(
      [[0.001, 0], [0.2, 0.01], [0.24, 0.2], [0.26, 0.42], [0.24, 0.44]].map(([r, y]) => new THREE.Vector2(r, y)), 20), mPot);
    pot.castShadow = true;
    plant.add(pot);
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.02, 16), tex.std(null, { color: 0x2c2018, roughness: 1 }));
    soil.position.y = 0.42;
    plant.add(soil);
    // split-leaf shape with fenestration holes
    function monsteraLeaf() {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(0.16, 0.02, 0.22, 0.14, 0.2, 0.26);
      s.bezierCurveTo(0.18, 0.38, 0.08, 0.46, 0, 0.47);
      s.bezierCurveTo(-0.08, 0.46, -0.18, 0.38, -0.2, 0.26);
      s.bezierCurveTo(-0.22, 0.14, -0.16, 0.02, 0, 0);
      // side splits
      for (const sd of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const hole = new THREE.Path();
          const hy = 0.12 + i * 0.1;
          hole.moveTo(sd * 0.06, hy);
          hole.lineTo(sd * 0.17, hy + 0.02);
          hole.lineTo(sd * 0.16, hy + 0.045);
          hole.lineTo(sd * 0.055, hy + 0.03);
          hole.closePath();
          s.holes.push(hole);
        }
      }
      const g = new THREE.ShapeGeometry(s, 6);
      return g;
    }
    const mLeaf = tex.std(null, { color: 0x2e5c28, roughness: 0.45, side: THREE.DoubleSide, emissive: 0x0a1f08, emissiveIntensity: 0.25 });
    const leaves = [];
    const nL = 11;
    for (let i = 0; i < nL; i++) {
      const a = (i / nL) * Math.PI * 2 + rnd() * 0.5;
      const lift = 0.5 + rnd() * 0.75;
      const lean = 0.5 + rnd() * 0.55;
      const stemPts = [
        new THREE.Vector3(0, 0.42, 0),
        new THREE.Vector3(Math.cos(a) * 0.18, 0.42 + lift * 0.6, Math.sin(a) * 0.18),
        new THREE.Vector3(Math.cos(a) * 0.34, 0.42 + lift, Math.sin(a) * 0.34),
      ];
      const stem = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stemPts), 8, 0.011, 6), mLeaf);
      plant.add(stem);
      const leaf = new THREE.Mesh(monsteraLeaf(), mLeaf);
      leaf.position.copy(stemPts[2]);
      leaf.rotation.set(-Math.PI / 2 + lean, a + Math.PI, 0, 'YXZ');
      leaf.scale.setScalar(0.9 + rnd() * 0.5);
      leaf.castShadow = i % 2 === 0;
      plant.add(leaf);
      leaves.push({ leaf, base: leaf.rotation.x, ph: rnd() * Math.PI * 2 });
    }
    ctx.updates.push((dt, tw) => {
      for (const L of leaves) {
        L.leaf.rotation.x = L.base + Math.sin(tw * 2 * Math.PI / 11 + L.ph) * 0.004;
      }
    });
    collider(-8.1, 0, 4.0, -7.5, 1.4, 4.6);
    // small fern by the floor lamp
    const mFern = tex.std(null, { color: 0x3a6b2e, roughness: 0.7, side: THREE.DoubleSide });
    const fern = new THREE.Group();
    fern.position.set(cx + 2.3, 0, cz - 2.2);
    group.add(fern);
    const fpot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.18, 12), tex.std(null, { color: 0x8a8578, roughness: 0.8 }));
    fpot.position.y = 0.09;
    fern.add(fpot);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.4, 1, 6), mFern);
      const fp = frond.geometry.attributes.position;
      for (let j = 0; j < fp.count; j++) {
        const y = fp.getY(j);
        fp.setZ(j, -(y + 0.2) * (y + 0.2) * 0.6);
        fp.setX(j, fp.getX(j) * (1 - Math.abs(y) * 1.6));
      }
      frond.geometry.computeVertexNormals();
      frond.position.set(Math.cos(a) * 0.04, 0.2, Math.sin(a) * 0.04);
      frond.rotation.set(0.5 + rnd() * 0.4, a, 0, 'YXZ');
      fern.add(frond);
    }
  }

  return { group };
}
