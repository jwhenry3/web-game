import type { EditorObject } from "./editorTypes";
import { propString } from "./editorTypes";
import { objectWorldCenter } from "./editorCanvasUtils";
import { objectKey } from "./sceneCatalog";
import { isNpcEntity, npcDisplayLabel } from "./npcEntity";
import { pointInPolygon, polygonArea, regionPolygon, withSyncedRegionBounds } from "./regionPolygon";

export type HierarchyChildKind = "sanctuary" | "save_point" | "npc" | "transition";

export interface HierarchyChild {
  kind: HierarchyChildKind;
  obj: EditorObject;
}

export interface RegionHierarchyNode {
  region: EditorObject;
  children: HierarchyChild[];
}

export interface RegionHierarchyTree {
  regions: RegionHierarchyNode[];
  unassigned: HierarchyChild[];
}


function isHierarchyNpc(obj: EditorObject): boolean {
  return isNpcEntity(obj);
}

export function isSanctuaryRegion(obj: EditorObject): boolean {
  if (obj.type === "sanctuary") return true;
  // Legacy maps used type "region" + sanctuary=true.
  return (
    obj.type === "region" &&
    obj.properties.some((p) => p.name === "sanctuary" && (p.value === true || p.value === "true"))
  );
}

export function isWildernessRegion(obj: EditorObject): boolean {
  return obj.type === "region" && !isSanctuaryRegion(obj);
}

/** Normalize legacy sanctuary regions onto type "sanctuary" and ensure polygon geometry. */
export function normalizeRegionObject(obj: EditorObject): EditorObject {
  let next = obj;
  if (obj.type === "sanctuary") {
    next = {
      ...obj,
      properties: obj.properties.filter((p) => p.name !== "sanctuary"),
    };
  } else {
    const legacySanctuary =
      obj.type === "region" &&
      obj.properties.some((p) => p.name === "sanctuary" && (p.value === true || p.value === "true"));
    if (legacySanctuary) {
      next = {
        ...obj,
        type: "sanctuary",
        properties: obj.properties.filter((p) => p.name !== "sanctuary"),
      };
    }
  }
  if (next.type === "region" || next.type === "sanctuary") {
    return withSyncedRegionBounds(next);
  }
  return next;
}

export function regionBounds(obj: EditorObject) {
  const poly = regionPolygon(obj);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

export function pointInRegion(px: number, py: number, region: EditorObject): boolean {
  return pointInPolygon(px, py, regionPolygon(region));
}

function objectInRegion(obj: EditorObject, region: EditorObject): boolean {
  const c = objectWorldCenter(obj);
  return pointInRegion(c.x, c.y, region);
}

function childKindForObject(obj: EditorObject): HierarchyChildKind | null {
  if (obj.type === "save_point") return "save_point";
  if (isHierarchyNpc(obj)) return "npc";
  if (obj.type === "exit") return "transition";
  if (obj.type === "quest_trigger" || obj.type === "item") return "npc";
  return null;
}

const CHILD_ORDER: HierarchyChildKind[] = ["sanctuary", "save_point", "npc", "transition"];

function sortChildren(children: HierarchyChild[]): HierarchyChild[] {
  return [...children].sort((a, b) => CHILD_ORDER.indexOf(a.kind) - CHILD_ORDER.indexOf(b.kind));
}

function regionArea(region: EditorObject): number {
  return polygonArea(regionPolygon(region));
}

function findContainingRegion(obj: EditorObject, regions: EditorObject[]): EditorObject | null {
  const matches = regions.filter((r) => objectInRegion(obj, r));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  return matches.reduce((best, r) => (regionArea(r) < regionArea(best) ? r : best));
}

export function buildRegionHierarchy(objects: EditorObject[]): RegionHierarchyTree {
  const wildernessRegions = objects.filter(isWildernessRegion);
  const sanctuaryRegions = objects.filter(isSanctuaryRegion);

  const orphanSanctuaries = sanctuaryRegions.filter((s) => !findContainingRegion(s, wildernessRegions));
  const parentRegions = [...wildernessRegions, ...orphanSanctuaries];

  const regionNodes: RegionHierarchyNode[] = parentRegions.map((region) => ({
    region,
    children: [],
  }));

  const nodeByRegion = new Map(regionNodes.map((n) => [objectKey(n.region), n]));
  const unassigned: HierarchyChild[] = [];

  for (const sanctuary of sanctuaryRegions) {
    const parent = findContainingRegion(sanctuary, wildernessRegions);
    if (parent) {
      nodeByRegion.get(objectKey(parent))?.children.push({ kind: "sanctuary", obj: sanctuary });
    }
  }

  for (const obj of objects) {
    if (obj.type === "region" || isSanctuaryRegion(obj)) continue;
    const kind = childKindForObject(obj);
    if (!kind) continue;

    const parent = findContainingRegion(obj, parentRegions);
    if (parent) {
      nodeByRegion.get(objectKey(parent))?.children.push({ kind, obj });
    } else {
      unassigned.push({ kind, obj });
    }
  }

  for (const node of regionNodes) {
    node.children = sortChildren(node.children);
  }

  return {
    regions: regionNodes,
    unassigned: sortChildren(unassigned),
  };
}

export function hierarchyChildLabel(child: HierarchyChild): string {
  if (child.kind === "sanctuary") {
    return propString(child.obj.properties, "id", child.obj.name) || child.obj.name || "Sanctuary";
  }
  if (child.kind === "save_point") {
    const name = propString(child.obj.properties, "name", child.obj.name);
    return name || "Save Point";
  }
  if (child.kind === "npc") {
    return npcDisplayLabel(child.obj);
  }
  if (child.kind === "transition") {
    const dest = propString(child.obj.properties, "destMap");
    return dest ? `→ ${dest}` : child.obj.name || "Transition";
  }
  return child.obj.name || child.obj.type;
}

export function hierarchyChildKindLabel(kind: HierarchyChildKind): string {
  switch (kind) {
    case "sanctuary":
      return "Sanctuary";
    case "save_point":
      return "Save Point";
    case "npc":
      return "NPC";
    case "transition":
      return "Transition";
  }
}
