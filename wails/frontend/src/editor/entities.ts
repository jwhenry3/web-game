import { cloneObjects } from "./editorObjects";
import type { EditorObject } from "./editorTypes";
import { newObjectId, TILE_PX } from "./editorTypes";
import { normalizeRegionObject } from "./hierarchyTree";
import type { NpcServiceRole } from "./npcEntity";
import { createCombatNpc, createServiceNpc, formatNpcRoles } from "./npcEntity";
import { withSyncedRegionBounds } from "./regionPolygon";

export type EntityKind =
  | "npc_combat"
  | "npc_service"
  | "save_point"
  | "region"
  | "sanctuary"
  | "portal"
  | "quest_trigger"
  | "item";

export interface EntityDefinition {
  id: string;
  name: string;
  kind: EntityKind;
  /** Object template — position is normalized when editing; applied at placement time. */
  template: EditorObject;
}

const STORAGE_KEY = "cm_map_entities";

export function loadEntities(): EntityDefinition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as EntityDefinition[];
  } catch {
    return [];
  }
}

export function saveEntities(entities: EntityDefinition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entities));
}

export function createEntityDefinition(name: string, kind: EntityKind, serviceRoles?: NpcServiceRole[]): EntityDefinition {
  return {
    id: `ent-${Date.now()}`,
    name,
    kind,
    template: createDefaultTemplate(kind, serviceRoles),
  };
}

export function cloneEntity(entity: EntityDefinition): EntityDefinition {
  return {
    ...entity,
    template: cloneObjects([entity.template])[0]!,
  };
}

/** Place a template in the middle of the entity-editor preview pad (world coords). */
export function entityPreviewDrawPosition(
  kind: EntityKind,
  template: Pick<EditorObject, "width" | "height" | "point">,
): { x: number; y: number } {
  const { width, height } = entityPreviewSize(kind);
  const cx = width / 2;
  const cy = height / 2;
  if (template.point || (template.width === 0 && template.height === 0)) {
    return { x: cx, y: cy };
  }
  // Rect objects use bottom-left origin (y is the bottom edge).
  return { x: cx - template.width / 2, y: cy + template.height / 2 };
}

export function createDefaultTemplate(kind: EntityKind, serviceRoles: NpcServiceRole[] = ["job_master"]): EditorObject {
  const id = newObjectId();

  switch (kind) {
    case "npc_combat": {
      const { x, y } = entityPreviewDrawPosition(kind, { width: 0, height: 0, point: true });
      return createCombatNpc(x, y, "greenwood");
    }
    case "npc_service": {
      const { x, y } = entityPreviewDrawPosition(kind, { width: 0, height: 0, point: true });
      return createServiceNpc(x, y, serviceRoles);
    }
    case "save_point": {
      const { x, y } = entityPreviewDrawPosition(kind, { width: 0, height: 0, point: true });
      return {
        id,
        name: `save_${id}`,
        type: "save_point",
        x,
        y,
        width: 0,
        height: 0,
        point: true,
        properties: [
          { name: "id", type: "string", value: `save_${id}` },
          { name: "name", type: "string", value: "Camp Crystal" },
        ],
      };
    }
    case "portal": {
      const width = TILE_PX * 4;
      const height = TILE_PX * 2;
      const { x, y } = entityPreviewDrawPosition(kind, { width, height });
      return {
        id,
        name: `exit_${id}`,
        type: "exit",
        x,
        y,
        width,
        height,
        properties: [
          { name: "destMap", type: "string", value: "timberroad" },
          { name: "destX", type: "float", value: 100 },
          { name: "destY", type: "float", value: 100 },
        ],
      };
    }
    case "region": {
      const width = TILE_PX * 8;
      const height = TILE_PX * 6;
      const { x, y } = entityPreviewDrawPosition(kind, { width, height });
      return withSyncedRegionBounds({
        id,
        name: `region_${id}`,
        type: "region",
        x,
        y,
        width,
        height,
        properties: [
          { name: "id", type: "string", value: `region_${id}` },
          { name: "kind", type: "string", value: "wilderness" },
        ],
      });
    }
    case "sanctuary": {
      const width = TILE_PX * 6;
      const height = TILE_PX * 4;
      const { x, y } = entityPreviewDrawPosition(kind, { width, height });
      return withSyncedRegionBounds({
        id,
        name: `sanctuary_${id}`,
        type: "sanctuary",
        x,
        y,
        width,
        height,
        properties: [
          { name: "id", type: "string", value: `sanctuary_${id}` },
          { name: "kind", type: "string", value: "camp" },
        ],
      });
    }
    case "quest_trigger": {
      const { x, y } = entityPreviewDrawPosition(kind, { width: 0, height: 0, point: true });
      return {
        id,
        name: `quest_${id}`,
        type: "quest_trigger",
        x,
        y,
        width: 0,
        height: 0,
        point: true,
        properties: [
          { name: "id", type: "string", value: `quest_${id}` },
          { name: "name", type: "string", value: "Quest Trigger" },
          { name: "questId", type: "string", value: "" },
          { name: "triggerMode", type: "string", value: "interact" },
          { name: "greeting", type: "string", value: "" },
          { name: "autoStart", type: "bool", value: false },
        ],
      };
    }
    case "item": {
      const { x, y } = entityPreviewDrawPosition(kind, { width: 0, height: 0, point: true });
      return {
        id,
        name: `item_${id}`,
        type: "item",
        x,
        y,
        width: 0,
        height: 0,
        point: true,
        properties: [
          { name: "id", type: "string", value: `item_${id}` },
          { name: "name", type: "string", value: "Item" },
          { name: "itemId", type: "string", value: "" },
          { name: "quantity", type: "int", value: 1 },
          { name: "pickupMode", type: "string", value: "interact" },
          { name: "respawnSec", type: "int", value: 0 },
        ],
      };
    }
  }
}

