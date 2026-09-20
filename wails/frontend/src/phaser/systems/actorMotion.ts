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
import { moveFacingAxis } from "../../characters/heroes99";
import { facingOf, getLastWorldFacing, setLastWorldFacing } from "../movement";
import { isoDepth } from "../../world/iso";
import {
  ActorVisual,
  ISO_ACTOR_DEPTH_EPS,
  syncRiderSeat,
  type ActorVisualRole,
} from "./actorVisuals";

const PLAYER_SNAP_DIST = 80;
const PLAYER_LERP = 0.25;
// Snap distances sit well above what normal interpolation lag produces —
// crossing one teleports the actor and flags it stopped, which cuts a run
// animation mid-stride. Remote actors get generous headroom so only real
// teleports snap; everything else stays on the smooth chase path.
const NPC_SNAP_DIST = 260;
const COMBAT_EXTRA_SNAP_DIST = 260;
const PET_SNAP_DIST = 260;

/**
 * Server-simulated actors publish positions in discrete hops (~4Hz,
 * npcTickSec). Fraction-lerping toward each hop decelerates into it and
 * drops dx under the moving threshold, so the run anim stalled and
 * restarted every stride. Instead chase at the measured authority speed:
 * each hop's size over its interval gives the entity's speed (smoothed),
 * and the wrapper advances at that rate toward the live target — constant
 * velocity through the stride, and a glide to rest when updates stop.
 */
const CHASE_SPEED_SMOOTH = 0.35;
/** Keep the cruise speed this long after the last hop — covers inter-hop
 * gaps plus jitter so momentum (and the run anim) never stalls mid-path. */
const CHASE_HOLD_MS = 500;
/** After the hold, bleed the cruise speed off over this window. */
const CHASE_DECAY_MS = 350;
/** Catch-up floor — arrive within ~one hop even before a speed sample. */
const CHASE_FLOOR_SEC = 0.28;

function isMoving(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > 0.3;
}

/** Rendered-horizontal facing axis — under iso, screen x = dx − dy. */
function faceAxis(visual: ActorVisual, dx: number, dy: number): number {
  return moveFacingAxis(dx, dy, !!visual.iso);
}

/**
 * Advance the wrapper toward the authority position at the measured entity
 * speed. Returns the frame delta; `snapped` means the actor teleported.
 */
function chaseAuthority(
  visual: ActorVisual,
  entity: WorldEntity,
  delta: number,
  snapDist: number,
): { dx: number; dy: number; snapped: boolean } {
  if (visual.entX === undefined) {
    visual.entX = entity.x;
    visual.entY = entity.y;
    visual.entAccMs = 0;
    visual.stillMs = CHASE_HOLD_MS + 1; // idle until the first hop lands
    visual.chaseSpeed = 0;
    visual.moving = false;
  }
  // A new authority position = one hop; hop size over hop interval is the
  // entity's speed. Blend samples so a single laggy tick can't spike it.
  const hop = Math.hypot(entity.x - visual.entX, entity.y - visual.entY!);
  if (hop > 0.4) {
    const secs = Math.max(0.03, (visual.entAccMs ?? 0) / 1000);
    const measured = hop / secs;
    visual.chaseSpeed =
      (visual.chaseSpeed ?? 0) * (1 - CHASE_SPEED_SMOOTH) + measured * CHASE_SPEED_SMOOTH;
    visual.entAccMs = 0;
    visual.stillMs = 0;
  } else {
    visual.entAccMs = (visual.entAccMs ?? 0) + delta;
    visual.stillMs = (visual.stillMs ?? 0) + delta;
  }
  visual.entX = entity.x;
  visual.entY = entity.y;

  const dx = entity.x - visual.wrapper.x;
  const dy = entity.y - visual.wrapper.y;
  const dist = Math.hypot(dx, dy);
  if (dist > snapDist) {
    setPosition(visual, entity.x, entity.y);
    visual.chaseSpeed = 0;
    visual.moving = false;
    return { dx: 0, dy: 0, snapped: true };
  }
  const still = visual.stillMs ?? 0;
  const decay = still <= CHASE_HOLD_MS
    ? 1
    : Math.max(0, 1 - (still - CHASE_HOLD_MS) / CHASE_DECAY_MS);
  const speed = Math.max((visual.chaseSpeed ?? 0) * decay, dist / CHASE_FLOOR_SEC);
  const step = Math.min(dist, speed * (delta / 1000));
  if (step <= 0.02) {
    return { dx: 0, dy: 0, snapped: false };
  }
  const ux = dx / dist;
  const uy = dy / dist;
  visual.wrapper.x += ux * step;
  visual.wrapper.y += uy * step;
  return { dx: ux * step, dy: uy * step, snapped: false };
}

/**
 * Moving flag with momentum: once an actor is striding it stays flagged
 * through inter-hop gaps until the authority stream goes quiet past the
 * hold window — the run anim keeps playing instead of flapping per hop.
 */
