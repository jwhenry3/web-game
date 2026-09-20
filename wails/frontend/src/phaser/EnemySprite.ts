import Phaser from "phaser";
import {
  H99_ANIMS,
  H99_DISPLAY_SCALE,
  H99_FACING_DEFAULT,
  H99_ORIGIN,
  facingFromDelta,
  facingToFlipX,
  frameForAnim,
  layerOriginX,
  type CharacterAnim,
  type CharacterFacing,
} from "../characters/heroes99";
import { ensureEnemyTextures } from "../characters/enemyAssets";
import {
  ENEMY_DOLL_PRESETS,
  enemyDollAppearance,
  enemyTextureKey,
  type EnemyKind,
} from "../characters/enemies";
import { playHitFlash } from "./battleAnim";
import { CharacterSprite, type CharacterRig } from "./CharacterSprite";
import type { IEntitySprite } from "./entitySprite";

export class EnemySprite implements IEntitySprite {
  readonly container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite | null = null;
  /** Doll kinds delegate to a Spine rig — humanoids on paperdoll, beasts on
   * quaddoll. */
  private doll: CharacterSprite | null = null;
  private dollRig: CharacterRig | null = null;
  private kind: EnemyKind;
  private anim: CharacterAnim = "idle";
  private frame = 0;
  private frameTimer = 0;
  private facing: CharacterFacing = H99_FACING_DEFAULT;
  private ready = false;
  private hitCallback: (() => void) | null = null;
  private scene: Phaser.Scene;
  private casting = false;
  private castPulse = 0;
  private loadToken = 0;
  private hitFlash?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind) {
    this.scene = scene;
    this.kind = kind;
    this.container = new Phaser.GameObjects.Container(scene, x, y);
    this.syncKind();
  }

  getFacing(): CharacterFacing {
    return this.doll ? this.doll.getFacing() : this.facing;
  }

  setFacing(facing: CharacterFacing): void {
    if (this.doll) {
      this.doll.setFacing(facing);
      return;
    }
    if (facing === this.facing) return;
    this.facing = facing;
    if (this.ready) this.applyFrame();
  }

  setKind(kind: EnemyKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.syncKind();
  }

  /**
   * Rebuild the backing sprite for the current kind — humanoid kinds get a
   * paper-doll CharacterSprite child, the rest a pixel-art sheet sprite.
   */
  private syncKind(): void {
    const preset = ENEMY_DOLL_PRESETS[this.kind];
    if (preset) {
      const rig = preset.rig ?? "paperdoll";
      const appearance = enemyDollAppearance(this.kind);
      if (!this.doll || this.dollRig !== rig) {
        this.loadToken += 1; // cancel any in-flight sheet load
        this.sprite?.destroy();
        this.sprite = null;
        this.ready = false;
        this.doll?.destroy();
        this.doll = new CharacterSprite(this.scene, 0, 0, appearance, rig);
        this.dollRig = rig;
        this.container.add(this.doll.container);
        if (this.hitCallback) this.doll.setInteractive(this.hitCallback);
      } else {
        this.doll.setAppearance(appearance);
      }
      this.doll.container.setScale(preset.scale);
      return;
    }
    if (this.doll) {
      this.doll.destroy();
      this.doll = null;
      this.dollRig = null;
    }
    this.sprite?.destroy();
    this.sprite = null;
    this.ready = false;
    void this.syncSprite();
  }

  setMoving(moving: boolean, dx = 0, _dy = 0): void {
    if (this.doll) {
      this.doll.setMoving(moving, dx, _dy);
      return;
    }
    const nextFacing = facingFromDelta(dx, this.facing);
    const facingChanged = nextFacing !== this.facing;
    this.facing = nextFacing;

    if (this.anim === "attack") {
      if (this.ready && facingChanged) this.applyFrame();
      return;
    }

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
    this.casting = false;
    if (this.doll) {
      this.doll.playAttack();
      return;
    }
    this.anim = "attack";
    this.frame = 0;
    this.frameTimer = 0;
    if (this.ready) this.applyFrame();
  }

  playHit(battleSpeed?: number): void {
    if (this.doll) {
      this.doll.playHit(battleSpeed);
      return;
    }
    if (!this.sprite) return;
    this.hitFlash = playHitFlash(this.scene, this.sprite, this.hitFlash, battleSpeed, 0.4);
  }

  setCasting(active: boolean): void {
    if (this.casting === active) return;
    this.casting = active;
    this.castPulse = 0;
    if (this.doll) {
      this.doll.setCasting(active);
      return;
    }
    if (active) {
      this.anim = "idle";
      this.frame = 0;
      this.frameTimer = 0;
    }
    if (this.ready) this.applyFrame();
  }

  update(delta: number): void {
    if (this.doll) {
      this.doll.update(delta);
      return;
    }
    if (!this.ready) return;
    if (this.casting && this.sprite) {
      this.castPulse += delta;
      const pulse = 0.85 + 0.15 * Math.sin(this.castPulse / 140);
      const tint = Phaser.Display.Color.GetColor(
        Math.floor(0xc4 * pulse),
        Math.floor(0xb5 * pulse),
        Math.floor(0xfd * pulse),
      );
      this.sprite.setTint(tint);
    } else {
      this.sprite?.clearTint();
    }
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
    if (this.doll) {
      this.doll.setInteractive(hitCallback);
      return;
    }
    this.applyInteractive();
  }

  destroy(): void {
    this.loadToken += 1;
    this.doll?.destroy();
    this.container.destroy();
  }

  private async syncSprite(): Promise<void> {
    const token = ++this.loadToken;
    try {
      await ensureEnemyTextures(this.scene);
    } catch {
      return;
    }
    if (token !== this.loadToken) return;

    const key = enemyTextureKey(this.kind);
    if (!this.scene.textures.exists(key)) return;

    this.sprite = this.scene.add.sprite(0, 0, key, 0);
    this.sprite.setOrigin(H99_ORIGIN.x, H99_ORIGIN.y);
    this.sprite.setScale(H99_DISPLAY_SCALE);
    this.container.add(this.sprite);
    this.ready = true;
    this.applyFrame();
    this.applyInteractive();
  }

  private applyInteractive(): void {
    if (!this.hitCallback || !this.sprite || this.sprite.input?.enabled) return;
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerdown", this.hitCallback);
  }

  private applyFrame(): void {
    if (!this.ready || !this.sprite) return;
    const idx = frameForAnim(this.anim, this.frame);
    const flipX = facingToFlipX(this.facing);
    const originX = layerOriginX(this.facing);
    this.sprite.setFrame(idx);
    this.sprite.setOrigin(originX, H99_ORIGIN.y);
    this.sprite.setFlipX(flipX);
    this.sprite.x = 0;
  }
}
