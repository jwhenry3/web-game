// Movement controller for WorldScene — owns the local player's input-driven
// motion: WASD/hotkey movement, click-to-move with breadcrumbs, the dodge
// dash, and throttled position sends. WorldScene keeps orchestration; this
// class keeps the per-frame movement state machine out of the scene file.

import Phaser from "phaser";
import { net } from "../net/socket";
import { uiOwnsKeyboard, useGame } from "../state/store";
import {
  facingFromDelta,
  facingFromYaw,
  H99_FACING_DEFAULT,
  H99_WORLD_RING_RADIUS,
  H99_WORLD_RING_Y,
  type CharacterFacing,
} from "../characters/types";
import { applyPlayerSlide, H99_COLLISION_RADIUS } from "./movementBridge";
import { mergeKeybinds, resolveHotbarSlot, bindingToPhaserKeyCode } from "../input/keybinds";
import { findPath, type PathPoint } from "../world/pathfind";
import { playDodgeVfx } from "./battleVfx";
import { battleDuration, DEFAULT_BATTLE_SPEED } from "./battleAnim";
import {
  isoLayer,
  isoParent,
  isoProject,
  moveDirFor,
  moveSpeedScaleFor,
  screenToWorldX,
  screenToWorldY,
  sortDepth,
} from "../world/iso";
import { setWorldLocalPos } from "../world/worldLocalPos";
import type { OverworldMap, WorldEntity } from "../types";
import type { CharacterSprite } from "./CharacterSprite";

const SPEED = 180; // matches house movement
/** Riding speed bonus — mirrors the server's mountMoveMult clamp. */
const MOUNT_SPEED_MULT = 1.25;
const SEND_INTERVAL = 100;

/** Dodge dash distance — two 32px squares (matches the old realtime battle dash). */
const DODGE_DIST = 64;
/** Local dodge cooldown mirror — the server enforces the authoritative 500ms. */
const DODGE_COOLDOWN_MS = 500;
/** Local stamina check mirror (server: staminaMax 100, dodge cost 25). */
const DODGE_STAMINA_COST = 25;

/** Survives Phaser remounts when crossing maps. */
let lastWorldFacing: CharacterFacing = H99_FACING_DEFAULT;

export function getLastWorldFacing(): CharacterFacing {
  return lastWorldFacing;
}

export function setLastWorldFacing(f: CharacterFacing) {
  lastWorldFacing = f;
}

export function facingOf(
  wp: Pick<WorldEntity, "facing">,
  fallback: CharacterFacing,
  iso = false,
): CharacterFacing {
  const f = wp.facing;
  if (f === "left" || f === "right") return f;
  if (typeof f === "number") return facingFromYaw(f, fallback, iso);
  return fallback;
}

/** The ECS-owned local actor the controller is allowed to move. */
export interface MovementAvatar {
  id: string;
  wrapper: Phaser.GameObjects.Container;
  sprite: CharacterSprite;
}

/** Scene-side hooks the controller reads each frame. */
export interface MovementHost {
  self(): MovementAvatar | undefined;
  /** True while an entity's jump-crash tween owns its position. */
  isJumping(id: string): boolean;
  worldBounds(): { w: number; h: number };
}

type MoveAction = "move_up" | "move_down" | "move_left" | "move_right";

export class WorldMovement {
  private moveKeys: Partial<Record<MoveAction, Phaser.Input.Keyboard.Key>> = {};
  private moveKeysSig = "";
  private lastSent = 0;
  private lastSentX = -1;
  private lastSentY = -1;
  private wasMoving = false;
  /** Current normalized movement direction — the dodge dash direction. */
  private moveDir = { x: 0, y: 0 };
  /** Bumped when a dodge/jump resets the local movement timeline; stale
   * pending slide callbacks must not overwrite the wrapper. */
  private moveEpoch = 0;
  /** Click-to-move waypoint queue (world coords); cancelled by key input. */
  private clickPath: PathPoint[] | null = null;
  /** Breadcrumb dots along the active click path — eaten as the player passes. */
  private pathDots: { dot: Phaser.GameObjects.Arc; x: number; y: number }[] = [];
  /** Shift was consumed as a hotbar chord (Shift+1–8) — release does not dodge. */
  private shiftComboUsed = false;
  /** The dodge dash tween owns the self wrapper until it lands. */
  dodging = false;
  private dodgeReadyAt = 0;
  /** Sweep ring under self showing the dodge cooldown. */
  private dodgeCdGfx?: Phaser.GameObjects.Graphics;
  private pendingSlide = Promise.resolve();
  /** Last position/time while following a click path — detects wall-stuck. */
  private clickStuck = { x: 0, y: 0, t: 0 };

