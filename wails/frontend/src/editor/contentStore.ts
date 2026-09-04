import type { EntityDefinition } from "./entities";
import { loadEntities as loadEntitiesLocal, saveEntities as saveEntitiesLocal } from "./entities";
import { normalizeJobDef } from "./jobCatalogHelpers";
import { normalizeSkillDef } from "./skillCatalogHelpers";
import { normalizeDropPoolDef } from "./dropCatalogHelpers";
import {
  loadDrops as loadDropsLocal,
  loadItems as loadItemsLocal,
  loadJobs as loadJobsLocal,
  loadQuests as loadQuestsLocal,
  loadSkills as loadSkillsLocal,
  saveDrops as saveDropsLocal,
  saveItems as saveItemsLocal,
  saveJobs as saveJobsLocal,
  saveQuests as saveQuestsLocal,
  saveSkills as saveSkillsLocal,
  type DropPoolDef,
  type ItemDef,
  type JobDef,
  type QuestDef,
  type SkillDef,
} from "./contentCatalogs";
import type { MapPrefab } from "./prefabs";
import { loadPrefabs as loadPrefabsLocal, savePrefabs as savePrefabsLocal } from "./prefabs";
import {
  DEFAULT_DROP_CATALOG,
  DEFAULT_ENTITY_CATALOG,
  DEFAULT_ITEM_CATALOG,
  DEFAULT_JOB_CATALOG,
  DEFAULT_PREFAB_CATALOG,
  DEFAULT_QUEST_CATALOG,
  DEFAULT_SKILL_CATALOG,
} from "./seedCatalog";
import type { ImportedTileset } from "./tilesetConfig";
import {
  loadDefaultPipoyaTileset,
  loadTileset as loadTilesetLocal,
  saveTileset as saveTilesetLocal,
} from "./tilesetConfig";
import { fetchAdminContent, saveAdminContent, type ContentKind } from "../net/adminContent";

export type { DropPoolDef, ItemDef, JobDef, QuestDef, SkillDef } from "./contentCatalogs";

export interface ContentCatalogs {
  entities: EntityDefinition[];
  prefabs: MapPrefab[];
  tileset: ImportedTileset | null;
  items: ItemDef[];
  quests: QuestDef[];
  jobs: JobDef[];
  skills: SkillDef[];
  drops: DropPoolDef[];
}

function hasLocalEntities(items: EntityDefinition[]): boolean {
  return items.length > 0;
}

function hasLocalPrefabs(items: MapPrefab[]): boolean {
  return items.length > 0;
}

function hasLocalTileset(tileset: ImportedTileset | null): boolean {
  return tileset != null;
}

function hasLocalItems(items: ItemDef[]): boolean {
  return items.length > 0;
}

function hasLocalQuests(items: QuestDef[]): boolean {
  return items.length > 0;
}

function hasLocalJobs(items: JobDef[]): boolean {
  return items.length > 0;
}

function hasLocalSkills(items: SkillDef[]): boolean {
  return items.length > 0;
}

function hasLocalDrops(items: DropPoolDef[]): boolean {
  return items.length > 0;
}

async function syncCatalog<T>(
  kind: ContentKind,
  loadLocal: () => T,
  saveLocal: (value: T) => void,
  isEmpty: (value: T) => boolean,
  validate: (value: unknown) => value is T,
  defaults: T,
): Promise<T> {
  const local = loadLocal();
  try {
    const remote = await fetchAdminContent<unknown>(kind);
    if (validate(remote) && !isEmpty(remote)) {
      saveLocal(remote);
      return remote;
    }
    if (!isEmpty(local)) {
      await saveAdminContent(kind, local);
      return local;
    }
    if (validate(remote)) {
      saveLocal(remote);
      return remote;
    }
    if (!isEmpty(defaults)) {
      saveLocal(defaults);
      await saveAdminContent(kind, defaults);
      return defaults;
    }
  } catch {
    // Offline or unauthorized — keep local cache or fall back to defaults.
    if (isEmpty(local) && !isEmpty(defaults)) {
      saveLocal(defaults);
      return defaults;
    }
  }
  return local;
}

