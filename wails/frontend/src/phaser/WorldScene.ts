import Phaser from "phaser";
import { net } from "../net/socket";
import { uiOwnsKeyboard, useGame, type CombatEvent } from "../state/store";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";
import { appearanceKey, facingFromDelta, H99_FACING_DEFAULT, H99_NAME_LABEL_Y, H99_WORLD_RING_RADIUS, H99_WORLD_RING_Y, type CharacterFacing } from "../characters/types";
import { applyPlayerSlide, H99_COLLISION_HALF_H, H99_COLLISION_HALF_W } from "./movementBridge";
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
import { bindingToPhaserKeyCode, mergeKeybinds, resolveHotbarSlot } from "../input/keybinds";
import { CharacterSprite } from "./CharacterSprite";
import { EnemySprite } from "./EnemySprite";
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
import { findPath, type PathPoint } from "../world/pathfind";
import { clearWorldLocalPos, setWorldLocalPos } from "../world/worldLocalPos";
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

const SPEED = 240;
const SEND_INTERVAL = 100;
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

/** Dodge dash distance — two 32px squares (matches the old realtime battle dash). */
const DODGE_DIST = 64;
/** Local dodge cooldown mirror — the server enforces the authoritative 500ms. */
const DODGE_COOLDOWN_MS = 500;
/** Local stamina check mirror (server: staminaMax 100, dodge cost 25). */
const DODGE_STAMINA_COST = 25;
/** Melee reach drawn around self while fighting (server: attackRangeW 70). */
const MELEE_RANGE = 70;

/** Survives Phaser remounts when crossing maps. */
let lastWorldFacing: CharacterFacing = H99_FACING_DEFAULT;

