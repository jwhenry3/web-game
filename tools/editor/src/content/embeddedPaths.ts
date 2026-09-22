import type { ContentDefinition, ContentValue } from '../../../../wails/frontend/src/content/contentSchema.ts';

export type PathSegment = string | number;

/** Parse `data.reward`, `list[0].item`, or `reward.definition.data.effect`
 * into path segments rooted at a definition's `data` object. */
export function parseDataPath(path: string): PathSegment[] {
  const out: PathSegment[] = [];
  for (const match of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (!match) continue;
    out.push(/^\d+$/.test(match) ? Number(match) : match);
  }
  return out;
}

const isObject = (value: unknown): value is Record<string, ContentValue> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Read the value at a data-relative path inside a definition. */
export function getAtDataPath(definition: ContentDefinition, path: string): ContentValue | undefined {
  let cursor: unknown = definition.data;
  for (const segment of parseDataPath(path)) {
    if (cursor === null || cursor === undefined) return undefined;
    cursor = (cursor as Record<string | number, unknown>)[segment];
  }
  return cursor as ContentValue | undefined;
}

function setAtSegments(node: ContentValue, segments: PathSegment[], value: ContentValue): ContentValue {
  if (segments.length === 0) return value;
  const [head, ...rest] = segments;
  if (Array.isArray(node)) {
    const next = node.slice();
    next[Number(head)] = setAtSegments(next[Number(head)] ?? null, rest, value);
    return next;
  }
  const out: Record<string, ContentValue> = isObject(node) ? { ...node } : {};
  out[String(head)] = setAtSegments(out[String(head)] ?? null, rest, value);
  return out;
}

/** Immutable write into a definition's `data` at the given path. */
export function setAtDataPath(definition: ContentDefinition, path: string, value: ContentValue): ContentDefinition {
  return { ...definition, data: setAtSegments(definition.data, parseDataPath(path), value) as Record<string, ContentValue> };
}
