import type { ContentDefinition, ContentType, ContentValue } from './contentSchema.ts';
import { VFX_PARTS, VFX_PART_LABELS, type VfxPart } from '../vfx/battleVfxProfiles.ts';
import { ARMOR_CLASSES, EQUIP_SLOTS, ITEM_KINDS, ITEM_STAT_KEYS, ITEM_TARGETS, WEAPON_TYPES } from '../editor/gameContentTypes.ts';
import { ITEM_MODEL_IDS } from '../three/equipmentModels.ts';
import { DEFAULT_RIGS } from '../three/rig3dDefaults.ts';

export type InspectorFieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'tags' | 'asset' | 'reference' | 'list' | 'behaviorList' | 'assetSlot' | 'embeddedAsset' | 'customEditor' | 'record';
export type AssetSlotMode = 'reference' | 'embedded' | 'either';
export interface InspectorOption { value: string; label: string }
export interface InspectorField {
  key: string;
  label: string;
  type: InspectorFieldType;
  help?: string;
  options?: InspectorOption[];
  referenceTypes?: ContentType[];
  slotMode?: AssetSlotMode;
  itemFields?: InspectorField[];
  /** For `record` fields — fixed keys edited inside the object value
   * (item stat bonuses, usage effects, …). */
  recordFields?: InspectorField[];
  defaultValue?: ContentValue;
  /** For `customEditor` fields — resolved through the content field editor registry. */
  editorId?: string;
  /** For `editorId: 'effect'` slots — which effect part this slot binds
   * (cast/projectile/impact/area). Filters the adapter's asset picker and
   * resolves legacy category values to that part's segment. */
  part?: VfxPart;
  /** Marks fields whose value participates in the recursive asset graph. */
  recursive?: boolean;
}
export interface InspectorGroup {
  id: string;
  label: string;
  fields: InspectorField[];
  /** Hide the whole group when `data[hideWhen]` is truthy — e.g. passive
   * abilities have no cast/effect fields. */
  hideWhen?: string;
  /** Show the group only when `data[key]` equals `equals` — e.g. equipment
   * fields only on `legacyKind: 'equipment'` items. */
  showWhen?: { key: string; equals: ContentValue };
}
export interface ContentTypeSchema { type: ContentType; label: string; icon: string; color: string; groups: InspectorGroup[] }

export interface InspectorFieldKind {
  type: InspectorFieldType;
  label: string;
  recursive?: boolean;
}

const fieldKindRegistry = new Map<InspectorFieldType, InspectorFieldKind>();
export function registerInspectorFieldKind(kind: InspectorFieldKind): () => void {
  const previous = fieldKindRegistry.get(kind.type);
  fieldKindRegistry.set(kind.type, kind);
  return () => previous ? fieldKindRegistry.set(kind.type, previous) : void fieldKindRegistry.delete(kind.type);
}
export function getInspectorFieldKind(type: InspectorFieldType): InspectorFieldKind | undefined { return fieldKindRegistry.get(type); }
export function getInspectorFieldKinds(): InspectorFieldKind[] { return [...fieldKindRegistry.values()]; }

for (const kind of [
  { type: 'reference', label: 'Reference', recursive: true },
  { type: 'assetSlot', label: 'Asset slot', recursive: true },
  { type: 'embeddedAsset', label: 'Embedded asset', recursive: true },
  { type: 'customEditor', label: 'Specialist editor', recursive: true },
] as InspectorFieldKind[]) fieldKindRegistry.set(kind.type, kind);

const core = (extra: InspectorField[] = []): InspectorGroup => ({ id: 'identity', label: 'Identity', fields: [
  { key: '$name', label: 'Display name', type: 'text' },
  { key: '$description', label: 'Description', type: 'textarea' },
  { key: '$thumbnail', label: 'Thumbnail', type: 'asset', help: 'URL, project asset path, or data image.' },
  { key: '$tags', label: 'Tags', type: 'tags' }, ...extra,
] });
const stats: InspectorGroup = { id: 'stats', label: 'Stats', fields: [
  { key: 'level', label: 'Level', type: 'number', defaultValue: 1 }, { key: 'faction', label: 'Faction', type: 'text' },
] };
const behaviors: InspectorGroup = { id: 'behaviors', label: 'Behaviors', fields: [{ key: 'behaviors', label: 'Behavior graph', type: 'behaviorList', defaultValue: [] }] };
const list = (key: string, label: string, fields: InspectorField[]): InspectorField => ({ key, label, type: 'list', itemFields: fields, defaultValue: [] });
/** Recursive asset slot — renders as a compact card; accepts shared
 * references, embedded children, or either depending on `slotMode`. */
