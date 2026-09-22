// Authored 3D scene layer — hand-placed prefabs, lights and environment
// settings layered over the procedural terrain derived from the 2D map.
// Authored in tools/editor (Scene workspace); intended to live at
// data/maps/<mapId>.scene3d.json once the runtime loads it.
//
// Coordinates are Three.js world units (map px * WORLD_SCALE, y up), so the
// runtime can add these objects to the scene graph without conversion.
// Rotation is Euler XYZ in degrees. Child transforms are relative to parent.

import { normalizeTerrain } from './terrainEditing';
import type { TerrainData } from './heightmap';
export type SceneTerrain = TerrainData;
export const SCENE3D_VERSION = 2;

export type Vec3 = [number, number, number];

export interface SceneTransform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export interface SceneObject {
  id: string;
  name: string;
  /** Parent object id; null/undefined = scene root. */
  parent?: string | null;
  /** Prefab registry id (see prefabs.ts). */
  prefab: string;
  transform: SceneTransform;
  visible: boolean;
  /** Prefab-specific parameters (colour, light intensity, ...). */
  props: Record<string, unknown>;
  components?: SceneComponents;
  prefabInstance?: { assetId: string; nodeId: string; rootId: string; overrides: string[] };
}

export interface SceneComponents {
  npc?: { enabled: boolean; archetype: string; level: number; hostile: boolean; respawnSeconds: number };
  poi?: { enabled: boolean; type: string; label: string; interactionRadius: number; destinationMap: string };
  item?: { enabled: boolean; itemId: string; quantity: number; respawnSeconds: number };
  /** Dimensions are full extents in Three units; offset is the local center. */
  collider?: { enabled: boolean; shape: 'box' | 'capsule' | 'sphere'; size: Vec3; offset: Vec3; isTrigger: boolean };
}

export type SceneComponentKey = keyof SceneComponents;
export interface SceneComponentField {
  key: string;
  label: string;
  type: 'boolean' | 'number' | 'string' | 'select' | 'vec3';
  min?: number;
  step?: number;
  options?: readonly string[];
}
export interface SceneComponentDefinition {
  key: SceneComponentKey;
  label: string;
  description: string;
  fields: readonly SceneComponentField[];
}

/** Editor metadata lives beside the serialized component contract. New
 * component fields can therefore be exposed by extending this registry;
 * inspectors do not contain component-specific JSX. */
export const SCENE_COMPONENT_DEFINITIONS: readonly SceneComponentDefinition[] = [
  { key:'npc', label:'NPC', description:'Spawns and configures a world character.', fields:[
    {key:'enabled',label:'Enabled',type:'boolean'}, {key:'archetype',label:'Archetype',type:'string'},
    {key:'level',label:'Level',type:'number',min:1,step:1}, {key:'hostile',label:'Hostile',type:'boolean'},
    {key:'respawnSeconds',label:'Respawn seconds',type:'number',min:0,step:1},
  ] },
  { key:'poi', label:'Point of Interest', description:'Adds an interaction, destination, or landmark.', fields:[
    {key:'enabled',label:'Enabled',type:'boolean'},
    {key:'type',label:'Type',type:'select',options:['save_point','job_changer','portal','camp','storage']},
    {key:'label',label:'Label',type:'string'}, {key:'interactionRadius',label:'Interaction radius',type:'number',min:.1,step:.1},
    {key:'destinationMap',label:'Destination map',type:'string'},
  ] },
  { key:'item', label:'Item Pickup', description:'Spawns a collectible item in the world.', fields:[
    {key:'enabled',label:'Enabled',type:'boolean'}, {key:'itemId',label:'Item ID',type:'string'},
    {key:'quantity',label:'Quantity',type:'number',min:1,step:1}, {key:'respawnSeconds',label:'Respawn seconds',type:'number',min:0,step:1},
  ] },
  { key:'collider', label:'Collider', description:'Controls placement, collision, and trigger volume.', fields:[
    {key:'enabled',label:'Enabled',type:'boolean'}, {key:'shape',label:'Shape',type:'select',options:['box','capsule','sphere']},
    {key:'size',label:'Size',type:'vec3'}, {key:'offset',label:'Offset',type:'vec3'}, {key:'isTrigger',label:'Is trigger',type:'boolean'},
  ] },
] as const;
export type PrefabKind = 'npc' | 'poi' | 'item' | 'decoration';
export interface ScenePrefabAsset { id: string; name: string; kind: PrefabKind; revision: number; objects: SceneObject[] }

