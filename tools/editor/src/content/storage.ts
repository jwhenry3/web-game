import { createContentDefinition } from '../../../../wails/frontend/src/content/contentRegistry';
import { defaultContentDocument, normalizeContentDocument, type ContentDefinition, type ContentDocument, type ContentType, type ContentValue } from '../../../../wails/frontend/src/content/contentSchema';
import {
  DEFAULT_DROP_CATALOG,
  DEFAULT_ENTITY_CATALOG,
  DEFAULT_ITEM_CATALOG,
  DEFAULT_QUEST_CATALOG,
  DEFAULT_SKILL_CATALOG,
} from '../../../../wails/frontend/src/editor/seedCatalog';
import type { EntityDefinition } from '../../../../wails/frontend/src/editor/entities';
import type { DropPoolDef, ItemDef, QuestDef, SkillDef } from '../../../../wails/frontend/src/editor/gameContentTypes';
import { DEFAULT_RIGS } from '../../../../wails/frontend/src/three/rig3dDefaults';
import { PREFABS } from '../../../../wails/frontend/src/three/prefabs';
import { VFX_CATEGORIES } from '../../../../wails/frontend/src/vfx/battleVfxProfiles';

export const CONTENT_STORAGE_KEY = 'mmorpg-content:v1';

function adminHeaders(): HeadersInit {
  const token = sessionStorage.getItem('cm_scene_editor_token') || localStorage.getItem('cm_auth_token');
  if (!token) throw new Error('Sign in as an administrator from the Prefabs workspace first.');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export function parseContentJson(json: string): ContentDocument {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { definitions?: unknown }).definitions)) {
    throw new Error('The JSON must contain a definitions array.');
  }
  return normalizeContentDocument(parsed);
}

const slug = (value: string, fallback = 'asset') =>
  (value || fallback).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
const contentValue = (value: unknown): ContentValue => JSON.parse(JSON.stringify(value ?? null)) as ContentValue;

function definition(type: ContentType, id: string, name: string, data: Record<string, ContentValue> = {}, description = ''): ContentDefinition {
  const base = createContentDefinition(type, slug(id));
  return { ...base, name: name || base.name, description, data: { ...base.data, ...data } };
}

const prop = (entity: EntityDefinition, key: string): ContentValue | undefined =>
  entity.template.properties.find(item => item.name === key)?.value as ContentValue | undefined;

function entityDefinition(entity: EntityDefinition): ContentDefinition {
  const entityId = String(prop(entity, 'id') ?? entity.template.name ?? entity.id);
  if (entity.kind === 'item') {
    return definition('item', entityId, entity.name, {
      legacyKind: entity.kind,
      itemId: String(prop(entity, 'itemId') ?? ''),
      quantity: Number(prop(entity, 'quantity') ?? 1),
      respawnSeconds: Number(prop(entity, 'respawnSec') ?? 0),
    });
  }
  if (entity.kind === 'save_point' || entity.kind === 'portal' || entity.kind === 'quest_trigger' || entity.kind === 'region' || entity.kind === 'sanctuary') {
    return definition('poi', entityId, entity.name, {
      legacyKind: entity.kind,
      quest: entity.kind === 'quest_trigger' ? String(prop(entity, 'questId') ?? '') : '',
      teleportMap: String(prop(entity, 'destMap') ?? ''),
      interactionRadius: 2,
    });
  }
  return definition('npc', entityId, entity.name, {
    legacyKind: entity.kind,
    level: Number(prop(entity, 'level') ?? 1),
    faction: String(prop(entity, 'roles') ?? ''),
    dialogue: String(prop(entity, 'dialogue') ?? ''),
    quest: String(prop(entity, 'questIds') ?? ''),
    vendor: String(prop(entity, 'shopId') ?? ''),
  });
}

