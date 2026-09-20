// Isometric projection for the world scene.
//
// The renderer keeps every game object in *world coordinates* (server tiles,
// x/y pixels) inside a transformed container chain: squash (scaleY 0.5) →
// rotate (45°, scale √2). That composite maps world (x,y) → screen
// (x−y, (x+y)/2), so a square tile renders as a 2:1 diamond.
//
// Objects that must stay upright (characters, prop billboards, text) carry
// the inverse transform themselves: rotation −45° + scale (1/√2, √2). A
// GameObject's own matrix applies S then R then T, so with those values the
// composite Iso·T·R·S·p collapses to p + Iso(pos) — upright at the projected
// anchor, at native scale.
import type Phaser from "phaser";

/** Layer transform: Iso = S(1,0.5)·R(45°)·√2 (uniform scale folded in). */
export const ISO_ROT = Math.PI / 4;
export const ISO_LAYER_SCALE = Math.SQRT2;
export const ISO_SQUASH_Y = 0.5;

/** Counter-transform for upright billboards: Iso⁻¹ = R(−45°)·S(1/√2, √2). */
export const ISO_COUNTER_ROT = -Math.PI / 4;
export const ISO_COUNTER_SCALE_X = 1 / Math.SQRT2;
export const ISO_COUNTER_SCALE_Y = Math.SQRT2;

/**
 * Screen px of elevation per block level — raising a point h px is a world
 * offset of (−h,−h) (screen y drops h, x stays). Half a tile reads as a
 * clean cube edge in this projection.
 */
export const ISO_LEVEL_H = 16;

export function isoX(x: number, y: number): number {
  return x - y;
}
export function isoY(x: number, y: number): number {
  return (x + y) / 2;
}
/** Inverse of the projection: screen → world. */
export function screenToWorldX(sx: number, sy: number): number {
  return sx / 2 + sy;
}
export function screenToWorldY(sx: number, sy: number): number {
  return sy - sx / 2;
}
/** Sort key — higher screen Y is closer to the viewer, draws on top. */
export function isoDepth(x: number, y: number): number {
  return isoY(x, y);
}
/**
 * World-space unit vector that moves a point "up" on screen by `px` screen
 * pixels: (−px, −px) — screen y = (x+y)/2 drops px while x−y stays put.
 */
export const ISO_UP_X = -1;
export const ISO_UP_Y = -1;

/**
 * The 8 grid-aligned world directions (unit length): the four tile-edge
 * axes plus the four through-corner diagonals. Anything else renders at an
 * angle that follows no grid line.
 */
const ISO_WORLD_DIRS: readonly { x: number; y: number }[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
];

/**
 * Snap a screen-space input direction to the nearest grid-aligned world
 * direction: cardinal screen intents map to through-corner diagonals,
 * diagonal intents to tile-edge axes — every move runs parallel to the iso
 * grid instead of at an arbitrary angle.
 */
export function screenDirToWorldGrid(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 0 };
  const sx = dx / len;
  const sy = dy / len;
  let best = ISO_WORLD_DIRS[0];
  let bestDot = -Infinity;
  for (const w of ISO_WORLD_DIRS) {
    const px = w.x - w.y;
    const py = (w.x + w.y) / 2;
    const pl = Math.hypot(px, py);
    const dot = (sx * px + sy * py) / pl;
    if (dot > bestDot) {
      bestDot = dot;
      best = w;
    }
  }
  return { x: best.x, y: best.y };
}

/**
 * Speed scale for a world-space unit direction so rendered movement doesn't
 * outpace itself: the projection amplifies screen-horizontal motion (screen
 * x = dx−dy) up to √2× while leaving vertical at √2/2×. Returns 1/projected
 * length capped at 1 — the full slowdown lands on pure left/right and tapers
 * to nothing as the direction turns screen-vertical.
 */
export function isoMoveSpeedScale(dx: number, dy: number): number {
  const plen = Math.hypot(dx - dy, (dx + dy) / 2);
  return plen > 1 ? 1 / plen : 1;
}

/** Screen-space (iso) bounding box of a tile map. */
export function isoBounds(
  cols: number,
  rows: number,
  tile: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: -rows * tile,
    y: 0,
    w: (cols + rows) * tile,
    h: ((cols + rows) * tile) / 2,
  };
}

/** Apply the upright-billboard counter-transform to a world-layer child. */
export function applyIsoCounter<T extends { setRotation(r: number): T; setScale(x: number, y: number): T }>(
  obj: T,
): T {
  return obj.setRotation(ISO_COUNTER_ROT).setScale(ISO_COUNTER_SCALE_X, ISO_COUNTER_SCALE_Y);
}

// ---------------------------------------------------------------------------
// Per-scene world-layer registry. WorldScene installs its iso chain here;
// presentation helpers (actorVisuals, poiVisuals, movement decals, target
// ring) fetch it to parent world-coordinate objects. Scenes without a layer
// (house interiors, editor previews) keep default scene-level parenting —
// i.e. orthogonal rendering.
const layers = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container>();

export function setIsoLayer(scene: Phaser.Scene, layer: Phaser.GameObjects.Container): void {
  layers.set(scene, layer);
}
export function isoLayer(scene: Phaser.Scene): Phaser.GameObjects.Container | undefined {
  return layers.get(scene);
}
/**
 * Parent `obj` into the scene's iso layer when one exists (returns the layer),
 * else leave it on the scene display list (orthogonal scene). Returns the
 * container the object now lives in.
 */
export function isoParent<T extends Phaser.GameObjects.GameObject>(
  scene: Phaser.Scene,
  obj: T,
): Phaser.GameObjects.Container | undefined {
  const layer = isoLayer(scene);
  layer?.add(obj);
  return layer;
}

/** World point → the scene-space position an iso scene renders it at. */
export function isoProject(
  scene: Phaser.Scene,
  x: number,
  y: number,
): { x: number; y: number } {
  return isoLayer(scene) ? { x: isoX(x, y), y: isoY(x, y) } : { x, y };
}

/** Depth sort key for a world point — projected Y under iso, plain Y ortho. */
export function sortDepth(scene: Phaser.Scene, x: number, y: number): number {
  return isoLayer(scene) ? isoY(x, y) : y;
}

/**
 * Screen-space move input → world-space direction. Iso scenes snap the
 * intent to the nearest grid-aligned direction (keys mean screen axes);
 * orthogonal scenes just normalize it.
 */
export function moveDirFor(
  scene: Phaser.Scene,
  dx: number,
  dy: number,
): { x: number; y: number } {
  if (isoLayer(scene)) return screenDirToWorldGrid(dx, dy);
  const len = Math.hypot(dx, dy);
  return len < 1e-6 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
}

/** Iso projection speed correction — 1 for orthogonal scenes. */
export function moveSpeedScaleFor(scene: Phaser.Scene, dx: number, dy: number): number {
  return isoLayer(scene) ? isoMoveSpeedScale(dx, dy) : 1;
}

/**
 * World-space unit vector that moves the rendered point straight *up* on
 * screen: (−1,−1) under iso (drops isoY by 1 per world px), (0,−1) otherwise.
 * Screen-space VFX — jumps, arcs, bursts — should treat offsets this way.
 */
export function isoUp(scene: Phaser.Scene): { x: number; y: number } {
  return isoLayer(scene) ? { x: ISO_UP_X, y: ISO_UP_Y } : { x: 0, y: -1 };
}
