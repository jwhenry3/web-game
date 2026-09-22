export type VfxCategory =
  | "physical"
  | "fire"
  | "ice"
  | "thunder"
  | "wind"
  | "earth"
  | "water"
  | "holy"
  | "dark"
  | "poison"
  | "heal"
  | "buff";

export type VfxParticleTexture =
  | "orb"
  | "spark"
  | "smoke"
  | "shard"
  | "streak"
  | "ember"
  | "droplet"
  | "stone"
  | "rune";

export interface VfxBurstProfile {
  texture: VfxParticleTexture;
  count: number;
  color: number;
  spread: number;
  size: number;
  alpha?: number;
  duration?: number;
  rise?: boolean;
  directional?: boolean;
  gravity?: number;
}

/** Rotating ring of sprites — spell circles, swirling winds. Plays once for
 * `duration` ms when used as an impact layer; loops while channeling when
 * used inside `cast` (spinRate is deg/sec in both cases). */
export interface VfxCircleProfile {
  texture: VfxParticleTexture;
  count: number;
  color: number;
  radius: number;
  size: number;
  alpha?: number;
  spinRate?: number;
  duration?: number;
  /** Drift upward px over the lifetime (rising glyph circles). */
  rise?: number;
  /** Grow the ring outward px over the lifetime — shockwave circles. */
  expand?: number;
  /** Attached emitter — `count` particles per ~200ms tick spawn on the ring
   * circumference (radius ± `width` jitter) and run the stream motion
   * (rise/fall via `height`, `life`, `sway`, `colorEnd`). Loops while
   * channeling inside `cast`; bounded by `duration` on impact circles. */
  emit?: VfxStreamProfile;
}

/** Continuous rising emitter — flames climbing, heal motes drifting up.
 * Particles spawn staggered over `duration` ms and climb `height` px with a
 * `sway` wobble; `colorEnd` lerps the fill (ember orange → smoke dark). */
export interface VfxStreamProfile {
  texture: VfxParticleTexture;
  count: number;
  color: number;
  colorEnd?: number;
  width: number;
  height: number;
  size: number;
  alpha?: number;
  /** Emission window ms (impact) — for `cast`, particles per 250ms tick. */
  duration?: number;
  /** Per-particle rise time ms. */
  life?: number;
  sway?: number;
  /** Fall instead of rise — rain, ash, spores drifting down. */
  fall?: boolean;
}

/** Actor→target flight — arrows (streak), bolt magic (orb/shard), thrown
 * items (stone + arc + spin). The impact layers fire when it lands. */
export interface VfxProjectileProfile {
  texture: VfxParticleTexture;
  color: number;
  size: number;
  /** Base flight ms at ~140px range; scales with distance. */
  duration?: number;
  /** Lob height px — 0 flies straight (bolts), >0 arcs (thrown items). */
  arc?: number;
  /** Degrees of tumble over the flight — thrown items. */
  spin?: number;
  /** Fading dots dropped along the path (0/none = no trail). */
  trail?: number;
  trailColor?: number;
  /** Volley count — extra shots fan out with a slight spread + stagger. */
  count?: number;
  /** Max lateral sway px — each shot picks a random bend ±curve and weaves
   * sideways (peaks mid-flight), still landing on the target. */
  curve?: number;
}

/** Sustained channel effect shown at the caster for the whole cast —
 * an orbiting ring plus rising motes until stopCastVfx. */
export interface VfxCastProfile {
  circle?: VfxCircleProfile;
  stream?: VfxStreamProfile;
}

export interface VfxProfile {
  palette: number[];
  bursts: VfxBurstProfile[];
  ring?: {
    color: number;
    alpha: number;
    scale: number;
    duration: number;
  };
  flash?: {
    color: number;
    alpha: number;
    scale: number;
  };
  circle?: VfxCircleProfile;
  stream?: VfxStreamProfile;
  projectile?: VfxProjectileProfile;
  cast?: VfxCastProfile;
}

