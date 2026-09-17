// Wire protocol types are generated from the Go protocol package.
// Source of truth: internal/protocol/messages.go — regenerate with `npm run wire:gen`.
import type {
  CharacterAppearance,
  Item,
  ProfileInfo,
  SkillInfo,
  WorldEntity,
} from "./net/wire.gen";

export * from "./net/wire.gen";

/** Legacy name kept for existing call sites. */
export type CharacterAppearanceWire = CharacterAppearance;

export type ChatChannel = "general" | "social" | "system" | "battle";

/** Visual tone for chat lines (especially battle combat/skill results). */
export type ChatTone =
  | "plain"
  | "damage"
  | "heal"
  | "fail"
  | "cast"
  | "buff"
  | "capture"
  | "skill"
  | "victory"
  | "defeat";

export const CHAT_TABS: { id: ChatChannel; label: string }[] = [
  { id: "general", label: "General" },
  { id: "social", label: "Social" },
  { id: "system", label: "System" },
  { id: "battle", label: "Battle" },
];

/**
 * Wire ChatMessagePayload plus the client-side channel hint set when routing
 * inbound chat. The Go server does not send `channel` today; this shadows the
 * generated interface for the richer local type.
 */
export interface ChatMessagePayload {
  from_id: string;
  from_name: string;
  message: string;
  channel?: ChatChannel;
}

export interface ChatLine {
  channel: ChatChannel;
  from_id: string;
  from_name: string;
  message: string;
  tone?: ChatTone;
}

/**
 * Sparse tile patches per layer. The generated wire shape only models what the
 * Go server serializes; the map editor also round-trips Tiled object patches
 * in the same document, so the richer local interface shadows it.
 */
export interface MapTileOverrides {
  map_id: string;
  layers: Record<string, Record<string, number>>;
  objects?: Array<{
    id?: number;
    name: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    point?: boolean;
    properties?: Array<{ name: string; type: string; value: string | number | boolean }>;
  }>;
  updated_at?: string;
}

export type AtlasPOIKind = "save_point";

/** Convenience predicates over the unified entity record. */
export const isPlayerEntity = (e: WorldEntity) => e.kind === "player";
export const isNpcEntity = (e: WorldEntity) => e.kind === "npc";
export const isPetEntity = (e: WorldEntity) => e.kind === "pet";
export const isAllyEntity = (e: WorldEntity) => e.kind === "player" || !!e.is_ally;

/** A pending combat action waiting for a target click. */
export interface SelectedAction {
  actionId: string;
  name: string;
  heals: boolean;
  itemId?: string;
}

export const RACES = [
  { id: "humanus", name: "Humanus", color: "#c9a86c", desc: "Balanced and adaptable." },
  { id: "altus", name: "Altus", color: "#8eb4d4", desc: "Proud and resilient." },
  { id: "parvus", name: "Parvus", color: "#9ad4a0", desc: "Small, clever, and magical." },
  { id: "felis", name: "Felis", color: "#d4a0c8", desc: "Agile hunters of the wild." },
  { id: "saxum", name: "Saxum", color: "#a0a8b8", desc: "Stalwart giants of the north." },
] as const;

export const ALL_JOBS = [
  { id: "VAN", name: "Vanguard", abbr: "VAN", role: "tank", style: "melee", category: "swordplay", weapon: "sword", color: "#d9704a" },
  { id: "AEG", name: "Aegis", abbr: "AEG", role: "tank", style: "melee", category: "swordplay", weapon: "hammer", color: "#d9704a" },
  { id: "BRW", name: "Brawler", abbr: "BRW", role: "dps", style: "melee", category: "swordplay", weapon: "knuckles", color: "#d9704a" },
  { id: "RVR", name: "Reaver", abbr: "RVR", role: "dps", style: "melee", category: "swordplay", weapon: "axe", color: "#d9704a" },
  { id: "LNC", name: "Lancer", abbr: "LNC", role: "dps", style: "ranged", category: "swordplay", weapon: "spear", color: "#d9704a" },
  { id: "RON", name: "Ronin", abbr: "RON", role: "dps", style: "melee", category: "swordplay", weapon: "katana", color: "#d9704a" },
  { id: "HEX", name: "Hexwright", abbr: "HEX", role: "dps", style: "magic", category: "sorcery", weapon: "staff", color: "#7a6ff0" },
  { id: "SAN", name: "Sanctifier", abbr: "SAN", role: "healer", style: "magic", category: "devotion", weapon: "wand", color: "#e8c95a" },
  { id: "CAN", name: "Cantor", abbr: "CAN", role: "support", style: "magic", category: "sorcery", weapon: "wand", color: "#7a6ff0" },
  { id: "CUT", name: "Cutpurse", abbr: "CUT", role: "dps", style: "melee", category: "stealth", weapon: "dagger", color: "#54c47a" },
] as const;

