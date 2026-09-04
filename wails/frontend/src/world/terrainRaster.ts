import { colorForGid, BASE_CHIP_FIRST_GID } from "../editor/tilePalette";
import type { ImportedTileset } from "../editor/tilesetConfig";
import { getLoadedPipoyaSheets, resolvePipoyaTile, type LoadedPipoyaSheet } from "./pipoyaTilesets";

export interface TerrainLayerData {
  ground: number[];
  collision: number[];
  cols: number;
  rows: number;
  tileSize: number;
}

/** Solid BaseChip fills that fully cover a cell (no grass underlay needed). */
const SOLID_BASECHIP_LOCALS = new Set([
  0, 1, 2, // grass fills
  5, 7, 115, // dirt fills
  116, 117, 118, 119, 120, 122, 123, 124, 125, 126, // cobble / dirt solids
  128, 129, 130, 131, 132,
  256, 257, 258, 259, 260, // stone wall fills
  // Note: tree pieces 8–23 and bushes 32–35 are transparent props — always underlay grass.
]);

/** Top half of Pipoya 2×2 trees — drawn on the overhead layer so the player walks under. */
function isTreeCanopyLocal(local: number): boolean {
  return local >= 8 && local <= 15;
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  sheets: LoadedPipoyaSheet[],
  gid: number,
  x: number,
  y: number,
  tilePx: number,
): boolean {
  const hit = resolvePipoyaTile(gid, sheets);
  if (!hit) return false;
  ctx.drawImage(
    hit.sheet.img,
    hit.sx,
    hit.sy,
    hit.sheet.tileWidth,
    hit.sheet.tileHeight,
    x,
    y,
    tilePx,
    tilePx,
  );
  return true;
}

function needsGrassUnderlay(gid: number, sheets: LoadedPipoyaSheet[]): boolean {
  const hit = resolvePipoyaTile(gid, sheets);
  if (!hit) return false;
  if (hit.sheet.id !== "basechip") return false;
  return !SOLID_BASECHIP_LOCALS.has(hit.local);
}

function pickGroundUnderlayGid(data: TerrainLayerData): number {
  let dirt = 0;
  let grass = 0;
  for (let i = 0; i < data.ground.length; i += 97) {
    const local = (data.ground[i] & 0x1fffffff) - BASE_CHIP_FIRST_GID;
    if (local === 0 || local === 1 || local === 2) grass++;
    else if (local === 5 || local === 115) dirt++;
  }
  return dirt > grass ? BASE_CHIP_FIRST_GID + 5 : BASE_CHIP_FIRST_GID + 0;
}

export interface RasterizedTerrain {
  base: HTMLCanvasElement;
  /** Transparent canopy tops drawn above the player. */
  overhead: HTMLCanvasElement | null;
}

/** Paint terrain; canopy tops go on a separate overhead canvas for walk-under depth. */
export function rasterizeTerrainLayers(
  data: TerrainLayerData,
  scale = 1,
  tileset: ImportedTileset | null = null,
  sheets: LoadedPipoyaSheet[] | null = getLoadedPipoyaSheets(),
): RasterizedTerrain {
  const tilePx = data.tileSize * scale;
  const w = Math.max(1, Math.round(data.cols * tilePx));
  const h = Math.max(1, Math.round(data.rows * tilePx));

  const base = document.createElement("canvas");
  base.width = w;
  base.height = h;
  const baseCtx = base.getContext("2d");
  if (!baseCtx) return { base, overhead: null };
  baseCtx.imageSmoothingEnabled = false;

  const overhead = document.createElement("canvas");
  overhead.width = w;
  overhead.height = h;
  const overCtx = overhead.getContext("2d");
  if (!overCtx) return { base, overhead: null };
  overCtx.imageSmoothingEnabled = false;

  const useSheets = sheets && sheets.length > 0;
  const grassFillGid = BASE_CHIP_FIRST_GID + 0;
  const canopyUnderlayGid = pickGroundUnderlayGid(data);
  let overheadUsed = false;

  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols; c++) {
      const i = r * data.cols + c;
      const gid = data.ground[i] & 0x1fffffff;
      const x = c * tilePx;
      const y = r * tilePx;

      const hit = useSheets && gid > 0 ? resolvePipoyaTile(gid, sheets!) : null;
      const canopy = !!hit && hit.sheet.id === "basechip" && isTreeCanopyLocal(hit.local);

      if (canopy) {
        // Base: only the ground under the leaves.
        if (useSheets) {
          drawTile(baseCtx, sheets!, canopyUnderlayGid, x, y, tilePx);
        } else {
          baseCtx.fillStyle = colorForGid(canopyUnderlayGid, tileset);
          baseCtx.fillRect(x, y, tilePx, tilePx);
        }
        if (useSheets && drawTile(overCtx, sheets!, gid, x, y, tilePx)) {
          overheadUsed = true;
        }
        continue;
      }

      let painted = false;
      if (useSheets && gid > 0) {
        if (needsGrassUnderlay(gid, sheets!)) {
          drawTile(baseCtx, sheets!, grassFillGid, x, y, tilePx);
        }
        painted = drawTile(baseCtx, sheets!, gid, x, y, tilePx);
      }
      if (!painted) {
        baseCtx.fillStyle = colorForGid(gid, tileset);
        baseCtx.fillRect(x, y, tilePx, tilePx);
      }
    }
  }

  return { base, overhead: overheadUsed ? overhead : null };
}

/** @deprecated Prefer rasterizeTerrainLayers for walk-under canopy support. */
export function rasterizeTerrainToCanvas(
  data: TerrainLayerData,
  scale = 1,
  tileset: ImportedTileset | null = null,
  sheets: LoadedPipoyaSheet[] | null = getLoadedPipoyaSheets(),
): HTMLCanvasElement {
  return rasterizeTerrainLayers(data, scale, tileset, sheets).base;
}

export function terrainLayerKey(
  layers: { ground: number[]; collision: number[] },
  sheetsReady = false,
): string {
  let h = layers.ground.length;
  for (let i = 0; i < layers.ground.length; i += 97) h = (Math.imul(h, 31) + layers.ground[i]) | 0;
  for (let i = 0; i < layers.collision.length; i += 97) h = (Math.imul(h, 31) + layers.collision[i]) | 0;
  return `terrain-${sheetsReady ? "pipoya-v5" : "flat"}-${layers.ground.length}-${h >>> 0}`;
}

export function terrainLayersFromSnapshot(
  overworld: { cols: number; rows: number; tile: number },
  layers?: { ground: number[]; collision: number[] } | null,
): TerrainLayerData | null {
  if (!layers?.ground?.length || !layers.collision?.length) return null;
  const n = overworld.cols * overworld.rows;
  if (layers.ground.length !== n || layers.collision.length !== n) return null;
  return {
    ground: layers.ground,
    collision: layers.collision,
    cols: overworld.cols,
    rows: overworld.rows,
    tileSize: overworld.tile || 32,
  };
}
