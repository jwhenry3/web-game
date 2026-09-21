import { newObjectId, subtreeIds, type PrefabKind, type Scene3DDoc, type SceneObject, type ScenePrefabAsset, type Vec3 } from './scene3d';

/** Leaf paths make overrides independent: changing level never pins archetype. */
function leaves(value: unknown, prefix = '', out: Record<string, unknown> = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) leaves(child, prefix ? `${prefix}.${key}` : key, out);
  } else out[prefix] = value;
  return out;
}
function values(object: SceneObject) {
  return leaves({ name:object.name, prefab:object.prefab, visible:object.visible, props:object.props, components:object.components??{}, transform:object.transform });
}
function assignPath(object: SceneObject, path: string, value: unknown) {
  const keys=path.split('.'); let target=object as unknown as Record<string,unknown>;
  for(const key of keys.slice(0,-1)) { if(!target[key] || typeof target[key]!=='object') target[key]={}; target=target[key] as Record<string,unknown>; }
  if(value===undefined) delete target[keys.at(-1)!]; else target[keys.at(-1)!]=structuredClone(value);
}
export function refreshPrefabOverrides(doc: Scene3DDoc) {
  for (const object of doc.objects) {
    const link=object.prefabInstance;
    if(!link) continue;
    const template=doc.prefabs.find(p=>p.id===link.assetId)?.objects.find(o=>o.id===link.nodeId);
    if(!template) continue;
    const actual=values(object), base=values(template);
    link.overrides=[...new Set([...Object.keys(actual),...Object.keys(base)])].filter(key=> !(object.id===link.rootId && key==='transform.position') && JSON.stringify(actual[key])!==JSON.stringify(base[key]));
  }
}
export function savePrefabAsset(doc: Scene3DDoc, rootId: string, name: string, kind: PrefabKind): ScenePrefabAsset {
  const ids=new Set(subtreeIds(doc,rootId));
  const root=doc.objects.find(o=>o.id===rootId);
  if(!root) throw new Error('Select a scene object first');
  const nodes=[root,...doc.objects.filter(o=>o.id!==rootId && ids.has(o.id))];
  const asset:ScenePrefabAsset={id:`prefab_${newObjectId()}`,name:name.trim()||root.name,kind,revision:1,objects:nodes.map(o=>structuredClone(o))};
  for(const node of asset.objects) delete node.prefabInstance;
  asset.objects[0].parent=null;
  asset.objects[0].transform.position=[0,0,0];
  for(const node of nodes) node.prefabInstance={assetId:asset.id,nodeId:node.id,rootId,overrides:[]};
  doc.prefabs.push(asset);
  return asset;
}
export function instantiatePrefabAsset(doc: Scene3DDoc, assetId: string, position: Vec3, parent: string|null=null): string {
  const asset=doc.prefabs.find(p=>p.id===assetId);
  if(!asset?.objects.length) throw new Error(`Prefab asset '${assetId}' is missing`);
  const ids=new Map(asset.objects.map(o=>[o.id,newObjectId()]));
  const rootId=ids.get(asset.objects[0].id)!;
  for(const template of asset.objects) {
    const node=structuredClone(template);node.id=ids.get(template.id)!;
    node.parent=template.parent?ids.get(template.parent)??rootId:parent;
    if(node.id===rootId) node.transform.position=[...position];
    node.prefabInstance={assetId,nodeId:template.id,rootId,overrides:[]};
    doc.objects.push(node);
  }
  return rootId;
}
function syncInstance(doc: Scene3DDoc, asset: ScenePrefabAsset, rootId: string, preserveOverrides: boolean) {
  const root=doc.objects.find(o=>o.id===rootId);if(!root) return;
  const members=doc.objects.filter(o=>o.prefabInstance?.rootId===rootId && o.prefabInstance.assetId===asset.id);
  const byNode=new Map(members.map(o=>[o.prefabInstance!.nodeId,o]));
  const ids=new Map(asset.objects.map(t=>[t.id,byNode.get(t.id)?.id??newObjectId()]));
  const templateIds=new Set(asset.objects.map(t=>t.id));
  const removed=new Set(members.filter(o=>!templateIds.has(o.prefabInstance!.nodeId)).map(o=>o.id));
  doc.objects=doc.objects.filter(o=>!removed.has(o.id));
  for(const o of doc.objects) if(o.parent && removed.has(o.parent)) o.parent=rootId;
  for(const template of asset.objects) {
    let node=byNode.get(template.id);
    const previous=node?structuredClone(node):undefined;
    if(!node) {node=structuredClone(template);doc.objects.push(node);}
    Object.assign(node,structuredClone(template),{id:ids.get(template.id), parent:template.parent?ids.get(template.parent)??rootId:root.parent});
    node.prefabInstance={assetId:asset.id,nodeId:template.id,rootId,overrides:[]};
    if(previous && preserveOverrides) for(const key of previous.prefabInstance!.overrides) assignPath(node,key,values(previous)[key]);
    if(node.id===rootId && previous) node.transform.position=[...previous.transform.position];
  }
}
/** Push an edited asset's nodes out to every scene instance, preserving each instance's recorded overrides. */
export function syncPrefabInstances(doc: Scene3DDoc, assetId: string) {
  const asset = doc.prefabs.find(p => p.id === assetId);
  if (!asset) return;
  const roots = doc.objects.filter(o => o.prefabInstance?.assetId === assetId && o.prefabInstance.rootId === o.id).map(o => o.id);
  for (const rootId of roots) syncInstance(doc, asset, rootId, true);
  refreshPrefabOverrides(doc);
}
export function revertPrefabOverrides(doc: Scene3DDoc, objectId: string) {
  const link=doc.objects.find(o=>o.id===objectId)?.prefabInstance;
  const asset=doc.prefabs.find(p=>p.id===link?.assetId);
  if(!link||!asset) return;
  syncInstance(doc,asset,link.rootId,false);refreshPrefabOverrides(doc);
}
export function applyPrefabOverrides(doc: Scene3DDoc, objectId: string) {
  refreshPrefabOverrides(doc);
  const link=doc.objects.find(o=>o.id===objectId)?.prefabInstance;
  const asset=doc.prefabs.find(p=>p.id===link?.assetId);
  if(!link||!asset) return;
  const source=doc.objects.find(o=>o.id===link.rootId);if(!source) return;
  const subtree=new Set(subtreeIds(doc,source.id));
  const nodes=[source,...doc.objects.filter(o=>o.id!==source.id&&subtree.has(o.id))];
  const nodeIds=new Map(nodes.map(o=>[o.id,o.prefabInstance?.assetId===asset.id?o.prefabInstance.nodeId:newObjectId()]));
  const roots=doc.objects.filter(o=>o.prefabInstance?.assetId===asset.id&&o.prefabInstance.rootId===o.id).map(o=>o.id);
  asset.objects=nodes.map(o=> { const t=structuredClone(o);t.id=nodeIds.get(o.id)!;t.parent=o.id===source.id?null:nodeIds.get(o.parent!)??nodeIds.get(source.id)!;delete t.prefabInstance;if(o.id===source.id)t.transform.position=[0,0,0];return t; });
  asset.revision++;
  for(const node of nodes) node.prefabInstance={assetId:asset.id,nodeId:nodeIds.get(node.id)!,rootId:source.id,overrides:[]};
  for(const rootId of roots) syncInstance(doc,asset,rootId,rootId!==source.id);
  refreshPrefabOverrides(doc);
}
