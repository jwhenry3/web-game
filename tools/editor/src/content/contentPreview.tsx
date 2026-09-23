import { CLOTH_HEX, HAIR_HEX, SKIN_HEX } from '../../../../wails/frontend/src/three/rig3d.ts';
import { PREFAB_BY_ID } from '../../../../wails/frontend/src/three/prefabs.ts';
import { CATEGORY_COLORS, type VfxCategory } from '../../../../wails/frontend/src/vfx/battleVfxProfiles.ts';
import { getContentTypeSchema } from '../../../../wails/frontend/src/content/contentRegistry.ts';
import type { ContentType, ContentValue } from '../../../../wails/frontend/src/content/contentSchema.ts';
import { normalizeCharacterAsset } from './CharacterAssetEditor.helpers.ts';
import { effectReferenceFromValue, itemEquipmentSpec, RARITY_HEX } from './references.ts';
import { PrefabThumbnail, renderObjectThumbnail } from '../ui/SceneProject.tsx';
import { thumbnailDigest, useThumbnail } from '../ui/thumbCache.ts';
import { equipmentModel } from '../../../../wails/frontend/src/three/equipmentModels.ts';
import { disposeObject } from '../../../../wails/frontend/src/three/terrain.ts';

/** Structural subset shared by ContentDefinition and ExternalAssetGraphNode —
 * enough to decide which generated preview to render. */
export interface ThumbSubject {
  id: string;
  type: ContentType;
  thumbnail?: string;
  data?: Record<string, ContentValue>;
}

const shade = (hex: string, amount: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const shift = (channel: number) => Math.max(0, Math.min(255, channel + amount));
  const r = shift((n >> 16) & 0xff), g = shift((n >> 8) & 0xff), b = shift(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

const hashHue = (id: string): number => {
  let hash = 5381;
  for (let index = 0; index < id.length; index++) hash = (hash * 33 ^ id.charCodeAt(index)) >>> 0;
  return hash % 360;
};

const numHex = (n: number): string => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;

/** Front-facing paperdoll built from the character asset's appearance
 * palette — same skin/hair/cloth picks the 3D rig uses. */
function CharacterFigure({ value }: { value: ContentValue | undefined }) {
  const appearance = normalizeCharacterAsset(value).appearance;
  const skin = SKIN_HEX[String(appearance.skin ?? '')] ?? SKIN_HEX.c1;
  const hair = HAIR_HEX[String(appearance.hairColor ?? '')] ?? HAIR_HEX.c1;
  const cloth = CLOTH_HEX[String(appearance.clothColor ?? '')] ?? CLOTH_HEX.c1;
  const legs = shade(cloth, -32);
  return (
    <svg viewBox="0 0 24 32" width="100%" height="100%" aria-hidden="true">
      <rect x="7.4" y="21" width="4" height="9" rx="1.6" fill={legs} />
      <rect x="12.6" y="21" width="4" height="9" rx="1.6" fill={legs} />
      <rect x="6" y="11.5" width="12" height="10.5" rx="3.6" fill={cloth} />
      <circle cx="12" cy="6.8" r="4.6" fill={skin} />
      <path d="M7.3 6.6 A4.7 4.7 0 0 1 16.7 6.6 Z" fill={hair} />
    </svg>
  );
}

/** Glow dot tinted by the referenced VFX category color. */
function EffectOrb({ value }: { value: ContentValue | undefined }) {
  const category = effectReferenceFromValue(value) as VfxCategory | '';
  const color = category ? numHex(CATEGORY_COLORS[category]) : '#e6b66d';
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill={color} opacity="0.22" />
      <circle cx="12" cy="12" r="5" fill={color} />
      <circle cx="12" cy="12" r="2" fill="#ffffff" opacity="0.7" />
    </svg>
  );
}

/** Offscreen render of the item's procedural model, compiled once per data
 * change and cached — the grid just reads the image. Falls back to the
 * rarity gem while the first frame is pending. */
function ItemThumb({ item }: { item: ThumbSubject }) {
  const image = useThumbnail(`item:${item.id}`, thumbnailDigest(['item', item.data]), () => {
    const model = equipmentModel(itemEquipmentSpec(item));
    const url = renderObjectThumbnail(model);
    disposeObject(model);
    return url;
  });
  return image ? <img src={image} alt="" /> : <ItemGem rarity={String(item.data?.rarity ?? '')} />;
}

/** Gem tinted by item rarity (matches the runtime rarity palette). */
function ItemGem({ rarity }: { rarity: string }) {
  const color = RARITY_HEX[rarity] ?? RARITY_HEX.common;
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path d="M12 3 L19 9 L12 21 L5 9 Z" fill={color} />
      <path d="M12 3 L19 9 L5 9 Z" fill="#ffffff" opacity="0.28" />
    </svg>
  );
}

