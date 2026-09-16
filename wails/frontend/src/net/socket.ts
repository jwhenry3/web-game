import { applyCombatEvent, applyCombatTick, pushChat, useGame } from "../state/store";
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
  ChatMessagePayload,
  CombatEntity,
  CombatEventPayload,
  CombatTickPayload,
  Envelope,
  MessageType,
  PartyInvitePayload,
  FriendRequestPayload,
  RewardNoticePayload,
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
/** All combat entities currently visible to this client (AoI-scoped). */
function combatEntityList(): CombatEntity[] {
  return Object.values(useGame.getState().combatEntities);
}

/** The local player's combat entity, if the server is tracking one. */
function selfCombatEntity(): CombatEntity | undefined {
  const { combatEntities, selfId } = useGame.getState();
  return selfId ? combatEntities[selfId] : undefined;
}

/** The local player's current focus target (combat entity, else world player sync). */
function selfTargetId(): string | undefined {
  const { combatEntities, players, selfId } = useGame.getState();
  if (!selfId) return undefined;
  return combatEntities[selfId]?.target_id ?? players[selfId]?.target_id;
}

/** Optimistically reflect a new focus target on the local player replicas. */
function patchSelfTargetId(targetId: string) {
  useGame.setState((s) => {
    if (!s.selfId) return s;
    const wp = s.players[s.selfId];
    const ce = s.combatEntities[s.selfId];
    return {
      ...(wp ? { players: { ...s.players, [s.selfId]: { ...wp, target_id: targetId } } } : {}),
      ...(ce
        ? { combatEntities: { ...s.combatEntities, [s.selfId]: { ...ce, target_id: targetId } } }
        : {}),
    };
  });
}

function livingEnemyTarget(self: CombatEntity): CombatEntity | undefined {
  const entities = combatEntityList();
  const focusId = selfTargetId() ?? self.target_id;
  const focus =
    focusId && entities.find((e) => e.id === focusId && e.alive && !e.is_player && !e.is_ally);
  if (focus) return focus;
  return entities.find((e) => !e.is_player && !e.is_ally && e.alive);
}

/** Enemy to focus when the current focus is missing, dead, or not an enemy; undefined if focus is already viable. */
function nextViableEnemy(self: CombatEntity): CombatEntity | undefined {
  const entities = combatEntityList();
  const focusId = selfTargetId() ?? self.target_id;
  const focus =
    focusId && entities.find((e) => e.id === focusId && e.alive && !e.is_player && !e.is_ally);
  if (focus) return undefined;
  return entities.find((e) => !e.is_player && !e.is_ally && e.alive);
}

