import Phaser from "phaser";
import { ensureLayerTextures } from "../characters/assets";
import {
  H99_ANIMS,
  H99_DISPLAY_SCALE,
  H99_FACING_DEFAULT,
  H99_LAYER_ORDER,
  H99_ORIGIN,
  appearanceKey,
  facingFromDelta,
  facingToFlipX,
  frameForAnim,
  layerOffsetX,
  layerOriginX,
  layerTextureKey,
  type CharacterAnim,
  type CharacterAppearance,
  type CharacterFacing,
} from "../characters/heroes99";

const LAYER_DEPTH: Record<string, number> = {
  skin: 0,
  cloth_bot: 1,
  hair_bot: 2,
  face: 3,
  cloth_top: 4,
  hair_top: 5,
  weapon_bot: 6,
  weapon_top: 7,
};

export class CharacterSprite {
  readonly container: Phaser.GameObjects.Container;
  private layers = new Map<string, Phaser.GameObjects.Sprite>();
  private appearance: CharacterAppearance;
  private appearanceCacheKey = "";
  private anim: CharacterAnim = "idle";
  private frame = 0;
  private frameTimer = 0;
  private facing: CharacterFacing = H99_FACING_DEFAULT;
  private loadToken = 0;
  private ready = false;
  private hitCallback: (() => void) | null = null;
  private scene: Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    appearance: CharacterAppearance,
  ) {
    this.scene = scene;
    this.appearance = { ...appearance };
    this.appearanceCacheKey = appearanceKey(appearance);
    // Container is not auto-added to the scene — parent wrapper owns display list.
    this.container = new Phaser.GameObjects.Container(scene, x, y);
    void this.syncLayers();
  }

  getFacing(): CharacterFacing {
    return this.facing;
  }

  setAppearance(appearance: CharacterAppearance): void {
    const key = appearanceKey(appearance);
    if (key === this.appearanceCacheKey) return;
    this.appearance = { ...appearance };
    this.appearanceCacheKey = key;
    void this.syncLayers();
  }

  setMoving(moving: boolean, dx = 0, _dy = 0): void {
    const nextFacing = facingFromDelta(dx, this.facing);
    const facingChanged = nextFacing !== this.facing;
    this.facing = nextFacing;

    const nextAnim: CharacterAnim = moving ? "run" : "idle";
    const animChanged = nextAnim !== this.anim;
    if (animChanged) {
      this.anim = nextAnim;
      this.frame = 0;
      this.frameTimer = 0;
    }

    if (this.ready && (facingChanged || animChanged)) {
      this.applyFrame();
    }
  }

  playAttack(): void {
    this.anim = "attack";
    this.frame = 0;
    this.frameTimer = 0;
    if (this.ready) this.applyFrame();
  }

  update(delta: number): void {
    if (!this.ready) return;
    const { frames, msPerFrame } = H99_ANIMS[this.anim];
    this.frameTimer += delta;
    if (this.frameTimer >= msPerFrame) {
      this.frameTimer = 0;
      this.frame = (this.frame + 1) % frames.length;
      if (this.anim === "attack" && this.frame === 0) {
        this.anim = "idle";
      }
      this.applyFrame();
    }
  }

  setInteractive(hitCallback: () => void): void {
    this.hitCallback = hitCallback;
    this.applyInteractive();
  }

  private applyInteractive(): void {
    if (!this.hitCallback) return;
    const body = this.layers.get("skin");
    if (!body || body.input?.enabled) return;
    body.setInteractive({ useHandCursor: true });
    body.on("pointerdown", this.hitCallback);
  }

  destroy(): void {
    this.container.destroy();
  }

  private async syncLayers(): Promise<void> {
    const token = ++this.loadToken;
    const appearance = { ...this.appearance };
    try {
      await ensureLayerTextures(this.scene, appearance);
    } catch {
      return;
    }
    if (token !== this.loadToken) return;

    for (const layer of H99_LAYER_ORDER) {
      const key = layerTextureKey(layer, appearance);
      if (!this.scene.textures.exists(key)) continue;

      let sprite = this.layers.get(layer);
      if (sprite) {
        if (sprite.texture.key !== key) {
          sprite.setTexture(key, frameForAnim(this.anim, this.frame));
        }
        continue;
      }

      sprite = this.scene.add.sprite(0, 0, key, 0);
      sprite.setOrigin(H99_ORIGIN.x, H99_ORIGIN.y);
      sprite.setScale(H99_DISPLAY_SCALE);
      sprite.setDepth(LAYER_DEPTH[layer] ?? 0);
      this.layers.set(layer, sprite);
      this.container.add(sprite);
    }

    this.ready = true;
    this.applyFrame();
    this.applyInteractive();
  }

  private applyFrame(): void {
    if (!this.ready) return;
    const idx = frameForAnim(this.anim, this.frame);
    const flipX = facingToFlipX(this.facing);
    const originX = layerOriginX(this.facing);
    const offsetX = layerOffsetX(this.facing);
    for (const sprite of this.layers.values()) {
      sprite.setFrame(idx);
      sprite.setOrigin(originX, H99_ORIGIN.y);
      sprite.setFlipX(flipX);
      sprite.x = offsetX;
    }
  }
}
