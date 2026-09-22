import type { OverworldMap } from "../types";
import { slideMovePlayer } from "../world/overworld";

/** Wire yaw uses direction (-sin(yaw), -cos(yaw)). */
export function movementYaw(dx: number, dy: number) { return Math.atan2(-dx, -dy); }

export class MovementKeys {
  private held = new Set<string>();
  private tapped = new Set<string>();
  down(key: string) { this.held.add(key.toLowerCase()); this.tapped.add(key.toLowerCase()); }
  up(key: string) { this.held.delete(key.toLowerCase()); }
  clear() { this.held.clear(); this.tapped.clear(); }
  read(bindings: Record<string, string>) {
    const down = (action: string) => {
      const key = (bindings[action] ?? "").toLowerCase();
      return this.held.has(key) || this.tapped.has(key) ? 1 : 0;
    };
    const direction = { x: down("move_right") - down("move_left"), y: down("move_down") - down("move_up") };
    this.tapped.clear();
    return direction;
  }
}

/** Swept, feet-circle collision in authoritative map pixels. */
export function moveOnMap(map: OverworldMap, x: number, y: number, dx: number, dy: number, dt: number, speed = 90) {
  const length = Math.hypot(dx, dy);
  if (!length || dt <= 0) return { x, y };
  const distance = speed * Math.min(dt, .05);
  const steps = Math.max(1, Math.ceil(distance / (map.tile / 4)));
  for (let i = 0; i < steps; i++) {
    const next = slideMovePlayer(map, x, y, x + dx / length * distance / steps, y + dy / length * distance / steps);
    x = next.x; y = next.y;
  }
  return { x, y };
}
