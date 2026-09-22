import { useMemo, useState } from 'react';
import { PREFABS, type PrefabDef } from '../../../../wails/frontend/src/three/prefabs.ts';
import type { PrefabKind } from '../../../../wails/frontend/src/three/scene3d.ts';
import type { ContentDefinition } from '../../../../wails/frontend/src/content/contentSchema.ts';
import type { ContentEditorContext } from './contentEditorRegistry.tsx';

/** Extracts the stored prefab id — plain string or `{prefabId}` object. */
export function prefabReferenceFromValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'prefabId' in (value as Record<string, unknown>)) {
    return String((value as { prefabId: unknown }).prefabId);
  }
  return '';
}

/** Recommended prefab kind for a content definition — drives the filtered
 * suggestions shown in the picker. */
export function prefabKindForDefinition(definition: Pick<ContentDefinition, 'type'>): PrefabKind {
  return definition.type === 'npc' || definition.type === 'poi' || definition.type === 'item' ? definition.type : 'decoration';
}

const kindOfPrefab = (def: PrefabDef): PrefabKind =>
  def.components?.npc ? 'npc' : def.components?.poi ? 'poi' : def.components?.item ? 'item' : 'decoration';

const KIND_LABEL: Record<PrefabKind, string> = { npc: 'NPC', poi: 'Point of interest', item: 'Item', decoration: 'Decoration' };

/**
 * Specialist adapter for `editorId: 'prefab'` fields. Stores only the prefab
 * id. Compiled prefabs can always be selected; authored scene prefabs need a
 * map loaded, so they open the full Prefabs workspace.
 */
export default function PrefabAssetEditor({ field, value, definition, updateValue }: ContentEditorContext) {
  const selected = prefabReferenceFromValue(value);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const kind = prefabKindForDefinition(definition);

  const { suggested, rest } = useMemo(() => {
    const term = search.toLowerCase();
    const visible = PREFABS.filter(prefab => `${prefab.label} ${prefab.id}`.toLowerCase().includes(term));
    return {
      suggested: visible.filter(prefab => kindOfPrefab(prefab) === kind),
      rest: visible.filter(prefab => kindOfPrefab(prefab) !== kind),
    };
  }, [search, kind]);
  const selectedDef = PREFABS.find(prefab => prefab.id === selected);

  const card = (prefab: PrefabDef) => <button key={prefab.id} className={`ct-prefab-card ${selected === prefab.id ? 'selected' : ''}`} onClick={() => updateValue(selected === prefab.id ? null : prefab.id)}>
    <strong>{prefab.label}</strong><small>{prefab.id}</small><em>{prefab.category}</em>
  </button>;

  return <section className="ct-adapter ct-prefab-editor">
    <header className="ct-adapter-head"><strong>{field.label}</strong>
      <em className="ct-kind-tag">Recommended: {KIND_LABEL[kind]}</em>
      <span className="spacer"/>
      <a href="?ws=prefabs" target="_blank" rel="noreferrer">Open prefab editor ↗</a>
    </header>
    {selected && !selectedDef && <div className="ct-slot-missing ct-slot-empty">“{selected}” is not a compiled prefab — it may be an authored scene prefab (open the Prefabs workspace with a map loaded to manage it).</div>}
    <input className="ct-prefab-search" placeholder="Search prefabs…" value={search} onChange={event => setSearch(event.target.value)}/>
    <div className="ct-prefab-grid">{suggested.map(card)}</div>
    {rest.length > 0 && <details open={showAll} onToggle={event => setShowAll((event.target as HTMLDetailsElement).open)}><summary>Other prefabs ({rest.length})</summary><div className="ct-prefab-grid">{rest.map(card)}</div></details>}
    {field.help && <small className="ct-slot-help">{field.help}</small>}
  </section>;
}
