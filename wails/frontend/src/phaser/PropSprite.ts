import { SpineGameObject, type SpinePlugin } from "@esotericsoftware/spine-phaser-v4";
import Phaser from "phaser";
import {
  SPINE_PROP_ATLAS,
  SPINE_PROP_SKEL,
  ensureSpineAssets,
} from "../characters/assets";
import { H99_DISPLAY_SCALE } from "../characters/heroes99";

/** Retry window for failed spine loads — mirrors CharacterSprite. */
const SPINE_RETRY_MS = 400;
const SPINE_RETRY_MAX = 15;
/** Same composite silhouette contour the character rigs wear. */
const OUTLINE_COLOR = 0x2c1e36;
const OUTLINE_STRENGTH = 8;
const OUTLINE_DISTANCE = 2;
/** Outline radius in skeleton units — ~2 atlas px at the 4px/unit density. */
const OUTLINE_THICKNESS = 0.5;

/**
 * Static prop on the propdoll rig (tools/gen_props.py): tents, save crystals,
 * signposts and pickups share one skeleton — one bone + one slot per prop
 * kind, each slot holding several attachment variants (e.g. tent_basic…
 * tent_royal). The rig's bones are spread horizontally so the editor shows
 * every prop in a row; this class zeroes the shared bone offsets at load so
 * each prop anchors at its own point.
 */
