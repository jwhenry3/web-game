import type { EditorObject } from "./editorTypes";
import { isPointLikeObject } from "./editorCanvasUtils";
import { objectsMatch } from "./objectProps";
import {
  regionPolygon,
  snapPolyPoint,
  translatePolygon,
  withSyncedRegionBounds,
} from "./regionPolygon";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export interface ObjectDragState {
  mode: "move" | "resize" | "vertex";
  handle?: ResizeHandle;
  vertexIndex?: number;
  startWx: number;
  startWy: number;
  orig: EditorObject;
}

export function objectKey(obj: EditorObject): string {
  if (obj.id != null) return `id:${obj.id}`;
  return `${obj.type}:${obj.name}`;
}

export function isPolygonRegion(obj: EditorObject): boolean {
  return obj.type === "region" || obj.type === "sanctuary";
}

export function canResizeObject(obj: EditorObject): boolean {
  // Regions/sanctuaries use vertex handles; exits keep AABB handles.
  return obj.type === "exit";
}

export function isDraggableObject(obj: EditorObject): boolean {
  return isPointLikeObject(obj) || isPolygonRegion(obj) || obj.type === "exit";
}

export function objectBounds(obj: EditorObject) {
  if (obj.point) {
    return { left: obj.x, top: obj.y, right: obj.x, bottom: obj.y };
  }
  return {
    left: obj.x,
    top: obj.y - obj.height,
    right: obj.x + obj.width,
    bottom: obj.y,
  };
}

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function handlePoint(b: ReturnType<typeof objectBounds>, handle: ResizeHandle): { x: number; y: number } {
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  switch (handle) {
    case "nw":
      return { x: b.left, y: b.top };
    case "n":
      return { x: cx, y: b.top };
    case "ne":
      return { x: b.right, y: b.top };
    case "e":
      return { x: b.right, y: cy };
    case "se":
      return { x: b.right, y: b.bottom };
    case "s":
      return { x: cx, y: b.bottom };
    case "sw":
      return { x: b.left, y: b.bottom };
    case "w":
      return { x: b.left, y: cy };
  }
}

export function hitResizeHandle(
  obj: EditorObject,
  wx: number,
  wy: number,
  tileSize: number,
): ResizeHandle | null {
  if (!canResizeObject(obj)) return null;
  const b = objectBounds(obj);
  const r = tileSize * 0.5;
  for (const h of HANDLES) {
    const p = handlePoint(b, h);
    if (Math.hypot(wx - p.x, wy - p.y) <= r) return h;
  }
  return null;
}

export function hitVertexHandle(obj: EditorObject, wx: number, wy: number, tileSize: number): number | null {
  if (!isPolygonRegion(obj)) return null;
  const poly = regionPolygon(obj);
  const r = tileSize * 0.45;
  for (let i = 0; i < poly.length; i++) {
    if (Math.hypot(wx - poly[i].x, wy - poly[i].y) <= r) return i;
  }
  return null;
}

function snap(v: number, tileSize: number): number {
  return Math.round(v / tileSize) * tileSize;
}

function snapDelta(d: number, tileSize: number): number {
  return Math.round(d / tileSize) * tileSize;
}

function snapPointCenter(x: number, y: number, tileSize: number): { x: number; y: number } {
  const c = Math.floor(x / tileSize);
  const r = Math.floor(y / tileSize);
  return { x: c * tileSize + tileSize / 2, y: r * tileSize + tileSize / 2 };
}

function clampPoint(obj: EditorObject, tileSize: number, cols: number, rows: number): EditorObject {
  const min = tileSize / 2;
  const maxX = cols * tileSize - tileSize / 2;
  const maxY = rows * tileSize - tileSize / 2;
  return {
    ...obj,
    x: Math.min(maxX, Math.max(min, obj.x)),
    y: Math.min(maxY, Math.max(min, obj.y)),
  };
}

