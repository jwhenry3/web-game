import Phaser from "phaser";
import { net } from "../net/socket";
import { useGame, type CombatEvent } from "../state/store";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";
import { appearanceKey, H99_NAME_LABEL_Y, H99_WORLD_RING_RADIUS, H99_WORLD_RING_Y } from "../characters/types";
import { facingOf, getLastWorldFacing, setLastWorldFacing, WorldMovement } from "./movement";
import { FILL, tileAt, WALKABLE } from "../world/overworld";
import { VisibilityFX } from "./visibility";
import { rasterizeTerrainLayers, terrainLayerKey, terrainLayersFromSnapshot } from "../world/terrainRaster";
import { getLoadedPipoyaSheets, loadPipoyaSheets } from "../world/pipoyaTilesets";
import {
  portalKey,
  terrainInputsChanged,
  type TerrainSyncInputs,
} from "../world/worldTerrainSync";
import type { MapTerrainLayers, OverworldMap, WorldEntity, CharacterAppearanceWire, SavePoint, JobChanger, WorldCamp, StatusSnapshot, ActionResult } from "../types";
import { isAllyEntity } from "../types";

import { CharacterSprite } from "./CharacterSprite";
import { EnemySprite } from "./EnemySprite";
import type { IEntitySprite } from "./entitySprite";
import { createSpriteForEntity, ENTITY_PRESENTATION } from "./spriteFactory";
import { trackContentZoom } from "./contentZoom";
import { enemyKindFromName } from "../characters/enemies";
import { pushChat } from "../state/store";
import { openJobMasterDialog } from "../world/npcDialogue";
import {
  JOB_CHANGER_RANGE,
  SAVE_POINT_RANGE,
  INTERACT_RANGE,
  canShowWorldInteractPrompts,
  interactKeyLabel,
} from "../world/interact";
import {
  isJumpAction,
  playActionArc,
  playBattleVfx,
  playCastStartVfx,
  playDodgeVfx,
  playFizzleVfx,
  playJumpCrash,
  vfxCategoryForAction,
} from "./battleVfx";
import { battleDuration, DEFAULT_BATTLE_SPEED } from "./battleAnim";
import { entityShadow } from "./entityShadow";
import { clearWorldLocalPos, setWorldLocalPos } from "../world/worldLocalPos";
import { clearWorldViewRect, setWorldViewRect } from "../world/viewRect";
import { campSkinById, drawCampTent } from "../housing/campSkins";
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
  type StageTransform,
} from "../world/entityOverlayBridge";

const POI_INTERACT_PROMPT_Y = -36;
const CAST_BAR_Y = 10;
const POI_LABEL_Y = -28;
const CAMP_LABEL_Y = -32;
/** Follow pets use the battle foe sprite at a reduced size. */
const PET_FOLLOW_SCALE = 0.55;
/** Lerp factor for pet movement — matches NPC interpolation (0.2). */
const PET_LERP = 0.2;
/** Distance beyond which the pet snaps instead of interpolating. */
const PET_SNAP_DIST = 120;

interface Avatar {
  wrapper: Phaser.GameObjects.Container;
  sprite: CharacterSprite;
  ring?: Phaser.GameObjects.Arc;
  appearanceKey: string;
}

interface FoeAvatar {
  wrapper: Phaser.GameObjects.Container;
  enemy: EnemySprite;
  lastX: number;
  lastY: number;
}

interface PetMarker {
  wrapper: Phaser.GameObjects.Container;
  enemy: EnemySprite;
  kind: string;
  lastX: number;
  lastY: number;
}

/** Avatar for a combat entity with no world replica (battle pets, summons). */
interface CombatExtra {
  wrapper: Phaser.GameObjects.Container;
  sprite: IEntitySprite;
  lastX: number;
  lastY: number;
}

interface SavePointMarker {
  wrapper: Phaser.GameObjects.Container;
  hit: Phaser.GameObjects.Zone;
  active: boolean;
  name: string;
}

interface JobChangerMarker {
  wrapper: Phaser.GameObjects.Container;
  hit: Phaser.GameObjects.Zone;
  name: string;
}

interface CampMarker {
  wrapper: Phaser.GameObjects.Container;
  hit: Phaser.GameObjects.Zone;
  glow: Phaser.GameObjects.Arc;
  tent: Phaser.GameObjects.Graphics;
  ownerName: string;
  skin: string;
}

export class WorldScene extends Phaser.Scene {
  private avatars = new Map<string, Avatar>();
  private foes = new Map<string, FoeAvatar>();
  private savePoints = new Map<string, SavePointMarker>();
  private jobChangers = new Map<string, JobChangerMarker>();
  private camps = new Map<string, CampMarker>();
  private pets = new Map<string, PetMarker>();
  private selfSpawned = false;
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
  /** Combat entities with no world replica — pets/summons drawn only while fighting. */
  private combatExtras = new Map<string, CombatExtra>();
  /** Entities mid jump-crash — position sync is paused while they fly. */
  private jumping = new Set<string>();
  /** Focus-target ring under the current target's feet. */
  private targetRing?: Phaser.GameObjects.Ellipse;
  /** Local-player movement: key input, click-to-move, dodge dash, sends. */
  private movement = new WorldMovement(this, {
    avatar: (id) => this.avatars.get(id),
    jumping: this.jumping,
    worldBounds: () => ({ w: this.worldW, h: this.worldH }),
  });

  constructor() {
    super("world");
  }

