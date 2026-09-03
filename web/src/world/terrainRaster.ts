import { colorForGid, TERRAIN_COLORS } from "../editor/tilePalette";
import type { ImportedTileset } from "../editor/tilesetConfig";

export interface TerrainLayerData {
  ground: number[];
  collision: number[];
  cols: number;
  rows: number;
  tileSize: number;
}

/** Paint editor-style terrain (role colors from GIDs — no tileset images). */
export function rasterizeTerrainToCanvas(
  data: TerrainLayerData,
  scale = 1,
  tileset: ImportedTileset | null = null,
): HTMLCanvasElement {
  const tilePx = data.tileSize * scale;
  const w = Math.max(1, Math.round(data.cols * tilePx));
  const h = Math.max(1, Math.round(data.rows * tilePx));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols; c++) {
      const i = r * data.cols + c;
      const gid = data.ground[i] & 0x1fffffff;
      const x = c * tilePx;
      const y = r * tilePx;
      ctx.fillStyle = colorForGid(gid, tileset);
      ctx.fillRect(x, y, tilePx, tilePx);
      if (data.collision[i]) {
        ctx.fillStyle = TERRAIN_COLORS.collision;
        ctx.fillRect(x, y, tilePx, tilePx);
      }
    }
  }
  return canvas;
}

export function terrainLayerKey(layers: { ground: number[]; collision: number[] }): string {
  let h = layers.ground.length;
  for (let i = 0; i < layers.ground.length; i += 97) h = (Math.imul(h, 31) + layers.ground[i]) | 0;
  for (let i = 0; i < layers.collision.length; i += 97) h = (Math.imul(h, 31) + layers.collision[i]) | 0;
  return `terrain-${layers.ground.length}-${h >>> 0}`;
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
