import type {
  VfxBurstProfile,
  VfxCastProfile,
  VfxCircleProfile,
  VfxProjectileProfile,
  VfxProfile,
  VfxStreamProfile,
} from "./effects";

/** Reusable starting points for each effect layer — pick one in the inspector
 * and it stamps its values into the current profile's matching section
 * (burst templates append; the rest replace that section). Build new effects
 * by combining these rather than hand-tuning every field. */

export interface VfxTemplate<T> {
  name: string;
  data: T;
}

export const BURST_TEMPLATES: VfxTemplate<VfxBurstProfile>[] = [
  { name: "Shrapnel", data: { texture: "shard", count: 20, color: 0xbbccdd, spread: 52, size: 6, alpha: 0.9, directional: true, duration: 520 } },
  { name: "Spark shower", data: { texture: "spark", count: 26, color: 0xffe066, spread: 18, size: 3, alpha: 0.95, gravity: 34, rise: true, duration: 700 } },
  { name: "Dust cloud", data: { texture: "smoke", count: 18, color: 0x8a7a68, spread: 46, size: 8, alpha: 0.3, duration: 850 } },
  { name: "Star burst", data: { texture: "spark", count: 30, color: 0xffffff, spread: 60, size: 4, alpha: 0.95, duration: 480 } },
  { name: "Petal drift", data: { texture: "rune", count: 14, color: 0xff9ad5, spread: 34, size: 6, alpha: 0.7, gravity: 8, rise: true, duration: 900 } },
  { name: "Sand spray", data: { texture: "stone", count: 18, color: 0xc9a05a, spread: 40, size: 4, alpha: 0.85, gravity: 20, duration: 560 } },
];

export const CIRCLE_TEMPLATES: VfxTemplate<VfxCircleProfile>[] = [
  { name: "Rune circle", data: { texture: "rune", count: 9, color: 0xffdf7a, radius: 30, size: 5, alpha: 0.75, spinRate: 140, duration: 1100, rise: 18, emit: { texture: "spark", count: 2, color: 0xffffcc, colorEnd: 0xffdf7a, width: 6, height: 30, size: 2, alpha: 0.9, life: 650, sway: 5 } } },
  { name: "Gust ring", data: { texture: "streak", count: 7, color: 0xaaffaa, radius: 26, size: 6, alpha: 0.6, spinRate: 360, duration: 800, rise: 14 } },
  { name: "Orbiting shards", data: { texture: "shard", count: 6, color: 0xbbeeff, radius: 24, size: 6, alpha: 0.8, spinRate: -220, duration: 900 } },
  { name: "Shockwave", data: { texture: "stone", count: 10, color: 0x8a6a4a, radius: 8, size: 4, alpha: 0.7, spinRate: 40, duration: 700, expand: 44 } },
  { name: "Summon ring", data: { texture: "orb", count: 12, color: 0x9be7ff, radius: 34, size: 4, alpha: 0.55, spinRate: 90, duration: 1400, rise: 10, expand: 8 } },
];

export const STREAM_TEMPLATES: VfxTemplate<VfxStreamProfile>[] = [
  { name: "Flame tongue", data: { texture: "ember", count: 16, color: 0xff9a2f, colorEnd: 0x5f1820, width: 14, height: 44, size: 5, alpha: 0.9, duration: 900, life: 750, sway: 7 } },
  { name: "Heal motes", data: { texture: "spark", count: 18, color: 0x86efac, colorEnd: 0xecfff4, width: 18, height: 46, size: 3, alpha: 0.9, duration: 950, life: 800, sway: 8 } },
  { name: "Bubble rise", data: { texture: "droplet", count: 14, color: 0x7bd4ff, colorEnd: 0xd8fbff, width: 16, height: 38, size: 4, alpha: 0.75, duration: 900, life: 850, sway: 5 } },
  { name: "Smoke plume", data: { texture: "smoke", count: 14, color: 0x6633aa, colorEnd: 0x08020f, width: 18, height: 34, size: 7, alpha: 0.4, duration: 900, life: 800, sway: 8 } },
  { name: "Rain", data: { texture: "droplet", count: 16, color: 0x7bd4ff, colorEnd: 0x248dff, width: 24, height: 34, size: 3.5, alpha: 0.85, duration: 850, life: 480, sway: 2, fall: true } },
  { name: "Ember rain", data: { texture: "ember", count: 18, color: 0xff9a2f, colorEnd: 0x5f1820, width: 30, height: 40, size: 3, alpha: 0.85, duration: 1000, life: 620, sway: 6, fall: true } },
  { name: "Spore drift", data: { texture: "orb", count: 12, color: 0x66cc44, colorEnd: 0x225238, width: 26, height: 26, size: 4, alpha: 0.55, duration: 1100, life: 1000, sway: 10, fall: true } },
];

