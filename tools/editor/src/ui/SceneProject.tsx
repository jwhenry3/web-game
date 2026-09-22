import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { disposeObject } from "../../../../wails/frontend/src/three/terrain";
import { instantiatePrefab, PREFABS, type PrefabDef } from "../../../../wails/frontend/src/three/prefabs";
import type { ScenePrefabAsset } from "../../../../wails/frontend/src/three/scene3d";
import { PREFAB_MIME } from "../scene3d/SceneView";
import { useSceneStore, type SceneStore } from '../scene3d/store';

const ICONS: Record<PrefabDef["category"], string> = { Buildings: "⌂", Nature: "❦", Landmarks: "✦", Primitives: "◼", Lights: "☼", Utility: "◇", Gameplay:'♟' };
const CATEGORIES = [...new Set(PREFABS.map(p => p.category))];
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
 * WebGL context for every Project card. */
function renderThumbnail(source: PrefabDef | ScenePrefabAsset): string | null {
  try {
    const renderer=thumbnailRenderer??=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(96,72,false);renderer.setPixelRatio(1);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x3b3d40);
    scene.add(new THREE.HemisphereLight(0xffffff,0x30343a,2.2));const key=new THREE.DirectionalLight(0xffe1b0,2.4);key.position.set(3,5,4);scene.add(key);
    const object='objects' in source?buildAssetPreview(source):instantiatePrefab(source.id,{});scene.add(object);
    object.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3()),size=Math.max(.5,box.getSize(new THREE.Vector3()).length());
    const camera=new THREE.PerspectiveCamera(30,4/3,.01,1000);camera.position.copy(center).add(new THREE.Vector3(size*.75,size*.55,size*.9));camera.lookAt(center);renderer.render(scene,camera);
    const data=renderer.domElement.toDataURL('image/png');disposeObject(object);return data;
  } catch { return null; }
}

function PrefabThumbnail({ source, fallback }: { source: PrefabDef | ScenePrefabAsset; fallback:string }) {
  const [image,setImage]=useState<string|null>(null), mounted=useRef(true);
  useEffect(()=>{mounted.current=true;const frame=requestAnimationFrame(()=>{const value=renderThumbnail(source);if(mounted.current)setImage(value);});return()=>{mounted.current=false;cancelAnimationFrame(frame);};},[source]);
  return image?<img className="sc-prefab-thumbnail" alt="" src={image}/>:<span className="sc-prefab-icon" aria-hidden="true">{fallback}</span>;
}

/** Unity-style Project panel: the prefab library. Click a card to open the
 * prefab editor; drag a card into the Scene view to place it under the
 * cursor. */
export function SceneProject({ onEdit, store }: { onEdit: (target: { assetId?: string; defId?: string }) => void; store:SceneStore }) {
  const assets=useSceneStore(store,s=>s.doc.prefabs);
  const [category, setCategory] = useState<PrefabDef["category"] | "All">("All");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const shown = PREFABS.filter(p => (category === "All" || p.category === category) && (!query || p.label.toLowerCase().includes(query) || p.id.includes(query)));
  return (
    <div className="ed-project sc-project">
      <div className="ed-dock-title">Project <span>Prefabs</span></div>
      <div className="sc-project-body">
        <nav className="sc-project-folders" aria-label="Prefab categories">
          {(["All", ...CATEGORIES] as const).map(c => (
            <button key={c} className={`ed-tree-item ${category === c ? "selected" : ""}`} onClick={() => setCategory(c)}>
              <span className="ed-asset-icon">{c === "All" ? "▤" : ICONS[c]}</span>{c}
            </button>
          ))}
        </nav>
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
    </div>
  );
}
