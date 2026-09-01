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

/** Frame numbers from frameguide_v2.png (1-based); converted to 0-based sheet indices. */
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
 * Sheet layout (800×680, 8×17 grid of 100×40 cells). See frameguide_v2.png.
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

export function facingToFlipX(facing: CharacterFacing): boolean {
  return facing === "left";
}

/** In-world display scale (100×40 source frames → 200×80 px at 2). */
export const H99_DISPLAY_SCALE = 2;

export const H99_DISPLAY_WIDTH = H99_SHEET.frameWidth * H99_DISPLAY_SCALE;
export const H99_DISPLAY_HEIGHT = H99_SHEET.frameHeight * H99_DISPLAY_SCALE;
export const H99_NAME_LABEL_Y = -(H99_DISPLAY_HEIGHT + 10);
/** Selection / status rings sized to the sprite footprint. */
export const H99_WORLD_RING_RADIUS = H99_DISPLAY_HEIGHT * 0.64;
export const H99_BATTLE_RING_RADIUS = H99_DISPLAY_HEIGHT * 0.72;

export const H99_SKINS = ["c1", "c2", "c3", "c4", "c5", "c6"] as const;
export const H99_FACES = ["c1", "c2", "c3", "c4", "c5", "c6", "c7"] as const;
export const H99_HAIR_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10"] as const;
export const H99_CLOTH_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;
export const H99_WEAPON_COLORS = ["c1", "c2", "c3", "c4"] as const;

export const H99_HAIR_STYLES = [
  "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9",
  "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12", "m13", "m14",
] as const;

export const H99_CLOTH_STYLES = [
  "cloth1", "cloth2", "cloth3", "cloth4", "cloth5", "cloth6", "cloth7", "cloth8",
  "cloth9", "cloth10", "cloth11", "cloth12", "cloth13", "cloth14", "cloth15", "cloth16", "cloth17",
] as const;

export const H99_WEAPONS = ["weapon1", "weapon2", "weapon3", "weapon4", "weapon5"] as const;

export interface CharacterAppearance {
  skin: string;
  face: string;
  hair: string;
  hairColor: string;
  cloth: string;
  clothColor: string;
  weapon: string;
  weaponColor: string;
}

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  skin: "c1",
  face: "c1",
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
  hume: { skin: "c1", face: "c1", hair: "m1", hairColor: "c2", cloth: "cloth1", clothColor: "c1", weapon: "weapon1" },
  elvaan: { skin: "c1", face: "c2", hair: "f2", hairColor: "c8", cloth: "cloth10", clothColor: "c2", weapon: "weapon1" },
  tarutaru: { skin: "c3", face: "c3", hair: "m5", hairColor: "c5", cloth: "cloth5", clothColor: "c4", weapon: "weapon5" },
  mithra: { skin: "c4", face: "c4", hair: "f3", hairColor: "c1", cloth: "cloth3", clothColor: "c6", weapon: "weapon3" },
  galka: { skin: "c6", face: "c5", hair: "m2", hairColor: "c1", cloth: "cloth12", clothColor: "c3", weapon: "weapon2" },
};

/**
 * Map in-game weapon types to Heroes 99 weapon folders.
 * Pack layout: weapon1 sword, weapon2 axe, weapon3 dagger, weapon4 spear, weapon5 staff.
 */
export const GAME_WEAPON_TO_H99: Record<string, string> = {
  sword: "weapon1",
  mace: "weapon2",
  dagger: "weapon3",
  spear: "weapon4",
  staff: "weapon5",
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
    weapon: w.weapon,
    weaponColor: w.weapon_color,
  };
}

export function applyGameWeapon(
  appearance: CharacterAppearance,
  gameWeapon?: string,
): CharacterAppearance {
  if (!gameWeapon) return appearance;
  const weapon = GAME_WEAPON_TO_H99[gameWeapon] ?? appearance.weapon;
  return { ...appearance, weapon };
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