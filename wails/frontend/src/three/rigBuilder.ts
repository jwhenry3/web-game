import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { CharacterAppearance } from "../characters/heroes99";
import { normalizeRig, paletteFromAppearance, partVisible, RIG_LOOPING_CLIPS, sampleClip, type Rig3DDoc, type RigAnimClip, type RigAnimName, type RigColor, type RigGeometry, type RigPalette, type Vec3 } from "./rig3d";
import { DEFAULT_RIGS } from "./rig3dDefaults";
import { disposeObject } from "./terrain";

const DEG = Math.PI / 180;

// --- rig library ------------------------------------------------------------------

const library = new Map<string, Rig3DDoc>(Object.entries(DEFAULT_RIGS));
/** Bumps whenever files override the compiled rigs — actors keyed on it rebuild. */
export let rigLibraryVersion = 0;
let libraryLoad: Promise<void> | null = null;

export function getRig(id: string): Rig3DDoc {
  return library.get(id) ?? library.get("humanoid")!;
}
export function listRigs(): Rig3DDoc[] { return [...library.values()]; }
export function setRig(doc: Rig3DDoc) { library.set(doc.id, doc); rigLibraryVersion++; }

/** Load authored overrides: public/assets/rigs3d/index.json lists ids, each at <id>.rig3d.json. */
export function loadRigLibrary(base = "/assets/rigs3d"): Promise<void> {
  if (!libraryLoad) {
    libraryLoad = fetch(`${base}/index.json`)
      .then(res => (res.ok ? (res.json() as Promise<{ rigs?: string[] }>) : null))
      .then(async index => {
        const ids = index?.rigs ?? [];
        await Promise.all(ids.map(async id => {
          const res = await fetch(`${base}/${encodeURIComponent(id)}.rig3d.json`);
          if (res.ok) library.set(id, normalizeRig(await res.json(), id));
        }));
        if (ids.length) rigLibraryVersion++;
      })
      .catch(() => undefined);
  }
  return libraryLoad;
}

// --- geometry / materials -----------------------------------------------------

export function buildGeometry(g: RigGeometry): THREE.BufferGeometry {
  const p = g.params;
  switch (g.type) {
    case "box": return new THREE.BoxGeometry(p[0] ?? .2, p[1] ?? .2, p[2] ?? .2);
    case "sphere": return new THREE.SphereGeometry(p[0] ?? .1, 8, 6);
    case "capsule": return new THREE.CapsuleGeometry(p[0] ?? .1, p[1] ?? .3, 3, 8);
    case "cylinder": return new THREE.CylinderGeometry(p[0] ?? .1, p[1] ?? .1, p[2] ?? .4, 6);
    case "cone": return new THREE.ConeGeometry(p[0] ?? .1, p[1] ?? .3, Math.max(3, Math.round(p[2] ?? 6)));
    case "icosahedron": return new THREE.IcosahedronGeometry(p[0] ?? .15, Math.round(p[1] ?? 1));
    case "dodecahedron": return new THREE.DodecahedronGeometry(p[0] ?? .15, Math.round(p[1] ?? 0));
  }
}

export function resolveColor(c: RigColor, palette: RigPalette): THREE.Color {
  if ("fixed" in c) return new THREE.Color(c.fixed);
  const color = new THREE.Color(palette[c.role]);
  if (c.shade) color.offsetHSL(0, 0, c.shade);
  return color;
}

// --- glTF cache -----------------------------------------------------------------------

const gltfCache = new Map<string, Promise<GLTF>>();
const loader = new GLTFLoader();
function loadGltf(url: string): Promise<GLTF> {
  let p = gltfCache.get(url);
  if (!p) { p = loader.loadAsync(url); gltfCache.set(url, p); }
  return p;
}

// --- instance ---------------------------------------------------------------------------

export interface RigLimbRef { bone: THREE.Object3D; phase: number; amplitude: number; flex: number; flexSign: number }

export interface RigInstance {
  readonly doc: Rig3DDoc;
  /** Scaled root — add this to the scene. */
  readonly root: THREE.Group;
  readonly bones: Map<string, THREE.Object3D>;
  readonly limbs: RigLimbRef[];
  readonly parts: Map<string, THREE.Mesh>;
  /** Resolves when the glTF (if any) is attached; rejects never. */
  readonly ready: Promise<void>;
  /** True once a model clip drives the given state — procedural limbs stay still then. */
  hasClip(name: RigAnimName): boolean;
  /** Advance mixer/procedural animation. `time` is seconds; `moving` picks run vs idle. */
  update(dt: number, time: number, moving: boolean, alive: boolean): void;
  /** Pose bones from an authored clip at time t (editor timeline scrub) —
   * tracked bones take clip values, the rest hold rest pose + pose offsets. */
  previewClip(clip: RigAnimClip, t: number): void;
  /** One-shot clip overlay — combat moves (`attack`, `attack_slash`, …) and
   * the `hit` reaction. Mixer action when the model has one, authored clip
   * next; only tracked bones are posed so locomotion survives underneath. */
  playClip(name: RigAnimName): void;
  /** Held overlay — `cast` keeps the channel pose for as long as it's held
   * while legs keep their locomotion swing. Pass null to release. */
  holdClip(name: RigAnimName | null): void;
  /** One-shot attack overlay (mixer clip when present, authored clip next). */
  attack(): void;
  /** Apply a per-bone rotation pose (degrees) — e.g. the doc's ridePose. */
  applyPose(pose: Record<string, Vec3> | undefined): void;
  dispose(): void;
}

