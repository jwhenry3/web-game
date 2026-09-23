/**
 * Scene workspace state — the authored Scene3DDoc plus editor-only state
 * (selection, active tool, snapping, undo history). A tiny external store
 * consumed through useSyncExternalStore so the Three.js viewport (which is
 * not a React component) can subscribe to the same source of truth.
 */
import { useSyncExternalStore } from "react";
import {
  emptyScene,
  isAncestor,
  newObjectId,
  normalizeScene,
  subtreeIds,
  type Scene3DDoc,
  type SceneObject,
  type SceneTransform,
  type Vec3,
  type PrefabKind,
  type SceneComponents,
  type SceneTerrain,
} from "../../../../wails/frontend/src/three/scene3d";
import { savePrefabAsset, instantiatePrefabAsset, refreshPrefabOverrides, applyPrefabOverrides, revertPrefabOverrides, syncPrefabInstances } from '../../../../wails/frontend/src/three/prefabAssets';
import { PREFAB_BY_ID, prefabDefaults } from "../../../../wails/frontend/src/three/prefabs";
import { localUnderParent } from "./transforms";

export type Tool = "view" | "move" | "rotate" | "scale";
export type Space = "world" | "local";

export interface Layers {
  terrain: boolean;
  stamps: boolean;
  grid: boolean;
  /** Preview the authored fog; off lets you edit zoomed out without the wash. */
  fog: boolean;
}

export interface EditorState {
  doc: Scene3DDoc;
  selection: string[];
  /** The terrain is selected (via viewport click or the Hierarchy row) —
   *  mutually exclusive with `selection`; enables the brush and terrain inspector. */
  terrainSelected: boolean;
  tool: Tool;
  space: Space;
  snap: boolean;
  snapMove: number;
  snapRotate: number;
  snapScale: number;
  layers: Layers;
  /** New placements drop onto the highest surface below (terrain, colliders, buildings). */
  dropToSurface: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Screen-space focus request: bumps when the user presses F. */
  frameRequest: number;
}

type Listener = () => void;
const HISTORY_LIMIT = 200;
const storageKey = (map: string) => `scene3d:${map}`;

export class SceneStore {
  private state: EditorState;
  private past: Scene3DDoc[] = [];
  private future: Scene3DDoc[] = [];
  private dragBase: Scene3DDoc | null = null;
  private listeners = new Set<Listener>();

  constructor(map: string) {
    this.state = {
      doc: SceneStore.restore(map),
      selection: [],
      terrainSelected: false,
      tool: "move",
      space: "world",
      snap: false,
      snapMove: .5,
      snapRotate: 15,
      snapScale: .1,
      layers: { terrain: true, stamps: true, grid: true, fog: true },
      dropToSurface: true,
      dirty: false,
      canUndo: false,
      canRedo: false,
      frameRequest: 0,
    };
  }

  private static restore(map: string): Scene3DDoc {
    try {
      const raw = localStorage.getItem(storageKey(map));
      if (raw) return normalizeScene(JSON.parse(raw), map);
    } catch { /* corrupt autosave — start fresh */ }
    return emptyScene(map);
  }

  subscribe = (fn: Listener) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getState = () => this.state;

