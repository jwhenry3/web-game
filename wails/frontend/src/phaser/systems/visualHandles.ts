// Phaser-facing ECS index of live visual objects.
//
// VisualHandle is a non-owning index: it only records which wrapper/sprite a
// replicated entity currently maps to. Wrappers and sprites are created and
// destroyed elsewhere (scene/sprite factory) — nothing here destroys them.

import type Phaser from "phaser";
import { component, type EntityWorld } from "../../ecs/world";
import { Removed } from "../../ecs/components";
import { entityExternalId } from "../../ecs/snapshot";
import type { IEntitySprite } from "../entitySprite";

/** Presentation role a visual handle plays for its replicated entity. */
export type VisualHandleRole = "player" | "npc" | "pet" | "combat-extra";

/** Non-owning reference to a live Phaser visual for one replicated entity. */
export interface VisualHandle {
  wrapper: Phaser.GameObjects.Container;
  sprite: IEntitySprite;
  role: VisualHandleRole;
}
export const VisualHandle = component<VisualHandle>();

/**
 * Reconcile the VisualHandle index against the desired set of live visuals.
 *
 * `desired` is keyed by network entity id (no "entity:" prefix). Entities
 * missing from the world or tagged Removed are skipped; handles are written
 * only when role/wrapper/sprite actually changed. Afterwards VisualHandle is
 * stripped from any entity whose external id is not in `desired` or that is
 * tagged Removed. Wrappers and sprites are never destroyed here.
 */
export function syncVisualHandles(
  world: EntityWorld,
  desired: ReadonlyMap<string, VisualHandle>,
): void {
  const wantedExternalIds = new Set<string>();
  for (const [id, handle] of desired) {
    const externalId = entityExternalId(id);
    wantedExternalIds.add(externalId);
    const e = world.entityByExternalId(externalId);
    if (e === undefined) continue;
    if (world.get(Removed, e) != null) continue;
    const existing = world.get(VisualHandle, e);
    if (
      existing === undefined ||
      existing.role !== handle.role ||
      existing.wrapper !== handle.wrapper ||
      existing.sprite !== handle.sprite
    ) {
      world.set(VisualHandle, e, handle);
    }
  }

  for (const e of world.query(VisualHandle)) {
    const externalId = world.externalId(e);
    if (
      externalId === undefined ||
      !wantedExternalIds.has(externalId) ||
      world.get(Removed, e) != null
    ) {
      world.remove(VisualHandle, e);
    }
  }
}
