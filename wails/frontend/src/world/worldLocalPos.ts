/** Predicted overworld feet position + rendered yaw from WorldRenderer (minimap / HUD). */
let x = 0;
let y = 0;
let facing: number | undefined;
let valid = false;

export function setWorldLocalPos(nx: number, ny: number, nfacing?: number) {
  x = nx;
  y = ny;
  facing = nfacing;
  valid = true;
}

export function clearWorldLocalPos() {
  valid = false;
  facing = undefined;
}

export function getWorldLocalPos(): { x: number; y: number; facing?: number } | null {
  return valid ? { x, y, facing } : null;
}
