import { useEffect, useMemo, useRef, useState } from 'react';
import { createContentDefinition, getBehaviorExtensions, getContentTypeSchema, getContentTypeSchemas, type InspectorField } from '../../../../wails/frontend/src/content/contentRegistry.ts';
import { type ContentDefinition, type ContentDocument, type ContentType, type ContentValue, type ContentValidationIssue } from '../../../../wails/frontend/src/content/contentSchema.ts';
import { backlinks, buildAssetGraph, isEmbeddedAsset, renameAssetId, unlinkAssetReferences, validateContentGraph, type AssetGraphEdge } from '../../../../wails/frontend/src/content/recursiveAssets.ts';
import { downloadContent, loadContent, loadServerContent, parseContentJson, saveContent, saveServerContent } from './storage.ts';
import { ContentNavContext, getContentFieldEditor, useContentNav, type ContentEditorContext, type ContentNav } from './contentEditorRegistry.tsx';
import AssetSlotEditor from './AssetSlotEditor.tsx';
import { getAtDataPath, setAtDataPath } from './embeddedPaths.ts';
import { closeAssetTo, currentAsset, openAsset, parentAsset, type AssetNavigationEntry, type AssetNavigationStack } from './recursiveNavigation.ts';
import './registerAdapters.ts';
import './content.css';

const TYPES = getContentTypeSchemas();
const clone = <T,>(value: T): T => structuredClone(value);
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'new_definition';
const labelOf = (definition: ContentDefinition) => definition.name || definition.id;
const joinPath = (base: string, key: string) => (base ? `${base}.${key}` : key);

interface CreateRequest {
  types: ContentType[];
  mode: 'reference' | 'embedded';
  /** For embedded creation — data path of the slot marker, used to open the
   * new child after linking. */
  path?: string;
  link: (value: string | ContentDefinition) => void;
}

