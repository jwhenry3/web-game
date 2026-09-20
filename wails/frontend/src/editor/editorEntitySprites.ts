import type { EditorObject } from "./editorTypes";
import {
  ENEMY_DOLL_PRESETS,
  ENEMY_KINDS,
  enemyKindFromName,
  type EnemyKind,
} from "../characters/enemies";
import { H99_DISPLAY_SCALE, H99_ORIGIN, H99_SHEET } from "../characters/heroes99";
import { isSanctuaryRegion } from "./hierarchyTree";
import { propString } from "./editorTypes";
import { parseNpcServiceRoles } from "./objectProps";
import { hasCombatRole, isNpcEntity, normalizeNpcObject } from "./npcEntity";
import { regionPolygon } from "./regionPolygon";

/**
 * Preview image per kind. Doll kinds use the baked 100x40 paper-doll cell
 * from the generator; sheet kinds use cell 0 of the animated PNG sheet —
 * the frame math below is identical either way.
 */
const ENEMY_SHEET: Record<EnemyKind, string> = {
  goblin: "/assets/spine/doll_goblin.png",
  dire_wolf: "/assets/spine/doll_dire_wolf.png",
  stone_imp: "/assets/spine/doll_stone_imp.png",
  imp: "/assets/spine/doll_imp.png",
};

/**
 * Baked previews for non-combat objects — the same 100x40 foot-anchored
 * cells the propdoll/paperdoll generators emit (tools/gen_props.py,
 * tools/gen_paperdoll.py), so map markers match the in-game art.
 */
const PROP_SHEET = {
  save_point: "/assets/spine/prop_crystal.png",
  save_point_active: "/assets/spine/prop_crystal_active.png",
  quest_trigger: "/assets/spine/prop_quest.png",
  item: "/assets/spine/prop_item.png",
  job_master: "/assets/spine/doll_job_master.png",
  npc: "/assets/spine/doll_npc.png",
} as const;

const previewImages = new Map<string, HTMLImageElement>();
let previewLoadPromise: Promise<void> | null = null;

async function loadPreviewImage(src: string): Promise<HTMLImageElement> {
  const cached = previewImages.get(src);
  if (cached) return cached;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to decode ${src}`));
    el.src = src;
  });
  previewImages.set(src, img);
  return img;
}

/** Preload enemy + prop previews used by map-editor object sprites. */
export function ensureEditorSpritesLoaded(): Promise<void> {
  if (previewImages.size >= ENEMY_KINDS.length + Object.keys(PROP_SHEET).length) {
    return Promise.resolve();
  }
  if (!previewLoadPromise) {
    const srcs = [
      ...(Object.keys(ENEMY_SHEET) as EnemyKind[]).map((k) => ENEMY_SHEET[k]),
      ...Object.values(PROP_SHEET),
    ];
    previewLoadPromise = Promise.all(srcs.map(loadPreviewImage)).then(
      () => undefined,
    );
  }
  return previewLoadPromise;
}

/** Blit a baked 100x40 cell preview, foot-anchored like the game world. */
function drawCellPreview(
  ctx: CanvasRenderingContext2D,
  src: string,
  x: number,
  y: number,
  z: number,
  scale: number,
  fallbackColor: string,
): void {
  const img = previewImages.get(src);
  if (img) {
    const { frameWidth, frameHeight } = H99_SHEET;
    const drawScale = H99_DISPLAY_SCALE * z * scale;
    const drawW = frameWidth * drawScale;
    const drawH = frameHeight * drawScale;
    const ox = x - drawW * H99_ORIGIN.x;
    const oy = y - drawH * H99_ORIGIN.y;
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, frameWidth, frameHeight, ox, oy, drawW, drawH);
    ctx.imageSmoothingEnabled = smoothing;
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.beginPath();
    ctx.arc(x, y - 8 * z, 8 * z, 0, Math.PI * 2);
    ctx.fill();
  }
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
    [x, y + h / 2],
    [x, y + h],
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
  drawCellPreview(
    ctx,
    active ? PROP_SHEET.save_point_active : PROP_SHEET.save_point,
    x, y, z, 1, "#a8e8ff",
  );
  drawLabel(ctx, x, y + 18 * z, name, active ? "#fff6c8" : "#a8e8ff", z);
}

function drawJobMaster(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, name: string) {
  drawCellPreview(ctx, PROP_SHEET.job_master, x, y, z, 1, "#e8c96a");
  drawLabel(ctx, x, y + 18 * z, name, "#e8c96a", z);
}

function drawQuestTrigger(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, name: string) {
  drawCellPreview(ctx, PROP_SHEET.quest_trigger, x, y, z, 1, "#a78bfa");
  drawLabel(ctx, x, y + 18 * z, name, "#c4b5fd", z);
}

function drawWorldItem(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, name: string) {
  drawCellPreview(ctx, PROP_SHEET.item, x, y, z, 1, "#34d399");
  drawLabel(ctx, x, y + 18 * z, name, "#6ee7b7", z);
}

function drawInteractableNpc(ctx: CanvasRenderingContext2D, obj: EditorObject, x: number, y: number, z: number) {
  const name = propString(obj.properties, "name", obj.name);
  const roles = parseNpcServiceRoles(obj);
  if (roles.includes("job_master")) {
    drawJobMaster(ctx, x, y, z, name);
    return;
  }
  drawCellPreview(ctx, PROP_SHEET.npc, x, y, z, 1, "#f59e0b");
  drawLabel(ctx, x, y + 18 * z, name, "#fbbf24", z);
}

function drawCombatNpc(ctx: CanvasRenderingContext2D, obj: EditorObject, x: number, y: number, z: number) {
  const kind = enemyKindFromName(propString(obj.properties, "name"), propString(obj.properties, "kind"));
  const name = propString(obj.properties, "name") || kind;
  drawCellPreview(
    ctx,
    ENEMY_SHEET[kind],
    x, y, z,
    ENEMY_DOLL_PRESETS[kind]?.scale ?? 1,
    "#fbbf24",
  );
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
