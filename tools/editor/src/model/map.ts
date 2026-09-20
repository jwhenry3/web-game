/**
 * Map workspace model — types mirror game.MapConfig / game.MapTileOverrides
 * (internal/game/map_config.go, map_override.go). The dev server returns the
 * merged map (base + sparse override already applied); this module adds the
 * client-side derivations the runtime performs for display purposes.
 */

export interface MapProp {
  name: string;
  type?: string;
  value: unknown;
}

/**
 * Tiled-style object (game.OverrideObject). Rect objects use the
 * bottom-origin convention: (x, y) is the rect's bottom-left corner, so the
 * top-left is (x, y - height). Polygon vertices are absolute world pixels.
 */
export interface MapObject {
  id?: number;
  name?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  point?: boolean;
  /** Absolute world px. Serialized Vec2 — accepts {x,y} (Tiled) or {X,Y} (Go). */
  polygon?: { x?: number; y?: number; X?: number; Y?: number }[];
  properties?: MapProp[];
}

export interface MapRegion {
  id: string;
  minC: number;
  minR: number;
  maxC: number;
  maxR: number;
  sanctuary?: boolean;
  kind?: string;
  /** Absolute tile-space vertices; absent means "use the AABB". */
  polygon?: { x?: number; y?: number; X?: number; Y?: number }[];
}

export interface MapSavePoint {
  id: string;
  name: string;
  tile: [number, number];
}

export interface MapJobChanger {
  id: string;
  name: string;
  tile: [number, number];
}

export interface MapNpc {
  id: string;
  kind?: string;
  name?: string;
  level?: number;
  region?: string;
  home: [number, number];
  encounter?: unknown;
}

export interface MapExit {
  destMap: string;
  /** [minC, minR, maxC, maxR] */
  tiles: [number, number, number, number];
  /** [destX, destY] world px in the destination map */
  dest: [number, number];
}

export interface MapConfig {
  tile_size: number;
  cols: number;
  rows: number;
  wander?: { minDistance?: number; pauseSec?: number; speed?: number };
  terrain: { ground: number[]; collision: number[] };
  regions?: MapRegion[];
  simulation_regions?: MapRegion[];
  save_points?: MapSavePoint[];
  job_changers?: MapJobChanger[];
  npcs?: MapNpc[];
  borders?: Record<string, string>;
  exits?: MapExit[];
  objects?: MapObject[];
}

export interface MapOverride {
  map_id?: string;
  layers?: Record<string, Record<string, number>>;
  objects?: MapObject[];
  updated_at?: string;
}

export interface MapInfo {
  id: string;
  hasOverride: boolean;
}

export interface MapResponse {
  map: MapConfig;
  override: MapOverride | null;
}

export async function listMaps(): Promise<MapInfo[]> {
  const res = await fetch("/editor-api/maps");
  if (!res.ok) throw new Error(`maps: ${res.status}`);
  return ((await res.json()).maps ?? []) as MapInfo[];
}

export async function loadMap(id: string): Promise<MapResponse> {
  const res = await fetch(`/editor-api/map?id=${encodeURIComponent(id)}`);
  const body = (await res.json().catch(() => ({}))) as { error?: string } & MapResponse;
  if (!res.ok) throw new Error(body.error ?? `map: ${res.status}`);
  return body;
}

// --- object property accessors (tiledProp helpers) --------------------------

export function propOf(obj: MapObject, name: string): unknown {
  return obj.properties?.find((p) => p.name === name)?.value;
}

export function propStr(obj: MapObject, name: string): string {
  const v = propOf(obj, name);
  return v == null ? "" : String(v);
}

export function propBool(obj: MapObject, name: string): boolean {
  const v = propOf(obj, name);
  return v === true || v === "true";
}

