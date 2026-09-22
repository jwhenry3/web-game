export const CONTENT_DOCUMENT_VERSION = 1 as const;

export type ContentType = 'npc' | 'poi' | 'item' | 'dialogue' | 'quest' | 'vendor' | 'lootTable' | 'ability' | 'statusEffect' | 'recipe' | 'spawnSet';

export interface AssetReferenceValue {
  $kind: 'assetRef';
  id: string;
}

export interface EmbeddedAssetValue {
  $kind: 'embedded';
  definition: ContentDefinition;
}

export type ContentValue = string | number | boolean | null | AssetReferenceValue | EmbeddedAssetValue | ContentValue[] | { [key: string]: ContentValue };

export interface ContentDefinition {
  id: string;
  type: ContentType;
  name: string;
  description: string;
  thumbnail?: string;
  tags: string[];
  data: Record<string, ContentValue>;
}

export interface ContentDocument {
  version: typeof CONTENT_DOCUMENT_VERSION;
  definitions: ContentDefinition[];
}

export interface ContentValidationIssue { path: string; message: string; severity: 'error' | 'warning' }

const TYPES = new Set<ContentType>(['npc', 'poi', 'item', 'dialogue', 'quest', 'vendor', 'lootTable', 'ability', 'statusEffect', 'recipe', 'spawnSet']);
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function defaultContentDocument(): ContentDocument {
  return { version: CONTENT_DOCUMENT_VERSION, definitions: [] };
}

function normalizeDefinition(raw: unknown, index: number): ContentDefinition {
  const row = isObject(raw) ? raw : {};
  const type = TYPES.has(row.type as ContentType) ? row.type as ContentType : 'item';
  const data: Record<string, ContentValue> = {};
  if (isObject(row.data)) for (const [key, child] of Object.entries(row.data)) data[key] = normalizeValue(child, 0);
  return {
    id: typeof row.id === 'string' ? row.id : `definition_${index + 1}`,
    type,
    name: typeof row.name === 'string' ? row.name : '',
    description: typeof row.description === 'string' ? row.description : '',
    thumbnail: typeof row.thumbnail === 'string' ? row.thumbnail : undefined,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    data,
  };
}

/**
 * Deep-normalize a content value. Valid `assetRef`/`embedded` markers are
 * canonicalized (embedded definitions recurse through full normalization);
 * malformed markers survive as plain objects so validation can flag them.
 */
function normalizeValue(value: unknown, depth: number): ContentValue {
  if (depth > 64) return null;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(child => normalizeValue(child, depth + 1));
  if (isObject(value)) {
    if (value.$kind === 'assetRef') {
      return typeof value.id === 'string' && value.id ? { $kind: 'assetRef', id: value.id } : value as ContentValue;
    }
    if (value.$kind === 'embedded') {
      return isObject(value.definition) ? { $kind: 'embedded', definition: normalizeDefinition(value.definition, 0) } : value as ContentValue;
    }
    const out: Record<string, ContentValue> = {};
    for (const [key, child] of Object.entries(value)) out[key] = normalizeValue(child, depth + 1);
    return out;
  }
  return null;
}

export function normalizeContentDocument(value: unknown): ContentDocument {
  if (!isObject(value) || !Array.isArray(value.definitions)) return defaultContentDocument();
  const definitions = value.definitions.map((raw, index) => normalizeDefinition(raw, index));
  return { version: CONTENT_DOCUMENT_VERSION, definitions };
}

/** Walk serialized data for marker objects: unknown `$kind` values or
 * malformed markers surface as issues instead of silently round-tripping. */
function checkMarkers(value: ContentValue, path: string, issues: ContentValidationIssue[]): void {
  if (Array.isArray(value)) { value.forEach((child, index) => checkMarkers(child, `${path}[${index}]`, issues)); return; }
  if (!isObject(value)) return;
  if ('$kind' in value) {
    if (value.$kind === 'assetRef') {
      if (typeof value.id !== 'string' || !value.id) issues.push({ path, message: 'Asset reference marker is missing an ID.', severity: 'error' });
      return;
    }
    if (value.$kind === 'embedded') {
      if (!isObject(value.definition)) {
        issues.push({ path, message: 'Embedded marker is missing a definition.', severity: 'error' });
        return;
      }
      checkMarkers((value.definition as unknown as ContentDefinition).data, `${path}.definition.data`, issues);
      return;
    }
    issues.push({ path, message: `Unknown content marker “${String(value.$kind)}”.`, severity: 'error' });
    return;
  }
  for (const [key, child] of Object.entries(value)) checkMarkers(child, `${path}.${key}`, issues);
}

export function validateContentDocument(doc: ContentDocument): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  const seen = new Set<string>();
  doc.definitions.forEach((definition, index) => {
    const base = `definitions[${index}]`;
    if (!definition.id.trim()) issues.push({ path: `${base}.id`, message: 'ID is required.', severity: 'error' });
    else if (!/^[a-z][a-z0-9_-]*$/i.test(definition.id)) issues.push({ path: `${base}.id`, message: 'Use letters, numbers, underscores, or dashes.', severity: 'error' });
    else if (seen.has(definition.id)) issues.push({ path: `${base}.id`, message: `Duplicate ID “${definition.id}”.`, severity: 'error' });
    seen.add(definition.id);
    if (!definition.name.trim()) issues.push({ path: `${base}.name`, message: 'Display name is required.', severity: 'error' });
    if (!TYPES.has(definition.type)) issues.push({ path: `${base}.type`, message: 'Unknown content type.', severity: 'error' });
    checkMarkers(definition.data, `${base}.data`, issues);
  });
  return issues;
}
