// IsoTiles — the simple isometric tileset (tools/gen_iso_tiles.py) plus the
// map-GID → iso-frame mapping used by the iso chunk rasterizer.
//
// Cells classify as:
//   fill  — a ground diamond from the iso sheet
//   prop  — an upright billboard sprite (depth-sorted, not baked)
//   tree  — a 2x2 stamp; the TL cell emits one billboard, mates are skipped
//   decal — flat ground clutter baked into the chunk (tufts, flowers)
//   skip  — nothing to draw (empty cell or a consumed tree mate)
import type { LoadedPipoyaSheet } from "./pipoyaTilesets";

export const ISO_TILESET_URL = "/assets/tilesets/iso/IsoTiles.png";
export const ISO_ATLAS_URL = "/assets/tilesets/iso/iso_tiles.json";

// Firstgid layout — mirrors internal/game/pipoya_tilesets.go / mundi_tiles.go.
const BASE = 577;
const GRASS_ANIM = 1641;
const WATER_ANIM = 2169;
const FLOWER = 5241;
const DIRT = 5289;
const MUNDI = 6000;
/** Firstgid of the elevated-block range (local = typeIdx*LEVELS + level-1). */
export const ISO_BLOCK_FIRST_GID = 7000;
const BLOCKS = ISO_BLOCK_FIRST_GID;

interface IsoAtlas {
  tile: number;
  prop: [number, number];
  fills: Record<string, { x: number; y: number }>;
  props: Record<string, { x: number; y: number }>;
}

export interface IsoTiles {
  img: HTMLImageElement;
  atlas: IsoAtlas;
}

let tilesPromise: Promise<IsoTiles> | null = null;

export function loadIsoTiles(): Promise<IsoTiles> {
  if (tilesPromise) return tilesPromise;
  tilesPromise = Promise.all([
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`failed to load ${ISO_TILESET_URL}`));
      img.src = ISO_TILESET_URL;
    }),
    fetch(ISO_ATLAS_URL).then((r) => {
      if (!r.ok) throw new Error(`failed to load ${ISO_ATLAS_URL}`);
      return r.json() as Promise<IsoAtlas>;
    }),
  ]).then(([img, atlas]) => ({ img, atlas }));
  return tilesPromise;
}

export interface IsoPropPlacement {
  /** Iso sheet prop frame name. */
  frame: string;
  /** World-space anchor (billboard bottom-center). */
  wx: number;
  wy: number;
}

export type IsoCell =
  | { kind: "fill"; frame: string }
  | { kind: "decal" } // bake the original sheet tile flat into the chunk
  | { kind: "tree"; prop: string; big?: boolean } // TL of a 2x2 stamp
  | { kind: "prop"; prop: string }
  | { kind: "block"; def: IsoBlockDef; level: number } // raised column
  | { kind: "skip" };

// ---------------------------------------------------------------------------
// Elevated blocks (GID 7000+) — raised columns rendered as a textured top
// diamond plus two shaded side faces. local = typeIdx*LEVELS + (level-1).
// The simulation resolves every block GID to TileRock (solid).

/** Elevation levels encodable per block type (level = local%LEVELS + 1). */
export const ISO_BLOCK_LEVELS = 8;
/** Height of implicit rock columns (unwalkable ground cells) — a true cube. */
export const ISO_ROCK_LEVEL = 2;

export interface IsoBlockDef {
  name: string;
  /** Fill frame drawn as the top diamond. */
  top: string;
  /** +x face (screen down-right) — the shadowed side. */
  faceDark: number;
  /** +y face (screen down-left) — the lit side. */
  faceLight: number;
  /** Flat-editor preview color (map editor / ghost). */
  editorColor: string;
  /** Ground materials paint a flat walkable terrain GID instead of a cube. */
  flat?: boolean;
  /** Terrain GID written when flat (elevation level is ignored). */
  groundGid?: number;
}