export class PropSprite {
  readonly container: Phaser.GameObjects.Container;
  private spine: SpineGameObject | null = null;
  private scene: Phaser.Scene;
  private destroyed = false;
  private retries = 0;
  private loadToken = 0;
  /** Slot → attachment key currently applied. */
  private props: Record<string, string> = {};
  private outline?: Phaser.Filters.Glow;

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    this.scene = scene;
    // Container is not auto-added to the scene — parent wrapper owns it.
    this.container = new Phaser.GameObjects.Container(scene, x, y);
    void this.syncSpine();
  }

  /** Show the given slot→attachment map; every other slot is cleared. */
  setProps(props: Record<string, string>): void {
    this.props = { ...props };
    this.applyProps();
  }

  destroy(): void {
    this.destroyed = true;
    this.loadToken += 1;
    this.container.destroy();
  }

  private applyProps(): void {
    const skel = this.spine?.skeleton;
    const skin = skel?.data.defaultSkin;
    if (!skel || !skin) return;
    for (const slot of skel.slots) {
      const key = this.props[slot.data.name];
      const att = key ? skin.getAttachment(slot.data.index, key) : null;
      slot.pose.setAttachment(att);
    }
  }

  private async syncSpine(): Promise<void> {
    const token = ++this.loadToken;
    try {
      await ensureSpineAssets(this.scene, SPINE_PROP_SKEL, SPINE_PROP_ATLAS);
    } catch (err) {
      this.scheduleRetry("asset load", err);
      return;
    }
    if (token !== this.loadToken || this.destroyed) return;

    try {
      const obj = this.createSpineObject();
      obj.setScale(H99_DISPLAY_SCALE);
      // The rig spreads prop bones horizontally for the editor and bakes
      // attachment offsets relative to that spread; world props each anchor
      // at their own point — fold each bone's editor offset into its slot's
      // attachments, then collapse the bones to the root. Shared skeleton
      // data is fine to mutate: PropSprite is the rig's only consumer.
      const offsets = new Map<string, { x: number; y: number }>();
      for (const boneData of obj.skeleton.data.bones) {
        if (boneData.name !== "root") {
          offsets.set(boneData.name, {
            x: boneData.setupPose.x,
            y: boneData.setupPose.y,
          });
          boneData.setupPose.x = 0;
          boneData.setupPose.y = 0;
        }
      }
      const skin = obj.skeleton.data.defaultSkin;
      for (const slotData of obj.skeleton.data.slots) {
        const off = offsets.get(slotData.boneData.name);
        const atts = off && skin?.attachments[slotData.index];
        if (!off || !atts || (!off.x && !off.y)) continue;
        for (const att of Object.values(atts)) {
          const region = att as {
            x?: number;
            y?: number;
            updateSequence?: () => void;
          };
          if (typeof region.x === "number") region.x += off.x;
          if (typeof region.y === "number") region.y += off.y;
          // x/y feed the attachment's precomputed vertex offsets — without
          // updateSequence the render keeps the stale baked position.
          region.updateSequence?.();
        }
      }
      obj.skeleton.setupPose();
      this.container.add(obj);
      // Same outline convention as CharacterSprite — one composite
      // silhouette so the prop reads as part of the same world.
      this.container.setSize(
        obj.width * H99_DISPLAY_SCALE,
        obj.height * H99_DISPLAY_SCALE,
      );
      this.container.enableFilters();
      this.container.focusFilters = () => {
        const bounds = obj.skeleton.getBoundsRect();
        if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) {
          return this.container;
        }
        const padding = OUTLINE_DISTANCE + 2;
        const halfWidth = Math.ceil(Math.max(
          Math.abs(bounds.x + obj.renderOffsetX),
          Math.abs(bounds.x + bounds.width + obj.renderOffsetX),
        ) * Math.abs(obj.scaleX) + Math.abs(obj.x) + padding);
        const halfHeight = Math.ceil(Math.max(
          Math.abs(bounds.y + obj.renderOffsetY),
          Math.abs(bounds.y + bounds.height + obj.renderOffsetY),
        ) * Math.abs(obj.scaleY) + Math.abs(obj.y) + padding);
        this.container.focusFiltersOverride(
          halfWidth, halfHeight, halfWidth * 2, halfHeight * 2,
        );
        if (this.outline) {
          this.outline.scale = OUTLINE_THICKNESS * H99_DISPLAY_SCALE *
            this.scene.cameras.main.zoom *
            (window.devicePixelRatio || 1) / OUTLINE_DISTANCE;
        }
        this.container.filtersAutoFocus = true;
        return this.container;
      };
      this.outline = this.container.filters?.internal.addGlow(
        OUTLINE_COLOR, OUTLINE_STRENGTH, 0, 1, false, 8, OUTLINE_DISTANCE,
      );
      if (obj.skeleton.data.findAnimation("idle")) {
        obj.animationState.setAnimation(0, "idle", true);
      }
      this.spine = obj;
      this.retries = 0;
      this.applyProps();
    } catch (err) {
      this.scheduleRetry("spine object creation", err);
    }
  }

  private scheduleRetry(why: string, err?: unknown): void {
    if (this.destroyed) return;
    if (this.retries >= SPINE_RETRY_MAX) {
      if (this.retries === SPINE_RETRY_MAX) {
        this.retries += 1;
        console.error("[PropSprite] spine rig unavailable, giving up:", why, err);
      }
      return;
    }
    this.retries += 1;
    console.warn("[PropSprite] spine rig failed, will retry:", why, err);
    this.scene.time.delayedCall(SPINE_RETRY_MS, () => {
      if (!this.destroyed) void this.syncSpine();
    });
  }

  /**
   * Prefer the `add.spine` factory when the plugin registered it, else build
   * the object via the scene's SpinePlugin instance — same fallback as
   * CharacterSprite.createSpineObject.
   */
  private createSpineObject(): SpineGameObject {
    const factory = this.scene.add as Phaser.GameObjects.GameObjectFactory & {
      spine?: (x: number, y: number, dataKey: string, atlasKey: string) => SpineGameObject;
    };
    if (typeof factory.spine === "function") {
      return factory.spine(0, 0, SPINE_PROP_SKEL, SPINE_PROP_ATLAS);
    }
    const plugin = (this.scene.sys as unknown as { spine?: SpinePlugin }).spine;
    if (!plugin) throw new Error("SpinePlugin not installed on scene");
    const obj = new SpineGameObject(this.scene, plugin, {
      x: 0,
      y: 0,
      dataKey: SPINE_PROP_SKEL,
      atlasKey: SPINE_PROP_ATLAS,
    });
    this.scene.add.existing(obj);
    return obj;
  }
}
