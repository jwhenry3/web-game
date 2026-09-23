import { useState } from "react";
import * as THREE from "three";
import { disposeObject } from "../../../../wails/frontend/src/three/terrain";
import { instantiatePrefab, PREFAB_BY_ID, PREFABS, type PrefabDef } from "../../../../wails/frontend/src/three/prefabs";
import { normalizeComponents, type ScenePrefabAsset } from "../../../../wails/frontend/src/three/scene3d";
import { getContentTypeSchema, getContentTypeSchemas } from "../../../../wails/frontend/src/content/contentRegistry";
import type { ContentDefinition, ContentType } from "../../../../wails/frontend/src/content/contentSchema";
import { PLACEMENT_MIME, PREFAB_MIME, type PlacementPayload } from "../scene3d/SceneView";
import { loadContent } from "../content/storage";
import { useSceneStore, type SceneStore } from '../scene3d/store';
import { PaneHandle } from './PaneHandle';
import { thumbnailDigest, useThumbnail } from './thumbCache';

const ICONS: Record<PrefabDef["category"], string> = { Buildings: "⌂", Nature: "❦", Landmarks: "✦", Primitives: "◼", Lights: "☼", Utility: "◇", Gameplay:'♟' };
const CATEGORIES = [...new Set(PREFABS.map(p => p.category))];
const TYPES = getContentTypeSchemas();
let thumbnailRenderer: THREE.WebGLRenderer | null = null;

function buildAssetPreview(asset: ScenePrefabAsset): THREE.Group {
  const root=new THREE.Group(), objects=new Map<string,THREE.Object3D>();
  for(const node of asset.objects) {
    const object=instantiatePrefab(node.prefab,node.props), t=node.transform;
    object.position.set(...t.position);object.rotation.set(...t.rotation.map(THREE.MathUtils.degToRad) as [number,number,number]);object.scale.set(...t.scale);
    objects.set(node.id,object);
  }
  for(const node of asset.objects) (node.parent&&objects.get(node.parent)||root).add(objects.get(node.id)!);
  return root;
}

/** One short-lived renderer produces actual model previews without creating a
 * WebGL context for every Project card. Also used by the Characters library
 * for rig thumbnails. The object is borrowed for one render — callers keep
 * ownership and dispose. */
export function renderObjectThumbnail(object: THREE.Object3D): string | null {
  try {
    const renderer=thumbnailRenderer??=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(96,72,false);renderer.setPixelRatio(1);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x3b3d40);
    scene.add(new THREE.HemisphereLight(0xffffff,0x30343a,2.2));const key=new THREE.DirectionalLight(0xffe1b0,2.4);key.position.set(3,5,4);scene.add(key);
    scene.add(object);
    object.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3()),size=Math.max(.5,box.getSize(new THREE.Vector3()).length());
    const camera=new THREE.PerspectiveCamera(30,4/3,.01,1000);camera.position.copy(center).add(new THREE.Vector3(size*.75,size*.55,size*.9));camera.lookAt(center);renderer.render(scene,camera);
    scene.remove(object);
    return renderer.domElement.toDataURL('image/png');
  } catch { return null; }
}

function renderThumbnail(source: PrefabDef | ScenePrefabAsset, props?: Record<string, unknown>): string | null {
  const object='objects' in source?buildAssetPreview(source):instantiatePrefab(source.id,props??{});
  const data=renderObjectThumbnail(object);disposeObject(object);return data;
}

/** `props` overlays the def's defaults — the prefab editor's node list passes
 * each node's authored props so its thumbnail matches the node. Renders are
 * cached per source digest: an authored asset recompiles when its objects or
 * revision change, a compiled def when its id/props change — never per mount. */
export function PrefabThumbnail({ source, fallback, props }: { source: PrefabDef | ScenePrefabAsset; fallback:string; props?: Record<string, unknown> }) {
  const key='objects' in source?`scenePrefab:${source.id}`:`prefab:${source.id}`;
  const digest=thumbnailDigest('objects' in source?[source.id,source.revision,source.objects,props]:[source.id,props]);
  const image=useThumbnail(key,digest,()=>renderThumbnail(source,props));
  return image?<img className="sc-prefab-thumbnail" alt="" src={image}/>:<span className="sc-prefab-icon" aria-hidden="true">{fallback}</span>;
}

