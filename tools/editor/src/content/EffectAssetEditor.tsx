import { useCallback, useEffect, useState } from 'react';
import { CATEGORY_COLORS, VFX_CATEGORIES, VFX_PART_LABELS, type VfxCategory, type VfxPart } from '../../../../wails/frontend/src/vfx/battleVfxProfiles.ts';
import { fetchEffects, numToHex, saveEffects, type EffectsDoc } from '../model/effects.ts';
import { EffectProfileForm } from '../ui/EffectProfileForm.tsx';
import { useContentNav, type ContentEditorContext } from './contentEditorRegistry.tsx';

export { effectReferenceFromValue } from './references.ts';
import { effectAssetSpec, effectPartFromValue, effectReferenceFromValue } from './references.ts';

/** Profile editor block — fetches the effects doc and renders the form
 * scoped to one part when given (per-part effect assets) or all sections. */
function ProfileDetail({ cat, part, setStatus }: {
  cat: VfxCategory;
  part?: VfxPart;
  setStatus: (s: string) => void;
}) {
  const [doc, setDoc] = useState<EffectsDoc | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setDoc(await fetchEffects()); setStatus(''); }
    catch { setDoc(null); }
  }, [setStatus]);
  useEffect(() => { void refresh(); }, [refresh]);

  const save = async () => {
    if (!doc) return;
    setBusy(true);
    try { await saveEffects(doc); setStatus('Effect profiles saved.'); }
    catch (error) { setStatus(`Save failed: ${error instanceof Error ? error.message : error}`); }
    finally { setBusy(false); }
  };

  if (!doc) return <div className="ed-empty">Profile editing needs the editor dev server — selection still works.</div>;
  return <details className="ct-adapter-detail" open><summary>Profile — {cat}{part ? ` · ${part}` : ''}</summary>
    <EffectProfileForm doc={doc} cat={cat} part={part} onChange={setDoc}/>
    <div className="ct-adapter-actions"><button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save effect profiles'}</button></div>
  </details>;
}

/**
 * Specialist adapter for `editorId: 'effect'` fields.
 *
 * On an `effect` asset (`data.effect`) it picks the palette category; the
 * asset's `part` field scopes the embedded profile form. On effect slots of
 * other types it stores an effect-asset id, picked from the doc's per-part
 * assets (filtered to the slot's part). Legacy category values still bind —
 * they resolve to the slot's part of that category.
 */
export default function EffectAssetEditor({ field, value, definition, document, updateValue, createAndLink }: ContentEditorContext) {
  const nav = useContentNav();
  const [status, setStatus] = useState('');

  // The effect asset's own category field.
  if (definition.type === 'effect' && field.key === 'effect') {
    const selected = effectReferenceFromValue(value) as VfxCategory | '';
    const spec = effectAssetSpec(definition);
    return <section className="ct-adapter ct-effect-editor">
      <header className="ct-adapter-head"><strong>{field.label}</strong>
        <span className="spacer"/>
        <button type="button" title="Re-open the embedded effects panel over the scene view" onClick={() => nav.openEffectEditor?.()}>✎ Effects panel</button>
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
      {selected && <ProfileDetail cat={selected} part={spec.part} setStatus={setStatus}/>}
      {status && <div className="ca-status" role="status">{status}</div>}
    </section>;
  }

  // Effect slot on another type — binds one effect asset of the slot's part.
  const part = field.part;
  const resolved = effectPartFromValue(value, document, part);
  const selectedId = resolved?.assetId
    ?? document.definitions.find(d => d.type === 'effect'
      && effectAssetSpec(d).category === resolved?.category
      && effectAssetSpec(d).part === resolved?.part)?.id
    ?? '';
  const options = document.definitions.filter(d => d.type === 'effect' && (!part || effectAssetSpec(d).part === part));
  const boundOtherPart = resolved?.assetId && part
    ? document.definitions.find(d => d.id === resolved.assetId)
    : undefined;

  return <section className="ct-adapter ct-effect-editor">
    <header className="ct-adapter-head"><strong>{field.label}</strong>
      {part && <span className="dim">{VFX_PART_LABELS[part]}</span>}
      <span className="spacer"/>
      <button type="button" onClick={() => createAndLink('effect', id => updateValue(id))}>＋ New effect</button>
    </header>
    <div className="ct-effect-grid">
      {options.map(effect => {
        const spec = effectAssetSpec(effect);
        return <button
          key={effect.id}
          className={`ct-effect-card ${selectedId === effect.id ? 'selected' : ''}`}
          style={{ '--fx': numToHex(spec.category ? CATEGORY_COLORS[spec.category] ?? 0 : 0) } as React.CSSProperties}
          title={spec.category ? `${effect.name} — ${spec.category}` : `${effect.name} — unbound category`}
          onClick={() => updateValue(selectedId === effect.id ? null : effect.id)}
        ><i/><span>{effect.name || effect.id}</span></button>;
      })}
    </div>
    {!options.length && <div className="ed-empty">No {part ? `${VFX_PART_LABELS[part].toLowerCase()} ` : ''}effects yet — create one.</div>}
    {boundOtherPart && effectAssetSpec(boundOtherPart).part !== part &&
      <small className="ct-slot-help">“{boundOtherPart.name}” is a {VFX_PART_LABELS[effectAssetSpec(boundOtherPart).part]} effect — its category drives this slot.</small>}
    {field.help && <small className="ct-slot-help">{field.help}</small>}
    {resolved && <ProfileDetail cat={resolved.category} part={resolved.part} setStatus={setStatus}/>}
    {status && <div className="ca-status" role="status">{status}</div>}
  </section>;
}
