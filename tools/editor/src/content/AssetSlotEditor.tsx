import { useMemo, useState } from 'react';
import { getContentTypeSchema, getContentTypeSchemas } from '../../../../wails/frontend/src/content/contentRegistry.ts';
import type { ContentDefinition } from '../../../../wails/frontend/src/content/contentSchema.ts';
import { assetReference, embeddedAsset, isAssetReference, isEmbeddedAsset } from '../../../../wails/frontend/src/content/recursiveAssets.ts';
import { useContentNav, type ContentEditorContext } from './contentEditorRegistry.tsx';

const labelOf = (def: ContentDefinition) => def.name || def.id;

/**
 * Generic recursive asset slot — renders a compact card for a shared
 * reference or embedded child, with open / pick / create / embed / convert /
 * clear actions. Value may be a marker object or a legacy string id.
 */
export default function AssetSlotEditor({ field, value, path, updateValue }: ContentEditorContext) {
  const nav = useContentNav();
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const types = field.referenceTypes?.length ? field.referenceTypes : getContentTypeSchemas().map(schema => schema.type);
  const canRef = field.slotMode !== 'embedded';
  const canEmbed = field.slotMode !== 'reference';

  const refId = typeof value === 'string' && value ? value : isAssetReference(value) ? value.id : '';
  const embedded = isEmbeddedAsset(value) ? value.definition : undefined;
  const target = refId ? nav.document.definitions.find(definition => definition.id === refId) : undefined;
  const missing = !!refId && !target;
  const shown = embedded ?? target;
  const uses = refId ? nav.backlinkCount(refId) : 0;

  const pick = (id: string) => { updateValue(canRef ? assetReference(id) : embeddedAsset(shown!)); setPicking(false); };
  const candidates = useMemo(() => nav.document.definitions
    .filter(definition => types.includes(definition.type))
    .filter(definition => `${definition.name} ${definition.id}`.toLowerCase().includes(search.toLowerCase())), [nav.document, types, search]);

  return <div className="ct-slot">
    <div className="ct-slot-title"><span>{field.label}</span>
      {shown ? <em className={embedded ? 'ct-owned' : 'ct-shared'}>{embedded ? 'Owned' : `Shared · ${uses}`}</em> : <em className="ct-empty-tag">Empty</em>}
    </div>
    {shown ? <div className={`ct-slot-card ${missing ? 'ct-slot-missing' : ''}`} onClick={() => embedded ? nav.openEmbedded(path, embedded, labelOf(embedded)) : nav.open(shown.id)} role="button" tabIndex={0} onKeyDown={event => event.key === 'Enter' && (embedded ? nav.openEmbedded(path, embedded, labelOf(embedded)) : nav.open(shown.id))}>
      <SlotThumb item={shown}/>
      <div className="ct-slot-meta"><strong>{labelOf(shown)}</strong><small>{getContentTypeSchema(shown.type).label.slice(0, -1) || shown.type} · {shown.id}{missing && ' — missing'}</small></div>
      <span className="ct-slot-open">Open →</span>
    </div> : <div className="ct-slot-empty">Nothing linked — pick, create, or embed an asset.</div>}
    <div className="ct-slot-actions">
      {canRef && <button onClick={() => setPicking(open => !open)}>{shown ? 'Replace' : 'Pick…'}</button>}
      {canRef && <button onClick={() => nav.createAndLink(types, id => updateValue(assetReference(id)))}>＋ New</button>}
      {canEmbed && !embedded && <button onClick={() => nav.embedAndLink(types, path, definition => updateValue(embeddedAsset(definition)))}>Embed</button>}
      {embedded && canRef && <button onClick={() => { const id = nav.addRootAsset(embedded); updateValue(assetReference(id)); }}>Convert to shared</button>}
      {target && canEmbed && <button onClick={() => updateValue(embeddedAsset(structuredClone(target)))}>Make local copy</button>}
      {shown && <button onClick={() => updateValue(null)}>Clear</button>}
    </div>
    {picking && <div className="ct-picker">
      <input autoFocus placeholder="Search assets…" value={search} onChange={event => setSearch(event.target.value)}/>
      <div className="ct-picker-list">{candidates.map(candidate => <button key={candidate.id} onClick={() => pick(candidate.id)}><SlotThumb item={candidate}/><span>{labelOf(candidate)}</span><small>{candidate.type}</small></button>)}{!candidates.length && <em>No matching assets.</em>}</div>
    </div>}
    {field.help && <small className="ct-slot-help">{field.help}</small>}
  </div>;
}

export function SlotThumb({ item }: { item: ContentDefinition }) {
  const schema = getContentTypeSchema(item.type);
  return <span className="ct-slot-thumb" style={{ borderColor: schema.color }}>{item.thumbnail ? <img src={item.thumbnail} alt=""/> : <i style={{ color: schema.color }}>{schema.icon}</i>}</span>;
}
