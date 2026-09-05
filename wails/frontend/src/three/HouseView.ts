import * as THREE from "three";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { slideMoveHousePlayer } from "../world/houseMovement";
import {
  clearHousePlace,
  getHousePlaceState,
  setHouseClientToWorld,
  setHousePlaceTransform,
} from "../world/housePlaceBridge";
import { interactKeyLabel } from "../world/interact";
import { createCharacterMesh, createFurnitureMesh, createHousePoiMesh } from "./geometries";
import { facingYaw, setMapPosition } from "./coords";
import { facingFromAxes, parseFacingYaw, type FacingYaw } from "./facing";
import { getAnimator } from "./characterAnim";
import { FollowOrbitCamera } from "./camera";
import { ensureKeyboard, readMoveAxes } from "./input";
import type { Css2dLabelSpec } from "./Css2dLabels";
import {
  POI_LABEL_HEIGHT,
  pointerToMap,
  pushLabel,
  worldEntityLabel,
  worldInteractLabel,
  worldPoiLabel,
  type ThreeStageContext,
} from "./stage";
import type { HouseStatePayload } from "../types";

const SPEED = 220;
const SEND_INTERVAL = 100;
const INTERACT_RANGE = 80;
const POI_PROMPT_Y = 32;

type Ent = { root: THREE.Group };

function furnitureVariant(name: string): "crate" | "chair" | "bed" | "table" | "barrel" | "chest" | "workbench" {
  const n = name.toLowerCase();
  if (n.includes("chair") || n.includes("seat")) return "chair";
  if (n.includes("bed")) return "bed";
  if (n.includes("table")) return "table";
  if (n.includes("barrel")) return "barrel";
  if (n.includes("chest") || n.includes("storage")) return "chest";
  if (n.includes("work") || n.includes("bench")) return "workbench";
  return "crate";
}

