import { colorForGid, TERRAIN_COLORS } from "./tilePalette";
import type { ImportedTileset } from "./tilesetConfig";

export interface TerrainLayerData {
  ground: number[];
  collision: number[];
  cols: number;
  rows: number;
  tileSize: number;
}

export interface TerrainCache {
  canvas: HTMLCanvasElement;
  key: string;
}

function terrainCacheKey(
  data: TerrainLayerData,
  zoom: number,
  tileset: ImportedTileset | null,
  revision: number,
): string {
  const ts = tileset?.imageDataUrl?.slice(0, 32) ?? "none";
  return `${revision}|${data.cols}x${data.rows}|${zoom}|${ts}`;
}

/** Rasterize ground + collision into an offscreen canvas (reused until key changes). */
export function getTerrainCache(
  data: TerrainLayerData,
  zoom: number,
  tileset: ImportedTileset | null,
  revision: number,
  prev: TerrainCache | null,
  options?: { gridLines?: boolean },
): TerrainCache {
  const key = terrainCacheKey(data, zoom, tileset, revision);
  if (prev && prev.key === key) return prev;

  const scale = data.tileSize * zoom;
  const w = Math.max(1, Math.round(data.cols * scale));
  const h = Math.max(1, Math.round(data.rows * scale));

  const canvas = prev?.canvas ?? document.createElement("canvas");
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, key };

  const gridLines = options?.gridLines ?? zoom >= 1.5;

  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols; c++) {
      const i = r * data.cols + c;
      const gid = data.ground[i] & 0x1fffffff;
      const x = c * scale;
      const y = r * scale;
      ctx.fillStyle = colorForGid(gid, tileset);
      ctx.fillRect(x, y, scale, scale);
      if (data.collision[i]) {
        ctx.fillStyle = TERRAIN_COLORS.collision;
        ctx.fillRect(x, y, scale, scale);
      }
      if (gridLines) {
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.strokeRect(x, y, scale, scale);
      }
    }
  }

  return { canvas, key };
}