export const ISO_BLOCKS: IsoBlockDef[] = [
  { name: "stone",  top: "rock",   faceDark: 0x46464e, faceLight: 0x6e6e78, editorColor: "#6e6e78" },
  { name: "brick",  top: "cobble", faceDark: 0x4e3a30, faceLight: 0x74584a, editorColor: "#74584a" },
  { name: "dirt",   top: "dirt",   faceDark: 0x584431, faceLight: 0x7a6247, editorColor: "#7a6247" },
  { name: "sod",    top: "grass",  faceDark: 0x4e3d28, faceLight: 0x6b573a, editorColor: "#6b573a" },
  { name: "sand",   top: "dune",   faceDark: 0xa2854f, faceLight: 0xc4a76e, editorColor: "#c4a76e", flat: true, groundGid: MUNDI + 3 },
  { name: "snow",   top: "snow",   faceDark: 0x9fb2c4, faceLight: 0xcfdce8, editorColor: "#cfdce8" },
  { name: "timber", top: "path",   faceDark: 0x5a442e, faceLight: 0x7c6142, editorColor: "#7c6142" },
  { name: "dark",   top: "ash",    faceDark: 0x28262c, faceLight: 0x403e46, editorColor: "#403e46" },
];

/** Map GID for a block type at an elevation level (1..ISO_BLOCK_LEVELS). */
export function isoBlockGid(typeIdx: number, level: number): number {
  return BLOCKS + typeIdx * ISO_BLOCK_LEVELS + (level - 1);
}

/** GID the editor writes for a palette entry — flat materials emit terrain. */
export function isoBlockPaintGid(typeIdx: number, level: number): number {
  const def = ISO_BLOCKS[typeIdx];
  return def?.groundGid ?? isoBlockGid(typeIdx, level);
}

/** Decode a block GID → its def + level, or null when out of range. */
export function isoBlockForGid(gid: number): { def: IsoBlockDef; level: number } | null {
  const local = (gid & 0x1fffffff) - BLOCKS;
  if (local < 0 || local >= ISO_BLOCKS.length * ISO_BLOCK_LEVELS) return null;
  return {
    def: ISO_BLOCKS[Math.floor(local / ISO_BLOCK_LEVELS)],
    level: (local % ISO_BLOCK_LEVELS) + 1,
  };
}

const MUNDI_FILLS = [
  "snow",
  "packed_snow",
  "ice",
  "dune",
  "beach",
  "scree",
  "ash",
  "peat",
];
// Mundi tree top-left locals → prop frames (stamp order matches mundi_tiles.go).
const MUNDI_TREES: Record<number, string> = { 8: "pine", 10: "pine_snow", 12: "palm", 14: "dead_grey" };
const MUNDI_PROPS: Record<number, string> = {
  24: "cactus_tall",
  25: "cactus_round",
  26: "sage",
  27: "bush", // snow shrub — reads as a low bush
  28: "reeds",
  29: "reeds",
  30: "ice_crystal",
  31: "boulder",
  32: "spire",
  33: "snow_drift",
  34: "fern",
  35: "vine",
  36: "snowy_rock",
  37: "stump",
  38: "mud_mound",
  39: "driftwood",
  40: "wet_rock",
  41: "shells",
  42: "obsidian",
  43: "lava_rock",
  44: "frost_fern",
  45: "mossy_rock",
  46: "skull",
  47: "marker",
  48: "mushroom_giant",
};

// BaseChip solid fills → iso fill frames.
const BASE_FILLS: Record<number, string> = {
  0: "grass",
  5: "dirt",
  116: "cobble",
  176: "water",
};
// BaseChip solid unwalkables → rock columns (mirrors server
// CharFromLocalTile: stone fill + cliff wang resolve to TileRock).
const BASE_SOLID_BLOCKS = new Set([256, 52]);
// BaseChip small + big tree top-lefts (stamps mirror pipoya_tiles.go).
const BASE_TREES: Record<number, string> = {
  8: "tree_green",
  10: "tree_dark",
  12: "tree_autumn",
  14: "tree_dead",
};
const BASE_BIG_TREES: Record<number, string> = {
  24: "tree_green",
  26: "tree_dark",
  28: "tree_autumn",
  30: "tree_dead",
};
const BASE_PROPS: Record<number, string> = {
  40: "bush",
  41: "bush",
  42: "bush",
  43: "bush_dead",
  44: "wet_rock",
  45: "marker",
  46: "driftwood",
  47: "driftwood",
  62: "mossy_rock",
  63: "boulder",
  65: "boulder",
  67: "boulder",
  68: "stump",
  71: "wet_rock",
};
// Locals that bake flat into the ground (decals), not billboards.
const BASE_DECALS = new Set([
  48, 49, 50, 51, 53, 54, 55, // tufts, twigs, flowers
  56, 57, 58, 59, 60, 61, // mushrooms, lily pads
  64, 66, 69, 70, // pebble, dark holes, rubble
]);

