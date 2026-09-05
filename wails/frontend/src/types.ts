// Mirrors the Go protocol package (internal/protocol/messages.go).

export type MessageType =
  | "join_world"
  | "move"
  | "chat"
  | "equip"
  | "unequip"
  | "set_jobs"
  | "set_hotbar"
  | "set_keybinds"
  | "add_friend"
  | "accept_friend"
  | "decline_friend"
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
  | "use_world_skill"
  | "enter_house"
  | "leave_house"
  | "house_interact"
  | "house_storage_deposit"
  | "house_storage_withdraw"
  | "house_place_furniture"
  | "house_pick_furniture"
  | "set_camp_skin"
  | "pet_set_follow"
  | "pet_set_battle"
  | "pet_release"
  | "rt_move"
  | "rt_attack"
  | "welcome"
  | "map_config"
  | "world_state"
  | "pet_state"
  | "player_joined"
  | "player_left"
  | "player_moved"
  | "player_sync"
  | "npc_state"
  | "camp_state"
  | "house_state"
  | "house_return"
  | "social_state"
  | "party_invite_received"
  | "battle_invite_received"
  | "friend_request_received"
  | "reward_notice"
  | "chat_message"
  | "battle_list"
  | "battle_state"
  | "battle_event"
  | "battle_tick"
  | "battle_end"
  | "battle_return"
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
  kind: "equipment" | "consumable" | "decoration" | "crafting" | string;
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
  world_only?: boolean;
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
  unlocked_jobs: string[];
  appearance?: CharacterAppearanceWire;
  jobs: JobProgressInfo[];
  stats: StatBlock;
  inventory: Item[];
  house_storage?: Item[];
  house_storage_capacity?: number;
  camp_skin?: string;
  equipped: Record<string, string>;
  hotbar: Record<string, HotbarBinding>;
  keybinds?: Record<string, string>;
  skills: SkillInfo[];
  friends?: string[];
  save_point_id?: string;
  save_point_name?: string;
  visited_save_points?: VisitedSavePoint[];
  pets?: PetRecord[];
  follow_pet_id?: string;
  battle_pet_id?: string;
}

export interface PetRecord {
  id: string;
  kind: string;
  name: string;
  level: number;
  caught_at?: number;
}

export interface VisitedSavePoint {
  id: string;
  name: string;
  map_name?: string;
  home?: boolean;
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

export interface FriendRequestPayload {
  from_id?: string;
  from_name: string;
}

export interface SocialStatePayload {
  friends: FriendInfo[];
  party?: PartyInfo | null;
  pending_invite?: PartyInvitePayload | null;
  pending_friend_requests?: FriendRequestPayload[];
  outgoing_friend_requests?: string[];
}

export interface WelcomePayload {
  player_id: string;
  profile: ProfileInfo;
  map?: MapSnapshot;
}

export interface MapSnapshot {
  id: string;
  name: string;
  combat: string;
  capabilities: string[];
  modules: Array<{
    id: string;
    name: string;
    version: string;
    capabilities: string[];
    frontend: { pluginId: string };
    config?: Record<string, unknown>;
  }>;
  overworld: OverworldMap;
  portals?: MapPortal[];
  tile_overrides?: MapTileOverrides;
  terrain_layers?: MapTerrainLayers;
}

export interface MapTerrainLayers {
  ground: number[];
  collision: number[];
}

export interface MapConfigPayload {
  map?: MapSnapshot;
}

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

export interface MapPortal {
  x: number;
  y: number;
  w: number;
  h: number;
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
  facing?: number | string;
  in_battle: boolean;
  battle_id?: string;
  in_house?: boolean;
  house_owner?: string;
  immune_until?: number;
  casting_skill_id?: string;
  cast_time_ms?: number;
  cast_ends_at?: number;
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

export interface JobChanger {
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

export type AtlasPOIKind = "save_point";

export interface AtlasPOI {
  id: string;
  kind: AtlasPOIKind | string;
  name: string;
  x: number;
  y: number;
}

export interface AtlasMap {
  id: string;
  name: string;
  overworld: OverworldMap;
  pois: AtlasPOI[];
}

export interface AtlasPayload {
  maps: AtlasMap[];
}

export interface WorldCamp {
  owner_name: string;
  owner_id: string;
  x: number;
  y: number;
  skin: string;
}

export interface HouseFurniture {
  id: string;
  col: number;
  row: number;
  owner?: string;
  item: Item;
}

export interface HousePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  facing?: number | string;
  owner?: boolean;
}

export interface HousePOI {
  id: string;
  kind: "door" | "storage" | string;
  name: string;
  x: number;
  y: number;
}

export interface HouseStatePayload {
  owner_name: string;
  skin: string;
  map_cols: number;
  map_rows: number;
  walk_cols: number;
  walk_rows: number;
  walk_origin_col: number;
  walk_origin_row: number;
  tile_size: number;
  players: HousePlayer[];
  furniture: HouseFurniture[];
  pois: HousePOI[];
  storage?: Item[];
  storage_capacity?: number;
  is_owner: boolean;
}

export interface WorldStatePayload {
  players: WorldPlayer[];
  npcs?: WorldNPC[];
  camps?: WorldCamp[];
  pets?: WorldPet[];
  battles: BattleInfo[];
  save_points?: SavePoint[];
  job_changers?: JobChanger[];
  map?: OverworldMap;
}

export interface WorldPet {
  id: string;
  owner_id: string;
  kind: string;
  name: string;
  level: number;
  x: number;
  y: number;
  facing?: number | string;
}

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
  is_ally?: boolean;
  owner_id?: string;
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
  capturable?: boolean;
  has_queued_action?: boolean;
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
  is_ally?: boolean;
  owner_id?: string;
  x: number;
  y: number;
  hp: number;
  max_hp: number;
  mp?: number;
  max_mp?: number;
  skill_atb?: number;
  target_id?: string;
  alive: boolean;
  capturable?: boolean;
  has_queued_action?: boolean;
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

export function isFriendlyEntity(e: { is_player?: boolean; is_ally?: boolean }): boolean {
  return !!e.is_player || !!e.is_ally;
}

export function isEnemyEntity(e: { is_player?: boolean; is_ally?: boolean }): boolean {
  return !e.is_player && !e.is_ally;
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
