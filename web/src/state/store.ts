import { create } from "zustand";
import { setStoredToken } from "../net/auth";
import type {
  BattleEndPayload,
  BattleEntity,
  BattleInfo,
  ChatChannel,
  ChatLine,
  FriendInfo,
  FriendRequestPayload,
  PartyInfo,
  PartyInvitePayload,
  BattleInvitePayload,
  ProfileInfo,
  SelectedAction,
  WindowId,
  OverworldMap,
  WorldNPC,
  WorldPlayer,
  RTBattleView,
  SavePoint,
  AtlasMap,
  JobChanger,
  MapTileOverrides,
  MapTerrainLayers,
} from "../types";
import type { NpcDialogueTarget } from "../world/npcDialogue";

export type Screen = "title" | "auth" | "admin_auth" | "select" | "create" | "world" | "battle" | "map_editor";

import type { CharacterAppearance } from "../characters/types";
import { appearanceFromRace } from "../characters/types";
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

export interface BattleView {
  battleId: string;
  entities: BattleEntity[];
  battleSpeed: number;
  log: string[];
  end: BattleEndPayload | null;
}

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
  players: Record<string, WorldPlayer>;
  npcs: Record<string, WorldNPC>;
  savePoints: Record<string, SavePoint>;
  jobChangers: Record<string, JobChanger>;
  overworld: OverworldMap | null;
  mapInfo: {
    id: string;
    name: string;
    combat: string;
    capabilities: string[];
    portals: { x: number; y: number; w: number; h: number }[];
    tileOverrides?: MapTileOverrides;
    terrainLayers?: MapTerrainLayers;
  } | null;
  battles: BattleInfo[];
  chat: ChatLine[];
  chatTab: ChatChannel;
  friends: FriendInfo[];
  friendRequests: FriendRequestPayload[];
  outgoingFriendRequests: string[];
  party: PartyInfo | null;
  partyInvite: PartyInvitePayload | null;
  battleInvite: BattleInvitePayload | null;
  battle: BattleView | null;
  rtBattle: RTBattleView | null;
  combatMode: string | null;
  selectedAction: SelectedAction | null;
  openWindow: WindowId | null;
  bindSlot: string | null;
  mainMenuOpen: boolean;
  mainMenuView: MainMenuView;
  options: GameOptions;
  worldSkillDialog: "return" | "teleport" | null;
  npcDialog: NpcDialogueTarget | null;
  jobChangeDialog: { id: string; name: string; mode: "main" | "sub" } | null;
  teleportConfirm: { id: string; name: string } | null;
  atlas: AtlasMap[];

  setScreen: (s: Screen) => void;
  setSelectedAction: (a: SelectedAction | null) => void;
  toggleWindow: (w: WindowId) => void;
  closeWindow: () => void;
  setBindSlot: (slot: string | null) => void;
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
  openWorldSkillDialog: (kind: "return" | "teleport") => void;
  closeWorldSkillDialog: () => void;
  openNpcDialog: (target: NpcDialogueTarget) => void;
  closeNpcDialog: () => void;
  openJobChangeDialog: (target: { id: string; name: string; mode: "main" | "sub" }) => void;
  closeJobChangeDialog: () => void;
  openTeleportConfirm: (target: { id: string; name: string }) => void;
  closeTeleportConfirm: () => void;
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
    race: "hume",
    mainJob: "",
    subJob: "",
    name: "",
    appearance: appearanceFromRace("hume"),
  } as CreationDraft,
  selfId: null,
  profile: null,
  players: {},
  npcs: {},
  savePoints: {},
  jobChangers: {},
  overworld: null,
  mapInfo: null,
  battles: [],
  chat: [] as ChatLine[],
  chatTab: "general" as ChatChannel,
  friends: [] as FriendInfo[],
  friendRequests: [] as FriendRequestPayload[],
  outgoingFriendRequests: [] as string[],
  party: null,
  partyInvite: null,
  battleInvite: null,
  battle: null,
  rtBattle: null,
  combatMode: null,
  selectedAction: null,
  openWindow: null,
  bindSlot: null,
  mainMenuOpen: false,
  mainMenuView: "menu" as MainMenuView,
  options: loadOptions(),
  worldSkillDialog: null as "return" | "teleport" | null,
  npcDialog: null as NpcDialogueTarget | null,
  jobChangeDialog: null as { id: string; name: string; mode: "main" | "sub" } | null,
  teleportConfirm: null as { id: string; name: string } | null,
  atlas: [] as AtlasMap[],
};

export const useGame = create<GameState>((set) => ({
  ...initial,
  setScreen: (s) => set({ screen: s }),
  setSelectedAction: (a) => set({ selectedAction: a }),
  toggleWindow: (w) =>
    set((s) => ({ openWindow: s.openWindow === w ? null : w, bindSlot: null })),
  closeWindow: () => set({ openWindow: null, bindSlot: null }),
  setBindSlot: (slot) => set({ bindSlot: slot }),
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

export function pushChat(channel: ChatChannel, message: string, from?: { id?: string; name?: string }) {
  useGame.setState((s) => ({
    chat: [
      ...s.chat,
      {
        channel,
        from_id: from?.id ?? "",
        from_name: from?.name ?? "",
        message,
      },
    ].slice(-200),
  }));
}

export function appendBattleLog(line: string) {
  pushChat("battle", line);
  useGame.setState((s) => {
    if (!s.battle) return s;
    const log = [...s.battle.log, line].slice(-60);
    return { battle: { ...s.battle, log } };
  });
}
