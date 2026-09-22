import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContentValue } from '../../../../wails/frontend/src/content/contentSchema';
import {
  CLOTH_HEX,
  HAIR_HEX,
  SKIN_HEX,
  WEAPON_HEX,
  emptyRig,
  type Rig3DDoc,
} from '../../../../wails/frontend/src/three/rig3d';
import { DEFAULT_RIGS } from '../../../../wails/frontend/src/three/rig3dDefaults';
import { listRigFiles, loadRigFile, saveRigFile, type RigInfo } from '../scene3d/rigsApi';
import {
  CHARACTER_ANIMATION_SLOTS,
  characterRigSlug,
  normalizeCharacterAsset,
  setCharacterAssetValue,
} from './CharacterAssetEditor.helpers';
import './CharacterAssetEditor.css';

export interface CharacterAssetEditorProps {
  value: ContentValue | undefined;
  onChange(value: ContentValue): void;
  /** Opens the full Characters workspace when the host supports navigation. */
  onOpenRig?: (rigId: string) => void;
  label?: string;
  compact?: boolean;
}

interface RigOption extends RigInfo { builtin: boolean }

const APPEARANCE_FIELDS = [
  ['skin', 'Skin', SKIN_HEX],
  ['hairColor', 'Hair', HAIR_HEX],
  ['clothColor', 'Cloth', CLOTH_HEX],
  ['weaponColor', 'Weapon', WEAPON_HEX],
] as const;
const ATTACHMENT_FIELDS = ['hair', 'face', 'cloth', 'weapon', 'subWeapon', 'ears', 'horns', 'wings', 'tail'] as const;

