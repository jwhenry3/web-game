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
export const SPINE_DOLL_SKEL = "paperdoll";
export const SPINE_DOLL_ATLAS = "paperdoll";
export const SPINE_QUAD_SKEL = "quaddoll";
export const SPINE_QUAD_ATLAS = "quaddoll";
export const SPINE_PROP_SKEL = "propdoll";
export const SPINE_PROP_ATLAS = "propdoll";

const spinePromises = new Map<string, Promise<void>>();
const spineScenes = new Map<string, Phaser.Scene>();

/**
 * spine-phaser applies the atlas `filter:` line only if the GL texture
 * exists when the page is bound — during `load.spineAtlas` it doesn't,
 * so Phaser texture wrappers keep their default LINEAR and deforming
 * meshes shimmer as texels resample. Re-apply the atlas-declared filter
 * once textures are up — the paperdoll atlas is supersampled 2x so its
 * declared `Nearest` keeps sprites blur-free in motion while halving
 * texel wobble. Page textures are keyed `<atlasKey>!<page.png>`.
 */
function setSpineTextureFilter(scene: Phaser.Scene, atlasKey: string): void {
  const atlasText = scene.cache.text.get(atlasKey) as string | undefined;
  const declared = /^filter:\s*(\w+)/m.exec(atlasText ?? "")?.[1];
  const mode = /^linear$/i.test(declared ?? "")
    ? Phaser.Textures.FilterMode.LINEAR
    : Phaser.Textures.FilterMode.NEAREST;
  scene.textures.each((texture) => {
    if (texture.key.startsWith(`${atlasKey}!`)) {
      texture.setFilter(mode);
    }
  }, scene.textures);
}

/** Load a Spine atlas + skeleton once (game-global caches), keyed per asset. */
export function ensureSpineAssets(
  scene: Phaser.Scene,
  skelKey: string,
  atlasKey: string,
): Promise<void> {
  const id = `${skelKey}|${atlasKey}`;
  // Parsed data lives in game-global caches — skip the promise entirely once
  // the raw files are in, so a stale pending load can never wedge new sprites.
  const cache = scene.game.cache;
  if (cache.json.exists(skelKey) && cache.text.exists(atlasKey)) {
    setSpineTextureFilter(scene, atlasKey);
    spinePromises.set(id, Promise.resolve());
    return spinePromises.get(id)!;
  }
  // A pending load bound to a sleeping/stopped scene's loader can stall
  // forever — abandon it and start fresh on the calling (live) scene. The
  // promise maps are module-global but each Phaser.Game owns its cache, so
  // a load started by a different game instance never satisfies this scene —
  // preview games (character creation, equipment) must load their own copy.
  const pendingScene = spineScenes.get(id);
  const pendingPromise = spinePromises.get(id);
  if (
    pendingPromise &&
    pendingScene?.sys.isActive() &&
    !pendingScene.sys.isSleeping() &&
    pendingScene.game === scene.game
  ) {
    return pendingPromise;
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
      if (spinePromises.get(id) === promise) {
        spinePromises.delete(id);
        spineScenes.delete(id);
      }
      reject(new Error(reason));
    };
    const onComplete = () => {
      cleanup();
      setSpineTextureFilter(scene, atlasKey);
      resolve();
    };
    const onError = (file: { key?: string }) => {
      if (file.key !== skelKey && file.key !== atlasKey) return;
      fail(`Failed to load spine assets: ${skelKey}`);
    };
    // A scene that shuts down mid-load never emits COMPLETE — fail fast so
    // callers can retry instead of awaiting a dead promise forever.
    const onShutdown = () => fail("Scene shut down during spine asset load");
    scene.load.once(Phaser.Loader.Events.COMPLETE, onComplete);
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    scene.load.spineAtlas(atlasKey, `${SPINE_CHAR_BASE}/${atlasKey}.atlas`);
    scene.load.spineSkeleton(skelKey, `${SPINE_CHAR_BASE}/${skelKey}.json`);
    if (!scene.load.isLoading()) scene.load.start();
  });
  spinePromises.set(id, promise);
  spineScenes.set(id, scene);
  return promise;
}

/** Load the shared Heroes 99 doll atlas + skeleton once (game-global caches). */
export function ensureSpineCharacterAssets(scene: Phaser.Scene): Promise<void> {
  return ensureSpineAssets(scene, SPINE_CHAR_SKEL, SPINE_CHAR_ATLAS);
}
