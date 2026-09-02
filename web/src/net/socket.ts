import Phaser from "phaser";
import { appendBattleLog, pushChat, useGame } from "../state/store";
import { loadDraftAppearance, saveAppearance } from "../characters/appearanceStorage";
import { appearanceFromWire } from "../characters/types";
import type { CharacterAppearanceWire } from "../characters/heroes99";
import type {
  ActionResult,
  BattleEndPayload,
  BattleEventPayload,
  BattleInfo,
  BattleStatePayload,
  BattleTickPayload,
  BattleEntity,
  ChatMessagePayload,
  Envelope,
  MessageType,
  PartyInvitePayload,
  BattleInvitePayload,
  SocialStatePayload,
  WelcomePayload,
  WorldNPC,
  WorldPlayer,
  WorldStatePayload,
} from "../types";
import { DEFAULT_BATTLE_SPEED } from "../phaser/battleAnim";
import {
  actionFromItem,
  actionFromSkill,
  firstConsumable,
  mainWeaponTypeFromProfile,
  skillTargetsAlly,
  skillWeaponMatches,
  type SelectedAction,
} from "../types";

export const battleEvents = new Phaser.Events.EventEmitter();

function livingEnemyTarget(battle: { entities: BattleEntity[] }, self: BattleEntity): BattleEntity | undefined {
  const focus =
    self.target_id &&
    battle.entities.find((e) => e.id === self.target_id && e.alive && !e.is_player);
  if (focus) return focus;
  return battle.entities.find((e) => !e.is_player && e.alive);
}

function castEnemySkill(actionId: string, battle: { entities: BattleEntity[] }, self: BattleEntity) {
  const target = livingEnemyTarget(battle, self);
  if (!target) return;
  send("action", { action_id: actionId, target_id: target.id });
  if (self.target_id !== target.id) {
    send("set_target", { target_id: target.id });
  }
  useGame.setState({ selectedAction: null });
}

let ws: WebSocket | null = null;
let intentionalClose = false;

export function disconnect() {
  intentionalClose = true;
  ws?.close();
  ws = null;
  useGame.setState({ connected: false });
}

