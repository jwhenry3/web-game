import { createContentDefinition, getContentTypeSchemas } from './contentRegistry.ts';
import { defaultContentDocument } from './contentSchema.ts';
import { assetReference, backlinks, buildAssetGraph, embeddedAsset, isAssetReference, isEmbeddedAsset, renameAssetId, unlinkAssetReferences, validateAssetGraph, MAX_ASSET_DEPTH } from './recursiveAssets.ts';

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

// Unlinking clears references without touching the target asset.
const unlinked = unlinkAssetReferences(renameDoc, 'tonic', getContentTypeSchemas());
check(unlinked.unlinked === 1, 'Unlink must report the number of cleared references');
check((unlinked.doc.definitions[1].data.stock as { item: unknown }[])[0].item === null, 'Unlinked slots must become null');

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
