import type { OverworldMap } from "../types";
import { H99_COLLISION_HALF_H, H99_COLLISION_HALF_W } from "../characters/heroes99";

const WALKABLE = new Set(["H", ".", ",", "R", "T"]);

export function walkableAt(map: OverworldMap | null, x: number, y: number): boolean {
  if (!map) return true;
  const c = Math.floor(x / map.tile);
  const r = Math.floor(y / map.tile);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return false;
  return WALKABLE.has(map.cells[r * map.cols + c] ?? "");
}

/** Foot-anchored box (cx, cy) with halfW × halfH extending upward from the feet. */
export function boundsWalkableAt(
  map: OverworldMap | null,
  cx: number,
  cy: number,
  halfW = H99_COLLISION_HALF_W,
  halfH = H99_COLLISION_HALF_H,
): boolean {
  if (!map) return true;
  const left = cx - halfW;
  const right = cx + halfW;
  const top = cy - halfH;
  const bottom = cy;
  const c0 = Math.floor(left / map.tile);
  const c1 = Math.floor(right / map.tile);
  const r0 = Math.floor(top / map.tile);
  const r1 = Math.floor(bottom / map.tile);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return false;
      if (!WALKABLE.has(map.cells[r * map.cols + c] ?? "")) return false;
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

/** Player movement with a foot-anchored collision box. */
export function slideMovePlayer(
  map: OverworldMap | null,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number } {
  if (boundsWalkableAt(map, toX, toY)) return { x: toX, y: toY };
  if (boundsWalkableAt(map, toX, fromY)) return { x: toX, y: fromY };
  if (boundsWalkableAt(map, fromX, toY)) return { x: fromX, y: toY };
  return { x: fromX, y: fromY };
}

export { H99_COLLISION_HALF_H, H99_COLLISION_HALF_W };

const FILL: Record<string, number> = {
  H: 0x2a4a28,
  ".": 0x1a3a22,
  ",": 0x3d4a2e,
  R: 0x4a4034,
  T: 0x16301c,
  "#": 0x3a3a40,
  "~": 0x1a3a5a,
};

export function tileAt(map: OverworldMap, c: number, r: number): string {
  return map.cells[r * map.cols + c] ?? "#";
}

export { FILL, WALKABLE };

export const TILE_FILL_CSS: Record<string, string> = Object.fromEntries(
  Object.entries(FILL).map(([k, v]) => [k, `#${v.toString(16).padStart(6, "0")}`]),
);
