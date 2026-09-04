import { net } from "../net/socket";
import { openJobMasterDialog } from "./npcDialogue";
import { pushChat, useGame } from "../state/store";

import { bindingToDisplay, mergeKeybinds, type KeybindMap } from "../input/keybinds";

export const SAVE_POINT_RANGE = 80;
export const JOB_CHANGER_RANGE = 80;
export const INTERACT_RANGE = 80;

export function interactKeyLabel(keybinds?: KeybindMap | null): string {
  return bindingToDisplay(mergeKeybinds(keybinds).interact ?? "Space");
}

type InteractPromptState = {
  screen: string;
  selfId: string | null;
  mainMenuOpen: boolean;
  openWindow: string | null;
  worldSkillDialog: string | null;
  npcDialog: unknown;
  jobChangeDialog: unknown;
  players: Record<string, { in_battle?: boolean; in_house?: boolean }>;
  battles: { battle_id: string; participants: number; max_players: number }[];
  camps?: Record<string, { owner_name: string; x: number; y: number }>;
};

export function canShowWorldInteractPrompts(state: InteractPromptState): boolean {
  if (state.screen !== "world" || !state.selfId) return false;
  if (state.mainMenuOpen || state.openWindow || state.worldSkillDialog || state.npcDialog || state.jobChangeDialog) return false;
  const self = state.players[state.selfId];
  return !!self && !self.in_battle && !self.in_house;
}

export function battleJoinable(state: Pick<InteractPromptState, "battles">, battleId?: string): boolean {
  if (!battleId) return false;
  const info = state.battles.find((b) => b.battle_id === battleId);
  return !info || info.participants < info.max_players;
}

export function tryWorldInteract(): boolean {
  const state = useGame.getState();
  if (!canShowWorldInteractPrompts(state)) return false;

  const self = state.players[state.selfId!];
  const x = self.x;
  const y = self.y;

  let nearestCamp: { owner: string; dist: number } | null = null;
  for (const camp of Object.values(state.camps ?? {})) {
    const dist = Math.hypot(x - camp.x, y - camp.y);
    if (dist <= INTERACT_RANGE && (!nearestCamp || dist < nearestCamp.dist)) {
      nearestCamp = { owner: camp.owner_name, dist };
    }
  }
  if (nearestCamp) {
    net.enterHouse(nearestCamp.owner);
    return true;
  }

  let nearestJobChanger: { id: string; name: string; dist: number } | null = null;
  for (const jc of Object.values(state.jobChangers)) {
    const dist = Math.hypot(x - jc.x, y - jc.y);
    if (dist <= JOB_CHANGER_RANGE && (!nearestJobChanger || dist < nearestJobChanger.dist)) {
      nearestJobChanger = { id: jc.id, name: jc.name, dist };
    }
  }
  if (nearestJobChanger) {
    openJobMasterDialog({ id: nearestJobChanger.id, name: nearestJobChanger.name });
    return true;
  }

  let nearestSave: { id: string; name: string; dist: number } | null = null;
  for (const sp of Object.values(state.savePoints)) {
    const dist = Math.hypot(x - sp.x, y - sp.y);
    if (dist <= SAVE_POINT_RANGE && (!nearestSave || dist < nearestSave.dist)) {
      nearestSave = { id: sp.id, name: sp.name, dist };
    }
  }
  if (nearestSave) {
    net.setSavePoint(nearestSave.id);
    pushChat("system", `Save point set to ${nearestSave.name}.`);
    return true;
  }

  for (const npc of Object.values(state.npcs)) {
    if (!npc.in_battle || !npc.battle_id) continue;
    if (Math.hypot(x - npc.x, y - npc.y) > INTERACT_RANGE) continue;
    if (!battleJoinable(state, npc.battle_id)) continue;
    net.joinBattle(npc.battle_id);
    return true;
  }

  for (const p of Object.values(state.players)) {
    if (p.id === state.selfId || p.in_house || !p.in_battle || !p.battle_id) continue;
    if (Math.hypot(x - p.x, y - p.y) > INTERACT_RANGE) continue;
    if (!battleJoinable(state, p.battle_id)) continue;
    net.joinBattle(p.battle_id);
    return true;
  }

  pushChat("system", "Nothing to interact with nearby.");
  return false;
}
