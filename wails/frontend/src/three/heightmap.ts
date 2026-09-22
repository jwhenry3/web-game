import type { MapTerrainLayers, OverworldMap } from "../types";

/** Authored look for one surface type — the "texture" the terrain paints.
 * Optional fields resolve against per-cell defaults in terrainEditing. */
export interface SurfaceStyle {
  /** Base ground color (#rrggbb). */
  color?: string;
  /** Brightness variation amplitude applied over terrainNoise (default .16). */
  noise?: number;
  /** Prop density 0..1 — fraction of cells spawning each decoration. */
  trees?: number;
  rocks?: number;
  grass?: number;
}
export type TerrainPaints = Record<string, SurfaceStyle>;

/** Sparse authored elevation in map pixels; biome overrides also control walkability. */
export interface TerrainData {
  version: 1;
  heights: Record<string, number>;
  cells: Record<string, string>;
  /** Per-surface visual styles keyed by cell char (appearance only — never
   * affects elevation or walkability). */
  paints?: TerrainPaints;
}

export const WORLD_SCALE = 1 / 16;
/** How much world geometry grew vs the original 1/32 scale — terrain relief, props and markers scale by this so the world keeps its proportions while actors stay the same size. */
export const WORLD_ZOOM = WORLD_SCALE * 32;
/** Stable world-space variation; never depends on the active terrain chunk. */
export function terrainNoise(x: number, y: number): number {
  return (Math.sin(x * .17 + Math.cos(y * .13) * 2) + Math.cos(y * .21 - x * .08) + 2) / 4;
}
export class WorldHeightmap {
  constructor(readonly map: OverworldMap, readonly layers?: MapTerrainLayers, public terrain?: TerrainData) {}
  setTerrain(terrain?: TerrainData) { this.terrain = terrain; }
  /** Collision must preserve blocked tree trunks, unlike their visual biome. */
  collisionCell(c: number, r: number): string {
    if (c < 0 || r < 0 || c >= this.map.cols || r >= this.map.rows) return "#";
    return this.terrain?.cells[`${c},${r}`] ?? this.map.cells[r * this.map.cols + c] ?? "#";
  }
  cell(c: number, r: number): string {
    c = Math.max(0, Math.min(this.map.cols - 1, c));
    r = Math.max(0, Math.min(this.map.rows - 1, r));
    const index = r * this.map.cols + c;
    const override = this.terrain?.cells[`${c},${r}`];
    if (override !== undefined) return override;
    const cell = this.map.cells[index] ?? "#";
    // Tree trunks share blocked collision cells with cliffs. Their ground
    // layer identifies woodland, so they must not become mountain spikes.
    const gid = (this.layers?.ground[index] ?? 0) & 0x1fffffff;
    if (cell === "#" && ((gid >= 585 && gid <= 608) || (gid >= 6008 && gid <= 6015))) return "T";
    return cell;
  }
  vertex(c: number, r: number): number {
    const override = this.terrain?.heights[`${c},${r}`];
    if (Number.isFinite(override)) return override! * WORLD_SCALE;
    const cells = [this.cell(c - 1, r - 1), this.cell(c, r - 1), this.cell(c - 1, r), this.cell(c, r)];
    // Preserve bridges/roads and town foundations, even beside mountains.
    if (cells.some(v => v === "H" || v === "R")) return .24 * WORLD_ZOOM;
    if (cells.includes("I")) return .06 * WORLD_ZOOM;
    if (cells.includes("~")) return (-.18 - terrainNoise(c, r) * .18) * WORLD_ZOOM;
    const n = terrainNoise(c, r);
    return cells.reduce((sum, cell) => sum + (
      cell === "#" ? 1.7 + n * 2.9 :
      cell === "S" ? .55 + n * .7 :
      cell === "D" ? .18 + n * .5 :
      cell === "T" ? .38 + n * .6 : .22 + n * .38
    ), 0) * WORLD_ZOOM / 4;
  }
  /** Barycentric interpolation matches each mesh's a,d,b / b,d,e triangles. */
  height(x: number, y: number): number {
    const u = Math.max(0, Math.min(this.map.cols - 1e-7, x / this.map.tile));
    const v = Math.max(0, Math.min(this.map.rows - 1e-7, y / this.map.tile));
    const c = Math.floor(u), r = Math.floor(v), fx = u - c, fy = v - r;
    const b = this.vertex(c + 1, r), d = this.vertex(c, r + 1);
    return fx + fy <= 1
      ? this.vertex(c, r) * (1 - fx - fy) + b * fx + d * fy
      : this.vertex(c + 1, r + 1) * (fx + fy - 1) + b * (1 - fy) + d * (1 - fx);
  }
}
