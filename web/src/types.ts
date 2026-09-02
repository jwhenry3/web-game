// Mirrors the Go protocol package (internal/protocol/messages.go).

export type MessageType =
  | "join_world"
  | "move"
  | "chat"
  | "equip"
  | "unequip"
  | "set_jobs"
  | "set_hotbar"
  | "add_friend"
  | "remove_friend"
  | "party_invite"
  | "party_accept"
  | "party_decline"
  | "party_leave"
  | "party_kick"
  | "decline_battle_invite"
  | "join_battle"
  | "leave_battle"
  | "action"
  | "set_target"
  | "set_save_point"
  | "rt_move"
  | "rt_attack"
  | "welcome"
  | "world_state"
  | "player_joined"
  | "player_left"
  | "player_moved"
  | "player_sync"
  | "npc_state"
  | "social_state"
  | "party_invite_received"
  | "battle_invite_received"
  | "reward_notice"
  | "chat_message"
  | "battle_list"
  | "battle_state"
  | "battle_event"
  | "battle_tick"
  | "battle_end"
  | "rt_battle_state"
  | "rt_battle_tick"
  | "rt_battle_event"
  | "rt_battle_end"
  | "error";

export interface Envelope {
  type: MessageType;
  payload?: unknown;
}

export interface Item {
  id: string;
  name: string;
  kind: "equipment" | "consumable" | string;
  slot?: string;
  type?: string;
  consumable?: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  level: number;
  qty?: number;
  stats?: Record<string, number>;
}

export interface SkillInfo {
  id: string;
  name: string;
  mp_cost: number;
  heals: boolean;
  buffs?: boolean;
  description: string;
  category?: string;
  job?: string;
  prereq?: string;
  weapon_req?: string;
  unlocked: boolean;
  level: number;
  max_level: number;
  unlock_level: number;
  usage?: number;
  usage_to_next?: number;
  cast_time_ms?: number;
}

export interface JobProgressInfo {
  id: string;
  name: string;
  abbr: string;
  category: string;
  level: number;
  xp: number;
  max_xp: number;
}

export interface StatBlock {
  hp: number;
  mp: number;
  str: number;
  mag: number;
  agi: number;
}

export interface HotbarBinding {
  kind: "skill" | "item" | string;
  id: string;
}

export interface CharacterAppearanceWire {
  skin: string;
  face: string;
  hair: string;
  hair_color: string;
  cloth: string;
  cloth_color: string;
  weapon: string;
  weapon_color: string;
}

export interface ProfileInfo {
  name: string;
  level: number;
  xp: number;
  max_xp: number;
  race?: string;
  main_job: string;
  sub_job: string;
  subjob_unlock_level: number;
  appearance?: CharacterAppearanceWire;
  jobs: JobProgressInfo[];
  stats: StatBlock;
  inventory: Item[];
  equipped: Record<string, string>;
  hotbar: Record<string, HotbarBinding>;
  skills: SkillInfo[];
  friends?: string[];
  save_point_id?: string;
  save_point_name?: string;
}

export interface FriendInfo {
  name: string;
  online: boolean;
  level?: number;
  weapon?: string;
  in_battle?: boolean;
}

export interface PartyMember {
  id: string;
  name: string;
  level: number;
  weapon: string;
  leader: boolean;
  in_battle: boolean;
}

export interface PartyInfo {
  id: string;
  leader_id: string;
  members: PartyMember[];
}

export interface PartyInvitePayload {
  from_id: string;
  from_name: string;
  party_id: string;
}

export interface BattleInvitePayload {
  battle_id: string;
  from_id: string;
  from_name: string;
}

export interface SocialStatePayload {
  friends: FriendInfo[];
  party?: PartyInfo | null;
  pending_invite?: PartyInvitePayload | null;
}

export interface WelcomePayload {
  player_id: string;
  profile: ProfileInfo;
}

export interface WorldPlayer {
  id: string;
  name: string;
  weapon: string;
  race?: string;
  main_job: string;
  sub_job?: string;
  level: number;
  appearance?: CharacterAppearanceWire;
  x: number;
  y: number;
  in_battle: boolean;
  battle_id?: string;
  immune_until?: number;
}

export interface BattleInfo {
  battle_id: string;
  participants: number;
  max_players: number;
  level: number;
}

export interface WorldNPC {
  id: string;
  name: string;
  kind: string;
  level: number;
  x: number;
  y: number;
  in_battle: boolean;
  battle_id?: string;
}

export interface SavePoint {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface OverworldMap {
  tile: number;
  cols: number;
  rows: number;
  cells: string;
}

export interface WorldStatePayload {
  players: WorldPlayer[];
  npcs?: WorldNPC[];
  battles: BattleInfo[];
  save_points?: SavePoint[];
  map?: OverworldMap;
}

export type ChatChannel = "general" | "social" | "system" | "battle";

export const CHAT_TABS: { id: ChatChannel; label: string }[] = [
  { id: "general", label: "General" },
  { id: "social", label: "Social" },
  { id: "system", label: "System" },
  { id: "battle", label: "Battle" },
];

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
}

