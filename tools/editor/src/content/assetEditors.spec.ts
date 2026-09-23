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

  // --- per-part effects ---------------------------------------------------
  const vfx = await import('../../../../wails/frontend/src/vfx/battleVfxProfiles');
  const schema = await import('../../../../wails/frontend/src/content/contentSchema');
  const refs = await import('./references');

  // A category profile slices into disjoint single-part profiles.
  const fire = vfx.CATEGORY_VFX_PROFILES.fire;
  assert.deepEqual(vfx.vfxProfileParts(fire), ['cast', 'projectile', 'impact', 'area']);
  const impact = vfx.vfxProfilePart(fire, 'impact');
  assert.ok(impact.bursts.length > 0 && impact.flash);
  assert.ok(!impact.cast && !impact.projectile && !impact.circle && !impact.stream);
  const cast = vfx.vfxProfilePart(fire, 'cast');
  assert.ok(cast.cast && !cast.projectile && !cast.bursts.length && !cast.circle);
  // Physical defines no channel/flight/ground segments — impact only.
  assert.deepEqual(vfx.vfxProfileParts(vfx.CATEGORY_VFX_PROFILES.physical), ['impact']);

  // Legacy combined effect defs expand into one asset per defined part.
  const doc = schema.normalizeContentDocument({ definitions: [
    { id: 'effect_fire', type: 'effect', name: 'Fire', data: { effect: 'fire' } },
    { id: 'effect_physical', type: 'effect', name: 'Physical', data: { effect: 'physical' } },
    { id: 'fx_custom', type: 'effect', name: 'Draft', data: {} },
    { id: 'kept', type: 'effect', name: 'Kept', data: { effect: 'ice', part: 'cast' } },
  ] });
  const ids = doc.definitions.map(d => d.id);
  assert.deepEqual(ids, [
    'effect_fire_cast', 'effect_fire_projectile', 'effect_fire_impact', 'effect_fire_area',
    'effect_physical_impact', 'fx_custom', 'kept',
  ]);
  const fireCast = doc.definitions.find(d => d.id === 'effect_fire_cast')!;
  assert.equal(fireCast.data.part, 'cast');
  assert.equal(fireCast.data.effect, 'fire');
  assert.equal(fireCast.name, 'Fire · Cast');
  // Unbound legacy drafts keep one record with a part default.
  assert.equal(doc.definitions.find(d => d.id === 'fx_custom')!.data.part, 'impact');
  // Already-split defs pass through untouched.
  assert.equal(doc.definitions.find(d => d.id === 'kept')!.data.part, 'cast');
  // Idempotent — a second normalize is a no-op.
  assert.equal(schema.normalizeContentDocument(doc).definitions.length, doc.definitions.length);

  // Slot values resolve to a category + part: effect-asset ids read the
  // asset's own part; legacy category strings take the slot's part.
  assert.deepEqual(refs.effectPartFromValue('effect_fire_cast', doc, 'impact'),
    { category: 'fire', part: 'cast', assetId: 'effect_fire_cast' });
  assert.deepEqual(refs.effectPartFromValue('fire', doc, 'cast'),
    { category: 'fire', part: 'cast' });
  assert.equal(refs.effectPartFromValue('missing', doc, 'impact'), null);
  assert.equal(refs.effectPartFromValue(undefined, doc, 'area'), null);
  // The asset's own spec pairs category with its authored part.
  assert.deepEqual(refs.effectAssetSpec(doc.definitions.find(d => d.id === 'effect_fire_area')!),
    { category: 'fire', part: 'area' });
}

void main();