const FIRE_IDS = /fire|ignis|inferno|katon|firaga|enfire|actinic/i;
const ICE_IDS = /ice|gelu|blizzard|hyoton|enblizzard|frost/i;
const THUNDER_IDS = /thunder|fulmen|bolt|raiton|enthunder|meteor/i;
const WIND_IDS = /aero|gust|embrava/i;
const EARTH_IDS = /stone|geo|earth|quake/i;
const WATER_IDS = /water|aqua|flood/i;
const HOLY_IDS = /holy|lux|lumen|sacred|banish|cure|curaga|light|requiescat|phalanx|valiance/i;
const DARK_IDS = /drain|absorb|dark|nox|shadow|doom|last_resort/i;
const POISON_IDS = /poison|dia|wilt|venom/i;
const HEAL_IDS = /cure|curaga|heal|sanare|mending|repair|waltz|regen|adloquium/i;
const BUFF_IDS = /buff|guard|ward|protect|haste|boost|sentinel|cover|attunement|carmen|hymn|song|stance|focus|meditatio|utsusemi|samba|minne|minuet|madrigal|etude|maneuver|deploy|activate|gauge|reward|charm|camouflage|fold|roulette|wild_card|quick_draw|accession|celerity|phalanx|valiance|indi/i;

/** Action/skill id → effect category. Lives in the shared data module so the
 * Three.js player and the editors classify actions the same way. */
export function vfxCategoryForAction(actionId: string, heal?: number): VfxCategory {
  if (heal && heal > 0) return "heal";
  if (actionId === "attack") return "physical";
  if (HEAL_IDS.test(actionId)) return "heal";
  if (BUFF_IDS.test(actionId)) return "buff";
  if (POISON_IDS.test(actionId)) return "poison";
  if (FIRE_IDS.test(actionId)) return "fire";
  if (ICE_IDS.test(actionId)) return "ice";
  if (THUNDER_IDS.test(actionId)) return "thunder";
  if (WIND_IDS.test(actionId)) return "wind";
  if (EARTH_IDS.test(actionId)) return "earth";
  if (WATER_IDS.test(actionId)) return "water";
  if (HOLY_IDS.test(actionId)) return "holy";
  if (DARK_IDS.test(actionId)) return "dark";
  return "physical";
}

/** Ordered list of every VFX category — handy for pickers and iteration. */
export const VFX_CATEGORIES: readonly VfxCategory[] = [
  "physical",
  "fire",
  "ice",
  "thunder",
  "wind",
  "earth",
  "water",
  "holy",
  "dark",
  "poison",
  "heal",
  "buff",
];

export const VFX_TEXTURES: readonly VfxParticleTexture[] = [
  "orb",
  "spark",
  "smoke",
  "shard",
  "streak",
  "ember",
  "droplet",
  "stone",
  "rune",
];

/**
 * Shape of assets/vfx/profiles.json — a sparse overlay on the compiled
 * defaults. Both maps are optional and keyed by category name.
 */
export interface VfxProfilesFile {
  colors?: Record<string, number>;
  profiles?: Record<string, Partial<VfxProfile>>;
}

/** Compiled-in source of truth — profiles.json merges over these at boot. */
const DEFAULT_CATEGORY_COLORS: Record<VfxCategory, number> = {
  physical: 0xf0f0f0,
  fire: 0xff6633,
  ice: 0x88ccff,
  thunder: 0xffff66,
  wind: 0xaaffaa,
  earth: 0xcc9966,
  water: 0x44aaff,
  holy: 0xffffcc,
  dark: 0x6633aa,
  poison: 0x66cc44,
  heal: 0x4ade80,
  buff: 0xffd700,
};

/** Shared channel-effect shape for castable categories: a slow rune orbit
 * at the feet plus small motes climbing the caster. Stream `count` is per
 * emit tick while channeling (see startCastVfx). */
const castFx = (rune: number, mote: number): VfxCastProfile => ({
  circle: { texture: "rune", count: 6, color: rune, radius: 20, size: 4, alpha: 0.7, spinRate: 140 },
  stream: { texture: "spark", count: 2, color: mote, width: 10, height: 30, size: 2.5, alpha: 0.85, life: 700, sway: 5 },
});

