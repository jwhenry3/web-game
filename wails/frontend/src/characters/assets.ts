import Phaser from "phaser";
import {
  H99_LAYER_ORDER,
  H99_SHEET,
  layerAssetPath,
  layerTextureKey,
  type CharacterAppearance,
} from "./heroes99";

const pending = new Map<string, Promise<void>>();

function loadSpritesheet(scene: Phaser.Scene, textureKey: string, path: string): Promise<void> {
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
    H99_LAYER_ORDER.map((layer) =>
      loadSpritesheet(scene, layerTextureKey(layer, appearance), layerAssetPath(layer, appearance)),
    ),
  ).then(() => undefined);
}

export function preloadAppearance(
  loader: Phaser.Loader.LoaderPlugin,
  appearance: CharacterAppearance,
): void {
  const { frameWidth, frameHeight } = H99_SHEET;
  for (const layer of H99_LAYER_ORDER) {
    const key = layerTextureKey(layer, appearance);
    if (loader.scene.textures.exists(key)) continue;
    loader.spritesheet(key, layerAssetPath(layer, appearance), { frameWidth, frameHeight });
  }
}

export function layersForAppearance(): typeof H99_LAYER_ORDER {
  return H99_LAYER_ORDER;
}
