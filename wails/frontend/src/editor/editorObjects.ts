import type { EditorObject, EditorProp } from "./editorTypes";
import { normalizeNpcObject } from "./npcEntity";

export function normalizeObject(raw: Record<string, unknown>): EditorObject {
  const props = ((raw.properties as EditorProp[]) ?? []).map((p) => ({
    name: p.name,
    type: p.type ?? "string",
    value: p.value as string | number | boolean,
  }));
  return normalizeNpcObject({
    id: raw.id as number | undefined,
    name: String(raw.name ?? ""),
    type: String(raw.type ?? ""),
    x: Number(raw.x ?? 0),
    y: Number(raw.y ?? 0),
    width: Number(raw.width ?? 0),
    height: Number(raw.height ?? 0),
    point: !!raw.point,
    properties: props,
  });
}

export function objectsEqual(a: EditorObject[], b: EditorObject[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneObjects(objects: EditorObject[]): EditorObject[] {
  return JSON.parse(JSON.stringify(objects)) as EditorObject[];
}

export function mergeObjectOverrides(base: EditorObject[], override?: EditorObject[]): EditorObject[] {
  if (!override || override.length === 0) return cloneObjects(base);
  return cloneObjects(override);
}
