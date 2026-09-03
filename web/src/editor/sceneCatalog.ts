import type { EditorObject, EditorTool } from "./editorTypes";
import { isNpcEntity, npcDisplayLabel, NPC_SERVICE_ROLES, type NpcServiceRole } from "./npcEntity";

export type EditorWorkspacePage = "map" | "entities" | "items" | "quests" | "jobs" | "skills";

/** Map canvas interaction mode — filters selection and drives the toolbox. */
export type EditorInteractMode = "terrain" | "entity" | "region";

export type ToolboxTab = "terrain" | "prefabs" | "entities" | "region";

export type NpcRole = NpcServiceRole;

export const NPC_ROLES = NPC_SERVICE_ROLES;

export const EDITOR_INTERACT_MODES: { id: EditorInteractMode; label: string }[] = [
  { id: "terrain", label: "Terrain" },
  { id: "entity", label: "Entity" },
  { id: "region", label: "Region" },
];

export const OBJECT_TYPE_LABELS: Record<string, string> = {
  region: "Region",
  sanctuary: "Sanctuary",
  exit: "Scene Transition",
  npc: "NPC",
  save_point: "Save Point",
  quest_trigger: "Quest Trigger",
  item: "World Item",
};

export function objectKey(obj: EditorObject): string {
  return `${obj.type}:${obj.id ?? obj.name}`;
}

export function objectDisplayName(obj: EditorObject): string {
  if (obj.type === "exit") {
    const dest = obj.properties.find((p) => p.name === "destMap")?.value;
    return dest ? `→ ${dest}` : obj.name || "Transition";
  }
  if (isNpcEntity(obj)) {
    return npcDisplayLabel(obj);
  }
  if (obj.type === "save_point") {
    const name = obj.properties.find((p) => p.name === "name")?.value;
    return String(name || obj.name || "Save Point");
  }
  if (obj.type === "quest_trigger") {
    const name = obj.properties.find((p) => p.name === "name")?.value;
    return String(name || obj.name || "Quest Trigger");
  }
  if (obj.type === "item") {
    const name = obj.properties.find((p) => p.name === "name")?.value;
    return String(name || obj.name || "Item");
  }
  if (obj.type === "region") {
    const id = obj.properties.find((p) => p.name === "id")?.value;
    return String(id || obj.name || "Region");
  }
  if (obj.type === "sanctuary") {
    const id = obj.properties.find((p) => p.name === "id")?.value;
    const name = obj.properties.find((p) => p.name === "name")?.value;
    return String(name || id || obj.name || "Sanctuary");
  }
  return obj.name || obj.type;
}

/** Which interact mode an object belongs to (null = not mode-filtered). */
export function interactModeForObject(obj: EditorObject): EditorInteractMode | null {
  if (obj.type === "region" || obj.type === "sanctuary" || obj.type === "exit") return "region";
  if (
    isNpcEntity(obj) ||
    obj.type === "save_point" ||
    obj.type === "quest_trigger" ||
    obj.type === "item"
  ) {
    return "entity";
  }
  return null;
}

export function objectMatchesInteractMode(obj: EditorObject, mode: EditorInteractMode): boolean {
  if (mode === "terrain") return false;
  return interactModeForObject(obj) === mode;
}

export function isPlacementTool(tool: EditorTool): boolean {
  return tool !== "select" && !tool.startsWith("terrain_") && !tool.startsWith("collision_");
}

export const DEFAULT_INTERACTABLE_ROLES: NpcRole[] = ["job_master"];
