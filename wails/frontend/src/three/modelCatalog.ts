/** Curated public model paths (served from /models via Vite public/). */

export const MODELS = {
  characters: {
    self: "models/characters/Knight.glb",
    player: "models/characters/Ranger.glb",
    mage: "models/characters/Mage.glb",
    rogue: "models/characters/Rogue.glb",
    barbarian: "models/characters/Barbarian.glb",
  },
  enemies: {
    default: "models/enemies/Enemy.gltf",
    goblin: "models/enemies/Enemy.gltf",
    wolf: "models/enemies/Crab.gltf",
    skeleton: "models/enemies/Skull.gltf",
    bat: "models/enemies/Bee.gltf",
  },
  nature: {
    treeHigh: ["models/nature/TreeHigh001.glb", "models/nature/TreeHigh002.glb"],
    treeMed: ["models/nature/TreeMed001.glb", "models/nature/TreeMed002.glb"],
    treeLow: ["models/nature/TreeLow001.glb", "models/nature/TreeLow002.glb"],
    rock: ["models/nature/Rock001.glb", "models/nature/Rock002.glb"],
    bush: ["models/nature/Bush001.glb", "models/nature/Bush002.glb"],
    grass: ["models/nature/Grass001.glb", "models/nature/Grass002.glb"],
  },
  pois: {
    save: "models/pickups/Gem_Blue.gltf",
    saveActive: "models/pickups/Gem_Pink.gltf",
    job: "models/props/Dummy.gltf",
    camp: "models/props/Stall_Empty.gltf",
    campAlt: "models/town/cart-high.glb",
  },
  house: {
    furniture: "models/props/Crate_Wooden.gltf",
    chair: "models/props/Chair_1.gltf",
    bed: "models/props/Bed_Twin1.gltf",
    table: "models/props/Table_Large.gltf",
    barrel: "models/props/Barrel.gltf",
    chest: "models/props/Chest_Wood.gltf",
    workbench: "models/props/Workbench.gltf",
    door: "models/town/wall-wood-door.glb",
    storage: "models/props/Chest_Wood.gltf",
  },
  battle: {
    arenaProp: "models/town/pillar-stone.glb",
  },
} as const;

/** Target world-unit heights after normalize (map pixels ≈ world units). */
export const MODEL_HEIGHT = {
  character: 36,
  enemy: 28,
  pet: 16,
  save: 30,
  job: 34,
  camp: 40,
  furniture: 18,
  treeHigh: 90,
  treeMed: 64,
  treeLow: 40,
  rock: 18,
  bush: 16,
} as const;