function clampRect(obj: EditorObject, tileSize: number, cols: number, rows: number): EditorObject {
  const mapW = cols * tileSize;
  const mapH = rows * tileSize;
  let left = obj.x;
  let bottom = obj.y;
  let width = Math.max(tileSize, obj.width);
  let height = Math.max(tileSize, obj.height);

  if (left < 0) {
    width += left;
    left = 0;
  }
  if (bottom > mapH) {
    height -= bottom - mapH;
    bottom = mapH;
  }
  const top = bottom - height;
  if (top < 0) {
    height = bottom;
  }
  if (left + width > mapW) {
    width = mapW - left;
  }
  width = Math.max(tileSize, width);
  height = Math.max(tileSize, height);

  return { ...obj, x: left, y: bottom, width, height };
}

function clampPolygon(obj: EditorObject, tileSize: number, cols: number, rows: number): EditorObject {
  const mapW = cols * tileSize;
  const mapH = rows * tileSize;
  const poly = regionPolygon(obj).map((p) => ({
    x: Math.min(mapW, Math.max(0, p.x)),
    y: Math.min(mapH, Math.max(0, p.y)),
  }));
  return withSyncedRegionBounds({ ...obj, polygon: poly });
}

function applyResize(
  obj: EditorObject,
  handle: ResizeHandle,
  wx: number,
  wy: number,
  tileSize: number,
  cols: number,
  rows: number,
): EditorObject {
  const min = tileSize;
  let { left, top, right, bottom } = objectBounds(obj);
  const sx = snap(wx, tileSize);
  const sy = snap(wy, tileSize);

  switch (handle) {
    case "nw":
      left = Math.min(sx, right - min);
      top = Math.min(sy, bottom - min);
      break;
    case "n":
      top = Math.min(sy, bottom - min);
      break;
    case "ne":
      right = Math.max(sx, left + min);
      top = Math.min(sy, bottom - min);
      break;
    case "e":
      right = Math.max(sx, left + min);
      break;
    case "se":
      right = Math.max(sx, left + min);
      bottom = Math.max(sy, top + min);
      break;
    case "s":
      bottom = Math.max(sy, top + min);
      break;
    case "sw":
      left = Math.min(sx, right - min);
      bottom = Math.max(sy, top + min);
      break;
    case "w":
      left = Math.min(sx, right - min);
      break;
  }

  return clampRect(
    {
      ...obj,
      x: left,
      y: bottom,
      width: right - left,
      height: bottom - top,
    },
    tileSize,
    cols,
    rows,
  );
}

export function applyObjectDrag(
  state: ObjectDragState,
  wx: number,
  wy: number,
  tileSize: number,
  cols: number,
  rows: number,
): EditorObject {
  const o = state.orig;
  if (state.mode === "vertex" && state.vertexIndex != null) {
    const poly = regionPolygon(o).map((p) => ({ ...p }));
    const snapped = snapPolyPoint(wx, wy, tileSize);
    poly[state.vertexIndex] = snapped;
    return clampPolygon(withSyncedRegionBounds({ ...o, polygon: poly }), tileSize, cols, rows);
  }
  if (state.mode === "resize" && state.handle) {
    return applyResize(o, state.handle, wx, wy, tileSize, cols, rows);
  }

  const dx = snapDelta(wx - state.startWx, tileSize);
  const dy = snapDelta(wy - state.startWy, tileSize);
  if (dx === 0 && dy === 0) return o;

  if (o.point || isPointLikeObject(o)) {
    const snapped = snapPointCenter(o.x + dx, o.y + dy, tileSize);
    return clampPoint({ ...o, x: snapped.x, y: snapped.y, point: true }, tileSize, cols, rows);
  }

  if (isPolygonRegion(o)) {
    const poly = translatePolygon(regionPolygon(o), dx, dy);
    return clampPolygon(withSyncedRegionBounds({ ...o, polygon: poly }), tileSize, cols, rows);
  }

  return clampRect({ ...o, x: o.x + dx, y: o.y + dy }, tileSize, cols, rows);
}

export function replaceObjectInList(objects: EditorObject[], next: EditorObject, prev: EditorObject): EditorObject[] {
  return objects.map((o) => (objectsMatch(o, prev) ? next : o));
}

export function cursorForHandle(handle: ResizeHandle | null): string {
  switch (handle) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    default:
      return "";
  }
}

export function handlePoints(obj: EditorObject): Array<{ handle: ResizeHandle; x: number; y: number }> {
  const b = objectBounds(obj);
  return HANDLES.map((handle) => ({ handle, ...handlePoint(b, handle) }));
}
