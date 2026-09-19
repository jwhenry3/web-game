import { applyCombatEvent, applyCombatTick, pushChat, useGame } from "../state/store";
import { fetchAtlas } from "./atlas";
import { applyMapSnapshotToGame, prefetchMapConfig, defaultMapId } from "./mapConfig";
import { loadDraftAppearance, saveAppearance } from "../characters/appearanceStorage";
import { appearanceFromWire } from "../characters/types";
import type { CharacterAppearanceWire } from "../characters/heroes99";
import { clearHousePlace } from "../world/housePlaceBridge";
import { getWorldViewRect } from "../world/viewRect";
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
  CombatEventPayload,
  CombatTickPayload,
  Envelope,
  EntityStatePayload,
  MessageType,
  PartyInvitePayload,
  FriendRequestPayload,
  RewardNoticePayload,
  SocialStatePayload,
  WelcomePayload,
  MapConfigPayload,
  RegionChangedPayload,
  SavePoint,
  JobChanger,
  WorldEntity,
  WorldStatePayload,
  WorldCamp,
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
/** Combat participants currently visible to this client (AoI-scoped ids → entities). */
function combatEntityList(): WorldEntity[] {
  const { entities, combatIds } = useGame.getState();
  return Object.keys(combatIds)
    .map((id) => entities[id])
    .filter((e): e is WorldEntity => !!e);
}

/** True when the entity's world position sits inside the camera viewport.
 *  No rect published (outside the world scene) → don't filter. */
function onScreen(e: WorldEntity): boolean {
  const v = getWorldViewRect();
  if (!v) return true;
  return e.x >= v.x && e.x <= v.x + v.w && e.y >= v.y && e.y <= v.y + v.h;
}

/** The local player's entity, if the server is tracking one. */
function selfCombatEntity(): WorldEntity | undefined {
  const { entities, selfId } = useGame.getState();
  return selfId ? entities[selfId] : undefined;
}

/** The local player's current focus target. */
function selfTargetId(): string | undefined {
  const { entities, selfId } = useGame.getState();
  if (!selfId) return undefined;
  return entities[selfId]?.target_id;
}

/** Optimistically reflect a new focus target on the local player replica. */
function patchSelfTargetId(targetId: string) {
  useGame.setState((s) => {
    if (!s.selfId) return s;
    const e = s.entities[s.selfId];
    if (!e) return s;
    return { entities: { ...s.entities, [s.selfId]: { ...e, target_id: targetId } } };
  });
}

const isEnemy = (e: WorldEntity) => e.kind === "npc" && !e.is_ally;

/** Enemy the server will accept: a living NPC with HP (neutral NPCs carry
 *  max_hp 0 and are never attackable). */
const isTargetableEnemy = (e: WorldEntity) => isEnemy(e) && e.alive && e.max_hp > 0;

