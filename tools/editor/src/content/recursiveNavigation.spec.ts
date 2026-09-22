import { createContentDefinition } from '../../../../wails/frontend/src/content/contentRegistry.ts';
import { closeAssetTo, currentAsset, openAsset, parentAsset, type AssetNavigationStack } from './recursiveNavigation.ts';

function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

const npc = createContentDefinition('npc', 'herbalist');
const item = createContentDefinition('item', 'starter_potion');
const effect = createContentDefinition('statusEffect', 'healing_over_time');
let stack: AssetNavigationStack = [];
stack = openAsset(stack, { key: npc.id, label: npc.name, definition: npc });
stack = openAsset(stack, { key: `${npc.id}:reward`, label: 'Reward', definition: item });
stack = openAsset(stack, { key: `${npc.id}:reward:effect`, label: 'Effect', definition: effect });
check(currentAsset(stack)?.definition.id === effect.id, 'The deepest recursive asset must be current');
check(parentAsset(stack).length === 2, 'Parent navigation must pop exactly one level');
check(closeAssetTo(stack, `${npc.id}:reward`).length === 2, 'Breadcrumb navigation must retain the selected ancestor');
check(openAsset(stack, { key: `${npc.id}:reward`, label: 'Reward', definition: item }).length === 2, 'Opening an existing ancestor must not create a navigation cycle');

console.log('Recursive content navigation checks passed');
