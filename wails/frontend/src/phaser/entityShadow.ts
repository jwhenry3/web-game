import Phaser from "phaser";

const SHADOW_KEY = "entity-shadow";
const SHADOW_W = 48;
const SHADOW_H = 18;

/**
 * One shared soft-ellipse texture for every entity shadow. Generated once as
 * a canvas radial gradient squashed vertically, so all shadow images batch
 * off the same texture with zero per-frame cost.
 */
function ensureShadowTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(SHADOW_KEY)) return SHADOW_KEY;
  const tex = scene.textures.createCanvas(SHADOW_KEY, SHADOW_W, SHADOW_H);
  if (!tex) return SHADOW_KEY;
  const ctx = tex.getContext();
  ctx.setTransform(1, 0, 0, SHADOW_H / SHADOW_W, 0, 0);
  const grad = ctx.createRadialGradient(
    SHADOW_W / 2,
    SHADOW_W / 2,
    2,
    SHADOW_W / 2,
    SHADOW_W / 2,
    SHADOW_W / 2,
  );
  grad.addColorStop(0, "rgba(6, 8, 7, 0.5)");
  grad.addColorStop(0.6, "rgba(6, 8, 7, 0.26)");
  grad.addColorStop(1, "rgba(6, 8, 7, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SHADOW_W, SHADOW_W);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  tex.refresh();
  return SHADOW_KEY;
}

/**
 * Soft ground shadow for an entity wrapper. Add it as the wrapper's first
 * child so it draws under the sprite; it inherits the wrapper's transform and
 * alpha, so it follows movement, scales with content zoom, and fades on death
 * for free — while staying planted during jump/dodge (those animate the inner
 * sprite container, not the wrapper).
 */
export function entityShadow(scene: Phaser.Scene, scale = 1): Phaser.GameObjects.Image {
  return scene.add.image(0, -2, ensureShadowTexture(scene)).setScale(scale);
}