export function polyPoints(
  poly: { x?: number; y?: number; X?: number; Y?: number }[] | undefined,
): { x: number; y: number }[] {
  if (!poly) return [];
  return poly.map((p) => ({ x: Number(p.x ?? p.X ?? 0), y: Number(p.y ?? p.Y ?? 0) }));
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// --- effective objects ------------------------------------------------------

/**
 * Objects the editor/runtime treat as the scene's object layer. Mirrors
 * EditorObjectsFromConfig (internal/game/editor_objects.go): when the map
 * has no explicit objects, synthesize them from regions / save points /
 * job changers / npcs / exits so they're still visible and inspectable.
 */
export function effectiveObjects(map: MapConfig): MapObject[] {
  if (map.objects?.length) return map.objects;
  return synthesizeObjects(map);
}

function synthesizeObjects(map: MapConfig): MapObject[] {
  const ts = map.tile_size > 0 ? map.tile_size : 32;
  const out: MapObject[] = [];
  let nextId = 1;

  for (const reg of map.regions ?? []) {
    const poly = polyPoints(reg.polygon);
    const obj: MapObject = {
      id: nextId++,
      name: reg.id,
      type: "region",
      x: reg.minC * ts,
      y: (reg.maxR + 1) * ts,
      width: (reg.maxC - reg.minC + 1) * ts,
      height: (reg.maxR - reg.minR + 1) * ts,
      properties: [
        { name: "id", type: "string", value: reg.id },
        { name: "sanctuary", type: "bool", value: !!reg.sanctuary },
      ],
    };
    if (reg.kind) obj.properties!.push({ name: "kind", type: "string", value: reg.kind });
    if (poly.length >= 3) obj.polygon = poly.map((p) => ({ x: p.x * ts, y: p.y * ts }));
    out.push(obj);
  }

  const pointObj = (type: string, id: string, tile: [number, number], props: MapProp[]) => {
    out.push({
      id: nextId++,
      name: id,
      type,
      x: (tile[0] + 0.5) * ts,
      y: (tile[1] + 0.5) * ts,
      point: true,
      properties: props,
    });
  };

  for (const sp of map.save_points ?? []) {
    pointObj("save_point", sp.id, sp.tile, [
      { name: "id", type: "string", value: sp.id },
      { name: "name", type: "string", value: sp.name },
    ]);
  }
  for (const jc of map.job_changers ?? []) {
    pointObj("job_changer", jc.id, jc.tile, [
      { name: "id", type: "string", value: jc.id },
      { name: "name", type: "string", value: jc.name },
    ]);
  }
  for (const n of map.npcs ?? []) {
    pointObj("npc", n.id, n.home, [
      { name: "id", type: "string", value: n.id },
      { name: "name", type: "string", value: n.name ?? "" },
      { name: "kind", type: "string", value: n.kind ?? "" },
      { name: "level", type: "int", value: n.level ?? 0 },
      { name: "region", type: "string", value: n.region ?? "" },
    ]);
  }
  (map.exits ?? []).forEach((e, i) => {
    const [minC, minR, maxC, maxR] = e.tiles;
    out.push({
      id: nextId++,
      name: `exit_${i + 1}`,
      type: "exit",
      x: minC * ts,
      y: (maxR + 1) * ts,
      width: (maxC - minC + 1) * ts,
      height: (maxR - minR + 1) * ts,
      properties: [
        { name: "destMap", type: "string", value: e.destMap },
        { name: "destX", type: "float", value: e.dest[0] },
        { name: "destY", type: "float", value: e.dest[1] },
      ],
    });
  });
  return out;
}

// --- inspectable items --------------------------------------------------------

/** World-pixel geometry used for canvas highlight + pan-to. */
export interface InspectGeom {
  rect?: { x: number; y: number; w: number; h: number };
  point?: { x: number; y: number };
  polygon?: { x: number; y: number }[];
}

export interface InspectItem {
  key: string;
  /** Display group in the inspector list. */
  group: string;
  /** Object/entity kind — drives marker color. */
  kind: string;
  label: string;
  geom: InspectGeom;
  /** Property table rows (already stringified). */
  rows: [string, string][];
  /** Foot-anchored 100x40 preview image (baked doll/prop PNG) — overrides
   * POINT_PREVIEW[kind] so npc markers show their per-kind character. */
  sprite?: string;
}

/** Baked creature preview for an npc/interactable_npc kind — falls back to
 * the generic villager when the map omits the kind. */
const npcSprite = (kind: string) =>
  `/assets/spine/doll_${kind || "npc"}.png`;

const fmt = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

const GROUP_ORDER = [
  "Regions",
  "Save points",
  "Job changers",
  "NPCs",
  "Exits",
  "Borders",
  "Simulation regions",
  "Objects",
];

function groupForType(type: string): string {
  switch (type) {
    case "region":
    case "sanctuary":
      return "Regions";
    case "save_point":
      return "Save points";
    case "job_changer":
      return "Job changers";
    case "npc":
    case "interactable_npc":
      return "NPCs";
    case "exit":
      return "Exits";
    default:
      return "Objects";
  }
}

function objectGeom(obj: MapObject): InspectGeom {
  const x = num(obj.x);
  const y = num(obj.y);
  const w = num(obj.width);
  const h = num(obj.height);
  const poly = polyPoints(obj.polygon);
  if (poly.length >= 3) return { polygon: poly };
  if (obj.point || (w === 0 && h === 0)) return { point: { x, y } };
  // Bottom-origin convention: (x, y) is the rect's bottom-left corner.
  return { rect: { x, y: y - h, w, h } };
}

function regionGeom(reg: MapRegion, ts: number): InspectGeom {
  const poly = polyPoints(reg.polygon);
  if (poly.length >= 3) {
    return { polygon: poly.map((p) => ({ x: p.x * ts, y: p.y * ts })) };
  }
  return {
    rect: {
      x: reg.minC * ts,
      y: reg.minR * ts,
      w: (reg.maxC - reg.minC + 1) * ts,
      h: (reg.maxR - reg.minR + 1) * ts,
    },
  };
}

function objectItem(obj: MapObject, index: number): InspectItem {
  const type = (obj.type ?? "").toLowerCase() || "object";
  const idProp = propStr(obj, "id");
  const label = obj.name || idProp || `object ${obj.id ?? index + 1}`;
  const rows: [string, string][] = [
    ["id", fmt(obj.id ?? idProp)],
    ["name", obj.name ?? ""],
    ["type", obj.type ?? ""],
    ["x", fmt(obj.x)],
    ["y", fmt(obj.y)],
  ];
  if (!obj.point) {
    rows.push(["width", fmt(obj.width)], ["height", fmt(obj.height)]);
  }
  if (obj.point) rows.push(["point", "true"]);
  const seen = new Set(rows.map(([k]) => k));
  for (const p of obj.properties ?? []) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    rows.push([p.name, fmt(p.value)]);
  }
  return {
    key: `obj:${index}:${obj.id ?? ""}`,
    group: groupForType(type),
    kind: type,
    label,
    geom: objectGeom(obj),
    rows,
    sprite:
      type === "npc" || type === "interactable_npc"
        ? npcSprite(propStr(obj, "kind"))
        : undefined,
  };
}

