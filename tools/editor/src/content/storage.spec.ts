import { strict as assert } from 'node:assert';
import test from 'node:test';
import { CONTENT_STORAGE_KEY, buildInitialContentDocument, loadContent } from './storage';

test('initial content document includes existing project catalogs and specialist assets', () => {
  const doc = buildInitialContentDocument();
  const counts = new Map<string, number>();
  for (const definition of doc.definitions) counts.set(definition.type, (counts.get(definition.type) ?? 0) + 1);

  assert.ok((counts.get('item') ?? 0) > 20, 'legacy item catalog should populate the Items category');
  assert.ok((counts.get('ability') ?? 0) > 20, 'legacy skill catalog should populate the Abilities category');
  assert.ok((counts.get('npc') ?? 0) > 0, 'legacy entity catalog should populate NPCs');
  assert.ok((counts.get('quest') ?? 0) > 0, 'legacy quest catalog should populate Quests');
  assert.ok((counts.get('character') ?? 0) > 0, 'compiled rigs should populate Characters');
  assert.ok((counts.get('effect') ?? 0) > 0, 'VFX categories should populate Effects');
  assert.ok((counts.get('prefab') ?? 0) > 0, 'compiled prefabs should populate Prefabs');
});

test('empty local gameplay drafts are bootstrapped instead of showing a blank workspace', () => {
  const storage = new Map<string, string>([[CONTENT_STORAGE_KEY, JSON.stringify({ version: 1, definitions: [] })]]);
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    },
  });
  try {
    assert.ok(loadContent().definitions.length > 0);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
  }
});
