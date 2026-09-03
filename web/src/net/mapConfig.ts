import type { MapSnapshot } from "../types";
import { useGame } from "../state/store";

export function applyMapSnapshotToGame(map: MapSnapshot) {
  useGame.setState({
    mapInfo: {
      id: map.id,
      name: map.name,
      combat: map.combat,
      capabilities: map.capabilities ?? [],
      portals: map.portals ?? [],
      tileOverrides: map.tile_overrides,
      terrainLayers: map.terrain_layers,
    },
    overworld: map.overworld,
  });
}

export async function fetchMapList(): Promise<MapSnapshot[]> {
  const res = await fetch("/api/maps");
  if (!res.ok) throw new Error(`Failed to load map list (${res.status})`);
  return (await res.json()) as MapSnapshot[];
}

export async function fetchMapConfig(mapId: string): Promise<MapSnapshot> {
  const res = await fetch(`/api/maps/${encodeURIComponent(mapId)}`);
  if (!res.ok) throw new Error(`Failed to load map config for ${mapId} (${res.status})`);
  return (await res.json()) as MapSnapshot;
}

const prefetchById = new Map<string, Promise<MapSnapshot | null>>();

/** Fetch map config over REST and prime the game store (safe to call before join_world). */
export function prefetchMapConfig(mapId: string): Promise<MapSnapshot | null> {
  const existing = prefetchById.get(mapId);
  if (existing) return existing;

  const promise = fetchMapConfig(mapId)
    .then((map) => {
      applyMapSnapshotToGame(map);
      return map;
    })
    .catch((err) => {
      console.warn(`map config prefetch failed for ${mapId}`, err);
      return null;
    });
  prefetchById.set(mapId, promise);
  return promise;
}

export function defaultMapId(): string {
  const fromStore = useGame.getState().mapInfo?.id;
  if (fromStore) return fromStore;
  return "greenwood";
}

export async function ensureMapConfigLoaded(mapId?: string): Promise<MapSnapshot | null> {
  const id = mapId ?? defaultMapId();
  const cur = useGame.getState();
  if (cur.mapInfo?.id === id && cur.overworld && cur.mapInfo.terrainLayers) {
    return {
      id: cur.mapInfo.id,
      name: cur.mapInfo.name,
      combat: cur.mapInfo.combat,
      capabilities: cur.mapInfo.capabilities,
      modules: [],
      overworld: cur.overworld,
      portals: cur.mapInfo.portals,
      tile_overrides: cur.mapInfo.tileOverrides,
      terrain_layers: cur.mapInfo.terrainLayers,
    };
  }
  return prefetchMapConfig(id);
}