function facingOf(wp: Pick<WorldEntity, "facing">, fallback: CharacterFacing): CharacterFacing {
  return wp.facing === "left" || wp.facing === "right" ? wp.facing : fallback;
}

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
  sprite: CharacterSprite | EnemySprite;
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
  private moveKeys: Partial<Record<"move_up" | "move_down" | "move_left" | "move_right", Phaser.Input.Keyboard.Key>> = {};
  private moveKeysSig = "";
  private lastSent = 0;
  private lastSentX = -1;
  private lastSentY = -1;
  private wasMoving = false;
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
  /** Faint circle showing melee reach around self while fighting. */
  private meleeRing?: Phaser.GameObjects.Arc;
  /** Current normalized movement direction — the dodge dash direction. */
  private moveDir = { x: 0, y: 0 };
  /** Bumped when a dodge/jump resets the local movement timeline; stale
   * pending slide callbacks must not overwrite the wrapper. */
  private moveEpoch = 0;
  /** Click-to-move waypoint queue (world coords); cancelled by key input. */
  private clickPath: PathPoint[] | null = null;
  /** Breadcrumb dots along the active click path — eaten as the player passes. */
  private pathDots: { dot: Phaser.GameObjects.Arc; x: number; y: number }[] = [];
  /** Shift was consumed as a hotbar chord (Shift+1–8) — release does not dodge. */
  private shiftComboUsed = false;
  private dodging = false;
  private dodgeReadyAt = 0;
  /** Sweep ring under self showing the dodge cooldown. */
  private dodgeCdGfx?: Phaser.GameObjects.Graphics;
  private readonly onCombatKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Shift") {
      this.shiftComboUsed = false;
      return;
    }
    if (!e.shiftKey) return;
    // Shift+digit is a hotbar row — releasing Shift afterward must not dodge.
    const binds = mergeKeybinds(useGame.getState().profile?.keybinds);
    if (resolveHotbarSlot(e, binds)?.startsWith("shift+")) this.shiftComboUsed = true;
  };
  private readonly onCombatKeyUp = (e: KeyboardEvent) => {
    if (e.key !== "Shift") return;
    if (!uiOwnsKeyboard() && !this.shiftComboUsed) this.performDodge();
    this.shiftComboUsed = false;
  };
  /** Last position/time while following a click path — detects wall-stuck. */
  private clickStuck = { x: 0, y: 0, t: 0 };
  private readonly onGroundPointerDown = (
    pointer: Phaser.Input.Pointer,
    over: Phaser.GameObjects.GameObject[],
  ) => {
    // Right-click anywhere in the world deselects the current target and
    // cancels any armed hotbar action (entity/POI zones only handle left).
    if (pointer.button === 2) {
      this.clearTargetSelection();
      return;
    }
    if (pointer.button !== 0 || (over && over.length > 0)) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    this.startClickMove(pointer.worldX, pointer.worldY);
  };

  private clearTargetSelection() {
    const s = useGame.getState();
    if (s.selectedAction || s.commandPetId) {
      useGame.setState({ selectedAction: null, commandPetId: null });
    }
    const self = s.selfId ? s.entities[s.selfId] : undefined;
    if (self?.target_id) net.setTarget("");
  }

  /** Path the local player to a world point and flash the destination. */
  private startClickMove(wx: number, wy: number) {
    const selfId = useGame.getState().selfId;
    const av = selfId ? this.avatars.get(selfId) : undefined;
    const map = useGame.getState().overworld;
    if (!av || !map || this.dodging) return;
    const path = findPath(map, av.wrapper.x, av.wrapper.y, wx, wy);
    if (!path?.length) return;
    this.clickPath = path;
    this.clickStuck = { x: av.wrapper.x, y: av.wrapper.y, t: this.time.now };
    this.layPathDots(av.wrapper.x, av.wrapper.y, path);
    const last = path[path.length - 1];
    const ring = this.add
      .circle(last.x, last.y, 11)
      .setStrokeStyle(2, 0xe8c96a)
      .setDepth(6);
    this.tweens.add({
      targets: ring,
      scale: 0.4,
      alpha: 0,
      duration: 450,
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Sprinkle breadcrumb dots along the path the player is about to walk.
   * They ripple in from near→far on click and are eaten as the player passes.
   */
  private layPathDots(fromX: number, fromY: number, path: PathPoint[]) {
    this.clearPathDots();
    const pts = [{ x: fromX, y: fromY }, ...path];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    if (total < 24) return; // too short to breadcrumb
    const spacing = Math.max(16, total / 60); // cap ~60 dots on long paths
    let at = spacing;
    let segStart = 0;
    let segIdx = 0;
    let i = 0;
    // Stop ~10px short of the end — the shrinking ring marks the destination.
    while (at <= total - 10) {
      let segLen = Math.hypot(pts[segIdx + 1].x - pts[segIdx].x, pts[segIdx + 1].y - pts[segIdx].y);
      while (segStart + segLen < at && segIdx < pts.length - 2) {
        segStart += segLen;
        segIdx++;
        segLen = Math.hypot(pts[segIdx + 1].x - pts[segIdx].x, pts[segIdx + 1].y - pts[segIdx].y);
      }
      const a = pts[segIdx];
      const b = pts[segIdx + 1];
      const t = segLen > 0 ? (at - segStart) / segLen : 0;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const dot = this.add
        .circle(x, y, 2.5, 0xe8c96a, 0)
        .setDepth(6)
        .setScale(0.4);
      this.tweens.add({
        targets: dot,
        alpha: 0.55,
        scale: 1,
        duration: 160,
        delay: i * 35,
      });
      this.pathDots.push({ dot, x, y });
      i++;
      at += spacing;
    }
  }

  private clearPathDots() {
    for (const p of this.pathDots) p.dot.destroy();
    this.pathDots = [];
  }

  /** Cancel click-to-move and remove its breadcrumbs. */
  private clearClickPath() {
    this.clickPath = null;
    this.clearPathDots();
  }

  /** Fade out breadcrumbs the player has reached. Called each move frame. */
  private eatPathDots(x: number, y: number) {
    if (!this.pathDots.length) return;
    const eaten: typeof this.pathDots = [];
    this.pathDots = this.pathDots.filter((p) => {
      if (Math.hypot(x - p.x, y - p.y) > 16) return true;
      eaten.push(p);
      return false;
    });
    for (const p of eaten) {
      const d = p.dot;
      this.tweens.add({
        targets: d,
        alpha: 0,
        scale: 0.3,
        duration: 140,
        onComplete: () => d.destroy(),
      });
    }
  }

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
    this.syncMoveKeys();
    kb.disableGlobalCapture();
    // Combat input: Shift keyup dodges unless it was a Shift+hotbar chord.
    kb.off("keydown", this.onCombatKeyDown);
    kb.off("keyup", this.onCombatKeyUp);
    kb.on("keydown", this.onCombatKeyDown);
    kb.on("keyup", this.onCombatKeyUp);
    // Click-to-move: left-click on open ground paths to the point. Entity and
    // POI hit zones consume their own clicks (non-empty `over`), so this only
    // fires on bare terrain.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onGroundPointerDown);
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
      this.meleeRing?.destroy();
      this.meleeRing = undefined;
      this.dodgeCdGfx?.destroy();
      this.dodgeCdGfx = undefined;
      this.dodging = false;
      this.shiftComboUsed = false;
      this.clearClickPath();
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onGroundPointerDown);
      clearEntityOverlays();
    });
    this.events.on(Phaser.Scenes.Events.SLEEP, () => {
      clearEntityOverlays();
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

  private syncMoveKeys() {
    const binds = mergeKeybinds(useGame.getState().profile?.keybinds);
    const sig = `${binds.move_up}|${binds.move_down}|${binds.move_left}|${binds.move_right}`;
    const missing = !this.moveKeys.move_up || !this.moveKeys.move_down || !this.moveKeys.move_left || !this.moveKeys.move_right;
    if (!missing && sig === this.moveKeysSig) return;
    const kb = this.input.keyboard;
    if (!kb) {
      this.moveKeysSig = "";
      return;
    }
    const bindKey = (action: "move_up" | "move_down" | "move_left" | "move_right") => {
      const code = bindingToPhaserKeyCode(binds[action] ?? "");
      this.moveKeys[action] = code != null ? kb.addKey(code) : undefined;
    };
    bindKey("move_up");
    bindKey("move_down");
    bindKey("move_left");
    bindKey("move_right");
    this.moveKeysSig = sig;
  }

  private isMoveDown(action: "move_up" | "move_down" | "move_left" | "move_right"): boolean {
    return !!this.moveKeys[action]?.isDown;
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
  ): { wrapper: Phaser.GameObjects.Container; sprite: CharacterSprite | EnemySprite } | undefined {
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
    };
  }

  update(time: number, delta: number) {
    const state = useGame.getState();
    if (state.screen !== "world") {
      clearEntityOverlays();
      clearWorldLocalPos();
      return;
    }
    this.syncMoveKeys();
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
          lastWorldFacing = facingOf(wp, lastWorldFacing);
          av.sprite.setFacing(lastWorldFacing);
          this.cameras.main.startFollow(av.wrapper, true, 0.15, 0.15);
          this.selfSpawned = true;
        } else if (
          !this.dodging &&
          !this.jumping.has(wp.id) &&
          Math.hypot(av.wrapper.x - wp.x, av.wrapper.y - wp.y) > 80
        ) {
          av.wrapper.setPosition(wp.x, wp.y);
          lastWorldFacing = facingOf(wp, lastWorldFacing);
          av.sprite.setFacing(lastWorldFacing);
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
    this.updateMeleeRing(state);
    this.updateDodgeCooldown();
    this.moveSelf(time, selfId, state.overworld);
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
    const wrapper = this.add.container(ce.x, ce.y).setDepth(10);
    let sprite: CharacterSprite | EnemySprite;
    if (ce.kind === "player") {
      sprite = new CharacterSprite(
        this,
        0,
        0,
        this.resolveAppearance(ce.id, ce.sprite, ce.weapon, ce.appearance),
      );
    } else {
      sprite = new EnemySprite(this, 0, 0, enemyKindFromName(ce.name, ce.sprite));
    }
    wrapper.add([entityShadow(this), sprite.container]);
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

  /** Faint melee reach circle under self while fighting or targeting. */
  private updateMeleeRing(state: ReturnType<typeof useGame.getState>) {
    const selfId = state.selfId;
    const selfAv = selfId ? this.avatars.get(selfId) : undefined;
    const selfE = selfId ? state.entities[selfId] : undefined;
    const fighting =
      !!(selfId && state.combatIds[selfId]) ||
      !!selfE?.engaged ||
      !!selfE?.target_id ||
      !!state.selectedAction;
    if (selfAv && fighting) {
      if (!this.meleeRing) {
        this.meleeRing = this.add
          .circle(0, 0, MELEE_RANGE)
          .setDepth(9)
          .setStrokeStyle(1.5, 0x8fd0ff, 0.3);
      }
      this.meleeRing.setVisible(true);
      this.meleeRing.setPosition(selfAv.wrapper.x, selfAv.wrapper.y);
    } else {
      this.meleeRing?.setVisible(false);
    }
  }

  /** Sweeping ring under self that refills over the dodge cooldown. */
  private updateDodgeCooldown() {
    const remaining = this.dodgeReadyAt - this.time.now;
    const selfId = useGame.getState().selfId;
    const av = selfId ? this.avatars.get(selfId) : undefined;
    if (remaining <= 0 || !av) {
      if (this.dodgeCdGfx) this.dodgeCdGfx.clear();
      return;
    }
    if (!this.dodgeCdGfx) this.dodgeCdGfx = this.add.graphics().setDepth(11);
    const pct = 1 - remaining / DODGE_COOLDOWN_MS;
    const g = this.dodgeCdGfx;
    g.clear();
    g.setPosition(av.wrapper.x, av.wrapper.y + H99_WORLD_RING_Y);
    g.lineStyle(3, 0x9fb6c9, 0.55);
    g.beginPath();
    g.arc(0, 0, H99_WORLD_RING_RADIUS * 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    g.strokePath();
  }

  /**
   * Dash two squares along the current movement input — works in and out of
   * combat (the dash interrupts a cast). Does nothing standing still so it
   * never wastes stamina without moving the player. The server applies the
   * authoritative cooldown/stamina cost and broadcasts the dodge event.
   */
  private performDodge() {
    const state = useGame.getState();
    const selfId = state.selfId;
    const av = selfId ? this.avatars.get(selfId) : undefined;
    const wp = selfId ? state.entities[selfId] : undefined;
    if (!selfId || !av || !wp || this.dodging || this.jumping.has(selfId)) return;
    if (state.screen !== "world" || wp.in_house) return;
    const selfCe = state.combatIds[selfId] ? wp : undefined;
    if (selfCe && !selfCe.alive) return;
    const { x: dx, y: dy } = this.moveDir;
    if (dx === 0 && dy === 0) return;
    if (this.time.now < this.dodgeReadyAt) return;
    if ((wp.stamina ?? 100) < DODGE_STAMINA_COST) return;
    this.dodgeReadyAt = this.time.now + DODGE_COOLDOWN_MS;
    this.moveEpoch++; // invalidate any pre-dash slide callbacks
    this.clearClickPath(); // the dash overrides click-to-move
    net.dodge();
    const casting = !!selfCe?.casting_skill_id || !!wp.casting_skill_id;
    if (casting) this.clearSelfCastLocal();

    const rawX = Phaser.Math.Clamp(
      av.wrapper.x + dx * DODGE_DIST,
      H99_COLLISION_HALF_W,
      this.worldW - H99_COLLISION_HALF_W,
    );
    const rawY = Phaser.Math.Clamp(
      av.wrapper.y + dy * DODGE_DIST,
      H99_COLLISION_HALF_H,
      this.worldH,
    );
    const ox = av.wrapper.x;
    const oy = av.wrapper.y;
    playDodgeVfx(this, ox, oy - 8, DEFAULT_BATTLE_SPEED);
    this.dodging = true;
    void applyPlayerSlide(state.overworld, ox, oy, rawX, rawY).then((slid) => {
      const cur = this.avatars.get(selfId);
      if (!cur) {
        this.dodging = false;
        return;
      }
      this.tweens.add({
        targets: cur.wrapper,
        x: slid.x,
        y: slid.y,
        duration: battleDuration(130, DEFAULT_BATTLE_SPEED),
        ease: "Power2",
        onComplete: () => {
          this.dodging = false;
          playDodgeVfx(this, cur.wrapper.x, cur.wrapper.y - 8, DEFAULT_BATTLE_SPEED);
          setWorldLocalPos(cur.wrapper.x, cur.wrapper.y);
          // The server applies the authoritative dash on the 'dodge' message,
          // so the client does not need to send a follow-up move.
        },
      });
    });
  }

  /** Locally clear our own cast — the server's cast_cancelled event confirms. */
  private clearSelfCastLocal() {
    const selfId = useGame.getState().selfId;
    if (!selfId) return;
    useGame.setState((s) => {
      const e = s.entities[selfId];
      if (!e?.casting_skill_id) return s;
      return {
        entities: {
          ...s.entities,
          [selfId]: {
            ...e,
            casting_skill_id: undefined,
            cast_target_id: undefined,
            cast_progress: undefined,
            cast_time_ms: undefined,
            cast_ends_at: undefined,
          },
        },
      };
    });
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
      if (ev.attacker_id === useGame.getState().selfId) this.moveEpoch++;
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

  private pendingSlide = Promise.resolve();

  private moveSelf(time: number, selfId: string, overworld: OverworldMap | null) {
    const av = this.avatars.get(selfId);
    const wp = useGame.getState().entities[selfId];
    if (!av || !wp || !overworld) return;
    // The dodge dash tween owns the wrapper until it lands.
    if (this.dodging || this.jumping.has(selfId)) return;

    if (uiOwnsKeyboard()) {
      av.sprite.setMoving(false);
      this.moveDir.x = 0;
      this.moveDir.y = 0;
      return;
    }

    const dt = this.game.loop.delta / 1000;
    let dx = 0;
    let dy = 0;
    if (this.isMoveDown("move_left")) dx -= 1;
    if (this.isMoveDown("move_right")) dx += 1;
    if (this.isMoveDown("move_up")) dy -= 1;
    if (this.isMoveDown("move_down")) dy += 1;

    // Manual input cancels click-to-move; otherwise steer along the path.
    let faceDx: number | null = null;
    if (dx !== 0 || dy !== 0) {
      this.clearClickPath();
    } else if (this.clickPath?.length) {
      // Pop every reached waypoint in the same frame — pausing for one frame
      // drops to idle and restarts the run cycle at every waypoint.
      while (this.clickPath.length) {
        const wp0 = this.clickPath[0];
        const ddx = wp0.x - av.wrapper.x;
        const ddy = wp0.y - av.wrapper.y;
        const dd = Math.hypot(ddx, ddy);
        if (dd > 6) {
          dx = ddx / dd;
          dy = ddy / dd;
          // Facing deadzone: while the waypoint sits nearly overhead, keep
          // the current facing instead of flapping left/right each frame.
          faceDx = Math.abs(ddx) > 10 ? dx : 0;
          break;
        }
        this.clickPath.shift();
      }
      if (!this.clickPath.length) this.clearClickPath();
      // Give up if the slide has kept us stuck against something ~0.6s.
      if ((dx !== 0 || dy !== 0) && time - this.clickStuck.t > 600) {
        if (Math.hypot(av.wrapper.x - this.clickStuck.x, av.wrapper.y - this.clickStuck.y) < 4) {
          this.clearClickPath();
          dx = 0;
          dy = 0;
        } else {
          this.clickStuck = { x: av.wrapper.x, y: av.wrapper.y, t: time };
        }
      }
    }

    // The dodge dash follows the current movement direction.
    const dLen = Math.hypot(dx, dy);
    this.moveDir.x = dLen ? dx / dLen : 0;
    this.moveDir.y = dLen ? dy / dLen : 0;

    if (dx === 0 && dy === 0) {
      av.sprite.setMoving(false);
      if (this.wasMoving) {
        this.sendPosition(time, av.wrapper.x, av.wrapper.y, true);
        this.wasMoving = false;
      }
      return;
    }

    this.wasMoving = true;

    av.sprite.setMoving(true, faceDx ?? dx, dy);
    lastWorldFacing = facingFromDelta(faceDx ?? dx, lastWorldFacing);

    const len = Math.hypot(dx, dy);
    const nx = Phaser.Math.Clamp(
      av.wrapper.x + (dx / len) * SPEED * dt,
      H99_COLLISION_HALF_W,
      this.worldW - H99_COLLISION_HALF_W,
    );
    const ny = Phaser.Math.Clamp(
      av.wrapper.y + (dy / len) * SPEED * dt,
      H99_COLLISION_HALF_H,
      this.worldH,
    );
    const ox = av.wrapper.x;
    const oy = av.wrapper.y;
    // Place optimistically this frame so camera follow + React POIs share one pose.
    // Collision slide (possibly async via Wails) corrects afterward.
    av.wrapper.x = nx;
    av.wrapper.y = ny;
    this.eatPathDots(nx, ny);
    setWorldLocalPos(nx, ny);
    const epoch = this.moveEpoch;
    this.pendingSlide = this.pendingSlide.then(async () => {
      const slid = await applyPlayerSlide(overworld, ox, oy, nx, ny);
      if (!this.avatars.has(selfId)) return;
      // A dodge or jump reset the movement timeline after this slide was
      // scheduled; its result is stale and would snap the player back.
      if (epoch !== this.moveEpoch) return;
      // The dodge dash tween owns the wrapper while it runs.
      if (this.dodging || this.jumping.has(selfId)) return;
      const cur = this.avatars.get(selfId)!;
      cur.wrapper.x = slid.x;
      cur.wrapper.y = slid.y;
      setWorldLocalPos(slid.x, slid.y);
      const moved = Math.hypot(slid.x - ox, slid.y - oy) > 0.5;
      const st = useGame.getState();
      const interruptCast = !!st.entities[selfId]?.casting_skill_id && moved;
      if (interruptCast) this.clearSelfCastLocal();
      this.sendPosition(time, slid.x, slid.y, interruptCast);
    });
  }

  private sendPosition(time: number, x: number, y: number, force: boolean) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (!force && time - this.lastSent <= SEND_INTERVAL) return;
    if (rx === this.lastSentX && ry === this.lastSentY) return;
    net.move(rx, ry);
    this.lastSent = time;
    this.lastSentX = rx;
    this.lastSentY = ry;
  }
}
