/** Pipoya tileset catalog — firstgid layout matches samplemap.tmx / internal/game/pipoya_tilesets.go */

export const PIPOYA_PUBLIC_BASE = "/assets/tilesets/pipoya";

export interface PipoyaTilesetDef {
  id: string;
  name: string;
  firstgid: number;
  tilecount: number;
  columns: number;
  image: string;
  primary?: boolean;
}

export interface PipoyaCatalog {
  id: string;
  name: string;
  tile_size: number;
  public_base: string;
  tilesets: PipoyaTilesetDef[];
}

/** Canonical firstgids from Pipoya sample map (and Dirt for grass-layer GIDs ≥ 5289). */
export const PIPOYA_TILESETS: PipoyaTilesetDef[] = [
  { id: "waterfall", name: "WaterFall_pipo", firstgid: 1, tilecount: 576, columns: 32, image: "WaterFall_pipo.png" },
  { id: "basechip", name: "BaseChip_pipo", firstgid: 577, tilecount: 1064, columns: 8, image: "BaseChip_pipo.png", primary: true },
  { id: "grass", name: "Grass_pipo", firstgid: 1641, tilecount: 528, columns: 8, image: "Grass_pipo.png" },
  { id: "water", name: "Water_pipo", firstgid: 2169, tilecount: 3072, columns: 64, image: "Water_pipo.png" },
  { id: "flower", name: "Flower_pipo", firstgid: 5241, tilecount: 48, columns: 8, image: "Flower_pipo.png" },
  { id: "dirt", name: "Dirt_pipo", firstgid: 5289, tilecount: 336, columns: 8, image: "Dirt_pipo.png" },
];

export const BASE_CHIP_FIRST_GID = 577;

export type LoadedPipoyaSheet = PipoyaTilesetDef & {
  img: HTMLImageElement;
  tileWidth: number;
  tileHeight: number;
};

let loadPromise: Promise<LoadedPipoyaSheet[]> | null = null;
let loadedSheets: LoadedPipoyaSheet[] | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load tileset image ${src}`));
    img.src = src;
  });
}

/** Lazy-load all Pipoya sheets used for overworld GID blitting. */
export function loadPipoyaSheets(base = PIPOYA_PUBLIC_BASE): Promise<LoadedPipoyaSheet[]> {
  if (loadedSheets) return Promise.resolve(loadedSheets);
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all(
    PIPOYA_TILESETS.map(async (def) => {
      const img = await loadImage(`${base}/${def.image}`);
      return {
        ...def,
        img,
        tileWidth: 32,
        tileHeight: 32,
      };
    }),
  ).then((sheets) => {
    // Highest firstgid first so local index resolves to the correct sheet.
    sheets.sort((a, b) => b.firstgid - a.firstgid);
    loadedSheets = sheets;
    return sheets;
  });
  return loadPromise;
}

export function getLoadedPipoyaSheets(): LoadedPipoyaSheet[] | null {
  return loadedSheets;
}

export function resolvePipoyaTile(
  gid: number,
  sheets: LoadedPipoyaSheet[],
): { sheet: LoadedPipoyaSheet; local: number; sx: number; sy: number } | null {
  const raw = gid & 0x1fffffff;
  if (raw <= 0) return null;
  for (const sheet of sheets) {
    if (raw < sheet.firstgid) continue;
    const local = raw - sheet.firstgid;
    if (local < 0 || local >= sheet.tilecount) continue;
    const col = local % sheet.columns;
    const row = Math.floor(local / sheet.columns);
    return {
      sheet,
      local,
      sx: col * sheet.tileWidth,
      sy: row * sheet.tileHeight,
    };
  }
  return null;
}

export function pipoyaBaseChipDef(): PipoyaTilesetDef {
  return PIPOYA_TILESETS.find((t) => t.primary) ?? PIPOYA_TILESETS[1];
}
