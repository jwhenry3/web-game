// Skill → rig clip mapping. `skillAnimationFor` derives the caster clip from
// the skill's flags and weapon requirement; `SKILL_ANIMATION_BY_ID` seeds
// ability assets and `rigClipForAction` resolves live combat events the same
// way, so preview and runtime always agree.

import type { RigAnimName } from "../three/rig3d";
import { DEFAULT_SKILL_CATALOG } from "./seedCatalog";

/** Weapon family → attack clip. Kept in one table so new variants only need
 * a seeded clip plus a row here. */
const WEAPON_CLIPS: Record<string, RigAnimName> = {
  sword: "attack_slash",
  katana: "attack_spin",
  dagger: "attack_thrust",
  spear: "attack_thrust",
  axe: "attack_smash",
  hammer: "attack_smash",
  knuckles: "attack_punch",
  wand: "cast",
  staff: "cast",
};

export interface SkillAnimSource {
  magic?: boolean;
  heals?: boolean;
  buffs?: boolean;
  ranged?: boolean;
  cast_time_ms?: number;
  weapon_reqs?: string[];
}

/** The clip a rig plays when executing this skill. Channeled and magic
 * skills hold the cast pose; ranged spear skills leap; melee falls through
 * to the weapon's signature swing. */
export function skillAnimationFor(skill: SkillAnimSource): RigAnimName {
  if (skill.ranged) return "attack_leap";
  if (skill.magic || skill.heals || skill.buffs || (skill.cast_time_ms ?? 0) > 0) return "cast";
  return WEAPON_CLIPS[skill.weapon_reqs?.[0] ?? ""] ?? "attack";
}

/** Seeded skill id → caster clip. */
export const SKILL_ANIMATION_BY_ID: ReadonlyMap<string, RigAnimName> = new Map(
  DEFAULT_SKILL_CATALOG.map(skill => [skill.id, skillAnimationFor(skill)]),
);

/** Lookup for content seeding — undefined for ids outside the catalog. */
export function skillAnimationForSkillId(id: string): RigAnimName | undefined {
  return SKILL_ANIMATION_BY_ID.get(id);
}

/** Runtime lookup for a combat event's action id — seeded skills resolve to
 * their authored clip; anything else falls back by shape. */
export function rigClipForAction(actionId: string, heal?: number): RigAnimName {
  const named = SKILL_ANIMATION_BY_ID.get(actionId);
  if (named) return named;
  if (heal && heal > 0) return "cast";
  return "attack";
}
