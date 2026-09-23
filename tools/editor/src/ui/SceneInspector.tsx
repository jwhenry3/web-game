import { useEffect, useState, type ReactNode } from "react";
import { normalizeComponents, isAncestor, SCENE_COMPONENT_DEFINITIONS, type PrefabKind, type SceneComponentKey, type SceneComponents, type SceneEnvironment, type SceneObject, type SceneTransform, type Vec3 } from "../../../../wails/frontend/src/three/scene3d";
import { PREFAB_BY_ID, type PrefabProp } from "../../../../wails/frontend/src/three/prefabs";
import { useSceneStore, type SceneStore } from "../scene3d/store";

/** Numeric field that edits as a single undo step: focus begins a drag,
 * every change is transient, blur commits. Typing a partial value ("-" or
 * "1.") keeps the draft text without clobbering the document. */
export function NumField({ value, onChange, onBegin, onEnd, step = .1, min, max, label }: {
  value: number; onChange: (v: number) => void; onBegin: () => void; onEnd: () => void;
  step?: number; min?: number; max?: number; label: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);
  return (
    <input
      type="number" step={step} min={min} max={max} value={draft} aria-label={label}
      onFocus={() => { setEditing(true); onBegin(); }}
      onChange={e => { setDraft(e.target.value); const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }}
      onBlur={() => { setEditing(false); onEnd(); }}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

/** Colour picker with the same one-undo-step-per-edit contract as NumField. */
export function ColorField({ label, value, onChange, onBegin, onEnd }: { label: string; value: string; onChange: (v: string) => void; onBegin: () => void; onEnd: () => void }) {
  return <input type="color" aria-label={label} value={value} onFocus={onBegin} onBlur={onEnd} onChange={e => onChange(e.target.value)} />;
}

export function Vec3Row({ label, value, onChange, onBegin, onEnd, step }: { label: string; value: Vec3; onChange: (v: Vec3) => void; onBegin: () => void; onEnd: () => void; step?: number }) {
  return (
    <div className="ed-row sc-vec3">
      <label>{label}</label>
      {(["X", "Y", "Z"] as const).map((axis, i) => (
        <span key={axis} className="sc-axis"><b className={`sc-axis-${axis}`}>{axis}</b>
          <NumField label={`${label} ${axis}`} value={value[i]} step={step} onBegin={onBegin} onEnd={onEnd} onChange={v => { const next = [...value] as Vec3; next[i] = v; onChange(next); }} />
        </span>
      ))}
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return <><h3 className="sc-section">{title}{right && <span className="spacer" />}{right}</h3>{children}</>;
}

export function PropField({ def, value, onChange, onBegin, onEnd }: { def: PrefabProp; value: unknown; onChange: (v: unknown) => void; onBegin: () => void; onEnd: () => void }) {
  if (def.type === "color") return <div className="ed-row"><label>{def.label}</label><ColorField label={def.label} value={typeof value === "string" ? value : String(def.default)} onBegin={onBegin} onEnd={onEnd} onChange={onChange} /><code>{String(value)}</code></div>;
  if (def.type === "boolean") return <div className="ed-row"><label>{def.label}</label><input type="checkbox" aria-label={def.label} checked={value === true} onChange={e => onChange(e.target.checked)} /></div>;
  return (
    <div className="ed-row"><label>{def.label}</label>
      <NumField label={def.label} value={typeof value === "number" ? value : Number(def.default)} step={def.step} min={def.min} max={def.max} onBegin={onBegin} onEnd={onEnd} onChange={onChange} />
      {def.min !== undefined && def.max !== undefined && <input type="range" aria-label={`${def.label} slider`} min={def.min} max={def.max} step={def.step} value={typeof value === "number" ? value : Number(def.default)} onPointerDown={onBegin} onPointerUp={onEnd} onChange={e => onChange(parseFloat(e.target.value))} />}
    </div>
  );
}

/** Gameplay component blocks (NPC/POI/Item/Collider), shared by the scene
 * inspector and the prefab editor. `apply` receives the whole components
 * object; transient changes come from drag-committed Vec3 fields. */
export function ComponentsEditor({ components, apply, onBegin, onEnd }: {
  components: SceneComponents | undefined;
  apply: (components: SceneComponents, transient?: boolean) => void;
  onBegin: () => void; onEnd: () => void;
}) {
  const setComponent = (key: keyof SceneComponents, field: string, value: unknown, transient = false) =>
    apply(normalizeComponents({ ...components, [key]: { ...components?.[key], [field]: value } }), transient);
  const missing = SCENE_COMPONENT_DEFINITIONS.filter(def => !components?.[def.key]);
  return (
    <>
      {SCENE_COMPONENT_DEFINITIONS.map(def=> {
        const key=def.key, component=components?.[key] as Record<string, unknown> | undefined;
        if(!component) return null;
        return <Section key={key} title={def.label} right={<button onClick={()=>{const next={...components};delete next[key];apply(next);}}>Remove</button>}>
          <p className="ed-hint">{def.description}</p>
          {def.fields.map(field=> {
            const value=component[field.key];
            if(field.type==='vec3')return <Vec3Row key={field.key} label={field.label} value={value as Vec3} onBegin={onBegin} onEnd={onEnd} onChange={v=>setComponent(key,field.key,v,true)}/>;
            return <div className="ed-row" key={field.key}><label>{field.label}</label>{field.type==='boolean'?<input aria-label={`${def.label} ${field.label}`} type="checkbox" checked={value===true} onChange={e=>setComponent(key,field.key,e.target.checked)}/>:field.type==='select'?<select aria-label={`${def.label} ${field.label}`} value={String(value??'')} onChange={e=>setComponent(key,field.key,e.target.value)}>{field.options?.map(o=><option key={o}>{o}</option>)}</select>:<input aria-label={`${def.label} ${field.label}`} type={field.type==='number'?'number':'text'} min={field.min} step={field.step} value={String(value??'')} onChange={e=>{if(field.type==='number'){const n=e.target.valueAsNumber;if(Number.isFinite(n))setComponent(key,field.key,n);}else setComponent(key,field.key,e.target.value);}}/>}</div>;
          })}
        </Section>;
      })}
      {missing.length > 0 && (
        <div className="ed-row"><label>Add component</label>
          <select
            aria-label="Add gameplay component"
            value=""
            onChange={e => { const key = e.target.value as SceneComponentKey | ""; if (key) apply(normalizeComponents({ ...components, [key]: {} })); }}
          >
            <option value="" disabled>Choose…</option>
            {missing.map(def => <option key={def.key} value={def.key}>{def.label}</option>)}
          </select>
        </div>
      )}
    </>
  );
}

function ObjectInspector({ store, object, groundHeight }: { store: SceneStore; object: SceneObject; groundHeight: (x: number, z: number) => number }) {
  const doc = useSceneStore(store, s => s.doc);
  const def = PREFAB_BY_ID.get(object.prefab);
  const begin = () => store.beginDrag();
  const end = () => store.endDrag();
  const setTransform = (patch: Partial<SceneTransform>) => store.setTransformTransient(object.id, { ...object.transform, ...patch });
  const setProp = (key: string, v: unknown) => store.updateTransient(doc => { const o = doc.objects.find(x => x.id === object.id); if (o) o.props[key] = v; });
  const candidates = doc.objects.filter(o => o.id !== object.id && !isAncestor(doc,object.id,o.id));
  const [assetName,setAssetName]=useState(object.name);
  const [assetKind,setAssetKind]=useState<PrefabKind>(object.components?.npc?'npc':object.components?.poi||object.components?.storage?'poi':object.components?.item?'item':'decoration');
  const asset=doc.prefabs.find(p=>p.id===object.prefabInstance?.assetId);
  return (
    <>
      <div className="ed-row sc-head">
        <input type="checkbox" aria-label="Active" checked={object.visible} onChange={e => store.patchObject(object.id, { visible: e.target.checked })} />
        <input className="sc-name" aria-label="Name" value={object.name} onChange={e => store.patchObject(object.id, { name: e.target.value })} />
      </div>
      <div className="ed-row"><label>Prefab</label><span>{def?.label ?? object.prefab}</span><span className="ed-hint">{object.id}</span></div>
      <div className="ed-row"><label>Parent</label>
        <select aria-label="Parent" value={object.parent ?? ""} onChange={e => store.reparent(object.id, e.target.value || null)}>
          <option value="">(scene root)</option>
          {candidates.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <Section title="Transform" right={<button onClick={() => store.patchObject(object.id, { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } })}>Reset</button>}>
        <Vec3Row label="Position" value={object.transform.position} onBegin={begin} onEnd={end} onChange={position => setTransform({ position })} />
        <Vec3Row label="Rotation" value={object.transform.rotation} step={1} onBegin={begin} onEnd={end} onChange={rotation => setTransform({ rotation })} />
        <Vec3Row label="Scale" value={object.transform.scale} onBegin={begin} onEnd={end} onChange={scale => setTransform({ scale })} />
        <div className="ed-row">
          <button onClick={() => { const [x, , z] = object.transform.position; store.patchObject(object.id, { transform: { position: [x, Math.round(groundHeight(x, z) * 1000) / 1000, z] } }); }} disabled={!!object.parent} title={object.parent ? "Only root objects snap to terrain" : "Set Y to the terrain height"}>Snap to ground</button>
          <button onClick={() => store.duplicateSelected()}>Duplicate</button>
          <button onClick={() => store.deleteSelected()}>Delete</button>
        </div>
      </Section>
      <Section title="Prefab asset">
        {asset ? <>
          <p className="ed-hint">{asset.name} · revision {asset.revision} · {object.prefabInstance?.overrides.length??0} overrides</p>
          <div className="ed-row"><button onClick={()=>store.applyPrefab(object.id)}>Apply to prefab</button><button onClick={()=>store.revertPrefab(object.id)}>Revert instance</button><button onClick={()=>store.unpackPrefab(object.id)}>Unpack</button></div>
          {!!object.prefabInstance?.overrides.length && <p className="ed-hint">{object.prefabInstance.overrides.join(', ')}</p>}
        </> : object.prefabInstance ? <p role="alert">Missing prefab asset. Save this object as a new prefab to repair its link.</p> : null}
        <div className="ed-row"><input aria-label="Prefab asset name" value={assetName} onChange={e=>setAssetName(e.target.value)}/><select aria-label="Prefab kind" value={assetKind} onChange={e=>setAssetKind(e.target.value as PrefabKind)}>{(['npc','poi','item','decoration'] as const).map(k=><option key={k} value={k}>{k}</option>)}</select></div>
        <button onClick={()=>store.saveAsPrefab(object.id,assetName,assetKind)}>Save hierarchy as prefab</button>
      </Section>
      <Section title="Gameplay components">
        <p className="ed-hint">Distances use scene units (16 map pixels). Catalog IDs must match the game data.</p>
        <ComponentsEditor components={object.components} onBegin={begin} onEnd={end} apply={(components, transient) =>
          transient
            ? store.updateTransient(d => { const o = d.objects.find(o => o.id === object.id); if (o) o.components = components; })
            : store.patchObject(object.id, { components })
        } />
      </Section>
      {def && def.props.length > 0 && (
        <Section title={def.label}>
          {def.props.map(p => <PropField key={p.key} def={p} value={object.props[p.key] ?? p.default} onBegin={begin} onEnd={end} onChange={v => setProp(p.key, v)} />)}
        </Section>
      )}
    </>
  );
}

function EnvironmentInspector({ store }: { store: SceneStore }) {
  const env = useSceneStore(store, s => s.doc.environment);
  const count = useSceneStore(store, s => s.doc.objects.length);
  const begin = () => store.beginDrag();
  const end = () => store.endDrag();
  const set = (patch: Partial<SceneEnvironment>) => store.updateTransient(doc => Object.assign(doc.environment, patch));
  return (
    <>
      <p className="ed-hint">Nothing selected. Click an object in the Scene or Hierarchy to edit it; scene-wide settings are below.</p>
      <Section title="Environment">
        <div className="ed-row"><label>Sun color</label><ColorField label="Sun color" value={env.sunColor} onBegin={begin} onEnd={end} onChange={v => set({ sunColor: v })} /></div>
        <div className="ed-row"><label>Sun intensity</label><NumField label="Sun intensity" value={env.sunIntensity} step={.1} min={0} max={10} onBegin={begin} onEnd={end} onChange={v => set({ sunIntensity: v })} /></div>
        <div className="ed-row"><label>Sky / fog</label><ColorField label="Sky color" value={env.skyColor} onBegin={begin} onEnd={end} onChange={v => set({ skyColor: v })} /></div>
        <div className="ed-row"><label>Fog near</label><NumField label="Fog near" value={env.fogNear} step={1} min={0} onBegin={begin} onEnd={end} onChange={v => set({ fogNear: v })} /></div>
        <div className="ed-row"><label>Fog far</label><NumField label="Fog far" value={env.fogFar} step={1} min={0} onBegin={begin} onEnd={end} onChange={v => set({ fogFar: v })} /></div>
      </Section>
      <Section title="Scene">
        <div className="ed-row"><label>Objects</label><span>{count}</span></div>
        <div className="ed-row"><label>Units</label><span className="ed-hint">1 unit = 16 map px. Y up.</span></div>
      </Section>
    </>
  );
}

export function SceneInspector({ store, groundHeight }: { store: SceneStore; groundHeight: (x: number, z: number) => number }) {
  const selection = useSceneStore(store, s => s.selection);
  const doc = useSceneStore(store, s => s.doc);
  const single = selection.length === 1 ? doc.objects.find(o => o.id === selection[0]) : undefined;
  return (
    <>
      <div className="ed-dock-title">Inspector <span>{single ? single.name : selection.length > 1 ? `${selection.length} objects` : doc.map}</span></div>
      <div className="ed-panel sc-inspector">
        {single ? <ObjectInspector key={single.id} store={store} object={single} groundHeight={groundHeight} />
          : selection.length > 1 ? (
            <>
              <p className="ed-hint">{selection.length} objects selected. Multi-object editing is limited to duplicate/delete.</p>
              <div className="ed-row"><button onClick={() => store.duplicateSelected()}>Duplicate</button><button onClick={() => store.deleteSelected()}>Delete</button></div>
            </>
          ) : <EnvironmentInspector store={store} />}
      </div>
    </>
  );
}