function send(type: MessageType, payload?: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

export interface JoinWorldPayload {
  player_name: string;
  race?: string;
  main_job?: string;
  sub_job?: string;
  appearance?: CharacterAppearanceWire;
}

export const net = {
  connect(token: string, onReady?: () => void) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      useGame.setState({ connected: true, loginError: null });
      onReady?.();
    };
    ws.onmessage = (evt) => {
      try {
        handleMessage(JSON.parse(evt.data) as Envelope);
      } catch (err) {
        console.error("bad frame", err);
      }
    };
    ws.onclose = () => {
      const screen = useGame.getState().screen;
      const wasInGame = screen === "world" || screen === "battle";
      const intentional = intentionalClose;
      intentionalClose = false;
      if (wasInGame) {
        useGame.getState().reset();
        if (!intentional) {
          useGame.setState({ loginError: "Disconnected from server.", screen: "auth" });
        }
      } else {
        useGame.setState({ connected: false });
      }
      ws = null;
    };
    ws.onerror = () => {
      useGame.setState({ loginError: "Could not reach the server." });
    };
  },

  /** Join with an existing or newly created character. */
  enterWorld(payload: JoinWorldPayload) {
    const token = useGame.getState().authToken;
    if (!token) {
      useGame.setState({ loginError: "Not signed in." });
      return;
    }
    const join = () => send("join_world", payload);
    if (ws && ws.readyState === WebSocket.OPEN) {
      join();
      return;
    }
    net.connect(token, join);
  },

  /** @deprecated use enterWorld with player_name */
  enterExistingCharacter() {
    const { authToken, character } = useGame.getState();
    if (!authToken || !character) return;
    net.enterWorld({ player_name: character.name });
  },

  move(x: number, y: number) {
    send("move", { x, y });
  },
  chat(message: string) {
    send("chat", { message });
  },
  equip(itemId: string, slot?: string) {
    send("equip", { item_id: itemId, slot: slot ?? "" });
  },
  unequip(slot: string) {
    send("unequip", { slot });
  },
  setJobs(mainJob: string, subJob: string) {
    send("set_jobs", { main_job: mainJob, sub_job: subJob });
  },
  setHotbar(slot: string, kind: string, id: string) {
    send("set_hotbar", { slot, kind, id });
  },
  clearHotbar(slot: string) {
    send("set_hotbar", { slot, kind: "", id: "" });
  },
  joinBattle(battleId: string) {
    send("join_battle", { battle_id: battleId });
    useGame.setState({ battleInvite: null });
  },
  addFriend(playerName: string) {
    send("add_friend", { player_name: playerName });
  },
  removeFriend(playerName: string) {
    send("remove_friend", { player_name: playerName });
  },
  partyInvite(playerName: string) {
    send("party_invite", { player_name: playerName });
  },
  partyAccept() {
    send("party_accept");
    useGame.setState({ partyInvite: null });
  },
  partyDecline() {
    send("party_decline");
    useGame.setState({ partyInvite: null });
  },
  partyLeave() {
    send("party_leave");
  },
  partyKick(memberId: string) {
    send("party_kick", { member_id: memberId });
  },
  declineBattleInvite() {
    send("decline_battle_invite");
    useGame.setState({ battleInvite: null });
  },
  leaveBattle() {
    send("leave_battle");
    useGame.setState({ battle: null, screen: "world", selectedAction: null });
  },
  action(actionId: string, targetId: string, itemId?: string) {
    send("action", { action_id: actionId, target_id: targetId, item_id: itemId });
  },
  setTarget(targetId: string) {
    send("set_target", { target_id: targetId });
  },

  clickEntity(target: { id: string; alive: boolean; is_player: boolean }) {
    if (!target.alive) return;
    const { selectedAction } = useGame.getState();
    if (selectedAction) {
      this.castSelectedOn(target);
      return;
    }
    if (!target.is_player) this.setTarget(target.id);
  },

  castSelectedOn(target: { id: string; alive: boolean; is_player: boolean }): boolean {
    const { selectedAction, battle, selfId } = useGame.getState();
    if (!selectedAction || !target.alive) return false;
    const self = battle?.entities.find((e) => e.id === selfId);
    if (!isGcdReady(self)) return false;
    if (selectedAction.heals ? !target.is_player : target.is_player) return false;
    send("action", {
      action_id: selectedAction.actionId,
      target_id: target.id,
      item_id: selectedAction.itemId,
    });
    useGame.setState({ selectedAction: null });
    return true;
  },

  /** Arm an ally-target action; press the same hotbar key again to cast on self. */
  armOrSelfCast(action: SelectedAction, selfId: string) {
    const cur = useGame.getState().selectedAction;
    const same =
      cur?.actionId === action.actionId && (!action.itemId || cur.itemId === action.itemId);
    if (same) {
      send("action", {
        action_id: action.actionId,
        target_id: selfId,
        item_id: action.itemId,
      });
      useGame.setState({ selectedAction: null });
      return;
    }
    useGame.setState({ selectedAction: action });
  },

  /** Arm an enemy-target action; press the same hotbar key again to cancel. */
  toggleAction(action: SelectedAction) {
    const cur = useGame.getState().selectedAction;
    const same =
      cur?.actionId === action.actionId && (!action.itemId || cur.itemId === action.itemId);
    useGame.setState({ selectedAction: same ? null : action });
  },

  /** Pressing a hotbar key fires skills/items on the GCD (attack included). */
  activateHotbar(slot: string) {
    const { profile, selfId, screen, battle } = useGame.getState();
    if (!profile || screen !== "battle" || battle?.end) return;
    const bind = profile.hotbar?.[slot];
    if (!bind) return;
    const self = battle?.entities.find((e) => e.id === selfId);
    if (!self?.alive) return;

    if (!isGcdReady(self)) return;

    if (bind.kind === "skill") {
      const sk = profile.skills.find((s) => s.id === bind.id);
      if (!sk?.unlocked) return;
      if (!skillWeaponMatches(sk, profile)) return;
      if (self.mp < sk.mp_cost) return;
      if (skillTargetsAlly(sk)) {
        this.armOrSelfCast(actionFromSkill(sk), self.id);
      } else if (battle) {
        castEnemySkill(sk.id, battle, self);
      }
      return;
    }

    if (bind.kind === "item") {
      const item = firstConsumable(profile.inventory, bind.id);
      if (!item) return;
      this.armOrSelfCast(actionFromItem(item), self.id);
    }
  },

  bindToHotbar(kind: "skill" | "item", id: string) {
    const slot = useGame.getState().bindSlot;
    if (!slot) return;
    send("set_hotbar", { slot, kind, id });
    useGame.setState({ bindSlot: null });
  },

  useItemFromBag(itemId: string) {
    const { screen, selfId, battle, profile } = useGame.getState();
    const item = profile?.inventory.find((i) => i.id === itemId);
    if (!item) return;
    if (screen !== "battle" || !selfId || battle?.end) {
      pushChat("system", "Consumables are used during battle (hotbar 1–5).");
      return;
    }
    const self = battle?.entities.find((e) => e.id === selfId);
    if (!self?.alive) {
      useGame.setState({ selectedAction: actionFromItem(item) });
      return;
    }
    if ((self.skill_atb ?? self.atb) < 100) {
      useGame.setState({ selectedAction: actionFromItem(item) });
      return;
    }
    this.armOrSelfCast(actionFromItem(item), selfId);
  },

  disconnect,
};

