import type { BattleEntity, RTBattleEntity, RTBattleView } from "../types";
import type { BattleView } from "../state/store";

export function rtEntityToBattle(e: RTBattleEntity): BattleEntity {
  return {
    id: e.id,
    name: e.name,
    kind: e.kind,
    is_player: e.is_player,
    hp: e.hp,
    max_hp: e.max_hp,
    mp: e.mp ?? 0,
    max_mp: e.max_mp ?? 0,
    skill_atb: e.skill_atb ?? 100,
    atb: e.skill_atb ?? 100,
    target_id: e.target_id,
    alive: e.alive,
    statuses: e.statuses,
    casting_skill_id: e.casting_skill_id,
    cast_target_id: e.cast_target_id,
    cast_progress: e.cast_progress,
    cast_time_ms: e.cast_time_ms,
    level: 1,
    agility: 0,
  };
}

export function rtBattleToView(rt: RTBattleView): BattleView {
  return {
    battleId: rt.battleId,
    entities: rt.entities.map(rtEntityToBattle),
    battleSpeed: 0.75,
    log: [],
    end: rt.end,
  };
}

export function activeBattleView(
  battle: BattleView | null,
  rtBattle: RTBattleView | null,
): BattleView | null {
  if (battle) return battle;
  if (rtBattle) return rtBattleToView(rtBattle);
  return null;
}
