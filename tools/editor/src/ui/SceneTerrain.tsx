import { useEffect, useRef, useState } from "react";
import {
  emptyTerrain,
  paintSurfaceSwatch,
  surfaceStyle,
  SURFACE_DEFAULTS,
  type SurfaceStyle,
  type TerrainBrush,
} from "../../../../wails/frontend/src/three/terrainEditing";
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
 * `terrain` layer via the store (one undo step per stroke). Surface styles
 * (`terrain.paints`) drive both the swatch previews and the 3D renderer. */
export function useTerrainMode(view: SceneView | null, store: SceneStore, active: boolean) {
  const [brush, setBrush] = useState<TerrainBrush>({ mode: "raise", radius: 96, strength: 48, height: 16, cell: "." });
  const paints = useSceneStore(store, s => s.doc.terrain?.paints);
  useEffect(() => {
    if (!active) return;
    view?.setTerrainBrush(brush);
    return () => view?.setTerrainBrush(null);
  }, [view, store, active, brush]);
  const patch = (values: Partial<TerrainBrush>) => setBrush(current => ({ ...current, ...values }));
  const clearHeights = () => store.update(doc => { doc.terrain = { ...(doc.terrain ?? emptyTerrain()), heights: {} }; });
  const clearCells = () => store.update(doc => { doc.terrain = { ...(doc.terrain ?? emptyTerrain()), cells: {} }; });
  const clearAll = () => store.update(doc => { doc.terrain = emptyTerrain(); });
  /** Author one surface's texture — `patch: null` resets it to the built-in
   * default. Styles are complete objects so the server's struct round-trip
   * preserves explicit zeros. */
  const setPaint = (cell: string, patch: Partial<SurfaceStyle> | null) =>
    store.update(doc => {
      const terrain = { ...(doc.terrain ?? emptyTerrain()) };
      const paints = { ...(terrain.paints ?? {}) };
      if (patch === null) delete paints[cell];
      else paints[cell] = { ...(SURFACE_DEFAULTS[cell] ?? SURFACE_DEFAULTS["."]), ...(paints[cell] ?? {}), ...patch };
      terrain.paints = Object.keys(paints).length ? paints : undefined;
      doc.terrain = terrain;
    });
  return { brush, patch, paints, setPaint, clearHeights, clearCells, clearAll };
}

export type TerrainMode = ReturnType<typeof useTerrainMode>;

// --- inspector ------------------------------------------------------------------

/** Texture preview swatch — renders the surface's actual 3D appearance
 * (base color + noise variation + prop marks) via paintSurfaceSwatch. */
function Swatch({ cell, label, st }: { cell: string; label: string; st: TerrainMode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) paintSurfaceSwatch(ref.current, cell, st.paints);
  }, [cell, st.paints]);
  const customized = !!st.paints?.[cell];
  return (
    <button
      className={`sc-swatch ${st.brush.cell === cell ? "sel" : ""}`}
      title={`${label}${customized ? " · custom texture" : ""}`}
      onClick={() => st.patch({ cell })}
    >
      <canvas ref={ref} width={44} height={44} />
      <span>{label.split(" · ")[0]}{customized ? " ✎" : ""}</span>
    </button>
  );
}

/** Per-surface texture editor — tunes the selected paint's color, variation
 * and prop densities; saved into the scene doc and applied by the renderer. */
