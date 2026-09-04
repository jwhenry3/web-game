/** Predicted overworld feet position from WorldScene (minimap / HUD). */
let x = 0;
let y = 0;
let valid = false;

export function setWorldLocalPos(nx: number, ny: number) {
  x = nx;
  y = ny;
  valid = true;
}

export function clearWorldLocalPos() {
  valid = false;
}

export function getWorldLocalPos(): { x: number; y: number } | null {
  return valid ? { x, y } : null;
}
