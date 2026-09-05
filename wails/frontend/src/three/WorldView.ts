import * as THREE from "three";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { applyPlayerSlide, H99_COLLISION_HALF_H, H99_COLLISION_HALF_W } from "../world/movementBridge";
import { FILL } from "../world/overworld";
import { clearWorldLocalPos, setWorldLocalPos } from "../world/worldLocalPos";
import {
  canShowWorldInteractPrompts,
  interactKeyLabel,
  INTERACT_RANGE,
  SAVE_POINT_RANGE,
  JOB_CHANGER_RANGE,
  battleJoinable,
} from "../world/interact";
import { enemyKindFromName } from "../characters/enemies";
import {
  createCampMesh,
  createCharacterMesh,
  createEnemyMesh,
  createJobChangerMesh,
  createPetMesh,
  createSavePointMesh,
  createTerrainMesh,
  createNatureProp,
} from "./geometries";
import { facingYaw, setMapPosition } from "./coords";
import { facingFromAxes, followOffset, parseFacingYaw, type FacingYaw } from "./facing";
import { getAnimator } from "./characterAnim";
import { ensureKeyboard, getFacing, readMoveAxes, setFacing } from "./input";
import { FollowOrbitCamera } from "./camera";
import type { Css2dLabelSpec } from "./Css2dLabels";
import {
  CAMP_LABEL_HEIGHT,
  POI_LABEL_HEIGHT,
  pushLabel,
  worldEntityLabel,
  worldInteractLabel,
  worldPoiLabel,
  type ThreeStageContext,
} from "./stage";
import { MODELS } from "./modelCatalog";

const SPEED = 240;
const SEND_INTERVAL = 100;
const PET_FOLLOW_DIST = 32;
const PET_FOLLOW_SMOOTH = 7;
const FOG_NEAR = 420;
const FOG_FAR = 1600;
/** Cap nature props for frame budget. */
const NATURE_BUDGET = 220;

type EntityRec = { root: THREE.Group; kind?: string; offsetX?: number };

