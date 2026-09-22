/** Heroes 99 v1.2 sprite configuration (AU_pixel / Clockwork Raven Studios). */

export const H99_BASE = "/assets/heroes99";

export const H99_SHEET = {
  frameWidth: 100,
  frameHeight: 40,
  columns: 8,
  width: 800,
  height: 680,
} as const;

/** Layer draw order (bottom → top). */
export const H99_LAYER_ORDER = [
  "skin",
  "cloth_bot",
  "hair_bot",
  "face",
  "cloth_top",
  "hair_top",
  "weapon_bot",
  "weapon_top",
] as const;

export type H99LayerId = (typeof H99_LAYER_ORDER)[number];

/** Frame numbers from the Heroes 99 frame guide (1-based); converted to 0-based sheet indices. */
function frames(...nums: number[]): number[] {
  return nums.map((n) => n - 1);
}

export type CharacterAnim = "idle" | "run" | "attack";

/** Heroes 99 sheets are side-view: art faces right; mirror with flipX for left. */
export type CharacterFacing = "left" | "right";

export const H99_FACING_DEFAULT: CharacterFacing = "right";

/** Ground contact X in source pixels (composite idle, east-facing). */
export const H99_FOOT_PX = 39.5;

/** Flip pivot at the foot so left/right mirrors stay grounded on the entity position. */
export const H99_ORIGIN = {
  x: H99_FOOT_PX / H99_SHEET.frameWidth,
  y: (33 + 1) / H99_SHEET.frameHeight,
} as const;

/** Layer origin X — mirror the foot pivot when flipped so both facings stay grounded. */
export function layerOriginX(facing: CharacterFacing): number {
  return facing === "left" ? 1 - H99_ORIGIN.x : H99_ORIGIN.x;
}

/** Layer X offset after flip — zero when origin is mirrored per facing. */
export function layerOffsetX(_facing: CharacterFacing): number {
  return 0;
}

/**
 * Sheet layout (800×680, 8×17 grid of 100×40 cells).
 * Frame numbers in the guide are 1-based; we store 0-based sheet indices.
 * Row 1 (frames 9–14): walk stride. Row 2 (frames 17–24): run cycle.
 * Indices 14–15 are blank padding between rows — never include them.
 */
export const H99_ANIMS: Record<CharacterAnim, { frames: number[]; msPerFrame: number }> = {
  idle: { frames: frames(1, 2, 3, 4, 5, 6), msPerFrame: 140 },
  run: { frames: frames(17, 18, 19, 20, 21, 22, 23, 24), msPerFrame: 80 },
  attack: { frames: frames(37, 38, 39, 40, 41, 42), msPerFrame: 80 },
};

/** Update facing only when there is horizontal input; vertical-only movement keeps last facing. */
export function facingFromDelta(dx: number, current: CharacterFacing): CharacterFacing {
  if (dx < 0) return "left";
  if (dx > 0) return "right";
  return current;
}

/**
 * Deadbanded facing axis for replicated motion deltas. On a screen-vertical
 * (iso-diagonal) step dx−dy is pure float noise, which would flip the facing
 * every frame — return 0 (hold current facing) unless the horizontal share
 * is a real fraction of the step. ~0.35 ≈ 20° off screen-vertical.
 */
export function moveFacingAxis(dx: number, dy: number, iso = false): number {
  const axis = iso ? dx - dy : dx;
  const len = Math.hypot(dx, dy);
  return len > 0 && Math.abs(axis) > len * 0.35 ? axis : 0;
}

/**
 * World-space motion delta → facing along the rendered horizontal axis.
 * Under the isometric projection screen x = dx − dy, so world ±y motion
 * (up-right / down-left on screen) still picks a side.
 */
export function facingFromMotion(
  dx: number,
  dy: number,
  current: CharacterFacing,
  iso = false,
): CharacterFacing {
  return facingFromDelta(moveFacingAxis(dx, dy, iso), current);
}