const DEFAULT_VFX_PROFILES: Record<VfxCategory, VfxProfile> = {
  physical: {
    palette: [0xffffff, 0xd7dde8, 0x8892a6],
    bursts: [
      { texture: "streak", count: 12, color: 0xffffff, spread: 34, size: 7, alpha: 0.75, directional: true, duration: 360 },
      { texture: "spark", count: 10, color: 0xd7dde8, spread: 28, size: 3, alpha: 0.8, duration: 300 },
      { texture: "smoke", count: 6, color: 0x7e8798, spread: 24, size: 6, alpha: 0.28, duration: 560 },
    ],
    flash: { color: 0xffffff, alpha: 0.18, scale: 2.6 },
  },
  fire: {
    palette: [0xfff1a8, 0xff9a2f, 0xd93c1f, 0x5f1820],
    bursts: [
      { texture: "ember", count: 26, color: 0xff9a2f, spread: 56, size: 6, alpha: 0.9, rise: true, duration: 620 },
      { texture: "spark", count: 18, color: 0xfff1a8, spread: 42, size: 3, alpha: 0.95, rise: true, duration: 420 },
      { texture: "smoke", count: 14, color: 0x4a2630, spread: 52, size: 8, alpha: 0.24, rise: true, duration: 850 },
    ],
    flash: { color: 0xfff1a8, alpha: 0.24, scale: 3.3 },
    // Fireball lobbed from the caster; flames keep climbing after impact.
    projectile: { texture: "orb", color: 0xff9a2f, size: 6, duration: 240, trail: 8, trailColor: 0xd93c1f, curve: 9 },
    stream: { texture: "ember", count: 16, color: 0xff9a2f, colorEnd: 0x5f1820, width: 14, height: 44, size: 5, alpha: 0.9, duration: 900, life: 750, sway: 7 },
    cast: castFx(0xd93c1f, 0xff9a2f),
  },
  ice: {
    palette: [0xffffff, 0xbbeeff, 0x64b7ff, 0x3458b8],
    bursts: [
      { texture: "shard", count: 24, color: 0xbbeeff, spread: 48, size: 7, alpha: 0.92, duration: 720 },
      { texture: "spark", count: 18, color: 0xffffff, spread: 32, size: 3, alpha: 0.92, duration: 520 },
      { texture: "streak", count: 10, color: 0x64b7ff, spread: 44, size: 6, alpha: 0.72, directional: true, duration: 640 },
    ],
    projectile: { texture: "shard", color: 0xbbeeff, size: 7, duration: 210, trail: 6, trailColor: 0x64b7ff, curve: 6 },
    cast: castFx(0x64b7ff, 0xd8fbff),
  },
  thunder: {
    palette: [0xffffcc, 0xffee55, 0x9aa2ff, 0x3a2e88],
    bursts: [
      { texture: "streak", count: 22, color: 0xffff88, spread: 62, size: 8, alpha: 0.95, directional: true, duration: 330 },
      { texture: "spark", count: 22, color: 0xffffff, spread: 46, size: 3, alpha: 0.95, rise: true, duration: 380 },
      { texture: "orb", count: 10, color: 0x9aa2ff, spread: 34, size: 5, alpha: 0.55, duration: 560 },
    ],
    flash: { color: 0xffffcc, alpha: 0.28, scale: 3.8 },
    // Twin bolts fan into the target.
    projectile: { texture: "streak", color: 0xffff88, size: 7, duration: 140, trail: 10, trailColor: 0x9aa2ff, count: 2 },
    cast: castFx(0x9aa2ff, 0xffff88),
  },
  wind: {
    palette: [0xf0ffe6, 0xaaffaa, 0x59cf9c, 0x2b7c6f],
    bursts: [
      { texture: "streak", count: 24, color: 0xccffcc, spread: 68, size: 8, alpha: 0.55, directional: true, duration: 700 },
      { texture: "spark", count: 14, color: 0xf0ffe6, spread: 48, size: 3, alpha: 0.78, rise: true, duration: 620 },
      { texture: "orb", count: 10, color: 0x59cf9c, spread: 54, size: 5, alpha: 0.35, duration: 760 },
    ],
    // Gust ring — streaks whipping around the target.
    circle: { texture: "streak", count: 7, color: 0xaaffaa, radius: 26, size: 6, alpha: 0.6, spinRate: 360, duration: 800, rise: 14 },
    cast: castFx(0x59cf9c, 0xf0ffe6),
  },
  earth: {
    palette: [0xe2c28a, 0xb38452, 0x7a5637, 0x40302b],
    bursts: [
      { texture: "stone", count: 20, color: 0x9a6a45, spread: 38, size: 7, alpha: 0.9, gravity: 22, duration: 620 },
      { texture: "smoke", count: 18, color: 0x5d5046, spread: 48, size: 8, alpha: 0.3, duration: 850 },
      { texture: "spark", count: 8, color: 0xe2c28a, spread: 26, size: 3, alpha: 0.7, duration: 400 },
    ],
    // Lobbed rock — arcs in, tumbles, cracks apart on landing.
    projectile: { texture: "stone", color: 0x9a6a45, size: 6, duration: 320, arc: 30, spin: 540 },
    // Ground-shatter — a ring of pebbles blowing outward from the impact.
    circle: { texture: "stone", count: 10, color: 0x8a6a4a, radius: 8, size: 4, alpha: 0.7, spinRate: 40, duration: 700, expand: 44 },
    cast: castFx(0x7a5637, 0xe2c28a),
  },
  water: {
    palette: [0xd8fbff, 0x7bd4ff, 0x248dff, 0x1854a8],
    bursts: [
      { texture: "droplet", count: 28, color: 0x44aaff, spread: 46, size: 6, alpha: 0.85, duration: 690 },
      { texture: "spark", count: 14, color: 0xd8fbff, spread: 34, size: 3, alpha: 0.86, rise: true, duration: 480 },
      { texture: "streak", count: 12, color: 0x7bd4ff, spread: 48, size: 7, alpha: 0.5, directional: true, duration: 620 },
    ],
    projectile: { texture: "droplet", color: 0x7bd4ff, size: 6, duration: 220, arc: 12, trail: 6, trailColor: 0x248dff, curve: 10 },
    // Rain — droplets falling on the target rather than exploding.
    stream: { texture: "droplet", count: 16, color: 0x7bd4ff, colorEnd: 0x248dff, width: 24, height: 34, size: 3.5, alpha: 0.85, duration: 850, life: 480, sway: 2, fall: true },
    cast: castFx(0x248dff, 0xd8fbff),
  },
  holy: {
    palette: [0xffffff, 0xffffcc, 0xffdf7a, 0x9be7ff],
    bursts: [
      { texture: "rune", count: 14, color: 0xffffcc, spread: 42, size: 7, alpha: 0.72, rise: true, duration: 780 },
      { texture: "spark", count: 28, color: 0xffffff, spread: 36, size: 3, alpha: 0.95, rise: true, duration: 560 },
      { texture: "orb", count: 12, color: 0x9be7ff, spread: 30, size: 5, alpha: 0.45, rise: true, duration: 700 },
    ],
    flash: { color: 0xffffff, alpha: 0.25, scale: 3.6 },
    // Spell circle of glyphs turning under the target, motes rising off it.
    circle: { texture: "rune", count: 9, color: 0xffdf7a, radius: 30, size: 5, alpha: 0.75, spinRate: 140, duration: 1100, rise: 18, emit: { texture: "spark", count: 2, color: 0xffffcc, colorEnd: 0xffdf7a, width: 6, height: 30, size: 2, alpha: 0.9, life: 650, sway: 5 } },
    projectile: { texture: "orb", color: 0xffffcc, size: 5, duration: 200, trail: 8, trailColor: 0x9be7ff, curve: 7 },
    cast: castFx(0xffdf7a, 0xffffcc),
  },
  dark: {
    palette: [0xb28cff, 0x6633aa, 0x2a124a, 0x08020f],
    bursts: [
      { texture: "smoke", count: 26, color: 0x2a124a, spread: 54, size: 9, alpha: 0.42, rise: true, duration: 860 },
      { texture: "spark", count: 14, color: 0xb28cff, spread: 34, size: 3, alpha: 0.78, duration: 540 },
      { texture: "orb", count: 10, color: 0x08020f, spread: 40, size: 6, alpha: 0.6, duration: 720 },
    ],
    // Shadow bolt — weaves hard on the way in.
    projectile: { texture: "orb", color: 0x6633aa, size: 6, duration: 260, trail: 8, trailColor: 0x2a124a, curve: 18 },
    stream: { texture: "smoke", count: 14, color: 0x6633aa, colorEnd: 0x08020f, width: 18, height: 34, size: 7, alpha: 0.4, duration: 900, life: 800, sway: 8 },
    cast: castFx(0x6633aa, 0xb28cff),
  },
  poison: {
    palette: [0xd4ff70, 0x66cc44, 0x2d8a48, 0x225238],
    bursts: [
      { texture: "orb", count: 20, color: 0x66cc44, spread: 36, size: 6, alpha: 0.7, rise: true, duration: 800 },
      { texture: "smoke", count: 22, color: 0x225238, spread: 46, size: 8, alpha: 0.34, rise: true, duration: 980 },
      { texture: "spark", count: 10, color: 0xd4ff70, spread: 26, size: 3, alpha: 0.82, rise: true, duration: 500 },
    ],
    projectile: { texture: "droplet", color: 0x66cc44, size: 5, duration: 230, arc: 14, trail: 5, trailColor: 0x2d8a48, curve: 12 },
    stream: { texture: "orb", count: 12, color: 0x66cc44, colorEnd: 0x225238, width: 14, height: 30, size: 4, alpha: 0.6, duration: 850, life: 750, sway: 6 },
    cast: castFx(0x2d8a48, 0xd4ff70),
  },
  heal: {
    palette: [0xecfff4, 0x86efac, 0x4ade80, 0x1f9f62],
    bursts: [
      { texture: "rune", count: 12, color: 0x86efac, spread: 30, size: 7, alpha: 0.64, rise: true, duration: 900 },
      { texture: "spark", count: 30, color: 0xecfff4, spread: 26, size: 3, alpha: 0.9, rise: true, duration: 740 },
      { texture: "orb", count: 14, color: 0x4ade80, spread: 24, size: 5, alpha: 0.5, rise: true, duration: 860 },
    ],
    ring: { color: 0x4ade80, alpha: 0.42, scale: 6.8, duration: 720 },
    // Motes rising off the target like gentle flame.
    stream: { texture: "spark", count: 18, color: 0x86efac, colorEnd: 0xecfff4, width: 18, height: 46, size: 3, alpha: 0.9, duration: 950, life: 800, sway: 8 },
    cast: castFx(0x1f9f62, 0xecfff4),
  },
  buff: {
    palette: [0xfff4c2, 0xffd700, 0xff9f43, 0x8f5f20],
    bursts: [
      { texture: "rune", count: 16, color: 0xffe9a8, spread: 32, size: 7, alpha: 0.72, rise: true, duration: 840 },
      { texture: "spark", count: 22, color: 0xfff4c2, spread: 26, size: 3, alpha: 0.9, rise: true, duration: 650 },
      { texture: "streak", count: 8, color: 0xff9f43, spread: 30, size: 6, alpha: 0.52, directional: true, duration: 640 },
    ],
    ring: { color: 0xffe9a8, alpha: 0.45, scale: 6.4, duration: 680 },
    circle: { texture: "rune", count: 8, color: 0xffd700, radius: 26, size: 5, alpha: 0.72, spinRate: 180, duration: 900, rise: 16, emit: { texture: "spark", count: 2, color: 0xfff4c2, colorEnd: 0xffd700, width: 6, height: 28, size: 2, alpha: 0.85, life: 600, sway: 4 } },
    cast: castFx(0xff9f43, 0xfff4c2),
  },
};

