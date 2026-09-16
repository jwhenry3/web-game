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
  players: Record<string, { in_combat?: boolean; in_house?: boolean }>;
  camps?: Record<string, { owner_name: string; x: number; y: number }>;
};

export function canShowWorldInteractPrompts(state: InteractPromptState): boolean {
  if (state.screen !== "world" || !state.selfId) return false;
  if (state.mainMenuOpen || state.openWindow || state.worldSkillDialog || state.npcDialog || state.jobChangeDialog) return false;
  const self = state.players[state.selfId];
  return !!self && !self.in_combat && !self.in_house;
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

  // Combat is proximity/attack driven — interacting near an engaged NPC
  // focuses it as your target rather than joining an instanced battle.
  let nearestFoe: { id: string; dist: number } | null = null;
  for (const npc of Object.values(state.npcs)) {
    const dist = Math.hypot(x - npc.x, y - npc.y);
    if (dist <= INTERACT_RANGE && (!nearestFoe || dist < nearestFoe.dist)) {
      nearestFoe = { id: npc.id, dist };
    }
  }
  if (nearestFoe) {
    net.setTarget(nearestFoe.id);
    return true;
  }

  pushChat("system", "Nothing to interact with nearby.");
  return false;
}
