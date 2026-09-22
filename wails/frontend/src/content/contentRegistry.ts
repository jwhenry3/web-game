import type { ContentDefinition, ContentType, ContentValue } from './contentSchema.ts';

export type InspectorFieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'tags' | 'asset' | 'reference' | 'list' | 'behaviorList' | 'assetSlot' | 'embeddedAsset' | 'customEditor';
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
  defaultValue?: ContentValue;
  /** For `customEditor` fields — resolved through the content field editor registry. */
  editorId?: string;
  /** Marks fields whose value participates in the recursive asset graph. */
  recursive?: boolean;
}
export interface InspectorGroup { id: string; label: string; fields: InspectorField[] }
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
const fx = (key: string, label: string): InspectorField => custom(key, label, 'effect');
const fxGroup = (entries: [string, string][]): InspectorGroup =>
  ({ id: 'vfx', label: 'Visual effects', fields: entries.map(([key, label]) => fx(key, label)) });
const characterField = custom('character', 'Character', 'character', 'Rig, appearance, attachments, and animation slots.');
const prefabField = custom('prefab', 'Scene prefab', 'prefab', '3D prefab spawned for this content in the scene.');

export const CONTENT_TYPE_SCHEMAS: Record<ContentType, ContentTypeSchema> = {
  npc: { type: 'npc', label: 'NPCs', icon: '♟', color: '#78a9d1', groups: [
    core(), stats,
    { id: 'presentation', label: 'Presentation', fields: [characterField, prefabField] },
    { id: 'links', label: 'Linked assets', fields: [slot('dialogue', 'Dialogue', ['dialogue']), slot('vendor', 'Vendor', ['vendor']), slot('quest', 'Quest', ['quest']), slot('lootTable', 'Loot table', ['lootTable'])] },
    fxGroup([['spawnEffect', 'Spawn'], ['ambientEffect', 'Ambient'], ['interactEffect', 'Interact'], ['combatEffect', 'Combat'], ['hitEffect', 'Hit'], ['deathEffect', 'Death']]),
    behaviors,
  ] },
  poi: { type: 'poi', label: 'Points of Interest', icon: '◆', color: '#e2a85e', groups: [
    core([{ key: 'mapId', label: 'Map', type: 'text' }]),
    { id: 'presentation', label: 'Presentation', fields: [prefabField, { key: 'interactionRadius', label: 'Interaction radius', type: 'number', defaultValue: 2 }] },
    { id: 'links', label: 'Linked assets', fields: [slot('dialogue', 'Dialogue', ['dialogue']), slot('vendor', 'Vendor', ['vendor']), slot('quest', 'Quest', ['quest']), { key: 'teleportMap', label: 'Teleport destination', type: 'text' }, { key: 'storage', label: 'Grants storage access', type: 'boolean' }] },
    fxGroup([['promptEffect', 'Prompt'], ['interactEffect', 'Interaction'], ['activationEffect', 'Activation'], ['completionEffect', 'Completion']]),
    behaviors,
  ] },
  item: { type: 'item', label: 'Items', icon: '◇', color: '#cf9dde', groups: [
    core(),
    { id: 'item', label: 'Item', fields: [{ key: 'rarity', label: 'Rarity', type: 'select', options: ['common','uncommon','rare','epic','legendary'].map(value => ({ value, label: value })) }, { key: 'stackSize', label: 'Stack size', type: 'number', defaultValue: 1 }] },
    { id: 'presentation', label: 'Presentation', fields: [prefabField, { key: 'attachment', label: 'Character attachment', type: 'text', help: 'Bone or slot name this item binds to when shown on a rig.' }] },
    fxGroup([['useEffect', 'Use'], ['equipEffect', 'Equip'], ['impactEffect', 'Impact'], ['pickupEffect', 'Pickup']]),
    { id: 'links', label: 'Linked assets', fields: [slot('ability', 'Granted ability', ['ability']), slot('status', 'Applied status', ['statusEffect'])] },
  ] },
  dialogue: { type: 'dialogue', label: 'Dialogues', icon: '❝', color: '#84c7ba', groups: [core(), { id: 'dialogue', label: 'Dialogue', fields: [list('nodes', 'Nodes', [{ key: 'speaker', label: 'Speaker', type: 'text' }, { key: 'text', label: 'Text', type: 'textarea' }])] }] },
  quest: { type: 'quest', label: 'Quests', icon: '!', color: '#e3cd72', groups: [core(), { id: 'quest', label: 'Quest', fields: [list('objectives', 'Objectives', [{ key: 'text', label: 'Objective', type: 'text' }, { key: 'count', label: 'Count', type: 'number' }]), slot('rewardTable', 'Rewards', ['lootTable'])] }] },
  vendor: { type: 'vendor', label: 'Vendors', icon: '¤', color: '#dfa16f', groups: [core(), { id: 'stock', label: 'Stock', fields: [list('stock', 'Entries', [slot('item', 'Item', ['item']), { key: 'price', label: 'Price', type: 'number' }])] }] },
  lootTable: { type: 'lootTable', label: 'Loot Tables', icon: '▣', color: '#b69bdd', groups: [core(), { id: 'drops', label: 'Drops', fields: [list('entries', 'Entries', [slot('item', 'Item', ['item']), { key: 'weight', label: 'Weight', type: 'number' }, { key: 'min', label: 'Min', type: 'number' }, { key: 'max', label: 'Max', type: 'number' }])] }] },
  ability: { type: 'ability', label: 'Abilities', icon: '✦', color: '#7ebbea', groups: [
    core(),
    { id: 'ability', label: 'Ability', fields: [{ key: 'cooldown', label: 'Cooldown', type: 'number' }, { key: 'cost', label: 'Resource cost', type: 'number' }] },
    fxGroup([['castEffect', 'Cast'], ['projectileEffect', 'Projectile'], ['impactEffect', 'Impact'], ['areaEffect', 'Area']]),
    { id: 'animation', label: 'Animation', fields: [{ key: 'animation', label: 'Character animation', type: 'text', help: 'Clip or state name played on the caster rig.' }] },
    { id: 'rules', label: 'Rules', fields: [{ key: 'effects', label: 'Effects', type: 'behaviorList', defaultValue: [] }] },
  ] },
  statusEffect: { type: 'statusEffect', label: 'Status Effects', icon: '◉', color: '#dd7b8b', groups: [
    core(),
    { id: 'effect', label: 'Effect', fields: [{ key: 'duration', label: 'Duration', type: 'number' }, { key: 'stackable', label: 'Stackable', type: 'boolean' }] },
    fxGroup([['auraEffect', 'Aura'], ['expirationEffect', 'Expiration']]),
    { id: 'rules', label: 'Rules', fields: [{ key: 'effects', label: 'Effects', type: 'behaviorList', defaultValue: [] }] },
  ] },
  recipe: { type: 'recipe', label: 'Recipes', icon: '⚒', color: '#a9bc75', groups: [core(), { id: 'recipe', label: 'Recipe', fields: [list('ingredients', 'Ingredients', [slot('item', 'Item', ['item']), { key: 'count', label: 'Count', type: 'number' }]), slot('result', 'Result', ['item'])] }] },
  spawnSet: { type: 'spawnSet', label: 'Spawn Sets', icon: '⌖', color: '#80bc86', groups: [core(), { id: 'spawn', label: 'Spawns', fields: [list('entries', 'Entries', [slot('npc', 'NPC', ['npc']), { key: 'weight', label: 'Weight', type: 'number' }, { key: 'min', label: 'Min', type: 'number' }, { key: 'max', label: 'Max', type: 'number' }]), { key: 'respawnSeconds', label: 'Respawn seconds', type: 'number' }] }] },
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
  playEffect: [fx('effect', 'Effect')],
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
