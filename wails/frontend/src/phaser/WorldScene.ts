import Phaser from "phaser";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";

import { WorldMovement } from "./movement";
import { FILL, tileAt, WALKABLE } from "../world/overworld";
import {
  rasterizeTerrainRect,
  terrainLayerKey,
  terrainLayersFromSnapshot,
  type TerrainLayerData,
} from "../world/terrainRaster";
import { getLoadedPipoyaSheets, loadPipoyaSheets } from "../world/pipoyaTilesets";
import { isoParent, isoProject } from "../world/iso";
import {
  bakedChunkUrl,
  bakedTerrainMatches,
  fetchBakedTerrain,
  type BakedTerrain,
} from "../world/bakedTerrain";
import {
  liveStampFeature,
  mapFeatureCatalog,
  mapFeatureStamps,
  stampAnchorY,
  type FeatureStamp,
  type MapFeature,
} from "../world/featureStamps";
import { colorForGid } from "../editor/tilePalette";
import {
  portalKey,
  terrainInputsChanged,
  type TerrainSyncInputs,
} from "../world/worldTerrainSync";
import type { MapTerrainLayers, OverworldMap, CharacterAppearanceWire } from "../types";
import {
  EntityWorld,
  Identity,
  NetworkSnapshot,
  Removed,
  SnapshotSync,
  entityExternalId,
  type CampState,
  type JobChangerState,
  type SavePointState,
} from "../ecs";

import { trackContentZoom } from "./contentZoom";
import { pushChat } from "../state/store";
import { openJobMasterDialog } from "../world/npcDialogue";
import {
  INTERACT_RANGE,
  JOB_CHANGER_RANGE,
  SAVE_POINT_RANGE,
  canShowWorldInteractPrompts,
  interactKeyLabel,
} from "../world/interact";
import { clearWorldLocalPos, setWorldLocalPos } from "../world/worldLocalPos";
import { clearWorldViewRect, setWorldViewRect } from "../world/viewRect";
import {
  clearEntityOverlays,
  getStageTransform,
  localOffsetToStage,
  setWorldOverlays,
  worldLocalToStage,
  worldToStagePoint,
  type EntityOverlayMark,
  type InteractPromptMark,
  type PoiLabelMark,
} from "../world/entityOverlayBridge";
import { collectEntityOverlayMarks } from "./systems/entityOverlay";
import { collectPoiOverlayMarks } from "./systems/poiOverlay";
import {
  ActorVisual,
  type ActorVisualRole,
  cleanupActorVisuals,
  destroyActorVisuals,
  syncCombatExtraVisuals,
  selfActorVisual,
  syncNpcVisuals,
  syncPetVisuals,
  syncPlayerVisuals,
} from "./systems/actorVisuals";
import {
  cleanupPoiVisuals,
  destroyPoiVisuals,
  syncPoiVisuals as syncEcsPoiVisuals,
} from "./systems/poiVisuals";
import {
  syncActorMotion as syncEcsActorMotion,
  syncRenderPoses as syncEcsRenderPoses,
} from "./systems/actorMotion";
import {
  latestCombatEventSeq,
  processCombatEvents as processEcsCombatEvents,
  type CombatVisualRef,
} from "./systems/combatEvents";
import { TargetRing } from "./systems/targetRing";
import { syncVisualHandles as syncEcsVisualHandles, VisualHandle } from "./systems/visualHandles";
import {
  CollisionGizmo,
  type CollisionGizmoEntry,
  type CollisionGizmoRole,
  type CollisionGridView,
} from "./systems/collisionGizmo";

/** Tiles per terrain chunk side — a 64×64 chunk rasterizes to a 2048px canvas. */
const TERRAIN_CHUNK_TILES = 64;

interface TerrainChunk {
  baseKey: string;
  /** Set once the image exists — baked chunks create it after the PNG loads. */
  base?: Phaser.GameObjects.Image;
  /** Walk-under canopy texture key + image (rasterized or baked `over`). */
  overKey?: string;
  over?: Phaser.GameObjects.Image;
}

export class WorldScene extends Phaser.Scene {
  private ecs = new EntityWorld();
  private ecsSnapshots = new SnapshotSync(this.ecs);
  private selfSpawned = false;
  private followedWrapper?: Phaser.GameObjects.Container;
  /**
   * World layer — orthogonal now, so it is a plain identity container kept
   * for callsites that parent world-space objects. `camProxy` shadows the
   * followed actor's projected position so camera follow works in whatever
   * space the camera sees.
   */
  private worldLayer?: Phaser.GameObjects.Container;
  private camProxy?: Phaser.GameObjects.Zone;
  /** True when the Pipoya sheet fetch failed — chunks fall back to flat colors. */
  private pipoyaFailed = false;
  private terrain?: Phaser.GameObjects.Graphics;
  private terrainLayerData: TerrainLayerData | null = null;
  /** Rasterized terrain chunks keyed "cx,cy" — only chunks near the camera exist. */
  private terrainChunks = new Map<string, TerrainChunk>();
  /**
   * Validated bake manifest for the current terrain layers — undefined while
   * the fetch/validation is in flight, null when runtime rasterization owns
   * the map (no bake or stale bake).
   */
  private bakedManifest: BakedTerrain | null | undefined = null;
  /** Baked chunks whose PNG 404'd — those permanently rasterize at runtime. */
  private bakedChunkFailed = new Set<string>();
  /** In-flight lazy image loads, keyed by texture key. */
  private pendingTex = new Map<string, Promise<boolean>>();
  /** Map-feature stamp props (buildings) — rebuilt when the map id changes. */
  private stampProps: Phaser.GameObjects.Image[] = [];
  private stampsMapId: string | null = null;
  private portalsGfx?: Phaser.GameObjects.Graphics;
  private terrainInputs: TerrainSyncInputs | null = null;
  private terrainPortalKey = "";
  private terrainTextureKey = "";
  /** Map id the current terrain inputs belong to — part of the sync key. */
  private terrainMapId = "";
  private terrainUnsub?: () => void;
  private worldW = 5120;
  private worldH = 3840;
  private lastMapId = "";
  // — Realtime combat state (ported from RTBattleScene) —
  /** Highest combatEvents seq already animated (survives scene restarts). */
  private combatSeenSeq = 0;
  /** Entities mid jump-crash — position sync is paused while they fly. */
  private jumping = new Set<string>();
  /** Focus-target ring under the current target's feet. */
  private targetRing = new TargetRing();
  /** Debug gizmo: entity collision bounds (options.showCollisionBounds / F3). */
  private collisionGizmo = new CollisionGizmo(this);
  /** Unwalkable-cell grid for the gizmo — mirrors what movement checks. */
  private collisionGrid: CollisionGridView | null = null;
  /** Local-player movement: key input, click-to-move, dodge dash, sends. */
  private movement = new WorldMovement(this, {
    self: () => {
      const self = selfActorVisual(this.ecs);
      return self?.visual.character
        ? { id: self.id, wrapper: self.visual.wrapper, sprite: self.visual.character }
        : undefined;
    },
    isJumping: (id) => this.jumping.has(id),
    worldBounds: () => ({ w: this.worldW, h: this.worldH }),
  });