export class WorldView {
  readonly scene = new THREE.Scene();
  private terrain: THREE.Object3D | null = null;
  private natureRoot: THREE.Group | null = null;
  private mapKey = "";
  private worldW = 4096;
  private worldH = 3072;
  private players = new Map<string, EntityRec>();
  private foes = new Map<string, EntityRec>();
  private pets = new Map<string, EntityRec>();
  private saves = new Map<string, EntityRec>();
  private jobs = new Map<string, EntityRec>();
  private camps = new Map<string, EntityRec>();
  private selfPos = { x: 0, y: 0 };
  private selfSpawned = false;
  private lastSent = 0;
  private lastSentX = 0;
  private lastSentY = 0;
  private lastSentFacing = Number.NaN;
  private pendingSlide = Promise.resolve();
  private lightsReady = false;
  private orbit = new FollowOrbitCamera();
  private orbitBound = false;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.scene.background = new THREE.Color(0x0a0f1e);
    this.scene.fog = new THREE.Fog(0x0a0f1e, FOG_NEAR, FOG_FAR);
    this.orbit.reset({ lookY: 18 });
  }

  private ensureLights() {
    if (this.lightsReady) return;
    this.lightsReady = true;
    const hemi = new THREE.HemisphereLight(0xb0c4de, 0x3a2a18, 0.85);
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.1);
    sun.position.set(200, 400, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -400;
    sun.shadow.camera.right = 400;
    sun.shadow.camera.top = 400;
    sun.shadow.camera.bottom = -400;
    this.scene.add(hemi, sun);
  }

  activate(canvas?: HTMLCanvasElement) {
    ensureKeyboard();
    this.ensureLights();
    if (canvas) {
      this.orbit.attach(canvas);
      this.orbitBound = true;
    }
    // Warm GLTF + KayKit animation caches.
    void import("./modelLoader").then(({ loadModel }) => {
      void loadModel(MODELS.characters.self);
      void loadModel(MODELS.characters.player);
      void loadModel(MODELS.enemies.default);
      void loadModel(MODELS.pois.save);
      void loadModel(MODELS.pois.camp);
    });
    void import("./characterAnim").then(({ loadKayKitClips }) => {
      void loadKayKitClips();
    });
  }

  deactivate() {
    if (this.orbitBound) {
      this.orbit.detach();
      this.orbitBound = false;
    }
    clearWorldLocalPos();
    this.selfSpawned = false;
  }

  dispose() {
    this.deactivate();
    this.clearGroup(this.players);
    this.clearGroup(this.foes);
    this.clearGroup(this.pets);
    this.clearGroup(this.saves);
    this.clearGroup(this.jobs);
    this.clearGroup(this.camps);
    if (this.terrain) {
      this.scene.remove(this.terrain);
      this.terrain = null;
    }
    if (this.natureRoot) {
      this.scene.remove(this.natureRoot);
      this.natureRoot = null;
    }
  }

  private clearGroup(map: Map<string, EntityRec>) {
    for (const rec of map.values()) this.scene.remove(rec.root);
    map.clear();
  }

  private syncTerrain() {
    const state = useGame.getState();
    const map = state.overworld;
    if (!map) return;
    // Include map id + cell samples — many maps share cols/rows/tile, so length alone
    // left a stale (often wrong-size-feeling) plane after portals.
    const cells = map.cells;
    const mid = cells.length >> 1;
    const key = `${state.mapInfo?.id ?? ""}:${map.cols}x${map.rows}:${map.tile}:${cells.length}:${cells[0] ?? ""}:${cells[mid] ?? ""}:${cells[cells.length - 1] ?? ""}`;
    if (key === this.mapKey && this.terrain) return;
    this.mapKey = key;
    if (this.terrain) {
      this.scene.remove(this.terrain);
      this.terrain.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          const mapTex = (m as THREE.MeshStandardMaterial).map;
          mapTex?.dispose();
          m.dispose();
        }
      });
      this.terrain = null;
    }
    if (this.natureRoot) {
      this.scene.remove(this.natureRoot);
      this.natureRoot = null;
    }
    this.terrain = createTerrainMesh(map.cols, map.rows, map.tile, map.cells, FILL);
    this.scene.add(this.terrain);
    this.natureRoot = this.buildNatureScatter(map);
    this.scene.add(this.natureRoot);
    this.worldW = map.cols * map.tile;
    this.worldH = map.rows * map.tile;
  }

  private buildNatureScatter(map: { cols: number; rows: number; tile: number; cells: string }): THREE.Group {
    const root = new THREE.Group();
    root.name = "nature";
    let placed = 0;
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        if (placed >= NATURE_BUDGET) return root;
        const ch = map.cells[r * map.cols + c] ?? "";
        if (ch !== "T" && ch !== "," && ch !== ".") continue;
        const seed = (c * 73856093) ^ (r * 19349663);
        const roll = (seed >>> 0) % 100;
        const chance = ch === "T" ? 18 : ch === "," ? 6 : 3;
        if (roll >= chance) continue;
        const kindRoll = (seed >>> 8) % 10;
        const kind =
          ch === "T"
            ? kindRoll < 4
              ? "treeHigh"
              : kindRoll < 7
                ? "treeMed"
                : "treeLow"
            : kindRoll < 5
              ? "bush"
              : kindRoll < 8
                ? "rock"
                : "treeLow";
        const prop = createNatureProp(kind, seed);
        const x = (c + 0.5) * map.tile + ((seed >> 3) % 7) - 3;
        const y = (r + 0.5) * map.tile + ((seed >> 5) % 7) - 3;
        setMapPosition(prop, x, y, 0);
        prop.rotation.y = ((seed >> 11) % 360) * (Math.PI / 180);
        root.add(prop);
        placed++;
      }
    }
    return root;
  }

  private upsert(
    map: Map<string, EntityRec>,
    id: string,
    factory: () => THREE.Group,
    x: number,
    y: number,
    yaw?: number,
  ): EntityRec {
    let rec = map.get(id);
    if (!rec) {
      const root = factory();
      this.scene.add(root);
      rec = { root };
      map.set(id, rec);
    }
    setMapPosition(rec.root, x, y, 0);
    if (yaw != null) rec.root.rotation.y = yaw;
    return rec;
  }

  update(dt: number, timeMs: number, stage: ThreeStageContext): Css2dLabelSpec[] {
    if (!this.orbitBound) {
      this.orbit.attach(stage.canvas);
      this.orbitBound = true;
    }
    const state = useGame.getState();
    if (state.screen !== "world") {
      return [];
    }
    this.syncTerrain();
    const selfId = state.selfId;
    if (!selfId) {
      return [];
    }

    const selfLocked = state.players[selfId]?.in_battle ?? false;
    const labels: Css2dLabelSpec[] = [];
    // Players
    const seenP = new Set<string>();
    for (const wp of Object.values(state.players)) {
      if (wp.in_house) continue;
      seenP.add(wp.id);
      const isSelf = wp.id === selfId;
      let x = wp.x;
      let y = wp.y;
      let facing: FacingYaw = parseFacingYaw(wp.facing);
      let moving = false;
      if (isSelf) {
        if (!this.selfSpawned) {
          this.selfPos = { x: wp.x, y: wp.y };
          this.orbit.snap(wp.x, wp.y);
          this.selfSpawned = true;
        }
        x = this.selfPos.x;
        y = this.selfPos.y;
        facing = getFacing();
      } else {
        const prev = this.players.get(wp.id);
        if (prev) {
          const nx = THREE.MathUtils.lerp(prev.root.position.x, wp.x, 0.25);
          const ny = THREE.MathUtils.lerp(prev.root.position.z, wp.y, 0.25);
          const mdx = nx - prev.root.position.x;
          const mdy = ny - prev.root.position.z;
          moving = Math.hypot(mdx, mdy) > 0.15;
          if (moving) facing = facingFromAxes(mdx, mdy, facing);
          x = nx;
          y = ny;
        }
      }
      const rec = this.upsert(
        this.players,
        wp.id,
        () => createCharacterMesh({ self: isSelf, accent: isSelf ? 0xd4b896 : 0x7a8aa0 }),
        x,
        y,
        facingYaw(facing),
      );
      rec.root.visible = true;
      getAnimator(rec.root)?.update(dt);
      if (!isSelf) getAnimator(rec.root)?.setMoving(moving);
      const locked = wp.in_battle;
      rec.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const raw of mats) {
          if (!raw || !("opacity" in raw)) continue;
          const m = raw as THREE.MeshStandardMaterial;
          if (locked) {
            m.transparent = true;
            m.opacity = 0.45;
            m.depthWrite = false;
          } else if (m.transparent && m.opacity < 1) {
            m.opacity = 1;
            m.transparent = false;
            m.depthWrite = true;
          }
        }
      });
      const joinable = locked && !isSelf && !selfLocked;
      pushLabel(
        labels,
        worldEntityLabel(
          wp.id,
          `${wp.name} Lv${wp.level}${locked ? " ⚔" : ""}${joinable ? " (join)" : ""}`,
          isSelf ? "self" : "player",
          x,
          y,
          this.castProgress(wp),
        ),
      );
    }
    for (const [id, rec] of this.players) {
      if (!seenP.has(id)) {
        this.scene.remove(rec.root);
        this.players.delete(id);
      }
    }

    // NPCs / foes
    const seenF = new Set<string>();
    for (const npc of Object.values(state.npcs)) {
      seenF.add(npc.id);
      const kind = enemyKindFromName(npc.name, npc.kind);
      let rec = this.foes.get(npc.id);
      if (!rec || rec.kind !== kind) {
        if (rec) this.scene.remove(rec.root);
        const root = createEnemyMesh(kind);
        this.scene.add(root);
        rec = { root, kind };
        this.foes.set(npc.id, rec);
      }
      const prev = rec.root.position;
      const x = THREE.MathUtils.lerp(prev.x, npc.x, 0.2);
      const y = THREE.MathUtils.lerp(prev.z, npc.y, 0.2);
      setMapPosition(rec.root, x, y, 0);
      pushLabel(labels, worldEntityLabel(npc.id, npc.name, "enemy", x, y));
    }
    for (const [id, rec] of this.foes) {
      if (!seenF.has(id)) {
        this.scene.remove(rec.root);
        this.foes.delete(id);
      }
    }

    // Move self after reading others so camera/overlays use new pose
    this.moveSelf(dt, timeMs, selfId, selfLocked);

    const selfRec = this.players.get(selfId);
    if (selfRec) {
      setMapPosition(selfRec.root, this.selfPos.x, this.selfPos.y, 0);
      selfRec.root.rotation.y = facingYaw(getFacing());
      // refresh self nameplate after movement
      const idx = labels.findIndex((e) => e.id === selfId && e.kind === "entity");
      if (idx >= 0) {
        const wp = state.players[selfId]!;
        const prev = labels[idx]!;
        labels[idx] = worldEntityLabel(
          selfId,
          prev.kind === "entity" ? prev.label : wp.name,
          "self",
          this.selfPos.x,
          this.selfPos.y,
          this.castProgress(wp),
        );
      }
    }

    // Pets
    const seenPet = new Set<string>();
    const followT = 1 - Math.exp(-PET_FOLLOW_SMOOTH * dt);
    for (const pet of Object.values(state.pets)) {
      seenPet.add(pet.id);
      const owner = state.players[pet.owner_id];
      const kind = enemyKindFromName(pet.name, pet.kind);
      let rec = this.pets.get(pet.id);
      if (!rec || rec.kind !== kind) {
        if (rec) this.scene.remove(rec.root);
        const root = createPetMesh(kind);
        this.scene.add(root);
        rec = { root, kind };
        this.pets.set(pet.id, rec);
      }
      let facing: FacingYaw = getFacing();
      if (owner && !owner.in_house && !owner.in_battle) {
        const isSelfOwner = owner.id === selfId;
        const ox = isSelfOwner ? this.selfPos.x : (this.players.get(owner.id)?.root.position.x ?? owner.x);
        const oy = isSelfOwner ? this.selfPos.y : (this.players.get(owner.id)?.root.position.z ?? owner.y);
        if (isSelfOwner) facing = getFacing();
        else facing = parseFacingYaw(owner.facing, facing);
        const off = followOffset(facing, PET_FOLLOW_DIST);
        const tx = ox + off.x;
        const ty = oy + off.y;
        const px = THREE.MathUtils.lerp(rec.root.position.x, tx, followT);
        const py = THREE.MathUtils.lerp(rec.root.position.z, ty, followT);
        setMapPosition(rec.root, px, py, 0);
        rec.root.rotation.y = facingYaw(facing);
      } else {
        setMapPosition(rec.root, pet.x, pet.y, 0);
      }
    }
    for (const [id, rec] of this.pets) {
      if (!seenPet.has(id)) {
        this.scene.remove(rec.root);
        this.pets.delete(id);
      }
    }

    // POIs
    const activeSave = state.profile?.save_point_id;
    const seenS = new Set<string>();
    for (const sp of Object.values(state.savePoints)) {
      seenS.add(sp.id);
      const active = sp.id === activeSave;
      let rec = this.saves.get(sp.id);
      if (!rec || rec.kind !== (active ? "a" : "i")) {
        if (rec) this.scene.remove(rec.root);
        const root = createSavePointMesh(!!active);
        this.scene.add(root);
        rec = { root, kind: active ? "a" : "i" };
        this.saves.set(sp.id, rec);
      }
      setMapPosition(rec.root, sp.x, sp.y, 0);
      pushLabel(
        labels,
        worldPoiLabel(`save:${sp.id}`, sp.name, active ? "save-active" : "save", sp.x, sp.y, POI_LABEL_HEIGHT),
      );
    }
    for (const [id, rec] of this.saves) {
      if (!seenS.has(id)) {
        this.scene.remove(rec.root);
        this.saves.delete(id);
      }
    }

    const seenJ = new Set<string>();
    for (const jc of Object.values(state.jobChangers)) {
      seenJ.add(jc.id);
      this.upsert(this.jobs, jc.id, () => createJobChangerMesh(), jc.x, jc.y);
      pushLabel(labels, worldPoiLabel(`job:${jc.id}`, jc.name, "job", jc.x, jc.y, POI_LABEL_HEIGHT));
    }
    for (const [id, rec] of this.jobs) {
      if (!seenJ.has(id)) {
        this.scene.remove(rec.root);
        this.jobs.delete(id);
      }
    }

    const seenC = new Set<string>();
    for (const camp of Object.values(state.camps ?? {})) {
      seenC.add(camp.owner_name);
      let rec = this.camps.get(camp.owner_name);
      if (!rec || rec.kind !== camp.skin) {
        if (rec) this.scene.remove(rec.root);
        const root = createCampMesh(camp.skin);
        this.scene.add(root);
        rec = { root, kind: camp.skin };
        this.camps.set(camp.owner_name, rec);
      }
      setMapPosition(rec.root, camp.x, camp.y, 0);
      pushLabel(
        labels,
        worldPoiLabel(
          `camp:${camp.owner_name}`,
          `${camp.owner_name}'s Camp`,
          "camp",
          camp.x,
          camp.y,
          CAMP_LABEL_HEIGHT,
        ),
      );
    }
    for (const [id, rec] of this.camps) {
      if (!seenC.has(id)) {
        this.scene.remove(rec.root);
        this.camps.delete(id);
      }
    }

    if (canShowWorldInteractPrompts(state)) {
      const keyLabel = interactKeyLabel(state.profile?.keybinds);
      const sx = this.selfPos.x;
      const sy = this.selfPos.y;
      for (const sp of Object.values(state.savePoints)) {
        if (Math.hypot(sx - sp.x, sy - sp.y) <= SAVE_POINT_RANGE) {
          pushLabel(labels, worldInteractLabel(`ix-save:${sp.id}`, keyLabel, sp.x, sp.y));
        }
      }
      for (const jc of Object.values(state.jobChangers)) {
        if (Math.hypot(sx - jc.x, sy - jc.y) <= JOB_CHANGER_RANGE) {
          pushLabel(labels, worldInteractLabel(`ix-job:${jc.id}`, keyLabel, jc.x, jc.y));
        }
      }
      for (const camp of Object.values(state.camps ?? {})) {
        if (Math.hypot(sx - camp.x, sy - camp.y) <= INTERACT_RANGE) {
          pushLabel(labels, worldInteractLabel(`ix-camp:${camp.owner_name}`, keyLabel, camp.x, camp.y));
        }
      }
      for (const wp of Object.values(state.players)) {
        if (wp.id === selfId || wp.in_house || !wp.in_battle) continue;
        if (!battleJoinable(state, wp.battle_id)) continue;
        const av = this.players.get(wp.id);
        const x = av?.root.position.x ?? wp.x;
        const y = av?.root.position.z ?? wp.y;
        if (Math.hypot(sx - x, sy - y) <= INTERACT_RANGE) {
          pushLabel(labels, worldInteractLabel(`ix-player:${wp.id}`, keyLabel, x, y, 48));
        }
      }
    }

    this.updateCamera(dt);
    return labels;
  }

  private castProgress(wp: { casting_skill_id?: string; cast_time_ms?: number; cast_ends_at?: number }): number | undefined {
    if (!wp.casting_skill_id || !(wp.cast_time_ms && wp.cast_time_ms > 0)) return undefined;
    return Math.min(1, Math.max(0, 1 - ((wp.cast_ends_at ?? 0) - Date.now()) / wp.cast_time_ms));
  }

  private updateCamera(_dt: number) {
    this.orbit.follow(this.selfPos.x, this.selfPos.y);
    this.orbit.apply(this.camera);
  }

  private moveSelf(dt: number, timeMs: number, selfId: string, locked: boolean) {
    const state = useGame.getState();
    const wp = state.players[selfId];
    const overworld = state.overworld;
    if (!wp || locked || !overworld) return;

    const active = document.activeElement?.tagName;
    if (active === "INPUT" || active === "TEXTAREA") return;

    if (Math.hypot(this.selfPos.x - wp.x, this.selfPos.y - wp.y) > 80) {
      this.selfPos = { x: wp.x, y: wp.y };
      this.orbit.snap(wp.x, wp.y);
      if (wp.facing != null) setFacing(parseFacingYaw(wp.facing));
    }

    const { dx, dy, facing } = readMoveAxes(state.profile?.keybinds, this.orbit.yaw);
    setFacing(facing);
    const animHost = this.players.get(selfId)?.root;
    if (dx === 0 && dy === 0) {
      setWorldLocalPos(this.selfPos.x, this.selfPos.y);
      if (animHost) getAnimator(animHost)?.setMoving(false);
      return;
    }
    if (animHost) getAnimator(animHost)?.setMoving(true);

    const len = Math.hypot(dx, dy) || 1;
    const nx = Math.min(
      this.worldW - H99_COLLISION_HALF_W,
      Math.max(H99_COLLISION_HALF_W, this.selfPos.x + (dx / len) * SPEED * dt),
    );
    const ny = Math.min(
      this.worldH,
      Math.max(H99_COLLISION_HALF_H, this.selfPos.y + (dy / len) * SPEED * dt),
    );
    const ox = this.selfPos.x;
    const oy = this.selfPos.y;
    this.selfPos = { x: nx, y: ny };
    setWorldLocalPos(nx, ny);

    this.pendingSlide = this.pendingSlide.then(async () => {
      const slid = await applyPlayerSlide(overworld, ox, oy, nx, ny);
      this.selfPos = { x: slid.x, y: slid.y };
      setWorldLocalPos(slid.x, slid.y);
      const moved = Math.hypot(slid.x - ox, slid.y - oy) > 0.5;
      const wpNow = useGame.getState().players[selfId];
      if (wpNow?.casting_skill_id && moved) {
        useGame.setState((s) => {
          const cur = s.players[selfId];
          if (!cur?.casting_skill_id) return s;
          return {
            players: {
              ...s.players,
              [selfId]: { ...cur, casting_skill_id: undefined, cast_time_ms: undefined, cast_ends_at: undefined },
            },
          };
        });
      }
      this.sendPosition(timeMs, slid.x, slid.y, facing, !!wpNow?.casting_skill_id && moved);
    });
  }

  private sendPosition(time: number, x: number, y: number, facing: FacingYaw, force: boolean) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (!force && time - this.lastSent <= SEND_INTERVAL) return;
    const facingChanged =
      !Number.isFinite(this.lastSentFacing) || Math.abs(facing - this.lastSentFacing) > 0.01;
    if (rx === this.lastSentX && ry === this.lastSentY && !facingChanged) return;
    net.move(rx, ry, facing);
    this.lastSent = time;
    this.lastSentX = rx;
    this.lastSentY = ry;
    this.lastSentFacing = facing;
  }
}
