import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emptyScene, type SceneComponents } from "../../../../wails/frontend/src/three/scene3d";
import type { MapSnapshot } from "../../../../wails/frontend/src/net/wire.gen";
import { downloadScene, listSceneMaps, loadMapSnapshot, pickSceneFile, loadScene, saveScene, loginSceneEditor, hasEditorSession, type SceneMapInfo } from "../scene3d/api";
import { SceneStore, useSceneStore, type Tool } from "../scene3d/store";
import { SceneView } from "../scene3d/SceneView";
import { SceneHierarchy } from "../ui/SceneHierarchy";
import { SceneInspector } from "../ui/SceneInspector";
import { SceneProject } from "../ui/SceneProject";
import { PrefabEditor } from "../ui/PrefabEditor";
import { TerrainInspector, useTerrainMode } from "../ui/SceneTerrain";
import { PaneHandle } from "../ui/PaneHandle";
import "./effects.css";
import "./scene.css";

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: "view", label: "View (Q)", key: "Q", icon: "✋" },
  { id: "move", label: "Move (W)", key: "W", icon: "✢" },
  { id: "rotate", label: "Rotate (E)", key: "E", icon: "↻" },
  { id: "scale", label: "Scale (R)", key: "R", icon: "⤢" },
];

function mapFromUrl(): string { return new URLSearchParams(location.search).get("map") ?? ""; }

/** Unity-modelled world scene editor: Hierarchy on the left, Scene view
 * centre, asset explorer (prefabs + content) docked below, Inspector right.
 * Terrain streams from the game server; the authored layer is a Scene3DDoc
 * saved as <map>.scene3d.json. Selecting the terrain (viewport click or the
 * Hierarchy row) swaps the Inspector to the terrain brush tools. */
