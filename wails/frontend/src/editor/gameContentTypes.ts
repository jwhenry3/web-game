export type JobCategory = "swordplay" | "stealth" | "sorcery" | "devotion";
export type JobRole = "tank" | "healer" | "support" | "dps";
export type CombatStyle = "melee" | "magic" | "ranged";
export type WeaponType =
  | "sword"
  | "hammer"
  | "axe"
  | "spear"
  | "katana"
  | "staff"
  | "wand"
  | "dagger"
  | "knuckles";
export type ItemTarget = "self" | "ally";
export type EquipSlot = "weapon" | "sub_weapon" | "head" | "chest" | "hands" | "legs" | "feet" | "back";
export type ArmorClass = "heavy" | "medium" | "light";
export type ItemRarity = "common" | "rare" | "epic" | "legendary";
export type ItemStatKey = "str" | "dex" | "vit" | "int" | "md" | "hp" | "mp";

export interface ItemEffects {
  heal_hp?: number;
  restore_mp?: number;
  per_level?: number;
}

export interface JobStatMults {
  hp?: number;
  mp?: number;
  str?: number;
  dex?: number;
  vit?: number;
  int?: number;
  md?: number;
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
  role?: JobRole;
  style?: CombatStyle;
  category: JobCategory;
  weapon: WeaponType;
  allowed_weapons?: WeaponType[];
  stat_mults: JobStatMults;
  starting: boolean;
  skill_tree: JobSkillNode[];
}

export type SkillAspect =
  | "physical"
  | "magic"
  | "heal"
  | "buff"
  | "ranged"
  | "combo";

export interface PassiveEffectDef {
  skill_types?: SkillAspect[];
  effect_multiplier?: number;
  reflect_chance?: number;
  reflect_ratio?: number;
  cooldown_reduction?: number;
  min_combo_stack?: number;
  target_hp_below?: number;
}

export interface StatusEffectDef {
  kind: string;
  duration: number;
  potency: number;
  on_caster?: boolean;
}

/** A combo advances a status stack per execution; branches keyed on
 *  combo_step select that step's effect list. */
export interface ComboDef {
  status: string;
  duration: number;
  steps: number;
}

/** Flat predicates ANDed together — a branch fires when all hold. */
export interface SkillConditionDef {
  /** Matches only on this combo step (0 = first press). */
  combo_step?: number;
  /** Requires the caster's highest live combo stack (post-advance). */
  min_combo_stack?: number;
  /** Target HP fraction at or under this threshold (0–1). */
  target_hp_below?: number;
  /** Caster HP fraction at or under this threshold (0–1). */
  caster_hp_below?: number;
}

/** One component of a skill's behavior, resolved in declaration order. */
export interface SkillEffectDef {
  kind: "damage" | "heal" | "status" | "world";
  /** Per-effect power override; falls back to the skill's power. */
  power?: number;
  /** Per-effect stat override for damage/heal rolls (affinity stat). */
  stat?: "str" | "dex" | "vit" | "int" | "md";
  /** Payload for kind "status". */
  status?: StatusEffectDef;
  /** Field action for kind "world" ("return" | "port" | "camp"). */
  world?: string;
}

/** A conditional effect list — first matching branch wins. */
export interface SkillBranchDef {
  /** Action-name override when this branch fires (combo step names). */
  name?: string;
  when?: SkillConditionDef;
  effects: SkillEffectDef[];
}

/** What a skill aims at: the resolved targeting rule. */
export type SkillTarget = "enemy" | "ally" | "self" | "none";

export interface SkillDef {
  id: string;
  name: string;
  category?: JobCategory;
  weapon_reqs?: WeaponType[];
  mp_cost: number;
  power: number;
  magic: boolean;
  heals: boolean;
  buffs: boolean;
  loot: boolean;
  ranged: boolean;
  world_only: boolean;
  cast_time_ms: number;
  cooldown_ms?: number;
  passive?: boolean;
  passive_effect?: PassiveEffectDef;
  combo_length?: number;
  combo?: ComboDef;
  target?: SkillTarget;
  effects?: SkillEffectDef[];
  branches?: SkillBranchDef[];
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
  /** Weight class for non-weapon armor: fixes the stat profile (heavy = STR/VIT, medium = DEX, light = INT/MD). */
  armor_class?: ArmorClass;
  rarity?: ItemRarity;
  level?: number;
  stats?: Partial<Record<ItemStatKey, number>>;
}

export interface QuestDef {
  id: string;
  name: string;
}

export interface DropPoolEntry {
  item_id: string;
  /** Independent drop chance 0–100. */
  chance: number;
}

export interface DropPoolDef {
  id: string;
  name: string;
  entries: DropPoolEntry[];
}

export const JOB_CATEGORIES: { id: JobCategory; label: string }[] = [
  { id: "swordplay", label: "Swordplay" },
  { id: "stealth", label: "Stealth" },
  { id: "sorcery", label: "Sorcery" },
  { id: "devotion", label: "Devotion" },
];

export const JOB_ROLES: { id: JobRole; label: string }[] = [
  { id: "tank", label: "Tank" },
  { id: "healer", label: "Healer" },
  { id: "support", label: "Support" },
  { id: "dps", label: "DPS" },
];

export const COMBAT_STYLES: { id: CombatStyle; label: string }[] = [
  { id: "melee", label: "Melee" },
  { id: "magic", label: "Magic" },
  { id: "ranged", label: "Ranged" },
];

export const WEAPON_TYPES: { id: WeaponType; label: string }[] = [
  { id: "sword", label: "Sword" },
  { id: "hammer", label: "Hammer" },
  { id: "axe", label: "Axe" },
  { id: "spear", label: "Spear" },
  { id: "katana", label: "Katana" },
  { id: "staff", label: "Staff" },
  { id: "wand", label: "Wand" },
  { id: "dagger", label: "Dagger" },
  { id: "knuckles", label: "Knuckles" },
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

export const ARMOR_CLASSES: { id: ArmorClass; label: string }[] = [
  { id: "heavy", label: "Heavy" },
  { id: "medium", label: "Medium" },
  { id: "light", label: "Light" },
];

export const ITEM_RARITIES: { id: ItemRarity; label: string }[] = [
  { id: "common", label: "Common" },
  { id: "rare", label: "Rare" },
  { id: "epic", label: "Epic" },
  { id: "legendary", label: "Legendary" },
];

export const ITEM_STAT_KEYS: { id: ItemStatKey; label: string }[] = [
  { id: "str", label: "STR" },
  { id: "dex", label: "DEX" },
  { id: "vit", label: "VIT" },
  { id: "int", label: "INT" },
  { id: "md", label: "MD" },
  { id: "hp", label: "HP" },
  { id: "mp", label: "MP" },
];
