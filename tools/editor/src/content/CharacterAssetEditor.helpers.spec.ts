import assert from 'node:assert/strict';
import test from 'node:test';
import { characterRigSlug, normalizeCharacterAsset, setCharacterAssetValue } from './CharacterAssetEditor.helpers';

test('normalizes an empty content value', () => {
  assert.deepEqual(normalizeCharacterAsset(undefined), {
    rigId: '', appearance: {}, animations: {}, thumbnail: '',
  });
});

test('nested updates preserve extension-owned data', () => {
  const next = setCharacterAssetValue({
    rigId: 'human',
    appearance: { skin: 'c1', pluginField: true },
    animations: {},
    thumbnail: '',
    extension: { faction: 'moon' },
  }, ['appearance', 'skin'], 'c4');
  assert.equal(next.appearance.skin, 'c4');
  assert.equal(next.appearance.pluginField, true);
  assert.deepEqual(next.extension, { faction: 'moon' });
});

test('rig ids are safe stable slugs', () => {
  assert.equal(characterRigSlug('  Forest Mage #2 '), 'forest_mage_2');
});