const slot = (key: string, label: string, types: ContentType[], slotMode: AssetSlotMode = 'either'): InspectorField =>
  ({ key, label, type: 'assetSlot', referenceTypes: types, slotMode, recursive: true });
/** Specialist adapter slot — stores an external asset id (effect profile,
 * prefab, rig config); the adapter component renders the UI. */
const custom = (key: string, label: string, editorId: string, help?: string): InspectorField =>
  ({ key, label, type: 'customEditor', editorId, help, recursive: true });
const fx = (key: string, label: string, part?: VfxPart): InspectorField =>
  ({ ...custom(key, label, 'effect'), referenceTypes: ['effect'], part });
const fxGroup = (entries: [key: string, label: string, part?: VfxPart][]): InspectorGroup =>
  ({ id: 'vfx', label: 'Visual effects', fields: entries.map(([key, label, part]) => fx(key, label, part)) });
const characterField = custom('character', 'Character', 'character', 'Rig, appearance, attachments, and animation slots.');

/** Rig bones an item can mount on via `data.attachment`, ordered torso→head→
 * arms→legs for the dropdown. Derived from the humanoid rig (biped shares the
 * skeleton); the empty option keeps the slot's default mount. */
const RIG_BONE_ORDER = ['root', 'head', 'armL', 'armLoL', 'armR', 'armLoR', 'legL', 'legLoL', 'legR', 'legLoR'];
const rigBoneNames = new Set((DEFAULT_RIGS.humanoid?.bones ?? []).map(bone => bone.name));
const attachmentBoneOptions = [
  { value: '', label: '— slot default —' },
  ...RIG_BONE_ORDER.filter(name => rigBoneNames.has(name)).map(name => ({ value: name, label: name })),
  ...(DEFAULT_RIGS.humanoid?.bones ?? []).map(bone => bone.name).filter(name => !RIG_BONE_ORDER.includes(name)).map(name => ({ value: name, label: name })),
];
const prefabField = custom('prefab', 'Scene prefab', 'prefab', '3D prefab spawned for this content in the scene.');

