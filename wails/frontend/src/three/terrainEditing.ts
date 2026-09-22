import { WorldHeightmap, WORLD_SCALE, terrainNoise, type SurfaceStyle, type TerrainData, type TerrainPaints } from "./heightmap";

export type { SurfaceStyle } from "./heightmap";

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

// --- surface styles (terrain "textures") --------------------------------------

/** Resolved surface look — prop fields are densities 0..1 (spawn when
 * terrainNoise > 1 − density, so .72 trees ≈ the base forest coverage). */
export const SURFACE_DEFAULTS: Record<string, Required<SurfaceStyle>> = {
  ".": { color: "#718956", noise: .16, trees: 0, rocks: 0, grass: .48 },
  ",": { color: "#9c9a62", noise: .16, trees: 0, rocks: 0, grass: .48 },
  T: { color: "#4e7050", noise: .16, trees: .72, rocks: 0, grass: 0 },
  H: { color: "#c4b797", noise: .16, trees: 0, rocks: 0, grass: 0 },
  R: { color: "#b49b73", noise: .16, trees: 0, rocks: 0, grass: 0 },
  "#": { color: "#888b86", noise: .16, trees: 0, rocks: .34, grass: 0 },
  "~": { color: "#376b76", noise: .16, trees: 0, rocks: 0, grass: 0 },
  S: { color: "#dbe5e4", noise: .16, trees: 0, rocks: 0, grass: 0 },
  D: { color: "#cdb77d", noise: .16, trees: 0, rocks: 0, grass: 0 },
  I: { color: "#9cbfc8", noise: .16, trees: 0, rocks: 0, grass: 0 },
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Effective style for a cell: authored paint over the cell's defaults. */
export function surfaceStyle(cell: string, paints?: TerrainPaints): Required<SurfaceStyle> {
  const d = SURFACE_DEFAULTS[cell] ?? SURFACE_DEFAULTS["."];
  const p = paints?.[cell];
  return p ? { color: HEX.test(p.color ?? "") ? p.color! : d.color, noise: p.noise ?? d.noise, trees: p.trees ?? d.trees, rocks: p.rocks ?? d.rocks, grass: p.grass ?? d.grass } : d;
}

/** Sparse authoring parse — emits complete styles so zero is explicit and the
 * server's struct round-trip stays lossless. */
export function normalizePaints(value: unknown): TerrainPaints | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: TerrainPaints = {};
  for (const [cell, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!TERRAIN_CELLS.includes(cell as typeof TERRAIN_CELLS[number])) continue;
    const d = SURFACE_DEFAULTS[cell], p = (raw ?? {}) as Record<string, unknown>;
    out[cell] = {
      color: typeof p.color === "string" && HEX.test(p.color) ? p.color : d.color,
      noise: clamp01(typeof p.noise === "number" && Number.isFinite(p.noise) ? p.noise : d.noise),
      trees: clamp01(typeof p.trees === "number" && Number.isFinite(p.trees) ? p.trees : d.trees),
      rocks: clamp01(typeof p.rocks === "number" && Number.isFinite(p.rocks) ? p.rocks : d.rocks),
      grass: clamp01(typeof p.grass === "number" && Number.isFinite(p.grass) ? p.grass : d.grass),
    };
  }
  return Object.keys(out).length ? out : undefined;
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Top-down preview of a surface's 3D look: base color shaded by the same
 * terrainNoise the TerrainWorld applies, plus its prop decorations. */
export function paintSurfaceSwatch(canvas: HTMLCanvasElement, cell: string, paints?: TerrainPaints) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const style = surfaceStyle(cell, paints);
  const w = canvas.width || 48, h = canvas.height || 48;
  const img = ctx.createImageData(w, h);
  const [br, bg, bb] = hexRgb(style.color ?? "#718956");
  const px = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const shade = .91 + terrainNoise(x * .31, y * .31) * style.noise;
    const i = (y * w + x) * 4;
    px[i] = Math.min(255, br * shade);
    px[i + 1] = Math.min(255, bg * shade);
    px[i + 2] = Math.min(255, bb * shade);
    px[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Water surfaces render as an animated shader — preview the ripple.
  if (cell === "~") {
    ctx.strokeStyle = "rgba(160,210,215,.55)";
    ctx.lineWidth = Math.max(1, w / 48);
    for (let k = 0; k < 3; k++) {
      const y0 = h * (.25 + k * .25);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) ctx.lineTo(x, y0 + Math.sin(x * .3 + k * 2.1) * h * .05);
      ctx.stroke();
    }
  }
  // Prop marks on a virtual 6×6 cell grid — the same density rule as terrain.
  const grid = 6, s = w / grid;
  for (let r = 0; r < grid; r++) for (let c = 0; c < grid; c++) {
    const n = terrainNoise(c * 17, r * 29);
    const cx = (c + .5) * s, cy = (r + .5) * s;
    if (style.trees > 0 && n > 1 - style.trees) {
      ctx.fillStyle = "#325c46";
      ctx.beginPath(); ctx.arc(cx, cy - s * .08, s * .3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6c5540";
      ctx.fillRect(cx - s * .05, cy + s * .16, s * .1, s * .18);
    }
    if (style.rocks > 0 && n > 1 - style.rocks) {
      ctx.fillStyle = "#93958d";
      ctx.beginPath(); ctx.arc(cx, cy + s * .08, s * .18, 0, Math.PI * 2); ctx.fill();
    }
    if (style.grass > 0 && n > 1 - style.grass) {
      ctx.strokeStyle = "#829456";
      ctx.lineWidth = Math.max(1, w / 64);
      ctx.beginPath();
      ctx.moveTo(cx - s * .18, cy + s * .2); ctx.lineTo(cx - s * .1, cy - s * .1);
      ctx.moveTo(cx, cy + s * .2); ctx.lineTo(cx + s * .04, cy - s * .16);
      ctx.moveTo(cx + s * .16, cy + s * .2); ctx.lineTo(cx + s * .1, cy - s * .08);
      ctx.stroke();
    }
  }
}

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
  const paints = normalizePaints(source.paints);
  if (paints) out.paints = paints;
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
  return changed ? { version: 1, heights, cells, ...(source.paints ? { paints: source.paints } : {}) } : source;
}

const paintsEqual = (a?: TerrainPaints, b?: TerrainPaints) => {
  const ak = Object.keys(a ?? {}), bk = Object.keys(b ?? {});
  return ak.length === bk.length && ak.every(k => {
    const x = a![k], y = b![k];
    return !!x && !!y && x.color === y.color && x.noise === y.noise && x.trees === y.trees && x.rocks === y.rocks && x.grass === y.grass;
  });
};

/** Includes neighbors: changing one cell affects all four surrounding height
 * vertices; a paints change recolors the whole map, so it reports unbounded. */
export function terrainChangeBounds(before?: TerrainData, after?: TerrainData): TerrainBounds | null {
  if (!paintsEqual(before?.paints, after?.paints)) return { minC: 0, minR: 0, maxC: Infinity, maxR: Infinity };
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
