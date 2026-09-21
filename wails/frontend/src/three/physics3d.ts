import * as THREE from "three";
import { WorldHeightmap, WORLD_SCALE } from "./heightmap";
import { WALKABLE } from "../world/overworld";
import type { Scene3DDoc, SceneTransform } from "./scene3d";

// Map-pixel 3D physics — a TypeScript port of internal/game/physics3d.go used
// for client-side prediction. Positions are at the character's feet: X/Y are
// horizontal map pixels, Z is up (Three.js Y). Constants must stay in sync
// with the Go solver and hub.go's jump impulse — prediction only stays
// truthful while both sides agree.

export const PLAYER_BODY_RADIUS = 15.625; // game.PlayerCollisionRadius
export const BODY_HEIGHT = 36;
// Snappy jump: apex ~36px (one body height), ~0.55s total. Mirrors
// game.Gravity3D / game.JumpVelocity3D — change together.
export const JUMP_VELOCITY = 264;
export const GRAVITY = 960, STEP_HEIGHT = 10, MAX_SLOPE = 1.2;

export interface Vec3 { x: number; y: number; z: number }
export interface AABB3D { min: Vec3; max: Vec3 }

export interface Body3D {
  pos: Vec3;
  velZ: number;
  grounded: boolean;
  radius: number;
  height: number;
}

export function newBody3D(x: number, y: number, z: number): Body3D {
  return { pos: { x, y, z }, velZ: 0, grounded: true, radius: PLAYER_BODY_RADIUS, height: BODY_HEIGHT };
}

const finite = (v: number) => Number.isFinite(v);

function overlapsDisk(x: number, y: number, r: number, b: AABB3D): boolean {
  const dx = x - Math.max(b.min.x, Math.min(x, b.max.x));
  const dy = y - Math.max(b.min.y, Math.min(y, b.max.y));
  return dx * dx + dy * dy < r * r - 1e-8;
}

/** Swept upright-cylinder controller mirroring game.PhysicsWorld3D. */
export class PhysicsWorld3D {
  bounds?: AABB3D;
  heightAt: (x: number, y: number) => number = () => 0;
  colliders: AABB3D[] = [];
  /** Supplies legacy tile collision without scanning the whole world. */
  nearbyColliders?: (minX: number, minY: number, maxX: number, maxY: number) => AABB3D[];
  gravity = GRAVITY;
  stepHeight = STEP_HEIGHT;
  maxSlope = MAX_SLOPE;

  private nearby(x: number, y: number, r: number): AABB3D[] {
    if (!this.nearbyColliders) return this.colliders;
    return [...this.nearbyColliders(x - r, y - r, x + r, y + r), ...this.colliders];
  }

  private blocked(b: Body3D, p: Vec3): boolean {
    const bounds = this.bounds;
    if (bounds) {
      if (bounds.max.x > bounds.min.x && (p.x - b.radius < bounds.min.x || p.x + b.radius > bounds.max.x)) return true;
      if (bounds.max.y > bounds.min.y && (p.y - b.radius < bounds.min.y || p.y + b.radius > bounds.max.y)) return true;
    }
    for (const a of this.nearby(p.x, p.y, b.radius)) {
      if (p.z < a.max.z - 1e-6 && p.z + b.height > a.min.z + 1e-6 && overlapsDisk(p.x, p.y, b.radius, a)) return true;
    }
    return false;
  }

  /** Highest surface at or below limit — permits stepping onto low platforms. */
  private support(b: Body3D, x: number, y: number, limit: number): number {
    let h = this.heightAt(x, y);
    for (const a of this.nearby(x, y, b.radius)) {
      if (a.max.z <= limit + 1e-6 && a.max.z > h && overlapsDisk(x, y, b.radius, a)) h = a.max.z;
    }
    return h;
  }

