// ECS-owned Phaser visuals for replicated world POIs.
//
// Unlike VisualHandle, PoiVisual is owning: the component references the live
// marker objects, cleanupPoiVisuals/destroyPoiVisuals tear them down, and no
// legacy marker map keeps a second owner.

import type Phaser from "phaser";
import {
  CampState,
  JobChangerState,
  Removed,
  SavePointState,
} from "../../ecs/components";
import { component, type Entity, type EntityWorld } from "../../ecs/world";
import { campSkinById, drawCampTent } from "../../housing/campSkins";

export type PoiVisualKind = "save_point" | "job_changer" | "camp";

/** Live Phaser marker owned by a replicated POI entity. */
export interface PoiVisual {
  kind: PoiVisualKind;
  wrapper: Phaser.GameObjects.Container;
  hit: Phaser.GameObjects.Zone;
  name: string;
  active?: boolean;
  glow?: Phaser.GameObjects.Arc;
  tent?: Phaser.GameObjects.Graphics;
  skin?: string;
}
export const PoiVisual = component<PoiVisual>();

export interface PoiVisualInteractions {
  setSavePoint(state: SavePointState): void;
  openJobChanger(state: JobChangerState): void;
  enterCamp(state: CampState): void;
}

function destroyPoiVisual(visual: PoiVisual): void {
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

function ensureSavePointVisual(
  world: EntityWorld,
  scene: Phaser.Scene,
  entity: Entity,
  state: SavePointState,
  interactions: PoiVisualInteractions,
): void {
  let visual = world.get(PoiVisual, entity);
  if (
    visual &&
    (visual.kind !== "save_point" || visual.active !== state.active)
  ) {
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
  const glow = scene.add.circle(
    0,
    -14,
    30,
    state.active ? 0xffe9a8 : 0x88ddff,
    state.active ? 0.22 : 0.14,
  );
  const crystal = scene.add.graphics();
  crystal.fillStyle(state.active ? 0xffe9a8 : 0xa8e8ff, 1);
  crystal.fillTriangle(-10, 6, 10, 6, 0, -20);
  crystal.fillStyle(0xffffff, 0.7);
  crystal.fillCircle(0, -10, 5);
  wrapper.add([glow, crystal]);

  const hit = scene.add
    .zone(state.x, state.y - 8, 80, 80)
    .setOrigin(0.5, 0.5)
    .setDepth(25)
    .setInteractive({ cursor: "pointer" });
  hit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
    if (pointer.button !== 0 || world.get(Removed, entity) != null) return;
    const latest = world.get(SavePointState, entity);
    if (latest) interactions.setSavePoint(latest);
  });

  world.set(PoiVisual, entity, {
    kind: "save_point",
    wrapper,
    hit,
    name: state.name,
    active: state.active,
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
  const glow = scene.add.circle(0, -14, 28, 0xc4a35a, 0.18);
  const icon = scene.add.graphics();
  icon.fillStyle(0xe8c96a, 1);
  icon.fillCircle(0, -12, 12);
  icon.fillStyle(0x4a3820, 1);
  icon.fillRect(-8, -2, 16, 14);
  wrapper.add([glow, icon]);

  const hit = scene.add
    .zone(state.x, state.y - 8, 80, 80)
    .setOrigin(0.5, 0.5)
    .setDepth(25)
    .setInteractive({ cursor: "pointer" });
  hit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
    if (pointer.button !== 0 || world.get(Removed, entity) != null) return;
    const latest = world.get(JobChangerState, entity);
    if (latest) interactions.openJobChanger(latest);
  });

  world.set(PoiVisual, entity, {
    kind: "job_changer",
    wrapper,
    hit,
    name: state.name,
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
      if (visual.tent) drawCampTent(visual.tent, skin);
    }
    return;
  }

  const wrapper = scene.add.container(state.x, state.y).setDepth(7);
  const palette = campSkinById(skin);
  const glow = scene.add.circle(0, -12, 34, palette.glow, 0.35);
  const tent = scene.add.graphics();
  drawCampTent(tent, skin);
  wrapper.add([glow, tent]);

  const hit = scene.add
    .zone(state.x, state.y - 8, 96, 96)
    .setOrigin(0.5, 0.5)
    .setDepth(26)
    .setInteractive({ cursor: "pointer" });
  hit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
    if (pointer.button !== 0 || world.get(Removed, entity) != null) return;
    const latest = world.get(CampState, entity);
    if (latest) interactions.enterCamp(latest);
  });

  world.set(PoiVisual, entity, {
    kind: "camp",
    wrapper,
    hit,
    name: state.ownerName,
    glow,
    tent,
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