  create() {
    trackContentZoom(this);
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
    this.combatSeenSeq = useGame.getState().combatEvents.reduce((m, e) => Math.max(m, e.seq), 0);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.terrainUnsub?.();
      this.terrainUnsub = undefined;
      this.visibility?.destroy();
      this.visibility = undefined;
      this.combatExtras.forEach((ex) => ex.wrapper.destroy());
      this.combatExtras.clear();
      this.jumping.clear();
      this.targetRing?.destroy();
      this.targetRing = undefined;
      this.movement.reset();
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.movement.onGroundPointerDown);
      clearEntityOverlays();
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
      this.selfSpawned = false;
      for (const [, av] of this.avatars) av.wrapper.destroy();
      this.avatars.clear();
      for (const [, f] of this.foes) f.wrapper.destroy();
      this.foes.clear();
      this.combatExtras.forEach((ex) => ex.wrapper.destroy());
      this.combatExtras.clear();
      clearEntityOverlays();
      this.visibility?.invalidate();
      // Don't replay combat events that fired while the scene was asleep.
      this.combatSeenSeq = useGame.getState().combatEvents.reduce((m, e) => Math.max(m, e.seq), 0);
    });
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

  private ensureAvatar(id: string, race?: string, weapon?: string, wire?: CharacterAppearanceWire): Avatar {
    const appearance = this.resolveAppearance(id, race, weapon, wire);
    const key = appearanceKey(appearance);
    let av = this.avatars.get(id);
    if (av) {
      if (av.appearanceKey !== key) {
        av.sprite.setAppearance(appearance);
        av.appearanceKey = key;
      }
      return av;
    }

    const wrapper = this.add.container(0, 0).setDepth(10);
    const ring = this.add.circle(0, H99_WORLD_RING_Y, H99_WORLD_RING_RADIUS, 0xffe9a8, 0).setVisible(false);
    const sprite = new CharacterSprite(this, 0, 0, appearance);
    wrapper.add([entityShadow(this), ring, sprite.container]);

    if (id !== useGame.getState().selfId) {
      sprite.setInteractive(() => this.onEntityClicked(id));
    }

    av = { wrapper, sprite, ring, appearanceKey: key };
    this.avatars.set(id, av);
    return av;
  }

  private ensureSavePoint(sp: SavePoint, active: boolean): SavePointMarker {
    let marker = this.savePoints.get(sp.id);
    if (marker) {
      marker.wrapper.setPosition(sp.x, sp.y);
      marker.hit.setPosition(sp.x, sp.y - 8);
      marker.name = sp.name;
      if (marker.active !== active) {
        marker.active = active;
        // Rebuild glow/crystal colors by recreating visual children is heavy;
        // destroy and recreate the marker visuals via a quick rebuild.
        marker.wrapper.destroy();
        marker.hit.destroy();
        this.savePoints.delete(sp.id);
        return this.ensureSavePoint(sp, active);
      }
      return marker;
    }

    const wrapper = this.add.container(sp.x, sp.y).setDepth(8);
    const glow = this.add.circle(0, -14, 30, active ? 0xffe9a8 : 0x88ddff, active ? 0.22 : 0.14);
    const crystal = this.add.graphics();
    crystal.fillStyle(active ? 0xffe9a8 : 0xa8e8ff, 1);
    crystal.fillTriangle(-10, 6, 10, 6, 0, -20);
    crystal.fillStyle(0xffffff, 0.7);
    crystal.fillCircle(0, -10, 5);
    wrapper.add([glow, crystal]);

    const hit = this.add
      .zone(sp.x, sp.y - 8, 80, 80)
      .setOrigin(0.5, 0.5)
      .setDepth(25)
      .setInteractive({ cursor: "pointer" });
    hit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.button === 0) this.trySetSavePoint(sp);
    });

    marker = { wrapper, hit, active, name: sp.name };
    this.savePoints.set(sp.id, marker);
    return marker;
  }

  private trySetSavePoint(sp: SavePoint) {
    const state = useGame.getState();
    const selfId = state.selfId;
    const self = selfId ? state.entities[selfId] : undefined;
    if (!selfId || !self) return;
    const av = this.avatars.get(selfId);
    const x = av?.wrapper.x ?? self.x;
    const y = av?.wrapper.y ?? self.y;
    if (Math.hypot(x - sp.x, y - sp.y) > SAVE_POINT_RANGE) {
      pushChat("system", "Move closer to the save point.");
      return;
    }
    net.setSavePoint(sp.id);
    pushChat("system", `Save point set to ${sp.name}.`);
  }

  private ensureJobChanger(jc: JobChanger): JobChangerMarker {
    let marker = this.jobChangers.get(jc.id);
    if (marker) {
      marker.wrapper.setPosition(jc.x, jc.y);
      marker.hit.setPosition(jc.x, jc.y - 8);
      marker.name = jc.name;
      return marker;
    }

    const wrapper = this.add.container(jc.x, jc.y).setDepth(8);
    const glow = this.add.circle(0, -14, 28, 0xc4a35a, 0.18);
    const icon = this.add.graphics();
    icon.fillStyle(0xe8c96a, 1);
    icon.fillCircle(0, -12, 12);
    icon.fillStyle(0x4a3820, 1);
    icon.fillRect(-8, -2, 16, 14);
    wrapper.add([glow, icon]);

    const hit = this.add
      .zone(jc.x, jc.y - 8, 80, 80)
      .setOrigin(0.5, 0.5)
      .setDepth(25)
      .setInteractive({ cursor: "pointer" });
    hit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.button === 0) this.tryOpenJobChanger(jc);
    });

    marker = { wrapper, hit, name: jc.name };
    this.jobChangers.set(jc.id, marker);
    return marker;
  }

  private tryOpenJobChanger(jc: JobChanger) {
    const state = useGame.getState();
    const selfId = state.selfId;
    const self = selfId ? state.entities[selfId] : undefined;
    if (!selfId || !self) return;
    const av = this.avatars.get(selfId);
    const x = av?.wrapper.x ?? self.x;
    const y = av?.wrapper.y ?? self.y;
    if (Math.hypot(x - jc.x, y - jc.y) > JOB_CHANGER_RANGE) {
      pushChat("system", "Move closer to the Class Master.");
      return;
    }
    openJobMasterDialog({ id: jc.id, name: jc.name });
  }

  private syncCamps(camps: Record<string, WorldCamp>) {
    for (const [id, marker] of this.camps) {
      if (!camps[id]) {
        marker.wrapper.destroy();
        marker.hit.destroy();
        this.camps.delete(id);
      }
    }
    for (const camp of Object.values(camps)) {
      this.ensureCamp(camp);
    }
  }

  /**
   * Pets are positioned by the server (same as NPCs). Combat ticks merge
   * positions into the same entity record, and the client simply lerps to
   * that target — identical to syncFoes.
   */
  private syncPets(
    entities: Record<string, WorldEntity>,
    delta: number,
    overlayMarks: EntityOverlayMark[],
    stageXf: StageTransform,
  ) {
    for (const [id, marker] of this.pets) {
      const e = entities[id];
      if (!e || e.kind !== "pet") {
        marker.enemy.destroy();
        marker.wrapper.destroy();
        this.pets.delete(id);
      }
    }

    const combatIds = useGame.getState().combatIds;
    for (const pet of Object.values(entities)) {
      if (pet.kind !== "pet") continue;
      const ce = combatIds[pet.id] ? pet : undefined;
      const tx = pet.x;
      const ty = pet.y;

      const kind = enemyKindFromName(pet.name, pet.sprite);
      let marker = this.pets.get(pet.id);
      if (!marker) {
        const wrapper = this.add.container(tx, ty).setDepth(8);
        const enemy = new EnemySprite(this, 0, 0, kind);
        enemy.container.setScale(PET_FOLLOW_SCALE);
        wrapper.add([entityShadow(this, PET_FOLLOW_SCALE), enemy.container]);
        enemy.setInteractive(() => this.onEntityClicked(pet.id));
        marker = { wrapper, enemy, kind, lastX: tx, lastY: ty };
        this.pets.set(pet.id, marker);
      } else {
        if (marker.kind !== kind) {
          marker.enemy.setKind(kind);
          marker.kind = kind;
        }
        marker.wrapper.setAlpha(ce && !ce.alive ? 0.35 : 1);
        marker.enemy.setCasting(!!ce?.casting_skill_id);

        // Lerp exactly like NPC syncFoes: snap if too far, linear interpolate otherwise.
        const prevX = marker.wrapper.x;
        const prevY = marker.wrapper.y;
        if (Math.hypot(prevX - tx, prevY - ty) > PET_SNAP_DIST) {
          marker.wrapper.setPosition(tx, ty);
          marker.enemy.setMoving(false);
        } else {
          marker.wrapper.x = Phaser.Math.Linear(prevX, tx, PET_LERP);
          marker.wrapper.y = Phaser.Math.Linear(prevY, ty, PET_LERP);
          const mdx = marker.wrapper.x - prevX;
          const mdy = marker.wrapper.y - prevY;
          if (Math.hypot(mdx, mdy) > 0.3) {
            marker.enemy.setMoving(true, mdx, mdy);
          } else {
            marker.enemy.setMoving(false);
          }
        }
        marker.lastX = marker.wrapper.x;
        marker.lastY = marker.wrapper.y;
      }
      if (this.isNearCamera(marker.wrapper.x, marker.wrapper.y)) {
        marker.enemy.update(delta);
        overlayMarks.push(
          this.stageMark(
            pet.id,
            `${pet.name}${pet.level ? ` Lv${pet.level}` : ""}`,
            isAllyEntity(pet) ? "player" : "enemy",
            marker.wrapper.x,
            marker.wrapper.y,
            this.entityCastPct(pet.id),
            stageXf,
            this.entityHpMark(pet.id),
            ce?.statuses,
            Math.round(H99_NAME_LABEL_Y * PET_FOLLOW_SCALE) - 2,
          ),
        );
      }
    }
  }

  private ensureCamp(camp: WorldCamp): CampMarker {
    const skin = campSkinById(camp.skin).id;
    let marker = this.camps.get(camp.owner_name);
    if (marker) {
      marker.wrapper.setPosition(camp.x, camp.y);
      marker.hit.setPosition(camp.x, camp.y - 8);
      marker.ownerName = camp.owner_name;
      if (marker.skin !== skin) {
        marker.skin = skin;
        const pal = campSkinById(skin);
        marker.glow.setFillStyle(pal.glow, 0.35);
        drawCampTent(marker.tent, skin);
      }
      return marker;
    }
    const wrapper = this.add.container(camp.x, camp.y).setDepth(7);
    const pal = campSkinById(skin);
    const glow = this.add.circle(0, -12, 34, pal.glow, 0.35);
    const tent = this.add.graphics();
    drawCampTent(tent, skin);
    wrapper.add([glow, tent]);
    const hit = this.add
      .zone(camp.x, camp.y - 8, 96, 96)
      .setOrigin(0.5, 0.5)
      .setDepth(26)
      .setInteractive({ cursor: "pointer" });
    hit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.button === 0) this.tryEnterCamp(camp);
    });
    marker = { wrapper, hit, glow, tent, ownerName: camp.owner_name, skin };
    this.camps.set(camp.owner_name, marker);
    return marker;
  }

  private tryEnterCamp(camp: WorldCamp) {
    const state = useGame.getState();
    const selfId = state.selfId;
    const self = selfId ? state.entities[selfId] : undefined;
    if (!selfId || !self || self.in_house) return;
    const live = state.camps[camp.owner_name] ?? camp;
    const av = this.avatars.get(selfId);
    const x = av?.wrapper.x ?? self.x;
    const y = av?.wrapper.y ?? self.y;
    if (Math.hypot(x - live.x, y - live.y) > INTERACT_RANGE) {
      pushChat("system", "Move closer to the camp.");
      return;
    }
    net.enterHouse(live.owner_name);
  }

  private syncJobChangers(jobChangers: Record<string, JobChanger>) {
    for (const [id, marker] of this.jobChangers) {
      if (!jobChangers[id]) {
        marker.wrapper.destroy();
        marker.hit.destroy();
        this.jobChangers.delete(id);
      }
    }
    for (const jc of Object.values(jobChangers)) {
      this.ensureJobChanger(jc);
    }
  }

  private syncSavePoints(savePoints: Record<string, SavePoint>, activeId?: string) {
    for (const [id, marker] of this.savePoints) {
      if (!savePoints[id]) {
        marker.wrapper.destroy();
        marker.hit.destroy();
        this.savePoints.delete(id);
      }
    }
    for (const sp of Object.values(savePoints)) {
      this.ensureSavePoint(sp, sp.id === activeId);
    }
  }

  private ensureFoe(npc: WorldEntity): FoeAvatar {
    let av = this.foes.get(npc.id);
    if (av) return av;
    const kind = enemyKindFromName(npc.name, npc.sprite);
    const wrapper = this.add.container(npc.x, npc.y).setDepth(9);
    const enemy = new EnemySprite(this, 0, 0, kind);
    wrapper.add([entityShadow(this), enemy.container]);
    enemy.setInteractive(() => this.onEntityClicked(npc.id));
    av = { wrapper, enemy, lastX: npc.x, lastY: npc.y };
    this.foes.set(npc.id, av);
    return av;
  }

  /**
   * Click an NPC / player / pet / combat-only entity: casts an armed action on
   * it, or focuses it as the attack target (net.clickEntity → set_target).
   */
  private onEntityClicked(id: string) {
    if (this.input.activePointer.button !== 0) return;
    const state = useGame.getState();
    if (id === state.selfId) return;
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
    const av = this.avatars.get(id);
    if (av) return { wrapper: av.wrapper, sprite: av.sprite };
    const fo = this.foes.get(id);
    if (fo) return { wrapper: fo.wrapper, sprite: fo.enemy };
    const pet = this.pets.get(id);
    if (pet) return { wrapper: pet.wrapper, sprite: pet.enemy };
    const ex = this.combatExtras.get(id);
    if (ex) return { wrapper: ex.wrapper, sprite: ex.sprite };
    return undefined;
  }

  /** Live cast progress 0–1 for an entity id, from combat ticks or world cast fields. */
  private entityCastPct(id: string, wp?: WorldEntity): number | undefined {
    const state = useGame.getState();
    const ce = state.combatIds[id] ? state.entities[id] : undefined;
    if (ce?.casting_skill_id) {
      return Phaser.Math.Clamp((ce.cast_progress ?? 0) / 100, 0, 1);
    }
    return wp ? this.castProgress(wp) : undefined;
  }

  /** Compact HP shown over engaged/damaged combatants; undefined keeps the bar hidden. */
  private entityHpMark(id: string, fallback?: { hp: number; max_hp: number }): { value: number; max: number } | undefined {
    const state = useGame.getState();
    const e = state.entities[id];
    if (e && state.combatIds[id]) {
      // Presence in the AoI combat snapshot means engaged; always show the bar.
      return { value: e.hp, max: e.max_hp };
    }
    if (e && (e.engaged || e.hp < e.max_hp)) {
      return { value: e.hp, max: e.max_hp };
    }
    if (fallback && fallback.hp < fallback.max_hp) return { value: fallback.hp, max: fallback.max_hp };
    return undefined;
  }

  private isNearCamera(x: number, y: number, pad = 256): boolean {
    const view = this.cameras.main.worldView;
    return x >= view.x - pad && x <= view.right + pad && y >= view.y - pad && y <= view.bottom + pad;
  }

  private castProgress(wp: WorldEntity): number | undefined {
    const casting = !!wp.casting_skill_id && (wp.cast_time_ms ?? 0) > 0;
    if (!casting) return undefined;
    const ms = wp.cast_time_ms ?? 1;
    const ends = wp.cast_ends_at ?? 0;
    return Phaser.Math.Clamp(1 - (ends - Date.now()) / ms, 0, 1);
  }

  private publishOverlays(
    entities: EntityOverlayMark[],
    pois: PoiLabelMark[],
    interacts: InteractPromptMark[],
  ) {
    setWorldOverlays({ entities, pois, interacts });
  }

  private poiLabel(
    id: string,
    label: string,
    variant: PoiLabelMark["variant"],
    worldX: number,
    worldY: number,
    localY: number,
    transform: StageTransform,
  ): PoiLabelMark {
    const p = worldLocalToStage(this, worldX, worldY, 0, localY, transform);
    return { id, label, variant, x: p.x, y: p.y };
  }

  private interactMark(
    id: string,
    keyLabel: string,
    worldX: number,
    worldY: number,
    localY: number,
    transform: StageTransform,
  ): InteractPromptMark {
    const p = worldLocalToStage(this, worldX, worldY, 0, localY, transform);
    return { id, keyLabel, x: p.x, y: p.y };
  }

  private stageMark(
    id: string,
    label: string,
    variant: EntityOverlayMark["variant"],
    worldX: number,
    worldY: number,
    castPct?: number,
    transform = getStageTransform(this),
    hp?: { value: number; max: number },
    statuses?: StatusSnapshot[],
    nameLocalY = H99_NAME_LABEL_Y,
  ): EntityOverlayMark {
    const feet = worldToStagePoint(this, worldX, worldY, transform);
    const nameOff = localOffsetToStage(0, nameLocalY, transform);
    const castOff = localOffsetToStage(0, CAST_BAR_Y, transform);
    const st = useGame.getState();
    const focused = st.selfId != null && st.entities[st.selfId]?.target_id === id;
    return {
      id,
      label,
      variant,
      screenX: feet.x,
      screenY: feet.y,
      nameX: feet.x + nameOff.x,
      nameY: feet.y + nameOff.y,
      castX: feet.x + castOff.x,
      castY: feet.y + castOff.y,
      castPct,
      hp,
      statuses,
      targeted: focused,
    };
  }

  update(time: number, delta: number) {
    const state = useGame.getState();
    if (state.screen !== "world") {
      clearEntityOverlays();
      clearWorldLocalPos();
      clearWorldViewRect();
      return;
    }
    {
      const v = this.cameras.main.worldView;
      setWorldViewRect(v.x, v.y, v.width, v.height);
    }
    this.movement.syncMoveKeys();
    const mapId = state.mapInfo?.id ?? "";
    if (mapId !== this.lastMapId) {
      this.lastMapId = mapId;
      this.selfSpawned = false;
    }
    const selfId = state.selfId;
    if (!selfId) {
      clearEntityOverlays();
      return;
    }

    for (const [id, av] of this.avatars) {
      const e = state.entities[id];
      if (!e || e.kind !== "player") {
        av.wrapper.destroy();
        this.avatars.delete(id);
        if (id === selfId) this.selfSpawned = false;
      }
    }

    const activeSave = state.profile?.save_point_id;
    this.syncSavePoints(state.savePoints, activeSave);
    this.syncJobChangers(state.jobChangers);
    this.syncCamps(state.camps);
    this.processCombatEvents();

    const overlayMarks: EntityOverlayMark[] = [];
    const stageXf = getStageTransform(this);

    for (const wp of Object.values(state.entities)) {
      if (wp.kind !== "player") continue;
      // Inside a house: gone from the overworld (no sprite, no interact).
      if (wp.in_house) {
        const gone = this.avatars.get(wp.id);
        if (gone) {
          gone.wrapper.destroy();
          this.avatars.delete(wp.id);
          if (wp.id === selfId) this.selfSpawned = false;
        }
        continue;
      }
      const av = this.ensureAvatar(wp.id, wp.sprite, wp.weapon, wp.appearance);
      const ce = state.combatIds[wp.id] ? wp : undefined;
      const dead = ce ? !ce.alive : false;
      const immune = !wp.engaged && (wp.immune_until ?? 0) > Date.now();
      av.wrapper.setAlpha(dead ? 0.35 : 1);
      if (av.ring) {
        av.ring.setVisible(immune);
        if (immune) {
          const pulse = 0.15 + 0.15 * Math.sin(this.time.now / 180);
          av.ring.setFillStyle(0xb4dcff, pulse);
        }
      }

      const isSelf = wp.id === selfId;
      const inView = isSelf || this.isNearCamera(av.wrapper.x, av.wrapper.y);
      // Engaged players move on the 50ms combat tick, merged into the entity.
      const tx = wp.x;
      const ty = wp.y;
      if (!isSelf && inView && !this.jumping.has(wp.id)) {
        if (Math.hypot(av.wrapper.x - tx, av.wrapper.y - ty) > 80) {
          av.wrapper.setPosition(tx, ty);
          av.sprite.setMoving(false);
          av.sprite.setFacing(facingOf(wp, av.sprite.getFacing()));
        } else {
          const prevX = av.wrapper.x;
          const prevY = av.wrapper.y;
          av.wrapper.x = Phaser.Math.Linear(av.wrapper.x, tx, 0.25);
          av.wrapper.y = Phaser.Math.Linear(av.wrapper.y, ty, 0.25);
          const dx = av.wrapper.x - prevX;
          const dy = av.wrapper.y - prevY;
          av.sprite.setMoving(Math.hypot(dx, dy) > 0.3, dx, dy);
        }
      } else if (!isSelf) {
        av.wrapper.setPosition(tx, ty);
        av.sprite.setMoving(false);
        av.sprite.setFacing(facingOf(wp, av.sprite.getFacing()));
      }

      if (inView || isSelf) av.sprite.update(delta);

      const casting =
        !!ce?.casting_skill_id || (!!wp.casting_skill_id && (wp.cast_time_ms ?? 0) > 0);
      av.sprite.setCasting(casting);

      if (isSelf) {
        if (!this.selfSpawned) {
          av.wrapper.setPosition(wp.x, wp.y);
          setLastWorldFacing(facingOf(wp, getLastWorldFacing()));
          av.sprite.setFacing(getLastWorldFacing());
          this.cameras.main.startFollow(av.wrapper, true, 0.15, 0.15);
          this.selfSpawned = true;
        } else if (
          !this.movement.dodging &&
          !this.jumping.has(wp.id) &&
          Math.hypot(av.wrapper.x - wp.x, av.wrapper.y - wp.y) > 80
        ) {
          av.wrapper.setPosition(wp.x, wp.y);
          setLastWorldFacing(facingOf(wp, getLastWorldFacing()));
          av.sprite.setFacing(getLastWorldFacing());
        }
        setWorldLocalPos(av.wrapper.x, av.wrapper.y);
      }

      if (inView || isSelf) {
        overlayMarks.push(
          this.stageMark(
            wp.id,
            `${wp.name} Lv${wp.level ?? 0}${wp.engaged ? " ⚔" : ""}${immune ? " 🛡" : ""}`,
            isSelf ? "self" : "player",
            av.wrapper.x,
            av.wrapper.y,
            this.entityCastPct(wp.id, wp),
            stageXf,
            this.entityHpMark(wp.id),
            ce?.statuses,
          ),
        );
      }
    }

    this.syncFoes(state.entities, delta, overlayMarks, stageXf);
    this.syncCombatEntities(state, delta, overlayMarks, stageXf);
    this.updateTargetRing(state);
    this.movement.updateDodgeCooldown();
    this.movement.update(time, selfId, state.overworld);
    this.syncPets(state.entities, delta, overlayMarks, stageXf);

    // POIs are world-fixed; project with the camera scroll Phaser will use this frame
    // (follow lerp runs in Camera.preRender after Scene.update).
    const selfAv = this.avatars.get(selfId);
    if (selfAv) this.visibility?.update(selfAv.wrapper.x, selfAv.wrapper.y);
    const poiXf = getStageTransform(
      this,
      selfAv ? { x: selfAv.wrapper.x, y: selfAv.wrapper.y } : null,
    );

    const pois: PoiLabelMark[] = [];
    for (const [id, marker] of this.savePoints) {
      if (!this.isNearCamera(marker.wrapper.x, marker.wrapper.y)) continue;
      pois.push(
        this.poiLabel(
          `save:${id}`,
          marker.name,
          marker.active ? "save-active" : "save",
          marker.wrapper.x,
          marker.wrapper.y,
          POI_LABEL_Y,
          poiXf,
        ),
      );
    }
    for (const [id, marker] of this.jobChangers) {
      if (!this.isNearCamera(marker.wrapper.x, marker.wrapper.y)) continue;
      pois.push(
        this.poiLabel(`job:${id}`, marker.name, "job", marker.wrapper.x, marker.wrapper.y, POI_LABEL_Y, poiXf),
      );
    }
    for (const [id, marker] of this.camps) {
      if (!this.isNearCamera(marker.wrapper.x, marker.wrapper.y)) continue;
      pois.push(
        this.poiLabel(
          `camp:${id}`,
          `${marker.ownerName}'s Camp`,
          "camp",
          marker.wrapper.x,
          marker.wrapper.y,
          CAMP_LABEL_Y,
          poiXf,
        ),
      );
    }

    const interacts = this.collectInteractPrompts(state, selfId, poiXf);
    this.publishOverlays(overlayMarks, pois, interacts);
  }

  private collectInteractPrompts(
    state: ReturnType<typeof useGame.getState>,
    selfId: string,
    transform: StageTransform,
  ): InteractPromptMark[] {
    const showPrompts = canShowWorldInteractPrompts(state);
    if (!showPrompts) return [];
    const keyLabel = interactKeyLabel(state.profile?.keybinds);
    const selfAv = this.avatars.get(selfId);
    const self = state.entities[selfId];
    const selfX = selfAv?.wrapper.x ?? self?.x ?? 0;
    const selfY = selfAv?.wrapper.y ?? self?.y ?? 0;
    const out: InteractPromptMark[] = [];

    const maybe = (id: string, x: number, y: number, range: number, localY: number) => {
      if (Math.hypot(selfX - x, selfY - y) > range) return;
      out.push(this.interactMark(id, keyLabel, x, y, localY, transform));
    };

    for (const [id, marker] of this.savePoints) {
      maybe(`ix-save:${id}`, marker.wrapper.x, marker.wrapper.y, SAVE_POINT_RANGE, POI_INTERACT_PROMPT_Y);
    }
    for (const [id, marker] of this.jobChangers) {
      maybe(`ix-job:${id}`, marker.wrapper.x, marker.wrapper.y, JOB_CHANGER_RANGE, POI_INTERACT_PROMPT_Y);
    }
    for (const [id, marker] of this.camps) {
      maybe(`ix-camp:${id}`, marker.wrapper.x, marker.wrapper.y, INTERACT_RANGE, POI_INTERACT_PROMPT_Y);
    }
    return out;
  }

  /** Engaged NPCs move on 50ms combat ticks, merged into the entity record. */
  private syncFoes(
    entities: Record<string, WorldEntity>,
    delta: number,
    overlayMarks: EntityOverlayMark[],
    stageXf = getStageTransform(this),
  ) {
    const combatIds = useGame.getState().combatIds;
    for (const [id, av] of this.foes) {
      const e = entities[id];
      if (!e || e.kind !== "npc") {
        av.wrapper.destroy();
        this.foes.delete(id);
      }
    }
    for (const npc of Object.values(entities)) {
      if (npc.kind !== "npc") continue;
      const av = this.ensureFoe(npc);
      const kind = enemyKindFromName(npc.name, npc.sprite);
      av.enemy.setKind(kind);
      const ce = combatIds[npc.id] ? npc : undefined;
      const dead = ce ? !ce.alive : npc.hp <= 0;
      const engaged = !!npc.engaged || !!ce;
      av.wrapper.setAlpha(dead ? 0.35 : 1);
      const inView = this.isNearCamera(av.wrapper.x, av.wrapper.y);
      const prevX = av.lastX;
      const prevY = av.lastY;
      const tx = npc.x;
      const ty = npc.y;
      if (inView && !this.jumping.has(npc.id)) {
        if (Math.hypot(av.wrapper.x - tx, av.wrapper.y - ty) > 120) {
          av.wrapper.setPosition(tx, ty);
          av.enemy.setMoving(false);
        } else {
          av.wrapper.x = Phaser.Math.Linear(av.wrapper.x, tx, 0.2);
          av.wrapper.y = Phaser.Math.Linear(av.wrapper.y, ty, 0.2);
          const dx = av.wrapper.x - prevX;
          const dy = av.wrapper.y - prevY;
          av.enemy.setMoving(Math.hypot(dx, dy) > 0.3, dx, dy);
        }
      } else if (!this.jumping.has(npc.id)) {
        av.wrapper.setPosition(tx, ty);
        av.enemy.setMoving(false);
      }
      av.enemy.setCasting(!!ce?.casting_skill_id);
      if (inView) {
        av.enemy.update(delta);
        overlayMarks.push(
          this.stageMark(
            npc.id,
            `${npc.name} Lv${npc.level ?? 0}${engaged ? " ⚔" : ""}`,
            "enemy",
            av.wrapper.x,
            av.wrapper.y,
            this.entityCastPct(npc.id),
            stageXf,
            this.entityHpMark(npc.id, npc),
            ce?.statuses,
          ),
        );
      }
      av.lastX = av.wrapper.x;
      av.lastY = av.wrapper.y;
    }
  }

  /**
   * Combat entities with no world replica (battle pets, summons) get a
   * temporary avatar for the duration of the fight; engaged NPC/player
   * replicas are driven by the normal sync paths via combatIds + entities.
   */
  private syncCombatEntities(
    state: ReturnType<typeof useGame.getState>,
    delta: number,
    overlayMarks: EntityOverlayMark[],
    stageXf: StageTransform,
  ) {
    for (const [id, ex] of this.combatExtras) {
      const e = state.combatIds[id] ? state.entities[id] : undefined;
      if (!e || this.avatars.has(id) || this.foes.has(id) || this.pets.has(id)) {
        ex.wrapper.destroy();
        this.combatExtras.delete(id);
      }
    }
    for (const id of Object.keys(state.combatIds)) {
      const ce = state.entities[id];
      if (!ce || ce.id === state.selfId) continue;
      // World replicas (players/NPCs/pets) are synced by their own loops.
      if (this.avatars.has(ce.id) || this.foes.has(ce.id) || this.pets.has(ce.id)) continue;
      const ex = this.ensureCombatExtra(ce);
      const inView = this.isNearCamera(ex.wrapper.x, ex.wrapper.y);
      ex.wrapper.setAlpha(ce.alive ? 1 : 0.35);
      if (!this.jumping.has(ce.id)) {
        const prevX = ex.wrapper.x;
        const prevY = ex.wrapper.y;
        if (inView && Math.hypot(ex.wrapper.x - ce.x, ex.wrapper.y - ce.y) <= 120) {
          ex.wrapper.x = Phaser.Math.Linear(ex.wrapper.x, ce.x, 0.25);
          ex.wrapper.y = Phaser.Math.Linear(ex.wrapper.y, ce.y, 0.25);
          ex.sprite.setMoving(Math.hypot(ex.wrapper.x - prevX, ex.wrapper.y - prevY) > 0.3, ex.wrapper.x - prevX, ex.wrapper.y - prevY);
        } else {
          ex.wrapper.setPosition(ce.x, ce.y);
          ex.sprite.setMoving(false);
        }
      }
      ex.sprite.setCasting(!!ce.casting_skill_id);
      if (inView) {
        ex.sprite.update(delta);
        overlayMarks.push(
          this.stageMark(
            ce.id,
            `${ce.name}${ce.level ? ` Lv${ce.level}` : ""}`,
            isAllyEntity(ce) ? "player" : "enemy",
            ex.wrapper.x,
            ex.wrapper.y,
            this.entityCastPct(ce.id),
            stageXf,
            this.entityHpMark(ce.id),
            ce.statuses,
          ),
        );
      }
      ex.lastX = ex.wrapper.x;
      ex.lastY = ex.wrapper.y;
    }
  }

  private ensureCombatExtra(ce: WorldEntity): CombatExtra {
    let ex = this.combatExtras.get(ce.id);
    if (ex) return ex;
    const wrapper = this.add.container(ce.x, ce.y).setDepth(ENTITY_PRESENTATION.combatExtraDepth);
    const sprite = createSpriteForEntity(this, ce);
    wrapper.add([entityShadow(this, ENTITY_PRESENTATION.defaultShadowScale), sprite.container]);
    wrapper.setSize(44, 60);
    wrapper.setInteractive({ useHandCursor: true, cursor: "pointer" });
    wrapper.on("pointerdown", () => this.onEntityClicked(ce.id));
    ex = { wrapper, sprite, lastX: ce.x, lastY: ce.y };
    this.combatExtras.set(ce.id, ex);
    return ex;
  }

  /** Pulsing ring under the current focus target (socket set_target echo). */
  private updateTargetRing(state: ReturnType<typeof useGame.getState>) {
    const selfId = state.selfId;
    const focusId = selfId ? state.entities[selfId]?.target_id : undefined;
    const focusE = focusId ? state.entities[focusId] : undefined;
    const focusInFight = !!focusId && !!state.combatIds[focusId];
    const av = focusId ? this.combatAvatarFor(focusId) : undefined;
    const alive = focusInFight ? (focusE?.alive ?? false) : !!av;
    if (!focusId || !av || !alive) {
      this.targetRing?.setVisible(false);
      return;
    }
    if (!this.targetRing) {
      this.targetRing = this.add
        .ellipse(0, 0, 60, 24)
        .setDepth(11)
        .setStrokeStyle(2.5, 0xe05545, 0.9);
    }
    this.targetRing.setVisible(true);
    this.targetRing.setPosition(av.wrapper.x, av.wrapper.y + H99_WORLD_RING_Y);
    this.targetRing.setAlpha(0.65 + 0.3 * Math.sin(this.time.now / 160));
    // Gold while an armed action can legally hit the focus.
    const sel = state.selectedAction;
    const friendly = focusE != null && (isAllyEntity(focusE) || focusE.kind === "pet");
    this.targetRing.setStrokeStyle(2.5, sel && sel.heals === friendly ? 0xffe9a8 : 0xe05545, 0.9);
  }

  /** Animate every unseen combat_event (VFX, lunge, float text, hit flash). */
  private processCombatEvents() {
    const events = useGame.getState().combatEvents;
    for (const ev of events) {
      if (ev.seq <= this.combatSeenSeq) continue;
      this.combatSeenSeq = ev.seq;
      this.animateCombatEvent(ev);
    }
  }

  /** Ported from RTBattleScene.animateEvent, including actor→target arcs. */
  private animateCombatEvent(ev: CombatEvent) {
    const speed = DEFAULT_BATTLE_SPEED;
    const actor = this.combatAvatarFor(ev.attacker_id);
    const target = ev.target_id ? this.combatAvatarFor(ev.target_id) : undefined;
    // Turn the actor toward whoever it is acting on.
    if (actor && target && actor !== target) {
      const fdx = target.wrapper.x - actor.wrapper.x;
      if (Math.abs(fdx) > 0.5) actor.sprite.setFacing(fdx < 0 ? "left" : "right");
    }
    const result: ActionResult = {
      actor_id: ev.attacker_id,
      action_id: ev.action_id ?? "attack",
      action_name: ev.action_name ?? "",
      target_id: ev.target_id ?? "",
      success: ev.success ?? ev.hit,
      damage: ev.damage,
      heal: ev.heal,
      mp_restored: ev.mp_restored,
      message: ev.message,
      cast_started: ev.cast_started,
    };

    if (ev.cast_cancelled) {
      if (actor) {
        actor.sprite.setCasting(false);
        playFizzleVfx(this, actor.wrapper.x, actor.wrapper.y - 36, speed);
      }
      return;
    }

    if (!result.success) {
      if (actor) playFizzleVfx(this, actor.wrapper.x, actor.wrapper.y - 36, speed);
      if (result.action_id === "attack") actor?.sprite.playAttack();
      return;
    }

    if (result.action_id === "dodge") {
      if (actor) playDodgeVfx(this, actor.wrapper.x, actor.wrapper.y - 8, speed);
      return;
    }

    if (result.cast_started) {
      if (actor) {
        actor.sprite.setCasting(true);
        playCastStartVfx(this, actor.wrapper.x, actor.wrapper.y - 20, result.action_id, speed);
        if (target && target !== actor) {
          playActionArc(this, actor.wrapper, target.wrapper, result.action_id, speed);
        }
      }
      return;
    }

    actor?.sprite.setCasting(false);
    actor?.sprite.playAttack();

    const selfId = useGame.getState().selfId;
    const involves = ev.attacker_id === selfId || ev.target_id === selfId;

    const showHit = () => {
      if (!target) return;
      if (result.damage) {
        this.floatText(target.wrapper.x, target.wrapper.y - 42, `${result.damage}`, "#ffffff", speed);
        target.sprite.playHit(speed);
        if (involves) this.cameras.main.shake(battleDuration(70, speed), 0.003);
      } else if (result.heal) {
        this.floatText(target.wrapper.x, target.wrapper.y - 42, `+${result.heal}`, "#4ade80", speed);
      } else if (result.mp_restored) {
        this.floatText(target.wrapper.x, target.wrapper.y - 42, `+${result.mp_restored} MP`, "#4aa3e8", speed);
      }
    };

    if (actor && target && isJumpAction(result.action_id)) {
      if (ev.attacker_id === useGame.getState().selfId) this.movement.invalidateSlides();
      this.jumping.add(ev.attacker_id);
      const inner = actor.sprite.container;
      this.tweens.killTweensOf(inner);
      inner.x = 0;
      inner.y = 0;
      playJumpCrash(
        this,
        actor.wrapper,
        target.wrapper,
        speed,
        () => {
          playBattleVfx(
            this,
            result,
            { x: target.wrapper.x, y: target.wrapper.y },
            { x: target.wrapper.x, y: target.wrapper.y },
            speed,
          );
          showHit();
        },
        () => {
          this.jumping.delete(ev.attacker_id);
        },
      );
      return;
    }

    // Non-physical actions lob a projectile arc from actor to target;
    // physical attacks get the melee swing arc inside playBattleVfx.
    if (
      actor &&
      target &&
      actor !== target &&
      vfxCategoryForAction(result.action_id, result.heal) !== "physical"
    ) {
      playActionArc(this, actor.wrapper, target.wrapper, result.action_id, speed, result.heal);
    }
    if (target) {
      playBattleVfx(
        this,
        result,
        actor ? { x: actor.wrapper.x, y: actor.wrapper.y } : undefined,
        { x: target.wrapper.x, y: target.wrapper.y },
        speed,
      );
    }

    if (actor && target && actor !== target) {
      const dx = target.wrapper.x - actor.wrapper.x;
      const dy = target.wrapper.y - actor.wrapper.y;
      const mag = Math.hypot(dx, dy) || 1;
      const inner = actor.sprite.container;
      this.tweens.killTweensOf(inner);
      this.tweens.add({
        targets: inner,
        x: (dx / mag) * 22,
        y: (dy / mag) * 22,
        duration: battleDuration(110, speed),
        yoyo: true,
        ease: "Power2",
        onComplete: () => {
          inner.x = 0;
          inner.y = 0;
        },
      });
    }

    showHit();
  }

  private floatText(x: number, y: number, text: string, color: string, battleSpeed: number) {
    const t = this.add
      .text(x, y, text, {
        fontSize: "16px",
        color,
        fontFamily: "monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(80)
      .setShadow(1, 1, "#000", 3);
    this.tweens.add({
      targets: t,
      y: y - 36,
      alpha: 0,
      duration: battleDuration(900, battleSpeed),
      ease: "Power1",
      onComplete: () => t.destroy(),
    });
  }

}
