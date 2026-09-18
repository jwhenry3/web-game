// Actor motion presentation for ECS-owned visuals.
//
// Applies replicated authority poses to Phaser wrappers with the role-specific
// interpolation rules previously embedded in WorldScene. The network snapshot
// remains authoritative; this system only moves visuals and advances sprites.
import Phaser from "phaser";
import {
  CombatState,
  NetworkSnapshot,
  Removed,
  RenderPose,
  Self,
  Vitals,
} from "../../ecs/components";
import type { EntityWorld } from "../../ecs/world";
import type { WorldEntity } from "../../types";
import { facingOf, getLastWorldFacing, setLastWorldFacing } from "../movement";
import { ActorVisual, type ActorVisualRole } from "./actorVisuals";

const PLAYER_SNAP_DIST = 80;
const PLAYER_LERP = 0.25;
const NPC_SNAP_DIST = 120;
const NPC_LERP = 0.2;
const COMBAT_EXTRA_SNAP_DIST = 120;
const COMBAT_EXTRA_LERP = 0.25;
const PET_SNAP_DIST = 120;
const PET_LERP = 0.2;

export interface SelfMotionHooks {
  /** Whether the local player has been placed and camera-followed this map. */
  spawned(): boolean;
  /** True while WorldMovement's dodge dash owns the local position. */
  dodging(): boolean;
  /** Called after the first authoritative self placement/facing update. */
  onSpawn(visual: ActorVisual): void;
  /** Publish the rendered self position for POI prompts and other systems. */
  onPosition(x: number, y: number): void;
}

export interface ActorMotionOptions {
  /** Roles to update this call; omitted means all actor roles. */
  roles?: readonly ActorVisualRole[];
  /** Entities whose jump-crash tween owns their position this frame. */
  jumping: ReadonlySet<string>;
  /** Camera-proximity predicate (WorldScene.isNearCamera semantics). */
  isNear(x: number, y: number): boolean;
  /** Scene clock used for immunity-ring pulsing. */
  time: number;
  /** Wall clock used for replicated immunity timestamps. */
  now: number;
  self: SelfMotionHooks;
}

function setPosition(visual: ActorVisual, x: number, y: number): void {
  visual.wrapper.setPosition(x, y);
}

function lerpPosition(
  visual: ActorVisual,
  x: number,
  y: number,
  amount: number,
): { dx: number; dy: number } {
  const prevX = visual.wrapper.x;
  const prevY = visual.wrapper.y;
  visual.wrapper.x = Phaser.Math.Linear(prevX, x, amount);
  visual.wrapper.y = Phaser.Math.Linear(prevY, y, amount);
  return { dx: visual.wrapper.x - prevX, dy: visual.wrapper.y - prevY };
}

function isMoving(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > 0.3;
}

function isCasting(entity: WorldEntity, combat: CombatState, role: ActorVisualRole): boolean {
  if (role === "combat-extra") return !!entity.casting_skill_id;
  if (combat.inCombat) return !!entity.casting_skill_id;
  if (role === "player") return !!entity.casting_skill_id && (entity.cast_time_ms ?? 0) > 0;
  return !!entity.casting_skill_id;
}

function updatePlayerState(
  visual: ActorVisual,
  entity: WorldEntity,
  combat: CombatState,
  opts: ActorMotionOptions,
): void {
  const dead = combat.inCombat && !entity.alive;
  visual.wrapper.setAlpha(dead ? 0.35 : 1);
  const immune = !entity.engaged && (entity.immune_until ?? 0) > opts.now;
  if (visual.ring) {
    visual.ring.setVisible(immune);
    if (immune) {
      const pulse = 0.15 + 0.15 * Math.sin(opts.time / 180);
      visual.ring.setFillStyle(0xb4dcff, pulse);
    }
  }
}

function updateSelf(
  visual: ActorVisual,
  entity: WorldEntity,
  delta: number,
  opts: ActorMotionOptions,
): void {
  if (!opts.self.spawned()) {
    setPosition(visual, entity.x, entity.y);
    setLastWorldFacing(facingOf(entity, getLastWorldFacing()));
    visual.sprite.setFacing(getLastWorldFacing());
    opts.self.onSpawn(visual);
  } else if (
    !opts.self.dodging() &&
    !opts.jumping.has(entity.id) &&
    Math.hypot(visual.wrapper.x - entity.x, visual.wrapper.y - entity.y) > PLAYER_SNAP_DIST
  ) {
    setPosition(visual, entity.x, entity.y);
    setLastWorldFacing(facingOf(entity, getLastWorldFacing()));
    visual.sprite.setFacing(getLastWorldFacing());
  }
  opts.self.onPosition(visual.wrapper.x, visual.wrapper.y);
  visual.sprite.update(delta);
}

function updateRemotePlayer(
  visual: ActorVisual,
  entity: WorldEntity,
  inView: boolean,
  delta: number,
  opts: ActorMotionOptions,
): void {
  if (!opts.jumping.has(entity.id)) {
    if (inView && Math.hypot(visual.wrapper.x - entity.x, visual.wrapper.y - entity.y) <= PLAYER_SNAP_DIST) {
      const { dx, dy } = lerpPosition(visual, entity.x, entity.y, PLAYER_LERP);
      visual.sprite.setMoving(isMoving(dx, dy), dx, dy);
    } else {
      setPosition(visual, entity.x, entity.y);
      visual.sprite.setMoving(false);
      visual.sprite.setFacing(facingOf(entity, visual.sprite.getFacing()));
    }
  }
  if (inView) visual.sprite.update(delta);
}

