import Phaser from "phaser";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";

import { WorldMovement } from "./movement";
import { FILL, tileAt, WALKABLE } from "../world/overworld";
import {
  terrainLayerKey,
  terrainLayersFromSnapshot,
  type TerrainLayerData,
} from "../world/terrainRaster";
import { getLoadedPipoyaSheets, loadPipoyaSheets } from "../world/pipoyaTilesets";
import {
  ISO_LAYER_SCALE,
  ISO_LEVEL_H,
  ISO_ROT,
  ISO_SQUASH_Y,
  isoBounds,
  isoProject,
  isoX,
  isoY,
  screenToWorldX,
  screenToWorldY,
  setIsoLayer,
} from "../world/iso";
import { loadIsoTiles, type IsoTiles } from "../world/isoTiles";
import {
  rasterizeIsoChunk,
  type IsoBlockPlacement,
  type IsoPropPlacement,
} from "../world/isoRaster";
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
  base: Phaser.GameObjects.Image;
  /** Iso prop billboards extracted from this chunk's cells. */
  props?: Phaser.GameObjects.Image[];
  /** Elevated block columns extracted from this chunk's cells. */
  blocks?: Phaser.GameObjects.Container[];
}

export class WorldScene extends Phaser.Scene {
  private ecs = new EntityWorld();
  private ecsSnapshots = new SnapshotSync(this.ecs);
  private selfSpawned = false;
  private followedWrapper?: Phaser.GameObjects.Container;
  /**
   * Iso world layer: squash(scaleY 0.5) → rotate(45°, √2) → world-space
   * children. Everything inside keeps server/world coordinates; the chain
   * projects them to screen. `camProxy` shadows the followed actor's
   * projected position so camera follow works in screen space.
   */
  private worldLayer?: Phaser.GameObjects.Container;
  private camProxy?: Phaser.GameObjects.Zone;
  private isoTiles: IsoTiles | null = null;
  /** True when the iso sheet fetch failed — chunks fall back to flat colors. */
  private isoTilesFailed = false;
  private terrain?: Phaser.GameObjects.Graphics;
  private terrainLayerData: TerrainLayerData | null = null;
  /** Rasterized terrain chunks keyed "cx,cy" — only chunks near the camera exist. */
  private terrainChunks = new Map<string, TerrainChunk>();
  private portalsGfx?: Phaser.GameObjects.Graphics;
  private terrainInputs: TerrainSyncInputs | null = null;
  private terrainPortalKey = "";
  private terrainTextureKey = "";
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
    // Iso world layer — world-coordinate children render through
    // S(1,0.5)·R(45°)·√2, i.e. screen = (x−y, (x+y)/2).
    const squash = this.add.container(0, 0).setScale(1, ISO_SQUASH_Y).setDepth(0);
    const rotate = this.add.container(0, 0).setRotation(ISO_ROT).setScale(ISO_LAYER_SCALE);
    squash.add(rotate);
    this.worldLayer = rotate;
    setIsoLayer(this, rotate);
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
        console.warn("Pipoya tilesets failed to load; using flat terrain colors", err);
      });
    void loadIsoTiles()
      .then((tiles) => {
        if (!this.sys.isActive()) return;
        this.isoTiles = tiles;
        // Register the sheet once so prop billboards can draw frames.
        if (!this.textures.exists("isoTiles")) {
          this.textures.addImage("isoTiles", tiles.img);
          const tx = this.textures.get("isoTiles");
          for (const [name, r] of Object.entries(tiles.atlas.props)) {
            tx.add(name, 0, r.x, r.y, tiles.atlas.prop[0], tiles.atlas.prop[1]);
          }
          // Fill tiles as "fill:<name>" frames — block top faces draw them
          // inside the world layer, where they squash into diamonds.
          for (const [name, r] of Object.entries(tiles.atlas.fills)) {
            tx.add(`fill:${name}`, 0, r.x, r.y, tiles.atlas.tile, tiles.atlas.tile);
          }
        }
        this.terrainInputs = null;
        this.terrainTextureKey = "";
        this.syncTerrainFromStore();
      })
      .catch((err) => {
        this.isoTilesFailed = true;
        console.warn("Iso tileset failed to load; using flat terrain colors", err);
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
          // Camera follows a screen-space proxy — the wrapper lives in the
          // iso layer's world coordinates, so follow its projected position.
          const sx = isoX(visual.wrapper.x, visual.wrapper.y);
          const sy = isoY(visual.wrapper.x, visual.wrapper.y);
          this.camProxy?.setPosition(sx, sy);
          this.cameras.main.centerOn(sx, sy);
          if (this.camProxy) {
            this.cameras.main.startFollow(this.camProxy, true, 0.15, 0.15);
          }
          this.selfSpawned = true;
        },
        onSnap: (visual) => {
          // Avatar teleported (zone transfer, return skill): jump the camera
          // to it — the follow lerp would otherwise slide over for ~1s.
          const sx = isoX(visual.wrapper.x, visual.wrapper.y);
          const sy = isoY(visual.wrapper.x, visual.wrapper.y);
          this.camProxy?.setPosition(sx, sy);
          this.cameras.main.centerOn(sx, sy);
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
      this.syncTerrainFromStore();
    });
  }

  private syncTerrainFromStore() {
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
    // The map's projected footprint is a diamond — bound the camera to it
    // (plus a small pad so edges don't snap).
    const b = isoBounds(cols, rows, t);
    const pad = 4 * t;
    this.cameras.main.setBounds(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
  }

  private syncTerrain(
    map: OverworldMap | null,
    portals?: { x: number; y: number; w: number; h: number }[],
    terrainLayers?: MapTerrainLayers | null,
  ) {
    if (!map) {
      this.collisionGrid = null;
      this.collisionGizmo.setGrid(null);
      return;
    }

    const nextInputs: TerrainSyncInputs = {
      cells: map.cells,
      portals,
      terrainLayers,
    };
    const nextPortalKey = portalKey(portals);
    const sameTerrain = !terrainInputsChanged(this.terrainInputs, nextInputs);
    const samePortals = nextPortalKey === this.terrainPortalKey;

    if (sameTerrain && samePortals) return;

    this.terrainInputs = nextInputs;
    this.terrainPortalKey = nextPortalKey;
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
      return;
    }

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

  private clearTerrain() {
    this.terrain?.destroy();
    this.terrain = undefined;
    this.terrainLayerData = null;
    for (const chunk of this.terrainChunks.values()) {
      this.destroyChunk(chunk);
    }
    this.terrainChunks.clear();
    this.terrainTextureKey = "";
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
    // Baked orthogonal chunks can't be reused under the iso projection
    // (baked props would shear) — runtime rasterization only for now.
    this.syncTerrainChunks();
  }

  /**
   * Ensure rasterized terrain chunks exist for every chunk intersecting the
   * camera view (+ margin) and drop the rest. World-scale maps cannot live in
   * one canvas — browsers cap texture sizes far below a 40960px bitmap.
   */
  /**
   * Camera-visible chunk window, clamped to the map. The camera's worldView
   * is in iso screen space — unproject its corners into the world-tile plane
   * to get a candidate range, then keep only chunks whose projected diamond
   * footprint actually intersects the view.
   */
  private terrainChunkWindow(): { cc0: number; cr0: number; cc1: number; cr1: number } | null {
    const data = this.terrainLayerData;
    if (!data) return null;
    const view = this.cameras.main.worldView;
    const pad = 96;
    const corners = [
      screenToWorldX(view.x - pad, view.y - pad),
      screenToWorldX(view.right + pad, view.y - pad),
      screenToWorldX(view.x - pad, view.bottom + pad),
      screenToWorldX(view.right + pad, view.bottom + pad),
    ];
    const rows = [
      screenToWorldY(view.x - pad, view.y - pad),
      screenToWorldY(view.right + pad, view.y - pad),
      screenToWorldY(view.x - pad, view.bottom + pad),
      screenToWorldY(view.right + pad, view.bottom + pad),
    ];
    const t = data.tileSize;
    const minC = Math.floor(Math.min(...corners) / t);
    const maxC = Math.ceil(Math.max(...corners) / t);
    const minR = Math.floor(Math.min(...rows) / t);
    const maxR = Math.ceil(Math.max(...rows) / t);
    const chunksX = Math.ceil(data.cols / TERRAIN_CHUNK_TILES);
    const chunksY = Math.ceil(data.rows / TERRAIN_CHUNK_TILES);
    return {
      cc0: Math.max(0, Math.floor(minC / TERRAIN_CHUNK_TILES)),
      cr0: Math.max(0, Math.floor(minR / TERRAIN_CHUNK_TILES)),
      cc1: Math.min(chunksX - 1, Math.floor(maxC / TERRAIN_CHUNK_TILES)),
      cr1: Math.min(chunksY - 1, Math.floor(maxR / TERRAIN_CHUNK_TILES)),
    };
  }

  /** Does chunk (cx,cy)'s projected diamond footprint intersect the view? */
  private chunkOnScreen(
    cx: number,
    cy: number,
    view: { x: number; right: number; y: number; bottom: number },
  ): boolean {
    const data = this.terrainLayerData;
    if (!data) return false;
    const t = data.tileSize;
    const K = TERRAIN_CHUNK_TILES;
    const pad = 64;
    const c0 = cx * K;
    const r0 = cy * K;
    const c1 = Math.min(c0 + K, data.cols);
    const r1 = Math.min(r0 + K, data.rows);
    const minSX = (c0 - r1) * t;
    const maxSX = (c1 - r0) * t;
    const minSY = ((c0 + r0) * t) / 2;
    const maxSY = ((c1 + r1) * t) / 2;
    return (
      maxSX >= view.x - pad &&
      minSX <= view.right + pad &&
      maxSY >= view.y - pad &&
      minSY <= view.bottom + pad
    );
  }

  private syncTerrainChunks() {
    const data = this.terrainLayerData;
    if (!data) return;
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
    chunk.base.destroy();
    if (chunk.props) for (const p of chunk.props) p.destroy();
    if (chunk.blocks) for (const b of chunk.blocks) b.destroy(true);
    if (this.textures.exists(chunk.baseKey)) this.textures.remove(chunk.baseKey);
  }

  /** Runtime-rasterized iso chunk — diamond ground + billboard props. */
  private createRasterChunk(cx: number, cy: number) {
    const data = this.terrainLayerData;
    // Wait for the iso sheet unless it failed — then draw flat color diamonds.
    if (!data || (!this.isoTiles && !this.isoTilesFailed)) return;
    const c0 = cx * TERRAIN_CHUNK_TILES;
    const r0 = cy * TERRAIN_CHUNK_TILES;
    const baseKey = `${this.terrainTextureKey}-ch${cx}-${cy}`;
    if (!this.isoTiles) {
      this.createFlatChunk(data, cx, cy, c0, r0, baseKey);
      return;
    }
    const sheets = getLoadedPipoyaSheets();
    const art = rasterizeIsoChunk(data, sheets ?? [], this.isoTiles, c0, r0, TERRAIN_CHUNK_TILES);
    if (this.textures.exists(baseKey)) this.textures.remove(baseKey);
    this.textures.addCanvas(baseKey, art.canvas);
    const tilePx = data.tileSize;
    const base = this.add
      .image(c0 * tilePx, r0 * tilePx, baseKey)
      .setOrigin(0, 0)
      .setDepth(-20);
    this.worldLayer?.add(base);
    const chunk: TerrainChunk = { baseKey, base, props: [], blocks: [] };

    // Prop billboards — upright sprites anchored at each cell's bottom edge,
    // depth-sorted by projected Y so actors weave in front of and behind them.
    for (const p of art.props) {
      chunk.props!.push(this.isoPropBillboard(p));
    }
    // Elevated blocks — top diamond + shaded side faces, depth-sorted like
    // props so actors occlude and are occluded correctly.
    for (const b of art.blocks) {
      chunk.blocks!.push(this.isoBlockObject(b, tilePx));
    }
    this.terrainChunks.set(`${cx},${cy}`, chunk);
  }

  private isoPropBillboard(p: IsoPropPlacement): Phaser.GameObjects.Image {
    const img = this.add
      .image(p.wx, p.wy, "isoTiles", p.frame)
      .setOrigin(0.5, 1)
      .setDepth(p.depth);
    const s = p.big ? 1.5 : 1;
    img.setRotation(-ISO_ROT).setScale(
      (1 / ISO_LAYER_SCALE) * s,
      ISO_LAYER_SCALE * s,
    );
    this.worldLayer?.add(img);
    return img;
  }

  /**
   * Elevated block column: side faces are parallelograms drawn in world
   * coords (a vertical screen edge is the world (−1,−1) direction); the top
   * face is a fill tile image squashed into a diamond by the layer transform.
   */
  private isoBlockObject(b: IsoBlockPlacement, t: number): Phaser.GameObjects.Container {
    const hi = b.level * ISO_LEVEL_H;
    const cont = this.add.container(b.wx, b.wy).setDepth(b.depth);
    const g = this.add.graphics();

    // +x face (east edge → screen down-right) — shadowed side. The exposed
    // band runs from the neighbor's height (level − faceE) up to the top.
    let lo = (b.level - b.faceE) * ISO_LEVEL_H;
    if (hi > lo) {
      g.fillStyle(b.def.faceDark, 1);
      g.fillPoints(
        [
          new Phaser.Math.Vector2(t - lo, -lo),
          new Phaser.Math.Vector2(t - lo, t - lo),
          new Phaser.Math.Vector2(t - hi, t - hi),
          new Phaser.Math.Vector2(t - hi, -hi),
        ],
        true,
      );
    }
    // +y face (south edge → screen down-left) — lit side.
    lo = (b.level - b.faceS) * ISO_LEVEL_H;
    if (hi > lo) {
      g.fillStyle(b.def.faceLight, 1);
      g.fillPoints(
        [
          new Phaser.Math.Vector2(-lo, t - lo),
          new Phaser.Math.Vector2(t - lo, t - lo),
          new Phaser.Math.Vector2(t - hi, t - hi),
          new Phaser.Math.Vector2(-hi, t - hi),
        ],
        true,
      );
    }
    cont.add(g);
    cont.add(
      this.add.image(t / 2 - hi, t / 2 - hi, "isoTiles", `fill:${b.def.top}`),
    );
    this.worldLayer?.add(cont);
    return cont;
  }

  /** Fallback when the iso sheet can't load — flat role-color diamonds. */
  private createFlatChunk(
    data: TerrainLayerData,
    cx: number,
    cy: number,
    c0: number,
    r0: number,
    baseKey: string,
  ) {
    const t = data.tileSize;
    const canvas = document.createElement("canvas");
    canvas.width = TERRAIN_CHUNK_TILES * t;
    canvas.height = TERRAIN_CHUNK_TILES * t;
    const ctx = canvas.getContext("2d")!;
    for (let r = r0; r < r0 + TERRAIN_CHUNK_TILES && r < data.rows; r++) {
      for (let c = c0; c < c0 + TERRAIN_CHUNK_TILES && c < data.cols; c++) {
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
    this.worldLayer?.add(base);
    this.terrainChunks.set(`${cx},${cy}`, { baseKey, base, props: [] });
  }

  private drawAsciiTerrain(
    map: OverworldMap,
    portals?: { x: number; y: number; w: number; h: number }[],
  ) {
    const g = this.add.graphics().setDepth(-20);
    this.worldLayer?.add(g);
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
    this.worldLayer?.add(pg);
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
    const viewWorld = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    {
      // Publish the world-space AABB of the iso view — the net layer's
      // on-screen test consumes world coordinates, not screen space.
      const v = this.cameras.main.worldView;
      const xs = [
        screenToWorldX(v.x, v.y),
        screenToWorldX(v.right, v.y),
        screenToWorldX(v.x, v.bottom),
        screenToWorldX(v.right, v.bottom),
      ];
      const ys = [
        screenToWorldY(v.x, v.y),
        screenToWorldY(v.right, v.y),
        screenToWorldY(v.x, v.bottom),
        screenToWorldY(v.right, v.bottom),
      ];
      viewWorld.minX = Math.min(...xs);
      viewWorld.minY = Math.min(...ys);
      viewWorld.maxX = Math.max(...xs);
      viewWorld.maxY = Math.max(...ys);
      setWorldViewRect(
        viewWorld.minX,
        viewWorld.minY,
        viewWorld.maxX - viewWorld.minX,
        viewWorld.maxY - viewWorld.minY,
      );
    }
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
      this.camProxy.setPosition(
        isoX(this.followedWrapper.x, this.followedWrapper.y),
        isoY(this.followedWrapper.x, this.followedWrapper.y),
      );
    }
    // Depth-sort the world layer — projected Y is the painter's order.
    this.worldLayer?.sort("depth");
    this.updateCollisionGizmo(state, viewWorld);
    const overlayMarks = collectEntityOverlayMarks(this.ecs, {
      now: Date.now(),
      isNear: (x, y) => this.isNearCamera(x, y),
      projectPoint: (x, y) => worldToStagePoint(this, isoX(x, y), isoY(x, y), stageXf),
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
      project: (x, y, localY) =>
        worldLocalToStage(this, isoX(x, y), isoY(x, y), 0, localY, poiXf),
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
