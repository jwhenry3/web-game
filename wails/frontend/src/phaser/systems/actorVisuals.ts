// ECS-owned Phaser actor visuals.
//
// ActorVisual owns the wrapper/sprite pair for one replicated entity. Player,
// NPC, pet, and combat-extra Phaser objects all live behind this component;
// actorMotion moves them while WorldScene owns input, prediction, and camera.

import type Phaser from "phaser";
import {
  AppearanceState,
  AuthorityPose,
  CombatState,
  NetworkSnapshot,
  Removed,
  Self,
} from "../../ecs/components";
import { component, type Entity, type EntityWorld } from "../../ecs/world";
import { enemyKindFromName, type EnemyKind } from "../../characters/enemies";
import {
  appearanceKey,
  H99_WORLD_RING_RADIUS,
  H99_WORLD_RING_Y,
  type CharacterAppearance,
} from "../../characters/heroes99";
import type { CharacterAppearanceWire, WorldEntity } from "../../types";
import { entityShadow } from "../entityShadow";
import {
  applyIsoCounter,
  isoLayer,
  isoParent,
  sortDepth,
} from "../../world/iso";
import { CharacterSprite, PLAYER_RIG } from "../CharacterSprite";
import { EnemySprite } from "../EnemySprite";
import type { IEntitySprite } from "../entitySprite";
import { createSpriteForEntity, ENTITY_PRESENTATION } from "../spriteFactory";

export type ActorVisualRole = "player" | "npc" | "pet" | "combat-extra";

/** Live Phaser actor owned by a replicated entity. */
export interface ActorVisual {
  role: ActorVisualRole;
  wrapper: Phaser.GameObjects.Container;
  sprite: IEntitySprite;
  /** EnemySprite is retained for NPC/pet kind changes without rebuilding. */
  enemy?: EnemySprite;
  /** Mounted players carry the mount creature sprite under the rider. */
  mount?: EnemySprite;
  mountKind?: EnemyKind;
  /** CharacterSprite is retained for player appearance updates. */
  character?: CharacterSprite;
  /** Immunity/status ring for player avatars. */
  ring?: Phaser.GameObjects.Arc;
  /** True when this player visual was built without click interaction. */
  isSelf?: boolean;
  appearanceKey?: string;
  kind?: EnemyKind;
  /** True when the wrapper lives in the scene's iso layer (depth = isoY). */
  iso?: boolean;
  lastX: number;
  lastY: number;
  /** Remote-chase state (npc/pet/combat-extra): last authority position,
   * ms accumulated since it last changed, smoothed entity speed, and the
   * held moving flag — see chaseAuthority in actorMotion. */
  entX?: number;
  entY?: number;
  entAccMs?: number;
  stillMs?: number;
  chaseSpeed?: number;
  moving?: boolean;
  /** Sustained channeling effect while casting — stopped on resolve/cancel. */
  castVfx?: { stop(): void };
}
export const ActorVisual = component<ActorVisual>();

/** Small depth bias so actors beat prop billboards on exact isoY ties. */
export const ISO_ACTOR_DEPTH_EPS = 0.1;

/**
 * If the scene renders isometrically, move the wrapper into the iso layer and
 * counter-transform it — the wrapper keeps world coordinates while its
 * children (sprites, rings, shadows) render upright in screen space.
 */
function adoptIso(
  scene: Phaser.Scene,
  wrapper: Phaser.GameObjects.Container,
  x: number,
  y: number,
): boolean {
  if (!isoParent(scene, wrapper)) return false;
  applyIsoCounter(wrapper);
  wrapper.setDepth(sortDepth(scene, x, y) + ISO_ACTOR_DEPTH_EPS);
  return true;
}

/** Ground shadow — squashed to an ellipse when the scene is isometric. */
function actorShadow(
  scene: Phaser.Scene,
  scale = 1,
): Phaser.GameObjects.Image {
  const shadow = entityShadow(scene, scale);
  if (isoLayer(scene)) shadow.setScale(scale, scale * 0.45);
  return shadow;
}

/** Mounted riders shrink so the pair reads as one creature — the rider's
 * world scale relative to its on-foot size. 1.0 keeps the rider at parity
 * with the mount (quaddoll enemies render at the player's display scale). */
const MOUNT_RIDER_SCALE = 1.0;
/** Rider sits this far above the mount's ground point. */
const RIDER_OFFSET_Y = -14;

/** The creature under a mounted player, or undefined when on foot. */
function mountKindOf(entity: WorldEntity): EnemyKind | undefined {
  if (!entity.mounted || !entity.mount_sprite) return undefined;
  return enemyKindFromName(entity.mount_sprite, entity.mount_sprite);
}

/**
 * Reconcile a player visual's mount sprite with the replicated flag. The
 * creature is inserted below the rider sprite (after the shadow) and the
 * rider is lifted so they read as seated.
 */