/** Closest targetable enemy to `self` in `pool`. */
function nearestEnemy(self: WorldEntity, pool: Iterable<WorldEntity>): WorldEntity | undefined {
  let best: WorldEntity | undefined;
  let bestD = Infinity;
  for (const e of pool) {
    if (!isTargetableEnemy(e)) continue;
    const d = Math.hypot(e.x - self.x, e.y - self.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Focus target if still attackable, else the nearest on-screen foe —
 *  combat participants first so a dead focus stays inside the current
 *  fight. */
function closestEnemy(self: WorldEntity): WorldEntity | undefined {
  const { entities } = useGame.getState();
  const focusId = selfTargetId() ?? self.target_id;
  const focus = focusId ? entities[focusId] : undefined;
  if (focus && isTargetableEnemy(focus)) return focus;
  return (
    nearestEnemy(self, combatEntityList().filter(onScreen)) ??
    nearestEnemy(self, Object.values(entities).filter(onScreen))
  );
}

function livingEnemyTarget(self: WorldEntity): WorldEntity | undefined {
  return closestEnemy(self);
}

/** Enemy to focus when the current focus is missing, dead, or not an enemy; undefined if focus is already viable. */
function nextViableEnemy(self: WorldEntity): WorldEntity | undefined {
  const { entities } = useGame.getState();
  const focusId = selfTargetId() ?? self.target_id;
  const focus = focusId ? entities[focusId] : undefined;
  if (focus && isTargetableEnemy(focus)) return undefined;
  return closestEnemy(self);
}

function castEnemySkill(actionId: string, self: WorldEntity | undefined) {
  const target = self ? livingEnemyTarget(self) : undefined;
  // Send the focus target if it still works, otherwise the nearest visible
  // enemy. If none exists at all, send with no target — the server picks the
  // nearest attackable entity on its side.
  const targetId = target?.id ?? selfTargetId() ?? "";
  send("action", { action_id: actionId, target_id: targetId });
  useGame.setState({ selectedAction: null });
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
    const wsBase =
      (window as unknown as { CM_WS_URL?: string }).CM_WS_URL ??
      `${proto}://${location.host}/ws`;
    ws = new WebSocket(`${wsBase}?token=${encodeURIComponent(token)}`);

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
    const entities = combatEntityList().filter(onScreen);
    const focusId = selfTargetId() ?? self.target_id;
    const pool =
      axis === "horizontal"
        ? entities.filter(isTargetableEnemy)
        : entities.filter((e) => !isEnemy(e) && e.alive);
    if (pool.length === 0) return;
    let idx = pool.findIndex((e) => e.id === focusId);
    if (idx < 0) {
      idx = dir > 0 ? -1 : 0;
    }
    const next = pool[(idx + dir + pool.length) % pool.length];
    if (next) this.setTarget(next.id);
  },

  /** Tab targeting: cycle hostile targets; outside combat, nearest-first. */
  tabTarget(dir: 1 | -1) {
    const self = selfCombatEntity();
    if (!self) return;
    const inCombat = combatEntityList().filter((e) => onScreen(e) && isTargetableEnemy(e));
    const pool =
      inCombat.length > 0
        ? inCombat
        : Object.values(useGame.getState().entities)
            .filter((e) => onScreen(e) && isTargetableEnemy(e))
            .sort(
              (a, b) =>
                Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y),
            );
    if (pool.length === 0) return;
    const focusId = selfTargetId() ?? self.target_id;
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
  petSetBattle(petId: string) {
    send("pet_set_battle", { pet_id: petId });
  },
  petSetMount(petId: string) {
    send("pet_set_mount", { pet_id: petId });
  },
  petRelease(petId: string) {
    send("pet_release", { pet_id: petId });
  },
  /** Mount toggle keybind stub — server acks via reward_notice. */
  mountToggle() {
    send("mount_toggle", {});
  },
  /** Pet hotbar commands: "attack" sends pets at the focus target, "heel" calls them back. */
  petCommand(command: "attack" | "heel") {
    send("pet_command", { command });
  },
  capture(targetId: string) {
    send("action", { action_id: "capture", target_id: targetId });
  },
  petAction(petId: string, actionId: string, targetId: string, itemId?: string) {
    send("action", { action_id: actionId, target_id: targetId, item_id: itemId, actor_id: petId });
  },

  clickEntity(target: WorldEntity) {
    if (!target.alive) return;
    const { selectedAction } = useGame.getState();
    if (selectedAction) {
      this.castSelectedOn(target);
      return;
    }
    // Any living entity can take focus — self, allies, pets, enemies.
    // Clicking the focused entity again releases the target (untarget).
    const focus = selfTargetId() ?? selfCombatEntity()?.target_id;
    this.setTarget(focus === target.id ? "" : target.id);
  },

  castSelectedOn(target: WorldEntity): boolean {
    const { selectedAction, commandPetId } = useGame.getState();
    if (!selectedAction || !target.alive) return false;
    const self = selfCombatEntity();
    if (!commandPetId && self && !isGcdReady(self)) return false;
    const friendly = !isEnemy(target);
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
          const selfEnt = s.entities[p.player_id];
          const entities =
            selfEnt && selfWeapon
              ? { ...s.entities, [p.player_id]: { ...selfEnt, weapon: selfWeapon } }
              : s.entities;
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
            entities,
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
    case "region_changed": {
      const p = env.payload as RegionChangedPayload;
      g.setState({ currentRegion: p.region_id ? { id: p.region_id, name: p.name ?? p.region_id } : null });
      break;
    }
    case "world_state": {
      const p = env.payload as WorldStatePayload;
      const entities: Record<string, WorldEntity> = {};
      for (const e of p.entities ?? []) entities[e.id] = e;
      const savePoints: Record<string, SavePoint> = {};
      for (const sp of p.save_points ?? []) savePoints[sp.id] = sp;
      const jobChangers: Record<string, JobChanger> = {};
      for (const jc of p.job_changers ?? []) jobChangers[jc.id] = jc;
      const camps: Record<string, WorldCamp> = {};
      for (const camp of p.camps ?? []) camps[camp.owner_name] = camp;
      g.setState({
        entities,
        savePoints,
        jobChangers,
        camps,
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
      const we = env.payload as WorldEntity;
      g.setState((s) => ({ entities: { ...s.entities, [we.id]: we } }));
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
    case "set_target": {
      const p = (env.payload ?? {}) as { target_id?: string };
      patchSelfTargetId(p.target_id ?? "");
      break;
    }
    case "player_joined": {
      const we = env.payload as WorldEntity;
      const already = !!g.getState().entities[we.id];
      g.setState((s) => ({ entities: { ...s.entities, [we.id]: we } }));
      if (we.id !== g.getState().selfId && !already) {
        pushChat("social", `${we.name} has joined the world.`);
      }
      break;
    }
    case "player_left": {
      const { id } = env.payload as { id: string };
      const left = g.getState().entities[id];
      g.setState((s) => {
        const entities = { ...s.entities };
        delete entities[id];
        const combatIds = { ...s.combatIds };
        delete combatIds[id];
        return { entities, combatIds };
      });
      if (left && id !== g.getState().selfId) {
        pushChat("social", `${left.name} has left the world.`);
      }
      break;
    }
    case "player_moved": {
      const p = env.payload as { id: string; x: number; y: number; facing?: number | string };
      g.setState((s) => {
        const e = s.entities[p.id];
        if (!e) return s;
        return {
          entities: {
            ...s.entities,
            [p.id]: {
              ...e,
              x: p.x,
              y: p.y,
              ...(p.facing !== undefined ? { facing: p.facing } : {}),
            },
          },
        };
      });
      break;
    }
    case "entity_state": {
      // Authoritative set of server-driven entities (NPCs + pets); players merge.
      const p = env.payload as EntityStatePayload;
      g.setState((s) => {
        const entities: Record<string, WorldEntity> = {};
        for (const [id, e] of Object.entries(s.entities)) {
          if (e.kind === "player") entities[id] = e;
        }
        for (const e of p.entities ?? []) entities[e.id] = e;
        return { entities };
      });
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