/**
 * Map-space yaw (wire facing, radians; dir = (−sin yaw, −cos yaw)) → the
 * 2-way sheet facing matching its rendered horizontal direction.
 */
export function facingFromYaw(
  yaw: number,
  current: CharacterFacing,
  iso = false,
): CharacterFacing {
  if (!Number.isFinite(yaw)) return current;
  return facingFromMotion(-Math.sin(yaw), -Math.cos(yaw), current, iso);
}

export function facingToFlipX(facing: CharacterFacing): boolean {
  return facing === "left";
}

/** In-world display scale (100×40 source frames → 200×80 px at 2.0 — the
 * doll rigs' art is drawn at 2px per cell unit, so this renders it at its
 * native pixel size instead of downscaled). */
export const H99_DISPLAY_SCALE = 2.0;

export const H99_DISPLAY_WIDTH = H99_SHEET.frameWidth * H99_DISPLAY_SCALE;
export const H99_DISPLAY_HEIGHT = H99_SHEET.frameHeight * H99_DISPLAY_SCALE;
/**
 * Feet-centered collision circle. Deliberately NOT derived from display
 * scale — it must stay under half a 32px tile so 1-tile lanes between
 * blocked cells stay passable regardless of how large sprites render.
 */
export const H99_COLLISION_RADIUS = 15;
export const H99_NAME_LABEL_Y = -(H99_DISPLAY_HEIGHT + 10);
/** Selection / status rings sized to the sprite footprint. */
export const H99_WORLD_RING_RADIUS = H99_DISPLAY_HEIGHT * 0.64;
/** Ring center Y in foot-local space — the ground plane under the feet. */
export const H99_WORLD_RING_Y = 0;
export const H99_BATTLE_RING_RADIUS = H99_DISPLAY_HEIGHT * 0.72;

export const H99_SKINS = ["c1", "c2", "c3", "c4", "c5", "c6"] as const;
export const H99_FACES = [
  // Extracted MapleStory face sprites (paperdoll only) — baked eye art,
  // not recolorable. Dev/placeholder art, not shippable as-is.
  "ms1", "ms2", "ms3", "ms4", "ms5", "ms6", "ms7",
  "ms8", "ms9", "ms10", "ms11", "ms12", "ms13", "ms14",
] as const;
export const H99_HAIR_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10"] as const;
export const H99_CLOTH_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;
export const H99_WEAPON_COLORS = ["c1", "c2", "c3", "c4"] as const;

export const H99_HAIR_STYLES = [
  "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9",
  "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12", "m13", "m14",
  // Rigged styles authored in the editor's Hair workspace (paperdoll only —
  // they resolve to nothing on the h99 rig).
  "short_spikey", "short_combover", "tall_spikey", "long_wavy",
] as const;

export const H99_CLOTH_STYLES = [
  "cloth1", "cloth2", "cloth3", "cloth4", "cloth5", "cloth6", "cloth7", "cloth8",
  "cloth9", "cloth10", "cloth11", "cloth12", "cloth13", "cloth14", "cloth15", "cloth16", "cloth17",
] as const;

export const H99_WEAPONS = ["weapon1", "weapon2", "weapon3", "weapon4", "weapon5"] as const;
export const PAPERDOLL_BODY_OBJECTS = ["", "bodyObject_1", "bodyObject_2", "bodyObject_3", "bodyObject_4", "bodyObject_5"] as const;
export const PAPERDOLL_CLOAK_OBJECTS = ["", "cloakObject_1", "cloakObject_2", "cloakObject_3", "cloakObject_4"] as const;
export const PAPERDOLL_HEAD_OBJECTS = ["", "headObject_1", "headObject_2", "headObject_3", "headObject_4", "headObject_5"] as const;
export const PAPERDOLL_HAND_OBJECTS = ["", "handObject_1", "handObject_2", "handObject_3", "handObject_4", "handObject_5"] as const;