/** The scene prefab a content definition places when dragged into the view.
 * An explicit `data.prefab` wins; npc/poi/item fall back to their Gameplay
 * stand-ins and carry the matching gameplay component. Returns null for
 * types with no world representation (abilities, quests, …). */
function placementFor(definition: ContentDefinition, knownPrefab: (id: string) => boolean): PlacementPayload | null {
  const name = definition.name || definition.id;
  const components =
    definition.type === 'npc'
      ? normalizeComponents({ npc: { archetype: definition.id, level: Number(definition.data.level) || 1 } })
      : definition.type === 'poi'
        ? normalizeComponents({ poi: poiComponent(definition), ...(definition.data.storage ? { storage: { label: name } } : {}) })
        : definition.type === 'item'
          ? normalizeComponents({ item: { itemId: String(definition.data.itemId ?? '') || definition.id, quantity: Math.max(1, Number(definition.data.quantity) || 1) } })
          : undefined;
  // Effects place on the empty prefab — the VFX itself is the visual.
  const fallback = definition.type === 'npc' ? 'npc' : definition.type === 'item' ? 'item'
    : definition.type === 'poi' ? (definition.data.storage ? 'storage' : 'poi')
    : definition.type === 'effect' ? 'empty' : '';
  const prefab = String(definition.data.prefab ?? '') || fallback;
  if (!prefab || !knownPrefab(prefab)) return null;
  // Authored assets instantiate their own subtree — that IS the record's
  // presentation. For compiled defs the generic mesh is a stand-in, so the
  // object records the content id and the scene view swaps in the record's
  // real presentation (rig, VFX, …) once built.
  const content = PREFAB_BY_ID.has(prefab) ? definition.id : undefined;
  return { prefab, name, components, content };
}

function poiComponent(definition: ContentDefinition): Record<string, unknown> {
  const legacy = String(definition.data.legacyKind ?? '');
  const poi: Record<string, unknown> = { label: definition.name || definition.id, interactionRadius: Number(definition.data.interactionRadius) || 2 };
  if (definition.data.teleportMap) { poi.type = 'portal'; poi.destinationMap = String(definition.data.teleportMap); }
  else if (definition.data.storage) poi.type = 'storage';
  else if (['save_point', 'job_changer', 'portal', 'camp', 'storage'].includes(legacy)) poi.type = legacy;
  return poi;
}

/** Prefab library — the original Project body: category folders on the left,
 * authored assets + built-in defs as draggable cards on the right. */
function PrefabBrowser({ onEdit, store }: { onEdit: (target: { assetId?: string; defId?: string }) => void; store:SceneStore }) {
  const assets=useSceneStore(store,s=>s.doc.prefabs);
  const [category, setCategory] = useState<PrefabDef["category"] | "All">("All");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const shown = PREFABS.filter(p => (category === "All" || p.category === category) && (!query || p.label.toLowerCase().includes(query) || p.id.includes(query)));
  return (
    <div className="sc-project-body">
      <nav className="sc-project-folders" aria-label="Prefab categories">
        {(["All", ...CATEGORIES] as const).map(c => (
          <button key={c} className={`ed-tree-item ${category === c ? "selected" : ""}`} onClick={() => setCategory(c)}>
            <span className="ed-asset-icon">{c === "All" ? "▤" : ICONS[c]}</span>{c}
          </button>
        ))}
      </nav>
      <PaneHandle axis="x" target="prev" id="sc:folders" min={70}/>
      <div className="sc-project-main">
        <div className="ed-project-path"><span>Assets / Prefabs{category !== "All" ? ` / ${category}` : ""}</span><input aria-label="Search prefabs" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="sc-prefab-grid">
          {assets.filter(p=>(category==='All'||category==='Gameplay')&&(!query||p.name.toLowerCase().includes(query)||p.kind.includes(query))).map(p=><button key={p.id} className="sc-prefab-card" draggable title={`${p.name} (${p.kind}) · revision ${p.revision} — click to edit, drag to instantiate`} onDragStart={e=>{e.dataTransfer.setData(PREFAB_MIME,p.id);e.dataTransfer.effectAllowed='copy';}} onClick={()=>onEdit({assetId:p.id})}><PrefabThumbnail source={p} fallback="◆"/><span className="sc-prefab-label">{p.name}</span><small>{p.kind} prefab</small></button>)}
          {shown.map(p => (
            <button
              key={p.id}
              className="sc-prefab-card"
              title={`${p.label} — click to edit, drag into the scene to place`}
              draggable
              onDragStart={e => { e.dataTransfer.setData(PREFAB_MIME, p.id); e.dataTransfer.effectAllowed = "copy"; }}
              onClick={() => onEdit({ defId: p.id })}
            >
              <PrefabThumbnail source={p} fallback={ICONS[p.category]} />
              <span className="sc-prefab-label">{p.label}</span>
            </button>
          ))}
          {!shown.length && <p className="ed-empty">No prefabs match</p>}
        </div>
      </div>
    </div>
  );
}

