// ECS-owned Phaser visuals for replicated world POIs.
//
// Unlike VisualHandle, PoiVisual is owning: the component references the live
// marker objects, cleanupPoiVisuals/destroyPoiVisuals tear them down, and no
// legacy marker map keeps a second owner.
//
// Art comes from the same Spine pipeline as actors: camps and save crystals
// are propdoll props (tools/gen_props.py), job changers are paperdoll
// characters via CharacterSprite — no flat primitive markers.

import Phaser from "phaser";
import {
  CampState,
  JobChangerState,
  Removed,
  SavePointState,
} from "../../ecs/components";
import { component, type Entity, type EntityWorld } from "../../ecs/world";
import { campSkinById } from "../../housing/campSkins";
import { npcAppearance } from "../../characters/npcs";
import { CharacterSprite } from "../CharacterSprite";
import { PropSprite } from "../PropSprite";
import { applyIsoCounter, isoParent, sortDepth } from "../../world/iso";

export type PoiVisualKind = "save_point" | "job_changer" | "camp";

/** Live Phaser marker owned by a replicated POI entity. */
export interface PoiVisual {
  kind: PoiVisualKind;
  wrapper: Phaser.GameObjects.Container;
  hit: Phaser.GameObjects.Zone;
  name: string;
  active?: boolean;
  glow?: Phaser.GameObjects.Arc;
  /** Prop rig (camps, crystals) or character rig (job changers). */
  prop?: PropSprite;
  character?: CharacterSprite;
  skin?: string;
}
export const PoiVisual = component<PoiVisual>();

export interface PoiVisualInteractions {
  setSavePoint(state: SavePointState): void;
  openJobChanger(state: JobChangerState): void;
  enterCamp(state: CampState): void;
}

/**
 * Parent the marker into the scene's world layer when one exists and
 * counter-transform it — the marker reads as an upright billboard anchored
 * at its world point while the hit zone keeps a screen-aligned rect. Depth
 * sorts by projected Y (plain Y orthogonally) so actors pass in front of /
 * behind markers naturally.
 */
function adoptIsoPoi(
  scene: Phaser.Scene,
  wrapper: Phaser.GameObjects.Container,
  hit: Phaser.GameObjects.Zone,
  x: number,
  y: number,
): void {
  wrapper.setDepth(sortDepth(scene, x, y) + 0.05);
  if (!isoParent(scene, wrapper)) return;
  applyIsoCounter(wrapper);
  isoParent(scene, hit);
  applyIsoCounter(hit);
}

function destroyPoiVisual(visual: PoiVisual): void {
  // Destroy the sprites explicitly — their async spine loads must bail even
  // if the container teardown races an in-flight ensureSpineAssets.
  visual.prop?.destroy();
  visual.character?.destroy();
  visual.wrapper.destroy();
  visual.hit.destroy();
}

function removePoiVisual(world: EntityWorld, entity: Entity): void {
  const visual = world.get(PoiVisual, entity);
  if (!visual) return;
  world.remove(PoiVisual, entity);
  destroyPoiVisual(visual);
}

/** Tear down POI visuals for removed or malformed replicated records. */
export function cleanupPoiVisuals(world: EntityWorld): void {
  for (const entity of world.query(PoiVisual)) {
    const hasPoiState =
      world.get(SavePointState, entity) !== undefined ||
      world.get(JobChangerState, entity) !== undefined ||
      world.get(CampState, entity) !== undefined;
    if (!hasPoiState || world.get(Removed, entity) != null) {
      removePoiVisual(world, entity);
    }
  }
}

/** Tear down every ECS-owned POI visual before clearing/resetting the world. */
export function destroyPoiVisuals(world: EntityWorld): void {
  for (const entity of world.query(PoiVisual)) {
    removePoiVisual(world, entity);
  }
}

function makeHitZone(
  world: EntityWorld,
  scene: Phaser.Scene,
  entity: Entity,
  state: { x: number; y: number },
  size: number,
  depth: number,
  onClick: () => void,
): Phaser.GameObjects.Zone {
  const hit = scene.add
    .zone(state.x, state.y - 8, size, size)
    .setOrigin(0.5, 0.5)
    .setDepth(depth)
    .setInteractive({ cursor: "pointer" });
  hit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
    if (pointer.button !== 0 || world.get(Removed, entity) != null) return;
    onClick();
  });
  return hit;
}

function crystalAttachments(active: boolean): Record<string, string> {
  const v = active ? "_active" : "";
  return {
    crystal_crystal: `crystal${v}`,
    shard_l_shard_l: `shard_l${v}`,
    shard_m_shard_m: `shard_m${v}`,
    shard_r_shard_r: `shard_r${v}`,
  };
}

function campAttachments(skin: string): Record<string, string> {
  return {
    tent_tent: `tent_${skin}`,
    fire_fire: "fire",
    flame_flame: "flame",
  };
}

