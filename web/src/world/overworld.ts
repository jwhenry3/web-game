import type { OverworldMap } from "../types";

const WALKABLE = new Set(["H", ".", ",", "R"]);

export function walkableAt(map: OverworldMap | null, x: number, y: number): boolean {
  if (!map) return true;
  const c = Math.floor(x / map.tile);
  const r = Math.floor(y / map.tile);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return false;
  return WALKABLE.has(map.cells[r * map.cols + c] ?? "");
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