export const PROJECTILE_TEMPLATES: VfxTemplate<VfxProjectileProfile>[] = [
  { name: "Arrow", data: { texture: "streak", color: 0xd7dde8, size: 5, duration: 160 } },
  { name: "Bolt", data: { texture: "orb", color: 0xffffcc, size: 5, duration: 200, trail: 8, trailColor: 0x9be7ff } },
  { name: "Ice shard", data: { texture: "shard", color: 0xbbeeff, size: 7, duration: 210, trail: 6, trailColor: 0x64b7ff } },
  { name: "Thrown rock", data: { texture: "stone", color: 0x9a6a45, size: 6, duration: 320, arc: 30, spin: 540 } },
  { name: "Triple bolt", data: { texture: "orb", color: 0xb28cff, size: 4, duration: 220, trail: 5, count: 3 } },
  { name: "Gale dart", data: { texture: "streak", color: 0xaaffaa, size: 6, duration: 170, arc: 8, trail: 7, trailColor: 0x59cf9c } },
  { name: "Serpent bolt", data: { texture: "orb", color: 0x6633aa, size: 5, duration: 300, trail: 9, trailColor: 0x2a124a, curve: 24 } },
  { name: "Hex volley", data: { texture: "shard", color: 0xb28cff, size: 4, duration: 260, trail: 5, count: 3, curve: 14 } },
  { name: "Fireball", data: { texture: "orb", color: 0xff9a2f, size: 6, duration: 240, trail: 8, trailColor: 0xd93c1f, curve: 9 } },
];

export const CAST_TEMPLATES: VfxTemplate<VfxCastProfile>[] = [
  { name: "Mage channel", data: { circle: { texture: "rune", count: 6, color: 0x9be7ff, radius: 20, size: 4, alpha: 0.7, spinRate: 140 }, stream: { texture: "spark", count: 2, color: 0xd8fbff, width: 10, height: 30, size: 2.5, alpha: 0.85, life: 700, sway: 5 } } },
  { name: "Dark ritual", data: { circle: { texture: "orb", count: 8, color: 0x6633aa, radius: 24, size: 4, alpha: 0.6, spinRate: -110 }, stream: { texture: "smoke", count: 2, color: 0x2a124a, width: 14, height: 34, size: 4, alpha: 0.5, life: 900, sway: 8 } } },
  { name: "Wind-up", data: { circle: { texture: "streak", count: 5, color: 0xaaffaa, radius: 16, size: 5, alpha: 0.7, spinRate: 420 }, stream: { texture: "streak", count: 3, color: 0xf0ffe6, width: 8, height: 26, size: 3, alpha: 0.7, life: 450, sway: 4 } } },
  { name: "Ember charge", data: { circle: { texture: "ember", count: 7, color: 0xff9a2f, radius: 18, size: 4, alpha: 0.8, spinRate: 200, expand: 6 }, stream: { texture: "ember", count: 3, color: 0xfff1a8, colorEnd: 0x5f1820, width: 10, height: 32, size: 3, alpha: 0.9, life: 600, sway: 5 } } },
];

export const RING_TEMPLATES: VfxTemplate<NonNullable<VfxProfile["ring"]>>[] = [
  { name: "Shockwave", data: { color: 0xffffff, alpha: 0.5, scale: 9.0, duration: 400 } },
  { name: "Ripple", data: { color: 0x7bd4ff, alpha: 0.35, scale: 6.0, duration: 800 } },
  { name: "Ground slam", data: { color: 0x8a6a4a, alpha: 0.45, scale: 7.5, duration: 560 } },
];

export const FLASH_TEMPLATES: VfxTemplate<NonNullable<VfxProfile["flash"]>>[] = [
  { name: "Blink", data: { color: 0xffffff, alpha: 0.3, scale: 3.0 } },
  { name: "Dim burst", data: { color: 0x2a124a, alpha: 0.35, scale: 4.0 } },
  { name: "Radiance", data: { color: 0xffffcc, alpha: 0.4, scale: 4.5 } },
];

/** Section key → its template list, for the picker UI. */
export const TEMPLATE_SECTIONS = {
  burst: BURST_TEMPLATES,
  circle: CIRCLE_TEMPLATES,
  stream: STREAM_TEMPLATES,
  projectile: PROJECTILE_TEMPLATES,
  cast: CAST_TEMPLATES,
  ring: RING_TEMPLATES,
  flash: FLASH_TEMPLATES,
} as const;

export type TemplateSection = keyof typeof TEMPLATE_SECTIONS;
