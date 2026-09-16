import Phaser from "phaser";
import type { ActionResult } from "../types";
import { battleDuration } from "./battleAnim";

export type VfxCategory =
  | "physical"
  | "fire"
  | "ice"
  | "thunder"
  | "wind"
  | "earth"
  | "water"
  | "holy"
  | "dark"
  | "poison"
  | "heal"
  | "buff";

const FIRE_IDS = /fire|katon|firaga|enfire|actinic/i;
const ICE_IDS = /ice|blizzard|hyoton|enblizzard|frost/i;
const THUNDER_IDS = /thunder|bolt|raiton|enthunder|aero|stone|meteor/i;
const WIND_IDS = /aero|gust|embrava/i;
const EARTH_IDS = /stone|geo|earth|quake/i;
const WATER_IDS = /water|aqua|flood/i;
const HOLY_IDS = /holy|banish|cure|curaga|light|requiescat|phalanx|valiance/i;
const DARK_IDS = /drain|absorb|dark|doom|last_resort/i;
const POISON_IDS = /poison|dia|wilt|venom/i;
const HEAL_IDS = /cure|curaga|heal|repair|waltz|regen|adloquium/i;
const BUFF_IDS = /buff|ward|protect|haste|boost|sentinel|cover|utsusemi|samba|minne|minuet|madrigal|etude|maneuver|deploy|activate|gauge|reward|charm|camouflage|fold|roulette|wild_card|quick_draw|accession|celerity|phalanx|valiance|indi/i;

export function vfxCategoryForAction(actionId: string, heal?: number): VfxCategory {
  if (heal && heal > 0) return "heal";
  if (actionId === "attack") return "physical";
  if (HEAL_IDS.test(actionId)) return "heal";
  if (BUFF_IDS.test(actionId)) return "buff";
  if (POISON_IDS.test(actionId)) return "poison";
  if (FIRE_IDS.test(actionId)) return "fire";
  if (ICE_IDS.test(actionId)) return "ice";
  if (THUNDER_IDS.test(actionId)) return "thunder";
  if (WIND_IDS.test(actionId)) return "wind";
  if (EARTH_IDS.test(actionId)) return "earth";
  if (WATER_IDS.test(actionId)) return "water";
  if (HOLY_IDS.test(actionId)) return "holy";
  if (DARK_IDS.test(actionId)) return "dark";
  return "physical";
}

const CATEGORY_COLORS: Record<VfxCategory, number> = {
  physical: 0xf0f0f0,
  fire: 0xff6633,
  ice: 0x88ccff,
  thunder: 0xffff66,
  wind: 0xaaffaa,
  earth: 0xcc9966,
  water: 0x44aaff,
  holy: 0xffffcc,
  dark: 0x6633aa,
  poison: 0x66cc44,
  heal: 0x4ade80,
  buff: 0xffd700,
};

function vfxColorForAction(actionId: string, heal?: number): number {
  return CATEGORY_COLORS[vfxCategoryForAction(actionId, heal)];
}

function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count: number,
  color: number,
  spread: number,
  speed: number,
  opts?: { rise?: boolean; size?: number; duration?: number },
): void {
  const rise = opts?.rise ?? false;
  const size = opts?.size ?? 5;
  const baseDuration = opts?.duration ?? 600;
  for (let i = 0; i < count; i++) {
    const dot = scene.add.circle(x, y, size * (0.6 + Math.random()), color, 0.9);
    dot.setDepth(200);
    const angle = Math.random() * Math.PI * 2;
    const dist = 18 + Math.random() * spread * 1.4;
    const duration = battleDuration(baseDuration, speed) * (0.6 + Math.random() * 0.6);
    scene.tweens.add({
      targets: dot,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist - (rise ? 20 + Math.random() * 30 : 0),
      alpha: 0,
      scale: 0.2,
      duration,
      ease: "Power2",
      onComplete: () => dot.destroy(),
    });
  }
}

/**
 * Progressively draws a quadratic bezier with a glow pass, a bright core, and
 * a leading head dot, then fades it out — shared by the lob (target arc) and
 * the swing (melee) paths. getCurve is re-evaluated every frame so the arc
 * tracks live source/target positions while it draws.
 */
