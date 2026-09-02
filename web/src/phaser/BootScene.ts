import Phaser from "phaser";
import { preloadAppearance } from "../characters/assets";
import { ensureEnemyTextures } from "../characters/enemyAssets";
import { DEFAULT_APPEARANCE } from "../characters/heroes99";
import { WorldScene } from "./WorldScene";
import { BattleScene } from "./BattleScene";

/** Loads default Heroes 99 layers, then hands off to the world scene. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    preloadAppearance(this.load, DEFAULT_APPEARANCE);
  }

  async create() {
    await ensureEnemyTextures(this);
    this.scene.start("world");
  }
}

export const GAME_SCENES = [BootScene, WorldScene, BattleScene];
