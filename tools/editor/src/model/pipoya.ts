/**
 * Minimal port of the client's Pipoya tileset registry + terrain rasterizer
 * (wails/frontend/src/world/pipoyaTilesets.ts, terrainRaster.ts). The sheets
 * are served from the editor's publicDir (wails/frontend/public), so the
 * /assets/tilesets/... URLs resolve the same way they do in game.
 */

export const PIPOYA_PUBLIC_BASE = "/assets/tilesets/pipoya";
export const BASE_CHIP_FIRST_GID = 577;
export const MUNDI_FIRST_GID = 6000;
const WATER_ANIM_FIRST_GID = 2169;
const WATER_ANIM_END_GID = WATER_ANIM_FIRST_GID + 3072;
const TILE = 32;

export interface PipoyaTilesetDef {
  id: string;
  name: string;
  firstgid: number;
  tilecount: number;
  columns: number;
  image: string;
  primary?: boolean;
  base?: string;
}

/** Canonical firstgids — must match internal/game/pipoya_tilesets.go. */
export const PIPOYA_TILESETS: PipoyaTilesetDef[] = [
  { id: "waterfall", name: "WaterFall_pipo", firstgid: 1, tilecount: 576, columns: 32, image: "WaterFall_pipo.png" },
  { id: "basechip", name: "BaseChip_pipo", firstgid: 577, tilecount: 1064, columns: 8, image: "BaseChip_pipo.png", primary: true },
  { id: "grass", name: "Grass_pipo", firstgid: 1641, tilecount: 528, columns: 8, image: "Grass_pipo.png" },
  { id: "water", name: "Water_pipo", firstgid: 2169, tilecount: 3072, columns: 64, image: "Water_pipo.png" },
  { id: "flower", name: "Flower_pipo", firstgid: 5241, tilecount: 48, columns: 8, image: "Flower_pipo.png" },
  { id: "dirt", name: "Dirt_pipo", firstgid: 5289, tilecount: 336, columns: 8, image: "Dirt_pipo.png" },
  { id: "munditerrain", name: "MundiTerrain", firstgid: 6000, tilecount: 64, columns: 8, image: "MundiTerrain.png", base: "/assets/tilesets/mundi" },
];

export interface LoadedSheet extends PipoyaTilesetDef {
  img: HTMLImageElement;
}

let loadPromise: Promise<LoadedSheet[]> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

/** Load every sheet once; a missing sheet is dropped rather than failing the
 * whole set (the renderer falls back to flat colors for unresolved GIDs). */
export function loadPipoyaSheets(): Promise<LoadedSheet[]> {
  if (!loadPromise) {
    loadPromise = Promise.allSettled(
      PIPOYA_TILESETS.map(async (def) => ({
        ...def,
        img: await loadImage(`${def.base ?? PIPOYA_PUBLIC_BASE}/${def.image}`),
      })),
    ).then((results) =>
      results
        .filter((r): r is PromiseFulfilledResult<LoadedSheet> => r.status === "fulfilled")
        .map((r) => r.value)
        // Highest firstgid first so the local index resolves correctly.
        .sort((a, b) => b.firstgid - a.firstgid),
    );
  }
  return loadPromise;
}

const gidMask = (gid: number) => gid & 0x1fffffff;

export function resolveTile(
  gid: number,
  sheets: LoadedSheet[],
): { sheet: LoadedSheet; local: number; sx: number; sy: number } | null {
  const raw = gidMask(gid);
  if (raw <= 0) return null;
  for (const sheet of sheets) {
    if (raw < sheet.firstgid) continue;
    const local = raw - sheet.firstgid;
    if (local >= sheet.tilecount) continue;
    return {
      sheet,
      local,
      sx: (local % sheet.columns) * TILE,
      sy: Math.floor(local / sheet.columns) * TILE,
    };
  }
  return null;
}

// --- rasterization ------------------------------------------------------------

/** Solid BaseChip fills that fully cover a cell (no grass underlay needed). */
const SOLID_BASECHIP_LOCALS = new Set([
  0, 1, 2, // grass fills
  5, 7, 115, // dirt fills
  116, 117, 118, 119, 120, 122, 123, 124, 125, 126, // cobble / dirt solids
  128, 129, 130, 131, 132,
  256, 257, 258, 259, 260, // stone wall fills
]);

const MUNDI_FILL_MAX_LOCAL = 7;

/** Top halves of 2×2 trees (BaseChip 8-15 small / 24-31 big, MundiTerrain 8-15). */
function isTreeCanopyLocal(sheetId: string, local: number): boolean {
  if (sheetId === "munditerrain") return local >= 8 && local <= 15;
  return (local >= 8 && local <= 15) || (local >= 24 && local <= 31);
}

