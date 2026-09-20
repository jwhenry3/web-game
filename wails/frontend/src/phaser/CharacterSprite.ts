import { SpineGameObject, type SpinePlugin } from "@esotericsoftware/spine-phaser-v4";
import Phaser from "phaser";
import {
  SPINE_CHAR_ATLAS,
  SPINE_CHAR_SKEL,
  SPINE_DOLL_ATLAS,
  SPINE_DOLL_SKEL,
  SPINE_QUAD_ATLAS,
  SPINE_QUAD_SKEL,
  ensureSpineAssets,
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

/** Track 0 loops idle/run; track 1 overlays one-shot attacks so legs keep
 * moving; track 2 plays partial pose overlays (e.g. "guard") that pin only
 * the bones they key. */
const TRACK_LOCOMOTION = 0;
const TRACK_ATTACK = 1;
const TRACK_GUARD = 2;
const TRACK_GUARD_F = 3;
const ATTACK_FADE_OUT = 0.15;
/** Retry window for failed spine loads — ~6s covers scene transitions. */
const SPINE_RETRY_MS = 400;
const SPINE_RETRY_MAX = 15;

// Weapons with palette variants (staff orbs, shield heraldry) key their
// attachments "<weapon>_<color>" instead of the bare weapon name.
const COLORED_WEAPONS = new Set(["weapon5", "weapon7"]);

function weaponVariantKey(w: string, color: string): string {
  return COLORED_WEAPONS.has(w) ? `${w}_${color}` : w;
}

// Far-side slots (background arm/leg and the far-hand weapon mounts) hide
// while mounted — they would draw over the mount's body otherwise.
const FAR_SIDE_SLOT = /(?:armB_[ul]|legB_[ul])$|^weapon_(?:bot|over)_/;

/** Slot name ("cloth_bot_torso", "hair_top_head", ...) -> attachment key. */
function attachmentForSlot(slot: string, a: CharacterAppearance): string | null {
  if (slot.startsWith("skin_")) return `skin_${a.skin}`;
  if (slot.startsWith("face_")) return `face_${a.face}`;
  if (slot.startsWith("hair_bot_") || slot.startsWith("hair_top_")) {
    return a.hair ? `hair_${a.hair}_${a.hairColor}` : null;
  }
  if (slot.startsWith("cloth_bot_") || slot.startsWith("cloth_top_")) {
    return a.cloth ? `${a.cloth}_${a.clothColor}` : null;
  }
  // Sub weapon on the far hand: weapon_bot_* draws under the arm, while
  // weapon_over_* (shields) straps over the forearm — still behind the
  // torso. Both checked before the shared weapon_ prefix.
  if (slot.startsWith("weapon_bot_") || slot.startsWith("weapon_over_")) {
    if (!a.subWeapon) return null;
    return weaponVariantKey(a.subWeapon, a.subWeaponColor ?? a.weaponColor);
  }
  if (slot.startsWith("weapon_")) {
    if (!a.weapon) return null;
    return weaponVariantKey(a.weapon, a.weaponColor);
  }
  // Creature parts — skin-toned variants key off the skin color.
  if (slot.startsWith("ears_")) return a.ears ? `ears_${a.ears}_${a.skin}` : null;
  if (slot.startsWith("tail_")) return a.tail ? `tail_${a.tail}_${a.skin}` : null;
  if (slot.startsWith("horns_")) return a.horns ? `horns_${a.horns}` : null;
  if (slot.startsWith("wings_")) return a.wings ? `wings_${a.wings}` : null;
  return null;
}

/** Skeleton/atlas pair backing the sprite; both rigs use appearance layers. */
export type CharacterRig = "h99doll" | "paperdoll" | "quaddoll";

/**
 * Shape-key morphs — bone scale axes per key, mirroring `shapeKeys` in the
 * generated specs (tools/gen_paperdoll.py + gen_quadruped.py SHAPE_KEYS).
 * "height" scales the hips on Y: the torso offset rises while the leg
 * attach points sit on the hip line, so the waist deepens and the feet
 * never move — and the torso and leg bones are shape-neutral, so no
 * artwork stretches. Keys union humanoid and quadruped bone names; bones a
 * rig doesn't have are skipped when the skeleton is walked.
 */
const SHAPE_KEYS: Record<
  string,
  {
    bones: Record<string, "x" | "y" | "xy">;
    damp?: Record<string, number>;
    /** Per-bone lift per unit of (v−1), applied to the local offset —
     * quaddoll leg-length keys raise chest/haunch so paws stay planted. */
    translate?: Record<string, { x?: number; y?: number }>;
  }
> = {
  // Height is leg-driven on both rigs — humanoids scale the hips (waist
  // deepens, feet planted); quadrupeds scale all four leg chains and lift
  // `body` by the grown length so the animal stands taller with paws
  // planted. Far legs damp 1.04 to match their slightly shorter chain.
  height: {
    bones: {
      hips: "y",
      legFF_u: "y", legFF_l: "y", legFB_u: "y", legFB_l: "y",
      legHF_u: "y", legHF_l: "y", legHB_u: "y", legHB_l: "y",
    },
    damp: { legFB_u: 1.04, legFB_l: 1.04, legHB_u: 1.04, legHB_l: 1.04 },
    translate: { body: { y: 13.0 } },
  },
  chest: { bones: { torso: "x" } },
  head: { bones: { head: "xy" } },
  armLen: { bones: { armF_u: "y", armF_l: "y", armB_u: "y", armB_l: "y" } },
  armWidth: { bones: { armF_u: "x", armF_l: "x", armB_u: "x", armB_l: "x" } },
  legWidth: {
    bones: {
      legF_u: "x",
      legF_l: "x",
      legB_u: "x",
      legB_l: "x",
      legFF_u: "x",
      legFF_l: "x",
      legFB_u: "x",
      legFB_l: "x",
      legHF_u: "x",
      legHF_l: "x",
      legHB_u: "x",
      legHB_l: "x",
    },
  },
  ears: { bones: { ears: "xy" } },
  horns: { bones: { horns: "xy" } },
  wings: { bones: { wings: "xy" } },
  tail: { bones: { tail: "xy", tail_u: "xy" } },
  weaponSize: { bones: { weapon: "xy" } },
  subWeaponSize: { bones: { weaponB: "xy" } },
  // Quadruped keys — root scales the whole beast planted at the ground
  // origin; bodyLen stretches the torso span between shoulder and haunch.
  size: { bones: { root: "xy" } },
  bodyLen: { bones: { body: "x" } },
};

/** Bones that cancel inherited body-morph scale — the bone keeps riding its
 * (morphed) world position but its own scale stays at the authored/keyed
 * value. Weapons keep their size while the grip stays in the fist; torso
 * and the upper-leg bones cancel the hips' height scale so the waist deepens
 * without any artwork stretching. Their own keys still apply on top. */
const SHAPE_NEUTRAL = new Set(["weapon", "weaponB", "torso", "legF_u", "legB_u"]);

const RIGS: Record<CharacterRig, { skel: string; atlas: string }> = {
  h99doll: { skel: SPINE_CHAR_SKEL, atlas: SPINE_CHAR_ATLAS },
  paperdoll: { skel: SPINE_DOLL_SKEL, atlas: SPINE_DOLL_ATLAS },
  quaddoll: { skel: SPINE_QUAD_SKEL, atlas: SPINE_QUAD_ATLAS },
};

/** Rig used for all player characters — the layered pixel-art paper doll. */
export const PLAYER_RIG: CharacterRig = "paperdoll";

export class CharacterSprite implements IEntitySprite {
  readonly container: Phaser.GameObjects.Container;
  private spine: SpineGameObject | null = null;
  private appearance: CharacterAppearance;
  private rig: CharacterRig;
  private appearanceCacheKey = "";
  private moving = false;
  private mounted = false;
  private anim: "idle" | "run" | "ride_idle" | "ride_run" = "idle";
  private facing: CharacterFacing = H99_FACING_DEFAULT;
  private loadToken = 0;
  private ready = false;
  private casting = false;
  private guardingFar = false;
  private guardingNear = false;
  /** Which hands currently hold a gripped weapon (not a shield) — decides
   * whether attack swings the near arm ("attack") or the far arm
   * ("attackB", used when the main hand carries a shield instead). */
  private mainWeaponMounted = false;
  private subWeaponMounted = false;
  private castPulse = 0;
  private hitCallback: (() => void) | null = null;
  private scene: Phaser.Scene;
  private hitFlash?: Phaser.Tweens.Tween;
  private destroyed = false;
  private retryIn = 0;
  private retries = 0;
  /** Animations authored as additive modifiers (flagged in the skeleton
   * JSON) — played with TrackEntry.additive so their tracks layer offsets
   * over lower tracks instead of replacing them. */
  private additiveAnims = new Set<string>();

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    appearance: CharacterAppearance,
    rig: CharacterRig = "h99doll",
  ) {
    this.scene = scene;
    this.rig = rig;
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
    // Mounting hides the far-side limb slots — re-resolve attachments.
    this.applyAttachments();
  }

  /** Rendered world position of a marker bone, matching what the spine
   * renderer draws (render offset and ancestor transforms included). flipX
   * is render-only — it never reaches bone world transforms — so mirror x
   * about the object's origin axis here. Null when the rig lacks the bone. */
  boneWorldPos(name: string): { x: number; y: number } | null {
    const obj = this.spine;
    const bone = obj?.skeleton.findBone(name);
    if (!obj || !bone) return null;
    const p = bone.appliedPose;
    const pt = { x: p.worldX, y: p.worldY };
    obj.skeletonToGame(pt);
    if (obj.flipX) {
      const tx = obj.getWorldTransformMatrix().tx;
      pt.x = 2 * tx - pt.x;
    }
    return pt;
  }

  playAttack(): void {
    this.casting = false;
    const st = this.spine?.animationState;
    if (!st) return;
    // Swing whichever hand holds a weapon — the far arm when the main hand
    // carries a shield ("attackB"), otherwise the near arm. Falls back to
    // "attack" on rigs without the variant or when no weapon is equipped.
    const far =
      !this.mainWeaponMounted &&
      this.subWeaponMounted &&
      this.spine!.skeleton.data.findAnimation("attackB");
    this.setTrack(TRACK_ATTACK, far ? "attackB" : "attack", false);
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
    this.applyShape();
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
    const { skel, atlas } = RIGS[this.rig];
    try {
      await ensureSpineAssets(this.scene, skel, atlas);
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
      // setMix throws for clips a rig doesn't have (quaddoll has no ride_*),
      // so only register pairs that exist in this skeleton.
      const mix = obj.animationStateData;
      const data = obj.skeleton.data;
      const mixPair = (from: string, to: string, d: number) => {
        if (data.findAnimation(from) && data.findAnimation(to)) mix.setMix(from, to, d);
      };
      mixPair("idle", "run", 0.12);
      mixPair("run", "idle", 0.12);
      mixPair("ride_idle", "ride_run", 0.15);
      mixPair("ride_run", "ride_idle", 0.15);
      mixPair("idle", "ride_idle", 0.2);
      mixPair("ride_idle", "idle", 0.2);
      mixPair("run", "ride_run", 0.2);
      mixPair("ride_run", "run", 0.2);
      mixPair("idle", "attack", 0.05);
      mixPair("run", "attack", 0.05);
      this.spine = obj;
      // SkeletonJson ignores the animation-level "additive" flag, but the
      // raw skeleton JSON stays in the JSON cache — read the flags from it.
      const raw = this.scene.cache.json.get(skel) as
        | { animations?: Record<string, { additive?: boolean }> }
        | undefined;
      this.additiveAnims = new Set(
        Object.entries(raw?.animations ?? {})
          .filter(([, a]) => a?.additive)
          .map(([name]) => name),
      );
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
    const { skel, atlas } = RIGS[this.rig];
    if (typeof factory.spine === "function") {
      return factory.spine(0, 0, skel, atlas);
    }
    const plugin = (this.scene.sys as unknown as { spine?: SpinePlugin }).spine;
    if (!plugin) throw new Error("SpinePlugin not installed on scene");
    const obj = new SpineGameObject(this.scene, plugin, {
      x: 0,
      y: 0,
      dataKey: skel,
      atlasKey: atlas,
    });
    this.scene.add.existing(obj);
    return obj;
  }

  /** Swap every slot's attachment to match the current appearance (paper doll). */
  private applyAttachments(): void {
    const skel = this.spine?.skeleton;
    const skin = skel?.data.defaultSkin;
    if (!skel || !skin) return;
    let guardFar = false;
    let guardNear = false;
    this.mainWeaponMounted = false;
    this.subWeaponMounted = false;
    for (const slot of skel.slots) {
      // While mounted the rider's far-side limbs (and whatever they carry)
      // tuck behind the mount's body — clear those slots entirely.
      const name =
        this.mounted && FAR_SIDE_SLOT.test(slot.data.name)
          ? null
          : attachmentForSlot(slot.data.name, this.appearance);
      // Missing variant/part combos clear the slot instead of throwing.
      const att = name ? skin.getAttachment(slot.data.index, name) : null;
      slot.pose.setAttachment(att);
      // Over-layer mounts (shields) put their arm into the guard pose;
      // gripped weapons decide which hand the attack swing uses.
      if (att && slot.data.name.startsWith("weapon_over_")) guardFar = true;
      if (att && slot.data.name.startsWith("weapon_front_")) guardNear = true;
      if (att && slot.data.name.startsWith("weapon_top_")) this.mainWeaponMounted = true;
      if (att && slot.data.name.startsWith("weapon_bot_")) this.subWeaponMounted = true;
    }
    this.applyGuard(TRACK_GUARD, "guardB", guardFar, this.guardingFar);
    this.guardingFar = guardFar;
    this.applyGuard(TRACK_GUARD_F, "guardF", guardNear, this.guardingNear);
    this.guardingNear = guardNear;
    this.applyShape();
  }

  /** Partial pose overlay on a higher track — "guardB" keys only the armB
   * chain and weaponB, "guardF" the armF chain and weapon, so a shield arm
   * holds its pose while idle/run/attack keep animating everything else.
   * No-op on rigs without the animation. */
  private applyGuard(
    track: number,
    anim: string,
    active: boolean,
    was: boolean,
  ): void {
    if (active === was) return;
    const st = this.spine?.animationState;
    if (!st) return;
    if (active && !this.spine!.skeleton.data.findAnimation(anim)) return;
    if (active) {
      this.setTrack(track, anim, true);
    } else {
      st.setEmptyAnimation(track, 0.2);
    }
  }

  /** Set an animation on a track, honoring the clip's "additive" flag so
   * modifier animations layer offsets over the pose below them. */
  private setTrack(track: number, name: string, loop: boolean) {
    const entry = this.spine!.animationState.setAnimation(track, name, loop);
    entry.additive = this.additiveAnims.has(name);
    return entry;
  }

  /**
   * Apply shape-key bone morphs. Bone scale isn't keyed by any animation, so
   * the values persist — but runs each frame anyway so animation mixes can't
   * leave a stale pose behind.
   */
  private applyShape(): void {
    const skel = this.spine?.skeleton;
    if (!skel) return;
    const shape = this.appearance.shape ?? {};
    const scales = new Map<string, { x: number; y: number }>();
    const shifts = new Map<string, { x: number; y: number }>();
    for (const [key, def] of Object.entries(SHAPE_KEYS)) {
      const v = shape[key];
      if (v === undefined || v === 1) continue;
      for (const [bone, axes] of Object.entries(def.bones)) {
        const s = scales.get(bone) ?? { x: 1, y: 1 };
        const eff = 1 + (v - 1) * (def.damp?.[bone] ?? 1);
        if (axes.includes("x")) s.x *= eff;
        if (axes.includes("y")) s.y *= eff;
        scales.set(bone, s);
      }
      for (const [bone, off] of Object.entries(def.translate ?? {})) {
        const t = shifts.get(bone) ?? { x: 0, y: 0 };
        t.x += (off.x ?? 0) * (v - 1);
        t.y += (off.y ?? 0) * (v - 1);
        shifts.set(bone, t);
      }
    }
    // Walk parent-first (skeleton bone order) tracking effective world
    // scale: a neutral bone divides out its parent's accumulated scale, so
    // its children inherit the corrected value, not the raw key multipliers.
    // Shape shifts add to the local offset in parent space — the parent's
    // own scale then carries the lift (composes with e.g. "size" on root).
    const world = new Map<string, { x: number; y: number }>();
    for (const bone of skel.bones) {
      const own = scales.get(bone.data.name) ?? { x: 1, y: 1 };
      const pw = bone.data.parent
        ? (world.get(bone.data.parent.name) ?? { x: 1, y: 1 })
        : { x: 1, y: 1 };
      const eff = SHAPE_NEUTRAL.has(bone.data.name)
        ? { x: own.x / pw.x, y: own.y / pw.y }
        : own;
      world.set(bone.data.name, { x: pw.x * eff.x, y: pw.y * eff.y });
      bone.pose.scaleX = (bone.data.setupPose.scaleX || 1) * eff.x;
      bone.pose.scaleY = (bone.data.setupPose.scaleY || 1) * eff.y;
      const sh = shifts.get(bone.data.name);
      if (sh) {
        bone.pose.x = bone.data.setupPose.x + sh.x;
        bone.pose.y = bone.data.setupPose.y + sh.y;
      }
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
    // Rigs without a clip (e.g. ride_* on quaddoll) fall back to idle.
    const name = this.spine!.skeleton.data.findAnimation(this.anim)
      ? this.anim
      : "idle";
    const current = st.tracks[TRACK_LOCOMOTION];
    if (!current || current.animation?.name !== name) {
      this.setTrack(TRACK_LOCOMOTION, name, true);
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
    // Art centers around the root x (quadruped tails reach well past it),
    // so bound x by half the width to either side.
    o.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-o.width / 2, -o.height, o.width, o.height),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    o.on("pointerdown", this.hitCallback);
  }
}
