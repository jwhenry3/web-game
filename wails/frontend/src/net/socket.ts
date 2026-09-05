import { pushChat, useGame } from "../state/store";
import { pluginHost, applyMapSnapshot } from "../core/plugins/pluginHost";
import { fetchAtlas } from "./atlas";
import { applyMapSnapshotToGame, prefetchMapConfig, defaultMapId } from "./mapConfig";
import { loadDraftAppearance, saveAppearance } from "../characters/appearanceStorage";
import { appearanceFromWire } from "../characters/types";
import type { CharacterAppearanceWire } from "../characters/heroes99";
import { clearHousePlace } from "../world/housePlaceBridge";
import {
  getGameTransport,
  setTransportHandlers,
  transportConnect,
  transportDisconnect,
  transportIsOpen,
  transportSend,
} from "./transport";
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
  MapConfigPayload,
  SavePoint,
  JobChanger,
  WorldNPC,
  WorldPlayer,
  WorldStatePayload,
  WorldCamp,
  WorldPet,
  HouseStatePayload,
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

function livingEnemyTarget(battle: { entities: BattleEntity[] }, self: BattleEntity): BattleEntity | undefined {
  const focusId = useGame.getState().battleTargetId ?? self.target_id;
  const focus =
    focusId &&
    battle.entities.find((e) => e.id === focusId && e.alive && !e.is_player && !e.is_ally);
  if (focus) return focus;
  return battle.entities.find((e) => !e.is_player && !e.is_ally && e.alive);
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

function patchSelfTarget(
  entities: BattleEntity[],
  selfId: string,
  targetId: string,
): BattleEntity[] {
  return entities.map((e) => (e.id === selfId ? { ...e, target_id: targetId } : e));
}

function castEnemySkill(actionId: string, entities: BattleEntity[], self: BattleEntity) {
  const target = livingEnemyTarget({ entities }, self);
  if (!target) return;
  send("action", { action_id: actionId, target_id: target.id });
  const focusId = useGame.getState().battleTargetId ?? self.target_id;
  if (focusId !== target.id) {
    send("set_target", { target_id: target.id });
  }
  useGame.setState((s) => {
    if (!s.selfId) return { selectedAction: null, battleTargetId: target.id };
    return {
      selectedAction: null,
      battleTargetId: target.id,
      ...(s.battle
        ? { battle: { ...s.battle, entities: patchSelfTarget(s.battle.entities, s.selfId, target.id) } }
        : {}),
      ...(s.rtBattle
        ? {
            rtBattle: {
              ...s.rtBattle,
              entities: s.rtBattle.entities.map((e) =>
                e.id === s.selfId ? { ...e, target_id: target.id } : e,
              ),
            },
          }
        : {}),
    };
  });
}

let ws: WebSocket | null = null;
let intentionalClose = false;

function send(type: MessageType, payload?: unknown) {
  if (getGameTransport()) {
    transportSend(type, payload);
    return;
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

(window as unknown as { __gameSocketSend?: typeof send }).__gameSocketSend = send;

function bindTransportHandlers() {
  setTransportHandlers({
    onOpen: () => {
      useGame.setState({ connected: true, loginError: null });
    },
    onMessage: (env) => handleMessage(env),
    onClose: (intentional) => {
      const screen = useGame.getState().screen;
      const wasInGame = screen === "world" || screen === "battle";
      if (wasInGame) {
        useGame.getState().reset();
        if (!intentional) {
          useGame.setState({ loginError: "Disconnected from server.", screen: "auth" });
        }
      } else {
        useGame.setState({ connected: false });
      }
    },
    onError: (message) => {
      useGame.setState({ loginError: message });
    },
  });
}

bindTransportHandlers();

export interface JoinWorldPayload {
  player_name: string;
  race?: string;
  main_job?: string;
  sub_job?: string;
  appearance?: CharacterAppearanceWire;
}

export const net = {
  connect(token: string, onReady?: () => void) {
    if (getGameTransport()) {
      transportConnect(token, () => {
        useGame.setState({ connected: true, loginError: null });
        onReady?.();
      });
      return;
    }
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
    void prefetchMapConfig(defaultMapId());
    const join = () => send("join_world", payload);
    if (getGameTransport() ? transportIsOpen() : ws && ws.readyState === WebSocket.OPEN) {
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

  move(x: number, y: number, facing?: number) {
    send("move", facing !== undefined ? { x, y, facing } : { x, y });
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
  setJobs(mainJob: string, subJob: string, jobChangerId?: string) {
    send("set_jobs", {
      main_job: mainJob,
      sub_job: subJob,
      job_changer_id: jobChangerId ?? "",
    });
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
    // Optimistically leave the battle UI; server leave unlocks InBattle and
    // player_sync confirms. If the server rejects/misses leave, world movement
    // stays locked until a sync arrives — see handleLeaveBattle on the hub.
    useGame.setState({
      battle: null,
      rtBattle: null,
      battleTargetId: null,
      screen: "world",
      selectedAction: null,
    });
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
    useGame.setState((s) => {
      if (!s.selfId) return { battleTargetId: targetId };
      return {
        battleTargetId: targetId,
        ...(s.battle
          ? { battle: { ...s.battle, entities: patchSelfTarget(s.battle.entities, s.selfId, targetId) } }
          : {}),
        ...(s.rtBattle
          ? {
              rtBattle: {
                ...s.rtBattle,
                entities: s.rtBattle.entities.map((e) =>
                  e.id === s.selfId ? { ...e, target_id: targetId } : e,
                ),
              },
            }
          : {}),
      };
    });
  },

  /** Arrow targeting: left/right cycle enemies, up/down cycle living party members. */
  cycleBattleTarget(axis: "horizontal" | "vertical", dir: 1 | -1) {
    const ctx = battleContext();
    if (!ctx || ctx.ended) return;
    const { self, entities } = ctx;
    const focusId = useGame.getState().battleTargetId ?? self.target_id;
    const pool =
      axis === "horizontal"
        ? entities.filter((e) => !e.is_player && !e.is_ally && e.alive)
        : entities.filter((e) => (e.is_player || e.is_ally) && e.alive);
    if (pool.length === 0) return;
    let idx = pool.findIndex((e) => e.id === focusId);
    if (idx < 0) {
      idx = dir > 0 ? -1 : 0;
    }
    const next = pool[(idx + dir + pool.length) % pool.length];
    if (next) this.setTarget(next.id);
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
    const fieldSkill = sk.world_only || skillId === "return" || skillId === "port" || skillId === "camp";
    if (!fieldSkill) return;
    if (skillId === "port") {
      openWorldSkillDialog("port");
      return;
    }
    if (skillId === "return") {
      openWorldSkillDialog("return");
      return;
    }
    useGame.setState({ openWindow: null, bindSlot: null });
    this.useWorldSkill(skillId);
  },
  enterHouse(ownerName: string) {
    send("enter_house", { owner_name: ownerName });
  },
  leaveHouse() {
    send("leave_house");
  },
  houseInteract(target: "door" | "storage") {
    send("house_interact", { target });
    if (target === "storage") {
      useGame.setState({ openWindow: "house_storage" });
    }
  },
  houseStorageDeposit(itemId: string, qty = 1) {
    send("house_storage_deposit", { item_id: itemId, qty });
  },
  houseStorageWithdraw(itemId: string, qty = 1) {
    send("house_storage_withdraw", { item_id: itemId, qty });
  },
  housePlaceFurniture(itemId: string, col: number, row: number) {
    send("house_place_furniture", { item_id: itemId, col, row });
  },
  housePickFurniture(furnitureId: string) {
    send("house_pick_furniture", { furniture_id: furnitureId });
  },
  setCampSkin(skin: string) {
    send("set_camp_skin", { skin });
  },
  petSetFollow(petId: string) {
    send("pet_set_follow", { pet_id: petId });
  },
  petSetBattle(petId: string) {
    send("pet_set_battle", { pet_id: petId });
  },
  petRelease(petId: string) {
    send("pet_release", { pet_id: petId });
  },
  capture(targetId: string) {
    send("action", { action_id: "capture", target_id: targetId });
  },
  petAction(petId: string, actionId: string, targetId: string, itemId?: string) {
    send("action", { action_id: actionId, target_id: targetId, item_id: itemId, actor_id: petId });
  },

  clickEntity(target: { id: string; alive: boolean; is_player: boolean; is_ally?: boolean }) {
    if (!target.alive) return;
    const { selectedAction } = useGame.getState();
    if (selectedAction) {
      this.castSelectedOn(target);
      return;
    }
    if (!target.is_player && !target.is_ally) this.setTarget(target.id);
  },

  castSelectedOn(target: { id: string; alive: boolean; is_player: boolean; is_ally?: boolean }): boolean {
    const { selectedAction, commandPetId } = useGame.getState();
    const ctx = battleContext();
    if (!selectedAction || !target.alive || !ctx) return false;
    const { self } = ctx;
    if (!commandPetId && !isGcdReady(self)) return false;
    const friendly = !!target.is_player || !!target.is_ally;
    if (selectedAction.heals ? !friendly : friendly) return false;
    if (commandPetId) {
      send("action", {
        action_id: selectedAction.actionId,
        target_id: target.id,
        item_id: selectedAction.itemId,
        actor_id: commandPetId,
      });
      useGame.setState({ selectedAction: null, commandPetId: null });
      return true;
    }
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
    if (entityIsCasting(self)) {
      pushChat("battle", "Already casting.");
      return;
    }
    if ((self.skill_atb ?? self.atb ?? 0) < 100) {
      pushChat("battle", "Ability not ready yet.");
      return;
    }

    if (bind.kind === "skill") {
      const sk = profile.skills.find((s) => s.id === bind.id);
      if (!sk?.unlocked) return;
      if (!skillWeaponMatches(sk, profile)) return;
      if (self.mp < sk.mp_cost) {
        pushChat("battle", "Not enough MP.");
        return;
      }
      if (skillTargetsAlly(sk)) {
        this.armOrSelfCast(actionFromSkill(sk), self.id);
      } else if (sk.id === "capture" && !livingEnemyTarget({ entities }, self)) {
        this.toggleAction(actionFromSkill(sk));
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

  disconnect() {
    if (getGameTransport()) {
      transportDisconnect();
      useGame.setState({ connected: false });
      return;
    }
    intentionalClose = true;
    ws?.close();
    ws = null;
    useGame.setState({ connected: false });
  },
};

function entityIsCasting(e: { casting_skill_id?: string } | undefined): boolean {
  return !!e?.casting_skill_id;
}

function isGcdReady(self: { alive: boolean; skill_atb?: number; atb?: number; casting_skill_id?: string } | undefined): boolean {
  return !!self?.alive && (self.skill_atb ?? self.atb ?? 0) >= 100 && !entityIsCasting(self);
}

export function handleMessage(env: Envelope) {
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
        const appearance = fromServer ?? loadDraftAppearance(p.profile.race ?? "humanus");
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
          // Profile refreshes (equip, house furniture, storage) also send welcome.
          // Do not yank the player out of battle/house/world mid-session.
          const screen =
            s.screen === "battle" || s.screen === "house" || s.screen === "world"
              ? s.screen
              : "world";
          return {
            selfId: p.player_id,
            profile: p.profile,
            hasCharacter: true,
            characters,
            character: summary,
            screen,
            loginError: null,
            players,
          };
        });
        if (p.map) applyMapSnapshotToGame(p.map);
        fetchAtlas()
          .then((atlas) => useGame.setState({ atlas: atlas.maps ?? [] }))
          .catch(() => {});
      })();
      break;
    }
    case "battle_return": {
      g.setState({
        battle: null,
        rtBattle: null,
        battleTargetId: null,
        commandPetId: null,
        screen: "world",
        selectedAction: null,
        chatTab: "general",
      });
      break;
    }
    case "map_config": {
      const p = env.payload as MapConfigPayload;
      if (p.map) applyMapSnapshotToGame(p.map);
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
      const jobChangers: Record<string, JobChanger> = {};
      for (const jc of p.job_changers ?? []) jobChangers[jc.id] = jc;
      const camps: Record<string, WorldCamp> = {};
      for (const camp of p.camps ?? []) camps[camp.owner_name] = camp;
      const pets: Record<string, WorldPet> = {};
      for (const pet of p.pets ?? []) pets[pet.id] = pet;
      g.setState({
        players,
        npcs,
        savePoints,
        jobChangers,
        camps,
        pets,
        battles: p.battles ?? [],
        overworld: p.map ?? g.getState().overworld,
      });
      break;
    }
    case "camp_state": {
      const p = env.payload as { camps: WorldCamp[] };
      const camps: Record<string, WorldCamp> = {};
      for (const camp of p.camps ?? []) camps[camp.owner_name] = camp;
      g.setState({ camps });
      break;
    }
    case "house_state": {
      const house = env.payload as HouseStatePayload;
      g.setState((s) => ({
        screen: "house" as const,
        house,
        // Don't clobber open panels on movement sync broadcasts.
        openWindow: s.screen === "house" ? s.openWindow : null,
        bindSlot: s.screen === "house" ? s.bindSlot : null,
      }));
      break;
    }
    case "house_return": {
      clearHousePlace();
      g.setState({ screen: "world", house: null, openWindow: null });
      break;
    }
    case "player_sync": {
      const wp = env.payload as WorldPlayer;
      g.setState((s) => {
        const players = { ...s.players, [wp.id]: wp };
        // If we left combat on the server, drop any stale battle UI (e.g. end
        // modal) so the world is interactive again.
        if (wp.id === s.selfId && !wp.in_battle && s.screen === "battle") {
          return {
            players,
            screen: "world",
            battle: null,
            rtBattle: null,
            battleTargetId: null,
            selectedAction: null,
          };
        }
        return { players };
      });
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
      const p = env.payload as { id: string; x: number; y: number; facing?: number | string };
      g.setState((s) => {
        const wp = s.players[p.id];
        if (!wp) return s;
        return {
          players: {
            ...s.players,
            [p.id]: {
              ...wp,
              x: p.x,
              y: p.y,
              ...(p.facing !== undefined ? { facing: p.facing } : {}),
            },
          },
        };
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
        if (getGameTransport()) {
          transportDisconnect();
        } else {
          ws?.close();
        }
      } else {
        pushChat("system", p.message);
      }
      break;
    }
  }
}
