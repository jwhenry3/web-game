// Combat-event presentation: converts replicated combat events into Phaser
// animation/VFX while the network store remains authoritative for state.
import Phaser from "phaser";
import type { CombatEvent } from "../../state/store";
import type { ActionResult } from "../../types";
import { battleDuration, DEFAULT_BATTLE_SPEED } from "../battleAnim";
import {
  isJumpAction,
  playActionArc,
  playBattleVfx,
  playCastStartVfx,
  playDodgeVfx,
  playFizzleVfx,
  playJumpCrash,
  vfxCategoryForAction,
} from "../battleVfx";
import type { IEntitySprite } from "../entitySprite";
import { isoLayer, isoProject, isoUp } from "../../world/iso";

/** Screen-space position of a world-space wrapper (identity off-iso). */
function screenPos(
  scene: Phaser.Scene,
  w: { x: number; y: number },
): { x: number; y: number } {
  return isoProject(scene, w.x, w.y);
}

/**
 * Live-projected position — arc beziers re-read endpoints every frame while
 * they draw, so hand them getters that follow the wrapper's world position.
 */
function livePos(
  scene: Phaser.Scene,
  w: { x: number; y: number },
): { x: number; y: number } {
  if (!isoLayer(scene)) return w;
  return {
    get x() {
      return isoProject(scene, w.x, w.y).x;
    },
    get y() {
      return isoProject(scene, w.x, w.y).y;
    },
  };
}

export interface CombatVisualRef {
  wrapper: Phaser.GameObjects.Container;
  sprite: IEntitySprite;
}

export interface CombatEventHost {
  selfId: string | null;
  /** Entities whose position sync is paused while jump-crash owns them. */
  jumping: Set<string>;
  visualFor(id: string): CombatVisualRef | undefined;
  /** A self jump invalidates queued local slide results in WorldMovement. */
  invalidateSelfSlides(): void;
}

export function latestCombatEventSeq(events: readonly CombatEvent[]): number {
  return events.reduce((m, e) => Math.max(m, e.seq), 0);
}

/** Animate every unseen combat event and return the latest processed seq. */
export function processCombatEvents(
  scene: Phaser.Scene,
  events: readonly CombatEvent[],
  host: CombatEventHost,
  seenSeq: number,
): number {
  let nextSeen = seenSeq;
  for (const ev of events) {
    if (ev.seq <= nextSeen) continue;
    nextSeen = ev.seq;
    animateCombatEvent(scene, ev, host);
  }
  return nextSeen;
}

