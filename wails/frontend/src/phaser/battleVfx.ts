import Phaser from "phaser";
import type { ActionResult } from "../types";
import { battleDuration } from "./battleAnim";
import {
  CATEGORY_COLORS,
  CATEGORY_VFX_PROFILES,
  type VfxBurstProfile,
  type VfxCategory,
  type VfxCircleProfile,
  type VfxParticleTexture,
  type VfxProjectileProfile,
  type VfxStreamProfile,
} from "./battleVfxProfiles";

const FIRE_IDS = /fire|ignis|inferno|katon|firaga|enfire|actinic/i;
const ICE_IDS = /ice|gelu|blizzard|hyoton|enblizzard|frost/i;
const THUNDER_IDS = /thunder|fulmen|bolt|raiton|enthunder|meteor/i;
const WIND_IDS = /aero|gust|embrava/i;
const EARTH_IDS = /stone|geo|earth|quake/i;
const WATER_IDS = /water|aqua|flood/i;
const HOLY_IDS = /holy|lux|lumen|sacred|banish|cure|curaga|light|requiescat|phalanx|valiance/i;
const DARK_IDS = /drain|absorb|dark|nox|shadow|doom|last_resort/i;
const POISON_IDS = /poison|dia|wilt|venom/i;
const HEAL_IDS = /cure|curaga|heal|sanare|mending|repair|waltz|regen|adloquium/i;
const BUFF_IDS = /buff|guard|ward|protect|haste|boost|sentinel|cover|attunement|carmen|hymn|song|stance|focus|meditatio|utsusemi|samba|minne|minuet|madrigal|etude|maneuver|deploy|activate|gauge|reward|charm|camouflage|fold|roulette|wild_card|quick_draw|accession|celerity|phalanx|valiance|indi/i;

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

function vfxColorForAction(actionId: string, heal?: number): number {
  return CATEGORY_COLORS[vfxCategoryForAction(actionId, heal)];
}

function createParticle(
  scene: Phaser.Scene,
  texture: VfxParticleTexture,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
): Phaser.GameObjects.Shape {
  switch (texture) {
    case "spark":
      return scene.add.star(x, y, 4, Math.max(1, size * 0.22), size, color, alpha);
    case "shard":
      return scene.add.triangle(x, y, 0, -size, size * 0.7, size * 0.7, -size * 0.45, size * 0.45, color, alpha);
    case "streak":
      return scene.add.rectangle(x, y, size * 2.6, Math.max(2, size * 0.42), color, alpha);
    case "ember":
      return scene.add.ellipse(x, y, size * 0.9, size * 1.45, color, alpha);
    case "droplet":
      return scene.add.ellipse(x, y, size * 0.72, size * 1.6, color, alpha);
    case "stone":
      return scene.add.polygon(
        x,
        y,
        [
          -size * 0.75,
          -size * 0.45,
          size * 0.28,
          -size * 0.65,
          size * 0.78,
          size * 0.12,
          size * 0.08,
          size * 0.72,
          -size * 0.62,
          size * 0.38,
        ],
        color,
        alpha,
      );
    case "rune":
      return scene.add.rectangle(x, y, size * 1.2, size * 1.2, color, alpha);
    case "smoke":
      return scene.add.ellipse(x, y, size * 1.8, size * 1.2, color, alpha);
    case "orb":
      return scene.add.circle(x, y, size, color, alpha);
  }
}

