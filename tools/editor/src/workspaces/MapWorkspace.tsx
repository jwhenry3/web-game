import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildInspectItems,
  buildInspectTree,
  groupItems,
  itemCenter,
  itemContains,
  listMaps,
  loadMap,
  nodeItemCount,
  pointInPolygon,
  treeAncestors,
  type InspectItem,
  type InspectNode,
  type MapInfo,
  type MapResponse,
} from "../model/map";
import {
  loadPipoyaSheets,
  rasterizeCollision,
  rasterizeGround,
  type LoadedSheet,
} from "../model/pipoya";
import {
  featurePolysWorld,
  listStamps,
  saveStamps,
  type StampPlacement,
} from "../model/stamps";
import "./maps.css";

interface View {
  x: number; // screen px offset of world origin
  y: number;
  scale: number; // screen px per world px
}

interface LayerToggles {
  collision: boolean;
  objects: boolean;
  regions: boolean;
  paint: boolean;
}

const KIND_COLORS: Record<string, string> = {
  region: "#5aa2ff",
  sanctuary: "#ffd75a",
  save_point: "#4dd8d0",
  job_changer: "#c58aff",
  npc: "#ff7a6b",
  interactable_npc: "#ff9a8b",
  exit: "#ffa040",
  border: "#9adf8f",
  sim_region: "#9aa0ae",
};

const colorFor = (kind: string) => KIND_COLORS[kind] ?? "#c4c4c4";

/** Baked 100x40 foot-anchored previews (tools/gen_props.py + paperdoll
 * presets) — point markers show the same art the world renders. */
const POINT_PREVIEW: Record<string, string> = {
  save_point: "/assets/spine/prop_crystal.png",
  job_changer: "/assets/spine/doll_job_master.png",
  quest_trigger: "/assets/spine/prop_quest.png",
  item: "/assets/spine/prop_item.png",
};

const previewCache = new Map<string, HTMLImageElement | "loading">();
let onPreviewLoad: (() => void) | null = null;

function pointPreview(src: string): HTMLImageElement | null {
  const hit = previewCache.get(src);
  if (hit instanceof HTMLImageElement) return hit;
  if (hit !== "loading") {
    previewCache.set(src, "loading");
    const img = new Image();
    img.onload = () => {
      previewCache.set(src, img);
      onPreviewLoad?.();
    };
    img.src = src;
  }
  return null;
}

/** Region-ish kinds are drawn under the "regions" layer toggle; everything
 * else is an object marker. */
const isRegionKind = (kind: string) =>
  kind === "region" || kind === "sanctuary" || kind === "sim_region" || kind === "border";

// --- feature stamps -----------------------------------------------------------

type MapMode = "inspect" | "stamp" | "collision" | "paint";

// --- terrain paint mask ------------------------------------------------------

/** World px covered by one paint-mask pixel (mask dims = world_px/8). */
const PAINT_CELL = 8;

/** Paint categories — the mask stores the EXACT rgb at alpha 255; the bake
 * matches these colors, so brushes never blend two categories. */
const PAINT_CATEGORIES: { id: string; label: string; rgb: [number, number, number] }[] = [
  { id: "water", label: "Water", rgb: [42, 109, 189] },
  { id: "grass", label: "Grass", rgb: [96, 160, 80] },
  { id: "sand", label: "Sand", rgb: [216, 192, 136] },
  { id: "snow", label: "Snow", rgb: [232, 240, 248] },
  { id: "rock", label: "Rock", rgb: [140, 120, 96] },
];

const paintCss = (rgb: [number, number, number]) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

/** World px per seamless fill tile — mirrors PAINT_FILL_SIZE in
 * tools/bake_terrain.py (SIZE in tools/gen_terrain_fills.py). */
const PAINT_FILL_WORLD = 512;
/** Category blend radius in world px — mirrors PAINT_BLUR in bake_terrain.py. */
const PAINT_BLEND_WORLD = 22;
/** Mask px of context repaints include beyond the touched rect so blurred
 * borders re-blend (a few blur radii). */
const PAINT_REPAINT_MARGIN = Math.ceil((PAINT_BLEND_WORLD / PAINT_CELL) * 4);
/** Below this view scale the mask-res preview is enough — above it a
 * screen-res detail layer re-blends the visible region at full density. */
const PAINT_DETAIL_MIN_SCALE = 0.35;
/** Min ms between detail rebuilds — pans draw the stale (world-anchored)
 * detail canvas until the next rebuild lands. */
const PAINT_DETAIL_MIN_MS = 80;

/** Server-side bake job states from /editor-api/bake/status. */
type BakeStatus = "idle" | "running" | "ok" | "error";

/** Plain world/feature-space point. (stamps.ts exports StampVec too, but the
 * fixed contract only guarantees the four API names — keep a local copy.) */
interface StampVec {
  x: number;
  y: number;
}

interface FeatureDef {
  id: string;
  category: string; // "water" | "building" | "land"
  image: string;
  w: number;
  h: number;
  /** Feature-local collision polys (origin top-left). */
  collision: StampVec[][];
}

const FEATURE_CATEGORIES: [string, string][] = [
  ["water", "Water"],
  ["building", "Buildings"],
  ["land", "Land"],
];

const DEG = Math.PI / 180;

/** The placement's feature id — tolerates a `featureId` field name too. */
const stampFeatureId = (s: StampPlacement): string => {
  const rec = s as unknown as { feature?: string; featureId?: string };
  return rec.feature ?? rec.featureId ?? "";
};

/** Feature-local (top-left origin) → world px. Mirrors the draw transform:
 * center → flipX → scale → rotate (clockwise, screen space) → translate. */
function stampLocalToWorld(
  f: Pick<FeatureDef, "w" | "h">,
  s: StampPlacement,
  px: number,
  py: number,
): StampVec {
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

/** World px → feature-local (top-left origin). Inverse of stampLocalToWorld. */
function stampWorldToLocal(
  f: Pick<FeatureDef, "w" | "h">,
  s: StampPlacement,
  wx: number,
  wy: number,
): StampVec {
  const dx = wx - s.x;
  const dy = wy - s.y;
  const a = (s.rotation || 0) * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const sc = s.scale || 1;
  let lx = (dx * cos + dy * sin) / sc;
  const ly = (-dx * sin + dy * cos) / sc;
  if (s.flipX) lx = -lx;
  return { x: lx + f.w / 2, y: ly + f.h / 2 };
}

function stampCornersWorld(f: FeatureDef, s: StampPlacement): StampVec[] {
  return [
    stampLocalToWorld(f, s, 0, 0),
    stampLocalToWorld(f, s, f.w, 0),
    stampLocalToWorld(f, s, f.w, f.h),
    stampLocalToWorld(f, s, 0, f.h),
  ];
}

/** Distance-to-center hit test against the scaled half-extent. */
function stampHit(
  f: FeatureDef,
  s: StampPlacement,
  wx: number,
  wy: number,
  slack: number,
): boolean {
  const r = (Math.max(f.w, f.h) / 2) * Math.abs(s.scale || 1) + slack;
  const dx = wx - s.x;
  const dy = wy - s.y;
  return dx * dx + dy * dy <= r * r;
}

/** Effective collision polys in world space (override else catalog). */
function polysWorldFor(
  fmap: Map<string, FeatureDef>,
  s: StampPlacement,
): StampVec[][] {
  const f = fmap.get(stampFeatureId(s));
  if (!f) return [];
  try {
    return featurePolysWorld(f, s) as StampVec[][];
  } catch {
    return [];
  }
}

/** Effective collision polys in feature-local coords — a deep copy of the
 * instance override, or of the catalog polys when no override exists. */
function localPolysOf(fmap: Map<string, FeatureDef>, s: StampPlacement): StampVec[][] {
  const ov = (s as unknown as { collision?: StampVec[][] }).collision;
  if (ov) return ov.map((p) => p.map((v) => ({ ...v })));
  const f = fmap.get(stampFeatureId(s));
  return (f?.collision ?? []).map((p) => p.map((v) => ({ ...v })));
}

let stampSeq = 0;
const newStampId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `st_${Date.now()}_${stampSeq++}`;

// --- alpha boundary extraction (collision mode "extract from art") -----------

/** Ramer–Douglas–Peucker simplification of an open polyline. */
function simplifyPoly(pts: StampVec[], eps: number): StampVec[] {
  if (pts.length <= 3) return pts.slice();
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = pts[a].x;
    const ay = pts[a].y;
    const dx = pts[b].x - ax;
    const dy = pts[b].y - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i].x - ax;
      const py = pts[i].y - ay;
      const dist =
        len2 === 0 ? Math.hypot(px, py) : Math.abs(dy * px - dx * py) / Math.sqrt(len2);
      if (dist > maxD) {
        maxD = dist;
        maxI = i;
      }
    }
    if (maxD > eps && maxI > 0) {
      keep[maxI] = true;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Simplify a closed contour: split at the point farthest from pts[0] and
 * RDP each arc so the ends stay anchored. */
function simplifyClosed(pts: StampVec[], eps: number): StampVec[] {
  if (pts.length <= 4) return pts.slice();
  let m = 0;
  let best = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2;
    if (d > best) {
      best = d;
      m = i;
    }
  }
  const a = simplifyPoly(pts.slice(0, m + 1), eps);
  const b = simplifyPoly([...pts.slice(m), pts[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/**
 * Trace the outer boundary of every opaque connected component of the feature
 * image (getImageData → 4-connected labeling → Moore-neighbor boundary trace →
 * RDP simplify). Returns feature-local polygons through pixel centers.
 */
function extractAlphaPolys(img: HTMLImageElement, w: number, h: number): StampVec[][] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return [];
  }
  const opaque = (x: number, y: number) => data[(y * w + x) * 4 + 3] > 16;

  // 4-connected component labeling.
  const comp = new Int32Array(w * h).fill(-1);
  let nComp = 0;
  const stack: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!opaque(x, y) || comp[i] !== -1) continue;
      const id = nComp++;
      comp[i] = id;
      stack.push(i);
      while (stack.length) {
        const j = stack.pop()!;
        const jx = j % w;
        const jy = (j / w) | 0;
        const push = (nx: number, ny: number) => {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
          const ni = ny * w + nx;
          if (comp[ni] === -1 && opaque(nx, ny)) {
            comp[ni] = id;
            stack.push(ni);
          }
        };
        push(jx + 1, jy);
        push(jx - 1, jy);
        push(jx, jy + 1);
        push(jx, jy - 1);
      }
    }
  }

  // Moore-neighbor tracing. Neighbor offsets listed in rotational order —
  // the scan direction is arbitrary as long as it's consistent.
  const NB = [
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ] as const;
  const inComp = (x: number, y: number, id: number) =>
    x >= 0 && y >= 0 && x < w && y < h && comp[y * w + x] === id;
  const dirIdx = (dx: number, dy: number) => {
    for (let i = 0; i < 8; i++) if (NB[i][0] === dx && NB[i][1] === dy) return i;
    return 0;
  };

  const polys: StampVec[][] = [];
  for (let id = 0; id < nComp; id++) {
    // Start = topmost-leftmost pixel of the component.
    let sx = -1;
    let sy = -1;
    outer: for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (comp[y * w + x] === id) {
          sx = x;
          sy = y;
          break outer;
        }
      }
    }
    if (sx < 0) continue;
    const pts: StampVec[] = [];
    let cx = sx;
    let cy = sy;
    let bx = sx - 1; // backtrack pixel (entered from the left)
    let by = sy;
    const b0x = bx;
    const b0y = by;
    let guard = w * h * 8 + 16;
    do {
      pts.push({ x: cx, y: cy });
      const start = dirIdx(bx - cx, by - cy);
      let found = false;
      for (let k = 1; k <= 8; k++) {
        const ni = (start + k) % 8;
        const nx = cx + NB[ni][0];
        const ny = cy + NB[ni][1];
        if (inComp(nx, ny, id)) {
          // New backtrack = last non-component pixel examined.
          const pi = (ni + 7) % 8;
          bx = cx + NB[pi][0];
          by = cy + NB[pi][1];
          cx = nx;
          cy = ny;
          found = true;
          break;
        }
      }
      if (!found) break; // isolated single pixel
      if (--guard <= 0) break;
      // Jacob's stopping criterion: back at start with the same backtrack.
    } while (!(cx === sx && cy === sy && bx === b0x && by === b0y));
    const simp = simplifyClosed(pts, 1.5);
    if (simp.length >= 3) polys.push(simp);
  }
  return polys;
}