export class HouseView {
  readonly scene = new THREE.Scene();
  private floor: THREE.Mesh | null = null;
  private players = new Map<string, Ent>();
  private furniture = new Map<string, Ent>();
  private pois = new Map<string, Ent>();
  private selfPos = { x: 0, y: 0 };
  private selfSpawned = false;
  private lastSentX = 0;
  private lastSentY = 0;
  private lastSentFacing = Number.NaN;
  private sendAcc = 0;
  private layoutKey = "";
  private lightsReady = false;
  private ghost: THREE.Mesh | null = null;
  private orbit = new FollowOrbitCamera();
  private orbitBound = false;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.scene.background = new THREE.Color(0x1a1410);
    this.orbit.reset({ lookY: 16, radius: Math.hypot(220, 220) });
  }

  private ensureLights() {
    if (this.lightsReady) return;
    this.lightsReady = true;
    this.scene.add(new THREE.HemisphereLight(0xffe8d0, 0x2a1810, 0.9));
    const lamp = new THREE.PointLight(0xffcc88, 1.2, 800);
    lamp.position.set(0, 120, 0);
    this.scene.add(lamp);
  }

  activate(canvas?: HTMLCanvasElement) {
    ensureKeyboard();
    this.ensureLights();
    if (canvas) {
      this.orbit.attach(canvas);
      this.orbitBound = true;
    }
  }

  deactivate() {
    if (this.orbitBound) {
      this.orbit.detach();
      this.orbitBound = false;
    }
    this.selfSpawned = false;
    setHouseClientToWorld(null);
    clearHousePlace();
  }

  dispose() {
    this.deactivate();
    for (const m of [this.players, this.furniture, this.pois]) {
      for (const e of m.values()) this.scene.remove(e.root);
      m.clear();
    }
    if (this.floor) {
      this.scene.remove(this.floor);
      this.floor = null;
    }
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost = null;
    }
  }

  private syncLayout(house: HouseStatePayload) {
    const t = house.tile_size;
    const w = house.walk_cols * t;
    const h = house.walk_rows * t;
    const key = `${w}x${h}:${t}`;
    if (key === this.layoutKey && this.floor) return;
    this.layoutKey = key;
    if (this.floor) this.scene.remove(this.floor);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ color: 0x6a4a38, roughness: 0.9 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(w / 2, 0, h / 2);
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
  }

  update(dt: number, stage: ThreeStageContext): Css2dLabelSpec[] {
    if (!this.orbitBound) {
      this.orbit.attach(stage.canvas);
      this.orbitBound = true;
    }
    const state = useGame.getState();
    if (state.screen !== "house" || !state.house) {
      return [];
    }
    const house = state.house;
    this.syncLayout(house);
    const selfId = state.selfId;
    if (!selfId) {
      return [];
    }

    const labels: Css2dLabelSpec[] = [];
    const seen = new Set<string>();

    for (const p of house.players) {
      seen.add(p.id);
      const isSelf = p.id === selfId;
      let x = p.x;
      let y = p.y;
      let facing: FacingYaw = parseFacingYaw(p.facing);
      let moving = false;
      if (isSelf) {
        if (!this.selfSpawned) {
          this.selfPos = { x: p.x, y: p.y };
          this.orbit.snap(p.x, p.y);
          this.selfSpawned = true;
        }
        x = this.selfPos.x;
        y = this.selfPos.y;
        const axes = readMoveAxes(state.profile?.keybinds, this.orbit.yaw);
        facing = axes.facing;
        moving = axes.dx !== 0 || axes.dy !== 0;
      } else {
        const prev = this.players.get(p.id);
        if (prev) {
          const nx = THREE.MathUtils.lerp(prev.root.position.x, p.x, 0.3);
          const ny = THREE.MathUtils.lerp(prev.root.position.z, p.y, 0.3);
          const mdx = nx - prev.root.position.x;
          const mdy = ny - prev.root.position.z;
          moving = Math.hypot(mdx, mdy) > 0.15;
          if (moving) facing = facingFromAxes(mdx, mdy, facing);
          x = nx;
          y = ny;
        }
      }
      let ent = this.players.get(p.id);
      if (!ent) {
        const root = createCharacterMesh({ self: isSelf });
        this.scene.add(root);
        ent = { root };
        this.players.set(p.id, ent);
      }
      setMapPosition(ent.root, x, y, 0);
      ent.root.rotation.y = facingYaw(facing);
      getAnimator(ent.root)?.update(dt);
      getAnimator(ent.root)?.setMoving(moving);
      pushLabel(
        labels,
        worldEntityLabel(p.id, p.owner ? `${p.name} (host)` : p.name, isSelf ? "self" : "player", x, y),
      );
    }
    for (const [id, e] of this.players) {
      if (!seen.has(id)) {
        this.scene.remove(e.root);
        this.players.delete(id);
      }
    }

    this.moveSelf(dt, house, selfId);

    const selfEnt = this.players.get(selfId);
    if (selfEnt) {
      setMapPosition(selfEnt.root, this.selfPos.x, this.selfPos.y, 0);
      const idx = labels.findIndex((e) => e.id === selfId && e.kind === "entity");
      if (idx >= 0) {
        const prev = labels[idx]!;
        labels[idx] = worldEntityLabel(
          selfId,
          prev.kind === "entity" ? prev.label : "You",
          "self",
          this.selfPos.x,
          this.selfPos.y,
        );
      }
    }

    // Furniture
    const seenF = new Set<string>();
    const t = house.tile_size;
    for (const f of house.furniture ?? []) {
      seenF.add(f.id);
      const x = (f.col + 0.5) * t;
      const y = (f.row + 0.5) * t;
      let ent = this.furniture.get(f.id);
      if (!ent) {
        const root = createFurnitureMesh(furnitureVariant(f.item?.name ?? f.item?.id ?? ""));
        this.scene.add(root);
        ent = { root };
        this.furniture.set(f.id, ent);
      }
      setMapPosition(ent.root, x, y, 0);
      pushLabel(labels, worldPoiLabel(`furn:${f.id}`, f.item?.name || "Furniture", "furniture", x, y, 20));
    }
    for (const [id, e] of this.furniture) {
      if (!seenF.has(id)) {
        this.scene.remove(e.root);
        this.furniture.delete(id);
      }
    }

    const seenP = new Set<string>();
    for (const poi of house.pois ?? []) {
      seenP.add(poi.id);
      let ent = this.pois.get(poi.id);
      if (!ent) {
        const root = createHousePoiMesh(poi.kind);
        this.scene.add(root);
        ent = { root };
        this.pois.set(poi.id, ent);
      }
      setMapPosition(ent.root, poi.x, poi.y, 0);
      pushLabel(labels, worldPoiLabel(`hpoi:${poi.id}`, poi.name, "house-poi", poi.x, poi.y, POI_LABEL_HEIGHT));
    }
    for (const [id, e] of this.pois) {
      if (!seenP.has(id)) {
        this.scene.remove(e.root);
        this.pois.delete(id);
      }
    }

    // Match overworld: elevated south camera so faces read toward the screen.
    this.orbit.follow(this.selfPos.x, this.selfPos.y);
    this.orbit.apply(this.camera);

    setHousePlaceTransform({
      scaleX: 1,
      scaleY: 1,
      originX: 0,
      originY: 0,
      zoom: 1,
      viewX: 0,
      viewY: 0,
      tileSize: house.tile_size,
      walkOriginCol: house.walk_origin_col,
      walkOriginRow: house.walk_origin_row,
      walkCols: house.walk_cols,
      walkRows: house.walk_rows,
    });
    // Live raycast so React drag/pick uses the perspective camera, not Phaser FIT math.
    setHouseClientToWorld((clientX, clientY) => pointerToMap(stage, clientX, clientY));

    const keyLabel = interactKeyLabel(state.profile?.keybinds);
    const show =
      !state.mainMenuOpen && !state.openWindow && !state.worldSkillDialog && !state.npcDialog && !state.jobChangeDialog;
    if (show) {
      for (const poi of house.pois ?? []) {
        if (Math.hypot(this.selfPos.x - poi.x, this.selfPos.y - poi.y) > INTERACT_RANGE) continue;
        pushLabel(labels, worldInteractLabel(`ix-hpoi:${poi.id}`, keyLabel, poi.x, poi.y, POI_PROMPT_Y));
      }
    }

    this.syncPlaceGhost(house, stage);
    return labels;
  }

  private syncPlaceGhost(house: HouseStatePayload, _stage: ThreeStageContext) {
    const place = getHousePlaceState();
    // Hover alone is enough (inventory drag never sets itemId).
    if (!place.hover) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    if (!this.ghost) {
      this.ghost = new THREE.Mesh(
        new THREE.BoxGeometry(house.tile_size * 0.9, 8, house.tile_size * 0.9),
        new THREE.MeshStandardMaterial({ color: 0x7ecf6a, transparent: true, opacity: 0.45 }),
      );
      this.scene.add(this.ghost);
    }
    const t = house.tile_size;
    const x = (place.hover.col + 0.5) * t;
    const y = (place.hover.row + 0.5) * t;
    this.ghost.visible = true;
    this.ghost.position.set(x, 4, y);
    (this.ghost.material as THREE.MeshStandardMaterial).color.setHex(place.hover.valid ? 0x7ecf6a : 0xe06060);
  }

  private moveSelf(dt: number, house: HouseStatePayload, selfId: string) {
    const me = house.players.find((p) => p.id === selfId);
    if (!me) return;
    if (Math.hypot(this.selfPos.x - me.x, this.selfPos.y - me.y) > 64) {
      this.selfPos = { x: me.x, y: me.y };
      this.orbit.snap(me.x, me.y);
    }
    const { dx, dy, facing } = readMoveAxes(
      useGame.getState().profile?.keybinds,
      this.orbit.yaw,
    );
    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      const nx = this.selfPos.x + (dx / len) * SPEED * dt;
      const ny = this.selfPos.y + (dy / len) * SPEED * dt;
      const slid = slideMoveHousePlayer(house, this.selfPos.x, this.selfPos.y, nx, ny);
      this.selfPos = { x: slid.x, y: slid.y };
    }
    this.sendAcc += dt * 1000;
    if (this.sendAcc >= SEND_INTERVAL) {
      this.sendAcc = 0;
      const moved = Math.hypot(this.selfPos.x - this.lastSentX, this.selfPos.y - this.lastSentY) > 0.5;
      const facingChanged =
        !Number.isFinite(this.lastSentFacing) || Math.abs(facing - this.lastSentFacing) > 0.01;
      if (moved || facingChanged) {
        this.lastSentX = this.selfPos.x;
        this.lastSentY = this.selfPos.y;
        this.lastSentFacing = facing;
        net.move(this.selfPos.x, this.selfPos.y, facing);
      }
    }
  }
}
