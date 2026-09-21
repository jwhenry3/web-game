/**
 * Scene viewport — a Three.js view of the game's procedural terrain with the
 * authored Scene3DDoc objects layered on top, plus Unity-style editing:
 * RMB look + WASD fly, MMB pan, Alt+LMB orbit, wheel zoom, F to frame,
 * click to select, TransformControls gizmo (move/rotate/scale, world/local,
 * snapping), and drag-drop prefab placement from the Project panel.
 *
 * The viewport mirrors the store (doc -> Object3D instances) every frame and
 * writes gizmo edits back through beginDrag/updateTransient/endDrag so one
 * drag equals one undo step.
 */
import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { WorldHeightmap, WORLD_SCALE } from "../../../../wails/frontend/src/three/heightmap";
import { TerrainWorld, disposeObject } from "../../../../wails/frontend/src/three/terrain";
import { applyTerrainBrush, emptyTerrain, terrainChangeBounds, type TerrainBrush } from "../../../../wails/frontend/src/three/terrainEditing";
import { WorldBuildings } from "../../../../wails/frontend/src/three/props";
import { instantiatePrefab } from "../../../../wails/frontend/src/three/prefabs";
import type { MapSnapshot } from "../../../../wails/frontend/src/net/wire.gen";
import { isAncestor, subtreeIds, type SceneComponents, type SceneObject, type SceneTransform, type Vec3 } from "../../../../wails/frontend/src/three/scene3d";
import type { EditorState, SceneStore } from "./store";

export const PREFAB_MIME = "application/x-scene3d-prefab";
const DEG = Math.PI / 180;
const GRID_SIZE = 80;

interface Instance { object: THREE.Object3D; signature: string }

const isEditable = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable);
const DOWN = new THREE.Vector3(0, -1, 0);
const PROXY_MATERIAL = new THREE.MeshBasicMaterial();

/** Invisible mesh matching a collider component so surface drops can land on
 * mesh-less collider objects. `visible = false` still raycasts; `editorOnly`
 * keeps it out of picking, `triggerOnly` out of drops. */
function colliderProxy(col: NonNullable<SceneComponents["collider"]>): THREE.Mesh {
  const geo = col.shape === "sphere" ? new THREE.SphereGeometry(.5, 10, 8) : new THREE.BoxGeometry(1, 1, 1);
  const proxy = new THREE.Mesh(geo, PROXY_MATERIAL);
  proxy.visible = false;
  proxy.position.set(col.offset[0], col.offset[1], col.offset[2]);
  proxy.scale.set(col.size[0], col.size[1], col.size[2]);
  proxy.userData.editorOnly = true;
  if (col.isTrigger) proxy.userData.triggerOnly = true;
  return proxy;
}

