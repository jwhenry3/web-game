import type { MapTerrainLayers, MapTileOverrides } from "../types";

export interface TerrainSyncInputs {
  cells?: string;
  portals?: { x: number; y: number; w: number; h: number }[];
  terrainLayers?: MapTerrainLayers | null;
  tileOverrides?: MapTileOverrides;
}

/** Cheap change detection for WorldScene terrain — avoids JSON.stringify on the hot path. */
export function terrainInputsChanged(
  cached: TerrainSyncInputs | null,
  next: TerrainSyncInputs,
): boolean {
  if (!cached) return true;
  return (
    cached.cells !== next.cells ||
    cached.portals !== next.portals ||
    cached.terrainLayers !== next.terrainLayers ||
    cached.tileOverrides !== next.tileOverrides
  );
}

export function portalKey(portals?: { x: number; y: number; w: number; h: number }[]): string {
  if (!portals?.length) return "";
  return portals.map((p) => `${p.x},${p.y},${p.w},${p.h}`).join("|");
}

export function hasEditorTerrainOverrides(
  overrides?: { layers?: Record<string, Record<string, number>> } | null,
): boolean {
  if (!overrides?.layers) return false;
  return Object.keys(overrides.layers).length > 0;
}
