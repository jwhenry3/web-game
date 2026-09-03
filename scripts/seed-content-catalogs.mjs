#!/usr/bin/env node
/**
 * Writes data/content/*.json from web/src/editor/seeds/ and built-in prefab templates.
 * Run: npm run seed:content
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(root, "data", "content");
const seedsDir = join(root, "web", "src", "editor", "seeds");

const BASE = 577;
const G = {
  grass: BASE + 48,
  dirt: BASE + 112,
  cliff: BASE + 52,
  cobble: BASE + 116,
  water: BASE + 176,
};

function fill(w, h, gid) {
  return Array(w * h).fill(gid);
}

function fillCollision(w, h, value = 0) {
  return Array(w * h).fill(value);
}

function borderedInterior(w, h, borderGid, interiorGid) {
  const ground = [];
  const collision = [];
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const border = row === 0 || row === h - 1 || col === 0 || col === w - 1;
      ground.push(border ? borderGid : interiorGid);
      collision.push(border ? 1 : 0);
    }
  }
  return { ground, collision };
}

const prefabs = [
  {
    id: "pf-grass-4x4",
    name: "Grass 4×4",
    widthTiles: 4,
    heightTiles: 4,
    ground: fill(4, 4, G.grass),
    collision: fillCollision(4, 4),
    objects: [],
  },
  {
    id: "pf-dirt-path-8x2",
    name: "Dirt Path 8×2",
    widthTiles: 8,
    heightTiles: 2,
    ground: fill(8, 2, G.dirt),
    collision: fillCollision(8, 2),
    objects: [],
  },
  {
    id: "pf-cobble-pad-5x5",
    name: "Cobble Pad 5×5",
    widthTiles: 5,
    heightTiles: 5,
    ground: fill(5, 5, G.cobble),
    collision: fillCollision(5, 5),
    objects: [],
  },
  {
    id: "pf-cliff-wall-8",
    name: "Cliff Wall (8 tiles)",
    widthTiles: 8,
    heightTiles: 1,
    ground: fill(8, 1, G.cliff),
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
    ground: (() => {
      const ground = [];
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          const border = row === 0 || row === 3 || col === 0 || col === 4;
          ground.push(border ? G.grass : G.water);
        }
      }
      return ground;
    })(),
    collision: (() => {
      const collision = [];
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          const border = row === 0 || row === 3 || col === 0 || col === 4;
          collision.push(border ? 0 : 1);
        }
      }
      return collision;
    })(),
    objects: [],
  },
];

function wrap(kind, data) {
  return {
    kind,
    updated_at: new Date().toISOString(),
    data,
  };
}

mkdirSync(contentDir, { recursive: true });
mkdirSync(seedsDir, { recursive: true });

execFileSync("go", ["run", "./cmd/exportcontent", "--out", seedsDir], { cwd: root, stdio: "inherit" });

const entities = JSON.parse(readFileSync(join(seedsDir, "entities.json"), "utf8"));
const items = JSON.parse(readFileSync(join(seedsDir, "items.json"), "utf8"));
const quests = JSON.parse(readFileSync(join(seedsDir, "quests.json"), "utf8"));
const jobs = JSON.parse(readFileSync(join(seedsDir, "jobs.json"), "utf8"));
const skills = JSON.parse(readFileSync(join(seedsDir, "skills.json"), "utf8"));

writeFileSync(join(contentDir, "entities.json"), `${JSON.stringify(wrap("entities", entities), null, 2)}\n`);
writeFileSync(join(contentDir, "prefabs.json"), `${JSON.stringify(wrap("prefabs", prefabs), null, 2)}\n`);
writeFileSync(join(contentDir, "tileset.json"), `${JSON.stringify(wrap("tileset", null), null, 2)}\n`);
writeFileSync(join(contentDir, "items.json"), `${JSON.stringify(wrap("items", items), null, 2)}\n`);
writeFileSync(join(contentDir, "quests.json"), `${JSON.stringify(wrap("quests", quests), null, 2)}\n`);
writeFileSync(join(contentDir, "jobs.json"), `${JSON.stringify(wrap("jobs", jobs), null, 2)}\n`);
writeFileSync(join(contentDir, "skills.json"), `${JSON.stringify(wrap("skills", skills), null, 2)}\n`);

console.log(`Seeded content catalogs in ${contentDir}`);
console.log(`  entities: ${entities.length} templates`);
console.log(`  prefabs:  ${prefabs.length} stamps`);
console.log(`  items:    ${items.length} definitions (${items.filter((i) => i.kind === "consumable").length} consumables, ${items.filter((i) => i.kind === "equipment").length} equipment)`);
console.log(`  quests:   ${quests.length} definitions`);
console.log(`  jobs:     ${jobs.length} definitions`);
console.log(`  skills:   ${skills.length} definitions`);
console.log(`  tileset:  null (built-in base_chip)`);
