import * as THREE from "three";
import {
  CATEGORY_COLORS,
  CATEGORY_VFX_PROFILES,
  type VfxBurstProfile,
  type VfxCastProfile,
  type VfxCategory,
  type VfxCircleProfile,
  type VfxParticleTexture,
  type VfxProfile,
  type VfxProjectileProfile,
  type VfxStreamProfile,
} from "../vfx/battleVfxProfiles";
import { disposeObject } from "./terrain";

/** Profile numbers are authored in 2D battle pixels (~64px sprites); convert
 * to world units so a ~48px spread lands inside a 1.7-tall actor. */
export const VFX_PX = 1 / 32;
const TAU = Math.PI * 2;

// --- sprite textures ------------------------------------------------------------

const texCache = new Map<string, THREE.DataTexture>();
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Per-pixel alpha shapes — no DOM, so the headless world.spec can run them.
 * Textures are white; SpriteMaterial.color supplies the tint. */
function shapeAlpha(name: string, u: number, v: number): number {
  const r = Math.hypot(u, v);
  switch (name) {
    case "orb": return smooth(1, .55, r);
    case "glow": return Math.max(0, 1 - r) ** 2 * .9;
    case "spark": {
      let a = 0;
      for (const ang of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
        const perp = Math.abs(u * Math.sin(ang) - v * Math.cos(ang));
        a = Math.max(a, Math.max(0, 1 - perp / .14) * Math.max(0, 1 - r * 1.05));
      }
      return a;
    }
    case "smoke": return Math.max(0, 1 - r) ** 1.4 * .6;
    case "shard": { // triangle
      const ax = 0, ay = -1, bx = .65, by = .6, cx = -.6, cy = .5;
      const d = Math.min(
        Math.abs((u - ax) * (by - ay) - (v - ay) * (bx - ax)) / Math.hypot(bx - ax, by - ay),
        Math.abs((u - bx) * (cy - by) - (v - by) * (cx - bx)) / Math.hypot(cx - bx, cy - by),
        Math.abs((u - cx) * (ay - cy) - (v - cy) * (ax - cx)) / Math.hypot(ax - cx, ay - cy));
      const s = Math.sign((u - ax) * (by - ay) - (v - ay) * (bx - ax)) * Math.sign((u - bx) * (cy - by) - (v - by) * (cx - bx)) * Math.sign((u - cx) * (ay - cy) - (v - cy) * (ax - cx));
      return s > 0 ? 1 : smooth(.06, 0, d);
    }
    case "streak": return Math.max(0, 1 - Math.hypot(u, v / .22)) ** .8;
    case "ember": return Math.max(0, 1 - Math.hypot(u / .55, (v + .1) / .75)) ** .9;
    case "droplet": return Math.max(0, 1 - Math.hypot(u / .5, v / .8)) ** .9;
    case "stone": return r < .62 * (1 + .18 * Math.sin(5 * Math.atan2(v, u) + 1.3)) ? 1 : 0;
    case "rune": {
      const diamond = Math.abs(u) + Math.abs(v);
      const outline = smooth(.09, .03, Math.abs(diamond - .72));
      const stem = Math.abs(u) < .06 && Math.abs(v) < .42 ? 1 : 0;
      return Math.max(outline, stem);
    }
    case "ring": return smooth(.14, .05, Math.abs(r - .8));
    default: return smooth(1, .6, r);
  }
}

function particleTexture(name: VfxParticleTexture | "glow" | "ring"): THREE.DataTexture {
  let tex = texCache.get(name);
  if (tex) return tex;
  const S = 48, data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = Math.round(255 * Math.min(1, Math.max(0, shapeAlpha(name, (x + .5) / S * 2 - 1, (y + .5) / S * 2 - 1))));
    const i = (y * S + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = a;
  }
  tex = new THREE.DataTexture(data, S, S); tex.needsUpdate = true;
  texCache.set(name, tex);
  return tex;
}

// --- internals -------------------------------------------------------------------

interface Track {
  obj: THREE.Object3D;
  age: number;
  life: number;
  update: (t: number, dt: number) => void;
}
interface Timer { at: number; fn: () => void }
interface CastFx {
  root: THREE.Group;
  ring: THREE.Group;
  /** Smaller counter-rotating glyph ring inside `ring` — the FFXI magic circle. */
  ring2: THREE.Group;
  disc?: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  aura?: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  light?: THREE.PointLight;
  spin: number;
  /** Advancing angle for the rising mote helix. */
  spiral: number;
  stream?: VfxStreamProfile;
  emit?: VfxStreamProfile;
  emitRadius?: number;
  next: number;
  color: number;
}
/** Actor→target intent ribbon — mirrors the 2D battle arc (drawBezierArc in
 * phaser/battleVfx.ts): a camera-facing band along a quadratic bezier that
 * draws itself from actor to target behind a bright head dot, then erodes
 * tail-first. Two strips per tether — a wide faint glow and a thin bright
 * core — like the 2D glow pass + 2px core stroke. */
interface TetherFx {
  /** Root group holding glow mesh + core mesh + head sprite. */
  root: THREE.Group;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  pos: THREE.BufferAttribute;
  glowMat: THREE.MeshBasicMaterial;
  glowPos: THREE.BufferAttribute;
  headDot: THREE.Sprite;
  from: THREE.Object3D | THREE.Vector3;
  to: THREE.Object3D | THREE.Vector3;
  age: number;
  /** Draw frontier 0→1 — the head travelling actor→target. */
  head: number;
  /** Erosion frontier 0→1 — the tail dissolving actor→target. */
  tail: number;
  /** Seconds for the head to cross the full arc. */
  drawDur: number;
  /** Clock when tail erosion begins; Infinity while an owner holds it open. */
  tailAt: number;
  tailDur: number;
  opacity: number;
  /** Core strip half-width in world units; the glow pass rides at ~2.6x. */
  half: number;
}