/** Instantiate a map object from an entity definition at world coordinates. */
export function instantiateEntity(def: EntityDefinition, wx: number, wy: number, regionId: string, tileSize = TILE_PX): EditorObject {
  const id = newObjectId();
  const tpl = def.template;

  if (tpl.point) {
    const cx = Math.floor(wx / tileSize) * tileSize + tileSize / 2;
    const cy = Math.floor(wy / tileSize) * tileSize + tileSize / 2;
    const obj: EditorObject = {
      ...tpl,
      id,
      name: tpl.name || `${def.kind}_${id}`,
      x: cx,
      y: cy,
      properties: tpl.properties.map((p) => ({ ...p })),
    };
    if (def.kind === "npc_combat") {
      const regionProp = obj.properties.find((p) => p.name === "region");
      if (regionProp && !regionProp.value) regionProp.value = regionId;
    }
    const idProp = obj.properties.find((p) => p.name === "id");
    if (idProp) idProp.value = `${def.kind}_${id}`;
    return obj;
  }

  const x = Math.round(wx / tileSize) * tileSize;
  const y = Math.round(wy / tileSize) * tileSize + tileSize;
  const obj: EditorObject = {
    ...tpl,
    id,
    name: tpl.name || `${def.kind}_${id}`,
    x,
    y,
    width: tpl.width,
    height: tpl.height,
    properties: tpl.properties.map((p) => ({ ...p })),
  };
  const idProp = obj.properties.find((p) => p.name === "id");
  if (idProp) idProp.value = String(idProp.value || `${def.kind}_${id}`);
  return normalizeRegionObject(obj);
}

export function entityPreviewSize(kind: EntityKind): { width: number; height: number } {
  switch (kind) {
    case "portal":
      return { width: TILE_PX * 5, height: TILE_PX * 4 };
    case "region":
      return { width: TILE_PX * 8, height: TILE_PX * 6 };
    case "sanctuary":
      return { width: TILE_PX * 8, height: TILE_PX * 6 };
    default:
      return { width: TILE_PX * 3, height: TILE_PX * 3 };
  }
}

export function entityFromPlacementTool(
  tool: string,
  cx: number,
  cy: number,
  regionId: string,
  serviceRoles: NpcServiceRole[],
): EditorObject | null {
  switch (tool) {
    case "npc":
      return createCombatNpc(cx, cy, regionId);
    case "interactable_npc":
      return createServiceNpc(cx, cy, serviceRoles);
    case "save_point": {
      const id = newObjectId();
      return {
        id,
        name: `save_${id}`,
        type: "save_point",
        x: cx,
        y: cy,
        width: 0,
        height: 0,
        point: true,
        properties: [
          { name: "id", type: "string", value: `save_${id}` },
          { name: "name", type: "string", value: "Camp Crystal" },
        ],
      };
    }
    case "quest_trigger": {
      const id = newObjectId();
      return {
        id,
        name: `quest_${id}`,
        type: "quest_trigger",
        x: cx,
        y: cy,
        width: 0,
        height: 0,
        point: true,
        properties: [
          { name: "id", type: "string", value: `quest_${id}` },
          { name: "name", type: "string", value: "Quest Trigger" },
          { name: "questId", type: "string", value: "" },
        ],
      };
    }
    case "item": {
      const id = newObjectId();
      return {
        id,
        name: `item_${id}`,
        type: "item",
        x: cx,
        y: cy,
        width: 0,
        height: 0,
        point: true,
        properties: [
          { name: "id", type: "string", value: `item_${id}` },
          { name: "name", type: "string", value: "Item" },
          { name: "itemId", type: "string", value: "" },
        ],
      };
    }
    default:
      return null;
  }
}

export function createEntityFromTool(
  tool: string,
  name: string,
  serviceRoles: NpcServiceRole[],
): EntityDefinition | null {
  const kindMap: Record<string, EntityKind> = {
    npc: "npc_combat",
    interactable_npc: "npc_service",
    save_point: "save_point",
    region: "region",
    sanctuary: "sanctuary",
    portal: "portal",
    quest_trigger: "quest_trigger",
    item: "item",
  };
  const kind = kindMap[tool];
  if (!kind) return null;
  return createEntityDefinition(name, kind, serviceRoles);
}

/** Copy service roles from a service NPC template for toolbox defaults. */
export function serviceRolesFromTemplate(template: EditorObject): NpcServiceRole[] {
  const raw = template.properties.find((p) => p.name === "roles")?.value;
  if (!raw) return ["job_master"];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as NpcServiceRole[];
}

export { formatNpcRoles };
