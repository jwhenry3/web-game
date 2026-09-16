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
  return [BootScene, WorldScene, HouseScene];
}