/** Load catalogs from server, migrating localStorage when server is empty. */
export async function syncAllContentCatalogs(): Promise<ContentCatalogs> {
  const [entities, prefabs, tileset, items, quests, jobs, skills, drops] = await Promise.all([
    syncCatalog(
      "entities",
      loadEntitiesLocal,
      saveEntitiesLocal,
      (items) => !hasLocalEntities(items),
      (v): v is EntityDefinition[] => Array.isArray(v),
      DEFAULT_ENTITY_CATALOG,
    ),
    syncCatalog(
      "prefabs",
      loadPrefabsLocal,
      savePrefabsLocal,
      (items) => !hasLocalPrefabs(items),
      (v): v is MapPrefab[] => Array.isArray(v),
      DEFAULT_PREFAB_CATALOG,
    ),
    syncCatalog(
      "tileset",
      loadTilesetLocal,
      saveTilesetLocal,
      (t) => !hasLocalTileset(t),
      (v): v is ImportedTileset | null => v === null || (typeof v === "object" && v !== null && !Array.isArray(v)),
      null,
    ),
    syncCatalog(
      "items",
      loadItemsLocal,
      saveItemsLocal,
      (items) => !hasLocalItems(items),
      (v): v is ItemDef[] => Array.isArray(v),
      DEFAULT_ITEM_CATALOG,
    ),
    syncCatalog(
      "quests",
      loadQuestsLocal,
      saveQuestsLocal,
      (items) => !hasLocalQuests(items),
      (v): v is QuestDef[] => Array.isArray(v),
      DEFAULT_QUEST_CATALOG,
    ),
    syncCatalog(
      "jobs",
      loadJobsLocal,
      saveJobsLocal,
      (items) => !hasLocalJobs(items),
      (v): v is JobDef[] => Array.isArray(v),
      DEFAULT_JOB_CATALOG,
    ),
    syncCatalog(
      "skills",
      loadSkillsLocal,
      saveSkillsLocal,
      (items) => !hasLocalSkills(items),
      (v): v is SkillDef[] => Array.isArray(v),
      DEFAULT_SKILL_CATALOG,
    ),
    syncCatalog(
      "drops",
      loadDropsLocal,
      saveDropsLocal,
      (items) => !hasLocalDrops(items),
      (v): v is DropPoolDef[] => Array.isArray(v),
      DEFAULT_DROP_CATALOG,
    ),
  ]);
  let resolvedTileset = tileset;
  if (!resolvedTileset) {
    try {
      resolvedTileset = await loadDefaultPipoyaTileset();
      saveTilesetLocal(resolvedTileset);
    } catch {
      resolvedTileset = null;
    }
  }
  return { entities, prefabs, tileset: resolvedTileset, items, quests, jobs, skills, drops };
}

export function persistEntities(entities: EntityDefinition[]): void {
  saveEntitiesLocal(entities);
  void saveAdminContent("entities", entities).catch(() => {});
}

export function persistPrefabs(prefabs: MapPrefab[]): void {
  savePrefabsLocal(prefabs);
  void saveAdminContent("prefabs", prefabs).catch(() => {});
}

export function persistTileset(tileset: ImportedTileset | null): void {
  saveTilesetLocal(tileset);
  void saveAdminContent("tileset", tileset).catch(() => {});
}

export function persistItems(items: ItemDef[]): void {
  saveItemsLocal(items);
  void saveAdminContent("items", items).catch(() => {});
}

export function persistQuests(quests: QuestDef[]): void {
  saveQuestsLocal(quests);
  void saveAdminContent("quests", quests).catch(() => {});
}

export function persistJobs(jobs: JobDef[]): void {
  const normalized = jobs.map(normalizeJobDef);
  saveJobsLocal(normalized);
  void saveAdminContent("jobs", normalized).catch(() => {});
}

export function persistSkills(skills: SkillDef[]): void {
  const normalized = skills.map(normalizeSkillDef);
  saveSkillsLocal(normalized);
  void saveAdminContent("skills", normalized).catch(() => {});
}

export function persistDrops(drops: DropPoolDef[]): void {
  const normalized = drops.map(normalizeDropPoolDef);
  saveDropsLocal(normalized);
  void saveAdminContent("drops", normalized).catch(() => {});
}
