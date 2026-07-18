// main.js — boot, ctx assembly, module orchestration, intro cinematic, loop.

import * as THREE from 'three';
import { createEngine } from './engine.js';
import { TIME_WRAP, ROOM, surfaceAt } from './config.js';

const canvas = document.getElementById('scene');

function fatal(msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#0d0e10;color:#ece4d3;font:16px/1.6 Archivo,sans-serif;padding:2rem;text-align:center;z-index:99';
  el.innerHTML = msg;
  document.body.appendChild(el);
}

async function boot() {
  // WebGL2 gate
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) {
    fatal('<div><h2 style="font-family:Marcellus,serif;margin-bottom:1rem">Ahmad — The Gallery</h2>This experience needs WebGL2.<br>Please use a current version of Chrome, Edge, Firefox or Safari.</div>');
    return;
  }

  // canvas-text fonts must be resident before texture generation
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('400 32px Marcellus'),
        document.fonts.load('400 28px Archivo'),
        document.fonts.load('600 28px Archivo'),
        document.fonts.load('700 28px Archivo'),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (e) { /* fall back to system stacks */ }

  const engine = createEngine(canvas);

  const ctx = {
    THREE,
    scene: engine.scene,
    camera: engine.camera,
    renderer: engine.renderer,
    quality: engine.quality,
    tex: null,
    sunDir: engine.sunDir,
    colliders: [],
    interactables: [],
    updates: [],
    events: new EventTarget(),
    audio: null,
    player: null,
    lakeReflection: engine.lakeReflector.target.texture,
    engine,
  };
  window.__world = ctx;                      // debug handle
  const buildErrors = (window.__buildErrors = []);

  // ---------------------------------------------------------------- modules
  const { createUI } = await import('./ui.js');
  const ui = createUI(ctx);

  // rAF stalls in hidden tabs — always resolve via timeout fallback too
  const raf = () => new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });

  const steps = [
    ['materials', async () => {
      const { createTexFactory } = await import('./materials.js');
      ctx.tex = createTexFactory(THREE, ctx.quality);
    }],
    ['sky', async () => {
      const { createSky } = await import('./sky.js');
      engine.scene.add(createSky(ctx).group);
    }],
    ['landscape', async () => {
      const { createLandscape } = await import('./landscape.js');
      engine.scene.add(createLandscape(ctx).group);
    }],
    ['water', async () => {
      const { createWater } = await import('./water.js');
      engine.scene.add(createWater(ctx).group);
    }],
    ['exterior', async () => {
      const { createExterior } = await import('./exterior.js');
      engine.scene.add(createExterior(ctx).group);
    }],
    ['interior', async () => {
      const { createInterior } = await import('./interior.js');
      engine.scene.add(createInterior(ctx).group);
    }],
    ['decor-seating', async () => {
      const { createDecorSeating } = await import('./decor-seating.js');
      engine.scene.add(createDecorSeating(ctx).group);
    }],
    ['decor-study', async () => {
      const { createDecorStudy } = await import('./decor-study.js');
      engine.scene.add(createDecorStudy(ctx).group);
    }],
    ['gallery', async () => {
      const { createGallery } = await import('./gallery.js');
      engine.scene.add(createGallery(ctx).group);
    }],
    ['tv', async () => {
      const { createTV } = await import('./tv.js');
      engine.scene.add(createTV(ctx).group);
    }],
    ['player', async () => {
      const { createPlayer } = await import('./player.js');
      ctx.player = createPlayer(ctx);
    }],
  ];

  let done = 0;
  for (const [name, fn] of steps) {
    try {
      await fn();
    } catch (e) {
      console.error(`[build] ${name} failed:`, e);
      buildErrors.push({ name, error: e });
    }
    done++;
    ui.setProgress(done / (steps.length + 1));
    await raf();
  }

  // reflections & environment
  try {
    const floor = engine.scene.getObjectByName('glossFloor');
    if (floor) engine.attachFloorReflector(floor);
    else console.warn('[build] no glossFloor mesh found');
    engine.assignReflectionLayers();
  } catch (e) { console.error('[build] reflection setup failed', e); buildErrors.push({ name: 'reflections', error: e }); }

  // Prime shaders/shadows once at low cost before the env probe & reveal.
  engine.camera.position.set(0, 1.8, 5.5);
  engine.camera.lookAt(0, 1.6, -5);
  engine.renderer.compile(engine.scene, engine.camera);
  await raf();
  try { engine.probeEnvironment(new THREE.Vector3(0, 1.9, 5.2)); }
  catch (e) { console.error('[build] env probe failed', e); }

  ui.setProgress(1);
  if (buildErrors.length) {
    console.warn(`[build] completed with ${buildErrors.length} module failure(s)`, buildErrors.map(b => b.name));
  }

  // ---------------------------------------------------------------- audio (lazy)
  let audioStarting = false;
  async function ensureAudio() {
    if (ctx.audio || audioStarting) return;
    audioStarting = true;
    try {
      const { createAudio } = await import('./audio.js');
      ctx.audio = createAudio(ctx);
      // the async import breaks Safari's gesture chain — resume explicitly
      ctx.audio.resume();
      const muted = localStorage.getItem('ag-muted') === '1';
      ctx.audio.setMuted(muted);
    } catch (e) {
      console.error('[audio] init failed', e);
    }
  }

  // ---------------------------------------------------------------- intro
  const introPos = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 4.6, 58),
    new THREE.Vector3(-1.4, 3.4, 36),
    new THREE.Vector3(-0.6, 2.3, 16.5),
    new THREE.Vector3(0, 1.95, 8.6),
    new THREE.Vector3(0, 1.78, 3.4),
  ], false, 'centripetal');
  const introLook = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2.4, 10),
    new THREE.Vector3(0, 2.2, 4),
    new THREE.Vector3(0, 1.9, -2),
    new THREE.Vector3(0, 1.8, -5.5),
    new THREE.Vector3(0, 1.9, -5.5),
  ], false, 'centripetal');

  let mode = 'loading';               // loading → intro → play
  let introT = 0;
  const INTRO_LEN = 9.5;

  function endIntro() {
    if (mode !== 'intro') return;
    mode = 'play';
    engine.setLetterbox(0);
    engine.setFade(1);
    if (ctx.player) {
      ctx.player.teleport(0, 3.4, 0);         // yaw 0 faces -z (gallery wall)
      ctx.player.enabled = true;
    }
    ctx.events.dispatchEvent(new CustomEvent('intro-done'));
    ctx.events.dispatchEvent(new CustomEvent('request-lock'));
  }

  function startExperience() {
    ensureAudio();
    // Acquire pointer lock NOW, inside the enter-click's user-activation window.
    // (Requesting it after the ~9.5s intro fails — activation has expired — which
    // is the classic "mouse doesn't work until I click again" bug.) The lock is
    // held silently through the intro; look input only takes effect once play begins.
    if (ctx.player && ctx.player.lock) ctx.player.lock();
    mode = 'intro';
    introT = 0;
    engine.setLetterbox(1);
    engine.setFade(0);
    const skip = () => { endIntro(); cleanup(); };
    const cleanup = () => {
      window.removeEventListener('keydown', skip);
      canvas.removeEventListener('pointerdown', skip);
    };
    setTimeout(() => {
      window.addEventListener('keydown', skip);
      canvas.addEventListener('pointerdown', skip);
    }, 800);
  }

  ui.ready(startExperience);

  // ---------------------------------------------------------------- loop
  const clock = new THREE.Clock();
  let t = 0;
  const eyeTmp = new THREE.Vector3();
  let lastPos = new THREE.Vector3();

  function insideFactor() {
    if (!ctx.player) return 1;
    const p = ctx.player.pos;
    if (p.z < 4.4 && Math.abs(p.x) < ROOM.maxX) return 1;
    if (p.z > 6.8 || Math.abs(p.x) > ROOM.maxX + 0.4) return 0;
    return 1 - (p.z - 4.4) / (6.8 - 4.4);
  }

  function frame() {
    requestAnimationFrame(frame);
    tick(Math.min(0.05, clock.getDelta()));
  }

  // manual stepping for automated verification (hidden tabs freeze rAF)
  window.__step = (n = 60, dt = 1 / 60) => { for (let i = 0; i < n; i++) tick(dt); };

  function tick(dt) {
    t += dt;
    const tw = t % TIME_WRAP;

    if (mode === 'intro') {
      introT += dt;
      const k = Math.min(1, introT / INTRO_LEN);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;  // easeInOut
      engine.camera.position.copy(introPos.getPoint(e));
      engine.camera.lookAt(introLook.getPoint(e));
      engine.setFade(Math.min(1, introT / 2.2));
      engine.setLetterbox(k > 0.86 ? 1 - (k - 0.86) / 0.14 : 1);
      if (k >= 1) endIntro();
    }

    for (const fn of ctx.updates) {
      try { fn(dt, tw, t); } catch (e) { /* one bad update must not kill the frame */ }
    }

    if (ctx.player && mode === 'play') {
      ctx.player.update(dt, tw);
    }

    if (ctx.audio) {
      const p = ctx.player ? ctx.player.pos : engine.camera.position;
      const speed = lastPos.distanceTo(p) / Math.max(dt, 1e-4);
      lastPos.copy(p);
      engine.camera.getWorldDirection(eyeTmp);
      try {
        ctx.audio.update(dt, {
          pos: p,
          yawForward: eyeTmp,
          insideFac: insideFactor(),
          speed: Math.min(speed, 8),
          surface: surfaceAt(p.x, p.z),
          onDock: !!(ctx.player && ctx.player.onDock),
        });
      } catch (e) { /* keep rendering even if audio hiccups */ }
    }

    engine.render(dt, t);
  }

  if (mode === 'loading') {
    // idle camera drift while the enter screen shows
    engine.camera.position.set(0, 2.0, 12.5);
    engine.camera.lookAt(0, 1.8, 0);
  }
  frame();
}

boot().catch((e) => {
  console.error(e);
  fatal('<div><h2 style="font-family:Marcellus,serif;margin-bottom:1rem">Ahmad — The Gallery</h2>Something failed while building the world.<br>' + String(e).slice(0, 300) + '</div>');
});
