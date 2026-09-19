import { SpineGameObject, type SpinePlugin } from "@esotericsoftware/spine-phaser-v4";
import Phaser from "phaser";
import {
  SPINE_CHAR_ATLAS,
  SPINE_CHAR_SKEL,
  ensureSpineCharacterAssets,
} from "../characters/assets";
import {
  H99_DISPLAY_SCALE,
  H99_FACING_DEFAULT,
  appearanceKey,
  facingFromDelta,
  facingToFlipX,
  type CharacterAppearance,
  type CharacterFacing,
} from "../characters/heroes99";
import { playHitFlash } from "./battleAnim";
import type { IEntitySprite } from "./entitySprite";

/** Track 0 loops idle/run; track 1 overlays one-shot attacks so legs keep moving. */
const TRACK_LOCOMOTION = 0;
const TRACK_ATTACK = 1;
const ATTACK_FADE_OUT = 0.15;
/** Retry window for failed spine loads — ~6s covers scene transitions. */
const SPINE_RETRY_MS = 400;
const SPINE_RETRY_MAX = 15;

/** Slot name ("cloth_bot_torso", "hair_top_head", ...) -> attachment key. */
function attachmentForSlot(slot: string, a: CharacterAppearance): string | null {
  if (slot.startsWith("skin_")) return `skin_${a.skin}`;
  if (slot.startsWith("face_")) return `face_${a.face}`;
  if (slot.startsWith("hair_bot_") || slot.startsWith("hair_top_")) {
    return `hair_${a.hair}_${a.hairColor}`;
  }
  if (slot.startsWith("cloth_bot_") || slot.startsWith("cloth_top_")) {
    return `${a.cloth}_${a.clothColor}`;
  }
  if (slot.startsWith("weapon_")) {
    return a.weapon === "weapon5" ? `weapon5_${a.weaponColor}` : a.weapon;
  }
  return null;
}

