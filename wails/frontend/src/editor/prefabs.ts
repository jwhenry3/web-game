import type { EditorObject } from "./editorTypes";
import { cloneObjects } from "./editorObjects";
import { newObjectId } from "./editorTypes";
import { blankGrassLayers, gidForRole } from "./tilePalette";
import type { ImportedTileset } from "./tilesetConfig";

export interface MapPrefab {
  id: string;
  name: string;
  widthTiles: number;
  heightTiles: number;
  ground: number[];
  collision: number[];
  objects: EditorObject[];
}

const STORAGE_KEY = "ffv_map_prefabs";

export function loadPrefabs(): MapPrefab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MapPrefab[];
  } catch {
    return [];
  }
}

export function savePrefabs(prefabs: MapPrefab[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefabs));
}

export function createEmptyPrefab(
  name: string,
  widthTiles: number,
  heightTiles: number,
  tileset: ImportedTileset | null,
): MapPrefab {
  const w = Math.max(1, widthTiles);
  const h = Math.max(1, heightTiles);
  const blank = blankGrassLayers(w, h, tileset);
  return {
    id: `pf-${Date.now()}`,
    name,
    widthTiles: w,
    heightTiles: h,
    ground: blank.ground,
    collision: blank.collision,
    objects: [],
  };
}

export function clonePrefab(prefab: MapPrefab): MapPrefab {
  return {
    ...prefab,
    ground: [...prefab.ground],
    collision: [...prefab.collision],
    objects: cloneObjects(prefab.objects),
  };
}

export function resizePrefab(
  prefab: MapPrefab,
  widthTiles: number,
  heightTiles: number,
  tileset: ImportedTileset | null,
): MapPrefab {
  const w = Math.max(1, widthTiles);
  const h = Math.max(1, heightTiles);
  const grassGid = gidForRole("grass", tileset);
  const ground = Array(w * h).fill(grassGid);
  const collision = Array(w * h).fill(0);
  const ow = prefab.widthTiles;
  const oh = prefab.heightTiles;
  for (let r = 0; r < Math.min(h, oh); r++) {
    for (let c = 0; c < Math.min(w, ow); c++) {
      const si = r * ow + c;
      const di = r * w + c;
      ground[di] = prefab.ground[si];
      collision[di] = prefab.collision[si];
    }
  }
  const objects = cloneObjects(prefab.objects);
  return { ...prefab, widthTiles: w, heightTiles: h, ground, collision, objects };
}

export function capturePrefabFromMap(
  name: string,
  col0: number,
  row0: number,
  col1: number,
  row1: number,
  cols: number,
  rows: number,
  ground: number[],
  collision: number[],
  objects: EditorObject[],
): MapPrefab {
  const minC = Math.max(0, Math.min(col0, col1));
  const maxC = Math.min(cols - 1, Math.max(col0, col1));
  const minR = Math.max(0, Math.min(row0, row1));
  const maxR = Math.min(rows - 1, Math.max(row0, row1));
  const w = maxC - minC + 1;
  const h = maxR - minR + 1;
  const g: number[] = [];
  const c: number[] = [];
  for (let r = minR; r <= maxR; r++) {
    for (let tc = minC; tc <= maxC; tc++) {
      const i = r * cols + tc;
      g.push(ground[i]);
      c.push(collision[i]);
    }
  }
  const ts = 32;
  const ox = minC * ts;
  const oy = minR * ts;
  const capturedObjects: EditorObject[] = [];
  for (const o of objects) {
    if (o.point) {
      const cc = Math.floor(o.x / ts);
      const cr = Math.floor(o.y / ts);
      if (cc >= minC && cc <= maxC && cr >= minR && cr <= maxR) {
        capturedObjects.push({
          ...o,
          id: newObjectId(),
          x: o.x - ox,
          y: o.y - oy,
          properties: [...o.properties],
        });
      }
      continue;
    }
    const maxX = o.x + o.width;
    const minY = o.y - o.height;
    const maxY = o.y;
    if (maxX < ox || o.x > ox + w * ts || maxY < oy || minY > oy + h * ts) continue;
    capturedObjects.push({
      ...o,
      id: newObjectId(),
      x: o.x - ox,
      y: o.y - oy,
      properties: [...o.properties],
    });
  }
  return {
    id: `pf-${Date.now()}`,
    name,
    widthTiles: w,
    heightTiles: h,
    ground: g,
    collision: c,
    objects: capturedObjects,
  };
}

export function stampPrefab(
  prefab: MapPrefab,
  originCol: number,
  originRow: number,
  cols: number,
  rows: number,
  ground: number[],
  collision: number[],
  objects: EditorObject[],
) {
  const ts = 32;
  const ox = originCol * ts;
  const oy = originRow * ts;
  for (let r = 0; r < prefab.heightTiles; r++) {
    for (let c = 0; c < prefab.widthTiles; c++) {
      const tc = originCol + c;
      const tr = originRow + r;
      if (tc < 0 || tr < 0 || tc >= cols || tr >= rows) continue;
      const di = r * prefab.widthTiles + c;
      const mi = tr * cols + tc;
      ground[mi] = prefab.ground[di];
      collision[mi] = prefab.collision[di];
    }
  }
  for (const o of prefab.objects) {
    const copy = cloneObjects([o])[0];
    copy.id = newObjectId();
    copy.x += ox;
    copy.y += oy;
    if (copy.name && !copy.properties.some((p) => p.name === "id")) {
      copy.properties.push({ name: "id", type: "string", value: copy.name });
    }
    objects.push(copy);
  }
}
