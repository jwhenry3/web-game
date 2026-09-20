/**
 * Feature-stamp model — placements of hand-drawn "map feature" images on a
 * map. The catalog is a static publicDir asset
 * (/assets/map-features/catalog.json); placements persist through the dev
 * server's /editor-api/stamps endpoints.
 *
 * Coordinate conventions:
 *  - feature-local px: origin at the image's TOP-LEFT corner, x∈[0,w], y∈[0,h]
 *  - stamp.x/y: feature CENTER in world px
 *  - stamp.rotation: degrees, clockwise in screen space (same as canvas rotate())
 *  - stamp.flipX: mirrors the image horizontally in feature space (before rotation)
 *  - stamp.scale: uniform multiplier
 *
 * local → world: c = p − (w/2, h/2); if flipX, c.x = −c.x; c *= scale;
 *   world = R(rotation)·c + (x, y), with R the standard canvas rotation matrix.
 */

export interface StampVec {
  x: number;
  y: number;
}

/** A polygon in feature-local px (origin top-left). */
export type StampPoly = StampVec[];

export interface StampFeature {
  id: string;
  /** "water" | "building" | "land" */
  category: string;
  /** Static image URL, e.g. /assets/map-features/<cat>/<id>.png */
  image: string;
  w: number;
  h: number;
  /** Collision polygons, feature-local px. */
  collision: StampPoly[];
}

export interface StampCatalog {
  features: StampFeature[];
}

export interface StampPlacement {
  id: string;
  /** Catalog feature id. */
  feature: string;
  /** Feature center in world px. */
  x: number;
  y: number;
  /** Degrees, clockwise in screen space. */
  rotation: number;
  flipX: boolean;
  scale: number;
  /** Optional per-instance collision override (feature-local coords). When
   * present it fully replaces the catalog polys for this instance. */
  collision?: StampPoly[];
}

export interface StampDoc {
  stamps: StampPlacement[];
}

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** Tolerate loose JSON (missing fields get sane defaults). */
export function normalizeStamp(raw: unknown, index: number): StampPlacement {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof r.id === "string" && r.id ? r.id : `st_${index}`,
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
    collision: Array.isArray(r.collision) ? (r.collision as StampPoly[]) : undefined,
  };
}

export async function loadCatalog(): Promise<StampCatalog> {
  const res = await fetch("/assets/map-features/catalog.json");
  if (!res.ok) throw new Error(`catalog: ${res.status}`);
  const body = (await res.json()) as Partial<StampCatalog>;
  return { features: body.features ?? [] };
}

export async function listStamps(mapId: string): Promise<StampDoc> {
  const res = await fetch(`/editor-api/stamps?map=${encodeURIComponent(mapId)}`);
  const body = (await res.json().catch(() => ({}))) as Partial<StampDoc> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `stamps: ${res.status}`);
  return { stamps: (body.stamps ?? []).map(normalizeStamp) };
}

export async function saveStamps(mapId: string, doc: StampDoc): Promise<void> {
  const res = await fetch("/editor-api/stamps/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ map: mapId, stamps: doc.stamps }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `save stamps: ${res.status}`);
  }
}

const DEG = Math.PI / 180;

/** Feature-local point (top-left origin) → world px for a placement. */
export function stampLocalToWorld(
  feature: Pick<StampFeature, "w" | "h">,
  stamp: StampPlacement,
  p: StampVec,
): StampVec {
  let lx = p.x - feature.w / 2;
  const ly = p.y - feature.h / 2;
  if (stamp.flipX) lx = -lx;
  const sc = stamp.scale || 1;
  lx *= sc;
  const sy = ly * sc;
  const a = (stamp.rotation || 0) * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: stamp.x + lx * cos - sy * sin, y: stamp.y + lx * sin + sy * cos };
}

/** World px → feature-local (top-left origin). Inverse of stampLocalToWorld. */
export function stampWorldToLocal(
  feature: Pick<StampFeature, "w" | "h">,
  stamp: StampPlacement,
  p: StampVec,
): StampVec {
  const dx = p.x - stamp.x;
  const dy = p.y - stamp.y;
  const a = (stamp.rotation || 0) * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const sc = stamp.scale || 1;
  let lx = (dx * cos + dy * sin) / sc;
  const ly = (-dx * sin + dy * cos) / sc;
  if (stamp.flipX) lx = -lx;
  return { x: lx + feature.w / 2, y: ly + feature.h / 2 };
}

/**
 * The stamp's effective collision polygons in world space — the instance
 * override when present, else the catalog polys.
 */
export function featurePolysWorld(
  feature: Pick<StampFeature, "w" | "h" | "collision">,
  stamp: StampPlacement,
): StampPoly[] {
  const polys = stamp.collision ?? feature.collision ?? [];
  return polys.map((poly) => poly.map((p) => stampLocalToWorld(feature, stamp, p)));
}
