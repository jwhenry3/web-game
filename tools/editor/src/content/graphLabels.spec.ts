import { createContentDefinition, getContentTypeSchemas } from '../../../../wails/frontend/src/content/contentRegistry.ts';
import { embeddedAsset } from '../../../../wails/frontend/src/content/recursiveAssets.ts';
import { buildAssetGraph } from '../../../../wails/frontend/src/content/recursiveAssets.ts';
import { describeEdge, describeEdgePath, describeGraphNode, humanizeKey } from './graphLabels.ts';

function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

check(humanizeKey('lootTable') === 'Loot table', 'camelCase keys humanize to sentence case');
check(humanizeKey('actionArgs') === 'Action args', 'nested arg keys humanize');

const potion = createContentDefinition('item', 'potion');
potion.name = 'Potion';
const drops = createContentDefinition('lootTable', 'drops_basic');
drops.name = 'Basic Drops';
drops.data.entries = [{ item: 'potion', weight: 1 }];
const vendor = createContentDefinition('vendor', 'shopkeep');
vendor.name = 'Shopkeep';
vendor.data.stock = [{ item: 'potion', price: 5 }];
const npc = createContentDefinition('npc', 'herbalist');
npc.name = 'Herbalist';
npc.data.lootTable = 'drops_basic';
npc.data.dialogue = embeddedAsset({ ...createContentDefinition('dialogue', 'herbalist_chat'), name: 'Herbalist Chat' });

const doc = { version: 1 as const, definitions: [potion, drops, vendor, npc] };
const graph = buildAssetGraph(doc, getContentTypeSchemas());

const edge = (from: string, to: string) => {
  const found = graph.edges.find(row => row.from === from && row.to === to);
  check(found, `Expected an edge ${from} → ${to}`);
  return found;
};

const stockEdge = edge('shopkeep', 'potion');
check(describeEdgePath(graph, stockEdge) === 'Entries #1 → Item', `Stock edge should read "Entries #1 → Item", got "${describeEdgePath(graph, stockEdge)}"`);

const lootEdge = edge('herbalist', 'drops_basic');
check(describeEdgePath(graph, lootEdge) === 'Loot table', `Slot edge should read "Loot table", got "${describeEdgePath(graph, lootEdge)}"`);

const npcDisplay = describeGraphNode(graph, 'herbalist');
check(npcDisplay.title === 'Herbalist' && npcDisplay.sub === 'NPC · herbalist', `Root node should read name + type/id, got "${npcDisplay.title}" / "${npcDisplay.sub}"`);
check(!npcDisplay.missing && npcDisplay.icon === '♟', 'Root node resolves its schema icon');

const embeddedDisplay = describeGraphNode(graph, 'herbalist::dialogue');
check(embeddedDisplay.embedded && embeddedDisplay.title === 'Herbalist Chat', 'Embedded node shows its own name');
check(embeddedDisplay.sub.includes('Herbalist'), 'Embedded node names its owner');

const missing = describeGraphNode(graph, 'ghost_asset');
check(missing.missing && missing.sub === 'Missing asset', 'Unknown keys get the missing style');

check(describeEdge(graph, lootEdge) === 'Herbalist · Loot table', `describeEdge combines source + field, got "${describeEdge(graph, lootEdge)}"`);

console.log('graphLabels.spec.ts: all checks passed');
