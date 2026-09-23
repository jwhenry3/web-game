import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { uiOwnsKeyboard, useGame } from "../state/store";
import { net } from "../net/socket";
import { bindingMatchesEvent, mergeKeybinds } from "../input/keybinds";
import { clearWorldLocalPos, setWorldLocalPos } from "../world/worldLocalPos";
import { clearWorldViewRect, setWorldViewRect } from "../world/viewRect";
import { EntityMark, TextMark, setInteractPrompt, setPoiLabel, unitPerPixel, type PoiMarkVariant } from "./marks";
import { canShowWorldInteractPrompts, interactKeyLabel } from "../world/interact";
import { findPath, type PathPoint } from "../world/pathfind";
import { WorldHeightmap, WORLD_SCALE, WORLD_ZOOM } from "./heightmap";
import { TerrainWorld, disposeObject } from "./terrain";
import { childrenByParent, type Scene3DDoc, type SceneObject } from "./scene3d";
import { instantiatePrefab } from "./prefabs";
import { actorSignature, animateActor, createActor, WorldEffects, type Actor3D } from "./actors";
import { buildRig, getRig, loadRigLibrary, type RigInstance } from "./rigBuilder";
import { npcAppearance } from "../characters/npcs";
import { vfxCategoryForAction } from "../vfx/battleVfxProfiles";
import { rigClipForAction } from "../editor/skillAnimations";
import { WorldBuildings } from "./props";
import { movementYaw, MovementKeys } from "./motion";
import { JUMP_VELOCITY, newBody3D, overworldPhysics3D, reconcileBody3D, type Body3D, type PhysicsWorld3D } from "./physics3d";

type State = ReturnType<typeof useGame.getState>;
type Poi = { root: THREE.Group; label: string; variant: PoiMarkVariant; x: number; y: number; spin?: THREE.Mesh; rig?: RigInstance };
type PoiMark = { anchor: THREE.Group; label: TextMark; prompt: TextMark };