export const CONTENT_TYPE_SCHEMAS: Record<ContentType, ContentTypeSchema> = {
  npc: { type: 'npc', label: 'NPCs', icon: '♟', color: '#78a9d1', groups: [
    core(), stats,
    { id: 'presentation', label: 'Presentation', fields: [characterField, prefabField] },
    { id: 'links', label: 'Linked assets', fields: [slot('dialogue', 'Dialogue', ['dialogue']), slot('vendor', 'Vendor', ['vendor']), slot('quest', 'Quest', ['quest']), slot('lootTable', 'Loot table', ['lootTable'])] },
    fxGroup([['spawnEffect', 'Spawn', 'impact'], ['ambientEffect', 'Ambient', 'cast'], ['interactEffect', 'Interact', 'impact'], ['combatEffect', 'Combat', 'impact'], ['hitEffect', 'Hit', 'impact'], ['deathEffect', 'Death', 'impact']]),
    behaviors,
  ] },
  poi: { type: 'poi', label: 'Points of Interest', icon: '◆', color: '#e2a85e', groups: [
    core([{ key: 'mapId', label: 'Map', type: 'text' }]),
    { id: 'presentation', label: 'Presentation', fields: [prefabField, { key: 'interactionRadius', label: 'Interaction radius', type: 'number', defaultValue: 2 }] },
    { id: 'links', label: 'Linked assets', fields: [slot('dialogue', 'Dialogue', ['dialogue']), slot('vendor', 'Vendor', ['vendor']), slot('quest', 'Quest', ['quest']), { key: 'teleportMap', label: 'Teleport destination', type: 'text' }, { key: 'storage', label: 'Grants storage access', type: 'boolean' }] },
    fxGroup([['promptEffect', 'Prompt', 'cast'], ['interactEffect', 'Interaction', 'impact'], ['activationEffect', 'Activation', 'impact'], ['completionEffect', 'Completion', 'impact']]),
    behaviors,
  ] },
  item: { type: 'item', label: 'Items', icon: '◇', color: '#cf9dde', groups: [
    core(),
    { id: 'item', label: 'Item', fields: [
      { key: 'legacyKind', label: 'Kind', type: 'select', options: ITEM_KINDS.map(k => ({ value: k.id, label: k.label })), defaultValue: 'consumable' },
      { key: 'rarity', label: 'Rarity', type: 'select', options: ['common','uncommon','rare','epic','legendary'].map(value => ({ value, label: value })) },
      { key: 'stackSize', label: 'Stack size', type: 'number', defaultValue: 1 },
      { key: 'level', label: 'Level', type: 'number', defaultValue: 1 },
      { key: 'target', label: 'Target', type: 'select', options: [{ value: '', label: '—' }, ...ITEM_TARGETS.map(t => ({ value: t.id, label: t.label }))], help: 'Battle targeting for consumables.' },
      { key: 'effects', label: 'Usage effects', type: 'record', recordFields: [
        { key: 'heal_hp', label: 'Heal HP', type: 'number' },
        { key: 'restore_mp', label: 'Restore MP', type: 'number' },
        { key: 'per_level', label: 'Per level', type: 'number' },
      ], help: 'What using the item does (consumables).' },
    ] },
    { id: 'equipment', label: 'Equipment', showWhen: { key: 'legacyKind', equals: 'equipment' }, fields: [
      { key: 'slot', label: 'Equip slot', type: 'select', options: [{ value: '', label: '—' }, ...EQUIP_SLOTS.map(s => ({ value: s.id, label: s.label }))] },
      { key: 'allowedSlots', label: 'Extra slots', type: 'tags', help: 'Comma-separated additional equip slots (e.g. weapon, sub_weapon).' },
      { key: 'weaponType', label: 'Weapon type', type: 'select', options: [{ value: '', label: '—' }, ...WEAPON_TYPES.map(t => ({ value: t.id, label: t.label }))] },
      { key: 'armorClass', label: 'Armor class', type: 'select', options: [{ value: '', label: '—' }, ...ARMOR_CLASSES.map(c => ({ value: c.id, label: c.label }))], help: 'Heavy/medium/light — picks the armor silhouette.' },
      { key: 'stats', label: 'Stat bonuses', type: 'record', recordFields: ITEM_STAT_KEYS.map(k => ({ key: k.id, label: k.label, type: 'number' as const })) },
    ] },
    { id: 'presentation', label: 'Presentation', fields: [
      { key: 'model', label: '3D model', type: 'select', options: [{ value: '', label: '— auto —' }, ...ITEM_MODEL_IDS.map(id => ({ value: id, label: id }))], help: 'Procedural model this item renders as — empty derives it from the equip slot / weapon type.' },
      { key: 'attachment', label: 'Character attachment', type: 'select', options: attachmentBoneOptions, help: 'Rig bone this item mounts on — empty keeps the slot’s default mount.' },
    ] },
    fxGroup([['useEffect', 'Use', 'impact'], ['equipEffect', 'Equip', 'impact'], ['impactEffect', 'Impact', 'impact'], ['pickupEffect', 'Pickup', 'impact']]),
    { id: 'links', label: 'Linked assets', fields: [slot('ability', 'Granted ability', ['ability']), slot('status', 'Applied status', ['statusEffect'])] },
  ] },
  dialogue: { type: 'dialogue', label: 'Dialogues', icon: '❝', color: '#84c7ba', groups: [core(), { id: 'dialogue', label: 'Dialogue', fields: [list('nodes', 'Nodes', [{ key: 'speaker', label: 'Speaker', type: 'text' }, { key: 'text', label: 'Text', type: 'textarea' }])] }] },
  quest: { type: 'quest', label: 'Quests', icon: '!', color: '#e3cd72', groups: [core(), { id: 'quest', label: 'Quest', fields: [list('objectives', 'Objectives', [{ key: 'text', label: 'Objective', type: 'text' }, { key: 'count', label: 'Count', type: 'number' }]), slot('rewardTable', 'Rewards', ['lootTable'])] }] },
  vendor: { type: 'vendor', label: 'Vendors', icon: '¤', color: '#dfa16f', groups: [core(), { id: 'stock', label: 'Stock', fields: [list('stock', 'Entries', [slot('item', 'Item', ['item']), { key: 'price', label: 'Price', type: 'number' }])] }] },
  lootTable: { type: 'lootTable', label: 'Loot Tables', icon: '▣', color: '#b69bdd', groups: [core(), { id: 'drops', label: 'Drops', fields: [list('entries', 'Entries', [slot('item', 'Item', ['item']), { key: 'weight', label: 'Weight', type: 'number' }, { key: 'min', label: 'Min', type: 'number' }, { key: 'max', label: 'Max', type: 'number' }])] }] },
  ability: { type: 'ability', label: 'Abilities', icon: '✦', color: '#7ebbea', groups: [
    core(),
    { id: 'ability', label: 'Ability', fields: [{ key: 'passive', label: 'Passive', type: 'boolean', help: 'Passive skills apply continuously — they never cast, so they have no effects or animation.' }, { key: 'cooldown', label: 'Cooldown', type: 'number' }, { key: 'cost', label: 'Resource cost', type: 'number' }] },
    { ...fxGroup([['castEffect', 'Cast', 'cast'], ['projectileEffect', 'Projectile', 'projectile'], ['impactEffect', 'Impact', 'impact'], ['areaEffect', 'Area', 'area']]), hideWhen: 'passive' },
    { id: 'animation', label: 'Animation', hideWhen: 'passive', fields: [{ key: 'animation', label: 'Character animation', type: 'text', help: 'Clip or state name played on the caster rig.' }] },
    { id: 'rules', label: 'Rules', fields: [{ key: 'effects', label: 'Effects', type: 'behaviorList', defaultValue: [] }] },
  ] },
  statusEffect: { type: 'statusEffect', label: 'Status Effects', icon: '◉', color: '#dd7b8b', groups: [
    core(),
    { id: 'effect', label: 'Effect', fields: [{ key: 'duration', label: 'Duration', type: 'number' }, { key: 'stackable', label: 'Stackable', type: 'boolean' }] },
    fxGroup([['auraEffect', 'Aura', 'cast'], ['expirationEffect', 'Expiration', 'impact']]),
    { id: 'rules', label: 'Rules', fields: [{ key: 'effects', label: 'Effects', type: 'behaviorList', defaultValue: [] }] },
  ] },
  recipe: { type: 'recipe', label: 'Recipes', icon: '⚒', color: '#a9bc75', groups: [core(), { id: 'recipe', label: 'Recipe', fields: [list('ingredients', 'Ingredients', [slot('item', 'Item', ['item']), { key: 'count', label: 'Count', type: 'number' }]), slot('result', 'Result', ['item'])] }] },
  spawnSet: { type: 'spawnSet', label: 'Spawn Sets', icon: '⌖', color: '#80bc86', groups: [core(), { id: 'spawn', label: 'Spawns', fields: [list('entries', 'Entries', [slot('npc', 'NPC', ['npc']), { key: 'weight', label: 'Weight', type: 'number' }, { key: 'min', label: 'Min', type: 'number' }, { key: 'max', label: 'Max', type: 'number' }]), { key: 'respawnSeconds', label: 'Respawn seconds', type: 'number' }] }] },
  character: { type: 'character', label: 'Characters', icon: '♙', color: '#8bb9e0', groups: [
    core(),
    { id: 'character', label: 'Character', fields: [characterField] },
  ] },
  effect: { type: 'effect', label: 'Effects', icon: '✷', color: '#e6b66d', groups: [
    core(),
    { id: 'effect', label: 'Effect', fields: [
      { key: 'part', label: 'Part', type: 'select', options: VFX_PARTS.map(value => ({ value, label: VFX_PART_LABELS[value] })), defaultValue: 'impact', help: 'Which stage of an ability this effect plays — one asset per part.' },
      fx('effect', 'Category'),
    ] },
  ] },
  prefab: { type: 'prefab', label: 'Prefabs', icon: '▧', color: '#9ec77f', groups: [
    core(),
    { id: 'prefab', label: 'Prefab', fields: [prefabField] },
  ] },
};