function syncMountVisual(
  scene: Phaser.Scene,
  visual: ActorVisual,
  entity: WorldEntity,
  interactions: ActorVisualInteractions,
): void {
  const kind = mountKindOf(entity);
  if (visual.mount && visual.mountKind === kind) return;
  if (visual.mount) {
    // Pull the rider back into the wrapper before the mount container is
    // destroyed — container destruction can take the rider with it.
    const rider = visual.character?.container;
    if (rider) {
      visual.wrapper.add(rider);
      rider.setScale(1).setPosition(0, 0);
    }
    visual.mount.destroy();
    visual.mount = undefined;
    visual.mountKind = undefined;
  }
  if (!kind) return;
  const mount = new EnemySprite(scene, 0, 0, kind);
  // Mounts render at the same scale as enemy NPCs of the kind — the doll
  // preset scale already applies inside EnemySprite.
  const mountScale = mount.container.scaleY;
  visual.wrapper.addAt(mount.container, 1); // above the shadow, under the rider
  // Clicks on the creature still target the rider (self stays non-interactive).
  if (!visual.isSelf) mount.setInteractive(() => interactions.clickEntity(entity.id));
  visual.mount = mount;
  visual.mountKind = kind;
  const rider = visual.character?.container;
  if (rider) {
    // Parent the rider to the mount so all mount movement carries it;
    // counter the mount container's scale so the rider lands at
    // MOUNT_RIDER_SCALE world size, then drop it on the fallback seat.
    mount.container.add(rider);
    rider.setScale(MOUNT_RIDER_SCALE / mountScale);
    rider.setPosition(0, RIDER_OFFSET_Y / mountScale);
  }
}

/** The rider's resting position in mount-container space — the mount rig's
 * "seat" bone when it has one, else a fixed lift above the mount's ground
 * point. The rider is a child of the mount container, so mount motion
 * (lunges, wrapper tweens) carries it with no per-frame catch-up. */
export function riderRestOffset(mount?: EnemySprite): { x: number; y: number } {
  if (!mount) return { x: 0, y: 0 };
  const seat = mount.seatOffset();
  if (seat) return seat;
  // Container-local units — undo the mount scale so the lift lands at the
  // same world height as an unscaled rider.
  return { x: 0, y: RIDER_OFFSET_Y / mount.container.scaleY };
}

/** Seat the rider on the mount each frame — rigs with a "seat" marker bone
 * (quaddoll) carry the rider on the body's animated position; anything else
 * falls back to a fixed lift. The rider is a child of the mount container,
 * so container motion is rigid — this only tracks the seat bone's sway. */
export function syncRiderSeat(visual: ActorVisual): void {
  const rider = visual.character?.container;
  if (!rider || !visual.mount) return;
  if (visual.wrapper.scene.tweens.isTweening(rider)) return;
  const { x, y } = riderRestOffset(visual.mount);
  rider.setPosition(x, y);
}

export interface ActorVisualInteractions {
  clickEntity(id: string): void;
}

export interface PlayerVisualOptions extends ActorVisualInteractions {
  resolveAppearance(
    id: string,
    race?: string,
    weapon?: string,
    subWeapon?: string,
    wire?: CharacterAppearanceWire,
  ): CharacterAppearance;
}

function destroyActorVisual(visual: ActorVisual): void {
  visual.castVfx?.stop();
  visual.wrapper.destroy();
}

function removeActorVisual(world: EntityWorld, entity: Entity): void {
  const visual = world.get(ActorVisual, entity);
  if (!visual) return;
  world.remove(ActorVisual, entity);
  destroyActorVisual(visual);
}

function expectedRole(world: EntityWorld, entity: Entity): ActorVisualRole | undefined {
  const kind = world.get(NetworkSnapshot, entity)?.entity.kind;
  if (kind === "player" || kind === "npc" || kind === "pet") return kind;
  return undefined;
}

/** Tear down actor visuals for removed records or changed entity roles. */
export function cleanupActorVisuals(world: EntityWorld): void {
  for (const entity of world.query(ActorVisual)) {
    const visual = world.get(ActorVisual, entity);
    if (!visual) continue;
    if (world.get(Removed, entity) != null) {
      removeActorVisual(world, entity);
      continue;
    }
    if (visual.role === "combat-extra") {
      if (world.get(CombatState, entity)?.inCombat !== true) {
        removeActorVisual(world, entity);
      }
      continue;
    }
    if (expectedRole(world, entity) !== visual.role) {
      removeActorVisual(world, entity);
    }
  }
}

/** Tear down every ECS-owned actor visual before clearing/resetting the world. */
export function destroyActorVisuals(world: EntityWorld): void {
  for (const entity of world.query(ActorVisual)) {
    removeActorVisual(world, entity);
  }
}

