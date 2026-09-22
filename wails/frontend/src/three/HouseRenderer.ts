import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { uiOwnsKeyboard, useGame } from "../state/store";
import { net } from "../net/socket";
import { mergeKeybinds } from "../input/keybinds";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";
import { appearanceFromWire } from "../characters/heroes99";
import { enemyKindFromName } from "../characters/enemies";
import { campSkinById } from "../housing/campSkins";
import { EntityMark, TextMark, setInteractPrompt, setPoiLabel, unitPerPixel } from "./marks";
import { interactKeyLabel } from "../world/interact";
import {
  clearHousePlace,
  getHousePlaceState,
  setHouseClientToWorld,
  setHousePlaceTransform,
} from "../world/housePlaceBridge";
import type { HouseFurniture, HouseStatePayload } from "../types";
import { WorldHeightmap, WORLD_SCALE } from "./heightmap";
import { disposeObject } from "./terrain";
import { childrenByParent, normalizeScene, type Scene3DDoc, type SceneObject } from "./scene3d";
import { instantiatePrefab } from "./prefabs";
import { buildRig, getRig, loadRigLibrary, rigLibraryVersion, type RigInstance } from "./rigBuilder";
import { buildEnemyRig } from "./actors";
import { movementYaw, MovementKeys } from "./motion";
import { attachOrbitPointerLock } from "./pointerLock";
import {
  JUMP_VELOCITY,
  newBody3D,
  overworldPhysics3D,
  PhysicsWorld3D,
  reconcileBody3D,
  type AABB3D,
  type Body3D,
} from "./physics3d";

type State = ReturnType<typeof useGame.getState>;

const SPEED = 90;
const SEND_INTERVAL = 80;
const INTERACT_RANGE = 80;
/** World-units above the floor where nameplates / labels anchor. */
const NAME_Y = 1.95;
const POI_LABEL_Y = 2.4;
const FURN_LABEL_Y = 1.25;

interface HouseActor {
  root: THREE.Group;
  rig: RigInstance;
  ring: THREE.Mesh;
  signature: string;
}

interface HousePetActor {
  root: THREE.Group;
  rig: RigInstance;
  kind: string;
}

/** Furniture → SceneObjects, mirroring internal/game.NewHouseScene3D so the
 * client's physics and visuals track live placements exactly like the
 * server's rebuilt instance scene. Positions are world units (px / 16). */
