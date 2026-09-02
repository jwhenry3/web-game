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
  const size = opts?.size ?? 3;
  const baseDuration = opts?.duration ?? 450;
  for (let i = 0; i < count; i++) {
    const dot = scene.add.circle(x, y, size * (0.5 + Math.random()), color, 0.9);
    dot.setDepth(200);
    const angle = Math.random() * Math.PI * 2;
    const dist = 12 + Math.random() * spread;
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

function slashArc(scene: Phaser.Scene, x: number, y: number, flip: boolean, speed: number): void {
  const g = scene.add.graphics().setDepth(199);
  g.lineStyle(3, 0xffffff, 0.9);
  const dir = flip ? -1 : 1;
  g.beginPath();
  g.arc(x, y, 28, -Math.PI * 0.2 * dir, Math.PI * 0.5 * dir, flip);
  g.strokePath();
  scene.tweens.add({
    targets: g,
    alpha: 0,
    scaleX: 1.4,
    scaleY: 1.2,
    duration: battleDuration(220, speed),
    ease: "Power2",
    onComplete: () => g.destroy(),
  });
}

function ringFlash(scene: Phaser.Scene, x: number, y: number, color: number, speed: number): void {
  const ring = scene.add.circle(x, y, 8, color, 0.35).setDepth(198);
  scene.tweens.add({
    targets: ring,
    scale: 3.5,
    alpha: 0,
    duration: battleDuration(400, speed),
    ease: "Power2",
    onComplete: () => ring.destroy(),
  });
}

function playCategoryVfx(
  scene: Phaser.Scene,
  category: VfxCategory,
  actorX: number,
  actorY: number,
  targetX: number,
  targetY: number,
  actorOnLeft: boolean,
  speed: number,
): void {
  switch (category) {
    case "physical":
      slashArc(scene, targetX, targetY - 10, !actorOnLeft, speed);
      burst(scene, targetX, targetY, 6, 0xdddddd, 18, speed, { size: 2 });
      break;
    case "fire":
      burst(scene, targetX, targetY - 8, 14, 0xff6622, 28, speed);
      burst(scene, targetX, targetY - 4, 8, 0xffcc44, 20, speed, { size: 2 });
      ringFlash(scene, targetX, targetY, 0xff4400, speed);
      break;
    case "ice":
      burst(scene, targetX, targetY, 12, 0x88ddff, 24, speed);
      burst(scene, targetX, targetY - 6, 6, 0xffffff, 16, speed, { size: 2 });
      ringFlash(scene, targetX, targetY, 0x66ccff, speed);
      break;
    case "thunder":
      burst(scene, targetX, targetY - 20, 10, 0xffff88, 30, speed, { rise: true });
      burst(scene, targetX, targetY, 8, 0xaaaaff, 22, speed);
      ringFlash(scene, targetX, targetY, 0x8888ff, speed);
      break;
    case "wind":
      burst(scene, targetX, targetY, 10, 0xccffcc, 32, speed);
      burst(scene, targetX + (actorOnLeft ? -10 : 10), targetY, 6, 0xaaffaa, 24, speed, { size: 2 });
      break;
    case "earth":
      burst(scene, targetX, targetY + 4, 10, 0x8a6a4a, 20, speed);
      burst(scene, targetX, targetY - 4, 6, 0xaa8866, 16, speed, { size: 4, duration: 600 });
      break;
    case "water":
      burst(scene, targetX, targetY, 12, 0x44aaff, 22, speed);
      burst(scene, targetX, targetY - 8, 6, 0x88ccff, 18, speed, { rise: true });
      break;
    case "holy":
      ringFlash(scene, targetX, targetY, 0xffffcc, speed);
      burst(scene, targetX, targetY - 10, 10, 0xffffaa, 20, speed, { rise: true });
      burst(scene, targetX, targetY, 6, 0xffffff, 14, speed, { size: 2 });
      break;
    case "dark":
      burst(scene, targetX, targetY, 12, 0x6633aa, 24, speed);
      burst(scene, targetX, targetY - 6, 6, 0x220044, 18, speed);
      ringFlash(scene, targetX, targetY, 0x440066, speed);
      break;
    case "poison":
      burst(scene, targetX, targetY, 10, 0x66cc44, 20, speed, { rise: true });
      burst(scene, targetX, targetY - 4, 6, 0x88ff66, 14, speed, { size: 2, rise: true });
      break;
    case "heal":
      burst(scene, targetX, targetY - 8, 12, 0x4ade80, 16, speed, { rise: true, size: 3 });
      burst(scene, targetX, targetY, 6, 0x86efac, 12, speed, { rise: true, size: 2 });
      ringFlash(scene, targetX, targetY, 0x4ade80, speed);
      break;
    case "buff":
      ringFlash(scene, targetX, targetY, 0xffe9a8, speed);
      burst(scene, targetX, targetY - 12, 8, 0xffd700, 14, speed, { rise: true, size: 2 });
      break;
  }

  if (category !== "physical" && category !== "buff" && category !== "heal") {
    const midX = (actorX + targetX) / 2;
    const midY = (actorY + targetY) / 2 - 20;
    burst(scene, midX, midY, 4, 0xffffff, 10, speed, { size: 1, duration: 300 });
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
    actorPos?.x ?? targetPos.x,
    actorPos?.y ?? targetPos.y,
    targetPos.x,
    targetPos.y,
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
          burst(scene, target.x, target.y + 10, 16, 0xccbb88, 30, battleSpeed, { size: 3, duration: 400 });
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
  const category = vfxCategoryForAction(actionId);
  const color =
    category === "heal" ? 0x4ade80 :
    category === "fire" ? 0xff6633 :
    category === "ice" ? 0x88ccff :
    category === "thunder" ? 0xffff66 :
    category === "holy" ? 0xffffcc :
    category === "dark" ? 0x6633aa :
    0xa78bfa;
  ringFlash(scene, x, y, color, battleSpeed);
  burst(scene, x, y - 8, 10, color, 16, battleSpeed, { rise: true, size: 2, duration: 550 });
}
