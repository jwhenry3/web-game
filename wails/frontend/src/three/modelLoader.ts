import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

const loader = new GLTFLoader();
/** Cached prepared prototype roots (already SkeletonUtils-safe). */
const cache = new Map<string, Promise<THREE.Object3D>>();

function withBase(url: string): string {
  const base = import.meta.env.BASE_URL ?? "./";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  const b = base.endsWith("/") ? base : `${base}/`;
  const u = url.replace(/^\//, "");
  return `${b}${u}`;
}

export { withBase };

function preparePrototype(scene: THREE.Object3D): THREE.Object3D {
  // Keep the glTF scene as prototype; clone via SkeletonUtils per instance.
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && "map" in m && m.map) {
          (m.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
        }
      }
    }
  });
  scene.updateMatrixWorld(true);
  return scene;
}

/** Load a GLB/GLTF once; returns a fresh skinned-safe clone each call. */
export function loadModel(url: string): Promise<THREE.Group> {
  const resolved = withBase(url);
  let pending = cache.get(resolved);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      loader.load(
        resolved,
        (gltf) => resolve(preparePrototype(gltf.scene)),
        undefined,
        (err) => {
          cache.delete(resolved);
          reject(err);
        },
      );
    });
    cache.set(resolved, pending);
  }
  return pending.then((proto) => {
    const cloned = cloneSkinned(proto);
    const wrap = new THREE.Group();
    wrap.add(cloned);
    return wrap;
  });
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

/** Scale so height ≈ targetHeight and feet sit on y=0. */
export function normalizeModel(
  root: THREE.Object3D,
  targetHeight: number,
  opts?: { yawOffset?: number; centerXZ?: boolean },
): void {
  if (opts?.yawOffset) root.rotation.y += opts.yawOffset;
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  if (_box.isEmpty()) {
    // Skinned meshes sometimes need a skeleton pose before bounds exist.
    root.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) {
        o.skeleton?.bones.forEach((b) => b.updateMatrixWorld(true));
        o.computeBoundingBox?.();
      }
    });
    root.updateMatrixWorld(true);
    _box.setFromObject(root);
  }
  _box.getSize(_size);
  const h = _size.y;
  if (!Number.isFinite(h) || h < 1e-4) {
    // Fallback: assume ~1m authoring height.
    root.scale.setScalar(targetHeight);
  } else {
    root.scale.multiplyScalar(targetHeight / h);
  }
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  if (!_box.isEmpty()) {
    if (opts?.centerXZ !== false) {
      _box.getCenter(_center);
      root.position.x -= _center.x;
      root.position.z -= _center.z;
    }
    root.position.y -= _box.min.y;
  }
}

/** Swap placeholder children for a loaded model. Keeps placeholder if load fails. */
export async function attachModel(
  host: THREE.Group,
  url: string,
  targetHeight: number,
  opts?: { yawOffset?: number },
): Promise<boolean> {
  try {
    const model = await loadModel(url);
    normalizeModel(model, targetHeight, opts);
    // Remove placeholders only after a successful load (don't dispose shared mats).
    while (host.children.length) {
      host.remove(host.children[0]!);
    }
    host.add(model);
    return true;
  } catch (e) {
    console.warn("[models] failed to load", url, e);
    return false;
  }
}

export function pickVariant(urls: readonly string[], seed: number): string {
  if (urls.length === 0) return "";
  const i = Math.abs(seed) % urls.length;
  return urls[i]!;
}
