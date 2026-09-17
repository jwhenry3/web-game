/** Camera world-view rect (world px) published by WorldScene each frame —
 *  used to keep targeting pools to what's actually on screen. */
export interface WorldViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

let rect: WorldViewRect | null = null;

export function setWorldViewRect(x: number, y: number, w: number, h: number) {
  rect = { x, y, w, h };
}

export function clearWorldViewRect() {
  rect = null;
}

export function getWorldViewRect(): WorldViewRect | null {
  return rect;
}