  private set(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch, canUndo: this.past.length > 0, canRedo: this.future.length > 0 };
    for (const fn of this.listeners) fn();
  }

  // --- document mutations -------------------------------------------------

  /** Apply a recorded mutation; `fn` receives a fresh draft copy. */
  update(fn: (doc: Scene3DDoc) => void) {
    const draft = structuredClone(this.state.doc);
    fn(draft);
    refreshPrefabOverrides(draft);
    this.pushHistory(this.state.doc);
    this.set({ doc: draft, dirty: true });
    this.autosave();
  }

  /** Gizmo drags update the doc every frame; only the whole drag is one undo step. */
  beginDrag() { this.dragBase = this.state.doc; }
  updateTransient(fn: (doc: Scene3DDoc) => void) {
    const draft = structuredClone(this.state.doc);
    fn(draft);
    refreshPrefabOverrides(draft);
    this.set({ doc: draft, dirty: true });
  }
  endDrag() {
    if (this.dragBase && this.dragBase !== this.state.doc) this.pushHistory(this.dragBase);
    this.dragBase = null;
    this.set({});
    this.autosave();
  }

  private pushHistory(doc: Scene3DDoc) {
    this.past.push(doc);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
  }

  undo() {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.state.doc);
    const ids = new Set(prev.objects.map(o => o.id));
    this.set({ doc: prev, dirty: true, selection: this.state.selection.filter(id => ids.has(id)) });
    this.autosave();
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state.doc);
    const ids = new Set(next.objects.map(o => o.id));
    this.set({ doc: next, dirty: true, selection: this.state.selection.filter(id => ids.has(id)) });
    this.autosave();
  }

  replaceDoc(doc: Scene3DDoc, dirty = false) {
    this.past = []; this.future = [];
    this.set({ doc, selection: [], terrainSelected: false, dirty });
    this.autosave();
  }

  private autosave() {
    try { localStorage.setItem(storageKey(this.state.doc.map), JSON.stringify(this.state.doc)); } catch { /* quota */ }
  }
  markSaved() { this.set({ dirty: false }); }
  setTerrainTransient(terrain: SceneTerrain) { this.updateTransient(doc=>{doc.terrain=terrain;}); }
  saveAsPrefab(id: string, name: string, kind: PrefabKind) { this.update(doc=>{savePrefabAsset(doc,id,name,kind);}); }
  applyPrefab(id: string) { this.update(doc=>applyPrefabOverrides(doc,id)); }
  revertPrefab(id: string) { this.update(doc=>revertPrefabOverrides(doc,id)); }
  unpackPrefab(id: string) { this.update(doc=>{const root=doc.objects.find(o=>o.id===id)?.prefabInstance?.rootId;for(const o of doc.objects)if(o.prefabInstance?.rootId===root)delete o.prefabInstance;}); }

  /** Prefab editor save: replace the asset's metadata/nodes, bump the
   * revision, and push the change out to every placed instance while
   * keeping each instance's recorded overrides. */
  updatePrefabAsset(id: string, patch: { name?: string; kind?: PrefabKind; objects?: SceneObject[] }) {
    this.update(doc => {
      const asset = doc.prefabs.find(p => p.id === id);
      if (!asset) return;
      if (patch.name !== undefined) asset.name = patch.name.trim() || asset.name;
      if (patch.kind !== undefined) asset.kind = patch.kind;
      if (patch.objects?.length) {
        const nodes = structuredClone(patch.objects);
        nodes[0].parent = null;
        nodes[0].transform.position = [0, 0, 0];
        for (const node of nodes) { delete node.prefabInstance; if (node !== nodes[0] && !node.parent) node.parent = nodes[0].id; }
        asset.objects = nodes;
      }
      asset.revision++;
      syncPrefabInstances(doc, id);
    });
  }

  /** Wrap a prefab-editor draft (or a tweaked built-in def) in a new authored
   * asset. The first node is the root; like savePrefabAsset its position is
   * zeroed because instantiation supplies the drop point. */
  createPrefabAsset(name: string, nodes: SceneObject[]): string {
    const assetId = `prefab_${newObjectId()}`;
    this.update(doc => {
      const objects = structuredClone(nodes);
      objects[0].parent = null;
      objects[0].transform.position = [0, 0, 0];
      for (const n of objects) { delete n.prefabInstance; if (n !== objects[0] && !n.parent) n.parent = objects[0].id; }
      const root = objects[0];
      doc.prefabs.push({
        id: assetId,
        name: name.trim() || root.name,
        kind: root.components?.npc ? 'npc' : root.components?.poi || root.components?.storage ? 'poi' : root.components?.item ? 'item' : 'decoration',
        revision: 1,
        objects,
      });
    });
    return assetId;
  }

  /** Delete an asset; placed instances keep their link and show as missing prefab. */
  deletePrefabAsset(id: string) { this.update(doc => { doc.prefabs = doc.prefabs.filter(p => p.id !== id); }); }

  // --- objects ------------------------------------------------------------

  addObject(prefab: string, position: Vec3, parent: string | null = null, overrides?: { name?: string; props?: Record<string, unknown>; components?: SceneComponents; content?: string }): string {
    if(this.state.doc.prefabs.some(p=>p.id===prefab)) {
      let id='';this.update(doc=>{id=instantiatePrefabAsset(doc,prefab,position,parent);});this.select([id]);return id;
    }
    const def = PREFAB_BY_ID.get(prefab);
    const id = newObjectId();
    this.update(doc => {
      const siblings = doc.objects.filter(o => o.prefab === prefab).length;
      doc.objects.push({
        id,
        name: overrides?.name || `${def?.label ?? prefab}${siblings ? ` (${siblings})` : ""}`,
        parent,
        prefab,
        transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
        visible: true,
        props: { ...(def ? prefabDefaults(def) : {}), ...overrides?.props },
        components: structuredClone(overrides?.components ?? def?.components ?? {}),
        ...(overrides?.content ? { content: overrides.content } : {}),
      });
    });
    this.select([id]);
    return id;
  }

  deleteSelected() {
    const ids = new Set(this.state.selection.flatMap(id => subtreeIds(this.state.doc, id)));
    if (!ids.size) return;
    this.update(doc => { doc.objects = doc.objects.filter(o => !ids.has(o.id)); });
    this.select([]);
  }

  duplicateSelected() {
    const roots = this.state.selection.filter(id=>!this.state.selection.some(other=>other!==id&&isAncestor(this.state.doc,other,id)));
    if (!roots.length) return;
    const fresh: string[] = [];
    this.update(doc => {
      const byId = new Map(doc.objects.map(o => [o.id, o]));
      for (const rootId of roots) {
        const idMap = new Map<string, string>();
        for (const id of subtreeIds(doc, rootId)) idMap.set(id, newObjectId());
        for (const [oldId, newId] of idMap) {
          const src = byId.get(oldId)!;
          const copy: SceneObject = structuredClone(src);
          copy.id = newId;
          if(copy.prefabInstance) {
            const root=idMap.get(copy.prefabInstance.rootId);
            if(root) copy.prefabInstance.rootId=root; else delete copy.prefabInstance;
          }
          copy.parent = src.parent && idMap.has(src.parent) ? idMap.get(src.parent)! : src.parent;
          if (oldId === rootId) { copy.name = `${src.name} copy`; copy.transform.position = [...src.transform.position] as Vec3; }
          doc.objects.push(copy);
        }
        fresh.push(idMap.get(rootId)!);
      }
    });
    this.select(fresh);
  }

  patchObject(id: string, patch: Partial<Omit<SceneObject, "id" | "transform">> & { transform?: Partial<SceneTransform> }) {
    this.update(doc => {
      const o = doc.objects.find(x => x.id === id);
      if (!o) return;
      const { transform, props, ...rest } = patch;
      Object.assign(o, rest);
      if (transform) Object.assign(o.transform, transform);
      if (props) o.props = { ...o.props, ...props };
    });
  }

  setTransformTransient(id: string, transform: SceneTransform) {
    this.updateTransient(doc => { const o = doc.objects.find(x => x.id === id); if (o) o.transform = transform; });
  }

  /** Reparent, keeping the object where it is in world space (like Unity's hierarchy). Refuses cycles; `null` moves to root. */
  reparent(id: string, parent: string | null) {
    if (id === parent) return;
    if (parent && isAncestor(this.state.doc, id, parent)) return;
    if (parent && !this.state.doc.objects.some(o=>o.id===parent)) return;
    this.update(doc => {
      const o = doc.objects.find(x => x.id === id);
      if (!o || (o.parent ?? null) === parent) return;
      o.transform = localUnderParent(doc, id, parent);
      o.parent = parent;
    });
  }

  /** Move `id` to sit right before/after `target` in document order (same parent as target). */
  reorder(id: string, target: string, after: boolean) {
    if (id === target || isAncestor(this.state.doc, id, target)) return;
    this.update(doc => {
      const moving = doc.objects.find(x => x.id === id);
      const tgt = doc.objects.find(x => x.id === target);
      if (!moving || !tgt) return;
      const parent = tgt.parent ?? null;
      if ((moving.parent ?? null) !== parent) moving.transform = localUnderParent(doc, id, parent);
      moving.parent = parent;
      doc.objects = doc.objects.filter(x => x.id !== id);
      const at = doc.objects.findIndex(x => x.id === target);
      doc.objects.splice(after ? at + 1 : at, 0, moving);
    });
  }

  // --- editor-only state -----------------------------------------------------

  select(ids: string[]) { this.set({ selection: ids, terrainSelected: false }); }
  toggleSelect(id: string) {
    const has = this.state.selection.includes(id);
    this.set({ selection: has ? this.state.selection.filter(x => x !== id) : [...this.state.selection, id], terrainSelected: false });
  }
  /** Select the terrain itself — objects deselect, the brush activates. */
  selectTerrain() { this.set({ selection: [], terrainSelected: true }); }
  setTool(tool: Tool) { this.set({ tool }); }
  setSpace(space: Space) { this.set({ space }); }
  setSnap(patch: Partial<Pick<EditorState, "snap" | "snapMove" | "snapRotate" | "snapScale">>) { this.set(patch); }
  setLayer(key: keyof Layers, on: boolean) { this.set({ layers: { ...this.state.layers, [key]: on } }); }
  setDropToSurface(on: boolean) { this.set({ dropToSurface: on }); }
  requestFrame() { this.set({ frameRequest: this.state.frameRequest + 1 }); }
}

export function useSceneStore<T>(store: SceneStore, selector: (s: EditorState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}
