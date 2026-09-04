import Phaser from "phaser";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";
import { appearanceKey, facingFromDelta, H99_FACING_DEFAULT, H99_NAME_LABEL_Y, H99_WORLD_RING_RADIUS, H99_WORLD_RING_Y, type CharacterFacing } from "../characters/types";
import { applyPlayerSlide, H99_COLLISION_HALF_H, H99_COLLISION_HALF_W } from "./movementBridge";
import { FILL, tileAt } from "../world/overworld";
import { rasterizeTerrainLayers, terrainLayerKey, terrainLayersFromSnapshot } from "../world/terrainRaster";
import { getLoadedPipoyaSheets, loadPipoyaSheets } from "../world/pipoyaTilesets";
import {
  portalKey,
  terrainInputsChanged,
  type TerrainSyncInputs,
} from "../world/worldTerrainSync";
import type { MapTerrainLayers, OverworldMap, WorldNPC, CharacterAppearanceWire, SavePoint, JobChanger, WorldPlayer, WorldCamp, WorldPet } from "../types";
import { bindingToPhaserKeyCode, mergeKeybinds } from "../input/keybinds";
import { CharacterSprite } from "./CharacterSprite";
import { EnemySprite } from "./EnemySprite";
import { enemyKindFromName } from "../characters/enemies";
import { pushChat } from "../state/store";
import { openJobMasterDialog } from "../world/npcDialogue";
import {
  JOB_CHANGER_RANGE,
  SAVE_POINT_RANGE,
  INTERACT_RANGE,
  battleJoinable,
  canShowWorldInteractPrompts,
  interactKeyLabel,
} from "../world/interact";
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
const AVATAR_INTERACT_PROMPT_Y = H99_NAME_LABEL_Y - 16;
const CAST_BAR_Y = 10;
const POI_LABEL_Y = 18;
const CAMP_LABEL_Y = 22;

/** Survives Phaser remounts when crossing maps that switch combat plugins. */
let lastWorldFacing: CharacterFacing = H99_FACING_DEFAULT;

