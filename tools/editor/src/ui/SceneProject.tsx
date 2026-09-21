import { useState } from "react";
import { PREFABS, type PrefabDef } from "../../../../wails/frontend/src/three/prefabs";
import { PREFAB_MIME } from "../scene3d/SceneView";
import { useSceneStore, type SceneStore } from '../scene3d/store';

const ICONS: Record<PrefabDef["category"], string> = { Buildings: "⌂", Nature: "❦", Landmarks: "✦", Primitives: "◼", Lights: "☼", Utility: "◇", Gameplay:'♟' };
const CATEGORIES = [...new Set(PREFABS.map(p => p.category))];

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
            {assets.filter(p=>(category==='All'||category==='Gameplay')&&(!query||p.name.toLowerCase().includes(query)||p.kind.includes(query))).map(p=><button key={p.id} className="sc-prefab-card" draggable title={`${p.name} (${p.kind}) · revision ${p.revision} — click to edit, drag to instantiate`} onDragStart={e=>{e.dataTransfer.setData(PREFAB_MIME,p.id);e.dataTransfer.effectAllowed='copy';}} onClick={()=>onEdit({assetId:p.id})}><span className="sc-prefab-icon">◆</span><span className="sc-prefab-label">{p.name}</span><small>{p.kind} prefab</small></button>)}
            {shown.map(p => (
              <button
                key={p.id}
                className="sc-prefab-card"
                title={`${p.label} — click to edit, drag into the scene to place`}
                draggable
                onDragStart={e => { e.dataTransfer.setData(PREFAB_MIME, p.id); e.dataTransfer.effectAllowed = "copy"; }}
                onClick={() => onEdit({ defId: p.id })}
              >
                <span className="sc-prefab-icon" aria-hidden="true">{ICONS[p.category]}</span>
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