/** Resolve the ECS-owned local player visual for systems that only control self. */
export function selfActorVisual(
  world: EntityWorld,
): { id: string; visual: ActorVisual } | undefined {
  for (const entity of world.queryExcluding(
    [ActorVisual, NetworkSnapshot, Self],
    [Removed],
  )) {
    const visual = world.get(ActorVisual, entity);
    const snapshot = world.get(NetworkSnapshot, entity);
    if (visual?.role === "player" && snapshot) {
      return { id: snapshot.entity.id, visual };
    }
  }
  return undefined;
}

/**
 * Reconcile player replicas to Phaser wrappers. WorldScene still owns local
 * prediction, camera follow, remote interpolation, and overlay projection.
 */
export function syncPlayerVisuals(
  world: EntityWorld,
  scene: Phaser.Scene,
  options: PlayerVisualOptions,
): void {
  cleanupActorVisuals(world);

  for (const entity of world.queryExcluding([NetworkSnapshot, AppearanceState], [Removed])) {
    const snapshot = world.get(NetworkSnapshot, entity)?.entity;
    const appearanceState = world.get(AppearanceState, entity);
    if (!snapshot || snapshot.kind !== "player" || !appearanceState) continue;
    if (appearanceState.inHouse) {
      removeActorVisual(world, entity);
      continue;
    }

    const pose = world.get(AuthorityPose, entity) ?? snapshot;
    const appearance = options.resolveAppearance(
      snapshot.id,
      appearanceState.sprite,
      appearanceState.weapon,
      appearanceState.subWeapon,
      appearanceState.appearance,
    );
    const key = appearanceKey(appearance);
    const isSelf = world.get(Self, entity) != null;
    let visual = world.get(ActorVisual, entity);
    if (visual && (visual.role !== "player" || !visual.character || visual.isSelf !== isSelf)) {
      removeActorVisual(world, entity);
      visual = undefined;
    }
    if (visual) {
      if (visual.appearanceKey !== key) {
        visual.character?.setAppearance(appearance);
        visual.appearanceKey = key;
      }
      syncMountVisual(scene, visual, snapshot, options);
      continue;
    }

    const wrapper = scene.add
      .container(pose.x, pose.y)
      .setDepth(ENTITY_PRESENTATION.playerDepth);
    const iso = adoptIso(scene, wrapper, pose.x, pose.y);
    const ring = scene.add
      .circle(0, H99_WORLD_RING_Y, H99_WORLD_RING_RADIUS, 0xffe9a8, 0)
      .setVisible(false);
    const sprite = new CharacterSprite(scene, 0, 0, appearance, PLAYER_RIG);
    wrapper.add([
      actorShadow(scene, ENTITY_PRESENTATION.defaultShadowScale),
      ring,
      sprite.container,
    ]);

    if (!isSelf) {
      sprite.setInteractive(() => options.clickEntity(snapshot.id));
    }

    world.set(ActorVisual, entity, {
      role: "player",
      wrapper,
      sprite,
      character: sprite,
      ring,
      isSelf,
      appearanceKey: key,
      iso,
      lastX: pose.x,
      lastY: pose.y,
    });
    const stored = world.get(ActorVisual, entity);
    if (stored) syncMountVisual(scene, stored, snapshot, options);
  }
}

/**
 * Reconcile NPC replicas to Phaser wrappers. Movement, alpha, casting, and
 * overlay projection remain in WorldScene for this phase.
 */
export function syncNpcVisuals(
  world: EntityWorld,
  scene: Phaser.Scene,
  interactions: ActorVisualInteractions,
): void {
  cleanupActorVisuals(world);

  for (const entity of world.queryExcluding([NetworkSnapshot, AppearanceState], [Removed])) {
    const snapshot = world.get(NetworkSnapshot, entity)?.entity;
    const appearance = world.get(AppearanceState, entity);
    if (!snapshot || snapshot.kind !== "npc" || !appearance) continue;

    const pose = world.get(AuthorityPose, entity) ?? snapshot;
    const kind = enemyKindFromName(appearance.name, appearance.sprite);
    let visual = world.get(ActorVisual, entity);
    if (visual && (visual.role !== "npc" || !visual.enemy)) {
      removeActorVisual(world, entity);
      visual = undefined;
    }
    if (visual) {
      if (visual.kind !== kind) {
        visual.enemy?.setKind(kind);
        visual.kind = kind;
      }
      continue;
    }

    const wrapper = scene.add
      .container(pose.x, pose.y)
      .setDepth(ENTITY_PRESENTATION.foeDepth);
    const iso = adoptIso(scene, wrapper, pose.x, pose.y);
    const enemy = new EnemySprite(scene, 0, 0, kind);
    wrapper.add([actorShadow(scene, ENTITY_PRESENTATION.defaultShadowScale), enemy.container]);
    enemy.setInteractive(() => interactions.clickEntity(snapshot.id));

    world.set(ActorVisual, entity, {
      role: "npc",
      wrapper,
      sprite: enemy,
      enemy,
      kind,
      iso,
      lastX: pose.x,
      lastY: pose.y,
    });
  }
}

