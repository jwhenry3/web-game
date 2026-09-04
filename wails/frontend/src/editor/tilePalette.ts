import type { ImportedTileset, TileRole } from "./tilesetConfig";

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

export function colorForGid(gid: number, tileset: ImportedTileset | null): string {
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
