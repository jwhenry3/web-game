import * as THREE from "three";
import { campSkinById } from "../housing/campSkins";
import { MODELS, MODEL_HEIGHT } from "./modelCatalog";
import { attachModel, pickVariant } from "./modelLoader";
import { createAnimatedCharacter } from "./characterAnim";

const matCache = new Map<string, THREE.MeshStandardMaterial>();

function mat(color: number, opts?: { roughness?: number; metalness?: number; emissive?: number }): THREE.MeshStandardMaterial {
  const key = `${color}|${opts?.roughness ?? 0.7}|${opts?.metalness ?? 0.05}|${opts?.emissive ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts?.roughness ?? 0.7,
      metalness: opts?.metalness ?? 0.05,
      emissive: opts?.emissive ?? 0,
      emissiveIntensity: opts?.emissive ? 0.35 : 0,
    });
    matCache.set(key, m);
  }
  return m;
}

/** KayKit adventurer with idle/walk (see characterAnim). */
export function createCharacterMesh(opts?: { accent?: number; self?: boolean }): THREE.Group {
  void opts?.accent;
  return createAnimatedCharacter({ self: opts?.self });
}

const ENEMY_URL: Record<string, string> = {
  goblin: MODELS.enemies.goblin,
  dire_wolf: MODELS.enemies.wolf,
  stone_imp: MODELS.enemies.skeleton,
  default: MODELS.enemies.default,
};

export function createEnemyMesh(kind: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(14, 0), mat(0xc07050, { metalness: 0.2 }));
  body.position.y = 16;
  g.add(body);
  const url = ENEMY_URL[kind] ?? ENEMY_URL.default!;
  void attachModel(g, url, MODEL_HEIGHT.enemy, { yawOffset: Math.PI });
  return g;
}

export function createPetMesh(kind: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(8, 0), mat(0xc07050));
  body.position.y = 8;
  g.add(body);
  const url = ENEMY_URL[kind] ?? ENEMY_URL.default!;
  void attachModel(g, url, MODEL_HEIGHT.pet, { yawOffset: Math.PI });
  return g;
}

export function createSavePointMesh(active: boolean): THREE.Group {
  const g = new THREE.Group();
  const color = active ? 0xffe9a8 : 0xa8e8ff;
  const crystal = new THREE.Mesh(new THREE.ConeGeometry(10, 28, 4), mat(color, { metalness: 0.4, emissive: color }));
  crystal.position.y = 14;
  g.add(crystal);
  void attachModel(g, active ? MODELS.pois.saveActive : MODELS.pois.save, MODEL_HEIGHT.save);
  return g;
}

export function createJobChangerMesh(): THREE.Group {
  const g = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 26, 8), mat(0xe8c96a, { metalness: 0.35 }));
  pillar.position.y = 13;
  g.add(pillar);
  void attachModel(g, MODELS.pois.job, MODEL_HEIGHT.job, { yawOffset: Math.PI });
  return g;
}

export function createCampMesh(skinId?: string | null): THREE.Group {
  const p = campSkinById(skinId);
  const g = new THREE.Group();
  const tent = new THREE.Mesh(new THREE.ConeGeometry(22, 36, 4), mat(p.outer));
  tent.position.y = 20;
  g.add(tent);
  // Market stall stand-in for camp tent until dedicated tent art lands.
  void attachModel(g, MODELS.pois.camp, MODEL_HEIGHT.camp, { yawOffset: Math.PI });
  return g;
}

export function createFurnitureMesh(variant?: "crate" | "chair" | "bed" | "table" | "barrel" | "chest" | "workbench"): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(20, 14, 16), mat(0x8a6030));
  box.position.y = 7;
  g.add(box);
  const url =
    variant === "chair"
      ? MODELS.house.chair
      : variant === "bed"
        ? MODELS.house.bed
        : variant === "table"
          ? MODELS.house.table
          : variant === "barrel"
            ? MODELS.house.barrel
            : variant === "chest"
              ? MODELS.house.chest
              : variant === "workbench"
                ? MODELS.house.workbench
                : MODELS.house.furniture;
  void attachModel(g, url, MODEL_HEIGHT.furniture, { yawOffset: Math.PI });
  return g;
}

export function createHousePoiMesh(kind: string): THREE.Group {
  const g = new THREE.Group();
  const isDoor = kind === "door";
  const body = new THREE.Mesh(
    isDoor ? new THREE.BoxGeometry(18, 28, 6) : new THREE.BoxGeometry(22, 14, 16),
    mat(isDoor ? 0x4a6038 : 0x8a6030),
  );
  body.position.y = isDoor ? 14 : 7;
  g.add(body);
  void attachModel(g, isDoor ? MODELS.house.door : MODELS.house.storage, isDoor ? 32 : MODEL_HEIGHT.furniture, {
    yawOffset: Math.PI,
  });
  return g;
}

export function createNatureProp(kind: "treeHigh" | "treeMed" | "treeLow" | "rock" | "bush", seed = 0): THREE.Group {
  const g = new THREE.Group();
  const heights = {
    treeHigh: MODEL_HEIGHT.treeHigh,
    treeMed: MODEL_HEIGHT.treeMed,
    treeLow: MODEL_HEIGHT.treeLow,
    rock: MODEL_HEIGHT.rock,
    bush: MODEL_HEIGHT.bush,
  };
  const urls = MODELS.nature[kind];
  const url = pickVariant(urls, seed);
  const stub = new THREE.Mesh(new THREE.ConeGeometry(6, 20, 5), mat(0x3a6a38));
  stub.position.y = 10;
  g.add(stub);
  if (url) void attachModel(g, url, heights[kind]);
  return g;
}

/** Flat ground from overworld cell colors (placeholder until real terrain). */
export function createTerrainMesh(
  cols: number,
  rows: number,
  tile: number,
  cells: string,
  fill: Record<string, number>,
): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = cells[r * cols + c] ?? "#";
      const hex = fill[ch] ?? 0x3a3a40;
      const i = (r * cols + c) * 4;
      img.data[i] = (hex >> 16) & 0xff;
      img.data[i + 1] = (hex >> 8) & 0xff;
      img.data[i + 2] = hex & 0xff;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(cols * tile, rows * tile, 1, 1);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((cols * tile) / 2, 0, (rows * tile) / 2);
  mesh.receiveShadow = true;
  return mesh;
}

export function createBattleArenaMesh(w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    mat(0x1a2840, { roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(Math.min(w, d) * 0.42, 3, 8, 48),
    mat(0x3a5080, { emissive: 0x102040 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1;
  g.add(floor, rim);
  return g;
}
