import { H99_COLLISION_RADIUS } from "../characters/heroes99";
import type { HouseStatePayload } from "../types";

export function houseWalkable(house: HouseStatePayload, col: number, row: number): boolean {
  return (
    col >= house.walk_origin_col &&
    col < house.walk_origin_col + house.walk_cols &&
    row >= house.walk_origin_row &&
    row < house.walk_origin_row + house.walk_rows
  );
}

/** Feet-centered circle against the house walkable island (matches server HouseCircleWalkableAt). */
export function houseCircleWalkableAt(
  house: HouseStatePayload,
  cx: number,
  cy: number,
  radius = H99_COLLISION_RADIUS,
): boolean {
  const ts = house.tile_size;
  return (
    cx - radius >= house.walk_origin_col * ts &&
    cx + radius <= (house.walk_origin_col + house.walk_cols) * ts &&
    cy - radius >= house.walk_origin_row * ts &&
    cy + radius <= (house.walk_origin_row + house.walk_rows) * ts
  );
}

/** Axis-slide movement inside the house (matches server SlideMoveHousePlayer). */
export function slideMoveHousePlayer(
  house: HouseStatePayload,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number } {
  if (houseCircleWalkableAt(house, toX, toY)) return { x: toX, y: toY };
  if (houseCircleWalkableAt(house, toX, fromY)) return { x: toX, y: fromY };
  if (houseCircleWalkableAt(house, fromX, toY)) return { x: fromX, y: toY };
  return { x: fromX, y: fromY };
}