export default function ContentWorkspace() {
  const [doc, setDoc] = useState<ContentDocument>(loadContent);
  const [type, setType] = useState<ContentType>('npc');
  const [stack, setStack] = useState<AssetNavigationStack>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Saved locally');
  const [showIssues, setShowIssues] = useState(false);
  const [createReq, setCreateReq] = useState<CreateRequest | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; edges: AssetGraphEdge[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { saveContent(doc); setStatus('Saved locally'); }, [doc]);

  const schemas = useMemo(() => getContentTypeSchemas(), []);
  const issues = useMemo(() => validateContentGraph(doc, schemas), [doc, schemas]);
  const graph = useMemo(() => buildAssetGraph(doc, schemas), [doc, schemas]);
  const hasErrors = issues.some(issue => issue.severity === 'error');

  /** Re-resolve every stack entry's definition against the live document so
   * edits and renames flow into the visible trail. */
  const resolvedStack = useMemo(() => {
    const rootKey = stack[0]?.key ?? '';
    const root = doc.definitions.find(definition => definition.id === rootKey);
    return stack.map((entry) => {
      if (!entry.dataPath) {
        const definition = doc.definitions.find(item => item.id === entry.key);
        return definition ? { ...entry, definition, label: labelOf(definition) } : null;
      }
      const marker = root ? getAtDataPath(root, entry.dataPath) : undefined;
      const definition = isEmbeddedAsset(marker) ? marker.definition : undefined;
      return definition ? { ...entry, definition, label: labelOf(definition) } : null;
    }).filter((entry): entry is AssetNavigationEntry => !!entry);
  }, [doc, stack]);
  const current = currentAsset(resolvedStack);

  /** Executes a create-and-link request — shared by the modal pick and the
   * single-type fast path. */
  const runCreate = (req: CreateRequest, picked: ContentType) => {
    let id = slug(`new_${picked}`), n = 2;
    while (doc.definitions.some(item => item.id === id)) id = `new_${picked}_${n++}`;
    const definition = createContentDefinition(picked, id);
    if (req.mode === 'reference') {
      setDoc(old => ({ ...old, definitions: [...old.definitions, definition] }));
      req.link(id);
      setStack(old => openAsset(old, { key: id, label: labelOf(definition), definition }));
    } else {
      req.link(definition);
      const rootKey = resolvedStack[0]?.key ?? '';
      if (rootKey && req.path) setStack(old => openAsset(old, { key: `${rootKey}::${req.path}`, label: labelOf(definition), definition, dataPath: req.path }));
    }
    setCreateReq(null);
  };

  const nav = useMemo<ContentNav>(() => ({
    document: doc,
    backlinkCount: id => backlinks(graph, id).length,
    open: id => {
      const definition = doc.definitions.find(item => item.id === id);
      if (!definition) { setStatus(`Missing asset “${id}”`); return; }
      setStack(old => openAsset(old, { key: id, label: labelOf(definition), definition }));
    },
    openEmbedded: (dataPath, definition, label) => {
      const rootKey = resolvedStack[0]?.key ?? '';
      if (!rootKey) return;
      setStack(old => openAsset(old, { key: `${rootKey}::${dataPath}`, label, definition, dataPath }));
    },
    createAndLink: (types, link) => {
      const req: CreateRequest = { types, mode: 'reference', link: id => link(String(id)) };
      if (types.length === 1) runCreate(req, types[0]); else setCreateReq(req);
    },
    embedAndLink: (types, path, link) => {
      const req: CreateRequest = { types, mode: 'embedded', path, link: value => { if (typeof value !== 'string') link(value); } };
      if (types.length === 1) runCreate(req, types[0]); else setCreateReq(req);
    },
    addRootAsset: definition => {
      let id = slug(definition.id || 'embedded_asset'), n = 2;
      while (doc.definitions.some(item => item.id === id)) id = `${slug(definition.id || 'embedded_asset')}_${n++}`;
      setDoc(old => ({ ...old, definitions: [...old.definitions, { ...definition, id }] }));
      return id;
    },
  }), [doc, graph, resolvedStack]);

  const items = useMemo(() => doc.definitions.filter(item => item.type === type && `${item.name} ${item.id} ${item.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())), [doc, query, type]);

  /** Root + embedded updates funnel through here. */
  const updateCurrent = (next: ContentDefinition) => {
    if (!current) return;
    if (!current.dataPath) {
      setDoc(old => ({ ...old, definitions: old.definitions.map(item => item.id === current.key ? next : item) }));
      return;
    }
    const rootKey = resolvedStack[0]?.key;
    setDoc(old => ({
      ...old,
      definitions: old.definitions.map(item => {
        if (item.id !== rootKey) return item;
        const marker = getAtDataPath(item, current.dataPath!);
        if (!isEmbeddedAsset(marker)) return item;
        return setAtDataPath(item, current.dataPath!, { ...marker, definition: next });
      }),
    }));
  };

  const add = () => {
    let id = slug(`new_${type}`), n = 2;
    while (doc.definitions.some(item => item.id === id)) id = `new_${type}_${n++}`;
    const item = createContentDefinition(type, id);
    setDoc(old => ({ ...old, definitions: [...old.definitions, item] }));
    setStack([{ key: id, label: labelOf(item), definition: item }]);
  };
  const remove = () => {
    if (!current || current.dataPath) return;
    const edges = backlinks(graph, current.key);
    if (!edges.length) {
      if (!confirm(`Delete “${labelOf(current.definition)}”?`)) return;
      setDoc(old => ({ ...old, definitions: old.definitions.filter(item => item.id !== current.key) }));
      setStack([]);
      return;
    }
    setPendingDelete({ id: current.key, edges });
  };
  const unlinkAndDelete = () => {
    if (!pendingDelete) return;
    const { doc: next } = unlinkAssetReferences(doc, pendingDelete.id, schemas);
    setDoc({ ...next, definitions: next.definitions.filter(item => item.id !== pendingDelete.id) });
    setPendingDelete(null);
    setStack([]);
    setStatus(`Deleted “${pendingDelete.id}” and unlinked its references`);
  };
  const duplicate = () => {
    if (!current || current.dataPath) return;
    let id = `${current.key}_copy`, n = 2;
    while (doc.definitions.some(item => item.id === id)) id = `${current.key}_copy_${n++}`;
    const next = { ...clone(current.definition), id, name: `${labelOf(current.definition)} Copy` };
    setDoc(old => ({ ...old, definitions: [...old.definitions, next] }));
    setStack(old => [...parentAsset(old), { key: id, label: labelOf(next), definition: next }]);
  };

  const finishCreate = (picked: ContentType) => { if (createReq) runCreate(createReq, picked); };

  const openNode = (key: string) => {
    // Embedded graph keys are `root::path` — open the owning root.
    nav.open(key.split('::')[0]);
  };
  const openIssue = (issue: ContentValidationIssue) => {
    const match = /definitions\[(\d+)\]/.exec(issue.path);
    const definition = match ? doc.definitions[Number(match[1])] : doc.definitions.find(item => issue.path.startsWith(item.id));
    if (definition) nav.open(definition.id);
    else setStatus('Issue does not resolve to an asset');
  };

  const importFile = async (file?: File) => { if (!file) return; try { const imported = parseContentJson(await file.text()); setDoc(imported); setStack([]); setStatus(`Imported ${imported.definitions.length} definitions`); } catch (error) { setStatus(`Import failed: ${error instanceof Error ? error.message : error}`); } };
  const loadServer = async () => { try { const next = await loadServerContent(); setDoc(next); setStack([]); setStatus(`Loaded ${next.definitions.length} definitions from server`); } catch (error) { setStatus(`Server load failed; local draft kept: ${error instanceof Error ? error.message : error}`); } };
  const saveServer = async () => { try { await saveServerContent(doc); setStatus('Saved to server and local recovery'); } catch (error) { setStatus(`Server save failed; local recovery saved: ${error instanceof Error ? error.message : error}`); } };

  return <ContentNavContext.Provider value={nav}><div className="ct-workspace">
    <div className="ed-toolbar"><button className="primary" onClick={add}>＋ Create</button><button disabled={!current || !!current.dataPath} onClick={duplicate}>Duplicate</button><button disabled={!current || !!current.dataPath} onClick={remove}>Delete</button><span className="spacer"/><button onClick={() => void loadServer()}>Load server</button><button className="primary" disabled={hasErrors} title={hasErrors ? 'Fix validation errors before saving to the server.' : ''} onClick={() => void saveServer()}>Save server</button><button onClick={() => input.current?.click()}>Import JSON…</button><input ref={input} hidden type="file" accept="application/json,.json" onChange={event => void importFile(event.target.files?.[0])}/><button onClick={() => downloadContent(doc)}>Export JSON</button></div>
    <div className="ct-body">
      <aside className="ct-types"><div className="ed-dock-title">Content</div>{TYPES.map(schema => <button key={schema.type} className={type === schema.type ? 'selected' : ''} onClick={() => setType(schema.type)}><span style={{ color: schema.color }}>{schema.icon}</span>{schema.label}<small>{doc.definitions.filter(item => item.type === schema.type).length}</small></button>)}</aside>
      <section className="ct-browser"><div className="ed-dock-title"><span>Assets / {getContentTypeSchema(type).label}</span><b>{items.length}</b></div><div className="ed-search"><input aria-label="Search content" placeholder="Search assets…" value={query} onChange={event => setQuery(event.target.value)}/></div><div className="ct-grid">{items.map(item => <button key={item.id} className={`ct-card ${current?.key === item.id ? 'selected' : ''}`} onClick={() => nav.open(item.id)}><Thumbnail item={item}/><strong>{item.name}</strong><small>{item.id}</small></button>)}{!items.length && <div className="ed-empty">No {getContentTypeSchema(type).label.toLowerCase()} yet. Create one to begin.</div>}</div></section>
      <aside className="ct-inspector">
        <div className="ed-dock-title"><span>Inspector</span>{current && <b>{getContentTypeSchema(current.definition.type).icon}</b>}</div>
        {resolvedStack.length > 1 && <nav className="ct-crumbs">{resolvedStack.map((entry, index) => {
          const schema = getContentTypeSchema(entry.definition.type);
          return <span key={entry.key} className="ct-crumb-wrap">{index > 0 && <i className="ct-crumb-sep">›</i>}<button className={`ct-crumb ${index === resolvedStack.length - 1 ? 'current' : ''}`} onClick={() => setStack(old => closeAssetTo(old, entry.key))}><i style={{ color: schema.color }}>{schema.icon}</i>{entry.label}</button></span>;
        })}<button className="ct-crumb-back" title="Back" onClick={() => setStack(old => parentAsset(old))}>←</button></nav>}
        {current ? <Inspector entry={current} rootKey={resolvedStack[0]?.key ?? ''} graph={graph} onChange={updateCurrent} onRename={id => {
          const result = renameAssetId(doc, current.key, id, schemas);
          if ('error' in result) { setStatus(`Rename failed: ${result.error}`); return false; }
          setDoc(result.doc);
          setStack(old => old.map(entry => entry.key === current.key ? { ...entry, key: id } : entry.key.startsWith(`${current.key}::`) ? { ...entry, key: `${id}::${entry.key.slice(current.key.length + 2)}` } : entry));
          return true;
        }} onOpenNode={openNode}/> : <div className="ed-empty">Select an asset to edit it.</div>}
      </aside>
    </div>
    {showIssues && issues.length > 0 && <div className="ct-issues">{issues.map((issue, index) => <button key={index} className={`ct-issue ${issue.severity}`} onClick={() => openIssue(issue)}><b>{issue.severity}</b><code>{issue.path}</code><span>{issue.message}</span></button>)}</div>}
    <footer className="ed-statusbar"><span className={hasErrors ? 'ed-err' : 'ed-ready'}>●</span><span role="status">{status}</span><span className="spacer"/><button className="ct-status-btn" onClick={() => setShowIssues(show => !show)}>{issues.length ? `${issues.length} validation issue${issues.length === 1 ? '' : 's'}` : 'Content valid'}</button><span>{doc.definitions.length} definitions</span></footer>
    {createReq && <div className="ct-modal"><div className="ct-modal-box"><h3>{createReq.mode === 'embedded' ? 'Embed new asset' : 'Create linked asset'}</h3><p>Pick the asset type to create.</p>{createReq.types.map(picked => { const schema = getContentTypeSchema(picked); return <button key={picked} className="ct-modal-type" onClick={() => finishCreate(picked)}><i style={{ color: schema.color }}>{schema.icon}</i>{schema.label}</button>; })}<button onClick={() => setCreateReq(null)}>Cancel</button></div></div>}
    {pendingDelete && <div className="ct-modal"><div className="ct-modal-box"><h3>Delete “{pendingDelete.id}”?</h3><p>This asset is referenced by {pendingDelete.edges.length} other {pendingDelete.edges.length === 1 ? 'asset' : 'assets'}:</p><ul className="ct-modal-list">{pendingDelete.edges.map((edge, index) => <li key={index}><code>{edge.from}</code> <small>{edge.path}</small></li>)}</ul><button className="ed-danger" onClick={unlinkAndDelete}>Unlink references and delete</button><button onClick={() => setPendingDelete(null)}>Cancel</button></div></div>}
  </div></ContentNavContext.Provider>;
}

function Thumbnail({ item }: { item: ContentDefinition }) {
  const schema = getContentTypeSchema(item.type);
  return <div className="ct-thumb" style={{ borderColor: schema.color }}>{item.thumbnail ? <img src={item.thumbnail} alt=""/> : <span style={{ color: schema.color }}>{schema.icon}</span>}</div>;
}

function Inspector({ entry, rootKey, graph, onChange, onRename, onOpenNode }: {
  entry: AssetNavigationEntry;
  rootKey: string;
  graph: ReturnType<typeof buildAssetGraph>;
  onChange(value: ContentDefinition): void;
  onRename(id: string): boolean;
  onOpenNode(key: string): void;
}) {
  const value = entry.definition;
  const schema = getContentTypeSchema(value.type);
  const [idDraft, setIdDraft] = useState(value.id);
  useEffect(() => setIdDraft(value.id), [value.id]);
  const embedded = !!entry.dataPath;
  const basePath = embedded ? `${entry.dataPath}.definition.data` : '';
  const nodeKey = embedded ? `${rootKey}::${entry.dataPath}` : entry.key;
  const outgoing = graph.edges.filter(edge => edge.from === nodeKey);
  const incoming = backlinks(graph, nodeKey);
  const set = (key: string, next: ContentValue) => {
    if (key === '$name') onChange({ ...value, name: String(next) });
    else if (key === '$description') onChange({ ...value, description: String(next) });
    else if (key === '$thumbnail') onChange({ ...value, thumbnail: String(next) || undefined });
    else if (key === '$tags') onChange({ ...value, tags: String(next).split(',').map(tag => tag.trim()).filter(Boolean) });
    else onChange({ ...value, data: { ...value.data, [key]: next } });
  };
  const commitId = () => {
    if (embedded) { if (idDraft !== value.id) onChange({ ...value, id: slug(idDraft) }); return; }
    onRename(slug(idDraft));
  };
  return <div className="ct-inspector-scroll">
    <label className="ct-id">ID<input value={idDraft} onChange={event => setIdDraft(event.target.value)} onBlur={commitId} onKeyDown={event => event.key === 'Enter' && commitId()}/></label>
    {embedded && <div className="ct-owned-banner">Embedded — owned by <code>{rootKey}</code></div>}
    {schema.groups.map(group => <details key={group.id} open><summary>{group.label}</summary><div className="ct-fields">{group.fields.map(field => <Field key={field.key} field={field} value={field.key === '$name' ? value.name : field.key === '$description' ? value.description : field.key === '$thumbnail' ? value.thumbnail ?? '' : field.key === '$tags' ? value.tags.join(', ') : value.data[field.key]} def={value} path={field.key.startsWith('$') ? '' : joinPath(basePath, field.key)} onChange={next => set(field.key, next)}/>)}</div></details>)}
    <details className="ct-relations"><summary>Relationships</summary>
      {outgoing.length > 0 && <div className="ct-rel-block"><h4>Links to</h4>{outgoing.map((edge, index) => <button key={index} className="ct-rel" onClick={() => onOpenNode(edge.to)}><span>{edge.to}</span><small>{edge.path}{edge.embedded ? ' · embedded' : ''}</small></button>)}</div>}
      {incoming.length > 0 && <div className="ct-rel-block"><h4>Referenced by</h4>{incoming.map((edge, index) => <button key={index} className="ct-rel" onClick={() => onOpenNode(edge.from)}><span>{edge.from}</span><small>{edge.path}</small></button>)}</div>}
      {!outgoing.length && !incoming.length && <div className="ed-empty">No linked assets.</div>}
    </details>
  </div>;
}

function Field({ field, value, def, path, onChange }: { field: InspectorField; value: ContentValue | undefined; def: ContentDefinition; path: string; onChange(value: ContentValue): void }) {
  const nav = useContentNav();
  const ctx: ContentEditorContext = {
    definition: def,
    field,
    value,
    document: nav.document,
    path,
    updateValue: onChange,
    openAsset: nav.open,
    createAndLink: (type, link) => nav.createAndLink([type], link),
  };
  if (field.type === 'behaviorList') return <BehaviorEditor label={field.label} basePath={path} value={Array.isArray(value) ? value : []} def={def} onChange={onChange}/>;
  if (field.type === 'list') return <ListEditor field={field} basePath={path} value={Array.isArray(value) ? value : []} def={def} onChange={onChange}/>;
  if (field.type === 'assetSlot' || field.type === 'embeddedAsset' || field.type === 'reference') {
    const slotField = field.type === 'reference' ? { ...field, slotMode: 'reference' as const } : field;
    return <AssetSlotEditor {...ctx} field={slotField}/>;
  }
  if (field.type === 'customEditor') {
    const Editor = field.editorId ? getContentFieldEditor(field.editorId) : undefined;
    if (!Editor) return <label className="ct-field"><span>{field.label}</span><em className="ct-missing-editor">Specialist editor “{field.editorId ?? '?'}” is not registered.</em></label>;
    return <Editor {...ctx}/>;
  }
  const common = { value: String(value ?? ''), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value) };
  return <label className="ct-field"><span>{field.label}</span>{field.type === 'textarea' ? <textarea {...common}/> : field.type === 'boolean' ? <input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)}/> : field.type === 'number' ? <input type="number" value={Number(value ?? 0)} onChange={event => onChange(Number(event.target.value))}/> : field.type === 'select' ? <select {...common}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input {...common} placeholder={field.type === 'asset' ? '/assets/… or https://…' : undefined}/>} {field.help && <small>{field.help}</small>}</label>;
}

function ListEditor({ field, basePath, value, def, onChange }: { field: InspectorField; basePath: string; value: ContentValue[]; def: ContentDefinition; onChange(value: ContentValue): void }) {
  const rows = value.filter((row): row is Record<string, ContentValue> => !!row && typeof row === 'object' && !Array.isArray(row));
  const update = (index: number, key: string, next: ContentValue) => onChange(rows.map((row, i) => i === index ? { ...row, [key]: next } : row));
  return <div className="ct-list"><div className="ct-list-title"><span>{field.label}</span><button onClick={() => onChange([...rows, Object.fromEntries((field.itemFields ?? []).map(child => [child.key, child.type === 'number' ? 1 : '']))])}>＋</button></div>{rows.map((row, index) => <div className="ct-list-row" key={index}>{field.itemFields?.map(child => <Field key={child.key} field={child} value={row[child.key]} def={def} path={`${basePath}[${index}].${child.key}`} onChange={next => update(index, child.key, next)}/>) }<button onClick={() => onChange(rows.filter((_, i) => i !== index))}>×</button></div>)}</div>;
}

function BehaviorEditor({ label, basePath, value, def, onChange }: { label: string; basePath: string; value: ContentValue[]; def: ContentDefinition; onChange(value: ContentValue): void }) {
  const rows = value.filter((row): row is Record<string, ContentValue> => !!row && typeof row === 'object' && !Array.isArray(row));
  const edit = (index: number, key: string, next: ContentValue) => onChange(rows.map((row, i) => i === index ? { ...row, [key]: next } : row));
  const triggers = getBehaviorExtensions('trigger'), conditions = getBehaviorExtensions('condition'), actions = getBehaviorExtensions('action');
  const args = (row: Record<string, ContentValue>, key: string) => row[key] && typeof row[key] === 'object' && !Array.isArray(row[key]) ? row[key] as Record<string, ContentValue> : {};
  const extensionFields = (row: Record<string, ContentValue>, index: number, kind: 'trigger' | 'condition' | 'action', options: typeof triggers) => {
    const extension = options.find(option => option.id === String(row[kind] ?? '')), key = `${kind}Args`, values = args(row, key);
    return extension?.fields?.map(field => <Field key={`${kind}:${field.key}`} field={field} value={values[field.key]} def={def} path={`${basePath}[${index}].${key}.${field.key}`} onChange={next => edit(index, key, { ...values, [field.key]: next })}/>) ?? null;
  };
  return <div className="ct-list"><div className="ct-list-title"><span>{label}</span><button onClick={() => onChange([...rows, { trigger: triggers[0]?.id ?? '', condition: conditions[0]?.id ?? '', action: actions[0]?.id ?? '', triggerArgs: {}, conditionArgs: {}, actionArgs: {} }])}>＋ Rule</button></div>{rows.map((row, index) => <div className="ct-behavior" key={index}><b>When</b><select value={String(row.trigger ?? '')} onChange={event => edit(index, 'trigger', event.target.value)}>{triggers.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>{extensionFields(row, index, 'trigger', triggers)}<b>If</b><select value={String(row.condition ?? '')} onChange={event => edit(index, 'condition', event.target.value)}>{conditions.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>{extensionFields(row, index, 'condition', conditions)}<b>Do</b><select value={String(row.action ?? '')} onChange={event => edit(index, 'action', event.target.value)}>{actions.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>{extensionFields(row, index, 'action', actions)}<button onClick={() => onChange(rows.filter((_, i) => i !== index))}>×</button></div>)}</div>;
}
