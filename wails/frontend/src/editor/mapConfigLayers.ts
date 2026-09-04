import type { EditorObject } from "./editorTypes";
import { normalizeRegionObject } from "./hierarchyTree";
import { normalizeNpcObject } from "./npcEntity";
import type { MapTerrainLayers } from "../types";

export function baseLayersFromConfig(
  layers: MapTerrainLayers,
  cols: number,
  rows: number,
): { ground: number[]; collision: number[] } {
  const n = cols * rows;
  if (layers.ground.length !== n || layers.collision.length !== n) {
    throw new Error(`terrain layer size mismatch (want ${n})`);
  }
  return {
    ground: [...layers.ground],
    collision: [...layers.collision],
  };
}

export function objectsFromConfig(objects: unknown[] | null | undefined): EditorObject[] {
  if (!objects?.length) return [];
  return objects.map((raw) => {
    const o = raw as Record<string, unknown>;
    const polyRaw = o.polygon as Array<{ x?: unknown; y?: unknown }> | undefined;
    const polygon =
      Array.isArray(polyRaw) && polyRaw.length >= 3
        ? polyRaw.map((p) => ({ x: Number(p.x ?? 0), y: Number(p.y ?? 0) }))
        : undefined;
    const obj: EditorObject = {
      id: o.id as number | undefined,
      name: String(o.name ?? ""),
      type: String(o.type ?? ""),
      x: Number(o.x ?? 0),
      y: Number(o.y ?? 0),
      width: Number(o.width ?? 0),
      height: Number(o.height ?? 0),
      point: !!o.point,
      polygon,
      properties: ((o.properties as EditorObject["properties"]) ?? []).map((p) => ({
        name: p.name,
        type: p.type ?? "string",
        value: p.value,
      })),
    };
    return normalizeRegionObject(normalizeNpcObject(obj));
  });
}
