import { getContentTypeSchema, type InspectorField } from '../../../../wails/frontend/src/content/contentRegistry.ts';
import type { ContentType } from '../../../../wails/frontend/src/content/contentSchema.ts';
import type { AssetGraph, AssetGraphEdge, AssetGraphNode } from '../../../../wails/frontend/src/content/recursiveAssets.ts';

/** Singular display labels — schema labels are plural ("Items"), which reads
 * wrong on a single relationship row. */
export const ASSET_TYPE_LABELS: Record<ContentType, string> = {
  npc: 'NPC',
  poi: 'POI',
  item: 'Item',
  dialogue: 'Dialogue',
  quest: 'Quest',
  vendor: 'Vendor',
  lootTable: 'Loot table',
  ability: 'Ability',
  statusEffect: 'Status effect',
  recipe: 'Recipe',
  spawnSet: 'Spawn set',
  character: 'Character',
  effect: 'Effect',
  prefab: 'Prefab',
};

/** camelCase/snake_case data keys → "Loot table", "Action args". */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!words) return key;
  return words
    .split(' ')
    .map((word, index) => (index === 0 ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()))
    .join(' ');
}

export interface GraphNodeDisplay {
  key: string;
  /** Primary label — the asset's display name, or its id when unnamed. */
  title: string;
  /** Secondary label — type plus id/owner context. */
  sub: string;
  icon: string;
  color: string;
  embedded: boolean;
  external: boolean;
  missing: boolean;
  node?: AssetGraphNode;
}

/** Resolves a graph key to a display-ready description. Embedded keys
 * (`owner::data.field`) name the embedded asset and its owner; unresolved
 * keys get a warning style instead of a raw key dump. */
export function describeGraphNode(graph: AssetGraph, key: string): GraphNodeDisplay {
  const node = graph.nodes.get(key);
  const embedded = key.includes('::');
  if (!node) {
    const tail = embedded ? key.slice(key.lastIndexOf('::') + 2) : key;
    return {
      key,
      title: tail,
      sub: 'Missing asset',
      icon: '⚠',
      color: '#e08a7a',
      embedded,
      external: false,
      missing: true,
    };
  }
  const schema = getContentTypeSchema(node.type);
  const title = node.name.trim() || node.id;
  const external = 'external' in node && node.external === true;
  let sub = ASSET_TYPE_LABELS[node.type] ?? node.type;
  if (embedded) {
    const ownerId = key.slice(0, key.indexOf('::'));
    const owner = graph.nodes.get(ownerId);
    sub += ` · in ${owner ? owner.name.trim() || owner.id : ownerId}`;
  } else if (node.id !== title) {
    sub += ` · ${node.id}`;
  }
  return { key, title, sub, icon: schema.icon, color: schema.color, embedded, external, missing: false, node };
}

interface PathPart { key?: string; index?: number }

/** `definitions[0].data.stock[2].item` → [{key:stock},{index:2},{key:item}].
 * For edges owned by embedded assets the last `.data.` segment is the field
 * path inside that asset, so the owner's own nesting doesn't pollute the
 * label. */
function dataPathParts(path: string): PathPart[] {
  const tail = path.includes('.data.')
    ? path.slice(path.lastIndexOf('.data.') + '.data.'.length)
    : path.replace(/^definitions\[\d+\]\.?/, '').replace(/^data\.?/, '');
  const parts: PathPart[] = [];
  for (const segment of tail.split('.')) {
    const re = /([^\[\]]+)|\[(\d+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(segment))) {
      if (match[1] !== undefined) parts.push({ key: match[1] });
      else parts.push({ index: Number(match[2]) });
    }
  }
  return parts;
}

function findField(fields: readonly InspectorField[] | undefined, key: string): InspectorField | undefined {
  return fields?.find(field => field.key === key);
}

function schemaFields(node: AssetGraphNode | undefined): InspectorField[] {
  if (!node) return [];
  try { return getContentTypeSchema(node.type).groups.flatMap(group => group.fields); }
  catch { return []; }
}

/** Human-readable location of a reference inside its owner:
 * `definitions[0].data.lootTable` → "Loot table",
 * `…stock[2].item` → "Entries #3 → Item",
 * `…behaviors[0].actionArgs.item` → "Behavior graph #1 → Action args → Item". */
export function describeEdgePath(graph: AssetGraph, edge: AssetGraphEdge): string {
  const parts = dataPathParts(edge.path);
  if (!parts.length) return edge.path;
  let fields = schemaFields(graph.nodes.get(edge.from));
  const labels: string[] = [];
  for (const part of parts) {
    if (part.index !== undefined) {
      if (labels.length) labels[labels.length - 1] += ` #${part.index + 1}`;
      continue;
    }
    const key = part.key ?? '';
    const field = findField(fields, key);
    labels.push(field?.label ?? humanizeKey(key));
    fields = field?.itemFields ?? [];
  }
  return labels.join(' → ');
}

/** One-line summary for the delete-impact modal and similar list rows:
 * "<Source name> · <field>". */
export function describeEdge(graph: AssetGraph, edge: AssetGraphEdge): string {
  const source = describeGraphNode(graph, edge.from);
  return `${source.title} · ${describeEdgePath(graph, edge)}`;
}
