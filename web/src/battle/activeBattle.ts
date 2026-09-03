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

/** Keep the local player's focus target across server entity snapshots. */
export function withBattleFocus<T extends { id: string; target_id?: string }>(
  entities: T[],
  selfId: string | null | undefined,
  focusId: string | null | undefined,
): T[] {
  if (!selfId || !focusId) return entities;
  return entities.map((e) => (e.id === selfId ? { ...e, target_id: focusId } : e));
}

/** Initial focus from a battle snapshot (first living enemy / existing target). */
export function initialBattleFocus(
  entities: { id: string; is_player?: boolean; alive?: boolean; target_id?: string }[],
  selfId: string | null | undefined,
): string | null {
  const self = selfId ? entities.find((e) => e.id === selfId) : undefined;
  if (self?.target_id) return self.target_id;
  const enemy = entities.find((e) => !e.is_player && e.alive);
  return enemy?.id ?? null;
}
