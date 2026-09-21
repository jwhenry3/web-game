import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { uiOwnsKeyboard, useGame } from "../state/store";
import { net } from "../net/socket";
import { mergeKeybinds } from "../input/keybinds";
import { clearWorldLocalPos, setWorldLocalPos } from "../world/worldLocalPos";
import { clearWorldViewRect, setWorldViewRect } from "../world/viewRect";
import { clearEntityOverlays, setWorldOverlays, type EntityOverlayMark, type PoiLabelMark, type InteractPromptMark } from "../world/entityOverlayBridge";
import { canShowWorldInteractPrompts, interactKeyLabel } from "../world/interact";
import { findPath, type PathPoint } from "../world/pathfind";
import { WorldHeightmap, WORLD_SCALE, WORLD_ZOOM } from "./heightmap";
import { TerrainWorld, disposeObject } from "./terrain";
import { childrenByParent, type Scene3DDoc, type SceneObject } from "./scene3d";
import { instantiatePrefab } from "./prefabs";
import { actorSignature, animateActor, createActor, WorldEffects, type Actor3D } from "./actors";
import { loadRigLibrary } from "./rigBuilder";
import { vfxCategoryForAction } from "../phaser/battleVfxProfiles";
import { WorldBuildings } from "./props";
import { movementYaw, MovementKeys } from "./motion";
import { JUMP_VELOCITY, newBody3D, overworldPhysics3D, reconcileBody3D, type Body3D, type PhysicsWorld3D } from "./physics3d";

type State = ReturnType<typeof useGame.getState>;
type Poi = { root: THREE.Group; label: string; variant: PoiLabelMark["variant"]; x: number; y: number; spin?: THREE.Mesh };

