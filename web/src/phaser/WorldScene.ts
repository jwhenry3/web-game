import Phaser from "phaser";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";
import { appearanceKey, facingFromDelta, H99_FACING_DEFAULT, H99_NAME_LABEL_Y, H99_WORLD_RING_RADIUS, H99_WORLD_RING_Y, type CharacterFacing } from "../characters/types";
import type { OverworldMap, WorldNPC, CharacterAppearanceWire, SavePoint, WorldPlayer } from "../types";
import { FILL, H99_COLLISION_HALF_H, H99_COLLISION_HALF_W, slideMovePlayer, tileAt } from "../world/overworld";
import { bindingToPhaserKeyCode, mergeKeybinds } from "../input/keybinds";
import { CharacterSprite } from "./CharacterSprite";
import { EnemySprite } from "./EnemySprite";
import { enemyKindFromName } from "../characters/enemies";
import { pushChat } from "../state/store";

const WORLD_W = 1600;
const WORLD_H = 1200;
const SPEED = 240;
const SEND_INTERVAL = 100;
const SAVE_POINT_RANGE = 80;
const CAST_BAR_Y = 10;
const CAST_BAR_W = 52;

/** Survives Phaser remounts when crossing maps that switch combat plugins. */
let lastWorldFacing: CharacterFacing = H99_FACING_DEFAULT;

function facingOf(wp: Pick<WorldPlayer, "facing">, fallback: CharacterFacing): CharacterFacing {
  return wp.facing === "left" || wp.facing === "right" ? wp.facing : fallback;
}

interface Avatar {
  wrapper: Phaser.GameObjects.Container;
  sprite: CharacterSprite;
  label: Phaser.GameObjects.Text;
  ring?: Phaser.GameObjects.Arc;
  appearanceKey: string;
  castBack: Phaser.GameObjects.Rectangle;
  castBar: Phaser.GameObjects.Rectangle;
}

interface FoeAvatar {
  wrapper: Phaser.GameObjects.Container;
  enemy: EnemySprite;
  label: Phaser.GameObjects.Text;
  lastX: number;
  lastY: number;
}

interface SavePointMarker {
  wrapper: Phaser.GameObjects.Container;
  hit: Phaser.GameObjects.Zone;
  label: Phaser.GameObjects.Text;
  active: boolean;
}

export class WorldScene extends Phaser.Scene {
  private avatars = new Map<string, Avatar>();
  private foes = new Map<string, FoeAvatar>();
  private savePoints = new Map<string, SavePointMarker>();
  private moveKeys: Partial<Record<"move_up" | "move_down" | "move_left" | "move_right", Phaser.Input.Keyboard.Key>> = {};
  private moveKeysSig = "";
  private lastSent = 0;
  private lastSentX = -1;
  private lastSentY = -1;
  private wasMoving = false;
  private selfSpawned = false;
  private terrain?: Phaser.GameObjects.Graphics;
  private portalsGfx?: Phaser.GameObjects.Graphics;
  private terrainKey = "";
  private portalKey = "";
  private lastMapId = "";

  constructor() {
    super("world");
  }

  create() {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.syncTerrain(useGame.getState().overworld, useGame.getState().mapInfo?.portals);

    const kb = this.input.keyboard!;
    this.syncMoveKeys();
    kb.disableGlobalCapture();
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

  private syncTerrain(map: OverworldMap | null, portals?: { x: number; y: number; w: number; h: number }[]) {
    const portalKey = JSON.stringify(portals ?? []);
    if (!map) return;
    if (map.cells === this.terrainKey && portalKey === this.portalKey) return;
    this.terrainKey = map.cells;
    this.portalKey = portalKey;
    this.terrain?.destroy();
    this.portalsGfx?.destroy();
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
    g.lineStyle(1, 0x0c140e, 0.25);
    for (let x = 0; x <= WORLD_W; x += t) g.lineBetween(x, 0, x, WORLD_H);
    for (let y = 0; y <= WORLD_H; y += t) g.lineBetween(0, y, WORLD_W, y);
    this.terrain = g;

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
      if (!av.castBack || !av.castBar) {
        this.attachCastBar(av);
      }
      return av;
    }

    const wrapper = this.add.container(0, 0).setDepth(10);
    const ring = this.add.circle(0, H99_WORLD_RING_Y, H99_WORLD_RING_RADIUS, 0xffe9a8, 0).setVisible(false);
    const sprite = new CharacterSprite(this, 0, 0, appearance);
    const label = this.add
      .text(0, H99_NAME_LABEL_Y, "", { fontSize: "11px", color: "#ffffff", fontFamily: "monospace" })
      .setOrigin(0.5, 0.5)
      .setShadow(1, 1, "#000000", 2);
    wrapper.add([ring, sprite.container, label]);

    if (id !== useGame.getState().selfId) {
      sprite.setInteractive(() => this.tryJoinBattleOf(id));
    }

    av = { wrapper, sprite, label, ring, appearanceKey: key } as Avatar;
    this.attachCastBar(av);
    this.avatars.set(id, av);
    return av;
  }

