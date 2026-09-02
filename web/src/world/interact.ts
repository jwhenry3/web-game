import { net } from "../net/socket";
import { pushChat, useGame } from "../state/store";

const SAVE_POINT_RANGE = 80;
const INTERACT_RANGE = 80;

export function tryWorldInteract(): boolean {
  const state = useGame.getState();
  if (state.screen !== "world" || !state.selfId) return false;
  if (state.mainMenuOpen || state.openWindow || state.worldSkillDialog) return false;

  const self = state.players[state.selfId];
  if (!self || self.in_battle) return false;

  const x = self.x;
  const y = self.y;

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
    const info = state.battles.find((b) => b.battle_id === npc.battle_id);
    if (info && info.participants >= info.max_players) continue;
    net.joinBattle(npc.battle_id);
    return true;
  }

  for (const p of Object.values(state.players)) {
    if (p.id === state.selfId || !p.in_battle || !p.battle_id) continue;
    if (Math.hypot(x - p.x, y - p.y) > INTERACT_RANGE) continue;
    const info = state.battles.find((b) => b.battle_id === p.battle_id);
    if (info && info.participants >= info.max_players) continue;
    net.joinBattle(p.battle_id);
    return true;
  }

  pushChat("system", "Nothing to interact with nearby.");
  return false;
}
