// Procedural equipment/item models + rig attachment.
//
// Every item definition gets a real 3D presence: `equipmentModel` builds a
// standalone display model (ground drop / preview) and `equipmentMounts`
// returns the bone→piece placements so the same item can be worn/held on a
// rig. Which model an item uses comes from `data.model` — an explicit model
// id from ITEM_MODEL_IDS — or, when unset, derived from slot + weaponType.
// Weapon pieces use the same dimensions and grip convention as the rig's
// built-in weapon parts (armLoR fist, −55° tilt) so held items match the
// doll's own weapon silhouettes. Item `data.attachment` may override the
// target bone.

import * as THREE from "three";
import type { Vec3 } from "./scene3d";

export interface EquipmentSpec {
  /** Equip slot: weapon|head|chest|legs|hands|feet|back — or any other item kind. */
  slot?: string;
  /** Explicit model id from ITEM_MODEL_IDS — overrides the slot-derived model. */
  model?: string;
  /** sword|katana|axe|hammer|mace|dagger|spear|staff|wand|knuckles|shield */
  weaponType?: string;
  /** bronze|iron|steel|silver|mythril|worn|starter — parsed from the item id. */
  material?: string;
  /** light|medium|heavy — picks leather vs plate silhouettes for armor. */
  armorClass?: string;
  /** Rarity/fx accent for gems, orbs, and trims. */
  accent?: number;
}

/** One piece of an item parented to a rig bone. */
export interface EquipmentMount {
  bone: string;
  object: THREE.Object3D;
}

export const WEAPON_MODEL_IDS = ["sword", "katana", "axe", "hammer", "dagger", "spear", "staff", "wand", "knuckles", "shield"] as const;
export const ARMOR_MODEL_IDS = ["helmet", "cuirass", "legguards", "gloves", "boots", "cape"] as const;
export const ITEM_MODEL_IDS = [...WEAPON_MODEL_IDS, ...ARMOR_MODEL_IDS, "flask", "gem"] as const;
export type ItemModelId = (typeof ITEM_MODEL_IDS)[number];

const SLOT_MODEL: Record<string, ItemModelId> = {
  head: "helmet", chest: "cuirass", legs: "legguards",
  hands: "gloves", feet: "boots", back: "cape",
};

const METAL: Record<string, number> = {
  bronze: 0xb08954, iron: 0x9ea4ac, steel: 0xc4cbd3, silver: 0xdfe5ea,
  mythril: 0x8fd8cf, worn: 0x8a7a63, starter: 0x9a8a72,
};
const WOOD = 0x6b5233, LEATHER = 0x7a5c3d, HILT = 0x5a4632, TRIM = 0x8a7a4d;

/** Tier the item belongs to, from its id prefix (bronze_axe → bronze). */
export function itemMaterial(id: string): string {
  const head = id.split(/[_-]/)[0];
  return head in METAL ? head : "iron";
}

/** The model an item renders as — explicit `model` wins, then slot/weaponType. */
export function modelIdFor(spec: EquipmentSpec): ItemModelId {
  if (spec.model && (ITEM_MODEL_IDS as readonly string[]).includes(spec.model)) return spec.model as ItemModelId;
  if (spec.slot === "weapon")
    return (WEAPON_MODEL_IDS as readonly string[]).includes(spec.weaponType ?? "") ? spec.weaponType as ItemModelId : "sword";
  return SLOT_MODEL[spec.slot ?? ""] ?? "flask";
}

function mesh(geo: THREE.BufferGeometry, color: number, extra: { emissive?: number } = {}): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .8, flatShading: true });
  if (extra.emissive) { mat.emissive = new THREE.Color(color); mat.emissiveIntensity = extra.emissive; }
  const m = new THREE.Mesh(geo);
  m.material = mat;
  m.castShadow = true;
  return m;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number) => new THREE.CylinderGeometry(rt, rb, h, 8);
const sph = (r: number) => new THREE.SphereGeometry(r, 10, 8);
const cone = (r: number, h: number, segments = 6) => new THREE.ConeGeometry(r, h, segments);

