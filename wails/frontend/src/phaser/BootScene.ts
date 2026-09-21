import Phaser from "phaser";
import { WorldScene } from "./WorldScene";
import { HouseScene } from "./HouseScene";

export class BootScene extends Phaser.Scene {
  constructor(private initialScene: "world" | "house" = "world") {
    super("boot");
  }

  preload() {
    // Appearance layers load in WorldScene / character sprites.
  }

  async create() {
    this.scene.start(this.initialScene);
  }
}

export function buildGameScenes(initialScene: "world" | "house" = "world") {
  return [new BootScene(initialScene), WorldScene, HouseScene];
}
