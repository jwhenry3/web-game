import Phaser from "phaser";
import {
  H99_LAYER_ORDER,
  H99_SHEET,
  layerAssetPath,
  layerTextureKey,
  type CharacterAppearance,
} from "./heroes99";

const pending = new Map<string, Promise<void>>();

export function loadSpritesheet(scene: Phaser.Scene, textureKey: string, path: string): Promise<void> {
  if (scene.textures.exists(textureKey)) return Promise.resolve();
  const existing = pending.get(textureKey);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const onComplete = (key: string) => {
      if (key !== textureKey) return;
      scene.load.off(Phaser.Loader.Events.FILE_COMPLETE, onComplete);
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      pending.delete(textureKey);
      resolve();
    };
    const onError = (file: { key?: string }) => {
      if (file.key !== textureKey) return;
      scene.load.off(Phaser.Loader.Events.FILE_COMPLETE, onComplete);
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      pending.delete(textureKey);
      reject(new Error(`Failed to load character layer: ${path}`));
    };

    scene.load.spritesheet(textureKey, path, {
      frameWidth: H99_SHEET.frameWidth,
      frameHeight: H99_SHEET.frameHeight,
    });
    scene.load.on(Phaser.Loader.Events.FILE_COMPLETE, onComplete);
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    if (!scene.load.isLoading()) scene.load.start();
  });

  pending.set(textureKey, promise);
  return promise;
}

/** Ensure all Heroes 99 layer spritesheets for an appearance are in the texture cache. */
export function ensureLayerTextures(
  scene: Phaser.Scene,
  appearance: CharacterAppearance,
): Promise<void> {
  return Promise.all(
    H99_LAYER_ORDER.map((layer) => {
      const path = layerAssetPath(layer, appearance);
      // Unarmed appearances have no weapon layers — skip rather than 404.
      if (!path) return Promise.resolve();
      return loadSpritesheet(scene, layerTextureKey(layer, appearance), path);
    }),
  ).then(() => undefined);
}

export function preloadAppearance(
  loader: Phaser.Loader.LoaderPlugin,
  appearance: CharacterAppearance,
): void {
  const { frameWidth, frameHeight } = H99_SHEET;
  for (const layer of H99_LAYER_ORDER) {
    const path = layerAssetPath(layer, appearance);
    if (!path) continue;
    const key = layerTextureKey(layer, appearance);
    if (loader.scene.textures.exists(key)) continue;
    loader.spritesheet(key, path, { frameWidth, frameHeight });
  }
}

export function layersForAppearance(): typeof H99_LAYER_ORDER {
  return H99_LAYER_ORDER;
}

export const SPINE_CHAR_BASE = "/assets/spine";
export const SPINE_CHAR_SKEL = "h99doll";
export const SPINE_CHAR_ATLAS = "h99doll";

let spinePromise: Promise<void> | null = null;
let spineScene: Phaser.Scene | null = null;

/** Load the shared Spine doll atlas + skeleton once (game-global caches). */
export function ensureSpineCharacterAssets(scene: Phaser.Scene): Promise<void> {
  // Parsed data lives in game-global caches — skip the promise entirely once
  // the raw files are in, so a stale pending load can never wedge new sprites.
  const cache = scene.game.cache;
  if (cache.json.exists(SPINE_CHAR_SKEL) && cache.text.exists(SPINE_CHAR_ATLAS)) {
    spinePromise = Promise.resolve();
    return spinePromise;
  }
  // A pending load bound to a sleeping/stopped scene's loader can stall
  // forever — abandon it and start fresh on the calling (live) scene.
  if (spinePromise && spineScene?.sys.isActive() && !spineScene.sys.isSleeping()) {
    return spinePromise;
  }
  const promise = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      scene.load.off(Phaser.Loader.Events.COMPLETE, onComplete);
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    };
    const fail = (reason: string) => {
      cleanup();
      // Only clear if this promise is still the shared one — an abandoned
      // promise must not wipe a newer in-flight load.
      if (spinePromise === promise) {
        spinePromise = null;
        spineScene = null;
      }
      reject(new Error(reason));
    };
    const onComplete = () => {
      cleanup();
      resolve();
    };
    const onError = (file: { key?: string }) => {
      if (file.key !== SPINE_CHAR_SKEL && file.key !== SPINE_CHAR_ATLAS) return;
      fail("Failed to load spine character assets");
    };
    // A scene that shuts down mid-load never emits COMPLETE — fail fast so
    // callers can retry instead of awaiting a dead promise forever.
    const onShutdown = () => fail("Scene shut down during spine asset load");
    scene.load.once(Phaser.Loader.Events.COMPLETE, onComplete);
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    scene.load.spineAtlas(SPINE_CHAR_ATLAS, `${SPINE_CHAR_BASE}/h99doll.atlas`);
    scene.load.spineSkeleton(SPINE_CHAR_SKEL, `${SPINE_CHAR_BASE}/h99doll.json`);
    if (!scene.load.isLoading()) scene.load.start();
  });
  spinePromise = promise;
  spineScene = scene;
  return promise;
}
