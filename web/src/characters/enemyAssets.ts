import Phaser from "phaser";
import { H99_ANIMS, H99_SHEET } from "./heroes99";
import { ENEMY_KINDS, enemyTextureKey, type EnemyKind } from "./enemies";

type Pixel = readonly [number, number, string];

const FOOT_X = 50;
const FOOT_Y = 36;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, scale: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), scale, scale);
}

function drawPixels(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  pixels: readonly Pixel[],
  scale: number,
): void {
  for (const [x, y, c] of pixels) {
    px(ctx, ox + x * scale, oy + y * scale, c, scale);
  }
}

function goblinPixels(phase: number, attack = 0): Pixel[] {
  const bob = Math.sin(phase * 0.8) * 1;
  const leg = Math.sin(phase * 1.4);
  const lunge = attack * 5;
  const y = (v: number) => v + bob;
  const lx = leg > 0 ? 1 : 0;
  const rx = leg <= 0 ? 1 : 0;
  return [
    [18 + lunge, y(6), "#3d6b28"],
    [19 + lunge, y(6), "#4a8a32"],
    [20 + lunge, y(5), "#4a8a32"],
    [21 + lunge, y(5), "#5a9e3c"],
    [22 + lunge, y(4), "#5a9e3c"],
    [23 + lunge, y(4), "#6ab84a"],
    [24 + lunge, y(3), "#6ab84a"],
    [25 + lunge, y(3), "#5a9e3c"],
    [26 + lunge, y(4), "#4a8a32"],
    [27 + lunge, y(5), "#4a8a32"],
    [28 + lunge, y(6), "#3d6b28"],
    [24 + lunge, y(7), "#cc2222"],
    [25 + lunge, y(7), "#cc2222"],
    [23 + lunge, y(8), "#2a1a0a"],
    [26 + lunge, y(8), "#2a1a0a"],
    [20 + lunge, y(9), "#4a8a32"],
    [21 + lunge, y(9), "#5a9e3c"],
    [22 + lunge, y(9), "#5a9e3c"],
    [23 + lunge, y(9), "#5a9e3c"],
    [24 + lunge, y(9), "#4a8a32"],
    [25 + lunge, y(9), "#4a8a32"],
    [26 + lunge, y(9), "#4a8a32"],
    [27 + lunge, y(9), "#3d6b28"],
    [21 + lunge, y(10), "#3d6b28"],
    [22 + lunge, y(10), "#4a8a32"],
    [23 + lunge, y(10), "#4a8a32"],
    [24 + lunge, y(10), "#3d6b28"],
    [25 + lunge, y(10), "#3d6b28"],
    [26 + lunge, y(10), "#3d6b28"],
    [20 + lunge - lx, y(14), "#2a4a1e"],
    [21 + lunge - lx, y(15), "#2a4a1e"],
    [26 + lunge + rx, y(14), "#2a4a1e"],
    [27 + lunge + rx, y(15), "#2a4a1e"],
    [29 + lunge + attack * 3, y(8), "#8a8a8a"],
    [30 + lunge + attack * 3, y(7), "#aaaaaa"],
    [31 + lunge + attack * 3, y(6), "#cccccc"],
  ];
}

function wolfPixels(phase: number, attack = 0): Pixel[] {
  const bob = Math.sin(phase * 0.9) * 0.5;
  const leg = Math.sin(phase * 1.6);
  const lunge = attack * 4;
  const y = (v: number) => v + bob;
  const f1 = leg > 0.3 ? 1 : 0;
  const f2 = leg < -0.3 ? 1 : 0;
  return [
    [14 + lunge, y(12), "#5a4030"],
    [15 + lunge, y(11), "#6a5040"],
    [16 + lunge, y(10), "#7a6050"],
    [17 + lunge, y(9), "#8a6a4a"],
    [18 + lunge, y(8), "#9a7a5a"],
    [19 + lunge, y(7), "#8a6a4a"],
    [20 + lunge, y(6), "#7a6050"],
    [21 + lunge, y(5), "#6a5040"],
    [22 + lunge, y(5), "#5a4030"],
    [23 + lunge, y(6), "#4a3020"],
    [24 + lunge, y(7), "#3a2818"],
    [25 + lunge, y(8), "#2a1a0a"],
    [18 + lunge, y(8), "#cc3333"],
    [19 + lunge, y(10), "#6a5040"],
    [20 + lunge, y(10), "#7a6050"],
    [21 + lunge, y(10), "#7a6050"],
    [22 + lunge, y(10), "#6a5040"],
    [23 + lunge, y(10), "#5a4030"],
    [17 + lunge, y(11), "#5a4030"],
    [24 + lunge, y(11), "#5a4030"],
    [16 + lunge - f1, y(13), "#3a2818"],
    [17 + lunge - f1, y(14), "#2a1a0a"],
    [20 + lunge, y(13), "#3a2818"],
    [21 + lunge, y(14), "#2a1a0a"],
    [24 + lunge + f2, y(13), "#3a2818"],
    [25 + lunge + f2, y(14), "#2a1a0a"],
    [26 + lunge, y(9), "#5a4030"],
    [27 + lunge, y(8), "#4a3020"],
  ];
}

