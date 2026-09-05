/**
 * Continuous Y-axis facing (radians), matching Three.js model `rotation.y`.
 *
 *   0      north (−map Y)
 *  −π/2   east  (+map X)
 *   π     south (+map Y)
 *   π/2   west  (−map X)
 */
export type FacingYaw = number;

export const FACING_YAW_NORTH = 0;
export const FACING_YAW_EAST = -Math.PI / 2;
export const FACING_YAW_SOUTH = Math.PI;
export const FACING_YAW_WEST = Math.PI / 2;
export const FACING_YAW_DEFAULT = FACING_YAW_SOUTH;

/** @deprecated alias — prefer FacingYaw */
export type WorldFacing = FacingYaw;
export const WORLD_FACING_DEFAULT = FACING_YAW_DEFAULT;

export function normalizeYaw(yaw: number): number {
  if (!Number.isFinite(yaw)) return FACING_YAW_DEFAULT;
  const twoPi = Math.PI * 2;
  let y = ((yaw + Math.PI) % twoPi + twoPi) % twoPi;
  return y - Math.PI;
}

/** Parse wire facing: number radians, or legacy left/right/8-way string. */
export function parseFacingYaw(
  value: number | string | undefined | null,
  fallback: FacingYaw = FACING_YAW_DEFAULT,
): FacingYaw {
  if (typeof value === "number" && Number.isFinite(value)) return normalizeYaw(value);
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    switch (s) {
      case "up":
      case "north":
        return FACING_YAW_NORTH;
      case "up-right":
        return normalizeYaw(-Math.PI / 4);
      case "right":
      case "east":
        return FACING_YAW_EAST;
      case "down-right":
        return normalizeYaw((-3 * Math.PI) / 4);
      case "down":
      case "south":
        return FACING_YAW_SOUTH;
      case "down-left":
        return normalizeYaw((3 * Math.PI) / 4);
      case "left":
      case "west":
        return FACING_YAW_WEST;
      case "up-left":
        return normalizeYaw(Math.PI / 4);
      default: {
        const n = Number(s);
        if (Number.isFinite(n)) return normalizeYaw(n);
      }
    }
  }
  return normalizeYaw(fallback);
}

/** @deprecated */
export function parseWorldFacing(
  value: number | string | undefined | null,
  fallback: FacingYaw = FACING_YAW_DEFAULT,
): FacingYaw {
  return parseFacingYaw(value, fallback);
}

/**
 * Model yaw from map-space motion (+x right, +y down).
 * Matches KayKit convention: modelYaw = −atan2(dx, −dy).
 */
export function facingFromAxes(dx: number, dy: number, current: FacingYaw): FacingYaw {
  if (dx === 0 && dy === 0) return normalizeYaw(current);
  return normalizeYaw(-Math.atan2(dx, -dy));
}

/** Identity — facing is already model yaw. */
export function facingYaw(facing: FacingYaw): number {
  return normalizeYaw(facing);
}

/** Unit vector on the map (+x right, +y down). */
export function facingDir(yaw: FacingYaw): { x: number; y: number } {
  const y = normalizeYaw(yaw);
  return { x: -Math.sin(y), y: -Math.cos(y) };
}

/** Pet follow offset behind the owner. */
export function followOffset(yaw: FacingYaw, dist: number): { x: number; y: number } {
  const d = facingDir(yaw);
  return { x: -d.x * dist, y: -d.y * dist };
}

/** Face along camera-forward (W / away-from-camera). Orbit yaw 0 → north. */
export function facingFromCameraYaw(cameraYaw: number): FacingYaw {
  return normalizeYaw(cameraYaw);
}