export interface StatusSnapshot {
  kind: string;
  potency: number;
  remaining: number;
  shield_hp?: number;
}

export interface BattleEntity {
  id: string;
  name: string;
  kind?: string;
  is_player: boolean;
  weapon?: string;
  level: number;
  hp: number;
  max_hp: number;
  mp: number;
  max_mp: number;
  agility: number;
  skill_atb: number;
  atb: number;
  target_id?: string;
  alive: boolean;
  statuses?: StatusSnapshot[];
  casting_skill_id?: string;
  cast_target_id?: string;
  cast_progress?: number;
  cast_time_ms?: number;
}

export interface BattleStatePayload {
  battle_id: string;
  entities: BattleEntity[];
  battle_speed?: number;
}

export interface ActionResult {
  actor_id: string;
  action_id: string;
  action_name: string;
  target_id: string;
  item_id?: string;
  success: boolean;
  damage?: number;
  heal?: number;
  mp_restored?: number;
  message?: string;
  status_applied?: StatusSnapshot[];
  cast_started?: boolean;
}

export interface EntityUpdate {
  id: string;
  hp: number;
  mp: number;
  skill_atb: number;
  atb: number;
  target_id?: string;
  alive: boolean;
  statuses?: StatusSnapshot[];
  casting_skill_id?: string;
  cast_target_id?: string;
  cast_progress?: number;
  cast_time_ms?: number;
}

export interface BattleEventPayload {
  results: ActionResult[];
  entities: EntityUpdate[];
  timestamp: number;
}

export interface BattleTickPayload {
  skill_atb?: Record<string, number>;
  atb: Record<string, number>;
  hp?: Record<string, number>;
  alive?: Record<string, boolean>;
  statuses?: Record<string, StatusSnapshot[]>;
  casting_skill_id?: Record<string, string>;
  cast_target_id?: Record<string, string>;
  cast_progress?: Record<string, number>;
  cast_time_ms?: Record<string, number>;
}

export interface PlayerReward {
  player_id: string;
  xp: number;
  levels_gained: number;
  new_level: number;
  new_xp: number;
  max_xp: number;
  loot: Item[];
  passive?: boolean;
  party_bonus?: boolean;
}

export interface BattleEndPayload {
  victory: boolean;
  rewards: PlayerReward[];
}

export interface RTBattleEntity {
  id: string;
  name: string;
  kind?: string;
  is_player: boolean;
  x: number;
  y: number;
  hp: number;
  max_hp: number;
  mp?: number;
  max_mp?: number;
  skill_atb?: number;
  target_id?: string;
  alive: boolean;
  statuses?: StatusSnapshot[];
  casting_skill_id?: string;
  cast_target_id?: string;
  cast_progress?: number;
  cast_time_ms?: number;
}

export interface RTBattleStatePayload {
  battle_id: string;
  entities: RTBattleEntity[];
  mode?: string;
}

export interface RTBattleTickPayload {
  entities: RTBattleEntity[];
}

export interface RTBattleEventPayload {
  attacker_id: string;
  target_id?: string;
  damage?: number;
  heal?: number;
  mp_restored?: number;
  hit: boolean;
  message?: string;
  action_id?: string;
  action_name?: string;
  success?: boolean;
  cast_started?: boolean;
  cast_cancelled?: boolean;
  entities: RTBattleEntity[];
}

export interface RTBattleEndPayload {
  victory: boolean;
  rewards: PlayerReward[];
}

export interface RTBattleView {
  battleId: string;
  entities: RTBattleEntity[];
  end: RTBattleEndPayload | null;
}

/** A pending battle action waiting for a target click. */
export interface SelectedAction {
  actionId: string;
  name: string;
  heals: boolean;
  itemId?: string;
}

export const RACES = [
  { id: "hume", name: "Hume", color: "#c9a86c", desc: "Balanced and adaptable." },
  { id: "elvaan", name: "Elvaan", color: "#8eb4d4", desc: "Proud and resilient." },
  { id: "tarutaru", name: "Tarutaru", color: "#9ad4a0", desc: "Small, clever, and magical." },
  { id: "mithra", name: "Mithra", color: "#d4a0c8", desc: "Agile hunters of the wild." },
  { id: "galka", name: "Galka", color: "#a0a8b8", desc: "Stalwart giants of the north." },
] as const;