/**
 * Reconcile pet replicas to Phaser wrappers. Movement and overlay projection
 * remain in WorldScene for this phase.
 */
export function syncPetVisuals(
  world: EntityWorld,
  scene: Phaser.Scene,
  interactions: ActorVisualInteractions,
): void {
  cleanupActorVisuals(world);

  for (const entity of world.queryExcluding([NetworkSnapshot, AppearanceState], [Removed])) {
    const snapshot = world.get(NetworkSnapshot, entity)?.entity;
    const appearance = world.get(AppearanceState, entity);
    if (!snapshot || snapshot.kind !== "pet" || !appearance) continue;

    const pose = world.get(AuthorityPose, entity) ?? snapshot;
    const kind = enemyKindFromName(appearance.name, appearance.sprite);
    let visual = world.get(ActorVisual, entity);
    if (visual && (visual.role !== "pet" || !visual.enemy)) {
      removeActorVisual(world, entity);
      visual = undefined;
    }
    if (visual) {
      if (visual.kind !== kind) {
        visual.enemy?.setKind(kind);
        visual.kind = kind;
      }
      continue;
    }

    const wrapper = scene.add
      .container(pose.x, pose.y)
      .setDepth(ENTITY_PRESENTATION.petDepth);
    const iso = adoptIso(scene, wrapper, pose.x, pose.y);
    const enemy = new EnemySprite(scene, 0, 0, kind);
    // Pets render at the same scale as enemy NPCs of the kind.
    wrapper.add([actorShadow(scene, ENTITY_PRESENTATION.defaultShadowScale), enemy.container]);
    enemy.setInteractive(() => interactions.clickEntity(snapshot.id));

    world.set(ActorVisual, entity, {
      role: "pet",
      wrapper,
      sprite: enemy,
      enemy,
      kind,
      iso,
      lastX: pose.x,
      lastY: pose.y,
    });
  }
}

export interface CombatExtraVisualOptions extends ActorVisualInteractions {
  selfId: string | null;
  /** True when another presentation path owns this entity's visual. */
  isWorldReplica(id: string): boolean;
}

/**
 * Reconcile combat-only participants to temporary Phaser wrappers. These are
 * entities present in combatIds but not claimed by player/NPC/pet visuals.
 */
export function syncCombatExtraVisuals(
  world: EntityWorld,
  scene: Phaser.Scene,
  options: CombatExtraVisualOptions,
): void {
  for (const entity of world.query(ActorVisual)) {
    const visual = world.get(ActorVisual, entity);
    if (!visual || visual.role !== "combat-extra") continue;
    const snapshot = world.get(NetworkSnapshot, entity)?.entity;
    const appearance = world.get(AppearanceState, entity);
    const inCombat = world.get(CombatState, entity)?.inCombat === true;
    if (
      world.get(Removed, entity) != null ||
      !snapshot ||
      !appearance ||
      appearance.inHouse ||
      !inCombat ||
      options.isWorldReplica(snapshot.id)
    ) {
      removeActorVisual(world, entity);
    }
  }

  for (const entity of world.queryExcluding([NetworkSnapshot, AppearanceState, CombatState], [Removed])) {
    const snapshot = world.get(NetworkSnapshot, entity)?.entity;
    const appearance = world.get(AppearanceState, entity);
    const inCombat = world.get(CombatState, entity)?.inCombat === true;
    if (!snapshot || !appearance || appearance.inHouse || !inCombat || snapshot.id === options.selfId) continue;
    if (world.get(ActorVisual, entity) !== undefined) continue;
    if (options.isWorldReplica(snapshot.id)) continue;

    const pose = world.get(AuthorityPose, entity) ?? snapshot;
    const wrapper = scene.add
      .container(pose.x, pose.y)
      .setDepth(ENTITY_PRESENTATION.combatExtraDepth);
    const iso = adoptIso(scene, wrapper, pose.x, pose.y);
    const sprite = createSpriteForEntity(scene, snapshot);
    wrapper.add([actorShadow(scene, ENTITY_PRESENTATION.defaultShadowScale), sprite.container]);
    wrapper.setSize(44, 60);
    wrapper.setInteractive({ useHandCursor: true, cursor: "pointer" });
    wrapper.on("pointerdown", () => options.clickEntity(snapshot.id));

    world.set(ActorVisual, entity, {
      role: "combat-extra",
      wrapper,
      sprite,
      iso,
      lastX: pose.x,
      lastY: pose.y,
    });
  }
}