const schemaRegistry = new Map<ContentType, ContentTypeSchema>(Object.values(CONTENT_TYPE_SCHEMAS).map(schema => [schema.type, schema]));
export function registerContentTypeSchema(schema: ContentTypeSchema): () => void {
  schemaRegistry.set(schema.type, schema);
  return () => { if (schemaRegistry.get(schema.type) === schema) schemaRegistry.delete(schema.type); };
}
export function registerInspectorGroup(type: ContentType, group: InspectorGroup): () => void {
  const schema = schemaRegistry.get(type); if (!schema) throw new Error(`Content schema “${type}” is not registered.`);
  const next = { ...schema, groups: [...schema.groups.filter(item => item.id !== group.id), group] };
  schemaRegistry.set(type, next);
  return () => schemaRegistry.set(type, schema);
}
export function getContentTypeSchemas(): ContentTypeSchema[] { return [...schemaRegistry.values()]; }
export function getContentTypeSchema(type: ContentType): ContentTypeSchema { const value = schemaRegistry.get(type); if (!value) throw new Error(`Content schema “${type}” is not registered.`); return value; }

export type BehaviorExtensionKind = 'trigger' | 'condition' | 'action';
export interface BehaviorExtension { id: string; label: string; help?: string; fields?: InspectorField[] }
const behaviorRegistry: Record<BehaviorExtensionKind, Map<string, BehaviorExtension>> = { trigger: new Map(), condition: new Map(), action: new Map() };
const registerBehavior = (kind: BehaviorExtensionKind, extension: BehaviorExtension): (() => void) => { behaviorRegistry[kind].set(extension.id, extension); return () => behaviorRegistry[kind].delete(extension.id); };
export const registerTrigger = (extension: BehaviorExtension) => registerBehavior('trigger', extension);
export const registerCondition = (extension: BehaviorExtension) => registerBehavior('condition', extension);
export const registerAction = (extension: BehaviorExtension) => registerBehavior('action', extension);
export const getBehaviorExtensions = (kind: BehaviorExtensionKind): BehaviorExtension[] => [...behaviorRegistry[kind].values()];