export const STARTING_JOBS = [
  { id: "VAN", name: "Vanguard", abbr: "VAN", role: "tank", style: "melee", category: "swordplay", color: "#d9704a", desc: "Sword tank — hold the line." },
  { id: "SAN", name: "Sanctifier", abbr: "SAN", role: "healer", style: "magic", category: "devotion", color: "#e8c95a", desc: "Wand healer — mend and cleanse." },
  { id: "BRW", name: "Brawler", abbr: "BRW", role: "dps", style: "melee", category: "swordplay", color: "#d9704a", desc: "Knuckles — close-range melee DPS." },
  { id: "HEX", name: "Hexwright", abbr: "HEX", role: "dps", style: "magic", category: "sorcery", color: "#7a6ff0", desc: "Staff — offensive magic DPS." },
  { id: "CUT", name: "Cutpurse", abbr: "CUT", role: "dps", style: "melee", category: "stealth", color: "#54c47a", desc: "Daggers — scout melee DPS." },
  { id: "CAN", name: "Cantor", abbr: "CAN", role: "support", style: "magic", category: "sorcery", color: "#7a6ff0", desc: "Wand — party buffs and tempo." },
] as const;

export const COMBO_ALIASES = [
  { id: "spellblade", name: "Spellblade", main: "VAN", sub: "HEX", blurb: "Sword and hexfire." },
  { id: "shadeblade", name: "Shadeblade", main: "CUT", sub: "HEX", blurb: "Dagger and dark hexes." },
  { id: "nightveil", name: "Nightveil", main: "CUT", sub: "CAN", blurb: "Scout cuts under song." },
  { id: "sigilblade", name: "Sigilblade", main: "VAN", sub: "CAN", blurb: "Shield wall paced by hymns." },
  { id: "leybinder", name: "Leybinder", main: "HEX", sub: "CAN", blurb: "Hexes woven with tempo." },
  { id: "lorekeeper", name: "Lorekeeper", main: "SAN", sub: "CAN", blurb: "Healing craft and support arts." },
  { id: "conjurer", name: "Conjurer", main: "HEX", sub: "SAN", blurb: "Arcane fury with restoration." },
  { id: "reveler", name: "Reveler", main: "CAN", sub: "CUT", blurb: "Songs into sudden cuts." },
  { id: "privateer", name: "Privateer", main: "CUT", sub: "BRW", blurb: "Harbor scrap and knuckles." },
  { id: "beastward", name: "Beastward", main: "BRW", sub: "CAN", blurb: "Fists paced by rhythm." },
  { id: "echoist", name: "Echoist", main: "CAN", sub: "HEX", blurb: "Hymns answered by hexfire." },
  { id: "artificer", name: "Artificer", main: "BRW", sub: "SAN", blurb: "Muscle with emergency mending." },
  { id: "marksman", name: "Marksman", main: "CUT", sub: "LNC", blurb: "Scout precision and reach." },
  { id: "paladin", name: "Wardkeeper", main: "AEG", sub: "SAN", blurb: "Hammer and sacred wards." },
  { id: "berserker", name: "Berserker", main: "RVR", sub: "BRW", blurb: "Axe and raw fists." },
  { id: "duelist", name: "Duelist", main: "RON", sub: "CUT", blurb: "Katana guided by scout cunning." },
] as const;

