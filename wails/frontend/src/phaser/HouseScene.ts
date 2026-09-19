import Phaser from "phaser";
import { net } from "../net/socket";
import { uiOwnsKeyboard, useGame } from "../state/store";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";
import {
  appearanceKey,
  facingFromYaw,
  H99_NAME_LABEL_Y,
  type CharacterFacing,
} from "../characters/types";
import { bindingToPhaserKeyCode, mergeKeybinds } from "../input/keybinds";
import type { HouseFurniture, HousePet, HousePlayer, HousePOI, HouseStatePayload } from "../types";
import { enemyKindFromName, type EnemyKind } from "../characters/enemies";
import { CharacterSprite } from "./CharacterSprite";
import { EnemySprite } from "./EnemySprite";
import { entityShadow } from "./entityShadow";
import { trackContentZoom } from "./contentZoom";
import { INTERACT_RANGE, interactKeyLabel } from "../world/interact";
import {
  clearHousePlace,
  getHousePlaceState,
  setHouseClientToWorld,
  setHousePlaceTransform,
  stagePointToWorld,
} from "../world/housePlaceBridge";
import { houseWalkable, slideMoveHousePlayer } from "../world/houseMovement";
import {
  ISO_LAYER_SCALE,
  ISO_ROT,
  ISO_SQUASH_Y,
  applyIsoCounter,
  isoDepth,
  isoLayer,
  isoParent,
  isoProject,
  screenDirToWorldGrid,
  screenToWorldX,
  screenToWorldY,
  setIsoLayer,
} from "../world/iso";
import { ISO_ACTOR_DEPTH_EPS } from "./systems/actorVisuals";
import { CollisionGizmo, type CollisionGizmoEntry } from "./systems/collisionGizmo";
import { campSkinById } from "../housing/campSkins";
import {
  clearEntityOverlays,
  getStageTransform,
  setWorldOverlays,
  worldLocalToStage,
  worldToStagePoint,
  type EntityOverlayMark,
  type InteractPromptMark,
  type PoiLabelMark,
  type StageTransform,
} from "../world/entityOverlayBridge";

const SPEED = 180;
const SEND_INTERVAL = 80;
const POI_PROMPT_Y = -28;
const POI_LABEL_Y = -28;
const FURNITURE_LABEL_Y = -16;
const CAST_BAR_Y = 10;
/** House pets draw at the same reduced scale as field follow pets. */
const PET_SCALE = 0.55;
const PET_LERP = 0.3;
const PET_SNAP_DIST = 64;

interface HouseAvatar {
  wrapper: Phaser.GameObjects.Container;
  sprite: CharacterSprite;
  appearanceKey: string;
}

interface HousePetMarker {
  wrapper: Phaser.GameObjects.Container;
  enemy: EnemySprite;
  kind: EnemyKind;
}

interface PoiMarker {
  id: string;
  kind: string;
  name: string;
  wrapper: Phaser.GameObjects.Container;
  x: number;
  y: number;
}

interface FurnitureMarker {
  id: string;
  name: string;
  wrapper: Phaser.GameObjects.Container;
  x: number;
  y: number;
}

export class HouseScene extends Phaser.Scene {
  /** Iso world layer — same squash→rotate chain as WorldScene. */
  private worldLayer?: Phaser.GameObjects.Container;
  private floor?: Phaser.GameObjects.Graphics;
  private placeGhost?: Phaser.GameObjects.Graphics;
  private avatars = new Map<string, HouseAvatar>();
  private pets = new Map<string, HousePetMarker>();
  private furniture = new Map<string, FurnitureMarker>();
  private pois = new Map<string, PoiMarker>();
  private moveKeys: Partial<Record<"move_up" | "move_down" | "move_left" | "move_right", Phaser.Input.Keyboard.Key>> =
    {};
  private moveKeysSig = "";
  private sendAcc = 0;
  private lastSentX = 0;
  private lastSentY = 0;
  private layoutKey = "";
  /** Debug gizmo: entity collision bounds (options.showCollisionBounds / F3). */
  private collisionGizmo = new CollisionGizmo(this);