export class SceneView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, .05, 1500);
  private sun = new THREE.DirectionalLight(0xffe5b7, 2.6);
  private hemi = new THREE.HemisphereLight(0xc9e4ee, 0x716646, 2);
  private grid = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x5a5a5a, 0x3c3c3c);
  private objects = new THREE.Group();
  private instances = new Map<string, Instance>();
  private selectionBoxes: THREE.BoxHelper[] = [];
  private gizmo: TransformControls;
  private gizmoTarget: string | null = null;
  private terrain: TerrainWorld | null = null;
  private buildings: WorldBuildings | null = null;
  private field: WorldHeightmap | null = null;
  private raycaster = new THREE.Raycaster();
  private resize: ResizeObserver;
  private frame = 0;
  private lastTime = 0;
  private disposed = false;
  private lastFrameRequest = 0;
  private lastDoc: EditorState["doc"] | null = null;
  private terrainBrush: TerrainBrush | null = null;
  private brushStroke = false;
  private brushElapsed = 0;
  private brushPoint: THREE.Vector3 | null = null;
  private lastBrushPoint: THREE.Vector3 | null = null;
  private brushRing = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffcb72, depthTest: false, transparent: true, opacity: .95 }));

  /** Preview objects for the Characters/Effects modes — live in the scene but
   * are not part of the doc and are never pickable. */
  readonly stage = new THREE.Group();
  /** Per-frame hook for preview modes (rig animation, VFX playback). */
  onFrame: (dt: number, time: number) => void = () => {};
  /** Called after loadMap repositions the camera — preview modes re-anchor. */
  onMapLoaded: () => void = () => {};
  /** When set, the gizmo drives this object instead of the doc selection. */
  private gizmoOverride: { object: THREE.Object3D; onWrite?: (t: SceneTransform) => void } | null = null;

  // Camera state: the camera looks at `pivot` from spherical (yaw, pitch, distance).
  private pivot = new THREE.Vector3(0, 0, 0);
  private yaw = .6;
  private pitch = .55;
  private distance = 24;
  private buttons = { left: false, middle: false, right: false, alt: false };
  private pointer = { x: 0, y: 0, downX: 0, downY: 0 };
  private flyKeys = new Set<string>();
  private unsubscribe: () => void;

  /** Called when the store's map differs from the loaded terrain. */
  onStatus: (message: string) => void = () => {};

  constructor(private host: HTMLDivElement, private store: SceneStore) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute("aria-label", "Scene view. Right-drag to look, WASD to fly, middle-drag to pan, Alt+drag to orbit, F to frame.");
    host.appendChild(this.renderer.domElement);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
    this.sun.shadow.bias = -.0003; this.sun.shadow.normalBias = .035;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.grid, this.objects, this.stage);
    this.brushRing.visible = false; this.brushRing.renderOrder = 10; this.scene.add(this.brushRing);

    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setSize(.9);
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener("dragging-changed", (e) => {
      if (e.value) this.store.beginDrag(); else this.store.endDrag();
    });
    this.gizmo.addEventListener("objectChange", () => this.writeGizmo());

    this.resize = new ResizeObserver(this.onResize); this.resize.observe(host); this.onResize();
    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", this.onPointerDown);
    dom.addEventListener("pointermove", this.onPointerMove);
    dom.addEventListener("pointerup", this.onPointerUp);
    dom.addEventListener("pointerleave", this.onPointerUp);
    dom.addEventListener("pointercancel", this.onPointerUp);
    dom.addEventListener("wheel", this.onWheel, { passive: false });
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
    dom.addEventListener("dragover", this.onDragOver);
    dom.addEventListener("drop", this.onDrop);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.unsubscribe = store.subscribe(this.onStore);
    this.onStore();
    this.applyCamera();
    this.frame = requestAnimationFrame(this.tick);
  }

  // --- map / terrain -----------------------------------------------------------

  loadMap(snapshot: MapSnapshot) {
    this.endBrushStroke();
    this.terrain?.dispose(); this.buildings?.dispose();
    this.field = new WorldHeightmap(snapshot.overworld, snapshot.terrain_layers, this.store.getState().doc.terrain);
    this.terrain = new TerrainWorld(this.field); this.terrain.canopyCutaway = false; this.scene.add(this.terrain.group);
    this.buildings = new WorldBuildings(snapshot.id, this.field); this.scene.add(this.buildings.group);
    const { cols, rows, tile, cells } = snapshot.overworld;
    // Start over the settlement nearest the map centre (matching the 3D preview's spawn), else the centre itself.
    let c = cols / 2, r = rows / 2, best = Infinity;
    for (let at = cells.indexOf("H"); at >= 0; at = cells.indexOf("H", at + 1)) {
      const cc = at % cols, rr = Math.floor(at / cols), d = (cc - cols * .45) ** 2 + (rr - rows * .45) ** 2;
      if (d < best) { best = d; c = cc; r = rr; }
    }
    this.pivot.set(c * tile * WORLD_SCALE, this.field.height(c * tile, r * tile), r * tile * WORLD_SCALE);
    this.distance = 24;
    this.applyCamera();
    this.onStore();
    this.onMapLoaded();
  }

  /** Brush uses map-pixel units so editor, game and server share saved elevations. */
  setTerrainBrush(brush: TerrainBrush | null) {
    this.endBrushStroke();
    this.terrainBrush = brush;
    this.brushRing.visible = false;
    this.syncGizmo(this.store.getState());
  }

  private endBrushStroke() {
    if (this.brushStroke) { this.brushStroke = false; this.store.endDrag(); }
    this.lastBrushPoint = null; this.brushElapsed = 0;
  }

  private updateBrushPoint(e: { clientX: number; clientY: number }) {
    if (!this.terrainBrush || !this.terrain || !this.terrain.group.visible) { this.brushPoint = null; this.brushRing.visible = false; return; }
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    this.brushPoint = this.raycaster.intersectObjects(this.terrain.ground)[0]?.point ?? null;
    this.updateBrushRing();
  }

  private updateBrushRing() {
    const point = this.brushPoint, brush = this.terrainBrush;
    this.brushRing.visible = !!point && !!brush;
    if (!point || !brush) return;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) {
      const a = i / 96 * Math.PI * 2, x = point.x + Math.cos(a) * brush.radius * WORLD_SCALE, z = point.z + Math.sin(a) * brush.radius * WORLD_SCALE;
      points.push(new THREE.Vector3(x, this.groundHeight(x, z) + .05, z));
    }
    this.brushRing.geometry.setFromPoints(points);
    this.brushRing.geometry.computeBoundingSphere();
  }

  private paintTerrain(dt: number) {
    if (!this.brushStroke || !this.terrainBrush || !this.field || !this.brushPoint) return;
    const source = this.store.getState().doc.terrain ?? emptyTerrain();
    let next = source;
    const to = this.brushPoint, from = this.lastBrushPoint ?? to;
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.min(64, Math.max(1, Math.ceil(distance / (this.terrainBrush.radius * WORLD_SCALE * .25))));
    for (let i = 1; i <= steps; i++) {
      next = applyTerrainBrush(this.field, next, THREE.MathUtils.lerp(from.x, to.x, i / steps) / WORLD_SCALE,
        THREE.MathUtils.lerp(from.z, to.z, i / steps) / WORLD_SCALE, this.terrainBrush, dt / steps);
    }
    this.lastBrushPoint = to.clone();
    if (next !== source) this.store.setTerrainTransient(next);
    this.updateBrushRing();
  }

  /** Terrain height (world units) under a world-space x/z, or 0 without terrain. */
  groundHeight(x: number, z: number): number {
    return this.field ? this.field.height(x / WORLD_SCALE, z / WORLD_SCALE) : 0;
  }

  /** Where a newly placed object should land when the user has no drop point: in front of the camera. */
  placementPoint(): Vec3 {
    const p = this.pivot.clone();
    const x = Math.round(p.x * 2) / 2, z = Math.round(p.z * 2) / 2;
    const y = this.store.getState().dropToSurface ? this.dropY(x, z, p.y + .01) : this.groundHeight(x, z);
    return [x, Math.round(y * 1000) / 1000, z];
  }

  /** Everything a surface drop can land on: authored objects (including
   * collider proxies), 2D building stamps, and the terrain itself. */
  private dropTargets(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [this.objects];
    if (this.buildings) out.push(this.buildings.group);
    if (this.terrain) out.push(...this.terrain.ground);
    return out;
  }

  /** Highest surface y at (x,z) below fromY: casts straight down and takes
   * the first hit, skipping editor helpers, triggers and `exclude`d scene
   * objects. Falls back to the analytic terrain height. */
  dropY(x: number, z: number, fromY: number, exclude?: Set<string>): number {
    this.raycaster.set(new THREE.Vector3(x, fromY, z), DOWN);
    for (const hit of this.raycaster.intersectObjects(this.dropTargets(), true)) {
      if (hit.object.userData.editorOnly || hit.object.userData.triggerOnly) continue;
      let node: THREE.Object3D | null = hit.object;
      while (node && !node.userData.sceneId) node = node.parent;
      if (node && exclude?.has(node.userData.sceneId as string)) continue;
      return hit.point.y;
    }
    return this.groundHeight(x, z);
  }

  /** Drop every selected root object onto the highest surface below it as a
   * single undo step. Nested selections only move their root. */
  dropSelected() {
    const s = this.store.getState();
    const roots = s.selection.filter(id => !s.selection.some(other => other !== id && isAncestor(s.doc, other, id)));
    if (!roots.length) return;
    const exclude = new Set(roots.flatMap(id => subtreeIds(s.doc, id)));
    this.scene.updateMatrixWorld(true);
    const moves = new Map<string, THREE.Vector3>();
    for (const id of roots) {
      const inst = this.instances.get(id);
      if (!inst) continue;
      const world = inst.object.getWorldPosition(new THREE.Vector3());
      world.y = this.dropY(world.x, world.z, world.y + .01, exclude);
      moves.set(id, world);
    }
    if (!moves.size) return;
    const round = (v: number) => Math.round(v * 1000) / 1000;
    this.store.update(doc => {
      for (const [id, world] of moves) {
        const o = doc.objects.find(x => x.id === id);
        const inst = this.instances.get(id);
        if (!o || !inst) continue;
        const parent = inst.object.parent;
        const local = parent ? parent.worldToLocal(world.clone()) : world;
        o.transform.position = [round(local.x), round(local.y), round(local.z)];
      }
    });
  }

  // --- store sync ------------------------------------------------------------------

  private onStore = () => {
    const s = this.store.getState();
    if (s.doc !== this.lastDoc) {
      const bounds = terrainChangeBounds(this.lastDoc?.terrain, s.doc.terrain);
      this.field?.setTerrain(s.doc.terrain);
      if (bounds) this.terrain?.invalidate(bounds);
      this.syncObjects(s); this.lastDoc = s.doc;
    }
    this.grid.visible = s.layers.grid;
    if (this.terrain) this.terrain.group.visible = s.layers.terrain;
    if (this.buildings) this.buildings.group.visible = s.layers.stamps;
    this.syncGizmo(s);
    if (s.frameRequest !== this.lastFrameRequest) { this.lastFrameRequest = s.frameRequest; this.frameSelection(s); }
    const e = s.doc.environment;
    this.sun.color.set(e.sunColor); this.sun.intensity = e.sunIntensity;
    this.scene.background = new THREE.Color(e.skyColor);
    this.scene.fog = s.layers.fog && e.fogFar > e.fogNear ? new THREE.Fog(e.skyColor, e.fogNear, e.fogFar) : null;
  };

  private syncObjects(s: EditorState) {
    const alive = new Set<string>();
    for (const o of s.doc.objects) {
      alive.add(o.id);
      const signature = `${o.prefab}|${JSON.stringify(o.props)}|${JSON.stringify(o.components?.collider ?? null)}`;
      let inst = this.instances.get(o.id);
      if (inst && inst.signature !== signature) { this.detach(inst.object); inst = undefined; }
      if (!inst) {
        const object = instantiatePrefab(o.prefab, o.props);
        object.userData.sceneId = o.id;
        if (!object.children.length) object.add(Object.assign(new THREE.AxesHelper(.6), { userData: { editorOnly: true } }));
        const col = o.components?.collider;
        if (col?.enabled) object.add(colliderProxy(col));
        inst = { object, signature };
        this.instances.set(o.id, inst);
      }
      this.applyTransform(inst.object, o);
      inst.object.visible = o.visible;
    }
    for (const [id, inst] of this.instances) if (!alive.has(id)) { this.detach(inst.object); this.instances.delete(id); }
    // Attach after every instance exists so children can find their parents.
    for (const o of s.doc.objects) {
      const inst = this.instances.get(o.id)!;
      const parent = (o.parent && this.instances.get(o.parent)?.object) || this.objects;
      if (inst.object.parent !== parent) parent.add(inst.object);
    }
  }

  private detach(object: THREE.Object3D) {
    if (this.gizmo.object === object) this.gizmo.detach();
    // Keep children alive — they're re-attached by syncObjects if still in the doc.
    for (const child of [...object.children]) if (child.userData.sceneId) this.objects.add(child);
    disposeObject(object);
  }

  private applyTransform(object: THREE.Object3D, o: SceneObject) {
    const { position: p, rotation: r, scale: sc } = o.transform;
    object.position.set(p[0], p[1], p[2]);
    object.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
    object.scale.set(sc[0], sc[1], sc[2]);
  }

  /** Attach the gizmo to a non-doc object (e.g. a rig bone in Characters
   * mode). Pass null to return to selection-driven behavior. */
  setGizmoOverride(object: THREE.Object3D | null, onWrite?: (t: SceneTransform) => void) {
    this.gizmoOverride = object ? { object, onWrite } : null;
    this.syncGizmo(this.store.getState());
  }

  /** Current camera focus point — preview modes anchor their stage there. */
  getPivot(): THREE.Vector3 { return this.pivot.clone(); }

  /** Aim the camera at an object (Characters/Effects previews). */
  frameObject(object: THREE.Object3D, distance = 5) {
    object.updateWorldMatrix(true, true); // setFromObject only updates the subtree
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) box.getCenter(this.pivot);
    this.distance = distance;
    this.applyCamera();
  }

  private syncGizmo(s: EditorState) {
    if (this.gizmoOverride) {
      if (this.gizmo.object !== this.gizmoOverride.object) this.gizmo.attach(this.gizmoOverride.object);
      this.gizmoTarget = null;
      this.gizmo.setMode(s.tool === "view" ? "translate" : s.tool === "move" ? "translate" : s.tool);
      this.gizmo.setSpace(s.space);
      this.gizmo.setTranslationSnap(s.snap ? s.snapMove : null);
      this.gizmo.setRotationSnap(s.snap ? s.snapRotate * DEG : null);
      this.gizmo.setScaleSnap(s.snap ? s.snapScale : null);
      this.gizmo.enabled = true;
      return;
    }
    const target = this.terrainBrush || s.tool === "view" || s.selection.length !== 1 ? null : s.selection[0];
    const object = target ? this.instances.get(target)?.object : undefined;
    if (!object) { if (this.gizmo.object) this.gizmo.detach(); this.gizmoTarget = null; }
    else if (this.gizmo.object !== object) { this.gizmo.attach(object); this.gizmoTarget = target; }
    this.gizmo.setMode(s.tool === "view" ? "translate" : s.tool === "move" ? "translate" : s.tool);
    this.gizmo.setSpace(s.space);
    this.gizmo.setTranslationSnap(s.snap ? s.snapMove : null);
    this.gizmo.setRotationSnap(s.snap ? s.snapRotate * DEG : null);
    this.gizmo.setScaleSnap(s.snap ? s.snapScale : null);
    this.gizmo.enabled = !!object;
  }

  private writeGizmo() {
    const object = this.gizmo.object;
    if (!object || !this.gizmo.dragging) return;
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const t: SceneTransform = {
      position: [round(object.position.x), round(object.position.y), round(object.position.z)],
      rotation: [round(object.rotation.x / DEG), round(object.rotation.y / DEG), round(object.rotation.z / DEG)],
      scale: [round(object.scale.x), round(object.scale.y), round(object.scale.z)],
    };
    if (!this.gizmoTarget) { this.gizmoOverride?.onWrite?.(t); return; }
    this.store.setTransformTransient(this.gizmoTarget, t);
  }

  private frameSelection(s: EditorState) {
    const box = new THREE.Box3();
    const targets = s.selection.length ? s.selection : [...this.instances.keys()];
    for (const id of targets) { const inst = this.instances.get(id); if (inst) box.expandByObject(inst.object); }
    if (box.isEmpty()) return;
    box.getCenter(this.pivot);
    // Cap so framing far-flung siblings never pushes the camera beyond the streamed terrain window.
    this.distance = THREE.MathUtils.clamp(box.getSize(new THREE.Vector3()).length() * 1.4, 2, 120);
    this.applyCamera();
  }

  // --- camera -------------------------------------------------------------------------

  private forward() {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }
  private applyCamera() {
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
    this.distance = THREE.MathUtils.clamp(this.distance, .5, 200);
    this.camera.position.copy(this.pivot).addScaledVector(this.forward(), -this.distance);
    this.camera.lookAt(this.pivot);
    this.camera.updateMatrixWorld();
  }
  private fly(dt: number) {
    if (!this.buttons.right || !this.flyKeys.size) return;
    const speed = (this.flyKeys.has("shift") ? 3 : 1) * Math.max(4, this.distance * .6) * dt;
    const f = this.forward(), right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3();
    if (this.flyKeys.has("w")) move.add(f);
    if (this.flyKeys.has("s")) move.sub(f);
    if (this.flyKeys.has("d")) move.add(right);
    if (this.flyKeys.has("a")) move.sub(right);
    if (this.flyKeys.has("e")) move.y += 1;
    if (this.flyKeys.has("q")) move.y -= 1;
    if (move.lengthSq()) { this.pivot.addScaledVector(move.normalize(), speed); this.applyCamera(); }
  }

  private onResize = () => {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  };

  private ndc(e: { clientX: number; clientY: number }) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2);
  }

  private onPointerDown = (e: PointerEvent) => {
    this.renderer.domElement.focus();
    this.pointer = { x: e.clientX, y: e.clientY, downX: e.clientX, downY: e.clientY };
    this.buttons.alt = e.altKey;
    if (e.button === 0) this.buttons.left = true;
    if (e.button === 1) { this.buttons.middle = true; e.preventDefault(); }
    if (e.button === 2) this.buttons.right = true;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    if (e.button === 0 && !e.altKey && this.terrainBrush) {
      this.updateBrushPoint(e);
      if (this.brushPoint) { this.store.beginDrag(); this.brushStroke = true; this.paintTerrain(.05); }
      e.preventDefault();
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const dx = e.clientX - this.pointer.x, dy = e.clientY - this.pointer.y;
    this.pointer.x = e.clientX; this.pointer.y = e.clientY;
    this.updateBrushPoint(e);
    if (this.gizmo.dragging) return;
    if (this.buttons.right) {
      // Look: rotate the view around the camera's own position.
      const eye = this.camera.position.clone();
      this.yaw -= dx * .0045; this.pitch += dy * .0045;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
      this.pivot.copy(eye).addScaledVector(this.forward(), this.distance);
      this.applyCamera();
    } else if (this.buttons.middle) {
      const scale = this.distance * .0018;
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.pivot.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
      this.applyCamera();
    } else if (this.buttons.left && this.buttons.alt) {
      this.yaw -= dx * .006; this.pitch += dy * .006;
      this.applyCamera();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const painted = this.brushStroke;
    if (e.button === 0 || e.type === "pointerleave" || e.type === "pointercancel") {
      if (painted && this.brushElapsed > 0) this.paintTerrain(this.brushElapsed);
      this.endBrushStroke();
    }
    const clicked = Math.hypot(e.clientX - this.pointer.downX, e.clientY - this.pointer.downY) < 4;
    if (!painted && !this.terrainBrush && e.type === "pointerup" && e.button === 0 && this.buttons.left && clicked && !this.buttons.alt && !this.gizmo.dragging && !this.gizmo.axis) this.pick(e);
    if (e.type === "pointerleave" || e.button === 0) this.buttons.left = false;
    if (e.type === "pointerleave" || e.button === 1) this.buttons.middle = false;
    if (e.type === "pointerleave" || e.button === 2) this.buttons.right = false;
    if (e.type === "pointerleave" || e.type === "pointercancel") { this.flyKeys.clear(); this.brushRing.visible = false; this.buttons = { left: false, middle: false, right: false, alt: false }; }
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) this.renderer.domElement.releasePointerCapture(e.pointerId);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance *= Math.exp(e.deltaY * .0012);
    this.applyCamera();
  };

  private pick(e: PointerEvent) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hit = this.raycaster.intersectObjects(this.objects.children, true).find(h => !h.object.userData.editorOnly);
    let node: THREE.Object3D | null = hit?.object ?? null;
    while (node && !node.userData.sceneId) node = node.parent;
    const id = node?.userData.sceneId as string | undefined;
    if (!id) { if (!e.shiftKey) this.store.select([]); return; }
    if (e.shiftKey) this.store.toggleSelect(id); else this.store.select([id]);
  }

  /** World point under a client position: with `surfaces`, any drop target
   * (objects, buildings, terrain); otherwise terrain, then the y=0 plane. */
  private dropPoint(e: { clientX: number; clientY: number }, surfaces = false): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    if (surfaces) {
      const hit = this.raycaster.intersectObjects(this.dropTargets(), true).find(h => !h.object.userData.editorOnly && !h.object.userData.triggerOnly);
      if (hit) return hit.point;
    }
    const ground = this.terrain ? this.raycaster.intersectObjects(this.terrain.ground)[0] : undefined;
    if (ground) return ground.point;
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  }

  private onDragOver = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes(PREFAB_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
  };

  private onDrop = (e: DragEvent) => {
    const prefab = e.dataTransfer?.getData(PREFAB_MIME);
    if (!prefab) return;
    e.preventDefault();
    const s = this.store.getState();
    const p = this.dropPoint(e, s.dropToSurface);
    if (!p) return;
    const snap = (v: number) => (s.snap ? Math.round(v / s.snapMove) * s.snapMove : Math.round(v * 100) / 100);
    const x = snap(p.x), z = snap(p.z);
    const y = s.dropToSurface ? this.dropY(x, z, p.y + .01) : this.groundHeight(x, z);
    this.store.addObject(prefab, [x, Math.round(y * 1000) / 1000, z]);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (isEditable(e.target)) return;
    const key = e.key.toLowerCase();
    if (this.buttons.right) { this.flyKeys.add(key); e.preventDefault(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && key === "z") { e.preventDefault(); this.endBrushStroke(); if (e.shiftKey) this.store.redo(); else this.store.undo(); return; }
    if (mod && key === "y") { e.preventDefault(); this.endBrushStroke(); this.store.redo(); return; }
    if (mod && key === "d") { e.preventDefault(); this.store.duplicateSelected(); return; }
    if (mod) return;
    switch (key) {
      case "q": this.store.setTool("view"); break;
      case "w": this.store.setTool("move"); break;
      case "e": this.store.setTool("rotate"); break;
      case "r": this.store.setTool("scale"); break;
      case "x": this.store.setSpace(this.store.getState().space === "world" ? "local" : "world"); break;
      case "f": this.store.requestFrame(); break;
      case "delete": case "backspace": this.store.deleteSelected(); break;
      case "escape": this.store.select([]); break;
      default: return;
    }
    e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => { this.flyKeys.delete(e.key.toLowerCase()); };
  private onBlur = () => { this.endBrushStroke(); this.brushRing.visible = false; this.flyKeys.clear(); this.buttons = { left: false, middle: false, right: false, alt: false }; };

  // --- frame loop --------------------------------------------------------------------

  private tick = (now: number) => {
    if (this.disposed) return;
    const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, .05) : 0; this.lastTime = now;
    this.fly(dt);
    if (this.brushStroke) {
      this.brushElapsed += dt;
      if (this.brushElapsed >= .05) { this.paintTerrain(this.brushElapsed); this.brushElapsed = 0; }
    }
    if (this.terrain) this.terrain.update(this.pivot.x / WORLD_SCALE, this.pivot.z / WORLD_SCALE, now / 1000);
    this.onFrame(dt, now / 1000);
    this.grid.position.set(Math.round(this.pivot.x), this.groundHeight(this.pivot.x, this.pivot.z) + .01, Math.round(this.pivot.z));
    this.sun.position.copy(this.pivot).add(new THREE.Vector3(-16, 25, 12)); this.sun.target.position.copy(this.pivot);
    // Selection outlines follow their objects every frame (cheap for a handful).
    const s = this.store.getState();
    while (this.selectionBoxes.length > s.selection.length) { const b = this.selectionBoxes.pop()!; this.scene.remove(b); b.dispose(); }
    s.selection.forEach((id, i) => {
      const inst = this.instances.get(id);
      if (!inst) return;
      let box = this.selectionBoxes[i];
      if (!box) { box = new THREE.BoxHelper(inst.object, 0xffa726); this.selectionBoxes[i] = box; this.scene.add(box); }
      else box.setFromObject(inst.object);
    });
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };

  dispose() {
    this.endBrushStroke();
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.unsubscribe();
    this.resize.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.gizmo.detach(); this.gizmo.dispose();
    disposeObject(this.brushRing);
    disposeObject(this.stage);
    this.terrain?.dispose(); this.buildings?.dispose();
    for (const inst of this.instances.values()) disposeObject(inst.object);
    for (const b of this.selectionBoxes) b.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