function impPixels(phase: number, attack = 0): Pixel[] {
  const bob = Math.sin(phase * 0.7) * 0.8;
  const pulse = Math.sin(phase * 2) * 0.5 + 0.5;
  const lunge = attack * 4;
  const y = (v: number) => v + bob;
  const glow = pulse > 0.5 ? "#ff8844" : "#cc6622";
  return [
    [20 + lunge, y(3), "#5a5a6a"],
    [21 + lunge, y(2), "#6a6a7a"],
    [22 + lunge, y(2), "#6a6a7a"],
    [23 + lunge, y(3), "#5a5a6a"],
    [18 + lunge, y(5), "#4a4a5a"],
    [19 + lunge, y(4), "#5a5a6a"],
    [20 + lunge, y(4), "#6a6a7a"],
    [21 + lunge, y(4), "#7a7a8a"],
    [22 + lunge, y(4), "#7a7a8a"],
    [23 + lunge, y(4), "#6a6a7a"],
    [24 + lunge, y(4), "#5a5a6a"],
    [25 + lunge, y(5), "#4a4a5a"],
    [21 + lunge, y(6), glow],
    [22 + lunge, y(6), glow],
    [19 + lunge, y(7), "#4a4a5a"],
    [20 + lunge, y(7), "#5a5a6a"],
    [21 + lunge, y(7), "#6a6a7a"],
    [22 + lunge, y(7), "#6a6a7a"],
    [23 + lunge, y(7), "#5a5a6a"],
    [24 + lunge, y(7), "#4a4a5a"],
    [20 + lunge, y(8), "#3a3a4a"],
    [21 + lunge, y(8), "#4a4a5a"],
    [22 + lunge, y(8), "#4a4a5a"],
    [23 + lunge, y(8), "#3a3a4a"],
    [19 + lunge, y(9), "#3a3a4a"],
    [20 + lunge, y(9), "#4a4a5a"],
    [21 + lunge, y(9), "#5a5a6a"],
    [22 + lunge, y(9), "#5a5a6a"],
    [23 + lunge, y(9), "#4a4a5a"],
    [24 + lunge, y(9), "#3a3a4a"],
    [20 + lunge, y(10), "#2a2a3a"],
    [21 + lunge, y(10), "#3a3a4a"],
    [22 + lunge, y(10), "#3a3a4a"],
    [23 + lunge, y(10), "#2a2a3a"],
    [19 + lunge, y(12), "#2a2a3a"],
    [20 + lunge, y(13), "#1a1a2a"],
    [23 + lunge, y(12), "#2a2a3a"],
    [24 + lunge, y(13), "#1a1a2a"],
    [27 + lunge + attack * 2, y(7), "#8888aa"],
    [28 + lunge + attack * 2, y(6), "#aaaacc"],
  ];
}

function drawEnemyFrame(
  ctx: CanvasRenderingContext2D,
  kind: EnemyKind,
  frame: number,
  cellX: number,
  cellY: number,
): void {
  const scale = 2;
  const ox = cellX + FOOT_X - 24 * scale;
  const oy = cellY + FOOT_Y - 18 * scale;

  let phase = 0;
  let attack = 0;
  if (frame < 6) phase = frame;
  else if (frame >= 16 && frame <= 23) phase = frame - 16;
  else if (frame >= 36) {
    phase = frame - 36;
    attack = Math.min(1, phase / 3);
  }

  const pixels =
    kind === "goblin"
      ? goblinPixels(phase, attack)
      : kind === "dire_wolf"
        ? wolfPixels(phase, attack)
        : impPixels(phase, attack);

  drawPixels(ctx, ox, oy, pixels, scale);
}

function drawEnemySheet(ctx: CanvasRenderingContext2D, kind: EnemyKind): void {
  const frames = new Set<number>();
  for (const anim of Object.values(H99_ANIMS)) {
    for (const f of anim.frames) frames.add(f);
  }
  for (const frame of frames) {
    const col = frame % H99_SHEET.columns;
    const row = Math.floor(frame / H99_SHEET.columns);
    drawEnemyFrame(ctx, kind, frame, col * H99_SHEET.frameWidth, row * H99_SHEET.frameHeight);
  }
}

export function ensureEnemyTextures(scene: Phaser.Scene): void {
  for (const kind of ENEMY_KINDS) {
    const key = enemyTextureKey(kind);
    if (scene.textures.exists(key)) continue;

    const canvas = document.createElement("canvas");
    canvas.width = H99_SHEET.width;
    canvas.height = H99_SHEET.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.imageSmoothingEnabled = false;
    drawEnemySheet(ctx, kind);

    const texture = scene.textures.addCanvas(key, canvas);
    if (!texture) continue;
    const cols = H99_SHEET.columns;
    const rows = Math.floor(H99_SHEET.height / H99_SHEET.frameHeight);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const frame = row * cols + col;
        texture.add(
          frame,
          0,
          col * H99_SHEET.frameWidth,
          row * H99_SHEET.frameHeight,
          H99_SHEET.frameWidth,
          H99_SHEET.frameHeight,
        );
      }
    }
  }
}