function at(o: THREE.Object3D, p: Vec3, r: Vec3 = [0, 0, 0], s: Vec3 = [1, 1, 1]): THREE.Object3D {
  o.position.set(p[0], p[1], p[2]);
  o.rotation.set(THREE.MathUtils.degToRad(r[0]), THREE.MathUtils.degToRad(r[1]), THREE.MathUtils.degToRad(r[2]));
  o.scale.set(s[0], s[1], s[2]);
  return o;
}

function metal(spec: EquipmentSpec): number { return METAL[spec.material ?? ""] ?? METAL.iron; }
const armorMetal = (spec: EquipmentSpec) => spec.armorClass === "light" ? LEATHER : metal(spec);

// --- model builders — each piece is centered at its mount origin ---------------
// Weapons: grip at origin, blade along +y. Armor: centered on the bone's
// anchor point. Display/mount transforms are applied by the callers.

const BUILDERS: Record<ItemModelId, (spec: EquipmentSpec) => THREE.Object3D> = {
  sword: spec => group(
    mesh(cyl(.02, .024, .13), HILT).translateY(.02),
    mesh(box(.13, .028, .04), TRIM).translateY(.1),
    mesh(box(.045, .38, .012), metal(spec)).translateY(.33)),
  katana: spec => group(
    mesh(cyl(.018, .02, .16), HILT).translateY(.03),
    mesh(cyl(.045, .045, .015), TRIM).translateY(.11),
    mesh(box(.035, .42, .012), metal(spec)).translateY(.33)),
  axe: spec => group(
    mesh(cyl(.02, .024, .34), WOOD).translateY(.12),
    mesh(box(.17, .09, .035), metal(spec)).translateY(.27)),
  hammer: spec => group(
    mesh(cyl(.02, .024, .34), WOOD).translateY(.12),
    mesh(box(.09, .11, .09), metal(spec)).translateY(.28)),
  dagger: spec => group(
    mesh(cyl(.018, .022, .08), HILT).translateY(.01),
    mesh(box(.035, .19, .01), metal(spec)).translateY(.16)),
  spear: spec => group(
    mesh(cyl(.016, .02, .74), WOOD).translateY(.27),
    mesh(cone(.04, .16), metal(spec)).translateY(.66)),
  staff: spec => group(
    mesh(cyl(.02, .026, .56), WOOD).translateY(.2),
    mesh(cyl(.032, .032, .05), TRIM).translateY(.45),
    mesh(sph(.055), spec.accent ?? metal(spec), { emissive: .5 }).translateY(.52)),
  wand: spec => group(
    mesh(cyl(.014, .02, .3), WOOD).translateY(.1),
    mesh(sph(.045), spec.accent ?? metal(spec), { emissive: .5 }).translateY(.29)),
  knuckles: spec => group(
    mesh(box(.14, .05, .05), metal(spec)).translateY(.02),
    mesh(box(.15, .02, .06), metal(spec)).translateY(.06)),
  shield: spec => group(
    mesh(box(.05, .36, .32), TRIM).translateY(.12),
    mesh(sph(.05), metal(spec)).translateX(-.04).translateY(.12)),
  helmet: spec => {
    const g = group(
      at(mesh(sph(.26), armorMetal(spec)), [0, .03, 0], [0, 0, 0], [1, .85, 1]),
      at(mesh(box(.34, .04, .04), TRIM), [0, .05, .2]));
    if (spec.armorClass === "heavy") g.add(at(mesh(box(.05, .18, .26), spec.accent ?? TRIM), [0, .2, -.02]));
    return g;
  },
  cuirass: spec => group(
    mesh(new THREE.CapsuleGeometry(.26, .34, 4, 10), armorMetal(spec)),
    at(mesh(sph(.14), TRIM), [-.3, .24, 0]),
    at(mesh(sph(.14), TRIM), [.3, .24, 0])),
  legguards: spec => mesh(cyl(.1, .11, .44), armorMetal(spec)),
  gloves: spec => mesh(sph(.1), armorMetal(spec)),
  boots: spec => mesh(box(.2, .17, .32), armorMetal(spec)),
  cape: spec => group(
    at(mesh(cone(.38, .85, 4), spec.accent ?? 0x54606e), [0, -.42, 0], [0, 45, 0], [1, 1, .35]),
    at(mesh(box(.5, .06, .08), TRIM), [0, 0, 0])),
  flask: spec => group(
    at(mesh(sph(.14), spec.accent ?? 0x7fb3c8, { emissive: .35 }), [0, .14, 0], [0, 0, 0], [1, 1.15, 1]),
    at(mesh(cyl(.035, .05, .1), HILT), [0, .3, 0])),
  gem: spec => at(mesh(new THREE.DodecahedronGeometry(.16), spec.accent ?? 0x9aa4ad, { emissive: .25 }), [0, .18, 0]),
};