/**
 * Live records — consumers index these at call time so runtime overrides
 * (and dev-editor previews) take effect immediately. Initialized from the
 * compiled defaults; mutated by applyVfxProfileOverrides/resetVfxProfiles.
 */
export const CATEGORY_COLORS: Record<VfxCategory, number> = { ...DEFAULT_CATEGORY_COLORS };
export const CATEGORY_VFX_PROFILES: Record<VfxCategory, VfxProfile> = {} as Record<
  VfxCategory,
  VfxProfile
>;

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const optNum = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function mergeBurst(base: VfxBurstProfile | undefined, over: unknown): VfxBurstProfile {
  const o = isRecord(over) ? over : {};
  const texture = VFX_TEXTURES.includes(o.texture as VfxParticleTexture)
    ? (o.texture as VfxParticleTexture)
    : (base?.texture ?? "orb");
  const burst: VfxBurstProfile = {
    texture,
    count: num(o.count, base?.count ?? 10),
    color: num(o.color, base?.color ?? 0xffffff),
    spread: num(o.spread, base?.spread ?? 30),
    size: num(o.size, base?.size ?? 5),
  };
  const alpha = optNum(o.alpha) ?? base?.alpha;
  const duration = optNum(o.duration) ?? base?.duration;
  const gravity = optNum(o.gravity) ?? base?.gravity;
  const rise = typeof o.rise === "boolean" ? o.rise : base?.rise;
  const directional = typeof o.directional === "boolean" ? o.directional : base?.directional;
  if (alpha !== undefined) burst.alpha = alpha;
  if (duration !== undefined) burst.duration = duration;
  if (gravity !== undefined) burst.gravity = gravity;
  if (rise !== undefined) burst.rise = rise;
  if (directional !== undefined) burst.directional = directional;
  return burst;
}