function optionsWithDefaults(files: RigInfo[]): RigOption[] {
  const options: RigOption[] = files.map(item => ({ ...item, builtin: false }));
  for (const [id, doc] of Object.entries(DEFAULT_RIGS)) {
    if (!options.some(item => item.id === id)) options.push({ id, label: doc.label, builtin: true });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export default function CharacterAssetEditor({ value, onChange, onOpenRig, label = 'Character', compact = false }: CharacterAssetEditorProps) {
  const asset = useMemo(() => normalizeCharacterAsset(value), [value]);
  const [rigs, setRigs] = useState<RigOption[]>(() => optionsWithDefaults([]));
  const [rigDoc, setRigDoc] = useState<Rig3DDoc | null>(null);
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState('new_character');
  const [newLabel, setNewLabel] = useState('New Character');

  const refresh = useCallback(async () => {
    try { setRigs(optionsWithDefaults(await listRigFiles())); }
    catch { setRigs(optionsWithDefaults([])); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let current = true;
    if (!asset.rigId) { setRigDoc(null); return () => { current = false; }; }
    const fallback = DEFAULT_RIGS[asset.rigId] ?? null;
    void loadRigFile(asset.rigId)
      .then(doc => { if (current) setRigDoc(doc ?? fallback); })
      .catch(() => { if (current) setRigDoc(fallback); });
    return () => { current = false; };
  }, [asset.rigId]);

  const set = (path: readonly string[], next: ContentValue) => onChange(setCharacterAssetValue(asset, path, next));
  const createRig = async () => {
    const id = characterRigSlug(newId);
    if (!id) { setStatus('Enter a rig id.'); return; }
    try {
      const doc = emptyRig(id, newLabel.trim() || id);
      await saveRigFile(doc);
      await refresh();
      setRigDoc(doc);
      set(['rigId'], id);
      setCreating(false);
      setStatus(`Created ${id}.rig3d.json`);
    } catch (error) {
      setStatus(`Create failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  const appearance = asset.appearance;
  const skin = SKIN_HEX[String(appearance.skin ?? '')] ?? SKIN_HEX.c1;
  const hair = HAIR_HEX[String(appearance.hairColor ?? '')] ?? HAIR_HEX.c1;
  const cloth = CLOTH_HEX[String(appearance.clothColor ?? '')] ?? CLOTH_HEX.c1;

  return <section className={`ca-editor${compact ? ' compact' : ''}`}>
    <header className="ca-header">
      <div><strong>{label}</strong><small>Rig, look and motion</small></div>
      {asset.rigId && onOpenRig && <button type="button" onClick={() => onOpenRig(asset.rigId)}>Open rig ↗</button>}
    </header>

    <div className="ca-overview">
      <div className="ca-preview" style={{ '--ca-skin': skin, '--ca-hair': hair, '--ca-cloth': cloth } as React.CSSProperties}>
        {asset.thumbnail ? <img src={asset.thumbnail} alt="Character thumbnail"/> : <div className="ca-avatar" aria-label="Generated character preview"><i/><b/><span/></div>}
        <em>{rigDoc?.label ?? (asset.rigId || 'No rig')}</em>
      </div>
      <div className="ca-rig-picker">
        <label><span>Rig</span><select value={asset.rigId} onChange={event => set(['rigId'], event.target.value)}><option value="">Select a rig…</option>{rigs.map(rig => <option key={rig.id} value={rig.id}>{rig.label}{rig.builtin ? ' · built in' : ''}</option>)}</select></label>
        <label><span>Thumbnail</span><input value={asset.thumbnail} placeholder="/assets/characters/…" onChange={event => set(['thumbnail'], event.target.value)}/></label>
        <div className="ca-actions"><button type="button" onClick={() => setCreating(show => !show)}>＋ New rig</button>{asset.rigId && onOpenRig && <button type="button" onClick={() => onOpenRig(asset.rigId)}>Edit details</button>}</div>
        {rigDoc && <small>{rigDoc.bones.length} bones · {rigDoc.parts.length} parts{rigDoc.model ? ` · ${rigDoc.model.skinned ? 'skinned' : 'static'} model` : ''}</small>}
      </div>
    </div>

    {creating && <div className="ca-create">
      <label><span>ID</span><input value={newId} onChange={event => setNewId(characterRigSlug(event.target.value))}/></label>
      <label><span>Name</span><input value={newLabel} onChange={event => setNewLabel(event.target.value)}/></label>
      <button type="button" className="primary" onClick={() => void createRig()}>Create & use</button><button type="button" onClick={() => setCreating(false)}>Cancel</button>
    </div>}

    <details open><summary>Appearance <small>{Object.keys(appearance).filter(key => appearance[key] !== '').length} overrides</small></summary><div className="ca-fields">
      {APPEARANCE_FIELDS.map(([key, fieldLabel, palette]) => <label key={key}><span>{fieldLabel}</span><div className="ca-palette"><select value={String(appearance[key] ?? '')} onChange={event => set(['appearance', key], event.target.value)}><option value="">Rig default</option>{Object.entries(palette).map(([id, hex]) => <option key={id} value={id}>{id} · {hex}</option>)}</select><i style={{ background: palette[String(appearance[key] ?? '')] ?? '#555' }}/></div></label>)}
      {ATTACHMENT_FIELDS.map(key => <label key={key}><span>{key}</span><input value={String(appearance[key] ?? '')} placeholder="Rig default" onChange={event => set(['appearance', key], event.target.value)}/></label>)}
    </div></details>

    <details open><summary>Animation references <small>State → clip</small></summary><div className="ca-fields">
      {CHARACTER_ANIMATION_SLOTS.map(slot => <label key={slot}><span>{slot}</span><input value={String(asset.animations[slot] ?? '')} placeholder={rigDoc?.model?.clips[slot] ?? (rigDoc?.anims?.[slot] ? `${slot} (authored)` : 'Clip name or asset ref')} onChange={event => set(['animations', slot], event.target.value)}/></label>)}
      <p>Leave a reference empty to use the selected rig’s authored or procedural animation.</p>
    </div></details>
    {status && <div className="ca-status" role="status">{status}</div>}
  </section>;
}