function furnitureSceneObjects(list: HouseFurniture[] | undefined): SceneObject[] {
  return (list ?? []).map((f) => ({
    id: `furniture:${f.id}`,
    name: f.item.name,
    prefab: "furniture",
    visible: true,
    props: { itemId: f.item.id },
    transform: {
      position: [(f.col + .5) * 2, 0, (f.row + .5) * 2],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    components: {
      collider: { enabled: true, shape: "box" as const, size: [1.5, 2, 1.5], offset: [0, 1, 0], isTrigger: false },
    },
  }));
}

/** The camp interior rendered in Three.js. When the server embeds a map
 * snapshot (house.map) the camp runs the same heightmap + physics3d + scene3d
 * pipeline as the overworld — rock surround becomes canyon walls and placed
 * furniture collides — with tent dressing and the house-only HUD layer on top. */
export class HouseRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, .1, 80);
  private controls: OrbitControls;
  private detachOrbitLock: () => void = () => undefined;
  private sun = new THREE.DirectionalLight(0xffe0b8, .85);
  private lantern = new THREE.PointLight(0xffc888, 26, 30, 1.6);
  private field?: WorldHeightmap;
  private sceneObjects?: THREE.Group;
  private layout?: THREE.Group;
  private walls: { dir: THREE.Vector3; mats: THREE.MeshStandardMaterial[] }[] = [];
  private ceilingMats: THREE.MeshStandardMaterial[] = [];
  private ceilingY = 4.6;
  private ghost?: THREE.Mesh;
  private actors = new Map<string, HouseActor>();
  private pets = new Map<string, HousePetActor>();
  private furniture = new Map<string, THREE.Group>();
  private pois = new Map<string, THREE.Group>();
  private markLayer = new THREE.Group();
  private entityMarks = new Map<string, EntityMark>();
  private poiMarks = new Map<string, { anchor: THREE.Group; label: TextMark; prompt: TextMark }>();
  private keys = new MovementKeys();
  private physics?: PhysicsWorld3D;
  private body: Body3D | null = null;
  private jumpQueued = false;
  private lastAuthority = "";
  private position: { x: number; y: number } | null = null;
  private selfId: string | null = null;
  private mapRef: HouseStatePayload["map"] | null | undefined;
  private mapSig = "";
  private docBase?: Scene3DDoc;
  private furnitureSig = "";
  private layoutKey = "";
  private lastTime = 0;
  private lastSent = 0;
  private sendX = 0;
  private sendY = 0;
  private resetCamera = true;
  private moving = false;
  private disposed = false;
  private resize: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private frame = 0;

  constructor(private host: HTMLDivElement, private onError: (message: string) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.setAttribute("aria-label", "3D camp interior. WASD to move, drag right mouse to orbit, scroll to zoom.");
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x14100c);
    this.scene.fog = new THREE.Fog(0x14100c, 26, 55);
    this.scene.add(new THREE.HemisphereLight(0xd8c8b0, 0x38281c, 1.15), this.sun, this.sun.target, this.markLayer);
    this.sun.position.set(-6, 12, 5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 40 });
    this.lantern.position.set(0, 4.6, 0);
    this.scene.add(this.lantern);
    this.camera.position.set(6, 9, 10);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 4; this.controls.maxDistance = 20;
    this.controls.minPolarAngle = .3; this.controls.maxPolarAngle = 1.42;
    this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.detachOrbitLock = attachOrbitPointerLock(this.renderer.domElement);
    this.resize = new ResizeObserver(this.onResize); this.resize.observe(host); this.onResize();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    setHouseClientToWorld(this.clientToWorld);
    void loadRigLibrary();
    this.frame = requestAnimationFrame(this.tick);
  }

  private onResize = () => {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  };
  private onContextLost = (event: Event) => { event.preventDefault(); this.onError("The graphics context was lost. Reload the 3D view."); };
  private onBlur = () => { this.keys.clear(); this.jumpQueued = false; };
  private onVisibility = () => { if (document.hidden) this.onBlur(); this.lastTime = 0; };
  private onKeyDown = (event: KeyboardEvent) => {
    if (uiOwnsKeyboard() || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === " ") this.jumpQueued = true;
    this.keys.down(event.key);
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.up(event.key);

  /** Pointer → house map pixels (feeds housePlaceBridge). Raycasts the floor
   * plane, which syncMap parks at the interior floor height. */
  private clientToWorld = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.raycaster.setFromCamera(
      new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2),
      this.camera,
    );
    const hit = this.raycaster.ray.intersectPlane(this.floorPlane, new THREE.Vector3());
    return hit ? { x: hit.x / WORLD_SCALE, y: hit.z / WORLD_SCALE } : null;
  };

  private worldPoint(x: number, y: number, height = 0) {
    return new THREE.Vector3(x * WORLD_SCALE, (this.field?.height(x, y) ?? 0) + height, y * WORLD_SCALE);
  }

  // ------------------------------------------------------------- map/scene

  /** Instantiate doc objects that aren't synced through the live house lists
   * (furniture: ids → house.furniture, poi components → house.pois). */
  private buildSceneObjects(doc: Scene3DDoc): THREE.Group {
    const group = new THREE.Group();
    const kids = childrenByParent(doc);
    const DEG = Math.PI / 180;
    const skip = (o: SceneObject) => o.id.startsWith("furniture:") || !!o.components?.poi?.enabled;
    const spawn = (o: SceneObject, parent: THREE.Object3D) => {
      const node = skip(o) ? new THREE.Group() : instantiatePrefab(o.prefab, o.props);
      const { position: p, rotation: r, scale: s } = o.transform;
      node.position.set(p[0], p[1], p[2]);
      node.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
      node.scale.set(s[0], s[1], s[2]);
      node.visible = o.visible;
      node.userData.sceneId = o.id;
      parent.add(node);
      for (const child of kids.get(o.id) ?? []) spawn(child, node);
    };
    for (const o of kids.get("") ?? []) if (!skip(o)) spawn(o, group);
    return group;
  }

  private syncMap(house: HouseStatePayload) {
    const furnitureSig = (house.furniture ?? []).map((f) => `${f.id}@${f.col},${f.row}`).join("|");
    // The server embeds the multi-MB snapshot only in the join broadcast —
    // afterwards house.map is absent and means "keep current". When a map
    // does arrive, compare content rather than identity so per-move roster
    // broadcasts never rebuild the world.
    const map = house.map;
    let mapChanged = false;
    if (map && map !== this.mapRef) {
      const docRaw = map.scene3d;
      const sig = [
        map.id,
        JSON.stringify(map.overworld),
        JSON.stringify(map.terrain_layers ?? null),
        JSON.stringify(docRaw ? { ...docRaw, objects: (docRaw.objects ?? []).filter((o) => !o.id.startsWith("furniture:")) } : null),
      ].join("\n");
      this.mapRef = map;
      if (sig !== this.mapSig) { this.mapSig = sig; mapChanged = true; }
    }
    if (!mapChanged && furnitureSig === this.furnitureSig) return;
    this.furnitureSig = furnitureSig;

    if (mapChanged) {
      this.field = undefined;
      if (this.sceneObjects) { this.scene.remove(this.sceneObjects); disposeObject(this.sceneObjects); this.sceneObjects = undefined; }
      if (this.layout) { this.scene.remove(this.layout); disposeObject(this.layout); this.layout = undefined; }
      this.walls = [];
      this.ceilingMats = [];
      this.layoutKey = "";
      if (map?.overworld) {
        const doc = map.scene3d ? normalizeScene(map.scene3d, map.id || "house") : undefined;
        // POIs and furniture are driven by the live house lists (delta-safe);
        // the doc still contributes terrain heights (flat floor) and authored
        // decorations — but the overworld terrain itself is never drawn, the
        // interior room is dressed by buildLayout instead.
        this.docBase = doc ? { ...doc, objects: doc.objects.filter((o) => !o.id.startsWith("furniture:")) } : undefined;
        this.field = new WorldHeightmap(map.overworld, map.terrain_layers, doc?.terrain);
        const cxp = (house.walk_origin_col + house.walk_cols / 2) * house.tile_size;
        const czp = (house.walk_origin_row + house.walk_rows / 2) * house.tile_size;
        this.floorPlane.constant = -this.field.height(cxp, czp);
        if (doc) { this.sceneObjects = this.buildSceneObjects(doc); this.scene.add(this.sceneObjects); }
      } else {
        this.docBase = undefined;
      }
      this.position = null; this.body = null; this.lastAuthority = ""; this.resetCamera = true;
    }

    // Physics rebuild (also on furniture deltas — mirrors the server's
    // SetHouseFurniture3D rebuild before each state broadcast).
    if (this.field) {
      const doc: Scene3DDoc | undefined = this.docBase
        ? { ...this.docBase, objects: [...this.docBase.objects, ...furnitureSceneObjects(house.furniture)] }
        : undefined;
      this.physics = overworldPhysics3D(this.field, doc);
    } else {
      // Flat fallback for servers without house.map: island bounds + furniture boxes.
      const w = new PhysicsWorld3D();
      const t = house.tile_size;
      w.bounds = {
        min: { x: house.walk_origin_col * t, y: house.walk_origin_row * t, z: -1e5 },
        max: { x: (house.walk_origin_col + house.walk_cols) * t, y: (house.walk_origin_row + house.walk_rows) * t, z: 1e5 },
      };
      w.heightAt = () => 0;
      w.colliders = (house.furniture ?? []).map((f): AABB3D => ({
        min: { x: f.col * t + 2, y: f.row * t + 2, z: -8 },
        max: { x: (f.col + 1) * t - 2, y: (f.row + 1) * t - 2, z: 26 },
      }));
      this.physics = w;
    }
  }

  // ------------------------------------------------------------ dressing

  private buildLayout(house: HouseStatePayload) {
    const key = [
      house.owner_name, house.skin, house.tile_size,
      house.walk_origin_col, house.walk_origin_row, house.walk_cols, house.walk_rows,
      this.field ? "terrain" : "flat",
    ].join(":");
    if (key === this.layoutKey && this.layout) return;
    this.layoutKey = key;
    if (this.layout) { this.scene.remove(this.layout); disposeObject(this.layout); }
    this.walls = [];
    const group = new THREE.Group();
    this.layout = group;

    const t = house.tile_size * WORLD_SCALE;
    const ox = house.walk_origin_col * t;
    const oz = house.walk_origin_row * t;
    const w = house.walk_cols * t;
    const h = house.walk_rows * t;
    const cx = ox + w / 2, cz = oz + h / 2;
    const skin = campSkinById(house.skin);

    const floorY = this.field ? this.field.height(cx / WORLD_SCALE, cz / WORLD_SCALE) : 0;

    if (!this.field) {
      // Fallback look for servers without a map snapshot: room floating in a void.
      const surround = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 1 }),
      );
      surround.rotation.x = -Math.PI / 2; surround.position.set(cx, -.09, cz);
      surround.receiveShadow = true;
      group.add(surround);
    }

    // Wood plank floor spanning the walkable footprint — long strips running
    // the room's width, alternating shades.
    const plankRows = house.walk_rows * 2;
    const planks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(w + .3, .07, t * .5 - .03),
      new THREE.MeshStandardMaterial({ roughness: .8, metalness: .05 }),
      plankRows,
    );
    planks.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    const woodA = new THREE.Color(0x54402c), woodB = new THREE.Color(0x63503a);
    for (let r = 0; r < plankRows; r++) {
      m4.makeTranslation(cx, floorY - .035, oz + (r + .5) * t * .5);
      planks.setMatrixAt(r, m4);
      planks.setColorAt(r, r % 2 ? woodA : woodB);
    }
    group.add(planks);

    // Camp rug over the middle of the floor.
    const rug = new THREE.Mesh(
      new THREE.BoxGeometry(w * .5, .05, h * .36),
      new THREE.MeshStandardMaterial({ color: skin.interior, roughness: .95 }),
    );
    rug.position.set(cx, floorY + .04, cz);
    rug.receiveShadow = true;
    group.add(rug);

    // Interior walls: upright plaster over a wood wainscot with baseboard and
    // crown trim. The south wall leaves a gap at the door POI; every wall
    // fades when the camera is on its side.
    const wallH = 4.6, wainsH = 1.05;
    const doorTile = house.pois?.find((p) => p.kind === "door");
    const doorX = doorTile ? doorTile.x * WORLD_SCALE : cx;
    const mkWall = (width: number) => {
      const mats: THREE.MeshStandardMaterial[] = [];
      const wall = new THREE.Group();
      const plaster = new THREE.MeshStandardMaterial({ color: skin.inner, roughness: .95, transparent: true });
      const wains = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: .85, transparent: true });
      const trim = new THREE.MeshStandardMaterial({ color: 0x342416, roughness: .8, transparent: true });
      mats.push(plaster, wains, trim);
      // Walls yaw so local +z faces the room.
      const upper = new THREE.Mesh(new THREE.PlaneGeometry(width, wallH - wainsH), plaster);
      upper.position.y = wainsH + (wallH - wainsH) / 2;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(width, wainsH, .07), wains);
      lower.position.set(0, wainsH / 2, .03);
      const base = new THREE.Mesh(new THREE.BoxGeometry(width, .14, .1), trim);
      base.position.set(0, .07, .05);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(width, .16, .12), trim);
      crown.position.set(0, wallH - .08, .05);
      wall.add(upper, lower, base, crown);
      return { wall, mats };
    };
    const place = (dir: THREE.Vector3, width: number, center: THREE.Vector3, yaw: number) => {
      const { wall, mats } = mkWall(width);
      wall.position.copy(center);
      wall.rotation.y = yaw;
      group.add(wall);
      this.walls.push({ dir: dir.clone(), mats });
    };
    const southDir = new THREE.Vector3(0, 0, 1);
    place(new THREE.Vector3(0, 0, -1), w, new THREE.Vector3(cx, 0, oz - .1), 0);
    place(new THREE.Vector3(-1, 0, 0), h, new THREE.Vector3(ox - .1, 0, cz), Math.PI / 2);
    place(new THREE.Vector3(1, 0, 0), h, new THREE.Vector3(ox + w + .1, 0, cz), -Math.PI / 2);
    // South wall split around the door gap.
    const gapW = t * 2.2;
    const leftW = Math.max(0, doorX - gapW / 2 - ox);
    const rightW = Math.max(0, ox + w - (doorX + gapW / 2));
    for (const [segW, segCx] of [[leftW, ox + leftW / 2], [rightW, doorX + gapW / 2 + rightW / 2]] as const) {
      if (segW <= .2) continue;
      place(southDir, segW, new THREE.Vector3(segCx, 0, oz + h + .1), Math.PI);
    }

    // Beamed ceiling — opaque from below, fades when the camera rises above
    // it so orbiting never loses the room.
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x2e2118, roughness: .95, side: THREE.DoubleSide, transparent: true });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: .8, transparent: true });
    this.ceilingMats = [ceilMat, beamMat];
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w + .6, h + .6), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, wallH, cz);
    group.add(ceil);
    for (const bz of [cz - h / 3, cz, cz + h / 3]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w + .4, .18, .3), beamMat);
      beam.position.set(cx, wallH - .09, bz);
      group.add(beam);
    }
    this.ceilingY = wallH;

    // Hanging lantern — visible anchor for the warm point light.
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd890, emissive: 0xffb850, emissiveIntensity: 1.6 }),
    );
    lamp.position.set(cx, wallH - .8, cz);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .8, 4), new THREE.MeshStandardMaterial({ color: 0x2a2018 }));
    cord.position.set(cx, wallH - .4, cz);
    group.add(lamp, cord);

    this.scene.add(group);
  }

  /** Fade walls that sit between the camera and the room center, and fade the
   * ceiling whenever the camera rises above it. */
  private updateWallFade(cx: number, cz: number, dt: number) {
    const camDir = new THREE.Vector3().subVectors(this.camera.position, new THREE.Vector3(cx, 0, cz));
    camDir.y = 0; camDir.normalize();
    for (const w of this.walls) {
      const facing = camDir.dot(w.dir); // >0 → wall is on the camera's side
      const target = facing > .45 ? .12 : 1;
      for (const m of w.mats) m.opacity += (target - m.opacity) * Math.min(1, dt * 8);
    }
    const ceilTarget = this.camera.position.y > this.ceilingY + .3 ? .06 : 1;
    for (const m of this.ceilingMats) m.opacity += (ceilTarget - m.opacity) * Math.min(1, dt * 8);
  }

  // ------------------------------------------------------------------ sync

  private syncFurniture(house: HouseStatePayload) {
    const keep = new Set<string>();
    const pickMode = getHousePlaceState().pickMode;
    for (const f of house.furniture ?? []) {
      keep.add(f.id);
      let node = this.furniture.get(f.id);
      if (!node) {
        node = instantiatePrefab("furniture", {}) as THREE.Group;
        node.userData.furnitureId = f.id;
        this.furniture.set(f.id, node);
        this.scene.add(node);
      }
      node.position.copy(this.worldPoint((f.col + .5) * house.tile_size, (f.row + .5) * house.tile_size));
      node.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m?.emissive) m.emissive.setHex(pickMode ? 0x6a5a20 : 0x000000);
      });
    }
    for (const [id, node] of this.furniture) {
      if (!keep.has(id)) { this.scene.remove(node); disposeObject(node); this.furniture.delete(id); }
    }
  }

  private syncPois(house: HouseStatePayload) {
    const keep = new Set<string>();
    for (const poi of house.pois ?? []) {
      keep.add(poi.id);
      let node = this.pois.get(poi.id);
      if (!node) {
        node = instantiatePrefab(poi.kind === "door" ? "door" : "storage", {}) as THREE.Group;
        this.pois.set(poi.id, node);
        this.scene.add(node);
      }
      node.position.copy(this.worldPoint(poi.x, poi.y));
    }
    for (const [id, node] of this.pois) {
      if (!keep.has(id)) { this.scene.remove(node); disposeObject(node); this.pois.delete(id); }
    }
  }

  private playerSignature(state: State, id: string): string {
    const wp = state.entities[id];
    return `${rigLibraryVersion}:${wp?.sprite}:${wp?.weapon}:${wp?.sub_weapon}:${wp?.appearance ? JSON.stringify(wp.appearance) : ""}`;
  }

  private ensurePlayer(state: State, id: string, self: boolean): HouseActor {
    let actor = this.actors.get(id);
    const sig = this.playerSignature(state, id);
    if (actor && actor.signature === sig) return actor;
    if (actor) { this.scene.remove(actor.root); disposeObject(actor.root); this.actors.delete(id); }
    const wp = state.entities[id];
    const appearance = resolveCharacterAppearance({
      playerId: id,
      selfId: state.selfId,
      profile: state.profile,
      race: wp?.sprite,
      weapon: wp?.weapon,
      subWeapon: wp?.sub_weapon,
      wire: wp?.appearance,
    });
    const palette = appearanceFromWire(wp?.appearance) ? {} : { cloth: self ? "#456879" : "#796584" };
    const rig = buildRig(getRig("humanoid"), { appearance, palette });
    const root = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(.39, .43, 40),
      new THREE.MeshBasicMaterial({ color: self ? 0xe3c788 : 0x83c5bc, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = .03;
    root.add(ring, rig.root);
    root.userData.entityId = id;
    actor = { root, rig, ring, signature: sig };
    this.actors.set(id, actor);
    this.scene.add(root);
    return actor;
  }

  private ensurePet(id: string, name: string, sprite?: string): HousePetActor {
    let actor = this.pets.get(id);
    const kind = enemyKindFromName(name, sprite);
    if (actor && actor.kind === kind) return actor;
    if (actor) { this.scene.remove(actor.root); disposeObject(actor.root); this.pets.delete(id); }
    const { rig } = buildEnemyRig(kind);
    const root = new THREE.Group();
    root.add(rig.root);
    actor = { root, rig, kind };
    this.pets.set(id, actor);
    this.scene.add(root);
    return actor;
  }

  /** Wire yaw (dir = (-sin,-cos)) → model rotation.y. */
  private yawToRotation(facing: number | string | undefined, fallback: number): number {
    if (facing === "left") return -Math.PI / 2;
    if (facing === "right") return Math.PI / 2;
    if (typeof facing === "number" && Number.isFinite(facing)) return facing + Math.PI;
    return fallback;
  }

  // ------------------------------------------------------------------ tick

  private move(state: State, house: HouseStatePayload, dt: number, now: number) {
    const me = house.players.find((p) => p.id === state.selfId);
    if (!me) { this.position = null; this.selfId = null; this.body = null; return; }
    if (!this.position || !this.body || this.selfId !== me.id) {
      const z = Number.isFinite(me.z) ? me.z : 0;
      this.body = newBody3D(me.x, me.y, z);
      this.body.grounded = me.grounded !== false;
      this.position = { x: me.x, y: me.y };
      this.selfId = me.id;
      this.resetCamera = true;
      this.lastAuthority = "";
    }
    const body = this.body;
    const authority = `${me.x},${me.y},${me.z},${me.grounded}`;
    if (authority !== this.lastAuthority) {
      if (reconcileBody3D(body, me) === "snap") this.resetCamera = true;
      this.lastAuthority = authority;
    }
    let dx = 0, dy = 0, jump = false;
    if (state.connected && !state.transition && !uiOwnsKeyboard()) {
      const binds = mergeKeybinds(state.profile?.keybinds);
      const { x: horizontal, y: vertical } = this.keys.read(binds);
      const yaw = this.controls.getAzimuthalAngle();
      dx = horizontal * Math.cos(yaw) + vertical * Math.sin(yaw);
      dy = -horizontal * Math.sin(yaw) + vertical * Math.cos(yaw);
      if (this.jumpQueued) {
        this.jumpQueued = false;
        if (body.grounded) { body.velZ = JUMP_VELOCITY; body.grounded = false; jump = true; }
      }
    } else {
      this.keys.clear(); this.jumpQueued = false;
    }
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      this.physics?.move(body, body.pos.x + (dx / len) * SPEED * dt, body.pos.y + (dy / len) * SPEED * dt, dt);
    } else {
      this.physics?.move(body, body.pos.x, body.pos.y, dt);
    }
    this.position = { x: body.pos.x, y: body.pos.y };
    const moved = Math.hypot(body.pos.x - this.sendX, body.pos.y - this.sendY) > .5;
    if (state.connected && (jump || (moved && now - this.lastSent >= SEND_INTERVAL))) {
      this.lastSent = now;
      this.sendX = body.pos.x; this.sendY = body.pos.y;
      net.move(Math.round(body.pos.x), Math.round(body.pos.y), movementYaw(dx, dy), jump, body.pos.z);
    }
    this.moving = !!(dx || dy);
  }

  private syncActors(state: State, house: HouseStatePayload, dt: number, time: number) {
    const seen = new Set<string>();
    for (const p of house.players) {
      seen.add(p.id);
      const self = p.id === state.selfId;
      const actor = this.ensurePlayer(state, p.id, self);
      const target = this.worldPoint(p.x, p.y);
      const old = actor.root.position.clone();
      if (self && this.position) {
        actor.root.position.copy(this.worldPoint(this.position.x, this.position.y));
      } else if (old.distanceTo(target) > 4) {
        actor.root.position.copy(target);
      } else {
        actor.root.position.lerp(target, 1 - Math.exp(-dt * 10));
      }
      const groundY = this.field?.height(actor.root.position.x / WORLD_SCALE, actor.root.position.z / WORLD_SCALE) ?? 0;
      const feetZ = self && this.body ? this.body.pos.z : p.z;
      actor.root.position.y = Number.isFinite(feetZ) ? Math.max(groundY, feetZ * WORLD_SCALE) : groundY;
      const delta = actor.root.position.clone().sub(old);
      delta.y = 0;
      if (delta.lengthSq() > .0001) actor.root.rotation.y = Math.atan2(delta.x, delta.z);
      else actor.root.rotation.y = this.yawToRotation(p.facing, actor.root.rotation.y);
      actor.rig.update(dt, time, self ? this.moving : delta.lengthSq() > .0004, true);
    }
    for (const [id, actor] of this.actors) {
      if (!seen.has(id)) { this.scene.remove(actor.root); disposeObject(actor.root); this.actors.delete(id); }
    }
    const seenPets = new Set<string>();
    for (const p of house.players) {
      for (const pet of p.pets ?? []) {
        seenPets.add(pet.id);
        const actor = this.ensurePet(pet.id, pet.name, pet.sprite);
        const target = this.worldPoint(pet.x, pet.y);
        const old = actor.root.position.clone();
        if (old.distanceTo(target) > 4) actor.root.position.copy(target);
        else actor.root.position.lerp(target, 1 - Math.exp(-dt * 10));
        const groundY = this.field?.height(actor.root.position.x / WORLD_SCALE, actor.root.position.z / WORLD_SCALE) ?? 0;
        actor.root.position.y = Number.isFinite(pet.z) ? Math.max(groundY, pet.z * WORLD_SCALE) : groundY;
        const delta = actor.root.position.clone().sub(old);
        delta.y = 0;
        if (delta.lengthSq() > .0001) actor.root.rotation.y = Math.atan2(delta.x, delta.z);
        else actor.root.rotation.y = this.yawToRotation(pet.facing, actor.root.rotation.y);
        actor.rig.update(dt, time, delta.lengthSq() > .0004, true);
      }
    }
    for (const [id, actor] of this.pets) {
      if (!seenPets.has(id)) { this.scene.remove(actor.root); disposeObject(actor.root); this.pets.delete(id); }
    }
  }

  private syncGhost(house: HouseStatePayload) {
    if (!this.ghost) {
      this.ghost = new THREE.Mesh(
        new THREE.BoxGeometry(1, .1, 1),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: .4, depthWrite: false }),
      );
      this.ghost.visible = false;
      this.scene.add(this.ghost);
    }
    const hover = getHousePlaceState().hover;
    if (!hover) { this.ghost.visible = false; return; }
    const t = house.tile_size * WORLD_SCALE;
    this.ghost.scale.set(t - .04, 1, t - .04);
    this.ghost.position.copy(this.worldPoint((hover.col + .5) * house.tile_size, (hover.row + .5) * house.tile_size, .1));
    (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(hover.valid ? 0x7ecf6a : 0xe06060);
    this.ghost.visible = true;
  }

  /** In-scene nameplates / furniture & POI labels / interact prompts — same
   * fixed-pixel billboard marks the overworld uses. */
  private markScratch = new THREE.Vector3();

  private clearMarks() {
    for (const mark of this.entityMarks.values()) mark.dispose();
    this.entityMarks.clear();
    for (const pm of this.poiMarks.values()) { pm.label.dispose(); pm.prompt.dispose(); }
    this.poiMarks.clear();
    this.markLayer.clear();
  }

  private syncMarks(state: State, house: HouseStatePayload) {
    const h = this.host.clientHeight;
    const seenE = new Set<string>(), seenP = new Set<string>();
    const keyLabel = interactKeyLabel(state.profile?.keybinds);
    const showPrompts =
      !state.mainMenuOpen && !state.openWindow && !state.worldSkillDialog && !state.npcDialog && !state.jobChangeDialog;
    const entityMark = (id: string, root: THREE.Object3D, headY: number, label: string, variant: "self" | "player") => {
      seenE.add(id);
      let mark = this.entityMarks.get(id);
      if (!mark) {
        mark = new EntityMark();
        this.entityMarks.set(id, mark);
        this.markLayer.add(mark.group, mark.castGroup);
      }
      const head = this.markScratch.copy(root.position);
      head.y += headY;
      mark.group.position.copy(head);
      mark.castGroup.position.copy(root.position);
      mark.castGroup.position.y += 0.45;
      const u = unitPerPixel(this.camera, this.camera.position.distanceTo(head), h);
      mark.update({ label, variant, jobId: variant === "self" ? state.profile?.main_job : undefined }, u);
    };
    for (const p of house.players) {
      const actor = this.actors.get(p.id);
      if (actor) entityMark(p.id, actor.root, NAME_Y, p.owner ? `${p.name} (host)` : p.name, p.id === state.selfId ? "self" : "player");
      for (const pet of p.pets ?? []) {
        const pa = this.pets.get(pet.id);
        if (pa) entityMark(pet.id, pa.root, 1.5, pet.name, "player");
      }
    }
    for (const [id, mark] of this.entityMarks) {
      if (seenE.has(id)) continue;
      this.markLayer.remove(mark.group, mark.castGroup);
      mark.dispose();
      this.entityMarks.delete(id);
    }
    const poiMark = (key: string, node: THREE.Object3D, labelY: number, label: string, variant: "house-poi" | "furniture", near: boolean) => {
      seenP.add(key);
      let pm = this.poiMarks.get(key);
      if (!pm) {
        pm = { anchor: new THREE.Group(), label: new TextMark(), prompt: new TextMark() };
        pm.anchor.add(pm.label.sprite, pm.prompt.sprite);
        this.markLayer.add(pm.anchor);
        this.poiMarks.set(key, pm);
      }
      const pos = this.markScratch.copy(node.position);
      pos.y += labelY;
      pm.anchor.position.copy(pos);
      const u = unitPerPixel(this.camera, this.camera.position.distanceTo(pos), h);
      setPoiLabel(pm.label, label, variant);
      pm.label.layout(u);
      pm.prompt.sprite.visible = near;
      if (near) {
        setInteractPrompt(pm.prompt, keyLabel);
        pm.prompt.layout(u, 0, -18);
      }
    };
    for (const f of house.furniture ?? []) {
      const node = this.furniture.get(f.id);
      if (node) poiMark(`furn:${f.id}`, node, FURN_LABEL_Y, f.item.name.slice(0, 10), "furniture", false);
    }
    for (const poi of house.pois ?? []) {
      const node = this.pois.get(poi.id);
      if (!node) continue;
      const near =
        showPrompts &&
        !!this.position &&
        Math.hypot(this.position.x - poi.x, this.position.y - poi.y) <= INTERACT_RANGE;
      poiMark(`hpoi:${poi.id}`, node, POI_LABEL_Y, poi.name, "house-poi", near);
    }
    for (const [id, pm] of this.poiMarks) {
      if (seenP.has(id)) continue;
      this.markLayer.remove(pm.anchor);
      pm.label.dispose();
      pm.prompt.dispose();
      this.poiMarks.delete(id);
    }
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    try {
      const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, .05) : 0; this.lastTime = now;
      const state = useGame.getState();
      const house = state.screen === "house" ? state.house : null;
      if (house) {
        this.syncMap(house);
        this.buildLayout(house);
        this.move(state, house, dt, now);
        this.syncActors(state, house, dt, now / 1000);
        this.syncFurniture(house);
        this.syncPois(house);
        this.syncGhost(house);
        const t = house.tile_size * WORLD_SCALE;
        const cx = (house.walk_origin_col + house.walk_cols / 2) * t;
        const cz = (house.walk_origin_row + house.walk_rows / 2) * t;
        this.lantern.position.set(cx, this.ceilingY - .8, cz);
        this.sun.position.set(cx - 6, 12, cz + 5);
        this.sun.target.position.set(cx, 0, cz);
        this.updateWallFade(cx, cz, dt);
        if (this.position) {
          const target = this.worldPoint(this.position.x, this.position.y, .6);
          if (this.resetCamera) {
            // Keep the user's orbit: reuse the current camera offset when one
            // exists so re-seats and teleports never snap the view direction.
            const offset = this.camera.position.clone().sub(this.controls.target);
            this.controls.target.copy(target);
            this.camera.position.copy(offset.lengthSq() > .01 ? target.clone().add(offset) : target.clone().add(new THREE.Vector3(6, 8, 9)));
            this.resetCamera = false;
          }
          const next = this.controls.target.clone().lerp(target, 1 - Math.exp(-dt * 9));
          this.camera.position.add(next.clone().sub(this.controls.target));
          this.controls.target.copy(next);
        }
        this.controls.update();
        // Tile meta for worldToHouseTile / houseTileWalkable (drag + click place).
        setHousePlaceTransform({
          tileSize: house.tile_size,
          walkOriginCol: house.walk_origin_col, walkOriginRow: house.walk_origin_row,
          walkCols: house.walk_cols, walkRows: house.walk_rows,
        });
        this.camera.updateMatrixWorld();
        this.syncMarks(state, house);
      } else {
        this.clearMarks();
      }
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(this.tick);
    } catch (error) { this.onError(error instanceof Error ? error.message : String(error)); }
  };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.resize.disconnect();
    this.detachOrbitLock();
    this.controls.dispose();
    window.removeEventListener("keydown", this.onKeyDown); window.removeEventListener("keyup", this.onKeyUp); window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    if (this.sceneObjects) { this.scene.remove(this.sceneObjects); disposeObject(this.sceneObjects); }
    if (this.layout) { this.scene.remove(this.layout); disposeObject(this.layout); }
    if (this.ghost) { this.scene.remove(this.ghost); disposeObject(this.ghost); }
    for (const actor of this.actors.values()) disposeObject(actor.root);
    for (const actor of this.pets.values()) disposeObject(actor.root);
    for (const node of this.furniture.values()) disposeObject(node);
    for (const node of this.pois.values()) disposeObject(node);
    this.clearMarks();
    this.sun.shadow.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
    setHouseClientToWorld(null);
    clearHousePlace();
  }
}