function drawBezierArc(
  scene: Phaser.Scene,
  getCurve: () => Phaser.Curves.QuadraticBezier,
  color: number,
  battleSpeed: number,
  onDrawn?: () => void,
  timing?: { draw?: number; tailDelay?: number; tail?: number },
): void {
  const drawMs = timing?.draw ?? 240;
  const tailDelayMs = timing?.tailDelay ?? 180;
  const tailMs = timing?.tail ?? 420;
  const g = scene.add.graphics().setDepth(196);
  const head = scene.add.circle(0, 0, 3, color, 0.95).setDepth(197);
  // p is the draw frontier (head), tail the erosion frontier chasing behind it.
  const prog = { p: 0, tail: 0 };

  const render = () => {
    const points = getCurve().getPoints(28);
    const hi = Math.max(2, Math.ceil(prog.p * points.length));
    const lo = Math.min(hi - 1, Math.floor(prog.tail * points.length));
    const tip = points[Math.min(hi - 1, points.length - 1)];
    // Opacity falls off with tail progress so the surviving segment dims as
    // it dissolves instead of staying full-bright until the last point.
    const fade = 1 - prog.tail;
    g.clear();
    g.lineStyle(5, color, 0.18 * fade);
    g.beginPath();
    g.moveTo(points[lo].x, points[lo].y);
    for (let i = lo + 1; i < hi; i++) g.lineTo(points[i].x, points[i].y);
    g.strokePath();
    g.lineStyle(2, color, 0.9 * fade);
    g.beginPath();
    g.moveTo(points[lo].x, points[lo].y);
    for (let i = lo + 1; i < hi; i++) g.lineTo(points[i].x, points[i].y);
    g.strokePath();
    head.setPosition(tip.x, tip.y);
    head.setAlpha(0.95 * fade);
  };

  scene.tweens.add({
    targets: prog,
    p: 1,
    duration: battleDuration(drawMs, battleSpeed),
    ease: "Cubic.easeOut",
    onUpdate: render,
    onComplete: () => onDrawn?.(),
  });
  // Tail starts eroding while the head is still drawing, so the arc dissolves
  // start→tip over time instead of blinking out or dimming all at once.
  scene.tweens.add({
    targets: prog,
    tail: 1,
    delay: battleDuration(tailDelayMs, battleSpeed),
    duration: battleDuration(tailMs, battleSpeed),
    ease: "Power1",
    onUpdate: render,
    onComplete: () => {
      g.destroy();
      head.destroy();
    },
  });
}

/**
 * Animated quadratic bezier from the actor to the action's target. The arc
 * draws itself progressively toward the target with a bright head, then fades
 * — the draw direction reads as the action's direction.
 */
export function playActionArc(
  scene: Phaser.Scene,
  from: { x: number; y: number },
  to: { x: number; y: number },
  actionId: string,
  battleSpeed: number,
  heal?: number,
  onDrawn?: () => void,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 24) {
    onDrawn?.();
    return;
  }

  const color = vfxColorForAction(actionId, heal);

  drawBezierArc(
    scene,
    () => {
      const start = new Phaser.Math.Vector2(from.x, from.y - 16);
      const end = new Phaser.Math.Vector2(to.x, to.y - 16);

      // Control point offset perpendicular to the shot, biased so the arc
      // bends upward on screen (y grows downward).
      const ddx = end.x - start.x;
      const ddy = end.y - start.y;
      const d = Math.hypot(ddx, ddy) || 1;
      let nx = -ddy / d;
      let ny = ddx / d;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const lift = Math.min(70, d * 0.28);
      const ctrl = new Phaser.Math.Vector2(
        (start.x + end.x) / 2 + nx * lift,
        (start.y + end.y) / 2 + ny * lift,
      );
      return new Phaser.Curves.QuadraticBezier(start, ctrl, end);
    },
    color,
    battleSpeed,
    onDrawn,
    // Lob lingers longer than the melee swing and dissolves more gradually.
    { draw: 340, tailDelay: 320, tail: 900 },
  );
}

/**
 * Melee variant: the curve starts cocked behind the actor and sweeps wide
 * through the target, reading as the path of a swung weapon rather than a
 * lobbed projectile.
 */
export function playSwingArc(
  scene: Phaser.Scene,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: number,
  battleSpeed: number,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 16) return;

  drawBezierArc(
    scene,
    () => {
      const ddx = to.x - from.x;
      const ddy = to.y - from.y;
      const d = Math.hypot(ddx, ddy) || 1;
      let nx = -ddy / d;
      let ny = ddx / d;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }

      const start = new Phaser.Math.Vector2(from.x - nx * 16, from.y - 16 - ny * 16);
      const end = new Phaser.Math.Vector2(to.x, to.y - 16);
      const lift = Math.min(90, d * 0.55);
      const ctrl = new Phaser.Math.Vector2(
        start.x + (end.x - start.x) * 0.4 + nx * lift,
        start.y + (end.y - start.y) * 0.4 + ny * lift,
      );
      return new Phaser.Curves.QuadraticBezier(start, ctrl, end);
    },
    color,
    battleSpeed,
  );
}

