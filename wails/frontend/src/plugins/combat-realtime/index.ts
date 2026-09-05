import { pushChat, useGame } from "../../state/store";
import { battleEvents } from "../../net/socket";
import { initialBattleFocus, withBattleFocus } from "../../battle/activeBattle";
import type { PluginContext } from "../../core/plugins/contracts";
import type {
  BattleInvitePayload,
  ChatTone,
  Envelope,
  RTBattleEndPayload,
  RTBattleEventPayload,
  RTBattleStatePayload,
  RTBattleTickPayload,
} from "../../types";
import { BattleHUD } from "../../components/BattleHUD";
import { RTBattleScene } from "./RTBattleScene";

function toneForRTEvent(p: RTBattleEventPayload): ChatTone {
  if (p.success === false || p.cast_cancelled) return "fail";
  if (p.action_id === "capture") return "capture";
  if (p.cast_started) return "cast";
  if (p.heal || p.mp_restored) return "heal";
  if (p.damage) return "damage";
  if (p.action_name || p.action_id) return "skill";
  return "plain";
}

const plugin = {
  id: "combat.realtime",
  register(ctx: PluginContext) {
    ctx.registerScreen("battle", BattleHUD);
    // Phaser battle scene unused while Three.js BattleView is active.
    ctx.registerBattleScene("battle", RTBattleScene);

    ctx.registerHandler("battle_invite_received", (env) => {
      const p = env.payload as BattleInvitePayload;
      useGame.setState({ battleInvite: p });
      pushChat("social", `${p.from_name} started a battle nearby — join from the prompt.`);
    });

    ctx.registerHandler("rt_battle_state", (env) => {
      const p = env.payload as RTBattleStatePayload;
      useGame.setState((s) => {
        const focus = initialBattleFocus(p.entities, s.selfId);
        return {
          screen: "battle" as const,
          chatTab: "battle" as const,
          battleTargetId: focus,
          rtBattle: {
            battleId: p.battle_id,
            entities: withBattleFocus(p.entities, s.selfId, focus),
            end: null,
          },
          battle: null,
        };
      });
      pushChat("battle", "Realtime battle start!", undefined, "skill");
    });

    ctx.registerHandler("rt_battle_tick", (env) => {
      const p = env.payload as RTBattleTickPayload;
      useGame.setState((s) =>
        s.rtBattle
          ? {
              rtBattle: {
                ...s.rtBattle,
                entities: withBattleFocus(p.entities, s.selfId, s.battleTargetId),
              },
            }
          : s,
      );
    });

    ctx.registerHandler("rt_battle_event", (env) => {
      const p = env.payload as RTBattleEventPayload;
      if (p.message) pushChat("battle", p.message, undefined, toneForRTEvent(p));
      battleEvents.emit("rt_event", p);
      useGame.setState((s) =>
        s.rtBattle
          ? {
              rtBattle: {
                ...s.rtBattle,
                entities: withBattleFocus(p.entities, s.selfId, s.battleTargetId),
              },
            }
          : s,
      );
    });

    ctx.registerHandler("rt_battle_end", (env) => {
      const p: RTBattleEndPayload = {
        victory: false,
        rewards: [],
        ...(env.payload as RTBattleEndPayload | null | undefined),
      };
      useGame.setState((s) => ({
        selectedAction: null,
        battleTargetId: null,
        rtBattle: s.rtBattle ? { ...s.rtBattle, end: p } : s.rtBattle,
      }));
      pushChat("battle", p.victory ? "Victory!" : "Defeat...", undefined, p.victory ? "victory" : "defeat");
    });

    // ATB messages ignored when realtime is active
    const noop = (_env: Envelope) => {};
    ctx.registerHandler("battle_state", noop);
    ctx.registerHandler("battle_event", noop);
    ctx.registerHandler("battle_tick", noop);
    ctx.registerHandler("battle_end", noop);
  },
};

export default plugin;
