// exterior.js — terrace pavers & balustrade, villa facade + hipped tile roof,
// steps, gravel-path dressing, dock with rowboat. Seed 5000.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  ROOM, TERRACE, STEPS, DOCK, WATER_Y, groundHeight, mulberry32, TIME_WRAP,
} from './config.js';

export function createExterior(ctx) {
  const { tex } = ctx;
  const rnd = mulberry32(5001);
  const group = new THREE.Group();
  group.name = 'exterior';

  const mStone = tex.std(tex.stone(), { roughness: 0.7 });
  const mStucco = tex.std(tex.plaster({ repeat: [3, 2] }), { color: 0xe8dfc8, roughness: 0.75 });
  const mPaver = tex.std(tex.travertinePaver({ repeat: [1, 1] }), { roughness: 0.6 });
  const mPlank = tex.std(tex.plank({ repeat: [1, 1] }), { roughness: 0.78 });
  const mDarkWood = tex.std(tex.plank({ repeat: [0.5, 0.5] }), { color: 0x4a3826, roughness: 0.8 });

  const buckets = new Map();
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(),
        V = new THREE.Vector3(), S = new THREE.Vector3();
  function add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    E.set(rx, ry, rz); Q.setFromEuler(E); V.set(x, y, z); S.set(sx, sy, sz);
    M.compose(V, Q, S);
    if (!buckets.has(mat)) buckets.set(mat, []);
    // RoundedBoxGeometry is non-indexed, primitives are indexed — normalize so
    // any mix merges cleanly
    let g = geo.clone();
    if (g.index) g = g.toNonIndexed();
    buckets.get(mat).push(g.applyMatrix4(M));
    geo.dispose?.();
  }
  function flush(castShadow = true, receive = true) {
    for (const [mat, geos] of buckets) {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receive;
      group.add(mesh);
    }
    buckets.clear();
  }
  const collider = (x1, y1, z1, x2, y2, z2) => ctx.colliders.push({
    min: { x: Math.min(x1, x2), y: Math.min(y1, y2), z: Math.min(z1, z2) },
    max: { x: Math.max(x1, x2), y: Math.max(y1, y2), z: Math.max(z1, z2) },
  });

  // ---------------------------------------------------------------- terrace
  {
    const pw = 0.6, gap = 0.006;
    for (let x = TERRACE.minX; x < TERRACE.maxX - 0.01; x += pw) {
      for (let z = TERRACE.minZ; z < TERRACE.maxZ - 0.01; z += pw) {
        const dy = (rnd() - 0.5) * 0.006;
        add(new THREE.BoxGeometry(pw - gap, 0.06, pw - gap), mPaver,
          x + pw / 2, -0.032 + dy, z + pw / 2);
      }
    }
    flush(false, true);
  }

  // ---------------------------------------------------------------- balustrade
  {
    // turned baluster profile
    const prof = [
      [0.00, 0.00], [0.062, 0.00], [0.062, 0.05], [0.038, 0.08], [0.052, 0.16],
      [0.030, 0.28], [0.044, 0.42], [0.030, 0.56], [0.052, 0.66], [0.038, 0.72],
      [0.062, 0.76], [0.062, 0.80], [0.00, 0.80],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const balGeo = new THREE.LatheGeometry(prof, 12);
    const positions = [];
    const south = TERRACE.maxZ;
    for (let x = TERRACE.minX + 0.3; x <= TERRACE.maxX - 0.3; x += 0.36) {
      if (x > STEPS.minX - 0.15 && x < STEPS.maxX + 0.15) continue;  // steps gap
      positions.push([x, south - 0.15]);
    }
    for (const side of [TERRACE.minX, TERRACE.maxX]) {
      for (let z = TERRACE.minZ + 0.5; z <= TERRACE.maxZ - 0.3; z += 0.36) {
        positions.push([side + (side < 0 ? 0.15 : -0.15), z]);
      }
    }
    const inst = new THREE.InstancedMesh(balGeo, mStone, positions.length);
    const im = new THREE.Matrix4();
    positions.forEach(([x, z], i) => {
      im.makeRotationY(rnd() * Math.PI);
      im.setPosition(x, 0.1, z);
      inst.setMatrixAt(i, im);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    group.add(inst);

    // rails + piers
    const railProf = new RoundedBoxGeometry(1, 0.09, 0.24, 2, 0.03);
    const base = new RoundedBoxGeometry(1, 0.1, 0.26, 2, 0.02);
    const railRuns = [
      [TERRACE.minX + 0.15, STEPS.minX - 0.15, south - 0.15, 'x'],
      [STEPS.maxX + 0.15, TERRACE.maxX - 0.15, south - 0.15, 'x'],
      [TERRACE.minZ + 0.35, TERRACE.maxZ - 0.15, TERRACE.minX + 0.15, 'z'],
      [TERRACE.minZ + 0.35, TERRACE.maxZ - 0.15, TERRACE.maxX - 0.15, 'z'],
    ];
    for (const [a0, a1, c, axis] of railRuns) {
      const len = a1 - a0, mid = (a0 + a1) / 2;
      if (axis === 'x') {
        add(railProf, mStone, mid, 0.95, c, 0, 0, 0, len, 1, 1);
        add(base, mStone, mid, 0.05, c, 0, 0, 0, len, 1, 1);
        collider(a0, 0, c - 0.2, a1, 1.05, c + 0.2);
      } else {
        add(railProf, mStone, c, 0.95, mid, 0, Math.PI / 2, 0, len, 1, 1);
        add(base, mStone, c, 0.05, mid, 0, Math.PI / 2, 0, len, 1, 1);
        collider(c - 0.2, 0, a0, c + 0.2, a1, 1.05);
      }
    }
    // piers at corners + steps flanks, with planters on the corners
    const pierGeo = new RoundedBoxGeometry(0.34, 1.1, 0.34, 2, 0.02);
    const capGeo = new RoundedBoxGeometry(0.44, 0.09, 0.44, 2, 0.02);
    const pierPts = [
      [TERRACE.minX + 0.17, south - 0.17, true], [TERRACE.maxX - 0.17, south - 0.17, true],
      [STEPS.minX - 0.2, south - 0.17, false], [STEPS.maxX + 0.2, south - 0.17, false],
      [TERRACE.minX + 0.17, TERRACE.minZ + 0.4, true], [TERRACE.maxX - 0.17, TERRACE.minZ + 0.4, true],
    ];
    const mTerra = tex.std(null, { color: 0x9c5a38, roughness: 0.8 });
    const mLeaf = tex.std(null, { color: 0x4a6b30, roughness: 0.8 });
    const mPetal = tex.std(null, { color: 0xc44536, roughness: 0.7 });
    for (const [px, pz, planter] of pierPts) {
      add(pierGeo, mStone, px, 0.55, pz);
      add(capGeo, mStone, px, 1.14, pz);
      collider(px - 0.22, 0, pz - 0.22, px + 0.22, 1.2, pz + 0.22);
      if (planter) {
        add(new THREE.CylinderGeometry(0.16, 0.12, 0.2, 12), mTerra, px, 1.28, pz);
        for (let i = 0; i < 14; i++) {
          const a = rnd() * Math.PI * 2, r = rnd() * 0.16;
          add(new THREE.SphereGeometry(0.035, 6, 5), mLeaf,
            px + Math.cos(a) * r, 1.4 + rnd() * 0.08, pz + Math.sin(a) * r);
          if (rnd() > 0.45) add(new THREE.SphereGeometry(0.018, 6, 5), mPetal,
            px + Math.cos(a) * r, 1.46 + rnd() * 0.06, pz + Math.sin(a) * r);
        }
      }
    }
    flush();
  }

  // ---------------------------------------------------------------- steps
  {
    const stepD = (STEPS.maxZ - STEPS.minZ) / STEPS.count;
    for (let i = 0; i < STEPS.count; i++) {
      const z = STEPS.minZ + stepD * i;
      const y = -(STEPS.drop / STEPS.count) * (i + 1);
      add(new RoundedBoxGeometry(STEPS.maxX - STEPS.minX + 0.4, 0.16, stepD + 0.1, 2, 0.03),
        mStone, 0, y + 0.078, z + stepD / 2);
    }
    // cheek walls
    for (const side of [STEPS.minX - 0.35, STEPS.maxX + 0.35]) {
      add(new RoundedBoxGeometry(0.3, 0.7, STEPS.maxZ - STEPS.minZ + 0.3, 2, 0.02),
        mStone, side, -0.25, (STEPS.minZ + STEPS.maxZ) / 2);
      collider(side - 0.17, -0.7, STEPS.minZ - 0.2, side + 0.17, 0.55, STEPS.maxZ + 0.2);
    }
    flush();
  }

  // ---------------------------------------------------------------- facade
  {
    const wallH = 4.45;
    // south face segments around glazing (outer skin at z 5.8..6.0)
    const segs = [[-12.3, -6.3], [-4.1, -1.1], [1.1, 4.1], [6.3, 12.3]];
    for (const [x0, x1] of segs) {
      add(new THREE.BoxGeometry(x1 - x0, wallH, 0.2), mStucco, (x0 + x1) / 2, wallH / 2, 5.9);
    }
    add(new THREE.BoxGeometry(24.6, wallH - 3.3, 0.2), mStucco, 0, 3.3 + (wallH - 3.3) / 2, 5.9); // above openings
    // return walls + east/west/north skins
    add(new THREE.BoxGeometry(0.2, wallH, 12.2), mStucco, -12.2, wallH / 2, 0);
    add(new THREE.BoxGeometry(0.2, wallH, 12.2), mStucco, 12.2, wallH / 2, 0);
    add(new THREE.BoxGeometry(24.6, wallH, 0.2), mStucco, 0, wallH / 2, -6.0);
    // block off the extended wings so the building reads solid
    add(new THREE.BoxGeometry(2.9, wallH, 11.8), mStucco, -10.75, wallH / 2, 0);
    add(new THREE.BoxGeometry(2.9, wallH, 11.8), mStucco, 10.75, wallH / 2, 0);
    collider(-12.35, 0, -6.1, -9.3, wallH, 6.0);
    collider(9.3, 0, -6.1, 12.35, wallH, 6.0);

    // stone quoins at corners
    for (const cx of [-12.2, 12.2]) {
      for (let i = 0; i < 9; i++) {
        const w = i % 2 ? 0.5 : 0.36;
        add(new RoundedBoxGeometry(w, 0.42, 0.26, 2, 0.015), mStone, cx, 0.3 + i * 0.46, 5.92);
      }
    }
    // entablature over each opening + sill aprons
    for (const x of [-5.2, 0, 5.2]) {
      add(new RoundedBoxGeometry(2.9, 0.22, 0.14, 2, 0.02), mStone, x, 3.36, 5.98);
      add(new RoundedBoxGeometry(2.6, 0.1, 0.1, 2, 0.02), mStone, x, 3.2, 5.96);
      add(new RoundedBoxGeometry(2.7, 0.09, 0.12, 2, 0.02), mStone, x, 0.03, 5.96);
    }
    flush();

    // clay tile roof — hipped, canvas tile texture
    const tileCanvas = tex.makeCanvas(512, (g, w, h) => {
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 16; col++) {
          const y0 = row * (h / 8), x0 = col * (w / 16);
          const v = 0.82 + (Math.sin(row * 37.3 + col * 91.7) * 0.5 + 0.5) * 0.34;
          g.fillStyle = `rgb(${168 * v},${96 * v},${64 * v})`;
          g.fillRect(x0, y0, w / 16 - 1.5, h / 8 - 2);
          const gr = g.createLinearGradient(x0, y0, x0 + w / 16, y0);
          gr.addColorStop(0, 'rgba(0,0,0,0.35)');
          gr.addColorStop(0.5, 'rgba(255,255,255,0.12)');
          gr.addColorStop(1, 'rgba(0,0,0,0.35)');
          g.fillStyle = gr;
          g.fillRect(x0, y0, w / 16 - 1.5, h / 8 - 2);
        }
      }
    });
    const tileHeight = tex.makeCanvas(256, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      for (let col = 0; col < 8; col++) {
        const gr = g.createLinearGradient(col * w / 8, 0, (col + 1) * w / 8, 0);
        gr.addColorStop(0, '#3a3a3a'); gr.addColorStop(0.5, '#c8c8c8'); gr.addColorStop(1, '#3a3a3a');
        g.fillStyle = gr; g.fillRect(col * w / 8, 0, w / 8, h);
      }
    });
    const tileTex = new THREE.CanvasTexture(tileCanvas);
    tileTex.colorSpace = THREE.SRGBColorSpace;
    tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
    tileTex.repeat.set(6, 3);
    tileTex.anisotropy = ctx.quality.aniso;
    const tileNorm = tex.normalFromHeight(tileHeight, 1.4);
    tileNorm.wrapS = tileNorm.wrapT = THREE.RepeatWrapping;
    tileNorm.repeat.set(6, 3);
    const mTile = new THREE.MeshStandardMaterial({ map: tileTex, normalMap: tileNorm, roughness: 0.8 });

    // hip roof from explicit quads: eaves rect → ridge segment
    const eave = { x0: -12.9, x1: 12.9, z0: -6.55, z1: 6.55, y: 4.42 };
    const ridge = { x0: -8.5, x1: 8.5, y: 5.9, z: 0 };
    const quads = [
      // south slope
      [[eave.x0, eave.y, eave.z1], [eave.x1, eave.y, eave.z1], [ridge.x1, ridge.y, ridge.z], [ridge.x0, ridge.y, ridge.z]],
      // north slope
      [[eave.x1, eave.y, eave.z0], [eave.x0, eave.y, eave.z0], [ridge.x0, ridge.y, ridge.z], [ridge.x1, ridge.y, ridge.z]],
      // east hip
      [[eave.x1, eave.y, eave.z1], [eave.x1, eave.y, eave.z0], [ridge.x1, ridge.y, ridge.z], [ridge.x1, ridge.y, ridge.z]],
      // west hip
      [[eave.x0, eave.y, eave.z0], [eave.x0, eave.y, eave.z1], [ridge.x0, ridge.y, ridge.z], [ridge.x0, ridge.y, ridge.z]],
    ];
    const verts = [], uvs = [], idxs = [];
    let vi = 0;
    for (const q of quads) {
      for (const p of q) verts.push(...p);
      uvs.push(0, 0, 4, 0, 4, 1, 0, 1);
      idxs.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
    const roofGeo = new THREE.BufferGeometry();
    roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roofGeo.setIndex(idxs);
    roofGeo.computeVertexNormals();
    const roof = new THREE.Mesh(roofGeo, mTile);
    roof.castShadow = true;
    group.add(roof);
    // fascia + copper gutter
    add(new THREE.BoxGeometry(25.9, 0.16, 0.1), mDarkWood, 0, 4.4, 6.52);
    const mCopper = tex.std(null, { color: 0x6b8f7a, metalness: 0.85, roughness: 0.5 });
    add(new THREE.CylinderGeometry(0.05, 0.05, 25.8, 10, 1, false, 0, Math.PI), mCopper, 0, 4.34, 6.56, 0, 0, Math.PI / 2);
    // chimney
    add(new RoundedBoxGeometry(0.8, 1.7, 0.6, 2, 0.02), mStucco, 6.2, 5.7, -1.4);
    add(new RoundedBoxGeometry(0.95, 0.12, 0.75, 2, 0.02), mStone, 6.2, 6.6, -1.4);
    flush();

    // entry sconces flanking center door (2 allocated PointLights)
    const mBronzeS = tex.std(tex.bronze(), { metalness: 1, roughness: 0.45 });
    for (const sx of [-1.5, 1.5]) {
      const s = new THREE.Group();
      s.position.set(sx, 2.15, 6.0);
      group.add(s);
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), mBronzeS);
      bracket.castShadow = true; s.add(bracket);
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.24, 6, 1, true), mBronzeS);
      cage.position.set(0, -0.02, 0.1); s.add(cage);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.09, 6), mBronzeS);
      top.position.set(0, 0.13, 0.1); s.add(top);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc27a, emissiveIntensity: 2.2, roughness: 1 }));
      bulb.position.set(0, -0.02, 0.1); s.add(bulb);
      const pl = new THREE.PointLight(0xffc98a, 1.2, 6, 2);
      pl.position.set(0, 0, 0.12); s.add(pl);
    }
  }

  // ---------------------------------------------------------------- garden dressing
  {
    // stone lanterns flanking the path start
    for (const lx of [-1.9, 1.9]) {
      const gz = 15.6, gy = groundHeight(lx, gz);
      add(new THREE.CylinderGeometry(0.16, 0.2, 0.14, 8), mStone, lx, gy + 0.07, gz);
      add(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 8), mStone, lx, gy + 0.4, gz);
      add(new RoundedBoxGeometry(0.24, 0.2, 0.24, 2, 0.015), mStone, lx, gy + 0.75, gz);
      add(new THREE.ConeGeometry(0.22, 0.14, 4), mStone, lx, gy + 0.92, gz, 0, Math.PI / 4);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 1.5, roughness: 1 }));
      bulb.position.set(lx, gy + 0.75, gz);
      group.add(bulb);
      collider(lx - 0.2, gy, gz - 0.2, lx + 0.2, gy + 1, gz + 0.2);
    }
    // boxwood balls along the path
    const mBox = tex.std(null, { color: 0x3d5a28, roughness: 0.85 });
    for (let z = 18; z <= 32; z += 4) {
      for (const side of [-1.9, 1.9]) {
        const gy = groundHeight(side, z);
        const geo = new THREE.SphereGeometry(0.32 + rnd() * 0.1, 10, 8);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const n = 1 + (rnd() - 0.5) * 0.14;
          pos.setXYZ(i, pos.getX(i) * n, pos.getY(i) * n, pos.getZ(i) * n);
        }
        geo.computeVertexNormals();
        add(geo, mBox, side + (rnd() - 0.5) * 0.5, gy + 0.22, z + (rnd() - 0.5) * 1.4);
      }
    }
    // weathered bench facing the lake
    {
      const bx = -6, bz = 26, by = groundHeight(bx, bz);
      const b = new THREE.Group();
      b.position.set(bx, by, bz);
      b.rotation.y = -0.12;
      group.add(b);
      for (const [sx2] of [[-0.85], [0.85]]) {
        const leg = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.42, 0.5, 2, 0.015), mDarkWood);
        leg.position.set(sx2, 0.21, 0); leg.castShadow = true; b.add(leg);
      }
      for (let i = 0; i < 3; i++) {
        const slat = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.045, 0.13, 2, 0.012), mPlank);
        slat.position.set(0, 0.44, -0.16 + i * 0.16);
        slat.castShadow = true; b.add(slat);
      }
      for (let i = 0; i < 2; i++) {
        const back = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.13, 0.04, 2, 0.012), mPlank);
        back.position.set(0, 0.62 + i * 0.18, -0.28);
        back.rotation.x = -0.16;
        back.castShadow = true; b.add(back);
      }
      collider(bx - 1, by, bz - 0.35, bx + 1, by + 0.9, bz + 0.3);
    }
    // terracotta geranium pots at the steps
    const mTerra = tex.std(null, { color: 0x9c5a38, roughness: 0.8 });
    const mGer = tex.std(null, { color: 0xc23a30, roughness: 0.7 });
    const mLeaf2 = tex.std(null, { color: 0x486b2c, roughness: 0.8 });
    for (const px of [-3.6, 3.6]) {
      const pz = 14.2, py = groundHeight(px, pz);
      add(new THREE.CylinderGeometry(0.2, 0.14, 0.3, 12), mTerra, px, py + 0.15, pz);
      for (let i = 0; i < 16; i++) {
        const a = rnd() * Math.PI * 2, r = rnd() * 0.2;
        add(new THREE.SphereGeometry(0.05, 6, 5), mLeaf2, px + Math.cos(a) * r, py + 0.34 + rnd() * 0.1, pz + Math.sin(a) * r);
        if (rnd() > 0.4) add(new THREE.SphereGeometry(0.028, 6, 5), mGer, px + Math.cos(a) * r, py + 0.42 + rnd() * 0.08, pz + Math.sin(a) * r);
      }
      collider(px - 0.22, py, pz - 0.22, px + 0.22, py + 0.5, pz + 0.22);
    }
    flush();
  }

  // ---------------------------------------------------------------- dock
  {
    const deckY = DOCK.deckY;
    // piles — the xz water.js expects: x ±1.05, z 36.5 / 40 / 43.8
    for (const pz of [36.5, 40, 43.8]) {
      for (const px of [-1.05, 1.05]) {
        const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.6, 10), mDarkWood);
        pile.position.set(px, WATER_Y + 0.85, pz);
        pile.castShadow = true;
        group.add(pile);
        // wet dark band at waterline
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.115, 0.3, 10),
          tex.std(null, { color: 0x241a10, roughness: 0.35 }));
        band.position.set(px, WATER_Y + 0.1, pz);
        group.add(band);
      }
    }
    // joists
    for (const px of [-1.05, 0, 1.05]) {
      add(new THREE.BoxGeometry(0.09, 0.14, DOCK.maxZ - DOCK.minZ + 0.3), mDarkWood,
        px, deckY - 0.1, (DOCK.minZ + DOCK.maxZ) / 2);
    }
    // deck planks with sag + gaps
    const plankD = 0.14, gap2 = 0.012;
    for (let z = DOCK.minZ; z < DOCK.maxZ - 0.01; z += plankD + gap2) {
      const sag = -0.02 * Math.min(1, (z - DOCK.minZ) / (DOCK.maxZ - DOCK.minZ)) * Math.sin(((z - DOCK.minZ) / (DOCK.maxZ - DOCK.minZ)) * Math.PI);
      add(new RoundedBoxGeometry(DOCK.maxX - DOCK.minX, 0.045, plankD, 2, 0.008), mPlank,
        (rnd() - 0.5) * 0.01, deckY + sag + (rnd() - 0.5) * 0.004, z + plankD / 2, 0, (rnd() - 0.5) * 0.008, 0);
    }
    // low bull rail curbs (visual) + edge-guard colliders
    for (const side of [DOCK.minX + 0.05, DOCK.maxX - 0.05]) {
      add(new RoundedBoxGeometry(0.09, 0.09, DOCK.maxZ - DOCK.minZ, 2, 0.02), mDarkWood,
        side, deckY + 0.07, (DOCK.minZ + DOCK.maxZ) / 2);
      collider(side - 0.05, deckY, DOCK.minZ, side + 0.05, deckY + 0.35, DOCK.maxZ);
    }
    // end rail
    add(new RoundedBoxGeometry(DOCK.maxX - DOCK.minX, 0.09, 0.09, 2, 0.02), mDarkWood,
      0, deckY + 0.07, DOCK.maxZ - 0.05);
    collider(DOCK.minX, deckY, DOCK.maxZ - 0.1, DOCK.maxX, deckY + 0.4, DOCK.maxZ);
    // cleat + coiled rope
    const mIron = tex.std(null, { color: 0x2c2c30, metalness: 0.9, roughness: 0.6 });
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), mIron, 1.05, deckY + 0.05, 42.9, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.03, 0.035, 0.06, 8), mIron, 1.05, deckY + 0.03, 42.9);
    const mRope = tex.std(null, { color: 0xa89570, roughness: 0.9 });
    const coilPts = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 6;
      const r = 0.1 + (i / 40) * 0.06;
      coilPts.push(new THREE.Vector3(-0.9 + Math.cos(a) * r, deckY + 0.03 + (i / 40) * 0.05, 41.5 + Math.sin(a) * r));
    }
    const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 60, 0.016, 6), mRope);
    coil.castShadow = true;
    group.add(coil);
    // post lantern at the end
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.1, 8), mDarkWood);
    post.position.set(-1.15, deckY + 0.55, 44.7);
    post.castShadow = true;
    group.add(post);
    const lampGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.16, 6),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc98a, emissiveIntensity: 2.4, roughness: 1 }));
    lampGlass.position.set(-1.15, deckY + 1.18, 44.7);
    group.add(lampGlass);
    const lampCap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 6), mIron);
    lampCap.position.set(-1.15, deckY + 1.3, 44.7);
    group.add(lampCap);
    collider(-1.3, deckY, 44.55, -1.0, deckY + 1.3, 44.85);
    flush();

    // ---------------------------------------------------------------- rowboat
    const boat = new THREE.Group();
    boat.position.set(2.75, WATER_Y + 0.08, 42.2);
    group.add(boat);
    const hullGeo = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    hullGeo.scale(0.62, 0.55, 1.55);
    const mHull = tex.std(tex.plank({ repeat: [2, 1] }), { color: 0x5a4632, roughness: 0.75, side: THREE.DoubleSide });
    const hull = new THREE.Mesh(hullGeo, mHull);
    hull.castShadow = true;
    boat.add(hull);
    const gunwale = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 28), tex.std(null, { color: 0x3c2e1e, roughness: 0.7 }));
    gunwale.scale.set(0.62, 1.55, 1);
    gunwale.rotation.x = Math.PI / 2;
    boat.add(gunwale);
    for (const bz of [-0.55, 0.15, 0.75]) {
      const bench2 = new THREE.Mesh(new RoundedBoxGeometry(1.05, 0.04, 0.22, 2, 0.01), mPlank);
      bench2.position.set(0, -0.08, bz);
      boat.add(bench2);
    }
    // mooring rope to the cleat (catenary-ish curve)
    const ropePts = [
      new THREE.Vector3(1.05, deckY + 0.06, 42.9),
      new THREE.Vector3(1.8, WATER_Y + 0.28, 42.6),
      new THREE.Vector3(2.35, WATER_Y + 0.2, 42.4),
    ];
    const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePts), 16, 0.013, 6), mRope);
    group.add(rope);
    // gentle bob + yaw (wrap-safe rates)
    const w1 = 2 * Math.PI / TIME_WRAP;
    ctx.updates.push((dt, tw) => {
      boat.position.y = WATER_Y + 0.08 + Math.sin(tw * w1 * 128) * 0.03 + Math.sin(tw * w1 * 203 + 1.2) * 0.015;
      boat.rotation.z = Math.sin(tw * w1 * 96 + 0.5) * 0.025;
      boat.rotation.x = Math.sin(tw * w1 * 150 + 2.1) * 0.02;
      boat.rotation.y = Math.sin(tw * w1 * 22) * 0.05;
    });
  }

  return { group };
}
