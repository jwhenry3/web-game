import Phaser from "phaser";
import { WorldScene } from "./WorldScene";
import { HouseScene } from "./HouseScene";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    // Appearance layers load in WorldScene / character sprites.
  }

  async create() {
    this.scene.start("world");
  }
}

export function buildGameScenes(): (typeof Phaser.Scene)[] {
  const scenes: (typeof Phaser.Scene)[] = [BootScene, WorldScene, HouseScene];
  const battleCtor = (window as unknown as { __battleSceneCtor?: new () => Phaser.Scene }).__battleSceneCtor;
  if (battleCtor) {
    scenes.push(battleCtor);
  }
  return scenes;
}