/** Dominant ground fill used as underlay beneath transparent props/canopy. */
const UNDERLAY_CANDIDATES = [
  BASE_CHIP_FIRST_GID + 0, // grass
  BASE_CHIP_FIRST_GID + 5, // dirt
  MUNDI_FIRST_GID + 0, // snow
  MUNDI_FIRST_GID + 1, // packed snow
  MUNDI_FIRST_GID + 3, // dune sand
  MUNDI_FIRST_GID + 4, // beach sand
  MUNDI_FIRST_GID + 5, // scree
  MUNDI_FIRST_GID + 7, // peat
];

function pickGroundUnderlayGid(ground: number[]): number {
  const counts = new Map<number, number>();
  for (let i = 0; i < ground.length; i += 97) {
    const gid = gidMask(ground[i]);
    counts.set(gid, (counts.get(gid) ?? 0) + 1);
  }
  let best = BASE_CHIP_FIRST_GID + 0;
  let bestN = 0;
  for (const gid of UNDERLAY_CANDIDATES) {
    const n = counts.get(gid) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = gid;
    }
  }
  return best;
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  sheets: LoadedSheet[],
  gid: number,
  x: number,
  y: number,
  tilePx: number,
): boolean {
  const hit = resolveTile(gid, sheets);
  if (!hit) return false;
  ctx.drawImage(hit.sheet.img, hit.sx, hit.sy, TILE, TILE, x, y, tilePx, tilePx);
  return true;
}

/** Flat-color fallback when sheets aren't loaded — port of the role table in
 * the client's tilePalette.colorForGid (minus the isometric block set). */
export function colorForGid(gid: number): string {
  const raw = gidMask(gid);
  if (raw === 0) return "#1a221a";
  const ml = raw - MUNDI_FIRST_GID;
  if (ml >= 0 && ml < 64) {
    const colors: Record<number, string> = {
      0: "#dfe8ee", // snow
      1: "#cdd8e2", // packed snow
      2: "#9fc8dc", // ice
      3: "#d8bc72", // dune sand
      4: "#d0b47a", // beach sand
      5: "#8c8478", // scree
      6: "#686664", // ash
      7: "#4c4834", // peat
    };
    return colors[ml] ?? "#3d8c40"; // trees/props — ground shows through
  }
  if (raw >= WATER_ANIM_FIRST_GID && raw < WATER_ANIM_END_GID) return "#2a6dbd";
  const local = raw - BASE_CHIP_FIRST_GID;
  if (local >= 0 && local <= 2) return "#3d8c40"; // grass
  if (local === 5 || (local >= 112 && local < 116) || local === 115) return "#8b6914"; // dirt
  if (local === 256 || local === 52 || local === 7) return "#5a5a62"; // cliff
  if (local >= 116 && local < 128) return "#7a7a88"; // cobble
  if (local === 176) return "#2a6dbd"; // water
  if (local >= 8 && local <= 43) return "#3d8c40"; // trees/bushes over grass
  return "#243024";
}

/** Rasterize the ground GID layer into a world-pixel canvas. */
export function rasterizeGround(
  ground: number[],
  cols: number,
  rows: number,
  tileSize: number,
  sheets: LoadedSheet[],
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, cols * tileSize);
  canvas.height = Math.max(1, rows * tileSize);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;

  const grassFillGid = BASE_CHIP_FIRST_GID + 0;
  const underlayGid = pickGroundUnderlayGid(ground);
  const useSheets = sheets.length > 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const gid = gidMask(ground[i] ?? 0);
      const x = c * tileSize;
      const y = r * tileSize;
      const hit = useSheets && gid > 0 ? resolveTile(gid, sheets) : null;

      // Transparent props (trees, bushes, mundi props) need a ground fill
      // underneath; canopy tops sit on the map's dominant fill.
      if (hit) {
        const under =
          hit.sheet.id === "basechip" || hit.sheet.id === "munditerrain"
            ? isTreeCanopyLocal(hit.sheet.id, hit.local)
              ? underlayGid
              : hit.sheet.id === "munditerrain"
                ? hit.local > MUNDI_FILL_MAX_LOCAL
                  ? underlayGid
                  : 0
                : SOLID_BASECHIP_LOCALS.has(hit.local)
                  ? 0
                  : grassFillGid
            : 0;
        if (under) drawTile(ctx, sheets, under, x, y, tileSize);
      }
      if (!hit || !drawTile(ctx, sheets, gid, x, y, tileSize)) {
        ctx.fillStyle = colorForGid(gid);
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  }
  return canvas;
}

/** Translucent red overlay for blocked cells (collision GID != 0). */
export function rasterizeCollision(
  collision: number[],
  cols: number,
  rows: number,
  tileSize: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, cols * tileSize);
  canvas.height = Math.max(1, rows * tileSize);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "rgba(220, 60, 60, 0.45)";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (gidMask(collision[r * cols + c] ?? 0) !== 0) {
        ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
      }
    }
  }
  return canvas;
}
