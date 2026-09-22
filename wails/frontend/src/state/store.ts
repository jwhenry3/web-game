import { create } from "zustand";
import { setStoredToken } from "../net/auth";
import type {
  ChatChannel,
  ChatLine,
  ChatTone,
  CombatEventPayload,
  FriendInfo,
  FriendRequestPayload,
  PartyInfo,
  PartyInvitePayload,
  ProfileInfo,
  SelectedAction,
  WindowId,
  OverworldMap,
  WorldEntity,
  SavePoint,
  AtlasMap,
  JobChanger,
  MapTileOverrides,
  MapTerrainLayers,
  MapNeighbor,
  WorldCamp,
  HouseStatePayload,
} from "../types";
import type { Scene3DDoc } from "../three/scene3d";
import type { NpcDialogueTarget } from "../world/npcDialogue";

export type Screen = "title" | "auth" | "admin_auth" | "select" | "create" | "world" | "house" | "map_editor";

import type { CharacterAppearance } from "../characters/types";
import { appearanceFromRace, applyGameClothes } from "../characters/types";
import { loadOptions, type GameOptions } from "./optionsStorage";

export type MainMenuView = "menu" | "options";

export interface CreationDraft {
  race: string;
  mainJob: string;
  subJob: string;
  name: string;
  appearance: CharacterAppearance;
}

export interface CharacterSummary {
  name: string;
  race: string;
  main_job: string;
  sub_job: string;
}

/** A combat event with a client-assigned sequence number for VFX consumers. */
export type CombatEvent = CombatEventPayload & { seq: number };

interface GameState {
  screen: Screen;
  connected: boolean;
  loginError: string | null;
  authToken: string | null;
  adminToken: string | null;
  isAdmin: boolean;
  username: string | null;
  characters: CharacterSummary[];
  hasCharacter: boolean;
  character: CharacterSummary | null;
  creation: CreationDraft;
  selfId: string | null;
  profile: ProfileInfo | null;
  /** Unified world entities (players, NPCs, pets), keyed by entity id. */
  entities: Record<string, WorldEntity>;
  savePoints: Record<string, SavePoint>;
  jobChangers: Record<string, JobChanger>;
  camps: Record<string, WorldCamp>;
  house: HouseStatePayload | null;
  overworld: OverworldMap | null;
  currentRegion: { id: string; name: string } | null;
  mapInfo: {
    id: string;
    name: string;
    portals: { x: number; y: number; w: number; h: number }[];
    tileOverrides?: MapTileOverrides;
    terrainLayers?: MapTerrainLayers;
    /** This map's top-left corner in world pixels (border-graph layout). */
    originX: number;
    originY: number;
    /** Border-adjacent maps' world-space origins, for scene overlay. */
    neighbors: MapNeighbor[];
    /** Authored 3D layer (terrain heights/cells, prefab objects, environment). */
    scene3d?: Scene3DDoc;
  } | null;
  chat: ChatLine[];
  chatTab: ChatChannel;
  friends: FriendInfo[];
  friendRequests: FriendRequestPayload[];
  outgoingFriendRequests: string[];
  party: PartyInfo | null;
  partyInvite: PartyInvitePayload | null;
  /** Entity ids currently in a fight visible to this client (from combat_tick). */
  combatIds: Record<string, true>;
  /** Recent combat events for VFX/animation triggers (capped, seq-tagged). */
  combatEvents: CombatEvent[];
  commandPetId: string | null;
  selectedAction: SelectedAction | null;
  openWindow: WindowId | null;
  bindSlot: string | null;
  /** In-flight hotbar drag payload (dataTransfer is unreadable until drop). */
  hotbarDrag: { kind: "skill" | "item"; id: string; slot?: string } | null;
  mainMenuOpen: boolean;
  mainMenuView: MainMenuView;
  options: GameOptions;
  worldSkillDialog: "return" | "port" | null;
  npcDialog: NpcDialogueTarget | null;
  jobChangeDialog: { id: string; name: string; mode: "main" | "sub" } | null;
  teleportConfirm: { id: string; name: string } | null;
  atlas: AtlasMap[];
  /** In-flight camp↔world transfer; the loading overlay stays up and input is
   * gated until the destination's state lands (house_state / world_state). */
  transition: "house" | "world" | null;
  /** Last 3D world-camera orbit (distance/elevation/azimuth as a THREE
   * Spherical) — survives map transitions and renderer recreation within the
   * session so the view doesn't snap back to the spawn default. */
  cameraView: { distance: number; pitch: number; azimuth: number } | null;