const prefabIdOf = (value: ContentValue | undefined): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = (value as Record<string, ContentValue>).prefabId;
    if (typeof id === 'string') return id;
  }
  return '';
};

/** Real offscreen-rendered prefab thumbnail when the id resolves to a
 * compiled def; otherwise the tinted cube. */
function PrefabPreview({ value, fallback }: { value: ContentValue | undefined; fallback: React.ReactNode }) {
  const def = PREFAB_BY_ID.get(prefabIdOf(value));
  if (!def) return <>{fallback}</>;
  return <PrefabThumbnail source={def} fallback="▧" />;
}

/** Isometric cube tinted by the referenced prefab's first color prop. */
function PrefabCube({ value }: { value: ContentValue | undefined }) {
  const def = PREFAB_BY_ID.get(prefabIdOf(value));
  const colorProp = def?.props?.find(prop => prop.type === 'color');
  const color = typeof colorProp?.default === 'string' ? colorProp.default : '#9ec77f';
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path d="M12 3 L20 8 V16 L12 21 L4 16 V8 Z" fill={color} />
      <path d="M12 3 L20 8 L12 13 L4 8 Z" fill="#ffffff" opacity="0.28" />
      <path d="M12 13 L20 8 V16 L12 21 Z" fill="#000000" opacity="0.18" />
    </svg>
  );
}

/** Generic tile — deterministic per-id gradient behind the type glyph so
 * visually similar types still read as distinct assets. */
function IconTile({ item }: { item: ThumbSubject }) {
  const schema = getContentTypeSchema(item.type);
  const hue = hashHue(item.id);
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <rect width="24" height="24" fill={`hsl(${hue} 30% 26%)`} />
      <rect y="16" width="24" height="8" fill={`hsl(${hue} 34% 18%)`} />
      <text x="12" y="15.5" textAnchor="middle" fontSize="10" fill={schema.color}>{schema.icon}</text>
    </svg>
  );
}

/** Thumbnail content for an asset: the authored `thumbnail` image when set,
 * otherwise a generated preview from the asset's own data (character
 * appearance, VFX category color, item rarity, prefab color), otherwise the
 * type glyph on a deterministic gradient. Caller supplies the sized frame —
 * fills it with img/svg at 100%. */
export default function AssetThumb({ item }: { item: ThumbSubject }) {
  const character = item.data?.character;
  if (item.thumbnail) return <img src={item.thumbnail} alt="" />;
  if (character && typeof character === 'object' && !Array.isArray(character)) {
    const inner = normalizeCharacterAsset(character).thumbnail;
    if (inner) return <img src={inner} alt="" />;
    return <CharacterFigure value={character} />;
  }
  if (item.type === 'effect') return <EffectOrb value={item.data?.effect ?? item.data?.sourceId} />;
  if (item.type === 'item') return <ItemThumb item={item} />;
  if (item.type === 'prefab') {
    const value = item.data?.prefab ?? item.data?.sourceId;
    return <PrefabPreview value={value} fallback={<PrefabCube value={value} />} />;
  }
  return <IconTile item={item} />;
}