export const WEAPONS = [
  { id: "sword", name: "Sword", color: 0xd9704a, category: "swordplay", style: "melee", desc: "Vanguard steel." },
  { id: "hammer", name: "Hammer", color: 0xd9704a, category: "swordplay", style: "melee", desc: "Aegis crushing blows." },
  { id: "axe", name: "Axe", color: 0xd9704a, category: "swordplay", style: "melee", desc: "Reaver cleaves." },
  { id: "spear", name: "Spear", color: 0xd9704a, category: "swordplay", style: "ranged", desc: "Lancer reach and leaps." },
  { id: "katana", name: "Katana", color: 0xd9704a, category: "swordplay", style: "melee", desc: "Ronin drawn cuts." },
  { id: "knuckles", name: "Knuckles", color: 0xd9704a, category: "swordplay", style: "melee", desc: "Brawler fists." },
  { id: "staff", name: "Staff", color: 0x7a6ff0, category: "sorcery", style: "magic", desc: "Hexwright focus." },
  { id: "wand", name: "Wand", color: 0xe8c95a, category: "devotion", style: "magic", desc: "Sanctifier and Cantor implement." },
  { id: "dagger", name: "Dagger", color: 0x54c47a, category: "stealth", style: "melee", desc: "Cutpurse blades." },
] as const;

export function jobColor(jobId: string): string {
  return ALL_JOBS.find((j) => j.id === jobId)?.color ?? "#b8c2cc";
}

export function jobLabel(jobId: string): string {
  return ALL_JOBS.find((j) => j.id === jobId)?.name ?? jobId;
}

export function comboDisplayName(main: string, sub?: string): string {
  if (sub) {
    const alias = COMBO_ALIASES.find((a) => a.main === main && a.sub === sub);
    if (alias) return alias.name;
    return `${jobLabel(main)} / ${jobLabel(sub)}`;
  }
  return jobLabel(main);
}

export const CATEGORIES = [
  { id: "swordplay", name: "Swordplay", color: "#d9704a", weapon: "sword" },
  { id: "stealth", name: "Stealth", color: "#54c47a", weapon: "dagger" },
  { id: "sorcery", name: "Sorcery", color: "#7a6ff0", weapon: "staff" },
  { id: "devotion", name: "Devotion", color: "#e8c95a", weapon: "wand" },
] as const;

/** Per-class primary (and optional extra) weapons. */
const JOB_WEAPONS: Record<string, readonly string[]> = {
  VAN: ["sword"],
  AEG: ["hammer"],
  BRW: ["knuckles"],
  RVR: ["axe"],
  LNC: ["spear"],
  RON: ["katana"],
  HEX: ["staff"],
  SAN: ["wand"],
  CAN: ["wand", "staff"],
  CUT: ["dagger"],
};

export function jobAllowedWeapons(jobId: string | undefined): readonly string[] {
  if (!jobId) return [];
  return JOB_WEAPONS[jobId] ?? [];
}

export function jobAllowsWeapon(jobId: string | undefined, weaponType: string | undefined): boolean {
  if (!jobId || !weaponType) return false;
  return jobAllowedWeapons(jobId).includes(weaponType);
}

export function formatWeaponList(types: readonly string[]): string {
  if (types.length === 0) return "none";
  if (types.length === 1) return types[0];
  return `${types.slice(0, -1).join(", ")}, or ${types[types.length - 1]}`;
}

export const ARMOR_SLOTS = ["head", "chest", "hands", "legs", "feet", "back"] as const;

export const ARMOURY_TABS = [
  { id: "weapon", label: "Weapon" },
  { id: "head", label: "Head" },
  { id: "chest", label: "Chest" },
  { id: "hands", label: "Hands" },
  { id: "legs", label: "Legs" },
  { id: "feet", label: "Feet" },
  { id: "back", label: "Back" },
] as const;

export type ArmouryTabId = (typeof ARMOURY_TABS)[number]["id"];

export const WEAPON_SLOTS = [
  { id: "weapon", label: "Main Weapon" },
  { id: "sub_weapon", label: "Sub Weapon" },
] as const;

/** @deprecated use weaponSlotsForProfile + ARMOR_SLOTS */
export const EQUIP_SLOTS = ["weapon", "sub_weapon", "head", "chest", "hands", "legs", "feet", "back"] as const;

