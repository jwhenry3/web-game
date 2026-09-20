import { attachmentPlacement, poseAt } from "./rig";
import type { BoneTracks, Doc, RotKey, Skeleton, Spec, TransKey } from "./types";

// Rigged hair documents — mirrors tools/hair_docs.py. A hair doc paints up
// to three parts (bangs, top, tail) in a shared cell-space window; each
// enabled part is a weighted grid mesh skinned to a 3-bone chain off the
// head ("<id>_<part>" root + "_a"/"_b" flex bones) so the scalp stays put
// while the tips carry the shared animations' sway. gen_paperdoll.py bakes
// every doc in tools/hairs/ into the paperdoll rig.

export const HAIR_PARTS = ["bangs", "top", "tail"] as const;
export type HairPart = (typeof HAIR_PARTS)[number];

export interface HairPartDoc {
  enabled: boolean;
  /** Pivot in cell coords (x right, y down) — becomes the part's bone. */
  pivot: [number, number];
  /** dataURL PNG of the CANVAS_W×CANVAS_H paint window. */
  png: string;
}

export interface HairDoc {
  id: string;
  label: string;
  /** Stock style shipped by gen_hair_presets.py. */
  preset?: boolean;
  /** Amplitude multiplier for the baked sway tracks. */
  sway: number;
  parts: Partial<Record<HairPart, HairPartDoc>>;
}

// Cell-space paint window + scale — keep in sync with tools/hair_docs.py.
export const WIN_X0 = 26;
export const WIN_Y0 = 0;
export const WIN_W = 28;
export const WIN_H = 30;
export const DS = 2;
export const CANVAS_W = WIN_W * DS; // 56
export const CANVAS_H = WIN_H * DS; // 60
export const FOOT_X = 39.5;
export const FOOT_Y = 34;

export const DEFAULT_PIVOTS: Record<HairPart, [number, number]> = {
  bangs: [44.0, 7.5],
  top: [40.0, 4.5],
  tail: [35.5, 9.0],
};

export const PART_LABEL: Record<HairPart, string> = {
  bangs: "Bangs",
  top: "Hair top",
  tail: "Hair tail",
};

// Canonical ramp the parts are painted in — HAIR_COLORS[0] plus its shade
// steps; the bake recolors these to each palette color.
export const HAIR_COLORS: [number, number, number][] = [
  [108, 61, 51], [50, 40, 49], [204, 161, 70], [162, 65, 50], [212, 80, 50],
  [225, 220, 211], [65, 90, 136], [135, 80, 162], [70, 126, 90], [221, 138, 161],
];
export const OUTLINE = "#2c1e36";
export const RAMP = { main: "#6c3d33", light: "#b4683e", dark: "#3c2831" };

export const hairBoneName = (id: string, part: HairPart) => `${id}_${part}`;
export const hairSlotName = (id: string, part: HairPart) =>
  `hair_${part}_${hairBoneName(id, part)}`;

// --- deform chain (mirror of tools/hair_docs.py) ----------------------------
// Each part's sprite is a weighted grid mesh skinned to a 3-bone chain.
// The root bone carries no sway track: verts near the pivot stay glued to
// the head, while mid/tip rotations grow so the wave travels outward —
// bangs bounce, spikes whip, tails flow.
export const hairChain = (id: string, part: HairPart): [string, string, string] => {
  const root = hairBoneName(id, part);
  return [root, `${root}_a`, `${root}_b`];
};

/** Cell-space direction the part flexes along (y down). */
export const PART_DIR: Record<HairPart, [number, number]> = {
  bangs: [0.3, 1.0],
  top: [0, -1.0],
  tail: [-0.3, 1.0],
};
const CHAIN_FRAC = [0, 0.5, 1];
const CHAIN_AMP = [0.45, 1.0]; // sway scale on mid, tip (root: none)
const CHAIN_LAG = [0.35, 0.7]; // extra phase lag on mid, tip
const MIN_SPAN = 0.5; // floor so reach<=0 parts still emit a chain
const MESH_STEP = 2; // cell units between grid verts

