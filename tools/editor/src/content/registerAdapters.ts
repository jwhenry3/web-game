import { createElement } from 'react';
import { registerContentFieldEditor } from './contentEditorRegistry.tsx';
import CharacterAssetEditor from './CharacterAssetEditor.tsx';
import EffectAssetEditor from './EffectAssetEditor.tsx';
import PrefabAssetEditor from './PrefabAssetEditor.tsx';

/**
 * Specialist adapter registrations — imported for side effects by
 * ContentWorkspace so `field.editorId` resolves through the registry.
 */

registerContentFieldEditor('character', ({ value, updateValue }) =>
  createElement(CharacterAssetEditor, {
    value,
    onChange: next => updateValue(next ?? null),
    onOpenRig: () => window.open('?ws=characters', '_blank'),
    label: 'Character',
  }));

registerContentFieldEditor('effect', EffectAssetEditor);
registerContentFieldEditor('prefab', PrefabAssetEditor);
