import type { DropPoolDef, ItemDef, JobDef, QuestDef, SkillDef } from "./gameContentTypes";

const ITEMS_KEY = "ffv_content_items";
const QUESTS_KEY = "ffv_content_quests";
const JOBS_KEY = "ffv_content_jobs";
const SKILLS_KEY = "ffv_content_skills";
const DROPS_KEY = "ffv_content_drops";

export type { DropPoolDef, ItemDef, JobDef, QuestDef, SkillDef } from "./gameContentTypes";

function loadCatalog<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function saveCatalog<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

export function loadItems(): ItemDef[] {
  return loadCatalog<ItemDef>(ITEMS_KEY);
}

export function saveItems(items: ItemDef[]): void {
  saveCatalog(ITEMS_KEY, items);
}

export function loadQuests(): QuestDef[] {
  return loadCatalog<QuestDef>(QUESTS_KEY);
}

export function saveQuests(quests: QuestDef[]): void {
  saveCatalog(QUESTS_KEY, quests);
}

export function loadJobs(): JobDef[] {
  return loadCatalog<JobDef>(JOBS_KEY);
}

export function saveJobs(jobs: JobDef[]): void {
  saveCatalog(JOBS_KEY, jobs);
}

export function loadSkills(): SkillDef[] {
  return loadCatalog<SkillDef>(SKILLS_KEY);
}

export function saveSkills(skills: SkillDef[]): void {
  saveCatalog(SKILLS_KEY, skills);
}

export function loadDrops(): DropPoolDef[] {
  return loadCatalog<DropPoolDef>(DROPS_KEY);
}

export function saveDrops(drops: DropPoolDef[]): void {
  saveCatalog(DROPS_KEY, drops);
}

export function parseIdList(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatIdList(ids: string[]): string {
  return ids.join(",");
}