export class CharacterSprite implements IEntitySprite {
  readonly container: Phaser.GameObjects.Container;
  private spine: SpineGameObject | null = null;
  private appearance: CharacterAppearance;
  private appearanceCacheKey = "";
  private moving = false;
  private mounted = false;
  private anim: "idle" | "run" | "ride_idle" | "ride_run" = "idle";
  private facing: CharacterFacing = H99_FACING_DEFAULT;
  private loadToken = 0;
  private ready = false;
  private casting = false;
  private castPulse = 0;
  private hitCallback: (() => void) | null = null;
  private scene: Phaser.Scene;
  private hitFlash?: Phaser.Tweens.Tween;
  private destroyed = false;
  private retryIn = 0;
  private retries = 0;

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
    void this.syncSpine();
  }

  getFacing(): CharacterFacing {
    return this.facing;
  }

  setFacing(facing: CharacterFacing): void {
    if (facing === this.facing) return;
    this.facing = facing;
    this.applyFlip();
  }

  setAppearance(appearance: CharacterAppearance): void {
    const key = appearanceKey(appearance);
    if (key === this.appearanceCacheKey) return;
    this.appearance = { ...appearance };
    this.appearanceCacheKey = key;
    this.applyAttachments();
  }

  setMoving(moving: boolean, dx = 0, _dy = 0): void {
    this.facing = facingFromDelta(dx, this.facing);
    this.moving = moving;
    this.updateAnim();
    this.applyFlip();
  }

  setMounted(mounted: boolean): void {
    if (mounted === this.mounted) return;
    this.mounted = mounted;
    this.updateAnim();
  }

  playAttack(): void {
    this.casting = false;
    const st = this.spine?.animationState;
    if (!st) return;
    st.setAnimation(TRACK_ATTACK, "attack", false);
    st.addEmptyAnimation(TRACK_ATTACK, ATTACK_FADE_OUT, 0);
  }

  playHit(battleSpeed?: number): void {
    this.hitFlash = playHitFlash(this.scene, this.container, this.hitFlash, battleSpeed, 0.35);
  }

  setCasting(active: boolean): void {
    if (this.casting === active) return;
    this.casting = active;
    this.castPulse = 0;
  }

  update(delta: number): void {
    const skel = this.spine?.skeleton;
    if (!skel) {
      if (this.retryIn > 0) {
        this.retryIn -= delta;
        if (this.retryIn <= 0) void this.syncSpine();
      }
      return;
    }
    if (this.casting) {
      this.castPulse += delta;
      const pulse = 0.85 + 0.15 * Math.sin(this.castPulse / 140);
      skel.color.set((0xc4 / 255) * pulse, (0xb5 / 255) * pulse, (0xfd / 255) * pulse, 1);
    } else {
      skel.color.set(1, 1, 1, 1);
    }
  }

  setInteractive(hitCallback: () => void): void {
    this.hitCallback = hitCallback;
    this.applyInteractive();
  }

  destroy(): void {
    this.destroyed = true;
    this.loadToken += 1;
    this.container.destroy();
  }

  private scheduleRetry(why: string, err?: unknown): void {
    if (this.destroyed) return;
    if (this.retries >= SPINE_RETRY_MAX) {
      if (this.retries === SPINE_RETRY_MAX) {
        this.retries += 1;
        console.error("[CharacterSprite] spine rig unavailable, giving up:", why, err);
      }
      return;
    }
    this.retries += 1;
    this.retryIn = SPINE_RETRY_MS;
    console.warn("[CharacterSprite] spine rig failed, will retry:", why, err);
  }

  private async syncSpine(): Promise<void> {
    const token = ++this.loadToken;
    try {
      await ensureSpineCharacterAssets(this.scene);
    } catch (err) {
      this.scheduleRetry("asset load", err);
      return;
    }
    if (token !== this.loadToken || this.destroyed) return;

    if (!this.spine) {
      let obj: SpineGameObject;
      try {
        obj = this.createSpineObject();
      } catch (err) {
        this.scheduleRetry("spine object creation", err);
        return;
      }
      obj.setScale(H99_DISPLAY_SCALE);
      this.container.add(obj);
      const mix = obj.animationStateData;
      mix.setMix("idle", "run", 0.12);
      mix.setMix("run", "idle", 0.12);
      mix.setMix("ride_idle", "ride_run", 0.15);
      mix.setMix("ride_run", "ride_idle", 0.15);
      mix.setMix("idle", "ride_idle", 0.2);
      mix.setMix("ride_idle", "idle", 0.2);
      mix.setMix("run", "ride_run", 0.2);
      mix.setMix("ride_run", "run", 0.2);
      mix.setMix("idle", "attack", 0.05);
      mix.setMix("run", "attack", 0.05);
      this.spine = obj;
    }

    this.retryIn = 0;
    this.applyAttachments();
    this.ready = true;
    this.applyAnim();
    this.applyFlip();
    this.applyInteractive();
  }

  /**
   * Prefer the `add.spine` factory when the plugin registered it, else build
   * the object directly via the scene's SpinePlugin instance (`sys.spine`).
   * The factory registration patches GameObjectFactory's prototype — which can
   * be absent if the plugin's Phaser module instance differs from the app's —
   * while `sys.spine` is installed per-scene and always present once the
   * loader-side file types worked.
   */
  private createSpineObject(): SpineGameObject {
    const factory = this.scene.add as Phaser.GameObjects.GameObjectFactory & {
      spine?: (x: number, y: number, dataKey: string, atlasKey: string) => SpineGameObject;
    };
    if (typeof factory.spine === "function") {
      return factory.spine(0, 0, SPINE_CHAR_SKEL, SPINE_CHAR_ATLAS);
    }
    const plugin = (this.scene.sys as unknown as { spine?: SpinePlugin }).spine;
    if (!plugin) throw new Error("SpinePlugin not installed on scene");
    const obj = new SpineGameObject(this.scene, plugin, {
      x: 0,
      y: 0,
      dataKey: SPINE_CHAR_SKEL,
      atlasKey: SPINE_CHAR_ATLAS,
    });
    this.scene.add.existing(obj);
    return obj;
  }

  /** Swap every slot's attachment to match the current appearance (paper doll). */
  private applyAttachments(): void {
    const skel = this.spine?.skeleton;
    const skin = skel?.data.defaultSkin;
    if (!skel || !skin) return;
    for (const slot of skel.slots) {
      const name = attachmentForSlot(slot.data.name, this.appearance);
      // Missing variant/part combos clear the slot instead of throwing.
      slot.pose.setAttachment(name ? skin.getAttachment(slot.data.index, name) : null);
    }
  }

  /** Recompute the locomotion animation from moving/mounted state. */
  private updateAnim(): void {
    const next = this.mounted
      ? this.moving ? "ride_run" : "ride_idle"
      : this.moving ? "run" : "idle";
    if (next === this.anim) return;
    this.anim = next;
    this.applyAnim();
  }

  private applyAnim(): void {
    const st = this.spine?.animationState;
    if (!st || !this.ready) return;
    const current = st.tracks[TRACK_LOCOMOTION];
    if (!current || current.animation?.name !== this.anim) {
      st.setAnimation(TRACK_LOCOMOTION, this.anim, true);
    }
  }

  private applyFlip(): void {
    if (!this.spine) return;
    this.spine.flipX = facingToFlipX(this.facing);
  }

  private applyInteractive(): void {
    if (!this.hitCallback || !this.spine || this.spine.input?.enabled) return;
    const o = this.spine;
    // Hit space adds displayOrigin to skeleton space; the body draws upward
    // from the feet (skeleton y-up -> local y-down), so cover y in [-h, 0].
    o.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, -o.height, o.width, o.height),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    o.on("pointerdown", this.hitCallback);
  }
}
