import { H99_COLLISION_HALF_H, H99_COLLISION_HALF_W } from "../characters/heroes99";
import type { HouseStatePayload } from "../types";

function houseWalkable(house: HouseStatePayload, col: number, row: number): boolean {
  return (
    col >= house.walk_origin_col &&
    col < house.walk_origin_col + house.walk_cols &&
    row >= house.walk_origin_row &&
    row < house.walk_origin_row + house.walk_rows
  );
}

/** Foot-anchored box against the house walkable island (matches server HouseBoundsWalkableAt). */
export function houseBoundsWalkableAt(
  house: HouseStatePayload,
  cx: number,
  cy: number,
  halfW = H99_COLLISION_HALF_W,
  halfH = H99_COLLISION_HALF_H,
): boolean {
  const ts = house.tile_size;
  const left = cx - halfW;
  const right = cx + halfW;
  const top = cy - halfH;
  const bottom = cy;
  const c0 = Math.floor(left / ts);
  const c1 = Math.floor(right / ts);
  const r0 = Math.floor(top / ts);
  const r1 = Math.floor(bottom / ts);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!houseWalkable(house, c, r)) return false;
    }
  }
  return true;
}

/** Axis-slide movement inside the house (matches server SlideMoveHousePlayer). */
export function slideMoveHousePlayer(
  house: HouseStatePayload,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number } {
  if (houseBoundsWalkableAt(house, toX, toY)) return { x: toX, y: toY };
  if (houseBoundsWalkableAt(house, toX, fromY)) return { x: toX, y: fromY };
  if (houseBoundsWalkableAt(house, fromX, toY)) return { x: fromX, y: toY };
  return { x: fromX, y: fromY };
}
