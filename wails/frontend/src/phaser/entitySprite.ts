import type Phaser from "phaser";
import type { CharacterFacing } from "../characters/heroes99";

/**
 * Common contract for any world/combat sprite wrapper (player, NPC, pet,
 * summon, etc.). Keeps callers such as WorldScene agnostic to whether the
 * underlying presentation is a layered character or a single-sheet enemy.
 */
export interface IEntitySprite {
  readonly container: Phaser.GameObjects.Container;

  getFacing(): CharacterFacing;
  setFacing(facing: CharacterFacing): void;

  setMoving(moving: boolean, dx?: number, dy?: number): void;

  playAttack(): void;
  playHit(battleSpeed?: number): void;

  setCasting(active: boolean): void;

  /** Advance animation state. Called by the scene update loop when in view. */
  update(delta: number): void;

  setInteractive(hitCallback: () => void): void;

  destroy(): void;
}