export interface SceneEnvironment {
  sunColor: string;
  sunIntensity: number;
  skyColor: string;
  fogNear: number;
  fogFar: number;
}

export interface Scene3DDoc {
  version: number;
  map: string;
  environment: SceneEnvironment;
  objects: SceneObject[];
  prefabs: ScenePrefabAsset[];
  terrain: SceneTerrain;
}

export const DEFAULT_ENVIRONMENT: SceneEnvironment = {
  sunColor: "#ffe5b7",
  sunIntensity: 2.6,
  skyColor: "#bccdd0",
  fogNear: 28,
  fogFar: 65,
};

export const IDENTITY_TRANSFORM: SceneTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

export function emptyScene(map: string): Scene3DDoc {
  return { version: SCENE3D_VERSION, map, environment: { ...DEFAULT_ENVIRONMENT }, objects: [], prefabs: [], terrain: {version:1,heights:{},cells:{}} };
}

export function newObjectId(): string {
  return `o_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const vec3 = (v: unknown, fallback: Vec3): Vec3 =>
  Array.isArray(v) && v.length === 3 ? [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])] : [...fallback];
const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

export function normalizeComponents(raw: unknown): SceneComponents {
  const r = record(raw), out: SceneComponents = {};
  if (r.npc) { const n = record(r.npc); out.npc = { enabled:n.enabled!==false, archetype:str(n.archetype,'goblin'), level:Math.max(1,Math.floor(num(n.level,1))), hostile:n.hostile!==false, respawnSeconds:Math.max(0,num(n.respawnSeconds,30)) }; }
  if (r.poi) { const p = record(r.poi); out.poi = { enabled:p.enabled!==false, type:str(p.type,'save_point'), label:str(p.label,'Point of interest'), interactionRadius:Math.max(.1,num(p.interactionRadius,3)), destinationMap:str(p.destinationMap,'') }; }
  if (r.item) { const i = record(r.item); out.item = { enabled:i.enabled!==false, itemId:str(i.itemId,'potion'), quantity:Math.max(1,Math.floor(num(i.quantity,1))), respawnSeconds:Math.max(0,num(i.respawnSeconds,60)) }; }
  if (r.collider) { const c = record(r.collider); out.collider = { enabled:c.enabled!==false, shape:c.shape==='sphere'||c.shape==='capsule'?c.shape:'box', size:vec3(c.size,[1,1,1]).map(v=>Math.max(.01,Math.abs(v))) as Vec3, offset:vec3(c.offset,[0,.5,0]), isTrigger:c.isTrigger===true }; }
  return out;
}

export function normalizeObject(raw: unknown, index: number): SceneObject {
  const r = record(raw);
  const t = (r.transform ?? {}) as Record<string, unknown>;
  return {
    id: str(r.id, "") || `o_${index}`,
    name: str(r.name, "") || str(r.prefab, "Object"),
    parent: typeof r.parent === "string" && r.parent ? r.parent : null,
    prefab: str(r.prefab, "empty"),
    transform: {
      position: vec3(t.position, IDENTITY_TRANSFORM.position),
      rotation: vec3(t.rotation, IDENTITY_TRANSFORM.rotation),
      scale: vec3(t.scale, IDENTITY_TRANSFORM.scale),
    },
    visible: r.visible !== false,
    props: r.props && typeof r.props === "object" ? { ...(r.props as Record<string, unknown>) } : {},
    components: normalizeComponents(r.components),
    ...(r.prefabInstance && typeof record(r.prefabInstance).assetId === 'string' ? { prefabInstance: {assetId:str(record(r.prefabInstance).assetId,''), nodeId:str(record(r.prefabInstance).nodeId,''), rootId:str(record(r.prefabInstance).rootId,''), overrides:Array.isArray(record(r.prefabInstance).overrides)?(record(r.prefabInstance).overrides as unknown[]).filter((v):v is string=>typeof v==='string'):[]} } : {}),
  };
}

/** Tolerant parse: missing fields get defaults, dangling parents become roots. */
export function normalizeScene(raw: unknown, fallbackMap = ""): Scene3DDoc {
  const r = (raw ?? {}) as Record<string, unknown>;
  const e = (r.environment ?? {}) as Record<string, unknown>;
  const objects = (Array.isArray(r.objects) ? r.objects : []).map(normalizeObject);
  repairHierarchy(objects);
  const prefabs: ScenePrefabAsset[] = [];
  const prefabIds = new Set<string>();
  for (const value of Array.isArray(r.prefabs) ? r.prefabs : []) {
    const p = record(value), id = str(p.id,'');
    if (!id || prefabIds.has(id)) continue;
    const nodes = (Array.isArray(p.objects)?p.objects:[]).map(normalizeObject);
    if (!nodes.length) continue;
    repairHierarchy(nodes);
    nodes[0].parent = null;
    for (const node of nodes) { delete node.prefabInstance; if (node !== nodes[0] && !node.parent) node.parent=nodes[0].id; }
    prefabs.push({id,name:str(p.name,id),kind:p.kind==='npc'||p.kind==='poi'||p.kind==='item'?p.kind:'decoration',revision:Math.max(1,Math.floor(num(p.revision,1))),objects:nodes});
    prefabIds.add(id);
  }
  return {
    version: SCENE3D_VERSION,
    map: str(r.map, fallbackMap),
    environment: {
      sunColor: str(e.sunColor, DEFAULT_ENVIRONMENT.sunColor),
      sunIntensity: num(e.sunIntensity, DEFAULT_ENVIRONMENT.sunIntensity),
      skyColor: str(e.skyColor, DEFAULT_ENVIRONMENT.skyColor),
      fogNear: num(e.fogNear, DEFAULT_ENVIRONMENT.fogNear),
      fogFar: num(e.fogFar, DEFAULT_ENVIRONMENT.fogFar),
    },
    objects,
    prefabs,
    terrain: normalizeTerrain(r.terrain),
  };
}

function repairHierarchy(objects: SceneObject[]) {
  const used = new Set<string>();
  objects.forEach((o,i) => { const original=o.id; let suffix=i; while(used.has(o.id)) o.id=`${original}_${suffix++}`; used.add(o.id); });
  const byId = new Map(objects.map(o=>[o.id,o]));
  for (const o of objects) {
    if (o.parent && (!byId.has(o.parent)||o.parent===o.id)) o.parent=null;
    const seen = new Set([o.id]); let cur=o.parent;
    while(cur) { if(seen.has(cur)) {o.parent=null;break;} seen.add(cur);cur=byId.get(cur)?.parent; }
  }
}

/** Children grouped by parent id ("" = root), preserving document order. */
export function childrenByParent(doc: Scene3DDoc): Map<string, SceneObject[]> {
  const out = new Map<string, SceneObject[]>();
  for (const o of doc.objects) {
    const key = o.parent ?? "";
    const list = out.get(key);
    if (list) list.push(o); else out.set(key, [o]);
  }
  return out;
}

/** The object and every descendant, depth-first. */
export function subtreeIds(doc: Scene3DDoc, id: string): string[] {
  const kids = childrenByParent(doc);
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (cur: string) => { if(seen.has(cur)) return; seen.add(cur); out.push(cur); for (const c of kids.get(cur) ?? []) walk(c.id); };
  walk(id);
  return out;
}

export function isAncestor(doc: Scene3DDoc, ancestor: string, id: string): boolean {
  const byId = new Map(doc.objects.map(o => [o.id, o]));
  let cur = byId.get(id)?.parent ?? null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) { if (cur === ancestor) return true; seen.add(cur); cur = byId.get(cur)?.parent ?? null; }
  return false;
}
