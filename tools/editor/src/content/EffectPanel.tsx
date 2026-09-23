import { useEffect, type ReactNode, type SetStateAction } from 'react';
import type { VfxCategory, VfxPart } from '../model/effects.ts';
import { VFX_PART_LABELS } from '../../../../wails/frontend/src/vfx/battleVfxProfiles.ts';
import { EffectProfileForm } from '../ui/EffectProfileForm.tsx';
import { EffectsLibrary, type EffectsMode } from '../ui/SceneEffects.tsx';
import '../workspaces/scene.css';
import '../workspaces/effects.css';
import './effectPanel.css';

const isEditable = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

/**
 * Embedded effects editor for the Content workspace — opens over the scene
 * view when an `effect`-type asset is selected, mirroring the prefab panel.
 * The overlay is transparent between the two docks so the staged rig/VFX
 * preview stays visible while the profile is edited. Picking a category both
 * retargets the editor and rebinds the asset (`data.effect`); profile edits
 * persist to assets/vfx/profiles.json through the specialist Save — the same
 * contract as the standalone Effects mode.
 */
export function EffectPanel({ st, title, bound, part, onBind, onClose, inspector }: {
  st: EffectsMode;
  /** Label of the owning content asset. */
  title: string;
  /** Category stored in the asset's `data.effect` ('' = unbound). */
  bound: string;
  /** The asset's `data.part` — scopes the staged playback and the form. */
  part: VfxPart;
  onBind: (cat: VfxCategory) => void;
  onClose: () => void;
  /** The asset's generic inspector (identity, relationships). */
  inspector?: ReactNode;
}) {
  const pick = (next: SetStateAction<VfxCategory>) => {
    const cat = typeof next === 'function' ? next(st.cat) : next;
    st.setCat(cat);
    if (cat !== bound) onBind(cat);
  };
  // The staged rig/VFX preview plays the asset's own part — a "Fire Cast"
  // asset previews the channel, never the whole Fire sequence.
  useEffect(() => { if (st.part !== part) st.setPart(part); }, [st, part]);
  return (
    <div className="ct-fx-overlay" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && !isEditable(e.target)) onClose(); }}>
      <div className="ct-fx-dock ct-fx-left">
        <EffectsLibrary st={{ ...st, setCat: pick }} />
      </div>
      <div className="ct-fx-dock ct-fx-right">
        <div className="sc-inspector-head">
          <h3>{title} <span className="dim">· {st.cat} · {VFX_PART_LABELS[part]}</span></h3>
          <button className="primary" disabled={!st.dirty || !st.doc} onClick={() => void st.save()}>Save</button>
          <button aria-label="Close effect editor" title="Return to the asset inspector" onClick={onClose}>✕</button>
        </div>
        {!bound && <div className="efx-banner">No effect bound — pick a category to link it to this asset.</div>}
        {st.doc
          ? <div className="ed-panel sc-rig-panel"><EffectProfileForm doc={st.doc} cat={st.cat} part={part} onChange={st.onDocChange} /></div>
          : <div className="ed-hint ct-fx-offline">Effect profiles need the editor dev server — category binding still works.</div>}
        {inspector && <details className="ct-fx-asset"><summary>Asset</summary>{inspector}</details>}
        <div className="ed-statusbar sc-rig-status"><span className={st.dirty ? 'dirty' : 'ed-ready'}>●</span><span role="status">{st.status || (st.dirty ? 'Unsaved changes' : 'Ready')}</span></div>
      </div>
    </div>
  );
}
