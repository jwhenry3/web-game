import type { EditorTool } from "./editorTypes";
import type { EntityKind } from "./entities";

export type { EntityKind };

export interface EntityGroupEntry {
  kind: EntityKind;
  label: string;
  hint: string;
  tool: EditorTool;
}

export interface EntityGroup {
  id: string;
  label: string;
  entries: EntityGroupEntry[];
}

/** Kinds that can be authored as reusable templates in the Entity Editor. */
export const ENTITY_TEMPLATE_KINDS: EntityKind[] = ["npc_combat", "npc_service", "quest_trigger", "item"];

export const ENTITY_TEMPLATE_GROUPS: EntityGroup[] = [
  {
    id: "npcs",
    label: "NPCs",
    entries: [
      {
        kind: "npc_combat",
        label: "Combat NPC",
        hint: "Patrols a region and triggers battles",
        tool: "npc",
      },
      {
        kind: "npc_service",
        label: "Interactable NPC",
        hint: "Dialogue, shops, quests, storage, and other services",
        tool: "interactable_npc",
      },
    ],
  },
  {
    id: "quests",
    label: "Quests",
    entries: [
      {
        kind: "quest_trigger",
        label: "Quest Trigger",
        hint: "Starts or advances a quest when interacted with",
        tool: "quest_trigger",
      },
    ],
  },
  {
    id: "items",
    label: "Items",
    entries: [
      {
        kind: "item",
        label: "World Item",
        hint: "Pickup or interactable item on the map",
        tool: "item",
      },
    ],
  },
];

/** Map-only placement tools (not entity templates). */
export const MAP_ENTITY_PLACEMENT_ENTRIES: EntityGroupEntry[] = [
  {
    kind: "save_point",
    label: "Save Point",
    hint: "Camp crystal / respawn anchor",
    tool: "save_point",
  },
];

export const MAP_REGION_PLACEMENT_ENTRIES: EntityGroupEntry[] = [
  {
    kind: "region",
    label: "Region",
    hint: "Wilderness zone — click vertices, close on start point",
    tool: "region",
  },
  {
    kind: "sanctuary",
    label: "Sanctuary",
    hint: "Safe zone — click vertices, close on start point",
    tool: "sanctuary",
  },
  {
    kind: "portal",
    label: "Scene Transition",
    hint: "Zone linking to another map",
    tool: "portal",
  },
];

/** Map-only placement tools (not entity templates). */
export const MAP_OBJECT_PLACEMENT_GROUPS: EntityGroup[] = [
  {
    id: "world",
    label: "World",
    entries: [...MAP_ENTITY_PLACEMENT_ENTRIES, ...MAP_REGION_PLACEMENT_ENTRIES],
  },
];

/** @deprecated Prefer ENTITY_TEMPLATE_GROUPS + MAP_OBJECT_PLACEMENT_GROUPS */
export const ENTITY_PLACEMENT_GROUPS: EntityGroup[] = [...ENTITY_TEMPLATE_GROUPS, ...MAP_OBJECT_PLACEMENT_GROUPS];

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  npc_combat: "Combat NPC",
  npc_service: "Interactable NPC",
  save_point: "Save Point",
  region: "Region",
  sanctuary: "Sanctuary",
  portal: "Scene Transition",
  quest_trigger: "Quest Trigger",
  item: "World Item",
};

export function isEntityTemplateKind(kind: EntityKind): boolean {
  return ENTITY_TEMPLATE_KINDS.includes(kind);
}

export function entityKindForTool(tool: EditorTool): EntityKind | null {
  for (const group of ENTITY_PLACEMENT_GROUPS) {
    for (const entry of group.entries) {
      if (entry.tool === tool) return entry.kind;
    }
  }
  return null;
}

export function groupEntitiesByKind<T extends { kind: EntityKind }>(items: T[]): Map<EntityKind, T[]> {
  const map = new Map<EntityKind, T[]>();
  for (const item of items) {
    const list = map.get(item.kind) ?? [];
    list.push(item);
    map.set(item.kind, list);
  }
  return map;
}