function mergeProfile(base: VfxProfile, over: unknown): VfxProfile {
  const o = isRecord(over) ? over : {};
  const profile: VfxProfile = {
    palette:
      Array.isArray(o.palette) && o.palette.length
        ? (o.palette as unknown[]).map((c) => num(c, 0xffffff))
        : [...base.palette],
    bursts: Array.isArray(o.bursts) && o.bursts.length
      ? (o.bursts as unknown[])
          .filter(isRecord)
          .map((b, i) => mergeBurst(base.bursts[i], b))
      : base.bursts.map((b) => ({ ...b })),
  };
  if (isRecord(o.ring)) {
    profile.ring = {
      color: num(o.ring.color, base.ring?.color ?? 0xffffff),
      alpha: num(o.ring.alpha, base.ring?.alpha ?? 0.4),
      scale: num(o.ring.scale, base.ring?.scale ?? 7),
      duration: num(o.ring.duration, base.ring?.duration ?? 500),
    };
  } else if (base.ring) {
    profile.ring = { ...base.ring };
  }
  if (isRecord(o.flash)) {
    profile.flash = {
      color: num(o.flash.color, base.flash?.color ?? 0xffffff),
      alpha: num(o.flash.alpha, base.flash?.alpha ?? 0.2),
      scale: num(o.flash.scale, base.flash?.scale ?? 3),
    };
  } else if (base.flash) {
    profile.flash = { ...base.flash };
  }
  const circle = mergeCircle(base.circle, o.circle);
  if (circle) profile.circle = circle;
  const stream = mergeStream(base.stream, o.stream);
  if (stream) profile.stream = stream;
  const projectile = mergeProjectile(base.projectile, o.projectile);
  if (projectile) profile.projectile = projectile;
  const cast = mergeCast(base.cast, o.cast);
  if (cast) profile.cast = cast;
  return profile;
}

