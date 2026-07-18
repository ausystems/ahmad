// decor-study.js — writing desk with the Skybound workstation, bookshelf,
// demilune consoles, oil paintings, drinks trolley. Seed 8000.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DESK, mulberry32 } from './config.js';
import { WORKS, STUDIO } from './data.js';

export function createDecorStudy(ctx) {
  const { tex } = ctx;
  const rnd = mulberry32(8001);
  const group = new THREE.Group();
  group.name = 'decor-study';

  const mWalnut = tex.std(tex.plank({ repeat: [0.9, 0.9] }), { color: 0x5e422a, roughness: 0.42 });
  const mWalnutDark = tex.std(tex.plank({ repeat: [0.6, 0.6] }), { color: 0x46311e, roughness: 0.5 });
  const mBrass = tex.std(tex.brass(), { metalness: 1, roughness: 0.28, envMapIntensity: 1.5 });
  const mBronze = tex.std(tex.bronze(), { metalness: 1, roughness: 0.42 });

  const collider = (x1, y1, z1, x2, y2, z2) => ctx.colliders.push({
    min: { x: Math.min(x1, x2), y: Math.min(y1, y2), z: Math.min(z1, z2) },
    max: { x: Math.max(x1, x2), y: Math.max(y1, y2), z: Math.max(z1, z2) },
  });

  // ---------------------------------------------------------------- desk
  {
    const d = new THREE.Group();
    d.position.set(...DESK.pos);
    d.rotation.y = DESK.rotY;
    group.add(d);
    const W = 1.5, D = 0.75, Hh = 0.76;
    // top with leather inset
    const top = new THREE.Mesh(new RoundedBoxGeometry(W, 0.04, D, 2, 0.012), mWalnut);
    top.position.y = Hh;
    top.castShadow = true;
    d.add(top);
    const mGreenLeather = tex.std(tex.leather({ repeat: [2, 1.2] }), { color: 0x2c4432, roughness: 0.6 });
    const inset = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.006, D - 0.24), mGreenLeather);
    inset.position.y = Hh + 0.021;
    d.add(inset);
    // apron + drawers with ring pulls
    const apron = new THREE.Mesh(new RoundedBoxGeometry(W - 0.06, 0.16, D - 0.06, 2, 0.01), mWalnutDark);
    apron.position.y = Hh - 0.1;
    d.add(apron);
    for (const dx of [-0.42, 0, 0.42]) {
      const face = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.11, 0.015, 2, 0.006), mWalnut);
      face.position.set(dx, Hh - 0.1, D / 2 - 0.025);
      d.add(face);
      const pull = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 14), mBrass);
      pull.position.set(dx, Hh - 0.11, D / 2 - 0.008);
      d.add(pull);
    }
    // tapered legs + brass sabots
    for (const [lx, lz] of [[-W / 2 + 0.07, -D / 2 + 0.07], [W / 2 - 0.07, -D / 2 + 0.07], [-W / 2 + 0.07, D / 2 - 0.07], [W / 2 - 0.07, D / 2 - 0.07]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.016, Hh - 0.18, 10), mWalnut);
      leg.position.set(lx, (Hh - 0.18) / 2, lz);
      leg.castShadow = true;
      d.add(leg);
      const sabot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.05, 10), mBrass);
      sabot.position.set(lx, 0.025, lz);
      d.add(sabot);
    }

    // ---- Skybound monitor
    const dashCanvas = tex.makeCanvas([1024, 640], (g, w, h) => {
      g.fillStyle = '#0c0d10'; g.fillRect(0, 0, w, h);
      // top bar
      g.fillStyle = '#14161b'; g.fillRect(0, 0, w, 64);
      g.fillStyle = '#c8a24a';
      g.font = '600 30px Archivo, sans-serif';
      g.textAlign = 'left';
      g.fillText('SKYBOUND SCALING®', 32, 42);
      g.fillStyle = '#5c6068';
      g.font = '20px Archivo, sans-serif';
      g.textAlign = 'right';
      g.fillText('studio dashboard — toronto', w - 32, 42);
      g.textAlign = 'left';
      // revenue sparkline card
      g.fillStyle = '#12141a'; g.fillRect(32, 92, 460, 240);
      g.strokeStyle = 'rgba(200,162,74,0.25)'; g.strokeRect(32, 92, 460, 240);
      g.fillStyle = '#8a8f98'; g.font = '18px Archivo, sans-serif';
      g.fillText('REVENUE — LAST 12 MONTHS', 56, 128);
      g.fillStyle = '#ece4d3'; g.font = '700 44px Archivo, sans-serif';
      g.fillText('$21,500', 56, 178);
      g.fillStyle = '#4a9a5c'; g.font = '600 20px Archivo, sans-serif';
      g.fillText('▲ 5 sites sold', 220, 178);
      const pr = mulberry32(8009);
      g.strokeStyle = '#c8a24a'; g.lineWidth = 3; g.beginPath();
      const vals = [3, 4.2, 3.6, 5, 6.2, 5.5, 7, 8.4, 7.8, 9.6, 11, 12.4];
      vals.forEach((v, i) => {
        const x = 56 + (i / 11) * 400, y = 310 - v * 8 - pr() * 4;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.stroke();
      // kanban chips
      g.fillStyle = '#12141a'; g.fillRect(524, 92, 468, 240);
      g.strokeStyle = 'rgba(200,162,74,0.25)'; g.strokeRect(524, 92, 468, 240);
      g.fillStyle = '#8a8f98'; g.font = '18px Archivo, sans-serif';
      g.fillText('PIPELINE', 548, 128);
      const cols = [['DISCOVERY', '#3a4a6b'], ['BUILD', '#6b5a2c'], ['LIVE', '#2c5a3a']];
      cols.forEach(([label, col], ci) => {
        const x = 548 + ci * 150;
        g.fillStyle = '#6a6f78'; g.font = '15px Archivo, sans-serif';
        g.fillText(label, x, 158);
        for (let r = 0; r < 3 - (ci === 1 ? 1 : 0); r++) {
          g.fillStyle = col;
          g.fillRect(x, 172 + r * 48, 128, 36);
          g.fillStyle = 'rgba(236,228,211,0.75)';
          g.font = '14px Archivo, sans-serif';
          const names = ['Callura', 'Orca Mgmt', 'Seen By Many', 'SaadiBuilds', 'Ecom Heroes'];
          g.fillText(names[(ci * 2 + r) % 5], x + 10, 195 + r * 48);
        }
      });
      // client palette swatches
      g.fillStyle = '#12141a'; g.fillRect(32, 360, 960, 130);
      g.strokeStyle = 'rgba(200,162,74,0.25)'; g.strokeRect(32, 360, 960, 130);
      g.fillStyle = '#8a8f98'; g.font = '18px Archivo, sans-serif';
      g.fillText('CLIENT SITES', 56, 396);
      WORKS.forEach((wk, i) => {
        const x = 56 + i * 188;
        const hues = ['#4a6b8a', '#8a5a3a', '#5a8a6b', '#6b4a8a', '#8a4a5a'];
        g.fillStyle = hues[i]; g.fillRect(x, 412, 160, 44);
        g.fillStyle = '#ece4d3'; g.font = '600 15px Archivo, sans-serif';
        g.fillText(wk.title, x + 10, 438);
      });
      // status line
      g.fillStyle = '#3a3f48'; g.font = '16px Archivo, sans-serif';
      g.fillText(`${STUDIO.name} — five sold builds live in the gallery`, 32, 560);
      g.fillStyle = '#c8a24a';
      g.fillText('● all systems nominal', 32, 594);
    });
    const dashTex = new THREE.CanvasTexture(dashCanvas);
    dashTex.colorSpace = THREE.SRGBColorSpace;
    dashTex.anisotropy = ctx.quality.aniso;
    const mon = new THREE.Group();
    mon.position.set(0, Hh + 0.02, -0.18);
    d.add(mon);
    const mDark = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.4, metalness: 0.5 });
    const stand = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.02, 0.14, 2, 0.008), mDark);
    stand.position.y = 0.01;
    mon.add(stand);
    const neck = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.16, 0.02, 2, 0.008), mDark);
    neck.position.set(0, 0.1, -0.02);
    mon.add(neck);
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.37, 0.024, 2, 0.006), mDark);
    bezel.position.set(0, 0.36, 0);
    bezel.castShadow = true;
    mon.add(bezel);
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x000000, roughness: 0.25,
      emissive: 0xffffff, emissiveMap: dashTex, emissiveIntensity: 1.4,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.585, 0.335), screenMat);
    screen.position.set(0, 0.36, 0.0135);
    screen.userData.forceReflect = true;
    mon.add(screen);

    // keyboard with instanced keycaps
    const kb = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.012, 0.14, 2, 0.005), mDark);
    kb.position.set(0, Hh + 0.028, 0.08);
    d.add(kb);
    const capGeo = new RoundedBoxGeometry(0.02, 0.006, 0.02, 1, 0.002);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x2a2c32, roughness: 0.6 });
    const nCaps = 15 * 5;
    const caps = new THREE.InstancedMesh(capGeo, capMat, nCaps);
    const cm = new THREE.Matrix4();
    let ci2 = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 15; c++) {
        cm.setPosition(-0.17 + c * 0.024 + (r % 2) * 0.005, Hh + 0.037, 0.028 + r * 0.026);
        caps.setMatrixAt(ci2++, cm);
      }
    }
    caps.instanceMatrix.needsUpdate = true;
    d.add(caps);
    const mouse = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.02, 0.09, 3, 0.01), mDark);
    mouse.position.set(0.28, Hh + 0.03, 0.1);
    d.add(mouse);

    // banker's lamp (allocated PointLight)
    const bl = new THREE.Group();
    bl.position.set(-0.52, Hh + 0.02, -0.15);
    d.add(bl);
    const bfoot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 14), mBrass);
    bl.add(bfoot);
    const bstem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 8), mBrass);
    bstem.position.y = 0.12;
    bl.add(bstem);
    const mGreenGlass = new THREE.MeshPhysicalMaterial({
      color: 0x1e5c34, transmission: 0.4, roughness: 0.2, emissive: 0x1e5c34, emissiveIntensity: 0.6,
    });
    const bshade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.08, 16, 1, false, 0, Math.PI), mGreenGlass);
    bshade.position.set(0, 0.24, 0.02);
    bshade.rotation.x = -0.2;
    bl.add(bshade);
    const bbulb = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 2.2, roughness: 1 }));
    bbulb.rotation.z = Math.PI / 2;
    bbulb.position.set(0, 0.22, 0.02);
    bl.add(bbulb);
    const pl = new THREE.PointLight(0xffd9a0, 5, 3, 2);
    pl.position.set(0, 0.2, 0.05);
    bl.add(pl);

    // notebook + pen + espresso + paperweight + phone
    const mNotebook = tex.std(tex.leather({ repeat: [1, 1] }), { color: 0x4a3828, roughness: 0.6 });
    const nb = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.012, 0.17, 2, 0.004), mNotebook);
    nb.position.set(0.14, Hh + 0.028, 0.24);
    nb.rotation.y = -0.2;
    d.add(nb);
    const pageCanvas = tex.makeCanvas([256, 180], (g, w, h) => {
      g.fillStyle = '#f2ecdc'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(60,60,70,0.5)'; g.lineWidth = 1.4;
      const pr2 = mulberry32(8011);
      for (let line = 0; line < 7; line++) {
        g.beginPath();
        let x = 22;
        const y = 26 + line * 22;
        g.moveTo(x, y);
        while (x < w - 30 - pr2() * 60) {
          x += 6 + pr2() * 10;
          g.lineTo(x, y + (pr2() - 0.5) * 5);
        }
        g.stroke();
      }
    });
    const pageTex = new THREE.CanvasTexture(pageCanvas);
    pageTex.colorSpace = THREE.SRGBColorSpace;
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.15),
      new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.85 }));
    page.rotation.x = -Math.PI / 2;
    page.rotation.z = -0.2;
    page.position.set(0.14, Hh + 0.036, 0.24);
    d.add(page);
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.004, 0.13, 8), mDark);
    pen.rotation.set(Math.PI / 2, 0, 0.9);
    pen.position.set(0.2, Hh + 0.036, 0.26);
    d.add(pen);
    const mPorcelain = tex.std(null, { color: 0xf2ede2, roughness: 0.25 });
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.008, 16), mPorcelain);
    saucer.position.set(-0.3, Hh + 0.026, 0.22);
    d.add(saucer);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.035, 14, 1, true), mPorcelain);
    cup.position.set(-0.3, Hh + 0.048, 0.22);
    d.add(cup);
    const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.004, 14), tex.std(null, { color: 0x2c1a0c, roughness: 0.3 }));
    coffee.position.set(-0.3, Hh + 0.06, 0.22);
    d.add(coffee);
    const pw = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), mBrass);
    pw.scale.y = 0.6;
    pw.position.set(0.45, Hh + 0.04, -0.1);
    d.add(pw);
    const phone = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.008, 0.145, 2, 0.004), mDark);
    phone.position.set(0.38, Hh + 0.026, 0.22);
    phone.rotation.y = 0.4;
    d.add(phone);

    // chair — pulled out, rotated
    const ch = new THREE.Group();
    ch.position.set(0.15, 0, 0.75);
    ch.rotation.y = DESK.rotY * 0 + 0.35;
    d.add(ch);
    const mChairLeather = tex.std(tex.leather({ repeat: [1.5, 1.5] }), { color: 0x3c2c20, roughness: 0.5 });
    const cseat = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.07, 0.44, 3, 0.025), mChairLeather);
    cseat.position.y = 0.46;
    cseat.castShadow = true;
    ch.add(cseat);
    const cback = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.4, 0.05, 3, 0.02), mChairLeather);
    cback.position.set(0, 0.72, 0.2);
    cback.rotation.x = 0.12;
    cback.castShadow = true;
    ch.add(cback);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.44, 8), mWalnutDark);
      leg.position.set(Math.cos(a) * 0.2, 0.22, Math.sin(a) * 0.2);
      leg.rotation.z = Math.cos(a) * 0.12;
      leg.rotation.x = -Math.sin(a) * 0.12;
      ch.add(leg);
    }
    collider(DESK.pos[0] - 1, 0, DESK.pos[2] - 0.8, DESK.pos[0] + 1, 1.1, DESK.pos[2] + 1.1);
  }

  // ---------------------------------------------------------------- bookshelf
  {
    const bs = new THREE.Group();
    bs.position.set(-8.72, 0, 3.6);
    bs.rotation.y = Math.PI / 2;
    group.add(bs);
    const W = 2.2, Hh = 1.1, D = 0.32;
    const carc = new THREE.Mesh(new RoundedBoxGeometry(W, Hh, D, 2, 0.01), mWalnutDark);
    carc.position.y = Hh / 2;
    carc.castShadow = true;
    bs.add(carc);
    // open bays
    const mShadowBox = new THREE.MeshStandardMaterial({ color: 0x1c140c, roughness: 0.9 });
    for (const bx of [-0.72, 0, 0.72]) {
      const bay = new THREE.Mesh(new THREE.BoxGeometry(0.64, Hh - 0.16, D - 0.06), mShadowBox);
      bay.position.set(bx, Hh / 2, 0.02);
      bs.add(bay);
    }
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.08, 0.025, D - 0.05), mWalnut);
    shelf.position.set(0, Hh / 2, 0.02);
    bs.add(shelf);
    // ~90 instanced books
    const bookGeo = new RoundedBoxGeometry(1, 1, 1, 1, 0.004);
    const palette = [0x2e3440, 0x6d1f24, 0x3a4a3c, 0x8a6f33, 0x4a3a5c, 0x24404f, 0x7c5844, 0xc9bfa8];
    const nBooks = 88;
    const books = new THREE.InstancedMesh(bookGeo, new THREE.MeshStandardMaterial({ roughness: 0.72 }), nBooks);
    const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), be = new THREE.Euler(), bv = new THREE.Vector3(), bsc = new THREE.Vector3();
    const bcol = new THREE.Color();
    let bi = 0;
    for (const row of [0.16 + (Hh - 0.16) * 0.25, 0.16 + (Hh - 0.16) * 0.75]) {
      for (const bx of [-0.72, 0, 0.72]) {
        let x = bx - 0.28;
        while (x < bx + 0.24 && bi < nBooks) {
          const bw = 0.02 + rnd() * 0.022;
          const bh = 0.17 + rnd() * 0.09;
          const lean = rnd() > 0.86 ? (rnd() - 0.5) * 0.22 : 0;
          if (rnd() > 0.93 && x < bx + 0.1) {
            // horizontal stack
            for (let s = 0; s < 3 && bi < nBooks; s++) {
              bv.set(x + 0.09, row - (Hh - 0.16) * 0.25 + 0.012 + s * 0.026, 0.02);
              be.set(0, rnd() * 0.1, Math.PI / 2);
              bq.setFromEuler(be);
              bsc.set(0.024, 0.24, 0.16);
              bm.compose(bv, bq, bsc);
              books.setMatrixAt(bi, bm);
              bcol.setHex(palette[Math.floor(rnd() * palette.length)]).multiplyScalar(0.8 + rnd() * 0.4);
              books.setColorAt(bi, bcol);
              bi++;
            }
            x += 0.2;
            continue;
          }
          bv.set(x + bw / 2, row - (Hh - 0.16) * 0.25 + bh / 2 + 0.012, 0.02 + (rnd() - 0.5) * 0.02);
          be.set(0, 0, lean);
          bq.setFromEuler(be);
          bsc.set(bw, bh, 0.15 + rnd() * 0.05);
          bm.compose(bv, bq, bsc);
          books.setMatrixAt(bi, bm);
          bcol.setHex(palette[Math.floor(rnd() * palette.length)]).multiplyScalar(0.8 + rnd() * 0.4);
          books.setColorAt(bi, bcol);
          bi++;
          x += bw + 0.004 + (lean ? 0.02 : 0);
        }
      }
    }
    books.count = bi;
    books.instanceMatrix.needsUpdate = true;
    if (books.instanceColor) books.instanceColor.needsUpdate = true;
    bs.add(books);
    // bronze sphere bookends + pothos + photo
    for (const ex of [-0.95, 0.95]) {
      const be2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), mBronze);
      be2.position.set(ex, Hh + 0.05, 0);
      bs.add(be2);
    }
    const mPothos = tex.std(null, { color: 0x3c6b34, roughness: 0.6, side: THREE.DoubleSide });
    const heartLeaf = () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(0.05, 0.03, 0.055, 0.09, 0, 0.115);
      s.bezierCurveTo(-0.055, 0.09, -0.05, 0.03, 0, 0);
      return new THREE.ShapeGeometry(s, 4);
    };
    const potP = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.13, 12), tex.std(null, { color: 0xd8d2c2, roughness: 0.6 }));
    potP.position.set(0.6, Hh + 0.065, 0);
    bs.add(potP);
    for (let vine = 0; vine < 3; vine++) {
      const va = -Math.PI / 2 + (vine - 1) * 0.7;
      const drop = 0.25 + rnd() * 0.35;
      const vpts = [
        new THREE.Vector3(0.6, Hh + 0.12, 0),
        new THREE.Vector3(0.6 + Math.cos(va) * 0.15, Hh + 0.05, 0.1 + Math.sin(va) * 0.08),
        new THREE.Vector3(0.6 + Math.cos(va) * 0.3, Hh - drop, 0.14 + Math.sin(va) * 0.1),
      ];
      const vineM = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vpts), 8, 0.004, 5), mPothos);
      bs.add(vineM);
      for (let li = 0; li < 5; li++) {
        const t = li / 4;
        const p = new THREE.CatmullRomCurve3(vpts).getPoint(t);
        const leaf = new THREE.Mesh(heartLeaf(), mPothos);
        leaf.position.copy(p);
        leaf.rotation.set(rnd() * 1.2 - 0.6, rnd() * Math.PI * 2, 0);
        leaf.scale.setScalar(0.8 + rnd() * 0.6);
        bs.add(leaf);
      }
    }
    const photoC = tex.makeCanvas([128, 96], (g, w, h) => {
      g.fillStyle = '#d9cdb4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3c5a7c'; g.fillRect(10, 10, w - 20, h - 34);
      g.fillStyle = '#e8e2d2';
      g.beginPath(); g.arc(w / 2, h / 2 - 6, 12, 0, 7); g.fill();
      g.fillStyle = '#2c2c2c'; g.font = '10px Archivo';
      g.textAlign = 'center'; g.fillText('CN Tower, 2024', w / 2, h - 9);
    });
    const photoT = new THREE.CanvasTexture(photoC);
    photoT.colorSpace = THREE.SRGBColorSpace;
    const photo = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.085, 0.008, 1, 0.003),
      new THREE.MeshStandardMaterial({ map: photoT, roughness: 0.5 }));
    photo.position.set(-0.55, Hh + 0.045, 0.02);
    photo.rotation.x = -0.1;
    photo.rotation.y = 0.2;
    bs.add(photo);
    collider(-9, 0, 2.45, -8.4, 1.3, 4.75);
  }

  // ---------------------------------------------------------------- demilune consoles (under east art)
  for (const czz of [-2.4, 0.9]) {
    const con = new THREE.Group();
    con.position.set(8.72, 0, czz);
    con.rotation.y = -Math.PI / 2;
    group.add(con);
    // half-moon top with marquetry fan
    const fanC = tex.makeCanvas(256, (g, w, h) => {
      g.fillStyle = '#5e422a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) {
        const a0 = Math.PI + (i / 18) * Math.PI, a1 = Math.PI + ((i + 1) / 18) * Math.PI;
        g.fillStyle = i % 2 ? '#6b4c30' : '#523823';
        g.beginPath();
        g.moveTo(w / 2, h);
        g.arc(w / 2, h, w / 2 - 6, a0, a1);
        g.closePath(); g.fill();
      }
      g.strokeStyle = '#c8a24a'; g.lineWidth = 3;
      g.beginPath(); g.arc(w / 2, h, w / 2 - 6, Math.PI, 0); g.stroke();
    });
    const fanT = new THREE.CanvasTexture(fanC);
    fanT.colorSpace = THREE.SRGBColorSpace;
    const topGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.035, 24, 1, false, 0, Math.PI);
    const top3 = new THREE.Mesh(topGeo, [
      mWalnut,
      new THREE.MeshStandardMaterial({ map: fanT, roughness: 0.35 }),
      mWalnut,
    ]);
    top3.position.y = 0.82;
    top3.castShadow = true;
    con.add(top3);
    const apron2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.09, 20, 1, true, 0, Math.PI), mWalnutDark);
    apron2.position.y = 0.76;
    con.add(apron2);
    for (const [a] of [[0.25], [Math.PI / 2], [Math.PI - 0.25]]) {
      // fluted legs
      const leg = new THREE.Group();
      leg.position.set(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36);
      con.add(leg);
      for (let f2 = 0; f2 < 6; f2++) {
        const fa = (f2 / 6) * Math.PI * 2;
        const flute = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.76, 6), mWalnut);
        flute.position.set(Math.cos(fa) * 0.012, 0.38, Math.sin(fa) * 0.012);
        leg.add(flute);
      }
      const sab = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.04, 8), mBrass);
      sab.position.y = 0.02;
      leg.add(sab);
    }
    collider(8.4, 0, czz - 0.48, 9, 0.95, czz + 0.48);

    if (czz === -2.4) {
      // ginger jar + orchid
      const jarC = tex.makeCanvas(256, (g, w, h) => {
        g.fillStyle = '#e8ecf0'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2c4a8a';
        const pr3 = mulberry32(8021);
        for (let i = 0; i < 8; i++) {
          const x = pr3() * w, y = pr3() * h;
          g.beginPath();
          g.ellipse(x, y, 14 + pr3() * 18, 8 + pr3() * 10, pr3() * 3, 0, 7);
          g.fill();
          g.beginPath();
          g.moveTo(x, y);
          g.quadraticCurveTo(x + 20, y - 24, x + 38, y - 18);
          g.lineWidth = 3; g.strokeStyle = '#2c4a8a'; g.stroke();
        }
      });
      const jarT = new THREE.CanvasTexture(jarC);
      jarT.colorSpace = THREE.SRGBColorSpace;
      const jar = new THREE.Mesh(new THREE.LatheGeometry(
        [[0.001, 0], [0.07, 0.005], [0.11, 0.09], [0.1, 0.2], [0.05, 0.26], [0.06, 0.3]].map(([r, y]) => new THREE.Vector2(r, y)), 18),
        new THREE.MeshStandardMaterial({ map: jarT, roughness: 0.15, envMapIntensity: 1.3 }));
      jar.position.set(0, 0.84, 0.12);
      jar.castShadow = true;
      con.add(jar);
      // orchid: arcing stems + white blooms
      const mStem = tex.std(null, { color: 0x4a6b30, roughness: 0.6 });
      const mBloom = tex.std(null, { color: 0xf4f0e8, roughness: 0.45, side: THREE.DoubleSide, emissive: 0x2a2620, emissiveIntensity: 0.1 });
      const mThroat = tex.std(null, { color: 0xb03a6b, roughness: 0.5 });
      for (const sd of [-1, 1]) {
        const spts = [
          new THREE.Vector3(0, 1.1, 0.12),
          new THREE.Vector3(sd * 0.1, 1.32, 0.1),
          new THREE.Vector3(sd * 0.24, 1.42, 0.08),
        ];
        con.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spts), 8, 0.004, 5), mStem));
        for (let b = 0; b < 3; b++) {
          const p = new THREE.CatmullRomCurve3(spts).getPoint(0.45 + b * 0.26);
          const bloom = new THREE.Group();
          bloom.position.copy(p);
          bloom.rotation.set(rnd() * 0.6, rnd() * Math.PI, 0);
          con.add(bloom);
          for (let pt = 0; pt < 5; pt++) {
            const pa = (pt / 5) * Math.PI * 2;
            const petal = new THREE.Mesh(new THREE.CircleGeometry(0.028, 6), mBloom);
            petal.scale.set(0.6, 1, 1);
            petal.position.set(Math.cos(pa) * 0.02, Math.sin(pa) * 0.02, 0);
            petal.rotation.z = pa - Math.PI / 2;
            bloom.add(petal);
          }
          const throat = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), mThroat);
          throat.position.z = 0.005;
          bloom.add(throat);
        }
      }
      // strap leaves at jar mouth
      for (let li = 0; li < 4; li++) {
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.2, 1, 4), mStem);
        const lp = leaf.geometry.attributes.position;
        for (let j = 0; j < lp.count; j++) lp.setZ(j, -((lp.getY(j) + 0.1) ** 2) * 1.4);
        leaf.geometry.computeVertexNormals();
        leaf.position.set((rnd() - 0.5) * 0.1, 1.12, 0.12 + (rnd() - 0.5) * 0.08);
        leaf.rotation.set(0.4 + rnd() * 0.5, rnd() * Math.PI * 2, 0, 'YXZ');
        con.add(leaf);
      }
    } else {
      // candlesticks + books + key bowl
      for (const cxx of [-0.16, -0.06]) {
        const stick = new THREE.Mesh(new THREE.LatheGeometry(
          [[0.001, 0], [0.04, 0.004], [0.012, 0.03], [0.02, 0.14 + (cxx === -0.16 ? 0.05 : 0)], [0.012, 0.17 + (cxx === -0.16 ? 0.05 : 0)], [0.022, 0.18 + (cxx === -0.16 ? 0.05 : 0)]].map(([r, y]) => new THREE.Vector2(r, y)), 12), mBrass);
        stick.position.set(cxx, 0.84, -0.1);
        stick.castShadow = true;
        con.add(stick);
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.09, 8), tex.std(null, { color: 0xece2cc, roughness: 0.5 }));
        candle.position.set(cxx, 0.84 + 0.22 + (cxx === -0.16 ? 0.05 : 0), -0.1);
        con.add(candle);
      }
      const b1 = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.03, 0.15, 1, 0.005), tex.std(null, { color: 0x2e3440, roughness: 0.7 }));
      b1.position.set(0.14, 0.85, 0.08);
      b1.rotation.y = 0.2;
      con.add(b1);
      const b2 = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.025, 0.13, 1, 0.005), tex.std(null, { color: 0x6d1f24, roughness: 0.7 }));
      b2.position.set(0.14, 0.878, 0.08);
      b2.rotation.y = 0.05;
      con.add(b2);
      const bowl2 = new THREE.Mesh(new THREE.LatheGeometry(
        [[0.001, 0], [0.05, 0.004], [0.07, 0.03], [0.075, 0.045]].map(([r, y]) => new THREE.Vector2(r, y)), 14), mBronze);
      bowl2.position.set(-0.02, 0.84, 0.14);
      con.add(bowl2);
      for (let k = 0; k < 3; k++) {
        const key = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 5, 10), mBrass);
        key.position.set(-0.02 + (rnd() - 0.5) * 0.05, 0.86, 0.14 + (rnd() - 0.5) * 0.05);
        key.rotation.set(Math.PI / 2 + rnd() * 0.4, 0, rnd() * Math.PI);
        con.add(key);
      }
    }
  }

  // ---------------------------------------------------------------- oil paintings
  function oilPainting(w, h, seed) {
    const pr4 = mulberry32(seed);
    const c = tex.makeCanvas([Math.round(w * 400), Math.round(h * 400)], (g, cw, chh) => {
      // sky
      const sky = g.createLinearGradient(0, 0, 0, chh * 0.7);
      sky.addColorStop(0, '#c9a96b');
      sky.addColorStop(0.5, '#e0bd8a');
      sky.addColorStop(1, '#f0d8a8');
      g.fillStyle = sky; g.fillRect(0, 0, cw, chh);
      // distant mountains
      g.fillStyle = '#8a7a5c';
      g.beginPath();
      g.moveTo(0, chh * 0.5);
      for (let x = 0; x <= cw; x += cw / 12) {
        g.lineTo(x, chh * (0.42 + Math.sin(x * 0.02 + seed) * 0.06 + pr4() * 0.04));
      }
      g.lineTo(cw, chh); g.lineTo(0, chh); g.fill();
      // castle ruin silhouette
      g.fillStyle = '#6b5c42';
      const cx2 = cw * (0.3 + pr4() * 0.4);
      g.fillRect(cx2, chh * 0.34, cw * 0.06, chh * 0.16);
      g.fillRect(cx2 + cw * 0.05, chh * 0.4, cw * 0.09, chh * 0.1);
      for (let i = 0; i < 4; i++) g.fillRect(cx2 + i * cw * 0.015, chh * 0.325, cw * 0.008, chh * 0.02);
      // lake band
      g.fillStyle = '#b8a878';
      g.fillRect(0, chh * 0.62, cw, chh * 0.16);
      g.fillStyle = 'rgba(240,220,170,0.5)';
      g.fillRect(cx2 - cw * 0.05, chh * 0.63, cw * 0.2, chh * 0.05);
      // dark foreground trees
      g.fillStyle = '#3c3626';
      g.beginPath();
      g.moveTo(0, chh);
      for (let x = 0; x <= cw; x += cw / 8) {
        g.lineTo(x, chh * (0.75 + pr4() * 0.12));
      }
      g.lineTo(cw, chh); g.fill();
      for (let i = 0; i < 3; i++) {  // tree clumps
        const tx2 = pr4() * cw;
        g.beginPath();
        g.ellipse(tx2, chh * 0.72, cw * 0.05, chh * 0.1, 0, 0, 7);
        g.fill();
      }
      // warm glaze + craquelure
      g.fillStyle = 'rgba(160,110,40,0.12)';
      g.fillRect(0, 0, cw, chh);
      g.strokeStyle = 'rgba(60,50,30,0.16)';
      g.lineWidth = 0.7;
      for (let i = 0; i < 40; i++) {
        g.beginPath();
        let x = pr4() * cw, y = pr4() * chh;
        g.moveTo(x, y);
        for (let s2 = 0; s2 < 4; s2++) {
          x += (pr4() - 0.5) * 30; y += (pr4() - 0.5) * 30;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ctx.quality.aniso;
    return t;
  }

  function hangPainting(w, h, seed, x, y, z, rotY) {
    const g2 = new THREE.Group();
    g2.position.set(x, y, z);
    g2.rotation.y = rotY;
    group.add(g2);
    // gilt frame with corner rosettes
    const mGilt = tex.std(tex.brass(), { metalness: 0.9, roughness: 0.35, color: 0xd8b254 });
    for (const [fw, fh, fx, fy] of [
      [w + 0.16, 0.09, 0, h / 2 + 0.045], [w + 0.16, 0.09, 0, -h / 2 - 0.045],
      [0.09, h, w / 2 + 0.045, 0], [0.09, h, -w / 2 - 0.045, 0],
    ]) {
      const f = new THREE.Mesh(new RoundedBoxGeometry(fw, fh, 0.055, 2, 0.012), mGilt);
      f.position.set(fx, fy, 0.01);
      f.castShadow = true;
      g2.add(f);
    }
    for (const [rx2, ry2] of [[-w / 2 - 0.045, h / 2 + 0.045], [w / 2 + 0.045, h / 2 + 0.045], [-w / 2 - 0.045, -h / 2 - 0.045], [w / 2 + 0.045, -h / 2 - 0.045]]) {
      const ros = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mGilt);
      ros.scale.z = 0.5;
      ros.position.set(rx2, ry2, 0.02);
      g2.add(ros);
    }
    const canvasM = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: oilPainting(w, h, seed), roughness: 0.55 }));
    canvasM.position.z = 0.012;
    g2.add(canvasM);
    // brass picture light (emissive only)
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, w * 0.6, 10, 1, false, 0, Math.PI), mBrass);
    hood.rotation.z = Math.PI / 2;
    hood.rotation.y = Math.PI;
    hood.position.set(0, h / 2 + 0.17, 0.09);
    g2.add(hood);
    const strip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, w * 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffe2b8, emissiveIntensity: 1.3, roughness: 1 }));
    strip.rotation.z = Math.PI / 2;
    strip.position.set(0, h / 2 + 0.155, 0.1);
    g2.add(strip);
    const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), mBrass);
    arm2.rotation.x = Math.PI / 3.2;
    arm2.position.set(0, h / 2 + 0.22, 0.045);
    g2.add(arm2);
  }

  // west wall above the bookshelf; south pier between center & east glazing
  hangPainting(0.9, 0.7, 8101, -8.92, 2.15, 3.6, Math.PI / 2);
  hangPainting(0.7, 0.9, 8102, 2.6, 2.1, 5.42, Math.PI);

  // ---------------------------------------------------------------- drinks trolley
  {
    const tr = new THREE.Group();
    tr.position.set(8.2, 0, 1.95);
    tr.rotation.y = -Math.PI / 2 + 0.25;
    group.add(tr);
    const mGlassShelf = new THREE.MeshPhysicalMaterial({ color: 0xf8fbfa, transmission: 0.9, roughness: 0.04, thickness: 0.008, envMapIntensity: 1.4 });
    for (const sy of [0.28, 0.68]) {
      const shelf2 = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.016, 0.4, 2, 0.006), mGlassShelf);
      shelf2.position.y = sy;
      tr.add(shelf2);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.008, 6, 4), mBrass);
      rim.rotation.x = Math.PI / 2;
      rim.rotation.z = Math.PI / 4;
      rim.scale.set(1.28, 0.8, 1);
      rim.position.y = sy + 0.02;
      tr.add(rim);
    }
    for (const [px3, pz3] of [[-0.3, -0.17], [0.3, -0.17], [-0.3, 0.17], [0.3, 0.17]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.72, 8), mBrass);
      post.position.set(px3, 0.36, pz3);
      tr.add(post);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12), mBronze);
      wheel.position.set(px3, 0.035, pz3);
      tr.add(wheel);
    }
    // bottles + tumblers + siphon
    const bottleSpecs = [
      [0xa8641e, 0.2, 0.032], [0x2c5a2e, 0.24, 0.03], [0x8a3a2c, 0.17, 0.035],
    ];
    bottleSpecs.forEach(([col, bh, br], i) => {
      const mB = new THREE.MeshPhysicalMaterial({ color: col, transmission: 0.55, roughness: 0.08, envMapIntensity: 1.4 });
      const b = new THREE.Mesh(new THREE.LatheGeometry(
        [[0.001, 0], [br, 0.004], [br, bh * 0.6], [br * 0.4, bh * 0.8], [br * 0.35, bh], [br * 0.42, bh + 0.01]].map(([r, y]) => new THREE.Vector2(r, y)), 12), mB);
      b.position.set(-0.2 + i * 0.14, 0.7, -0.08);
      b.castShadow = true;
      tr.add(b);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(br + 0.002, br + 0.002, bh * 0.3, 10, 1, true),
        tex.std(tex.paper(), { roughness: 0.8 }));
      label.position.set(-0.2 + i * 0.14, 0.7 + bh * 0.3, -0.08);
      tr.add(label);
    });
    const mCrystal2 = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.92, roughness: 0.04, thickness: 0.006, envMapIntensity: 1.6 });
    for (let i = 0; i < 4; i++) {
      const tum = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.075, 10, 1, true), mCrystal2);
      tum.position.set(-0.15 + (i % 2) * 0.09, 0.32, 0.05 + Math.floor(i / 2) * 0.1);
      tr.add(tum);
    }
    const siphon = new THREE.Mesh(new THREE.LatheGeometry(
      [[0.001, 0], [0.04, 0.005], [0.045, 0.16], [0.02, 0.2], [0.02, 0.23]].map(([r, y]) => new THREE.Vector2(r, y)), 12),
      new THREE.MeshPhysicalMaterial({ color: 0x3a6b8a, transmission: 0.5, roughness: 0.1, metalness: 0.2 }));
    siphon.position.set(0.22, 0.7, 0.1);
    tr.add(siphon);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.05, 8), mBrass);
    nozzle.position.set(0.22, 0.95, 0.1);
    tr.add(nozzle);
    collider(7.85, 0, 1.5, 8.55, 1.0, 2.4);
  }

  return { group };
}
