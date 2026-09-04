import type { EditorObject } from "./editorTypes";
import { newObjectId, propString, setProp } from "./editorTypes";
import { defaultDropPoolIdForKind, defaultEncounterConfig, serializeEncounter } from "./encounterConfig";

export const COMBAT_NPC_ROLE = "combat" as const;

export type NpcServiceRole = "job_master" | "quest_giver" | "shop" | "storage" | "auction_house";

export type NpcRole = NpcServiceRole | typeof COMBAT_NPC_ROLE;

export const NPC_SERVICE_ROLES: { id: NpcServiceRole; label: string; hint: string }[] = [
  { id: "job_master", label: "Job Master", hint: "Opens job change dialog" },
  { id: "quest_giver", label: "Quest Giver", hint: "Offers quests (future)" },
  { id: "shop", label: "Shop", hint: "Vendor / merchant (future)" },
  { id: "storage", label: "Storage", hint: "Item storage NPC (future)" },
  { id: "auction_house", label: "Auction House", hint: "Player auction house (future)" },
];

const LEGACY_NPC_TYPES = new Set(["interactable_npc", "job_changer"]);

export function isNpcEntity(obj: EditorObject): boolean {
  return obj.type === "npc" || LEGACY_NPC_TYPES.has(obj.type);
}

/** Normalize legacy interactable_npc / job_changer / combat-only npc into unified type `npc`. */
export function normalizeNpcObject(obj: EditorObject): EditorObject {
  if (!isNpcEntity(obj)) return obj;

  if (obj.type === "job_changer") {
    return {
      ...obj,
      type: "npc",
      properties: setProp(
        setProp(obj.properties, "roles", "string", "job_master"),
        "id",
        "string",
        propString(obj.properties, "id", obj.name),
      ),
    };
  }

  if (obj.type === "interactable_npc") {
    return { ...obj, type: "npc" };
  }

  if (obj.type === "npc") {
    const roles = rawRoles(obj);
    if (roles.length === 0 && isLegacyCombatNpc(obj)) {
      return {
        ...obj,
        properties: setProp(obj.properties, "roles", "string", COMBAT_NPC_ROLE),
      };
    }
  }

  return obj;
}

function rawRoles(obj: EditorObject): string[] {
  const raw = propString(obj.properties, "roles");
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLegacyCombatNpc(obj: EditorObject): boolean {
  return propString(obj.properties, "region") !== "" || propString(obj.properties, "kind") !== "";
}

export function parseNpcRoles(obj: EditorObject): NpcRole[] {
  const normalized = normalizeNpcObject(obj);
  return rawRoles(normalized) as NpcRole[];
}

export function parseNpcServiceRoles(obj: EditorObject): NpcServiceRole[] {
  return parseNpcRoles(obj).filter((r): r is NpcServiceRole => r !== COMBAT_NPC_ROLE);
}

export function hasCombatRole(obj: EditorObject): boolean {
  return parseNpcRoles(obj).includes(COMBAT_NPC_ROLE);
}

export function hasServiceRoles(obj: EditorObject): boolean {
  return parseNpcServiceRoles(obj).length > 0;
}

export function formatNpcRoles(roles: NpcRole[]): string {
  return roles.join(",");
}

export function setNpcRoles(obj: EditorObject, roles: NpcRole[]): EditorObject {
  return {
    ...obj,
    type: "npc",
    properties: setProp(obj.properties, "roles", "string", formatNpcRoles(roles)),
  };
}

export function toggleNpcServiceRole(obj: EditorObject, role: NpcServiceRole): EditorObject {
  const combat = hasCombatRole(obj);
  const current = parseNpcServiceRoles(obj);
  const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
  const roles: NpcRole[] = combat ? [COMBAT_NPC_ROLE, ...next] : next;
  return setNpcRoles(obj, roles);
}

export function createCombatNpc(cx: number, cy: number, regionId: string): EditorObject {
  const id = newObjectId();
  const kind = "goblin";
  const level = 1;
  const encounter = serializeEncounter(
    defaultEncounterConfig(kind, level, defaultDropPoolIdForKind(kind)),
  );
  return {
    id,
    name: `npc_${id}`,
    type: "npc",
    x: cx,
    y: cy,
    width: 0,
    height: 0,
    point: true,
    properties: [
      { name: "id", type: "string", value: `npc_${id}` },
      { name: "roles", type: "string", value: COMBAT_NPC_ROLE },
      { name: "kind", type: "string", value: kind },
      { name: "name", type: "string", value: "Goblin" },
      { name: "level", type: "int", value: level },
      { name: "region", type: "string", value: regionId || "greenwood" },
      { name: "encounter", type: "string", value: encounter },
    ],
  };
}

export function createServiceNpc(cx: number, cy: number, serviceRoles: NpcServiceRole[]): EditorObject {
  const id = newObjectId();
  const roles = serviceRoles.length ? serviceRoles : (["job_master"] as NpcServiceRole[]);
  return {
    id,
    name: `npc_${id}`,
    type: "npc",
    x: cx,
    y: cy,
    width: 0,
    height: 0,
    point: true,
    properties: [
      { name: "id", type: "string", value: `npc_${id}` },
      { name: "name", type: "string", value: "NPC" },
      { name: "roles", type: "string", value: formatNpcRoles(roles) },
      { name: "greeting", type: "string", value: "Welcome, traveler." },
      { name: "dialogue", type: "string", value: "" },
      { name: "shopId", type: "string", value: "" },
      { name: "shopItems", type: "string", value: "" },
      { name: "questSetId", type: "string", value: "" },
      { name: "questIds", type: "string", value: "" },
      { name: "storageId", type: "string", value: "" },
      { name: "storageType", type: "string", value: "personal" },
      { name: "auctionId", type: "string", value: "" },
    ],
  };
}

export function npcDisplayLabel(obj: EditorObject): string {
  const n = normalizeNpcObject(obj);
  const name = propString(n.properties, "name");
  if (hasCombatRole(n)) {
    const kind = propString(n.properties, "kind");
    return name || kind || n.name || "Combat NPC";
  }
  return name || n.name || "NPC";
}

export function npcInspectorLabel(obj: EditorObject): string {
  const n = normalizeNpcObject(obj);
  if (hasCombatRole(n) && !hasServiceRoles(n)) return "Combat NPC";
  if (hasServiceRoles(n) && !hasCombatRole(n)) return "Interactable NPC";
  return "NPC";
}
