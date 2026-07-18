// config.js — shared world constants & pure helpers. No three.js imports here.
// Every module imports from this file; nothing here may mutate at runtime.

// ---------------------------------------------------------------- coordinates
// Origin = center of the great-room floor. +z = south (toward terrace & lake),
// -z = north (gallery wall). +x = east. y up. Units are meters. Eye height 1.7.
export const ROOM = {
  minX: -9, maxX: 9,          // inner faces of east/west walls
  minZ: -5.5, maxZ: 5.5,      // inner faces of north/south walls
  height: 4.2,
  wallThick: 0.3,
};

export const TERRACE = { minX: -11, maxX: 11, minZ: 5.5, maxZ: 13.5 }; // y = 0
export const STEPS   = { minX: -3, maxX: 3, minZ: 13.5, maxZ: 14.85, count: 3, drop: 0.45 };
export const LAWN    = { minZ: 14.85, maxZ: 33.5, endY: -1.4 };
export const WATER_Y = -1.9;                       // lake surface height
export const SHORE_Z = 35.0;                       // approx. waterline crossing
export const DOCK    = { minX: -1.35, maxX: 1.35, minZ: 34.2, maxZ: 45, deckY: -1.35 };
export const PATH    = { minX: -1.1, maxX: 1.1, minZ: 14.85, maxZ: 34.2 }; // gravel
export const RUG_RECT= { minX: -7.0, maxX: -1.8, minZ: -2.6, maxZ: 2.6 };

// Walkable envelope (player also collides with ctx.colliders AABBs):
export const BOUNDS = {
  roomX: 8.7,          // |x| limit while z < ROOM.maxZ
  terraceX: 10.7,      // |x| limit on terrace
  gardenX: 14.0,       // |x| limit on lawn
  minZ: -5.2,
  maxZ: 44.6,          // end of dock
  shoreBlockZ: 33.9,   // can't pass this unless inside DOCK x-range
};

// South wall glazing: three 2.2m-wide × 3.1m-tall openings centered at:
export const DOOR_XS = [-5.2, 0, 5.2];   // center one (index 1) is the auto-door
export const DOOR = { width: 2.2, height: 3.1, autoIndex: 1, triggerDist: 2.6 };

// Gallery slots for the five works (data.js order). pos = panel center,
// rotY spins the panel to face into the room.
export const ART_SLOTS = [
  { pos: [-5.2, 2.05, -5.47], rotY: 0 },          // north wall, west
  { pos: [ 0.0, 2.05, -5.47], rotY: 0 },          // north wall, center
  { pos: [ 5.2, 2.05, -5.47], rotY: 0 },          // north wall, east
  { pos: [ 8.97, 2.05, -2.4], rotY: -Math.PI / 2 }, // east wall, north slot
  { pos: [ 8.97, 2.05,  0.9], rotY: -Math.PI / 2 }, // east wall, south slot
];
export const ART_PANEL = { w: 2.3, h: 1.44 };     // 16:10 OLED panel size

// TV wall (west): 85" 16:9 panel above a media console.
export const TV = { pos: [-8.97, 1.78, 0], rotY: Math.PI / 2, w: 1.88, h: 1.06 };

// Writing desk corner (south-east, looking out through the glazing).
export const DESK = { pos: [6.6, 0, 3.4], rotY: -Math.PI * 0.62 };

// Chandeliers (two, along room center line).
export const CHANDELIERS = [ [-4.5, 3.55, 0], [4.5, 3.55, 0] ];

// ---------------------------------------------------------------- environment
// Direction FROM the scene TOWARD the sun (unit-ish; normalize before use).
// Low golden-hour sun out over the lake (south, slightly west) so light rakes
// in through the south glazing across the floor — the Hitman-suite look.
export const SUN_DIR = [-0.38, 0.30, 0.90];
export const SUN = { color: 0xffdcae, intensity: 4.4 };
export const HEMI = { sky: 0x9db7d6, ground: 0x6a5a44, intensity: 0.85 };
export const FOG = { color: 0xd6c9ae, near: 110, far: 850 };
export const CAMERA = { fov: 52, near: 0.08, far: 1500 };

export const PALETTE = {
  creamPaint: 0xece4d3,
  grasscloth: 0xc9a961,
  walnut: 0x5a3c26,
  oxblood: 0x6d1f24,
  brass: 0xc8a24a,
  bronze: 0x6e5432,
  curtainGold: 0xb98f3e,
  sheerIvory: 0xf4ead8,
  travertine: 0xcfc2a8,
  skyZenith: 0x33689c,
  skyHorizon: 0xf7c987,
};

// Wrap shader clocks so fp32 uniforms never decay on long sessions.
export const TIME_WRAP = 900;

// ---------------------------------------------------------------- pure helpers
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Ground height every walkable/visible near-field point uses. Landscape
// displaces its terrain from this; the player stands on it. Dock decking is a
// player-side override (DOCK.deckY), not part of this profile.
export function groundHeight(x, z) {
  let y;
  if (z <= STEPS.minZ) {
    y = 0;
  } else if (z < STEPS.maxZ) {
    const stepIdx = Math.min(STEPS.count, Math.floor((z - STEPS.minZ) / ((STEPS.maxZ - STEPS.minZ) / STEPS.count)) + 1);
    y = -(STEPS.drop / STEPS.count) * stepIdx;
  } else if (z <= LAWN.maxZ) {
    y = -STEPS.drop + (LAWN.endY + STEPS.drop) * smoothstep(LAWN.minZ, LAWN.maxZ, z);
  } else if (z <= 37) {
    y = LAWN.endY + (-2.8 - LAWN.endY) * smoothstep(LAWN.maxZ, 37, z);
  } else {
    y = Math.max(-7, -2.8 - (z - 37) * 0.18);
  }
  // gentle side rise far from the walk corridor (visual variety, still walkable)
  y += 0.22 * smoothstep(13, 30, Math.abs(x)) * smoothstep(10, 20, z);
  return y;
}

export function surfaceAt(x, z) {
  if (z < ROOM.maxZ) {
    if (x >= RUG_RECT.minX && x <= RUG_RECT.maxX && z >= RUG_RECT.minZ && z <= RUG_RECT.maxZ) return 'rug';
    return 'wood';
  }
  if (z < STEPS.maxZ) return 'stone';
  if (x >= DOCK.minX && x <= DOCK.maxX && z >= DOCK.minZ) return 'dock';
  if (x >= PATH.minX && x <= PATH.maxX && z <= PATH.maxZ) return 'gravel';
  return 'grass';
}

// Deterministic PRNG — every module seeds its own stream; never Math.random().
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