function castEnemySkill(actionId: string, self: CombatEntity | undefined) {
  const target = self ? livingEnemyTarget(self) : undefined;
  // If we have a combat-entity target, use it; otherwise fall back to the
  // world-level target (e.g. an NPC we clicked on that isn't engaged yet).
  // If neither exists, send with no target — the server's autoTargetNPC
  // picks the nearest hostile NPC.
  const targetId = target?.id ?? selfTargetId() ?? "";
  send("action", { action_id: actionId, target_id: targetId });
  if (targetId && (selfTargetId() ?? self?.target_id) !== targetId) {
    send("set_target", { target_id: targetId });
  }
  useGame.setState({ selectedAction: null });
  if (targetId) patchSelfTargetId(targetId);
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
      const wasInGame = screen === "world" || screen === "house";
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
      const wasInGame = screen === "world" || screen === "house";
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
  /** Bind a skill/item to a slot on the unified hotbar. */
  assignHotbar(slot: string, kind: "skill" | "item", id: string) {
    this.setHotbar(slot, kind, id);
  },
  setKeybinds(keybinds: Record<string, string>) {
    send("set_keybinds", { keybinds });
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
  /** Dedicated dodge message — sent when Shift is pressed while moving. */
  dodge() {
    send("dodge");
  },
  action(actionId: string, targetId?: string, itemId?: string) {
    send("action", { action_id: actionId, target_id: targetId, item_id: itemId });
  },
  setTarget(targetId: string) {
    send("set_target", { target_id: targetId });
    patchSelfTargetId(targetId);
  },

  /** Arrow targeting: left/right cycle enemies, up/down cycle living allies. */
  cycleTarget(axis: "horizontal" | "vertical", dir: 1 | -1) {
    const self = selfCombatEntity();
    if (!self) return;
    const entities = combatEntityList();
    const focusId = selfTargetId() ?? self.target_id;
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
    if (!selectedAction || !target.alive) return false;
    const self = selfCombatEntity();
    if (!commandPetId && self && !isGcdReady(self)) return false;
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

    if (bind.kind === "skill") {
      const sk = profile.skills.find((s) => s.id === bind.id);
      if (!sk?.unlocked) return;
      // Field skills (return/port/camp, other world_only) run outside combat.
      if (sk.world_only || sk.id === "return" || sk.id === "port" || sk.id === "camp") {
        this.activateWorldSkill(sk.id);
        return;
      }
      if (screen !== "world") {
        pushChat("system", "That can only be used in the field.");
        return;
      }
      // Dodge bypasses the casting/GCD gates — interrupting a cast is its job.
      if (sk.id === "dodge") {
        this.dodge();
        return;
      }
      if (!skillWeaponMatches(sk, profile)) return;
      const self = selfCombatEntity();
      if (self && !self.alive) return;
      // Retarget first so pressing a skill on cooldown still fixes a dead or
      // missing focus.
      if (self && !skillTargetsAlly(sk)) {
        const next = nextViableEnemy(self);
        if (next) this.setTarget(next.id);
      }
      if (entityIsCasting(self)) {
        pushChat("system", "Already casting.");
        return;
      }
      if (self && (self.skill_atb ?? 0) < 100) {
        pushChat("system", "Ability not ready yet.");
        return;
      }
      if (self && (self.mp ?? 0) < sk.mp_cost) {
        pushChat("system", "Not enough MP.");
        return;
      }
      const selfId = useGame.getState().selfId;
      if (skillTargetsAlly(sk)) {
        if (selfId) this.armOrSelfCast(actionFromSkill(sk), selfId);
      } else if (sk.id === "capture" && (!self || !livingEnemyTarget(self))) {
        this.toggleAction(actionFromSkill(sk));
      } else {
        // castEnemySkill handles self being undefined — it falls back to
        // the world-level target so players can open with a ranged skill on
        // an NPC they clicked/targeted before any combat entity exists.
        castEnemySkill(sk.id, self);
      }
      return;
    }

    if (bind.kind === "item") {
      const self = selfCombatEntity();
      if (self && !self.alive) return;
      if (entityIsCasting(self)) {
        pushChat("system", "Already casting.");
        return;
      }
      if (self && (self.skill_atb ?? 0) < 100) {
        pushChat("system", "Ability not ready yet.");
        return;
      }
      const item = firstConsumable(profile.inventory, bind.id);
      const selfId = useGame.getState().selfId;
      if (!item || !selfId) return;
      this.armOrSelfCast(actionFromItem(item), selfId);
    }
  },

  bindToHotbar(kind: "skill" | "item", id: string) {
    const slot = useGame.getState().bindSlot;
    if (!slot) return;
    this.assignHotbar(slot, kind, id);
    useGame.setState({ bindSlot: null });
  },

  useItemFromBag(itemId: string) {
    const { selfId, profile } = useGame.getState();
    const item = profile?.inventory.find((i) => i.id === itemId);
    if (!item || !selfId) return;
    const self = selfCombatEntity();
    if (self && (!self.alive || !isGcdReady(self))) {
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

function isGcdReady(self: { alive: boolean; skill_atb?: number; casting_skill_id?: string } | undefined): boolean {
  return !!self?.alive && (self.skill_atb ?? 0) >= 100 && !entityIsCasting(self);
}

export function handleMessage(env: Envelope) {
  const g = useGame;
  switch (env.type) {
    case "welcome": {
      const p = env.payload as WelcomePayload;
      void (async () => {
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
          // Do not yank the player out of house/world mid-session.
          const screen =
            s.screen === "house" || s.screen === "world"
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
      // WorldPlayer now carries combat fields (hp/mp/stamina/target/in_combat).
      g.setState((s) => ({ players: { ...s.players, [wp.id]: wp } }));
      break;
    }
    case "combat_tick": {
      const p = env.payload as CombatTickPayload;
      applyCombatTick(p);
      break;
    }
    case "combat_event": {
      const p = env.payload as CombatEventPayload;
      applyCombatEvent(p);
      break;
    }
    case "pet_state": {
      const p = env.payload as { pets?: WorldPet[] };
      const pets: Record<string, WorldPet> = {};
      for (const pet of p.pets ?? []) pets[pet.id] = pet;
      g.setState({ pets });
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
      const p = (env.payload ?? {}) as SocialStatePayload;
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
      const p = env.payload as RewardNoticePayload;
      pushChat("system", p.message);
      break;
    }
    case "chat_message": {
      const p = env.payload as ChatMessagePayload;
      pushChat(p.channel ?? "general", p.message, { id: p.from_id, name: p.from_name });
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