export function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count: number,
  color: number,
  spread: number,
  speed: number,
  opts?: {
    rise?: boolean;
    size?: number;
    duration?: number;
    texture?: VfxParticleTexture;
    alpha?: number;
    directional?: boolean;
    gravity?: number;
    biasX?: number;
    biasY?: number;
  },
): void {
  const rise = opts?.rise ?? false;
  const size = opts?.size ?? 5;
  const baseDuration = opts?.duration ?? 600;
  const texture = opts?.texture ?? "orb";
  const alpha = opts?.alpha ?? 0.9;
  const biasX = opts?.biasX ?? 0;
  const biasY = opts?.biasY ?? 0;
  for (let i = 0; i < count; i++) {
    const particleSize = size * (0.65 + Math.random() * 0.65);
    const dot = createParticle(scene, texture, x, y, particleSize, color, alpha);
    dot.setDepth(200);
    const angle = Math.random() * Math.PI * 2;
    const dist = 18 + Math.random() * spread * 1.4;
    const vx = Math.cos(angle) * dist + biasX * (10 + Math.random() * spread);
    const vy = Math.sin(angle) * dist + biasY * (10 + Math.random() * spread);
    const duration = battleDuration(baseDuration, speed) * (0.6 + Math.random() * 0.6);
    dot.setAngle(opts?.directional ? Phaser.Math.RadToDeg(Math.atan2(vy, vx)) : Math.random() * 180);
    scene.tweens.add({
      targets: dot,
      x: x + vx,
      y: y + vy - (rise ? 20 + Math.random() * 34 : 0) + (opts?.gravity ?? 0),
      alpha: 0,
      angle: dot.angle + (opts?.directional ? 0 : -90 + Math.random() * 180),
      scale: texture === "smoke" ? 1.7 : 0.18,
      duration,
      ease: "Power2",
      onComplete: () => dot.destroy(),
    });
  }
}