function ensureSavePointVisual(
  world: EntityWorld,
  scene: Phaser.Scene,
  entity: Entity,
  state: SavePointState,
  interactions: PoiVisualInteractions,
): void {
  let visual = world.get(PoiVisual, entity);
  if (visual && visual.kind !== "save_point") {
    removePoiVisual(world, entity);
    visual = undefined;
  }
  if (visual) {
    visual.wrapper.setPosition(state.x, state.y);
    visual.hit.setPosition(state.x, state.y - 8);
    visual.name = state.name;
    if (visual.active !== state.active) {
      visual.active = state.active;
      visual.prop?.setProps(crystalAttachments(state.active));
      visual.glow?.setFillStyle(state.active ? 0xffe9a8 : 0x88ddff);
    }
    return;
  }

  const wrapper = scene.add.container(state.x, state.y).setDepth(8);
  const glow = scene.add.circle(
    0,
    -4,
    26,
    state.active ? 0xffe9a8 : 0x88ddff,
    state.active ? 0.22 : 0.14,
  );
  const prop = new PropSprite(scene);
  prop.setProps(crystalAttachments(state.active));
  wrapper.add([glow, prop.container]);

  const hit = makeHitZone(world, scene, entity, state, 80, 25, () => {
    const latest = world.get(SavePointState, entity);
    if (latest) interactions.setSavePoint(latest);
  });
  adoptIsoPoi(scene, wrapper, hit, state.x, state.y);

  world.set(PoiVisual, entity, {
    kind: "save_point",
    wrapper,
    hit,
    name: state.name,
    active: state.active,
    glow,
    prop,
  });
}

function ensureJobChangerVisual(
  world: EntityWorld,
  scene: Phaser.Scene,
  entity: Entity,
  state: JobChangerState,
  interactions: PoiVisualInteractions,
): void {
  let visual = world.get(PoiVisual, entity);
  if (visual && visual.kind !== "job_changer") {
    removePoiVisual(world, entity);
    visual = undefined;
  }
  if (visual) {
    visual.wrapper.setPosition(state.x, state.y);
    visual.hit.setPosition(state.x, state.y - 8);
    visual.name = state.name;
    return;
  }

  const wrapper = scene.add.container(state.x, state.y).setDepth(8);
  const glow = scene.add.circle(0, -4, 26, 0xc4a35a, 0.18);
  const npc = new CharacterSprite(
    scene,
    0,
    0,
    npcAppearance("job_master"),
    "paperdoll",
  );
  // POIs aren't ticked by the actor loop — drive CharacterSprite.update
  // (spine load retries, cast tint) from the scene update instead.
  const tick = (_t: number, delta: number) => npc.update(delta);
  scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
  wrapper.once("destroy", () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
  });
  wrapper.add([glow, npc.container]);

  const hit = makeHitZone(world, scene, entity, state, 80, 25, () => {
    const latest = world.get(JobChangerState, entity);
    if (latest) interactions.openJobChanger(latest);
  });
  adoptIsoPoi(scene, wrapper, hit, state.x, state.y);

  world.set(PoiVisual, entity, {
    kind: "job_changer",
    wrapper,
    hit,
    name: state.name,
    glow,
    character: npc,
  });
}

function ensureCampVisual(
  world: EntityWorld,
  scene: Phaser.Scene,
  entity: Entity,
  state: CampState,
  interactions: PoiVisualInteractions,
): void {
  const skin = campSkinById(state.skin).id;
  let visual = world.get(PoiVisual, entity);
  if (visual && visual.kind !== "camp") {
    removePoiVisual(world, entity);
    visual = undefined;
  }
  if (visual) {
    visual.wrapper.setPosition(state.x, state.y);
    visual.hit.setPosition(state.x, state.y - 8);
    visual.name = state.ownerName;
    if (visual.skin !== skin) {
      visual.skin = skin;
      const palette = campSkinById(skin);
      visual.glow?.setFillStyle(palette.glow, 0.35);
      visual.prop?.setProps(campAttachments(skin));
    }
    return;
  }

  const wrapper = scene.add.container(state.x, state.y).setDepth(7);
  const palette = campSkinById(skin);
  const glow = scene.add.circle(0, -8, 36, palette.glow, 0.35);
  const prop = new PropSprite(scene);
  prop.setProps(campAttachments(skin));
  wrapper.add([glow, prop.container]);

  const hit = makeHitZone(world, scene, entity, state, 96, 26, () => {
    const latest = world.get(CampState, entity);
    if (latest) interactions.enterCamp(latest);
  });
  adoptIsoPoi(scene, wrapper, hit, state.x, state.y);

  world.set(PoiVisual, entity, {
    kind: "camp",
    wrapper,
    hit,
    name: state.ownerName,
    glow,
    prop,
    skin,
  });
}

/**
 * Reconcile ECS POI records to Phaser markers. Removed visuals are destroyed
 * here, while cleanupEcsRemoved destroys the ECS entity at end-of-frame.
 */
export function syncPoiVisuals(
  world: EntityWorld,
  scene: Phaser.Scene,
  interactions: PoiVisualInteractions,
): void {
  cleanupPoiVisuals(world);

  for (const entity of world.queryExcluding([SavePointState], [Removed])) {
    const state = world.get(SavePointState, entity);
    if (state) ensureSavePointVisual(world, scene, entity, state, interactions);
  }
  for (const entity of world.queryExcluding([JobChangerState], [Removed])) {
    const state = world.get(JobChangerState, entity);
    if (state) ensureJobChangerVisual(world, scene, entity, state, interactions);
  }
  for (const entity of world.queryExcluding([CampState], [Removed])) {
    const state = world.get(CampState, entity);
    if (state) ensureCampVisual(world, scene, entity, state, interactions);
  }
}
