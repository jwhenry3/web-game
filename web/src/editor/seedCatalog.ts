import type { EntityDefinition } from "./entities";
import type { ItemDef, JobDef, QuestDef, SkillDef } from "./contentCatalogs";
import type { MapPrefab } from "./prefabs";
import entitySeeds from "./seeds/entities.json";
import itemSeeds from "./seeds/items.json";
import jobSeeds from "./seeds/jobs.json";
import questSeeds from "./seeds/quests.json";
import skillSeeds from "./seeds/skills.json";

const BASE_CHIP_FIRST_GID = 577;
const G = {
  grass: BASE_CHIP_FIRST_GID + 48,
  dirt: BASE_CHIP_FIRST_GID + 112,
  cliff: BASE_CHIP_FIRST_GID + 52,
  cobble: BASE_CHIP_FIRST_GID + 116,
  water: BASE_CHIP_FIRST_GID + 176,
};

function fillGround(widthTiles: number, heightTiles: number, gid: number): number[] {
  return Array(widthTiles * heightTiles).fill(gid);
}

function fillCollision(widthTiles: number, heightTiles: number, value = 0): number[] {
  return Array(widthTiles * heightTiles).fill(value);
}

function borderedInterior(
  widthTiles: number,
  heightTiles: number,
  borderGid: number,
  interiorGid: number,
): { ground: number[]; collision: number[] } {
  const ground: number[] = [];
  const collision: number[] = [];
  for (let row = 0; row < heightTiles; row++) {
    for (let col = 0; col < widthTiles; col++) {
      const border = row === 0 || row === heightTiles - 1 || col === 0 || col === widthTiles - 1;
      ground.push(border ? borderGid : interiorGid);
      collision.push(border ? 1 : 0);
    }
  }
  return { ground, collision };
}

export const DEFAULT_ENTITY_CATALOG = entitySeeds as unknown as EntityDefinition[];
export const DEFAULT_ITEM_CATALOG = itemSeeds as ItemDef[];
export const DEFAULT_QUEST_CATALOG = questSeeds as QuestDef[];
export const DEFAULT_JOB_CATALOG = jobSeeds as JobDef[];
export const DEFAULT_SKILL_CATALOG = skillSeeds as SkillDef[];

export const DEFAULT_PREFAB_CATALOG: MapPrefab[] = [
  {
    id: "pf-grass-4x4",
    name: "Grass 4×4",
    widthTiles: 4,
    heightTiles: 4,
    ground: fillGround(4, 4, G.grass),
    collision: fillCollision(4, 4),
    objects: [],
  },
  {
    id: "pf-dirt-path-8x2",
    name: "Dirt Path 8×2",
    widthTiles: 8,
    heightTiles: 2,
    ground: fillGround(8, 2, G.dirt),
    collision: fillCollision(8, 2),
    objects: [],
  },
  {
    id: "pf-cobble-pad-5x5",
    name: "Cobble Pad 5×5",
    widthTiles: 5,
    heightTiles: 5,
    ground: fillGround(5, 5, G.cobble),
    collision: fillCollision(5, 5),
    objects: [],
  },
  {
    id: "pf-cliff-wall-8",
    name: "Cliff Wall (8 tiles)",
    widthTiles: 8,
    heightTiles: 1,
    ground: fillGround(8, 1, G.cliff),
    collision: fillCollision(8, 1, 1),
    objects: [],
  },
  {
    id: "pf-sanctuary-floor",
    name: "Sanctuary Floor 7×5",
    widthTiles: 7,
    heightTiles: 5,
    ...borderedInterior(7, 5, G.cliff, G.cobble),
    objects: [
      {
        id: 2001,
        name: "save_point",
        type: "save_point",
        x: 3 * 32 + 16,
        y: 2 * 32 + 16,
        width: 0,
        height: 0,
        point: true,
        properties: [
          { name: "id", type: "string", value: "save_point" },
          { name: "name", type: "string", value: "Save Point" },
        ],
      },
    ],
  },
  {
    id: "pf-water-pool-5x4",
    name: "Water Pool 5×4",
    widthTiles: 5,
    heightTiles: 4,
    ...(() => {
      const ground: number[] = [];
      const collision: number[] = [];
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          const border = row === 0 || row === 3 || col === 0 || col === 4;
          ground.push(border ? G.grass : G.water);
          collision.push(border ? 0 : 1);
        }
      }
      return { ground, collision };
    })(),
    objects: [],
  },
];