export interface CharacterAppearance {
  skin: string;
  face: string;
  hair: string;
  hairColor: string;
  cloth: string;
  clothColor: string;
  weapon: string;
  weaponColor: string;
  /**
   * Sub weapon — paperdoll rig only. Drawn on the far hand (weapon_bot slots,
   * behind the torso); unset/"" = empty off-hand. The h99 rig ignores it.
   */
  subWeapon?: string;
  subWeaponColor?: string;
  /**
   * Optional creature parts — paperdoll rig only. Ears ("point", "long") and
   * tail ("spade") render in the chosen skin tone; horns ("imp") and wings
   * ("bat", "stone") have fixed palettes. Unset = no attachment.
   */
  ears?: string;
  horns?: string;
  wings?: string;
  tail?: string;
  /**
   * Reference-style object plates — paperdoll rig only. These mirror the
   * assets/spine-character methodology: one broad attachment controls the
   * coherent body/head/hand/cloak silhouette while the older skin/cloth
   * slots remain available underneath.
   */
  bodyObject?: string;
  cloakObject?: string;
  headObject?: string;
  handObject?: string;
  /**
   * Shape keys — bone-scale morphs for body diversity ("height", "chest",
   * "head", "armLen", "armWidth", "legWidth", "ears", "horns", "wings",
   * "tail", "weaponSize", "subWeaponSize"). Values are scale multipliers;
   * absent key = neutral (1.0). Mirrors SHAPE_KEYS in tools/gen_paperdoll.py;
   * the h99 rig honors the shared bone names only.
   */
  shape?: Record<string, number>;
}

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  skin: "c1",
  face: "ms1",
  hair: "m1",
  hairColor: "c1",
  cloth: "cloth1",
  clothColor: "c1",
  weapon: "weapon1",
  weaponColor: "c1",
};

export const APPEARANCE_OPTIONS = {
  skin: H99_SKINS,
  face: H99_FACES,
  hair: H99_HAIR_STYLES,
  hairColor: H99_HAIR_COLORS,
  cloth: H99_CLOTH_STYLES,
  clothColor: H99_CLOTH_COLORS,
  weapon: H99_WEAPONS,
  weaponColor: H99_WEAPON_COLORS,
};

/** Curated wizard options (full catalog available via IDs). */
export const WIZARD_HAIR = ["m1", "m2", "m3", "f1", "f2", "f3", "m5", "f5"] as const;
export const WIZARD_CLOTH = ["cloth1", "cloth3", "cloth5", "cloth10", "cloth12", "cloth15"] as const;

export const RACE_APPEARANCE_PRESETS: Record<string, Partial<CharacterAppearance>> = {
  humanus: { skin: "c1", face: "ms1", hair: "m1", hairColor: "c2", cloth: "cloth1", clothColor: "c1", weapon: "weapon1" },
  altus: { skin: "c1", face: "ms3", hair: "f2", hairColor: "c8", cloth: "cloth10", clothColor: "c2", weapon: "weapon1" },
  parvus: { skin: "c3", face: "ms5", hair: "m5", hairColor: "c5", cloth: "cloth5", clothColor: "c4", weapon: "weapon5" },
  felis: { skin: "c4", face: "ms7", hair: "f3", hairColor: "c1", cloth: "cloth3", clothColor: "c6", weapon: "weapon3" },
  saxum: { skin: "c6", face: "ms9", hair: "m2", hairColor: "c1", cloth: "cloth12", clothColor: "c3", weapon: "weapon2" },
};

/**
 * Map in-game weapon types to Heroes 99 weapon folders.
 * Pack layout: weapon1 sword, weapon2 axe, weapon3 dagger, weapon4 spear,
 * weapon5 staff. weapon6 pitchfork is paperdoll-only; weapon7 shield is
 * paperdoll-only art (no H99 sheet) for the sub-hand slot. Game types
 * without dedicated art map onto the closest folder (katana→sword,
 * hammer/axe→axe, wand→staff); knuckles maps to "" — bare fists.
 */
