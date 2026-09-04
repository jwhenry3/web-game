import type { OverworldMap } from "../types";
import { H99_COLLISION_HALF_H, H99_COLLISION_HALF_W } from "../characters/heroes99";
import { slideMovePlayer } from "../world/overworld";

export interface MovementResult {
  x: number;
  y: number;
}

/** Optional Go-backed movement prediction (Wails). When unset, TS slideMove is used. */
export interface MovementBridge {
  slidePlayer(
    map: OverworldMap | null,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): MovementResult | Promise<MovementResult>;
}

let bridge: MovementBridge | null = null;

export function setMovementBridge(b: MovementBridge | null): void {
  bridge = b;
}

export async function applyPlayerSlide(
  map: OverworldMap | null,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Promise<MovementResult> {
  if (bridge) {
    return bridge.slidePlayer(map, fromX, fromY, toX, toY);
  }
  return slideMovePlayer(map, fromX, fromY, toX, toY);
}

export { H99_COLLISION_HALF_H, H99_COLLISION_HALF_W };