  /**
   * Sweeps horizontal motion in increments smaller than the body radius, then
   * integrates vertical motion in bounded timesteps. dt=0 resolves planar
   * intent without advancing gravity. Mirrors game.PhysicsWorld3D.Move.
   */
  move(b: Body3D, tx: number, ty: number, dt: number): Body3D {
    if (!finite(tx) || !finite(ty) || !finite(dt) || !finite(b.pos.z)) return b;
    if (b.radius <= 0) b.radius = PLAYER_BODY_RADIUS;
    if (b.height <= 0) b.height = BODY_HEIGHT;
    dt = Math.max(0, Math.min(.25, dt));
    const gravity = this.gravity > 0 ? this.gravity : GRAVITY;
    const maxSlope = this.maxSlope > 0 ? this.maxSlope : 1;
    const dx = tx - b.pos.x, dy = ty - b.pos.y;
    let steps = Math.ceil(Math.max(Math.hypot(dx, dy) / Math.max(1, b.radius * .4), dt / .016));
    if (steps < 1) steps = 1;
    if (steps > 4096) return b;
    const sx = dx / steps, sy = dy / steps, sd = dt / steps;
    for (let i = 0; i < steps; i++) {
      let from = { ...b.pos };
      let floor = this.support(b, from.x, from.y, from.z + .001);
      if (from.z < floor) {
        b.pos.z = floor; b.grounded = true; b.velZ = 0;
        from = { ...b.pos };
      }
      if (Math.abs(from.z - floor) < .001 && b.velZ <= 0) b.grounded = true;
      const tryStep = (x: number, y: number): boolean => {
        const p: Vec3 = { x, y, z: b.pos.z };
        const ground = this.heightAt(x, y);
        if (b.grounded) {
          // Compare actual mesh incline independently of step height, otherwise
          // repeated tiny steps could climb arbitrarily steep terrain.
          const delta = ground - this.heightAt(from.x, from.y);
          if (delta > Math.hypot(x - from.x, y - from.y) * maxSlope + 1e-6) return false;
          const sup = this.support(b, x, y, from.z + this.stepHeight);
          if (sup > from.z + this.stepHeight + 1e-6) return false;
          if (sup >= from.z - this.stepHeight) p.z = sup;
        } else if (ground > p.z) {
          return false;
        }
        if (this.blocked(b, p)) return false;
        b.pos = p;
        return true;
      };
      if (!tryStep(from.x + sx, from.y + sy)) {
        if (!tryStep(from.x + sx, from.y)) tryStep(from.x, from.y + sy);
      }
      floor = this.support(b, b.pos.x, b.pos.y, b.pos.z + .001);
      if (b.pos.z > floor + .001 || b.velZ > 0) {
        b.grounded = false;
        let vz = b.velZ - gravity * sd;
        let nextZ = b.pos.z + (b.velZ + vz) * .5 * sd;
        if (vz > 0) {
          for (const a of this.nearby(b.pos.x, b.pos.y, b.radius)) {
            if (overlapsDisk(b.pos.x, b.pos.y, b.radius, a) && b.pos.z + b.height <= a.min.z + 1e-6 && nextZ + b.height >= a.min.z) {
              nextZ = a.min.z - b.height; vz = 0;
            }
          }
        }
        // Land only when actually descending onto (or resting on) the floor — a
        // rising body with dt=0 must keep its upward velocity.
        if (nextZ <= floor) {
          nextZ = floor;
          if (vz <= 0) { vz = 0; b.grounded = true; }
        }
        b.pos.z = nextZ;
        b.velZ = vz;
      } else {
        b.pos.z = floor; b.velZ = 0; b.grounded = true;
      }
    }
    return b;
  }
}

const DEG = Math.PI / 180;

function localSceneMatrix(t: SceneTransform): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(t.position[0], t.position[1], t.position[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rotation[0] * DEG, t.rotation[1] * DEG, t.rotation[2] * DEG)),
    new THREE.Vector3(t.scale[0], t.scale[1], t.scale[2]),
  );
}

/**
 * Authored collider components as physics-space AABBs — mirrors
 * game.SceneColliders3D: the 8 offset±size/2 corners go through the object's
 * world matrix, then Three.js world units convert to map pixels with the Y/Z
 * axis swap (world x→x, world z→y, world y→z-up).
 */
