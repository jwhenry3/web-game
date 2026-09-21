import { WorldHeightmap, WORLD_SCALE, type TerrainData } from "./heightmap";

export const TERRAIN_CELLS = [".", ",", "T", "H", "R", "#", "~", "S", "D", "I"] as const;
export type TerrainBrushMode = "raise" | "lower" | "flatten" | "smooth" | "paint";
export interface TerrainBrush {
  mode: TerrainBrushMode;
  /** Radius and strength are map pixels, strength is pixels per second. */
  radius: number;
  strength: number;
  height: number;
  cell: string;
}
export interface TerrainBounds { minC: number; minR: number; maxC: number; maxR: number }
export const emptyTerrain = (): TerrainData => ({ version: 1, heights: {}, cells: {} });
const clampHeight = (n: number) => Math.max(-16384, Math.min(16384, n));

/** Validate sparse authoring data without iterating over the entire base map. */
export function normalizeTerrain(value: unknown, cols = 1000000, rows = 1000000): TerrainData {
  const out = emptyTerrain();
  if (!value || typeof value !== "object") return out;
  const source = value as Partial<TerrainData>;
  const keyOK = (key: string, vertex: boolean) => {
    if (!/^(0|[1-9]\d*),(0|[1-9]\d*)$/.test(key)) return false;
    const [c, r] = key.split(",").map(Number);
    return c < cols + Number(vertex) && r < rows + Number(vertex);
  };
  if (source.heights && typeof source.heights === "object") {
    for (const [key, height] of Object.entries(source.heights)) {
      if (keyOK(key, true) && typeof height === "number" && Number.isFinite(height)) out.heights[key] = clampHeight(height);
    }
  }
  if (source.cells && typeof source.cells === "object") {
    for (const [key, cell] of Object.entries(source.cells)) {
      if (keyOK(key, false) && TERRAIN_CELLS.includes(cell as typeof TERRAIN_CELLS[number])) out.cells[key] = cell;
    }
  }
  return out;
}

export function applyTerrainBrush(field: WorldHeightmap, source: TerrainData, x: number, y: number, brush: TerrainBrush, dt: number): TerrainData {
  if (![x, y, brush.radius, brush.strength, brush.height, dt].every(Number.isFinite) || brush.radius <= 0 || dt <= 0 || brush.strength <= 0) return source;
  const { cols, rows, tile } = field.map;
  if (x < 0 || y < 0 || x > cols * tile || y > rows * tile) return source;
  const paint = brush.mode === "paint";
  if (paint && !TERRAIN_CELLS.includes(brush.cell as typeof TERRAIN_CELLS[number])) return source;
  // A bounded footprint protects both the UI and allocations from malformed brush settings.
  const radius = Math.min(tile * 32, brush.radius);
  const strength = Math.min(4096, brush.strength) * Math.min(1, dt);
  const sample = new WorldHeightmap(field.map, field.layers, source);
  const heights = { ...source.heights }, cells = { ...source.cells };
  let changed = false;
  const offset = paint ? .5 : 0;
  for (let r = Math.max(0, Math.ceil(y / tile - radius / tile - offset)); r <= Math.min(rows - Number(paint), Math.floor(y / tile + radius / tile - offset)); r++) {
    for (let c = Math.max(0, Math.ceil(x / tile - radius / tile - offset)); c <= Math.min(cols - Number(paint), Math.floor(x / tile + radius / tile - offset)); c++) {
      const distance = Math.hypot((c + offset) * tile - x, (r + offset) * tile - y);
      if (distance >= radius) continue;
      const key = `${c},${r}`, falloff = (1 - distance / radius) ** 2;
      if (paint) {
        if (sample.collisionCell(c, r) !== brush.cell) { cells[key] = brush.cell; changed = true; }
        continue;
      }
      const previous = sample.vertex(c, r) / WORLD_SCALE;
      let next = previous;
      if (brush.mode === "raise") next += strength * falloff;
      if (brush.mode === "lower") next -= strength * falloff;
      if (brush.mode === "flatten") next += Math.sign(brush.height - previous) * Math.min(Math.abs(brush.height - previous), strength * falloff);
      if (brush.mode === "smooth") {
        let total = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (c + dx < 0 || r + dy < 0 || c + dx > cols || r + dy > rows) continue;
          total += sample.vertex(c + dx, r + dy) / WORLD_SCALE; count++;
        }
        next += (total / count - previous) * Math.min(1, strength / 32) * falloff;
      }
      next = clampHeight(next);
      if (Math.abs(next - previous) > 1e-9) { heights[key] = next; changed = true; }
    }
  }
  return changed ? { version: 1, heights, cells } : source;
}

/** Includes neighbors: changing one cell affects all four surrounding height vertices. */
export function terrainChangeBounds(before?: TerrainData, after?: TerrainData): TerrainBounds | null {
  let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
  for (const kind of ["heights", "cells"] as const) {
    const a = before?.[kind] ?? {}, b = after?.[kind] ?? {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[key] === b[key]) continue;
      const [c, r] = key.split(",").map(Number);
      if (!Number.isFinite(c) || !Number.isFinite(r)) continue;
      minC = Math.min(minC, c - 1); minR = Math.min(minR, r - 1);
      maxC = Math.max(maxC, c + 1); maxR = Math.max(maxR, r + 1);
    }
  }
  return minC === Infinity ? null : { minC, minR, maxC, maxR };
}
