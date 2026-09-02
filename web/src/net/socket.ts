import Phaser from "phaser";
import { pushChat, useGame } from "../state/store";
import { pluginHost, applyMapSnapshot } from "../core/plugins/pluginHost";
import { fetchAtlas } from "./atlas";
import { loadDraftAppearance, saveAppearance } from "../characters/appearanceStorage";
import { appearanceFromWire } from "../characters/types";
import type { CharacterAppearanceWire } from "../characters/heroes99";
import type {
  BattleInfo,
  BattleEntity,
  ChatMessagePayload,
  Envelope,
  MessageType,
  PartyInvitePayload,
  FriendRequestPayload,
  SocialStatePayload,
  WelcomePayload,
  SavePoint,
  WorldNPC,
  WorldPlayer,
  WorldStatePayload,
  SelectedAction,
} from "../types";
import {
  actionFromItem,
  actionFromSkill,
  firstConsumable,
  mainWeaponTypeFromProfile,
  skillTargetsAlly,
  skillWeaponMatches,
} from "../types";
import { activeBattleView } from "../battle/activeBattle";

export const battleEvents = new Phaser.Events.EventEmitter();

function livingEnemyTarget(battle: { entities: BattleEntity[] }, self: BattleEntity): BattleEntity | undefined {
  const focus =
    self.target_id &&
    battle.entities.find((e) => e.id === self.target_id && e.alive && !e.is_player);
  if (focus) return focus;
  return battle.entities.find((e) => !e.is_player && e.alive);
}

function battleContext(): { self: BattleEntity; entities: BattleEntity[]; ended: boolean } | null {
  const { battle, rtBattle, selfId, screen } = useGame.getState();
  if (screen !== "battle" || !selfId) return null;
  const view = activeBattleView(battle, rtBattle);
  if (!view) return null;
  const self = view.entities.find((e) => e.id === selfId);
  if (!self) return null;
  return { self, entities: view.entities, ended: !!view.end };
}

