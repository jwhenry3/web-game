import * as THREE from "three";
import type { Scene3DDoc, SceneTransform, Vec3 } from "../../../../wails/frontend/src/three/scene3d";

const DEG = Math.PI / 180;
const round = (v: number) => Math.round(v * 1000) / 1000;

export function localMatrix(t: SceneTransform): THREE.Matrix4 {
  const [px, py, pz] = t.position, [rx, ry, rz] = t.rotation, [sx, sy, sz] = t.scale;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * DEG, ry * DEG, rz * DEG)),
    new THREE.Vector3(sx, sy, sz),
  );
}

/** World matrix of an object by composing its ancestor chain (identity for a missing id). */
export function worldMatrix(doc: Scene3DDoc, id: string | null | undefined): THREE.Matrix4 {
  const byId = new Map(doc.objects.map(o => [o.id, o]));
  const chain: SceneTransform[] = [];
  for (let cur = id ? byId.get(id) : undefined; cur; cur = cur.parent ? byId.get(cur.parent) : undefined) chain.unshift(cur.transform);
  return chain.reduce((m, t) => m.multiply(localMatrix(t)), new THREE.Matrix4());
}

export function decompose(m: THREE.Matrix4): SceneTransform {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  m.decompose(p, q, s);
  const e = new THREE.Euler().setFromQuaternion(q);
  const fix = (v: THREE.Vector3): Vec3 => [round(v.x), round(v.y), round(v.z)];
  return { position: fix(p), rotation: [round(e.x / DEG), round(e.y / DEG), round(e.z / DEG)], scale: fix(s) };
}

/** Local transform that keeps `id`'s world placement once it is parented under `parent`. */
export function localUnderParent(doc: Scene3DDoc, id: string, parent: string | null): SceneTransform {
  const world = worldMatrix(doc, id);
  const inv = worldMatrix(doc, parent).invert();
  return decompose(inv.multiply(world));
}