/** Painted bounds of a part canvas in cell coords — null when blank. */
export function canvasBBox(c: HTMLCanvasElement): [number, number, number, number] | null {
  const d = c.getContext("2d", { willReadFrequently: true })!
    .getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (!d[(y * c.width + x) * 4 + 3]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return [x0 / DS + WIN_X0, y0 / DS + WIN_Y0, (x1 + 1) / DS + WIN_X0, (y1 + 1) / DS + WIN_Y0];
}

/** Flow length in cell units: the painted bbox's reach along the part's
 * flex axis. The chain tip lands on the art's far edge — only floored to
 * MIN_SPAN so reach<=0 parts still emit a non-degenerate chain. */
export function hairFlowSpan(
  part: HairPart,
  pivot: [number, number],
  bbox: [number, number, number, number],
): number {
  const [dx0, dy0] = PART_DIR[part];
  const n = Math.hypot(dx0, dy0);
  const dx = dx0 / n, dy = dy0 / n;
  return Math.max(
    MIN_SPAN,
    Math.max(
      ...[bbox[0], bbox[2]].flatMap((cx) =>
        [bbox[1], bbox[3]].map((cy) => (cx - pivot[0]) * dx + (cy - pivot[1]) * dy),
      ),
    ),
  );
}

/** Chain bone positions in cell coords along the flow axis. */
export function hairChainCells(
  part: HairPart,
  pivot: [number, number],
  span: number,
): [number, number][] {
  const [dx0, dy0] = PART_DIR[part];
  const n = Math.hypot(dx0, dy0);
  const dx = dx0 / n, dy = dy0 / n;
  return CHAIN_FRAC.map((f) => [pivot[0] + dx * span * f, pivot[1] + dy * span * f]);
}

export interface HairMesh {
  uvs: number[];
  triangles: number[];
  /** Flat influence list — per vertex [count, boneIx, x, y, w]... where
   * boneIx indexes into the skeleton's bones array. */
  vertices: number[];
  hull: number;
}

/** One entry per chain position — skeleton bone index + world pos. */
export interface ChainBone {
  index: number;
  x: number;
  y: number;
}

/** Weighted grid mesh over `gridRect` (cell coords); uvs are normalized
 * against `uvRect`. Mirrors hair_docs.hair_mesh. */
export function hairMesh(
  gridRect: [number, number, number, number],
  uvRect: [number, number, number, number],
  pivot: [number, number],
  part: HairPart,
  span: number,
  chain: ChainBone[],
): HairMesh {
  const [gx0, gy0, gx1, gy1] = gridRect;
  const [ux0, uy0] = uvRect;
  const uw = uvRect[2] - uvRect[0], uh = uvRect[3] - uvRect[1];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = gx0; x < gx1; x += MESH_STEP) xs.push(x);
  for (let y = gy0; y < gy1; y += MESH_STEP) ys.push(y);
  xs.push(gx1);
  ys.push(gy1);
  const nx = xs.length, ny = ys.length;

  const [dx0, dy0] = PART_DIR[part];
  const n = Math.hypot(dx0, dy0);
  const dx = dx0 / n, dy = dy0 / n;

  // Hull verts first: boundary ring, then interior.
  const order: number[] = [];
  for (let i = 0; i < nx * ny; i++)
    if (i % nx === 0 || i % nx === nx - 1 || Math.floor(i / nx) === 0 || Math.floor(i / nx) === ny - 1)
      order.push(i);
  for (let i = 0; i < nx * ny; i++)
    if (!(i % nx === 0 || i % nx === nx - 1 || Math.floor(i / nx) === 0 || Math.floor(i / nx) === ny - 1))
      order.push(i);

  const vertices: number[] = [];
  const uvs: number[] = [];
  for (const i of order) {
    const cx = xs[i % nx]!, cy = ys[Math.floor(i / nx)]!;
    uvs.push((cx - ux0) / uw, (cy - uy0) / uh);
    const wx = cx - FOOT_X, wy = FOOT_Y - cy;
    const s = (cx - pivot[0]) * dx + (cy - pivot[1]) * dy;
    const f = Math.max(0, Math.min(1, s / span)) * (CHAIN_FRAC.length - 1);
    const i0 = Math.min(Math.floor(f), CHAIN_FRAC.length - 2);
    const w = f - i0;
    const inf: [number, number][] = [[i0, 1 - w], [i0 + 1, w]];
    vertices.push(inf.length);
    for (const [ci, bw] of inf) {
      const b = chain[ci]!;
      vertices.push(b.index, +(wx - b.x).toFixed(3), +(wy - b.y).toFixed(3), +bw.toFixed(3));
    }
  }

  const remap = new Map(order.map((old, i) => [old, i]));
  const triangles: number[] = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      triangles.push(remap.get(a)!, remap.get(c)!, remap.get(b)!, remap.get(b)!, remap.get(c)!, remap.get(d)!);
    }
  }
  return { uvs, triangles, vertices, hull: nx * ny - (nx - 2) * (ny - 2) };
}