function updateNpc(
  visual: ActorVisual,
  entity: WorldEntity,
  inView: boolean,
  delta: number,
  opts: ActorMotionOptions,
): void {
  if (!opts.jumping.has(entity.id)) {
    const prevX = visual.lastX;
    const prevY = visual.lastY;
    if (inView && Math.hypot(visual.wrapper.x - entity.x, visual.wrapper.y - entity.y) <= NPC_SNAP_DIST) {
      visual.wrapper.x = Phaser.Math.Linear(visual.wrapper.x, entity.x, NPC_LERP);
      visual.wrapper.y = Phaser.Math.Linear(visual.wrapper.y, entity.y, NPC_LERP);
      const dx = visual.wrapper.x - prevX;
      const dy = visual.wrapper.y - prevY;
      visual.sprite.setMoving(isMoving(dx, dy), dx, dy);
    } else {
      setPosition(visual, entity.x, entity.y);
      visual.sprite.setMoving(false);
    }
    visual.lastX = visual.wrapper.x;
    visual.lastY = visual.wrapper.y;
  }
  if (inView) visual.sprite.update(delta);
}

function updateCombatExtra(
  visual: ActorVisual,
  entity: WorldEntity,
  inView: boolean,
  delta: number,
  opts: ActorMotionOptions,
): void {
  const prevX = visual.wrapper.x;
  const prevY = visual.wrapper.y;
  if (!opts.jumping.has(entity.id)) {
    if (inView && Math.hypot(prevX - entity.x, prevY - entity.y) <= COMBAT_EXTRA_SNAP_DIST) {
      visual.wrapper.x = Phaser.Math.Linear(prevX, entity.x, COMBAT_EXTRA_LERP);
      visual.wrapper.y = Phaser.Math.Linear(prevY, entity.y, COMBAT_EXTRA_LERP);
      const dx = visual.wrapper.x - prevX;
      const dy = visual.wrapper.y - prevY;
      visual.sprite.setMoving(isMoving(dx, dy), dx, dy);
    } else {
      setPosition(visual, entity.x, entity.y);
      visual.sprite.setMoving(false);
    }
  }
  if (inView) visual.sprite.update(delta);
  visual.lastX = visual.wrapper.x;
  visual.lastY = visual.wrapper.y;
}

function updatePet(
  visual: ActorVisual,
  entity: WorldEntity,
  inView: boolean,
  delta: number,
  opts: ActorMotionOptions,
): void {
  if (!opts.jumping.has(entity.id)) {
    const prevX = visual.wrapper.x;
    const prevY = visual.wrapper.y;
    if (Math.hypot(prevX - entity.x, prevY - entity.y) > PET_SNAP_DIST) {
      setPosition(visual, entity.x, entity.y);
      visual.sprite.setMoving(false);
    } else {
      visual.wrapper.x = Phaser.Math.Linear(prevX, entity.x, PET_LERP);
      visual.wrapper.y = Phaser.Math.Linear(prevY, entity.y, PET_LERP);
      const dx = visual.wrapper.x - prevX;
      const dy = visual.wrapper.y - prevY;
      visual.sprite.setMoving(isMoving(dx, dy), dx, dy);
    }
    visual.lastX = visual.wrapper.x;
    visual.lastY = visual.wrapper.y;
  }
  if (inView) visual.sprite.update(delta);
}

/** Advance ECS-owned actor visuals toward their replicated authority poses. */
export function syncActorMotion(
  world: EntityWorld,
  delta: number,
  opts: ActorMotionOptions,
): void {
  const roles = opts.roles ? new Set(opts.roles) : undefined;
  for (const e of world.queryExcluding([ActorVisual, NetworkSnapshot, CombatState, Vitals], [Removed])) {
    const visual = world.get(ActorVisual, e);
    const entity = world.get(NetworkSnapshot, e)?.entity;
    const combat = world.get(CombatState, e);
    const vitals = world.get(Vitals, e);
    if (!visual || !entity || !combat || !vitals) continue;
    if (roles && !roles.has(visual.role)) continue;

    const inView = opts.isNear(visual.wrapper.x, visual.wrapper.y);
    visual.sprite.setCasting(isCasting(entity, combat, visual.role));

    switch (visual.role) {
      case "player": {
        updatePlayerState(visual, entity, combat, opts);
        if (world.get(Self, e) != null) {
          updateSelf(visual, entity, delta, opts);
        } else {
          updateRemotePlayer(visual, entity, inView, delta, opts);
        }
        break;
      }
      case "npc": {
        const dead = combat.inCombat ? !vitals.alive : vitals.hp <= 0;
        visual.wrapper.setAlpha(dead ? 0.35 : 1);
        updateNpc(visual, entity, inView, delta, opts);
        break;
      }
      case "pet": {
        visual.wrapper.setAlpha(combat.inCombat && !vitals.alive ? 0.35 : 1);
        updatePet(visual, entity, inView, delta, opts);
        break;
      }
      case "combat-extra": {
        visual.wrapper.setAlpha(vitals.alive ? 1 : 0.35);
        updateCombatExtra(visual, entity, inView, delta, opts);
        break;
      }
    }
  }
}

/** Publish final wrapper positions into ECS after every motion authority has run. */
export function syncRenderPoses(world: EntityWorld): void {
  for (const e of world.queryExcluding([ActorVisual, RenderPose], [Removed])) {
    const visual = world.get(ActorVisual, e);
    const pose = world.get(RenderPose, e);
    if (!visual || !pose) continue;
    const dx = visual.wrapper.x - pose.x;
    const dy = visual.wrapper.y - pose.y;
    pose.x = visual.wrapper.x;
    pose.y = visual.wrapper.y;
    pose.facing = visual.sprite.getFacing();
    pose.moving = isMoving(dx, dy);
  }
}