  private attachCastBar(av: Avatar) {
    const castBack = this.add.rectangle(0, CAST_BAR_Y, CAST_BAR_W + 2, 7, 0x1a1028).setOrigin(0.5);
    castBack.setStrokeStyle(1, 0x6a4a8a);
    const castBar = this.add.rectangle(-CAST_BAR_W / 2, CAST_BAR_Y, 0, 5, 0xa78bfa).setOrigin(0, 0.5);
    castBack.setVisible(false);
    castBar.setVisible(false);
    av.wrapper.add([castBack, castBar]);
    av.castBack = castBack;
    av.castBar = castBar;
  }

  private ensureSavePoint(sp: SavePoint, active: boolean): SavePointMarker {
    let marker = this.savePoints.get(sp.id);
    if (marker) {
      marker.wrapper.setPosition(sp.x, sp.y);
      marker.hit.setPosition(sp.x, sp.y - 8);
      if (marker.active !== active) {
        marker.active = active;
        marker.label.setColor(active ? "#fff6c8" : "#a8e8ff");
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
    const label = this.add
      .text(0, 18, sp.name, { fontSize: "10px", color: active ? "#fff6c8" : "#a8e8ff", fontFamily: "monospace" })
      .setOrigin(0.5, 0);
    wrapper.add([glow, crystal, label]);

    const hit = this.add
      .zone(sp.x, sp.y - 8, 80, 80)
      .setOrigin(0.5, 0.5)
      .setDepth(25)
      .setInteractive({ cursor: "pointer" });
    hit.on("pointerdown", () => this.trySetSavePoint(sp));

    marker = { wrapper, hit, label, active };
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
    const label = this.add
      .text(0, H99_NAME_LABEL_Y, "", { fontSize: "11px", color: "#e6d4b0", fontFamily: "Noto Sans, sans-serif" })
      .setOrigin(0.5, 0.5)
      .setShadow(1, 1, "#000000", 2);
    wrapper.add([enemy.container, label]);
    enemy.setInteractive(() => this.tryJoinBattleOfNPC(npc.id));
    av = { wrapper, enemy, label, lastX: npc.x, lastY: npc.y };
    this.foes.set(npc.id, av);
    return av;
  }

  private tryJoinBattleOfNPC(id: string) {
    const state = useGame.getState();
    const npc = state.npcs[id];
    const selfWp = state.selfId ? state.players[state.selfId] : undefined;
    if (!npc?.in_battle || !npc.battle_id || selfWp?.in_battle) return;
    const info = state.battles.find((b) => b.battle_id === npc.battle_id);
    if (info && info.participants >= info.max_players) return;
    net.joinBattle(npc.battle_id);
  }

  private tryJoinBattleOf(id: string) {
    const state = useGame.getState();
    if (id === state.selfId) return;
    const target = state.players[id];
    const selfWp = state.selfId ? state.players[state.selfId] : undefined;
    if (!target?.in_battle || !target.battle_id || selfWp?.in_battle) return;
    const info = state.battles.find((b) => b.battle_id === target.battle_id);
    if (info && info.participants >= info.max_players) return;
    net.joinBattle(target.battle_id);
  }

  update(time: number, delta: number) {
    this.syncMoveKeys();
    const state = useGame.getState();
    this.syncTerrain(state.overworld, state.mapInfo?.portals);
    const mapId = state.mapInfo?.id ?? "";
    if (mapId !== this.lastMapId) {
      this.lastMapId = mapId;
      this.selfSpawned = false;
    }
    const selfId = state.selfId;
    if (!selfId) return;

    for (const [id, av] of this.avatars) {
      if (!state.players[id]) {
        av.wrapper.destroy();
        this.avatars.delete(id);
        if (id === selfId) this.selfSpawned = false;
      }
    }

    const selfLocked = state.players[selfId]?.in_battle ?? false;
    const activeSave = useGame.getState().profile?.save_point_id;
    this.syncSavePoints(state.savePoints, activeSave);
    for (const wp of Object.values(state.players)) {
      const av = this.ensureAvatar(wp.id, wp.race, wp.weapon, wp.appearance);
      const locked = wp.in_battle;
      const immune = !locked && (wp.immune_until ?? 0) > Date.now();
      av.wrapper.setAlpha(locked ? 0.45 : 1);
      const joinable = locked && wp.id !== selfId && !selfLocked;
      av.label.setText(
        `${wp.name} Lv${wp.level}${locked ? " ⚔" : ""}${joinable ? " (join)" : ""}${immune ? " 🛡" : ""}`,
      );
      if (av.ring) {
        av.ring.setVisible(joinable || immune);
        if (joinable) av.ring.setFillStyle(0xffe9a8, 0.25);
        else if (immune) {
          const pulse = 0.15 + 0.15 * Math.sin(this.time.now / 180);
          av.ring.setFillStyle(0xb4dcff, pulse);
        }
      }

      const isSelf = wp.id === selfId;
      if (!isSelf) {
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
      }

      av.sprite.update(delta);
      this.syncWorldCastBar(av, wp);

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
      }
    }

    this.syncFoes(state.npcs, selfLocked, delta);
    this.moveSelf(time, selfId);
  }

  private syncWorldCastBar(av: Avatar, wp: WorldPlayer) {
    const casting = !!wp.casting_skill_id && (wp.cast_time_ms ?? 0) > 0;
    av.sprite.setCasting(casting);
    if (!casting) {
      av.castBack.setVisible(false);
      av.castBar.setVisible(false);
      av.castBar.width = 0;
      return;
    }
    const ms = wp.cast_time_ms ?? 1;
    const ends = wp.cast_ends_at ?? 0;
    const pct = Phaser.Math.Clamp(1 - (ends - Date.now()) / ms, 0, 1);
    av.castBack.setVisible(true);
    av.castBar.setVisible(true);
    av.castBar.width = CAST_BAR_W * pct;
    av.castBar.fillColor = pct >= 1 ? 0xc4b5fd : 0xa78bfa;
  }

  private syncFoes(npcs: Record<string, WorldNPC>, selfLocked: boolean, delta: number) {
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
      av.label.setText(`${npc.name} Lv${npc.level}${npc.in_battle ? " ⚔" : ""}${joinable ? " (join)" : ""}`);
      const prevX = av.lastX;
      const prevY = av.lastY;
      av.wrapper.x = Phaser.Math.Linear(av.wrapper.x, npc.x, 0.2);
      av.wrapper.y = Phaser.Math.Linear(av.wrapper.y, npc.y, 0.2);
      const dx = av.wrapper.x - prevX;
      const dy = av.wrapper.y - prevY;
      av.enemy.setMoving(Math.hypot(dx, dy) > 0.3, dx, dy);
      av.enemy.update(delta);
      av.lastX = av.wrapper.x;
      av.lastY = av.wrapper.y;
    }
  }

  private moveSelf(time: number, selfId: string) {
    const av = this.avatars.get(selfId);
    const wp = useGame.getState().players[selfId];
    if (!av || !wp || wp.in_battle) return;

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
      WORLD_W - H99_COLLISION_HALF_W,
    );
    const ny = Phaser.Math.Clamp(
      av.wrapper.y + (dy / len) * SPEED * dt,
      H99_COLLISION_HALF_H,
      WORLD_H,
    );
    const ox = av.wrapper.x;
    const oy = av.wrapper.y;
    const slid = slideMovePlayer(useGame.getState().overworld, av.wrapper.x, av.wrapper.y, nx, ny);
    av.wrapper.x = slid.x;
    av.wrapper.y = slid.y;
    const moved = Math.hypot(av.wrapper.x - ox, av.wrapper.y - oy) > 0.5;
    const interruptCast = !!wp.casting_skill_id && moved;
    if (interruptCast) {
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

    this.sendPosition(time, av.wrapper.x, av.wrapper.y, interruptCast);
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