function facingOf(wp: Pick<WorldPlayer, "facing">, fallback: CharacterFacing): CharacterFacing {
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
  private pets = new Map<string, { wrapper: Phaser.GameObjects.Container; body: Phaser.GameObjects.Ellipse; label: Phaser.GameObjects.Text }>();
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
  private worldW = 5120;
  private worldH = 3840;
  private lastMapId = "";

  constructor() {
    super("world");
  }

  create() {
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.terrainUnsub?.();
      this.terrainUnsub = undefined;
      clearEntityOverlays();
    });
    this.events.on(Phaser.Scenes.Events.SLEEP, () => {
      clearEntityOverlays();
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
    if (sig === this.moveKeysSig) return;
    this.moveKeysSig = sig;
    const kb = this.input.keyboard!;
    if (!kb) return;
    const bindKey = (action: "move_up" | "move_down" | "move_left" | "move_right") => {
      const code = bindingToPhaserKeyCode(binds[action] ?? "");
      this.moveKeys[action] = code != null ? kb.addKey(code) : undefined;
    };
    bindKey("move_up");
    bindKey("move_down");
    bindKey("move_left");
    bindKey("move_right");
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
      this.renderConfigTerrain(layerData, portals);
      return;
    }

    this.clearTerrain();
    this.drawAsciiTerrain(map, portals);
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
    wrapper.add([ring, sprite.container]);

    if (id !== useGame.getState().selfId) {
      sprite.setInteractive(() => this.tryJoinBattleOf(id));
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
    hit.on("pointerdown", () => this.trySetSavePoint(sp));

    marker = { wrapper, hit, active, name: sp.name };
    this.savePoints.set(sp.id, marker);
    return marker;
  }

  private trySetSavePoint(sp: SavePoint) {
    const state = useGame.getState();
    const selfId = state.selfId;
    const self = selfId ? state.players[selfId] : undefined;
    if (!selfId || !self || self.in_battle) return;
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
    hit.on("pointerdown", () => this.tryOpenJobChanger(jc));

    marker = { wrapper, hit, name: jc.name };
    this.jobChangers.set(jc.id, marker);
    return marker;
  }

  private tryOpenJobChanger(jc: JobChanger) {
    const state = useGame.getState();
    const selfId = state.selfId;
    const self = selfId ? state.players[selfId] : undefined;
    if (!selfId || !self || self.in_battle) return;
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

  private syncPets(pets: Record<string, WorldPet>, players: Record<string, WorldPlayer>) {
    for (const [id, marker] of this.pets) {
      if (!pets[id]) {
        marker.wrapper.destroy();
        this.pets.delete(id);
      }
    }
    for (const pet of Object.values(pets)) {
      const owner = players[pet.owner_id];
      let x = pet.x;
      let y = pet.y;
      if (owner && !owner.in_house && !owner.in_battle) {
        const av = this.avatars.get(owner.id);
        const ox = av?.wrapper.x ?? owner.x;
        const oy = av?.wrapper.y ?? owner.y;
        const facing = owner.facing ?? pet.facing ?? "right";
        const dx = facing === "left" ? 20 : -20;
        x = ox + dx;
        y = oy + 6;
      }
      let marker = this.pets.get(pet.id);
      if (!marker) {
        const wrapper = this.add.container(x, y).setDepth(8);
        const body = this.add.ellipse(0, -6, 18, 14, 0xc4a06a).setStrokeStyle(1, 0xf0d090);
        const label = this.add
          .text(0, -22, pet.name.slice(0, 10), {
            fontFamily: "Georgia, serif",
            fontSize: "10px",
            color: "#e8dcc8",
            stroke: "#1a1410",
            strokeThickness: 2,
          })
          .setOrigin(0.5, 1);
        wrapper.add([body, label]);
        marker = { wrapper, body, label };
        this.pets.set(pet.id, marker);
      } else {
        marker.wrapper.setPosition(x, y);
        marker.label.setText(pet.name.slice(0, 10));
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
    hit.on("pointerdown", () => this.tryEnterCamp(camp));
    marker = { wrapper, hit, glow, tent, ownerName: camp.owner_name, skin };
    this.camps.set(camp.owner_name, marker);
    return marker;
  }

  private tryEnterCamp(camp: WorldCamp) {
    const state = useGame.getState();
    const selfId = state.selfId;
    const self = selfId ? state.players[selfId] : undefined;
    if (!selfId || !self || self.in_battle || self.in_house) return;
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

  private ensureFoe(npc: WorldNPC): FoeAvatar {
    let av = this.foes.get(npc.id);
    if (av) return av;
    const kind = enemyKindFromName(npc.name, npc.kind);
    const wrapper = this.add.container(npc.x, npc.y).setDepth(9);
    const enemy = new EnemySprite(this, 0, 0, kind);
    wrapper.add([enemy.container]);
    enemy.setInteractive(() => this.tryJoinBattleOfNPC(npc.id));
    av = { wrapper, enemy, lastX: npc.x, lastY: npc.y };
    this.foes.set(npc.id, av);
    return av;
  }

  private tryJoinBattleOfNPC(id: string) {
    const state = useGame.getState();
    const npc = state.npcs[id];
    const selfWp = state.selfId ? state.players[state.selfId] : undefined;
    if (!npc?.in_battle || !npc.battle_id || selfWp?.in_battle || selfWp?.in_house) return;
    const info = state.battles.find((b) => b.battle_id === npc.battle_id);
    if (info && info.participants >= info.max_players) return;
    net.joinBattle(npc.battle_id);
  }

  private tryJoinBattleOf(id: string) {
    const state = useGame.getState();
    if (id === state.selfId) return;
    const target = state.players[id];
    const selfWp = state.selfId ? state.players[state.selfId] : undefined;
    if (!target?.in_battle || !target.battle_id || target.in_house || selfWp?.in_battle || selfWp?.in_house) return;
    const info = state.battles.find((b) => b.battle_id === target.battle_id);
    if (info && info.participants >= info.max_players) return;
    net.joinBattle(target.battle_id);
  }

  private isNearCamera(x: number, y: number, pad = 256): boolean {
    const view = this.cameras.main.worldView;
    return x >= view.x - pad && x <= view.right + pad && y >= view.y - pad && y <= view.bottom + pad;
  }

  private castProgress(wp: WorldPlayer): number | undefined {
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
  ): EntityOverlayMark {
    const feet = worldToStagePoint(this, worldX, worldY, transform);
    const nameOff = localOffsetToStage(0, H99_NAME_LABEL_Y, transform);
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
      if (!state.players[id]) {
        av.wrapper.destroy();
        this.avatars.delete(id);
        if (id === selfId) this.selfSpawned = false;
      }
    }

    const selfLocked = state.players[selfId]?.in_battle ?? false;
    const activeSave = state.profile?.save_point_id;
    this.syncSavePoints(state.savePoints, activeSave);
    this.syncJobChangers(state.jobChangers);
    this.syncCamps(state.camps);
    this.syncPets(state.pets, state.players);

    const overlayMarks: EntityOverlayMark[] = [];
    const stageXf = getStageTransform(this);

    for (const wp of Object.values(state.players)) {
      // Inside a house: gone from the overworld (no sprite, no join/interact).
      if (wp.in_house) {
        const gone = this.avatars.get(wp.id);
        if (gone) {
          gone.wrapper.destroy();
          this.avatars.delete(wp.id);
          if (wp.id === selfId) this.selfSpawned = false;
        }
        continue;
      }
      const av = this.ensureAvatar(wp.id, wp.race, wp.weapon, wp.appearance);
      const locked = wp.in_battle;
      const immune = !locked && (wp.immune_until ?? 0) > Date.now();
      av.wrapper.setAlpha(locked ? 0.45 : 1);
      const joinable = locked && wp.id !== selfId && !selfLocked;
      if (av.ring) {
        av.ring.setVisible(joinable || immune);
        if (joinable) av.ring.setFillStyle(0xffe9a8, 0.25);
        else if (immune) {
          const pulse = 0.15 + 0.15 * Math.sin(this.time.now / 180);
          av.ring.setFillStyle(0xb4dcff, pulse);
        }
      }

      const isSelf = wp.id === selfId;
      const inView = isSelf || this.isNearCamera(av.wrapper.x, av.wrapper.y);
      if (!isSelf && inView) {
        if (Math.hypot(av.wrapper.x - wp.x, av.wrapper.y - wp.y) > 80) {
          av.wrapper.setPosition(wp.x, wp.y);
          av.sprite.setMoving(false);
          av.sprite.setFacing(facingOf(wp, av.sprite.getFacing()));
        } else {
          const prevX = av.wrapper.x;
          const prevY = av.wrapper.y;
          av.wrapper.x = Phaser.Math.Linear(av.wrapper.x, wp.x, 0.25);
          av.wrapper.y = Phaser.Math.Linear(av.wrapper.y, wp.y, 0.25);
          const dx = av.wrapper.x - prevX;
          const dy = av.wrapper.y - prevY;
          av.sprite.setMoving(Math.hypot(dx, dy) > 0.3, dx, dy);
        }
      } else if (!isSelf) {
        av.wrapper.setPosition(wp.x, wp.y);
        av.sprite.setMoving(false);
        av.sprite.setFacing(facingOf(wp, av.sprite.getFacing()));
      }

      if (inView || isSelf) av.sprite.update(delta);

      const casting = !!wp.casting_skill_id && (wp.cast_time_ms ?? 0) > 0;
      av.sprite.setCasting(casting);

      if (isSelf) {
        if (!this.selfSpawned) {
          av.wrapper.setPosition(wp.x, wp.y);
          lastWorldFacing = facingOf(wp, lastWorldFacing);
          av.sprite.setFacing(lastWorldFacing);
          this.cameras.main.startFollow(av.wrapper, true, 0.15, 0.15);
          this.selfSpawned = true;
        } else if (!locked && Math.hypot(av.wrapper.x - wp.x, av.wrapper.y - wp.y) > 80) {
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
            `${wp.name} Lv${wp.level}${locked ? " ⚔" : ""}${joinable ? " (join)" : ""}${immune ? " 🛡" : ""}`,
            isSelf ? "self" : "player",
            av.wrapper.x,
            av.wrapper.y,
            this.castProgress(wp),
            stageXf,
          ),
        );
      }
    }

    this.syncFoes(state.npcs, selfLocked, delta, overlayMarks, stageXf);
    this.moveSelf(time, selfId, state.overworld);

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
          stageXf,
        ),
      );
    }
    for (const [id, marker] of this.jobChangers) {
      if (!this.isNearCamera(marker.wrapper.x, marker.wrapper.y)) continue;
      pois.push(
        this.poiLabel(`job:${id}`, marker.name, "job", marker.wrapper.x, marker.wrapper.y, POI_LABEL_Y, stageXf),
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
          stageXf,
        ),
      );
    }

    const interacts = this.collectInteractPrompts(state, selfId, selfLocked, stageXf);
    this.publishOverlays(overlayMarks, pois, interacts);
  }

  private collectInteractPrompts(
    state: ReturnType<typeof useGame.getState>,
    selfId: string,
    selfLocked: boolean,
    transform: StageTransform,
  ): InteractPromptMark[] {
    const showPrompts = canShowWorldInteractPrompts(state);
    if (!showPrompts) return [];
    const keyLabel = interactKeyLabel(state.profile?.keybinds);
    const selfAv = this.avatars.get(selfId);
    const self = state.players[selfId];
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
    for (const [id, av] of this.foes) {
      const npc = state.npcs[id];
      if (!npc?.in_battle || !npc.battle_id || !battleJoinable(state, npc.battle_id)) continue;
      maybe(`ix-npc:${id}`, av.wrapper.x, av.wrapper.y, INTERACT_RANGE, AVATAR_INTERACT_PROMPT_Y);
    }
    for (const [id, av] of this.avatars) {
      if (id === selfId || selfLocked) continue;
      const wp = state.players[id];
      if (!wp?.in_battle || !wp.battle_id || !battleJoinable(state, wp.battle_id)) continue;
      maybe(`ix-player:${id}`, av.wrapper.x, av.wrapper.y, INTERACT_RANGE, AVATAR_INTERACT_PROMPT_Y);
    }
    return out;
  }

  private syncFoes(
    npcs: Record<string, WorldNPC>,
    selfLocked: boolean,
    delta: number,
    overlayMarks: EntityOverlayMark[],
    stageXf = getStageTransform(this),
  ) {
    for (const [id, av] of this.foes) {
      if (!npcs[id]) {
        av.wrapper.destroy();
        this.foes.delete(id);
      }
    }
    for (const npc of Object.values(npcs)) {
      const av = this.ensureFoe(npc);
      const kind = enemyKindFromName(npc.name, npc.kind);
      av.enemy.setKind(kind);
      av.wrapper.setAlpha(npc.in_battle ? 0.45 : 1);
      const joinable = npc.in_battle && !selfLocked;
      const inView = this.isNearCamera(av.wrapper.x, av.wrapper.y);
      const prevX = av.lastX;
      const prevY = av.lastY;
      if (inView) {
        av.wrapper.x = Phaser.Math.Linear(av.wrapper.x, npc.x, 0.2);
        av.wrapper.y = Phaser.Math.Linear(av.wrapper.y, npc.y, 0.2);
        const dx = av.wrapper.x - prevX;
        const dy = av.wrapper.y - prevY;
        av.enemy.setMoving(Math.hypot(dx, dy) > 0.3, dx, dy);
      } else {
        av.wrapper.setPosition(npc.x, npc.y);
        av.enemy.setMoving(false);
      }
      if (inView) {
        av.enemy.update(delta);
        overlayMarks.push(
          this.stageMark(
            npc.id,
            `${npc.name} Lv${npc.level}${npc.in_battle ? " ⚔" : ""}${joinable ? " (join)" : ""}`,
            "enemy",
            av.wrapper.x,
            av.wrapper.y,
            undefined,
            stageXf,
          ),
        );
      }
      av.lastX = av.wrapper.x;
      av.lastY = av.wrapper.y;
    }
  }

  private pendingSlide = Promise.resolve();

  private moveSelf(time: number, selfId: string, overworld: OverworldMap | null) {
    const av = this.avatars.get(selfId);
    const wp = useGame.getState().players[selfId];
    if (!av || !wp || wp.in_battle || !overworld) return;

    const active = document.activeElement?.tagName;
    if (active === "INPUT" || active === "TEXTAREA") {
      av.sprite.setMoving(false);
      return;
    }

    const dt = this.game.loop.delta / 1000;
    let dx = 0;
    let dy = 0;
    if (this.isMoveDown("move_left")) dx -= 1;
    if (this.isMoveDown("move_right")) dx += 1;
    if (this.isMoveDown("move_up")) dy -= 1;
    if (this.isMoveDown("move_down")) dy += 1;

    if (dx === 0 && dy === 0) {
      av.sprite.setMoving(false);
      if (this.wasMoving) {
        this.sendPosition(time, av.wrapper.x, av.wrapper.y, true);
        this.wasMoving = false;
      }
      return;
    }

    this.wasMoving = true;

    av.sprite.setMoving(true, dx, dy);
    lastWorldFacing = facingFromDelta(dx, lastWorldFacing);

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
    this.pendingSlide = this.pendingSlide.then(async () => {
      const slid = await applyPlayerSlide(overworld, ox, oy, nx, ny);
      if (!this.avatars.has(selfId)) return;
      const cur = this.avatars.get(selfId)!;
      cur.wrapper.x = slid.x;
      cur.wrapper.y = slid.y;
      setWorldLocalPos(slid.x, slid.y);
      const moved = Math.hypot(slid.x - ox, slid.y - oy) > 0.5;
      const wpNow = useGame.getState().players[selfId];
      const interruptCast = !!wpNow?.casting_skill_id && moved;
      if (interruptCast) {
        useGame.setState((s) => {
          const curWp = s.players[selfId];
          if (!curWp?.casting_skill_id) return s;
          return {
            players: {
              ...s.players,
              [selfId]: { ...curWp, casting_skill_id: undefined, cast_time_ms: undefined, cast_ends_at: undefined },
            },
          };
        });
      }
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
