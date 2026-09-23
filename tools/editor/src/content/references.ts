import { VFX_CATEGORIES, VFX_PARTS, type VfxCategory, type VfxPart } from '../../../../wails/frontend/src/vfx/battleVfxProfiles.ts';
import type { PrefabKind } from '../../../../wails/frontend/src/three/scene3d.ts';
import type { ContentDefinition, ContentDocument, ContentValue } from '../../../../wails/frontend/src/content/contentSchema.ts';
import { isAssetReference, isEmbeddedAsset } from '../../../../wails/frontend/src/content/recursiveAssets.ts';
import { itemMaterial, type EquipmentSpec } from '../../../../wails/frontend/src/three/equipmentModels.ts';

// Pure resolvers shared by the specialist editors, the asset preview
// pipeline, and SceneView — kept in a leaf module so non-React code can
// resolve stored references without importing the editor components.

/** Extracts the stored prefab id — plain string or `{prefabId}` object. */
export function prefabReferenceFromValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'prefabId' in (value as Record<string, unknown>)) {
    return String((value as { prefabId: unknown }).prefabId);
  }
  return '';
}

/**
 * Resolves a stable effect profile/category id from a stored value. Only
 * known VFX categories pass through — anything else is treated as unset so
 * stale values don't silently bind.
 */
export function effectReferenceFromValue(value: unknown): string {
  const id = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)
      ? String((value as { id: unknown }).id)
      : '';
  return (VFX_CATEGORIES as readonly string[]).includes(id) ? id : '';
}

/** An `effect` asset's own binding — its palette category plus which part of
 * the ability sequence it plays. Missing/invalid fields fall back to a bare
 * impact so the asset still previews something. */
export function effectAssetSpec(definition: ContentDefinition): { category: VfxCategory | ''; part: VfxPart } {
  const category = effectReferenceFromValue(definition.data.effect) as VfxCategory | '';
  const part = String(definition.data.part ?? '');
  return { category, part: (VFX_PARTS as readonly string[]).includes(part) ? (part as VfxPart) : 'impact' };
}

/** Resolved effect binding for an `editorId: 'effect'` slot — which category
 * profile supplies the segment and which part of it plays. Slot values hold
 * effect-asset ids; legacy category strings resolve to the slot's own part so
 * `impactEffect: 'fire'` still reads as "Fire Impact". */
export function effectPartFromValue(
  value: ContentValue | undefined,
  doc: ContentDocument,
  slotPart: VfxPart = 'impact',
): { category: VfxCategory; part: VfxPart; assetId?: string } | null {
  const definition = isEmbeddedAsset(value)
    ? value.definition
    : doc.definitions.find(d =>
        d.id === (isAssetReference(value) ? value.id : typeof value === 'string' ? value : ''),
      );
  if (definition?.type === 'effect') {
    const spec = effectAssetSpec(definition);
    return spec.category ? { category: spec.category, part: spec.part, assetId: definition.id } : null;
  }
  const category = effectReferenceFromValue(value) as VfxCategory | '';
  return category ? { category, part: slotPart } : null;
}

/** Recommended prefab kind for a content definition — drives the filtered
 * suggestions shown in the picker. */
export function prefabKindForDefinition(definition: Pick<ContentDefinition, 'type'>): PrefabKind {
  return definition.type === 'npc' || definition.type === 'poi' || definition.type === 'item' ? definition.type : 'decoration';
}

/** Item rarity → tint, matching the runtime rarity palette. */
export const RARITY_HEX: Record<string, string> = {
  common: '#9aa4ad',
  uncommon: '#6fc26f',
  rare: '#5aa3e8',
  epic: '#b07fe8',
  legendary: '#e8b04a',
};

/** Equipment model spec for an item record — shared by the scene preview,
 * world placements, and grid thumbnails so they all draw the same model. */
export function itemEquipmentSpec(item: { id: string; data?: Record<string, unknown> }): EquipmentSpec & { attachment?: string } {
  const data = item.data ?? {};
  return {
    slot: String(data.slot ?? ''),
    model: String(data.model ?? ''),
    weaponType: String(data.weaponType ?? ''),
    armorClass: String(data.armorClass ?? ''),
    material: itemMaterial(item.id),
    accent: parseInt((RARITY_HEX[String(data.rarity ?? '')] ?? RARITY_HEX.common).slice(1), 16),
    attachment: String(data.attachment ?? ''),
  };
}