  constructor() {
    super("house");
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1a1410);
    trackContentZoom(this);
    // Iso world layer — children keep world coords; the chain projects
    // screen = (x−y, (x+y)/2), matching WorldScene.
    const squash = this.add.container(0, 0).setScale(1, ISO_SQUASH_Y).setDepth(0);
    const rotate = this.add.container(0, 0).setRotation(ISO_ROT).setScale(ISO_LAYER_SCALE);
    squash.add(rotate);
    this.worldLayer = rotate;
    setIsoLayer(this, rotate);
    // Scene instances are reused across stop/start; stale Key refs won't receive input.
    this.moveKeys = {};
    this.moveKeysSig = "";
    this.sendAcc = 0;
    this.lastSentX = 0;
    this.lastSentY = 0;
    this.syncMoveKeys();
    this.input.keyboard?.disableGlobalCapture();
    this.placeGhost = this.add.graphics().setDepth(1e5);
    isoParent(this, this.placeGhost); // tile decal — squash into the plane
    // Pointer → world for furniture placement: browser client px → stage →
    // camera space, then unproject the iso screen point into world coords.
    setHouseClientToWorld((clientX, clientY) => {
      const stage = this.game.canvas.parentElement?.parentElement;
      const rect = stage?.getBoundingClientRect();
      if (!rect) return null;
      const w = stagePointToWorld(clientX - rect.left, clientY - rect.top);
      if (!w) return null;
      return { x: screenToWorldX(w.x, w.y), y: screenToWorldY(w.x, w.y) };
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      setHouseClientToWorld(null);
      this.clearAll();
    });
    this.events.off(Phaser.Scenes.Events.SLEEP, this.clearAll, this);
    this.events.on(Phaser.Scenes.Events.SLEEP, this.clearAll, this);
  }

  private clearAll() {
    this.floor?.destroy();
    this.floor = undefined;
    this.placeGhost?.destroy();
    this.placeGhost = undefined;
    for (const av of this.avatars.values()) av.wrapper.destroy();
    this.avatars.clear();
    for (const p of this.pets.values()) p.wrapper.destroy();
    this.pets.clear();
    for (const f of this.furniture.values()) f.wrapper.destroy();
    this.furniture.clear();
    for (const p of this.pois.values()) p.wrapper.destroy();
    this.pois.clear();
    this.layoutKey = "";
    this.moveKeys = {};
    this.moveKeysSig = "";
    this.collisionGizmo.destroy();
    clearHousePlace();
    clearEntityOverlays();
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

  private drawLayout(house: HouseStatePayload) {
    const key = [
      house.owner_name,
      house.walk_origin_col,
      house.walk_origin_row,
      house.walk_cols,
      house.walk_rows,
      house.tile_size,
      house.skin,
    ].join(":");
    if (key === this.layoutKey && this.floor) return;
    this.layoutKey = key;
    this.floor?.destroy();

    const t = house.tile_size;
    const ox = house.walk_origin_col * t;
    const oy = house.walk_origin_row * t;
    const w = house.walk_cols * t;
    const h = house.walk_rows * t;

    const pal = campSkinById(house.skin);
    const g = this.add.graphics().setDepth(-20);
    isoParent(this, g); // ground decal — squash into the tile plane
    // Dark surround must be large enough to fill the viewport at any camera
    // position (no bounds). 2000px padding covers the 960×600 design viewport
    // at max zoom-out plus comfortable margin.
    const pad = 2000;
    g.fillStyle(0x0c0a08, 1);
    g.fillRect(ox - pad, oy - pad, w + pad * 2, h + pad * 2);
    g.fillStyle(0x3a2e22, 1);
    g.fillRect(ox, oy, w, h);
    g.fillStyle(0x4a3a2c, 0.35);
    for (let r = 0; r < house.walk_rows; r++) {
      for (let c = 0; c < house.walk_cols; c++) {
        if ((c + r) % 2 === 0) g.fillRect(ox + c * t, oy + r * t, t, t);
      }
    }
    g.fillStyle(pal.interior, 0.55);
    g.fillRoundedRect(ox + w * 0.25, oy + h * 0.28, w * 0.5, h * 0.36, 8);
    g.lineStyle(3, 0x8a7058, 0.9);
    g.strokeRect(ox + 1, oy + 1, w - 2, h - 2);
    g.fillStyle(pal.outer, 0.45);
    g.fillTriangle(ox, oy, ox + w, oy, ox + w / 2, oy - 48);

    this.floor = g;
    // Gizmo grid: the walkable island plus a one-cell blocked ring — the
    // house has no interior walls; everything off the island is unwalkable.
    const gc0 = house.walk_origin_col - 1;
    const gr0 = house.walk_origin_row - 1;
    const gcols = house.walk_cols + 2;
    const grows = house.walk_rows + 2;
    const blocked = new Uint8Array(gcols * grows);
    for (let r = 0; r < grows; r++) {
      for (let c = 0; c < gcols; c++) {
        blocked[r * gcols + c] = houseWalkable(house, gc0 + c, gr0 + r) ? 0 : 1;
      }
    }
    this.collisionGizmo.setGrid({
      blocked,
      cols: gcols,
      rows: grows,
      tileSize: t,
      originX: gc0 * t,
      originY: gr0 * t,
    });
    // No camera bounds — the camp is small, so let the camera freely center
    // on the player even when they're near the room edges.
    this.cameras.main.removeBounds();
  }

  private ensureAvatar(p: HousePlayer): HouseAvatar {
    const state = useGame.getState();
    const wp = state.entities[p.id];
    const appearance = resolveCharacterAppearance({
      playerId: p.id,
      selfId: state.selfId,
      profile: state.profile,
      race: wp?.sprite,
      weapon: wp?.weapon,
      wire: wp?.appearance,
    });
    const appKey = appearanceKey(appearance);
    let av = this.avatars.get(p.id);
    if (av) {
      if (av.appearanceKey !== appKey) {
        av.sprite.setAppearance(appearance);
        av.appearanceKey = appKey;
      }
      return av;
    }
    const wrapper = this.add.container(p.x, p.y).setDepth(10);
    if (isoParent(this, wrapper)) {
      applyIsoCounter(wrapper);
      wrapper.setDepth(isoDepth(p.x, p.y) + ISO_ACTOR_DEPTH_EPS);
    }
    const shadow = entityShadow(this);
    if (isoLayer(this)) shadow.setScale(1, 0.45);
    const sprite = new CharacterSprite(this, 0, 0, appearance);
    wrapper.add([shadow, sprite.container]);
    av = { wrapper, sprite, appearanceKey: appKey };
    this.avatars.set(p.id, av);
    return av;
  }

  private syncFurniture(list: HouseFurniture[], tileSize: number) {
    const keep = new Set(list.map((f) => f.id));
    for (const [id, node] of this.furniture) {
      if (!keep.has(id)) {
        node.wrapper.destroy();
        this.furniture.delete(id);
      }
    }
    const pickMode = getHousePlaceState().pickMode;
    for (const f of list) {
      let node = this.furniture.get(f.id);
      const x = (f.col + 0.5) * tileSize;
      const y = (f.row + 0.5) * tileSize;
      if (!node) {
        const wrapper = this.add.container(x, y).setDepth(6);
        if (isoParent(this, wrapper)) {
          applyIsoCounter(wrapper);
          wrapper.setDepth(isoDepth(x, y));
        }
        const box = this.add
          .rectangle(0, 0, 22, 18, 0x7a5a3a)
          .setStrokeStyle(1, 0xd4b890)
          .setInteractive({ useHandCursor: true });
        box.on("pointerdown", () => {
          if (!getHousePlaceState().pickMode) return;
          if (!useGame.getState().house?.is_owner) return;
          net.housePickFurniture(f.id);
        });
        wrapper.add([box]);
        node = { id: f.id, name: f.item.name.slice(0, 10), wrapper, x, y };
        this.furniture.set(f.id, node);
      } else {
        node.wrapper.setPosition(x, y);
        node.x = x;
        node.y = y;
        node.name = f.item.name.slice(0, 10);
        if (isoLayer(this)) node.wrapper.setDepth(isoDepth(x, y));
      }
      node.wrapper.setAlpha(pickMode ? 0.95 : 1);
      const box = node.wrapper.list[0] as Phaser.GameObjects.Rectangle | undefined;
      if (box?.setStrokeStyle) {
        box.setStrokeStyle(pickMode ? 2 : 1, pickMode ? 0xf0d878 : 0xd4b890);
      }
    }
  }

  private syncPlaceGhost(house: HouseStatePayload) {
    const g = this.placeGhost;
    if (!g) return;
    g.clear();
    const place = getHousePlaceState();
    if (!place.hover) return;
    const t = house.tile_size;
    const x = place.hover.col * t;
    const y = place.hover.row * t;
    const ok = place.hover.valid;
    g.fillStyle(ok ? 0x7ecf6a : 0xe06060, ok ? 0.35 : 0.28);
    g.fillRect(x, y, t, t);
    g.lineStyle(2, ok ? 0xd8f5c8 : 0xffb0b0, 0.95);
    g.strokeRect(x + 1, y + 1, t - 2, t - 2);
    g.fillStyle(ok ? 0xc4a06a : 0x8a5050, 0.55);
    g.fillRect(x + 6, y + 8, t - 12, t - 14);
  }

  private publishPlaceTransform(house: HouseStatePayload) {
    const xf = getStageTransform(this);
    setHousePlaceTransform({
      ...xf,
      tileSize: house.tile_size,
      walkOriginCol: house.walk_origin_col,
      walkOriginRow: house.walk_origin_row,
      walkCols: house.walk_cols,
      walkRows: house.walk_rows,
    });
  }

  private syncPois(list: HousePOI[]) {
    const keep = new Set(list.map((p) => p.id));
    for (const [id, m] of this.pois) {
      if (!keep.has(id)) {
        m.wrapper.destroy();
        this.pois.delete(id);
      }
    }
    for (const poi of list) {
      let m = this.pois.get(poi.id);
      if (!m) {
        const wrapper = this.add.container(poi.x, poi.y).setDepth(5);
        if (isoParent(this, wrapper)) {
          applyIsoCounter(wrapper);
          wrapper.setDepth(isoDepth(poi.x, poi.y));
        }
        const isDoor = poi.kind === "door";
        const glow = this.add.circle(0, 0, 18, isDoor ? 0x6a9ad4 : 0xd4a05a, 0.35);
        const body = this.add.rectangle(0, 4, isDoor ? 20 : 22, isDoor ? 28 : 16, isDoor ? 0x4a6038 : 0x8a6030);
        body.setStrokeStyle(2, isDoor ? 0xb8d8a8 : 0xf0d090);
        wrapper.add([glow, body]);
        m = { id: poi.id, kind: poi.kind, name: poi.name, wrapper, x: poi.x, y: poi.y };
        this.pois.set(poi.id, m);
      } else {
        m.wrapper.setPosition(poi.x, poi.y);
        m.x = poi.x;
        m.y = poi.y;
        m.name = poi.name;
        if (isoLayer(this)) m.wrapper.setDepth(isoDepth(poi.x, poi.y));
      }
    }
  }

  /** Sync guest pets that followed their owners inside; returns nameplate stubs. */
  private syncPets(house: HouseStatePayload, delta: number): { id: string; label: string }[] {
    const seen = new Set<string>();
    const marks: { id: string; label: string }[] = [];
    for (const p of house.players) {
      for (const pet of p.pets ?? []) {
        seen.add(pet.id);
        marks.push(...this.syncPet(pet, delta));
      }
    }
    for (const [id, m] of this.pets) {
      if (!seen.has(id)) {
        m.wrapper.destroy();
        this.pets.delete(id);
      }
    }
    return marks;
  }

  private syncPet(pet: HousePet, delta: number): { id: string; label: string }[] {
    const kind = enemyKindFromName(pet.name, pet.sprite);
    let marker = this.pets.get(pet.id);
    if (!marker) {
      const wrapper = this.add.container(pet.x, pet.y).setDepth(9);
      if (isoParent(this, wrapper)) {
        applyIsoCounter(wrapper);
        wrapper.setDepth(isoDepth(pet.x, pet.y) + ISO_ACTOR_DEPTH_EPS);
      }
      const enemy = new EnemySprite(this, 0, 0, kind);
      enemy.container.setScale(PET_SCALE);
      const shadow = entityShadow(this, PET_SCALE);
      if (isoLayer(this)) shadow.setScale(PET_SCALE, PET_SCALE * 0.45);
      wrapper.add([shadow, enemy.container]);
      marker = { wrapper, enemy, kind };
      this.pets.set(pet.id, marker);
      return [{ id: pet.id, label: pet.name }];
    }
    if (marker.kind !== kind) {
      marker.enemy.setKind(kind);
      marker.kind = kind;
    }
    const prevX = marker.wrapper.x;
    const prevY = marker.wrapper.y;
    if (Math.hypot(prevX - pet.x, prevY - pet.y) > PET_SNAP_DIST) {
      marker.wrapper.setPosition(pet.x, pet.y);
      marker.enemy.setMoving(false);
      if (typeof pet.facing === "number") {
        marker.enemy.setFacing(facingFromYaw(pet.facing, marker.enemy.getFacing(), true));
      }
    } else {
      marker.wrapper.x = Phaser.Math.Linear(prevX, pet.x, PET_LERP);
      marker.wrapper.y = Phaser.Math.Linear(prevY, pet.y, PET_LERP);
      const mdx = marker.wrapper.x - prevX;
      const mdy = marker.wrapper.y - prevY;
      // Iso facing axis: screen x = mdx − mdy.
      marker.enemy.setMoving(Math.hypot(mdx, mdy) > 0.25, mdx - mdy, mdy);
    }
    marker.wrapper.setDepth(isoDepth(marker.wrapper.x, marker.wrapper.y) + ISO_ACTOR_DEPTH_EPS);
    marker.enemy.update(delta);
    return [{ id: pet.id, label: pet.name }];
  }

  private facingOf(p: HousePlayer, fallback: CharacterFacing): CharacterFacing {
    const f = p.facing;
    if (f === "left" || f === "right") return f;
    // House renders isometrically — yaw converts on the screen-x axis.
    if (typeof f === "number") return facingFromYaw(f, fallback, true);
    return fallback;
  }

  private stageEntity(
    id: string,
    label: string,
    variant: EntityOverlayMark["variant"],
    worldX: number,
    worldY: number,
    transform: StageTransform,
    nameLocalY = H99_NAME_LABEL_Y,
  ): EntityOverlayMark {
    // Overlays anchor at the projected (screen-space) position.
    const p = isoProject(this, worldX, worldY);
    const feet = worldToStagePoint(this, p.x, p.y, transform);
    const name = worldLocalToStage(this, p.x, p.y, 0, nameLocalY, transform);
    const cast = worldLocalToStage(this, p.x, p.y, 0, CAST_BAR_Y, transform);
    return {
      id,
      label,
      variant,
      screenX: feet.x,
      screenY: feet.y,
      nameX: name.x,
      nameY: name.y,
      castX: cast.x,
      castY: cast.y,
    };
  }

  update(_time: number, delta: number) {
    const state = useGame.getState();
    if (state.screen !== "house" || !state.house) {
      clearEntityOverlays();
      clearHousePlace();
      return;
    }
    this.syncMoveKeys();
    const house = state.house;
    this.drawLayout(house);
    this.syncFurniture(house.furniture ?? [], house.tile_size);
    this.syncPois(house.pois ?? []);
    this.publishPlaceTransform(house);
    this.syncPlaceGhost(house);

    const selfId = state.selfId;
    const seen = new Set<string>();
    const entities: EntityOverlayMark[] = [];
    const pois: PoiLabelMark[] = [];
    const interacts: InteractPromptMark[] = [];

    for (const p of house.players) {
      seen.add(p.id);
      const av = this.ensureAvatar(p);
      const isSelf = p.id === selfId;
      if (!isSelf) {
        const prevX = av.wrapper.x;
        const prevY = av.wrapper.y;
        av.wrapper.x = Phaser.Math.Linear(av.wrapper.x, p.x, 0.3);
        av.wrapper.y = Phaser.Math.Linear(av.wrapper.y, p.y, 0.3);
        const dx = av.wrapper.x - prevX;
        const dy = av.wrapper.y - prevY;
        // Iso facing axis: screen x = dx − dy.
        av.sprite.setMoving(Math.hypot(dx, dy) > 0.25, dx - dy, dy);
        av.sprite.setFacing(this.facingOf(p, av.sprite.getFacing()));
      }
      av.wrapper.setDepth(isoDepth(av.wrapper.x, av.wrapper.y) + ISO_ACTOR_DEPTH_EPS);
      av.sprite.update(delta);
      // Nameplates filled after camera settle so stage transform matches sprites.
      entities.push({
        id: p.id,
        label: p.owner ? `${p.name} (host)` : p.name,
        variant: isSelf ? "self" : "player",
        screenX: 0,
        screenY: 0,
        nameX: 0,
        nameY: 0,
        castX: 0,
        castY: 0,
      });
    }
    for (const [id, av] of this.avatars) {
      if (!seen.has(id)) {
        av.wrapper.destroy();
        this.avatars.delete(id);
      }
    }
    const petMarks = this.syncPets(house, delta);

    if (!selfId) {
      this.collisionGizmo.clear();
      setWorldOverlays({ entities: [], pois: [], interacts: [] });
      return;
    }
    const selfGuest = house.players.find((p) => p.id === selfId);
    const selfAv = this.avatars.get(selfId);
    if (!selfGuest || !selfAv) {
      this.collisionGizmo.clear();
      setWorldOverlays({ entities: [], pois: [], interacts: [] });
      return;
    }

    if (Math.hypot(selfAv.wrapper.x - selfGuest.x, selfAv.wrapper.y - selfGuest.y) > 64) {
      selfAv.wrapper.setPosition(selfGuest.x, selfGuest.y);
    }

    let mx = 0;
    let my = 0;
    if (!uiOwnsKeyboard()) {
      if (this.isMoveDown("move_left")) mx -= 1;
      if (this.isMoveDown("move_right")) mx += 1;
      if (this.isMoveDown("move_up")) my -= 1;
      if (this.isMoveDown("move_down")) my += 1;
    }
    if (mx || my) {
      // Keys mean screen directions (W = up-screen); snap to the nearest
      // grid-aligned world direction so combos follow tile edges.
      const w = screenDirToWorldGrid(mx, my);
      const len = Math.hypot(w.x, w.y) || 1;
      const step = (SPEED * delta) / 1000;
      const nx = selfAv.wrapper.x + (w.x / len) * step;
      const ny = selfAv.wrapper.y + (w.y / len) * step;
      const slid = slideMoveHousePlayer(house, selfAv.wrapper.x, selfAv.wrapper.y, nx, ny);
      selfAv.wrapper.x = slid.x;
      selfAv.wrapper.y = slid.y;
      selfAv.sprite.setMoving(true, w.x - w.y, w.y);
    } else {
      selfAv.sprite.setMoving(false);
      selfAv.sprite.setFacing(this.facingOf(selfGuest, selfAv.sprite.getFacing()));
    }
    selfAv.wrapper.setDepth(
      isoDepth(selfAv.wrapper.x, selfAv.wrapper.y) + ISO_ACTOR_DEPTH_EPS,
    );
    this.worldLayer?.sort("depth");
    this.updateCollisionGizmo(state);

    // The camera lives in projected screen space.
    const camTarget = isoProject(this, selfAv.wrapper.x, selfAv.wrapper.y);
    this.cameras.main.centerOn(camTarget.x, camTarget.y);

    this.sendAcc += delta;
    if (this.sendAcc >= SEND_INTERVAL) {
      this.sendAcc = 0;
      const x = selfAv.wrapper.x;
      const y = selfAv.wrapper.y;
      if (Math.hypot(x - this.lastSentX, y - this.lastSentY) > 0.5) {
        this.lastSentX = x;
        this.lastSentY = y;
        net.move(x, y);
      }
    }

    // After movement + centerOn so POI labels share the camera used to draw the house.
    const transform = getStageTransform(this);
    this.publishPlaceTransform(house);

    for (let i = 0; i < entities.length; i++) {
      const stub = entities[i]!;
      const av = this.avatars.get(stub.id);
      if (!av) continue;
      entities[i] = this.stageEntity(stub.id, stub.label, stub.variant, av.wrapper.x, av.wrapper.y, transform);
    }
    for (const pm of petMarks) {
      const marker = this.pets.get(pm.id);
      if (!marker) continue;
      entities.push(
        this.stageEntity(
          pm.id,
          pm.label,
          "player",
          marker.wrapper.x,
          marker.wrapper.y,
          transform,
          Math.round(H99_NAME_LABEL_Y * PET_SCALE) - 2,
        ),
      );
    }

    for (const f of this.furniture.values()) {
      const fp = isoProject(this, f.x, f.y);
      const pt = worldLocalToStage(this, fp.x, fp.y, 0, FURNITURE_LABEL_Y, transform);
      pois.push({ id: `furn:${f.id}`, label: f.name, variant: "furniture", x: pt.x, y: pt.y });
    }
    for (const m of this.pois.values()) {
      const mp = isoProject(this, m.x, m.y);
      const pt = worldLocalToStage(this, mp.x, mp.y, 0, POI_LABEL_Y, transform);
      pois.push({ id: `hpoi:${m.id}`, label: m.name, variant: "house-poi", x: pt.x, y: pt.y });
    }

    const keyLabel = interactKeyLabel(state.profile?.keybinds);
    const showPrompts =
      !state.mainMenuOpen && !state.openWindow && !state.worldSkillDialog && !state.npcDialog && !state.jobChangeDialog;
    if (showPrompts) {
      for (const m of this.pois.values()) {
        if (Math.hypot(selfAv.wrapper.x - m.x, selfAv.wrapper.y - m.y) > INTERACT_RANGE) continue;
        const mp = isoProject(this, m.x, m.y);
        const pt = worldLocalToStage(this, mp.x, mp.y, 0, POI_PROMPT_Y, transform);
        interacts.push({ id: `ix-hpoi:${m.id}`, keyLabel, x: pt.x, y: pt.y });
      }
    }

    setWorldOverlays({ entities, pois, interacts });
  }

  /** Redraw the collision-bounds gizmo over the island edge + house actors. */
  private updateCollisionGizmo(state: ReturnType<typeof useGame.getState>) {
    if (!state.options.showCollisionBounds) {
      this.collisionGizmo.clear();
      return;
    }
    this.collisionGizmo.updateTiles();
    const entries: CollisionGizmoEntry[] = [];
    for (const [id, av] of this.avatars) {
      entries.push({
        x: av.wrapper.x,
        y: av.wrapper.y,
        role: "player",
        isSelf: id === state.selfId,
      });
    }
    for (const p of this.pets.values()) {
      entries.push({ x: p.wrapper.x, y: p.wrapper.y, role: "pet" });
    }
    this.collisionGizmo.draw(entries);
  }
}

/** Interact with nearest house door/storage when in the house screen. */
export function tryHouseInteract(): boolean {
  const state = useGame.getState();
  if (state.screen !== "house" || !state.house || !state.selfId) return false;
  if (state.mainMenuOpen || state.openWindow) return false;
  const me = state.house.players.find((p) => p.id === state.selfId);
  if (!me) return false;
  let best: { kind: string; dist: number } | null = null;
  for (const poi of state.house.pois ?? []) {
    const dist = Math.hypot(me.x - poi.x, me.y - poi.y);
    if (dist <= INTERACT_RANGE && (!best || dist < best.dist)) {
      best = { kind: poi.kind, dist };
    }
  }
  if (!best) return false;
  if (best.kind === "storage") net.houseInteract("storage");
  else net.houseInteract("door");
  return true;
}
