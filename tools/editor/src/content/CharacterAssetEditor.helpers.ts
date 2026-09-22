import type { ContentValue } from '../../../../wails/frontend/src/content/contentSchema';

export const CHARACTER_ANIMATION_SLOTS = ['idle', 'run', 'attack'] as const;
export type CharacterAnimationSlot = (typeof CHARACTER_ANIMATION_SLOTS)[number];

export interface CharacterAssetValue extends Record<string, ContentValue> {
  rigId: string;
  appearance: Record<string, ContentValue>;
  animations: Record<string, ContentValue>;
  thumbnail: string;
}

const record = (value: ContentValue | undefined): Record<string, ContentValue> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as unknown as Record<string, ContentValue> : {};

/** Normalize only the editor-owned shape and retain extension data verbatim. */
export function normalizeCharacterAsset(value: ContentValue | undefined): CharacterAssetValue {
  const source = record(value);
  return {
    ...source,
    rigId: typeof source.rigId === 'string' ? source.rigId : '',
    appearance: { ...record(source.appearance) },
    animations: { ...record(source.animations) },
    thumbnail: typeof source.thumbnail === 'string' ? source.thumbnail : '',
  };
}

/** Immutable nested update used by embedded/recursive inspectors. */
export function setCharacterAssetValue(
  value: ContentValue | undefined,
  path: readonly string[],
  next: ContentValue,
): CharacterAssetValue {
  const root = normalizeCharacterAsset(value);
  if (!path.length) return root;
  const update = (node: Record<string, ContentValue>, depth: number): Record<string, ContentValue> => {
    const key = path[depth];
    if (depth === path.length - 1) return { ...node, [key]: next };
    return { ...node, [key]: update(record(node[key]), depth + 1) };
  };
  return normalizeCharacterAsset(update(root, 0));
}

export function characterRigSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}