  constructor(
    private scene: Phaser.Scene,
    private host: MovementHost,
  ) {}

  readonly onCombatKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Shift") {
      this.shiftComboUsed = false;
      return;
    }
    if (!e.shiftKey) return;
    // Shift+digit is a hotbar row — releasing Shift afterward must not dodge.
    const binds = mergeKeybinds(useGame.getState().profile?.keybinds);
    if (resolveHotbarSlot(e, binds)?.startsWith("shift+")) this.shiftComboUsed = true;
  };

  readonly onCombatKeyUp = (e: KeyboardEvent) => {
    if (e.key !== "Shift") return;
    if (!uiOwnsKeyboard() && !this.shiftComboUsed) this.performDodge();
    this.shiftComboUsed = false;
  };

  readonly onGroundPointerDown = (
    pointer: Phaser.Input.Pointer,
    over: Phaser.GameObjects.GameObject[],
  ) => {
    // Right-click anywhere in the world deselects the current target and
    // cancels any armed hotbar action (entity/POI zones only handle left).
    if (pointer.button === 2) {
      this.clearTargetSelection();
      return;
    }
    if (pointer.button !== 0 || (over && over.length > 0)) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    // Iso scenes: pointer.worldX/Y are projected screen coords — unproject
    // back to the world tile plane before pathing.
    const wx = isoLayer(this.scene)
      ? screenToWorldX(pointer.worldX, pointer.worldY)
      : pointer.worldX;
    const wy = isoLayer(this.scene)
      ? screenToWorldY(pointer.worldX, pointer.worldY)
      : pointer.worldY;
    this.startClickMove(wx, wy);
  };

  private clearTargetSelection() {
    const s = useGame.getState();
    if (s.selectedAction || s.commandPetId) {
      useGame.setState({ selectedAction: null, commandPetId: null });
    }
    const self = s.selfId ? s.entities[s.selfId] : undefined;
    if (self?.target_id) net.setTarget("");
  }

  /** Clear all per-scene movement state (scene shutdown). */
  reset() {
    this.dodgeCdGfx?.destroy();
    this.dodgeCdGfx = undefined;
    this.moveKeys = {};
    this.moveKeysSig = "";
    this.clearMoveDir();
    this.wasMoving = false;
    this.lastSent = 0;
    this.lastSentX = -1;
    this.lastSentY = -1;
    this.dodgeReadyAt = 0;
    this.dodging = false;
    this.shiftComboUsed = false;
    this.clearClickPath();
    this.moveEpoch++;
    this.pendingSlide = Promise.resolve();
  }

  /** A dodge or jump reset the movement timeline — pending slide results are stale. */
  invalidateSlides() {
    this.moveEpoch++;
    this.dodging = false;
    this.wasMoving = false;
    this.clearMoveDir();
    this.clearClickPath();
  }

  /** Rebind WASD keys when the player's keybinds change. */
  syncMoveKeys() {
    const binds = mergeKeybinds(useGame.getState().profile?.keybinds);
    const sig = `${binds.move_up}|${binds.move_down}|${binds.move_left}|${binds.move_right}`;
    const missing = !this.moveKeys.move_up || !this.moveKeys.move_down || !this.moveKeys.move_left || !this.moveKeys.move_right;
    if (!missing && sig === this.moveKeysSig) return;
    const kb = this.scene.input.keyboard;
    if (!kb) {
      this.moveKeysSig = "";
      return;
    }
    const bindKey = (action: MoveAction) => {
      const code = bindingToPhaserKeyCode(binds[action] ?? "");
      this.moveKeys[action] = code != null ? kb.addKey(code) : undefined;
    };
    bindKey("move_up");
    bindKey("move_down");
    bindKey("move_left");
    bindKey("move_right");
    this.moveKeysSig = sig;
  }

  private isMoveDown(action: MoveAction): boolean {
    return this.moveKeys[action]?.isDown ?? false;
  }

  private clearMoveDir() {
    this.moveDir.x = 0;
    this.moveDir.y = 0;
  }

  /** Path the local player to a world point and flash the destination. */
  private startClickMove(wx: number, wy: number) {
    const av = this.host.self();
    const map = useGame.getState().overworld;
    if (!av || !map || this.dodging || this.host.isJumping(av.id)) return;
    const path = findPath(map, av.wrapper.x, av.wrapper.y, wx, wy);
    if (!path?.length) return;
    this.clickPath = path;
    this.clickStuck = { x: av.wrapper.x, y: av.wrapper.y, t: this.scene.time.now };
    this.layPathDots(av.wrapper.x, av.wrapper.y, path);
    const last = path[path.length - 1];
    const ring = this.scene.add
      .circle(last.x, last.y, 11)
      .setStrokeStyle(2, 0xe8c96a)
      .setDepth(6);
    isoParent(this.scene, ring);
    ring.setDepth(sortDepth(this.scene, last.x, last.y) - 1);
    this.scene.tweens.add({
      targets: ring,
      scale: 0.4,
      alpha: 0,
      duration: 450,
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Sprinkle breadcrumb dots along the path the player is about to walk.
   * They ripple in from near→far on click and are eaten as the player passes.
   */
  private layPathDots(fromX: number, fromY: number, path: PathPoint[]) {
    this.clearPathDots();
    const pts = [{ x: fromX, y: fromY }, ...path];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    if (total < 24) return; // too short to breadcrumb
    const spacing = Math.max(16, total / 60); // cap ~60 dots on long paths
    let at = spacing;
    let segStart = 0;
    let segIdx = 0;
    let i = 0;
    // Stop ~10px short of the end — the shrinking ring marks the destination.
    while (at <= total - 10) {
      let segLen = Math.hypot(pts[segIdx + 1].x - pts[segIdx].x, pts[segIdx + 1].y - pts[segIdx].y);
      while (segStart + segLen < at && segIdx < pts.length - 2) {
        segStart += segLen;
        segIdx++;
        segLen = Math.hypot(pts[segIdx + 1].x - pts[segIdx].x, pts[segIdx + 1].y - pts[segIdx].y);
      }
      const a = pts[segIdx];
      const b = pts[segIdx + 1];
      const t = segLen > 0 ? (at - segStart) / segLen : 0;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const dot = this.scene.add
        .circle(x, y, 2.5, 0xe8c96a, 0)
        .setDepth(6)
        .setScale(0.4);
      isoParent(this.scene, dot);
      dot.setDepth(sortDepth(this.scene, x, y) - 1);
      this.scene.tweens.add({
        targets: dot,
        alpha: 0.55,
        scale: 1,
        duration: 160,
        delay: i * 35,
      });
      this.pathDots.push({ dot, x, y });
      i++;
      at += spacing;
    }
  }

  private clearPathDots() {
    for (const p of this.pathDots) p.dot.destroy();
    this.pathDots = [];
  }

  /** Cancel click-to-move and remove its breadcrumbs. */
  private clearClickPath() {
    this.clickPath = null;
    this.clearPathDots();
  }

  /** Fade out breadcrumbs the player has reached. Called each move frame. */
  private eatPathDots(x: number, y: number) {
    if (!this.pathDots.length) return;
    const eaten: typeof this.pathDots = [];
    this.pathDots = this.pathDots.filter((p) => {
      if (Math.hypot(x - p.x, y - p.y) > 16) return true;
      eaten.push(p);
      return false;
    });
    for (const p of eaten) {
      const d = p.dot;
      this.scene.tweens.add({
        targets: d,
        alpha: 0,
        scale: 0.3,
        duration: 140,
        onComplete: () => d.destroy(),
      });
    }
  }

  /** Sweeping ring under self that refills over the dodge cooldown. */
  updateDodgeCooldown() {
    const remaining = this.dodgeReadyAt - this.scene.time.now;
    const av = this.host.self();
    if (remaining <= 0 || !av) {
      if (this.dodgeCdGfx) this.dodgeCdGfx.clear();
      return;
    }
    if (!this.dodgeCdGfx) {
      this.dodgeCdGfx = this.scene.add.graphics().setDepth(11);
      isoParent(this.scene, this.dodgeCdGfx); // ground decal — squash is correct
    }
    const pct = 1 - remaining / DODGE_COOLDOWN_MS;
    const g = this.dodgeCdGfx;
    g.clear();
    // Screen-down offset under iso is (+d,+d) in world terms.
    const iso = !!g.parentContainer;
    const rx = av.wrapper.x + (iso ? H99_WORLD_RING_Y : 0);
    const ry = av.wrapper.y + H99_WORLD_RING_Y;
    g.setPosition(rx, ry);
    g.setDepth(sortDepth(this.scene, rx, ry) + 0.05);
    g.lineStyle(3, 0x9fb6c9, 0.55);
    g.beginPath();
    g.arc(0, 0, H99_WORLD_RING_RADIUS * 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    g.strokePath();
  }

  /**
   * Dash two squares along the current movement input — works in and out of
   * combat (the dash interrupts a cast). Does nothing standing still so it
   * never wastes stamina without moving the player. The server applies the
   * authoritative cooldown/stamina cost and broadcasts the dodge event.
   */
  private performDodge() {
    const state = useGame.getState();
    const av = this.host.self();
    const selfId = av?.id;
    const wp = selfId ? state.entities[selfId] : undefined;
    if (!selfId || !av || !wp || this.dodging || this.host.isJumping(selfId)) return;
    if (state.screen !== "world" || wp.in_house) return;
    const selfCe = state.combatIds[selfId] ? wp : undefined;
    if (selfCe && !selfCe.alive) return;
    const { x: dx, y: dy } = this.moveDir;
    if (dx === 0 && dy === 0) return;
    if (this.scene.time.now < this.dodgeReadyAt) return;
    if ((wp.stamina ?? 100) < DODGE_STAMINA_COST) return;
    this.dodgeReadyAt = this.scene.time.now + DODGE_COOLDOWN_MS;
    this.invalidateSlides(); // invalidate pre-dash slides and click-to-move
    net.dodge();
    const casting = !!selfCe?.casting_skill_id || !!wp.casting_skill_id;
    if (casting) this.clearSelfCastLocal();

    const { w: worldW, h: worldH } = this.host.worldBounds();
    const rawX = Phaser.Math.Clamp(
      av.wrapper.x + dx * DODGE_DIST,
      H99_COLLISION_RADIUS,
      worldW - H99_COLLISION_RADIUS,
    );
    const rawY = Phaser.Math.Clamp(
      av.wrapper.y + dy * DODGE_DIST,
      H99_COLLISION_RADIUS,
      worldH - H99_COLLISION_RADIUS,
    );
    const ox = av.wrapper.x;
    const oy = av.wrapper.y;
    const vp = isoProject(this.scene, ox, oy);
    playDodgeVfx(this.scene, vp.x, vp.y - 8, DEFAULT_BATTLE_SPEED);
    this.dodging = true;
    const epoch = this.moveEpoch;
    void applyPlayerSlide(state.overworld, ox, oy, rawX, rawY).then((slid) => {
      const cur = this.host.self();
      if (
        epoch !== this.moveEpoch ||
        this.host.isJumping(selfId) ||
        !cur ||
        cur.id !== selfId ||
        cur.wrapper !== av.wrapper
      ) {
        this.dodging = false;
        return;
      }
      this.scene.tweens.add({
        targets: cur.wrapper,
        x: slid.x,
        y: slid.y,
        duration: battleDuration(130, DEFAULT_BATTLE_SPEED),
        ease: "Power2",
        onComplete: () => {
          this.dodging = false;
          const lp = isoProject(this.scene, cur.wrapper.x, cur.wrapper.y);
          playDodgeVfx(this.scene, lp.x, lp.y - 8, DEFAULT_BATTLE_SPEED);
          setWorldLocalPos(cur.wrapper.x, cur.wrapper.y);
          // The server applies the authoritative dash on the 'dodge' message,
          // so the client does not need to send a follow-up move.
        },
      });
    }).catch((err) => {
      this.dodging = false;
      console.warn("dodge movement prediction failed", err);
    });
  }

  /** Locally clear our own cast — the server's cast_cancelled event confirms. */
  private clearSelfCastLocal() {
    const selfId = useGame.getState().selfId;
    if (!selfId) return;
    useGame.setState((s) => {
      const e = s.entities[selfId];
      if (!e?.casting_skill_id) return s;
      return {
        entities: {
          ...s.entities,
          [selfId]: {
            ...e,
            casting_skill_id: undefined,
            cast_target_id: undefined,
            cast_progress: undefined,
            cast_time_ms: undefined,
            cast_ends_at: undefined,
          },
        },
      };
    });
  }

  /** Per-frame self movement: key input or click-path following. */
  update(time: number, overworld: OverworldMap | null) {
    const av = this.host.self();
    const selfId = av?.id;
    const wp = selfId ? useGame.getState().entities[selfId] : undefined;
    if (!selfId || !av || !wp || !overworld) {
      this.clearMoveDir();
      return;
    }
    // The dodge dash tween owns the wrapper until it lands.
    if (this.dodging || this.host.isJumping(selfId)) {
      this.clearMoveDir();
      return;
    }

    if (uiOwnsKeyboard()) {
      av.sprite.setMoving(false);
      this.clearMoveDir();
      return;
    }

    const dt = this.scene.game.loop.delta / 1000;
    let dx = 0;
    let dy = 0;
    if (this.isMoveDown("move_left")) dx -= 1;
    if (this.isMoveDown("move_right")) dx += 1;
    if (this.isMoveDown("move_up")) dy -= 1;
    if (this.isMoveDown("move_down")) dy += 1;
    // Iso scenes: keys mean *screen* directions (W = up-screen); snap the
    // intent to the nearest grid-aligned world direction so combos walk
    // along tile edges. Orthogonal scenes just normalize the input — free
    // 8-way movement. Click-path deltas below are already world-space.
    const iso = !!isoLayer(this.scene);
    if (dx !== 0 || dy !== 0) {
      const w = moveDirFor(this.scene, dx, dy);
      dx = w.x;
      dy = w.y;
    }

    // Manual input cancels click-to-move; otherwise steer along the path.
    let faceDx: number | null = null;
    if (dx !== 0 || dy !== 0) {
      this.clearClickPath();
    } else if (this.clickPath?.length) {
      // Pop every reached waypoint in the same frame — pausing for one frame
      // drops to idle and restarts the run cycle at every waypoint.
      while (this.clickPath.length) {
        const wp0 = this.clickPath[0];
        const ddx = wp0.x - av.wrapper.x;
        const ddy = wp0.y - av.wrapper.y;
        const dd = Math.hypot(ddx, ddy);
        if (dd > 6) {
          dx = ddx / dd;
          dy = ddy / dd;
          // Facing deadzone on the rendered horizontal (iso screen x is
          // ddx−ddy): while the waypoint sits nearly overhead, keep the
          // current facing instead of flapping left/right each frame.
          const sddx = iso ? ddx - ddy : ddx;
          faceDx = Math.abs(sddx) > 10 ? sddx : 0;
          break;
        }
        this.clickPath.shift();
      }
      if (!this.clickPath.length) this.clearClickPath();
      // Give up if the slide has kept us stuck against something ~0.6s.
      if ((dx !== 0 || dy !== 0) && time - this.clickStuck.t > 600) {
        if (Math.hypot(av.wrapper.x - this.clickStuck.x, av.wrapper.y - this.clickStuck.y) < 4) {
          this.clearClickPath();
          dx = 0;
          dy = 0;
        } else {
          this.clickStuck = { x: av.wrapper.x, y: av.wrapper.y, t: time };
        }
      }
    }

    // The dodge dash follows the current movement direction.
    const dLen = Math.hypot(dx, dy);
    this.moveDir.x = dLen ? dx / dLen : 0;
    this.moveDir.y = dLen ? dy / dLen : 0;

    if (dx === 0 && dy === 0) {
      av.sprite.setMoving(false);
      if (this.wasMoving) {
        this.sendPosition(time, av.wrapper.x, av.wrapper.y, true);
        this.wasMoving = false;
      }
      return;
    }

    this.wasMoving = true;

    // Facing follows the rendered horizontal — under iso, world deltas
    // project to screen x = dx − dy.
    const faceAxis = faceDx ?? (iso ? dx - dy : dx);
    av.sprite.setMoving(true, faceAxis, dy);
    lastWorldFacing = facingFromDelta(faceAxis, lastWorldFacing);

    const len = Math.hypot(dx, dy);
    const speed =
      SPEED * (wp.mounted ? MOUNT_SPEED_MULT : 1) * moveSpeedScaleFor(this.scene, dx / len, dy / len);
    const { w: worldW, h: worldH } = this.host.worldBounds();
    const nx = Phaser.Math.Clamp(
      av.wrapper.x + (dx / len) * speed * dt,
      H99_COLLISION_RADIUS,
      worldW - H99_COLLISION_RADIUS,
    );
    const ny = Phaser.Math.Clamp(
      av.wrapper.y + (dy / len) * speed * dt,
      H99_COLLISION_RADIUS,
      worldH - H99_COLLISION_RADIUS,
    );
    const ox = av.wrapper.x;
    const oy = av.wrapper.y;
    // Place optimistically this frame so camera follow + React POIs share one pose.
    // Collision slide (possibly async via Wails) corrects afterward.
    av.wrapper.x = nx;
    av.wrapper.y = ny;
    this.eatPathDots(nx, ny);
    setWorldLocalPos(nx, ny);
    const epoch = this.moveEpoch;
    this.pendingSlide = this.pendingSlide.then(async () => {
      const slid = await applyPlayerSlide(overworld, ox, oy, nx, ny);
      const cur = this.host.self();
      if (!cur || cur.id !== selfId || cur.wrapper !== av.wrapper) return;
      // A dodge or jump reset the movement timeline after this slide was
      // scheduled; its result is stale and would snap the player back.
      if (epoch !== this.moveEpoch) return;
      // The dodge dash tween owns the wrapper while it runs.
      if (this.dodging || this.host.isJumping(selfId)) return;
      cur.wrapper.x = slid.x;
      cur.wrapper.y = slid.y;
      setWorldLocalPos(slid.x, slid.y);
      const moved = Math.hypot(slid.x - ox, slid.y - oy) > 0.5;
      const st = useGame.getState();
      const interruptCast = !!st.entities[selfId]?.casting_skill_id && moved;
      if (interruptCast) this.clearSelfCastLocal();
      this.sendPosition(time, slid.x, slid.y, interruptCast);
    }).catch((err) => {
      console.warn("movement slide failed", err);
    });
  }

  private sendPosition(time: number, x: number, y: number, force: boolean) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (!force && time - this.lastSent <= SEND_INTERVAL) return;
    if (rx === this.lastSentX && ry === this.lastSentY) return;
    net.move(rx, ry);
    this.lastSent = time;
    this.lastSentX = rx;
    this.lastSentY = ry;
  }
}
