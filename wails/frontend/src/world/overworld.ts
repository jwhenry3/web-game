import type { OverworldMap } from "../types";
import { H99_COLLISION_RADIUS } from "../characters/heroes99";

const WALKABLE = new Set(["H", ".", ",", "R", "T", "S", "D", "I"]);

export function walkableAt(map: OverworldMap | null, x: number, y: number): boolean {
  if (!map) return true;
  const c = Math.floor(x / map.tile);
  const r = Math.floor(y / map.tile);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return false;
  return WALKABLE.has(map.cells[r * map.cols + c] ?? "");
}

/**
 * Feet-centered collision circle — true when the circle fits on walkable
 * tiles: fully inside the map and no blocked cell's rect overlaps it.
 */
export function circleWalkableAt(
  map: OverworldMap | null,
  cx: number,
  cy: number,
  radius = H99_COLLISION_RADIUS,
): boolean {
  if (!map) return true;
  const t = map.tile;
  if (
    cx - radius < 0 ||
    cy - radius < 0 ||
    cx + radius > map.cols * t ||
    cy + radius > map.rows * t
  ) {
    return false;
  }
  const c0 = Math.floor((cx - radius) / t);
  const c1 = Math.floor((cx + radius) / t);
  const r0 = Math.floor((cy - radius) / t);
  const r1 = Math.floor((cy + radius) / t);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (WALKABLE.has(map.cells[r * map.cols + c] ?? "")) continue;
      // Closest point on the blocked cell's rect to the circle center.
      const px = Math.min(Math.max(cx, c * t), (c + 1) * t);
      const py = Math.min(Math.max(cy, r * t), (r + 1) * t);
      const dx = cx - px;
      const dy = cy - py;
      if (dx * dx + dy * dy < radius * radius) return false;
    }
  }
  return true;
}

export function slideMove(
  map: OverworldMap | null,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number } {
  if (walkableAt(map, toX, toY)) return { x: toX, y: toY };
  if (walkableAt(map, toX, fromY)) return { x: toX, y: fromY };
  if (walkableAt(map, fromX, toY)) return { x: fromX, y: toY };
  return { x: fromX, y: fromY };
}

/** Player movement with a feet-centered collision circle. */
export function slideMovePlayer(
  map: OverworldMap | null,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number } {
  if (circleWalkableAt(map, toX, toY)) return { x: toX, y: toY };
  if (circleWalkableAt(map, toX, fromY)) return { x: toX, y: fromY };
  if (circleWalkableAt(map, fromX, toY)) return { x: fromX, y: toY };
  return { x: fromX, y: fromY };
}

export { H99_COLLISION_RADIUS };

const FILL: Record<string, number> = {
  H: 0x2a4a28,
  ".": 0x1a3a22,
  ",": 0x3d4a2e,
  R: 0x4a4034,
  T: 0x16301c,
  "#": 0x3a3a40,
  "~": 0x1a3a5a,
  S: 0xdfe8ee, // snow
  D: 0xd0b47a, // sand / dunes
  I: 0x8fbdd4, // ice
};

export function tileAt(map: OverworldMap, c: number, r: number): string {
  return map.cells[r * map.cols + c] ?? "#";
}

export { FILL, WALKABLE };

export const TILE_FILL_CSS: Record<string, string> = Object.fromEntries(
  Object.entries(FILL).map(([k, v]) => [k, `#${v.toString(16).padStart(6, "0")}`]),
);