  constructor() {
    super("world");
  }

  create() {
    trackContentZoom(this);
    // Orthogonal world — world-space objects live directly on the display
    // list so they depth-sort against actors (isoParent no-ops without a
    // registered iso layer). The container stays for callsites that hold a
    // world-layer reference.
    this.worldLayer = this.add.container(0, 0).setDepth(0);
    this.camProxy = this.add.zone(0, 0, 4, 4);

    this.resetEcs();
    const map = useGame.getState().overworld;
    this.applyWorldBounds(map);
    this.bindTerrainSync();
    this.syncTerrainFromStore();
    void loadPipoyaSheets()
      .then(() => {
        if (!this.sys.isActive()) return;
        // Force a redraw now that real tile sheets are available.
        this.terrainInputs = null;
        this.terrainTextureKey = "";
        this.syncTerrainFromStore();
      })
      .catch((err) => {
        this.pipoyaFailed = true;
        console.warn("Pipoya tilesets failed to load; using flat terrain colors", err);
        this.terrainInputs = null;
        this.terrainTextureKey = "";
        this.syncTerrainFromStore();
      });

    const kb = this.input.keyboard!;
    this.movement.syncMoveKeys();
    kb.disableGlobalCapture();
    // Combat input: Shift keyup dodges unless it was a Shift+hotbar chord.
    kb.off("keydown", this.movement.onCombatKeyDown);
    kb.off("keyup", this.movement.onCombatKeyUp);
    kb.on("keydown", this.movement.onCombatKeyDown);
    kb.on("keyup", this.movement.onCombatKeyUp);
    // Click-to-move: left-click on open ground paths to the point. Entity and
    // POI hit zones consume their own clicks (non-empty `over`), so this only
    // fires on bare terrain.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.movement.onGroundPointerDown);
    // Don't replay combat events that fired while the scene was away.
    this.combatSeenSeq = latestCombatEventSeq(useGame.getState().combatEvents);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.terrainUnsub?.();
      this.terrainUnsub = undefined;
      // The display list teardown destroys every GameObject — drop the chunk
      // and stamp bookkeeping too so a scene restart rebuilds from scratch.
      this.clearTerrain();
      this.terrainInputs = null;
      this.terrainPortalKey = "";
      this.jumping.clear();
      this.targetRing.destroy();
      this.collisionGizmo.destroy();
      this.movement.reset();
      this.resetEcs();
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.movement.onGroundPointerDown);
      clearEntityOverlays();
      clearWorldLocalPos();
      clearWorldViewRect();
    });
    // game.destroy() emits DESTROY without SHUTDOWN — release the store
    // subscription so a dead scene can never run inside setState.
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.terrainUnsub?.();
      this.terrainUnsub = undefined;
    });
    this.events.on(Phaser.Scenes.Events.SLEEP, () => {
      clearEntityOverlays();
      clearWorldViewRect();
    });
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      // Returning from the house scene: force the self avatar to re-snap so
      // the camera follows the updated world position instead of the stale
      // pre-sleep location.  Also clear overlays so no house-scene labels
      // linger.
      this.resetEcs();
      clearEntityOverlays();
      // Don't replay combat events that fired while the scene was asleep.
      this.combatSeenSeq = latestCombatEventSeq(useGame.getState().combatEvents);
    });
  }

  private syncEcsSnapshot(state: ReturnType<typeof useGame.getState>) {
    this.ecsSnapshots.sync({
      entities: state.entities,
      combatIds: state.combatIds,
      selfId: state.selfId,
      savePoints: state.savePoints,
      jobChangers: state.jobChangers,
      camps: state.camps,
      activeSavePointId: state.profile?.save_point_id,
      mapId: state.mapInfo?.id ?? "",
    });
  }

  private destroyEcsVisuals() {
    destroyActorVisuals(this.ecs);
    destroyPoiVisuals(this.ecs);
  }

  private resetEcs() {
    this.selfSpawned = false;
    this.followedWrapper = undefined;
    this.jumping.clear();
    this.movement.reset();
    this.movement.invalidateSlides();
    this.targetRing.hide();
    this.destroyEcsVisuals();
    this.ecsSnapshots.reset();
  }

  private cleanupEcsRemoved() {
    cleanupActorVisuals(this.ecs);
    cleanupPoiVisuals(this.ecs);
    for (const entity of this.ecs.query(Removed)) this.ecs.destroy(entity);
  }

  private syncPoiVisuals() {
    syncEcsPoiVisuals(this.ecs, this, {
      setSavePoint: (sp) => this.trySetSavePoint(sp),
      openJobChanger: (jc) => this.tryOpenJobChanger(jc),
      enterCamp: (camp) => this.tryEnterCamp(camp),
    });
  }

  private syncNpcVisuals() {
    syncNpcVisuals(this.ecs, this, {
      clickEntity: (id) => this.onEntityClicked(id),
    });
  }

  private syncPetVisuals() {
    syncPetVisuals(this.ecs, this, {
      clickEntity: (id) => this.onEntityClicked(id),
    });
  }

  private syncPlayerVisuals() {
    syncPlayerVisuals(this.ecs, this, {
      clickEntity: (id) => this.onEntityClicked(id),
      resolveAppearance: (id, race, weapon, subWeapon, wire) =>
        this.resolveAppearance(id, race, weapon, subWeapon, wire),
    });
  }

  private syncCombatExtraVisuals(selfId: string | null) {
    syncCombatExtraVisuals(this.ecs, this, {
      selfId,
      clickEntity: (id) => this.onEntityClicked(id),
      isWorldReplica: (id) =>
        this.playerVisualFor(id) !== undefined ||
        this.npcVisualFor(id) !== undefined ||
        this.petVisualFor(id) !== undefined,
    });
  }

  private syncActorMotion(delta: number, roles?: readonly ActorVisualRole[]) {
    syncEcsActorMotion(this.ecs, delta, {
      roles,
      jumping: this.jumping,
      isNear: (x, y) => this.isNearCamera(x, y),
      time: this.time.now,
      now: Date.now(),
      self: {
        spawned: () => this.selfSpawned,
        dodging: () => this.movement.dodging,
        onSpawn: (visual) => {
          this.followedWrapper = visual.wrapper;
          // Camera follows a screen-space proxy — the wrapper keeps world
          // coordinates, so follow its projected position (identity ortho).
          const p = isoProject(this, visual.wrapper.x, visual.wrapper.y);
          this.camProxy?.setPosition(p.x, p.y);
          this.cameras.main.centerOn(p.x, p.y);
          if (this.camProxy) {
            this.cameras.main.startFollow(this.camProxy, true, 0.15, 0.15);
          }
          this.selfSpawned = true;
        },
        onSnap: (visual) => {
          // Avatar teleported (zone transfer, return skill): jump the camera
          // to it — the follow lerp would otherwise slide over for ~1s.
          const p = isoProject(this, visual.wrapper.x, visual.wrapper.y);
          this.camProxy?.setPosition(p.x, p.y);
          this.cameras.main.centerOn(p.x, p.y);
        },
        onPosition: (x, y) => setWorldLocalPos(x, y),
      },
    });
  }

  private syncRenderPoses() {
    syncEcsRenderPoses(this.ecs);
  }

  private syncVisualHandles() {
    const desired = new Map<string, VisualHandle>();
    for (const entity of this.ecs.queryExcluding([ActorVisual], [Removed])) {
      const visual = this.ecs.get(ActorVisual, entity);
      const identity = this.ecs.get(Identity, entity);
      if (!visual || identity?.kind !== "entity") continue;
      desired.set(identity.externalId.slice("entity:".length), {
        wrapper: visual.wrapper,
        sprite: visual.sprite,
        role: visual.role,
      });
    }
    syncEcsVisualHandles(this.ecs, desired);
  }

  private bindTerrainSync() {
    this.terrainUnsub?.();
    this.terrainUnsub = useGame.subscribe(() => {
      // A throwing listener aborts every subscriber registered after it for
      // that setState — terrain failures must not starve the rest of the app.
      try {
        this.syncTerrainFromStore();
      } catch (err) {
        console.error("[WorldScene] terrain sync failed", err);
      }
    });
  }

  private syncTerrainFromStore() {
    // game.destroy() drops the camera manager without emitting SHUTDOWN, so a
    // leaked subscription or a late async callback can outlive the scene —
    // never run camera-dependent work on a torn-down scene.
    if (!this.cameras?.main) return;
    const state = useGame.getState();
    this.syncTerrain(state.overworld, state.mapInfo?.portals, state.mapInfo?.terrainLayers);
  }

  private resolveAppearance(
    playerId: string,
    race?: string,
    weapon?: string,
    subWeapon?: string,
    wire?: CharacterAppearanceWire,
  ) {
    const state = useGame.getState();
    return resolveCharacterAppearance({
      playerId,
      selfId: state.selfId,
      profile: state.profile,
      race,
      weapon,
      subWeapon,
      wire,
    });
  }

  private applyWorldBounds(map: OverworldMap | null) {
    const t = map?.tile ?? 32;
    const cols = map?.cols ?? 160;
    const rows = map?.rows ?? 120;
    this.worldW = cols * t;
    this.worldH = rows * t;
    // Ortho footprint is a plain rect (plus a small pad so edges don't snap).
    const pad = 4 * t;
    this.cameras.main.setBounds(-pad, -pad, this.worldW + pad * 2, this.worldH + pad * 2);
  }

  private syncTerrain(
    map: OverworldMap | null,
    portals?: { x: number; y: number; w: number; h: number }[],
    terrainLayers?: MapTerrainLayers | null,
  ) {
    if (!map) {
      this.collisionGrid = null;
      this.collisionGizmo.setGrid(null);
      for (const p of this.stampProps) p.destroy();
      this.stampProps = [];
      this.stampsMapId = null;
      return;
    }

    this.syncMapStamps();
    const nextInputs: TerrainSyncInputs = {
      cells: map.cells,
      portals,
      terrainLayers,
    };
    const nextPortalKey = portalKey(portals);
    // Map id is part of the inputs: identical terrain on a new map must still
    // re-resolve the bake manifest + stamp props for the new map's assets.
    const mapId = useGame.getState().mapInfo?.id ?? "";
    const sameTerrain =
      !terrainInputsChanged(this.terrainInputs, nextInputs) && mapId === this.terrainMapId;
    const samePortals = nextPortalKey === this.terrainPortalKey;

    if (sameTerrain && samePortals) return;

    this.applyWorldBounds(map);

    const layerData = terrainLayersFromSnapshot(map, terrainLayers);
    if (layerData) {
      this.collisionGrid = {
        blocked: layerData.collision,
        cols: layerData.cols,
        rows: layerData.rows,
        tileSize: layerData.tileSize,
        originX: 0,
        originY: 0,
      };
      this.collisionGizmo.setGrid(this.collisionGrid);
      this.renderConfigTerrain(layerData, portals);
    } else {
      this.clearTerrain();
      this.drawAsciiTerrain(map, portals);
      const blocked = new Uint8Array(map.cols * map.rows);
      for (let i = 0; i < blocked.length; i++) {
        blocked[i] = WALKABLE.has(map.cells[i] ?? "") ? 0 : 1;
      }
      this.collisionGrid = {
        blocked,
        cols: map.cols,
        rows: map.rows,
        tileSize: map.tile || 32,
        originX: 0,
        originY: 0,
      };
      this.collisionGizmo.setGrid(this.collisionGrid);
    }
    // Commit the sync markers only after the rebuild succeeded — a failed
    // sync must leave the scene dirty so the next store update retries.
    this.terrainInputs = nextInputs;
    this.terrainPortalKey = nextPortalKey;
    this.terrainMapId = mapId;
  }

  private clearTerrain() {
    this.terrain?.destroy();
    this.terrain = undefined;
    this.terrainLayerData = null;
    for (const chunk of this.terrainChunks.values()) {
      this.destroyChunk(chunk);
    }
    this.terrainChunks.clear();
    this.terrainTextureKey = "";
    this.bakedManifest = null;
    this.bakedChunkFailed.clear();
    for (const p of this.stampProps) p.destroy();
    this.stampProps = [];
    this.stampsMapId = null;
    this.portalsGfx?.destroy();
    this.portalsGfx = undefined;
  }

  private renderConfigTerrain(
    data: TerrainLayerData,
    portals?: { x: number; y: number; w: number; h: number }[],
  ) {
    const sheets = getLoadedPipoyaSheets();
    const texKey = terrainLayerKey(data, !!sheets?.length);
    if (this.terrainTextureKey === texKey && this.terrainLayerData) {
      this.drawPortals(portals);
      return;
    }

    this.clearTerrain();
    this.terrainLayerData = data;
    this.terrainTextureKey = texKey;
    this.drawPortals(portals);
    // Pre-baked chunk PNGs (tools/bake_terrain.py) — while the manifest is in
    // flight chunk creation defers; a missing/stale bake resolves null and
    // runtime rasterization takes over.
    this.bakedManifest = undefined;
    const mapId = useGame.getState().mapInfo?.id ?? "";
    const layerData = data;
    void fetchBakedTerrain(mapId).then((m) => {
      if (this.terrainLayerData !== layerData) return; // stale — a newer sync owns the field
      this.bakedManifest = bakedTerrainMatches(m, layerData, TERRAIN_CHUNK_TILES)
        ? m
        : null;
    });
    this.syncTerrainChunks();
  }

  /**
   * Camera-visible chunk window, clamped to the map. Orthogonal projection —
   * the camera's worldView IS world space, so a chunk is just a rect. The
   * grid follows the bake manifest's chunk_tiles when a valid bake exists.
   */
  private terrainChunkWindow(): { cc0: number; cr0: number; cc1: number; cr1: number } | null {
    const data = this.terrainLayerData;
    if (!data) return null;
    const view = this.cameras.main.worldView;
    const pad = 96;
    const k = this.bakedManifest?.chunkTiles ?? TERRAIN_CHUNK_TILES;
    const chunkPx = k * data.tileSize;
    const chunksX = Math.ceil(data.cols / k);
    const chunksY = Math.ceil(data.rows / k);
    return {
      cc0: Math.max(0, Math.floor((view.x - pad) / chunkPx)),
      cr0: Math.max(0, Math.floor((view.y - pad) / chunkPx)),
      cc1: Math.min(chunksX - 1, Math.floor((view.right + pad) / chunkPx)),
      cr1: Math.min(chunksY - 1, Math.floor((view.bottom + pad) / chunkPx)),
    };
  }

  /** Does chunk (cx,cy)'s world-space rect intersect the view? */
  private chunkOnScreen(
    cx: number,
    cy: number,
    view: { x: number; right: number; y: number; bottom: number },
  ): boolean {
    const data = this.terrainLayerData;
    if (!data) return false;
    const t = data.tileSize;
    const K = this.bakedManifest?.chunkTiles ?? TERRAIN_CHUNK_TILES;
    const pad = 64;
    const x = cx * K * t;
    const y = cy * K * t;
    const w = Math.min(K, data.cols - cx * K) * t;
    const h = Math.min(K, data.rows - cy * K) * t;
    return (
      x + w >= view.x - pad &&
      x <= view.right + pad &&
      y + h >= view.y - pad &&
      y <= view.bottom + pad
    );
  }

  private syncTerrainChunks() {
    const data = this.terrainLayerData;
    if (!data) return;
    // Defer chunk creation until the bake manifest resolves — otherwise the
    // camera window rasterizes chunks the bake is about to serve as PNGs.
    if (this.bakedManifest === undefined) return;
    const w = this.terrainChunkWindow();
    if (!w) return;

    const view = this.cameras.main.worldView;
    const needed = new Set<string>();
    for (let cy = w.cr0; cy <= w.cr1; cy++) {
      for (let cx = w.cc0; cx <= w.cc1; cx++) {
        if (!this.chunkOnScreen(cx, cy, view)) continue;
        const key = `${cx},${cy}`;
        needed.add(key);
        if (!this.terrainChunks.has(key)) {
          this.createRasterChunk(cx, cy);
        }
      }
    }
    for (const [key, chunk] of this.terrainChunks) {
      if (needed.has(key)) continue;
      this.destroyChunk(chunk);
      this.terrainChunks.delete(key);
    }
  }

  private destroyChunk(chunk: TerrainChunk) {
    chunk.base?.destroy();
    chunk.over?.destroy();
    if (chunk.baseKey && this.textures.exists(chunk.baseKey)) {
      this.textures.remove(chunk.baseKey);
    }
    if (chunk.overKey && this.textures.exists(chunk.overKey)) {
      this.textures.remove(chunk.overKey);
    }
  }

  /**
   * Create one camera-window chunk: a pre-baked PNG pair when the manifest
   * covers it, else a runtime-rasterized canvas (flat colors until the
   * Pipoya sheets land).
   */
  private createRasterChunk(cx: number, cy: number) {
    const data = this.terrainLayerData;
    if (!data) return;
    const key = `${cx},${cy}`;
    const baked = this.bakedManifest;
    if (baked?.base.has(key) && !this.bakedChunkFailed.has(key)) {
      // Reserve the slot before the async PNG load so the sync loop doesn't
      // queue duplicate loads while it's in flight.
      const chunk: TerrainChunk = { baseKey: `baked:${baked.map}:${key}` };
      this.terrainChunks.set(key, chunk);
      void this.loadBakedChunk(baked, chunk, cx, cy);
      return;
    }
    const sheets = getLoadedPipoyaSheets();
    const k = this.bakedManifest?.chunkTiles ?? TERRAIN_CHUNK_TILES;
    const c0 = cx * k;
    const r0 = cy * k;
    const baseKey = `${this.terrainTextureKey}-ch${cx}-${cy}`;
    if (!sheets?.length) {
      // Wait for the sheets unless the fetch failed — then flat colors.
      if (!this.pipoyaFailed) return;
      this.createFlatChunk(data, cx, cy, c0, r0, k, baseKey);
      return;
    }
    const art = rasterizeTerrainRect(
      data,
      c0,
      r0,
      c0 + k,
      r0 + k,
      1,
      null,
      sheets,
    );
    if (this.textures.exists(baseKey)) this.textures.remove(baseKey);
    this.textures.addCanvas(baseKey, art.base);
    const t = data.tileSize;
    const chunk: TerrainChunk = {
      baseKey,
      base: this.add.image(c0 * t, r0 * t, baseKey).setOrigin(0, 0).setDepth(-20),
    };
    if (art.overhead) {
      // Canopy tops above the whole y-sort range — actors walk under trees.
      const overKey = `${baseKey}-over`;
      if (this.textures.exists(overKey)) this.textures.remove(overKey);
      this.textures.addCanvas(overKey, art.overhead);
      chunk.overKey = overKey;
      chunk.over = this.add
        .image(c0 * t, r0 * t, overKey)
        .setOrigin(0, 0)
        .setDepth(data.rows * data.tileSize + 1);
    }
    this.terrainChunks.set(key, chunk);
  }

  /** Stream a baked chunk's base (+ sparse canopy) PNGs into texture keys. */
  private async loadBakedChunk(baked: BakedTerrain, chunk: TerrainChunk, cx: number, cy: number) {
    const data = this.terrainLayerData;
    const key = `${cx},${cy}`;
    const fallback = () => {
      // PNG 404 (partial/stale bake) — rasterize this chunk at runtime and
      // never re-queue the missing file.
      if (this.terrainChunks.get(key) === chunk) this.terrainChunks.delete(key);
      this.destroyChunk(chunk);
      this.bakedChunkFailed.add(key);
      this.createRasterChunk(cx, cy);
    };
    const ok = await this.loadImageTexture(chunk.baseKey, bakedChunkUrl(baked, "base", cx, cy));
    if (this.terrainChunks.get(key) !== chunk || !data) return;
    if (!ok) {
      fallback();
      return;
    }
    if (!this.sys.isActive()) {
      // Scene asleep/stopped — release the reservation so the sync loop
      // retries once live (the loaded texture persists, so this is cheap).
      this.terrainChunks.delete(key);
      return;
    }
    const t = data.tileSize;
    const px = cx * baked.chunkTiles * t;
    const py = cy * baked.chunkTiles * t;
    chunk.base = this.add.image(px, py, chunk.baseKey).setOrigin(0, 0).setDepth(-20);
    if (!baked.over.has(key)) return;
    const overKey = `${chunk.baseKey}-over`;
    if (!(await this.loadImageTexture(overKey, bakedChunkUrl(baked, "over", cx, cy)))) {
      if (this.terrainChunks.get(key) !== chunk) return;
      fallback();
      return;
    }
    if (this.terrainChunks.get(key) !== chunk || !this.sys.isActive()) return;
    chunk.overKey = overKey;
    chunk.over = this.add
      .image(px, py, overKey)
      .setOrigin(0, 0)
      .setDepth(data.rows * data.tileSize + 1);
  }

  /**
   * Lazy-load an image into the texture cache mid-scene (baked chunks,
   * map-feature stamps). Resolves false when the file 404s or the scene
   * shuts down mid-load.
   */
  private loadImageTexture(key: string, url: string): Promise<boolean> {
    if (this.textures.exists(key)) return Promise.resolve(true);
    const pending = this.pendingTex.get(key);
    if (pending) return pending;
    const promise = new Promise<boolean>((resolve) => {
      const cleanup = () => {
        this.load.off(Phaser.Loader.Events.FILE_COMPLETE, onComplete);
        this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
        this.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
        this.pendingTex.delete(key);
      };
      const onComplete = (fileKey: string) => {
        if (fileKey !== key) return;
        cleanup();
        resolve(true);
      };
      const onError = (file: { key?: string }) => {
        if (file.key !== key) return;
        cleanup();
        resolve(false);
      };
      const onShutdown = () => {
        cleanup();
        resolve(false);
      };
      this.load.on(Phaser.Loader.Events.FILE_COMPLETE, onComplete);
      this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
      this.load.image(key, url);
      if (!this.load.isLoading()) this.load.start();
    });
    this.pendingTex.set(key, promise);
    return promise;
  }

  /** Rebuild the map-feature stamp props once the current map id is known. */
  private syncMapStamps() {
    const mapId = useGame.getState().mapInfo?.id ?? "";
    if (!mapId || this.stampsMapId === mapId) return;
    this.stampsMapId = mapId;
    void this.buildStampProps(mapId);
  }

  /**
   * Fetch the stamps doc + feature catalog and spawn one bottom-anchored
   * image per live-prop stamp, depth-sorted at its transformed bottom-center
   * so actors y-sort around buildings. Water/land stamps are baked into the
   * terrain chunks by tools/bake_terrain.py — never rendered here.
   */
  private async buildStampProps(mapId: string) {
    const [features, stamps] = await Promise.all([
      mapFeatureCatalog(),
      mapFeatureStamps(mapId),
    ]);
    const live: { stamp: FeatureStamp; feature: MapFeature }[] = [];
    for (const s of stamps) {
      const f = liveStampFeature(features, s);
      if (f) live.push({ stamp: s, feature: f });
    }
    const used = new Map<string, MapFeature>();
    for (const l of live) used.set(l.feature.id, l.feature);
    const loaded = new Map<string, boolean>();
    await Promise.all(
      [...used.values()].map(async (f) => {
        loaded.set(f.id, await this.loadImageTexture(`feat:${f.id}`, f.image));
      }),
    );
    if (!this.sys.isActive() || this.stampsMapId !== mapId) {
      if (this.stampsMapId === mapId) this.stampsMapId = null; // retry on next sync
      return;
    }
    for (const { stamp: s, feature: f } of live) {
      if (!loaded.get(f.id)) continue;
      const img = this.add
        .image(s.x, s.y, `feat:${f.id}`)
        .setOrigin(0.5, 0.5)
        .setFlipX(s.flipX)
        .setScale(s.scale)
        .setRotation((s.rotation * Math.PI) / 180)
        .setDepth(stampAnchorY(f, s));
      this.stampProps.push(img);
    }
  }

  /** Fallback when the tile sheets can't load — flat role-color tiles. */
  private createFlatChunk(
    data: TerrainLayerData,
    cx: number,
    cy: number,
    c0: number,
    r0: number,
    k: number,
    baseKey: string,
  ) {
    const t = data.tileSize;
    const canvas = document.createElement("canvas");
    canvas.width = k * t;
    canvas.height = k * t;
    const ctx = canvas.getContext("2d")!;
    for (let r = r0; r < r0 + k && r < data.rows; r++) {
      for (let c = c0; c < c0 + k && c < data.cols; c++) {
        const gid = data.ground[r * data.cols + c];
        if (!gid) continue;
        ctx.fillStyle = colorForGid(gid, null);
        ctx.fillRect((c - c0) * t, (r - r0) * t, t, t);
      }
    }
    if (this.textures.exists(baseKey)) this.textures.remove(baseKey);
    this.textures.addCanvas(baseKey, canvas);
    const base = this.add
      .image(c0 * t, r0 * t, baseKey)
      .setOrigin(0, 0)
      .setDepth(-20);
    this.terrainChunks.set(`${cx},${cy}`, { baseKey, base });
  }

  private drawAsciiTerrain(
    map: OverworldMap,
    portals?: { x: number; y: number; w: number; h: number }[],
  ) {
    const g = this.add.graphics().setDepth(-20);
    isoParent(this, g);
    const t = map.tile;
    // World-scale maps without terrain layers would need >1M graphics calls —
    // paint a flat ground fill instead of per-tile shapes.
    if (map.cols * map.rows > 200_000) {
      g.fillStyle(0x14331e);
      g.fillRect(0, 0, map.cols * t, map.rows * t);
      this.terrain = g;
      this.drawPortals(portals);
      return;
    }
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const ch = tileAt(map, c, r);
        g.fillStyle(FILL[ch] ?? 0x14331e);
        g.fillRect(c * t, r * t, t, t);
        if (ch === "T") {
          g.fillStyle(0x2c6b38);
          g.fillCircle(c * t + t / 2, r * t + t / 2, t * 0.38);
        } else if (ch === "#") {
          g.fillStyle(0x2a2a30);
          g.fillRect(c * t + 4, r * t + 4, t - 8, t - 8);
        }
      }
    }
    this.terrain = g;
    this.drawPortals(portals);
  }

  private drawPortals(portals?: { x: number; y: number; w: number; h: number }[]) {
    this.portalsGfx?.destroy();
    const pg = this.add.graphics().setDepth(-10);
    isoParent(this, pg);
    for (const p of portals ?? []) {
      pg.fillStyle(0x7dd3fc, 0.28);
      pg.fillRect(p.x, p.y, p.w, p.h);
      pg.lineStyle(2, 0xe0f2fe, 0.7);
      pg.strokeRect(p.x + 2, p.y + 2, p.w - 4, p.h - 4);
    }
    this.portalsGfx = pg;
  }

  private trySetSavePoint(sp: SavePointState) {
    const state = useGame.getState();
    const selfId = state.selfId;
    const self = selfId ? state.entities[selfId] : undefined;
    if (!selfId || !self) return;
    const av = this.playerVisualFor(selfId);
    const x = av?.wrapper.x ?? self.x;
    const y = av?.wrapper.y ?? self.y;
    if (Math.hypot(x - sp.x, y - sp.y) > SAVE_POINT_RANGE) {
      pushChat("system", "Move closer to the save point.");
      return;
    }
    net.setSavePoint(sp.id);
    pushChat("system", `Save point set to ${sp.name}.`);
  }

  private tryOpenJobChanger(jc: JobChangerState) {
    const state = useGame.getState();
    const selfId = state.selfId;
    const self = selfId ? state.entities[selfId] : undefined;
    if (!selfId || !self) return;
    const av = this.playerVisualFor(selfId);
    const x = av?.wrapper.x ?? self.x;
    const y = av?.wrapper.y ?? self.y;
    if (Math.hypot(x - jc.x, y - jc.y) > JOB_CHANGER_RANGE) {
      pushChat("system", "Move closer to the Class Master.");
      return;
    }
    openJobMasterDialog({ id: jc.id, name: jc.name });
  }

  private tryEnterCamp(camp: CampState) {
    const state = useGame.getState();
    const selfId = state.selfId;
    const self = selfId ? state.entities[selfId] : undefined;
    if (!selfId || !self || self.in_house) return;
    const live = state.camps[camp.ownerName];
    const targetX = live?.x ?? camp.x;
    const targetY = live?.y ?? camp.y;
    const targetOwner = live?.owner_name ?? camp.ownerName;
    const av = this.playerVisualFor(selfId);
    const x = av?.wrapper.x ?? self.x;
    const y = av?.wrapper.y ?? self.y;
    if (Math.hypot(x - targetX, y - targetY) > INTERACT_RANGE) {
      pushChat("system", "Move closer to the camp.");
      return;
    }
    net.enterHouse(targetOwner);
  }

  /**
   * Click an NPC / player / pet / combat-only entity: casts an armed action on
   * it, or focuses it as the target — friends included (net.clickEntity →
   * set_target).
   */
  private onEntityClicked(id: string) {
    if (this.input.activePointer.button !== 0) return;
    const state = useGame.getState();
    const e = state.entities[id];
    if (!e) return;
    // Wire `alive` is authoritative on every replica: a dead NPC reports
    // alive=false (and is dropped by the next entity_state), so it is never
    // clickable — combat scope or not.
    net.clickEntity(e);
  }

  /** Scene position + sprite for any combat id: player, NPC, pet, or combat-only extra. */
  private combatAvatarFor(
    id: string,
  ): CombatVisualRef | undefined {
    const entity = this.ecs.entityByExternalId(entityExternalId(id));
    if (entity === undefined || this.ecs.get(Removed, entity) != null) return undefined;
    const visual = this.ecs.get(ActorVisual, entity);
    return visual
      ? { wrapper: visual.wrapper, sprite: visual.sprite, mount: visual.mount }
      : undefined;
  }

  private isNearCamera(x: number, y: number, pad = 256): boolean {
    const view = this.cameras.main.worldView;
    const p = isoProject(this, x, y);
    return p.x >= view.x - pad && p.x <= view.right + pad && p.y >= view.y - pad && p.y <= view.bottom + pad;
  }

  private publishOverlays(
    entities: EntityOverlayMark[],
    pois: PoiLabelMark[],
    interacts: InteractPromptMark[],
  ) {
    setWorldOverlays({ entities, pois, interacts });
  }

  update(time: number, delta: number) {
    const state = useGame.getState();
    if (state.screen !== "world") {
      clearEntityOverlays();
      clearWorldLocalPos();
      clearWorldViewRect();
      this.collisionGizmo.clear();
      this.resetEcs();
      return;
    }
    this.syncEcsSnapshot(state);
    this.syncTerrainChunks();
    // Orthogonal: the camera's worldView is already world space — the net
    // layer's on-screen test consumes it directly.
    const v = this.cameras.main.worldView;
    const viewWorld = { minX: v.x, minY: v.y, maxX: v.right, maxY: v.bottom };
    setWorldViewRect(v.x, v.y, v.width, v.height);
    this.movement.syncMoveKeys();
    const mapId = state.mapInfo?.id ?? "";
    if (mapId !== this.lastMapId) {
      this.lastMapId = mapId;
      this.selfSpawned = false;
      this.movement.invalidateSlides();
    }
    const selfId = state.selfId;
    if (!selfId) {
      clearEntityOverlays();
      clearWorldLocalPos();
      this.collisionGizmo.clear();
      this.resetEcs();
      return;
    }

    this.syncPoiVisuals();
    this.syncNpcVisuals();
    this.syncPetVisuals();
    this.syncPlayerVisuals();
    this.syncCombatExtraVisuals(selfId);
    const selfVisual = this.playerVisualFor(selfId);
    if (!selfVisual || selfVisual.wrapper !== this.followedWrapper) this.selfSpawned = false;
    this.syncVisualHandles();
    this.processCombatEvents(state);

    const stageXf = getStageTransform(this);

    this.syncActorMotion(delta, ["player", "npc", "combat-extra"]);
    this.syncVisualHandles();
    this.updateTargetRing(state);
    this.movement.updateDodgeCooldown();
    this.movement.update(time, state.overworld);
    this.syncActorMotion(delta, ["pet"]);
    this.syncRenderPoses();
    this.syncVisualHandles();
    // Shadow the followed actor's projected position for the camera.
    if (this.followedWrapper && this.camProxy) {
      const p = isoProject(this, this.followedWrapper.x, this.followedWrapper.y);
      this.camProxy.setPosition(p.x, p.y);
    }
    // Orthogonal: the display list depth-sorts automatically each frame;
    // the container sort only matters if children are re-parented into
    // worldLayer (e.g. when an iso layer is installed).
    this.worldLayer?.sort("depth");
    this.updateCollisionGizmo(state, viewWorld);
    const overlayMarks = collectEntityOverlayMarks(this.ecs, {
      now: Date.now(),
      isNear: (x, y) => this.isNearCamera(x, y),
      projectPoint: (x, y) => {
        const p = isoProject(this, x, y);
        return worldToStagePoint(this, p.x, p.y, stageXf);
      },
      projectOffset: (x, y) => localOffsetToStage(x, y, stageXf),
    });

    // POIs are world-fixed; project with the camera scroll Phaser will use this frame
    // (follow lerp runs in Camera.preRender after Scene.update).
    const selfAv = this.playerVisualFor(selfId);
    // Follow prediction needs the camera's screen-space target — the proxy.
    const poiXf = getStageTransform(
      this,
      this.camProxy ? { x: this.camProxy.x, y: this.camProxy.y } : null,
    );

    const selfEntity = state.entities[selfId];
    const poiOverlay = collectPoiOverlayMarks(this.ecs, {
      selfX: selfAv?.wrapper.x ?? selfEntity?.x ?? 0,
      selfY: selfAv?.wrapper.y ?? selfEntity?.y ?? 0,
      keyLabel: interactKeyLabel(state.profile?.keybinds),
      showPrompts: canShowWorldInteractPrompts(state),
      isNear: (x, y) => this.isNearCamera(x, y),
      project: (x, y, localY) => {
        const p = isoProject(this, x, y);
        return worldLocalToStage(this, p.x, p.y, 0, localY, poiXf);
      },
    });
    this.publishOverlays(overlayMarks, poiOverlay.pois, poiOverlay.interacts);
    this.cleanupEcsRemoved();
  }

  /** Redraw the collision-bounds gizmo over unwalkable cells + actor visuals. */
  private updateCollisionGizmo(
    state: ReturnType<typeof useGame.getState>,
    viewWorld: { minX: number; minY: number; maxX: number; maxY: number },
  ) {
    if (!state.options.showCollisionBounds) {
      this.collisionGizmo.clear();
      return;
    }
    this.collisionGizmo.updateTiles(
      viewWorld.minX,
      viewWorld.minY,
      viewWorld.maxX,
      viewWorld.maxY,
    );
    const entries: CollisionGizmoEntry[] = [];
    for (const entity of this.ecs.queryExcluding([ActorVisual], [Removed])) {
      const visual = this.ecs.get(ActorVisual, entity);
      if (!visual) continue;
      const kind = this.ecs.get(NetworkSnapshot, entity)?.entity.kind ?? visual.role;
      const role: CollisionGizmoRole =
        kind === "player" ? "player" : kind === "pet" ? "pet" : "npc";
      entries.push({
        x: visual.wrapper.x,
        y: visual.wrapper.y,
        role,
        isSelf: visual.isSelf,
      });
    }
    this.collisionGizmo.draw(entries);
  }

  private playerVisualFor(id: string): ActorVisual | undefined {
    const entity = this.ecs.entityByExternalId(entityExternalId(id));
    if (entity === undefined || this.ecs.get(Removed, entity) != null) return undefined;
    const visual = this.ecs.get(ActorVisual, entity);
    return visual?.role === "player" ? visual : undefined;
  }

  private npcVisualFor(id: string): ActorVisual | undefined {
    const entity = this.ecs.entityByExternalId(entityExternalId(id));
    if (entity === undefined || this.ecs.get(Removed, entity) != null) return undefined;
    const visual = this.ecs.get(ActorVisual, entity);
    return visual?.role === "npc" ? visual : undefined;
  }

  private petVisualFor(id: string): ActorVisual | undefined {
    const entity = this.ecs.entityByExternalId(entityExternalId(id));
    if (entity === undefined || this.ecs.get(Removed, entity) != null) return undefined;
    const visual = this.ecs.get(ActorVisual, entity);
    return visual?.role === "pet" ? visual : undefined;
  }

  /** Pulsing ring under the current focus target (socket set_target echo). */
  private updateTargetRing(state: ReturnType<typeof useGame.getState>) {
    const selfId = state.selfId;
    const focusId = selfId ? state.entities[selfId]?.target_id : undefined;
    this.targetRing.update(this, {
      focusId,
      focusEntity: focusId ? state.entities[focusId] : undefined,
      focusInFight: !!focusId && !!state.combatIds[focusId],
      visual: focusId ? this.combatAvatarFor(focusId) : undefined,
      selectedAction: state.selectedAction,
    });
  }

  /** Animate every unseen combat_event (VFX, lunge, float text, hit flash). */
  private processCombatEvents(state: ReturnType<typeof useGame.getState>) {
    this.combatSeenSeq = processEcsCombatEvents(
      this,
      state.combatEvents,
      {
        selfId: state.selfId,
        jumping: this.jumping,
        visualFor: (id) => this.combatAvatarFor(id),
        invalidateSelfSlides: () => this.movement.invalidateSlides(),
      },
      this.combatSeenSeq,
    );
  }

}