function itemDefinition(item: ItemDef): ContentDefinition {
  return definition('item', item.id, item.name, {
    legacyKind: item.kind,
    rarity: item.rarity ?? 'common',
    stackSize: item.max_stack ?? (item.stackable ? 99 : 1),
    level: item.level ?? 1,
    slot: item.slot ?? '',
    weaponType: item.weapon_type ?? '',
    armorClass: item.armor_class ?? '',
    stats: item.stats ?? {},
  }, item.description ?? '');
}

function skillDefinition(skill: SkillDef): ContentDefinition {
  return definition('ability', skill.id, skill.name, {
    cooldown: skill.cooldown_ms ?? 0,
    cost: skill.mp_cost,
    power: skill.power,
    target: skill.target ?? '',
    castTimeMs: skill.cast_time_ms,
    worldOnly: skill.world_only,
    effects: contentValue(skill.effects ?? []),
    branches: contentValue(skill.branches ?? []),
  }, skill.description);
}

function questDefinition(quest: QuestDef): ContentDefinition {
  return definition('quest', quest.id, quest.name, { objectives: [] });
}

function dropDefinition(pool: DropPoolDef): ContentDefinition {
  return definition('lootTable', pool.id, pool.name, {
    entries: pool.entries.map(entry => ({ item: entry.item_id, weight: entry.chance, min: 1, max: 1 })),
  });
}

function specialistDefinitions(): ContentDefinition[] {
  const characters = Object.values(DEFAULT_RIGS).map(rig => definition('character', `character_${rig.id}`, rig.label, {
    character: { rigId: rig.id, thumbnail: '', appearance: {}, animations: {} },
  }));
  const effects = VFX_CATEGORIES.map(category => definition('effect', `effect_${category}`, `${category[0].toUpperCase()}${category.slice(1)}`, {
    effect: category,
  }));
  const prefabs = PREFABS.map(prefab => definition('prefab', `prefab_${prefab.id}`, prefab.label, {
    prefab: prefab.id,
    category: prefab.category,
  }));
  return [...characters, ...effects, ...prefabs];
}

function mergeDefinitions(definitions: ContentDefinition[]): ContentDefinition[] {
  const seen = new Set<string>();
  const out: ContentDefinition[] = [];
  for (const item of definitions) {
    let id = item.id;
    let suffix = 2;
    while (seen.has(id)) id = `${item.id}_${suffix++}`;
    seen.add(id);
    out.push(id === item.id ? item : { ...item, id });
  }
  return out;
}

export function buildInitialContentDocument(): ContentDocument {
  return {
    version: 1,
    definitions: mergeDefinitions([
      ...DEFAULT_ENTITY_CATALOG.map(entityDefinition),
      ...DEFAULT_ITEM_CATALOG.map(itemDefinition),
      ...DEFAULT_QUEST_CATALOG.map(questDefinition),
      ...DEFAULT_SKILL_CATALOG.map(skillDefinition),
      ...DEFAULT_DROP_CATALOG.map(dropDefinition),
      ...specialistDefinitions(),
    ]),
  };
}

export function loadContent(): ContentDocument {
  const raw = localStorage.getItem(CONTENT_STORAGE_KEY);
  if (!raw) return buildInitialContentDocument();
  try {
    const parsed = parseContentJson(raw);
    return parsed.definitions.length ? parsed : buildInitialContentDocument();
  }
  catch { return buildInitialContentDocument(); }
}

export function saveContent(doc: ContentDocument): void {
  localStorage.setItem(CONTENT_STORAGE_KEY, JSON.stringify(doc));
}

export function downloadContent(doc: ContentDocument): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'game-content.json'; anchor.click();
  URL.revokeObjectURL(url);
}

export async function loadServerContent(): Promise<ContentDocument> {
  const response = await fetch('/api/admin/content/gameplay', { headers: adminHeaders() });
  if (response.status === 404) return defaultContentDocument();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const payload: unknown = await response.json();
  const body = payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: unknown }).data : payload;
  return normalizeContentDocument(body);
}

export async function saveServerContent(doc: ContentDocument): Promise<void> {
  const response = await fetch('/api/admin/content/gameplay', { method: 'PUT', headers: adminHeaders(), body: JSON.stringify(doc) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
}