function castEnemySkill(actionId: string, entities: BattleEntity[], self: BattleEntity) {
  const target = livingEnemyTarget({ entities }, self);
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

(window as unknown as { __gameSocketSend?: typeof send }).__gameSocketSend = send;

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
  setKeybinds(keybinds: Record<string, string>) {
    send("set_keybinds", { keybinds });
  },
  joinBattle(battleId: string) {
    send("join_battle", { battle_id: battleId });
    useGame.setState({ battleInvite: null });
  },
  addFriend(playerName: string) {
    send("add_friend", { player_name: playerName });
  },
  acceptFriend(playerName: string) {
    send("accept_friend", { player_name: playerName });
  },
  declineFriend(playerName: string) {
    send("decline_friend", { player_name: playerName });
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
    useGame.setState({ battle: null, rtBattle: null, screen: "world", selectedAction: null });
  },
  rtMove(x: number, y: number) {
    send("rt_move", { x, y });
  },
  rtAttack(facingX: number, facingY: number) {
    send("rt_attack", { facing_x: facingX, facing_y: facingY });
  },
  action(actionId: string, targetId: string, itemId?: string) {
    send("action", { action_id: actionId, target_id: targetId, item_id: itemId });
  },
  setTarget(targetId: string) {
    send("set_target", { target_id: targetId });
  },
  setSavePoint(savePointId: string) {
    send("set_save_point", { save_point_id: savePointId });
  },
  useWorldSkill(skillId: string, savePointId?: string) {
    send("use_world_skill", { skill_id: skillId, save_point_id: savePointId });
    useGame.getState().closeWorldSkillDialog();
  },
  activateWorldSkill(skillId: string) {
    const { profile, screen, openWorldSkillDialog } = useGame.getState();
    if (!profile) return;
    if (screen !== "world") {
      pushChat("system", "That can only be used in the field.");
      return;
    }
    const sk = profile.skills.find((s) => s.id === skillId);
    if (!sk?.unlocked) return;
    const fieldSkill = sk.world_only || skillId === "return" || skillId === "teleport";
    if (!fieldSkill) return;
    if (skillId === "teleport") {
      openWorldSkillDialog("teleport");
      return;
    }
    if (skillId === "return") {
      openWorldSkillDialog("return");
      return;
    }
    useGame.setState({ openWindow: null, bindSlot: null });
    this.useWorldSkill(skillId);
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
    const { selectedAction } = useGame.getState();
    const ctx = battleContext();
    if (!selectedAction || !target.alive || !ctx) return false;
    const { self } = ctx;
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
    const { profile, screen } = useGame.getState();
    const bind = profile?.hotbar?.[slot];
    if (!profile || !bind) return;

    if (screen === "world" && bind.kind === "skill") {
      this.activateWorldSkill(bind.id);
      return;
    }

    const ctx = battleContext();
    if (screen !== "battle" || !ctx || ctx.ended) return;
    const { self, entities } = ctx;
    if (!self.alive) return;
    if (!isGcdReady(self)) return;

    if (bind.kind === "skill") {
      const sk = profile.skills.find((s) => s.id === bind.id);
      if (!sk?.unlocked) return;
      if (!skillWeaponMatches(sk, profile)) return;
      if (self.mp < sk.mp_cost) return;
      if (skillTargetsAlly(sk)) {
        this.armOrSelfCast(actionFromSkill(sk), self.id);
      } else {
        castEnemySkill(sk.id, entities, self);
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
    const { screen, selfId, profile } = useGame.getState();
    const ctx = battleContext();
    const item = profile?.inventory.find((i) => i.id === itemId);
    if (!item) return;
    if (screen !== "battle" || !selfId || !ctx || ctx.ended) {
      pushChat("system", "Consumables are used during battle (assign to hotbar).");
      return;
    }
    const { self } = ctx;
    if (!self.alive) {
      useGame.setState({ selectedAction: actionFromItem(item) });
      return;
    }
    if (!isGcdReady(self)) {
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

function handleMessage(env: Envelope) {
  if (pluginHost.dispatch(env)) return;
  const g = useGame;
  switch (env.type) {
    case "welcome": {
      const p = env.payload as WelcomePayload;
      void (async () => {
        if (p.map?.modules?.length && p.map.combat) {
          try {
            await applyMapSnapshot(p.map);
          } catch (err) {
            console.error("failed to load map modules", err);
          }
        }
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
          const screen = s.screen === "battle" ? "battle" : "world";
          return {
            selfId: p.player_id,
            profile: p.profile,
            hasCharacter: true,
            characters,
            character: summary,
            screen,
            loginError: null,
            players,
            mapInfo: p.map
              ? {
                  id: p.map.id,
                  name: p.map.name,
                  combat: p.map.combat,
                  capabilities: p.map.capabilities ?? [],
                  portals: p.map.portals ?? [],
                }
              : s.mapInfo,
            overworld: p.map?.overworld ?? s.overworld,
          };
        });
        fetchAtlas()
          .then((atlas) => useGame.setState({ atlas: atlas.maps ?? [] }))
          .catch(() => {});
      })();
      break;
    }
    case "world_state": {
      const p = env.payload as WorldStatePayload;
      const players: Record<string, WorldPlayer> = {};
      for (const wp of p.players ?? []) players[wp.id] = wp;
      const npcs: Record<string, WorldNPC> = {};
      for (const n of p.npcs ?? []) npcs[n.id] = n;
      const savePoints: Record<string, SavePoint> = {};
      for (const sp of p.save_points ?? []) savePoints[sp.id] = sp;
      g.setState({
        players,
        npcs,
        savePoints,
        battles: p.battles ?? [],
        overworld: p.map ?? g.getState().overworld,
      });
      break;
    }
    case "player_sync": {
      const wp = env.payload as WorldPlayer;
      g.setState((s) => ({ players: { ...s.players, [wp.id]: wp } }));
      break;
    }
    case "player_joined": {
      const wp = env.payload as WorldPlayer;
      const already = !!g.getState().players[wp.id];
      g.setState((s) => ({ players: { ...s.players, [wp.id]: wp } }));
      if (wp.id !== g.getState().selfId && !already) {
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
        friendRequests: p.pending_friend_requests ?? [],
        outgoingFriendRequests: p.outgoing_friend_requests ?? [],
        party: p.party ?? null,
        partyInvite: p.pending_invite ?? null,
      });
      break;
    }
    case "friend_request_received": {
      const p = env.payload as FriendRequestPayload;
      g.setState((s) => {
        const exists = s.friendRequests.some((r) => r.from_name.toLowerCase() === p.from_name.toLowerCase());
        if (exists) return s;
        return { friendRequests: [...s.friendRequests, p] };
      });
      pushChat("social", `${p.from_name} sent you a friend request.`);
      break;
    }
    case "party_invite_received": {
      const p = env.payload as PartyInvitePayload;
      g.setState({ partyInvite: p });
      pushChat("social", `${p.from_name} invited you to a party.`);
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