function burstFromProfile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  profile: VfxBurstProfile,
  speed: number,
  actorOnLeft: boolean,
): void {
  const biasX = profile.directional ? (actorOnLeft ? 0.28 : -0.28) : 0;
  burst(scene, x, y, profile.count, profile.color, profile.spread, speed, {
    texture: profile.texture,
    size: profile.size,
    alpha: profile.alpha,
    duration: profile.duration,
    rise: profile.rise,
    directional: profile.directional,
    gravity: profile.gravity,
    biasX,
  });
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

export function ringFlash(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  speed: number,
  opts?: { alpha?: number; scale?: number; duration?: number },
): void {
  const ring = scene.add.circle(x, y, 12, color, opts?.alpha ?? 0.45).setDepth(198);
  scene.tweens.add({
    targets: ring,
    scale: opts?.scale ?? 7,
    alpha: 0,
    duration: battleDuration(opts?.duration ?? 500, speed),
    ease: "Power2",
    onComplete: () => ring.destroy(),
  });
}

export function impactFlash(scene: Phaser.Scene, x: number, y: number, color: number, alpha: number, scale: number, speed: number): void {
  const flash = scene.add.circle(x, y, 10, color, alpha).setDepth(199);
  scene.tweens.add({
    targets: flash,
    scale,
    alpha: 0,
    duration: battleDuration(170, speed),
    ease: "Cubic.easeOut",
    onComplete: () => flash.destroy(),
  });
}

/**
 * One-shot rotating ring of sprites — spell circles under a target, swirling
 * gusts, rising glyph rings. Sprites ride an ellipse (squashed Y) so the
 * ring reads as lying on the ground; `spinRate` is deg/sec.
 */
export function playCircleVfx(
  scene: Phaser.Scene,
  x: number,
  y: number,
  profile: VfxCircleProfile,
  speed: number,
): void {
  const ring = scene.add.container(x, y).setDepth(195).setAlpha(0);
  const n = Math.max(1, Math.round(profile.count));
  const step = (Math.PI * 2) / n;
  const kids: Phaser.GameObjects.Shape[] = [];
  for (let i = 0; i < n; i++) {
    const s = createParticle(
      scene, profile.texture, 0, 0, profile.size, profile.color, profile.alpha ?? 0.75,
    );
    ring.add(s);
    kids.push(s);
  }
  const duration = battleDuration(profile.duration ?? 900, speed);
  const rate = ((profile.spinRate ?? 150) * Math.PI) / 180;
  const spin = { a: 0, r: 0 };
  scene.tweens.add({
    targets: spin,
    a: rate * (duration / 1000),
    r: profile.expand ?? 0,
    duration,
    ease: "Linear",
    onUpdate: () => {
      const r = profile.radius + spin.r;
      for (let i = 0; i < n; i++) {
        const a = spin.a + i * step;
        kids[i].setPosition(Math.cos(a) * r, Math.sin(a) * r * 0.42);
      }
    },
  });
  scene.tweens.add({ targets: ring, alpha: 1, duration: duration * 0.18 });
  scene.tweens.add({
    targets: ring,
    alpha: 0,
    delay: duration * 0.62,
    duration: duration * 0.38,
    onComplete: () => ring.destroy(true),
  });
  if (profile.rise) {
    scene.tweens.add({ targets: ring, y: y - profile.rise, duration, ease: "Sine.easeOut" });
  }
  // Attached emitter — particles rise off the ring edge for its lifetime,
  // tracking expansion and the rise drift.
  if (profile.emit) {
    const emit = profile.emit;
    const tick = battleDuration(200, speed);
    scene.time.addEvent({
      delay: tick,
      repeat: Math.max(0, Math.floor(duration / tick) - 1),
      callback: () =>
        emitCircleParticles(scene, ring.x, ring.y, profile.radius + spin.r, emit, speed),
    });
  }
}

/** One rising stream particle; shared by the one-shot emitter and the cast
 * loop. Returns the shape so callers can track it if needed. */
function spawnStreamParticle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  profile: VfxStreamProfile,
  speed: number,
): Phaser.GameObjects.Shape {
  const px = x + (Math.random() * 2 - 1) * profile.width;
  const py = y + (Math.random() * 2 - 1) * 4;
  const s = createParticle(
    scene,
    profile.texture,
    px,
    py,
    profile.size * (0.7 + Math.random() * 0.6),
    profile.color,
    profile.alpha ?? 0.85,
  ).setDepth(197);
  const life = battleDuration((profile.life ?? 700) * (0.7 + Math.random() * 0.6), speed);
  const startAlpha = profile.alpha ?? 0.85;
  const c1 = Phaser.Display.Color.IntegerToColor(profile.color);
  const c2 = Phaser.Display.Color.IntegerToColor(profile.colorEnd ?? profile.color);
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: life,
    onUpdate: (tw) => {
      const t = tw.getValue() ?? 0;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(c1, c2, 1, t);
      s.setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), startAlpha * (1 - t));
    },
    onComplete: () => s.destroy(),
  });
  // Streams rise by default; `fall` mirrors the climb for rain/ash/spores.
  const dir = profile.fall ? 1 : -1;
  scene.tweens.add({
    targets: s,
    y: py + dir * profile.height * (0.75 + Math.random() * 0.5),
    scale: 0.4,
    duration: life,
    ease: profile.fall ? "Sine.easeIn" : "Sine.easeOut",
  });
  const sway = profile.sway ?? 0;
  if (sway > 0) {
    scene.tweens.add({
      targets: s,
      x: px + (Math.random() * 2 - 1) * sway,
      duration: life / 3,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });
  }
  return s;
}

/** Spawn `emit.count` particles at random angles on a circle's squashed
 * ellipse; the stream profile's `width` then jitters them off the ring line.
 * Shared by the one-shot circle emitter and the cast orbit. */
function emitCircleParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  emit: VfxStreamProfile,
  speed: number,
): void {
  for (let i = 0; i < Math.max(1, Math.round(emit.count)); i++) {
    const a = Math.random() * Math.PI * 2;
    spawnStreamParticle(
      scene,
      x + Math.cos(a) * radius,
      y + Math.sin(a) * radius * 0.42,
      emit,
      speed,
    );
  }
}

/**
 * Rising emitter — `count` particles staggered over `duration` ms climbing
 * `height` px with a sway wobble. Fire flames, heal motes, smoke columns.
 */