  setScreen: (s: Screen) => void;
  setSelectedAction: (a: SelectedAction | null) => void;
  setCommandPetId: (id: string | null) => void;
  toggleWindow: (w: WindowId) => void;
  selectWindow: (w: WindowId) => void;
  closeWindow: () => void;
  setBindSlot: (slot: string | null) => void;
  setHotbarDrag: (d: GameState["hotbarDrag"]) => void;
  setChatTab: (tab: ChatChannel) => void;
  setAuth: (auth: {
    token: string;
    username: string;
    characters: CharacterSummary[];
    hasCharacter: boolean;
    character: CharacterSummary | null;
    is_admin?: boolean;
  }) => void;
  setAdminAuth: (auth: { token: string; username: string }) => void;
  clearAdminAuth: () => void;
  setCharacters: (characters: CharacterSummary[]) => void;
  setCreation: (draft: CreationDraft) => void;
  openMainMenu: () => void;
  closeMainMenu: () => void;
  toggleMainMenu: () => void;
  setMainMenuView: (view: MainMenuView) => void;
  setOptions: (options: GameOptions) => void;
  openWorldSkillDialog: (kind: "return" | "port") => void;
  closeWorldSkillDialog: () => void;
  openNpcDialog: (target: NpcDialogueTarget) => void;
  closeNpcDialog: () => void;
  openJobChangeDialog: (target: { id: string; name: string; mode: "main" | "sub" }) => void;
  closeJobChangeDialog: () => void;
  openTeleportConfirm: (target: { id: string; name: string }) => void;
  closeTeleportConfirm: () => void;
  setCameraView: (v: GameState["cameraView"]) => void;
  setAtlas: (maps: AtlasMap[]) => void;
  logout: () => void;
  reset: () => void;
}

const initial = {
  screen: "title" as Screen,
  connected: false,
  loginError: null,
  authToken: null,
  adminToken: null,
  isAdmin: false,
  username: null,
  characters: [] as CharacterSummary[],
  hasCharacter: false,
  character: null as CharacterSummary | null,
  creation: {
    race: "humanus",
    mainJob: "",
    subJob: "",
    name: "",
    appearance: applyGameClothes(appearanceFromRace("humanus")),
  } as CreationDraft,
  selfId: null,
  profile: null,
  entities: {},
  savePoints: {},
  jobChangers: {},
  camps: {},
  house: null,
  overworld: null,
  currentRegion: null,
  mapInfo: null,
  chat: [] as ChatLine[],
  chatTab: "general" as ChatChannel,
  friends: [] as FriendInfo[],
  friendRequests: [] as FriendRequestPayload[],
  outgoingFriendRequests: [] as string[],
  party: null,
  partyInvite: null,
  combatIds: {} as Record<string, true>,
  combatEvents: [] as CombatEvent[],
  commandPetId: null as string | null,
  selectedAction: null,
  openWindow: null,
  bindSlot: null,
  hotbarDrag: null as GameState["hotbarDrag"],
  mainMenuOpen: false,
  mainMenuView: "menu" as MainMenuView,
  options: loadOptions(),
  worldSkillDialog: null as "return" | "port" | null,
  npcDialog: null as NpcDialogueTarget | null,
  jobChangeDialog: null as { id: string; name: string; mode: "main" | "sub" } | null,
  teleportConfirm: null as { id: string; name: string } | null,
  atlas: [] as AtlasMap[],
  transition: null as "house" | "world" | null,
  cameraView: null as GameState["cameraView"],
};

