import { colorForGid, BASE_CHIP_FIRST_GID } from "../editor/tilePalette";
import type { ImportedTileset } from "../editor/tilesetConfig";
import { getLoadedPipoyaSheets, resolvePipoyaTile, type LoadedPipoyaSheet } from "./pipoyaTilesets";
import { WALKABLE } from "./overworld";

export interface TerrainLayerData {
  ground: number[];
  collision: number[];
  /** Resolved per-cell unwalkability from the snapshot's cell chars. */
  blocked?: Uint8Array;
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

/** Top half of 2×2 trees — drawn on the overhead layer so the player walks under.
 *  BaseChip: small trees 8-15, big trees 24-31. MundiTerrain: 8-15. */
function isTreeCanopyLocal(sheetId: string, local: number): boolean {
  if (sheetId === "munditerrain") return local >= 8 && local <= 15;
  return (local >= 8 && local <= 15) || (local >= 24 && local <= 31);
}

/** MundiTerrain opaque fills — everything above local 7 is a transparent prop/tree. */
const MUNDI_FILL_MAX_LOCAL = 7;
const MUNDI_FIRST_GID = 6000;

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
  if (hit.sheet.id === "munditerrain") return hit.local > MUNDI_FILL_MAX_LOCAL;
  if (hit.sheet.id !== "basechip") return false;
  return !SOLID_BASECHIP_LOCALS.has(hit.local);
}

/** Candidate underlay fills: dominant ground GID among basechip grass/dirt
 *  and the MundiTerrain fills (snow/sand/etc. under props on those biomes). */
const UNDERLAY_CANDIDATES = [
  BASE_CHIP_FIRST_GID + 0, // grass
  BASE_CHIP_FIRST_GID + 5, // dirt
  MUNDI_FIRST_GID + 0, // snow
  MUNDI_FIRST_GID + 1, // packed snow
  MUNDI_FIRST_GID + 3, // dune sand
  MUNDI_FIRST_GID + 4, // beach sand
  MUNDI_FIRST_GID + 5, // scree
  MUNDI_FIRST_GID + 7, // peat
];

function pickGroundUnderlayGid(data: TerrainLayerData): number {
  const counts = new Map<number, number>();
  for (let i = 0; i < data.ground.length; i += 97) {
    const gid = data.ground[i] & 0x1fffffff;
    counts.set(gid, (counts.get(gid) ?? 0) + 1);
  }
  let best = BASE_CHIP_FIRST_GID + 0;
  let bestN = 0;
  for (const gid of UNDERLAY_CANDIDATES) {
    const n = counts.get(gid) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = gid;
    }
  }
  return best;
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
  return rasterizeTerrainRect(data, 0, 0, data.cols, data.rows, scale, tileset, sheets);
}

/**
 * Paint a tile-rect of terrain onto a canvas sized to the rect. World-scale
 * maps rasterize per-chunk — a single whole-map canvas exceeds browser limits.
 */
export function rasterizeTerrainRect(
  data: TerrainLayerData,
  c0: number,
  r0: number,
  c1: number,
  r1: number,
  scale = 1,
  tileset: ImportedTileset | null = null,
  sheets: LoadedPipoyaSheet[] | null = getLoadedPipoyaSheets(),
): RasterizedTerrain {
  const tilePx = data.tileSize * scale;
  const cols = Math.max(0, Math.min(c1, data.cols) - Math.max(0, c0));
  const rows = Math.max(0, Math.min(r1, data.rows) - Math.max(0, r0));
  const w = Math.max(1, Math.round(cols * tilePx));
  const h = Math.max(1, Math.round(rows * tilePx));

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

  const sc0 = Math.max(0, c0);
  const sr0 = Math.max(0, r0);
  const sc1 = Math.min(c1, data.cols);
  const sr1 = Math.min(r1, data.rows);
  for (let r = sr0; r < sr1; r++) {
    for (let c = sc0; c < sc1; c++) {
      const i = r * data.cols + c;
      const gid = data.ground[i] & 0x1fffffff;
      const x = (c - sc0) * tilePx;
      const y = (r - sr0) * tilePx;

      const hit = useSheets && gid > 0 ? resolvePipoyaTile(gid, sheets!) : null;
      const canopy =
        !!hit &&
        (hit.sheet.id === "basechip" || hit.sheet.id === "munditerrain") &&
        isTreeCanopyLocal(hit.sheet.id, hit.local);

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

/**
 * Sampled hash of the layer arrays — must match terrain_hash() in
 * tools/bake_terrain.py, which writes it into each baked manifest so the
 * client can reject stale bakes.
 */
export function terrainLayerHash(layers: {
  ground: number[];
  collision: number[];
  blocked?: ArrayLike<number>;
}): number {
  let h = layers.ground.length;
  for (let i = 0; i < layers.ground.length; i += 97) h = (Math.imul(h, 31) + layers.ground[i]) | 0;
  for (let i = 0; i < layers.collision.length; i += 97) h = (Math.imul(h, 31) + layers.collision[i]) | 0;
  if (layers.blocked) {
    for (let i = 0; i < layers.blocked.length; i += 97) h = (Math.imul(h, 31) + layers.blocked[i]) | 0;
  }
  return h >>> 0;
}

export function terrainLayerKey(
  layers: { ground: number[]; collision: number[]; blocked?: ArrayLike<number> },
  sheetsReady = false,
): string {
  return `terrain-${sheetsReady ? "pipoya-v6" : "flat"}-${layers.ground.length}-${terrainLayerHash(layers)}`;
}

export function terrainLayersFromSnapshot(
  overworld: { cols: number; rows: number; tile: number; cells?: string },
  layers?: { ground: number[]; collision: number[] } | null,
): TerrainLayerData | null {
  if (!layers?.ground?.length || !layers.collision?.length) return null;
  const n = overworld.cols * overworld.rows;
  if (layers.ground.length !== n || layers.collision.length !== n) return null;
  let blocked: Uint8Array | undefined;
  if (overworld.cells && overworld.cells.length === n) {
    blocked = new Uint8Array(n);
    for (let i = 0; i < n; i++) blocked[i] = WALKABLE.has(overworld.cells[i] ?? "") ? 0 : 1;
  }
  return {
    ground: layers.ground,
    collision: layers.collision,
    blocked,
    cols: overworld.cols,
    rows: overworld.rows,
    tileSize: overworld.tile || 32,
  };
}