/**
 * Build the inspectable item list for a merged map. Mirrors the runtime's
 * effective-entity rules (LoadOverworldFromMapConfig):
 *  - when objects contain region/sanctuary objects they fully replace
 *    cfg.regions; cfg.regions are only listed when no region objects exist;
 *  - npc-type objects likewise replace cfg.npcs / cfg.job_changers;
 *  - cfg.save_points and cfg.exits are always authoritative (objects of
 *    those types are editor mirrors) — config entries already mirrored by
 *    an object are skipped to avoid double-listing;
 *  - borders and simulation_regions only exist in config.
 */
export function buildInspectItems(map: MapConfig): InspectItem[] {
  const ts = map.tile_size > 0 ? map.tile_size : 32;
  const worldW = map.cols * ts;
  const worldH = map.rows * ts;
  const items: InspectItem[] = [];

  const synthesized = !(map.objects?.length);
  const objs = effectiveObjects(map);
  objs.forEach((o, i) => items.push(objectItem(o, i)));

  if (!synthesized) {
    const hasRegionObjs = objs.some((o) => {
      const t = (o.type ?? "").toLowerCase();
      return t === "region" || t === "sanctuary";
    });
    const hasNpcObjs = objs.some((o) =>
      ["npc", "interactable_npc", "job_changer"].includes((o.type ?? "").toLowerCase()),
    );
    const objIdFor = (type: string) =>
      new Set(
        objs
          .filter((o) => (o.type ?? "").toLowerCase() === type)
          .map((o) => propStr(o, "id") || o.name || ""),
      );

    if (!hasRegionObjs) {
      for (const reg of map.regions ?? []) {
        items.push({
          key: `cfg:region:${reg.id}`,
          group: "Regions",
          kind: reg.sanctuary ? "sanctuary" : "region",
          label: reg.id,
          geom: regionGeom(reg, ts),
          rows: [
            ["id", reg.id],
            ["tiles", `${reg.minC},${reg.minR} – ${reg.maxC},${reg.maxR}`],
            ["sanctuary", fmt(!!reg.sanctuary)],
            ["kind", reg.kind ?? ""],
          ],
        });
      }
    }
    if (!hasNpcObjs) {
      const npcItem = (n: MapNpc) => ({
        key: `cfg:npc:${n.id}`,
        group: "NPCs",
        kind: "npc",
        label: n.name || n.id,
        sprite: npcSprite(n.kind ?? ""),
        geom: { point: { x: (n.home[0] + 0.5) * ts, y: (n.home[1] + 0.5) * ts } } as InspectGeom,
        rows: [
          ["id", n.id],
          ["name", n.name ?? ""],
          ["kind", n.kind ?? ""],
          ["level", fmt(n.level)],
          ["region", n.region ?? ""],
          ["home", `${n.home[0]},${n.home[1]}`],
        ] as [string, string][],
      });
      for (const n of map.npcs ?? []) items.push(npcItem(n));
      for (const jc of map.job_changers ?? []) {
        items.push({
          key: `cfg:job:${jc.id}`,
          group: "Job changers",
          kind: "job_changer",
          label: jc.name || jc.id,
          geom: { point: { x: (jc.tile[0] + 0.5) * ts, y: (jc.tile[1] + 0.5) * ts } },
          rows: [
            ["id", jc.id],
            ["name", jc.name],
            ["tile", `${jc.tile[0]},${jc.tile[1]}`],
          ],
        });
      }
    }

    // Config-authoritative entities — listed unless an object mirrors them.
    const saveIds = objIdFor("save_point");
    for (const sp of map.save_points ?? []) {
      if (saveIds.has(sp.id)) continue;
      items.push({
        key: `cfg:save:${sp.id}`,
        group: "Save points",
        kind: "save_point",
        label: sp.name || sp.id,
        geom: { point: { x: (sp.tile[0] + 0.5) * ts, y: (sp.tile[1] + 0.5) * ts } },
        rows: [
          ["id", sp.id],
          ["name", sp.name],
          ["tile", `${sp.tile[0]},${sp.tile[1]}`],
          ["source", "config"],
        ],
      });
    }
    const exitRects = objs
      .filter((o) => (o.type ?? "").toLowerCase() === "exit")
      .map((o) => objectGeom(o).rect)
      .filter((r): r is NonNullable<typeof r> => !!r);
    (map.exits ?? []).forEach((e, i) => {
      const [minC, minR, maxC, maxR] = e.tiles;
      const rect = {
        x: minC * ts,
        y: minR * ts,
        w: (maxC - minC + 1) * ts,
        h: (maxR - minR + 1) * ts,
      };
      const mirrored = exitRects.some(
        (r) =>
          Math.abs(r.x - rect.x) < 0.5 &&
          Math.abs(r.y - rect.y) < 0.5 &&
          Math.abs(r.w - rect.w) < 0.5 &&
          Math.abs(r.h - rect.h) < 0.5,
      );
      if (mirrored) return;
      items.push({
        key: `cfg:exit:${i}`,
        group: "Exits",
        kind: "exit",
        label: `exit → ${e.destMap}`,
        geom: { rect },
        rows: [
          ["destMap", e.destMap],
          ["tiles", `${minC},${minR} – ${maxC},${maxR}`],
          ["dest", `${e.dest[0]}, ${e.dest[1]}`],
          ["source", "config"],
        ],
      });
    });
  }

  (map.simulation_regions ?? []).forEach((reg) => {
    items.push({
      key: `cfg:sim:${reg.id}`,
      group: "Simulation regions",
      kind: "sim_region",
      label: reg.id,
      geom: regionGeom(reg, ts),
      rows: [
        ["id", reg.id],
        ["tiles", `${reg.minC},${reg.minR} – ${reg.maxC},${reg.maxR}`],
        ["kind", reg.kind ?? ""],
      ],
    });
  });

  const EDGE_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
    north: { x: 0, y: 0, w: worldW, h: ts },
    south: { x: 0, y: worldH - ts, w: worldW, h: ts },
    west: { x: 0, y: 0, w: ts, h: worldH },
    east: { x: worldW - ts, y: 0, w: ts, h: worldH },
  };
  for (const [edge, dest] of Object.entries(map.borders ?? {})) {
    const band = EDGE_RECTS[edge.toLowerCase()];
    items.push({
      key: `border:${edge}`,
      group: "Borders",
      kind: "border",
      label: `${edge} → ${dest}`,
      geom: band ? { rect: band } : {},
      rows: [
        ["edge", edge],
        ["map", dest],
      ],
    });
  }

  return items;
}