export default function SceneWorkspace() {
  const [maps, setMaps] = useState<SceneMapInfo[]>([]);
  const [mapId, setMapId] = useState(mapFromUrl);
  const [snapshot, setSnapshot] = useState<MapSnapshot | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy,setBusy]=useState(false);
  const [signIn,setSignIn]=useState(false);
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [authenticated,setAuthenticated]=useState(hasEditorSession);
  const [view,setView]=useState<SceneView|null>(null);
  const [prefabEditor,setPrefabEditor]=useState<{assetId?:string;defId?:string}|null>(null);
  const store = useMemo(() => new SceneStore(mapId), [mapId]);
  const terrainSelected = useSceneStore(store, s => s.terrainSelected);
  const terrainMode = useTerrainMode(view, store, terrainSelected);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SceneView | null>(null);

  useEffect(() => {
    listSceneMaps().then(list => {
      setMaps(list);
      if (!list.length) throw new Error("The game server has no maps enabled.");
      if (!list.some(m => m.id === mapId)) setMapId(list.find(m => m.id === "clara_mundi")?.id ?? list[0].id);
    }).catch(e => setError(`${e instanceof Error ? e.message : e}. Start the game server (npm run server:dev) and reload.`));
  }, []);

  useEffect(() => {
    if (!mapId) return;
    const q = new URLSearchParams(location.search); q.set("map", mapId); history.replaceState(null, "", `?${q}`);
    setSnapshot(null); setError("");
    let cancelled=false;
    loadMapSnapshot(mapId).then(value=>{if(!cancelled)setSnapshot(value);}).catch(e => {if(!cancelled)setError(`Could not load map '${mapId}': ${e instanceof Error ? e.message : e}`);});
    // A browser autosave is a recovery draft; never replace it silently.
    if(!localStorage.getItem(`scene3d:${mapId}`)) loadScene(mapId).then(doc=>{if(!cancelled&&!store.getState().dirty)store.replaceDoc(doc);}).catch(e=>{if(!cancelled)setStatus(`Scene load failed: ${e instanceof Error?e.message:e}`);});
    else setStatus('Recovered browser draft. Load server to replace it with the saved scene.');
    return ()=>{cancelled=true;};
  }, [mapId]);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new SceneView(hostRef.current, store);
    viewRef.current = view;
    setView(view);
    return () => { view.dispose(); viewRef.current = null; };
  }, [store]);

  useEffect(() => { if (snapshot && viewRef.current) viewRef.current.loadMap(snapshot); }, [snapshot, store]);

  const tool = useSceneStore(store, s => s.tool);
  const space = useSceneStore(store, s => s.space);
  const snap = useSceneStore(store, s => s.snap);
  const snapMove = useSceneStore(store, s => s.snapMove);
  const snapRotate = useSceneStore(store, s => s.snapRotate);
  const snapScale = useSceneStore(store, s => s.snapScale);
  const layers = useSceneStore(store, s => s.layers);
  const dropToSurface = useSceneStore(store, s => s.dropToSurface);
  const dirty = useSceneStore(store, s => s.dirty);
  const canUndo = useSceneStore(store, s => s.canUndo);
  const canRedo = useSceneStore(store, s => s.canRedo);
  const selection = useSceneStore(store, s => s.selection);
  const objectCount = useSceneStore(store, s => s.doc.objects.length);

  const flash = useCallback((msg: string) => { setStatus(msg); window.setTimeout(() => setStatus(s => (s === msg ? "" : s)), 2500); }, []);
  const addPrefab = (prefab: string, overrides?: { name?: string; props?: Record<string, unknown>; components?: SceneComponents }) => { const at = viewRef.current?.placementPoint() ?? [0, 0, 0]; store.addObject(prefab, at, null, overrides); };
  const doExport = () => { downloadScene(store.getState().doc); flash("Exported scene JSON (server unchanged)"); };
  const doSave=async()=>{setBusy(true);const doc=store.getState().doc;try{await saveScene(doc);if(store.getState().doc===doc)store.markSaved();flash('Scene saved to the game server');}catch(e){setStatus(`Save failed: ${e instanceof Error?e.message:e}`);}finally{setBusy(false);}};
  const doLoad=async()=>{if(dirty&&!confirm('Replace the browser draft with the saved server scene?'))return;setBusy(true);try{store.replaceDoc(await loadScene(mapId,authenticated));flash('Loaded server scene');}catch(e){setStatus(`Load failed: ${e instanceof Error?e.message:e}`);}finally{setBusy(false);}};
  const doImport = async () => {
    const doc = await pickSceneFile(mapId);
    if (!doc) return;
    if (doc.map !== mapId && !confirm(`This scene was authored for map '${doc.map}'. Load it over '${mapId}' anyway?`)) return;
    store.replaceDoc({ ...doc, map: mapId }, true); flash(`Imported ${doc.objects.length} objects`);
  };
  const doNew = () => { if (confirm("Clear scene objects, prefab assets and terrain edits? You can undo this change.")) store.update(doc=>Object.assign(doc,emptyScene(mapId))); };
  const groundHeight = useCallback((x: number, z: number) => viewRef.current?.groundHeight(x, z) ?? 0, []);

  return (
    <>
      <div className="ed-toolbar sc-toolbar">
        <span className="ed-toolbar-label">Map</span>
        <select aria-label="Map" value={mapId} disabled={!maps.length||busy} onChange={e => setMapId(e.target.value)}>
          {maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <span className="sc-sep" />
        <div className="sc-tools" role="radiogroup" aria-label="Transform tool">
          {TOOLS.map(t => <button key={t.id} role="radio" aria-checked={tool === t.id} className={tool === t.id ? "active" : ""} title={t.label} onClick={() => store.setTool(t.id)}>{t.icon}<small>{t.key}</small></button>)}
        </div>
        <button title="Toggle world/local handles (X)" onClick={() => store.setSpace(space === "world" ? "local" : "world")}>{space === "world" ? "🌐 Global" : "⬚ Local"}</button>
        <span className="sc-sep" />
        <label className="sc-check"><input type="checkbox" checked={snap} onChange={e => store.setSnap({ snap: e.target.checked })} />Snap</label>
        <label className="sc-snap">Move<input type="number" aria-label="Move snap" step={.25} min={.05} value={snapMove} onChange={e => store.setSnap({ snapMove: Math.max(.01, +e.target.value || .5) })} /></label>
        <label className="sc-snap">Rot<input type="number" aria-label="Rotate snap" step={5} min={1} value={snapRotate} onChange={e => store.setSnap({ snapRotate: Math.max(1, +e.target.value || 15) })} /></label>
        <label className="sc-snap">Scale<input type="number" aria-label="Scale snap" step={.05} min={.01} value={snapScale} onChange={e => store.setSnap({ snapScale: Math.max(.01, +e.target.value || .1) })} /></label>
        <span className="sc-sep" />
        <button disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={() => store.undo()}>↶</button>
        <button disabled={!canRedo} title="Redo (Ctrl+Y)" onClick={() => store.redo()}>↷</button>
        <button disabled={!selection.length} title="Duplicate (Ctrl+D)" onClick={() => store.duplicateSelected()}>⧉</button>
        <button disabled={!selection.length} title="Delete (Del)" onClick={() => store.deleteSelected()}>🗑</button>
        <button disabled={!selection.length} title="Drop selection onto the terrain or closest collider below" onClick={() => viewRef.current?.dropSelected()}>⤓</button>
        <button title="Frame selection (F)" onClick={() => store.requestFrame()}>⌖</button>
        <span className="spacer" />
        <button onClick={doNew}>New</button>
        <button onClick={()=>setSignIn(!signIn)}>{authenticated?'Admin session':'Admin sign in'}</button>
        <button disabled={busy||!mapId} onClick={()=>void doLoad()}>Load server</button>
        <button className="primary" disabled={busy||!mapId} onClick={()=>void doSave()}>Save server</button>
        <button onClick={() => void doImport()}>Import…</button>
        <button className="primary" onClick={doExport}>Export JSON</button>
      </div>
      {signIn&&<form className="ed-toolbar" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await loginSceneEditor(username,password);setPassword('');setSignIn(false);setAuthenticated(true);flash('Administrator signed in');}catch(e){setStatus(`Sign in failed: ${e instanceof Error?e.message:e}`);}finally{setBusy(false);}}}><label>Administrator <input aria-label="Administrator username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></label><input aria-label="Administrator password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/><button disabled={busy} type="submit">Sign in</button></form>}
      <div className="ed-main">
        <aside className="ed-hierarchy sc-left">
          <SceneHierarchy store={store} />
        </aside>
        <PaneHandle axis="x" target="prev" id="ed:hierarchy"/>
        <section className="ed-scene">
          <div className="ed-dock-title">
            <div className="ed-view-tabs">
              <button className="active">Scene</button>
            </div>
            <span>{snapshot?.name ?? (error ? "offline" : "loading…")}</span>
          </div>
          <div className="ed-scene-toolbar">
            {(["terrain", "stamps", "grid", "fog"] as const).map(k => <button key={k} aria-pressed={layers[k]} onClick={() => store.setLayer(k, !layers[k])}>{k === "terrain" ? "Terrain" : k === "stamps" ? "2D stamps" : k === "grid" ? "Grid" : "Fog"}</button>)}
            <button aria-pressed={dropToSurface} title="Newly placed prefabs drop onto the terrain or closest collider below the cursor" onClick={() => store.setDropToSurface(!dropToSurface)}>Surface drop</button>
            <span className="spacer" />
            <span>{TOOLS.find(t => t.id === tool)?.label} · {space}</span>
          </div>
          <div className="ed-viewport sc-viewport" ref={hostRef}>
            {!snapshot && !error && <div className="sc-overlay">Loading terrain…</div>}
            {error && <div className="sc-overlay sc-error" role="alert"><strong>Scene view unavailable</strong><p>{error}</p></div>}
          </div>
          <PaneHandle axis="y" target="next" id="ed:project"/><SceneProject onEdit={setPrefabEditor} store={store} />
          {prefabEditor && (
            <PrefabEditor
              key={prefabEditor.assetId ?? prefabEditor.defId}
              store={store}
              assetId={prefabEditor.assetId}
              defId={prefabEditor.defId}
              onClose={() => setPrefabEditor(null)}
              onPlace={(id, overrides) => addPrefab(id, overrides)}
              onOpenAsset={id => setPrefabEditor({ assetId: id })}
            />
          )}
          <div className="ed-scene-footer"><span><b>RMB</b> look · <b>WASD/QE</b> fly · <b>MMB</b> pan · <b>Alt+LMB</b> orbit · <b>Wheel</b> zoom · <b>F</b> frame{terrainSelected ? <> · <b>LMB</b> paint brush</> : <> · <b>Shift+click</b> multi-select</>}</span><span>{terrainSelected ? "Terrain selected" : selection.length ? `${selection.length} selected` : "Nothing selected"}</span></div>
        </section>
        <PaneHandle axis="x" target="next" id="ed:inspector"/>
        <div className="ed-side sc-side">
          {terrainSelected ? <TerrainInspector st={terrainMode} store={store} /> : <SceneInspector store={store} groundHeight={groundHeight} />}
        </div>
      </div>
      <footer className="ed-statusbar"><span className={dirty ? "dirty" : "ed-ready"}>●</span><span role="status">{status || (dirty ? "Unsaved server changes (browser recovery draft saved)" : "Ready")}</span><span className="spacer" /><span>{objectCount} objects</span><span>{mapId}{dirty ? " *" : ""}</span></footer>
    </>
  );
}