function entityIsCasting(e: { casting_skill_id?: string } | undefined): boolean {
  return !!e?.casting_skill_id;
}

function isGcdReady(self: { alive: boolean; skill_atb?: number; atb?: number; casting_skill_id?: string } | undefined): boolean {
  return !!self?.alive && (self.skill_atb ?? self.atb ?? 0) >= 100 && !entityIsCasting(self);
}

function mergeEntityCast(
  e: import("../types").BattleEntity,
  u: Partial<import("../types").EntityUpdate>,
): import("../types").BattleEntity {
  const next = { ...e, ...u } as import("../types").BattleEntity;
  if (u.casting_skill_id === "") {
    next.casting_skill_id = undefined;
    next.cast_target_id = undefined;
    next.cast_progress = undefined;
    next.cast_time_ms = undefined;
  }
  return next;
}

function applyTickCast(
  e: import("../types").BattleEntity,
  p: import("../types").BattleTickPayload,
): import("../types").BattleEntity {
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

function handleMessage(env: Envelope) {
  const g = useGame;
  switch (env.type) {
    case "welcome": {
      const p = env.payload as WelcomePayload;
      const fromServer = appearanceFromWire(p.profile.appearance);
      const appearance = fromServer ?? loadDraftAppearance(p.profile.race ?? "hume");
      saveAppearance(p.player_id, appearance);
      const summary = {
        name: p.profile.name,
        race: p.profile.race ?? "",
        main_job: p.profile.main_job,
        sub_job: p.profile.sub_job,
      };
      g.setState((s) => {
        const exists = s.characters.some((c) => c.name === summary.name);
        const characters = exists ? s.characters : [...s.characters, summary];
        const selfWeapon = mainWeaponTypeFromProfile(p.profile);
        const selfWp = s.players[p.player_id];
        const players =
          selfWp && selfWeapon
            ? { ...s.players, [p.player_id]: { ...selfWp, weapon: selfWeapon } }
            : s.players;
        return {
          selfId: p.player_id,
          profile: p.profile,
          hasCharacter: true,
          characters,
          character: summary,
          screen: "world",
          loginError: null,
          players,
        };
      });
      break;
    }
    case "world_state": {
      const p = env.payload as WorldStatePayload;
      const players: Record<string, WorldPlayer> = {};
      for (const wp of p.players ?? []) players[wp.id] = wp;
      const npcs: Record<string, WorldNPC> = {};
      for (const n of p.npcs ?? []) npcs[n.id] = n;
      g.setState({
        players,
        npcs,
        battles: p.battles ?? [],
        overworld: p.map ?? g.getState().overworld,
      });
      break;
    }
    case "player_joined":
    case "player_sync": {
      const wp = env.payload as WorldPlayer;
      const already = !!g.getState().players[wp.id];
      g.setState((s) => ({ players: { ...s.players, [wp.id]: wp } }));
      if (env.type === "player_joined" && wp.id !== g.getState().selfId && !already) {
        pushChat("social", `${wp.name} has joined the world.`);
      }
      break;
    }
    case "player_left": {
      const { id } = env.payload as { id: string };
      const left = g.getState().players[id];
      g.setState((s) => {
        const players = { ...s.players };
        delete players[id];
        return { players };
      });
      if (left && id !== g.getState().selfId) {
        pushChat("social", `${left.name} has left the world.`);
      }
      break;
    }
    case "player_moved": {
      const p = env.payload as { id: string; x: number; y: number };
      if (p.id === g.getState().selfId) break;
      g.setState((s) => {
        const wp = s.players[p.id];
        if (!wp) return s;
        return { players: { ...s.players, [p.id]: { ...wp, x: p.x, y: p.y } } };
      });
      break;
    }
    case "npc_state": {
      const p = env.payload as { npcs: WorldNPC[] };
      const npcs: Record<string, WorldNPC> = {};
      for (const n of p.npcs ?? []) npcs[n.id] = n;
      g.setState({ npcs });
      break;
    }
    case "social_state": {
      const p = env.payload as SocialStatePayload;
      g.setState({
        friends: p.friends ?? [],
        party: p.party ?? null,
        partyInvite: p.pending_invite ?? null,
      });
      break;
    }
    case "party_invite_received": {
      const p = env.payload as PartyInvitePayload;
      g.setState({ partyInvite: p });
      pushChat("social", `${p.from_name} invited you to a party.`);
      break;
    }
    case "battle_invite_received": {
      const p = env.payload as BattleInvitePayload;
      g.setState({ battleInvite: p });
      pushChat("social", `${p.from_name} started a battle nearby — join from the prompt.`);
      break;
    }
    case "reward_notice": {
      const p = env.payload as { message: string };
      pushChat("system", p.message);
      break;
    }
    case "chat_message": {
      const p = env.payload as ChatMessagePayload;
      pushChat(p.channel ?? "general", p.message, { id: p.from_id, name: p.from_name });
      break;
    }
    case "battle_list": {
      const p = env.payload as { battles: BattleInfo[] };
      g.setState({ battles: p.battles ?? [] });
      break;
    }
    case "battle_state": {
      const p = env.payload as BattleStatePayload;
      const fresh = g.getState().battle?.battleId !== p.battle_id;
      const battleSpeed = p.battle_speed && p.battle_speed > 0 ? p.battle_speed : DEFAULT_BATTLE_SPEED;
      g.setState((s) => ({
        screen: "battle",
        chatTab: "battle",
        battle: {
          battleId: p.battle_id,
          entities: p.entities,
          battleSpeed,
          log: s.battle?.battleId === p.battle_id ? s.battle.log : ["Battle start!"],
          end: s.battle?.battleId === p.battle_id ? s.battle.end : null,
        },
      }));
      if (fresh) pushChat("battle", "Battle start!");
      break;
    }
    case "battle_event": {
      const p = env.payload as BattleEventPayload;
      for (const r of p.results ?? []) {
        appendBattleLog(describeResult(r));
        battleEvents.emit("result", r);
      }
      g.setState((s) => {
        if (!s.battle) return s;
        const byId = new Map(p.entities.map((u) => [u.id, u]));
        const entities = s.battle.entities.map((e) => {
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
        return { battle: { ...s.battle, entities } };
      });
      break;
    }
    case "battle_tick": {
      const p = env.payload as BattleTickPayload;
      g.setState((s) => {
        if (!s.battle) return s;
        const entities = s.battle.entities.map((e) => {
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
        });
        return { battle: { ...s.battle, entities } };
      });
      break;
    }
    case "battle_end": {
      const p = env.payload as BattleEndPayload;
      appendBattleLog(p.victory ? "Victory!" : "The party has fallen...");
      g.setState((s) => ({
        selectedAction: null,
        battle: s.battle ? { ...s.battle, end: p } : s.battle,
      }));
      break;
    }
    case "error": {
      const p = env.payload as { message: string };
      const screen = g.getState().screen;
      if (screen === "auth" || screen === "create" || screen === "select") {
        g.setState({ loginError: p.message });
        ws?.close();
      } else {
        pushChat("system", p.message);
      }
      break;
    }
  }
}
