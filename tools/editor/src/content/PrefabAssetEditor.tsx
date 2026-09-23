import { useMemo, useState } from 'react';
import { PREFABS, PREFAB_BY_ID, type PrefabDef } from '../../../../wails/frontend/src/three/prefabs.ts';
import type { PrefabKind, ScenePrefabAsset } from '../../../../wails/frontend/src/three/scene3d.ts';
import { useContentNav, type ContentEditorContext } from './contentEditorRegistry.tsx';
import { useScenePrefabs } from './sceneStore.ts';
import { PrefabThumbnail } from '../ui/SceneProject.tsx';

const ICONS: Record<PrefabDef['category'], string> = { Buildings: '⌂', Nature: '❦', Landmarks: '✦', Primitives: '◼', Lights: '☼', Utility: '◇', Gameplay: '♟' };

export { prefabReferenceFromValue, prefabKindForDefinition } from './references.ts';
import { prefabReferenceFromValue, prefabKindForDefinition } from './references.ts';

const kindOfPrefab = (def: PrefabDef): PrefabKind =>
  def.components?.npc ? 'npc' : def.components?.poi ? 'poi' : def.components?.item ? 'item' : 'decoration';

const KIND_LABEL: Record<PrefabKind, string> = { npc: 'NPC', poi: 'Point of interest', item: 'Item', decoration: 'Decoration' };

/**
 * Specialist adapter for `editorId: 'prefab'` fields. Stores only the prefab
 * id. Compiled prefabs can always be selected; when the workspace has a
 * scene map loaded, authored ScenePrefabAssets are browsable too and both
 * kinds open in the embedded scene panel (PrefabEditor).
 */
export default function PrefabAssetEditor({ field, value, definition, updateValue, path }: ContentEditorContext) {
  const nav = useContentNav();
  const selected = prefabReferenceFromValue(value);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const kind = prefabKindForDefinition(definition);
  /** `prefab`-type assets may point at any scene prefab — don't narrow by
   * kind the way npc/poi/item fields do. */
  const unrestricted = definition.type === 'prefab';
  const store = nav.sceneStore ?? null;
  const scenePrefabs = useScenePrefabs(store);

  const term = search.toLowerCase();
  const { suggested, rest } = useMemo(() => {
    const visible = PREFABS.filter(prefab => `${prefab.label} ${prefab.id}`.toLowerCase().includes(term));
    return {
      suggested: visible.filter(prefab => unrestricted || kindOfPrefab(prefab) === kind),
      rest: visible.filter(prefab => !unrestricted && kindOfPrefab(prefab) !== kind),
    };
  }, [term, kind, unrestricted]);
  const authored = useMemo(
    () => scenePrefabs.filter(asset => (unrestricted || asset.kind === kind) && `${asset.name} ${asset.id}`.toLowerCase().includes(term)),
    [scenePrefabs, kind, term, unrestricted],
  );

  const selectedDef = PREFAB_BY_ID.get(selected);
  const selectedAsset = scenePrefabs.find(asset => asset.id === selected);
  const editable = !!store && (!!selectedAsset || !!selectedDef);

  const openPanel = (target: { assetId?: string; defId?: string }) =>
    nav.openPrefabEditor?.({ ...target, assignPath: path });
  const openSelected = () => {
    if (selectedAsset) openPanel({ assetId: selectedAsset.id });
    else if (selectedDef) openPanel({ defId: selectedDef.id });
  };
  const openNew = () => {
    const base = suggested[0] ?? PREFABS[0];
    if (base) openPanel({ defId: base.id });
  };

  const card = (prefab: PrefabDef) => (
    <button
      key={prefab.id}
      className={`ct-prefab-card ${selected === prefab.id ? 'selected' : ''}`}
      onClick={() => updateValue(selected === prefab.id ? null : prefab.id)}
      onDoubleClick={() => store && openPanel({ defId: prefab.id })}
      title={`${prefab.label} (${prefab.id})${store ? ' — click to link, double-click to edit' : ''}`}
    >
      <PrefabThumbnail source={prefab} fallback={ICONS[prefab.category]} />
      <strong>{prefab.label}</strong><small>{prefab.id}</small><em>{prefab.category}</em>
    </button>
  );

  const assetCard = (asset: ScenePrefabAsset) => (
    <button
      key={asset.id}
      className={`ct-prefab-card ${selected === asset.id ? 'selected' : ''}`}
      onClick={() => updateValue(selected === asset.id ? null : asset.id)}
      onDoubleClick={() => openPanel({ assetId: asset.id })}
      title={`${asset.name} (${asset.id}) · revision ${asset.revision} — click to link, double-click to edit`}
    >
      <PrefabThumbnail source={asset} fallback="◆" />
      <strong>{asset.name}</strong><small>{asset.id}</small><em>rev {asset.revision}</em>
    </button>
  );

  return <section className="ct-adapter ct-prefab-editor">
    <header className="ct-adapter-head"><strong>{field.label}</strong>
      <em className="ct-kind-tag">{unrestricted ? 'All kinds' : `Recommended: ${KIND_LABEL[kind]}`}</em>
      <span className="spacer"/>
      {editable && <button type="button" onClick={openSelected}>✎ Scene panel</button>}
      {store && <button type="button" onClick={openNew}>＋ New scene prefab</button>}
      <a href="?ws=prefabs" target="_blank" rel="noreferrer">Full scene workspace ↗</a>
    </header>
    {selected && !selectedDef && !selectedAsset && (
      <div className="ct-slot-missing ct-slot-empty">
        “{selected}” is not a compiled prefab{nav.sceneMapId ? ` or an authored prefab in the ${nav.sceneMapId} scene` : ''} — it may live on another map's scene.
      </div>
    )}
    <input className="ct-prefab-search" placeholder="Search prefabs…" value={search} onChange={event => setSearch(event.target.value)}/>
    {store && (
      <>
        <div className="ct-prefab-section">Scene prefabs · {nav.sceneMapId || 'no scene'}</div>
        <div className="ct-prefab-grid">{authored.map(assetCard)}</div>
        {!authored.length && <small className="ct-note">No {unrestricted ? '' : `${KIND_LABEL[kind].toLowerCase()} `}prefabs authored in this scene yet — “＋ New scene prefab” drafts one.</small>}
      </>
    )}
    <div className="ct-prefab-section">Compiled prefabs</div>
    <div className="ct-prefab-grid">{suggested.map(card)}</div>
    {rest.length > 0 && <details open={showAll} onToggle={event => setShowAll((event.target as HTMLDetailsElement).open)}><summary>Other prefabs ({rest.length})</summary><div className="ct-prefab-grid">{rest.map(card)}</div></details>}
    {!store && <small className="ct-note">Pick a scene map in the toolbar to author and edit scene prefabs — compiled prefabs can be linked without one.</small>}
    {field.help && <small className="ct-slot-help">{field.help}</small>}
  </section>;
}