const tex = (v: unknown, fallback: VfxParticleTexture): VfxParticleTexture =>
  VFX_TEXTURES.includes(v as VfxParticleTexture) ? (v as VfxParticleTexture) : fallback;

function mergeCircle(base: VfxCircleProfile | undefined, over: unknown): VfxCircleProfile | undefined {
  if (!isRecord(over)) return base ? { ...base } : undefined;
  return {
    texture: tex(over.texture, base?.texture ?? "rune"),
    count: num(over.count, base?.count ?? 8),
    color: num(over.color, base?.color ?? 0xffffff),
    radius: num(over.radius, base?.radius ?? 26),
    size: num(over.size, base?.size ?? 5),
    alpha: optNum(over.alpha) ?? base?.alpha,
    spinRate: optNum(over.spinRate) ?? base?.spinRate,
    duration: optNum(over.duration) ?? base?.duration,
    rise: optNum(over.rise) ?? base?.rise,
    expand: optNum(over.expand) ?? base?.expand,
  };
}

function mergeStream(base: VfxStreamProfile | undefined, over: unknown): VfxStreamProfile | undefined {
  if (!isRecord(over)) return base ? { ...base } : undefined;
  return {
    texture: tex(over.texture, base?.texture ?? "spark"),
    count: num(over.count, base?.count ?? 12),
    color: num(over.color, base?.color ?? 0xffffff),
    colorEnd: optNum(over.colorEnd) ?? base?.colorEnd,
    width: num(over.width, base?.width ?? 16),
    height: num(over.height, base?.height ?? 40),
    size: num(over.size, base?.size ?? 4),
    alpha: optNum(over.alpha) ?? base?.alpha,
    duration: optNum(over.duration) ?? base?.duration,
    life: optNum(over.life) ?? base?.life,
    sway: optNum(over.sway) ?? base?.sway,
    fall: typeof over.fall === "boolean" ? over.fall : base?.fall,
  };
}