/** True while a menu, dialog, or game window is open and owns keyboard input. */
export function gameDialogOpen(
  s: Pick<
    GameState,
    | "mainMenuOpen"
    | "openWindow"
    | "worldSkillDialog"
    | "npcDialog"
    | "jobChangeDialog"
    | "teleportConfirm"
    | "transition"
  >,
): boolean {
  return !!(
    s.transition ||
    s.mainMenuOpen ||
    s.openWindow ||
    s.worldSkillDialog ||
    s.npcDialog ||
    s.jobChangeDialog ||
    s.teleportConfirm
  );
}

/** True when a text field or an open game window/dialog owns keyboard input. */
export function uiOwnsKeyboard(): boolean {
  const el = document.activeElement as HTMLElement | null;
  const tag = el?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) {
    return true;
  }
  return gameDialogOpen(useGame.getState());
}

export const useGame = create<GameState>((set) => ({
  ...initial,
  setScreen: (s) => set({ screen: s }),
  setSelectedAction: (a) => set({ selectedAction: a }),
  setCommandPetId: (id) => set({ commandPetId: id }),
  toggleWindow: (w) =>
    set((s) => {
      // Dual house-storage view already shows inventory; I / Storage toggles close it.
      if (s.openWindow === "house_storage" && (w === "inventory" || w === "house_storage")) {
        return { openWindow: null, bindSlot: null };
      }
      return { openWindow: s.openWindow === w ? null : w, bindSlot: null };
    }),
  selectWindow: (w) => set({ openWindow: w, bindSlot: null }),
  closeWindow: () => set({ openWindow: null, bindSlot: null }),
  setBindSlot: (slot) => set({ bindSlot: slot }),
  setHotbarDrag: (d) => set({ hotbarDrag: d }),
  setChatTab: (tab) => set({ chatTab: tab }),
  setAuth: (auth) =>
    set({
      authToken: auth.token,
      username: auth.username,
      characters: auth.characters,
      hasCharacter: auth.hasCharacter,
      character: auth.character,
      screen: auth.characters.length > 0 ? "select" : "create",
      loginError: null,
      isAdmin: auth.is_admin ?? false,
    }),
  setAdminAuth: (auth) =>
    set({
      adminToken: auth.token,
      username: auth.username,
      isAdmin: true,
      loginError: null,
    }),
  clearAdminAuth: () => set({ adminToken: null, isAdmin: false }),
  setCharacters: (characters) =>
    set({
      characters,
      hasCharacter: characters.length > 0,
      screen: characters.length > 0 ? "select" : "create",
    }),
  setCreation: (creation) => set({ creation }),
  openMainMenu: () =>
    set({
      mainMenuOpen: true,
      mainMenuView: "menu",
      openWindow: null,
      bindSlot: null,
      selectedAction: null,
      worldSkillDialog: null,
      npcDialog: null,
      jobChangeDialog: null,
      teleportConfirm: null,
    }),
  closeMainMenu: () => set({ mainMenuOpen: false, mainMenuView: "menu" }),
  toggleMainMenu: () =>
    set((s) =>
      s.mainMenuOpen
        ? { mainMenuOpen: false, mainMenuView: "menu" }
        : {
            mainMenuOpen: true,
            mainMenuView: "menu",
            openWindow: null,
            bindSlot: null,
            selectedAction: null,
            worldSkillDialog: null,
            npcDialog: null,
            jobChangeDialog: null,
            teleportConfirm: null,
          },
    ),
  setMainMenuView: (view) => set({ mainMenuView: view }),
  setOptions: (options) => set({ options }),
  openWorldSkillDialog: (kind) => {
    set({
      worldSkillDialog: kind,
      mainMenuOpen: false,
    });
    window.setTimeout(() => {
      useGame.setState((s) => (s.worldSkillDialog ? { openWindow: null, bindSlot: null } : s));
    }, 0);
  },
  closeWorldSkillDialog: () => set({ worldSkillDialog: null, teleportConfirm: null }),
  openNpcDialog: (target) =>
    set({
      npcDialog: target,
      mainMenuOpen: false,
      openWindow: null,
      bindSlot: null,
      selectedAction: null,
      jobChangeDialog: null,
    }),
  closeNpcDialog: () => set({ npcDialog: null }),
  openJobChangeDialog: (target) =>
    set({
      jobChangeDialog: target,
      npcDialog: null,
      mainMenuOpen: false,
      openWindow: null,
      bindSlot: null,
      selectedAction: null,
    }),
  closeJobChangeDialog: () => set({ jobChangeDialog: null }),
  openTeleportConfirm: (target) => set({ teleportConfirm: target, mainMenuOpen: false }),
  closeTeleportConfirm: () => set({ teleportConfirm: null }),
  setCameraView: (v) => set({ cameraView: v }),
  setAtlas: (maps) => set({ atlas: maps }),
  logout: () => {
    setStoredToken(null);
    set({ ...initial, screen: "title" as Screen, options: loadOptions() });
  },
  reset: () =>
    set((s) => ({
      ...initial,
      screen: "title" as Screen,
      authToken: s.authToken,
      username: s.username,
      characters: s.characters,
      hasCharacter: s.hasCharacter,
      character: s.character,
    })),
}));