export const GAME_WEAPON_TO_H99: Record<string, string> = {
  sword: "weapon1",
  katana: "weapon1",
  mace: "weapon2",
  axe: "weapon2",
  hammer: "weapon2",
  dagger: "weapon3",
  spear: "weapon4",
  staff: "weapon5",
  wand: "weapon5",
  // Brawler fists — no held weapon on the doll or the 3D rig.
  knuckles: "",
  shield: "weapon7",
};

export function appearanceFromRace(race: string): CharacterAppearance {
  const preset = RACE_APPEARANCE_PRESETS[race] ?? {};
  return { ...DEFAULT_APPEARANCE, ...preset };
}

export function mergeAppearance(
  base: CharacterAppearance,
  patch: Partial<CharacterAppearance>,
): CharacterAppearance {
  return { ...base, ...patch };
}

/** 1-based slider index for an appearance option list. */
export function appearanceOptionIndex(options: readonly string[], value: string): number {
  const i = options.indexOf(value);
  return i >= 0 ? i + 1 : 1;
}

/** Value at a 1-based slider index (clamped). */
export function appearanceOptionAt(options: readonly string[], index: number): string {
  const i = Math.max(1, Math.min(options.length, Math.round(index))) - 1;
  return options[i] ?? options[0]!;
}

/** Wire format (snake_case JSON from the server). */
export interface CharacterAppearanceWire {
  skin: string;
  face: string;
  hair: string;
  hair_color: string;
  cloth: string;
  cloth_color: string;
  body_object?: string;
  cloak_object?: string;
  head_object?: string;
  hand_object?: string;
  weapon: string;
  weapon_color: string;
}

export function appearanceToWire(appearance: CharacterAppearance): CharacterAppearanceWire {
  return {
    skin: appearance.skin,
    face: appearance.face,
    hair: appearance.hair,
    hair_color: appearance.hairColor,
    cloth: appearance.cloth,
    cloth_color: appearance.clothColor,
    body_object: appearance.bodyObject,
    cloak_object: appearance.cloakObject,
    head_object: appearance.headObject,
    hand_object: appearance.handObject,
    weapon: appearance.weapon,
    weapon_color: appearance.weaponColor,
  };
}

export function appearanceFromWire(w?: CharacterAppearanceWire | null): CharacterAppearance | null {
  if (!w || !w.skin) return null;
  return {
    skin: w.skin,
    face: w.face,
    hair: w.hair,
    hairColor: w.hair_color,
    cloth: w.cloth,
    clothColor: w.cloth_color,
    bodyObject: w.body_object,
    cloakObject: w.cloak_object,
    headObject: w.head_object,
    handObject: w.hand_object,
    weapon: w.weapon,
    weaponColor: w.weapon_color,
  };
}

export function applyGameWeapon(
  appearance: CharacterAppearance,
  gameWeapon?: string,
  gameSubWeapon?: string,
): CharacterAppearance {
  // undefined = no weapon info (keep the base choice); "" = explicitly
  // unarmed (bare hands); a known type maps to its Heroes 99 folder.
  if (gameWeapon !== undefined) {
    const weapon = gameWeapon === "" ? "" : (GAME_WEAPON_TO_H99[gameWeapon] ?? appearance.weapon);
    appearance = { ...appearance, weapon };
  }
  if (gameSubWeapon !== undefined) {
    const subWeapon =
      gameSubWeapon === "" ? "" : (GAME_WEAPON_TO_H99[gameSubWeapon] ?? appearance.subWeapon ?? "");
    appearance = { ...appearance, subWeapon };
  }
  return appearance;
}

/** What an unarmored hero wears — a simple tunic, pants and boots. */
export const BASE_CLOTH = "cloth16";
export const BASE_CLOTH_COLOR = "c3";

