import { createContentDefinition, getContentTypeSchemas } from './contentRegistry.ts';
import { defaultContentDocument } from './contentSchema.ts';
import { assetReference, backlinks, buildAssetGraph, embeddedAsset, isAssetReference, isEmbeddedAsset, removeRootAsset, renameAssetId, unlinkAssetReferences, validateAssetGraph, MAX_ASSET_DEPTH } from './recursiveAssets.ts';

function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

const item = createContentDefinition('item', 'healing_potion');
const effect = createContentDefinition('statusEffect', 'healing_over_time');
item.data.effect = assetReference(effect.id);
const npc = createContentDefinition('npc', 'herbalist');
npc.data.reward = embeddedAsset({ ...item, id: 'starter_potion', data: { ...item.data } });
const doc = defaultContentDocument();
doc.definitions.push(npc, effect);

check(isAssetReference(item.data.effect), 'Asset references must be distinguishable from ordinary objects');
check(isEmbeddedAsset(npc.data.reward), 'Embedded assets must be distinguishable from ordinary objects');

const graph = buildAssetGraph(doc, getContentTypeSchemas());
check(graph.nodes.has('herbalist') && graph.nodes.has('healing_over_time'), 'The graph must index root definitions');
check(graph.nodes.has('herbalist::reward'), 'Embedded assets must have stable owner-scoped graph identities');
check(graph.edges.some(edge => edge.from === 'herbalist::reward' && edge.to === 'healing_over_time'), 'References inside embedded assets must be traversed');
check(validateAssetGraph(doc, getContentTypeSchemas()).length === 0, 'A valid recursive asset graph must validate');

// Specialist editor assets appear as graph nodes without duplicating their schemas.
const guard = createContentDefinition('npc', 'guard_captain');
guard.data.character = { rigId: 'forest_guard', thumbnail: '/assets/characters/forest_guard.png', appearance: {}, animations: {} };
guard.data.prefab = 'npc_guard';
guard.data.spawnEffect = 'fire';
const specialistDoc = defaultContentDocument();
specialistDoc.definitions.push(guard);
const specialistGraph = buildAssetGraph(specialistDoc, getContentTypeSchemas());
check(specialistGraph.nodes.get('character:forest_guard')?.type === 'character', 'Character adapter selections must appear as asset graph nodes');
check(specialistGraph.nodes.get('prefab:npc_guard')?.type === 'prefab', 'Prefab adapter selections must appear as asset graph nodes');
check(specialistGraph.nodes.get('effect:fire')?.type === 'effect', 'Effect adapter selections must appear as asset graph nodes');
check(specialistGraph.edges.some(edge => edge.from === 'guard_captain' && edge.to === 'character:forest_guard'), 'Character adapter selections must create graph edges');
check(backlinks(specialistGraph, 'effect:fire').some(edge => edge.path.endsWith('.spawnEffect')), 'Effect adapter nodes must expose backlinks');

effect.data.loop = assetReference('herbalist');
const cycleIssues = validateAssetGraph(doc, getContentTypeSchemas());
check(cycleIssues.some(issue => issue.message.includes('cycle')), 'Reference cycles must be reported without recursive traversal failure');

effect.data.loop = assetReference('missing_asset');
const missingIssues = validateAssetGraph(doc, getContentTypeSchemas());
check(missingIssues.some(issue => issue.path.includes('loop') && issue.message.includes('missing_asset')), 'Missing references must identify their data path');
effect.data.loop = null;

// Backlinks expose every consumer of an asset.
const links = backlinks(buildAssetGraph(doc, getContentTypeSchemas()), 'healing_over_time');
check(links.some(edge => edge.from === 'herbalist::reward'), 'Backlinks must include references inside embedded assets');

// Disallowed target types are rejected by schema-aware edges.
const quest = createContentDefinition('quest', 'fetch_herbs');
quest.data.rewardTable = assetReference('herbalist'); // expects a lootTable
const typedDoc = defaultContentDocument();
typedDoc.definitions.push(quest, createContentDefinition('npc', 'herbalist'));
const typedIssues = validateAssetGraph(typedDoc, getContentTypeSchemas());
check(typedIssues.some(issue => issue.message.includes('accepts')), 'References to a disallowed content type must be reported');

// Embedded assets obey the same slot type constraints as references.
const embeddedTypedQuest = createContentDefinition('quest', 'embedded_reward');
embeddedTypedQuest.data.rewardTable = embeddedAsset(createContentDefinition('npc', 'wrong_reward'));
const embeddedTypedDoc = defaultContentDocument();
embeddedTypedDoc.definitions.push(embeddedTypedQuest);
check(validateAssetGraph(embeddedTypedDoc, getContentTypeSchemas()).some(issue => issue.message.includes('accepts')), 'Embedded assets of a disallowed type must be reported');

