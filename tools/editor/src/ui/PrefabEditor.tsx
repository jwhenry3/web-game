import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { instantiatePrefab, PREFABS, PREFAB_BY_ID, prefabDefaults } from "../../../../wails/frontend/src/three/prefabs";
import { disposeObject } from "../../../../wails/frontend/src/three/terrain";
import { newObjectId, type PrefabKind, type SceneComponents, type SceneObject, type SceneTransform } from "../../../../wails/frontend/src/three/scene3d";
import { useSceneStore, type SceneStore } from "../scene3d/store";
import { PaneHandle } from "./PaneHandle";
import "../workspaces/scene.css";
import { ComponentsEditor, PropField, Section, Vec3Row } from "./SceneInspector";

const DEG = Math.PI / 180;
const isEditable = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable);

/** Minimal orbit/pick preview for the prefab editor. Mirrors SceneView's
 * signature-keyed instancing so prop edits rebuild only the changed node. */
class PrefabPreview {
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, .05, 500);
  private group = new THREE.Group();
  private instances = new Map<string, { object: THREE.Object3D; signature: string }>();
  private box: THREE.BoxHelper | null = null;
  private selectedId: string | null = null;
  private pivot = new THREE.Vector3(0, .5, 0);
  private yaw = .7;
  private pitch = .45;
  private distance = 8;
  private framed = false;
  private down = { x: 0, y: 0 };
  private orbiting = false;
  private raycaster = new THREE.Raycaster();
  private frame = 0;
  private resize: ResizeObserver;
  private disposed = false;
  onPick: (id: string | null) => void = () => {};

  constructor(private host: HTMLDivElement) {
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.domElement.tabIndex = 0;
    host.appendChild(r.domElement);
    const sun = new THREE.DirectionalLight(0xffe5b7, 2.4);
    sun.position.set(-8, 14, 7);
    sun.castShadow = true;
    this.scene.add(new THREE.HemisphereLight(0xc9e4ee, 0x716646, 2), sun, sun.target, new THREE.GridHelper(20, 20, 0x5a5a5a, 0x3c3c3c), this.group);
    this.scene.background = new THREE.Color(0x292929);
    this.resize = new ResizeObserver(this.onResize);
    this.resize.observe(host);
    this.onResize();
    const dom = r.domElement;
    dom.addEventListener("pointerdown", this.onDown);
    dom.addEventListener("pointermove", this.onMove);
    dom.addEventListener("pointerup", this.onUp);
    dom.addEventListener("pointercancel", this.onUp);
    dom.addEventListener("wheel", this.onWheel, { passive: false });
    dom.addEventListener("contextmenu", e => e.preventDefault());
    this.applyCamera();
    this.frame = requestAnimationFrame(this.tick);
  }

  setNodes(nodes: SceneObject[]) {
    const alive = new Set<string>();
    for (const n of nodes) {
      alive.add(n.id);
      const signature = `${n.prefab}|${JSON.stringify(n.props)}`;
      let inst = this.instances.get(n.id);
      if (inst && inst.signature !== signature) { this.detach(inst.object); inst = undefined; }
      if (!inst) {
        const object = instantiatePrefab(n.prefab, n.props);
        object.userData.nodeId = n.id;
        if (!object.children.length) object.add(Object.assign(new THREE.AxesHelper(.6), { userData: { editorOnly: true } }));
        inst = { object, signature };
        this.instances.set(n.id, inst);
      }
      const { position: p, rotation: r, scale: s } = n.transform;
      inst.object.position.set(p[0], p[1], p[2]);
      inst.object.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
      inst.object.scale.set(s[0], s[1], s[2]);
      inst.object.visible = n.visible;
    }
    for (const [id, inst] of this.instances) if (!alive.has(id)) { this.detach(inst.object); this.instances.delete(id); }
    for (const n of nodes) {
      const inst = this.instances.get(n.id)!;
      const parent = (n.parent && this.instances.get(n.parent)?.object) || this.group;
      if (inst.object.parent !== parent) parent.add(inst.object);
    }
    if (this.selectedId && !this.instances.has(this.selectedId)) this.setSelected(null);
    else this.setSelected(this.selectedId); // node may have been rebuilt — re-point the outline
    if (!this.framed) { this.frameAll(); this.framed = true; }
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    if (this.box) { this.scene.remove(this.box); this.box.dispose(); this.box = null; }
    const inst = id ? this.instances.get(id) : undefined;
    if (inst) { this.box = new THREE.BoxHelper(inst.object, 0xffa726); this.scene.add(this.box); }
  }

  private detach(object: THREE.Object3D) {
    for (const child of [...object.children]) if (child.userData.nodeId) this.group.add(child);
    disposeObject(object);
  }

  private frameAll() {
    const box = new THREE.Box3().setFromObject(this.group);
    if (!box.isEmpty()) {
      box.getCenter(this.pivot);
      this.distance = THREE.MathUtils.clamp(box.getSize(new THREE.Vector3()).length() * 1.5, 2, 60);
    }
    this.applyCamera();
  }

  private applyCamera() {
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.4, 1.4);
    this.distance = THREE.MathUtils.clamp(this.distance, .5, 200);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    this.camera.position.copy(this.pivot).addScaledVector(dir, this.distance);
    this.camera.lookAt(this.pivot);
    this.camera.updateMatrixWorld();
  }

  private onResize = () => {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    this.renderer.domElement.focus();
    this.down = { x: e.clientX, y: e.clientY };
    this.orbiting = true;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.orbiting) return;
    this.yaw -= (e.movementX ?? 0) * .006;
    this.pitch += (e.movementY ?? 0) * .006;
    this.applyCamera();
  };

  private onUp = (e: PointerEvent) => {
    if (!this.orbiting) return;
    this.orbiting = false;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) this.renderer.domElement.releasePointerCapture(e.pointerId);
    if (e.type !== "pointerup" || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) >= 4) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), this.camera);
    const hit = this.raycaster.intersectObjects(this.group.children, true).find(h => !h.object.userData.editorOnly);
    let node: THREE.Object3D | null = hit?.object ?? null;
    while (node && !node.userData.nodeId) node = node.parent;
    this.onPick((node?.userData.nodeId as string | undefined) ?? null);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance *= Math.exp(e.deltaY * .0012);
    this.applyCamera();
  };

  private tick = () => {
    if (this.disposed) return;
    this.box?.update();
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    for (const inst of this.instances.values()) disposeObject(inst.object);
    if (this.box) this.box.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** Children grouped by parent id ("" = root) over an arbitrary node list. */
function kidsOf(nodes: SceneObject[]): Map<string, SceneObject[]> {
  const out = new Map<string, SceneObject[]>();
  for (const n of nodes) {
    const key = n.parent ?? "";
    const list = out.get(key);
    if (list) list.push(n); else out.set(key, [n]);
  }
  return out;
}

function subtreeOf(nodes: SceneObject[], id: string): Set<string> {
  const kids = kidsOf(nodes), dead = new Set<string>();
  const walk = (cur: string) => { dead.add(cur); for (const c of kids.get(cur) ?? []) walk(c.id); };
  walk(id);
  return dead;
}

function draftRoot(defId: string): SceneObject {
  const def = PREFAB_BY_ID.get(defId);
  return {
    id: newObjectId(),
    name: def?.label ?? defId,
    parent: null,
    prefab: defId,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    visible: true,
    props: def ? prefabDefaults(def) : {},
    components: structuredClone(def?.components ?? {}),
  };
}

/** Prefab editor overlay: click a prefab card in Project to open. Authored
 * assets edit a draft of the asset's node hierarchy (Save bumps the revision
 * and propagates to placed instances); built-in defs edit a single root node
 * that can be placed as-is or saved as a new authored asset. `embedded`
 * renders it as a docked panel (no backdrop, no scene placement) — used by
 * the Content workspace's scene panel. */
export function PrefabEditor({ store, assetId, defId, onClose, onPlace, onOpenAsset, embedded, inspector }: {
  store: SceneStore;
  assetId?: string;
  defId?: string;
  onClose: () => void;
  onPlace: (prefab: string, overrides?: { name?: string; props?: Record<string, unknown>; components?: SceneComponents }) => void;
  onOpenAsset: (id: string) => void;
  embedded?: boolean;
  /** Extra content rendered at the bottom of the side panel — the Content
   * workspace passes the selected asset's inspector here. */
  inspector?: ReactNode;
}) {
  const asset = useSceneStore(store, s => (assetId ? s.doc.prefabs.find(p => p.id === assetId) : undefined));
  const def = defId ? PREFAB_BY_ID.get(defId) : undefined;
  const [nodes, setNodes] = useState<SceneObject[]>(() => (assetId ? structuredClone(store.getState().doc.prefabs.find(p => p.id === assetId)?.objects ?? []) : [draftRoot(defId!)]));
  const [selected, setSelected] = useState<string | null>(nodes[0]?.id ?? null);
  const [name, setName] = useState(() => (assetId ? store.getState().doc.prefabs.find(p => p.id === assetId)?.name : def?.label) ?? "");
  const [kind, setKind] = useState<PrefabKind>(() => (assetId ? store.getState().doc.prefabs.find(p => p.id === assetId)?.kind : undefined) ?? "decoration");
  const [dirty, setDirty] = useState(false);
  const [addPrefabId, setAddPrefabId] = useState(PREFABS[0]?.id ?? "");
  const hostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<PrefabPreview | null>(null);
  const kids = useMemo(() => kidsOf(nodes), [nodes]);

  useEffect(() => {
    if (!hostRef.current) return;
    const preview = new PrefabPreview(hostRef.current);
    preview.onPick = id => setSelected(id);
    previewRef.current = preview;
    return () => { preview.dispose(); previewRef.current = null; };
  }, []);

  useEffect(() => { previewRef.current?.setNodes(nodes); }, [nodes]);
  useEffect(() => { previewRef.current?.setSelected(selected); }, [selected]);
  useEffect(() => { if (assetId && !asset) onClose(); }, [assetId, asset, onClose]);

  const patchNode = (id: string, patch: Partial<Omit<SceneObject, "id" | "transform">> & { transform?: Partial<SceneTransform> }) => {
    setNodes(ns => ns.map(n => {
      if (n.id !== id) return n;
      const { transform, props, ...rest } = patch;
      return { ...n, ...rest, transform: { ...n.transform, ...transform }, props: props ? { ...n.props, ...props } : n.props };
    }));
    setDirty(true);
  };

  const addNode = () => {
    const nodeDef = PREFAB_BY_ID.get(addPrefabId);
    const node: SceneObject = {
      id: newObjectId(),
      name: nodeDef?.label ?? addPrefabId,
      parent: selected ?? nodes[0]?.id ?? null,
      prefab: addPrefabId,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      visible: true,
      props: nodeDef ? prefabDefaults(nodeDef) : {},
      components: structuredClone(nodeDef?.components ?? {}),
    };
    setNodes(ns => [...ns, node]);
    setSelected(node.id);
    setDirty(true);
  };

  const removeNode = (id: string) => {
    if (id === nodes[0]?.id) return;
    const dead = subtreeOf(nodes, id);
    setNodes(ns => ns.filter(n => !dead.has(n.id)));
    if (selected && dead.has(selected)) setSelected(nodes[0]?.id ?? null);
    setDirty(true);
  };

  const requestClose = () => {
    if (dirty && !confirm("Discard unsaved prefab changes?")) return;
    onClose();
  };

  const save = () => {
    if (!asset || !nodes.length) return;
    store.updatePrefabAsset(asset.id, { name, kind, objects: nodes });
    setDirty(false);
  };

  const saveAsAsset = () => {
    if (!nodes.length) return;
    onOpenAsset(store.createPrefabAsset(name, nodes));
    setDirty(false);
  };

  const place = () => {
    if (asset) onPlace(asset.id);
    else if (def && nodes[0]) onPlace(def.id, { name: nodes[0].name, props: nodes[0].props, components: nodes[0].components });
  };

  const visible: { o: SceneObject; depth: number }[] = [];
  const walk = (parent: string, depth: number) => { for (const o of kids.get(parent) ?? []) { visible.push({ o, depth }); walk(o.id, depth + 1); } };
  walk("", 0);
  const node = selected ? nodes.find(n => n.id === selected) : undefined;
  const nodeDef = node ? PREFAB_BY_ID.get(node.prefab) : undefined;
  const noop = () => {};
  const title = asset ? `Prefab — ${asset.name}` : `Prefab — ${def?.label ?? defId} (built-in)`;

  return (
    <div className={embedded ? "sc-prefab-panel" : "sc-prefab-backdrop"} onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape" && !isEditable(e.target)) requestClose(); }}>
      <div className={embedded ? "sc-prefab-editor sc-prefab-embedded" : "sc-prefab-editor"} role="dialog" aria-label={title}>
        <div className="ed-dock-title sc-prefab-head">
          <span className="sc-prefab-icon" aria-hidden="true">◆</span>
          <input className="sc-prefab-name" aria-label="Prefab name" value={name} onChange={e => { setName(e.target.value); setDirty(true); }} />
          {asset && <select aria-label="Prefab kind" value={kind} onChange={e => { setKind(e.target.value as PrefabKind); setDirty(true); }}>{(["npc", "poi", "item", "decoration"] as const).map(k => <option key={k} value={k}>{k}</option>)}</select>}
          <span className="ed-hint">{asset ? `revision ${asset.revision}${dirty ? " — unsaved changes" : ""}` : "built-in prefab"}</span>
          <span className="spacer" />
          {!embedded && <button onClick={place} title={asset && dirty ? "Places the last saved revision" : undefined}>Place in scene</button>}
          {asset
            ? <>
                <button className="primary" disabled={!dirty} onClick={save}>Save</button>
                <button disabled={!dirty} onClick={() => { setNodes(structuredClone(asset.objects)); setName(asset.name); setKind(asset.kind); setSelected(asset.objects[0]?.id ?? null); setDirty(false); }}>Revert</button>
                <button onClick={() => { if (confirm(`Delete prefab '${asset.name}'? Placed instances become missing-prefab objects.`)) { store.deletePrefabAsset(asset.id); onClose(); } }}>Delete</button>
              </>
            : <button className="primary" onClick={saveAsAsset}>Save as prefab asset</button>}
          <button aria-label="Close prefab editor" onClick={requestClose}>✕</button>
        </div>
        <div className="sc-prefab-body">
          <aside className="sc-prefab-nodes">

            <div className="ed-dock-title">Nodes <span>{nodes.length}</span></div>
            {asset && <div className="sc-prefab-addrow">
              <select aria-label="Node prefab" value={addPrefabId} onChange={e => setAddPrefabId(e.target.value)}>
                {PREFABS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <button onClick={addNode} title="Add as a child of the selected node">＋</button>
            </div>}
            <div className="ed-tree sc-tree" onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
              {visible.map(({ o, depth }) => (
                <div
                  key={o.id}
                  className={`ed-tree-item sc-tree-item ${selected === o.id ? "selected" : ""} ${o.visible ? "" : "hidden"}`}
                  style={{ paddingLeft: 8 + Math.min(depth, 8) * 14 }}
                  role="treeitem"
                  aria-selected={selected === o.id}
                  onClick={() => setSelected(o.id)}
                >
                  <span className="sc-tree-caret" style={{ visibility: "hidden" }} />
                  <span className="sc-tree-name" title={nodeDef?.label ?? o.prefab}>{o.id === nodes[0]?.id ? "◆ " : ""}{o.name}</span>
                </div>
              ))}
              {!visible.length && <p className="ed-empty">No nodes</p>}
            </div>
          </aside>
          <PaneHandle axis="x" target="prev" id="prefab:nodes"/>
          <div className="sc-prefab-viewport" ref={hostRef} />
          <PaneHandle axis="x" target="next" id="prefab:inspector"/>
          <aside className="sc-prefab-inspector ed-panel sc-inspector">
            {inspector && <div className="sc-prefab-asset"><div className="ed-dock-title">Asset</div>{inspector}</div>}
            {node ? (
              <>
                <div className="ed-row sc-head">
                  <input type="checkbox" aria-label="Active" checked={node.visible} onChange={e => patchNode(node.id, { visible: e.target.checked })} />
                  <input className="sc-name" aria-label="Node name" value={node.name} onChange={e => patchNode(node.id, { name: e.target.value })} />
                </div>
                <div className="ed-row"><label>Prefab</label><span>{nodeDef?.label ?? node.prefab}</span>{node.id === nodes[0]?.id && <span className="ed-hint">root</span>}</div>
                <Section title="Transform">
                  <Vec3Row label="Position" value={node.transform.position} onBegin={noop} onEnd={noop} onChange={position => patchNode(node.id, { transform: { position } })} />
                  <Vec3Row label="Rotation" value={node.transform.rotation} step={1} onBegin={noop} onEnd={noop} onChange={rotation => patchNode(node.id, { transform: { rotation } })} />
                  <Vec3Row label="Scale" value={node.transform.scale} onBegin={noop} onEnd={noop} onChange={scale => patchNode(node.id, { transform: { scale } })} />
                  {node.id === nodes[0]?.id && <p className="ed-hint">Root position is ignored — instances are placed at the drop point.</p>}
                  <div className="ed-row"><button onClick={() => removeNode(node.id)} disabled={node.id === nodes[0]?.id} title={node.id === nodes[0]?.id ? "The prefab root cannot be deleted" : "Delete this node and its children"}>Delete node</button></div>
                </Section>
                <Section title="Gameplay components">
                  <ComponentsEditor components={node.components} onBegin={noop} onEnd={noop} apply={components => patchNode(node.id, { components })} />
                </Section>
                {nodeDef && nodeDef.props.length > 0 && (
                  <Section title={nodeDef.label}>
                    {nodeDef.props.map(p => <PropField key={p.key} def={p} value={node.props[p.key] ?? p.default} onBegin={noop} onEnd={noop} onChange={v => patchNode(node.id, { props: { [p.key]: v } })} />)}
                  </Section>
                )}
              </>
            ) : <p className="ed-hint">Select a node to edit it, or click a node in the preview.</p>}
          </aside>
        </div>
        <div className="ed-scene-footer"><span><b>Drag</b> orbit · <b>Wheel</b> zoom · <b>Click</b> select node</span><span>{asset ? "Save pushes changes to every placed instance" : "Tweak props, then place it or save it as a new prefab asset"}</span></div>
      </div>
    </div>
  );
}