function animateCombatEvent(scene: Phaser.Scene, ev: CombatEvent, host: CombatEventHost) {
  const speed = DEFAULT_BATTLE_SPEED;
  const actor = host.visualFor(ev.attacker_id);
  const target = ev.target_id ? host.visualFor(ev.target_id) : undefined;
  if (actor && target && actor !== target) {
    // Face screen-left/right — the projected horizontal delta under iso.
    const fdx = screenPos(scene, target.wrapper).x - screenPos(scene, actor.wrapper).x;
    if (Math.abs(fdx) > 0.5) actor.sprite.setFacing(fdx < 0 ? "left" : "right");
  }
  const result: ActionResult = {
    actor_id: ev.attacker_id,
    action_id: ev.action_id ?? "attack",
    action_name: ev.action_name ?? "",
    target_id: ev.target_id ?? "",
    success: ev.success ?? ev.hit,
    damage: ev.damage,
    heal: ev.heal,
    mp_restored: ev.mp_restored,
    message: ev.message,
    cast_started: ev.cast_started,
  };

  if (ev.cast_cancelled) {
    if (actor) {
      actor.sprite.setCasting(false);
      const p = screenPos(scene, actor.wrapper);
      playFizzleVfx(scene, p.x, p.y - 36, speed);
    }
    return;
  }

  if (!result.success) {
    if (actor) {
      const p = screenPos(scene, actor.wrapper);
      playFizzleVfx(scene, p.x, p.y - 36, speed);
    }
    if (result.action_id === "attack") actor?.sprite.playAttack();
    return;
  }

  if (result.action_id === "dodge") {
    if (actor) {
      const p = screenPos(scene, actor.wrapper);
      playDodgeVfx(scene, p.x, p.y - 8, speed);
    }
    return;
  }

  if (result.cast_started) {
    if (actor) {
      actor.sprite.setCasting(true);
      const p = screenPos(scene, actor.wrapper);
      playCastStartVfx(scene, p.x, p.y - 20, result.action_id, speed);
      if (target && target !== actor) {
        playActionArc(scene, livePos(scene, actor.wrapper), livePos(scene, target.wrapper), result.action_id, speed);
      }
    }
    return;
  }

  actor?.sprite.setCasting(false);
  actor?.sprite.playAttack();

  const involves = ev.attacker_id === host.selfId || ev.target_id === host.selfId;
  const showHit = () => {
    if (!target) return;
    const p = screenPos(scene, target.wrapper);
    if (result.damage) {
      floatText(scene, p.x, p.y - 42, `${result.damage}`, "#ffffff", speed);
      target.sprite.playHit(speed);
      if (involves) scene.cameras.main.shake(battleDuration(70, speed), 0.003);
    } else if (result.heal) {
      floatText(scene, p.x, p.y - 42, `+${result.heal}`, "#4ade80", speed);
    } else if (result.mp_restored) {
      floatText(scene, p.x, p.y - 42, `+${result.mp_restored} MP`, "#4aa3e8", speed);
    }
  };

  if (actor && target && isJumpAction(result.action_id)) {
    if (ev.attacker_id === host.selfId) host.invalidateSelfSlides();
    host.jumping.add(ev.attacker_id);
    const inner = actor.sprite.container;
    scene.tweens.killTweensOf(inner);
    inner.x = 0;
    inner.y = 0;
    playJumpCrash(
      scene,
      actor.wrapper,
      target.wrapper,
      speed,
      () => {
        const tp = screenPos(scene, target.wrapper);
        playBattleVfx(scene, result, tp, tp, speed);
        showHit();
      },
      () => {
        host.jumping.delete(ev.attacker_id);
      },
      isoUp(scene),
    );
    return;
  }

  if (
    actor &&
    target &&
    actor !== target &&
    vfxCategoryForAction(result.action_id, result.heal) !== "physical"
  ) {
    playActionArc(scene, livePos(scene, actor.wrapper), livePos(scene, target.wrapper), result.action_id, speed, result.heal);
  }
  if (target) {
    playBattleVfx(
      scene,
      result,
      actor ? screenPos(scene, actor.wrapper) : undefined,
      screenPos(scene, target.wrapper),
      speed,
    );
  }

  if (actor && target && actor !== target) {
    // Lunge in screen space — the sprite's inner container renders upright.
    const ap = screenPos(scene, actor.wrapper);
    const tp = screenPos(scene, target.wrapper);
    const dx = tp.x - ap.x;
    const dy = tp.y - ap.y;
    const mag = Math.hypot(dx, dy) || 1;
    const inner = actor.sprite.container;
    scene.tweens.killTweensOf(inner);
    scene.tweens.add({
      targets: inner,
      x: (dx / mag) * 22,
      y: (dy / mag) * 22,
      duration: battleDuration(110, speed),
      yoyo: true,
      ease: "Power2",
      onComplete: () => {
        inner.x = 0;
        inner.y = 0;
      },
    });
  }

  showHit();
}

function floatText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string,
  battleSpeed: number,
) {
  const t = scene.add
    .text(x, y, text, {
      fontSize: "16px",
      color,
      fontFamily: "monospace",
      fontStyle: "bold",
    })
    .setOrigin(0.5)
    .setDepth(80)
    .setShadow(1, 1, "#000", 3);
  scene.tweens.add({
    targets: t,
    y: y - 36,
    alpha: 0,
    duration: battleDuration(900, battleSpeed),
    ease: "Power1",
    onComplete: () => t.destroy(),
  });
}