// Sanitized owner paths must not silently overwrite another embedded node.
const collisionHost = createContentDefinition('npc', 'collision_host');
collisionHost.data['one.two'] = embeddedAsset(createContentDefinition('item', 'first_child'));
collisionHost.data['one@two'] = embeddedAsset(createContentDefinition('item', 'second_child'));
const collisionDoc = defaultContentDocument();
collisionDoc.definitions.push(collisionHost);
check(validateAssetGraph(collisionDoc, getContentTypeSchemas()).some(issue => issue.message.includes('identity collision')), 'Embedded graph identity collisions must be reported');

// Renames rewrite markers and schema-declared strings atomically.
const potion = createContentDefinition('item', 'tonic');
potion.data.behaviors = [];
const vendor = createContentDefinition('vendor', 'apothecary');
(vendor.data.stock as { item: string; price: number }[]).push({ item: 'tonic', price: 4 });
const renameDoc = defaultContentDocument();
renameDoc.definitions.push(potion, vendor);
const renamed = renameAssetId(renameDoc, 'tonic', 'elixir', getContentTypeSchemas());
check('doc' in renamed, 'Renames into a free ID must succeed');
if ('doc' in renamed) {
  check(renamed.doc.definitions[0].id === 'elixir', 'Rename must update the root ID');
  const stock = renamed.doc.definitions[1].data.stock as { item: string }[];
  check(stock[0].item === 'elixir', 'Rename must rewrite legacy string references');
}
check('error' in renameAssetId(renameDoc, 'tonic', 'apothecary', getContentTypeSchemas()), 'Renames into an existing ID must be rejected');
check('error' in renameAssetId(renameDoc, 'missing_tonic', 'elixir', getContentTypeSchemas()), 'Renaming a missing root asset must be rejected');

// Unlinking clears references without touching the target asset.
const unlinked = unlinkAssetReferences(renameDoc, 'tonic', getContentTypeSchemas());
check(unlinked.unlinked === 1, 'Unlink must report the number of cleared references');
check((unlinked.doc.definitions[1].data.stock as { item: unknown }[])[0].item === null, 'Unlinked slots must become null');

// Deletion is backlink-safe by default and supports an explicit unlink mode.
const blockedRemoval = removeRootAsset(renameDoc, 'tonic', getContentTypeSchemas());
check('blockedBy' in blockedRemoval && blockedRemoval.blockedBy.length === 1, 'Deletion must expose backlinks instead of creating broken references');
const removed = removeRootAsset(renameDoc, 'tonic', getContentTypeSchemas(), { unlink: true });
check('doc' in removed, 'Explicit unlink deletion must succeed');
if ('doc' in removed) {
  check(!removed.doc.definitions.some(definition => definition.id === 'tonic'), 'Deletion must remove the root asset');
  check((removed.doc.definitions[0].data.stock as { item: unknown }[])[0].item === null, 'Explicit unlink deletion must clear its references');
}
check('error' in removeRootAsset(renameDoc, 'missing_tonic', getContentTypeSchemas()), 'Deleting a missing root asset must be rejected');

// Embedded assets deeper than MAX_ASSET_DEPTH are rejected.
let inner = createContentDefinition('npc', 'depth_leaf');
for (let i = MAX_ASSET_DEPTH; i > 0; i--) {
  const wrap = createContentDefinition('npc', `depth_${i}`);
  wrap.data.child = embeddedAsset(inner);
  inner = wrap;
}
const deepRoot = createContentDefinition('npc', 'depth_root');
deepRoot.data.child = embeddedAsset(inner);
const deepDoc = defaultContentDocument();
deepDoc.definitions.push(deepRoot);
check(validateAssetGraph(deepDoc, getContentTypeSchemas()).some(issue => issue.message.includes(`${MAX_ASSET_DEPTH}`)), 'Nesting beyond the depth limit must be reported');

// An embedded definition duplicating a root ID is warned, not silently merged.
const dupDoc = defaultContentDocument();
const host = createContentDefinition('npc', 'host');
host.data.copy = embeddedAsset(createContentDefinition('item', 'shared_item'));
dupDoc.definitions.push(host, createContentDefinition('item', 'shared_item'));
check(validateAssetGraph(dupDoc, getContentTypeSchemas()).some(issue => issue.severity === 'warning' && issue.message.includes('shared_item')), 'Embedded duplicates of root IDs must warn');

console.log('Recursive content graph checks passed');
