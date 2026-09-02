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

/** Blink a sprite then restore full opacity. Safe to retrigger while a flash is running. */
export function playHitFlash(
  scene: Phaser.Scene,
  target: { setAlpha: (value: number) => unknown },
  previous: Phaser.Tweens.Tween | undefined,
  battleSpeed?: number,
  dim = 0.35,
): Phaser.Tweens.Tween {
  previous?.stop();
  target.setAlpha(1);
  const tween = scene.tweens.add({
    targets: target,
    alpha: dim,
    duration: battleDuration(50, battleSpeed),
    yoyo: true,
    repeat: 2,
    onComplete: () => {
      target.setAlpha(1);
    },
  });
  return tween;
}