function TextureEditor({ st }: { st: TerrainMode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cell = st.brush.cell;
  const style = surfaceStyle(cell, st.paints);
  const customized = !!st.paints?.[cell];
  useEffect(() => {
    if (ref.current) paintSurfaceSwatch(ref.current, cell, st.paints);
  }, [cell, st.paints]);
  const set = (patch: Partial<SurfaceStyle>) => st.setPaint(cell, patch);
  const slider = (label: string, key: "noise" | "trees" | "rocks" | "grass", max = 1) => (
    <label className="sc-tex-field">
      <span>{label}</span>
      <input type="range" min={0} max={max} step={.02} value={style[key]}
        onChange={e => set({ [key]: Number(e.target.value) })} />
      <em>{style[key].toFixed(2)}</em>
    </label>
  );
  return (
    <div className="sc-tex">
      <div className="sc-tex-head">
        <h4>Texture · {(BIOMES.find(([v]) => v === cell)?.[1] ?? cell).split(" · ")[0]}</h4>
        <button disabled={!customized} title="Restore the built-in look" onClick={() => st.setPaint(cell, null)}>reset</button>
      </div>
      <div className="sc-tex-body">
        <canvas ref={ref} width={88} height={88} />
        <div className="sc-tex-controls">
          <label className="sc-tex-field">
            <span>color</span>
            <input type="color" value={style.color} onChange={e => set({ color: e.target.value })} />
          </label>
          {slider("variation", "noise", .6)}
          {slider("trees", "trees")}
          {slider("rocks", "rocks")}
          {slider("grass", "grass")}
        </div>
      </div>
    </div>
  );
}

export function TerrainInspector({ st, store }: { st: TerrainMode; store: SceneStore }) {
  const { brush, patch } = st;
  const terrain = useSceneStore(store, s => s.doc.terrain);
  const heights = Object.keys(terrain?.heights ?? {}).length;
  const cells = Object.keys(terrain?.cells ?? {}).length;
  const painted = Object.keys(terrain?.paints ?? {}).length;
  const active = BRUSHES.find(b => b.id === brush.mode)!;
  return (
    <>
      <div className="ed-dock-title">Inspector <span>Terrain</span></div>
      <div className="ed-panel sc-rig-panel" style={{ display: "grid", gap: 8, alignContent: "start" }}>
        <div className="sc-tex-label">Brushes</div>
        <div className="sc-brushes">
          {BRUSHES.map(b => (
            <button key={b.id} aria-pressed={brush.mode === b.id} title={b.hint} onClick={() => patch({ mode: b.id })}>
              {b.label}
            </button>
          ))}
        </div>
        <label style={{ display: "grid", gap: 4 }}>Radius · {brush.radius} map pixels
          <input aria-label="Terrain brush radius" type="range" min={16} max={512} step={8} value={brush.radius} onChange={e => patch({ radius: Number(e.target.value) })} />
        </label>
        {brush.mode !== "paint" && <label style={{ display: "grid", gap: 4 }}>Strength · {brush.strength} px/s
          <input aria-label="Terrain brush strength" type="range" min={4} max={256} step={4} value={brush.strength} onChange={e => patch({ strength: Number(e.target.value) })} />
        </label>}
        {brush.mode === "flatten" && <label style={{ display: "grid", gap: 4 }}>Target elevation · map pixels
          <input aria-label="Flatten elevation" type="number" min={-16384} max={16384} step={4} value={brush.height} onChange={e => patch({ height: Math.max(-16384, Math.min(16384, Number(e.target.value))) })} />
        </label>}
        {brush.mode === "paint" && (
          <>
            <div className="sc-tex-label">Surface and collision</div>
            <div className="sc-swatches">
              {BIOMES.map(([value, label]) => <Swatch key={value} cell={value} label={label} st={st} />)}
            </div>
            <TextureEditor st={st} />
          </>
        )}
        <div className="sc-tex-label">Authored layer</div>
        <div className="efx-field"><span>height vertices</span><span>{heights}</span></div>
        <div className="efx-field"><span>painted cells</span><span>{cells}</span></div>
        <div className="efx-field"><span>custom textures</span><span>{painted}</span></div>
        <div className="ed-row">
          <button disabled={!heights} title="Remove all sculpted elevation (undoable)" onClick={() => { if (confirm(`Clear ${heights} sculpted height vertices?`)) st.clearHeights(); }}>Clear heights</button>
          <button disabled={!cells} title="Remove all painted surface cells (undoable)" onClick={() => { if (confirm(`Clear ${cells} painted cells?`)) st.clearCells(); }}>Clear cells</button>
        </div>
        <div className="ed-row">
          <button disabled={!heights && !cells && !painted} title="Reset the whole authored terrain layer (undoable)" onClick={() => { if (confirm("Clear all terrain edits (heights + painted cells + textures)?")) st.clearAll(); }}>Reset terrain</button>
        </div>
        <p style={{ margin: 0, color: "#bbb", fontSize: 11, lineHeight: 1.5 }}>
          {active.hint}. Drag on the terrain to apply — each stroke is one undo
          step. Elevation, surfaces and textures are saved with this map’s scene.
        </p>
      </div>
      <div className="ed-statusbar sc-rig-status"><span>Select an object in the Scene or Hierarchy to edit it</span></div>
    </>
  );
}
