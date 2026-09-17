import type Phaser from "phaser";
import { enemyKindFromName } from "../characters/enemies";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";
import { useGame } from "../state/store";
import type { WorldEntity } from "../types";
import { CharacterSprite } from "./CharacterSprite";
import { EnemySprite } from "./EnemySprite";
import type { IEntitySprite } from "./entitySprite";

/**
 * Presentation constants shared across entity kinds. These are intentionally
 * read-only descriptors; callers such as WorldScene still own lifecycle,
 * movement, and overlays.
 */
export const ENTITY_PRESENTATION = {
  /** Scene display depth for combat-only extras (summons, battle-only actors). */
  combatExtraDepth: 10,
  /** Default world shadow scale for a standard humanoid-sized entity. */
  defaultShadowScale: 1,
  /** Depth for player avatars. */
  playerDepth: 10,
  /** Depth for NPC / enemy avatars. */
  foeDepth: 9,
  /** Depth for pet followers. */
  petDepth: 8,
  /** Scale applied to pet follower sprites. */
  petFollowScale: 0.55,
} as const;

/**
 * Entity kind categories used by the sprite factory. This is a narrow,
 * frontend-only view of the entity type — just enough to pick the right
 * renderer adapter.
 */
export type EntitySpriteKind = "player" | "enemy" | "pet";

/**
 * Build the correct sprite adapter for an arbitrary world entity.
 * Centralises the kind-branch that previously lived in WorldScene.
 */
export function createSpriteForEntity(
  scene: Phaser.Scene,
  entity: WorldEntity,
): IEntitySprite {
  const state = useGame.getState();
  if (entity.kind === "player") {
    const appearance = resolveCharacterAppearance({
      playerId: entity.id,
      selfId: state.selfId,
      profile: state.profile,
      race: entity.sprite,
      weapon: entity.weapon,
      wire: entity.appearance,
    });
    return new CharacterSprite(scene, 0, 0, appearance);
  }

  const kind = enemyKindFromName(entity.name, entity.sprite);
  return new EnemySprite(scene, 0, 0, kind);
}

/**
 * Build a sprite adapter for a pet follower. Pets are always rendered with
 * the enemy sprite sheet at a reduced scale.
 */
export function createPetSprite(
  scene: Phaser.Scene,
  entity: WorldEntity,
): IEntitySprite {
  const kind = enemyKindFromName(entity.name, entity.sprite);
  const sprite = new EnemySprite(scene, 0, 0, kind);
  sprite.container.setScale(ENTITY_PRESENTATION.petFollowScale);
  return sprite;
}