export const ALL_JOBS = [
  { id: "WAR", name: "Warrior", abbr: "WAR", category: "swordplay", color: "#d9704a" },
  { id: "MNK", name: "Monk", abbr: "MNK", category: "swordplay", color: "#d9704a" },
  { id: "PLD", name: "Paladin", abbr: "PLD", category: "swordplay", color: "#d9704a" },
  { id: "DRK", name: "Dark Knight", abbr: "DRK", category: "swordplay", color: "#d9704a" },
  { id: "SAM", name: "Samurai", abbr: "SAM", category: "swordplay", color: "#d9704a" },
  { id: "DRG", name: "Dragoon", abbr: "DRG", category: "swordplay", color: "#d9704a" },
  { id: "BLU", name: "Blue Mage", abbr: "BLU", category: "swordplay", color: "#d9704a" },
  { id: "RUN", name: "Rune Fencer", abbr: "RUN", category: "swordplay", color: "#d9704a" },
  { id: "THF", name: "Thief", abbr: "THF", category: "stealth", color: "#54c47a" },
  { id: "NIN", name: "Ninja", abbr: "NIN", category: "stealth", color: "#54c47a" },
  { id: "DNC", name: "Dancer", abbr: "DNC", category: "stealth", color: "#54c47a" },
  { id: "BST", name: "Beastmaster", abbr: "BST", category: "stealth", color: "#54c47a" },
  { id: "RNG", name: "Ranger", abbr: "RNG", category: "stealth", color: "#54c47a" },
  { id: "COR", name: "Corsair", abbr: "COR", category: "stealth", color: "#54c47a" },
  { id: "BLM", name: "Black Mage", abbr: "BLM", category: "sorcery", color: "#7a6ff0" },
  { id: "SMN", name: "Summoner", abbr: "SMN", category: "sorcery", color: "#7a6ff0" },
  { id: "BRD", name: "Bard", abbr: "BRD", category: "sorcery", color: "#7a6ff0" },
  { id: "GEO", name: "Geomancer", abbr: "GEO", category: "sorcery", color: "#7a6ff0" },
  { id: "WHM", name: "White Mage", abbr: "WHM", category: "devotion", color: "#e8c95a" },
  { id: "RDM", name: "Red Mage", abbr: "RDM", category: "devotion", color: "#e8c95a" },
  { id: "SCH", name: "Scholar", abbr: "SCH", category: "devotion", color: "#e8c95a" },
  { id: "PUP", name: "Puppetmaster", abbr: "PUP", category: "devotion", color: "#e8c95a" },
] as const;

export const STARTING_JOBS = [
  { id: "WAR", name: "Warrior", abbr: "WAR", category: "swordplay", color: "#d9704a", desc: "Heavy melee fighter." },
  { id: "MNK", name: "Monk", abbr: "MNK", category: "swordplay", color: "#d9704a", desc: "Unarmed martial artist." },
  { id: "WHM", name: "White Mage", abbr: "WHM", category: "devotion", color: "#e8c95a", desc: "Healer and holy magic." },
  { id: "BLM", name: "Black Mage", abbr: "BLM", category: "sorcery", color: "#7a6ff0", desc: "Offensive elemental magic." },
  { id: "RDM", name: "Red Mage", abbr: "RDM", category: "devotion", color: "#e8c95a", desc: "Hybrid sword and spell." },
  { id: "THF", name: "Thief", abbr: "THF", category: "stealth", color: "#54c47a", desc: "Fast strikes and pilfering." },
] as const;

/** @deprecated use STARTING_JOBS */
export const WEAPONS = [
  { id: "sword", name: "Sword", color: 0xd9704a, category: "swordplay", desc: "Heavy blows. Trains Swordplay." },
  { id: "dagger", name: "Dagger", color: 0x54c47a, category: "stealth", desc: "Fast strikes. Trains Stealth." },
  { id: "staff", name: "Staff", color: 0x7a6ff0, category: "sorcery", desc: "Boosts Sorcery magic." },
  { id: "mace", name: "Mace", color: 0xe8c95a, category: "devotion", desc: "Boosts Devotion magic." },
] as const;

export function jobColor(jobId: string): string {
  return ALL_JOBS.find((j) => j.id === jobId)?.color ?? "#b8c2cc";
}

export function jobLabel(jobId: string): string {
  return ALL_JOBS.find((j) => j.id === jobId)?.abbr ?? jobId;
}

export const CATEGORIES = [
  { id: "swordplay", name: "Swordplay", color: "#d9704a", weapon: "sword" },
  { id: "stealth", name: "Stealth", color: "#54c47a", weapon: "dagger" },
  { id: "sorcery", name: "Sorcery", color: "#7a6ff0", weapon: "staff" },
  { id: "devotion", name: "Devotion", color: "#e8c95a", weapon: "mace" },
] as const;

export const ARMOR_SLOTS = ["head", "chest", "hands", "legs", "feet", "back"] as const;

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

export const HOTBAR_SLOTS = ["1", "2", "3", "4", "5"] as const;

export type WindowId = "character" | "equipment" | "inventory" | "skills" | "social";

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
