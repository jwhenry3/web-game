/** Client-side battle animation timing — mirrors server battle-speed multiplier. */

export const DEFAULT_BATTLE_SPEED = 0.75;

function normalizeSpeed(speed: number | undefined): number {
  return speed && speed > 0 ? speed : DEFAULT_BATTLE_SPEED;
}

/** Wall-clock tween duration (lower speed → longer animations). */
export function battleDuration(ms: number, speed?: number): number {
  return ms / normalizeSpeed(speed);
}

/** Phaser update delta for frame-based sprite anims (lower speed → slower frames). */
export function battleDelta(delta: number, speed?: number): number {
  return delta * normalizeSpeed(speed);
}