/** Cell coords -> spine world (x right, y up, feet origin). */
export const cellToWorld = (cx: number, cy: number) => ({
  x: cx - FOOT_X,
  y: FOOT_Y - cy,
});
export const worldToCell = (wx: number, wy: number): [number, number] => [
  wx + FOOT_X,
  FOOT_Y - wy,
];

/** Saturated ramp shading — port of paperdoll_layers.shade(). */
export function shade(rgb: [number, number, number], factor: number): [number, number, number] {
  let [h, s, v] = rgbToHsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  if (factor < 1) {
    h = (h + 0.035) % 1;
    s = Math.min(1, s * 1.08);
  } else if (factor > 1) {
    h = (h - 0.018 + 1) % 1;
    s *= 0.9;
  }
  v = Math.max(0, Math.min(1, v * factor));
  const [r, g, b] = hsvToRgb(h, s, v);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, max ? d / max : 0, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

const hex = (rgb: [number, number, number]) =>
  (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

/** Recolor a canonical-ramp part canvas to palette color cN (1-based). */
export function recolorPart(src: HTMLCanvasElement, colorIx: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const base = HAIR_COLORS[0]!;
  const target = HAIR_COLORS[colorIx - 1] ?? base;
  if (target === base) return out;
  const map = new Map<number, [number, number, number]>([
    [hex(base), target],
    [hex(shade(base, 1.5)), shade(target, 1.5)],
    [hex(shade(base, 0.6)), shade(target, 0.6)],
  ]);
  const d = ctx.getImageData(0, 0, out.width, out.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const key = (d.data[i]! << 16) | (d.data[i + 1]! << 8) | d.data[i + 2]!;
    const to = map.get(key);
    if (to) {
      d.data[i] = to[0];
      d.data[i + 1] = to[1];
      d.data[i + 2] = to[2];
    }
  }
  ctx.putImageData(d, 0, 0);
  return out;
}

export function blankPartCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = CANVAS_W;
  c.height = CANVAS_H;
  return c;
}

export async function decodePart(png: string): Promise<HTMLCanvasElement> {
  const c = blankPartCanvas();
  if (!png) return c;
  const img = new Image();
  img.src = png;
  await img.decode().catch(() => {});
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function blankHairDoc(id: string): HairDoc {
  return {
    id,
    label: id,
    sway: 1,
    parts: { top: { enabled: true, pivot: [...DEFAULT_PIVOTS.top], png: "" } },
  };
}

export function normalizeHairDoc(raw: unknown, fallbackId: string): HairDoc {
  const r = (raw ?? {}) as Record<string, unknown>;
  const parts: HairDoc["parts"] = {};
  const src = (r.parts ?? {}) as Record<string, Record<string, unknown>>;
  for (const part of HAIR_PARTS) {
    const p = src[part];
    if (!p) continue;
    const pv = Array.isArray(p.pivot) ? p.pivot : DEFAULT_PIVOTS[part];
    parts[part] = {
      enabled: p.enabled !== false,
      pivot: [Number(pv[0]) || 0, Number(pv[1]) || 0],
      png: typeof p.png === "string" ? p.png : "",
    };
  }
  return {
    id: typeof r.id === "string" && r.id ? r.id : fallbackId,
    label: typeof r.label === "string" ? r.label : fallbackId,
    preset: r.preset === true,
    sway: typeof r.sway === "number" && Number.isFinite(r.sway) ? r.sway : 1,
    parts,
  };
}

// --- sway tracks (mirror of the bake in gen_paperdoll.py) -------------------

//            idle amp, idle phase, run amp, run phase, attack amp, tip bob
const HAIR_SWAY: Record<HairPart, [number, number, number, number, number, number]> = {
  bangs: [1.5, 0.55, 4.0, 0.6, 3.0, 0.25],
  top: [1.0, 0.3, 2.5, 0.35, 1.5, 0.1],
  tail: [4.0, 0.9, 9.0, 0.3, 8.0, 0.35],
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** 60 Hz sampled sine cycle — same as gen_paperdoll's cycle(). */
function cycle(duration: number, fn: (phase: number) => number): RotKey[] {
  const steps = Math.ceil(duration * 60);
  const keys: RotKey[] = [];
  for (let i = 0; i <= steps; i++) {
    const phase = i < steps ? (2 * Math.PI * i) / steps : 0;
    keys.push({ time: (duration * i) / steps, value: round4(fn(phase)) });
  }
  return keys;
}

/** Cosine-eased keys baked at 60 Hz — same as gen_paperdoll's eased(). */
function eased(keys: [number, number][]): RotKey[] {
  const out: RotKey[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i]!;
    const [t1, v1] = keys[i + 1]!;
    const steps = Math.max(2, Math.ceil((t1 - t0) * 60));
    for (let j = 0; j < steps; j++) {
      const u = j / steps;
      const mix = (1 - Math.cos(Math.PI * u)) / 2;
      out.push({ time: t0 + (t1 - t0) * u, value: round4(v0 + (v1 - v0) * mix) });
    }
  }
  const last = keys[keys.length - 1]!;
  out.push({ time: last[0], value: last[1] });
  return out;
}

/** Sway tracks for one part's chain in one animation — keyed by bone name
 * suffix ("_a" = mid, "_b" = tip). The root bone gets no track: it stays
 * glued to the head. Tip also gets a small translate bob that trails the
 * rotation — the "bounce". */
export function hairChainTracks(
  part: HairPart,
  anim: string,
  sway: number,
): Record<"_a" | "_b", BoneTracks> | null {
  const [ia, ip, ra, rp, aa, bob] = HAIR_SWAY[part];
  const out: Record<"_a" | "_b", BoneTracks> = { _a: {}, _b: {} };
  const segs: ["_a" | "_b", number, number][] = [
    ["_a", CHAIN_AMP[0], CHAIN_LAG[0]],
    ["_b", CHAIN_AMP[1], CHAIN_LAG[1]],
  ];
  switch (anim) {
    case "idle":
      for (const [s, amp, lag] of segs)
        out[s].rotate = cycle(1.6, (p) => sway * ia * amp * Math.sin(p - ip - lag));
      out._b.translate = cycleT(1.6, (p) => sway * bob * 0.5 * Math.sin(p - ip - 0.7));
      break;
    case "run":
      for (const [s, amp, lag] of segs)
        out[s].rotate = cycle(0.6, (p) => sway * ra * amp * Math.sin(2 * p - rp - lag));
      out._b.translate = cycleT(0.6, (p) => sway * bob * Math.sin(2 * p - rp - 0.7));
      break;
    case "ride_idle":
      for (const [s, amp, lag] of segs)
        out[s].rotate = cycle(2.0, (p) => sway * 0.8 * ia * amp * Math.sin(p - ip - lag));
      out._b.translate = cycleT(2.0, (p) => sway * bob * 0.5 * Math.sin(p - ip - 0.7));
      break;
    case "ride_run":
      for (const [s, amp, lag] of segs)
        out[s].rotate = cycle(0.7, (p) => sway * ra * amp * Math.sin(2 * p - rp - lag));
      out._b.translate = cycleT(0.7, (p) => sway * bob * Math.sin(2 * p - rp - 0.7));
      break;
    case "attack":
    case "attackB":
      for (const [s, amp] of segs)
        out[s].rotate = eased(
          ([[0, 0], [0.1, -0.5 * aa * amp], [0.22, aa * amp], [0.4, 0.3 * aa * amp], [0.55, 0]] as [number, number][])
            .map(([t, v]) => [t, v * sway]),
        );
      break;
    default:
      return null;
  }
  return out;
}

/** 60 Hz sampled sine as a translate track (y only). */
function cycleT(duration: number, fn: (phase: number) => number): TransKey[] {
  const steps = Math.ceil(duration * 60);
  const keys: TransKey[] = [];
  for (let i = 0; i <= steps; i++) {
    const phase = i < steps ? (2 * Math.PI * i) / steps : 0;
    keys.push({ time: (duration * i) / steps, x: 0, y: round4(fn(phase)) });
  }
  return keys;
}

// --- merged preview doc ------------------------------------------------------

export interface HairPreview {
  doc: Doc;
  /** Composite atlas canvas — doll regions plus recolored part art. */
  atlasCanvas: HTMLCanvasElement;
}

/**
 * Merge the working hair doc onto the paperdoll doc for preview: adds the
 * hair bones (children of head at their pivots), the three part slots in
 * draw order, sway tracks in every animation, and the part art — recolored
 * to colorIx — appended below the doll atlas.
 */
export function buildHairPreview(
  doll: Doc,
  dollAtlasCanvas: HTMLCanvasElement,
  hair: HairDoc,
  canvases: Map<HairPart, HTMLCanvasElement>,
  colorIx: number,
): HairPreview {
  const key = `hair_${hair.id}_c${colorIx}`;
  const parts = HAIR_PARTS.filter((p) => hair.parts[p]?.enabled);

  // Spec: doll + hair bones/layers + sway tracks injected per animation.
  const spec: Spec = {
    ...doll.spec,
    bones: [...doll.spec.bones],
    layers: [...doll.spec.layers],
    animations: {},
  };
  // Drop every baked hair chain bone — all styles' "<id>_<part>" roots and
  // their "_a"/"_b" children ride the head, so filter by that pattern.
  spec.bones = spec.bones.filter((b) => !/_(bangs|top|tail)(_a|_b)?$/.test(b.name));

  // Per part: [root, mid, tip] chain — root at the pivot (child of head),
  // mid/tip spaced along the flex direction.
  const hairChains: { part: HairPart; chain: string[]; cells: [number, number][] }[] = [];
  for (const part of parts) {
    const pd = hair.parts[part]!;
    const cvs = canvases.get(part);
    const bbox = cvs ? canvasBBox(cvs) : null;
    const span = bbox ? hairFlowSpan(part, pd.pivot, bbox) : MIN_SPAN;
    const chain = [...hairChain(hair.id, part)];
    const cells = hairChainCells(part, pd.pivot, span);
    hairChains.push({ part, chain, cells });
    const parents = ["head", chain[0], chain[1]];
    for (let i = 0; i < 3; i++) {
      const w = cellToWorld(cells[i]![0], cells[i]![1]);
      spec.bones.push({ name: chain[i]!, parent: parents[i]!, x: w.x, y: w.y });
    }
    const layer = `hair_${part}`;
    if (!spec.layers.some((l) => l.name === layer)) {
      spec.layers.push({ name: layer, part: "auto" });
    }
  }
  for (const [name, anim] of Object.entries(doll.spec.animations)) {
    const bones = { ...anim.bones };
    for (const { part, chain } of hairChains) {
      const t = hairChainTracks(part, name, hair.sway);
      if (!t) continue;
      for (const suffix of ["_a", "_b"] as const) {
        bones[chain[0] + suffix] = t[suffix];
      }
      delete bones[chain[0]]; // root stays pinned to the head
    }
    spec.animations[name] = { ...anim, bones };
  }

  // Skeleton: drop every baked hair bone (all styles) so the mesh's bone
  // indices match the appended chains — then this doc's slots replace the
  // baked hair part slots at the flat-hair draw positions.
  const bones = doll.skeleton.bones.filter((b) => !/_(bangs|top|tail)(_a|_b)?$/.test(b.name));
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]));
  const headW = doll.spec.bones.find((b) => b.name === "head") ?? { x: 0, y: 0 };
  for (const { chain, cells } of hairChains) {
    const parents = ["head", chain[0], chain[1]];
    for (let i = 0; i < 3; i++) {
      const w = cellToWorld(cells[i]![0], cells[i]![1]);
      const pw = i === 0 ? headW : cellToWorld(cells[i - 1]![0], cells[i - 1]![1]);
      // Spine JSON bones carry the offset from the parent, not world pos.
      bones.push({
        name: chain[i]!,
        parent: parents[i],
        x: +(w.x - pw.x).toFixed(2),
        y: +(w.y - pw.y).toFixed(2),
      });
      boneIndex.set(chain[i]!, bones.length - 1);
    }
  }
  const slots = doll.skeleton.slots.filter(
    (s) => !/^hair_(bangs|top|tail)_/.test(s.name),
  );
  const insertAfter = (marker: string, added: Skeleton["slots"]) => {
    const idx = slots.findIndex((s) => s.name === marker);
    slots.splice(idx < 0 ? slots.length : idx + 1, 0, ...added);
  };
  insertAfter("hair_bot_head",
    hairChains.filter(({ part }) => part === "tail")
      .map(({ part, chain }) => ({ name: hairSlotName(hair.id, part), bone: chain[0] })));
  insertAfter("hair_top_head",
    hairChains.filter(({ part }) => part !== "tail")
      .sort((a, b) => (a.part === "top" ? -1 : 1) - (b.part === "top" ? -1 : 1))
      .map(({ part, chain }) => ({ name: hairSlotName(hair.id, part), bone: chain[0] })));

  const skins = doll.skeleton.skins.map((s) => ({
    ...s,
    attachments: { ...s.attachments },
  }));
  for (const { part, chain, cells } of hairChains) {
    const slot = hairSlotName(hair.id, part);
    const pivot = hair.parts[part]!.pivot;
    const cvs = canvases.get(part);
    const bbox = cvs ? canvasBBox(cvs) : null;
    const span = bbox ? hairFlowSpan(part, pivot, bbox) : MIN_SPAN;
    // World positions for the chain — spec.bones stores world coords.
    const chainBones: ChainBone[] = cells.map((cc, i) => {
      const w = cellToWorld(cc[0], cc[1]);
      return { index: boneIndex.get(chain[i]!)!, x: w.x, y: w.y };
    });
    // Mesh grid covers the painted window; uvs normalize against the
    // hairprev region (the full window canvas).
    const gridRect: [number, number, number, number] = bbox ?? [WIN_X0, WIN_Y0, WIN_X0 + WIN_W, WIN_Y0 + WIN_H];
    const mesh = hairMesh(gridRect, [WIN_X0, WIN_Y0, WIN_X0 + WIN_W, WIN_Y0 + WIN_H], pivot, part, span, chainBones);
    skins[0]!.attachments[slot] = {
      [key]: {
        type: "mesh",
        path: `hairprev_${part}`,
        ...mesh,
      },
    };
  }
  const skeleton: Skeleton = { ...doll.skeleton, bones, slots, skins };

  // Composite atlas: doll canvas + recolored part windows in a new strip.
  const canvas = document.createElement("canvas");
  canvas.width = dollAtlasCanvas.width;
  canvas.height = dollAtlasCanvas.height + CANVAS_H + 4;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(dollAtlasCanvas, 0, 0);
  const regions = new Map(doll.atlas.regions);
  let x = 2;
  for (const part of parts) {
    const src = canvases.get(part);
    if (!src) continue;
    const y = dollAtlasCanvas.height + 2;
    ctx.drawImage(recolorPart(src, colorIx), x, y);
    regions.set(`hairprev_${part}`, { x, y, w: CANVAS_W, h: CANVAS_H });
    x += CANVAS_W + 2;
  }
  return { doc: { spec, skeleton, atlas: { ...doll.atlas, regions, height: canvas.height } }, atlasCanvas: canvas };
}

