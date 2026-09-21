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
} from "../phaser/battleVfxProfiles";
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
interface CastFx { root: THREE.Group; ring: THREE.Group; spin: number; stream?: VfxStreamProfile; emit?: VfxStreamProfile; emitRadius?: number; next: number }

const clampCount = (n: number, max = 64) => Math.max(1, Math.min(max, Math.round(n)));
const easeOut = (t: number) => 1 - (1 - t) ** 2;

/**
 * Three.js playback of the shared VfxProfile documents (same data the Phaser
 * player consumes — see phaser/battleVfx.ts). Effects are sprite/mesh jobs
 * stepped by update(); everything is bounded and disposed with the player.
 */
export class WorldVfx {
  readonly group = new THREE.Group();
  private tracks: Track[] = [];
  private timers: Timer[] = [];
  private casts = new Set<CastFx>();
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

  playCategory(category: VfxCategory, target: THREE.Vector3, from?: THREE.Vector3) {
    this.playProfile(CATEGORY_VFX_PROFILES[category], target, from);
  }

  /** Sustained cast/channel effect parented to the caster (moves with it). */
  startCast(cast: VfxCastProfile | undefined, parent: THREE.Object3D): () => void {
    if (!cast) return () => undefined;
    const root = new THREE.Group(); root.position.y = .08;
    const ring = new THREE.Group(); root.add(ring);
    const fx: CastFx = { root, ring, spin: ((cast.circle?.spinRate ?? 150) * Math.PI) / 180, stream: cast.stream, emit: cast.circle?.emit, emitRadius: (cast.circle?.radius ?? 20) * VFX_PX, next: this.clock };
    if (cast.circle) {
      const n = clampCount(cast.circle.count, 24), r = cast.circle.radius * VFX_PX;
      for (let i = 0; i < n; i++) {
        const s = this.sprite(cast.circle.texture, cast.circle.color, cast.circle.size, cast.circle.alpha ?? .7);
        const a = (i / n) * TAU;
        s.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        ring.add(s);
      }
    }
    parent.add(root);
    this.casts.add(fx);
    return () => { this.casts.delete(fx); disposeObject(root); };
  }

  startCastCategory(category: VfxCategory, parent: THREE.Object3D): () => void {
    return this.startCast(CATEGORY_VFX_PROFILES[category]?.cast, parent);
  }

  categoryColor(category: VfxCategory): number { return CATEGORY_COLORS[category]; }

  // --- frame -------------------------------------------------------------------------

  update(dt: number) {
    this.clock += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.clock) { const t = this.timers.splice(i, 1)[0]; t.fn(); }
    }
    const world = new THREE.Vector3();
    for (const cast of this.casts) {
      cast.ring.rotation.y += cast.spin * dt;
      if (this.clock >= cast.next) {
        cast.next = this.clock + .25;
        cast.root.getWorldPosition(world);
        if (cast.emit && cast.emitRadius) for (let i = 0; i < clampCount(cast.emit.count, 12); i++) {
          const a = Math.random() * TAU;
          this.spawnStreamParticle(cast.emit, new THREE.Vector3(world.x + Math.cos(a) * cast.emitRadius, world.y, world.z + Math.sin(a) * cast.emitRadius));
        }
        if (cast.stream) for (let i = 0; i < clampCount(cast.stream.count, 12); i++) {
          const off = new THREE.Vector3((Math.random() * 2 - 1) * cast.stream.width * VFX_PX, 0, (Math.random() * 2 - 1) * cast.stream.width * VFX_PX);
          this.spawnStreamParticle(cast.stream, world.clone().add(off));
        }
      }
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
    this.tracks = []; this.timers = []; this.casts.clear();
    this.group.removeFromParent();
  }
}
