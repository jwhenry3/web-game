export type TileRole = "grass" | "dirt" | "cliff" | "cobble" | "water" | "unset";

export interface ImportedTileset {
  id: string;
  name: string;
  imageDataUrl: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tileCount: number;
  firstGid: number;
  roles: Record<string, TileRole>;
}

const STORAGE_KEY = "ffv_editor_tileset";

export function loadTileset(): ImportedTileset | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImportedTileset;
  } catch {
    return null;
  }
}

export function saveTileset(config: ImportedTileset | null) {
  if (!config) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export async function importTilesetFromFile(file: File): Promise<ImportedTileset> {
  const imageDataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(imageDataUrl);
  const tileWidth = 32;
  const tileHeight = 32;
  const columns = Math.max(1, Math.floor(img.width / tileWidth));
  const rows = Math.max(1, Math.floor(img.height / tileHeight));
  const tileCount = columns * rows;
  return {
    id: `ts-${Date.now()}`,
    name: file.name.replace(/\.[^.]+$/, ""),
    imageDataUrl,
    tileWidth,
    tileHeight,
    columns,
    tileCount,
    firstGid: 577,
    roles: {},
  };
}

export function setTileRole(config: ImportedTileset, localIndex: number, role: TileRole): ImportedTileset {
  return {
    ...config,
    roles: { ...config.roles, [String(localIndex)]: role },
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export const TILE_ROLE_OPTIONS: { value: TileRole; label: string }[] = [
  { value: "unset", label: "Unset" },
  { value: "grass", label: "Grass" },
  { value: "dirt", label: "Dirt / Path" },
  { value: "cliff", label: "Cliff" },
  { value: "cobble", label: "Cobble" },
  { value: "water", label: "Water" },
];
