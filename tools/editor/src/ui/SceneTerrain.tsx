import { useEffect, useState } from "react";
import { emptyTerrain, type TerrainBrush } from "../../../../wails/frontend/src/three/terrainEditing";
import type { SceneView } from "../scene3d/SceneView";
import { useSceneStore, type SceneStore } from "../scene3d/store";

const BIOMES = [
  [".", "Grass · walkable"], [",", "Meadow · walkable"], ["T", "Forest · walkable"],
  ["H", "Settlement · walkable"], ["R", "Road · walkable"], ["S", "Snow · walkable"],
  ["D", "Sand · walkable"], ["I", "Ice · walkable"], ["#", "Rock · blocked"], ["~", "Water · blocked"],
] as const;

const BRUSHES: { id: TerrainBrush["mode"]; label: string; hint: string }[] = [
  { id: "raise", label: "Raise", hint: "Lift terrain under the cursor" },
  { id: "lower", label: "Lower", hint: "Sink terrain under the cursor" },
  { id: "flatten", label: "Flatten", hint: "Pull terrain toward a target elevation" },
  { id: "smooth", label: "Smooth", hint: "Blend vertices toward their neighbours" },
  { id: "paint", label: "Paint", hint: "Paint surface type and walkability" },
];

/** Shared state for the Scene workspace's Terrain mode: the active brush is
 * pushed into SceneView while the tab is active; strokes write into the doc's
 * `terrain` layer via the store (one undo step per stroke). */
export function useTerrainMode(view: SceneView | null, store: SceneStore, active: boolean) {
  const [brush, setBrush] = useState<TerrainBrush>({ mode: "raise", radius: 96, strength: 48, height: 16, cell: "." });
  useEffect(() => {
    if (!active) return;
    view?.setTerrainBrush(brush);
    return () => view?.setTerrainBrush(null);
  }, [view, store, active, brush]);
  const patch = (values: Partial<TerrainBrush>) => setBrush(current => ({ ...current, ...values }));
  const clearHeights = () => store.update(doc => { doc.terrain = { ...(doc.terrain ?? emptyTerrain()), heights: {} }; });
  const clearCells = () => store.update(doc => { doc.terrain = { ...(doc.terrain ?? emptyTerrain()), cells: {} }; });
  const clearAll = () => store.update(doc => { doc.terrain = emptyTerrain(); });
  return { brush, patch, clearHeights, clearCells, clearAll };
}

export type TerrainMode = ReturnType<typeof useTerrainMode>;

// --- left column ---------------------------------------------------------------

export function TerrainLibrary({ st, store }: { st: TerrainMode; store: SceneStore }) {
  const terrain = useSceneStore(store, s => s.doc.terrain);
  const heights = Object.keys(terrain?.heights ?? {}).length;
  const cells = Object.keys(terrain?.cells ?? {}).length;
  return (
    <>
      <div className="ed-dock-title">Brushes <span>{BRUSHES.length}</span></div>
      <div className="ed-list">
        {BRUSHES.map(b => (
          <button key={b.id} className={`item ${st.brush.mode === b.id ? "sel" : ""}`} title={b.hint} onClick={() => st.patch({ mode: b.id })}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="ed-dock-title">Authored layer</div>
      <div className="sc-preview-controls">
        <div className="efx-field"><span>height vertices</span><span>{heights}</span></div>
        <div className="efx-field"><span>painted cells</span><span>{cells}</span></div>
      </div>
      <div className="sc-lib-actions">
        <button disabled={!heights} title="Remove all sculpted elevation (undoable)" onClick={() => { if (confirm(`Clear ${heights} sculpted height vertices?`)) st.clearHeights(); }}>Clear heights</button>
        <button disabled={!cells} title="Remove all painted surface cells (undoable)" onClick={() => { if (confirm(`Clear ${cells} painted cells?`)) st.clearCells(); }}>Clear cells</button>
      </div>
      <div className="sc-lib-actions">
        <button disabled={!heights && !cells} title="Reset the whole authored terrain layer (undoable)" onClick={() => { if (confirm("Clear all terrain edits (heights + painted cells)?")) st.clearAll(); }}>Reset terrain</button>
      </div>
    </>
  );
}

// --- right column ---------------------------------------------------------------

export function TerrainInspector({ st }: { st: TerrainMode }) {
  const { brush, patch } = st;
  const active = BRUSHES.find(b => b.id === brush.mode)!;
  return (
    <>
      <div className="sc-inspector-head">
        <h3>Terrain <span className="dim">({active.label})</span></h3>
      </div>
      <div className="ed-panel sc-rig-panel" style={{ display: "grid", gap: 8 }}>
        <label style={{ display: "grid", gap: 4 }}>Radius · {brush.radius} map pixels
          <input aria-label="Terrain brush radius" type="range" min={16} max={512} step={8} value={brush.radius} onChange={e => patch({ radius: Number(e.target.value) })} />
        </label>
        {brush.mode !== "paint" && <label style={{ display: "grid", gap: 4 }}>Strength · {brush.strength} px/s
          <input aria-label="Terrain brush strength" type="range" min={4} max={256} step={4} value={brush.strength} onChange={e => patch({ strength: Number(e.target.value) })} />
        </label>}
        {brush.mode === "flatten" && <label style={{ display: "grid", gap: 4 }}>Target elevation · map pixels
          <input aria-label="Flatten elevation" type="number" min={-16384} max={16384} step={4} value={brush.height} onChange={e => patch({ height: Math.max(-16384, Math.min(16384, Number(e.target.value))) })} />
        </label>}
        {brush.mode === "paint" && <label style={{ display: "grid", gap: 4 }}>Surface and collision
          <select aria-label="Terrain biome" value={brush.cell} onChange={e => patch({ cell: e.target.value })}>
            {BIOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>}
        <p style={{ margin: 0, color: "#bbb", fontSize: 11, lineHeight: 1.5 }}>
          {active.hint}. Drag on the terrain to apply — each stroke is one undo
          step. Elevation and surfaces are saved with this map’s scene.
        </p>
      </div>
      <div className="ed-statusbar sc-rig-status"><span>Switch to the Prefabs tab to select objects</span></div>
    </>
  );
}
