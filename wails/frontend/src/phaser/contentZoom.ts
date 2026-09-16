import Phaser from "phaser";

/** Scenes are laid out for a 960×600 stage; the camera zooms with the window. */
export const CONTENT_W = 960;
export const CONTENT_H = 600;
export const CONTENT_MIN_ZOOM = 0.75;
/**
 * Fraction of the beyond-1× fit applied on large windows. 1 = fill the
 * limiting axis exactly; lower values let bigger screens show a bit more
 * world (slight zoom-out) instead of scaling up fully.
 */
export const CONTENT_WIDE_ZOOM_OUT = 0.6;

export function contentZoom(scene: Phaser.Scene): number {
  const { width, height } = scene.scale.gameSize;
  if (!width || !height) return 1;
  const fit = Math.min(width / CONTENT_W, height / CONTENT_H);
  const zoom = fit <= 1 ? fit : 1 + (fit - 1) * CONTENT_WIDE_ZOOM_OUT;
  return Math.max(zoom, CONTENT_MIN_ZOOM);
}

/**
 * Applies the window-derived content zoom to the scene's main camera and
 * re-applies on every canvas resize until the scene shuts down. Pass a
 * center point for fixed-layout scenes so their content stays centered.
 */
export function trackContentZoom(scene: Phaser.Scene, center?: { x: number; y: number }): void {
  const apply = () => {
    const cam = scene.cameras?.main;
    if (!cam) return;
    cam.setZoom(contentZoom(scene));
    if (center) cam.centerOn(center.x, center.y);
  };
  apply();
  scene.scale.on(Phaser.Scale.Events.RESIZE, apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, apply);
  });
}