export function weaponSlotsForProfile(subJob: string | undefined) {
  if (subJob) return WEAPON_SLOTS;
  return WEAPON_SLOTS.filter((s) => s.id === "weapon");
}

export function equipSlotsForProfile(subJob: string | undefined): { id: string; label: string }[] {
  return [...weaponSlotsForProfile(subJob), ...ARMOR_SLOTS.map((id) => ({ id, label: id }))];
}

export function equippedSlotForItem(equipped: Record<string, string>, itemId: string): string | undefined {
  return Object.entries(equipped).find(([, id]) => id === itemId)?.[0];
}

/** Equipped main-hand weapon type (sword, staff, etc.) from profile inventory. */
export function mainWeaponTypeFromProfile(profile: ProfileInfo | null | undefined): string | undefined {
  const itemId = profile?.equipped?.weapon;
  if (!itemId) return undefined;
  return profile!.inventory.find((i) => i.id === itemId)?.type;
}

/** Weapon type equipped for a skill (main or sub hand depending on job). */
export function weaponTypeForSkill(sk: SkillInfo, profile: ProfileInfo): string | undefined {
  const slot =
    sk.job && sk.job === profile.sub_job && sk.job !== profile.main_job ? "sub_weapon" : "weapon";
  const itemId = profile.equipped?.[slot];
  if (!itemId) return slot === "weapon" ? mainWeaponTypeFromProfile(profile) : undefined;
  return profile.inventory.find((i) => i.id === itemId)?.type;
}

export function skillWeaponMatches(sk: SkillInfo, profile: ProfileInfo): boolean {
  if (!sk.weapon_req) return true;
  return weaponTypeForSkill(sk, profile) === sk.weapon_req;
}

export function isFriendlyEntity(e: Pick<WorldEntity, "kind" | "is_ally">): boolean {
  return e.kind === "player" || !!e.is_ally;
}

export function isEnemyEntity(e: Pick<WorldEntity, "kind" | "is_ally">): boolean {
  return e.kind === "npc" && !e.is_ally;
}

export function captureEligible(e: { alive?: boolean; capturable?: boolean; hp: number; max_hp: number }): boolean {
  if (!e.alive || !e.capturable || e.max_hp < 1 || e.hp < 1) return false;
  return e.hp / e.max_hp < 0.2;
}

export type { HotbarSlotId } from "./input/keybinds";
export { HOTBAR_SLOTS, HOTBAR_ROWS } from "./input/keybinds";

export type WindowId =
  | "character"
  | "equipment"
  | "inventory"
  | "skills"
  | "social"
  | "map"
  | "house_storage"
  | "pets";

export function weaponColor(weapon: string | undefined): number {
  return WEAPONS.find((w) => w.id === weapon)?.color ?? 0xcccccc;
}

export const RARITY_COLORS: Record<Item["rarity"], string> = {
  common: "#b8c2cc",
  rare: "#5aa9e8",
  epic: "#b06ae8",
  legendary: "#e8a13c",
};

export function itemIsConsumable(item: Item): boolean {
  return item.kind === "consumable";
}

export function firstConsumable(inventory: Item[], defId: string): Item | undefined {
  return inventory.find((i) => i.kind === "consumable" && i.consumable === defId);
}

export function itemQty(item: Item): number {
  return item.qty && item.qty > 0 ? item.qty : 1;
}

export function consumableCount(inventory: Item[], defId: string): number {
  return inventory
    .filter((i) => i.kind === "consumable" && i.consumable === defId)
    .reduce((n, i) => n + itemQty(i), 0);
}

export function skillFromAction(skills: SkillInfo[], id: string): SkillInfo | undefined {
  return skills.find((s) => s.id === id);
}

export function skillTargetsAlly(sk: SkillInfo): boolean {
  return sk.heals || !!sk.buffs;
}

export function actionFromSkill(sk: SkillInfo): SelectedAction {
  return { actionId: sk.id, name: sk.name, heals: skillTargetsAlly(sk) };
}

export function actionFromItem(item: Item): SelectedAction {
  return { actionId: "use_item", name: item.name, heals: true, itemId: item.id };
}
