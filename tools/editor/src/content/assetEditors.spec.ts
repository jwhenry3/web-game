import assert from 'node:assert/strict';

async function main() {
  const effects = await import('./EffectAssetEditor');
  assert.equal(effects.effectReferenceFromValue('fire'), 'fire');
  assert.equal(effects.effectReferenceFromValue({ id: 'ice' }), 'ice');
  assert.equal(effects.effectReferenceFromValue('made_up'), '');

  const prefabs = await import('./PrefabAssetEditor');
  assert.equal(prefabs.prefabReferenceFromValue('tree'), 'tree');
  assert.equal(prefabs.prefabReferenceFromValue({ prefabId: 'prefab_guard' }), 'prefab_guard');
  assert.equal(prefabs.prefabKindForDefinition({ type: 'npc' }), 'npc');
  assert.equal(prefabs.prefabKindForDefinition({ type: 'poi' }), 'poi');
  assert.equal(prefabs.prefabKindForDefinition({ type: 'item' }), 'item');
  assert.equal(prefabs.prefabKindForDefinition({ type: 'quest' }), 'decoration');
}

void main();