export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48, 1, .1, 120);
  private controls: OrbitControls;
  private sun = new THREE.DirectionalLight(0xffe5b7, 2.6);
  private terrain?: TerrainWorld;
  private buildings?: WorldBuildings;
  private sceneObjects?: THREE.Group;
  private effects = new WorldEffects();
  private actors = new Map<string, Actor3D>();
  private pois = new Map<string, Poi>();
  private keys = new MovementKeys();
  private path: PathPoint[] = [];
  private position: PathPoint | null = null;
  private physics?: PhysicsWorld3D;
  private body: Body3D | null = null;
  private jumpQueued = false;
  private mapId = "";
  private selfId: string | null = null;
  private cells = "";
  private layers?: State["mapInfo"];
  private lastTime = 0;
  private lastSent = 0;
  private lastOverlay = 0;
  private lastEvent = 0;
  private lastAuthority = "";
  private frame = 0;
  private moving = false;
  private disposed = false;
  private resize: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private pointerDown = { x: 0, y: 0 };
  private stepFxAt = 0;
  private dashUntil = 0;
  private dashReady = 0;
  private direction = { x: 0, y: 0 };
  private shiftChord = false;
  private resetCamera = true;
  private camOptSig = "";
  private castFx = new Map<string, () => void>();

  constructor(private host: HTMLDivElement, private onError: (message: string) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.domElement.setAttribute("aria-label", "3D game world. WASD to move, drag right mouse to orbit, scroll to zoom.");
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xbccdd0);
    this.scene.fog = new THREE.Fog(0xbccdd0, 28, 65);
    this.scene.add(new THREE.HemisphereLight(0xc9e4ee, 0x716646, 2), this.sun, this.sun.target, this.effects.group);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 85 });
    this.sun.shadow.bias = -.0003;
    this.sun.shadow.normalBias = .035;
    this.camera.position.set(9, 12, 13);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 7; this.controls.maxDistance = 45;
    this.controls.minPolarAngle = .3; this.controls.maxPolarAngle = 1.5;
    this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.resize = new ResizeObserver(this.onResize); this.resize.observe(host); this.onResize();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    this.lastEvent = useGame.getState().combatEvents.at(-1)?.seq ?? 0;
    void loadRigLibrary();
    this.frame = requestAnimationFrame(this.tick);
  }

  private onResize = () => {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  };
  private onContextLost = (event: Event) => { event.preventDefault(); this.onError("The graphics context was lost. Reload the 3D view or switch to 2D."); };
  private onBlur = () => { this.keys.clear(); this.path = []; this.shiftChord = false; this.dashUntil = 0; this.jumpQueued = false; };
  private onVisibility = () => { if (document.hidden) this.onBlur(); this.lastTime = 0; };
  private onKeyDown = (event: KeyboardEvent) => {
    if (uiOwnsKeyboard() || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.shiftKey && event.key !== "Shift") this.shiftChord = true;
    if (event.key === " ") this.jumpQueued = true;
    this.keys.down(event.key);
  };
  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.up(event.key);
    if (event.key !== "Shift") return;
    const state = useGame.getState(), self = state.selfId ? state.entities[state.selfId] : undefined;
    const now = performance.now();
    if (!this.shiftChord && !uiOwnsKeyboard() && state.connected && self?.alive && !self.in_house && (self.stamina ?? 100) >= 25 && now > this.dashReady && this.moving) {
      this.dashReady = now + 500; this.dashUntil = now + 180; this.path = [];
      net.dodge();
      if (this.position && this.terrain) this.effects.burst(this.worldPoint(this.position.x, this.position.y), 0xb4e1ed);
    }
    this.shiftChord = false;
  };
  private onPointerDown = (event: PointerEvent) => { this.pointerDown = { x: event.clientX, y: event.clientY }; };
  private onPointerUp = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y) > 5 || uiOwnsKeyboard()) return;
    const state = useGame.getState();
    if (event.button === 2) { this.path = []; state.setSelectedAction(null); state.setCommandPetId(null); if (state.connected) net.setTarget(""); return; }
    if (event.button !== 0 || !this.position || !this.terrain || !state.connected) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), this.camera);
    const hit = this.raycaster.intersectObjects([...this.actors.values()].map(a => a.root), true)[0];
    if (hit) {
      let node: THREE.Object3D | null = hit.object;
      while (node && !node.userData.entityId) node = node.parent;
      const entity = node ? state.entities[node.userData.entityId] : undefined;
      if (entity) { this.path = []; net.clickEntity(entity); return; }
    }
    const ground = this.raycaster.intersectObjects(this.terrain.ground)[0];
    if (!ground) return;
    this.path = findPath(state.overworld, this.position.x, this.position.y, ground.point.x / WORLD_SCALE, ground.point.z / WORLD_SCALE) ?? [];
    if (this.path.length) { const end = this.path.at(-1)!; this.effects.burst(this.worldPoint(end.x, end.y), 0xe9d19b); }
  };

  private worldPoint(x: number, y: number, height = 0) {
    return new THREE.Vector3(x * WORLD_SCALE, (this.terrain?.field.height(x, y) ?? 0) + height, y * WORLD_SCALE);
  }

  private cameraOffset(options: State["options"], azimuth = this.controls.getAzimuthalAngle()) {
    return new THREE.Vector3().setFromSphericalCoords(
      THREE.MathUtils.clamp(options.cameraDistance, 8, 45),
      THREE.MathUtils.degToRad(THREE.MathUtils.clamp(options.cameraPitch, 20, 80)),
      azimuth);
  }

  /** Re-derive the orbit offset when the camera options change; free orbiting is untouched otherwise. */
  private applyCameraOptions(options: State["options"]) {
    const sig = `${options.cameraDistance}|${options.cameraPitch}`;
    if (sig === this.camOptSig) return;
    this.camOptSig = sig;
    this.camera.position.copy(this.controls.target).add(this.cameraOffset(options));
  }

  /** Instantiate the authored scene layer (prefabs, lights) under the doc's hierarchy. */
  private buildSceneObjects(doc: Scene3DDoc): THREE.Group {
    const group = new THREE.Group();
    const kids = childrenByParent(doc);
    const DEG = Math.PI / 180;
    const spawn = (o: SceneObject, parent: THREE.Object3D) => {
      const node = instantiatePrefab(o.prefab, o.props);
      const { position: p, rotation: r, scale: s } = o.transform;
      node.position.set(p[0], p[1], p[2]);
      node.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
      node.scale.set(s[0], s[1], s[2]);
      node.visible = o.visible;
      node.userData.sceneId = o.id;
      parent.add(node);
      for (const child of kids.get(o.id) ?? []) spawn(child, node);
    };
    for (const o of kids.get("") ?? []) spawn(o, group);
    return group;
  }

  private syncMap(state: State) {
    const map = state.overworld;
    if (!map) return;
    const id = state.mapInfo?.id ?? "world";
    const doc = state.mapInfo?.scene3d;
    if (this.terrain && this.mapId === id && this.cells === map.cells && this.layers?.terrainLayers === state.mapInfo?.terrainLayers && this.layers?.scene3d === doc && this.terrain.field.map.cols === map.cols && this.terrain.field.map.rows === map.rows && this.terrain.field.map.tile === map.tile) return;
    this.terrain?.dispose(); this.buildings?.dispose();
    if (this.sceneObjects) { this.scene.remove(this.sceneObjects); disposeObject(this.sceneObjects); this.sceneObjects = undefined; }
    for (const actor of this.actors.values()) disposeObject(actor.root); this.actors.clear();
    for (const poi of this.pois.values()) disposeObject(poi.root); this.pois.clear();
    this.effects.dispose(); this.effects = new WorldEffects(); this.scene.add(this.effects.group);
    for (const stop of this.castFx.values()) stop(); this.castFx.clear();
    this.mapId = id; this.cells = map.cells; this.layers = state.mapInfo;
    const field = new WorldHeightmap(map, state.mapInfo?.terrainLayers, doc?.terrain);
    this.terrain = new TerrainWorld(field); this.scene.add(this.terrain.group);
    this.physics = overworldPhysics3D(field, doc);
    this.buildings = new WorldBuildings(id, field); this.scene.add(this.buildings.group);
    if (doc) {
      const env = doc.environment;
      this.sun.color.set(env.sunColor); this.sun.intensity = env.sunIntensity;
      const sky = new THREE.Color(env.skyColor);
      this.scene.background = sky;
      this.scene.fog = new THREE.Fog(sky, env.fogNear, env.fogFar);
      this.sceneObjects = this.buildSceneObjects(doc); this.scene.add(this.sceneObjects);
    }
    this.position = null; this.body = null; this.path = []; this.lastAuthority = ""; this.resetCamera = true; this.jumpQueued = false;
    this.lastEvent = state.combatEvents.at(-1)?.seq ?? 0;
  }

  private move(state: State, dt: number, now: number) {
    const self = state.selfId ? state.entities[state.selfId] : undefined;
    if (!self || !state.overworld) return;
    if (!this.position || !this.body || this.selfId !== self.id) {
      const z = Number.isFinite(self.z) ? self.z : (this.physics?.heightAt(self.x, self.y) ?? 0);
      this.body = newBody3D(self.x, self.y, z);
      this.body.grounded = self.grounded !== false;
      this.position = { x: self.x, y: self.y };
      this.selfId = self.id; this.resetCamera = true; this.lastAuthority = "";
    }
    const body = this.body;
    // Reconcile predicted physics against each new authoritative snapshot.
    const authority = `${self.x},${self.y},${self.z},${self.grounded}`;
    if (authority !== this.lastAuthority) {
      if (reconcileBody3D(body, self) === "snap") {
        this.path = []; this.dashUntil = 0; this.resetCamera = true;
      }
      this.lastAuthority = authority;
    }
    const old = { x: body.pos.x, y: body.pos.y, z: body.pos.z };
    let dx = 0, dy = 0, jump = false;
    const allowed = state.screen === "world" && state.connected && !state.transition && self.alive && !self.in_house && !uiOwnsKeyboard();
    if (allowed) {
      const binds = mergeKeybinds(state.profile?.keybinds);
      const { x: horizontal, y: vertical } = this.keys.read(binds);
      const yaw = this.controls.getAzimuthalAngle();
      dx = horizontal * Math.cos(yaw) + vertical * Math.sin(yaw);
      dy = -horizontal * Math.sin(yaw) + vertical * Math.cos(yaw);
      if (dx || dy) this.path = [];
      else if (this.path.length) {
        while (this.path.length && Math.hypot(this.path[0].x - old.x, this.path[0].y - old.y) < 5) this.path.shift();
        if (this.path.length) { dx = this.path[0].x - old.x; dy = this.path[0].y - old.y; }
      }
      const dashing = now < this.dashUntil;
      if (dashing) { dx = this.direction.x; dy = this.direction.y; }
      if (this.jumpQueued) {
        this.jumpQueued = false;
        if (body.grounded) { body.velZ = JUMP_VELOCITY; body.grounded = false; jump = true; }
      }
      if (dx || dy) {
        const len = Math.hypot(dx, dy); this.direction = { x: dx / len, y: dy / len };
        const speed = dashing ? 64 / .18 : 180 * (self.mounted ? 1.25 : 1);
        this.physics?.move(body, body.pos.x + this.direction.x * speed * dt, body.pos.y + this.direction.y * speed * dt, dt);
        if (this.path.length && body.pos.x === old.x && body.pos.y === old.y) this.path = [];
      } else {
        this.physics?.move(body, body.pos.x, body.pos.y, dt);
      }
    } else {
      this.keys.clear(); this.path = []; this.dashUntil = 0; this.jumpQueued = false;
      // The server integrates gravity even without input — keep landing while
      // airborne with a dialog open or during a screen transition.
      this.physics?.move(body, body.pos.x, body.pos.y, dt);
    }
    this.position = { x: body.pos.x, y: body.pos.y };
    const moved = Math.hypot(body.pos.x - old.x, body.pos.y - old.y) > .01;
    if (state.connected && (jump || (moved && now - this.lastSent >= 100) || (!moved && this.moving))) {
      net.move(Math.round(body.pos.x), Math.round(body.pos.y), movementYaw(this.direction.x, this.direction.y), jump, body.pos.z);
      this.lastSent = now;
    }
    this.moving = moved;
    setWorldLocalPos(this.position.x, this.position.y);
    if (moved && now > this.stepFxAt && now < this.dashUntil) { this.effects.burst(this.worldPoint(old.x, old.y), 0xb6d3dc); this.stepFxAt = now + 90; }
  }

  private syncActors(state: State, dt: number, time: number) {
    if (!this.position) return;
    const active = new Set<string>();
    for (const entity of Object.values(state.entities)) {
      const self = entity.id === state.selfId;
      if (entity.in_house || (!self && Math.hypot(entity.x - this.position.x, entity.y - this.position.y) > 1800)) continue;
      active.add(entity.id);
      let actor = this.actors.get(entity.id);
      if (actor && actor.signature !== actorSignature(entity)) { disposeObject(actor.root); this.actors.delete(entity.id); actor = undefined; }
      const point = self ? this.position : entity;
      const target = this.worldPoint(point.x, point.y);
      if (!actor) { actor = createActor(entity, self); actor.root.position.copy(target); this.actors.set(entity.id, actor); this.scene.add(actor.root); }
      const old = actor.root.position.clone();
      if (self || old.distanceTo(target) > 8 * WORLD_ZOOM) actor.root.position.copy(target);
      else actor.root.position.lerp(target, 1 - Math.exp(-dt * 12));
      // Server Z (map px) is authoritative for airborne remote entities;
      // grounded actors ride the client heightmap so prediction stays smooth.
      // The local player renders its predicted body Z instead.
      const groundY = this.terrain!.field.height(actor.root.position.x / WORLD_SCALE, actor.root.position.z / WORLD_SCALE);
      const feetZ = self && this.body ? this.body.pos.z : entity.z;
      actor.root.position.y = Number.isFinite(feetZ) ? Math.max(groundY, feetZ * WORLD_SCALE) : groundY;
      const delta = actor.root.position.clone().sub(old).divideScalar(WORLD_SCALE);
      if (delta.lengthSq() > .01) actor.root.rotation.y = Math.atan2(delta.x, delta.z);
      animateActor(actor, self ? this.moving : delta.lengthSq() > .02, time, entity.alive, dt);
      const focus = state.selfId ? state.entities[state.selfId]?.target_id : undefined;
      actor.ring.visible = self || entity.id === focus;
      const casting = entity.alive && !!entity.casting_skill_id;
      if (casting && !this.castFx.has(entity.id)) {
        this.castFx.set(entity.id, this.effects.startCastCategory(vfxCategoryForAction(entity.casting_skill_id!), actor.root));
      } else if (!casting && this.castFx.has(entity.id)) {
        this.castFx.get(entity.id)!(); this.castFx.delete(entity.id);
      }
    }
    for (const [id, actor] of this.actors) if (!active.has(id)) { this.castFx.get(id)?.(); this.castFx.delete(id); disposeObject(actor.root); this.actors.delete(id); }
  }

  private syncPois(state: State, time: number) {
    if (!this.position) return;
    const active = new Set<string>();
    const entries = [
      ...Object.values(state.savePoints).map(p => ({ ...p, key: `save:${p.id}`, variant: "save" as const })),
      ...Object.values(state.jobChangers).map(p => ({ ...p, key: `job:${p.id}`, variant: "job" as const })),
      ...Object.values(state.camps).map(p => ({ ...p, name: `${p.owner_name}'s camp`, key: `camp:${p.owner_name}`, variant: "camp" as const })),
    ];
    for (const p of entries) {
      if (Math.hypot(p.x - this.position.x, p.y - this.position.y) > 1600) continue;
      active.add(p.key);
      let poi = this.pois.get(p.key);
      if (!poi) {
        const root = new THREE.Group();
        root.scale.setScalar(WORLD_ZOOM);
        const save = p.variant === "save";
        const base = new THREE.Mesh(new THREE.CylinderGeometry(.45, .62, .26, 8), new THREE.MeshStandardMaterial({ color: 0x9c9c90 }));
        base.position.y = .13; base.castShadow = base.receiveShadow = true; root.add(base);
        const spin = new THREE.Mesh(save ? new THREE.OctahedronGeometry(.42) : new THREE.ConeGeometry(.65, 1.4, 4), new THREE.MeshStandardMaterial({ color: save ? 0x83e5e0 : 0xd5ad6c, emissive: save ? 0x2caaab : 0x382510, emissiveIntensity: save ? 1.1 : .2, roughness: .4, metalness: .15 }));
        spin.position.y = 1.2; spin.scale.y = save ? 1.7 : 1; spin.castShadow = true; root.add(spin);
        if (save) { const light = new THREE.PointLight(0x6bded4, 4, 4 * WORLD_ZOOM); light.position.y = 1.3; root.add(light); }
        poi = { root, label: p.name, variant: p.variant, x: p.x, y: p.y, spin: save ? spin : undefined };
        this.pois.set(p.key, poi); this.scene.add(root);
      }
      poi.x = p.x; poi.y = p.y; poi.label = p.name; poi.root.position.copy(this.worldPoint(p.x, p.y));
      if (poi.spin) { poi.spin.rotation.y = time * .5; poi.spin.position.y = 1.2 + Math.sin(time * 2) * .12; }
    }
    for (const [id, poi] of this.pois) if (!active.has(id)) { disposeObject(poi.root); this.pois.delete(id); }
  }

  private overlays(state: State) {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const project = (position: THREE.Vector3) => { const p = position.clone().project(this.camera); return { x: (p.x + 1) * w / 2, y: (1 - p.y) * h / 2, visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 }; };
    const entities: EntityOverlayMark[] = [], pois: PoiLabelMark[] = [], interacts: InteractPromptMark[] = [];
    for (const [id, actor] of this.actors) {
      const entity = state.entities[id]; if (!entity) continue;
      const feet = project(actor.root.position), head = project(actor.root.position.clone().add(new THREE.Vector3(0, 1.85, 0)));
      if (!head.visible) continue;
      const self = id === state.selfId;
      entities.push({ id, label: entity.name, variant: self ? "self" : entity.kind === "npc" && !entity.is_ally ? "enemy" : "player", screenX: feet.x, screenY: feet.y, nameX: head.x, nameY: head.y, castX: feet.x, castY: feet.y + 12, castPct: entity.casting_skill_id ? entity.cast_progress ?? 0 : undefined, hp: entity.hp < entity.max_hp || entity.engaged ? { value: entity.hp, max: entity.max_hp } : undefined, statuses: entity.statuses, targeted: !!state.selfId && state.entities[state.selfId]?.target_id === id });
    }
    for (const [id, poi] of this.pois) {
      const p = project(poi.root.position.clone().add(new THREE.Vector3(0, 2.25 * WORLD_ZOOM, 0))); if (!p.visible) continue;
      pois.push({ id, label: poi.label, variant: poi.variant, x: p.x, y: p.y });
      if (this.position && canShowWorldInteractPrompts(state) && Math.hypot(poi.x - this.position.x, poi.y - this.position.y) <= 80) interacts.push({ id, keyLabel: interactKeyLabel(state.profile?.keybinds), x: p.x, y: p.y - 24 });
    }
    setWorldOverlays({ entities, pois, interacts });
    // Conservative ground frustum bounds for keyboard target cycling.
    const points: THREE.Vector3[] = [];
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.controls.target.y - .6));
    for (const x of [-1, 1]) for (const y of [-1, 1]) { this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera); const p = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3()); if (p) points.push(p); }
    if (points.length === 4) { const box = new THREE.Box3().setFromPoints(points); setWorldViewRect(box.min.x / WORLD_SCALE, box.min.z / WORLD_SCALE, (box.max.x - box.min.x) / WORLD_SCALE, (box.max.z - box.min.z) / WORLD_SCALE); }
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    try {
      const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, .05) : 0; this.lastTime = now;
      const state = useGame.getState(); this.syncMap(state); this.move(state, dt, now);
      if (this.position && this.terrain) {
        this.terrain.update(this.position.x, this.position.y, now / 1000, this.camera);
        this.syncActors(state, dt, now / 1000); this.syncPois(state, now / 1000);
        const o = state.options;
        const target = this.worldPoint(this.position.x, this.position.y, .6);
        const ox = THREE.MathUtils.clamp(o.cameraOffsetX, -10, 10), oy = THREE.MathUtils.clamp(o.cameraOffsetY, -10, 10);
        if (ox || oy) target.add(new THREE.Vector3(ox, oy, 0).applyQuaternion(this.camera.quaternion));
        if (this.resetCamera) {
          this.controls.target.copy(target);
          this.camera.position.copy(target).add(this.cameraOffset(o, Math.atan2(10, 15)));
          this.camOptSig = `${o.cameraDistance}|${o.cameraPitch}`;
          this.resetCamera = false;
        }
        this.applyCameraOptions(o);
        const next = this.controls.target.clone().lerp(target, 1 - Math.exp(-dt * 9));
        this.camera.position.add(next.clone().sub(this.controls.target)); this.controls.target.copy(next); this.controls.update();
        this.sun.position.copy(target).add(new THREE.Vector3(-16, 25, 12)); this.sun.target.position.copy(target);
        for (const event of state.combatEvents) if (event.seq > this.lastEvent) {
          this.lastEvent = event.seq;
          if (event.cast_cancelled) continue;
          const target = this.actors.get(event.target_id || event.attacker_id);
          if (!target) continue;
          const from = event.target_id && event.attacker_id !== event.target_id ? this.actors.get(event.attacker_id)?.root.position : undefined;
          this.effects.playCategory(vfxCategoryForAction(event.action_id ?? "attack", event.heal), target.root.position, from);
        }
        this.effects.update(dt); this.camera.updateMatrixWorld();
        if (now - this.lastOverlay > 50) { this.overlays(state); this.lastOverlay = now; }
      }
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(this.tick);
    } catch (error) { this.onError(error instanceof Error ? error.message : String(error)); }
  };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.resize.disconnect(); this.controls.dispose();
    window.removeEventListener("keydown", this.onKeyDown); window.removeEventListener("keyup", this.onKeyUp); window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown); this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp); this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.terrain?.dispose(); this.buildings?.dispose(); this.effects.dispose();
    for (const actor of this.actors.values()) disposeObject(actor.root);
    for (const poi of this.pois.values()) disposeObject(poi.root);
    this.sun.shadow.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
    clearEntityOverlays(); clearWorldLocalPos(); clearWorldViewRect();
  }
}
