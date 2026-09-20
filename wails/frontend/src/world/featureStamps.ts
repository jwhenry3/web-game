// Map-feature stamps — placements of hand-drawn images (buildings, ponds,
// land masses) authored in the map editor (tools/editor stamps.ts). The
// catalog is a static public asset; per-map placements are mirrored to
// public/assets/maps/<mapId>.stamps.json on save. Water/land categories are
// baked into the terrain chunk PNGs by tools/bake_terrain.py — the client
// only renders the rest (currently "building") as depth-sorted props.
//
// Coordinate conventions (match the editor):
//  - feature-local px: origin at the image's TOP-LEFT corner, x∈[0,w], y∈[0,h]
//  - stamp.x/y: feature CENTER in world px
//  - stamp.rotation: degrees, clockwise in screen space (canvas rotate())
//  - stamp.flipX: mirrors horizontally in feature space (before rotation)
//  - stamp.scale: uniform multiplier

export interface MapFeature {
  id: string;
  /** "water" | "land" are baked into chunks; anything else renders live. */
  category: string;
  /** Static image URL, e.g. /assets/map-features/<cat>/<id>.png */
  image: string;
  w: number;
  h: number;
}

export interface FeatureStamp {
  /** Catalog feature id. */
  feature: string;
  /** Feature center in world px. */
  x: number;
  y: number;
  /** Degrees, clockwise in screen space. */
  rotation: number;
  flipX: boolean;
  scale: number;
}

/** Feature categories the terrain bake owns — never rendered client-side. */
const BAKED_CATEGORIES = new Set(["water", "land"]);

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

let catalogPromise: Promise<Map<string, MapFeature>> | null = null;
const stampDocs = new Map<string, Promise<FeatureStamp[]>>();

/** Feature id → catalog entry. Missing file resolves to an empty map. */
export function mapFeatureCatalog(): Promise<Map<string, MapFeature>> {
  if (!catalogPromise) {
    catalogPromise = fetch("/assets/map-features/catalog.json")
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then((raw) => {
        const features = new Map<string, MapFeature>();
        const list = (raw as { features?: unknown[] } | null)?.features;
        for (const f of list ?? []) {
          const r = f as Partial<MapFeature>;
          if (typeof r.id === "string" && r.id && typeof r.image === "string" && r.image) {
            features.set(r.id, {
              id: r.id,
              category: typeof r.category === "string" ? r.category : "",
              image: r.image,
              w: num(r.w),
              h: num(r.h),
            });
          }
        }
        return features;
      })
      .catch(() => new Map<string, MapFeature>());
  }
  return catalogPromise;
}

/** Stamps for a map; missing file resolves to an empty list. */
export function mapFeatureStamps(mapId: string): Promise<FeatureStamp[]> {
  if (!mapId) return Promise.resolve([]);
  let p = stampDocs.get(mapId);
  if (!p) {
    p = fetch(`/assets/maps/${mapId}.stamps.json`)
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then((raw) => {
        const list = (raw as { stamps?: unknown[] } | null)?.stamps;
        return (Array.isArray(list) ? list : []).map((s) => {
          const r = (s ?? {}) as Record<string, unknown>;
          return {
            feature:
              typeof r.feature === "string"
                ? r.feature
                : typeof r.featureId === "string"
                  ? (r.featureId as string)
                  : "",
            x: num(r.x),
            y: num(r.y),
            rotation: num(r.rotation),
            flipX: r.flipX === true,
            scale: num(r.scale, 1) || 1,
          };
        });
      })
      .catch(() => [] as FeatureStamp[]);
    stampDocs.set(mapId, p);
  }
  return p;
}

/** Live-prop feature for a stamp, or undefined when the category is baked. */
export function liveStampFeature(
  features: Map<string, MapFeature>,
  stamp: FeatureStamp,
): MapFeature | undefined {
  const f = features.get(stamp.feature);
  if (!f || BAKED_CATEGORIES.has(f.category)) return undefined;
  return f;
}

const DEG = Math.PI / 180;

/**
 * Feature-local point (top-left origin) → world px, mirroring the editor's
 * draw transform: center → flipX → scale → rotate → translate.
 */
export function stampLocalToWorld(
  f: Pick<MapFeature, "w" | "h">,
  s: FeatureStamp,
  px: number,
  py: number,
): { x: number; y: number } {
  let lx = px - f.w / 2;
  let ly = py - f.h / 2;
  if (s.flipX) lx = -lx;
  const sc = s.scale || 1;
  lx *= sc;
  ly *= sc;
  const a = (s.rotation || 0) * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: s.x + lx * cos - ly * sin, y: s.y + lx * sin + ly * cos };
}

/** World Y of the stamp's bottom-center — the y-sort depth anchor. */
export function stampAnchorY(f: Pick<MapFeature, "w" | "h">, s: FeatureStamp): number {
  return stampLocalToWorld(f, s, f.w / 2, f.h).y;
}