export function playStreamVfx(
  scene: Phaser.Scene,
  x: number,
  y: number,
  profile: VfxStreamProfile,
  speed: number,
): void {
  const count = Math.max(1, Math.round(profile.count));
  const window = battleDuration(profile.duration ?? 800, speed);
  for (let i = 0; i < count; i++) {
    scene.time.delayedCall((i / count) * window, () =>
      spawnStreamParticle(scene, x, y, profile, speed),
    );
  }
}

/**
 * Actor→target flight: streaks fly straight facing travel (arrows, bolts),
 * `arc` lobs the path (thrown items), `spin` tumbles it, `trail` drops
 * fading dots. `onHit` fires at arrival — impact layers hang off it.
 */
export function playProjectileVfx(
  scene: Phaser.Scene,
  from: { x: number; y: number },
  to: { x: number; y: number },
  profile: VfxProjectileProfile,
  speed: number,
  onHit?: () => void,
): void {
  const shots = Math.max(1, Math.round(profile.count ?? 1));
  let landed = false;
  const landOnce = () => {
    if (landed) return;
    landed = true;
    onHit?.();
  };
  for (let shot = 0; shot < shots; shot++) {
    // Volleys fan each shot's landing point perpendicular to the flight and
    // stagger launches slightly so the spread reads as separate missiles.
    const fan = shots > 1 ? (shot - (shots - 1) / 2) * 14 : 0;
    const delay = battleDuration(shot * 45, speed);
    const sx = from.x;
    const sy = from.y - 14;
    const dx = to.x - sx;
    const dy = to.y - 10 - sy;
    const d = Math.hypot(dx, dy) || 1;
    const tx = to.x + (-dy / d) * fan;
    const ty = to.y - 10 + (dx / d) * fan;
    const dist = Math.hypot(tx - sx, ty - sy);
    const dur = battleDuration((profile.duration ?? 240) * Math.max(0.5, dist / 140), speed);
    // Random lateral bend per shot — sin(π·p) peaks mid-flight and returns
    // to zero, so weaving bolts still land exactly on the target.
    const bend = (Math.random() * 2 - 1) * (profile.curve ?? 0);
    const launch = () => {
      const proj = createParticle(scene, profile.texture, sx, sy, profile.size, profile.color, 1)
        .setDepth(198);
      if (profile.spin) {
        scene.tweens.add({
          targets: proj,
          angle: profile.spin,
          duration: dur,
          ease: "Linear",
        });
      } else {
        proj.setAngle(Phaser.Math.RadToDeg(Math.atan2(ty - sy, tx - sx)));
      }
      const trailN = Math.round(profile.trail ?? 0);
      const trailTimer =
        trailN > 0
          ? scene.time.addEvent({
              delay: dur / (trailN + 1),
              repeat: trailN - 1,
              callback: () => {
                const dot = scene.add
                  .circle(proj.x, proj.y, Math.max(1, profile.size * 0.45), profile.trailColor ?? profile.color, 0.5)
                  .setDepth(197);
                scene.tweens.add({
                  targets: dot,
                  alpha: 0,
                  scale: 0.3,
                  duration: battleDuration(220, speed),
                  onComplete: () => dot.destroy(),
                });
              },
            })
          : null;
      const prog = { p: 0 };
      scene.tweens.add({
        targets: prog,
        p: 1,
        duration: dur,
        ease: "Linear",
        onUpdate: () => {
          const p = prog.p;
          const sway = bend * Math.sin(Math.PI * p);
          proj.setPosition(
            sx + (tx - sx) * p + (-dy / d) * sway,
            sy + (ty - sy) * p - (profile.arc ?? 0) * 4 * p * (1 - p) + (dx / d) * sway,
          );
        },
        onComplete: () => {
          trailTimer?.remove();
          proj.destroy();
          landOnce();
        },
      });
    };
    if (delay > 0) scene.time.delayedCall(delay, launch);
    else launch();
  }
}