export function groupItems(items: InspectItem[]): [string, InspectItem[]][] {
  const groups = new Map<string, InspectItem[]>();
  for (const item of items) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => [g, groups.get(g)!]);
}

// --- hierarchical inspect tree: region -> sub-region -> npcs / pois ---------

export interface InspectNode {
  item: InspectItem;
  /** Regions whose bounds sit strictly inside this region. */
  children: InspectNode[];
  npcs: InspectItem[];
  pois: InspectItem[];
}

export interface InspectTree {
  /** Top-level regions (no containing parent), sorted by label. */
  regions: InspectNode[];
  /** NPCs/PoIs that resolve to no region. */
  unassigned: InspectItem[];
  /** Non-region groups that don't nest (borders, objects, sim regions). */
  groups: [string, InspectItem[]][];
}

const POI_GROUPS = new Set(["Save points", "Job changers", "Exits"]);

/** World-px bounding box of an item's geometry. */
function geomBounds(it: InspectItem): { x0: number; y0: number; x1: number; y1: number } | null {
  const g = it.geom;
  if (g.rect) return { x0: g.rect.x, y0: g.rect.y, x1: g.rect.x + g.rect.w, y1: g.rect.y + g.rect.h };
  if (g.point) return { x0: g.point.x, y0: g.point.y, x1: g.point.x, y1: g.point.y };
  if (g.polygon?.length) {
    const xs = g.polygon.map((p) => p.x);
    const ys = g.polygon.map((p) => p.y);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  return null;
}

const containsBounds = (
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
) => a.x0 <= b.x0 && a.y0 <= b.y0 && a.x1 >= b.x1 && a.y1 >= b.y1;

const boundsArea = (b: { x0: number; y0: number; x1: number; y1: number }) =>
  (b.x1 - b.x0) * (b.y1 - b.y0);

const rowVal = (it: InspectItem, key: string) => it.rows.find(([k]) => k === key)?.[1];

/**
 * Group the flat inspect list into a region tree. A region's parent is the
 * smallest region whose bounds contain it; NPCs attach via their `region`
 * row (falling back to point containment) and PoIs (save points, job
 * changers, exits) attach by containment. Everything else stays in its
 * flat group.
 */
export function buildInspectTree(items: InspectItem[]): InspectTree {
  const regionItems = items.filter((i) => i.group === "Regions");
  const nodes = new Map<InspectItem, InspectNode>();
  for (const r of regionItems) nodes.set(r, { item: r, children: [], npcs: [], pois: [] });

  const roots: InspectNode[] = [];
  for (const r of regionItems) {
    const b = geomBounds(r);
    let parent: InspectNode | null = null;
    if (b) {
      let bestArea = Infinity;
      for (const p of regionItems) {
        if (p === r) continue;
        const pb = geomBounds(p);
        if (pb && containsBounds(pb, b) && boundsArea(pb) < bestArea) {
          bestArea = boundsArea(pb);
          parent = nodes.get(p)!;
        }
      }
    }
    (parent ? parent.children : roots).push(nodes.get(r)!);
  }

  // Region id -> node. Config regions list the id in label; object-mirrored
  // regions carry it in the id row — cover both.
  const byId = new Map<string, InspectNode>();
  for (const r of regionItems) {
    for (const id of [rowVal(r, "id"), r.label]) {
      if (id && !byId.has(id)) byId.set(id, nodes.get(r)!);
    }
  }

  /** Smallest region containing the item's anchor point. */
  const regionAt = (it: InspectItem): InspectNode | null => {
    const c = itemCenter(it);
    if (!c) return null;
    let best: InspectNode | null = null;
    let bestArea = Infinity;
    for (const r of regionItems) {
      const pb = geomBounds(r);
      if (pb && containsBounds(pb, { x0: c.x, y0: c.y, x1: c.x, y1: c.y })) {
        const area = boundsArea(pb);
        if (area < bestArea) {
          bestArea = area;
          best = nodes.get(r)!;
        }
      }
    }
    return best;
  };

  const unassigned: InspectItem[] = [];
  const other: InspectItem[] = [];
  for (const it of items) {
    if (it.group === "Regions") continue;
    if (it.group === "NPCs") {
      const rid = rowVal(it, "region");
      const node = (rid && byId.get(rid)) || regionAt(it);
      (node ? node.npcs : unassigned).push(it);
    } else if (POI_GROUPS.has(it.group)) {
      const node = regionAt(it);
      (node ? node.pois : unassigned).push(it);
    } else {
      other.push(it);
    }
  }

  const byLabel = (a: InspectItem, b: InspectItem) => a.label.localeCompare(b.label);
  const sortNode = (n: InspectNode) => {
    n.children.sort((a, b) => byLabel(a.item, b.item));
    n.npcs.sort(byLabel);
    n.pois.sort(byLabel);
    n.children.forEach(sortNode);
  };
  roots.sort((a, b) => byLabel(a.item, b.item));
  roots.forEach(sortNode);
  unassigned.sort(byLabel);

  return { regions: roots, unassigned, groups: groupItems(other) };
}

/** Total selectable items inside a node (self excluded). */
export function nodeItemCount(n: InspectNode): number {
  return n.npcs.length + n.pois.length + n.children.reduce((s, c) => s + 1 + nodeItemCount(c), 0);
}

/** Ancestor region keys leading to the node containing `key` (or the region
 * node itself) — used to auto-expand the tree on map-click selection. */
export function treeAncestors(tree: InspectTree, key: string): string[] {
  const path: string[] = [];
  const walk = (n: InspectNode): boolean => {
    if (n.item.key === key) return true;
    path.push(n.item.key);
    for (const c of n.children) if (walk(c)) return true;
    if (n.npcs.some((i) => i.key === key) || n.pois.some((i) => i.key === key)) return true;
    path.pop();
    return false;
  };
  for (const r of tree.regions) {
    if (walk(r)) return path;
  }
  return [];
}

/** Ray-cast point-in-polygon (world px). */
export function pointInPolygon(
  px: number,
  py: number,
  poly: { x: number; y: number }[],
): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function itemContains(item: InspectItem, wx: number, wy: number, hitR: number): boolean {
  const g = item.geom;
  if (g.point) {
    const dx = g.point.x - wx;
    const dy = g.point.y - wy;
    return dx * dx + dy * dy <= hitR * hitR;
  }
  if (g.polygon) return pointInPolygon(wx, wy, g.polygon);
  if (g.rect) {
    const r = g.rect;
    return wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h;
  }
  return false;
}

export function itemCenter(item: InspectItem): { x: number; y: number } | null {
  const g = item.geom;
  if (g.point) return g.point;
  if (g.rect) return { x: g.rect.x + g.rect.w / 2, y: g.rect.y + g.rect.h / 2 };
  if (g.polygon?.length) {
    let sx = 0;
    let sy = 0;
    for (const p of g.polygon) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / g.polygon.length, y: sy / g.polygon.length };
  }
  return null;
}