export function sceneColliders3D(doc: Scene3DDoc): AABB3D[] {
  const byId = new Map(doc.objects.map(o => [o.id, o]));
  const cache = new Map<string, THREE.Matrix4>();
  const world = (id: string, depth: number): THREE.Matrix4 => {
    const cached = cache.get(id);
    if (cached) return cached;
    const o = byId.get(id);
    const m = !o || depth > doc.objects.length
      ? new THREE.Matrix4()
      : (o.parent ? world(o.parent, depth + 1) : new THREE.Matrix4()).multiply(localSceneMatrix(o.transform));
    cache.set(id, m);
    return m;
  };
  const out: AABB3D[] = [];
  const corner = new THREE.Vector3();
  for (const o of doc.objects) {
    const c = o.components?.collider;
    if (!c || !c.enabled || c.isTrigger) continue;
    const m = world(o.id, 0);
    const box: AABB3D = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
    for (let i = 0; i < 8; i++) {
      corner.set(
        c.offset[0] + (i & 1 ? 1 : -1) * c.size[0] / 2,
        c.offset[1] + (i & 2 ? 1 : -1) * c.size[1] / 2,
        c.offset[2] + (i & 4 ? 1 : -1) * c.size[2] / 2,
      ).applyMatrix4(m);
      const px = corner.x / WORLD_SCALE, py = corner.z / WORLD_SCALE, pz = corner.y / WORLD_SCALE;
      if (px < box.min.x) box.min.x = px;
      if (py < box.min.y) box.min.y = py;
      if (pz < box.min.z) box.min.z = pz;
      if (px > box.max.x) box.max.x = px;
      if (py > box.max.y) box.max.y = py;
      if (pz > box.max.z) box.max.z = pz;
    }
    out.push(box);
  }
  return out;
}

/**
 * Predicted physics world matching Overworld.Physics3D(): map bounds, the
 * heightmap as HeightAt (WorldHeightmap already mirrors TerrainHeightAt),
 * authored scene colliders, and one AABB per unwalkable tile. Water cells top
 * out at h+8 (wading depth), everything else solid to h+48.
 */
export function overworldPhysics3D(field: WorldHeightmap, doc?: Scene3DDoc | null): PhysicsWorld3D {
  const w = new PhysicsWorld3D();
  const map = field.map, ts = map.tile;
  w.bounds = { min: { x: 0, y: 0, z: -100000 }, max: { x: map.cols * ts, y: map.rows * ts, z: 100000 } };
  w.heightAt = (x, y) => field.height(x, y) / WORLD_SCALE;
  w.colliders = doc ? sceneColliders3D(doc) : [];
  w.nearbyColliders = (minX, minY, maxX, maxY) => {
    const boxes: AABB3D[] = [];
    const r1 = Math.min(map.rows - 1, Math.floor(maxY / ts));
    const c1 = Math.min(map.cols - 1, Math.floor(maxX / ts));
    for (let r = Math.max(0, Math.floor(minY / ts)); r <= r1; r++) {
      for (let c = Math.max(0, Math.floor(minX / ts)); c <= c1; c++) {
        const cell = field.collisionCell(c, r);
        if (WALKABLE.has(cell)) continue;
        const h = w.heightAt((c + .5) * ts, (r + .5) * ts);
        boxes.push({ min: { x: c * ts, y: r * ts, z: h - 10000 }, max: { x: (c + 1) * ts, y: (r + 1) * ts, z: h + (cell === "~" ? 8 : 48) } });
      }
    }
    return boxes;
  };
  return w;
}

export type ReconcileVerdict = "snap" | "adjust" | "ok";

/**
 * Merge an authoritative entity update into the predicted body. Large planar
 * or vertical divergence snaps outright (teleport/knockback); small vertical
 * drift is absorbed when both sides agree the body is grounded, and an
 * authoritative landing sticks when the prediction is already descending.
 */
export function reconcileBody3D(
  body: Body3D,
  auth: { x: number; y: number; z: number; grounded?: boolean },
): ReconcileVerdict {
  const planar = Math.hypot(auth.x - body.pos.x, auth.y - body.pos.y);
  const dz = auth.z - body.pos.z;
  if (planar > 80 || Math.abs(dz) > 64 || !finite(body.pos.z)) {
    body.pos.x = auth.x; body.pos.y = auth.y; body.pos.z = auth.z;
    body.velZ = 0;
    body.grounded = auth.grounded ?? true;
    return "snap";
  }
  if (auth.grounded) {
    if (body.grounded) {
      body.pos.z = auth.z;
      return "adjust";
    }
    if (body.velZ <= 0 && body.pos.z <= auth.z + 4) {
      body.pos.z = auth.z; body.velZ = 0; body.grounded = true;
      return "adjust";
    }
  }
  return "ok";
}
