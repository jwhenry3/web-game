import type { EditorObject } from "./editorTypes";
import { enemyKindFromName, type EnemyKind } from "../characters/enemies";
import { frameForAnim, H99_DISPLAY_SCALE, H99_ORIGIN } from "../characters/heroes99";
import { isSanctuaryRegion } from "./hierarchyTree";
import { propString } from "./editorTypes";
import { parseNpcServiceRoles } from "./objectProps";
import { hasCombatRole, isNpcEntity, normalizeNpcObject } from "./npcEntity";
import { regionPolygon } from "./regionPolygon";

const ENEMY_SVG: Record<EnemyKind, string> = {
  goblin: "/assets/enemies/goblin.svg",
  dire_wolf: "/assets/enemies/dire_wolf.svg",
  stone_imp: "/assets/enemies/stone_imp.svg",
};

const ENEMY_DRAW_SIZE: Record<EnemyKind, { w: number; h: number }> = {
  goblin: { w: 48, h: 36 },
  dire_wolf: { w: 56, h: 32 },
  stone_imp: { w: 44, h: 40 },
};

const enemyImages = new Map<EnemyKind, HTMLImageElement>();
let enemyLoadPromise: Promise<void> | null = null;

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

async function loadEnemyImage(kind: EnemyKind): Promise<HTMLImageElement> {
  const cached = enemyImages.get(kind);
  if (cached) return cached;
  const resp = await fetch(ENEMY_SVG[kind]);
  if (!resp.ok) throw new Error(`Failed to load ${ENEMY_SVG[kind]}`);
  const svg = (await resp.text()).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to decode ${kind}`));
    el.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  enemyImages.set(kind, img);
  return img;
}

/** Preload enemy SVGs used by combat NPC previews in the map editor. */
export function ensureEditorSpritesLoaded(): Promise<void> {
  if (enemyImages.size >= 3) return Promise.resolve();
  if (!enemyLoadPromise) {
    enemyLoadPromise = Promise.all(
      (Object.keys(ENEMY_SVG) as EnemyKind[]).map((kind) => loadEnemyImage(kind)),
    ).then(() => undefined);
  }
  return enemyLoadPromise;
}

function objectLayerOrder(obj: EditorObject): number {
  if (obj.type === "region") return 0;
  if (obj.type === "sanctuary") return 0;
  if (obj.type === "exit") return 1;
  return 2;
}

export function sortObjectsForDraw(objects: EditorObject[]): EditorObject[] {
  return [...objects].sort((a, b) => objectLayerOrder(a) - objectLayerOrder(b));
}

function drawSelectionRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.strokeStyle = "#f5d76e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawSelectionRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = "#f5d76e";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function drawResizeHandles(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, z: number) {
  const size = Math.max(6, 8 * z);
  const half = size / 2;
  const points = [
    [x, y],
    [x + w / 2, y],
    [x + w, y],
    [x + w, y + h / 2],
    [x + w, y + h],
    [x + w / 2, y + h],
    [x, y + h],
    [x, y + h / 2],
  ];
  ctx.fillStyle = "#f5d76e";
  ctx.strokeStyle = "#1a1028";
  ctx.lineWidth = 1;
  for (const [px, py] of points) {
    ctx.fillRect(px - half, py - half, size, size);
    ctx.strokeRect(px - half, py - half, size, size);
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, z: number) {
  if (!text) return;
  const size = Math.max(8, Math.round(10 * z));
  ctx.font = `${size}px monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
}

function drawSavePoint(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, name: string, active: boolean) {
  const glow = active ? "rgba(255, 233, 168, 0.22)" : "rgba(136, 221, 255, 0.14)";
  const body = active ? "#ffe9a8" : "#a8e8ff";
  const label = active ? "#fff6c8" : "#a8e8ff";

  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y - 14 * z, 30 * z, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x - 10 * z, y + 6 * z);
  ctx.lineTo(x + 10 * z, y + 6 * z);
  ctx.lineTo(x, y - 20 * z);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(x, y - 10 * z, 5 * z, 0, Math.PI * 2);
  ctx.fill();

  drawLabel(ctx, x, y + 18 * z, name, label, z);
}