export function pushChat(
  channel: ChatChannel,
  message: string,
  from?: { id?: string; name?: string },
  tone?: ChatTone,
) {
  useGame.setState((s) => ({
    chat: [
      ...s.chat,
      {
        channel,
        from_id: from?.id ?? "",
        from_name: from?.name ?? "",
        message,
        ...(tone ? { tone } : {}),
      },
    ].slice(-200),
  }));
}

function combatTone(p: CombatEventPayload): ChatTone | undefined {
  if (p.cast_started) return "cast";
  if (!p.success && !p.cast_cancelled) return "fail";
  if (p.damage) return "damage";
  if (p.heal) return "heal";
  if (p.mp_restored) return "buff";
  if (p.action_id === "capture" && p.success) return "capture";
  return undefined;
}

let combatEventSeq = 0;

/** Record a combat_event: replace entity snapshots, append message, push VFX event. */
export function applyCombatEvent(p: CombatEventPayload) {
  useGame.setState((s) => {
    const entities = { ...s.entities };
    const combatIds = { ...s.combatIds };
    for (const e of p.entities ?? []) {
      // Full projections: replace, don't spread — omitempty fields (engaged,
      // casting, statuses) are absent when cleared and must not linger.
      entities[e.id] = e;
      combatIds[e.id] = true;
    }
    const ev: CombatEvent = { ...p, seq: ++combatEventSeq };
    const tone = combatTone(p);
    const chat = p.message
      ? [
          ...s.chat,
          {
            channel: "battle" as ChatChannel,
            from_id: "",
            from_name: "",
            message: p.message,
            ...(tone ? { tone } : {}),
          },
        ].slice(-200)
      : s.chat;
    return {
      entities,
      combatIds,
      combatEvents: [...s.combatEvents, ev].slice(-100),
      chat,
    };
  });
}

/** Replace combat participant snapshots and the in-combat id set (empty
 *  array ends combat tracking). Entities that left the set get no more
 *  projections — clear their combat-only fields so stale engaged/cast state
 *  doesn't linger. */
export function applyCombatTick(p?: { entities?: WorldEntity[] }) {
  useGame.setState((s) => {
    const entities = { ...s.entities };
    const combatIds: Record<string, true> = {};
    for (const e of p?.entities ?? []) {
      entities[e.id] = e;
      combatIds[e.id] = true;
    }
    for (const id of Object.keys(s.combatIds)) {
      if (combatIds[id]) continue;
      const prev = entities[id];
      if (!prev) continue;
      entities[id] = {
        ...prev,
        engaged: false,
        target_id: undefined,
        statuses: undefined,
        casting_skill_id: undefined,
        cast_target_id: undefined,
        cast_progress: undefined,
        cast_time_ms: undefined,
        cast_ends_at: undefined,
        has_queued_action: undefined,
      };
    }
    return { entities, combatIds };
  });
}
