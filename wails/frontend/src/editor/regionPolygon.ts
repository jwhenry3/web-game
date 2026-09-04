import type { EditorObject } from "./editorTypes";

export interface PolyPoint {
  x: number;
  y: number;
}

function isSanctuaryObj(obj: EditorObject): boolean {
  if (obj.type === "sanctuary") return true;
  return (
    obj.type === "region" &&
    obj.properties.some((p) => p.name === "sanctuary" && (p.value === true || p.value === "true"))
  );
}

function isWildernessObj(obj: EditorObject): boolean {
  return obj.type === "region" && !isSanctuaryObj(obj);
}

/** Axis-aligned world bounds (bottom-origin convention for x/y/width/height). */
export function boundsFromPolygon(poly: PolyPoint[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: minX,
    y: maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export function rectPolygon(obj: Pick<EditorObject, "x" | "y" | "width" | "height">): PolyPoint[] {
  const minX = obj.x;
  const maxX = obj.x + obj.width;
  const minY = obj.y - obj.height;
  const maxY = obj.y;
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/** Absolute world-pixel vertices for a region/sanctuary (ensures ≥3). */
export function regionPolygon(obj: EditorObject): PolyPoint[] {
  if (obj.polygon && obj.polygon.length >= 3) {
    return obj.polygon.map((p) => ({ x: p.x, y: p.y }));
  }
  return rectPolygon(obj);
}

export function withSyncedRegionBounds(obj: EditorObject): EditorObject {
  if (obj.type !== "region" && obj.type !== "sanctuary") return obj;
  const polygon = regionPolygon(obj);
  const b = boundsFromPolygon(polygon);
  return { ...obj, polygon, ...b, point: false };
}

export function snapPolyPoint(wx: number, wy: number, tileSize: number): PolyPoint {
  return {
    x: Math.round(wx / tileSize) * tileSize,
    y: Math.round(wy / tileSize) * tileSize,
  };
}

export function pointInPolygon(px: number, py: number, poly: PolyPoint[]): boolean {
  if (poly.length < 3) return false;
  // Boundary counts as inside for hit-testing / membership.
  if (pointOnPolygonBoundary(px, py, poly)) return true;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function nearlyEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

function pointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  if (dot < -1e-6) return false;
  const lenSq = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  return dot <= lenSq + 1e-6;
}

function pointOnPolygonBoundary(px: number, py: number, poly: PolyPoint[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (pointOnSegment(px, py, a.x, a.y, b.x, b.y)) return true;
  }
  return false;
}

/** Strict interior (not on boundary). */
export function pointStrictlyInPolygon(px: number, py: number, poly: PolyPoint[]): boolean {
  if (poly.length < 3) return false;
  if (pointOnPolygonBoundary(px, py, poly)) return false;
  return pointInPolygon(px, py, poly);
}

function segmentsProperlyIntersect(
  a1: PolyPoint,
  a2: PolyPoint,
  b1: PolyPoint,
  b2: PolyPoint,
): boolean {
  const orient = (p: PolyPoint, q: PolyPoint, r: PolyPoint) => {
    const v = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (nearlyEqual(v, 0)) return 0;
    return v > 0 ? 1 : 2;
  };
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);
  // Proper crossing only (shared endpoints / collinear touch = not overlapping interiors).
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

/** True when polygon interiors intersect. Shared edges/vertices are allowed. */
export function polygonsOverlap(a: PolyPoint[], b: PolyPoint[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      if (segmentsProperlyIntersect(a1, a2, b1, b2)) return true;
    }
  }
  for (const p of a) {
    if (pointStrictlyInPolygon(p.x, p.y, b)) return true;
  }
  for (const p of b) {
    if (pointStrictlyInPolygon(p.x, p.y, a)) return true;
  }
  return false;
}

export function regionObjectsOverlap(a: EditorObject, b: EditorObject): boolean {
  return polygonsOverlap(regionPolygon(a), regionPolygon(b));
}

/** Same-class peers that must not overlap (wilderness↔wilderness, sanctuary↔sanctuary). */
export function regionOverlapPeers(obj: EditorObject, objects: EditorObject[]): EditorObject[] {
  if (isWildernessObj(obj)) {
    return objects.filter((o) => o !== obj && isWildernessObj(o));
  }
  if (isSanctuaryObj(obj)) {
    return objects.filter((o) => o !== obj && isSanctuaryObj(o));
  }
  return [];
}

export function findOverlappingRegion(
  candidate: EditorObject,
  objects: EditorObject[],
  ignore?: EditorObject | null,
): EditorObject | null {
  const peers = regionOverlapPeers(candidate, objects).filter((o) => {
    if (!ignore) return true;
    if (ignore.id != null && o.id === ignore.id) return false;
    return !(o.name === ignore.name && o.type === ignore.type);
  });
  for (const peer of peers) {
    if (regionObjectsOverlap(candidate, peer)) return peer;
  }
  return null;
}

export function translatePolygon(poly: PolyPoint[], dx: number, dy: number): PolyPoint[] {
  return poly.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function polygonArea(poly: PolyPoint[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function createRegionObject(args: {
  id: number;
  type: "region" | "sanctuary";
  polygon: PolyPoint[];
}): EditorObject {
  const { id, type, polygon } = args;
  const b = boundsFromPolygon(polygon);
  const prefix = type === "sanctuary" ? "sanctuary" : "region";
  const kind = type === "sanctuary" ? "camp" : "wilderness";
  return {
    id,
    name: `${prefix}_${id}`,
    type,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    polygon: polygon.map((p) => ({ ...p })),
    properties: [
      { name: "id", type: "string", value: `${prefix}_${id}` },
      { name: "kind", type: "string", value: kind },
    ],
  };
}
