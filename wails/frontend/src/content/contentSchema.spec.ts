import { defaultContentDocument, normalizeContentDocument, validateContentDocument } from './contentSchema.ts';
import { createContentDefinition, CONTENT_TYPE_SCHEMAS, getBehaviorExtensions, getContentTypeSchema, registerAction, registerInspectorGroup } from './contentRegistry.ts';

function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

const expected = ['npc', 'poi', 'item', 'dialogue', 'quest', 'vendor', 'lootTable', 'ability', 'statusEffect', 'recipe', 'spawnSet'];
check(expected.every(type => type in CONTENT_TYPE_SCHEMAS), 'Every initial MMORPG content type must have an editor schema');

const npc = createContentDefinition('npc', 'village_guard');
check(npc.type === 'npc' && npc.name === 'Village Guard', 'Definitions must get readable defaults');
check(Array.isArray(npc.data.behaviors), 'NPCs must expose a composable behavior list');

const doc = defaultContentDocument();
doc.definitions.push(npc);
const normalized = normalizeContentDocument(JSON.parse(JSON.stringify(doc)));
check(normalized.definitions[0].id === 'village_guard', 'Documents must round-trip through JSON');
check(validateContentDocument(normalized).length === 0, 'A new definition must validate');

normalized.definitions.push(createContentDefinition('poi', 'village_guard'));
check(validateContentDocument(normalized).some(issue => issue.path === 'definitions[1].id'), 'Duplicate IDs must be rejected');

const malformed = normalizeContentDocument({ version: 99, definitions: [{ id: '', type: 'unknown' }] });
check(validateContentDocument(malformed).length >= 2, 'Malformed imports must report actionable issues');

const undoGroup = registerInspectorGroup('npc', { id: 'plugin-test', label: 'Plugin test', fields: [{ key: 'mood', label: 'Mood', type: 'text' }] });
check(getContentTypeSchema('npc').groups.some(group => group.id === 'plugin-test'), 'Plugins must be able to extend inspectors without component edits');
undoGroup();
check(!getContentTypeSchema('npc').groups.some(group => group.id === 'plugin-test'), 'Inspector extensions must be removable');
const undoAction = registerAction({ id: 'pluginAction', label: 'Plugin action' });
check(getBehaviorExtensions('action').some(action => action.id === 'pluginAction'), 'Behavior actions must be extensible');
undoAction();

console.log('Content schema checks passed');