function drawJobMaster(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, name: string) {
  ctx.fillStyle = "rgba(196, 163, 90, 0.18)";
  ctx.beginPath();
  ctx.arc(x, y - 14 * z, 28 * z, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e8c96a";
  ctx.beginPath();
  ctx.arc(x, y - 12 * z, 12 * z, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#4a3820";
  ctx.fillRect(x - 8 * z, y - 2 * z, 16 * z, 14 * z);

  drawLabel(ctx, x, y + 18 * z, name, "#e8c96a", z);
}

function drawQuestTrigger(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, name: string) {
  ctx.fillStyle = "rgba(167, 139, 250, 0.25)";
  ctx.beginPath();
  ctx.arc(x, y - 12 * z, 14 * z, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a78bfa";
  ctx.font = `bold ${10 * z}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("?", x, y - 8 * z);
  drawLabel(ctx, x, y + 18 * z, name, "#c4b5fd", z);
}

function drawWorldItem(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, name: string) {
  ctx.fillStyle = "rgba(52, 211, 153, 0.25)";
  ctx.beginPath();
  ctx.arc(x, y - 10 * z, 10 * z, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#34d399";
  ctx.fillRect(x - 6 * z, y - 14 * z, 12 * z, 8 * z);
  drawLabel(ctx, x, y + 18 * z, name, "#6ee7b7", z);
}

function drawInteractableNpc(ctx: CanvasRenderingContext2D, obj: EditorObject, x: number, y: number, z: number) {
  const name = propString(obj.properties, "name", obj.name);
  const roles = parseNpcServiceRoles(obj);
  if (roles.includes("job_master")) {
    drawJobMaster(ctx, x, y, z, name);
    return;
  }
  ctx.fillStyle = "rgba(245, 158, 11, 0.2)";
  ctx.beginPath();
  ctx.arc(x, y - 14 * z, 22 * z, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.arc(x, y - 12 * z, 10 * z, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a3820";
  ctx.fillRect(x - 6 * z, y - 2 * z, 12 * z, 12 * z);
  drawLabel(ctx, x, y + 18 * z, name, "#fbbf24", z);
}

function drawCombatNpc(ctx: CanvasRenderingContext2D, obj: EditorObject, x: number, y: number, z: number) {
  const kind = enemyKindFromName(propString(obj.properties, "name"), propString(obj.properties, "kind"));
  const img = enemyImages.get(kind);
  const name = propString(obj.properties, "name") || kind;

  if (img) {
    const frame = frameForAnim("idle", 0);
    const { bob, lunge, sway } = frameMotion(frame);
    const { w, h } = ENEMY_DRAW_SIZE[kind];
    const scale = H99_DISPLAY_SCALE * z;
    const drawW = w * scale;
    const drawH = h * scale;
    const ox = x - drawW * H99_ORIGIN.x + lunge * z;
    const oy = y - drawH * H99_ORIGIN.y + bob * z + sway * 0.3 * z;
    ctx.drawImage(img, ox, oy, drawW, drawH);
  } else {
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(x, y - 8 * z, 8 * z, 0, Math.PI * 2);
    ctx.fill();
  }

  drawLabel(ctx, x, y + 18 * z, name, "#fbbf24", z);
}

function drawPortal(ctx: CanvasRenderingContext2D, obj: EditorObject, z: number) {
  const rx = obj.x * z;
  const ry = (obj.y - obj.height) * z;
  const w = obj.width * z;
  const h = obj.height * z;
  ctx.fillStyle = "rgba(125, 211, 252, 0.28)";
  ctx.fillRect(rx, ry, w, h);
  ctx.strokeStyle = "rgba(224, 242, 254, 0.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(rx + 2, ry + 2, Math.max(0, w - 4), Math.max(0, h - 4));
}

function drawRegion(ctx: CanvasRenderingContext2D, obj: EditorObject, z: number, sanctuary: boolean) {
  const poly = regionPolygon(obj);
  if (poly.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(poly[0].x * z, poly[0].y * z);
  for (let i = 1; i < poly.length; i++) {
    ctx.lineTo(poly[i].x * z, poly[i].y * z);
  }
  ctx.closePath();
  ctx.fillStyle = sanctuary ? "rgba(192, 132, 252, 0.12)" : "rgba(167, 139, 250, 0.1)";
  ctx.fill();
  ctx.strokeStyle = sanctuary ? "rgba(192, 132, 252, 0.55)" : "rgba(167, 139, 250, 0.45)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPolygonVertexHandles(ctx: CanvasRenderingContext2D, obj: EditorObject, z: number) {
  const poly = regionPolygon(obj);
  const size = Math.max(5, 6 * Math.min(z, 1.5));
  for (const p of poly) {
    const x = p.x * z;
    const y = p.y * z;
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#c084fc";
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
  }
}

export function drawEditorObject(
  ctx: CanvasRenderingContext2D,
  obj: EditorObject,
  zoom: number,
  selected: boolean,
) {
  const z = zoom;

  if (obj.type === "region" || obj.type === "sanctuary") {
    drawRegion(ctx, obj, z, obj.type === "sanctuary" || isSanctuaryRegion(obj));
    if (selected) {
      drawPolygonVertexHandles(ctx, obj, z);
    }
    return;
  }

  if (obj.type === "exit") {
    drawPortal(ctx, obj, z);
    if (selected) {
      const rx = obj.x * z;
      const ry = (obj.y - obj.height) * z;
      const rw = obj.width * z;
      const rh = obj.height * z;
      drawSelectionRect(ctx, rx, ry, rw, rh);
      drawResizeHandles(ctx, rx, ry, rw, rh, z);
    }
    return;
  }

  const x = obj.x * z;
  const y = obj.y * z;

  if (obj.type === "save_point") {
    drawSavePoint(ctx, x, y, z, propString(obj.properties, "name", obj.name), false);
  } else if (obj.type === "quest_trigger") {
    drawQuestTrigger(ctx, x, y, z, propString(obj.properties, "name", obj.name));
  } else if (obj.type === "item") {
    drawWorldItem(ctx, x, y, z, propString(obj.properties, "name", obj.name));
  } else if (isNpcEntity(obj)) {
    const npc = normalizeNpcObject(obj);
    if (hasCombatRole(npc)) {
      drawCombatNpc(ctx, npc, x, y, z);
    } else {
      drawInteractableNpc(ctx, npc, x, y, z);
    }
  }

  if (selected) {
    drawSelectionRing(ctx, x, y - 8 * z, 22 * z);
  }
}