function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(...children);
  return g;
}

// --- public API ----------------------------------------------------------------

/** Paired models render twice — once per limb. */
const PAIRED = new Set<ItemModelId>(["legguards", "gloves", "boots"]);

/**
 * Standalone display model for an item — upright, origin at the ground.
 * Paired pieces render side by side.
 */
export function equipmentModel(spec: EquipmentSpec): THREE.Group {
  const id = modelIdFor(spec);
  const build = () => BUILDERS[id](spec);
  if (id === "helmet") return group(at(build(), [0, .3, 0]));
  if (id === "cuirass") return group(at(build(), [0, .82, 0]));
  if (id === "legguards") return group(at(build(), [-.16, .4, 0]), at(build(), [.16, .4, 0]));
  if (id === "gloves") return group(at(build(), [-.12, .1, 0]), at(build(), [.12, .1, 0]));
  if (id === "boots") return group(at(build(), [-.14, .09, 0]), at(build(), [.14, .09, 0]));
  if (id === "cape") return group(at(build(), [0, .75, 0]));
  if (PAIRED.has(id)) return group(at(build(), [-.14, .1, 0]), at(build(), [.14, .1, 0]));
  return group(at(build(), [0, (WEAPON_MODEL_IDS as readonly string[]).includes(id) ? .12 : 0, 0]));
}

/** Bone + local transform per slot (left/right for paired pieces). */
const MOUNTS: Record<string, { bones: string[]; position: Vec3; rotation?: Vec3 }> = {
  weapon: { bones: ["armLoR"], position: [0, -.2, 0], rotation: [-55, 0, 0] },
  head: { bones: ["head"], position: [0, .02, 0] },
  chest: { bones: ["root"], position: [0, .82, 0] },
  legs: { bones: ["legL", "legR"], position: [0, -.18, 0] },
  hands: { bones: ["armLoL", "armLoR"], position: [0, -.2, 0] },
  feet: { bones: ["legLoL", "legLoR"], position: [0, -.05, .035] },
  back: { bones: ["root"], position: [0, .9, -.18] },
};

/**
 * Bone placements so a rig can wear/hold the item. Weapons grip in the
 * main-hand fist with the same −55° tilt the rig's built-in weapon parts use;
 * armor mounts on the matching limb bones so pieces follow walk/attack
 * animation. `attachment` overrides the bone (rig bone name); `model`
 * overrides which model is mounted.
 */
export function equipmentMounts(spec: EquipmentSpec & { attachment?: string }): EquipmentMount[] {
  const id = modelIdFor(spec);
  const build = () => BUILDERS[id](spec);
  if (spec.attachment && spec.attachment !== spec.slot)
    return [{ bone: spec.attachment, object: build() }];
  const mount = MOUNTS[spec.slot ?? ""];
  if (!mount)
    return [{ bone: "armLoR", object: at(build(), [0, -.2, 0], [-55, 0, 0]) }];
  return mount.bones.map(bone => ({ bone, object: at(build(), mount.position, mount.rotation ?? [0, 0, 0]) }));
}

/** Parent mounts onto a rig's bone map; returns a detach function. */
export function attachEquipment(bones: Map<string, THREE.Object3D>, mounts: EquipmentMount[]): () => void {
  const placed: { bone: THREE.Object3D; object: THREE.Object3D }[] = [];
  for (const mount of mounts) {
    const target = bones.get(mount.bone);
    if (!target) continue;
    target.add(mount.object);
    placed.push({ bone: target, object: mount.object });
  }
  return () => { for (const p of placed) p.bone.remove(p.object); };
}