export interface BuildRigOptions {
  appearance?: Partial<CharacterAppearance>;
  palette?: Partial<RigPalette>;
  /** Overrides doc.scale. */
  scale?: number;
  /** Skip loading the glTF model (editor thumbnails, tests). */
  noModel?: boolean;
}

export function buildRig(doc: Rig3DDoc, opts: BuildRigOptions = {}): RigInstance {
  const palette = { ...paletteFromAppearance(opts.appearance), ...opts.palette };
  const root = new THREE.Group();
  root.scale.setScalar(opts.scale ?? doc.scale);
  const bones = new Map<string, THREE.Object3D>();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const parts = new Map<string, THREE.Mesh>();
  const material = (hex: string, emissive = 0) => {
    const key = `${hex}|${emissive}`;
    let m = materials.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: hex, roughness: .82, flatShading: true, emissive: emissive ? hex : 0x000000, emissiveIntensity: emissive }); materials.set(key, m); }
    return m;
  };

  for (const b of doc.bones) {
    const g = new THREE.Group();
    g.name = b.name;
    g.position.set(...b.position);
    g.rotation.set(b.rotation[0] * DEG, b.rotation[1] * DEG, b.rotation[2] * DEG);
    if (b.scale) g.scale.set(...b.scale);
    g.userData.rigBone = b.name;
    bones.set(b.name, g);
  }
  for (const b of doc.bones) (b.parent && bones.get(b.parent) || root).add(bones.get(b.name)!);

  for (const p of doc.parts) {
    if (!partVisible(p, opts.appearance)) continue;
    const mesh = new THREE.Mesh(buildGeometry(p.geometry), material(`#${resolveColor(p.color, palette).getHexString()}`, p.emissive ?? 0));
    mesh.position.set(...p.position);
    mesh.rotation.set(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG);
    mesh.scale.set(...p.scale);
    mesh.castShadow = mesh.receiveShadow = p.castShadow !== false;
    mesh.name = p.name;
    mesh.userData.rigPart = p.id;
    (bones.get(p.bone) ?? root).add(mesh);
    parts.set(p.id, mesh);
  }

  const limbs: RigLimbRef[] = doc.limbs.flatMap(l => { const bone = bones.get(l.bone); return bone ? [{ bone, phase: l.phase, amplitude: l.amplitude ?? 27, flex: l.flex ?? 0, flexSign: l.flexSign ?? 1 }] : []; });
  const rest = new Map([...bones].map(([name, b]) => [name, { r: b.rotation.clone(), p: b.position.clone(), s: b.scale.clone() }]));
  // Per-bone pose offsets (ridePose) survive the per-frame limb update.
  const poseOffsets = new Map<string, Vec3>();

  let mixer: THREE.AnimationMixer | undefined;
  const actions = new Map<RigAnimName, THREE.AnimationAction>();
  let current: RigAnimName | null = null;
  let disposed = false;

  const ready = (async () => {
    const model = doc.model;
    if (!model || opts.noModel) return;
    try {
      const gltf = await loadGltf(model.url);
      if (disposed) return;
      const scene = model.skinned ? cloneSkeleton(gltf.scene) : gltf.scene.clone(true);
      scene.position.set(...model.position);
      scene.rotation.set(model.rotation[0] * DEG, model.rotation[1] * DEG, model.rotation[2] * DEG);
      scene.scale.setScalar(model.scale);
      scene.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = o.receiveShadow = true; } });
      scene.userData.rigModel = true;
      ((model.bone && bones.get(model.bone)) || root).add(scene);
      if (gltf.animations.length) {
        mixer = new THREE.AnimationMixer(scene);
        for (const [state, clipName] of Object.entries(model.clips) as [RigAnimName, string][]) {
          const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
          if (clip) actions.set(state, mixer.clipAction(clip));
        }
        for (const [name, action] of actions) {
          if ((RIG_LOOPING_CLIPS as readonly string[]).includes(name)) continue;
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = false;
        }
      }
    } catch (err) {
      console.warn(`rig ${doc.id}: could not load model ${model.url}`, err);
    }
  })();

  const play = (name: RigAnimName) => {
    if (current === name) return;
    const next = actions.get(name);
    if (!next) return;
    const prev = current ? actions.get(current) : undefined;
    next.reset().fadeIn(.15).play();
    if (prev && prev !== next) prev.fadeOut(.15);
    current = name;
  };

  // Authored keyframe clips: a per-state clock (absolute `time` would keep a
  // stopped rig mid-cycle) plus a held overlay (cast channel) and a one-shot
  // overlay (attack/hit). A glTF action for the state wins; authored clips
  // beat the procedural limb swing.
  let animClock = 0, animState: RigAnimName | null = null;
  let overlay: { name: RigAnimName; t: number } | null = null;
  let held: { name: RigAnimName; t: number } | null = null;
  const clipPose = (clip: RigAnimClip, t: number, onlyTracked: boolean) => {
    const pose = sampleClip(clip, t);
    for (const [name, b] of bones) {
      const p = pose.get(name);
      if (!p && onlyTracked) continue;
      const r = rest.get(name)!;
      const off = poseOffsets.get(name);
      if (p?.rotation) b.rotation.set(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG);
      else if (!onlyTracked) b.rotation.set(r.r.x + (off?.[0] ?? 0) * DEG, r.r.y + (off?.[1] ?? 0) * DEG, r.r.z + (off?.[2] ?? 0) * DEG);
      if (p?.position) b.position.set(...p.position); else if (!onlyTracked) b.position.copy(r.p);
      if (p?.scale) b.scale.set(...p.scale); else if (!onlyTracked) b.scale.copy(r.s);
    }
  };

  return {
    doc, root, bones, limbs, parts, ready,
    hasClip: name => actions.has(name) || !!doc.anims?.[name],
    update(dt, time, moving, alive) {
      // A held clip with a mixer action takes over the state machine (cast
      // loops whole-body); an authored held clip overlays locomotion instead
      // so the legs keep stepping while the arms channel.
      const heldAction = held && actions.has(held.name) ? held.name : null;
      const state: RigAnimName = heldAction ?? (moving ? "run" : "idle");
      if (state !== animState) { animState = state; animClock = 0; } else animClock += dt;
      if (actions.has(state)) play(state);
      mixer?.update(dt);
      if (!actions.has(state)) {
        const clip = doc.anims?.[state];
        if (clip) clipPose(clip, animClock, false);
        else {
          for (const l of limbs) {
            const restX = rest.get(l.bone.name)?.r.x ?? 0;
            const s = moving && alive ? Math.sin(time * 11 + l.phase * Math.PI) : 0;
            // Jointed segments (knees/elbows) bend one way during the forward
            // half of their limb's cycle; straight limbs stay pure swing.
            const bend = l.flex ? Math.max(0, -s) * l.flex * l.flexSign * DEG : 0;
            const poseX = (poseOffsets.get(l.bone.name)?.[0] ?? 0) * DEG;
            l.bone.rotation.x = restX + poseX + s * l.amplitude * DEG + bend;
          }
          // Bob around wherever the root was placed (riders sit at seat height).
          if (root.userData.restY === undefined) root.userData.restY = root.position.y;
          root.position.y = root.userData.restY + (moving ? Math.abs(Math.sin(time * 11)) * .045 : Math.sin(time * 2) * .012);
        }
      }
      // Held authored overlay (e.g. cast channel) — loops for the hold.
      if (held && !heldAction) {
        held.t += dt;
        const clip = doc.anims?.[held.name];
        if (clip) clipPose(clip, held.t, true);
      }
      // One-shot authored overlay (used when the model has no such action).
      if (overlay) {
        overlay.t += dt;
        const clip = doc.anims?.[overlay.name];
        if (!clip || overlay.t > clip.duration) overlay = null;
        else clipPose(clip, overlay.t, true);
      }
    },
    previewClip(clip, t) { clipPose(clip, t, false); },
    playClip(name) {
      const a = actions.get(name);
      if (a) { a.reset().play(); return; }
      if (doc.anims?.[name]) overlay = { name, t: 0 };
    },
    holdClip(name) {
      if ((held?.name ?? null) === name) return;
      held = name ? { name, t: 0 } : null;
    },
    attack() { this.playClip("attack"); },
    applyPose(pose) {
      for (const [name, b] of bones) {
        const r = rest.get(name)!.r;
        const p = pose?.[name];
        if (p) { b.rotation.set(r.x + p[0] * DEG, r.y + p[1] * DEG, r.z + p[2] * DEG); poseOffsets.set(name, p); }
        else { b.rotation.copy(r); poseOffsets.delete(name); }
      }
    },
    dispose() {
      disposed = true;
      mixer?.stopAllAction();
      disposeObject(root);
    },
  };
}
