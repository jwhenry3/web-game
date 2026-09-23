/**
 * Scene stores for the Content workspace's scene panel. A SceneStore is
 * scoped to a map id and restores/saves the local `scene3d:<map>` draft —
 * caching by id keeps unsaved scene work alive while the user bounces
 * between maps inside Content. Server persistence stays in the Scene
 * workspace; the content document never writes scenes.
 */
import { useSyncExternalStore } from 'react';
import { SceneStore } from '../scene3d/store';
import { listSceneMaps, loadScene, type SceneMapInfo } from '../scene3d/api';
import type { ScenePrefabAsset } from '../../../../wails/frontend/src/three/scene3d';

const cache = new Map<string, SceneStore>();

export function sceneStoreFor(mapId: string): SceneStore {
  let store = cache.get(mapId);
  if (!store) {
    store = new SceneStore(mapId);
    cache.set(mapId, store);
  }
  return store;
}

/** Hydrate the store from the server scene when no local draft exists —
 * mirrors SceneWorkspace's draft-first rule (never clobber unsaved work). */
export async function hydrateSceneStore(store: SceneStore, mapId: string): Promise<void> {
  if (localStorage.getItem(`scene3d:${mapId}`)) return;
  const doc = await loadScene(mapId);
  if (!store.getState().dirty) store.replaceDoc(doc);
}

const EMPTY_PREFABS: ScenePrefabAsset[] = [];
const noopSubscribe = () => () => {};

/** Subscribe to a scene store's authored prefab list (empty when no map). */
export function useScenePrefabs(store: SceneStore | null | undefined): ScenePrefabAsset[] {
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => store?.getState().doc.prefabs ?? EMPTY_PREFABS,
    () => EMPTY_PREFABS,
  );
}

export { listSceneMaps };
export type { SceneMapInfo, SceneStore };
