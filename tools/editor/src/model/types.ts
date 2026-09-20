// Shared model types for the H99 character editor.
//
// Two documents are edited:
//  - Spec (tools/h99doll.spec.json): slicing params, part rules, layer map,
//    bone positions (spine world coords), animations — the generator input.
//  - Skeleton (h99doll.json): the emitted Spine rig — bones/slots/skins/anims.
// The atlas (h99doll.atlas + .png) holds the region art.

export type Cond = [string, number]; // e.g. ["y<", 18]

export interface SpecSource {
  dir: string;
  frame: number;
  footX: number;
  footY: number;
  pad: number;
  overlap: number;
  atlasWidth: number;
}

export interface SpecLayer {
  name: string;
  /** "auto" = partition via partRules, else fixed part name. */
  part: string;
  partByVariantPrefix?: Record<string, string>;
}

/** A registered appearance part — one attachment variant on one slot. The
 * generator emits this registry; the Catalog tab edits it to add parts
 * without re-slicing the source sheets. */
export interface CatalogEntry {
  /** Attachment key in the slot's skin (e.g. "weapon7_c3"). */
  key: string;
  /** Slot it mounts on (layers may span slots — e.g. weapon_over vs bot). */
  slot: string;
  /** Carry rotation baked into the attachment, degrees. */
  rotation?: number;
  /** Optional display label for the catalog UI. */
  label?: string;
}

export interface SpecBone {
  name: string;
  parent: string | null;
  /** Spine world position (x right, y up, origin at feet). */
  x: number;
  y: number;
}

export interface RotKey {
  time: number;
  value: number;
}
export interface TransKey {
  time: number;
  x: number;
  y: number;
}

export interface BoneTracks {
  rotate?: RotKey[];
  translate?: TransKey[];
}

export interface SpineAnim {
  bones: Record<string, BoneTracks>;
  /** Additive modifier clip: track values are offsets layered on top of the
   * pose produced by lower tracks (mirrors Spine TrackEntry.additive). The
   * flag is ignored by the runtime skeleton parser but survives in the
   * cached JSON, where CharacterSprite picks it up. */
  additive?: boolean;
}

/** A body-morph slider: scales bones by the key value so one rig yields many
 * builds without new templates. Mirrors SHAPE_KEYS in tools/gen_paperdoll.py. */
export interface ShapeKeyDef {
  name: string;
  label?: string;
  /** Region grouping shown as a subheading in the Variants tab. */
  group?: string;
  min: number;
  max: number;
  /** Bones scaled by the key value; axes "x" | "y" | "xy". */
  bones: Record<string, "x" | "y" | "xy">;
  /** Per-bone share of the delta: scale = 1 + (value - 1) * damp (default
   * 1). Lets one key split its growth across regions, e.g. "height" gives
   * legs 60% and the torso 40% so limbs don't over-stretch. */
  damp?: Record<string, number>;
  /** World offset added per (value - 1) — e.g. "height" lifts hips by the
   * legs' grown amount so the feet stay planted on the ground line. */
  translate?: Record<string, { x?: number; y?: number }>;
}

export interface Spec {
  /** Repo-relative generator script; absent = not regenerable (imported rig). */
  generator?: string;
  /** Output binding; name defaults to the spec filename stem. When it names
   * another rig (e.g. a creature preset spec for paperdoll_goblin), the
   * editor loads that rig's assets and this spec acts as a preset view. */
  output?: { dir?: string; name?: string };
  /** Default variant selection applied on load (creature presets). */
  preset?: Partial<VariantSel>;
  /** Morph sliders for runtime body diversity. */
  shapeKeys?: ShapeKeyDef[];
  /** Bones that cancel inherited body-morph scale (weapons keep authored
   * size); their own shape keys still apply. */
  shapeNeutral?: string[];
  source: SpecSource;
  partOrder: string[];
  partRules: { part: string; conds: Cond[] }[];
  layers: SpecLayer[];
  /** Appearance-part registry per layer — mount slot + rotation per variant. */
  catalog?: Record<string, CatalogEntry[]>;
  bones: SpecBone[];
  animations: Record<string, SpineAnim>;
}

export interface SkelBone {
  name: string;
  parent?: string;
  x?: number;
  y?: number;
}

export interface Attachment {
  path?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
}

export interface Skeleton {
  skeleton: Record<string, unknown>;
  bones: SkelBone[];
  slots: { name: string; bone: string; attachment?: string }[];
  skins: { name: string; attachments: Record<string, Record<string, Attachment>> }[];
  animations: Record<string, SpineAnim>;
}

export interface AtlasRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Atlas {
  image: string;
  width: number;
  height: number;
  regions: Map<string, AtlasRegion>;
}

/** Appearance selection — mirrors the game's CharacterAppearance. */
export interface VariantSel {
  skin: string;
  face: string;
  hair: string;
  hairColor: string;
  cloth: string;
  clothColor: string;
  /** Main-hand weapon (weapon_top_* slots — near hand on the paperdoll). */
  weapon: string;
  weaponColor: string;
  /** Sub weapon (weapon_bot_* slots — far hand, behind the body). */
  subWeapon: string;
  subWeaponColor: string;
  /** Creature parts (paperdoll): ear style, horn style, wing style, tail style. */
  ears: string;
  horns: string;
  wings: string;
  tail: string;
  /** Shape key values — bone-scale morphs; absent key = neutral (1.0). */
  shape: Record<string, number>;
}

export const DEFAULT_SEL: VariantSel = {
  skin: "c1",
  face: "c1",
  hair: "m1",
  hairColor: "c2",
  cloth: "cloth1",
  clothColor: "c1",
  weapon: "weapon1",
  weaponColor: "c1",
  subWeapon: "",
  subWeaponColor: "c1",
  ears: "",
  horns: "",
  wings: "",
  tail: "",
  shape: {},
};

// Weapons with palette variants (staff orbs, shield heraldry) key their
// attachments "<weapon>_<color>" — mirrors COLORED_WEAPONS in
// CharacterSprite.ts.
const COLORED_WEAPONS = new Set(["weapon5", "weapon7"]);

function weaponVariantKey(w: string, color: string): string {
  return COLORED_WEAPONS.has(w) ? `${w}_${color}` : w;
}

/** Attachment key for a layer, mirroring CharacterSprite.attachmentForSlot.
 * "" clears the slot; undefined (unknown layer) keeps the slot's default. */
export function variantKeyForLayer(layer: string, sel: VariantSel): string | undefined {
  switch (layer) {
    case "skin":
      return `skin_${sel.skin}`;
    case "face":
      return `face_${sel.face}`;
    case "hair_bot":
    case "hair_top":
      return sel.hair ? `hair_${sel.hair}_${sel.hairColor}` : "";
    case "cloth_bot":
    case "cloth_top":
      return sel.cloth ? `${sel.cloth}_${sel.clothColor}` : "";
    case "weapon_top":
    case "weapon_front":
      if (!sel.weapon) return "";
      return weaponVariantKey(sel.weapon, sel.weaponColor);
    case "weapon_bot":
    case "weapon_over":
      if (!sel.subWeapon) return "";
      return weaponVariantKey(sel.subWeapon, sel.subWeaponColor);
    case "ears":
      return sel.ears ? `ears_${sel.ears}_${sel.skin}` : "";
    case "tail":
      return sel.tail ? `tail_${sel.tail}_${sel.skin}` : "";
    case "horns":
      return sel.horns ? `horns_${sel.horns}` : "";
    case "wings":
      return sel.wings ? `wings_${sel.wings}` : "";
    default:
      return undefined;
  }
}
