import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MODELS, MODEL_HEIGHT } from "./modelCatalog";
import { attachModel, withBase } from "./modelLoader";

export type CharacterAnimState = "idle" | "walk" | "run";

const ANIM_GENERAL = "models/characters/Rig_Medium_General.glb";
const ANIM_MOVE = "models/characters/Rig_Medium_MovementBasic.glb";

let clipsPromise: Promise<Map<string, THREE.AnimationClip>> | null = null;
const loader = new GLTFLoader();

function loadClipPack(url: string): Promise<THREE.AnimationClip[]> {
  return new Promise((resolve, reject) => {
    loader.load(
      withBase(url),
      (gltf) => resolve(gltf.animations ?? []),
      undefined,
      reject,
    );
  });
}

/** Shared KayKit Rig_Medium clips (Idle / Walk / Run). */
export function loadKayKitClips(): Promise<Map<string, THREE.AnimationClip>> {
  if (!clipsPromise) {
    clipsPromise = (async () => {
      const map = new Map<string, THREE.AnimationClip>();
      const packs = await Promise.all([loadClipPack(ANIM_GENERAL), loadClipPack(ANIM_MOVE)]);
      for (const clips of packs) {
        for (const clip of clips) {
          if (!map.has(clip.name)) map.set(clip.name, clip);
        }
      }
      return map;
    })().catch((e) => {
      clipsPromise = null;
      throw e;
    });
  }
  return clipsPromise;
}

function findSkinnedRoot(host: THREE.Object3D): THREE.Object3D {
  let found: THREE.Object3D | null = null;
  host.traverse((o) => {
    if (!found && o instanceof THREE.SkinnedMesh) found = o;
  });
  // Mixer should root at the character hierarchy that contains bones — usually the model group.
  return host;
}

export class CharacterAnimator {
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: CharacterAnimState | null = null;
  private ready = false;

  constructor(private host: THREE.Group) {}

  async init(): Promise<void> {
    if (this.ready) return;
    const clips = await loadKayKitClips();
    this.mixer = new THREE.AnimationMixer(findSkinnedRoot(this.host));
    const wanted: Record<CharacterAnimState, string[]> = {
      idle: ["Idle_A", "Idle_B"],
      walk: ["Walking_A", "Walking_B", "Walking_C"],
      run: ["Running_A", "Running_B"],
    };
    for (const [state, names] of Object.entries(wanted) as [CharacterAnimState, string[]][]) {
      const clip = names.map((n) => clips.get(n)).find(Boolean);
      if (!clip || !this.mixer) continue;
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveTimeScale(1);
      action.setEffectiveWeight(1);
      this.actions.set(state, action);
    }
    this.ready = true;
    this.play("idle", 0);
  }

  play(state: CharacterAnimState, fade = 0.2): void {
    if (!this.ready || this.current === state) return;
    const next = this.actions.get(state);
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    next.reset().play();
    if (prev && prev !== next && fade > 0) {
      prev.crossFadeTo(next, fade, false);
    } else {
      next.fadeIn(fade);
    }
    this.current = state;
  }

  setMoving(moving: boolean, sprint = false): void {
    if (!moving) this.play("idle");
    else this.play(sprint ? "run" : "walk");
  }

  update(dt: number): void {
    this.mixer?.update(dt);
  }
}

/** Build a KayKit adventurer with idle/walk mixer. */
export function createAnimatedCharacter(opts?: { self?: boolean }): THREE.Group {
  const g = new THREE.Group();
  // Tiny stub until GLB attaches (avoids empty-frame pop).
  const stub = new THREE.Mesh(
    new THREE.CapsuleGeometry(6, 14, 4, 6),
    new THREE.MeshStandardMaterial({ color: opts?.self ? 0xd4b896 : 0x7a8aa0 }),
  );
  stub.position.y = 14;
  g.add(stub);

  const url = opts?.self ? MODELS.characters.self : MODELS.characters.player;
  const animator = new CharacterAnimator(g);
  g.userData.animator = animator;
  g.userData.isCharacter = true;

  void (async () => {
    await attachModel(g, url, MODEL_HEIGHT.character, { yawOffset: Math.PI });
    if (opts?.self) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(14, 1.2, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0x665522, emissiveIntensity: 0.35 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1;
      g.add(ring);
    }
    try {
      await animator.init();
    } catch (e) {
      console.warn("[anim] KayKit clips failed", e);
    }
  })();

  return g;
}

export function getAnimator(obj: THREE.Object3D): CharacterAnimator | undefined {
  return obj.userData.animator as CharacterAnimator | undefined;
}
