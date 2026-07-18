// audio.js — procedural spatial audio: wind, lake, birds, room tone, fire,
// per-surface footsteps, door creaks, TV spatialization. No sample files —
// everything is synthesized. Created after a user gesture. Seed 11000.

import { SHORE_Z, mulberry32 } from './config.js';

export function createAudio(ctx) {
  const A = new (window.AudioContext || window.webkitAudioContext)();
  const rnd = mulberry32(11001);
  let muted = false;

  // ---------------------------------------------------------------- graph
  const master = A.createGain();
  master.gain.value = 0.5;
  // soft limiter
  const limiter = A.createWaveShaper();
  {
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.4) / Math.tanh(1.4);
    }
    limiter.curve = curve;
    limiter.oversample = '2x';
  }
  limiter.connect(master);
  master.connect(A.destination);

  // interior & exterior buses with occlusion lowpass each
  const busIn = A.createGain(); const lpIn = A.createBiquadFilter();
  const busEx = A.createGain(); const lpEx = A.createBiquadFilter();
  lpIn.type = 'lowpass'; lpIn.frequency.value = 20000;
  lpEx.type = 'lowpass'; lpEx.frequency.value = 20000;
  busIn.connect(lpIn); lpIn.connect(limiter);
  busEx.connect(lpEx); lpEx.connect(limiter);
  // direct bus (footsteps/ui — never occluded)
  const busDirect = A.createGain();
  busDirect.connect(limiter);

  // ---------------------------------------------------------------- noise
  const noiseBuf = A.createBuffer(2, A.sampleRate * 2, A.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = noiseBuf.getChannelData(ch);
    let pink = 0;
    for (let i = 0; i < d.length; i++) {
      const w = rnd() * 2 - 1;
      pink = pink * 0.94 + w * 0.06;          // cheap pinkening
      d[i] = pink * 2.8;
    }
  }
  function noiseSource(loop = true) {
    const s = A.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = loop;
    return s;
  }
  function panner(x, y, z, refDist = 2, rolloff = 1.4) {
    const p = A.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDist;
    p.rolloffFactor = rolloff;
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    return p;
  }

  // ---------------------------------------------------------------- wind bed
  const windGain = A.createGain(); windGain.gain.value = 0;
  {
    for (const detune of [0, 7]) {          // two decorrelated channels
      const src = noiseSource();
      src.playbackRate.value = 0.6 + detune * 0.01;
      const bp = A.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 420 + detune * 40; bp.Q.value = 0.55;
      const pan = A.createStereoPanner();
      pan.pan.value = detune ? 0.5 : -0.5;
      const g = A.createGain(); g.gain.value = 0.5;
      src.connect(bp); bp.connect(g); g.connect(pan); pan.connect(windGain);
      src.start();
      // slow LFO on filter freq for movement
      const lfo = A.createOscillator(); lfo.frequency.value = 0.07 + detune * 0.013;
      const lfoG = A.createGain(); lfoG.gain.value = 160;
      lfo.connect(lfoG); lfoG.connect(bp.frequency); lfo.start();
    }
    windGain.connect(busEx);
  }

  // ---------------------------------------------------------------- lake lap
  let lakeTick;
  const lakePan = panner(0, -1.5, SHORE_Z, 3, 1.2);
  const lakeGain = A.createGain(); lakeGain.gain.value = 0;
  {
    const src = noiseSource();
    src.playbackRate.value = 0.32;
    const lp = A.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 640; lp.Q.value = 0.8;
    const lapLfoGain = A.createGain(); lapLfoGain.gain.value = 0;
    src.connect(lp); lp.connect(lapLfoGain); lapLfoGain.connect(lakeGain);
    lakeGain.connect(lakePan); lakePan.connect(busEx);
    src.start();
    // wave cycles ~2.8s with randomized depth
    let t2 = 0;
    lakeTick = (dt2) => {
      t2 -= dt2;
      if (t2 <= 0) {
        t2 = 2.2 + rnd() * 1.4;
        const peak = 0.5 + rnd() * 0.5;
        const now = A.currentTime;
        lapLfoGain.gain.cancelScheduledValues(now);
        lapLfoGain.gain.setTargetAtTime(peak, now, 0.55);
        lapLfoGain.gain.setTargetAtTime(0.12, now + 0.9, 0.8);
      }
    };
  }

  // ---------------------------------------------------------------- birds
  const birdBus = A.createGain(); birdBus.gain.value = 0.9;
  birdBus.connect(busEx);
  const birdSpots = [
    [-10, 3, 18], [11, 4, 22], [-7, 5, 30], [6, 3, 15],
  ].map(([x, y, z]) => {
    const p = panner(x, y, z, 4, 1.3);
    p.connect(birdBus);
    return { pan: p, next: 2 + rnd() * 8 };
  });
  function chirp(pan) {
    if (muted) return;
    const species = Math.floor(rnd() * 3);
    const base = [2600, 3400, 1900][species];
    const nNotes = 2 + Math.floor(rnd() * (species === 2 ? 5 : 3));
    let t3 = A.currentTime + 0.02;
    for (let i = 0; i < nNotes; i++) {
      const o = A.createOscillator();
      o.type = 'sine';
      const g = A.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(pan);
      const f0 = base * (0.9 + rnd() * 0.25);
      const len = 0.05 + rnd() * 0.09;
      o.frequency.setValueAtTime(f0, t3);
      o.frequency.exponentialRampToValueAtTime(f0 * (species === 1 ? 1.5 : 0.72), t3 + len);
      g.gain.setValueAtTime(0, t3);
      g.gain.linearRampToValueAtTime(0.11 + rnd() * 0.06, t3 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t3 + len);
      o.start(t3); o.stop(t3 + len + 0.02);
      t3 += len + 0.03 + rnd() * 0.12;
    }
  }

  // ---------------------------------------------------------------- room tone
  const roomGain = A.createGain(); roomGain.gain.value = 0;
  {
    const src = noiseSource();
    src.playbackRate.value = 0.18;
    const lp = A.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 240;
    const hum = A.createOscillator(); hum.frequency.value = 58; hum.type = 'sine';
    const humG = A.createGain(); humG.gain.value = 0.012;
    src.connect(lp); lp.connect(roomGain);
    hum.connect(humG); humG.connect(roomGain);
    roomGain.connect(busIn);
    src.start(); hum.start();
  }

  // ---------------------------------------------------------------- fireplace
  const firePan = panner(8.8, 0.6, 3.8, 1.6, 1.8);
  const fireGain = A.createGain(); fireGain.gain.value = 0;
  {
    const src = noiseSource();
    src.playbackRate.value = 0.5;
    const hp = A.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1800;
    const hiss = A.createGain(); hiss.gain.value = 0.05;
    src.connect(hp); hp.connect(hiss); hiss.connect(fireGain);
    fireGain.connect(firePan); firePan.connect(busIn);
    src.start();
  }
  let fireCrackleT = 0;
  function crackle() {
    if (muted) return;
    const t3 = A.currentTime;
    const src = noiseSource();
    src.loop = false;
    src.playbackRate.value = 1.6 + rnd() * 1.6;
    const bp = A.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + rnd() * 2400;
    bp.Q.value = 6 + rnd() * 10;
    const g = A.createGain();
    g.gain.setValueAtTime(0.20 + rnd() * 0.22, t3);
    g.gain.exponentialRampToValueAtTime(0.001, t3 + 0.04 + rnd() * 0.05);
    src.connect(bp); bp.connect(g); g.connect(firePan);
    src.start(t3, rnd() * 1.5, 0.1);
  }

  // ---------------------------------------------------------------- footsteps
  const SURF = {
    wood:   { f: 240, q: 1.1, len: 0.085, vol: 0.22, thump: 0.5, hp: 90 },
    rug:    { f: 150, q: 0.7, len: 0.075, vol: 0.10, thump: 0.35, hp: 60 },
    stone:  { f: 900, q: 1.6, len: 0.07, vol: 0.24, thump: 0.4, hp: 160 },
    grass:  { f: 1600, q: 0.5, len: 0.13, vol: 0.11, thump: 0.15, hp: 500 },
    gravel: { f: 1900, q: 0.9, len: 0.16, vol: 0.20, thump: 0.2, hp: 400 },
    dock:   { f: 190, q: 2.2, len: 0.11, vol: 0.24, thump: 0.6, hp: 70 },
  };
  function footstep(surface, running) {
    if (muted) return;
    if (A.state !== 'running') return;
    const s = SURF[surface] || SURF.wood;
    const t3 = A.currentTime;
    const v = s.vol * (running ? 1.35 : 1) * (0.9 + rnd() * 0.2);
    // main texture burst
    const src = noiseSource(); src.loop = false;
    src.playbackRate.value = 0.9 + rnd() * 0.25;
    const bp = A.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = s.f * (0.9 + rnd() * 0.25); bp.Q.value = s.q;
    const hp = A.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = s.hp;
    const g = A.createGain();
    g.gain.setValueAtTime(v, t3);
    g.gain.exponentialRampToValueAtTime(0.001, t3 + s.len * (running ? 0.8 : 1));
    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(busDirect);
    src.start(t3, rnd() * 1.4, s.len + 0.05);
    // low thump
    const o = A.createOscillator();
    o.frequency.setValueAtTime(70 + rnd() * 18, t3);
    o.frequency.exponentialRampToValueAtTime(38, t3 + 0.07);
    const og = A.createGain();
    og.gain.setValueAtTime(v * s.thump, t3);
    og.gain.exponentialRampToValueAtTime(0.001, t3 + 0.08);
    o.connect(og); og.connect(busDirect);
    o.start(t3); o.stop(t3 + 0.1);
    // gravel gets extra grain cluster; dock a faint slosh
    if (surface === 'gravel') {
      for (let i = 0; i < 3; i++) {
        const gs = noiseSource(); gs.loop = false;
        gs.playbackRate.value = 1.4 + rnd();
        const gbp = A.createBiquadFilter();
        gbp.type = 'bandpass'; gbp.frequency.value = 2400 + rnd() * 2200; gbp.Q.value = 3;
        const gg = A.createGain();
        const tt = t3 + 0.015 + i * (0.02 + rnd() * 0.02);
        gg.gain.setValueAtTime(v * 0.5, tt);
        gg.gain.exponentialRampToValueAtTime(0.001, tt + 0.04);
        gs.connect(gbp); gbp.connect(gg); gg.connect(busDirect);
        gs.start(tt, rnd() * 1.6, 0.06);
      }
    } else if (surface === 'dock') {
      const ws = noiseSource(); ws.loop = false;
      ws.playbackRate.value = 0.3;
      const wlp = A.createBiquadFilter();
      wlp.type = 'lowpass'; wlp.frequency.value = 500;
      const wg = A.createGain();
      wg.gain.setValueAtTime(0.001, t3 + 0.05);
      wg.gain.linearRampToValueAtTime(v * 0.25, t3 + 0.12);
      wg.gain.exponentialRampToValueAtTime(0.001, t3 + 0.3);
      ws.connect(wlp); wlp.connect(wg); wg.connect(busDirect);
      ws.start(t3 + 0.05, rnd(), 0.3);
    } else if (surface === 'wood' && rnd() > 0.82) {
      // occasional creak
      const o2 = A.createOscillator();
      o2.type = 'sawtooth';
      const f0 = 170 + rnd() * 120;
      o2.frequency.setValueAtTime(f0, t3 + 0.02);
      o2.frequency.linearRampToValueAtTime(f0 * (1.1 + rnd() * 0.3), t3 + 0.14);
      const cg = A.createGain();
      cg.gain.setValueAtTime(0, t3 + 0.02);
      cg.gain.linearRampToValueAtTime(v * 0.12, t3 + 0.06);
      cg.gain.exponentialRampToValueAtTime(0.001, t3 + 0.17);
      const clp = A.createBiquadFilter();
      clp.type = 'lowpass'; clp.frequency.value = 900;
      o2.connect(clp); clp.connect(cg); cg.connect(busDirect);
      o2.start(t3 + 0.02); o2.stop(t3 + 0.2);
    }
  }

  // ---------------------------------------------------------------- door creak
  const doorPan = panner(0, 1.6, 5.5, 2, 1.5);
  doorPan.connect(busDirect);
  function doorCreak(opening) {
    if (muted) return;
    if (A.state !== 'running') return;
    const t3 = A.currentTime;
    // low groan
    const o = A.createOscillator();
    o.type = 'sawtooth';
    const f0 = opening ? 96 : 120;
    o.frequency.setValueAtTime(f0, t3);
    o.frequency.linearRampToValueAtTime(opening ? 140 : 82, t3 + 0.7);
    const lp = A.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2.5;
    const g = A.createGain();
    g.gain.setValueAtTime(0, t3);
    g.gain.linearRampToValueAtTime(0.05, t3 + 0.12);
    g.gain.setTargetAtTime(0.015, t3 + 0.4, 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t3 + 1.0);
    o.connect(lp); lp.connect(g); g.connect(doorPan);
    o.start(t3); o.stop(t3 + 1.1);
    // latch tick
    const src = noiseSource(); src.loop = false;
    const bp = A.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 8;
    const tg = A.createGain();
    const tt = t3 + (opening ? 0.03 : 0.65);
    tg.gain.setValueAtTime(0.12, tt);
    tg.gain.exponentialRampToValueAtTime(0.001, tt + 0.05);
    src.connect(bp); bp.connect(tg); tg.connect(doorPan);
    src.start(tt, rnd(), 0.06);
  }

  function uiClick() {
    if (muted) return;
    if (A.state !== 'running') return;
    const t3 = A.currentTime;
    const o = A.createOscillator();
    o.frequency.value = 1400;
    const g = A.createGain();
    g.gain.setValueAtTime(0.05, t3);
    g.gain.exponentialRampToValueAtTime(0.001, t3 + 0.05);
    o.connect(g); g.connect(busDirect);
    o.start(t3); o.stop(t3 + 0.06);
  }

  // ------------------------------------------------------------- resume glue
  // Safari/iOS can start or fall 'suspended' (gesture token lost across the
  // dynamic import, audio-session interruptions). Recover on any signal.
  let resumeT = 0;
  function tryResume() {
    if (A.state !== 'running') A.resume().catch(() => {});
  }
  A.onstatechange = () => { if (A.state === 'suspended') tryResume(); };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryResume();
  });
  window.addEventListener('pointerdown', tryResume);
  window.addEventListener('keydown', tryResume);

  // ---------------------------------------------------------------- update
  let birdMute = 0;
  function update(dt, s) {
    if (A.state !== 'running') {
      resumeT -= dt;
      if (resumeT <= 0) { resumeT = 2; tryResume(); }
      return;
    }
    const now = A.currentTime;
    const p = s.pos, f = s.yawForward;
    const L = A.listener;
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, now, 0.05);
      L.positionY.setTargetAtTime(p.y + 1.6, now, 0.05);
      L.positionZ.setTargetAtTime(p.z, now, 0.05);
      L.forwardX.setTargetAtTime(f.x, now, 0.05);
      L.forwardY.setTargetAtTime(f.y, now, 0.05);
      L.forwardZ.setTargetAtTime(f.z, now, 0.05);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else if (L.setPosition) {
      L.setPosition(p.x, p.y + 1.6, p.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
    const inF = s.insideFac;
    // bus mix + occlusion
    busEx.gain.setTargetAtTime(0.25 + (1 - inF) * 0.75, now, 0.2);
    lpEx.frequency.setTargetAtTime(20000 - inF * 19000 + 800, now, 0.25);
    busIn.gain.setTargetAtTime(0.2 + inF * 0.8, now, 0.2);
    lpIn.frequency.setTargetAtTime(20000 - (1 - inF) * 17000 + 600, now, 0.25);
    // wind level breathes
    windGain.gain.setTargetAtTime(0.05 + (1 - inF) * 0.1, now, 0.4);
    // lake: nearest-shore panner + louder on dock
    lakePan.positionX.setTargetAtTime(Math.max(-20, Math.min(20, p.x)), now, 0.3);
    lakePan.positionZ.value = Math.max(SHORE_Z, Math.min(46, p.z + 3));
    lakeGain.gain.setTargetAtTime(s.onDock ? 0.55 : 0.3, now, 0.3);
    lakeTick?.(dt);
    // room tone + fire only meaningful inside
    roomGain.gain.setTargetAtTime(0.035 * inF, now, 0.4);
    fireGain.gain.setTargetAtTime(0.5 * inF, now, 0.4);
    fireCrackleT -= dt;
    if (fireCrackleT <= 0) {
      fireCrackleT = 0.12 + rnd() * 0.7;
      if (inF > 0.15) crackle();
    }
    // birds outside
    birdMute = inF;
    for (const b of birdSpots) {
      b.next -= dt;
      if (b.next <= 0) {
        b.next = 4 + rnd() * 10;
        if (birdMute < 0.7) chirp(b.pan);
      }
    }
  }

  // ---------------------------------------------------------------- api
  return {
    ctxA: A,
    master,
    resume() { if (A.state === 'suspended') A.resume(); },
    setMuted(b) {
      muted = b;
      master.gain.setTargetAtTime(b ? 0 : 0.5, A.currentTime, 0.1);
    },
    get muted() { return muted; },
    update, footstep, doorCreak, uiClick,
  };
}