/** Handle for the channeling effect — stop() releases the orbit and emitter. */
export interface CastingVfx {
  stop(): void;
}

/**
 * Sustained casting effect at the actor: the profile's `cast.circle` orbits
 * at the feet and `cast.stream` emits rising motes on a timer, both live
 * until stop(). Categories without a cast section get a generic orbit +
 * mote loop in the category color.
 */
export function startCastVfx(
  scene: Phaser.Scene,
  getPos: () => { x: number; y: number },
  category: VfxCategory,
  speed: number,
): CastingVfx {
  const profile = CATEGORY_VFX_PROFILES[category];
  const cast = profile.cast;
  const items: Phaser.GameObjects.GameObject[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];
  const timers: Phaser.Time.TimerEvent[] = [];

  const circle: VfxCircleProfile = cast?.circle ?? {
    texture: "rune",
    count: 5,
    color: CATEGORY_COLORS[category],
    radius: 18,
    size: 4,
    alpha: 0.65,
    spinRate: 160,
  };
  const ring = scene.add.container(0, 0).setDepth(195);
  const n = Math.max(1, Math.round(circle.count));
  const step = (Math.PI * 2) / n;
  const kids: Phaser.GameObjects.Shape[] = [];
  for (let i = 0; i < n; i++) {
    const s = createParticle(scene, circle.texture, 0, 0, circle.size, circle.color, circle.alpha ?? 0.7);
    ring.add(s);
    kids.push(s);
  }
  // One revolution per (360/spinRate) seconds; the ring follows the actor's
  // live position so channeling survives movement.
  tweens.push(
    scene.tweens.addCounter({
      from: 0,
      to: Math.PI * 2,
      duration: battleDuration((360 / (circle.spinRate ?? 150)) * 1000, speed),
      repeat: -1,
      onUpdate: (tw) => {
        const a = tw.getValue() ?? 0;
        const pos = getPos();
        ring.setPosition(pos.x, pos.y + 2);
        for (let i = 0; i < n; i++) {
          const ang = a + i * step;
          kids[i].setPosition(
            Math.cos(ang) * circle.radius,
            Math.sin(ang) * circle.radius * 0.42,
          );
        }
      },
    }),
  );
  items.push(ring);

  const stream: VfxStreamProfile = cast?.stream ?? {
    texture: "spark",
    count: 2,
    color: CATEGORY_COLORS[category],
    width: 10,
    height: 30,
    size: 2.5,
    alpha: 0.8,
    life: 700,
    sway: 5,
  };
  timers.push(
    scene.time.addEvent({
      delay: battleDuration(220, speed),
      loop: true,
      callback: () => {
        const p = getPos();
        for (let i = 0; i < Math.max(1, Math.round(stream.count)); i++) {
          spawnStreamParticle(scene, p.x, p.y - 6, stream, speed);
        }
      },
    }),
  );

  // Circle-attached emitter — particles rise off the orbit ring edge.
  if (circle.emit) {
    const emit = circle.emit;
    timers.push(
      scene.time.addEvent({
        delay: battleDuration(220, speed),
        loop: true,
        callback: () => {
          const p = getPos();
          emitCircleParticles(scene, p.x, p.y + 2, circle.radius, emit, speed);
        },
      }),
    );
  }

  return {
    stop() {
      for (const t of timers) t.remove();
      for (const tw of tweens) tw.remove();
      for (const o of items) o.destroy(true);
    },
  };
}