function ringFlash(scene: Phaser.Scene, x: number, y: number, color: number, speed: number): void {
  const ring = scene.add.circle(x, y, 12, color, 0.45).setDepth(198);
  scene.tweens.add({
    targets: ring,
    scale: 7,
    alpha: 0,
    duration: battleDuration(500, speed),
    ease: "Power2",
    onComplete: () => ring.destroy(),
  });
}

function playCategoryVfx(
  scene: Phaser.Scene,
  category: VfxCategory,
  actorPos: { x: number; y: number },
  targetPos: { x: number; y: number },
  actorOnLeft: boolean,
  speed: number,
): void {
  const actorX = actorPos.x;
  const actorY = actorPos.y;
  const targetX = targetPos.x;
  const targetY = targetPos.y;
  switch (category) {
    case "physical":
      playSwingArc(scene, actorPos, targetPos, 0xf0f0f0, speed);
      burst(scene, targetX, targetY, 18, 0xdddddd, 34, speed, { size: 4 });
      break;
    case "fire":
      burst(scene, targetX, targetY - 8, 40, 0xff6622, 55, speed);
      burst(scene, targetX, targetY - 4, 24, 0xffcc44, 40, speed, { size: 4 });
      ringFlash(scene, targetX, targetY, 0xff4400, speed);
      break;
    case "ice":
      burst(scene, targetX, targetY, 36, 0x88ddff, 45, speed);
      burst(scene, targetX, targetY - 6, 18, 0xffffff, 30, speed, { size: 4 });
      ringFlash(scene, targetX, targetY, 0x66ccff, speed);
      break;
    case "thunder":
      burst(scene, targetX, targetY - 20, 30, 0xffff88, 55, speed, { rise: true });
      burst(scene, targetX, targetY, 24, 0xaaaaff, 40, speed);
      ringFlash(scene, targetX, targetY, 0x8888ff, speed);
      break;
    case "wind":
      burst(scene, targetX, targetY, 30, 0xccffcc, 60, speed);
      burst(scene, targetX + (actorOnLeft ? -10 : 10), targetY, 18, 0xaaffaa, 42, speed, { size: 4 });
      break;
    case "earth":
      burst(scene, targetX, targetY + 4, 30, 0x8a6a4a, 36, speed);
      burst(scene, targetX, targetY - 4, 18, 0xaa8866, 28, speed, { size: 6, duration: 800 });
      break;
    case "water":
      burst(scene, targetX, targetY, 36, 0x44aaff, 40, speed);
      burst(scene, targetX, targetY - 8, 20, 0x88ccff, 34, speed, { rise: true });
      break;
    case "holy":
      ringFlash(scene, targetX, targetY, 0xffffcc, speed);
      burst(scene, targetX, targetY - 10, 30, 0xffffaa, 36, speed, { rise: true });
      burst(scene, targetX, targetY, 18, 0xffffff, 24, speed, { size: 4 });
      break;
    case "dark":
      burst(scene, targetX, targetY, 36, 0x6633aa, 45, speed);
      burst(scene, targetX, targetY - 6, 18, 0x220044, 34, speed);
      ringFlash(scene, targetX, targetY, 0x440066, speed);
      break;
    case "poison":
      burst(scene, targetX, targetY, 30, 0x66cc44, 36, speed, { rise: true });
      burst(scene, targetX, targetY - 4, 18, 0x88ff66, 24, speed, { size: 4, rise: true });
      break;
    case "heal":
      burst(scene, targetX, targetY - 8, 36, 0x4ade80, 30, speed, { rise: true, size: 5 });
      burst(scene, targetX, targetY, 18, 0x86efac, 22, speed, { rise: true, size: 4 });
      ringFlash(scene, targetX, targetY, 0x4ade80, speed);
      break;
    case "buff":
      ringFlash(scene, targetX, targetY, 0xffe9a8, speed);
      burst(scene, targetX, targetY - 12, 24, 0xffd700, 24, speed, { rise: true, size: 4 });
      break;
  }

  if (category !== "physical" && category !== "buff" && category !== "heal") {
    const midX = (actorX + targetX) / 2;
    const midY = (actorY + targetY) / 2 - 20;
    burst(scene, midX, midY, 12, 0xffffff, 18, speed, { size: 3, duration: 400 });
  }
}