const clampCount = (n: number, max = 64) => Math.max(1, Math.min(max, Math.round(n)));
const easeOut = (t: number) => 1 - (1 - t) ** 2;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const UP = new THREE.Vector3(0, 1, 0);
const TETHER_SEGMENTS = 20;
const tetherIndex = (() => {
  let cache: number[] | undefined;
  return () => {
    if (!cache) {
      cache = [];
      for (let i = 0; i < TETHER_SEGMENTS; i++) { const a = i * 2; cache.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    return cache;
  };
})();

/**
 * Three.js playback of the shared VfxProfile documents (see
 * vfx/battleVfxProfiles.ts). Effects are sprite/mesh jobs
 * stepped by update(); everything is bounded and disposed with the player.
 */
export class WorldVfx {
  readonly group = new THREE.Group();
  private tracks: Track[] = [];
  private timers: Timer[] = [];
  private casts = new Set<CastFx>();
  private tethers = new Set<TetherFx>();
  private clock = 0;

  private add(parent: THREE.Object3D, obj: THREE.Object3D, life: number, update: Track["update"]) {
    parent.add(obj);
    this.tracks.push({ obj, age: 0, life: Math.max(.05, life), update });
  }
  private after(ms: number, fn: () => void) { this.timers.push({ at: this.clock + ms / 1000, fn }); }

  private sprite(tex: VfxParticleTexture | "glow" | "ring", color: number, sizePx: number, alpha = 1): THREE.Sprite {
    const m = new THREE.SpriteMaterial({ map: particleTexture(tex), color, transparent: true, opacity: alpha, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(sizePx * 2 * VFX_PX);
    return s;
  }

  // --- generic one-shots ---------------------------------------------------------

  /** Small radial pop — click markers, dodge puffs, footsteps. */
  burst(position: THREE.Vector3, color = 0x9cdef0) {
    this.spawnBurst({ texture: "spark", count: 14, color, spread: 30, size: 3.5, alpha: .85, rise: true, duration: 520 }, position.clone().add(new THREE.Vector3(0, .45, 0)));
    this.spawnRing({ color, alpha: .5, scale: 4.5, duration: 450 }, position.clone());
  }

  private spawnBurst(p: VfxBurstProfile, at: THREE.Vector3, bias = new THREE.Vector3()) {
    const count = clampCount(p.count);
    for (let i = 0; i < count; i++) {
      const size = p.size * (.65 + Math.random() * .65);
      const s = this.sprite(p.texture, p.color, size, p.alpha ?? .9);
      const angle = Math.random() * TAU;
      const dist = (18 + Math.random() * p.spread * 1.4) * VFX_PX;
      const disp = new THREE.Vector3(
        Math.cos(angle) * dist + bias.x * (10 + Math.random() * p.spread) * VFX_PX,
        (Math.random() - .35) * dist * .9 + bias.y * dist,
        Math.sin(angle) * dist + bias.z * (10 + Math.random() * p.spread) * VFX_PX,
      );
      if (p.rise) disp.y += (20 + Math.random() * 34) * VFX_PX;
      disp.y -= (p.gravity ?? 0) * VFX_PX;
      if (p.directional) s.material.rotation = Math.atan2(disp.y, Math.hypot(disp.x, disp.z)) + Math.atan2(disp.z, disp.x);
      else s.material.rotation = Math.random() * 180;
      const spin = p.directional ? 0 : (-90 + Math.random() * 180) * Math.PI / 180;
      const life = (p.duration ?? 600) * (.6 + Math.random() * .6) / 1000;
      const scaleTo = p.texture === "smoke" ? 1.7 : .18;
      const from = at.clone();
      const alpha = p.alpha ?? .9;
      this.add(this.group, s, life, t => {
        const e = easeOut(t);
        s.position.copy(from).addScaledVector(disp, e);
        s.material.opacity = alpha * (1 - t);
        s.material.rotation += spin * .016;
        s.scale.setScalar(size * 2 * VFX_PX * (1 + (scaleTo - 1) * e));
      });
    }
  }

  private spawnRing(ring: NonNullable<VfxProfile["ring"]>, at: THREE.Vector3) {
    // A flat ground ring, not a billboard — it must lie in the XZ plane.
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(.86, 1, 48),
      new THREE.MeshBasicMaterial({ color: ring.color, transparent: true, opacity: ring.alpha, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(at).add(new THREE.Vector3(0, .12, 0));
    const base = 12 * VFX_PX;
    const life = ring.duration / 1000;
    this.add(this.group, mesh, life, t => {
      mesh.scale.setScalar(base * (1 + (ring.scale - 1) * easeOut(t)));
      (mesh.material as THREE.MeshBasicMaterial).opacity = ring.alpha * (1 - t);
    });
  }

  private spawnFlash(flash: NonNullable<VfxProfile["flash"]>, at: THREE.Vector3) {
    const s = this.sprite("glow", flash.color, 20, flash.alpha);
    s.position.copy(at);
    this.add(this.group, s, .17, t => {
      s.scale.setScalar(20 * 2 * VFX_PX * (1 + (flash.scale - 1) * easeOut(t)));
      s.material.opacity = flash.alpha * (1 - t);
    });
  }

  /** One-shot rotating ring of sprites on the ground plane — spell circles,
   * gusts, shockwaves. `emit` spawns stream particles on the circumference. */
  private spawnCircle(p: VfxCircleProfile, at: THREE.Vector3) {
    const n = clampCount(p.count, 24);
    const ring = new THREE.Group();
    ring.position.copy(at).add(new THREE.Vector3(0, .1, 0));
    const kids: THREE.Sprite[] = [];
    for (let i = 0; i < n; i++) {
      const s = this.sprite(p.texture, p.color, p.size, p.alpha ?? .75);
      ring.add(s); kids.push(s);
    }
    const duration = (p.duration ?? 900) / 1000;
    const rate = (p.spinRate ?? 150) * Math.PI / 180;
    let angle = 0;
    const alpha = p.alpha ?? .75;
    this.add(this.group, ring, duration, (t, dt) => {
      angle += rate * dt;
      const radius = (p.radius + (p.expand ?? 0) * t) * VFX_PX;
      for (let i = 0; i < n; i++) {
        const a = angle + (i / n) * TAU;
        kids[i].position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      }
      if (p.rise) ring.position.y = at.y + .1 + p.rise * VFX_PX * easeOut(t);
      const fade = t < .18 ? t / .18 : 1 - Math.max(0, (t - .62) / .38);
      for (const k of kids) k.material.opacity = alpha * fade;
    });
    if (p.emit) {
      const emit = p.emit, radius = p.radius * VFX_PX, ticks = Math.max(0, Math.floor(duration / .2) - 1);
      for (let i = 0; i < ticks; i++) {
        this.after(i * 200 + 200, () => {
          for (let j = 0; j < clampCount(emit.count, 12); j++) {
            const a = Math.random() * TAU;
            this.spawnStreamParticle(emit, new THREE.Vector3(at.x + Math.cos(a) * radius, at.y + .1, at.z + Math.sin(a) * radius));
          }
        });
      }
    }
  }

  private spawnStreamParticle(p: VfxStreamProfile, at: THREE.Vector3, parent = this.group) {
    const size = p.size * (.7 + Math.random() * .6);
    const s = this.sprite(p.texture, p.color, size, p.alpha ?? .85);
    const life = (p.life ?? 700) * (.7 + Math.random() * .6) / 1000;
    const dir = p.fall ? -1 : 1;
    const climb = dir * p.height * VFX_PX * (.75 + Math.random() * .5);
    const sway = (p.sway ?? 0) * VFX_PX;
    const seed = Math.random() * TAU;
    const c1 = new THREE.Color(p.color), c2 = new THREE.Color(p.colorEnd ?? p.color);
    const alpha = p.alpha ?? .85;
    const start = at.clone();
    this.add(parent, s, life, t => {
      const e = p.fall ? t * t : 1 - (1 - t) ** 2; // fall accelerates, rise decelerates
      s.position.set(start.x + Math.sin(seed + t * Math.PI * 1.5) * sway * (1 - t), start.y + climb * e, start.z + Math.cos(seed * 1.7 + t * Math.PI) * sway * .6 * (1 - t));
      s.material.opacity = alpha * (1 - t);
      s.material.color.lerpColors(c1, c2, t);
      s.scale.setScalar(size * 2 * VFX_PX * (1 - .6 * t));
    });
  }

  /** Rising emitter — `count` particles staggered over `duration` ms. */
  private spawnStream(p: VfxStreamProfile, at: THREE.Vector3) {
    const count = clampCount(p.count);
    const window = p.duration ?? 800;
    for (let i = 0; i < count; i++) {
      const off = new THREE.Vector3((Math.random() * 2 - 1) * p.width * VFX_PX, 0, (Math.random() * 2 - 1) * p.width * VFX_PX);
      this.after((i / count) * window, () => this.spawnStreamParticle(p, at.clone().add(off)));
    }
  }

  private spawnProjectile(p: VfxProjectileProfile, from: THREE.Vector3, to: THREE.Vector3, onHit?: () => void) {
    const shots = clampCount(p.count ?? 1, 8);
    let landed = false;
    const landOnce = () => { if (!landed) { landed = true; onHit?.(); } };
    const start = from.clone().add(new THREE.Vector3(0, 1.1, 0));
    const baseEnd = to.clone().add(new THREE.Vector3(0, .8, 0));
    const flat = new THREE.Vector3().subVectors(baseEnd, start); flat.y = 0;
    const d = Math.max(1e-4, Math.hypot(flat.x, flat.z));
    const perp = new THREE.Vector3(-flat.z / d, 0, flat.x / d);
    for (let shot = 0; shot < shots; shot++) {
      const fan = shots > 1 ? (shot - (shots - 1) / 2) * 14 * VFX_PX : 0;
      const end = baseEnd.clone().addScaledVector(perp, fan);
      const distPx = start.distanceTo(end) / VFX_PX;
      const dur = (p.duration ?? 240) * Math.max(.5, distPx / 140) / 1000;
      const bend = (Math.random() * 2 - 1) * (p.curve ?? 0) * VFX_PX;
      this.after(shot * 45, () => {
        const proj = this.sprite(p.texture, p.color, p.size, 1);
        const spin = (p.spin ?? 0) * Math.PI / 180;
        const trailN = clampCount(p.trail ?? 0, 16);
        for (let i = 0; i < trailN; i++) {
          this.after(((i + 1) / (trailN + 1)) * dur * 1000, () => {
            const dot = this.sprite("orb", p.trailColor ?? p.color, p.size * .45, .5);
            dot.position.copy(proj.position);
            this.add(this.group, dot, .22, t => { dot.material.opacity = .5 * (1 - t); dot.scale.setScalar(p.size * .45 * 2 * VFX_PX * (1 - .7 * t)); });
          });
        }
        this.add(this.group, proj, dur + .05, (t, dt) => {
          const tp = Math.min(1, t * (dur + .05) / dur);
          const sway = bend * Math.sin(Math.PI * tp);
          proj.position.lerpVectors(start, end, tp).addScaledVector(perp, sway);
          proj.position.y += (p.arc ?? 0) * VFX_PX * 4 * tp * (1 - tp);
          if (spin) proj.material.rotation += spin * dt;
          else proj.material.rotation = Math.atan2(-(end.y - start.y), d) * .3;
          if (tp >= 1) landOnce();
        });
      });
    }
    // Safety: if every shot missed its landing frame, still resolve the hit.
    this.after((p.duration ?? 240) * 2 + shots * 45 + 300, landOnce);
  }

  // --- profile playback -------------------------------------------------------------

  /** All impact layers of a profile at a world position. */
  playImpact(profile: VfxProfile, target: THREE.Vector3, bias = new THREE.Vector3()) {
    const center = target.clone().add(new THREE.Vector3(0, .9, 0));
    for (const b of profile.bursts) this.spawnBurst(b, center, bias);
    if (profile.flash) this.spawnFlash(profile.flash, center);
    if (profile.ring) this.spawnRing(profile.ring, target);
    if (profile.circle) this.spawnCircle(profile.circle, target);
    if (profile.stream) this.spawnStream(profile.stream, target.clone().add(new THREE.Vector3(0, .15, 0)));
  }

  /** Play a full profile at `target`; projectile flies `from` → target first. */
  playProfile(profile: VfxProfile, target: THREE.Vector3, from?: THREE.Vector3) {
    const impact = () => this.playImpact(profile, target, from && target.clone().sub(from).setY(0).normalize().multiplyScalar(.28));
    if (profile.projectile && from && from.distanceTo(target) > .5) this.spawnProjectile(profile.projectile, from, target, impact);
    else impact();
  }

  playCategory(category: VfxCategory, target: THREE.Vector3, from?: THREE.Vector3, anchor?: THREE.Object3D) {
    const profile = CATEGORY_VFX_PROFILES[category];
    const bias = from ? target.clone().sub(from).setY(0).normalize().multiplyScalar(.28) : undefined;
    const impact = () => this.elementalImpact(category, profile, target, anchor, bias);
    if (profile.projectile && from && from.distanceTo(target) > .5) this.spawnProjectile(profile.projectile, from, target, impact);
    else impact();
  }

  // --- elemental signatures -----------------------------------------------------
  // Category-specific geometry effects — the shared sprite profiles are authored
  // for the 2D battle player, so here each element gets a real 3D treatment.
  // flash/ring/projectile layers still come from the profile so editor overrides
  // keep working; physical/heal/buff fall through to the generic impact.

  private basicMat(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  }

  private boltSegment(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 5, 1, true), mat);
    m.position.copy(a).lerp(b, .5);
    m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    return m;
  }

  private elementalImpact(category: VfxCategory, profile: VfxProfile, target: THREE.Vector3, anchor?: THREE.Object3D, bias?: THREE.Vector3) {
    const center = target.clone().add(new THREE.Vector3(0, .9, 0));
    switch (category) {
      case "fire": {
        if (profile.flash) this.spawnFlash(profile.flash, center);
        this.fxDome(target, 0xff8a30);
        this.spawnBurst({ texture: "ember", count: 18, color: 0xff9a2f, spread: 40, size: 6, alpha: .95, rise: true, duration: 480 }, center, bias);
        this.fxScorch(target);
        this.fxIgnite(target, anchor, profile.stream);
        return;
      }
      case "ice": {
        if (profile.flash) this.spawnFlash(profile.flash, center);
        this.fxDome(target, 0x9fd8ff);
        this.spawnBurst({ texture: "shard", count: 16, color: 0xbbeeff, spread: 40, size: 6, alpha: .9, duration: 600 }, center, bias);
        this.fxIceCrystals(target);
        return;
      }
      case "thunder": this.fxLightning(target, profile.flash); return;
      case "wind": {
        this.spawnBurst({ texture: "smoke", count: 8, color: 0x9ecfb8, spread: 30, size: 7, alpha: .3, rise: true, duration: 700 }, target.clone().add(new THREE.Vector3(0, .15, 0)));
        this.fxTornado(target);
        return;
      }
      case "earth": {
        this.spawnBurst({ texture: "smoke", count: 14, color: 0x5d5046, spread: 42, size: 8, alpha: .34, duration: 800 }, target.clone().add(new THREE.Vector3(0, .25, 0)));
        this.fxStoneSpikes(target);
        return;
      }
      case "water": {
        this.fxDome(target, 0x7bd4ff, .9);
        this.fxGeyser(target);
        return;
      }
      case "holy": {
        this.fxLightPillar(target, 0xffffcc, 0xfff2b8, .5, 3.6);
        this.spawnStream({ texture: "spark", count: 12, color: 0xffffcc, colorEnd: 0xffdf7a, width: 16, height: 40, size: 2.5, alpha: .9, duration: 700, life: 700, sway: 5 }, target.clone().add(new THREE.Vector3(0, .2, 0)));
        if (profile.circle) this.spawnCircle(profile.circle, target);
        return;
      }
      case "dark": {
        this.fxDarkMaw(target);
        if (profile.stream) this.spawnStream(profile.stream, target.clone().add(new THREE.Vector3(0, .15, 0)));
        return;
      }
      case "poison": {
        this.fxPoison(target);
        if (profile.stream) this.spawnStream(profile.stream, target.clone().add(new THREE.Vector3(0, .15, 0)));
        return;
      }
      case "heal": {
        // Cure — a soft pillar of light with the motes/ring from the profile.
        this.fxLightPillar(target, 0xd8ffe6, 0x9fffc0, .3, 2.6);
        this.playImpact(profile, target, bias ?? new THREE.Vector3());
        return;
      }
      case "buff": {
        this.fxLightPillar(target, 0xffedb0, 0xffd700, .26, 2.3);
        this.playImpact(profile, target, bias ?? new THREE.Vector3());
        return;
      }
      default: this.playImpact(profile, target, bias ?? new THREE.Vector3());
    }
  }

  /** Fire — the target stays ablaze ~1.8s. The emitter follows `anchor` (the
   * actor root) so a moving victim keeps burning; particles spawn in world
   * space so the trail lags behind naturally. */
  private fxIgnite(target: THREE.Vector3, anchor: THREE.Object3D | undefined, stream?: VfxStreamProfile) {
    const holder = new THREE.Group();
    const light = new THREE.PointLight(0xff7733, 0, 4.5);
    holder.add(light);
    const parent = anchor ?? this.group;
    if (anchor) holder.position.y = .6; else holder.position.copy(target).y += .6;
    const flame: VfxStreamProfile = stream ?? { texture: "ember", count: 3, color: 0xff9a2f, colorEnd: 0x5f1820, width: 14, height: 44, size: 5, alpha: .9, life: 700, sway: 7 };
    const smoke: VfxStreamProfile = { texture: "smoke", count: 1, color: 0x3a2328, width: 12, height: 34, size: 8, alpha: .3, life: 900, sway: 6 };
    const world = new THREE.Vector3();
    let acc = 0;
    this.add(parent, holder, 1.8, (t, dt) => {
      acc += dt;
      holder.getWorldPosition(world);
      const burning = t < .72;
      light.intensity = burning ? (5 + Math.sin(this.clock * 43) * 1.6 + Math.random() * 1.2) * (1 - t / .72) : 0;
      while (acc >= .055 && burning) {
        acc -= .055;
        const n = clampCount(flame.count, 4);
        for (let i = 0; i < n; i++) {
          const off = new THREE.Vector3(rand(-1, 1) * flame.width * VFX_PX, rand(0, .5), rand(-1, 1) * flame.width * VFX_PX);
          this.spawnStreamParticle(flame, world.clone().add(off));
        }
        if (Math.random() < .4) this.spawnStreamParticle(smoke, world.clone().add(new THREE.Vector3(rand(-.2, .2), 1, rand(-.2, .2))));
      }
      if (!burning) acc = 0;
    });
  }

  /** Thunder — a jagged bolt from the sky to the target, flickering, plus a
   * flash of light and a ground shock ring. */
  private fxLightning(target: THREE.Vector3, flash?: VfxProfile["flash"]) {
    const strike = (top: THREE.Vector3, end: THREE.Vector3, core: number, glow: number, life: number) => {
      const segs = 8, pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const f = i / segs;
        const p = top.clone().lerp(end, f);
        if (i > 0 && i < segs) { p.x += rand(-.4, .4) * (1 - f * .4); p.z += rand(-.4, .4) * (1 - f * .4); }
        pts.push(p);
      }
      const g = new THREE.Group();
      const coreMat = this.basicMat(0xfffbe8, 1), glowMat = this.basicMat(0x9aa2ff, .45);
      for (let i = 0; i < segs; i++) {
        g.add(this.boltSegment(pts[i], pts[i + 1], core, coreMat));
        g.add(this.boltSegment(pts[i], pts[i + 1], glow, glowMat));
      }
      this.add(this.group, g, life, t => {
        const flicker = t < .55 ? (Math.random() > .3 ? 1 : .45) : 1 - (t - .55) / .45;
        coreMat.opacity = flicker; glowMat.opacity = .45 * flicker;
      });
    };
    const top = target.clone().add(new THREE.Vector3(rand(-.9, .9), 7, rand(-.9, .9)));
    const end = target.clone().add(new THREE.Vector3(0, 1.15, 0));
    strike(top, end, .028, .085, .34);
    this.after(70, () => strike(top.clone().add(new THREE.Vector3(rand(-1.4, 1.4), .4, rand(-1.4, 1.4))), end, .02, .06, .26));
    const light = new THREE.PointLight(0xccddff, 9, 9);
    light.position.copy(end);
    this.add(this.group, light, .3, t => { light.intensity = 9 * (1 - t); });
    this.spawnFlash({ color: 0xffffcc, alpha: flash?.alpha ?? .3, scale: (flash?.scale ?? 3.8) * 1.2 }, end);
    this.spawnRing({ color: 0x9aa2ff, alpha: .5, scale: 6, duration: 420 }, target);
    this.spawnBurst({ texture: "spark", count: 16, color: 0xffff88, spread: 40, size: 3.5, alpha: .95, rise: true, duration: 400 }, end);
    this.spawnBurst({ texture: "smoke", count: 8, color: 0x3a3550, spread: 26, size: 7, alpha: .3, rise: true, duration: 650 }, target.clone().add(new THREE.Vector3(0, .2, 0)));
  }

  /** Wind — a funnel vortex whipping around the target: translucent cone plus
   * streak sprites on a tightening helix. */
  private fxTornado(target: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(target);
    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(.85, .12, 2.3, 20, 1, true),
      this.basicMat(0xd9ffe0, .13),
    );
    funnel.position.y = 1.2;
    g.add(funnel);
    interface Swirl { s: THREE.Sprite; h: number; phase: number; r: number; speed: number }
    const swirls: Swirl[] = [];
    for (let i = 0; i < 16; i++) {
      const h = rand(.05, 2.2);
      const s = this.sprite("streak", Math.random() < .6 ? 0xaaffaa : 0xf0ffe6, rand(4, 7), .7);
      s.material.rotation = rand(0, TAU);
      swirls.push({ s, h, phase: rand(0, TAU), r: .2 + .62 * (h / 2.2), speed: rand(.8, 1.4) });
      g.add(s);
    }
    let angle = 0;
    this.add(this.group, g, 1.15, (t, dt) => {
      angle += 11 * dt;
      for (const w of swirls) {
        const a = angle * w.speed + w.phase;
        const r = w.r * (0.75 + .25 * Math.sin(this.clock * 9 + w.phase));
        w.s.position.set(Math.cos(a) * r, w.h + Math.sin(this.clock * 6 + w.phase) * .06, Math.sin(a) * r);
      }
      const fade = Math.min(t / .18, 1) * (1 - Math.max(0, (t - .6) / .4));
      (funnel.material as THREE.MeshBasicMaterial).opacity = .13 * fade;
      funnel.rotation.y = -angle * .6;
      funnel.scale.set(1 + Math.sin(this.clock * 12) * .06, 1, 1 + Math.cos(this.clock * 12) * .06);
      for (const w of swirls) w.s.material.opacity = .7 * fade;
    });
  }

  /** Ice — crystal shards erupt around the target, hold, then melt away. */
  private fxIceCrystals(target: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(target);
    const shards: THREE.Mesh[] = [];
    const palette = [0xd8fbff, 0xbbeeff, 0x8fd4ff];
    for (let i = 0; i < 8; i++) {
      const h = rand(.35, .8);
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(rand(.07, .13), h, 5),
        this.basicMat(palette[i % palette.length], .88),
      );
      const a = rand(0, TAU), r = i < 5 ? rand(.28, .55) : rand(.05, .2);
      m.position.set(Math.cos(a) * r, h * .5 - .02, Math.sin(a) * r);
      if (i >= 5) m.position.y = rand(.7, 1.3); // a couple float at torso height
      m.rotation.set(rand(-.4, .4), rand(0, TAU), rand(-.4, .4));
      m.scale.setScalar(.01);
      g.add(m); shards.push(m);
    }
    const light = new THREE.PointLight(0x9fd8ff, 2.5, 3);
    light.position.y = .8;
    g.add(light);
    this.add(this.group, g, 1.5, t => {
      const grow = easeOut(Math.min(1, t / .22));
      const melt = t < .72 ? 1 : 1 - (t - .72) / .28;
      for (const s of shards) s.scale.setScalar(Math.max(.001, grow * melt));
      light.intensity = 2.5 * grow * melt;
      for (const s of shards) (s.material as THREE.MeshBasicMaterial).opacity = .88 * melt;
    });
    this.spawnBurst({ texture: "spark", count: 12, color: 0xffffff, spread: 26, size: 2.5, alpha: .9, duration: 450 }, target.clone().add(new THREE.Vector3(0, .8, 0)));
  }

  /** Earth — jagged stone spikes burst from the ground around the target,
   * then sink back. */
  private fxStoneSpikes(target: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(target);
    const spikes: { m: THREE.Mesh; h: number; delay: number }[] = [];
    const palette = [0x8a6a4a, 0x7a5637, 0x9a7850];
    for (let i = 0; i < 7; i++) {
      const h = rand(.5, 1);
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(rand(.1, .17), h, 6),
        new THREE.MeshLambertMaterial({ color: palette[i % palette.length] }),
      );
      const a = (i / 7) * TAU + rand(-.3, .3), r = rand(.12, .55);
      m.position.set(Math.cos(a) * r, -h, Math.sin(a) * r);
      m.rotation.set(rand(-.25, .25), rand(0, TAU), rand(-.25, .25));
      g.add(m); spikes.push({ m, h, delay: i * .035 });
    }
    this.add(this.group, g, 1.25, t => {
      for (const { m, h, delay } of spikes) {
        const lt = Math.max(0, Math.min(1, (t * 1.25 - delay) / (1.25 - delay)));
        const up = easeOut(Math.min(1, lt / .18));
        const sink = lt < .72 ? 0 : easeOut((lt - .72) / .28);
        m.position.y = -h + h * (up - sink) + h * .06;
      }
    });
    this.spawnBurst({ texture: "stone", count: 14, color: 0x9a6a45, spread: 34, size: 5.5, alpha: .9, gravity: 22, duration: 600 }, target.clone().add(new THREE.Vector3(0, .3, 0)));
    this.spawnRing({ color: 0x8a6a4a, alpha: .4, scale: 5, duration: 500 }, target);
  }

  /** Water — a geyser column erupts under the target and rains back down. */
  private fxGeyser(target: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(target);
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(.3, .42, 1.7, 14, 1, true),
      this.basicMat(0x7bd4ff, .34),
    );
    column.position.y = .85;
    g.add(column);
    this.add(this.group, g, .85, t => {
      const rise = easeOut(Math.min(1, t / .25));
      const drain = t < .6 ? 1 : 1 - (t - .6) / .4;
      column.scale.set(1 + t * .4, rise * drain, 1 + t * .4);
      column.position.y = .85 * column.scale.y + .05;
      (column.material as THREE.MeshBasicMaterial).opacity = .34 * drain;
    });
    this.spawnBurst({ texture: "droplet", count: 22, color: 0x44aaff, spread: 30, size: 5, alpha: .9, rise: true, duration: 650 }, target.clone().add(new THREE.Vector3(0, .4, 0)));
    this.spawnRing({ color: 0x7bd4ff, alpha: .45, scale: 5.5, duration: 480 }, target);
    this.spawnStream({ texture: "droplet", count: 12, color: 0x7bd4ff, colorEnd: 0x248dff, width: 20, height: 30, size: 3.5, alpha: .85, duration: 700, life: 480, sway: 2, fall: true }, target.clone().add(new THREE.Vector3(0, 1.5, 0)));
  }

  /** Bright translucent dome swelling over the impact — the shared nuke
   * "energy flash" read FFXI spells lead with before the element geometry. */
  private fxDome(target: THREE.Vector3, color: number, radius = 1.05) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 18, 10, 0, TAU, 0, Math.PI / 2),
      this.basicMat(color, .38),
    );
    dome.position.copy(target);
    this.add(this.group, dome, .4, t => {
      dome.scale.setScalar(.22 + easeOut(t) * 1.15);
      (dome.material as THREE.MeshBasicMaterial).opacity = .38 * (1 - t);
    });
  }

  /** Scorched ground left behind by fire magic — a dark mark that fades. */
  private fxScorch(target: THREE.Vector3) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(.55, 20), this.basicMat(0x140b06, .5));
    disc.rotation.x = -Math.PI / 2;
    disc.position.copy(target).add(new THREE.Vector3(0, .055, 0));
    this.add(this.group, disc, 2.2, t => {
      disc.scale.setScalar(.45 + easeOut(Math.min(1, t / .18)) * .65);
      (disc.material as THREE.MeshBasicMaterial).opacity = .5 * (t < .5 ? 1 : 1 - (t - .5) / .5);
    });
  }

  /** A pillar of light descending on the target — holy, cure, and buff all
   * share this shape with different tint/scale. */
  private fxLightPillar(target: THREE.Vector3, beamColor: number, lightColor: number, alpha = .5, height = 3.6) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(.24, .4, height, 16, 1, true),
      this.basicMat(beamColor, alpha),
    );
    beam.position.copy(target).add(new THREE.Vector3(0, height / 2, 0));
    const light = new THREE.PointLight(lightColor, 5, 6);
    light.position.copy(target).add(new THREE.Vector3(0, 1.4, 0));
    const g = new THREE.Group();
    g.add(beam, light);
    this.add(this.group, g, .8, t => {
      const fade = t < .2 ? t / .2 : 1 - (t - .2) / .8;
      (beam.material as THREE.MeshBasicMaterial).opacity = alpha * fade;
      beam.scale.set(1 - t * .5, 1, 1 - t * .5);
      light.intensity = 5 * fade;
    });
  }

  /** Dark — a void sphere swells over the target while shadow streaks are
   * pulled inward, then collapses. */
  private fxDarkMaw(target: THREE.Vector3) {
    const center = target.clone().add(new THREE.Vector3(0, .95, 0));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(.7, 18, 14), this.basicMat(0x14041f, .82));
    orb.position.copy(center);
    orb.scale.setScalar(.05);
    const light = new THREE.PointLight(0x6633aa, 4, 5);
    light.position.copy(center);
    const g = new THREE.Group();
    g.add(orb, light);
    this.add(this.group, g, .85, t => {
      const grow = t < .3 ? easeOut(t / .3) : t < .6 ? 1 : Math.max(.001, 1 - (t - .6) / .4);
      orb.scale.setScalar(grow);
      (orb.material as THREE.MeshBasicMaterial).opacity = .82 * Math.min(1, grow + .3);
      light.intensity = 4 * grow;
    });
    // Streaks pulled into the maw.
    for (let i = 0; i < 8; i++) {
      const s = this.sprite("streak", 0xb28cff, rand(5, 8), .8);
      const a = rand(0, TAU), start = center.clone().add(new THREE.Vector3(Math.cos(a) * rand(.9, 1.3), rand(-.5, .6), Math.sin(a) * rand(.9, 1.3)));
      s.position.copy(start);
      s.material.rotation = Math.atan2(center.y - start.y, center.x - start.x);
      const delay = rand(0, .15);
      this.add(this.group, s, .5 + delay, t => {
        const lt = Math.max(0, (t - delay * 2) / (1 - delay * 2));
        s.position.lerpVectors(start, center, easeOut(lt));
        s.material.opacity = .8 * (1 - lt * lt);
      });
    }
  }

  /** Poison — sickly bubbles and haze boiling up around a pulsing puddle. */
  private fxPoison(target: THREE.Vector3) {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(.7, 20), this.basicMat(0x2d8a48, .34));
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.copy(target).add(new THREE.Vector3(0, .06, 0));
    this.add(this.group, puddle, 1.3, t => {
      const fade = t < .15 ? t / .15 : 1 - (t - .7) / .3;
      (puddle.material as THREE.MeshBasicMaterial).opacity = .34 * fade;
      const pulse = 1 + Math.sin(t * 14) * .06 + t * .3;
      puddle.scale.setScalar(pulse);
    });
    this.spawnStream({ texture: "orb", count: 14, color: 0x66cc44, colorEnd: 0xd4ff70, width: 16, height: 34, size: 4.5, alpha: .75, duration: 900, life: 800, sway: 9 }, target.clone().add(new THREE.Vector3(0, .1, 0)));
    this.spawnBurst({ texture: "smoke", count: 12, color: 0x225238, spread: 36, size: 8, alpha: .36, rise: true, duration: 850 }, target.clone().add(new THREE.Vector3(0, .3, 0)));
  }

  /** Sustained cast/channel effect parented to the caster (moves with it).
   * FFXI-style casting aura: a glowing magic circle at the feet — two
   * counter-rotating glyph rings over a pulsing disc — a faint aura column
   * around the body, an element light, and motes spiraling upward. */
  startCast(cast: VfxCastProfile | undefined, parent: THREE.Object3D): () => void {
    if (!cast) return () => undefined;
    const root = new THREE.Group(); root.position.y = .08;
    const ring = new THREE.Group(); root.add(ring);
    const ring2 = new THREE.Group(); root.add(ring2);
    const color = cast.circle?.color ?? cast.stream?.color ?? 0xffffff;
    const r1 = (cast.circle?.radius ?? 20) * VFX_PX;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(r1 * 1.08, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    disc.rotation.x = -Math.PI / 2; disc.position.y = .02;
    root.add(disc);
    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(.34, .52, 2.05, 14, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    aura.position.y = 1.02;
    root.add(aura);
    const light = new THREE.PointLight(color, 2, 4);
    light.position.y = 1.15;
    root.add(light);
    const fx: CastFx = {
      root, ring, ring2, disc, aura, light,
      spin: ((cast.circle?.spinRate ?? 150) * Math.PI) / 180,
      spiral: rand(0, TAU), stream: cast.stream,
      emit: cast.circle?.emit, emitRadius: r1, next: this.clock, color,
    };
    if (cast.circle) {
      const n = clampCount(cast.circle.count, 24);
      for (let i = 0; i < n; i++) {
        const s = this.sprite(cast.circle.texture, cast.circle.color, cast.circle.size, cast.circle.alpha ?? .7);
        const a = (i / n) * TAU;
        s.position.set(Math.cos(a) * r1, 0, Math.sin(a) * r1);
        ring.add(s);
      }
      const n2 = Math.max(4, Math.round(n * .6)), r2 = r1 * .58;
      for (let i = 0; i < n2; i++) {
        const s = this.sprite(cast.circle.texture, cast.circle.color, cast.circle.size * .72, (cast.circle.alpha ?? .7) * .8);
        const a = (i / n2) * TAU;
        s.position.set(Math.cos(a) * r2, 0, Math.sin(a) * r2);
        ring2.add(s);
      }
    }
    parent.add(root);
    this.casts.add(fx);
    return () => {
      this.casts.delete(fx);
      // Release shimmer — FFXI spells flash at the caster as they fire.
      const at = root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .9, 0));
      this.spawnBurst({ texture: "spark", count: 12, color, spread: 22, size: 3, alpha: .9, rise: true, duration: 380 }, at);
      this.spawnFlash({ color, alpha: .32, scale: 2.4 }, at);
      disposeObject(root);
    };
  }

  startCastCategory(category: VfxCategory, parent: THREE.Object3D): () => void {
    return this.startCast(CATEGORY_VFX_PROFILES[category]?.cast, parent);
  }

  categoryColor(category: VfxCategory): number { return CATEGORY_COLORS[category]; }

  // --- intent ribbons -----------------------------------------------------------------

  private newTether(from: THREE.Object3D | THREE.Vector3, to: THREE.Object3D | THREE.Vector3, color: number, half = .018, opacity = .55): TetherFx {
    const verts = (TETHER_SEGMENTS + 1) * 2 * 3;
    const strip = () => {
      const geo = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(verts), 3);
      geo.setAttribute("position", pos);
      geo.setIndex(tetherIndex());
      return { geo, pos };
    };
    const glow = strip(), core = strip();
    const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const glowMesh = new THREE.Mesh(glow.geo, glowMat);
    const mesh = new THREE.Mesh(core.geo, mat);
    glowMesh.frustumCulled = mesh.frustumCulled = false;
    glowMesh.renderOrder = 4; mesh.renderOrder = 5;
    const headDot = this.sprite("orb", color, 4.5, .8);
    headDot.material.blending = THREE.AdditiveBlending;
    const root = new THREE.Group();
    root.add(glowMesh, mesh, headDot);
    this.group.add(root);
    const t: TetherFx = { root, mesh, mat, pos: core.pos, glowMat, glowPos: glow.pos, headDot, from, to, age: 0, head: 0, tail: 0, drawDur: .34, tailAt: this.clock, tailDur: .9, opacity, half };
    this.tethers.add(t);
    return t;
  }

  /** Ribbon held open until the returned stop is called; it draws on over
   * ~.34s, holds, then erodes tail-first over .45s once released. */
  startTether(from: THREE.Object3D | THREE.Vector3, to: THREE.Object3D | THREE.Vector3, color: number, half = .018, opacity = .55): () => void {
    const t = this.newTether(from, to, color, half, opacity);
    t.tailAt = Infinity;
    t.tailDur = .45;
    return () => { if (t.tailAt === Infinity) t.tailAt = this.clock; };
  }

  /** Self-expiring ribbon flash — one action's telegraph line. `life` sets
   * when the tail starts eroding (floor .3s so the draw-on always reads). */
  flashTether(from: THREE.Object3D | THREE.Vector3, to: THREE.Object3D | THREE.Vector3, color: number, life = .8) {
    const t = this.newTether(from, to, color, .02, .6);
    t.tailAt = this.clock + Math.max(.3, life - .9);
  }

  private tetherPoint(o: THREE.Object3D | THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    if (o instanceof THREE.Vector3) out.copy(o);
    else o.getWorldPosition(out);
    out.y += .95; // chest height — the curve anchors above the feet
    return out;
  }

  /** Rebuild the ribbon strips for one tether: quadratic bezier with a lifted
   * control point, band width perpendicular to the curve toward the camera.
   * Samples clamp into [tail, head] so the strip exists only between the two
   * frontiers — the draw/erode animation is vertex motion, not an alpha fade. */
  private layRibbon(t: TetherFx, cam?: THREE.Camera) {
    const a = this.tetherPoint(t.from, new THREE.Vector3());
    const b = this.tetherPoint(t.to, new THREE.Vector3());
    const dist = a.distanceTo(b);
    const mid = a.clone().lerp(b, .5);
    mid.y += Math.min(1.35, .3 + dist * .22);
    const head = 1 - (1 - t.head) ** 3; // Cubic.easeOut, like the 2D draw tween
    const lo = Math.min(t.tail, head), glowHalf = t.half * 2.6;
    const p = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3(), view = new THREE.Vector3(), tmp = new THREE.Vector3();
    for (let i = 0; i <= TETHER_SEGMENTS; i++) {
      const u = Math.min(head, Math.max(lo, i / TETHER_SEGMENTS)), v = 1 - u;
      p.set(0, 0, 0).addScaledVector(a, v * v).addScaledVector(mid, 2 * v * u).addScaledVector(b, u * u);
      tan.set(0, 0, 0).addScaledVector(tmp.subVectors(mid, a), 2 * v).addScaledVector(tmp.subVectors(b, mid), 2 * u).normalize();
      if (cam) side.crossVectors(tan, view.subVectors(cam.position, p).normalize());
      else side.crossVectors(tan, UP);
      if (side.lengthSq() < .2) side.set(0, 0, 1);
      side.normalize();
      t.pos.setXYZ(i * 2, p.x - side.x * t.half, p.y - side.y * t.half, p.z - side.z * t.half);
      t.pos.setXYZ(i * 2 + 1, p.x + side.x * t.half, p.y + side.y * t.half, p.z + side.z * t.half);
      t.glowPos.setXYZ(i * 2, p.x - side.x * glowHalf, p.y - side.y * glowHalf, p.z - side.z * glowHalf);
      t.glowPos.setXYZ(i * 2 + 1, p.x + side.x * glowHalf, p.y + side.y * glowHalf, p.z + side.z * glowHalf);
      if (i === TETHER_SEGMENTS) t.headDot.position.copy(p);
    }
    t.pos.needsUpdate = true;
    t.glowPos.needsUpdate = true;
  }

  // --- frame -------------------------------------------------------------------------

  update(dt: number, cam?: THREE.Camera) {
    this.clock += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.clock) { const t = this.timers.splice(i, 1)[0]; t.fn(); }
    }
    const world = new THREE.Vector3();
    for (const cast of this.casts) {
      cast.ring.rotation.y += cast.spin * dt;
      cast.ring2.rotation.y -= cast.spin * 1.6 * dt;
      if (cast.aura) {
        cast.aura.rotation.y += dt * .9;
        cast.aura.material.opacity = .07 + Math.sin(this.clock * 5.2) * .03;
      }
      if (cast.disc) cast.disc.material.opacity = .12 + Math.sin(this.clock * 7) * .05;
      if (cast.light) cast.light.intensity = 1.7 + Math.sin(this.clock * 6.4) * .9;
      if (this.clock >= cast.next) {
        cast.next = this.clock + .25;
        cast.root.getWorldPosition(world);
        if (cast.emit && cast.emitRadius) for (let i = 0; i < clampCount(cast.emit.count, 12); i++) {
          const a = Math.random() * TAU;
          this.spawnStreamParticle(cast.emit, new THREE.Vector3(world.x + Math.cos(a) * cast.emitRadius, world.y, world.z + Math.sin(a) * cast.emitRadius));
        }
        if (cast.stream) {
          // Motes ride a slowly advancing helix hugging the caster's body and
          // climb past the head — the signature FFXI casting swirl.
          const mote: VfxStreamProfile = { ...cast.stream, height: cast.stream.height * 2.1 };
          const rr = Math.max(.34, cast.stream.width * VFX_PX);
          for (let i = 0; i < clampCount(cast.stream.count * 1.5, 12); i++) {
            cast.spiral += .75;
            const a = cast.spiral + i * (TAU / 3);
            this.spawnStreamParticle(mote, new THREE.Vector3(
              world.x + Math.cos(a) * rr * (.8 + Math.random() * .4),
              world.y + rand(0, .35),
              world.z + Math.sin(a) * rr * (.8 + Math.random() * .4),
            ));
          }
        }
      }
    }
    for (const t of [...this.tethers]) {
      t.age += dt;
      t.head = Math.min(1, t.age / t.drawDur);
      if (this.clock >= t.tailAt) t.tail = Math.min(1, t.tail + dt / t.tailDur);
      this.layRibbon(t, cam);
      // Opacity tracks the tail frontier like the 2D arc: the surviving
      // segment dims as it dissolves rather than blinking out full-bright.
      const fade = 1 - t.tail;
      t.mat.opacity = t.opacity * fade;
      t.glowMat.opacity = t.opacity * .15 * fade;
      t.headDot.visible = t.head < 1 && t.tail < 1;
      t.headDot.material.opacity = .8 * fade;
      if (t.tail >= 1) { this.group.remove(t.root); disposeObject(t.root); this.tethers.delete(t); }
    }
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const tr = this.tracks[i];
      tr.age += dt;
      const t = Math.min(1, tr.age / tr.life);
      tr.update(t, dt);
      if (tr.age >= tr.life) { disposeObject(tr.obj); this.tracks.splice(i, 1); }
    }
  }

  dispose() {
    for (const tr of this.tracks) disposeObject(tr.obj);
    for (const cast of this.casts) disposeObject(cast.root);
    for (const t of this.tethers) { this.group.remove(t.root); disposeObject(t.root); }
    this.tracks = []; this.timers = []; this.casts.clear(); this.tethers.clear();
    this.group.removeFromParent();
  }
}