function mergeProjectile(base: VfxProjectileProfile | undefined, over: unknown): VfxProjectileProfile | undefined {
  if (!isRecord(over)) return base ? { ...base } : undefined;
  return {
    texture: tex(over.texture, base?.texture ?? "orb"),
    color: num(over.color, base?.color ?? 0xffffff),
    size: num(over.size, base?.size ?? 5),
    duration: optNum(over.duration) ?? base?.duration,
    arc: optNum(over.arc) ?? base?.arc,
    spin: optNum(over.spin) ?? base?.spin,
    trail: optNum(over.trail) ?? base?.trail,
    trailColor: optNum(over.trailColor) ?? base?.trailColor,
    count: optNum(over.count) ?? base?.count,
    curve: optNum(over.curve) ?? base?.curve,
  };
}

function mergeCast(base: VfxCastProfile | undefined, over: unknown): VfxCastProfile | undefined {
  if (!isRecord(over)) {
    return base
      ? { circle: base.circle ? { ...base.circle } : undefined, stream: base.stream ? { ...base.stream } : undefined }
      : undefined;
  }
  const circle = mergeCircle(base?.circle, over.circle);
  const stream = mergeStream(base?.stream, over.stream);
  if (!circle && !stream) return undefined;
  return { circle, stream };
}

/** Restore every live record to the compiled defaults. */
export function resetVfxProfiles(): void {
  for (const cat of VFX_CATEGORIES) {
    CATEGORY_COLORS[cat] = DEFAULT_CATEGORY_COLORS[cat];
    CATEGORY_VFX_PROFILES[cat] = mergeProfile(DEFAULT_VFX_PROFILES[cat], undefined);
  }
}
resetVfxProfiles();

/**
 * Merge a parsed profiles.json over the compiled defaults. Unknown or
 * malformed keys are ignored — missing keys always fall back to defaults.
 */
export function applyVfxProfileOverrides(json: unknown): void {
  if (!isRecord(json)) return;
  const colors = isRecord(json.colors) ? json.colors : undefined;
  const profiles = isRecord(json.profiles) ? json.profiles : undefined;
  for (const cat of VFX_CATEGORIES) {
    const color = colors?.[cat];
    if (typeof color === "number" && Number.isFinite(color)) {
      CATEGORY_COLORS[cat] = color;
    }
    const profile = profiles?.[cat];
    if (isRecord(profile)) {
      CATEGORY_VFX_PROFILES[cat] = mergeProfile(DEFAULT_VFX_PROFILES[cat], profile);
    }
  }
}

/**
 * Fetch and apply assets/vfx/profiles.json. Missing or invalid files are
 * silently ignored so dev servers and older builds fall back to the
 * compiled defaults.
 */
export async function loadVfxProfiles(url = "assets/vfx/profiles.json"): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    applyVfxProfileOverrides(await res.json());
  } catch {
    /* defaults apply */
  }
}