export function playBattleVfx(
  scene: Phaser.Scene,
  result: ActionResult,
  actorPos: { x: number; y: number } | undefined,
  targetPos: { x: number; y: number } | undefined,
  battleSpeed: number,
): void {
  if (!result.success || !targetPos) return;
  const category = vfxCategoryForAction(result.action_id, result.heal);
  const actorOnLeft = actorPos ? actorPos.x < 480 : true;
  playCategoryVfx(
    scene,
    category,
    actorPos ?? targetPos,
    targetPos,
    actorOnLeft,
    battleSpeed,
  );

  if (result.status_applied?.length) {
    for (const s of result.status_applied) {
      const color = /poison|dia|wilt/i.test(s.kind) ? 0x66cc44 : 0xffe9a8;
      ringFlash(scene, targetPos.x, targetPos.y - 20, color, battleSpeed);
    }
  }
}

export function playFizzleVfx(scene: Phaser.Scene, x: number, y: number, battleSpeed: number): void {
  burst(scene, x, y, 6, 0x8899aa, 12, battleSpeed, { size: 2, duration: 350 });
}

/**
 * Overworld-combat hit feedback: burst/ring/flash at the target only.
 * actorPos == targetPos so playSwingArc early-returns (<16px) — no
 * actor→target bezier arcs are ever drawn in the field.
 */
export function playHitVfx(
  scene: Phaser.Scene,
  actionId: string,
  heal: number | undefined,
  x: number,
  y: number,
  battleSpeed: number,
): void {
  const category = vfxCategoryForAction(actionId, heal);
  playCategoryVfx(scene, category, { x, y }, { x, y }, true, battleSpeed);
}

/** Dust puff where a dodge dash lands. */
export function playDodgeVfx(scene: Phaser.Scene, x: number, y: number, battleSpeed: number): void {
  burst(scene, x, y + 10, 12, 0x9fb6c9, 26, battleSpeed, { size: 3, duration: 320 });
}

export function isJumpAction(actionId: string): boolean {
  return /jump/i.test(actionId);
}

/** Leap off the top of the screen, crash onto the target, then bounce home. */
export function playJumpCrash(
  scene: Phaser.Scene,
  actor: Phaser.GameObjects.Container,
  target: Phaser.GameObjects.Container,
  battleSpeed: number,
  onImpact?: () => void,
  onDone?: () => void,
): void {
  const startX = actor.x;
  const startY = actor.y;
  const startDepth = actor.depth;
  const skyY = scene.cameras.main.worldView.top - 90;
  const finish = () => {
    actor.setPosition(startX, startY);
    actor.setDepth(startDepth);
    onDone?.();
  };

  scene.tweens.killTweensOf(actor);
  actor.setDepth(startDepth + 80);

  const followCrash = { p: 0 };
  const followHop = { h: 0 };

  scene.tweens.add({
    targets: actor,
    y: skyY,
    duration: battleDuration(260, battleSpeed),
    ease: "Cubic.easeIn",
    onComplete: () => {
      followCrash.p = 0;
      scene.tweens.add({
        targets: followCrash,
        p: 1,
        duration: battleDuration(200, battleSpeed),
        ease: "Cubic.easeIn",
        onUpdate: () => {
          actor.setPosition(target.x, skyY + (target.y - skyY) * followCrash.p);
        },
        onComplete: () => {
          actor.setPosition(target.x, target.y);
          burst(scene, target.x, target.y + 10, 48, 0xccbb88, 55, battleSpeed, { size: 5, duration: 500 });
          onImpact?.();
          followHop.h = 0;
          scene.tweens.add({
            targets: followHop,
            h: 48,
            duration: battleDuration(67, battleSpeed),
            yoyo: true,
            ease: "Quad.easeOut",
            onUpdate: () => {
              actor.setPosition(target.x, target.y - followHop.h);
            },
            onComplete: () => {
              const fromX = actor.x;
              const fromY = actor.y;
              const apexY = Math.min(startY, fromY) - 140;
              scene.tweens.add({
                targets: actor,
                x: (startX + fromX) / 2,
                y: apexY,
                duration: battleDuration(120, battleSpeed),
                ease: "Quad.easeOut",
                onComplete: () => {
                  scene.tweens.add({
                    targets: actor,
                    x: startX,
                    y: startY,
                    duration: battleDuration(120, battleSpeed),
                    ease: "Quad.easeIn",
                    onComplete: finish,
                  });
                },
              });
            },
          });
        },
      });
    },
  });
}

export function playCastStartVfx(
  scene: Phaser.Scene,
  x: number,
  y: number,
  actionId: string,
  battleSpeed: number,
): void {
  const color = vfxColorForAction(actionId);
  ringFlash(scene, x, y, color, battleSpeed);
  burst(scene, x, y - 8, 28, color, 30, battleSpeed, { rise: true, size: 4, duration: 650 });
}