const TREE_TL_LOCALS = new Set([8, 10, 12, 14, 24, 26, 28, 30]);

/** True for the non-TL cells of any 2x2 tree stamp (all sheets). */
function isTreeMateLocal(local: number): boolean {
  // Small trees span locals 8-23, big trees 24-39; TLs are the sparse set.
  return local >= 8 && local <= 39 && !TREE_TL_LOCALS.has(local);
}

/** Classify one ground-layer GID for iso rendering. */
export function isoCellForGid(gid: number): IsoCell {
  const raw = gid & 0x1fffffff;
  if (raw <= 0) return { kind: "skip" };

  const block = isoBlockForGid(raw);
  if (block) return { kind: "block", def: block.def, level: block.level };

  if (raw >= MUNDI) {
    const local = raw - MUNDI;
    if (local < 8) return { kind: "fill", frame: MUNDI_FILLS[local] };
    const tree = MUNDI_TREES[local];
    if (tree) return { kind: "tree", prop: tree };
    if (local >= 8 && local <= 23) return { kind: "skip" }; // stamp mate
    const prop = MUNDI_PROPS[local];
    if (prop) return { kind: "prop", prop };
    return { kind: "skip" };
  }
  if (raw >= DIRT) return { kind: "decal" }; // Dirt_pipo ground variation
  if (raw >= FLOWER) return { kind: "decal" }; // Flower_pipo
  if (raw >= WATER_ANIM) return { kind: "fill", frame: "water" };
  if (raw >= GRASS_ANIM) return { kind: "decal" }; // animated grass tufts
  if (raw >= BASE) {
    const local = raw - BASE;
    if (BASE_SOLID_BLOCKS.has(local)) {
      return { kind: "block", def: ISO_BLOCKS[0], level: ISO_ROCK_LEVEL };
    }
    const fill = BASE_FILLS[local];
    if (fill) return { kind: "fill", frame: fill };
    const big = BASE_BIG_TREES[local];
    if (big) return { kind: "tree", prop: big, big: true };
    const tree = BASE_TREES[local];
    if (tree) return { kind: "tree", prop: tree };
    if (isTreeMateLocal(local)) return { kind: "skip" };
    const prop = BASE_PROPS[local];
    if (prop) return { kind: "prop", prop };
    if (BASE_DECALS.has(local)) return { kind: "decal" };
    return { kind: "fill", frame: "grass" }; // unknown BaseChip → grass base
  }
  // WaterFall_pipo (1-576) — water family.
  return { kind: "fill", frame: "water" };
}

/**
 * Resolve a sheet tile for decal baking (tufts, flowers, animated grass) —
 * returns the source rect on its Pipoya sheet, or null to skip.
 */
export function isoDecalSource(
  gid: number,
  sheets: LoadedPipoyaSheet[],
): { sheet: LoadedPipoyaSheet; sx: number; sy: number } | null {
  const raw = gid & 0x1fffffff;
  for (const sheet of sheets) {
    if (raw < sheet.firstgid) continue;
    const local = raw - sheet.firstgid;
    if (local < 0 || local >= sheet.tilecount) continue;
    return {
      sheet,
      sx: (local % sheet.columns) * sheet.tileWidth,
      sy: Math.floor(local / sheet.columns) * sheet.tileHeight,
    };
  }
  return null;
}