export function playCategoryVfx(
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
  const profile = CATEGORY_VFX_PROFILES[category];
  const impactY = targetY + (category === "earth" ? 4 : category === "thunder" ? -18 : category === "holy" || category === "heal" || category === "buff" ? -10 : 0);

  const impact = () => {
    for (const layer of profile.bursts) {
      burstFromProfile(scene, targetX, impactY, layer, speed, actorOnLeft);
    }
    if (profile.ring) {
      ringFlash(scene, targetX, targetY, profile.ring.color, speed, profile.ring);
    }
    if (profile.flash) {
      impactFlash(scene, targetX, targetY - 4, profile.flash.color, profile.flash.alpha, profile.flash.scale, speed);
    }
  };

  // A configured projectile flies first; bursts/ring/flash land on arrival.
  // Point-blank (field hits, self casts) skips straight to impact.
  const dist = Math.hypot(targetX - actorX, targetY - actorY);
  const firedProjectile = !!profile.projectile && dist >= 16;
  if (firedProjectile) {
    playProjectileVfx(scene, actorPos, targetPos, profile.projectile!, speed, impact);
  } else {
    impact();
  }

  if (profile.circle) {
    playCircleVfx(scene, targetX, targetY + 2, profile.circle, speed);
  }
  if (profile.stream) {
    playStreamVfx(scene, targetX, impactY + 6, profile.stream, speed);
  }

  if (category === "physical" && !firedProjectile) {
    playSwingArc(scene, actorPos, targetPos, 0xf0f0f0, speed);
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
  const actorOnLeft = actorPos ? actorPos.x < targetPos.x : true;
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

/**
 * Leap off the top of the screen, crash onto the target, then bounce home.
 * `up` is the world-space direction that reads as screen-up — (0,−1)
 * orthogonally, (−1,−1) under iso (isoUp). Offsets along it lift the actor
 * vertically on screen regardless of projection.
 */
export function playJumpCrash(
  scene: Phaser.Scene,
  actor: Phaser.GameObjects.Container,
  target: Phaser.GameObjects.Container,
  battleSpeed: number,
  onImpact?: () => void,
  onDone?: () => void,
  up: { x: number; y: number } = { x: 0, y: -1 },
): void {
  const startX = actor.x;
  const startY = actor.y;
  const startDepth = actor.depth;
  // How far along `up` the actor must travel to clear the top of the view.
  // Screen Y is y orthogonally and (x+y)/2 under iso — either way it's
  // up.y·(x+y)-ish, so project through the same screen-y function.
  const screenY = (x: number, y: number) =>
    up.x !== 0 ? (x + y) / 2 : y;
  const skyY = scene.cameras.main.worldView.top - 90;
  const lift = Math.max(0, screenY(startX, startY) - skyY);
  const skyX = startX + up.x * lift;
  const skyYY = startY + up.y * lift;
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
    x: skyX,
    y: skyYY,
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
          // Fall from the sky point toward the target, biased by `up` so the
          // descent reads vertical on screen rather than a world-space slide.
          const p = followCrash.p;
          actor.setPosition(
            target.x + (skyX - target.x) * (1 - p),
            target.y + (skyYY - target.y) * (1 - p),
          );
        },
        onComplete: () => {
          actor.setPosition(target.x, target.y);
          const bp = up.x !== 0
            ? { x: target.x - target.y, y: (target.x + target.y) / 2 + 10 }
            : { x: target.x, y: target.y + 10 };
          burst(scene, bp.x, bp.y, 48, 0xccbb88, 55, battleSpeed, { size: 5, duration: 500 });
          onImpact?.();
          followHop.h = 0;
          scene.tweens.add({
            targets: followHop,
            h: 48,
            duration: battleDuration(67, battleSpeed),
            yoyo: true,
            ease: "Quad.easeOut",
            onUpdate: () => {
              actor.setPosition(
                target.x + up.x * followHop.h,
                target.y + up.y * followHop.h,
              );
            },
            onComplete: () => {
              const fromX = actor.x;
              const fromY = actor.y;
              const apexX = (startX + fromX) / 2 + up.x * 140;
              const apexY = (startY + fromY) / 2 + up.y * 140;
              scene.tweens.add({
                targets: actor,
                x: apexX,
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




