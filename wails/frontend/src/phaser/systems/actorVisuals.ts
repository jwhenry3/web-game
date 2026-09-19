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
import type { CharacterAppearanceWire } from "../../types";
import { entityShadow } from "../entityShadow";
import {
  applyIsoCounter,
  isoDepth,
  isoLayer,
  isoParent,
} from "../../world/iso";
import { CharacterSprite } from "../CharacterSprite";
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
  wrapper.setDepth(isoDepth(x, y) + ISO_ACTOR_DEPTH_EPS);
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

/** Follow pets use the battle foe sprite at a reduced size. */
export const PET_FOLLOW_SCALE = 0.55;

export interface ActorVisualInteractions {
  clickEntity(id: string): void;
}

export interface PlayerVisualOptions extends ActorVisualInteractions {
  resolveAppearance(
    id: string,
    race?: string,
    weapon?: string,
    wire?: CharacterAppearanceWire,
  ): CharacterAppearance;
}

function destroyActorVisual(visual: ActorVisual): void {
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
      continue;
    }

    const wrapper = scene.add
      .container(pose.x, pose.y)
      .setDepth(ENTITY_PRESENTATION.playerDepth);
    const iso = adoptIso(scene, wrapper, pose.x, pose.y);
    const ring = scene.add
      .circle(0, H99_WORLD_RING_Y, H99_WORLD_RING_RADIUS, 0xffe9a8, 0)
      .setVisible(false);
    const sprite = new CharacterSprite(scene, 0, 0, appearance);
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
    wrapper.add([actorShadow(scene), enemy.container]);
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
    enemy.container.setScale(PET_FOLLOW_SCALE);
    wrapper.add([actorShadow(scene, PET_FOLLOW_SCALE), enemy.container]);
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
