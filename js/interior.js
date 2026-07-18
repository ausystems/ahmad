// interior.js — the great room: herringbone floor, paneled walls, south
// glazing with auto-opening center doors, curtains, coffered ceiling,
// chandeliers, sconces, fireplace, brass sign. Seed 6000.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import {
  ROOM, DOOR_XS, DOOR, CHANDELIERS, PALETTE, mulberry32, TIME_WRAP,
} from './config.js';

const H = ROOM.height;            // 4.2
const T = ROOM.wallThick;         // 0.3

export function createInterior(ctx) {
  const { tex } = ctx;
  const rnd = mulberry32(6001);
  const group = new THREE.Group();
  group.name = 'interior';

  // ---------------------------------------------------------------- materials
  const mCream = tex.std(tex.plaster(), { roughness: 0.55, color: 0xf2ecdd });
  const mCreamTrim = tex.std(null, { color: 0xefe8d6, roughness: 0.5 });
  const mGrass = tex.std(tex.grasscloth({ repeat: [2.2, 1.4] }), { roughness: 1.0, envMapIntensity: 0.45 });
  mGrass.normalScale.set(0.16, 0.16);
  const mWalnut = tex.std(tex.plank({ repeat: [1.5, 1.5] }), { color: 0x8a6a4c, roughness: 0.42 });
  const mBrass = tex.std(tex.brass(), { metalness: 1.0, roughness: 0.3, envMapIntensity: 1.4 });
  const mBronzeFrame = tex.std(tex.bronze(), { metalness: 1.0, roughness: 0.42, envMapIntensity: 1.2 });
  const mNero = tex.std(tex.marble({ tone: 'nero' }), { roughness: 0.16, envMapIntensity: 1.3 });
  const mGlass = ctx.quality.tier === 'medium'
    ? new THREE.MeshStandardMaterial({ color: 0xdfeee9, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.0, envMapIntensity: 1.4 })
    : new THREE.MeshPhysicalMaterial({
        color: 0xffffff, transmission: 1.0, thickness: 0.02, roughness: 0.03,
        ior: 1.5, attenuationColor: new THREE.Color(0xd8eee2), attenuationDistance: 2.5,
        envMapIntensity: 1.2,
      });
  const mDamask = tex.std(tex.damask({ repeat: [2.2, 6] }), { roughness: 0.78, envMapIntensity: 0.5, side: THREE.DoubleSide });
  const mSheer = new THREE.MeshStandardMaterial({
    color: 0xf6eedd, transparent: true, opacity: 0.32, roughness: 0.7,
    side: THREE.DoubleSide, depthWrite: false,
  });

  // ---------------------------------------------------------------- merge kit
  const buckets = new Map();
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(),
        V = new THREE.Vector3(), SC = new THREE.Vector3();
  function add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    E.set(rx, ry, rz); Q.setFromEuler(E); V.set(x, y, z); SC.set(sx, sy, sz);
    M.compose(V, Q, SC);
    const g = geo.clone().applyMatrix4(M);
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(g);
    geo.dispose?.();
    return g;
  }
  function flushBuckets(castShadow = true) {
    for (const [mat, geos] of buckets) {
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    buckets.clear();
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const rbox = (w, h, d, r = 0.008) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3));

  function collider(x1, y1, z1, x2, y2, z2) {
    ctx.colliders.push({
      min: { x: Math.min(x1, x2), y: Math.min(y1, y2), z: Math.min(z1, z2) },
      max: { x: Math.max(x1, x2), y: Math.max(y1, y2), z: Math.max(z1, z2) },
    });
  }

  // ---------------------------------------------------------------- floor
  {
    const set = tex.herringbone({ repeat: [4.5, 2.8] });
    const mat = tex.std(set, { roughness: 1.0 });   // roughnessMap carries gloss detail
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 11), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.name = 'glossFloor';
    floor.receiveShadow = true;
    floor.userData.forceReflect = true;
    group.add(floor);
    // walnut border band
    const bMat = mWalnut;
    for (const [w, d, x, z] of [
      [18, 0.12, 0, -5.44], [18, 0.12, 0, 5.44], [0.12, 11, -8.94, 0], [0.12, 11, 8.94, 0],
    ]) add(new THREE.BoxGeometry(w, 0.012, d), bMat, x, 0.006, z);
  }

  // ---------------------------------------------------------------- wall builder
  // Builds one paneled wall face in local space (length along +x, facing +z),
  // then rotates/positions. Openings: [{x0,x1,y1}] in local coords from wall
  // start (x from -len/2).
  function paneledWall(len, yaw, px, pz, openings = []) {
    const wall = new THREE.Group();
    wall.position.set(px, 0, pz);
    wall.rotation.y = yaw;
    group.add(wall);

    openings = [...openings].sort((a, b) => a.x0 - b.x0);
    const segs = [];   // solid x-ranges between openings at each band
    const flat = [-len / 2, ...openings.flatMap(o => [o.x0, o.x1]), len / 2];
    for (let i = 0; i < flat.length - 1; i += 2) segs.push([flat[i], flat[i + 1]]);

    const wadd = (geo, mat, x, y, z) => {
      const g = geo; const m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      wall.add(m);
    };

    for (const [x0, x1] of segs) {
      const w = x1 - x0, cx = (x0 + x1) / 2;
      if (w <= 0.01) continue;
      // structural slab behind everything
      wadd(box(w, H, T), mCream, cx, H / 2, -T / 2 + 0.005);
      // base + wainscot + chair rail
      wadd(box(w, 0.15, 0.045), mCreamTrim, cx, 0.075, 0.022);
      wadd(box(w, 0.9, 0.02), mCream, cx, 0.6, 0.012);
      wadd(box(w, 0.05, 0.05), mCreamTrim, cx, 1.05, 0.026);
      // raised wainscot panels
      const n = Math.max(1, Math.round(w / 1.05));
      const pw = (w - 0.1) / n;
      for (let i = 0; i < n; i++) {
        const pcx = x0 + 0.05 + pw * (i + 0.5);
        wadd(rbox(pw - 0.14, 0.62, 0.028, 0.012), mCreamTrim, pcx, 0.62, 0.032);
        wadd(rbox(pw - 0.26, 0.48, 0.016, 0.008), mCream, pcx, 0.62, 0.045);
      }
      // grasscloth field with cream stiles
      wadd(box(w, H - 1.05 - 0.35, 0.015), mGrass, cx, 1.05 + (H - 1.05 - 0.35) / 2, 0.012);
      const ns = Math.max(2, Math.round(w / 2.2) + 1);
      for (let i = 0; i < ns; i++) {
        const sx = x0 + (w * i) / (ns - 1);
        if (Math.abs(sx - x0) < 0.02 || Math.abs(sx - x1) < 0.02) continue;
        wadd(box(0.09, H - 1.05 - 0.35, 0.022), mCreamTrim, sx, 1.05 + (H - 1.05 - 0.35) / 2, 0.015);
      }
      // crown (three stepped members)
      wadd(box(w, 0.09, 0.05), mCreamTrim, cx, H - 0.32, 0.025);
      wadd(box(w, 0.10, 0.09), mCreamTrim, cx, H - 0.22, 0.045);
      wadd(box(w, 0.13, 0.13), mCreamTrim, cx, H - 0.095, 0.062);
    }
    // lintels above openings
    for (const o of openings) {
      const w = o.x1 - o.x0, cx = (o.x0 + o.x1) / 2;
      wadd(box(w, H - o.y1, T), mCream, cx, o.y1 + (H - o.y1) / 2, -T / 2 + 0.005);
      wadd(box(w + 0.24, 0.14, 0.07), mCreamTrim, cx, o.y1 + 0.07, 0.03);
    }
    return wall;
  }

  // north (gallery) wall — faces +z, at z=-5.5
  paneledWall(18, 0, 0, ROOM.minZ, []);
  collider(-9.3, 0, -5.9, 9.3, H, -5.45);

  // west (TV) wall — faces +x, at x=-9
  paneledWall(11, Math.PI / 2, ROOM.minX, 0, []);
  collider(-9.35, 0, -5.5, -8.95, H, 5.5);

  // east wall — faces -x, at x=+9
  paneledWall(11, -Math.PI / 2, ROOM.maxX, 0, []);
  collider(8.95, 0, -5.5, 9.35, H, 5.5);

  // south glazing wall — faces -z (into room), at z=+5.5, three openings
  const southOpenings = DOOR_XS.map((x) => ({ x0: -x - DOOR.width / 2, x1: -x + DOOR.width / 2, y1: DOOR.height }));
  // (wall local +x maps to world -x with yaw π)
  paneledWall(18, Math.PI, 0, ROOM.maxZ, southOpenings);
  // south wall colliders: segments between openings
  const sx = [[-9.3, -6.3], [-4.1, -1.1], [1.1, 4.1], [6.3, 9.3]];
  for (const [x0, x1] of sx) collider(x0, 0, 5.45, x1, H, 5.9);

  // ---------------------------------------------------------------- glazing
  function glazingUnit(cx, isDoor) {
    const unit = new THREE.Group();
    unit.position.set(cx, 0, ROOM.maxZ);
    group.add(unit);
    const W2 = DOOR.width, H2 = DOOR.height;
    // outer bronze frame (bucket coords are WORLD space — offset by the unit)
    for (const [w, h, x, y] of [
      [0.09, H2, -W2 / 2 + 0.045, H2 / 2], [0.09, H2, W2 / 2 - 0.045, H2 / 2],
      [W2, 0.1, 0, H2 - 0.05], [W2, 0.07, 0, 0.035],
    ]) add(box(w, h, 0.12), mBronzeFrame, cx + x, y, ROOM.maxZ);
    return unit;
  }

  // builds muntin grid + glass for a leaf of width lw, height lh centered at (lx, y c)
  function leafGeometry(parent, lx, lw, lh, ly0 = 0.07) {
    const leaf = new THREE.Group();
    leaf.position.set(lx, 0, 0);
    parent.add(leaf);
    const yc = ly0 + lh / 2;
    // stiles/rails
    for (const [w, h, x, y] of [
      [0.055, lh, -lw / 2 + 0.027, yc], [0.055, lh, lw / 2 - 0.027, yc],
      [lw, 0.06, 0, ly0 + lh - 0.03], [lw, 0.11, 0, ly0 + 0.055],
    ]) {
      const m = new THREE.Mesh(box(w, h, 0.055), mBronzeFrame);
      m.position.set(x, y, 0); m.castShadow = true; leaf.add(m);
    }
    // muntins 3×5
    for (let i = 1; i < 3; i++) {
      const m = new THREE.Mesh(box(0.02, lh - 0.17, 0.045), mBronzeFrame);
      m.position.set(-lw / 2 + (lw * i) / 3, yc, 0); m.castShadow = true; leaf.add(m);
    }
    for (let i = 1; i < 5; i++) {
      const m = new THREE.Mesh(box(lw - 0.11, 0.02, 0.045), mBronzeFrame);
      m.position.set(0, ly0 + 0.11 + ((lh - 0.17) * i) / 5, 0); m.castShadow = true; leaf.add(m);
    }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(lw - 0.1, lh - 0.16), mGlass);
    glass.position.set(0, yc, 0);
    glass.userData.forceReflect = true;
    leaf.add(glass);
    return leaf;
  }

  // fixed side units
  for (const x of [DOOR_XS[0], DOOR_XS[2]]) {
    const u = glazingUnit(x, false);
    leafGeometry(u, 0, DOOR.width - 0.18, DOOR.height - 0.2);
    collider(x - DOOR.width / 2, 0, 5.42, x + DOOR.width / 2, H, 5.62);
  }

  // ---------------------------------------------------------------- auto door
  const doorUnit = glazingUnit(0, true);
  const leafW = DOOR.width / 2 - 0.1;
  const hingeL = new THREE.Group(); hingeL.position.set(-DOOR.width / 2 + 0.09, 0, 0);
  const hingeR = new THREE.Group(); hingeR.position.set(DOOR.width / 2 - 0.09, 0, 0);
  doorUnit.add(hingeL, hingeR);
  const leafL = leafGeometry(hingeL, leafW / 2, leafW, DOOR.height - 0.2);
  const leafR = leafGeometry(hingeR, -leafW / 2, leafW, DOOR.height - 0.2);
  // handles
  for (const [hinge, side] of [[hingeL, 1], [hingeR, -1]]) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 10), mBrass);
    handle.position.set(side * (leafW - 0.09), 1.05, 0.05);
    hinge.add(handle);
  }
  // dynamic colliders (mutated in place)
  const colL = { min: { x: -1.1, y: 0, z: 5.42 }, max: { x: 0, y: H, z: 5.62 } };
  const colR = { min: { x: 0, y: 0, z: 5.42 }, max: { x: 1.1, y: H, z: 5.62 } };
  ctx.colliders.push(colL, colR);

  let doorOpen = 0, doorVel = 0, doorState = false;
  const DOOR_ANG = 1.62;
  ctx.updates.push((dt) => {
    const p = ctx.player ? ctx.player.pos : null;
    const want = p ? (Math.hypot(p.x - 0, p.z - ROOM.maxZ) < DOOR.triggerDist) : false;
    if (want !== doorState) {
      doorState = want;
      ctx.audio?.doorCreak?.(want);
    }
    // damped spring toward target
    const target = doorState ? 1 : 0;
    const k = 26, c = 9.5;
    doorVel += (k * (target - doorOpen) - c * doorVel) * dt;
    doorOpen = Math.max(0, Math.min(1.15, doorOpen + doorVel * dt));
    const a = doorOpen * DOOR_ANG;
    hingeL.rotation.y = -a;
    hingeR.rotation.y = a;
    // update colliders: closed → block opening; open → hug the jambs
    const open = doorOpen > 0.35;
    if (open) {
      colL.min.x = -1.25; colL.max.x = -1.02;
      colL.min.z = 5.4; colL.max.z = 5.6 + 1.1 * doorOpen;
      colR.min.x = 1.02; colR.max.x = 1.25;
      colR.min.z = 5.4; colR.max.z = 5.6 + 1.1 * doorOpen;
    } else {
      colL.min.x = -1.1; colL.max.x = 0.02; colL.min.z = 5.42; colL.max.z = 5.62;
      colR.min.x = -0.02; colR.max.x = 1.1; colR.min.z = 5.42; colR.max.z = 5.62;
    }
  });

  // ---------------------------------------------------------------- curtains
  function curtainPanel(mat, width, height, folds, foldDepth, segsX = 28) {
    const g = new THREE.PlaneGeometry(width, height, segsX, 4);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const t = (x / width + 0.5);
      const pinch = 0.55 + 0.45 * ((y / height + 0.5));     // pinched at top
      const zz = Math.sin(t * Math.PI * folds) * foldDepth * pinch
               + Math.sin(t * Math.PI * folds * 2.7 + 1.3) * foldDepth * 0.35 * pinch;
      pos.setZ(i, zz);
      // slight puddle spread at floor
      if (y < -height / 2 + 0.2) pos.setX(i, x * 1.06);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  const sheerMeshes = [];
  for (const [idx, x] of DOOR_XS.entries()) {
    // bronze rod + finials
    add(new THREE.CylinderGeometry(0.022, 0.022, DOOR.width + 1.0, 12), mBrass, x, DOOR.height + 0.28, ROOM.maxZ - 0.28, 0, 0, Math.PI / 2);
    add(new THREE.SphereGeometry(0.05, 10, 8), mBrass, x - DOOR.width / 2 - 0.5, DOOR.height + 0.28, ROOM.maxZ - 0.28);
    add(new THREE.SphereGeometry(0.05, 10, 8), mBrass, x + DOOR.width / 2 + 0.5, DOOR.height + 0.28, ROOM.maxZ - 0.28);
    // damask side panels
    for (const side of [-1, 1]) {
      const c = curtainPanel(mDamask, 0.72, DOOR.height + 0.22, 5, 0.09);
      c.position.set(x + side * (DOOR.width / 2 + 0.18), (DOOR.height + 0.22) / 2 - 0.04, ROOM.maxZ - 0.26);
      group.add(c);
    }
    // sheers half-drawn on side openings
    if (idx !== DOOR.autoIndex) {
      const s = curtainPanel(mSheer, DOOR.width * 0.62, DOOR.height + 0.1, 9, 0.05);
      s.position.set(x - DOOR.width * 0.16, (DOOR.height + 0.1) / 2, ROOM.maxZ - 0.2);
      s.userData.baseX = s.position.x;
      group.add(s);
      sheerMeshes.push(s);
    }
  }
  // sheer sway near the door when open
  ctx.updates.push((dt, tw) => {
    const swayA = 0.012 * doorOpen;
    for (const [i, s] of sheerMeshes.entries()) {
      s.rotation.z = Math.sin(tw * 2 * Math.PI / 9 + i * 2.1) * swayA;
    }
  });

  // ---------------------------------------------------------------- ceiling
  {
    // slab
    add(box(18, 0.1, 11), mCream, 0, H + 0.05, 0);
    // beams 3×5 walnut with brass inlay — slim so they don't cage the view
    const beamD = 0.11;
    for (let i = 0; i <= 5; i++) {
      const x = -9 + (18 * i) / 5;
      add(box(0.15, beamD, 11), mWalnut, x === -9 ? -8.92 : x === 9 ? 8.92 : x, H - beamD / 2, 0);
      add(box(0.04, 0.012, 11), mBrass, x === -9 ? -8.92 : x === 9 ? 8.92 : x, H - beamD - 0.005, 0);
    }
    for (let i = 0; i <= 3; i++) {
      const z = -5.5 + (11 * i) / 3;
      add(box(18, beamD, 0.15), mWalnut, 0, H - beamD / 2, z === -5.5 ? -5.42 : z === 5.5 ? 5.42 : z);
      add(box(18, 0.012, 0.04), mBrass, 0, H - beamD - 0.005, z === -5.5 ? -5.42 : z === 5.5 ? 5.42 : z);
    }
    // ceiling roses
    for (const [cx, , cz] of CHANDELIERS) {
      add(new THREE.CylinderGeometry(0.34, 0.42, 0.05, 24), mCreamTrim, cx, H - 0.03, cz);
    }
  }

  // ---------------------------------------------------------------- chandeliers
  const flameMats = [];
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 0.92, thickness: 0.02, roughness: 0.06,
    ior: 1.9, envMapIntensity: 2.2,
  });
  const chandGroups = [];
  for (const [cx, cy, cz] of CHANDELIERS) {
    const ch = new THREE.Group();
    ch.position.set(cx, cy, cz);
    group.add(ch);
    chandGroups.push(ch);
    // chain + column
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, H - cy, 8), mBronzeFrame);
    chain.position.y = (H - cy) / 2;
    ch.add(chain);
    const column = new THREE.Mesh(new THREE.LatheGeometry(
      [[0, -0.3], [0.045, -0.28], [0.03, -0.12], [0.06, -0.05], [0.03, 0.05], [0.05, 0.16], [0.02, 0.3]]
        .map(([r, y]) => new THREE.Vector2(r, y)), 14), mBrass);
    column.castShadow = true;
    ch.add(column);
    // 8 arms with candles
    const armPts = [
      new THREE.Vector3(0, -0.05, 0),
      new THREE.Vector3(0.22, -0.16, 0),
      new THREE.Vector3(0.42, -0.1, 0),
      new THREE.Vector3(0.5, 0.02, 0),
    ];
    for (let a = 0; a < 8; a++) {
      const rot = (a / 8) * Math.PI * 2;
      const pts = armPts.map((p) => p.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot));
      const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.014, 8), mBrass);
      arm.castShadow = true;
      ch.add(arm);
      const tip = pts[3];
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.022, 0.05, 10), mBrass);
      cup.position.copy(tip); ch.add(cup);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.09, 8),
        new THREE.MeshStandardMaterial({ color: 0xf2ead6, roughness: 0.6 }));
      sleeve.position.copy(tip).add(new THREE.Vector3(0, 0.07, 0)); ch.add(sleeve);
      const fm = new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: 0xffc27a, emissiveIntensity: 1.45, roughness: 1,
      });
      flameMats.push(fm);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), fm);
      flame.scale.set(0.7, 1.5, 0.7);
      flame.position.copy(tip).add(new THREE.Vector3(0, 0.145, 0));
      ch.add(flame);
      // hanging crystals on each arm
    }
    // crystal drops — instanced
    const nCr = 120;
    const crGeo = new THREE.OctahedronGeometry(0.021, 0);
    crGeo.scale(1, 1.9, 1);
    const inst = new THREE.InstancedMesh(crGeo, crystalMat, nCr);
    const im = new THREE.Matrix4(), iq = new THREE.Quaternion(), ie = new THREE.Euler(), iv = new THREE.Vector3(), is = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < nCr; i++) {
      const ring = i < 56 ? 0 : i < 96 ? 1 : 2;
      const radius = [0.52, 0.36, 0.2][ring];
      const count = [56, 40, 24][ring];
      const idx = ring === 0 ? i : ring === 1 ? i - 56 : i - 96;
      const ang = (idx / count) * Math.PI * 2;
      const yy = [-0.02, -0.13, -0.24][ring] - rnd() * 0.06;
      iv.set(Math.cos(ang) * radius, yy, Math.sin(ang) * radius);
      ie.set(rnd() * 0.2, rnd() * Math.PI, rnd() * 0.2);
      iq.setFromEuler(ie);
      im.compose(iv, iq, is);
      inst.setMatrixAt(i, im);
    }
    inst.instanceMatrix.needsUpdate = true;
    ch.add(inst);
    // one warm point light per chandelier
    const pl = new THREE.PointLight(0xffd9a8, 40, 14, 2);
    pl.position.set(0, -0.02, 0);
    ch.add(pl);
  }
  // flame flicker + crystal shimmer
  ctx.updates.push((dt, tw) => {
    for (const [i, fm] of flameMats.entries()) {
      fm.emissiveIntensity = 1.9
        + Math.sin(tw * 2 * Math.PI * (1.0 + (i % 5) * 0.11) + i * 1.7) * 0.18
        + Math.sin(tw * 2 * Math.PI * 2.3 + i * 0.9) * 0.1;
    }
    for (const [i, ch] of chandGroups.entries()) {
      ch.rotation.y = Math.sin(tw * 2 * Math.PI / 45 + i * 2) * 0.006;
    }
  });

  // ---------------------------------------------------------------- sconces
  for (const sxp of [-2.6, 2.6, -7.8, 7.8]) {
    const s = new THREE.Group();
    s.position.set(sxp, 2.35, ROOM.minZ + 0.02);
    group.add(s);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 10), mBronzeFrame);
    back.rotation.x = Math.PI / 2; s.add(back);
    const arm = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.011, 8, 12, Math.PI), mBronzeFrame);
    arm.rotation.set(0, Math.PI / 2, Math.PI / 2);
    arm.position.set(0, -0.02, 0.09); s.add(arm);
    const shadeMat = new THREE.MeshStandardMaterial({
      color: 0xf4ead5, roughness: 0.7, emissive: 0xffdca8, emissiveIntensity: 0.55,
      side: THREE.DoubleSide,
    });
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector2(0.055 + t * 0.045 + Math.sin(t * 40) * 0.0035, 0.16 - t * 0.16));
    }
    const shade = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), shadeMat);
    shade.position.set(0, 0.06, 0.18); s.add(shade);
  }

  // ---------------------------------------------------------------- fireplace
  {
    const f = new THREE.Group();
    f.position.set(ROOM.maxX - 0.02, 0, 3.8);
    f.rotation.y = -Math.PI / 2;
    group.add(f);
    const jamb = (x) => {
      const m = new THREE.Mesh(rbox(0.24, 1.18, 0.24, 0.015), mNero);
      m.position.set(x, 0.59, 0.12); m.castShadow = true; f.add(m);
    };
    jamb(-0.72); jamb(0.72);
    const lintel = new THREE.Mesh(rbox(1.9, 0.3, 0.26, 0.015), mNero);
    lintel.position.set(0, 1.29, 0.13); lintel.castShadow = true; f.add(lintel);
    const mantel = new THREE.Mesh(rbox(2.1, 0.07, 0.36, 0.012), mNero);
    mantel.position.set(0, 1.48, 0.16); mantel.castShadow = true; f.add(mantel);
    // firebox
    const fbMat = new THREE.MeshStandardMaterial({ color: 0x191512, roughness: 0.95 });
    const fb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.5), fbMat);
    fb.position.set(0, 0.55, -0.14); f.add(fb);
    // ember bed
    const emberMat = new THREE.MeshStandardMaterial({
      color: 0x1a0d06, emissive: 0xff5a1e, emissiveIntensity: 1.3, roughness: 0.9,
    });
    for (let i = 0; i < 14; i++) {
      const e = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045 + rnd() * 0.04, 0), emberMat);
      e.position.set((rnd() - 0.5) * 0.8, 0.06 + rnd() * 0.05, -0.05 + (rnd() - 0.5) * 0.25);
      f.add(e);
    }
    // birch logs
    const barkMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.85 });
    for (const [lx, ly, lr] of [[-0.18, 0.16, 0.5], [0.2, 0.15, -0.4], [0.02, 0.3, 0.15]]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.7, 9), barkMat);
      log.rotation.z = Math.PI / 2 + lr * 0.4;
      log.rotation.y = lr;
      log.position.set(lx, ly, -0.08);
      log.castShadow = true;
      f.add(log);
    }
    // flames — two crossed alpha quads
    const flameCanvas = tex.makeCanvas(128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h * 0.85, 4, w / 2, h * 0.7, h * 0.75);
      gr.addColorStop(0, 'rgba(255,220,140,0.9)');
      gr.addColorStop(0.4, 'rgba(255,130,40,0.55)');
      gr.addColorStop(1, 'rgba(80,20,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const flameTex = new THREE.CanvasTexture(flameCanvas);
    flameTex.colorSpace = THREE.SRGBColorSpace;
    const flameMat = new THREE.MeshBasicMaterial({
      map: flameTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const flames = [];
    for (const a of [0, Math.PI / 2]) {
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.5), flameMat);
      fl.rotation.y = a;
      fl.position.set(0, 0.36, -0.06);
      f.add(fl); flames.push(fl);
    }
    const fireLight = new THREE.PointLight(0xff7830, 8, 4, 2);
    fireLight.position.set(0, 0.5, 0.3);
    f.add(fireLight);
    ctx.updates.push((dt, tw) => {
      const n = Math.sin(tw * 2 * Math.PI * 1.4) * 0.5 + Math.sin(tw * 2 * Math.PI * 3.7 + 1.2) * 0.3 + Math.sin(tw * 2 * Math.PI * 0.6) * 0.2;
      emberMat.emissiveIntensity = 1.3 + n * 0.35;
      fireLight.intensity = 8 + n * 2.4;
      for (const [i, fl] of flames.entries()) {
        fl.scale.y = 1 + n * 0.12 + i * 0.03;
        fl.scale.x = 1 - n * 0.05;
      }
    });
    // hearth + screen + tools
    const hearth = new THREE.Mesh(rbox(2.0, 0.05, 0.6, 0.01), mNero);
    hearth.position.set(0, 0.025, 0.35); hearth.receiveShadow = true; f.add(hearth);
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x201a12, metalness: 0.8, roughness: 0.5, transparent: true, opacity: 0.55,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.95), screenMat);
    screen.position.set(0, 0.5, 0.42); f.add(screen);
    collider(ROOM.maxX - 1.0, 0, 2.7, ROOM.maxX, 1.6, 4.9);
  }

  // ---------------------------------------------------------------- sign
  {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 0.28, roughness: 1 }));
    glow.position.set(0, 3.45, ROOM.minZ + 0.02);
    group.add(glow);
    const loader = new FontLoader();
    const buildSign = (font) => {
      const geo = new TextGeometry('Ahmad.', {
        font, size: 0.34, height: 0.06, curveSegments: 5,
        bevelEnabled: true, bevelSize: 0.007, bevelThickness: 0.007,
      });
      geo.computeBoundingBox();
      const w = geo.boundingBox.max.x - geo.boundingBox.min.x;
      const sign = new THREE.Mesh(geo, mBrass);
      sign.position.set(-w / 2, 3.3, ROOM.minZ + 0.04);
      sign.castShadow = true;
      sign.userData.forceReflect = true;
      group.add(sign);
    };
    // Single-file build injects the parsed typeface as window.__AG_FONT so there
    // is zero network dependency; the dev version falls back to the CDN.
    const inlined = typeof window !== 'undefined' && window.__AG_FONT;
    if (inlined) {
      try { buildSign(loader.parse(inlined)); } catch (e) { /* decorative */ }
    } else {
      loader.load('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/helvetiker_bold.typeface.json',
        buildSign, undefined, () => { /* sign is decorative — silent fail */ });
    }
  }

  flushBuckets();
  return { group };
}
