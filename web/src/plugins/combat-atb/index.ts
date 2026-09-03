import { appendBattleLog, pushChat, useGame } from "../../state/store";
import { battleEvents } from "../../net/socket";
import { DEFAULT_BATTLE_SPEED } from "../../phaser/battleAnim";
import { initialBattleFocus, withBattleFocus } from "../../battle/activeBattle";
import type { PluginContext } from "../../core/plugins/contracts";
import type {
  ActionResult,
  BattleEndPayload,
  BattleEntity,
  BattleEventPayload,
  BattleTickPayload,
  BattleInvitePayload,
  BattleStatePayload,
  EntityUpdate,
} from "../../types";
import { BattleHUD } from "../../components/BattleHUD";
import { BattleScene } from "../../phaser/BattleScene";

function entityName(id: string): string {
  const b = useGame.getState().battle;
  return b?.entities.find((e) => e.id === id)?.name ?? id;
}

function describeResult(r: ActionResult): string {
  const actor = entityName(r.actor_id);
  if (!r.success) {
    return `${actor}'s ${r.action_name || r.action_id} fizzled: ${r.message ?? "failed"}`;
  }
  if (r.cast_started) {
    return `${actor} begins casting ${r.action_name}...`;
  }
  const target = entityName(r.target_id);
  const parts: string[] = [];
  if (r.heal) parts.push(`${target} recovered ${r.heal} HP`);
  if (r.mp_restored) parts.push(`${target} recovered ${r.mp_restored} MP`);
  if (r.damage) parts.push(`${target} took ${r.damage} damage`);
  if (r.status_applied?.length) {
    const names = r.status_applied.map((s) => s.kind.replace(/_/g, " "));
    parts.push(`${target} gained ${names.join(", ")}`);
  }
  if (parts.length === 0) return `${actor} used ${r.action_name}.`;
  return `${actor} used ${r.action_name} — ${parts.join(", ")}!`;
}

function mergeEntityCast(e: BattleEntity, u: Partial<EntityUpdate>): BattleEntity {
  const next = { ...e, ...u } as BattleEntity;
  if (u.casting_skill_id === "") {
    next.casting_skill_id = undefined;
    next.cast_target_id = undefined;
    next.cast_progress = undefined;
    next.cast_time_ms = undefined;
  }
  return next;
}

function applyTickCast(e: BattleEntity, p: BattleTickPayload): BattleEntity {
  const skillId = p.casting_skill_id?.[e.id];
  if (skillId !== undefined) {
    if (!skillId) {
      return { ...e, casting_skill_id: undefined, cast_target_id: undefined, cast_progress: undefined, cast_time_ms: undefined };
    }
    return {
      ...e,
      casting_skill_id: skillId,
      cast_target_id: p.cast_target_id?.[e.id],
      cast_progress: p.cast_progress?.[e.id] ?? e.cast_progress,
      cast_time_ms: p.cast_time_ms?.[e.id] ?? e.cast_time_ms,
    };
  }
  const progress = p.cast_progress?.[e.id];
  if (progress !== undefined && e.casting_skill_id) {
    return { ...e, cast_progress: progress };
  }
  return e;
}

const plugin = {
  id: "combat.atb",
  register(ctx: PluginContext) {
    ctx.registerScreen("battle", BattleHUD);
    ctx.registerBattleScene("battle", BattleScene);

    ctx.registerHandler("battle_invite_received", (env) => {
      const p = env.payload as BattleInvitePayload;
      useGame.setState({ battleInvite: p });
      pushChat("social", `${p.from_name} started a battle nearby — join from the prompt.`);
    });

    ctx.registerHandler("battle_state", (env) => {
      const p = env.payload as BattleStatePayload;
      const fresh = useGame.getState().battle?.battleId !== p.battle_id;
      const battleSpeed = p.battle_speed && p.battle_speed > 0 ? p.battle_speed : DEFAULT_BATTLE_SPEED;
      useGame.setState((s) => {
        const focus = fresh
          ? initialBattleFocus(p.entities, s.selfId)
          : (s.battleTargetId ?? initialBattleFocus(p.entities, s.selfId));
        return {
          screen: "battle" as const,
          chatTab: "battle" as const,
          battleTargetId: focus,
          battle: {
            battleId: p.battle_id,
            entities: withBattleFocus(p.entities, s.selfId, focus),
            battleSpeed,
            log: s.battle?.battleId === p.battle_id ? s.battle.log : ["Battle start!"],
            end: s.battle?.battleId === p.battle_id ? s.battle.end : null,
          },
        };
      });
      if (fresh) pushChat("battle", "Battle start!");
    });

    ctx.registerHandler("battle_event", (env) => {
      const p = env.payload as BattleEventPayload;
      for (const r of p.results ?? []) {
        appendBattleLog(describeResult(r));
        battleEvents.emit("result", r);
      }
      useGame.setState((s) => {
        if (!s.battle) return s;
        const byId = new Map(p.entities.map((u) => [u.id, u]));
        let entities = s.battle.entities.map((e) => {
          const u = byId.get(e.id);
          return u
            ? mergeEntityCast(e, {
                hp: u.hp,
                mp: u.mp,
                atb: u.skill_atb ?? u.atb,
                skill_atb: u.skill_atb ?? u.atb,
                target_id: u.target_id ?? e.target_id,
                alive: u.alive,
                statuses: u.statuses ?? e.statuses,
                casting_skill_id: u.casting_skill_id,
                cast_target_id: u.cast_target_id,
                cast_progress: u.cast_progress,
                cast_time_ms: u.cast_time_ms,
              })
            : e;
        });
        for (const r of p.results ?? []) {
          if (r.success && !r.cast_started) {
            const idx = entities.findIndex((e) => e.id === r.actor_id);
            if (idx >= 0 && entities[idx].casting_skill_id) {
              entities[idx] = {
                ...entities[idx],
                casting_skill_id: undefined,
                cast_target_id: undefined,
                cast_progress: undefined,
                cast_time_ms: undefined,
              };
            }
          }
        }
        entities = withBattleFocus(entities, s.selfId, s.battleTargetId);
        return { battle: { ...s.battle, entities } };
      });
    });

    ctx.registerHandler("battle_tick", (env) => {
      const p = env.payload as BattleTickPayload;
      useGame.setState((s) => {
        if (!s.battle) return s;
        const entities = withBattleFocus(
          s.battle.entities.map((e) => {
            const skill = p.skill_atb?.[e.id] ?? p.atb?.[e.id];
            const hp = p.hp?.[e.id];
            const alive = p.alive?.[e.id];
            const statuses = p.statuses?.[e.id];
            let next = {
              ...e,
              ...(skill !== undefined ? { atb: skill, skill_atb: skill } : {}),
              ...(hp !== undefined ? { hp } : {}),
              ...(alive !== undefined ? { alive } : {}),
              ...(statuses !== undefined ? { statuses } : {}),
            };
            next = applyTickCast(next, p);
            return next;
          }),
          s.selfId,
          s.battleTargetId,
        );
        return { battle: { ...s.battle, entities } };
      });
    });

    ctx.registerHandler("battle_end", (env) => {
      const p = env.payload as BattleEndPayload;
      appendBattleLog(p.victory ? "Victory!" : "The party has fallen...");
      useGame.setState((s) => ({
        selectedAction: null,
        battleTargetId: null,
        battle: s.battle ? { ...s.battle, end: p } : s.battle,
      }));
    });
  },
};

export default plugin;
