import Phaser from "phaser";
import { H99_ANIMS, H99_SHEET } from "./heroes99";
import { ENEMY_KINDS, enemyTextureKey, type EnemyKind } from "./enemies";

const ENEMY_BASE = "/assets/enemies";

const ENEMY_SVG_PATH: Record<EnemyKind, string> = {
  goblin: `${ENEMY_BASE}/goblin.svg`,
  dire_wolf: `${ENEMY_BASE}/dire_wolf.svg`,
  stone_imp: `${ENEMY_BASE}/stone_imp.svg`,
};

const DRAW_SIZE: Record<EnemyKind, { w: number; h: number }> = {
  goblin: { w: 48, h: 36 },
  dire_wolf: { w: 56, h: 32 },
  stone_imp: { w: 44, h: 40 },
};

const FOOT_X = 50;
const FOOT_Y = 36;

const imageCache = new Map<EnemyKind, HTMLImageElement>();
const imageLoads = new Map<EnemyKind, Promise<HTMLImageElement>>();
let sheetBuild: Promise<void> | null = null;

function frameMotion(frame: number): { bob: number; lunge: number; sway: number } {
  if (frame < 6) {
    return { bob: Math.sin(frame * 0.8) * 2, lunge: 0, sway: 0 };
  }
  if (frame >= 16 && frame <= 23) {
    const phase = frame - 16;
    return { bob: Math.sin(phase * 0.9) * 1, lunge: 0, sway: Math.sin(phase * 1.4) * 2 };
  }
  if (frame >= 36) {
    const phase = frame - 36;
    return { bob: Math.sin(phase * 0.7) * 1, lunge: Math.min(1, phase / 3) * 8, sway: 0 };
  }
  return { bob: 0, lunge: 0, sway: 0 };
}

function drawEnemyFrame(
  ctx: CanvasRenderingContext2D,
  kind: EnemyKind,
  frame: number,
  cellX: number,
  cellY: number,
  img: HTMLImageElement,
): void {
  const { w, h } = DRAW_SIZE[kind];
  const { bob, lunge, sway } = frameMotion(frame);
  const ox = cellX + FOOT_X - w * 0.55 + lunge;
  const oy = cellY + FOOT_Y - h + bob + sway * 0.3;
  ctx.drawImage(img, ox, oy, w, h);
}

async function loadEnemyImage(kind: EnemyKind): Promise<HTMLImageElement> {
  const cached = imageCache.get(kind);
  if (cached) return cached;

  const pending = imageLoads.get(kind);
  if (pending) return pending;

  const promise = (async () => {
    const resp = await fetch(ENEMY_SVG_PATH[kind]);
    if (!resp.ok) throw new Error(`Failed to fetch ${ENEMY_SVG_PATH[kind]}: ${resp.status}`);
    const svg = (await resp.text()).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Failed to decode enemy SVG: ${kind}`));
      el.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    imageCache.set(kind, img);
    return img;
  })();

  imageLoads.set(kind, promise);
  try {
    return await promise;
  } finally {
    imageLoads.delete(kind);
  }
}

function buildEnemySheet(scene: Phaser.Scene, kind: EnemyKind, img: HTMLImageElement): void {
  const key = enemyTextureKey(kind);
  if (scene.textures.exists(key)) return;

  const canvas = document.createElement("canvas");
  canvas.width = H99_SHEET.width;
  canvas.height = H99_SHEET.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;

  const frames = new Set<number>();
  for (const anim of Object.values(H99_ANIMS)) {
    for (const f of anim.frames) frames.add(f);
  }
  for (const frame of frames) {
    const col = frame % H99_SHEET.columns;
    const row = Math.floor(frame / H99_SHEET.columns);
    drawEnemyFrame(ctx, kind, frame, col * H99_SHEET.frameWidth, row * H99_SHEET.frameHeight, img);
  }

  const texture = scene.textures.addCanvas(key, canvas);
  if (!texture) return;

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

  texture.refresh();
}

async function buildAllEnemySheets(scene: Phaser.Scene): Promise<void> {
  const images = await Promise.all(ENEMY_KINDS.map((kind) => loadEnemyImage(kind)));
  for (let i = 0; i < ENEMY_KINDS.length; i++) {
    buildEnemySheet(scene, ENEMY_KINDS[i]!, images[i]!);
  }
}

/** Load SVG sources and bake Heroes 99–layout sprite sheets. */
export function ensureEnemyTextures(scene: Phaser.Scene): Promise<void> {
  if (ENEMY_KINDS.every((kind) => scene.textures.exists(enemyTextureKey(kind)))) {
    return Promise.resolve();
  }
  if (!sheetBuild) {
    sheetBuild = buildAllEnemySheets(scene).finally(() => {
      sheetBuild = null;
    });
  }
  return sheetBuild;
}