const MIN_SCALE = 0.02;
const MAX_SCALE = 8;

/** Uncontrolled number field that commits on blur/Enter — avoids the
 * controlled-input fight while a drag is updating the same value. */
function StampNum({
  label,
  value,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  step?: number;
  onCommit: (v: number) => void;
}) {
  const rounded = Math.round(value * 100) / 100;
  return (
    <label className="ed-map-numfield">
      {label}
      <input
        key={rounded}
        type="number"
        step={step ?? 1}
        defaultValue={rounded}
        onBlur={(e) => {
          const v = e.target.valueAsNumber;
          if (Number.isFinite(v)) onCommit(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

export default function MapWorkspace() {
  const [maps, setMaps] = useState<MapInfo[]>([]);
  const [mapId, setMapId] = useState(
    () => new URLSearchParams(location.search).get("map") ?? "",
  );
  const [resp, setResp] = useState<MapResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [toggles, setToggles] = useState<LayerToggles>({
    collision: true,
    objects: true,
    regions: true,
    paint: true,
  });
  const [selKey, setSelKey] = useState<string | null>(null);
  /** Expanded region node keys in the inspect tree (default collapsed). */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mapSearch, setMapSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [reloadTick, setReloadTick] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);
  const [sheetsReady, setSheetsReady] = useState(false);

  // --- feature stamps ---
  const [mode, setMode] = useState<MapMode>("inspect");
  const [features, setFeatures] = useState<FeatureDef[]>([]);
  const [featureErr, setFeatureErr] = useState<string | null>(null);
  const [stamps, setStamps] = useState<StampPlacement[]>([]);
  const [stampsDirty, setStampsDirty] = useState(false);
  const [stampsSaving, setStampsSaving] = useState(false);
  const [selStampId, setSelStampId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [toolRot, setToolRot] = useState(0);
  const [toolScale, setToolScale] = useState(1);
  const [selPoly, setSelPoly] = useState<{ stamp: string; poly: number } | null>(null);
  const [, setImgTick] = useState(0); // bump when a feature image finishes loading

  // --- terrain paint mask ---
  const [paintCat, setPaintCat] = useState("water");
  const [brushSize, setBrushSize] = useState(16); // brush radius in mask px
  const [paintDirty, setPaintDirty] = useState(false);
  const [paintSaving, setPaintSaving] = useState(false);

  // --- terrain bake ---
  const [bake, setBake] = useState<{ status: BakeStatus; detail?: string; stale: boolean }>({
    status: "idle",
    stale: false,
  });
  const [bakeFlash, setBakeFlash] = useState(false); // brief "Baked ✓" after a run
  const [bakeTick, setBakeTick] = useState(0); // bump to kick the status poll loop
  const bakeStatusRef = useRef<BakeStatus>("idle");
  /** Set when a save lands mid-bake — the poll requeues a run on finish. */
  const rebakePendingRef = useRef(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 0.2 });
  const rastersRef = useRef<{
    terrain: HTMLCanvasElement | null;
    collision: HTMLCanvasElement | null;
  }>({ terrain: null, collision: null });
  const sheetsRef = useRef<LoadedSheet[]>([]);
  const featureImgsRef = useRef(new Map<string, HTMLImageElement>());
  /** Offscreen mask-res canvas the paint brush writes into (exact category
   * RGB, alpha 255 — no pixel reads, so a 5120×3840 mask stays cheap). */
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  /** Textured paint preview at mask res — what the map draws instead of the
   * raw category colors. Repainted incrementally from the mask. */
  const paintViewRef = useRef<HTMLCanvasElement | null>(null);
  const paintViewCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  /** Seamless fill textures by category id (assets/terrain-fills/<id>.png). */
  const fillImgsRef = useRef(new Map<string, HTMLImageElement>());
  /** Scratch canvases for repaintRegion's indicator/blur/texture passes. */
  const paintTmpARef = useRef<HTMLCanvasElement | null>(null);
  const paintTmpBRef = useRef<HTMLCanvasElement | null>(null);
  const paintTmpCRef = useRef<HTMLCanvasElement | null>(null);
  /** Generation counter invalidating the chunked full repaint on map change. */
  const paintRepaintGenRef = useRef(0);
  /** Bumped on every mask repaint — keys the detail layer's staleness. */
  const paintMaskVerRef = useRef(0);
  /** Screen-res detail composite for the visible region when zoomed in —
   * world rect it covers, so a stale frame still lands in the right place. */
  const paintDetailRef = useRef<{
    canvas: HTMLCanvasElement;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const paintDetailKeyRef = useRef("");
  const paintDetailAtRef = useRef(0);
  const paintDetailTimerRef = useRef(0);
  const cursorRef = useRef<StampVec | null>(null); // world px under the cursor
  type DragState =
    | { kind: "pan"; x: number; y: number; ox: number; oy: number; moved: boolean }
    | { kind: "paint"; lastX: number; lastY: number; moved: boolean }
    | {
        kind: "move";
        id: string;
        wx0: number;
        wy0: number;
        ox: number;
        oy: number;
        moved: boolean;
      }
    | {
        kind: "rotate";
        id: string;
        cx: number;
        cy: number;
        a0: number;
        r0: number;
        moved: boolean;
      }
    | { kind: "vert"; id: string; poly: number; vert: number; moved: boolean };
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef(0);

  const items = useMemo(() => (resp ? buildInspectItems(resp.map) : []), [resp]);
  const sel = items.find((i) => i.key === selKey) ?? null;

  const featureById = useMemo(
    () => new Map(features.map((f) => [f.id, f])),
    [features],
  );
  const selStamp = stamps.find((s) => s.id === selStampId) ?? null;
  const selFeature = selStamp ? (featureById.get(stampFeatureId(selStamp)) ?? null) : null;

  const stateRef = useRef({
    resp,
    items,
    sel,
    toggles,
    mode,
    stamps,
    selStampId,
    selPoly,
    featureById,
    armedId,
    toolRot,
    toolScale,
    paintCat,
    brushSize,
  });
  stateRef.current = {
    resp,
    items,
    sel,
    toggles,
    mode,
    stamps,
    selStampId,
    selPoly,
    featureById,
    armedId,
    toolRot,
    toolScale,
    paintCat,
    brushSize,
  };

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      drawRef.current();
    });
  }, []);

  // Preview images decode lazily — repaint when one arrives.
  useEffect(() => {
    onPreviewLoad = scheduleDraw;
    return () => {
      if (onPreviewLoad === scheduleDraw) onPreviewLoad = null;
    };
  }, [scheduleDraw]);

  const fitView = useCallback(() => {
    const host = hostRef.current;
    const r = stateRef.current.resp;
    if (!host || !r) return;
    const ts = r.map.tile_size || 32;
    const worldW = r.map.cols * ts;
    const worldH = r.map.rows * ts;
    const scale = Math.min(
      Math.max(
        Math.min(host.clientWidth / worldW, host.clientHeight / worldH) * 0.96,
        MIN_SCALE,
      ),
      MAX_SCALE,
    );
    viewRef.current = {
      x: (host.clientWidth - worldW * scale) / 2,
      y: (host.clientHeight - worldH * scale) / 2,
      scale,
    };
    setZoomPct(Math.round(scale * 100));
    scheduleDraw();
  }, [scheduleDraw]);

  const zoomAt = useCallback(
    (mx: number, my: number, factor: number) => {
      const v = viewRef.current;
      const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const wx = (mx - v.x) / v.scale;
      const wy = (my - v.y) / v.scale;
      v.x = mx - wx * ns;
      v.y = my - wy * ns;
      v.scale = ns;
      setZoomPct(Math.round(ns * 100));
      scheduleDraw();
    },
    [scheduleDraw],
  );

  const zoomCenter = useCallback(
    (factor: number) => {
      const host = hostRef.current;
      if (!host) return;
      zoomAt(host.clientWidth / 2, host.clientHeight / 2, factor);
    },
    [zoomAt],
  );

  const panToItem = useCallback(
    (item: InspectItem) => {
      const host = hostRef.current;
      const c = itemCenter(item);
      if (!host || !c) return;
      const v = viewRef.current;
      // Zoom in a little on tiny point targets so the highlight is findable.
      if (item.geom.point && v.scale < 0.35) v.scale = 0.35;
      v.x = host.clientWidth / 2 - c.x * v.scale;
      v.y = host.clientHeight / 2 - c.y * v.scale;
      setZoomPct(Math.round(v.scale * 100));
      scheduleDraw();
    },
    [scheduleDraw],
  );

  const drawItem = useCallback(
    (ctx: CanvasRenderingContext2D, item: InspectItem, scale: number, emphasize: boolean) => {
      const g = item.geom;
      const col = emphasize ? "#ffffff" : colorFor(item.kind);
      ctx.lineWidth = (emphasize ? 3 : 1.5) / scale;
      ctx.strokeStyle = col;
      if (g.polygon && g.polygon.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(g.polygon[0].x, g.polygon[0].y);
        for (let i = 1; i < g.polygon.length; i++) ctx.lineTo(g.polygon[i].x, g.polygon[i].y);
        ctx.closePath();
        if (isRegionKind(item.kind) || emphasize) {
          ctx.fillStyle = colorFor(item.kind) + (emphasize ? "33" : "1a");
          ctx.fill();
        }
        ctx.stroke();
      } else if (g.rect) {
        if (isRegionKind(item.kind) || emphasize) {
          ctx.fillStyle = colorFor(item.kind) + (emphasize ? "33" : "1a");
          ctx.fillRect(g.rect.x, g.rect.y, g.rect.w, g.rect.h);
        }
        ctx.strokeRect(g.rect.x, g.rect.y, g.rect.w, g.rect.h);
      } else if (g.point) {
        const src = item.sprite ?? POINT_PREVIEW[item.kind];
        const img = src ? pointPreview(src) : null;
        if (img) {
          // 100x40 cell at the in-world display scale (2x), foot-anchored.
          const dw = 200;
          const dh = 80;
          ctx.drawImage(
            img, 0, 0, 100, 40,
            g.point.x - 39.5 * 2, g.point.y - 34 * 2, dw, dh,
          );
          if (emphasize) {
            ctx.beginPath();
            ctx.ellipse(g.point.x, g.point.y - 6, 30, 14, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else {
          const r = (emphasize ? 8 : 5) / scale;
          ctx.beginPath();
          ctx.arc(g.point.x, g.point.y, r, 0, Math.PI * 2);
          ctx.fillStyle = colorFor(item.kind) + "cc";
          ctx.fill();
          ctx.stroke();
          if (emphasize) {
            ctx.beginPath();
            ctx.arc(g.point.x, g.point.y, r * 1.9, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    },
    [],
  );

  /** Repaint a mask-px rect of the textured paint preview. Each category's
   * seamless fill tiles world-aligned under its blurred indicator weight —
   * the same weighted blend bake_terrain.py's paint_chunk computes, so
   * borders preview as soft shorelines. The rect grows by
   * PAINT_REPAINT_MARGIN so blends reach correctly across the edges. */
  const repaintRegion = (rx0: number, ry0: number, rw: number, rh: number) => {
    const mc = paintCanvasRef.current;
    const mctx = paintCtxRef.current;
    const vctx = paintViewCtxRef.current;
    if (!mc || !mctx || !vctx || rw <= 0 || rh <= 0) return;
    const m = PAINT_REPAINT_MARGIN;
    const x0 = Math.max(0, Math.floor(rx0) - m);
    const y0 = Math.max(0, Math.floor(ry0) - m);
    const x1 = Math.min(mc.width, Math.ceil(rx0 + rw) + m);
    const y1 = Math.min(mc.height, Math.ceil(ry0 + rh) + m);
    if (x1 <= x0 || y1 <= y0) return;
    paintMaskVerRef.current++;
    const w = x1 - x0;
    const h = y1 - y0;
    const mask = mctx.getImageData(x0, y0, w, h).data;
    if (!paintTmpARef.current) paintTmpARef.current = document.createElement("canvas");
    if (!paintTmpBRef.current) paintTmpBRef.current = document.createElement("canvas");
    const ta = paintTmpARef.current;
    const tb = paintTmpBRef.current;
    ta.width = tb.width = w;
    ta.height = tb.height = h;
    const actx = ta.getContext("2d");
    const bctx = tb.getContext("2d");
    if (!actx || !bctx) return;
    // Per-category indicator alphas in a single pass over the mask region.
    const inds = PAINT_CATEGORIES.map(() => new Uint8ClampedArray(w * h * 4));
    for (let p = 0; p < w * h; p++) {
      const o = p * 4;
      for (let ci = 0; ci < PAINT_CATEGORIES.length; ci++) {
        const c = PAINT_CATEGORIES[ci].rgb;
        if (mask[o] === c[0] && mask[o + 1] === c[1] && mask[o + 2] === c[2]) {
          inds[ci][o + 3] = 255;
          break;
        }
      }
    }
    vctx.clearRect(x0, y0, w, h);
    const blur = PAINT_BLEND_WORLD / PAINT_CELL;
    const tile = PAINT_FILL_WORLD / PAINT_CELL; // fill tile size in mask px
    for (let ci = 0; ci < PAINT_CATEGORIES.length; ci++) {
      const cat = PAINT_CATEGORIES[ci];
      actx.putImageData(new ImageData(inds[ci], w, h), 0, 0);
      bctx.clearRect(0, 0, w, h);
      bctx.filter = `blur(${blur}px)`;
      bctx.drawImage(ta, 0, 0);
      bctx.filter = "none";
      actx.clearRect(0, 0, w, h);
      const img = fillImgsRef.current.get(cat.id);
      const pat =
        img && img.complete && img.naturalWidth > 0
          ? actx.createPattern(img, "repeat")
          : null;
      if (pat && img) {
        // World-aligned tiling: fill texel = world px mod PAINT_FILL_WORLD.
        pat.setTransform(
          new DOMMatrix()
            .translate(-(x0 % tile), -(y0 % tile))
            .scale(tile / img.naturalWidth),
        );
        actx.fillStyle = pat;
      } else {
        actx.fillStyle = paintCss(cat.rgb); // flat fallback until fills load
      }
      actx.fillRect(0, 0, w, h);
      actx.globalCompositeOperation = "destination-in";
      actx.drawImage(tb, 0, 0);
      actx.globalCompositeOperation = "source-over";
      vctx.drawImage(ta, x0, y0);
    }
  };

  /** Full preview rebuild — horizontal strips so a 5120×3840 mask doesn't
   * freeze the UI; each completed strip draws. */
  const repaintAllPaint = () => {
    const mc = paintCanvasRef.current;
    if (!mc) return;
    const gen = ++paintRepaintGenRef.current;
    const strip = 384;
    const step = (y: number) => {
      if (gen !== paintRepaintGenRef.current || paintCanvasRef.current !== mc) return;
      if (y >= mc.height) return;
      repaintRegion(0, y, mc.width, Math.min(strip, mc.height - y));
      scheduleDraw();
      setTimeout(() => step(y + strip), 0);
    };
    step(0);
  };

  /** Visible world rect (+ blend margin) for the detail pass, in world and
   * mask px. Null when the mask footprint is too big to reblend per-frame —
   * zoomed far out, where the mask-res base preview is sufficient. */
  const paintDetailRegion = () => {
    const r = stateRef.current.resp;
    const mc = paintCanvasRef.current;
    const host = hostRef.current;
    if (!r || !mc || !host) return null;
    const v = viewRef.current;
    const ts = r.map.tile_size || 32;
    const m = PAINT_REPAINT_MARGIN * PAINT_CELL;
    const wx0 = Math.max(0, -v.x / v.scale - m);
    const wy0 = Math.max(0, -v.y / v.scale - m);
    const wx1 = Math.min(r.map.cols * ts, (host.clientWidth - v.x) / v.scale + m);
    const wy1 = Math.min(r.map.rows * ts, (host.clientHeight - v.y) / v.scale + m);
    if (wx1 <= wx0 || wy1 <= wy0) return null;
    const mx0 = Math.floor(wx0 / PAINT_CELL);
    const my0 = Math.floor(wy0 / PAINT_CELL);
    const mx1 = Math.min(mc.width, Math.ceil(wx1 / PAINT_CELL));
    const my1 = Math.min(mc.height, Math.ceil(wy1 / PAINT_CELL));
    if ((mx1 - mx0) * (my1 - my0) > 6_000_000) return null;
    return { wx0, wy0, ww: wx1 - wx0, wh: wy1 - wy0, mx0, my0, mx1, my1 };
  };

  /** Rebuild the detail canvas for the current view: same per-category
   * indicator → blur → world-aligned fill composite as repaintRegion, but at
   * screen resolution so the fill's own texel density survives any zoom. */
  const renderPaintDetail = () => {
    const reg = paintDetailRegion();
    const mctx = paintCtxRef.current;
    const v = viewRef.current;
    if (!reg || !mctx) {
      paintDetailRef.current = null;
      paintDetailKeyRef.current = "none";
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const s = v.scale * dpr; // detail canvas px per world px
    const dw = Math.max(1, Math.round(reg.ww * s));
    const dh = Math.max(1, Math.round(reg.wh * s));
    const mw = reg.mx1 - reg.mx0;
    const mh = reg.my1 - reg.my0;
    const mask = mctx.getImageData(reg.mx0, reg.my0, mw, mh).data;
    if (!paintTmpARef.current) paintTmpARef.current = document.createElement("canvas");
    if (!paintTmpBRef.current) paintTmpBRef.current = document.createElement("canvas");
    if (!paintTmpCRef.current) paintTmpCRef.current = document.createElement("canvas");
    const ta = paintTmpARef.current;
    const tb = paintTmpBRef.current;
    const tc = paintTmpCRef.current;
    ta.width = tb.width = mw;
    ta.height = tb.height = mh;
    tc.width = dw;
    tc.height = dh;
    const actx = ta.getContext("2d");
    const bctx = tb.getContext("2d");
    const cctx = tc.getContext("2d");
    if (!actx || !bctx || !cctx) return;
    const inds = PAINT_CATEGORIES.map(() => new Uint8ClampedArray(mw * mh * 4));
    const used = new Array<boolean>(PAINT_CATEGORIES.length).fill(false);
    for (let p = 0; p < mw * mh; p++) {
      const o = p * 4;
      for (let ci = 0; ci < PAINT_CATEGORIES.length; ci++) {
        const c = PAINT_CATEGORIES[ci].rgb;
        if (mask[o] === c[0] && mask[o + 1] === c[1] && mask[o + 2] === c[2]) {
          inds[ci][o + 3] = 255;
          used[ci] = true;
          break;
        }
      }
    }
    const dc = document.createElement("canvas");
    dc.width = dw;
    dc.height = dh;
    const dctx = dc.getContext("2d");
    if (!dctx) return;
    const blur = PAINT_BLEND_WORLD / PAINT_CELL;
    for (let ci = 0; ci < PAINT_CATEGORIES.length; ci++) {
      if (!used[ci]) continue;
      const cat = PAINT_CATEGORIES[ci];
      actx.putImageData(new ImageData(inds[ci], mw, mh), 0, 0);
      bctx.clearRect(0, 0, mw, mh);
      bctx.filter = `blur(${blur}px)`;
      bctx.drawImage(ta, 0, 0);
      bctx.filter = "none";
      cctx.clearRect(0, 0, dw, dh);
      const img = fillImgsRef.current.get(cat.id);
      const pat =
        img && img.complete && img.naturalWidth > 0
          ? cctx.createPattern(img, "repeat")
          : null;
      if (pat && img) {
        // World-aligned at screen res: texel = world px mod PAINT_FILL_WORLD.
        pat.setTransform(
          new DOMMatrix()
            .translate(
              -(reg.wx0 % PAINT_FILL_WORLD) * s,
              -(reg.wy0 % PAINT_FILL_WORLD) * s,
            )
            .scale((PAINT_FILL_WORLD * s) / img.naturalWidth),
        );
        cctx.fillStyle = pat;
      } else {
        cctx.fillStyle = paintCss(cat.rgb);
      }
      cctx.fillRect(0, 0, dw, dh);
      cctx.globalCompositeOperation = "destination-in";
      // The blurred indicator is mask-res over [mx0,mx1) — stretch it to the
      // region's world rect in canvas px.
      cctx.drawImage(
        tb,
        (reg.mx0 * PAINT_CELL - reg.wx0) * s,
        (reg.my0 * PAINT_CELL - reg.wy0) * s,
        mw * PAINT_CELL * s,
        mh * PAINT_CELL * s,
      );
      cctx.globalCompositeOperation = "source-over";
      dctx.drawImage(tc, 0, 0);
    }
    paintDetailRef.current = {
      canvas: dc,
      x: reg.wx0,
      y: reg.wy0,
      w: reg.ww,
      h: reg.wh,
    };
    paintDetailKeyRef.current = `${reg.wx0}|${reg.wy0}|${reg.ww}|${reg.wh}|${v.scale}|${paintMaskVerRef.current}`;
    paintDetailAtRef.current = performance.now();
  };

  /** Rebuild the detail layer when the view or mask changed — throttled, so
   * during a pan the stale world-anchored canvas keeps drawing until the
   * trailing rebuild lands. */
  const maybeRepaintDetail = () => {
    const reg = paintDetailRegion();
    if (!reg) return;
    const v = viewRef.current;
    const key = `${reg.wx0}|${reg.wy0}|${reg.ww}|${reg.wh}|${v.scale}|${paintMaskVerRef.current}`;
    if (key === paintDetailKeyRef.current) return;
    if (performance.now() - paintDetailAtRef.current < PAINT_DETAIL_MIN_MS) {
      if (!paintDetailTimerRef.current) {
        paintDetailTimerRef.current = window.setTimeout(() => {
          paintDetailTimerRef.current = 0;
          renderPaintDetail();
          scheduleDraw();
        }, PAINT_DETAIL_MIN_MS);
      }
      return;
    }
    renderPaintDetail();
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = host.clientWidth;
    const ch = host.clientHeight;
    const bw = Math.max(1, Math.round(cw * dpr));
    const bh = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const {
      resp: r,
      items: its,
      sel: selected,
      toggles: tg,
      mode: m,
      stamps: sts,
      selStampId: selSt,
      selPoly: sp,
      featureById: fmap,
      armedId: armed,
      toolRot: tRot,
      toolScale: tScale,
      paintCat: pCat,
      brushSize: brushR,
    } = stateRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#1d1e24";
    ctx.fillRect(0, 0, cw, ch);
    if (!r) {
      ctx.fillStyle = "#8a8f9c";
      ctx.font = "13px sans-serif";
      ctx.fillText("No map loaded", 16, 28);
      return;
    }
    const ts = r.map.tile_size || 32;
    const worldW = r.map.cols * ts;
    const worldH = r.map.rows * ts;
    const v = viewRef.current;

    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.scale(v.scale, v.scale);
    ctx.imageSmoothingEnabled = false;

    const { terrain, collision } = rastersRef.current;
    if (terrain) ctx.drawImage(terrain, 0, 0);

    ctx.strokeStyle = "#6a6f7c";
    ctx.lineWidth = 2 / v.scale;
    ctx.strokeRect(0, 0, worldW, worldH);

    // Paint overlay: above terrain, under stamps. Draws the textured preview
    // (fill patterns blended like the bake); falls back to the raw category
    // mask while the preview is still building. Zoomed in, a screen-res
    // detail layer covers the viewport — the base is clipped out beneath it
    // so the 0.55 overlay alpha stays uniform.
    const paintImg = paintViewRef.current ?? paintCanvasRef.current;
    const paintDetail =
      v.scale >= PAINT_DETAIL_MIN_SCALE ? paintDetailRef.current : null;
    if (tg.paint && paintImg) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.imageSmoothingEnabled = true;
      if (paintDetail) {
        ctx.beginPath();
        ctx.rect(0, 0, worldW, worldH);
        ctx.rect(paintDetail.x, paintDetail.y, paintDetail.w, paintDetail.h);
        ctx.clip("evenodd");
      }
      ctx.drawImage(paintImg, 0, 0, worldW, worldH);
      ctx.restore();
      if (paintDetail) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(
          paintDetail.canvas,
          paintDetail.x,
          paintDetail.y,
          paintDetail.w,
          paintDetail.h,
        );
        ctx.restore();
      }
      if (v.scale >= PAINT_DETAIL_MIN_SCALE) maybeRepaintDetail();
    }

    // Feature stamps — under the tile-collision overlay, over the terrain.
    // Painter's algorithm: ascending y so lower features overlap higher ones.
    const sortedStamps = sts.slice().sort((a, b) => a.y - b.y);
    for (const s of sortedStamps) {
      const f = fmap.get(stampFeatureId(s));
      if (!f) continue;
      const img = featureImgsRef.current.get(f.id);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate((s.rotation || 0) * DEG);
      ctx.scale((s.flipX ? -1 : 1) * (s.scale || 1), s.scale || 1);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -f.w / 2, -f.h / 2);
      } else {
        ctx.fillStyle = "rgba(120,140,160,0.5)";
        ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
        ctx.strokeStyle = "rgba(160,180,200,0.8)";
        ctx.lineWidth = 1 / v.scale;
        ctx.strokeRect(-f.w / 2, -f.h / 2, f.w, f.h);
      }
      ctx.restore();
    }

    // Ghost preview of the armed feature under the cursor (stamp mode).
    if (m === "stamp" && armed && cursorRef.current) {
      const f = fmap.get(armed);
      if (f) {
        const g = cursorRef.current;
        const img = featureImgsRef.current.get(f.id);
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.translate(g.x, g.y);
        ctx.rotate((tRot || 0) * DEG);
        ctx.scale(tScale || 1, tScale || 1);
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, -f.w / 2, -f.h / 2);
        }
        ctx.globalAlpha = 1;
        ctx.setLineDash([4 / v.scale, 4 / v.scale]);
        ctx.strokeStyle = "#56ccf2";
        ctx.lineWidth = 1 / v.scale;
        ctx.strokeRect(-f.w / 2, -f.h / 2, f.w, f.h);
        ctx.restore();
      }
    }

    if (tg.collision && collision) ctx.drawImage(collision, 0, 0);

    const labelFor = (item: InspectItem): string | null => {
      const c = itemCenter(item);
      return c ? item.label : null;
    };
    const drawLabel = (item: InspectItem) => {
      const c = itemCenter(item);
      if (!c) return;
      ctx.font = `${11 / v.scale}px "Segoe UI", sans-serif`;
      ctx.lineWidth = 3 / v.scale;
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.fillStyle = "#fff";
      const text = labelFor(item) ?? "";
      ctx.strokeText(text, c.x + 6 / v.scale, c.y - 6 / v.scale);
      ctx.fillText(text, c.x + 6 / v.scale, c.y - 6 / v.scale);
    };

    if (tg.regions) {
      for (const item of its) {
        if (!isRegionKind(item.kind) || item.key === selected?.key) continue;
        drawItem(ctx, item, v.scale, false);
        if (item.kind !== "border" && v.scale >= 0.18) drawLabel(item);
      }
    }
    if (tg.objects) {
      for (const item of its) {
        if (isRegionKind(item.kind) || item.key === selected?.key) continue;
        drawItem(ctx, item, v.scale, false);
        if (v.scale >= 0.6) drawLabel(item);
      }
    }
    if (m === "inspect" && selected) {
      drawItem(ctx, selected, v.scale, true);
      drawLabel(selected);
    }

    // Selected stamp highlight + rotate handle.
    if ((m === "stamp" || m === "collision") && selSt) {
      const s = sts.find((x) => x.id === selSt);
      const f = s ? fmap.get(stampFeatureId(s)) : undefined;
      if (s && f) {
        const cs = stampCornersWorld(f, s);
        ctx.strokeStyle = "#56ccf2";
        ctx.lineWidth = 2 / v.scale;
        ctx.beginPath();
        ctx.moveTo(cs[0].x, cs[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(cs[i].x, cs[i].y);
        ctx.closePath();
        ctx.stroke();
        if (m === "stamp") {
          // Rotate handle sticking out of the top edge center.
          const mx = (cs[0].x + cs[1].x) / 2;
          const my = (cs[0].y + cs[1].y) / 2;
          let ux = mx - s.x;
          let uy = my - s.y;
          const len = Math.hypot(ux, uy) || 1;
          ux /= len;
          uy /= len;
          const hx = mx + ux * (28 / v.scale);
          const hy = my + uy * (28 / v.scale);
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(hx, hy, 5 / v.scale, 0, Math.PI * 2);
          ctx.fillStyle = "#56ccf2";
          ctx.fill();
        }
      }
    }

    // Paint mode: brush outline under the cursor (mask-px radius × 8 world px).
    if (m === "paint" && cursorRef.current) {
      const g = cursorRef.current;
      const cat = PAINT_CATEGORIES.find((c) => c.id === pCat) ?? PAINT_CATEGORIES[0];
      ctx.beginPath();
      ctx.arc(g.x, g.y, brushR * PAINT_CELL, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 / v.scale;
      ctx.strokeStyle = paintCss(cat.rgb);
      ctx.stroke();
      ctx.setLineDash([3 / v.scale, 3 / v.scale]);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Collision mode: world-space collision polys, vertex + midpoint handles.
    if (m === "collision") {
      for (const s of sortedStamps) {
        const polys = polysWorldFor(fmap, s);
        polys.forEach((poly, pi) => {
          if (poly.length < 2) return;
          const isSel = sp?.stamp === s.id && sp.poly === pi;
          ctx.beginPath();
          ctx.moveTo(poly[0].x, poly[0].y);
          for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
          ctx.closePath();
          ctx.fillStyle = isSel ? "rgba(255,150,70,0.35)" : "rgba(255,90,80,0.18)";
          ctx.fill();
          ctx.lineWidth = (isSel ? 2.5 : 1.5) / v.scale;
          ctx.strokeStyle = isSel ? "#ffd166" : "#ff7a6b";
          ctx.stroke();
          if (!isSel) return;
          ctx.fillStyle = "#ffffff";
          for (const p of poly) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4 / v.scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.fillStyle = "rgba(255,255,255,0.65)";
          for (let i = 0; i < poly.length; i++) {
            const q = poly[(i + 1) % poly.length];
            ctx.beginPath();
            ctx.arc(
              (poly[i].x + q.x) / 2,
              (poly[i].y + q.y) / 2,
              3 / v.scale,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        });
      }
    }
    ctx.restore();
  }, [drawItem]);

  const drawRef = useRef(draw);
  drawRef.current = draw;

  // Rasterize merged terrain whenever the map or the tileset sheets change.
  useEffect(() => {
    const r = resp;
    if (!r) {
      rastersRef.current = { terrain: null, collision: null };
      scheduleDraw();
      return;
    }
    const ts = r.map.tile_size || 32;
    const ground = r.map.terrain?.ground ?? [];
    const collision = r.map.terrain?.collision ?? [];
    rastersRef.current = {
      terrain:
        ground.length === r.map.cols * r.map.rows
          ? rasterizeGround(ground, r.map.cols, r.map.rows, ts, sheetsRef.current)
          : null,
      collision:
        collision.length === r.map.cols * r.map.rows
          ? rasterizeCollision(collision, r.map.cols, r.map.rows, ts)
          : null,
    };
    scheduleDraw();
  }, [resp, sheetsReady, scheduleDraw]);

  // Paint mask: allocate the offscreen canvas at mask resolution
  // (world_px/8) and pull the saved PNG once per map. A 404 just means "no
  // mask yet" — the canvas stays transparent.
  useEffect(() => {
    const r = resp;
    paintCanvasRef.current = null;
    paintCtxRef.current = null;
    paintViewRef.current = null;
    paintViewCtxRef.current = null;
    paintDetailRef.current = null;
    paintDetailKeyRef.current = "";
    paintRepaintGenRef.current++;
    if (!r || !mapId) {
      setPaintDirty(false);
      scheduleDraw();
      return;
    }
    const ts = r.map.tile_size || 32;
    const mw = Math.round((r.map.cols * ts) / PAINT_CELL);
    const mh = Math.round((r.map.rows * ts) / PAINT_CELL);
    const c = document.createElement("canvas");
    c.width = mw;
    c.height = mh;
    // willReadFrequently — repaintRegion getImageData's this ctx per stroke.
    const cctx = c.getContext("2d", { willReadFrequently: true });
    const vc = document.createElement("canvas");
    vc.width = mw;
    vc.height = mh;
    paintCanvasRef.current = c;
    paintCtxRef.current = cctx;
    paintViewRef.current = vc;
    paintViewCtxRef.current = vc.getContext("2d");
    setPaintDirty(false);
    let live = true;
    fetch(`/editor-api/paint?map=${encodeURIComponent(mapId)}`)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => (blob ? createImageBitmap(blob) : null))
      .then((bmp) => {
        if (!live || !bmp) return;
        cctx?.drawImage(bmp, 0, 0, mw, mh);
        bmp.close();
        repaintAllPaint();
        scheduleDraw();
      })
      .catch(() => {
        /* dev server without middleware — mask stays empty */
      });
    return () => {
      live = false;
    };
  }, [resp, mapId, reloadTick, scheduleDraw]);

  // Seamless fill textures for the paint preview (assets/terrain-fills/, the
  // same PNGs bake_terrain.py blends). Flat colors stand in until each loads.
  useEffect(() => {
    let live = true;
    for (const cat of PAINT_CATEGORIES) {
      if (fillImgsRef.current.has(cat.id)) continue;
      const img = new Image();
      img.onload = () => {
        if (live) repaintAllPaint();
      };
      img.src = `/assets/terrain-fills/${cat.id}.png`;
      fillImgsRef.current.set(cat.id, img);
    }
    return () => {
      live = false;
      clearTimeout(paintDetailTimerRef.current);
      paintDetailTimerRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load Pipoya sheets once.
  useEffect(() => {
    let live = true;
    loadPipoyaSheets()
      .then((s) => {
        if (!live) return;
        sheetsRef.current = s;
        setSheetsReady(true);
      })
      .catch(() => setSheetsReady(true)); // flat-color fallback
    return () => {
      live = false;
    };
  }, []);

  // Map list.
  useEffect(() => {
    let live = true;
    listMaps()
      .then((m) => {
        if (live) setMaps(m);
      })
      .catch(() => {
        /* dev server without middleware — list stays empty */
      });
    return () => {
      live = false;
    };
  }, []);

  // Pick the first map once the list arrives.
  useEffect(() => {
    if (!mapId && maps.length) setMapId(maps[0].id);
  }, [maps, mapId]);

  // Map document.
  useEffect(() => {
    if (!mapId) return;
    let live = true;
    setErr(null);
    setStatus("Loading…");
    loadMap(mapId)
      .then((r) => {
        if (!live) return;
        setResp(r);
        setSelKey(null);
        setStatus("");
        // fit after raster effect has run — view fit only needs dims
        requestAnimationFrame(() => fitView());
      })
      .catch((e) => {
        if (!live) return;
        setResp(null);
        setErr(String(e));
        setStatus("");
      });
    return () => {
      live = false;
    };
  }, [mapId, reloadTick, fitView]);

  // Feature catalog — static publicDir asset.
  useEffect(() => {
    let live = true;
    fetch("/assets/map-features/catalog.json")
      .then((r) => {
        if (!r.ok) throw new Error(`catalog: ${r.status}`);
        return r.json();
      })
      .then((body: { features?: FeatureDef[] }) => {
        if (live) setFeatures(body.features ?? []);
      })
      .catch((e) => {
        if (live) setFeatureErr(String(e instanceof Error ? e.message : e));
      });
    return () => {
      live = false;
    };
  }, []);

  // Decode feature images for canvas drawing + alpha extraction.
  useEffect(() => {
    for (const f of features) {
      if (featureImgsRef.current.has(f.id)) continue;
      const img = new Image();
      img.onload = () => {
        setImgTick((t) => t + 1);
        scheduleDraw();
      };
      img.src = f.image;
      featureImgsRef.current.set(f.id, img);
    }
  }, [features, scheduleDraw]);

  // Stamps for the current map.
  useEffect(() => {
    if (!mapId) {
      setStamps([]);
      return;
    }
    let live = true;
    listStamps(mapId)
      .then((doc) => {
        if (!live) return;
        const arr = Array.isArray(doc)
          ? (doc as unknown as StampPlacement[])
          : (doc?.stamps ?? []);
        setStamps(arr.map((s, i) => (s.id ? s : { ...s, id: `st_${i}` })));
        setStampsDirty(false);
        setSelStampId(null);
        setSelPoly(null);
        scheduleDraw();
      })
      .catch(() => {
        if (!live) return;
        setStamps([]);
        setStampsDirty(false);
      });
    return () => {
      live = false;
    };
  }, [mapId, reloadTick, scheduleDraw]);

  // Bake status: one fetch on map change / stamp save / manual kick, then a
  // 2s poll loop while a bake job is running server-side.
  useEffect(() => {
    if (!mapId) {
      bakeStatusRef.current = "idle";
      setBake({ status: "idle", stale: false });
      return;
    }
    let live = true;
    let timer = 0;
    const poll = () => {
      fetch(`/editor-api/bake/status?map=${encodeURIComponent(mapId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { status?: string; detail?: string; stale?: boolean } | null) => {
          if (!live || !b) return;
          const st: BakeStatus =
            b.status === "running" || b.status === "ok" || b.status === "error"
              ? b.status
              : "idle";
          const wasRunning = bakeStatusRef.current === "running";
          bakeStatusRef.current = st;
          setBake({ status: st, detail: b.detail, stale: !!b.stale });
          if (wasRunning && st === "ok") {
            // Brief "Baked ✓", then settle back to idle.
            setBakeFlash(true);
            window.setTimeout(() => {
              setBakeFlash(false);
              setBake((cur) => (cur.status === "ok" ? { ...cur, status: "idle" } : cur));
            }, 3000);
          }
          // A save landed while the job ran — its inputs postdate that run,
          // so queue a follow-up bake (incremental: only touched chunks).
          if (wasRunning && st !== "running" && rebakePendingRef.current) {
            rebakePendingRef.current = false;
            startBake();
          }
          if (live && st === "running") timer = window.setTimeout(poll, 2000);
        })
        .catch(() => {});
    };
    poll();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [mapId, stampsDirty, reloadTick, bakeTick]);

  // Keep the toolbar rot/scale inputs in sync with the selected stamp.
  useEffect(() => {
    const s = stamps.find((x) => x.id === selStampId);
    if (s) {
      setToolRot(Math.round((s.rotation || 0) * 100) / 100);
      setToolScale(s.scale || 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selStampId]);

  // Delete / Escape shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      const st = stateRef.current;
      if (e.key === "Escape") {
        setArmedId(null);
        setSelPoly(null);
        setSelStampId(null);
        setSelKey(null);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (st.mode === "stamp" && st.selStampId) {
        const id = st.selStampId;
        setStamps((prev) => prev.filter((s) => s.id !== id));
        setStampsDirty(true);
        setSelStampId(null);
        scheduleDraw();
      } else if (st.mode === "collision" && st.selPoly) {
        const { stamp, poly } = st.selPoly;
        setStamps((prev) =>
          prev.map((s) => {
            if (s.id !== stamp) return s;
            const polys = localPolysOf(st.featureById, s);
            if (poly >= 0 && poly < polys.length) polys.splice(poly, 1);
            return { ...s, collision: polys };
          }),
        );
        setStampsDirty(true);
        setSelPoly(null);
        scheduleDraw();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scheduleDraw]);

  // Resize → redraw.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => scheduleDraw());
    ro.observe(host);
    scheduleDraw();
    return () => ro.disconnect();
  }, [scheduleDraw]);

  // Redraw on state changes.
  useEffect(() => {
    scheduleDraw();
  }, [
    resp,
    selKey,
    toggles,
    stamps,
    selStampId,
    selPoly,
    mode,
    armedId,
    features,
    scheduleDraw,
  ]);

  // Wheel zoom needs a non-passive listener to preventDefault.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = Math.pow(1.0015, -e.deltaY);
      const st = stateRef.current;
      // Wheel on the selected stamp scales it instead of zooming.
      if ((st.mode === "stamp" || st.mode === "collision") && st.selStampId) {
        const s = st.stamps.find((x) => x.id === st.selStampId);
        const f = s ? st.featureById.get(stampFeatureId(s)) : undefined;
        if (s && f) {
          const v = viewRef.current;
          const wx = (mx - v.x) / v.scale;
          const wy = (my - v.y) / v.scale;
          if (stampHit(f, s, wx, wy, 0)) {
            const ns = Math.min(10, Math.max(0.05, (s.scale || 1) * factor));
            const rounded = Math.round(ns * 1000) / 1000;
            setStamps((prev) =>
              prev.map((x) => (x.id === s.id ? { ...x, scale: rounded } : x)),
            );
            setStampsDirty(true);
            setToolScale(rounded);
            scheduleDraw();
            return;
          }
        }
      }
      zoomAt(mx, my, factor);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const toWorld = (e: { clientX: number; clientY: number }): StampVec => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (e.clientX - rect.left - v.x) / v.scale,
      y: (e.clientY - rect.top - v.y) / v.scale,
    };
  };

  const hitTest = useCallback(
    (wx: number, wy: number): InspectItem | null => {
      const { items: its, toggles: tg } = stateRef.current;
      const hitR = Math.max(10 / viewRef.current.scale, 4);
      const visible = (item: InspectItem) =>
        isRegionKind(item.kind) ? tg.regions : tg.objects;
      // Point markers first — big region rects/polygons would otherwise
      // swallow clicks on objects inside them.
      for (const wantPoint of [true, false]) {
        for (let i = its.length - 1; i >= 0; i--) {
          const item = its[i];
          if (!!item.geom.point !== wantPoint || !visible(item)) continue;
          if (itemContains(item, wx, wy, hitR)) return item;
        }
      }
      return null;
    },
    [],
  );

  // --- stamp hit tests / mutations ------------------------------------------

  /** Topmost-first stamp hit test: distance to center vs scaled half-extent. */
  const hitStamp = (wx: number, wy: number): StampPlacement | null => {
    const { stamps: sts, featureById: fmap } = stateRef.current;
    const slack = 4 / viewRef.current.scale;
    const sorted = sts.slice().sort((a, b) => b.y - a.y);
    for (const s of sorted) {
      const f = fmap.get(stampFeatureId(s));
      if (f && stampHit(f, s, wx, wy, slack)) return s;
    }
    return null;
  };

  /** World position of the selected stamp's rotate handle (top edge center,
   * pushed 28 screen px outward). */
  const rotateHandlePos = (f: FeatureDef, s: StampPlacement): StampVec => {
    const cs = stampCornersWorld(f, s);
    const mx = (cs[0].x + cs[1].x) / 2;
    const my = (cs[0].y + cs[1].y) / 2;
    let ux = mx - s.x;
    let uy = my - s.y;
    const len = Math.hypot(ux, uy) || 1;
    ux /= len;
    uy /= len;
    const d = 28 / viewRef.current.scale;
    return { x: mx + ux * d, y: my + uy * d };
  };

  /** Vertex/midpoint handle hit on the currently selected collision poly. */
  const hitPolyHandle = (
    wx: number,
    wy: number,
  ): { kind: "vert" | "mid"; vert: number } | null => {
    const st = stateRef.current;
    const sp = st.selPoly;
    if (!sp) return null;
    const s = st.stamps.find((x) => x.id === sp.stamp);
    if (!s) return null;
    const poly = polysWorldFor(st.featureById, s)[sp.poly];
    if (!poly) return null;
    const tol = 8 / viewRef.current.scale;
    for (let i = 0; i < poly.length; i++) {
      if (Math.hypot(poly[i].x - wx, poly[i].y - wy) <= tol) return { kind: "vert", vert: i };
    }
    const midTol = 6 / viewRef.current.scale;
    for (let i = 0; i < poly.length; i++) {
      const q = poly[(i + 1) % poly.length];
      if (Math.hypot((poly[i].x + q.x) / 2 - wx, (poly[i].y + q.y) / 2 - wy) <= midTol) {
        return { kind: "mid", vert: i };
      }
    }
    return null;
  };

  /** Topmost-first collision-poly hit test (world coords). */
  const hitPoly = (wx: number, wy: number): { stamp: string; poly: number } | null => {
    const { stamps: sts, featureById: fmap } = stateRef.current;
    const sorted = sts.slice().sort((a, b) => b.y - a.y);
    for (const s of sorted) {
      const polys = polysWorldFor(fmap, s);
      for (let pi = polys.length - 1; pi >= 0; pi--) {
        if (pointInPolygon(wx, wy, polys[pi])) return { stamp: s.id, poly: pi };
      }
    }
    return null;
  };

  const mutateStamp = (id: string, fn: (s: StampPlacement) => StampPlacement) => {
    setStamps((prev) => prev.map((s) => (s.id === id ? fn(s) : s)));
    setStampsDirty(true);
  };

  /** Rewrite a stamp's collision polys in feature-local coords. `fn` receives
   * a deep copy of the effective polys (instance override, else catalog). */
  const setStampPolys = (id: string, fn: (polys: StampVec[][]) => StampVec[][]) =>
    mutateStamp(id, (s) => ({
      ...s,
      collision: fn(
        localPolysOf(stateRef.current.featureById, s),
      ) as StampPlacement["collision"],
    }));

  // --- pointer handling ------------------------------------------------------

  /** One hard-edged brush dab at a world point. World px → mask px via
   * /PAINT_CELL; the fill is the exact category rgb (alpha 255). */
  const paintAt = (wx: number, wy: number) => {
    const pctx = paintCtxRef.current;
    if (!pctx) return;
    const st = stateRef.current;
    const cat = PAINT_CATEGORIES.find((c) => c.id === st.paintCat) ?? PAINT_CATEGORIES[0];
    pctx.fillStyle = paintCss(cat.rgb);
    const bx = wx / PAINT_CELL;
    const by = wy / PAINT_CELL;
    pctx.beginPath();
    pctx.arc(bx, by, st.brushSize, 0, Math.PI * 2);
    pctx.fill();
    repaintRegion(
      bx - st.brushSize,
      by - st.brushSize,
      st.brushSize * 2,
      st.brushSize * 2,
    );
  };

  /** Round-capped stroke between two world points so a fast drag doesn't
   * leave gaps — same exact category color as paintAt. */
  const paintLine = (x0: number, y0: number, x1: number, y1: number) => {
    const pctx = paintCtxRef.current;
    if (!pctx) return;
    const st = stateRef.current;
    const cat = PAINT_CATEGORIES.find((c) => c.id === st.paintCat) ?? PAINT_CATEGORIES[0];
    pctx.strokeStyle = paintCss(cat.rgb);
    pctx.lineWidth = st.brushSize * 2;
    pctx.lineCap = "round";
    pctx.lineJoin = "round";
    const ax = x0 / PAINT_CELL;
    const ay = y0 / PAINT_CELL;
    const bx = x1 / PAINT_CELL;
    const by = y1 / PAINT_CELL;
    pctx.beginPath();
    pctx.moveTo(ax, ay);
    pctx.lineTo(bx, by);
    pctx.stroke();
    const r = st.brushSize;
    repaintRegion(
      Math.min(ax, bx) - r,
      Math.min(ay, by) - r,
      Math.abs(ax - bx) + r * 2,
      Math.abs(ay - by) + r * 2,
    );
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const v = viewRef.current;
    const w = toWorld(e);
    const m = stateRef.current.mode;

    if (m === "paint") {
      // Non-primary buttons still pan so the map stays navigable.
      if (e.button !== 0) {
        dragRef.current = {
          kind: "pan",
          x: e.clientX,
          y: e.clientY,
          ox: v.x,
          oy: v.y,
          moved: false,
        };
        return;
      }
      paintAt(w.x, w.y);
      setPaintDirty(true);
      scheduleDraw();
      dragRef.current = { kind: "paint", lastX: w.x, lastY: w.y, moved: false };
      return;
    }

    if (m === "stamp") {
      const hit = hitStamp(w.x, w.y);
      if (hit) {
        setSelStampId(hit.id);
        setSelKey(null);
        setSelPoly(null);
        const f = stateRef.current.featureById.get(stampFeatureId(hit));
        const hp = f && hit.id === selStampId ? rotateHandlePos(f, hit) : null;
        const onHandle = !!hp && Math.hypot(hp.x - w.x, hp.y - w.y) <= 9 / v.scale;
        if (e.altKey || onHandle) {
          // Angle-delta rotate around the stamp center.
          dragRef.current = {
            kind: "rotate",
            id: hit.id,
            cx: hit.x,
            cy: hit.y,
            a0: Math.atan2(w.y - hit.y, w.x - hit.x),
            r0: hit.rotation || 0,
            moved: false,
          };
        } else {
          dragRef.current = {
            kind: "move",
            id: hit.id,
            wx0: w.x,
            wy0: w.y,
            ox: hit.x,
            oy: hit.y,
            moved: false,
          };
        }
        return;
      }
      dragRef.current = {
        kind: "pan",
        x: e.clientX,
        y: e.clientY,
        ox: v.x,
        oy: v.y,
        moved: false,
      };
      return;
    }

    if (m === "collision") {
      const h = hitPolyHandle(w.x, w.y);
      const sp = stateRef.current.selPoly;
      if (h && sp) {
        if (h.kind === "mid") {
          // Insert a vertex at this edge midpoint and start dragging it. The
          // stamp transform is affine, so the world midpoint maps to the local
          // edge midpoint.
          setStampPolys(sp.stamp, (polys) => {
            const next = polys.map((p) => p.slice());
            const poly = next[sp.poly];
            if (poly && poly.length >= 2 && h.vert < poly.length) {
              const a = poly[h.vert];
              const b = poly[(h.vert + 1) % poly.length];
              poly.splice(h.vert + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            }
            return next;
          });
          dragRef.current = {
            kind: "vert",
            id: sp.stamp,
            poly: sp.poly,
            vert: h.vert + 1,
            moved: false,
          };
        } else {
          dragRef.current = {
            kind: "vert",
            id: sp.stamp,
            poly: sp.poly,
            vert: h.vert,
            moved: false,
          };
        }
        return;
      }
      const ph = hitPoly(w.x, w.y);
      if (ph) {
        setSelPoly(ph);
        setSelStampId(ph.stamp);
        setSelKey(null);
      }
      dragRef.current = {
        kind: "pan",
        x: e.clientX,
        y: e.clientY,
        ox: v.x,
        oy: v.y,
        moved: false,
      };
      return;
    }

    dragRef.current = {
      kind: "pan",
      x: e.clientX,
      y: e.clientY,
      ox: v.x,
      oy: v.y,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const w = toWorld(e);
    cursorRef.current = w;
    const d = dragRef.current;
    if (!d) {
      const mm = stateRef.current.mode;
      // Repaint the stamp ghost / paint brush outline under the cursor.
      if ((mm === "stamp" && stateRef.current.armedId) || mm === "paint") scheduleDraw();
      return;
    }
    switch (d.kind) {
      case "paint": {
        paintLine(d.lastX, d.lastY, w.x, w.y);
        d.lastX = w.x;
        d.lastY = w.y;
        d.moved = true;
        setPaintDirty(true);
        scheduleDraw();
        return;
      }
      case "pan": {
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        viewRef.current.x = d.ox + dx;
        viewRef.current.y = d.oy + dy;
        scheduleDraw();
        return;
      }
      case "move": {
        if (!d.moved) {
          d.moved = true;
          setStampsDirty(true);
        }
        const nx = Math.round((d.ox + (w.x - d.wx0)) * 100) / 100;
        const ny = Math.round((d.oy + (w.y - d.wy0)) * 100) / 100;
        setStamps((prev) => prev.map((s) => (s.id === d.id ? { ...s, x: nx, y: ny } : s)));
        scheduleDraw();
        return;
      }
      case "rotate": {
        if (!d.moved) {
          d.moved = true;
          setStampsDirty(true);
        }
        let deg = d.r0 + (Math.atan2(w.y - d.cy, w.x - d.cx) - d.a0) / DEG;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        deg = ((deg % 360) + 360) % 360;
        setStamps((prev) => prev.map((s) => (s.id === d.id ? { ...s, rotation: deg } : s)));
        if (stateRef.current.selStampId === d.id) setToolRot(deg);
        scheduleDraw();
        return;
      }
      case "vert": {
        if (!d.moved) {
          d.moved = true;
          setStampsDirty(true);
        }
        const st = stateRef.current;
        const s = st.stamps.find((x) => x.id === d.id);
        const f = s ? st.featureById.get(stampFeatureId(s)) : undefined;
        if (!s || !f) return;
        const lp = stampWorldToLocal(f, s, w.x, w.y);
        const fmap = st.featureById;
        setStamps((prev) =>
          prev.map((cur) => {
            if (cur.id !== d.id) return cur;
            const polys = localPolysOf(fmap, cur);
            const poly = polys[d.poly];
            if (!poly || d.vert >= poly.length) return cur;
            poly[d.vert] = { x: lp.x, y: lp.y };
            return { ...cur, collision: polys };
          }),
        );
        scheduleDraw();
        return;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return;
    const m = stateRef.current.mode;
    const w = toWorld(e);
    if (m === "stamp") {
      const hit = hitStamp(w.x, w.y);
      if (hit) {
        setSelStampId(hit.id);
        return;
      }
      const armed = stateRef.current.armedId;
      if (armed && stateRef.current.featureById.has(armed)) {
        const st = {
          id: newStampId(),
          feature: armed,
          x: Math.round(w.x * 100) / 100,
          y: Math.round(w.y * 100) / 100,
          rotation: stateRef.current.toolRot,
          flipX: false,
          scale: stateRef.current.toolScale || 1,
        } as unknown as StampPlacement;
        setStamps((prev) => [...prev, st]);
        setStampsDirty(true);
        setSelStampId(st.id);
        scheduleDraw();
      } else {
        setSelStampId(null);
      }
      return;
    }
    if (m === "collision") {
      // A vertex/midpoint click already has its poly selected — re-hit-testing
      // a boundary point is unstable, so keep the selection.
      if (d.kind === "vert") return;
      const ph = hitPoly(w.x, w.y);
      setSelPoly(ph);
      if (ph) {
        setSelStampId(ph.stamp);
        setSelKey(null);
      }
      return;
    }
    if (m === "paint") return; // the dab already landed on pointerdown/drag
    // inspect
    if (!resp) return;
    const item = hitTest(w.x, w.y);
    setSelKey(item?.key ?? null);
  };

  const onPointerLeave = () => {
    cursorRef.current = null;
    if (stateRef.current.armedId || stateRef.current.mode === "paint") scheduleDraw();
  };

  // --- stamp actions ----------------------------------------------------------

  const switchMode = (m: MapMode) => {
    setMode(m);
    setSelKey(null);
    setSelPoly(null);
    scheduleDraw();
  };

  const saveStampsNow = () => {
    if (!mapId || stampsSaving) return;
    setStampsSaving(true);
    saveStamps(mapId, { stamps })
      .then(() => {
        setStampsDirty(false);
        queueBake();
      })
      .catch((e) => setStatus(`Save failed: ${e instanceof Error ? e.message : e}`))
      .finally(() => setStampsSaving(false));
  };

  /** Encode the mask canvas as PNG and POST the raw bytes — the server
   * validates the magic bytes + IHDR dims and writes <id>.paint.png. */
  const savePaintNow = () => {
    const pc = paintCanvasRef.current;
    if (!mapId || !pc || paintSaving) return;
    setPaintSaving(true);
    pc.toBlob((blob) => {
      if (!blob) {
        setPaintSaving(false);
        setStatus("Save failed: could not encode PNG");
        return;
      }
      fetch(`/editor-api/paint/save?map=${encodeURIComponent(mapId)}`, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: blob,
      })
        .then(async (r) => {
          if (!r.ok) {
            const body = (await r.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? `save paint: ${r.status}`);
          }
          setPaintDirty(false);
          setStatus("");
          // Painting invalidates the bake — rebake now (incremental) so the
          // chunks are fresh before the next play session.
          queueBake();
        })
        .catch((e) => setStatus(`Save failed: ${e instanceof Error ? e.message : e}`))
        .finally(() => setPaintSaving(false));
    }, "image/png");
  };

  /** Kick off a server-side terrain bake and start the status poll loop. */
  const startBake = () => {
    if (!mapId || bakeStatusRef.current === "running") return;
    bakeStatusRef.current = "running"; // optimistic — the poll confirms
    setBake((b) => ({ ...b, status: "running" }));
    fetch("/editor-api/bake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ map: mapId }),
    })
      .then((r) => r.json())
      .then((b: { ok?: boolean; status?: string; error?: string }) => {
        if (b.status === "running" || b.status === "busy") {
          setBakeTick((t) => t + 1); // re-enter the poll effect → 2s loop
        } else {
          bakeStatusRef.current = "error";
          setBake((cur) => ({
            ...cur,
            status: "error",
            detail: b.error ?? "bake request failed",
          }));
        }
      })
      .catch((e) => {
        bakeStatusRef.current = "error";
        setBake((cur) => ({ ...cur, status: "error", detail: String(e) }));
      });
  };

  /** Bake after a save — kicks the job now, or queues a follow-up when one is
   * already running (it may have read pre-save bytes). Incremental baking
   * makes a small edit cheap: only chunks whose inputs changed re-render. */
  const queueBake = () => {
    if (bakeStatusRef.current === "running") {
      rebakePendingRef.current = true;
    } else {
      startBake();
    }
  };

  const panToStamp = (s: StampPlacement) => {
    const host = hostRef.current;
    if (!host) return;
    const v = viewRef.current;
    v.x = host.clientWidth / 2 - s.x * v.scale;
    v.y = host.clientHeight / 2 - s.y * v.scale;
    scheduleDraw();
  };

  const editSelStamp = (patch: Partial<StampPlacement>) => {
    if (!selStampId) return;
    mutateStamp(selStampId, (s) => ({ ...s, ...patch }));
    scheduleDraw();
  };

  const deleteSelStamp = () => {
    if (!selStampId) return;
    setStamps((prev) => prev.filter((s) => s.id !== selStampId));
    setStampsDirty(true);
    setSelStampId(null);
    setSelPoly(null);
    scheduleDraw();
  };

  /** Re-trace the feature image's alpha boundary and replace the selected
   * poly (or the whole collision set when no poly is selected). */
  const extractFromArt = () => {
    const st = stateRef.current;
    const sid = st.selPoly?.stamp ?? st.selStampId;
    const s = st.stamps.find((x) => x.id === sid);
    const f = s ? st.featureById.get(stampFeatureId(s)) : undefined;
    const img = f ? featureImgsRef.current.get(f.id) : undefined;
    if (!s || !f || !img || !img.complete || !img.naturalWidth) {
      setStatus("Extract: feature image not loaded");
      return;
    }
    const traced = extractAlphaPolys(img, f.w, f.h);
    if (!traced.length) {
      setStatus("Extract: no opaque pixels found");
      return;
    }
    const sp = st.selPoly;
    setStampPolys(s.id, (cur) => {
      if (sp && sp.stamp === s.id && sp.poly < cur.length) {
        const next = cur.slice();
        next.splice(sp.poly, 1, ...traced);
        return next;
      }
      return traced;
    });
    setSelPoly(null);
    setStatus("");
    scheduleDraw();
  };

  const deleteSelPoly = () => {
    const sp = stateRef.current.selPoly;
    if (!sp) return;
    setStampPolys(sp.stamp, (polys) => {
      const next = polys.slice();
      if (sp.poly >= 0 && sp.poly < next.length) next.splice(sp.poly, 1);
      return next;
    });
    setSelPoly(null);
    scheduleDraw();
  };

  const addRectPoly = () => {
    const st = stateRef.current;
    const s = st.stamps.find((x) => x.id === st.selStampId);
    const f = s ? st.featureById.get(stampFeatureId(s)) : undefined;
    if (!s || !f) return;
    const idx = localPolysOf(st.featureById, s).length;
    setStampPolys(s.id, (polys) => [
      ...polys,
      [
        { x: 0, y: 0 },
        { x: f.w, y: 0 },
        { x: f.w, y: f.h },
        { x: 0, y: f.h },
      ],
    ]);
    setSelPoly({ stamp: s.id, poly: idx });
    scheduleDraw();
  };

  const switchMap = (id: string) => {
    if (id === mapId) return;
    setMapId(id);
    history.replaceState(null, "", `?map=${encodeURIComponent(id)}`);
  };

  const reload = () => setReloadTick((t) => t + 1);

  const toggle = (k: keyof LayerToggles) =>
    setToggles((t) => ({ ...t, [k]: !t[k] }));

  const filteredMaps = maps.filter((m) =>
    m.id.toLowerCase().includes(mapSearch.toLowerCase()),
  );
  const filteredItems = items.filter(
    (i) =>
      !itemSearch ||
      i.label.toLowerCase().includes(itemSearch.toLowerCase()) ||
      i.kind.toLowerCase().includes(itemSearch.toLowerCase()),
  );
  const groups = groupItems(filteredItems);
  const inspectTree = useMemo(() => buildInspectTree(items), [items]);

  // Selecting an item (list or map click) expands its ancestor regions so
  // the row is actually visible inside the tree.
  useEffect(() => {
    if (!selKey) return;
    setExpanded((prev) => {
      const anc = treeAncestors(inspectTree, selKey);
      if (!anc.length || anc.every((k) => prev.has(k))) return prev;
      const next = new Set(prev);
      for (const k of anc) next.add(k);
      return next;
    });
  }, [selKey, inspectTree]);

  const patchedTiles = resp?.override?.layers
    ? Object.values(resp.override.layers).reduce((n, p) => n + Object.keys(p).length, 0)
    : 0;

  const map = resp?.map ?? null;
  const maskW = map ? Math.round((map.cols * (map.tile_size || 32)) / PAINT_CELL) : 0;
  const maskH = map ? Math.round((map.rows * (map.tile_size || 32)) / PAINT_CELL) : 0;

  const itemRow = (item: InspectItem, depth = 0) => (
    <div
      key={item.key}
      className={`item ${selKey === item.key ? "sel" : ""}`}
      style={depth ? { paddingLeft: depth * 14 + 18 } : undefined}
      onClick={() => {
        setSelKey(item.key);
        panToItem(item);
      }}
    >
      <span className="ed-map-swatch" style={{ background: colorFor(item.kind) }} />
      {item.label}
      <span className="dim">{item.kind}</span>
    </div>
  );

  const regionNode = (node: InspectNode, depth: number): ReactNode => {
    const open = expanded.has(node.item.key);
    const count = nodeItemCount(node);
    return (
      <div key={node.item.key}>
        <div
          className={`item ${selKey === node.item.key ? "sel" : ""}`}
          style={depth ? { paddingLeft: depth * 14 } : undefined}
          onClick={() => {
            setSelKey(node.item.key);
            panToItem(node.item);
          }}
        >
          <button
            className="ed-map-chev"
            aria-label={open ? "Collapse region" : "Expand region"}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(node.item.key)) next.delete(node.item.key);
                else next.add(node.item.key);
                return next;
              });
            }}
          >
            {open ? "▾" : "▸"}
          </button>
          <span className="ed-map-swatch" style={{ background: colorFor(node.item.kind) }} />
          {node.item.label}
          <span className="dim">{node.item.kind}</span>
          {count > 0 && <span className="ed-map-count">{count}</span>}
        </div>
        {open && (
          <>
            {node.children.map((c) => regionNode(c, depth + 1))}
            {node.npcs.map((i) => itemRow(i, depth + 1))}
            {node.pois.map((i) => itemRow(i, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="ed-map-root">
      <div className="ed-toolbar">
        <span className="ed-toolbar-label">Map</span>
        <select value={mapId} onChange={(e) => switchMap(e.target.value)} aria-label="Map">
          {mapId && !maps.some((m) => m.id === mapId) && (
            <option value={mapId}>{mapId}</option>
          )}
          {filteredMaps.length === 0 && !mapId && <option value="">—</option>}
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
              {m.hasOverride ? " ●" : ""}
            </option>
          ))}
        </select>
        <button onClick={reload} disabled={!mapId}>
          Reload
        </button>
        <span className="ed-map-divider" />
        <div className="ed-map-modes" role="tablist" aria-label="Edit mode">
          {(
            [
              ["inspect", "Inspect"],
              ["stamp", "Stamp"],
              ["collision", "Collision"],
              ["paint", "Paint"],
            ] as [MapMode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? "active" : ""}
              onClick={() => switchMode(m)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ed-map-divider" />
        <button
          onClick={startBake}
          disabled={!mapId || bake.status === "running"}
          title={bake.detail ?? "Bake terrain + ground stamps into chunk PNGs"}
        >
          {bake.status === "running" ? "Baking…" : bakeFlash ? "Baked ✓" : "Bake"}
        </button>
        {bake.status === "error" && (
          <span className="ed-map-bake-err" title={bake.detail ?? "bake failed"}>
            failed
          </span>
        )}
        {bake.stale && bake.status !== "running" && (
          <span
            className="ed-map-bake-stale"
            title="Map terrain or stamps changed since the last bake — rebake to refresh chunks"
          >
            Stale
          </span>
        )}
        {mode === "stamp" && (
          <>
            <label className="ed-map-toggle" title="Rotation (deg) — applies to new and selected stamps">
              rot
              <input
                type="number"
                step={5}
                value={Math.round(toolRot * 100) / 100}
                onChange={(e) => {
                  const v = Number.isFinite(e.target.valueAsNumber)
                    ? e.target.valueAsNumber
                    : 0;
                  setToolRot(v);
                  if (selStampId) editSelStamp({ rotation: ((v % 360) + 360) % 360 });
                }}
                style={{ width: 58 }}
              />
            </label>
            <label className="ed-map-toggle" title="Uniform scale — applies to new and selected stamps">
              ×
              <input
                type="number"
                step={0.1}
                min={0.05}
                value={toolScale}
                onChange={(e) => {
                  const v = Number.isFinite(e.target.valueAsNumber)
                    ? e.target.valueAsNumber
                    : 1;
                  setToolScale(v);
                  if (selStampId && v > 0) editSelStamp({ scale: v });
                }}
                style={{ width: 58 }}
              />
            </label>
          </>
        )}
        {mode === "paint" && (
          <>
            <div className="ed-map-modes" role="radiogroup" aria-label="Paint category">
              {PAINT_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={paintCat === c.id}
                  className={`ed-map-paint-cat ${paintCat === c.id ? "active" : ""}`}
                  title={`Paint ${c.label} (${paintCss(c.rgb)})`}
                  onClick={() => setPaintCat(c.id)}
                >
                  <span className="ed-map-swatch" style={{ background: paintCss(c.rgb) }} />
                  {c.label}
                </button>
              ))}
            </div>
            <label
              className="ed-map-toggle"
              title="Brush radius in mask px (1 mask px = 8 world px)"
            >
              brush
              <input
                type="range"
                min={2}
                max={64}
                step={1}
                value={brushSize}
                onChange={(e) => setBrushSize(e.target.valueAsNumber || 2)}
                style={{ width: 90 }}
              />
              {brushSize}
            </label>
            <button
              className="primary"
              onClick={savePaintNow}
              disabled={!mapId || !paintDirty || paintSaving}
            >
              {paintSaving ? "Saving…" : "Save paint"}
            </button>
            {paintDirty && (
              <span className="dirty" title="Unsaved paint changes">
                ●
              </span>
            )}
          </>
        )}
        {(mode === "stamp" || mode === "collision") && (
          <>
            <button
              className="primary"
              onClick={saveStampsNow}
              disabled={!mapId || !stampsDirty || stampsSaving}
            >
              {stampsSaving ? "Saving…" : "Save stamps"}
            </button>
            {stampsDirty && (
              <span className="dirty" title="Unsaved stamp changes">
                ●
              </span>
            )}
          </>
        )}
        <span className="ed-map-divider" />
        {(
          [
            ["collision", "Collision"],
            ["objects", "Objects"],
            ["regions", "Regions"],
            ["paint", "Paint"],
          ] as [keyof LayerToggles, string][]
        ).map(([k, label]) => (
          <label key={k} className="ed-map-toggle">
            <input type="checkbox" checked={toggles[k]} onChange={() => toggle(k)} />
            {label}
          </label>
        ))}
        <span className="spacer" />
        <button onClick={() => zoomCenter(1 / 1.25)} aria-label="Zoom out">
          −
        </button>
        <span className="ed-map-zoom">{zoomPct}%</span>
        <button onClick={() => zoomCenter(1.25)} aria-label="Zoom in">
          +
        </button>
        <button onClick={fitView}>Fit</button>
      </div>
      <div className="ed-main">
        <aside className="ed-hierarchy">
          <div className="ed-dock-title">
            Maps <span>{maps.length}</span>
          </div>
          <div className="ed-search">
            <input
              aria-label="Search maps"
              placeholder="Search maps…"
              value={mapSearch}
              onChange={(e) => setMapSearch(e.target.value)}
            />
          </div>
          <div className="ed-tree">
            {filteredMaps.map((m) => (
              <button
                key={m.id}
                className={`ed-tree-item ${m.id === mapId ? "selected" : ""}`}
                onClick={() => switchMap(m.id)}
              >
                <span className="ed-map-icon">▦</span>
                {m.id}
                {m.hasOverride && (
                  <span className="ed-map-ovr" title="Has override file">
                    ●
                  </span>
                )}
              </button>
            ))}
            {!filteredMaps.length && <p className="ed-empty">No maps found</p>}
          </div>
          {mode === "stamp" && (
            <div className="ed-map-palette">
              <div className="ed-dock-title">
                Features <span>{features.length}</span>
              </div>
              <div className="ed-map-palette-scroll">
                {featureErr && <p className="ed-err">{featureErr}</p>}
                {(() => {
                  const renderFeatureBtn = (f: FeatureDef) => (
                    <button
                      key={f.id}
                      className={`ed-map-feature ${armedId === f.id ? "armed" : ""}`}
                      title={`${f.id} · ${f.w}×${f.h}px`}
                      onClick={() => setArmedId((a) => (a === f.id ? null : f.id))}
                    >
                      <img src={f.image} alt={f.id} draggable={false} />
                      <span>{f.id}</span>
                    </button>
                  );
                  const known = new Set(FEATURE_CATEGORIES.map(([c]) => c));
                  const groups = FEATURE_CATEGORIES.map(
                    ([cat, label]) => [label, features.filter((f) => f.category === cat)] as const,
                  );
                  const other = features.filter((f) => !known.has(f.category));
                  if (other.length) groups.push(["Other", other]);
                  return groups.map(([label, list]) =>
                    list.length ? (
                      <div key={label}>
                        <h4 className="ed-map-palette-cat">{label}</h4>
                        <div className="ed-map-palette-grid">{list.map(renderFeatureBtn)}</div>
                      </div>
                    ) : null,
                  );
                })()}
                {!features.length && !featureErr && (
                  <p className="ed-empty">No features in catalog</p>
                )}
                {armedId && (
                  <p className="ed-hint" style={{ padding: "4px 10px 0" }}>
                    Placing <b>{armedId}</b> — click the map; Esc or re-click to disarm
                  </p>
                )}
              </div>
            </div>
          )}
        </aside>
        <section className="ed-scene">
          <div className="ed-scene-toolbar">
            <span>
              {mapId || "—"}
              {resp?.override ? " · override applied" : ""}
            </span>
            <span className="spacer" />
            {status && <span>{status}</span>}
            {(mode === "stamp" || mode === "collision") && (
              <span>{stamps.length} stamps</span>
            )}
            {mode === "paint" && map && (
              <span>
                mask {maskW}×{maskH}
              </span>
            )}
            {map && (
              <span>
                {map.cols}×{map.rows} · {map.tile_size || 32}px
              </span>
            )}
          </div>
          <div className={`ed-viewport ed-map-host mode-${mode}`} ref={hostRef}>
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerLeave}
              onDoubleClick={fitView}
            />
          </div>
          <div className="ed-scene-footer">
            <span>
              {mode === "inspect"
                ? "Drag to pan · Scroll to zoom · Click to inspect · Double-click to fit"
                : mode === "stamp"
                  ? "Click to place/select · Drag to move · Alt+drag or handle to rotate · Wheel on stamp scales · Delete removes"
                  : mode === "collision"
                    ? "Click a poly to select · Drag vertices · Click an edge midpoint to add a vertex"
                    : "Drag to paint · Right/middle-drag to pan · Scroll to zoom · Save paint writes the mask"}
            </span>
            <span>
              {mode === "inspect"
                ? (sel?.label ?? "No selection")
                : mode === "paint"
                  ? `painting ${paintCat} · brush ${brushSize}`
                  : (selStamp ? stampFeatureId(selStamp) : "No selection")}
            </span>
          </div>
        </section>
        <div className="ed-side">
          <div className="ed-dock-title">
            Inspector{" "}
            <span>
              {mode === "inspect"
                ? (sel?.label ?? mapId)
                : (selStamp ? stampFeatureId(selStamp) : mapId)}
            </span>
          </div>
          <div className="ed-panel">
            {err && <p className="ed-err">{err}</p>}
            {mode === "inspect" && (
              <>
            {sel ? (
              <>
                <h3>{sel.label}</h3>
                <table className="ed-table">
                  <tbody>
                    {sel.rows
                      .filter(([, v]) => v !== "")
                      .map(([k, v]) => (
                        <tr key={k}>
                          <td className="ed-map-prop-key">{k}</td>
                          <td>{v}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </>
            ) : (
              map && (
                <>
                  <h3>{mapId}</h3>
                  <table className="ed-table">
                    <tbody>
                      <tr>
                        <td className="ed-map-prop-key">size</td>
                        <td>
                          {map.cols}×{map.rows} tiles ({map.tile_size || 32}px)
                        </td>
                      </tr>
                      <tr>
                        <td className="ed-map-prop-key">regions</td>
                        <td>{map.regions?.length ?? 0}</td>
                      </tr>
                      <tr>
                        <td className="ed-map-prop-key">npcs</td>
                        <td>{map.npcs?.length ?? 0}</td>
                      </tr>
                      <tr>
                        <td className="ed-map-prop-key">save points</td>
                        <td>{map.save_points?.length ?? 0}</td>
                      </tr>
                      <tr>
                        <td className="ed-map-prop-key">borders</td>
                        <td>
                          {Object.entries(map.borders ?? {})
                            .map(([e, d]) => `${e}→${d}`)
                            .join(", ") || "—"}
                        </td>
                      </tr>
                      {map.wander && (
                        <tr>
                          <td className="ed-map-prop-key">wander</td>
                          <td>
                            speed {map.wander.speed ?? "—"}, pause {map.wander.pauseSec ?? "—"}s
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </>
              )
            )}
            {resp?.override && (
              <p className="ed-hint ed-map-override-note">
                Override: {patchedTiles} patched tiles
                {resp.override.objects?.length
                  ? `, ${resp.override.objects.length} objects (replaces base objects)`
                  : ""}
                {resp.override.updated_at ? ` — ${resp.override.updated_at}` : ""}
              </p>
            )}
            <h3>Scene objects</h3>
            <div className="ed-search ed-map-search">
              <input
                aria-label="Filter objects"
                placeholder="Filter objects…"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
              />
            </div>
            {itemSearch ? (
              // Flat groups while filtering — the tree would hide context.
              groups.map(([group, list]) => (
                <div key={group}>
                  <h4>
                    {group} <span className="ed-map-count">{list.length}</span>
                  </h4>
                  <div className="ed-list">{list.map((item) => itemRow(item))}</div>
                </div>
              ))
            ) : (
              <>
                <div className="ed-list">{inspectTree.regions.map((n) => regionNode(n, 0))}</div>
                {inspectTree.unassigned.length > 0 && (
                  <div>
                    <h4>
                      Unassigned{" "}
                      <span className="ed-map-count">{inspectTree.unassigned.length}</span>
                    </h4>
                    <div className="ed-list">
                      {inspectTree.unassigned.map((i) => itemRow(i))}
                    </div>
                  </div>
                )}
                {inspectTree.groups.map(([group, list]) => (
                  <div key={group}>
                    <h4>
                      {group} <span className="ed-map-count">{list.length}</span>
                    </h4>
                    <div className="ed-list">{list.map((item) => itemRow(item))}</div>
                  </div>
                ))}
              </>
            )}
            {!filteredItems.length && <p className="ed-empty">No objects</p>}
              </>
            )}
            {mode === "paint" && (
              <>
                <h3>Paint</h3>
                <table className="ed-table">
                  <tbody>
                    <tr>
                      <td className="ed-map-prop-key">mask</td>
                      <td>
                        {maskW}×{maskH} px ({PAINT_CELL} world px per mask px)
                      </td>
                    </tr>
                    <tr>
                      <td className="ed-map-prop-key">category</td>
                      <td>
                        <span
                          className="ed-map-swatch"
                          style={{
                            background: paintCss(
                              (PAINT_CATEGORIES.find((c) => c.id === paintCat) ??
                                PAINT_CATEGORIES[0]).rgb,
                            ),
                          }}
                        />{" "}
                        {paintCat}
                      </td>
                    </tr>
                    <tr>
                      <td className="ed-map-prop-key">brush</td>
                      <td>{brushSize} mask px radius</td>
                    </tr>
                    <tr>
                      <td className="ed-map-prop-key">file</td>
                      <td>{mapId ? `data/maps/${mapId}.paint.png` : "—"}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="ed-hint">
                  Drag on the map to brush a terrain category into the mask. Colors are
                  exact — the bake fills each region by category, so keep edges where you
                  want blends. "Save paint" writes the mask PNG.
                </p>
              </>
            )}
            {(mode === "stamp" || mode === "collision") && (
              <>
                {selStamp && selFeature ? (
                  <>
                    <h3>{stampFeatureId(selStamp)}</h3>
                    <table className="ed-table">
                      <tbody>
                        <tr>
                          <td className="ed-map-prop-key">feature</td>
                          <td>{stampFeatureId(selStamp)}</td>
                        </tr>
                        <tr>
                          <td className="ed-map-prop-key">category</td>
                          <td>{selFeature.category}</td>
                        </tr>
                        <tr>
                          <td className="ed-map-prop-key">size</td>
                          <td>
                            {selFeature.w}×{selFeature.h}px
                          </td>
                        </tr>
                        <tr>
                          <td className="ed-map-prop-key">collision</td>
                          <td>
                            {localPolysOf(featureById, selStamp).length} polys
                            {(selStamp as unknown as { collision?: unknown[] }).collision
                              ? " (override)"
                              : " (catalog)"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="ed-row">
                      <StampNum
                        label="x"
                        value={selStamp.x}
                        onCommit={(v) => editSelStamp({ x: v })}
                      />
                      <StampNum
                        label="y"
                        value={selStamp.y}
                        onCommit={(v) => editSelStamp({ y: v })}
                      />
                    </div>
                    <div className="ed-row">
                      <StampNum
                        label="rot°"
                        step={5}
                        value={selStamp.rotation || 0}
                        onCommit={(v) => {
                          const r = ((v % 360) + 360) % 360;
                          editSelStamp({ rotation: r });
                          setToolRot(r);
                        }}
                      />
                      <StampNum
                        label="scale"
                        step={0.1}
                        value={selStamp.scale || 1}
                        onCommit={(v) => {
                          if (v > 0) {
                            editSelStamp({ scale: v });
                            setToolScale(v);
                          }
                        }}
                      />
                    </div>
                    <div className="ed-row">
                      <label className="ed-map-toggle">
                        <input
                          type="checkbox"
                          checked={!!selStamp.flipX}
                          onChange={(e) => editSelStamp({ flipX: e.target.checked })}
                        />
                        flip X
                      </label>
                      <button onClick={deleteSelStamp}>Delete stamp</button>
                    </div>
                    {mode === "collision" && (
                      <>
                        <h3>Collision</h3>
                        <div className="ed-row">
                          <button onClick={extractFromArt}>Extract from art</button>
                          <button onClick={addRectPoly}>New rect</button>
                          <button
                            onClick={deleteSelPoly}
                            disabled={!selPoly || selPoly.stamp !== selStamp.id}
                          >
                            Delete poly
                          </button>
                        </div>
                        <p className="ed-hint">
                          {selPoly && selPoly.stamp === selStamp.id
                            ? `poly ${selPoly.poly + 1}: drag vertices · click an edge midpoint to add a vertex · Delete removes the poly`
                            : "Click a polygon on the canvas to select it"}
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <h3>{mode === "stamp" ? "Stamps" : "Collision"}</h3>
                    <p className="ed-hint">
                      {mode === "stamp"
                        ? "Pick a feature on the left, then click the map to place it. Click a stamp to select it."
                        : "Click a stamp's collision polygon to select it."}
                    </p>
                    {selStamp && !selFeature && (
                      <p className="ed-err">Unknown feature: {stampFeatureId(selStamp)}</p>
                    )}
                  </>
                )}
                <h3>
                  Placed stamps <span className="ed-map-count">{stamps.length}</span>
                </h3>
                <div className="ed-list">
                  {stamps
                    .slice()
                    .sort((a, b) => a.y - b.y)
                    .map((s) => (
                      <div
                        key={s.id}
                        className={`item ${selStampId === s.id ? "sel" : ""}`}
                        onClick={() => {
                          setSelStampId(s.id);
                          panToStamp(s);
                        }}
                      >
                        {stampFeatureId(s) || "(unknown)"}
                        <span className="dim">
                          {Math.round(s.x)},{Math.round(s.y)}
                        </span>
                      </div>
                    ))}
                  {!stamps.length && <p className="ed-empty">No stamps placed</p>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