/** Content browser — the gameplay library's type list as the explorer's side
 * panel. World-placeable assets (npc/poi/item/prefab) drag into the scene;
 * the rest are browsed here and edited in the Content workspace. */
function ContentBrowser({ store }: { store: SceneStore }) {
  const assets = useSceneStore(store, s => s.doc.prefabs);
  const [doc] = useState(loadContent);
  const [type, setType] = useState<ContentType>('npc');
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const knownPrefab = (id: string) => PREFAB_BY_ID.has(id) || assets.some(p => p.id === id);
  const items = doc.definitions.filter(d => d.type === type && (!query || `${d.name} ${d.id}`.toLowerCase().includes(query)));
  const schema = getContentTypeSchema(type);
  return (
    <div className="sc-project-body">
      <nav className="sc-project-folders" aria-label="Content types">
        {TYPES.map(s => (
          <button key={s.type} className={`ed-tree-item ${type === s.type ? "selected" : ""}`} onClick={() => setType(s.type)}>
            <span className="ed-asset-icon" style={{ color: s.color }}>{s.icon}</span>{s.label}
          </button>
        ))}
      </nav>
      <PaneHandle axis="x" target="prev" id="sc:content-types" min={70}/>
      <div className="sc-project-main">
        <div className="ed-project-path"><span>Assets / Content / {schema.label}</span><input aria-label="Search content" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="sc-prefab-grid">
          {items.map(d => {
            const placement = placementFor(d, knownPrefab);
            return (
              <button
                key={d.id}
                className="sc-prefab-card"
                title={placement ? `${d.name || d.id} — drag into the scene to place` : `${d.name || d.id} — not placeable; edit in the Content workspace`}
                draggable={!!placement}
                onDragStart={e => { if (placement) { e.dataTransfer.setData(PLACEMENT_MIME, JSON.stringify(placement)); e.dataTransfer.effectAllowed = "copy"; } }}
              >
                {d.thumbnail ? <img className="sc-prefab-thumbnail" alt="" src={d.thumbnail}/> : <span className="sc-prefab-icon" style={{ color: schema.color }} aria-hidden="true">{schema.icon}</span>}
                <span className="sc-prefab-label">{d.name || d.id}</span>
              </button>
            );
          })}
          {!items.length && <p className="ed-empty">No {schema.label.toLowerCase()} match</p>}
        </div>
      </div>
    </div>
  );
}

/** Unity-style Project panel: the asset explorer. Tabs swap between the
 * scene prefab library and the gameplay content library; either way the
 * left rail is the explorer's own side panel. */
export function SceneProject({ onEdit, store }: { onEdit: (target: { assetId?: string; defId?: string }) => void; store:SceneStore }) {
  const [tab, setTab] = useState<'prefabs' | 'content'>('prefabs');
  return (
    <div className="ed-project sc-project">
      <div className="ed-dock-title"><div className="ed-view-tabs">
        <button className={tab === 'prefabs' ? "active" : ""} onClick={() => setTab('prefabs')}>Prefabs</button>
        <button className={tab === 'content' ? "active" : ""} onClick={() => setTab('content')}>Content</button>
      </div></div>
      {tab === 'prefabs' ? <PrefabBrowser onEdit={onEdit} store={store} /> : <ContentBrowser store={store} />}
    </div>
  );
}