/** Ghost underlay for the part paint canvas — the doll's head area drawn
 * in window space so art can be aligned to the face. */
export function buildHeadGhost(
  doll: Doc,
  dollAtlasCanvas: HTMLCanvasElement,
): HTMLCanvasElement {
  const c = blankPartCanvas();
  const ctx = c.getContext("2d")!;
  const pose = poseAt(doll.spec, null, 0);
  const skins = doll.skeleton.skins[0]?.attachments ?? {};
  for (const slot of doll.skeleton.slots) {
    if (!/^(skin_head|face_head|skin_torso|cloth_top_head)/.test(slot.name)) continue;
    const bonePose = pose.get(slot.bone);
    const atts = skins[slot.name];
    const att = atts?.[slot.attachment ?? ""] ?? Object.values(atts ?? {})[0];
    if (!bonePose || !att?.path) continue;
    const region = doll.atlas.regions.get(att.path);
    if (!region) continue;
    const p = attachmentPlacement(bonePose, att);
    // World -> window px: top-left spine corner is (-13.5, 34).
    const px = (p.x + 13.5) * DS;
    const py = (34 - p.y) * DS;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((-p.rot * Math.PI) / 180);
    ctx.scale(1, -1);
    ctx.drawImage(
      dollAtlasCanvas, region.x, region.y, region.w, region.h,
      (-(att.width ?? region.w / DS) * DS) / 2,
      (-(att.height ?? region.h / DS) * DS) / 2,
      (att.width ?? region.w / DS) * DS,
      (att.height ?? region.h / DS) * DS,
    );
    ctx.restore();
  }
  return c;
}
