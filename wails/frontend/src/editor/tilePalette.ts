import type { ImportedTileset, TileRole } from "./tilesetConfig";
import { isoBlockForGid } from "../world/isoTiles";

export const BASE_CHIP_FIRST_GID = 577;
export const TILE_PX = 32;

export const TERRAIN_COLORS: Record<TileRole | "empty" | "collision", string> = {
  grass: "#3d8c40",
  dirt: "#8b6914",
  cliff: "#5a5a62",
  cobble: "#7a7a88",
  water: "#2a6dbd",
  unset: "#243024",
  empty: "#1a221a",
  collision: "rgba(220, 60, 60, 0.45)",
};

const DEFAULT_LOCAL: Record<Exclude<TileRole, "unset">, number> = {
  grass: 0, // solid fill (samplemap GID 577)
  dirt: 5, // solid path fill (samplemap GID 582)
  cliff: 256, // solid stone
  cobble: 116,
  water: 176, // chip; runtime prefers Water_pipo fill for maps
};

export function defaultGidForRole(role: TileRole): number {
  if (role === "unset") return 0;
  return BASE_CHIP_FIRST_GID + DEFAULT_LOCAL[role];
}

export function roleForGid(gid: number, tileset: ImportedTileset | null): TileRole {
  const raw = gid & 0x1fffffff;
  if (raw === 0) return "unset";
  if (isoBlockForGid(raw)) return "cliff";
  if (tileset) {
    const local = raw - tileset.firstGid;
    if (local >= 0) {
      const role = tileset.roles[String(local)];
      if (role && role !== "unset") return role;
    }
  }
  const local = raw - BASE_CHIP_FIRST_GID;
  for (const [role, idx] of Object.entries(DEFAULT_LOCAL)) {
    if (local === idx) return role as TileRole;
  }
  if (local >= 0 && local <= 2) return "grass";
  if (local === 5 || (local >= 112 && local < 116) || local === 115) return "dirt";
  if (local === 256 || local === 52 || local === 7) return "cliff";
  if (local >= 116 && local < 128) return "cobble";
  if (local === 176) return "water";
  return "unset";
}

export function gidForRole(role: TileRole, tileset: ImportedTileset | null): number {
  if (role === "unset") return 0;
  if (tileset) {
    for (const [local, r] of Object.entries(tileset.roles)) {
      if (r === role) return tileset.firstGid + parseInt(local, 10);
    }
  }
  return defaultGidForRole(role);
}

const MUNDI_FIRST_GID = 6000;
const WATER_ANIM_FIRST_GID = 2169;
const WATER_ANIM_END_GID = WATER_ANIM_FIRST_GID + 3072;

/** Fallback colors for MundiTerrain locals (used when sheet pixels aren't loaded). */
const MUNDI_LOCAL_COLORS: Record<number, string> = {
  0: "#dfe8ee", // snow
  1: "#cdd8e2", // packed snow
  2: "#9fc8dc", // ice
  3: "#d8bc72", // dune sand
  4: "#d0b47a", // beach sand
  5: "#8c8478", // scree
  6: "#686664", // ash
  7: "#4c4834", // peat
};

function mundiLocalColor(gid: number): string | null {
  const local = gid - MUNDI_FIRST_GID;
  if (local < 0 || local >= 64) return null;
  if (local <= 7) return MUNDI_LOCAL_COLORS[local];
  return TERRAIN_COLORS.grass; // trees/props — ground shows through
}

export function colorForGid(gid: number, tileset: ImportedTileset | null): string {
  const raw = gid & 0x1fffffff;
  const block = isoBlockForGid(raw);
  if (block) return block.def.editorColor;
  const mundi = mundiLocalColor(raw);
  if (mundi) return mundi;
  if (raw >= WATER_ANIM_FIRST_GID && raw < WATER_ANIM_END_GID) return TERRAIN_COLORS.water;
  const role = roleForGid(gid, tileset);
  if (role === "unset") return TERRAIN_COLORS.empty;
  return TERRAIN_COLORS[role];
}

export function blankGrassLayers(cols: number, rows: number, tileset: ImportedTileset | null) {
  const n = cols * rows;
  const grassGid = gidForRole("grass", tileset);
  return {
    ground: Array(n).fill(grassGid),
    collision: Array(n).fill(0),
  };
}

export function toolToRole(tool: string): TileRole | null {
  if (!tool.startsWith("terrain_")) return null;
  const kind = tool.replace("terrain_", "");
  if (kind === "erase") return "unset";
  if (kind === "grass" || kind === "dirt" || kind === "cliff" || kind === "cobble" || kind === "water") {
    return kind;
  }
  return null;
}
