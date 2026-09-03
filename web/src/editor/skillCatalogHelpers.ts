import type { SkillDef } from "./gameContentTypes";

export function normalizeSkillDef(skill: SkillDef): SkillDef {
  return {
    id: skill.id,
    name: skill.name,
    category: skill.category,
    weapon_req: skill.weapon_req,
    mp_cost: skill.mp_cost ?? 0,
    power: skill.power ?? 1,
    magic: skill.magic ?? false,
    heals: skill.heals ?? false,
    buffs: skill.buffs ?? false,
    loot: skill.loot ?? false,
    ranged: skill.ranged ?? false,
    world_only: skill.world_only ?? false,
    cast_time_ms: skill.cast_time_ms ?? 0,
    description: skill.description ?? "",
  };
}

export function createDefaultSkill(id = `skill_${Date.now()}`): SkillDef {
  return {
    id,
    name: "New Skill",
    mp_cost: 0,
    power: 1,
    magic: false,
    heals: false,
    buffs: false,
    loot: false,
    ranged: false,
    world_only: false,
    cast_time_ms: 0,
    description: "",
  };
}

export function skillCatalogSubtitle(skill: SkillDef): string {
  if (skill.world_only) return "world";
  return skill.category ?? skill.id;
}
