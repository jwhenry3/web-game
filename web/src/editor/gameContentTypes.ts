export type JobCategory = "swordplay" | "stealth" | "sorcery" | "devotion";
export type WeaponType = "sword" | "dagger" | "staff" | "mace" | "spear";
export type ItemTarget = "self" | "ally";
export type EquipSlot = "weapon" | "sub_weapon" | "head" | "chest" | "hands" | "legs" | "feet" | "back";
export type ItemRarity = "common" | "rare" | "epic" | "legendary";
export type ItemStatKey = "str" | "mag" | "agi" | "hp";

export interface ItemEffects {
  heal_hp?: number;
  restore_mp?: number;
  per_level?: number;
}

export interface JobStatMults {
  hp?: number;
  mp?: number;
  str?: number;
  mag?: number;
  agi?: number;
}

/** One skill slot in a job's ability tree (many-to-many: same skill can appear on multiple jobs). */
export interface JobSkillNode {
  skill_id: string;
  prereq_skill_id?: string;
}

export interface JobDef {
  id: string;
  name: string;
  abbr: string;
  category: JobCategory;
  weapon: WeaponType;
  allowed_weapons?: WeaponType[];
  stat_mults: JobStatMults;
  starting: boolean;
  skill_tree: JobSkillNode[];
}

export interface SkillDef {
  id: string;
  name: string;
  category?: JobCategory;
  weapon_req?: WeaponType;
  mp_cost: number;
  power: number;
  magic: boolean;
  heals: boolean;
  buffs: boolean;
  loot: boolean;
  ranged: boolean;
  world_only: boolean;
  cast_time_ms: number;
  description: string;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: "consumable" | "equipment";
  description?: string;
  /** Battle targeting rules for consumables. */
  target?: ItemTarget;
  effects?: ItemEffects;
  stackable?: boolean;
  max_stack?: number;
  /** Primary equip slot for gear templates. */
  slot?: EquipSlot;
  /** Extra slots this gear may occupy (e.g. weapon + sub_weapon). */
  allowed_slots?: EquipSlot[];
  weapon_type?: WeaponType;
  rarity?: ItemRarity;
  level?: number;
  stats?: Partial<Record<ItemStatKey, number>>;
}

export interface QuestDef {
  id: string;
  name: string;
}

export const JOB_CATEGORIES: { id: JobCategory; label: string }[] = [
  { id: "swordplay", label: "Swordplay" },
  { id: "stealth", label: "Stealth" },
  { id: "sorcery", label: "Sorcery" },
  { id: "devotion", label: "Devotion" },
];

export const WEAPON_TYPES: { id: WeaponType; label: string }[] = [
  { id: "sword", label: "Sword" },
  { id: "dagger", label: "Dagger" },
  { id: "staff", label: "Staff" },
  { id: "mace", label: "Mace" },
  { id: "spear", label: "Spear" },
];

export const ITEM_KINDS: { id: ItemDef["kind"]; label: string }[] = [
  { id: "consumable", label: "Consumable" },
  { id: "equipment", label: "Equipment" },
];

export const ITEM_TARGETS: { id: ItemTarget; label: string; hint: string }[] = [
  { id: "ally", label: "Ally", hint: "Target any living party member (including self)." },
  { id: "self", label: "Self", hint: "May only be used on the caster." },
];

export const EQUIP_SLOTS: { id: EquipSlot; label: string; group: "weapon" | "armor" }[] = [
  { id: "weapon", label: "Main hand", group: "weapon" },
  { id: "sub_weapon", label: "Sub weapon", group: "weapon" },
  { id: "head", label: "Head", group: "armor" },
  { id: "chest", label: "Chest", group: "armor" },
  { id: "hands", label: "Hands", group: "armor" },
  { id: "legs", label: "Legs", group: "armor" },
  { id: "feet", label: "Feet", group: "armor" },
  { id: "back", label: "Back", group: "armor" },
];

export const ARMOR_SLOTS: EquipSlot[] = ["head", "chest", "hands", "legs", "feet", "back"];

export const ITEM_RARITIES: { id: ItemRarity; label: string }[] = [
  { id: "common", label: "Common" },
  { id: "rare", label: "Rare" },
  { id: "epic", label: "Epic" },
  { id: "legendary", label: "Legendary" },
];

export const ITEM_STAT_KEYS: { id: ItemStatKey; label: string }[] = [
  { id: "str", label: "STR" },
  { id: "mag", label: "MAG" },
  { id: "agi", label: "AGI" },
  { id: "hp", label: "HP" },
];
