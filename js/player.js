// player.js — first-person controller: damped movement, procedural camera
// motion (bob/breath/tilt/inertia), capsule-vs-AABB collision, interaction
// raycasts, pointer lock + touch fallback. Seed 12000.

import * as THREE from 'three';
import {
  ROOM, TERRACE, BOUNDS, DOCK, groundHeight, surfaceAt, mulberry32,
} from './config.js';

const WALK = 3.4, RUN = 5.6, ACCEL = 26;
const EYE = 1.7, RADIUS = 0.32;

export function createPlayer(ctx) {
  const cam = ctx.camera;
  const rnd = mulberry32(12001);

  // fixed micro-noise table for idle sway (loops seamlessly)
  const swayN = new Float32Array(256);
  for (let i = 0; i < 256; i++) swayN[i] = rnd() - 0.5;
  const sway = (x) => {
    const i0 = Math.floor(x) & 255, i1 = (i0 + 1) & 255, f = x - Math.floor(x);
    const u = f * f * (3 - 2 * f);
    return swayN[i0] * (1 - u) + swayN[i1] * u;
  };

  const player = {
    pos: new THREE.Vector3(0, groundHeight(0, 3.2), 3.2),
    yaw: 0, pitch: 0,
    onDock: false,
    enabled: false,
    update, teleport,
    lock: null,   // assigned below — gesture-backed pointer-lock request
  };

  // -------------------------------------------------------------- input
  const keys = Object.create(null);
  let yawT = 0, pitchT = 0;             // targets (mouse-driven)
  let locked = false;
  let lockFailed = false;               // pointer lock GENUINELY unavailable → drag-look
  let everLocked = false;               // pointer lock has succeeded at least once here
  let panelOpen = false;                // a UI panel owns input
  let interactRequest = false;
  const isTouch = 'ontouchstart' in window;

  // adjustable sensitivity ([ and ] keys), persisted
  let sens = Math.max(0.4, Math.min(2.5, parseFloat(localStorage.getItem('ag-sens') || '1') || 1));
  function nudgeSens(d) {
    sens = Math.max(0.4, Math.min(2.5, +(sens + d).toFixed(1)));
    localStorage.setItem('ag-sens', String(sens));
    ctx.events.dispatchEvent(new CustomEvent('toast', { detail: { msg: `Mouse sensitivity ${sens.toFixed(1)}×` } }));
  }

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyE') interactRequest = true;
    if (e.code === 'BracketLeft') nudgeSens(-0.1);
    if (e.code === 'BracketRight') nudgeSens(0.1);
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  }, { passive: false });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // Input is live when playing, no panel is open, AND we actually have a look
  // scheme engaged: pointer lock held, or drag-look mode, or touch. In
  // pointer-lock mode an unlocked state means "paused" (window lost focus / Esc)
  // — freeze movement and interaction so the resume overlay is truthful.
  const inputActive = () => player.enabled && !panelOpen && (locked || lockFailed || isTouch);

  const canvas = ctx.renderer.domElement;
  const drag = { on: false, x: 0, y: 0, moved: 0 };

  function applyLook(dx, dy, scale) {
    yawT -= dx * scale * sens;
    pitchT = Math.max(-1.42, Math.min(1.42, pitchT - dy * scale * sens));
  }

  // Chrome occasionally emits one huge movementX/Y the frame pointer lock
  // engages (and after alt-tab); clamp so the view never snaps/jitters.
  const clampMove = (v) => Math.max(-140, Math.min(140, v || 0));
  canvas.addEventListener('mousemove', (e) => {
    if (locked) {
      applyLook(clampMove(e.movementX), clampMove(e.movementY), 0.00185);
    } else if (drag.on && lockFailed && inputActive()) {
      applyLook(e.clientX - drag.x, e.clientY - drag.y, 0.0038);
      drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (locked) { interactRequest = true; return; }
    // pointer-lock mode: a click re-locks (handled by the click listener below).
    // Only start a drag-look when pointer lock is genuinely unavailable.
    if (lockFailed) { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !drag.on) return;
    drag.on = false;
    // a still click in drag-look mode activates whatever is under the dot
    if (!locked && lockFailed && drag.moved < 6 && inputActive()) interactRequest = true;
  });

  // Broadcast the full input state so the UI can show "click to resume" exactly
  // when it's needed (playing, unlocked, pointer-lock is the active scheme, no
  // panel up). Emitted on every state change below.
  function emitLockState() {
    ctx.events.dispatchEvent(new CustomEvent('lock', {
      detail: {
        locked,
        inPlay: player.enabled,
        canPointerLock: !isTouch && !lockFailed,
        panelOpen,
      },
    }));
  }

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (locked) { everLocked = true; lockFailed = false; }   // proves lock works here
    emitLockState();
  });

  let dragToastShown = false;
  let pendingGesture = false;    // was the in-flight lock request gesture-backed?
  // Single failure path for BOTH API generations: the newer promise rejection
  // and the classic pointerlockerror event. Fall back to drag-look ONLY if a
  // gesture request failed and pointer lock has never worked here (restricted
  // embeds/browsers). Once it has locked once, a failure is transient (Chrome's
  // brief post-exit cooldown) — keep pointer-lock mode and let the resume
  // overlay drive another click.
  function onLockFail() {
    if (locked) return;
    if (pendingGesture && !everLocked) {
      lockFailed = true;
      if (!dragToastShown) {
        dragToastShown = true;
        ctx.events.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Mouse-look: click and drag to look around' } }));
      }
    }
    emitLockState();
  }
  document.addEventListener('pointerlockerror', onLockFail);

  // The browser ALWAYS drops pointer lock when the window/tab loses focus, and
  // it can only be re-acquired from a fresh gesture — so on regaining focus we
  // re-broadcast the state, which brings back the "click to resume" affordance.
  window.addEventListener('focus', emitLockState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') emitLockState();
  });

  function tryLock(fromGesture) {
    if (locked || isTouch) return;
    pendingGesture = fromGesture;
    try {
      const p = canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(onLockFail);
    } catch (err) {
      onLockFail();
    }
  }
  ctx.events.addEventListener('request-lock', () => { panelOpen = false; tryLock(false); emitLockState(); });
  ctx.events.addEventListener('panels-closed', () => { panelOpen = false; emitLockState(); });
  ctx.events.addEventListener('request-unlock', () => {
    if (locked) document.exitPointerLock?.();
    panelOpen = true;
    emitLockState();
  });
  ctx.events.addEventListener('intro-done', emitLockState);
  // Gesture-backed lock, called from the enter-button click, the resume overlay,
  // and every canvas click. A real click is a fresh user activation, so retry
  // even after a transient failure — this is what makes alt-tab → click and
  // Esc → click reliably re-lock.
  player.lock = () => { tryLock(true); };
  ctx.events.addEventListener('resume-click', () => player.lock());
  canvas.addEventListener('click', () => {
    if (player.enabled && !locked && !isTouch) player.lock();
  });

  // -------------------------------------------------------------- touch
  const stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  const look = { active: false, id: -1, lx: 0, ly: 0, moved: 0 };
  if (isTouch) {
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth / 2 && !stick.active) {
          stick.active = true; stick.id = t.identifier;
          stick.ox = t.clientX; stick.oy = t.clientY; stick.x = 0; stick.y = 0;
        } else if (!look.active) {
          look.active = true; look.id = t.identifier;
          look.lx = t.clientX; look.ly = t.clientY; look.moved = 0;
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stick.id) {
          stick.x = Math.max(-1, Math.min(1, (t.clientX - stick.ox) / 60));
          stick.y = Math.max(-1, Math.min(1, (t.clientY - stick.oy) / 60));
        } else if (t.identifier === look.id) {
          const dx = t.clientX - look.lx, dy = t.clientY - look.ly;
          look.moved += Math.abs(dx) + Math.abs(dy);
          yawT -= dx * 0.0045;
          pitchT = Math.max(-1.42, Math.min(1.42, pitchT - dy * 0.0045));
          look.lx = t.clientX; look.ly = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stick.id) { stick.active = false; stick.id = -1; stick.x = stick.y = 0; }
        else if (t.identifier === look.id) {
          if (look.moved < 12) interactRequest = true;   // tap = interact
          look.active = false; look.id = -1;
        }
      }
    });
  }

  // -------------------------------------------------------------- motion state
  const vel = new THREE.Vector2();       // xz velocity
  let yPos = player.pos.y;
  let bobPhase = 0, bobAmt = 0, lastStepIdx = 0;
  let roll = 0, dipVel = 0, dip = 0;
  let fov = cam.fov;
  const fovBase = cam.fov;
  let yawS = 0, pitchS = 0;              // smoothed
  let idleT = 0;

  function teleport(x, z, yaw) {
    player.pos.set(x, targetGroundY(x, z), z);
    yPos = player.pos.y;
    yawT = yawS = player.yaw = yaw;
    pitchT = pitchS = player.pitch = 0;
    vel.set(0, 0);
  }

  function targetGroundY(x, z) {
    if (x >= DOCK.minX && x <= DOCK.maxX && z >= DOCK.minZ && z <= DOCK.maxZ) {
      player.onDock = true;
      return DOCK.deckY;
    }
    player.onDock = false;
    return groundHeight(x, z);
  }

  // -------------------------------------------------------------- collision
  function collide(px, pz, axis) {
    // capsule (circle in xz, y-range) vs mutable AABB list
    const feet = yPos, head = yPos + EYE + 0.1;
    for (const c of ctx.colliders) {
      if (!c || !c.min) continue;
      if (feet > c.max.y || head < c.min.y) continue;
      const cx = Math.max(c.min.x, Math.min(px, c.max.x));
      const cz = Math.max(c.min.z, Math.min(pz, c.max.z));
      const dx = px - cx, dz = pz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= RADIUS * RADIUS) continue;
      if (axis === 'x') {
        px = px > (c.min.x + c.max.x) / 2 ? c.max.x + RADIUS : c.min.x - RADIUS;
      } else {
        pz = pz > (c.min.z + c.max.z) / 2 ? c.max.z + RADIUS : c.min.z - RADIUS;
      }
    }
    return axis === 'x' ? px : pz;
  }

  function clampBounds(p) {
    // zone-based walk envelope
    if (p.z < ROOM.maxZ) {
      p.x = Math.max(-BOUNDS.roomX, Math.min(BOUNDS.roomX, p.x));
      p.z = Math.max(BOUNDS.minZ, p.z);
    } else if (p.z < TERRACE.maxZ + 0.6) {
      p.x = Math.max(-BOUNDS.terraceX, Math.min(BOUNDS.terraceX, p.x));
    } else {
      p.x = Math.max(-BOUNDS.gardenX, Math.min(BOUNDS.gardenX, p.x));
    }
    // shoreline: only the dock corridor continues past shoreBlockZ
    const inDockX = p.x >= DOCK.minX + 0.05 && p.x <= DOCK.maxX - 0.05;
    if (p.z > BOUNDS.shoreBlockZ && !inDockX) p.z = BOUNDS.shoreBlockZ;
    if (p.z > DOCK.minZ && inDockX) {
      p.x = Math.max(DOCK.minX + 0.15, Math.min(DOCK.maxX - 0.15, p.x));
    }
    p.z = Math.min(BOUNDS.maxZ, p.z);
    return p;
  }

  // -------------------------------------------------------------- interaction
  const ray = new THREE.Raycaster();
  ray.far = 3.6;
  const center = new THREE.Vector2(0, 0);
  let rayTimer = 0, currentTarget = null, mapLen = -1;
  const hitMap = new Map();
  function rebuildMap() {
    hitMap.clear();
    for (const entry of ctx.interactables) {
      entry.object.traverse((o) => hitMap.set(o, entry));
    }
    mapLen = ctx.interactables.length;
  }
  function pollInteract(dt) {
    rayTimer -= dt;
    if (rayTimer > 0) return;
    rayTimer = 0.1;
    if (ctx.interactables.length !== mapLen) rebuildMap();
    if (!hitMap.size) return;
    ray.setFromCamera(center, cam);
    const hits = ray.intersectObjects(ctx.interactables.map((e) => e.object), true);
    const entry = hits.length ? hitMap.get(hits[0].object) || null : null;
    if (entry !== currentTarget) {
      currentTarget = entry;
      ctx.events.dispatchEvent(new CustomEvent('prompt', {
        detail: { label: entry ? entry.label : null },
      }));
    }
  }

  // -------------------------------------------------------------- update
  function update(dt, tw) {
    // input axes — keyboard works in pointer-lock, drag-look, and touch modes
    let ix = 0, iz = 0;
    if (inputActive()) {
      iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      if (isTouch && stick.active) { ix += stick.x; iz -= stick.y; }
    }
    const running = !!(keys.ShiftLeft || keys.ShiftRight) && iz > 0;
    const maxSpeed = running ? RUN : WALK;

    // smoothed look — short halflife so it filters jitter without feeling laggy
    const lookK = 1 - Math.exp(-dt / 0.022);
    yawS += (yawT - yawS) * lookK;
    pitchS += (pitchT - pitchS) * lookK;
    player.yaw = yawS; player.pitch = pitchS;

    // desired velocity in world xz
    const sy = Math.sin(yawS), cy = Math.cos(yawS);
    const fw = { x: -sy, z: -cy }, rt = { x: cy, z: -sy };
    let dx = fw.x * iz + rt.x * ix, dz = fw.z * iz + rt.z * ix;
    const dl = Math.hypot(dx, dz);
    if (dl > 1) { dx /= dl; dz /= dl; }

    // accelerate / damp
    vel.x += dx * ACCEL * dt;
    vel.y += dz * ACCEL * dt;
    const damp = Math.exp(-dt / 0.090);
    if (dl < 0.01) { vel.x *= damp; vel.y *= damp; }
    const sp = vel.length();
    if (sp > maxSpeed) vel.multiplyScalar(maxSpeed / sp);

    // integrate + collide per-axis
    let nx = player.pos.x + vel.x * dt;
    nx = collide(nx, player.pos.z, 'x');
    let nz = player.pos.z + vel.y * dt;
    nz = collide(nx, nz, 'z');
    player.pos.x = nx; player.pos.z = nz;
    clampBounds(player.pos);

    // ground follow with a smooth spring (stairs feel stepped, not snapped)
    const gy = targetGroundY(player.pos.x, player.pos.z);
    const prevY = yPos;
    yPos += (gy - yPos) * (1 - Math.exp(-dt / 0.07));
    player.pos.y = yPos;
    // landing dip on sudden drops
    if (prevY - yPos > 0.055) dipVel -= 0.9 * (prevY - yPos);
    dipVel += (-dip * 180 - dipVel * 16) * dt;    // spring back
    dip += dipVel * dt;

    // head bob driven by actual speed
    const speed = vel.length();
    const speedFac = Math.min(1, speed / WALK);
    bobAmt += ((speed > 0.35 ? speedFac : 0) - bobAmt) * (1 - Math.exp(-dt / 0.2));
    bobPhase += speed * dt * 1.75;
    const bobV = Math.sin(bobPhase * 2) * 0.021 * bobAmt;
    const bobL = Math.sin(bobPhase) * 0.012 * bobAmt;
    // footsteps at each half-cycle trough
    const stepIdx = Math.floor(bobPhase / Math.PI);
    if (stepIdx !== lastStepIdx && bobAmt > 0.25) {
      lastStepIdx = stepIdx;
      ctx.audio?.footstep?.(surfaceAt(player.pos.x, player.pos.z), running);
    } else if (stepIdx !== lastStepIdx) lastStepIdx = stepIdx;

    // breathing + micro-sway when still
    idleT += dt;
    if (speed > 0.3) idleT = 0;
    const idleFac = Math.min(1, Math.max(0, idleT - 0.4));
    const breathe = Math.sin(tw * 2 * Math.PI * 0.22) * 0.006 * idleFac;
    const microYaw = sway(tw * 0.7) * 0.0018 * idleFac;
    const microPitch = sway(tw * 0.55 + 87) * 0.0012 * idleFac;

    // strafe roll
    const rollT = -ix * 0.011 * speedFac;
    roll += (rollT - roll) * (1 - Math.exp(-dt / 0.12));

    // run FOV
    const fovT = fovBase + (running ? 3.5 * speedFac : 0);
    fov += (fovT - fov) * (1 - Math.exp(-dt / 0.25));
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }

    // compose camera
    cam.position.set(
      player.pos.x + Math.cos(yawS) * bobL,
      player.pos.y + EYE + bobV + breathe + dip,
      player.pos.z - Math.sin(yawS) * bobL,
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.set(pitchS + microPitch, yawS + microYaw, roll);

    // interaction
    if (inputActive()) {
      pollInteract(dt);
      if (interactRequest && currentTarget) {
        try { currentTarget.onActivate(); } catch (e) { console.error(e); }
      }
    }
    interactRequest = false;
  }

  return player;
}
