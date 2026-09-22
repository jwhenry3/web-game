import type { ContentDefinition } from '../../../../wails/frontend/src/content/contentSchema.ts';

export interface AssetNavigationEntry {
  key: string;
  label: string;
  definition: ContentDefinition;
  /** For embedded children: path inside the owning root definition's `data`
   * to the `{$kind:'embedded'}` marker (e.g. `reward` or `list[0].item`).
   * Undefined on root entries. */
  dataPath?: string;
}
export type AssetNavigationStack = readonly AssetNavigationEntry[];

export function openAsset(stack: AssetNavigationStack, entry: AssetNavigationEntry): AssetNavigationStack {
  const existing = stack.findIndex(item => item.key === entry.key);
  if (existing >= 0) return [...stack.slice(0, existing), entry];
  return [...stack, entry];
}
export function closeAssetTo(stack: AssetNavigationStack, key: string): AssetNavigationStack {
  const index = stack.findIndex(item => item.key === key);
  return index < 0 ? stack : stack.slice(0, index + 1);
}
export function parentAsset(stack: AssetNavigationStack): AssetNavigationStack { return stack.slice(0, Math.max(0, stack.length - 1)); }
export function currentAsset(stack: AssetNavigationStack): AssetNavigationEntry | undefined { return stack.at(-1); }
