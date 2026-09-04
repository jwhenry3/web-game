import type { JobDef, JobSkillNode, SkillDef } from "./gameContentTypes";

export function createDefaultJob(id = `JOB_${Date.now()}`): JobDef {
  return {
    id,
    name: "New Job",
    abbr: "NEW",
    category: "swordplay",
    weapon: "sword",
    stat_mults: {},
    starting: false,
    skill_tree: [],
  };
}

export function normalizeJobDef(job: JobDef): JobDef {
  return {
    ...createDefaultJob(job.id),
    ...job,
    stat_mults: { ...job.stat_mults },
    skill_tree: (job.skill_tree ?? []).map((node) => ({
      skill_id: node.skill_id,
      prereq_skill_id: node.prereq_skill_id || undefined,
    })),
  };
}

/** Tier depth from tree roots (nodes with no prereq in-tree). */
export function computeSkillTreeTiers(nodes: JobSkillNode[]): Map<string, number> {
  const tiers = new Map<string, number>();
  const ids = new Set(nodes.map((n) => n.skill_id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      const prereq = node.prereq_skill_id;
      if (!prereq || !ids.has(prereq)) {
        if (tiers.get(node.skill_id) !== 0) {
          tiers.set(node.skill_id, 0);
          changed = true;
        }
      } else {
        const pt = tiers.get(prereq);
        if (pt !== undefined) {
          const next = pt + 1;
          if (tiers.get(node.skill_id) !== next) {
            tiers.set(node.skill_id, next);
            changed = true;
          }
        }
      }
    }
  }
  return tiers;
}

export function combatSkillOptions(skills: SkillDef[]): { id: string; name: string }[] {
  return skills
    .filter((s) => !s.world_only && s.id !== "attack")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({ id: s.id, name: s.name }));
}

export function treePrereqOptions(
  tree: JobSkillNode[],
  skillId: string,
  skills: SkillDef[],
): { id: string; name: string }[] {
  const name = (id: string) => skills.find((s) => s.id === id)?.name ?? id;
  return tree
    .filter((n) => n.skill_id !== skillId && n.skill_id)
    .map((n) => ({ id: n.skill_id, name: name(n.skill_id) }));
}

export function addSkillTreeNode(job: JobDef, skillId: string): JobDef {
  if (!skillId || job.skill_tree.some((n) => n.skill_id === skillId)) return job;
  return { ...job, skill_tree: [...job.skill_tree, { skill_id: skillId }] };
}

export function updateSkillTreeNode(
  job: JobDef,
  index: number,
  patch: Partial<JobSkillNode>,
): JobDef {
  const tree = job.skill_tree.map((node, i) => (i === index ? { ...node, ...patch } : node));
  return { ...job, skill_tree: tree };
}

export function removeSkillTreeNode(job: JobDef, index: number): JobDef {
  const removedId = job.skill_tree[index]?.skill_id;
  const tree = job.skill_tree
    .filter((_, i) => i !== index)
    .map((node) =>
      node.prereq_skill_id === removedId ? { ...node, prereq_skill_id: undefined } : node,
    );
  return { ...job, skill_tree: tree };
}
