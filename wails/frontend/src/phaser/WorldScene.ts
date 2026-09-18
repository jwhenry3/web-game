import Phaser from "phaser";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";

import { WorldMovement } from "./movement";
import { FILL, tileAt, WALKABLE } from "../world/overworld";
import { VisibilityFX } from "./visibility";
import { rasterizeTerrainLayers, terrainLayerKey, terrainLayersFromSnapshot } from "../world/terrainRaster";
import { getLoadedPipoyaSheets, loadPipoyaSheets } from "../world/pipoyaTilesets";
import {
  portalKey,
  terrainInputsChanged,
  type TerrainSyncInputs,
} from "../world/worldTerrainSync";
import type { MapTerrainLayers, OverworldMap, CharacterAppearanceWire } from "../types";
import {
  EntityWorld,
  Identity,
  Removed,
  SnapshotSync,
  entityExternalId,
  type CampState,
  type JobChangerState,
  type SavePointState,
} from "../ecs";

import type { IEntitySprite } from "./entitySprite";
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
} from "./systems/combatEvents";
import { TargetRing } from "./systems/targetRing";
import { syncVisualHandles as syncEcsVisualHandles, VisualHandle } from "./systems/visualHandles";

export class WorldScene extends Phaser.Scene {
  private ecs = new EntityWorld();
  private ecsSnapshots = new SnapshotSync(this.ecs);
  private selfSpawned = false;
  private followedWrapper?: Phaser.GameObjects.Container;
  private terrain?: Phaser.GameObjects.Graphics;
  private terrainImage?: Phaser.GameObjects.Image;
  private canopyImage?: Phaser.GameObjects.Image;
  private portalsGfx?: Phaser.GameObjects.Graphics;
  private terrainInputs: TerrainSyncInputs | null = null;
  private terrainPortalKey = "";
  private terrainTextureKey = "";
  private canopyTextureKey = "";
  private terrainUnsub?: () => void;
  private visibility?: VisibilityFX;
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
    this.resetEcs();
    this.visibility?.destroy();
    this.visibility = new VisibilityFX(this);
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
      this.visibility?.destroy();
      this.visibility = undefined;
      this.jumping.clear();
      this.targetRing.destroy();
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
      // linger and invalidate the visibility mask so it recomputes.
      this.resetEcs();
      clearEntityOverlays();
      this.visibility?.invalidate();
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
      resolveAppearance: (id, race, weapon, wire) =>
        this.resolveAppearance(id, race, weapon, wire),
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
          this.cameras.main.centerOn(visual.wrapper.x, visual.wrapper.y);
          this.cameras.main.startFollow(visual.wrapper, true, 0.15, 0.15);
          this.selfSpawned = true;
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
    wire?: CharacterAppearanceWire,
  ) {
    const state = useGame.getState();
    return resolveCharacterAppearance({
      playerId,
      selfId: state.selfId,
      profile: state.profile,
      race,
      weapon,
      wire,
    });
  }

  private applyWorldBounds(map: OverworldMap | null) {
    const t = map?.tile ?? 32;
    this.worldW = (map?.cols ?? 160) * t;
    this.worldH = (map?.rows ?? 120) * t;
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
  }

  private syncTerrain(
    map: OverworldMap | null,
    portals?: { x: number; y: number; w: number; h: number }[],
    terrainLayers?: MapTerrainLayers | null,
  ) {
    if (!map) return;

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
      this.visibility?.setGrid({
        blocked: layerData.collision,
        cols: layerData.cols,
        rows: layerData.rows,
        tileSize: layerData.tileSize,
        originX: 0,
        originY: 0,
      });
      this.renderConfigTerrain(layerData, portals);
      return;
    }

    this.clearTerrain();
    this.drawAsciiTerrain(map, portals);
    const blocked = new Uint8Array(map.cols * map.rows);
    for (let i = 0; i < blocked.length; i++) {
      blocked[i] = WALKABLE.has(map.cells[i] ?? "") ? 0 : 1;
    }
    this.visibility?.setGrid({
      blocked,
      cols: map.cols,
      rows: map.rows,
      tileSize: map.tile || 32,
      originX: 0,
      originY: 0,
    });
  }

  private clearTerrain() {
    this.terrain?.destroy();
    this.terrain = undefined;
    this.terrainImage?.destroy();
    this.terrainImage = undefined;
    this.canopyImage?.destroy();
    this.canopyImage = undefined;
    if (this.terrainTextureKey && this.textures.exists(this.terrainTextureKey)) {
      this.textures.remove(this.terrainTextureKey);
    }
    if (this.canopyTextureKey && this.textures.exists(this.canopyTextureKey)) {
      this.textures.remove(this.canopyTextureKey);
    }
    this.terrainTextureKey = "";
    this.canopyTextureKey = "";
    this.portalsGfx?.destroy();
    this.portalsGfx = undefined;
  }

  private renderConfigTerrain(
    data: { ground: number[]; collision: number[]; cols: number; rows: number; tileSize: number },
    portals?: { x: number; y: number; w: number; h: number }[],
  ) {
    const sheets = getLoadedPipoyaSheets();
    const texKey = terrainLayerKey(data, !!sheets?.length);
    const canopyKey = `${texKey}-canopy`;
    if (this.terrainTextureKey === texKey && this.terrainImage) {
      this.drawPortals(portals);
      return;
    }

    this.clearTerrain();
    const { base, overhead } = rasterizeTerrainLayers(data, 1, null, sheets);
    if (this.textures.exists(texKey)) this.textures.remove(texKey);
    this.textures.addCanvas(texKey, base);
    this.terrainTextureKey = texKey;
    this.terrainImage = this.add.image(0, 0, texKey).setOrigin(0, 0).setDepth(0);

    if (overhead) {
      if (this.textures.exists(canopyKey)) this.textures.remove(canopyKey);
      this.textures.addCanvas(canopyKey, overhead);
      this.canopyTextureKey = canopyKey;
      // Above players (depth 10) so canopy tops read as walk-under foliage.
      this.canopyImage = this.add.image(0, 0, canopyKey).setOrigin(0, 0).setDepth(20);
    }
    this.drawPortals(portals);
  }

  private drawAsciiTerrain(
    map: OverworldMap,
    portals?: { x: number; y: number; w: number; h: number }[],
  ) {
    const g = this.add.graphics().setDepth(0);
    const t = map.tile;
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
    const pg = this.add.graphics().setDepth(1);
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
    // Only trust `alive` while the entity is in a visible fight; world
    // replicas are considered alive for click/cast purposes.
    const alive = state.combatIds[id] ? e.alive : true;
    net.clickEntity({ ...e, alive });
  }

  /** Scene position + sprite for any combat id: player, NPC, pet, or combat-only extra. */
  private combatAvatarFor(
    id: string,
  ): { wrapper: Phaser.GameObjects.Container; sprite: IEntitySprite } | undefined {
    const entity = this.ecs.entityByExternalId(entityExternalId(id));
    if (entity === undefined || this.ecs.get(Removed, entity) != null) return undefined;
    const visual = this.ecs.get(VisualHandle, entity);
    return visual ? { wrapper: visual.wrapper, sprite: visual.sprite } : undefined;
  }

  private isNearCamera(x: number, y: number, pad = 256): boolean {
    const view = this.cameras.main.worldView;
    return x >= view.x - pad && x <= view.right + pad && y >= view.y - pad && y <= view.bottom + pad;
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
      this.resetEcs();
      return;
    }
    this.syncEcsSnapshot(state);
    {
      const v = this.cameras.main.worldView;
      setWorldViewRect(v.x, v.y, v.width, v.height);
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
    const overlayMarks = collectEntityOverlayMarks(this.ecs, {
      now: Date.now(),
      isNear: (x, y) => this.isNearCamera(x, y),
      projectPoint: (x, y) => worldToStagePoint(this, x, y, stageXf),
      projectOffset: (x, y) => localOffsetToStage(x, y, stageXf),
    });

    // POIs are world-fixed; project with the camera scroll Phaser will use this frame
    // (follow lerp runs in Camera.preRender after Scene.update).
    const selfAv = this.playerVisualFor(selfId);
    if (selfAv) this.visibility?.update(selfAv.wrapper.x, selfAv.wrapper.y);
    const poiXf = getStageTransform(
      this,
      selfAv ? { x: selfAv.wrapper.x, y: selfAv.wrapper.y } : null,
    );

    const selfEntity = state.entities[selfId];
    const poiOverlay = collectPoiOverlayMarks(this.ecs, {
      selfX: selfAv?.wrapper.x ?? selfEntity?.x ?? 0,
      selfY: selfAv?.wrapper.y ?? selfEntity?.y ?? 0,
      keyLabel: interactKeyLabel(state.profile?.keybinds),
      showPrompts: canShowWorldInteractPrompts(state),
      isNear: (x, y) => this.isNearCamera(x, y),
      project: (x, y, localY) => worldLocalToStage(this, x, y, 0, localY, poiXf),
    });
    this.publishOverlays(overlayMarks, poiOverlay.pois, poiOverlay.interacts);
    this.cleanupEcsRemoved();
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
