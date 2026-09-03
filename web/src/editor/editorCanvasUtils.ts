import type { EditorObject, EditorTool } from "./editorTypes";
import { pointInPolygon, regionPolygon } from "./regionPolygon";

export function objectWorldCenter(obj: EditorObject): { x: number; y: number } {
  if (isPointLikeObject(obj)) return { x: obj.x, y: obj.y };
  if (obj.polygon && obj.polygon.length >= 3) {
    let sx = 0;
    let sy = 0;
    for (const p of obj.polygon) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / obj.polygon.length, y: sy / obj.polygon.length };
  }
  return { x: obj.x + obj.width / 2, y: obj.y - obj.height / 2 };
}

export function panToCenterWorldPoint(
  viewport: HTMLElement,
  wx: number,
  wy: number,
  zoom: number,
): { x: number; y: number } {
  const cx = viewport.clientWidth / 2;
  const cy = viewport.clientHeight / 2;
  return { x: cx - wx * zoom, y: cy - wy * zoom };
}

export function isTerrainTool(tool: EditorTool): boolean {
  return tool.startsWith("terrain_");
}

export function isCollisionTool(tool: EditorTool): boolean {
  return tool.startsWith("collision_");
}

/** True when a key event targets a form control (don't steal Space / hotkeys). */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return !!target.closest("input, textarea, select, [contenteditable='true']");
}

/** One-shot / drag map object tools (not terrain brushes). */
export function isMapPlaceTool(tool: EditorTool): boolean {
  return (
    tool === "portal" ||
    tool === "region" ||
    tool === "sanctuary" ||
    tool === "npc" ||
    tool === "save_point" ||
    tool === "interactable_npc" ||
    tool === "quest_trigger" ||
    tool === "item"
  );
}

export function hitObject(
  objects: EditorObject[],
  wx: number,
  wy: number,
  tileSize: number,
  predicate?: (obj: EditorObject) => boolean,
): EditorObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (predicate && !predicate(o)) continue;
    if (isPointLikeObject(o)) {
      if (Math.hypot(wx - o.x, wy - o.y) < tileSize * 0.75) return o;
      continue;
    }
    if (o.type === "region" || o.type === "sanctuary") {
      if (pointInPolygon(wx, wy, regionPolygon(o))) return o;
      continue;
    }
    const minX = o.x;
    const maxX = o.x + o.width;
    const minY = o.y - o.height;
    const maxY = o.y;
    if (wx >= minX && wx <= maxX && wy >= minY && wy <= maxY) return o;
  }
  return null;
}

/** Point markers (NPCs, save crystals, items) — may omit `point` in older data. */
export function isPointLikeObject(obj: EditorObject): boolean {
  if (obj.type === "region" || obj.type === "sanctuary" || obj.type === "exit") return false;
  if (obj.polygon && obj.polygon.length >= 3) return false;
  if (obj.point) return true;
  if (obj.width === 0 && obj.height === 0) return true;
  return false;
}

export function objectColor(type: string): string {
  switch (type) {
    case "exit":
      return "#7dd3fc";
    case "region":
      return "#a78bfa";
    case "sanctuary":
      return "#c084fc";
    case "npc":
      return "#f59e0b";
    case "save_point":
      return "#34d399";
    case "quest_trigger":
      return "#a78bfa";
    case "item":
      return "#34d399";
    default:
      return "#94a3b8";
  }
}

export function objectFill(type: string): string {
  switch (type) {
    case "exit":
      return "rgba(125, 211, 252, 0.15)";
    case "region":
      return "rgba(167, 139, 250, 0.15)";
    case "sanctuary":
      return "rgba(192, 132, 252, 0.18)";
    case "npc":
      return "rgba(245, 158, 11, 0.2)";
    case "save_point":
      return "rgba(52, 211, 153, 0.2)";
    case "quest_trigger":
      return "rgba(167, 139, 250, 0.2)";
    case "item":
      return "rgba(52, 211, 153, 0.18)";
    default:
      return "rgba(148, 163, 184, 0.1)";
  }
}

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 1.12;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}
