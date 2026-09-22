import { useCallback, useEffect, useState } from 'react';
import { CATEGORY_COLORS, VFX_CATEGORIES, type VfxCategory } from '../../../../wails/frontend/src/vfx/battleVfxProfiles.ts';
import { fetchEffects, numToHex, saveEffects, type EffectsDoc } from '../model/effects.ts';
import { EffectProfileForm } from '../ui/EffectProfileForm.tsx';
import type { ContentEditorContext } from './contentEditorRegistry.tsx';

/**
 * Resolves a stable effect profile/category id from a stored value. Only
 * known VFX categories pass through — anything else is treated as unset so
 * stale values don't silently bind.
 */
export function effectReferenceFromValue(value: unknown): string {
  const id = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)
      ? String((value as { id: unknown }).id)
      : '';
  return (VFX_CATEGORIES as readonly string[]).includes(id) ? id : '';
}

/**
 * Specialist adapter for `editorId: 'effect'` fields. Stores only the effect
 * category id in gameplay content; profile data itself stays in
 * profiles.json via the specialist Save.
 */
export default function EffectAssetEditor({ field, value, updateValue }: ContentEditorContext) {
  const selected = effectReferenceFromValue(value) as VfxCategory | '';
  const [doc, setDoc] = useState<EffectsDoc | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setDoc(await fetchEffects()); setStatus(''); }
    catch { setDoc(null); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const save = async () => {
    if (!doc) return;
    setBusy(true);
    try { await saveEffects(doc); setStatus('Effect profiles saved.'); }
    catch (error) { setStatus(`Save failed: ${error instanceof Error ? error.message : error}`); }
    finally { setBusy(false); }
  };

  return <section className="ct-adapter ct-effect-editor">
    <header className="ct-adapter-head"><strong>{field.label}</strong>
      <span className="spacer"/>
      <a href="?ws=effects" target="_blank" rel="noreferrer">Open effects editor ↗</a>
    </header>
    <div className="ct-effect-grid">
      {VFX_CATEGORIES.map(category => <button
        key={category}
        className={`ct-effect-card ${selected === category ? 'selected' : ''}`}
        style={{ '--fx': numToHex(CATEGORY_COLORS[category] ?? 0) } as React.CSSProperties}
        onClick={() => updateValue(selected === category ? null : category)}
      ><i/><span>{category}</span></button>)}
    </div>
    {field.help && <small className="ct-slot-help">{field.help}</small>}
    {selected && doc && <details className="ct-adapter-detail"><summary>Profile — {selected}</summary>
      <EffectProfileForm doc={doc} cat={selected} onChange={setDoc}/>
      <div className="ct-adapter-actions"><button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save effect profiles'}</button></div>
    </details>}
    {selected && !doc && <div className="ed-empty">Profile editing needs the editor dev server — selection still works.</div>}
    {status && <div className="ca-status" role="status">{status}</div>}
  </section>;
}