for (const id of ['interact', 'enterArea', 'leaveArea', 'spawn', 'death', 'timer', 'dialogueChoice', 'questState']) registerTrigger({ id, label: id });
const conditionFields: Record<string, InspectorField[]> = {
  hasItem: [slot('item', 'Item', ['item']), { key: 'count', label: 'Quantity', type: 'number', defaultValue: 1 }],
  questState: [slot('quest', 'Quest', ['quest']), { key: 'state', label: 'State', type: 'text' }],
  levelRange: [{ key: 'min', label: 'Min level', type: 'number' }, { key: 'max', label: 'Max level', type: 'number' }],
  faction: [{ key: 'faction', label: 'Faction', type: 'text' }],
  randomChance: [{ key: 'chance', label: 'Chance (0–1)', type: 'number' }],
  flag: [{ key: 'flag', label: 'Flag', type: 'text' }, { key: 'value', label: 'Value', type: 'text' }],
};
registerCondition({ id: 'always', label: 'always' });
for (const [id, fields] of Object.entries(conditionFields)) registerCondition({ id, label: id, fields });
const actionFields: Record<string, InspectorField[]> = {
  showDialogue: [slot('dialogue', 'Dialogue', ['dialogue'], 'reference')],
  startQuest: [slot('quest', 'Quest', ['quest'], 'reference'), { key: 'objective', label: 'Objective', type: 'text' }],
  advanceQuest: [slot('quest', 'Quest', ['quest'], 'reference'), { key: 'objective', label: 'Objective', type: 'text' }],
  giveItem: [slot('item', 'Item', ['item'], 'reference'), { key: 'count', label: 'Quantity', type: 'number', defaultValue: 1 }],
  takeItem: [slot('item', 'Item', ['item'], 'reference'), { key: 'count', label: 'Quantity', type: 'number', defaultValue: 1 }],
  openVendor: [slot('vendor', 'Vendor', ['vendor'], 'reference')],
  teleport: [{ key: 'map', label: 'Map', type: 'text' }, { key: 'destination', label: 'Destination', type: 'text' }],
  spawnSet: [slot('spawnSet', 'Spawn set', ['spawnSet'], 'reference')],
  playEffect: [fx('effect', 'Effect', 'impact')],
  applyStatus: [slot('status', 'Status', ['statusEffect'], 'reference')],
  setFlag: [{ key: 'flag', label: 'Flag', type: 'text' }, { key: 'value', label: 'Value', type: 'text' }],
};
for (const [id, fields] of Object.entries(actionFields)) registerAction({ id, label: id, fields });

export function createContentDefinition(type: ContentType, id: string): ContentDefinition {
  const title = id.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  const data: Record<string, ContentValue> = {};
  for (const group of getContentTypeSchema(type).groups) for (const field of group.fields) {
    if (!field.key.startsWith('$') && field.defaultValue !== undefined) data[field.key] = structuredClone(field.defaultValue);
  }
  return { id, type, name: title, description: '', tags: [], data };
}
