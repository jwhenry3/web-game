// Pre-baked terrain chunks (tools/bake_terrain.py). The bake writes
// public/assets/baked/<mapId>/manifest.json plus base_<cx>_<cy>.png /
// over_<cx>_<cy>.png images — the client fetches the manifest, verifies the
// terrain hash against the live layers, and streams PNG chunks instead of
// rasterizing tiles at runtime. A missing or stale manifest falls back to
// runtime rasterization.
import { terrainLayerHash, type TerrainLayerData } from "./terrainRaster";

export interface BakedTerrain {
  map: string;
  tileSize: number;
  chunkTiles: number;
  /** Sampled terrain hash — mirrors terrainLayerHash / bake_terrain.py. */
  hash: number;
  /** "cx,cy" keys that have a base_<cx>_<cy>.png on disk. */
  base: Set<string>;
  /** "cx,cy" keys that have a canopy over_<cx>_<cy>.png (sparse). */
  over: Set<string>;
}

const manifestCache = new Map<string, Promise<BakedTerrain | null>>();

/** Fetch the bake manifest for a map; null when absent or malformed. */
export function fetchBakedTerrain(mapId: string): Promise<BakedTerrain | null> {
  if (!mapId) return Promise.resolve(null);
  let p = manifestCache.get(mapId);
  if (!p) {
    p = fetch(`/assets/baked/${mapId}/manifest.json`)
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then((raw) => {
        const m = raw as Partial<Record<string, unknown>> | null;
        if (
          !m ||
          typeof m.map !== "string" ||
          typeof m.tile_size !== "number" ||
          typeof m.chunk_tiles !== "number" ||
          typeof m.terrain_hash !== "number" ||
          !Array.isArray(m.base)
        ) {
          return null;
        }
        return {
          map: m.map,
          tileSize: m.tile_size,
          chunkTiles: m.chunk_tiles,
          hash: m.terrain_hash,
          base: new Set(m.base as string[]),
          over: new Set(Array.isArray(m.over) ? (m.over as string[]) : []),
        };
      })
      .catch(() => null);
    manifestCache.set(mapId, p);
  }
  return p;
}

/**
 * Validate a fetched manifest against the live terrain layers — rejects stale
 * bakes (hash) and geometry mismatches. The bake hash covers the ground layer
 * only: the server normalizes collision at load (normalizeTreeCollision), so
 * the collision array the client sees never matches the map file's — and it
 * doesn't affect baked pixels regardless.
 */
export function bakedTerrainMatches(
  m: BakedTerrain | null,
  data: TerrainLayerData,
  chunkTiles: number,
): m is BakedTerrain {
  if (!m) return false;
  if (m.tileSize !== data.tileSize) return false;
  if (m.chunkTiles !== chunkTiles) {
    // The bake wins — the chunk grid follows the manifest so PNG names,
    // positions, and runtime fallback rects all share m.chunkTiles.
    console.warn(
      `baked terrain chunk_tiles ${m.chunkTiles} != runtime ${chunkTiles} — using manifest grid`,
    );
  }
  return m.hash === terrainLayerHash({ ground: data.ground, collision: [] });
}

export function bakedChunkUrl(
  m: BakedTerrain,
  kind: "base" | "over",
  cx: number,
  cy: number,
): string {
  return `/assets/baked/${m.map}/${kind}_${cx}_${cy}.png`;
}