function chaseMoving(visual: ActorVisual, dx: number, dy: number): boolean {
  const moving =
    isMoving(dx, dy) ||
    (!!visual.moving && (visual.stillMs ?? Infinity) <= CHASE_HOLD_MS);
  visual.moving = moving;
  return moving;
}

export interface SelfMotionHooks {
  /** Whether the local player has been placed and camera-followed this map. */
  spawned(): boolean;
  /** True while WorldMovement's dodge dash owns the local position. */
  dodging(): boolean;
  /** Called after the first authoritative self placement/facing update. */
  onSpawn(visual: ActorVisual): void;
  /** Called when the self avatar teleports — position snapped, not lerped —
   * so the camera can jump instead of sliding to catch up. */
  onSnap?(visual: ActorVisual): void;
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
    setLastWorldFacing(facingOf(entity, getLastWorldFacing(), !!visual.iso));
    visual.sprite.setFacing(getLastWorldFacing());
    opts.self.onSpawn(visual);
  } else if (
    !opts.self.dodging() &&
    !opts.jumping.has(entity.id) &&
    Math.hypot(visual.wrapper.x - entity.x, visual.wrapper.y - entity.y) > PLAYER_SNAP_DIST
  ) {
    setPosition(visual, entity.x, entity.y);
    setLastWorldFacing(facingOf(entity, getLastWorldFacing(), !!visual.iso));
    visual.sprite.setFacing(getLastWorldFacing());
    opts.self.onSnap?.(visual);
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
      visual.sprite.setMoving(isMoving(dx, dy), faceAxis(visual, dx, dy), dy);
    } else {
      setPosition(visual, entity.x, entity.y);
      visual.sprite.setMoving(false);
      visual.sprite.setFacing(facingOf(entity, visual.sprite.getFacing(), !!visual.iso));
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
    if (!inView) {
      setPosition(visual, entity.x, entity.y);
      visual.sprite.setMoving(false);
      visual.sprite.setFacing(facingOf(entity, visual.sprite.getFacing(), !!visual.iso));
      visual.moving = false;
    } else {
      const { dx, dy, snapped } = chaseAuthority(visual, entity, delta, NPC_SNAP_DIST);
      if (snapped) {
        visual.sprite.setMoving(false);
        visual.sprite.setFacing(facingOf(entity, visual.sprite.getFacing(), !!visual.iso));
      } else {
        visual.sprite.setMoving(chaseMoving(visual, dx, dy), faceAxis(visual, dx, dy), dy);
      }
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
  if (!opts.jumping.has(entity.id)) {
    if (!inView) {
      setPosition(visual, entity.x, entity.y);
      visual.sprite.setMoving(false);
      visual.sprite.setFacing(facingOf(entity, visual.sprite.getFacing(), !!visual.iso));
      visual.moving = false;
    } else {
      const { dx, dy, snapped } = chaseAuthority(visual, entity, delta, COMBAT_EXTRA_SNAP_DIST);
      if (snapped) {
        visual.sprite.setMoving(false);
        visual.sprite.setFacing(facingOf(entity, visual.sprite.getFacing(), !!visual.iso));
      } else {
        visual.sprite.setMoving(chaseMoving(visual, dx, dy), faceAxis(visual, dx, dy), dy);
      }
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
    const { dx, dy, snapped } = chaseAuthority(visual, entity, delta, PET_SNAP_DIST);
    if (snapped) {
      visual.sprite.setMoving(false);
      visual.sprite.setFacing(facingOf(entity, visual.sprite.getFacing(), !!visual.iso));
    } else {
      visual.sprite.setMoving(chaseMoving(visual, dx, dy), faceAxis(visual, dx, dy), dy);
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
        visual.sprite.setMounted?.(!!entity.mounted);
        const isSelf = world.get(Self, e) != null;
        if (isSelf) {
          updateSelf(visual, entity, delta, opts);
        } else {
          updateRemotePlayer(visual, entity, inView, delta, opts);
        }
        // The mount sprite rides inside the player's wrapper — drive its
        // gait from the wrapper's real motion (prediction for self,
        // interpolation for remotes) and mirror the rider's facing.
        if (visual.mount) {
          const mdx = visual.wrapper.x - visual.lastX;
          const mdy = visual.wrapper.y - visual.lastY;
          visual.mount.setMoving(isMoving(mdx, mdy), faceAxis(visual, mdx, mdy), mdy);
          visual.mount.setFacing(visual.sprite.getFacing());
          if (isSelf || inView) visual.mount.update(delta);
          syncRiderSeat(visual);
        }
        visual.lastX = visual.wrapper.x;
        visual.lastY = visual.wrapper.y;
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

    // Iso scenes depth-sort the world layer by projected screen Y — higher
    // on screen draws behind lower. Orthogonal scenes keep role depths.
    if (visual.iso) {
      visual.wrapper.setDepth(
        isoDepth(visual.wrapper.x, visual.wrapper.y) + ISO_ACTOR_DEPTH_EPS,
      );
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