const LOCK_ORBIT_LIMIT = Math.PI / 6;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

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
  private markLayer = new THREE.Group();
  private entityMarks = new Map<string, EntityMark>();
  private poiMarks = new Map<string, PoiMark>();
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
  private lockOn = false;
  private lockInit = false;
  private lockOffset = 0;
  private lockAxis = 0;
  private lockTheta = 0;
  private lastMoveYaw = 0;
  private resetCamera = true;
  private camOptSig = "";
  private castFx = new Map<string, () => void>();
  private castTethers = new Map<string, { targetId: string; stop: () => void }>();
  private prevEngaged = new Map<string, boolean>();
  /** Last `alive` value seen per entity — the server omits hidden pets/NPCs
   * outright, so a despawn is only a death if a projection/combat event
   * showed the entity dead before it vanished. */
  private aliveSeen = new Map<string, boolean>();
  private dying = new Map<string, { actor: Actor3D; mats: THREE.Material[]; until: number }>();

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
    this.scene.add(new THREE.HemisphereLight(0xc9e4ee, 0x716646, 2), this.sun, this.sun.target, this.effects.group, this.markLayer);
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
    const state = useGame.getState();
    if (bindingMatchesEvent(mergeKeybinds(state.profile?.keybinds).target_lock ?? "h", event)) {
      event.preventDefault();
      this.toggleTargetLock(state);
      return;
    }
    if (event.shiftKey && event.key !== "Shift") this.shiftChord = true;
    if (event.key === " ") this.jumpQueued = true;
    this.keys.down(event.key);
  };

  /** FFXI-style target lock: the camera keeps the focus target framed until
   * it is released, lost, or the key is pressed again. */
  private toggleTargetLock(state: State) {
    if (this.lockOn) { this.lockOn = false; return; }
    const targetId = state.selfId ? state.entities[state.selfId]?.target_id : undefined;
    const target = targetId ? state.entities[targetId] : undefined;
    if (!target?.alive || target.in_house) return;
    this.lockOn = true;
    this.lockInit = false;
  }

  /** While locked, the camera anchor slides toward the target and the orbit
   * azimuth tracks the player→target axis. Orbit input becomes a persistent
   * offset around that axis (clamped to ±LOCK_ORBIT_LIMIT) instead of writing
   * the azimuth directly, so the user's bias sticks while moving — and the
   * player can't be rotated out of the viewport. */
  private updateLockCamera(state: State, dt: number) {
    if (!this.lockOn) return;
    const targetId = state.selfId ? state.entities[state.selfId]?.target_id : undefined;
    const actor = targetId ? this.actors.get(targetId) : undefined;
    const entity = targetId ? state.entities[targetId] : undefined;
    if (!this.position || !actor || !entity?.alive || entity.in_house) { this.lockOn = false; return; }
    const player = this.worldPoint(this.position.x, this.position.y, .6);
    const enemy = actor.root.position;
    const anchor = player.clone().lerp(enemy, .45);
    const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    const dx = player.x - enemy.x, dz = player.z - enemy.z;
    const hasAxis = dx * dx + dz * dz > .01;
    if (!this.lockInit) {
      // Seed from the live camera so engaging lock never snaps the view.
      this.lockOffset = THREE.MathUtils.clamp(wrapAngle(sph.theta - (hasAxis ? Math.atan2(dx, dz) : sph.theta)), -LOCK_ORBIT_LIMIT, LOCK_ORBIT_LIMIT);
      this.lockAxis = sph.theta - this.lockOffset;
      this.lockTheta = sph.theta;
      this.lockInit = true;
    }
    const orbitDelta = wrapAngle(sph.theta - this.lockTheta);
    this.lockTheta = sph.theta;
    this.lockOffset = THREE.MathUtils.clamp(this.lockOffset + orbitDelta, -LOCK_ORBIT_LIMIT, LOCK_ORBIT_LIMIT);
    if (hasAxis) this.lockAxis += wrapAngle(Math.atan2(dx, dz) - this.lockAxis) * (1 - Math.exp(-dt * 6));
    this.lockTheta += wrapAngle(this.lockAxis + this.lockOffset - this.lockTheta) * (1 - Math.exp(-dt * 8));
    this.lockTheta = this.lockAxis + THREE.MathUtils.clamp(wrapAngle(this.lockTheta - this.lockAxis), -LOCK_ORBIT_LIMIT, LOCK_ORBIT_LIMIT);
    sph.theta = this.lockTheta;
    this.controls.target.copy(anchor);
    this.camera.position.copy(anchor).add(new THREE.Vector3().setFromSpherical(sph));
  }

  /** Focus facing: while target-locked or casting, the player faces the
   * focus/cast target and strafes rather than turning with movement. */
  private faceTargetId(state: State): string | undefined {
    const self = state.selfId ? state.entities[state.selfId] : undefined;
    if (!self) return undefined;
    const id = self.casting_skill_id ? self.cast_target_id ?? self.target_id : this.lockOn ? self.target_id : undefined;
    const target = id ? state.entities[id] : undefined;
    return target?.alive && !target.in_house ? id : undefined;
  }
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

  private camViewSig = "";
  /** Persist the current orbit (distance/elevation/azimuth relative to the
   * follow target) into game state so map transitions restore the player's
   * view instead of snapping to the spawn default. Runs each tick after
   * controls.update() — OrbitControls' "end" event fires *before* wheel
   * dollies/damping land, so an event-time capture stores the pre-zoom
   * distance. Deduped on a rounded signature so it only writes while the
   * view is actually changing. */
  private syncCameraView() {
    const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    if (!Number.isFinite(sph.radius) || sph.radius <= 0) return;
    const sig = `${sph.radius.toFixed(2)}|${sph.phi.toFixed(3)}|${sph.theta.toFixed(3)}`;
    if (sig === this.camViewSig) return;
    this.camViewSig = sig;
    useGame.getState().setCameraView({ distance: sph.radius, pitch: sph.phi, azimuth: sph.theta });
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
    // Preserve the orbit the player left the previous map with — the camera
    // still holds it until `resetCamera` consumes it below.
    if (this.position) this.syncCameraView();
    this.terrain?.dispose(); this.buildings?.dispose();
    if (this.sceneObjects) { this.scene.remove(this.sceneObjects); disposeObject(this.sceneObjects); this.sceneObjects = undefined; }
    for (const actor of this.actors.values()) disposeObject(actor.root); this.actors.clear();
    for (const d of this.dying.values()) { this.scene.remove(d.actor.root); disposeObject(d.actor.root); } this.dying.clear();
    for (const poi of this.pois.values()) disposeObject(poi.root); this.pois.clear();
    this.effects.dispose(); this.effects = new WorldEffects(); this.scene.add(this.effects.group);
    for (const stop of this.castFx.values()) stop(); this.castFx.clear();
    this.aliveSeen.clear();
    this.clearMarks();
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
    } else {
      this.sun.color.set(0xffe5b7); this.sun.intensity = 2.6;
      this.scene.background = new THREE.Color(0xbccdd0);
      this.scene.fog = new THREE.Fog(0xbccdd0, 28, 65);
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
    const allowed = state.screen === "world" && state.connected && !state.transition && self.alive && !uiOwnsKeyboard();
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
        const speed = dashing ? 64 / .18 : 90 * (self.mounted ? 1.25 : 1);
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
    const focusEnt = state.entities[this.faceTargetId(state) ?? ""];
    const yaw = focusEnt ? movementYaw(focusEnt.x - body.pos.x, focusEnt.y - body.pos.y) : movementYaw(this.direction.x, this.direction.y);
    const facingShift = Math.abs(wrapAngle(yaw - this.lastMoveYaw)) > .05;
    if (state.connected && (jump || (moved && now - this.lastSent >= 100) || (!moved && this.moving) || (facingShift && now - this.lastSent >= 100))) {
      net.move(Math.round(body.pos.x), Math.round(body.pos.y), yaw, jump, body.pos.z);
      this.lastSent = now;
      this.lastMoveYaw = yaw;
    }
    this.moving = moved;
    setWorldLocalPos(this.position.x, this.position.y);
    if (moved && now > this.stepFxAt && now < this.dashUntil) { this.effects.burst(this.worldPoint(old.x, old.y), 0xb6d3dc); this.stepFxAt = now + 90; }
  }

  private syncActors(state: State, dt: number, time: number) {
    if (!this.position) return;
    const active = new Set<string>();
    for (const entity of Object.values(state.entities)) {
      this.aliveSeen.set(entity.id, entity.alive);
      const self = entity.id === state.selfId;
      if (entity.in_house || (!self && Math.hypot(entity.x - this.position.x, entity.y - this.position.y) > 1800)) continue;
      // Dead NPCs/pets drop out of `active` so the removal path fades the
      // corpse; dead players stay synced lying on their side until respawn.
      if (!entity.alive && entity.kind !== "player") continue;
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
      const focusId = self ? this.faceTargetId(state) : undefined;
      const focusEnt = focusId ? state.entities[focusId] : undefined;
      if (focusEnt) {
        const faceYaw = Math.atan2(focusEnt.x - point.x, focusEnt.y - point.y);
        actor.root.rotation.y += wrapAngle(faceYaw - actor.root.rotation.y) * (1 - Math.exp(-dt * 14));
      } else if (delta.lengthSq() > .01) actor.root.rotation.y = Math.atan2(delta.x, delta.z);
      if (self) setWorldLocalPos(this.position.x, this.position.y, actor.root.rotation.y);
      animateActor(actor, self ? this.moving : delta.lengthSq() > .02, time, entity.alive, dt);
      const focus = state.selfId ? state.entities[state.selfId]?.target_id : undefined;
      actor.ring.visible = self || entity.id === focus;
      const casting = entity.alive && !!entity.casting_skill_id;
      // Channel pose for the whole cast (mount carries the clip for riders).
      actor.rig.holdClip(casting ? "cast" : null);
      actor.rider?.holdClip(casting ? "cast" : null);
      if (casting && !this.castFx.has(entity.id)) {
        this.castFx.set(entity.id, this.effects.startCastCategory(vfxCategoryForAction(entity.casting_skill_id!), actor.root));
      } else if (!casting && this.castFx.has(entity.id)) {
        this.castFx.get(entity.id)!(); this.castFx.delete(entity.id);
      }
      // Intent ribbon actor → cast target for the duration of the cast.
      const castTargetId = casting ? (entity.cast_target_id ?? entity.target_id) : undefined;
      const castTarget = castTargetId && castTargetId !== entity.id
        ? (this.actors.get(castTargetId) ?? this.dying.get(castTargetId)?.actor) : undefined;
      const tether = this.castTethers.get(entity.id);
      if (castTarget && tether?.targetId !== castTargetId) {
        tether?.stop();
        this.castTethers.set(entity.id, {
          targetId: castTargetId!,
          stop: this.effects.startTether(actor.root, castTarget.root, this.effects.categoryColor(vfxCategoryForAction(entity.casting_skill_id!))),
        });
      } else if (tether && !castTarget) {
        tether.stop(); this.castTethers.delete(entity.id);
      }
      // Engaging a target flashes a brief intent ribbon — "starting to attack".
      const engaged = entity.alive && !!entity.engaged;
      if (engaged && !this.prevEngaged.get(entity.id) && entity.target_id && entity.target_id !== entity.id) {
        const tgt = this.actors.get(entity.target_id) ?? this.dying.get(entity.target_id)?.actor;
        if (tgt && tgt !== actor) this.effects.flashTether(actor.root, tgt.root, this.effects.categoryColor(vfxCategoryForAction("attack")));
      }
      this.prevEngaged.set(entity.id, engaged);
    }
    for (const [id, actor] of this.actors) if (!active.has(id)) {
      this.castFx.get(id)?.(); this.castFx.delete(id);
      this.castTethers.get(id)?.stop(); this.castTethers.delete(id); this.prevEngaged.delete(id);
      this.actors.delete(id);
      // A removal only earns the corpse fade if the entity was actually seen
      // dead — dismiss/mount/teleport vanish pets while they're still alive.
      const died = this.aliveSeen.get(id) === false && actor.root.userData.kind !== "player";
      this.aliveSeen.delete(id);
      if (died) this.startDying(actor, time);
      else {
        this.effects.burst(actor.root.position.clone(), 0xbfd4dc);
        this.scene.remove(actor.root); disposeObject(actor.root);
      }
    }
    this.fadeDying(time);
  }

  /** Collapse the actor into its death pose and fade it out over 2s so the
   * killing blow's effect reads before the corpse leaves the scene. */
  private startDying(actor: Actor3D, time: number) {
    animateActor(actor, false, time, false, 1 / 60);
    actor.ring.visible = false;
    const mats: THREE.Material[] = [];
    actor.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o === actor.ring) return;
      const src = o.material;
      const cloned = (Array.isArray(src) ? src.map((m) => m.clone()) : src.clone()) as THREE.Material | THREE.Material[];
      for (const m of Array.isArray(cloned) ? cloned : [cloned]) { m.transparent = true; m.depthWrite = false; mats.push(m); }
      o.material = cloned;
    });
    this.dying.set(actor.root.userData.entityId, { actor, mats, until: time + 2 });
  }

  private fadeDying(time: number) {
    for (const [id, d] of this.dying) {
      const opacity = THREE.MathUtils.clamp(d.until - time, 0, 2) / 2;
      for (const m of d.mats) m.opacity = opacity;
      if (opacity <= 0) { this.scene.remove(d.actor.root); disposeObject(d.actor.root); this.dying.delete(id); }
    }
  }

  private syncPois(state: State, dt: number, time: number) {
    if (!this.position) return;
    const active = new Set<string>();
    const entries: Array<{ id?: string; key: string; name: string; variant: PoiMarkVariant; x: number; y: number; authored?: boolean }> = [
      ...Object.values(state.savePoints).map(p => ({ ...p, key: `save:${p.id}`, variant: "save" as const })),
      ...Object.values(state.jobChangers).map(p => ({ ...p, key: `job:${p.id}`, variant: "job" as const })),
      ...Object.values(state.camps).map(p => ({ ...p, name: `${p.owner_name}'s camp`, key: `camp:${p.owner_name}`, variant: "camp" as const })),
    ];
    const authoredPositions = new Map<string, THREE.Vector3>();
    this.sceneObjects?.updateMatrixWorld(true);
    this.sceneObjects?.traverse(node => {
      if (typeof node.userData.sceneId === "string") authoredPositions.set(node.userData.sceneId, node.getWorldPosition(new THREE.Vector3()));
    });
    for (const object of state.mapInfo?.scene3d?.objects ?? []) {
      const component = object.components?.poi;
      const point = authoredPositions.get(object.id);
      if (!component?.enabled || !object.visible || !point) continue;
      entries.push({ key: `scene:${object.id}`, name: component.label || object.name, variant: component.type === "save_point" ? "save" : component.type === "job_changer" ? "job" : component.type === "camp" ? "camp" : "house-poi", x: point.x / WORLD_SCALE, y: point.z / WORLD_SCALE, authored: true });
    }
    for (const p of entries) {
      if (Math.hypot(p.x - this.position.x, p.y - this.position.y) > 1600) continue;
      active.add(p.key);
      let poi = this.pois.get(p.key);
      if (!poi) {
        const root = new THREE.Group();
        root.scale.setScalar(WORLD_ZOOM);
        const save = p.variant === "save";
        if (!p.authored) {
          const base = new THREE.Mesh(new THREE.CylinderGeometry(.45, .62, .26, 8), new THREE.MeshStandardMaterial({ color: 0x9c9c90 }));
          base.position.y = .13; base.castShadow = base.receiveShadow = true; root.add(base);
        }
        let spin: THREE.Mesh | undefined;
        let rig: RigInstance | undefined;
        if (!p.authored && p.variant === "job") {
          // Job masters are townsfolk, not markers — the shared humanoid rig
          // at human scale (the poi root carries the WORLD_ZOOM marker scale).
          rig = buildRig(getRig("humanoid"), { appearance: npcAppearance("job_master"), scale: .5 });
          rig.root.position.y = .26;
          root.add(rig.root);
        } else if (!p.authored) {
          spin = new THREE.Mesh(save ? new THREE.OctahedronGeometry(.42) : new THREE.ConeGeometry(.65, 1.4, 4), new THREE.MeshStandardMaterial({ color: save ? 0x83e5e0 : 0xd5ad6c, emissive: save ? 0x2caaab : 0x382510, emissiveIntensity: save ? 1.1 : .2, roughness: .4, metalness: .15 }));
          spin.position.y = 1.2; spin.scale.y = save ? 1.7 : 1; spin.castShadow = true; root.add(spin);
        }
        if (save && !p.authored) { const light = new THREE.PointLight(0x6bded4, 4, 4 * WORLD_ZOOM); light.position.y = 1.3; root.add(light); }
        poi = { root, label: p.name, variant: p.variant, x: p.x, y: p.y, spin: save ? spin : undefined, rig };
        this.pois.set(p.key, poi); this.scene.add(root);
      }
      poi.x = p.x; poi.y = p.y; poi.label = p.name; poi.root.position.copy(this.worldPoint(p.x, p.y));
      if (poi.spin) { poi.spin.rotation.y = time * .5; poi.spin.position.y = 1.2 + Math.sin(time * 2) * .12; }
      poi.rig?.update(dt, time, false, true);
    }
    for (const [id, poi] of this.pois) if (!active.has(id)) { poi.rig?.dispose(); disposeObject(poi.root); this.pois.delete(id); }
  }

  /** Floating marks live in the scene — every tick they re-anchor to their
   * actor/POI and rescale for a fixed screen size. */
  private markScratch = new THREE.Vector3();

  private clearMarks() {
    for (const mark of this.entityMarks.values()) mark.dispose();
    this.entityMarks.clear();
    for (const pm of this.poiMarks.values()) { pm.label.dispose(); pm.prompt.dispose(); }
    this.poiMarks.clear();
    this.markLayer.clear();
  }

  private syncMarks(state: State) {
    const h = this.host.clientHeight;
    const seenE = new Set<string>(), seenP = new Set<string>();
    const selfTarget = state.selfId ? state.entities[state.selfId]?.target_id : undefined;
    for (const [id, actor] of this.actors) {
      const entity = state.entities[id];
      if (!entity || entity.in_house) continue;
      seenE.add(id);
      let mark = this.entityMarks.get(id);
      if (!mark) {
        mark = new EntityMark();
        this.entityMarks.set(id, mark);
        this.markLayer.add(mark.group, mark.castGroup);
      }
      const head = this.markScratch.copy(actor.root.position);
      head.y += 1.85;
      mark.group.position.copy(head);
      mark.castGroup.position.copy(actor.root.position);
      mark.castGroup.position.y += 0.45;
      const u = unitPerPixel(this.camera, this.camera.position.distanceTo(head), h);
      const self = id === state.selfId;
      const hp = entity.hp < entity.max_hp || entity.engaged ? { value: entity.hp, max: entity.max_hp } : undefined;
      const mp =
        entity.max_mp && (hp || (entity.mp ?? 0) < entity.max_mp)
          ? { value: entity.mp ?? 0, max: entity.max_mp }
          : undefined;
      mark.update({
        label: entity.name,
        variant: self ? "self" : entity.kind === "npc" && !entity.is_ally ? "enemy" : "player",
        hp,
        mp,
        castPct: entity.casting_skill_id ? entity.cast_progress ?? 0 : undefined,
        statuses: entity.statuses,
        targeted: selfTarget === id,
        locked: this.lockOn && selfTarget === id,
        jobId: self ? state.profile?.main_job : undefined,
      }, u);
    }
    for (const [id, mark] of this.entityMarks) {
      if (seenE.has(id)) continue;
      this.markLayer.remove(mark.group, mark.castGroup);
      mark.dispose();
      this.entityMarks.delete(id);
    }
    for (const [id, poi] of this.pois) {
      seenP.add(id);
      let pm = this.poiMarks.get(id);
      if (!pm) {
        pm = { anchor: new THREE.Group(), label: new TextMark(), prompt: new TextMark() };
        pm.anchor.add(pm.label.sprite, pm.prompt.sprite);
        this.markLayer.add(pm.anchor);
        this.poiMarks.set(id, pm);
      }
      const pos = this.markScratch.copy(poi.root.position);
      pos.y += 2.25 * WORLD_ZOOM;
      pm.anchor.position.copy(pos);
      const u = unitPerPixel(this.camera, this.camera.position.distanceTo(pos), h);
      setPoiLabel(pm.label, poi.label, poi.variant);
      pm.label.layout(u);
      const near =
        this.position &&
        canShowWorldInteractPrompts(state) &&
        Math.hypot(poi.x - this.position.x, poi.y - this.position.y) <= 80;
      pm.prompt.sprite.visible = !!near;
      if (near) {
        setInteractPrompt(pm.prompt, interactKeyLabel(state.profile?.keybinds));
        pm.prompt.layout(u, 0, -18);
      }
    }
    for (const [id, pm] of this.poiMarks) {
      if (seenP.has(id)) continue;
      this.markLayer.remove(pm.anchor);
      pm.label.dispose();
      pm.prompt.dispose();
      this.poiMarks.delete(id);
    }
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
        this.syncActors(state, dt, now / 1000);  this.syncPois(state, dt, now / 1000);
        const o = state.options;
        const target = this.worldPoint(this.position.x, this.position.y, .6);
        const ox = THREE.MathUtils.clamp(o.cameraOffsetX, -10, 10), oy = THREE.MathUtils.clamp(o.cameraOffsetY, -10, 10);
        if (ox || oy) target.add(new THREE.Vector3(ox, oy, 0).applyQuaternion(this.camera.quaternion));
        if (this.resetCamera) {
          this.controls.target.copy(target);
          const view = state.cameraView;
          this.camera.position.copy(target).add(
            view
              ? new THREE.Vector3().setFromSphericalCoords(
                  THREE.MathUtils.clamp(view.distance, this.controls.minDistance, this.controls.maxDistance),
                  THREE.MathUtils.clamp(view.pitch, this.controls.minPolarAngle, this.controls.maxPolarAngle),
                  view.azimuth)
              : this.cameraOffset(o, Math.atan2(10, 15)));
          this.camOptSig = `${o.cameraDistance}|${o.cameraPitch}`;
          this.resetCamera = false;
        }
        this.applyCameraOptions(o);
        const next = this.controls.target.clone().lerp(target, 1 - Math.exp(-dt * 9));
        this.camera.position.add(next.clone().sub(this.controls.target)); this.controls.target.copy(next);
        this.updateLockCamera(state, dt);
        this.controls.update();
        this.sun.position.copy(target).add(new THREE.Vector3(-16, 25, 12)); this.sun.target.position.copy(target);
        for (const event of state.combatEvents) if (event.seq > this.lastEvent) {
          this.lastEvent = event.seq;
          if (event.cast_cancelled || event.cast_started || !event.success) continue;
          const targetId = event.target_id || event.attacker_id;
          const target = this.actors.get(targetId) ?? this.dying.get(targetId)?.actor;
          if (!target) continue;
          const acting = event.attacker_id ? (this.actors.get(event.attacker_id) ?? this.dying.get(event.attacker_id)?.actor) : undefined;
          const attacker = event.attacker_id !== targetId ? acting : undefined;
          const category = vfxCategoryForAction(event.action_id ?? "attack", event.heal);
          // The attacker plays the skill's clip; a landed hit flinches the
          // target. Misses keep the ribbon but no impact or reaction.
          const clip = rigClipForAction(event.action_id ?? "attack", event.heal);
          acting?.rig.playClip(clip);
          acting?.rider?.playClip(clip);
          if (event.hit !== false) {
            this.effects.playCategory(category, target.root.position, attacker?.root.position);
            if (target !== acting) { target.rig.playClip("hit"); target.rider?.playClip("hit"); }
          }
          // Ribbon flash attacker → target for each resolved action.
          if (attacker) this.effects.flashTether(attacker.root, target.root, this.effects.categoryColor(category));
        }
        this.effects.update(dt, this.camera); this.camera.updateMatrixWorld();
        this.syncMarks(state);
      }
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(this.tick);
    } catch (error) { this.onError(error instanceof Error ? error.message : String(error)); }
  };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.resize.disconnect();
    if (this.position) this.syncCameraView();
    this.controls.dispose();
    window.removeEventListener("keydown", this.onKeyDown); window.removeEventListener("keyup", this.onKeyUp); window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown); this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp); this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.terrain?.dispose(); this.buildings?.dispose(); this.effects.dispose();
    for (const actor of this.actors.values()) disposeObject(actor.root);
    for (const d of this.dying.values()) disposeObject(d.actor.root);
    for (const poi of this.pois.values()) disposeObject(poi.root);
    this.clearMarks();
    this.sun.shadow.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
    clearWorldLocalPos(); clearWorldViewRect();
  }
}