/** Armor weight class → outfit. Mirrors game.EquippedClothLook server-side. */
export const ARMOR_CLASS_CLOTH: Record<string, { cloth: string; clothColor: string }> = {
  heavy: { cloth: "cloth15", clothColor: "c2" },
  medium: { cloth: "cloth4", clothColor: "c6" },
  light: { cloth: "cloth10", clothColor: "c1" },
};

/** Clothes follow equipped armor: the weight-class look, or the plain tunic
 * when no armor is equipped. Mirrors applyGameWeapon. */
export function applyGameClothes(
  appearance: CharacterAppearance,
  armorClass?: string,
): CharacterAppearance {
  const look = armorClass ? ARMOR_CLASS_CLOTH[armorClass] : undefined;
  return { ...appearance, cloth: look?.cloth ?? BASE_CLOTH, clothColor: look?.clothColor ?? BASE_CLOTH_COLOR };
}

export function appearanceKey(appearance: CharacterAppearance): string {
  return JSON.stringify(appearance);
}

export function frameForAnim(anim: CharacterAnim, localFrame: number): number {
  const { frames } = H99_ANIMS[anim];
  return frames[localFrame % frames.length]!;
}

export function layerAssetPath(layer: H99LayerId, appearance: CharacterAppearance): string {
  switch (layer) {
    case "skin":
      return `${H99_BASE}/skin/skin_${appearance.skin}.png`;
    case "face":
      return `${H99_BASE}/face/face_${appearance.face}.png`;
    case "cloth_bot":
      return `${H99_BASE}/cloth/${appearance.cloth}/${appearance.cloth}_bot/${appearance.cloth}_${appearance.clothColor}_bot.png`;
    case "cloth_top":
      return `${H99_BASE}/cloth/${appearance.cloth}/${appearance.cloth}_top/${appearance.cloth}_${appearance.clothColor}_top.png`;
    case "hair_bot":
      return `${H99_BASE}/hair/${appearance.hair}/${appearance.hair}_bot/${appearance.hair}_${appearance.hairColor}_bot.png`;
    case "hair_top":
      return `${H99_BASE}/hair/${appearance.hair}/${appearance.hair}_top/${appearance.hair}_${appearance.hairColor}_top.png`;
    case "weapon_bot":
      return weaponPath(appearance, "bot");
    case "weapon_top":
      return weaponPath(appearance, "top");
    default:
      return "";
  }
}

function weaponPath(appearance: CharacterAppearance, part: "top" | "bot"): string {
  const w = appearance.weapon;
  // Unarmed: no weapon layer — callers must skip empty paths.
  if (!w) return "";
  if (w === "weapon5") {
    return `${H99_BASE}/weapon/weapon5/weapon5_${part}/weapon5_${appearance.weaponColor}_${part}.png`;
  }
  return `${H99_BASE}/weapon/${w}/${w}_${part}/${w}_${part}.png`;
}

export function layerTextureKey(layer: H99LayerId, appearance: CharacterAppearance): string {
  const w = appearance.weapon;
  switch (layer) {
    case "skin":
      return `h99_skin_${appearance.skin}`;
    case "face":
      return `h99_face_${appearance.face}`;
    case "cloth_bot":
      return `h99_cb_${appearance.cloth}_${appearance.clothColor}`;
    case "cloth_top":
      return `h99_ct_${appearance.cloth}_${appearance.clothColor}`;
    case "hair_bot":
      return `h99_hb_${appearance.hair}_${appearance.hairColor}`;
    case "hair_top":
      return `h99_ht_${appearance.hair}_${appearance.hairColor}`;
    case "weapon_bot":
      return w === "weapon5" ? `h99_wb_${w}_${appearance.weaponColor}` : `h99_wb_${w}`;
    case "weapon_top":
      return w === "weapon5" ? `h99_wt_${w}_${appearance.weaponColor}` : `h99_wt_${w}`;
    default:
      return "";
  }
}
